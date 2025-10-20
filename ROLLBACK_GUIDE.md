# 🔙 Rollback Guide

**DocShare v1.3 - Emergency Rollback Procedures**

---

## When to Rollback

Use this guide if:
- ❌ Critical production errors occur
- ❌ Users unable to access portal
- ❌ OTP verification fails consistently
- ❌ Documents not loading
- ❌ Salesforce LWC component breaks

---

## Quick Rollback (5 minutes)

If you need to rollback **immediately**:

```powershell
# 1. Rollback Lambda
cd "C:\Users\Mathias\Downloads\docshare-16-10-2025-fixed\prod-version"
zip lambda-old.zip lambda.py
aws lambda update-function-code `
  --function-name dfj-docshare-prod `
  --zip-file fileb://lambda-old.zip `
  --region eu-north-1

# 2. Rollback Frontend (S3 example)
aws s3 sync . s3://your-prod-bucket/ --exclude "*" --include "*.js" --include "*.html" --include "*.css"
```

---

## Complete Rollback Procedures

### 1. Rollback Lambda Function

**Backup Location**: `prod-version/lambda.py`

#### Method A: Using AWS Console
1. Go to AWS Lambda Console
2. Select function: `dfj-docshare-prod`
3. Click "Versions" tab
4. Find previous version (before v1.3 deployment)
5. Click "Actions" → "Promote to $LATEST"

#### Method B: Using CLI
```powershell
# Navigate to prod-version folder
cd "C:\Users\Mathias\Downloads\docshare-16-10-2025-fixed\prod-version"

# Create backup zip
zip lambda-backup.zip lambda.py

# Deploy old version
aws lambda update-function-code `
  --function-name dfj-docshare-prod `
  --zip-file fileb://lambda-backup.zip `
  --region eu-north-1
```

**Verify**:
```powershell
Invoke-RestMethod -Uri "https://YOUR-PROD-API/ping"
```

**Time**: ~3 minutes

---

### 2. Restore Lambda Environment Variables

If environment variables were changed, restore them:

**Backup Location**: Document your current prod settings **before deployment**

#### Via AWS Console:
1. AWS Lambda → Configuration → Environment variables
2. Edit variables one by one
3. Restore old values

#### Via CLI:
```bash
aws lambda update-function-configuration `
  --function-name dfj-docshare-prod `
  --environment Variables="{
    BUCKET=dfj-docs-prod,
    SF_LOGIN_URL=https://login.salesforce.com,
    ...
  }"
```

**Time**: ~2 minutes

---

### 3. Rollback Apex Classes

**Backup Location**: `prod-version/salesforce/classes/`

#### Using Salesforce CLI:
```powershell
cd "C:\Users\Mathias\Downloads\docshare-16-10-2025-fixed\prod-version"

# Deploy old versions
sf project deploy start `
  --source-dir "salesforce/classes" `
  --target-org Prod
```

#### Using Salesforce UI:
1. Setup → Apex Classes
2. Find each class:
   - DocShareService
   - DocShare_JournalCreds
   - DocShare_Query
3. Click class name → Click "Show Dependencies"
4. If safe, click "Edit" → Paste old code from `prod-version/salesforce/classes/`
5. Click "Save"

**Classes to rollback**:
- ✅ DocShareService.cls
- ✅ DocShare_JournalCreds.cls
- ✅ DocShare_Query.cls

**Time**: ~5 minutes

---

### 4. Rollback Lightning Web Component

**Backup Location**: `prod-version/salesforce/lwc/journalDocConsole/`

#### Using Salesforce CLI:
```powershell
cd "C:\Users\Mathias\Downloads\docshare-16-10-2025-fixed\prod-version"

# Deploy old LWC
sf project deploy start `
  --source-dir "salesforce/lwc" `
  --target-org Prod
```

#### Using Salesforce UI:
1. Setup → Lightning Components → journalDocConsole
2. Click component name
3. Click each file (JS, HTML, CSS)
4. Copy content from `prod-version/salesforce/lwc/journalDocConsole/`
5. Paste and save

**Files to rollback**:
- ✅ journalDocConsole.js
- ✅ journalDocConsole.html
- ✅ journalDocConsole.css
- ✅ journalDocConsole.js-meta.xml

**Time**: ~3 minutes

---

### 5. Rollback Frontend (SPA)

**Backup Location**: `prod-version/` (root files)

#### Option A: S3 Deployment
```powershell
cd "C:\Users\Mathias\Downloads\docshare-16-10-2025-fixed\prod-version"

# Upload old files
aws s3 cp index.html s3://your-prod-bucket/index.html
aws s3 cp app.js s3://your-prod-bucket/app.js
aws s3 cp brand.js s3://your-prod-bucket/brand.js
aws s3 cp texts.js s3://your-prod-bucket/texts.js
aws s3 cp styles.css s3://your-prod-bucket/styles.css

# Upload assets
aws s3 sync assets/ s3://your-prod-bucket/assets/ --delete
```

#### Option B: Manual Upload
If using different hosting:
1. Download files from `prod-version/` folder
2. Upload to your production server/CDN
3. Replace:
   - index.html
   - app.js
   - brand.js
   - texts.js
   - styles.css
   - assets/ folder

**Time**: ~5 minutes

---

### 6. Invalidate CDN Cache

```powershell
# Clear CloudFront cache (if using)
aws cloudfront create-invalidation `
  --distribution-id YOUR_DISTRIBUTION_ID `
  --paths "/*"
```

**Time**: ~1 minute

---

### 7. Verify Rollback

#### Test Lambda
```powershell
# Test endpoints still work
Invoke-RestMethod -Uri "https://YOUR-PROD-API/ping"
```

#### Test Frontend
1. Open production domain
2. Enter phone number
3. Verify OTP process works
4. Check document viewing
5. Test document approval

#### Test Salesforce
1. Navigate to Journal record
2. Verify journalDocConsole component loads
3. Test document upload

**Time**: ~10 minutes

---

## Rollback Verification Checklist

- [ ] Lambda responding (ping works)
- [ ] OTP creation working
- [ ] OTP verification working
- [ ] Documents loading
- [ ] PDFs displaying correctly
- [ ] Document approval working
- [ ] Salesforce LWC functional
- [ ] No console errors in browser
- [ ] All three markets working (DK/SE/IE)

---

## If Rollback Fails

### Scenario: Lambda won't rollback
**Solution**: 
1. Check AWS Lambda versions in console
2. Manually select older version
3. Or redeploy known-good lambda.py

### Scenario: Frontend cache issue
**Solution**:
1. Clear CloudFront cache completely
2. Force refresh browser (Ctrl+Shift+R)
3. Check S3 file timestamps

### Scenario: Salesforce component errors
**Solution**:
1. Check Salesforce debug logs
2. Verify all dependent classes deployed
3. Check component permissions in Lightning App Builder

### Scenario: Database/schema issues
**Good News**: No schema changes in v1.3 - data remains intact
**Action**: 
- All `Journal__c` records unchanged
- All `Shared_Document__c` records unchanged
- All `OTP__c` records remain (new object, won't break old system)

---

## Post-Rollback Actions

1. **Document the Issue**
   - What went wrong?
   - Error messages seen?
   - Which users affected?

2. **Notify Stakeholders**
   - Email/Slack: Rollback completed
   - ETA for fix: TBD

3. **Root Cause Analysis**
   - Review logs (Lambda, Salesforce, browser console)
   - Identify what failed
   - Plan fix strategy

4. **Test in Sandbox**
   - Reproduce issue in sandbox
   - Test fix before redeploying to prod

---

## Backup Before Next Deployment

Before attempting v1.3 deployment again:

### 1. Take Lambda Snapshot
```powershell
# Download current Lambda code
aws lambda get-function --function-name dfj-docshare-prod

# Save response artifact URL, download zip
```

### 2. Export Salesforce Components
```powershell
# Create backup project
cd $env:TEMP
sf project generate --name backup-$(Get-Date -Format "yyyyMMdd-HHmmss")
cd backup-*

# Retrieve all components
sf project retrieve start `
  --metadata "ApexClass:DocShareService" `
  --metadata "ApexClass:DocShare_JournalCreds" `
  --metadata "ApexClass:DocShare_Query" `
  --metadata "LightningComponentBundle:journalDocConsole" `
  --target-org Prod

# Zip and save
Compress-Archive -Path force-app -DestinationPath "C:\Backups\sf-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss').zip"
```

### 3. Save Frontend
```powershell
# Download from S3 (or your hosting)
aws s3 sync s3://your-prod-bucket/ C:\Backups\frontend-$(Get-Date -Format "yyyyMMdd-HHmmss")\ --exclude "customer-documents/*"
```

### 4. Document Environment Variables
```powershell
# Get Lambda config
aws lambda get-function-configuration --function-name dfj-docshare-prod > C:\Backups\lambda-config-$(Get-Date -Format "yyyyMMdd-HHmmss").json
```

---

## Emergency Contacts

**AWS Support**: [Your AWS support plan]  
**Salesforce Support**: [Your SF support tier]  
**Dev Team Lead**: [Contact info]  
**On-Call Engineer**: [Contact info]

---

## Total Rollback Time

- **Lambda**: 3 minutes
- **Apex Classes**: 5 minutes
- **LWC**: 3 minutes
- **Frontend**: 5 minutes
- **Cache Clear**: 1 minute
- **Verification**: 10 minutes
- **Total**: ~27 minutes

---

**Rollback Completed**: _______________  
**Rolled Back By**: _______________  
**Reason**: _______________  
**Issue Ticket**: _______________
