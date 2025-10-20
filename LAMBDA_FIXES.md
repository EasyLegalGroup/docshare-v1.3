# lambda.mjs Bug Fixes

## Issue 2: Always Create OTP Record Even When Identifier Doesn't Match

### Location: POST `/identifier/request-otp` handler

**Problem:** When a phone/email doesn't match any person/account/contact in Salesforce, no OTP record is created, preventing the user from proceeding even if they have a valid code.

**Solution:** Always create the OTP record regardless of whether the identifier matches. Leave the lookup fields empty when no match exists.

### Implementation Pattern:

**IMPORTANT:** Use the exact Salesforce object and field API names from your existing Lambda code. Below is the pattern to follow:

```javascript
// Example pattern - replace with your actual field names from lambda.mjs

async function handleIdentifierRequestOtp(event) {
  const body = JSON.parse(event.body);
  const { channel, market, phone, email, phoneDigits, country } = body;
  
  // Generate OTP code
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min expiry
  
  // Try to find matching identifier
  let matchingPersonId = null;
  let matchingAccountId = null;
  let matchingContactId = null;
  
  if (channel === 'phone' && phoneDigits) {
    // Query Salesforce for matching phone
    // Example: const personQuery = `SELECT Id, PersonContactId, AccountId FROM Account WHERE Phone__c = '${phoneDigits}'`;
    // const personResult = await querySalesforce(personQuery);
    // if (personResult && personResult.records && personResult.records.length > 0) {
    //   matchingPersonId = personResult.records[0].Id;
    //   matchingContactId = personResult.records[0].PersonContactId;
    //   matchingAccountId = personResult.records[0].AccountId;
    // }
  } else if (channel === 'email' && email) {
    // Query Salesforce for matching email
    // Similar pattern as above
  }
  
  // ISSUE 2 FIX: Create OTP record REGARDLESS of whether we found a match
  const otpRecord = {
    // Use your actual OTP object API name (e.g., OTP__c, OTP_Record__c, etc.)
    // Use your actual field API names below:
    
    Code__c: otpCode,                    // or whatever your OTP code field is called
    Channel__c: channel,                  // or Channel_Type__c, Method__c, etc.
    Identifier__c: channel === 'phone' ? phone : email,  // or Phone_Email__c, etc.
    Market__c: market,                    // or Market_Code__c, etc.
    Country__c: country,                  // if you have this field
    Expires_At__c: expiresAt,            // or Expiry_Time__c, etc.
    Used__c: false,                       // or Is_Used__c, Consumed__c, etc.
    
    // Lookup fields - set to null if no match (Salesforce will accept null for lookups)
    Person__c: matchingPersonId,          // or Account__c, Person_Account__c, etc.
    Contact__c: matchingContactId,        // or Person_Contact__c, etc.
    Related_Account__c: matchingAccountId // or Account_Lookup__c, etc.
  };
  
  // Create the OTP record in Salesforce
  // const createResult = await createSalesforceRecord('OTP__c', otpRecord);
  
  // Send the OTP via email/SMS (existing logic)
  if (channel === 'phone') {
    await sendSMS(phone, `Your code: ${otpCode}`);
  } else {
    await sendEmail(email, 'Your OTP Code', `Your code: ${otpCode}`);
  }
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      success: true,
      message: 'OTP sent',
      // Don't expose whether identifier matched or not for security
    })
  };
}
```

### Key Changes:

1. **Always create OTP record** - Don't skip creation when no match found
2. **Set lookup fields to null** when no match - Salesforce accepts null for lookup fields
3. **Return success regardless** - Don't reveal whether identifier exists in system
4. **Use existing field names** - Read from your lambda.mjs and use exact API names

### Steps to Implement:

1. Open your `lambda.mjs` file
2. Find the `/identifier/request-otp` handler
3. Locate where OTP records are created
4. Note the exact object name (e.g., `OTP__c`) and field names
5. Ensure OTP record creation happens BEFORE checking if identifier matches
6. Set person/contact/account lookups to `null` when no match found (instead of skipping record creation)

---

## Issue 3: Stop Auto-Downloads, Render PDFs Inline

### Location: Pre-signed URL generation function(s)

**Problem:** PDFs auto-download instead of rendering inline in the iframe viewer.

**Solution:** Set `ResponseContentDisposition` to `inline` and ensure `ResponseContentType` is `application/pdf` when generating S3 pre-signed URLs.

### Implementation:

Find where your Lambda generates pre-signed URLs for S3 objects. Update the parameters:

```javascript
// Example using AWS SDK v3
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

async function generatePresignedUrl(bucket, key, filename) {
  const s3Client = new S3Client({ region: 'eu-north-1' }); // your region
  
  // ISSUE 3 FIX: Set ResponseContentDisposition to 'inline' and ResponseContentType
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: `inline; filename="${sanitizeFilename(filename)}.pdf"`,
    ResponseContentType: 'application/pdf'
  });
  
  const presignedUrl = await getSignedUrl(s3Client, command, { 
    expiresIn: 3600 // 1 hour
  });
  
  return presignedUrl;
}

// Sanitize filename to prevent header injection
function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}
```

### If using AWS SDK v2:

```javascript
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

function generatePresignedUrl(bucket, key, filename) {
  // ISSUE 3 FIX: Set ResponseContentDisposition to 'inline' and ResponseContentType
  const params = {
    Bucket: bucket,
    Key: key,
    Expires: 3600, // 1 hour
    ResponseContentDisposition: `inline; filename="${sanitizeFilename(filename)}.pdf"`,
    ResponseContentType: 'application/pdf'
  };
  
  return s3.getSignedUrl('getObject', params);
}
```

### Key Points:

1. **Always use `inline`** - Never use `attachment` in content disposition
2. **Set content type** - Ensures browser knows it's a PDF
3. **Sanitize filename** - Prevent header injection attacks
4. **Keep URL structure** - Frontend expects same URL format
5. **No frontend changes needed** - The iframe already sets `src` to the presigned URL

### Endpoints to Update:

- `/identifier/doc-url` - Returns presigned URL for identifier flow
- `/doc-url` - Returns presigned URL for journal flow (if different handler)

Both should use the same inline disposition logic.

---

## Testing Checklist

### Issue 2 Test:
1. Request OTP with phone number `+4599999999` (doesn't exist in system)
2. Check Salesforce - OTP record should be created with:
   - Code populated
   - Channel = 'phone'
   - Identifier = '+4599999999'
   - Person/Contact lookups = null
3. Enter the OTP code in UI
4. Should successfully verify (even though no person match)

### Issue 3 Test:
1. After OTP verification, click on a document
2. **Expected:** PDF renders inside iframe viewer
3. **Should NOT:** Automatically download the file
4. Click "Download" button
5. **Expected:** File downloads
6. Click "Print" button  
7. **Expected:** Print dialog opens

---

## Field Name Discovery

To find your exact Salesforce field names:

1. Open `lambda.mjs`
2. Search for keywords like:
   - `OTP` - to find OTP object name
   - `Code` - to find code field name
   - `Channel` - to find channel field name
   - `Expires` or `Expiry` - to find expiration field
   - `Person` or `Contact` or `Account` - to find lookup field names
3. Look for patterns like: `{ FieldName__c: value, ... }`
4. Use those EXACT names in your fix (case-sensitive)

### Example of what to look for:

```javascript
// Find code like this in your lambda:
const otpRecord = {
  Name: otpCode,              // ← This might be "Code__c" in your version
  Type__c: channel,           // ← This might be "Channel__c" in your version  
  Phone_or_Email__c: phone,   // ← This might be "Identifier__c" in your version
  // ... etc
};

// Use those exact field names in your fix
```

---

## S3 Bucket Configuration (Optional)

If PDFs still download after Lambda fix, check S3 bucket CORS:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": [
      "https://dok.dinfamiliejurist.dk",
      "https://dok.dinfamiljejurist.se", 
      "https://docs.hereslaw.ie",
      "http://localhost:*"
    ],
    "ExposeHeaders": ["Content-Disposition", "Content-Type"],
    "MaxAgeSeconds": 3000
  }
]
```

This ensures the browser can read the content-disposition header.
