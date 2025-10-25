# 🔄 Rollback Guide - DocShare v1.3

**Quick Reference for Rolling Back Production Deployment**

---

## Current Deployment Status

| Component | Status | Can Rollback? | Notes |
|-----------|--------|---------------|-------|
| **Apex Classes** | ✅ DEPLOYED | ✅ YES (not needed) | Working correctly - no rollback needed |
| **LWC** | ✅ DEPLOYED | ✅ YES (not needed) | Working correctly - no rollback needed |
| **Lambda** | ⏳ PENDING | ✅ YES | Can copy-paste old code back |
| **Frontend SPA** | ⏳ PENDING | ✅ YES | Can re-upload old files |

**Important**: Salesforce components (Apex + LWC) are working correctly and **do not need rollback**.

---

## ⚠️ When to Rollback

**Only rollback if you encounter:**
- Lambda deployment breaks existing functionality
- Frontend deployment causes critical errors
- Session/OTP issues affecting customer access

**DO NOT rollback if:**
- Salesforce components working fine ✅
- Only testing/debugging needed
- Minor UI issues (can be fixed forward)

---

## Rollback Procedures

### 1. Rollback Lambda (If Needed)

**Scenario**: New Lambda code causes API errors

#### Steps:
1. Go to AWS Lambda Console → Functions → `dfj-docshare-prod`
2. Click "Code" tab
3. Open `prod-version/lambda.py` in your local editor
4. Select all content (Ctrl+A) and copy (Ctrl+C)
5. Select all code in Lambda console and paste old code
6. Click "Deploy" button
7. Wait for "Changes deployed" message

**Verify rollback**:
```powershell
Invoke-RestMethod -Uri "https://YOUR-PROD-API/ping"
# Expected: {"ok": true}
```

**Alternative - Use Lambda Version History**:
1. Click "Versions" tab in Lambda console
2. Find previous working version
3. Click "Actions" → "Publish new version"
4. Update function alias to point to old version

**Time**: ~3 minutes

---

### 2. Rollback Frontend SPA (If Needed)

**Scenario**: New frontend files cause UI errors

#### Steps:
1. **Navigate to S3 bucket** `dfj-docs-prod` in AWS Console
2. Open `prod-version/` directory in your local workspace
3. Upload these 5 files to **root directory** of `dfj-docs-prod`:
   - `index.html`
   - `app.js`
   - `brand.js`
   - `texts.js`
   - `styles.css`

**S3 CLI Method**:
```powershell
cd "c:\Users\Mathias\Downloads\docshare-16-10-2025-fixed\prod-version"

aws s3 cp index.html s3://dfj-docs-prod/index.html --content-type "text/html"
aws s3 cp app.js s3://dfj-docs-prod/app.js --content-type "application/javascript"
aws s3 cp brand.js s3://dfj-docs-prod/brand.js --content-type "application/javascript"
aws s3 cp texts.js s3://dfj-docs-prod/texts.js --content-type "application/javascript"
aws s3 cp styles.css s3://dfj-docs-prod/styles.css --content-type "text/css"
```

4. **Invalidate CloudFront cache** (required):
```powershell
aws cloudfront create-invalidation `
  --distribution-id E9HR6T6YQDI3S `
  --paths "/*"
```

**Time**: ~5 minutes (+ 5-15 min cache invalidation)

---

### 3. Rollback Salesforce Components (NOT NEEDED)

**Status**: ✅ **Already deployed and working correctly**

The Salesforce Apex classes and LWC were successfully deployed on October 24, 2025 (Deploy ID: 0AfW5000001ZvAvKAK) and are functioning properly. **No rollback needed.**

**If you absolutely must rollback Salesforce** (unlikely):

#### Rollback Files Available:
Located in: `ROLLBACK_BACKUP_PROD/`
- `classes/DocShareService.cls`
- `classes/DocShareService_Tests.cls`
- `lwc/journalDocConsole.js`
- `lwc/journalDocConsole.html`
- `lwc/journalDocConsole.css`
- `lwc/journalDocConsole.js-meta.xml`

#### Rollback Steps (if absolutely necessary):
1. Open Salesforce CLI
2. Navigate to rollback directory:
```powershell
cd "c:\Users\Mathias\Downloads\docshare-16-10-2025-fixed\ROLLBACK_BACKUP_PROD"
```

3. Deploy old classes:
```powershell
sf project deploy start `
  --source-dir classes `
  --target-org mt@dinfamiliejurist.dk `
  --test-level RunSpecifiedTests `
  --tests DocShareService_Tests
```

4. Deploy old LWC:
```powershell
sf project deploy start `
  --source-dir lwc `
  --target-org mt@dinfamiliejurist.dk
```

**Previously tested rollback**: Deploy ID 0AfW5000001ZurZKAS (successful)

**Time**: ~5-10 minutes

---

## Rollback Verification

### After Lambda Rollback:
- [ ] Ping endpoint responds: `{"ok": true}`
- [ ] OTP requests work (creates `OTP__c` records)
- [ ] OTP verification works (returns access token)
- [ ] Document list loads
- [ ] Document URLs presign correctly

### After Frontend Rollback:
- [ ] Portal loads at all 3 domains
- [ ] Phone/email input works
- [ ] OTP flow completes
- [ ] Documents display correctly
- [ ] Chat opens/closes
- [ ] Brand detection working (DK/SE/IE)

### After Salesforce Rollback (if performed):
- [ ] Salesforce LWC loads on Journal records
- [ ] Upload functionality works
- [ ] Sort_Order__c field queries succeed
- [ ] Tests pass (4/4)

---

## Emergency Contact

**If rollback fails or issues persist:**
1. Check AWS Lambda logs: CloudWatch → Log Groups → `/aws/lambda/dfj-docshare-prod`
2. Check Salesforce debug logs: Setup → Debug Logs
3. Check browser console for frontend errors (F12)
4. Review deployment guide for correct configuration

---

## Rollback Decision Matrix

| Issue | Lambda Rollback? | Frontend Rollback? | Salesforce Rollback? |
|-------|------------------|-------------------|---------------------|
| **API 500 errors** | ✅ YES | ❌ NO | ❌ NO |
| **OTP not sending** | ✅ YES | ❌ NO | ❌ NO |
| **UI broken/white screen** | ❌ NO | ✅ YES | ❌ NO |
| **Chat not working** | 🔍 Check logs first | 🔍 Check logs first | ❌ NO |
| **Upload fails from SF** | ❌ NO | ❌ NO | ✅ YES (unlikely) |
| **Sort order issues** | ❌ NO | ❌ NO | ✅ YES (unlikely) |
| **Document approval fails** | 🔍 Check Lambda logs | ❌ NO | ❌ NO |

---

## Post-Rollback Actions

After successful rollback:

1. **Document the issue**:
   - What failed?
   - Error messages/logs
   - Steps to reproduce

2. **Fix forward approach**:
   - Identify root cause
   - Test fix in sandbox/test environment
   - Redeploy when ready

3. **Update monitoring**:
   - Add CloudWatch alarms for critical endpoints
   - Set up error tracking (Sentry, etc.)

4. **Notify stakeholders**:
   - Internal team (deployment reverted)
   - Customers (if downtime occurred)

---

**Last Updated**: October 25, 2025  
**Deployment Guide**: See `DEPLOYMENT_GUIDE.md`  
**Backup Location**: `ROLLBACK_BACKUP_PROD/`
