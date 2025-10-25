# 🚀 Production Deployment Guide

**DocShare v1.3 - Complete Deployment Process**

---

## ✅ Deployment Status (October 25, 2025)

| Component | Status | Deploy ID | Notes |
|-----------|--------|-----------|-------|
| **Apex Classes** | ✅ DEPLOYED | 0AfW5000001ZvAvKAK | DocShareService with Sort_Order__c |
| **LWC** | ✅ DEPLOYED | 0AfW5000001ZvAvKAK | journalDocConsole with hardcoded URLs |
| **Lambda** | ⏳ READY | - | Code ready, awaiting copy-paste deploy |
| **Frontend SPA** | ⏳ READY | - | Files ready, awaiting upload |

**Last Deployment**: October 24, 2025 (Salesforce components)  
**Next Steps**: Lambda → Frontend → CloudFront invalidation  
**Deployed By**: Mathias  

---

## Prerequisites

✅ **COMPLETED**: Apex Classes deployed (Deploy ID: 0AfW5000001ZvAvKAK)  
✅ **COMPLETED**: LWC deployed (Deploy ID: 0AfW5000001ZvAvKAK)  
✅ **COMPLETED**: Rollback backup created (no longer needed)  
✅ AWS CLI configured with production credentials  
✅ Lambda environment variables configured (add SESSION_HMAC_SECRET)  
✅ Frontend hosting location identified

---

## ⚠️ Deployment Order (Completed Steps First)

This deployment was executed in the following order:

### ✅ COMPLETED - Steps 1-2: Salesforce Components (October 24, 2025)
1. **Apex Classes** - Deploy ID: 0AfW5000001ZvAvKAK
2. **LWC (journalDocConsole)** - Deploy ID: 0AfW5000001ZvAvKAK

### ⏳ REMAINING - Steps 3-5: Backend & Frontend

---

## Step-by-Step Deployment (Remaining Steps)

### 3. Deploy Lambda Function (Backend)

**Location**: `vscode attempt/lambda.py`

**Deployment Method**: Copy-paste code directly into AWS Lambda Console

#### Prerequisites - Add Missing Environment Variables FIRST:
```bash
SESSION_HMAC_SECRET=<GENERATE THIS - see below>
SF_LOGIN_URL=https://login.salesforce.com
```

**Generate SESSION_HMAC_SECRET** (PowerShell):
```powershell
# Generates a secure 128-character hex string
-join ((1..64) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
```

#### Steps:
1. **Add environment variables** (AWS Lambda Console → Configuration → Environment variables):
   - Add `SESSION_HMAC_SECRET` with generated value
   - Add `SF_LOGIN_URL` = `https://login.salesforce.com`
   - **Optional cleanup**: Remove `ACCESS_TOKEN` and `DOCS_BUCKET` (no longer used)

2. **Deploy new Lambda code**:
   - Open `vscode attempt/lambda.py` in your editor
   - Select all content (Ctrl+A) and copy (Ctrl+C)
   - Go to AWS Lambda Console → Functions → `dfj-docshare-prod`
   - Click the "Code" tab
   - Select all existing code and paste the new code
   - Click "Deploy" button (top right)
   - Wait for "Changes deployed" message

**Verify**: 
```powershell
Invoke-RestMethod -Uri "https://YOUR-PROD-API-URL/ping" -Method Get
# Expected: {"ok": true}
```

**Time**: ~5 minutes

---

### 4. Update Lambda Environment Variables (Reference)

**Your current environment variables are already correct!** You only need to add:
- `SESSION_HMAC_SECRET` (generate new)
- `SF_LOGIN_URL` (add this)

**Complete environment variable reference** (for verification):

```bash
# Storage
BUCKET=dfj-docs-prod
S3_PREFIX_MAP={"DFJ_DK":"dk/customer-documents","FA_SE":"se/customer-documents","Ireland":"ie/customer-documents"}

# Security
SESSION_HMAC_SECRET=<GENERATE THIS - 128 char hex string>
DEBUG_ALLOW_IDENTIFIER_DOCURL=false

# Salesforce OAuth (your existing values are correct!)
SF_CLIENT_ID=xxxxxxV7gw2RzwHg29hUbYFZ_oKch84JnTDmY7aSwJcp146kTa8CKc1ShzoS4x7U61qhCTFOXAm
SF_CLIENT_SECRET=xxxxxx57D8DA3FB9A80B9AECC41AC32D0FC0EC7CF5C222A92AC6B7582
SF_REFRESH_TOKEN=xxxxxxF48CWn4wt0DiX7YS2DlWTCoB2ieXTxHrCb7m831DCQwSR9tuD7K7u.AX8WVvrn1AWesoPoQuf
SF_TOKEN_URL=https://dfj.my.salesforce.com/services/oauth2/token  # ← Your value works! Can keep it.
SF_LOGIN_URL=https://login.salesforce.com  # ← ADD THIS

# URL Settings
URL_TTL_SECONDS=5400  # ← Your value (90 min) is fine
```

**What to remove** (no longer used):
- `ACCESS_TOKEN` - Old authentication method
- `DOCS_BUCKET` - Duplicate of BUCKET

---

### 5. Deploy Frontend (SPA)

**Location**: `vscode attempt/` (root files)

**Deployment Method**: Upload to `dfj-docs-prod` S3 bucket (root directory)

**Your Setup**:
- S3 Bucket: `dfj-docs-prod`
- CloudFront Distribution: `E9HR6T6YQDI3S` (dok-site-prod)
- Domains: `dok.dinfamiliejurist.dk`, `dok.dinfamiljejurist.se`, `docs.hereslaw.ie`

#### Steps:
1. **Navigate to S3 bucket** `dfj-docs-prod` in AWS Console
2. **Upload to root directory** (same level as customer-documents folders)
3. **Upload and overwrite** these 5 files:
   - `index.html`
   - `app.js`
   - `brand.js`
   - `texts.js`
   - `styles.css`
4. Verify upload completed successfully

**Files to deploy** (5 files only):
- ✅ `index.html` - Main HTML structure
- ✅ `app.js` - All application logic (OTP, docs, chat, journal selection)
- ✅ `brand.js` - Multi-brand detection (DK/SE/IE)
- ✅ `texts.js` - i18n translations (da/sv/en)
- ✅ `styles.css` - All UI styling and fixes

**S3 CLI Upload**:
```powershell
cd "c:\Users\Mathias\Downloads\docshare-16-10-2025-fixed\vscode attempt"

aws s3 cp index.html s3://dfj-docs-prod/index.html --content-type "text/html"
aws s3 cp app.js s3://dfj-docs-prod/app.js --content-type "application/javascript"
aws s3 cp brand.js s3://dfj-docs-prod/brand.js --content-type "application/javascript"
aws s3 cp texts.js s3://dfj-docs-prod/texts.js --content-type "application/javascript"
aws s3 cp styles.css s3://dfj-docs-prod/styles.css --content-type "text/css"
```

**Or via S3 Console**:
1. Go to S3 → `dfj-docs-prod` bucket
2. Click "Upload" button
3. Drag and drop all 5 files
4. Click "Upload" to confirm
5. Overwrite when prompted

**What NOT to upload**:
- ❌ `assets/` folder (logos/favicons) - only if you've changed them
- ❌ `lambda.py` - deployed separately to Lambda
- ❌ Salesforce files - already deployed

**Time**: ~3 minutes

---

### 6. Invalidate CloudFront Cache

**Required** to clear cached frontend files and serve new versions immediately.

**Your Distribution**:
- Distribution ID: `E9HR6T6YQDI3S`
- Name: `dok-site-prod`
- Domain: `d2c733ww6zhets.cloudfront.net`
- Serves: All 3 portal domains (DK/SE/IE)

#### Invalidate Cache (CLI):
```powershell
aws cloudfront create-invalidation `
  --distribution-id E9HR6T6YQDI3S `
  --paths "/*"
```

#### Invalidate Cache (AWS Console):
1. Go to CloudFront → Distributions
2. Select `E9HR6T6YQDI3S` (dok-site-prod)
3. Click "Invalidations" tab
4. Click "Create invalidation"
5. Enter paths: `/*`
6. Click "Create invalidation"

**Expected output**:
```json
{
  "Invalidation": {
    "Id": "I...",
    "Status": "InProgress"
  }
}
```

**Time**: ~2 minutes (cache invalidation takes 5-15 minutes to complete)

---

### 7. Verify Deployment

#### Test Lambda
```powershell
# Test ping
Invoke-RestMethod -Uri "https://YOUR-PROD-API/ping"

# Test OTP request (with real phone)
Invoke-RestMethod -Uri "https://YOUR-PROD-API/identifier/request-otp" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"channel":"phone","market":"DFJ_DK","phone":"+4542455150","phoneDigits":"4542455150","country":"DK"}'
```

#### Test Frontend
1. Open production domain (e.g., `https://dok.dinfamiliejurist.dk`)
2. Enter phone: `+4542455150`
3. Send OTP → Check Salesforce for `OTP__c` record
4. Verify OTP → Should see journal overview
5. Select journal → Should see documents
6. Test document approval
7. Test chat messages
8. Test "Back to overview" button

#### Test Salesforce LWC
1. Navigate to any Journal record
2. Verify journalDocConsole component loads
3. Upload test document
4. Verify document appears in portal

**Time**: ~15 minutes

---

## Post-Deployment Checklist

### Salesforce (Already Deployed ✅)
- [x] Apex classes deployed (Deploy ID: 0AfW5000001ZvAvKAK)
- [x] LWC deployed (Deploy ID: 0AfW5000001ZvAvKAK)
- [x] Tests passing (4/4 - 100% coverage)
- [x] Rollback backup created

### Lambda (To Verify After Step 3)
- [ ] Lambda code deployed successfully
- [ ] Environment variables configured (SESSION_HMAC_SECRET added)
- [ ] Ping endpoint responds: `{"ok": true}`
- [ ] OAuth check passes (SF token refresh working)

### Frontend (To Verify After Steps 5-6)
- [ ] Files uploaded to correct hosting bucket
- [ ] CloudFront cache invalidated
- [ ] All 3 domains accessible:
  - [ ] https://dok.dinfamiliejurist.dk
  - [ ] https://dok.dinfamiljejurist.se
  - [ ] https://docs.hereslaw.ie

### End-to-End Testing
- [ ] **OTP Flow**: Phone number → Request OTP → Verify OTP
- [ ] **Journal Selection**: Multiple journals display → Select one
- [ ] **Document List**: Documents load with correct sort order
- [ ] **PDF Viewer**: PDFs render inline (no auto-download)
- [ ] **Approval**: Document approval working
- [ ] **Chat**: Messages send/receive correctly
- [ ] **Multi-brand**: DK/SE/IE switching works
- [ ] **Salesforce LWC**: Upload from Salesforce working

---

## Configuration Checks

### Lambda Environment Variables
Verify in AWS Console → Lambda → Configuration → Environment variables:

| Variable | Expected Value |
|----------|---------------|
| BUCKET | `dfj-docs-prod` |
| DEBUG_ALLOW_IDENTIFIER_DOCURL | `false` |
| SF_LOGIN_URL | `https://login.salesforce.com` |
| SESSION_HMAC_SECRET | 64+ character hex string |
| SF_CLIENT_ID | Salesforce Connected App ID |
| SF_CLIENT_SECRET | Salesforce Connected App Secret |
| SF_REFRESH_TOKEN | Valid Salesforce refresh token |

### API Gateway
Verify CORS settings allow production domains:
- `https://dok.dinfamiliejurist.dk`
- `https://dok.dinfamiljejurist.se`
- `https://docs.hereslaw.ie`

---

## Troubleshooting

### Issue: Lambda returns 403/404
**Fix**: Check API Gateway configuration and Lambda permissions

### Issue: OTP not created
**Fix**: Verify `SF_REFRESH_TOKEN` is valid, check Lambda logs

### Issue: PDFs still download instead of inline
**Fix**: Clear browser cache, verify Lambda deployment

### Issue: Chat not working
**Fix**: Check Lambda logs for `/identifier/chat/*` endpoints

### Issue: LWC not loading in Salesforce
**Fix**: Check Lightning App Builder permissions, component visibility settings

---

## Total Deployment Time

- **Preparation**: 10 minutes
- **Deployment**: 20 minutes
- **Testing**: 15 minutes
- **Total**: ~45 minutes

---

## Rollback Plan

If issues occur, see **ROLLBACK_GUIDE.md** for complete rollback instructions.

---

**Deployment Completed**: _______________  
**Deployed By**: _______________  
**Verified By**: _______________
