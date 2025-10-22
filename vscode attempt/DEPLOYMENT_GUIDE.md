# 🚀 Production Deployment Guide

**Last Updated**: October 22, 2025  
**Environment**: Production (`dfj-docshare-prod`)

---

## Prerequisites Checklist

- [ ] All changes tested locally
- [ ] Code reviewed and approved
- [ ] Backup of current production files saved
- [ ] AWS Console access ready
- [ ] Salesforce DevOps Center access ready

---

## Deployment Steps

### 1. Deploy Lambda Function (Backend API)

**Time**: ~5 minutes

1. Open `vscode attempt/lambda.py` in your editor
2. Select all content (`Cmd+A` / `Ctrl+A`) and copy
3. Go to [AWS Lambda Console](https://console.aws.amazon.com/lambda)
4. Navigate to **Functions** → `dfj-docshare-prod`
5. Click the **Code** tab
6. Select all existing code and paste the new code
7. Click **Deploy** button (top right)
8. Wait for **"Changes deployed"** confirmation message

**Verify**: Test the ping endpoint
```bash
curl https://21tpssexjd.execute-api.eu-north-1.amazonaws.com/ping
# Expected: {"ok": true}
```

---

### 2. Deploy Frontend Files (S3 or Hosting)

**Time**: ~3 minutes

#### Upload these files from `vscode attempt/` folder:
- `index.html`
- `app.js`
- `brand.js`
- `texts.js`
- `styles.css`

#### Via AWS S3 Console:
1. Go to [S3 Console](https://s3.console.aws.amazon.com)
2. Open your production bucket
3. Click **Upload**
4. Drag and drop the 5 files listed above
5. Click **Upload**
6. Wait for completion

---

### 3. Deploy Salesforce LWC (Lightning Web Component)

**Time**: ~10 minutes

1. Go to **Salesforce** → **Setup** → **DevOps Center**
2. Click **Create Work Item** → **Deployment**
3. Select **Source**: Your sandbox or local files
4. Select **Target Org**: Production
5. Add files to deploy:
   - `salesforce/lwc/journalDocConsole/journalDocConsole.js`
   - `salesforce/lwc/journalDocConsole/journalDocConsole.html`
   - `salesforce/lwc/journalDocConsole/journalDocConsole.css`
   - `salesforce/lwc/journalDocConsole/journalDocConsole.js-meta.xml`
6. Click **Validate Deployment**
7. Wait for validation to complete
8. Review validation results
9. Click **Deploy**
10. Monitor deployment status

**Note**: LWC changes include journal selection button and document sorting functionality.

---

### 4. Deploy Apex Classes (if modified)

**Time**: ~10 minutes

Only needed if Apex classes were changed (DocShareService, DocShare_Query, etc.)

1. In **DevOps Center**, add Apex classes to deployment:
   - `salesforce/classes/DocShareService.cls`
   - `salesforce/classes/DocShare_JournalCreds.cls`
   - `salesforce/classes/DocShare_Query.cls`
2. **Set test level**: Run specified tests
3. **Specify test classes**:
   - `DocShareServiceTest`
   - `DocShare_QueryTest`
4. Click **Validate Deployment**
5. Review validation (must pass all tests)
6. Click **Deploy**

---

## Post-Deployment Verification

### Quick Smoke Tests (5 minutes)

1. **OTP Flow Test**:
   - Visit the portal URL
   - Enter a valid phone number
   - Verify OTP code is received
   - Enter code and verify access granted

2. **Document Viewing**:
   - Open a document from the list
   - Verify PDF displays inline (no download)
   - Test Download button
   - Test Print button

3. **Chat Functionality**:
   - Open chat panel
   - Verify disclaimer message appears
   - Send a test message
   - Verify message appears in chat

4. **Journal Selection** (Identifier Mode):
   - Complete OTP verification
   - Verify journal overview page appears
   - Select a journal
   - Verify "Back to Overview" button works

5. **LWC Component** (Salesforce):
   - Open Salesforce
   - Navigate to a Journal record
   - Verify "Open Document Portal" button exists
   - Click button and verify portal opens

---

## Environment Variables

**Location**: AWS Lambda → Configuration → Environment variables

**Required Variables**:
```
BUCKET=dfj-docs-prod
S3_PREFIX_MAP={"DFJ_DK":"dk/customer-documents","FA_SE":"se/customer-documents","Ireland":"ie/customer-documents"}
SESSION_HMAC_SECRET=<your-secret>
SF_CLIENT_ID=<salesforce-client-id>
SF_CLIENT_SECRET=<salesforce-client-secret>
SF_LOGIN_URL=https://login.salesforce.com
SF_REFRESH_TOKEN=<salesforce-refresh-token>
SF_TOKEN_URL=https://login.salesforce.com/services/oauth2/token
URL_TTL_SECONDS=600
```

**Note**: These should already be set. Only verify if deployment issues occur.

---

## Deployment Complete ✅

Once all steps are complete and verified:
- [ ] Lambda deployed and responding
- [ ] Frontend files uploaded
- [ ] LWC component deployed
- [ ] Smoke tests passed
- [ ] Team notified of deployment

**Estimated Total Time**: 20-30 minutes
