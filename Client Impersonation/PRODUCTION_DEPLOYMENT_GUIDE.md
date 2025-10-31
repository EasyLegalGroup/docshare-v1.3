# Client Impersonation Feature - Production Deployment Guide

**Feature**: Secure one-time client impersonation links for accessing Journal documents  
**Date**: October 31, 2025  
**Deployed By**: [Your Name]  
**Production Org**: mt@dinfamiliejurist.dk (00D1t000000w9f2)

---

## 🎯 Deployment Overview

This deployment introduces a new **Client Impersonation** feature that allows users to generate secure, one-time-use links for clients to access their journal documents without email/phone verification.

### Key Security Features
- ✅ One active link per user maximum (across all journals)
- ✅ One-time use per link (automatic invalidation after first access)
- ✅ Configurable expiry duration (default: 2 hours)
- ✅ Automatic revocation when newer link is generated
- ✅ Full audit trail (Used_At__c, Used_By_IP__c, Is_Revoked__c)
- ✅ Environment-aware URL generation (production vs sandbox)

---

## 📋 Pre-Deployment Checklist

### Prerequisites
- [ ] Production org authenticated in SF CLI (alias: `Prod`)
- [ ] AWS credentials configured for production Lambda deployment
- [ ] Production S3 bucket access (bucket: `dfj-docs-prod` or similar)
- [ ] Production API Gateway access
- [ ] Backup completed (see backup section)
- [ ] All tests passing in sandbox (16/16 tests ✅)
- [ ] Code review completed
- [ ] Change approval obtained

### Backup Verification
- [ ] Production LWC backed up to: `prod-backup/lwc/journalDocConsole/`
- [ ] Production Lambda backed up (manual snapshot recommended)
- [ ] Production S3 files backed up (app.js, texts.js)

---

## 🚀 Deployment Steps

### Phase 1: Salesforce Metadata Deployment

#### Step 1.1: Deploy Custom Object
**What**: Create `Client_Impersonation__c` custom object with all fields  
**Where**: Production org (mt@dinfamiliejurist.dk)

```powershell
cd "C:\Users\Mathias\Downloads\docshare-16-10-2025-fixed\Client Impersonation"

sf project deploy start \
  --source-dir salesforce/main/default/objects/Client_Impersonation__c \
  --target-org Prod \
  --wait 10
```

**Expected Output**:
- ✅ CustomObject: Client_Impersonation__c (Created)
- ✅ CustomField: Token__c (Created)
- ✅ CustomField: Journal__c (Created)
- ✅ CustomField: Allow_Approve__c (Created)
- ✅ CustomField: Expires_At__c (Created)
- ✅ CustomField: Used_At__c (Created)
- ✅ CustomField: Used_By_IP__c (Created)
- ✅ CustomField: Is_Revoked__c (Created)

**Validation**:
- [ ] Navigate to Setup → Object Manager → Client Impersonation
- [ ] Verify all 7 custom fields are present
- [ ] Verify object is deployed and active

---

#### Step 1.2: Deploy Apex Classes
**What**: Deploy `ClientImpersonationService` and `ClientImpersonationServiceTest`  
**Where**: Production org

```powershell
sf project deploy start \
  --source-dir salesforce/main/default/classes \
  --target-org Prod \
  --wait 10 \
  --test-level RunSpecifiedTests \
  --tests ClientImpersonationServiceTest
```

**Expected Output**:
- ✅ ApexClass: ClientImpersonationService (Created)
- ✅ ApexClass: ClientImpersonationServiceTest (Created)
- ✅ Test Results: 16 passing, 0 failing

**Validation**:
- [ ] Navigate to Setup → Apex Classes
- [ ] Verify ClientImpersonationService exists
- [ ] Verify test coverage ≥ 75%
- [ ] Check Developer Console for any debug logs/errors

---

#### Step 1.3: Deploy Lightning Web Component
**What**: Update `journalDocConsole` LWC with impersonation button  
**Where**: Production org

```powershell
sf project deploy start \
  --source-dir salesforce/main/default/lwc/journalDocConsole \
  --target-org Prod \
  --wait 10
```

**Expected Output**:
- ✅ LightningComponentBundle: journalDocConsole (Changed)
- ✅ Files: journalDocConsole.html, .js, .css, .js-meta.xml

**Validation**:
- [ ] Open any Journal record page
- [ ] Verify blue "Log in as..." button appears in card header
- [ ] Verify button has proper spacing from refresh button
- [ ] Do NOT click the button yet (Lambda not deployed)

---

#### Step 1.4: Deploy Permission Set
**What**: Update `DocShareService` permission set with Client_Impersonation__c access  
**Where**: Production org

```powershell
sf project deploy start \
  --source-dir salesforce/main/default/permissionsets/DocShareService.permissionset-meta.xml \
  --target-org Prod \
  --wait 10
```

**Expected Output**:
- ✅ PermissionSet: DocShareService (Changed)

**Permissions Granted**:
- ✅ Client_Impersonation__c: Create, Edit, Read
- ✅ ClientImpersonationService: Execute

**Validation**:
- [ ] Navigate to Setup → Permission Sets → DocShareService
- [ ] Verify "Client Impersonation" object permissions
- [ ] Verify "ClientImpersonationService" Apex class access
- [ ] Verify assigned users can see the object

---

### Phase 2: AWS Lambda Deployment

#### Step 2.1: Backup Current Lambda
**What**: Create snapshot of current production Lambda  
**Where**: AWS Lambda Console (eu-north-1 region)

**Manual Steps**:
1. Navigate to AWS Lambda Console → eu-north-1 region
2. Open function: `dfj-docs-prod` (or production function name)
3. Navigate to "Versions" tab
4. Click "Publish new version"
5. Description: "Backup before Client Impersonation deployment - 2025-10-31"
6. Click "Publish"
7. Note the version ARN (e.g., `arn:aws:lambda:eu-north-1:ACCOUNT:function:dfj-docs-prod:12`)

**Validation**:
- [ ] Version created successfully
- [ ] Version ARN recorded: `_______________________________________`

---

#### Step 2.2: Deploy Updated Lambda Code
**What**: Upload `lambda.py` with impersonation login endpoint  
**Where**: AWS Lambda function (production)

**File**: `c:\Users\Mathias\Downloads\docshare-16-10-2025-fixed\Client Impersonation\lambda.py`

**Manual Steps**:
1. Open AWS Lambda Console → `dfj-docs-prod` function
2. Navigate to "Code" tab
3. Click "Upload from" → ".zip file" OR paste code directly
4. Upload/paste the contents of `lambda.py`
5. Click "Deploy"
6. Wait for "Successfully updated the function" message

**Key Changes in lambda.py**:
- New function: `handle_impersonation_login()` (line 670-740)
- Updated function: `handle_identifier_list()` - Added jid claim support (line 755+)
- New SOQL fields: `Is_Revoked__c`, `Used_At__c` validation
- New security checks: Token revocation, one-time use enforcement

**Validation**:
- [ ] Lambda code deployed successfully
- [ ] No syntax errors in deployment
- [ ] Function size < 50MB limit

---

#### Step 2.3: Add Lambda Environment Variables
**What**: Ensure all required environment variables are set  
**Where**: Lambda Configuration → Environment variables

**Required Variables** (verify these exist):
```
SF_CLIENT_ID=<production_connected_app_client_id>
SF_CLIENT_SECRET=<production_connected_app_secret>
SF_USERNAME=<production_integration_user>
SF_PASSWORD=<production_integration_password>
SF_SECURITY_TOKEN=<production_security_token>
JWT_SECRET_KEY=<production_jwt_secret>
SESSION_TTL_SECONDS=86400
```

**Validation**:
- [ ] All environment variables present
- [ ] Values are for PRODUCTION (not sandbox)
- [ ] JWT_SECRET_KEY is production secret (not test)

---

#### Step 2.4: Configure API Gateway Endpoint
**What**: Add new POST /impersonation/login route  
**Where**: API Gateway Console (production API)

**Manual Steps**:
1. Navigate to API Gateway Console
2. Open production API (e.g., `dfj-docs-api-prod`)
3. Click "Create Resource" (if /impersonation doesn't exist)
   - Resource Name: `impersonation`
   - Resource Path: `/impersonation`
4. Select `/impersonation` resource → "Create Method"
   - Method: `POST`
   - Integration type: Lambda Function
   - Lambda Function: `dfj-docs-prod` (production function)
   - Use Lambda Proxy Integration: ✅ Enabled
5. Click "Save"
6. Enable CORS:
   - Select `/impersonation/POST` method
   - Actions → Enable CORS
   - Allow Origins: `https://dok.dinfamiliejurist.dk,https://dok.dinfamiljejurist.se,https://docs.hereslaw.ie`
   - Allow Headers: `Content-Type,Authorization`
7. Click "Deploy API"
   - Stage: `prod` (or production stage name)

**Expected Endpoint**:
```
POST https://{api-id}.execute-api.eu-north-1.amazonaws.com/prod/impersonation/login
```

**Validation**:
- [ ] Endpoint created successfully
- [ ] CORS enabled for production domains
- [ ] API deployed to production stage
- [ ] Note endpoint URL: `_______________________________________`

---

### Phase 3: S3 Static Files Deployment

#### Step 3.1: Backup Current S3 Files
**What**: Download current production app.js and texts.js  
**Where**: Production S3 bucket

**Manual Steps**:
1. Navigate to S3 Console
2. Open production bucket (e.g., `dfj-docs-prod`)
3. Download these files to backup folder:
   - `app.js` → Save to `prod-backup/spa/app.js`
   - `texts.js` → Save to `prod-backup/spa/texts.js`

**Validation**:
- [ ] Files downloaded successfully
- [ ] Backup folder contains original files

---

#### Step 3.2: Deploy Updated SPA Files
**What**: Upload `app.js` and `texts.js` with impersonation error handling  
**Where**: Production S3 bucket

**Files**:
- `c:\Users\Mathias\Downloads\docshare-16-10-2025-fixed\Client Impersonation\app.js`
- `c:\Users\Mathias\Downloads\docshare-16-10-2025-fixed\Client Impersonation\texts.js`

**Manual Steps**:
1. Navigate to S3 Console → Production bucket
2. Upload `app.js`:
   - Click "Upload"
   - Select `app.js` from Client Impersonation folder
   - Permissions: Public read (if required)
   - Metadata → Cache-Control: `max-age=300` (5 minutes)
   - Click "Upload"
3. Upload `texts.js`:
   - Repeat same process for `texts.js`
   - Same permissions and cache settings

**Key Changes**:
- **app.js**: 
  - New function: `showImpersonationError()` (line 203-240)
  - Updated: `bootImpersonationIfPresent()` - Error handling (line 161, 197)
- **texts.js**:
  - New translations: `IMPERSONATION_ERROR_TITLE` (DK/SE/EN)
  - New translations: `IMPERSONATION_ERROR_HINT` (DK/SE/EN)

**Validation**:
- [ ] Files uploaded successfully
- [ ] Cache-Control headers set correctly
- [ ] Files publicly accessible (if applicable)

---

#### Step 3.3: Invalidate CloudFront Cache (if applicable)
**What**: Clear CDN cache to serve new files immediately  
**Where**: CloudFront Console

**Manual Steps** (skip if not using CloudFront):
1. Navigate to CloudFront Console
2. Select production distribution
3. Click "Invalidations" tab
4. Click "Create Invalidation"
5. Object Paths:
   ```
   /app.js
   /texts.js
   ```
6. Click "Create Invalidation"
7. Wait for status: "Completed"

**Validation**:
- [ ] Invalidation completed (or N/A if no CloudFront)

---

### Phase 4: Post-Deployment Validation

#### Step 4.1: Test in Production - Link Generation
**Test**: Verify link generation works correctly

1. Open any Journal record in production
2. Click the blue "Log in as..." button
3. **Expected**:
   - ✅ New tab opens immediately
   - ✅ URL format (DK example): `https://dok.dinfamiliejurist.dk?impersonate=[64-char-token]`
   - ✅ URL format (SE example): `https://dok.dinfamiljejurist.se?impersonate=[64-char-token]`
   - ✅ URL format (IE example): `https://docs.hereslaw.ie?impersonate=[64-char-token]`
   - ✅ No double question marks (`??`) in URL
   - ✅ Portal loads successfully
   - ✅ Impersonation banner visible at top
   - ✅ Documents list loads automatically

**Validation**:
- [ ] Link generated successfully
- [ ] URL format correct for market unit
- [ ] Portal loads and displays documents

---

#### Step 4.2: Test in Production - Security
**Test**: Verify security features work

**Test 4.2a: One-Time Use**
1. Copy the impersonation URL from address bar
2. Close the tab
3. Open the same URL in a new tab
4. **Expected**:
   - ✅ Error page appears (not empty portal)
   - ✅ Title: "Link fejl" (DK) / "Länkfel" (SE) / "Access Link Error" (EN)
   - ✅ Message: "This link has already been used..."
   - ✅ Hint: Instructions to contact legal advisor

**Test 4.2b: One Active Link Per User**
1. Generate link for Journal A
2. Generate link for Journal B
3. Try to use Link A (the older one)
4. **Expected**:
   - ✅ Link A shows error: "This link has been revoked"
   - ✅ Link B works normally

**Test 4.2c: Audit Trail**
1. Open Client_Impersonation__c record after using link
2. **Expected**:
   - ✅ `Used_At__c` populated with timestamp
   - ✅ `Used_By_IP__c` populated with IP address
   - ✅ `Is_Revoked__c = false` (for active links)
   - ✅ `Is_Revoked__c = true` (for revoked links)

**Validation**:
- [ ] One-time use enforced
- [ ] Link revocation works
- [ ] Audit fields populated correctly

---

#### Step 4.3: Test in Production - Configuration
**Test**: Verify configurable properties work

1. Edit Journal record page in Lightning App Builder
2. Find `journalDocConsole` component properties
3. **Expected Properties Visible**:
   - ✅ "Link Expiry (Minutes)" - Default: 120
   - ✅ "Allow Approvals" - Default: unchecked
   - ✅ "⚠ Deprecated (use Allow Approvals)" - (Legacy property)

4. Change "Link Expiry (Minutes)" to 30
5. Save page
6. Generate new link
7. Check `Client_Impersonation__c.Expires_At__c` field
8. **Expected**: Expiry = Created + 30 minutes

**Validation**:
- [ ] Configuration properties visible
- [ ] Custom expiry duration works
- [ ] Allow Approvals setting toggles correctly

---

#### Step 4.4: Test in Production - Multi-Language
**Test**: Verify translations work for all markets

**Danish (DK)**:
1. Generate link for DK journal
2. Use link twice to trigger error
3. **Expected**: Error in Danish language

**Swedish (SE)**:
1. Generate link for SE journal
2. Use link twice
3. **Expected**: Error in Swedish language

**English (IE)**:
1. Generate link for IE journal
2. Use link twice
3. **Expected**: Error in English language

**Validation**:
- [ ] DK translations correct
- [ ] SE translations correct
- [ ] EN translations correct

---

#### Step 4.5: Monitor Lambda Logs
**Test**: Check for errors in production logs

1. Navigate to CloudWatch Logs
2. Open log group: `/aws/lambda/dfj-docs-prod`
3. Review recent log streams
4. Look for:
   - ✅ No errors in `handle_impersonation_login`
   - ✅ No errors in `handle_identifier_list`
   - ✅ Successful token validation logs
   - ✅ No unexpected exceptions

**Validation**:
- [ ] No errors in CloudWatch logs
- [ ] Impersonation login events logged correctly

---

## 🔄 Rollback Plan

### If Issues Are Discovered

#### Rollback Salesforce
```powershell
# Restore original LWC
cd "C:\Users\Mathias\Downloads\docshare-16-10-2025-fixed\Client Impersonation"

sf project deploy start \
  --source-dir prod-backup/lwc/journalDocConsole \
  --target-org Prod \
  --wait 10

# Remove new Apex classes (if necessary)
sf project delete source \
  --metadata ApexClass:ClientImpersonationService,ApexClass:ClientImpersonationServiceTest \
  --target-org Prod

# Remove Client_Impersonation__c object (CAUTION: deletes all records)
sf project delete source \
  --metadata CustomObject:Client_Impersonation__c \
  --target-org Prod
```

#### Rollback Lambda
1. Navigate to AWS Lambda Console
2. Open `dfj-docs-prod` function
3. Navigate to "Versions" tab
4. Select backup version from Step 2.1
5. Click "Actions" → "Publish new version from this version"
6. Set as `$LATEST`

#### Rollback S3
1. Navigate to S3 Console → Production bucket
2. Restore backed-up files:
   - Upload `prod-backup/spa/app.js` → Replace current
   - Upload `prod-backup/spa/texts.js` → Replace current
3. Invalidate CloudFront cache (if applicable)

---

## 📊 Deployment Summary

### Components Deployed

| Component | Type | Location | Status |
|-----------|------|----------|--------|
| Client_Impersonation__c | CustomObject | Salesforce | New |
| ClientImpersonationService | ApexClass | Salesforce | New |
| ClientImpersonationServiceTest | ApexClass | Salesforce | New |
| journalDocConsole | LWC | Salesforce | Updated |
| DocShareService | PermissionSet | Salesforce | Updated |
| lambda.py | Lambda Function | AWS | Updated |
| /impersonation/login | API Gateway | AWS | New |
| app.js | S3 Static File | AWS | Updated |
| texts.js | S3 Static File | AWS | Updated |

### Test Coverage
- ✅ 16 Apex tests passing (100%)
- ✅ Code coverage: >75%
- ✅ Manual testing completed in sandbox
- ✅ Security validation passed

### Production URLs
- 🇩🇰 Denmark: `https://dok.dinfamiliejurist.dk`
- 🇸🇪 Sweden: `https://dok.dinfamiljejurist.se`
- 🇮🇪 Ireland: `https://docs.hereslaw.ie`

---

## 📝 Post-Deployment Notes

### Known Behaviors
1. **One active link per user** - Previous unused links are automatically revoked when a new link is generated
2. **Session persistence** - After first use, the session JWT remains valid (only the initial link is one-time)
3. **Environment detection** - Production org ID (00D1t000000w9f2) triggers production URLs; all other orgs use S3 test URLs

### Monitoring Recommendations
- Monitor CloudWatch logs for any Lambda errors
- Check Client_Impersonation__c records weekly for usage patterns
- Review audit trail (Used_At__c, Is_Revoked__c) for security validation

### Future Enhancements
- Consider adding email notification when link is generated
- Consider adding expiry warning in UI (e.g., "Link expires in 30 minutes")
- Consider admin report for impersonation usage analytics

---

## ✅ Sign-off

**Deployment Completed By**: ___________________________  
**Date**: ___________________________  
**Time**: ___________________________  

**Validation Sign-off**: ___________________________  
**Date**: ___________________________  

---

## 📞 Support Contact

If issues arise post-deployment:
- Check rollback procedures above
- Review CloudWatch logs in AWS Console
- Check Salesforce debug logs for Apex errors
- Contact: [Support Contact Info]

---

**End of Deployment Guide**
