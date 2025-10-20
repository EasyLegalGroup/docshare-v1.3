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

**1. Rollback Lambda** (copy-paste method):
1. Open `prod-version/lambda.py` 
2. Copy all content (Ctrl+A, Ctrl+C)
3. Go to AWS Lambda Console → `dfj-docshare-prod` → Code tab
4. Paste old code and click "Deploy"

**2. Rollback Frontend** (file upload method):
1. Open hosting provider file manager or S3 console
2. Upload files from `prod-version/` folder
3. Overwrite: index.html, app.js, brand.js, texts.js, styles.css

---

## Complete Rollback Procedures

### 1. Rollback Lambda Function

**Backup Location**: `prod-version/lambda.py`

**Rollback Method**: Copy-paste code directly into AWS Lambda Console

#### Steps:
1. Open `prod-version/lambda.py` in your editor
2. Select all content (Ctrl+A) and copy (Ctrl+C)
3. Go to AWS Lambda Console → Functions → `dfj-docshare-prod`
4. Click the "Code" tab
5. Select all existing code and paste the old code
6. Click "Deploy" button (top right)
7. Wait for "Changes deployed" message

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

**Rollback Method**: Salesforce DevOps Center

#### Steps:
1. Go to Salesforce → DevOps Center
2. Click "Create Work Item" → "Deployment"
3. Select source: Production backup or manually specify components
4. Select target org: Production (`mt@dinfamiliejurist.dk`)
5. Add Apex classes to rollback:
   - DocShareService.cls
   - DocShare_JournalCreds.cls
   - DocShare_Query.cls
6. Click "Validate Deployment"
7. **Set test level**: Specify test classes:
   - Test1: `DocShareService_Test`
   - Test2: `DocShare_JournalCreds_Test`
   - Test3: `DocShare_Query_Test`
8. Review validation results
9. Click "Deploy Now"
10. Monitor deployment progress

**Alternative - Quick Edit via UI** (for urgent fixes):
1. Setup → Apex Classes
2. Find each class → Click "Edit"
3. Copy content from `prod-version/salesforce/classes/[ClassName].cls`
4. Paste and click "Save"
5. Repeat for all 3 classes

**Classes to rollback**:
- ✅ DocShareService.cls
- ✅ DocShare_JournalCreds.cls
- ✅ DocShare_Query.cls

**Time**: ~10 minutes (DevOps Center) or ~5 minutes (UI Edit)

---

### 4. Rollback Lightning Web Component

**Backup Location**: `prod-version/salesforce/lwc/journalDocConsole/`

**Rollback Method**: Salesforce DevOps Center

#### Steps:
1. Go to Salesforce → DevOps Center
2. Use same deployment as Apex rollback OR create new deployment
3. Add LWC component to rollback:
   - journalDocConsole (entire bundle)
4. Click "Validate Deployment"
5. Review validation
6. Click "Deploy Now"
7. Monitor deployment progress

**Files to rollback**:
- ✅ journalDocConsole.js
- ✅ journalDocConsole.html
- ✅ journalDocConsole.css
- ✅ journalDocConsole.js-meta.xml

**Note**: Can be rolled back together with Apex classes in step 3

**Time**: ~5 minutes

---

### 5. Rollback Frontend (SPA)

**Backup Location**: `prod-version/` (root files)

**Rollback Method**: Manual file upload to hosting/S3

#### Steps:
1. Open your hosting provider's file manager or S3 console
2. Navigate to the production website directory
3. Upload and **overwrite** these files from `prod-version/`:
   - `index.html`
   - `app.js`
   - `brand.js`
   - `texts.js`
   - `styles.css`
4. If assets were changed, restore `assets/` folder contents
5. Verify file upload completed successfully

**Alternative - S3 CLI (if preferred)**:
```powershell
cd "C:\Users\Mathias\Downloads\docshare-16-10-2025-fixed\prod-version"

aws s3 cp index.html s3://your-prod-bucket/index.html
aws s3 cp app.js s3://your-prod-bucket/app.js
aws s3 cp brand.js s3://your-prod-bucket/brand.js
aws s3 cp texts.js s3://your-prod-bucket/texts.js
aws s3 cp styles.css s3://your-prod-bucket/styles.css
```

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
