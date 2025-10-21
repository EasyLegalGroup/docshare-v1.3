# AWS S3 Deployment Guide - Test Environment Setup

**Environment**: `dfj-docs-test`  
**Region**: `eu-north-1` (Stockholm)  
**Purpose**: Static website hosting for Document Portal SPA

---

## 🚀 Quick Start

### Prerequisites
- AWS Console access to `dfj-docs-test` S3 bucket
- Files from `vscode attempt/` folder ready to upload

---

## Step-by-Step Deployment

### Step 1: Disable Block Public Access

1. Go to: https://s3.console.aws.amazon.com/s3/buckets/dfj-docs-test?region=eu-north-1
2. Click the **Permissions** tab
3. Scroll to **Block public access (bucket settings)**
4. Click **Edit** button
5. **Uncheck ALL 4 boxes**:
   - ❌ Block public access to buckets and objects granted through new ACLs
   - ❌ Block public access to buckets and objects granted through any ACLs
   - ❌ Block public access to buckets and objects granted through new public bucket policies
   - ❌ Block public and cross-account access to buckets and objects through any public bucket policies
6. Click **Save changes**
7. Type `confirm` in the popup and submit

**Why?** S3 denies all public access by default. We need to allow public read for the SPA files.

---

### Step 2: Set Bucket Policy

1. Still on the **Permissions** tab
2. Scroll down to **Bucket policy**
3. Click **Edit**
4. **Delete everything** in the editor and paste this:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::dfj-docs-test/*"
    }
  ]
}
```

5. Click **Save changes**

**Why?** This policy allows anonymous (public) read access to all objects in the bucket, which is required for serving the SPA files.

---

### Step 3: Enable Static Website Hosting

1. Click the **Properties** tab (at the top of the page)
2. Scroll all the way down to **Static website hosting**
3. Click **Edit**
4. Select **Enable**
5. **Index document:** `index.html`
6. **Error document:** `index.html`
7. Click **Save changes**

**Why?** This configures S3 to serve `index.html` for all requests, enabling client-side routing.

**Note the URL:** After saving, you'll see the bucket website endpoint:
```
http://dfj-docs-test.s3-website.eu-north-1.amazonaws.com
```

---

### Step 4: Upload SPA Files

#### Option A: Via AWS Console (Easy)

1. Click the **Objects** tab
2. Click **Upload**
3. Click **Add files**
4. Select these files from `~/docshare-v1.3/vscode attempt/`:
   - `index.html`
   - `app.js`
   - `brand.js`
   - `texts.js`
   - `styles.css`
   - `favicon.png` (if you have one)
   - Any logo files (e.g., `logo-dk.svg`, `logo-se.svg`, `logo-ie.svg`)
5. Click **Upload**
6. Wait for upload to complete

#### Option B: Via AWS CLI (Mac/Linux)

```bash
# Navigate to the folder
cd ~/docshare-v1.3/"vscode attempt"

# Upload all files
aws s3 cp index.html s3://dfj-docs-test/ --content-type "text/html" --region eu-north-1
aws s3 cp app.js s3://dfj-docs-test/ --content-type "application/javascript" --region eu-north-1
aws s3 cp brand.js s3://dfj-docs-test/ --content-type "application/javascript" --region eu-north-1
aws s3 cp texts.js s3://dfj-docs-test/ --content-type "application/javascript" --region eu-north-1
aws s3 cp styles.css s3://dfj-docs-test/ --content-type "text/css" --region eu-north-1

# If you have a favicon
aws s3 cp favicon.png s3://dfj-docs-test/ --content-type "image/png" --region eu-north-1

# If you have logo files
aws s3 cp logo-dk.svg s3://dfj-docs-test/ --content-type "image/svg+xml" --region eu-north-1
aws s3 cp logo-se.svg s3://dfj-docs-test/ --content-type "image/svg+xml" --region eu-north-1
aws s3 cp logo-ie.svg s3://dfj-docs-test/ --content-type "image/svg+xml" --region eu-north-1
```

#### Option B: Via AWS CLI (Windows/PowerShell)

```powershell
# Navigate to the folder
cd "C:\Users\Mathias\docshare-v1.3\vscode attempt"

# Upload all files
aws s3 cp index.html s3://dfj-docs-test/ --content-type "text/html" --region eu-north-1
aws s3 cp app.js s3://dfj-docs-test/ --content-type "application/javascript" --region eu-north-1
aws s3 cp brand.js s3://dfj-docs-test/ --content-type "application/javascript" --region eu-north-1
aws s3 cp texts.js s3://dfj-docs-test/ --content-type "application/javascript" --region eu-north-1
aws s3 cp styles.css s3://dfj-docs-test/ --content-type "text/css" --region eu-north-1

# If you have a favicon
aws s3 cp favicon.png s3://dfj-docs-test/ --content-type "image/png" --region eu-north-1

# If you have logo files
aws s3 cp logo-dk.svg s3://dfj-docs-test/ --content-type "image/svg+xml" --region eu-north-1
aws s3 cp logo-se.svg s3://dfj-docs-test/ --content-type "image/svg+xml" --region eu-north-1
aws s3 cp logo-ie.svg s3://dfj-docs-test/ --content-type "image/svg+xml" --region eu-north-1
```

---

### Step 5: Verify Files Are Uploaded

1. Go back to the **Objects** tab in S3 Console
2. You should see all uploaded files listed:
   - ✅ `index.html`
   - ✅ `app.js`
   - ✅ `brand.js`
   - ✅ `texts.js`
   - ✅ `styles.css`
   - ✅ `favicon.png` (optional)
   - ✅ Logo files (optional)

**Check file sizes** - Make sure files aren't 0 bytes (which would indicate upload failure).

---

## 🧪 Testing

### Test the Deployment

1. Open your browser
2. Navigate to: `http://dfj-docs-test.s3-website.eu-north-1.amazonaws.com?brand=dk`
3. **Expected result**: Login page loads with DFJ Denmark branding

### Test All Brands

```
Denmark:  http://dfj-docs-test.s3-website.eu-north-1.amazonaws.com?brand=dk
Sweden:   http://dfj-docs-test.s3-website.eu-north-1.amazonaws.com?brand=se
Ireland:  http://dfj-docs-test.s3-website.eu-north-1.amazonaws.com?brand=ie
```

### Test OTP Flow (End-to-End)

1. Enter an email address (e.g., `test@example.com`)
2. Click "Send kode" / "Skicka kod" / "Send code"
3. Check Salesforce for OTP__c record creation
4. Enter the OTP code from Salesforce
5. Click "Bekræft" / "Bekräfta" / "Confirm"
6. Should see document list (if documents exist for that email)

---

## 🔧 Troubleshooting

### Still Getting 403 Forbidden?

**Wait 30-60 seconds** after changing settings - S3 policy changes can take a moment to propagate.

Then check:

1. **Block Public Access** (Permissions tab)
   - All 4 settings should be **OFF** (unchecked)

2. **Bucket Policy** (Permissions tab)
   - Should show the JSON policy from Step 2
   - No errors or warnings

3. **Static Website Hosting** (Properties tab)
   - Should show **Enabled**
   - Should show the bucket website endpoint URL

4. **Files Uploaded** (Objects tab)
   - All files present and not 0 bytes

### Verify Settings via CLI (Mac/Linux)

```bash
# Check block public access
aws s3api get-public-access-block --bucket dfj-docs-test --region eu-north-1

# Expected output (all false):
# {
#     "PublicAccessBlockConfiguration": {
#         "BlockPublicAcls": false,
#         "IgnorePublicAcls": false,
#         "BlockPublicPolicy": false,
#         "RestrictPublicBuckets": false
#     }
# }

# Check bucket policy
aws s3api get-bucket-policy --bucket dfj-docs-test --region eu-north-1

# Check website configuration
aws s3api get-bucket-website --bucket dfj-docs-test --region eu-north-1

# List uploaded files
aws s3 ls s3://dfj-docs-test/ --region eu-north-1
```

### Verify Settings via CLI (Windows/PowerShell)

```powershell
# Check block public access
aws s3api get-public-access-block --bucket dfj-docs-test --region eu-north-1

# Check bucket policy
aws s3api get-bucket-policy --bucket dfj-docs-test --region eu-north-1

# Check website configuration
aws s3api get-bucket-website --bucket dfj-docs-test --region eu-north-1

# List uploaded files
aws s3 ls s3://dfj-docs-test/ --region eu-north-1
```

### Common Issues

| Issue | Solution |
|-------|----------|
| **403 Forbidden** | Check all 4 Block Public Access settings are OFF |
| **404 Not Found** | Check index.html is uploaded and Static Website Hosting is enabled |
| **Blank page** | Check browser console for errors; verify app.js, brand.js, texts.js are uploaded |
| **JavaScript errors** | Check Content-Type headers on uploaded files |
| **Wrong branding** | Check `?brand=` parameter in URL (dk/se/ie) |

---

## 📋 Quick Command Reference

### Enable Public Access (CLI)

**Mac/Linux:**
```bash
aws s3api put-public-access-block \
  --bucket dfj-docs-test \
  --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false" \
  --region eu-north-1
```

**Windows/PowerShell:**
```powershell
aws s3api put-public-access-block `
  --bucket dfj-docs-test `
  --public-access-block-configuration `
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false" `
  --region eu-north-1
```

### Set Bucket Policy (CLI)

**Mac/Linux:**
```bash
# Create policy file
cat > /tmp/bucket-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::dfj-docs-test/*"
    }
  ]
}
EOF

# Apply policy
aws s3api put-bucket-policy \
  --bucket dfj-docs-test \
  --policy file:///tmp/bucket-policy.json \
  --region eu-north-1
```

**Windows/PowerShell:**
```powershell
# Create policy file
@"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::dfj-docs-test/*"
    }
  ]
}
"@ | Out-File -FilePath "$env:TEMP\bucket-policy.json" -Encoding UTF8

# Apply policy
aws s3api put-bucket-policy `
  --bucket dfj-docs-test `
  --policy "file://$env:TEMP/bucket-policy.json" `
  --region eu-north-1
```

### Enable Website Hosting (CLI)

**Mac/Linux:**
```bash
aws s3 website s3://dfj-docs-test \
  --index-document index.html \
  --error-document index.html \
  --region eu-north-1
```

**Windows/PowerShell:**
```powershell
aws s3 website s3://dfj-docs-test `
  --index-document index.html `
  --error-document index.html `
  --region eu-north-1
```

---

## 🔐 Security Notes

### What's Public?

✅ **Public (Safe):**
- `index.html` - HTML structure
- `app.js` - JavaScript code (no secrets)
- `brand.js` - Brand configurations
- `texts.js` - UI text translations
- `styles.css` - CSS styling

❌ **NOT Public (Protected):**
- Customer documents (in `dfj-docs-prod` bucket with different security)
- Salesforce credentials (stored as Lambda environment variables)
- Session tokens (generated server-side, expire after 15 minutes)

### Why This is Safe

1. **No secrets in SPA files** - All authentication happens server-side via Lambda
2. **Documents are access-controlled** - PDFs are served via presigned S3 URLs with 15-minute expiry
3. **OTP verification required** - Users must verify email/phone before accessing documents
4. **Session tokens expire** - Tokens are short-lived (15 minutes) and HMAC-signed

---

## 🎯 Success Checklist

- [ ] Block Public Access: All 4 settings OFF
- [ ] Bucket Policy: JSON policy applied successfully
- [ ] Static Website Hosting: Enabled with index.html
- [ ] Files uploaded: All 5 core files present
- [ ] Test URL works: http://dfj-docs-test.s3-website.eu-north-1.amazonaws.com?brand=dk
- [ ] All 3 brands work: dk, se, ie
- [ ] Lambda is deployed and configured
- [ ] End-to-end OTP flow works

---

## 📞 Support

**Issues?** Check the troubleshooting section above or refer to:
- `PROJECT_STATUS.md` - Overall project status
- `DEPLOYMENT_SUMMARY.md` - Lambda deployment guide
- GitHub repository: https://github.com/EasyLegalGroup/docshare-v1.3

**Test Environment URL:**
```
http://dfj-docs-test.s3-website.eu-north-1.amazonaws.com?brand=dk
```

**Production URL (when ready):**
```
To be configured with custom domain names:
- https://dok.dinfamiliejurist.dk
- https://dok.dinfamiljejurist.se
- https://docs.hereslaw.ie
```
