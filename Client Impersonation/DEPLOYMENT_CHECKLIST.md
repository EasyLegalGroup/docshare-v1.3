# Client Impersonation - Quick Deployment Checklist

**Use this checklist during production deployment**

---

## ✅ Phase 1: Salesforce Deployment

### Deploy Custom Object
```powershell
sf project deploy start --source-dir salesforce/main/default/objects/Client_Impersonation__c --target-org Prod --wait 10
```
- [ ] Status: Succeeded
- [ ] 8 components deployed (object + 7 fields)

### Deploy Apex Classes
```powershell
sf project deploy start --source-dir salesforce/main/default/classes --target-org Prod --wait 10 --test-level RunSpecifiedTests --tests ClientImpersonationServiceTest
```
- [ ] Status: Succeeded
- [ ] Tests: 16 passing, 0 failing
- [ ] Code coverage: >75%

### Deploy LWC
```powershell
sf project deploy start --source-dir salesforce/main/default/lwc/journalDocConsole --target-org Prod --wait 10
```
- [ ] Status: Succeeded
- [ ] Blue "Log in as..." button visible on Journal page
- [ ] Proper spacing between buttons

### Deploy Permission Set
```powershell
sf project deploy start --source-dir salesforce/main/default/permissionsets/DocShareService.permissionset-meta.xml --target-org Prod --wait 10
```
- [ ] Status: Succeeded
- [ ] Client_Impersonation__c permissions granted
- [ ] Assigned users can access object

---

## ✅ Phase 2: AWS Lambda

### Backup Current Lambda
- [ ] Lambda version published
- [ ] Version ARN recorded: `_________________________________`

### Deploy Lambda Code
- [ ] File: `lambda.py` uploaded
- [ ] Deployment successful
- [ ] No syntax errors

### Verify Environment Variables
- [ ] All production variables present
- [ ] JWT_SECRET_KEY is production key (not test)

### Create API Gateway Endpoint
- [ ] Route: `POST /impersonation/login` created
- [ ] Lambda integration configured
- [ ] CORS enabled for production domains
- [ ] API deployed to production stage
- [ ] Endpoint URL: `_________________________________`

---

## ✅ Phase 3: S3 Files

### Backup S3 Files
- [ ] `app.js` backed up to `prod-backup/spa/`
- [ ] `texts.js` backed up to `prod-backup/spa/`

### Upload New Files
- [ ] `app.js` uploaded with Cache-Control header
- [ ] `texts.js` uploaded with Cache-Control header

### Invalidate Cache (if CloudFront)
- [ ] Invalidation created for `/app.js` and `/texts.js`
- [ ] Status: Completed (or N/A)

---

## ✅ Phase 4: Validation Tests

### Test 1: Link Generation
- [ ] Open Journal record
- [ ] Click "Log in as..." button
- [ ] New tab opens with correct URL
- [ ] No double `??` in URL
- [ ] Portal loads successfully

### Test 2: One-Time Use
- [ ] Copy impersonation URL
- [ ] Close tab
- [ ] Open same URL again
- [ ] Error page appears (not empty portal)

### Test 3: Link Revocation
- [ ] Generate link for Journal A
- [ ] Generate link for Journal B
- [ ] Try Link A (should be revoked)
- [ ] Link B works normally

### Test 4: Audit Trail
- [ ] Open Client_Impersonation__c record
- [ ] `Used_At__c` populated
- [ ] `Used_By_IP__c` populated
- [ ] `Is_Revoked__c` correct

### Test 5: All Markets
- [ ] DK journal → `https://dok.dinfamiliejurist.dk?impersonate=...`
- [ ] SE journal → `https://dok.dinfamiljejurist.se?impersonate=...`
- [ ] IE journal → `https://docs.hereslaw.ie?impersonate=...`

### Test 6: CloudWatch Logs
- [ ] No errors in Lambda logs
- [ ] Impersonation events logged correctly

---

## 🔄 If Rollback Needed

### Rollback Salesforce
```powershell
sf project deploy start --source-dir prod-backup/lwc/journalDocConsole --target-org Prod --wait 10
```

### Rollback Lambda
- Navigate to Lambda Console → Versions → Restore backup version

### Rollback S3
- Upload backed-up `app.js` and `texts.js` from `prod-backup/spa/`

---

## 📝 Sign-Off

**Deployment Started**: _______________  
**Deployment Completed**: _______________  
**Total Duration**: _______________

**Deployed By**: _______________  
**Validated By**: _______________

**Issues Encountered**: 
- _______________________________________
- _______________________________________

**Resolution**: 
- _______________________________________
- _______________________________________

---

**For detailed steps, see: PRODUCTION_DEPLOYMENT_GUIDE.md**
