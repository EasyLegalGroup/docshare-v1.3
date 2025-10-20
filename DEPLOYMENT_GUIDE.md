# 🚀 Production Deployment Guide

**DocShare v1.3 - Complete Deployment Process**

---

## Prerequisites

✅ Backup completed (see ROLLBACK_GUIDE.md)  
✅ Salesforce CLI authenticated to production org  
✅ AWS CLI configured with production credentials  
✅ Lambda environment variables ready

---

## Step-by-Step Deployment

### 1. Deploy Lambda Function (Backend)

**Location**: `vscode attempt/lambda.py`

**Deployment Method**: Copy-paste code directly into AWS Lambda Console

#### Steps:
1. Open `vscode attempt/lambda.py` in your editor
2. Select all content (Ctrl+A) and copy (Ctrl+C)
3. Go to AWS Lambda Console → Functions → `dfj-docshare-prod`
4. Click the "Code" tab
5. Select all existing code and paste the new code
6. Click "Deploy" button (top right)
7. Wait for "Changes deployed" message

**Verify**: 
```powershell
Invoke-RestMethod -Uri "https://YOUR-PROD-API-URL/ping" -Method Get
# Expected: {"ok": true}
```

**Time**: ~3 minutes

---

### 2. Update Lambda Environment Variables

Set these environment variables in AWS Lambda Console:

```bash
BUCKET=dfj-docs-prod
DEBUG_ALLOW_IDENTIFIER_DOCURL=false
S3_PREFIX_MAP={"DFJ_DK":"dk/customer-documents","FA_SE":"se/customer-documents","Ireland":"ie/customer-documents"}
SESSION_HMAC_SECRET=<YOUR_SECRET_KEY>
SF_CLIENT_ID=<YOUR_SALESFORCE_CLIENT_ID>
SF_CLIENT_SECRET=<YOUR_SALESFORCE_CLIENT_SECRET>
SF_LOGIN_URL=https://login.salesforce.com
SF_REFRESH_TOKEN=<YOUR_SALESFORCE_REFRESH_TOKEN>
SF_TOKEN_URL=https://login.salesforce.com/services/oauth2/token
URL_TTL_SECONDS=600
```

**Reference**: Use values from `prod-version/lambda_env_variables` (replace placeholders)

---

#### How to Obtain Salesforce Refresh Token

**Option A: Via Salesforce CLI (PowerShell)**
```powershell
# 1. Login to Salesforce (opens browser)
sf org login web --alias Prod --instance-url https://login.salesforce.com

# 2. Display org info including refresh token
sf org display --verbose --target-org Prod

# Look for "Refresh Token" in the output
```

**Option B: Via Terminal (bash/zsh)**
```bash
# 1. Login to Salesforce
sf org login web --alias Prod --instance-url https://login.salesforce.com

# 2. Display org info
sf org display --verbose --target-org Prod | grep "Refresh Token"
```

**Option C: From Existing Auth File (PowerShell)**
```powershell
# Salesforce CLI stores auth in JSON files
$authFile = "$env:USERPROFILE\.sf\[ORG_USERNAME].json"
Get-Content $authFile | ConvertFrom-Json | Select-Object -ExpandProperty refreshToken
```

**Option D: Manual via Connected App**
1. Setup → App Manager → Find your Connected App
2. View details → Note Client ID and Client Secret
3. Use OAuth 2.0 Username-Password flow to get refresh token
4. Endpoint: `https://login.salesforce.com/services/oauth2/token`

**Time**: ~5 minutes

---

### 3. Deploy Apex Classes

**Location**: `vscode attempt/salesforce/classes/`

**Deployment Method**: Salesforce DevOps Center

#### Steps:
1. Go to Salesforce → App Launcher → Search "DevOps Center"
2. Select your project or create new deployment
3. Click "Create Work Item" → "Deployment"
4. Select source org: Sandbox (`mt@dinfamiliejurist.dk.itdevopsi`)
5. Select target org: Production (`mt@dinfamiliejurist.dk`)
6. Add components to deployment:
   - DocShareService.cls
   - DocShare_JournalCreds.cls
   - DocShare_Query.cls
7. Click "Validate Deployment"
8. **Set test level**: Specify test classes to run:
   - Test1: `DocShareService_Test`
   - Test2: `DocShare_JournalCreds_Test`
   - Test3: `DocShare_Query_Test`
   - (Or use "Run Local Tests" if test classes don't exist)
9. Review validation results
10. Click "Deploy Now"
11. Monitor deployment progress

**Classes to deploy**:
- ✅ DocShareService.cls
- ✅ DocShare_JournalCreds.cls
- ✅ DocShare_Query.cls

**Time**: ~10 minutes

---

### 4. Deploy Lightning Web Component

**Location**: `vscode attempt/salesforce/lwc/journalDocConsole/`

**Deployment Method**: Salesforce DevOps Center

#### Steps:
1. Go to Salesforce → DevOps Center
2. Use same deployment as Apex classes OR create new deployment
3. Add LWC component to deployment:
   - journalDocConsole (entire bundle)
4. Click "Validate Deployment"
5. Review validation (LWC doesn't require tests)
6. Click "Deploy Now"
7. Monitor deployment progress

**Files deployed**:
- ✅ journalDocConsole.js
- ✅ journalDocConsole.html
- ✅ journalDocConsole.css
- ✅ journalDocConsole.js-meta.xml

**Note**: Can be deployed together with Apex classes in step 3

**Time**: ~5 minutes

---

### 5. Deploy Frontend (SPA)

**Location**: `vscode attempt/` (root files)

**Deployment Method**: Manual file upload to hosting/S3

#### Steps:
1. Open your hosting provider's file manager or S3 console
2. Navigate to the production website directory
3. Upload and **overwrite** these files:
   - `index.html`
   - `app.js`
   - `brand.js`
   - `texts.js`
   - `styles.css`
4. If assets changed, upload `assets/` folder contents
5. Verify file upload completed successfully

**Files to deploy**:
- ✅ index.html
- ✅ app.js (contains all bug fixes & journal selection)
- ✅ brand.js (multi-brand support)
- ✅ texts.js (translations)
- ✅ styles.css (all UI fixes)
- ✅ assets/ folder (logos, favicons) - *if changed*

**Alternative - S3 CLI (if preferred)**:
```powershell
aws s3 cp "vscode attempt/index.html" s3://your-prod-bucket/index.html
aws s3 cp "vscode attempt/app.js" s3://your-prod-bucket/app.js
aws s3 cp "vscode attempt/brand.js" s3://your-prod-bucket/brand.js
aws s3 cp "vscode attempt/texts.js" s3://your-prod-bucket/texts.js
aws s3 cp "vscode attempt/styles.css" s3://your-prod-bucket/styles.css
```

**Time**: ~5 minutes

---

### 6. Invalidate CDN Cache (if using CloudFront)

```powershell
aws cloudfront create-invalidation `
  --distribution-id YOUR_DISTRIBUTION_ID `
  --paths "/*"
```

**Time**: ~1 minute

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

- [ ] Lambda responding (ping returns `{"ok": true}`)
- [ ] OTP creation working (`OTP__c` records created)
- [ ] OTP verification working (session token returned)
- [ ] Journal overview displays (bridge page)
- [ ] Documents load correctly
- [ ] PDFs render inline (no auto-download)
- [ ] Document approval working
- [ ] Chat messages working
- [ ] "Back to overview" button working
- [ ] Multi-brand switching working (DK/SE/IE)
- [ ] Phone normalization correct (all countries)
- [ ] Salesforce LWC component functional
- [ ] Document upload working from Salesforce

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
