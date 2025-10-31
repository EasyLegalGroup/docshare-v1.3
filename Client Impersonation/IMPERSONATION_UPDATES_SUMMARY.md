# Client Impersonation Updates Summary

## Changes Implemented

### 1. LWC Updates (journalDocConsole)

**Changed:**
- ✅ Replaced person icon button with labeled button "Log in as..."
- ✅ Removed entire modal interface
- ✅ Clicking button now immediately creates token and opens portal in new tab
- ✅ Added configurable property: `Link Expiry (Minutes)` (default: 120)
- ✅ Added configurable property: `Allow Approvals` (default: false)
- ✅ Both properties configurable in Lightning Page Layout Editor

**Files Modified:**
- `salesforce/main/default/lwc/journalDocConsole/journalDocConsole.js`
- `salesforce/main/default/lwc/journalDocConsole/journalDocConsole.html`
- `salesforce/main/default/lwc/journalDocConsole/journalDocConsole.js-meta.xml`

### 2. Security Updates

#### 2.1 One-Time Token Use (Lambda)

**Changed:**
- ✅ Lambda checks `Used_At__c` field before accepting token
- ✅ Returns error "This link has already been used" if token was used
- ✅ Marks token as used BEFORE creating session (prevents race conditions)
- ✅ Records `Used_At__c` timestamp and `Used_By_IP__c` on first use
- ✅ User who used the token can continue their session until expiry

**Files Modified:**
- `lambda.py` (handle_impersonation_login function)

#### 2.2 Single Active Token Per User (Apex)

**Changed:**
- ✅ When creating new impersonation token, Apex finds all existing tokens by same user for same journal
- ✅ Expires existing tokens by setting `Expires_At__c` to current time
- ✅ Ensures only one active impersonation link exists per Salesforce user per journal

**Files Modified:**
- `salesforce/main/default/classes/ClientImpersonationService.cls`

### 3. Lambda Impersonation Mode Support

**Changed:**
- ✅ `/identifier/list` endpoint now handles impersonation sessions (jid claim)
- ✅ For impersonation mode, email/phone not required in request
- ✅ SOQL query filters only by Journal__c when jid claim present
- ✅ Session validation moved before email/phone requirement check

**Files Modified:**
- `lambda.py` (handle_identifier_list function)

## How It Works Now

### User Flow (Salesforce User):
1. Open Journal record page
2. Click "Log in as..." button in Journal Documents component
3. System creates `Client_Impersonation__c` record with:
   - Unique token
   - Link to journal
   - Expiry time (from component config)
   - Approval rights (from component config)
4. System expires any previous tokens created by this user for this journal
5. Portal opens in new tab with token in URL
6. Success message shown in Salesforce

### Client Flow (Portal User):
1. Client clicks impersonation link
2. SPA detects `?impersonate=<token>` parameter
3. Calls `/impersonation/login` with token
4. Lambda validates:
   - Token exists in Salesforce
   - Token has not been used yet (`Used_At__c` is empty)
   - Token has not expired (`Expires_At__c` > now)
5. Lambda marks token as used (sets `Used_At__c` and `Used_By_IP__c`)
6. Lambda returns session JWT with claims: `role=impersonation`, `jid=<journalId>`, `allowApprove=<boolean>`
7. SPA stores session and removes token from URL (security)
8. Portal loads documents filtered by journal ID from session
9. Impersonation banner shown at top
10. If `allowApprove=false`, approval buttons hidden

### Security Benefits:
- ✅ Token can only be used once (prevents sharing/forwarding)
- ✅ Active session continues for configured duration (2 hours default)
- ✅ Only one active link per Salesforce user per journal (prevents confusion)
- ✅ Audit trail: `Used_At__c`, `Used_By_IP__c`, `CreatedById` tracked
- ✅ Token removed from browser URL after use (prevents accidental sharing)

## Configuration

### Lightning Page Properties:
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `Link Expiry (Minutes)` | Integer | 120 | How long the link remains valid (120 = 2 hours) |
| `Allow Approvals` | Boolean | false | Whether client can approve documents during session |

### Setting in Lightning Page Builder:
1. Edit Journal record page
2. Click on "Journal Documents" component
3. Configure properties in right panel:
   - **Link Expiry (Minutes)**: 120 (or 1440 for 24h, 10080 for 7 days)
   - **Allow Approvals**: Checked/Unchecked

## Deployment Instructions

### 1. Deploy LWC to Sandbox:
```bash
cd "C:\Users\Mathias\Downloads\docshare-16-10-2025-fixed\Client Impersonation"
sf project deploy start --source-dir salesforce/main/default/lwc/journalDocConsole --target-org sandbox --wait 10
```

### 2. Deploy Apex to Sandbox:
```bash
sf project deploy start --source-dir salesforce/main/default/classes/ClientImpersonationService.cls --target-org sandbox --wait 10
```

### 3. Deploy Lambda to AWS:
```powershell
cd "C:\Users\Mathias\Downloads\docshare-16-10-2025-fixed\Client Impersonation"
Compress-Archive -Path lambda.py -DestinationPath lambda.zip -Force
aws lambda update-function-code --function-name dfj-docs-test --zip-file fileb://lambda.zip --region eu-north-1
```

### 4. Upload SPA to S3 (if needed):
```bash
aws s3 cp app.js s3://dfj-docs-test/ --region eu-north-1
```

## Testing Checklist

- [ ] Click "Log in as..." button opens portal in new tab
- [ ] Portal shows impersonation banner with journal name
- [ ] Documents load correctly
- [ ] Approval buttons hidden when `Allow Approvals` = false
- [ ] Approval buttons visible when `Allow Approvals` = true
- [ ] Token only works once (clicking link again shows error)
- [ ] Creating new link expires previous one
- [ ] Session continues for configured duration after first use
- [ ] URL cleaned (token removed from address bar)

## Fields Used

### Client_Impersonation__c Object:
| Field API Name | Type | Purpose |
|----------------|------|---------|
| `Token__c` | Text(255) | Unique 64-char hex token |
| `Journal__c` | Lookup(Journal__c) | Linked journal |
| `Allow_Approve__c` | Checkbox | Approval rights flag |
| `Expires_At__c` | DateTime | When link expires |
| `Used_At__c` | DateTime | When link was first used |
| `Used_By_IP__c` | Text(255) | IP address of first use |
| `CreatedById` | Auto | Salesforce user who created link |

## Notes

- ⚠️ Old identifier fields (`Identifier_Type__c`, `Identifier_Value__c`) still exist in object but are unused
- ⚠️ You should manually delete these fields from Salesforce UI after testing
- ✅ Lambda handles both old and new Client_Impersonation__c schemas
- ✅ Compatible with existing identifier-based authentication flow
