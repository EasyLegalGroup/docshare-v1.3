# 🔙 Rollback Guide

**Last Updated**: October 22, 2025

---

## When to Rollback

Execute rollback procedures if:
- ❌ Critical errors in production
- ❌ Users unable to access portal
- ❌ OTP verification consistently failing
- ❌ Documents not loading
- ❌ Salesforce integration broken

---

## Quick Emergency Rollback (5 minutes)

If immediate rollback is needed:

### 1. Rollback Lambda
1. Open `prod-version/lambda.py`
2. Copy all content (`Cmd+A`, `Cmd+C`)
3. Go to AWS Lambda Console → `dfj-docshare-prod` → Code tab
4. Paste and click **Deploy**

### 2. Rollback Frontend
1. Go to your hosting provider (S3 Console)
2. Upload files from `prod-version/` folder
3. Overwrite: `index.html`, `app.js`, `brand.js`, `texts.js`, `styles.css`

---

## Complete Rollback Procedures

### Step 1: Rollback Lambda Function

**Backup Location**: `prod-version/lambda.py`

**Steps**:
1. Open [AWS Lambda Console](https://console.aws.amazon.com/lambda)
2. Navigate to **Functions** → `dfj-docshare-prod`
3. Click **Code** tab
4. Open `prod-version/lambda.py` in your editor
5. Copy all content
6. Paste into Lambda code editor (replacing current code)
7. Click **Deploy**
8. Wait for "Changes deployed" message

**Verify**:
```bash
curl https://21tpssexjd.execute-api.eu-north-1.amazonaws.com/ping
# Should return: {"ok": true}
```

**Time**: ~3 minutes

---

### Step 2: Rollback Frontend Files

**Backup Location**: `prod-version/` folder

**Files to Restore**:
- `index.html`
- `app.js`
- `brand.js`
- `texts.js`
- `styles.css`

**Steps** (via S3 Console):
1. Go to [S3 Console](https://s3.console.aws.amazon.com)
2. Open production bucket
3. Click **Upload**
4. Select all 5 files from `prod-version/` folder
5. Click **Upload** (overwrite existing files)
6. Clear browser cache and reload portal

**Time**: ~3 minutes

---

### Step 3: Rollback Salesforce LWC

**Backup Location**: `prod-version/salesforce/lwc/journalDocConsole/`

**Steps**:
1. Go to **Salesforce** → **Setup** → **DevOps Center**
2. Click **Create Work Item** → **Deployment**
3. Select **Source**: Specify files from `prod-version/salesforce/lwc/`
4. Select **Target Org**: Production
5. Add LWC files:
   - `journalDocConsole.js`
   - `journalDocConsole.html`
   - `journalDocConsole.css`
   - `journalDocConsole.js-meta.xml`
6. Click **Validate Deployment**
7. Review validation results
8. Click **Deploy**
9. Monitor deployment status

**Time**: ~10 minutes

---

### Step 4: Rollback Apex Classes (if needed)

**Backup Location**: `prod-version/salesforce/classes/`

**Classes to Restore**:
- DocShareService.cls
- DocShare_JournalCreds.cls
- DocShare_Query.cls

**Steps**:
1. In **DevOps Center**, create new deployment
2. Add Apex classes from `prod-version/salesforce/classes/`
3. **Set test level**: Run specified tests
4. **Specify test classes**:
   - DocShareServiceTest
   - DocShare_QueryTest
5. Click **Validate Deployment**
6. Ensure all tests pass
7. Click **Deploy**

**Time**: ~10 minutes

---

## Post-Rollback Verification

After rollback is complete, verify:

### 1. Lambda Function
```bash
# Test ping endpoint
curl https://21tpssexjd.execute-api.eu-north-1.amazonaws.com/ping

# Test OTP request (should work)
curl -X POST https://21tpssexjd.execute-api.eu-north-1.amazonaws.com/identifier/request-otp \
  -H "Content-Type: application/json" \
  -d '{"channel":"phone","phone":"+4512345678","market":"DFJ_DK"}'
```

### 2. Frontend Portal
- [ ] Portal loads without errors
- [ ] OTP entry form appears
- [ ] Can request OTP code
- [ ] Can verify OTP code
- [ ] Documents list appears
- [ ] PDF viewer works

### 3. Salesforce LWC
- [ ] "Open Document Portal" button appears on Journal records
- [ ] Clicking button opens portal with correct parameters
- [ ] Portal authenticates successfully

---

## Rollback Complete ✅

Once rollback is verified:
- [ ] Lambda rolled back and responding
- [ ] Frontend files restored
- [ ] LWC component rolled back (if applicable)
- [ ] Verification tests passed
- [ ] Users can access portal normally
- [ ] Incident documented
- [ ] Team notified

**Estimated Total Rollback Time**: 15-25 minutes

---

## Next Steps After Rollback

1. **Document the issue**: Record what went wrong and why rollback was needed
2. **Fix the problem**: Address the root cause in development environment
3. **Test thoroughly**: Ensure fix works before attempting redeployment
4. **Plan redeployment**: Schedule new deployment with proper testing
