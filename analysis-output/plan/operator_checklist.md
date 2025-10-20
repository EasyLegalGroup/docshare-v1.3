# Operator Checklist
## DFJ Document Share - Identifier Authentication Release

**Use this checklist on deploy day. Check each box as you complete the step.**

---

## ☑️ Pre-Flight (T-1 hour)

- [ ] **Do 1**: Review deployment plan §1 - Confirm all approvals signed
- [ ] **Do 2**: Backup Lambda code and env vars - See plan §1.2
- [ ] **Do 3**: Backup SPA assets from S3 - See plan §1.2
- [ ] **Do 4**: Export API Gateway routes - See plan §1.2
- [ ] **Do 5**: Generate `SESSION_HMAC_SECRET` and store in Secrets Manager - See plan §1.4
- [ ] **Do 6**: Verify Salesforce org health (no pending deployments) - See plan §1.3

---

## ☑️ Salesforce Deploy (T-0, Phase 1)

- [ ] **Do 7**: Deploy `OTP__c` custom object to production - See plan §2.1
- [ ] **Do 8**: Deploy `Account` custom fields (`Phone_Formatted__c`, `Spouse_Email__pc`, `Spouse_Phone__pc`) - See plan §2.2
- [ ] **Do 9**: Deploy `Shared_Document__c` fields (`Sort_Order__c`, `First_Viewed__c`, `Last_Viewed__c`) - See plan §2.3
- [ ] **Do 10**: Deploy Apex classes (if any changes) and run tests (≥85% coverage required) - See plan §2.4
- [ ] **Do 11**: Validate Salesforce deploy - Query `OTP__c`, `Account`, `Shared_Document__c` - See plan §2.5

---

## ☑️ Lambda Deploy (T-0, Phase 2)

- [ ] **Do 12**: Update Lambda environment variables (SESSION_HMAC_SECRET, BUCKET, etc.) - See plan §3.1
- [ ] **Do 13**: Deploy new Lambda code (`lambda-wip.zip`) - See plan §3.2
- [ ] **Do 14**: Test Lambda health endpoints (`/ping`, `/sf-oauth-check`, `/diag/net`) - See plan §3.3
- [ ] **Do 15**: Smoke test identifier endpoints (invoke `/identifier/request-otp`) - See plan §3.4

---

## ☑️ API Gateway Deploy (T-0, Phase 3)

- [ ] **Do 16**: Create `/identifier/*` routes (request-otp, verify-otp, list, doc-url, approve, search) - See plan §4.1
- [ ] **Do 17**: Update CORS configuration (allow `Authorization` header) - See plan §4.2
- [ ] **Do 18**: Deploy API Gateway stage (`prod`) - See plan §4.3
- [ ] **Do 19**: Test API Gateway end-to-end (curl `/identifier/request-otp`) - See plan §4.4

---

## ☑️ SPA Deploy (T-0, Phase 4)

- [ ] **Do 20**: Upload new SPA assets (app.js, styles.css, index.html, etc.) to S3 - See plan §5.1
- [ ] **Do 21**: Invalidate CloudFront cache (`/*`) - See plan §5.2
- [ ] **Do 22**: Wait for CDN invalidation (~10 min) - See plan §5.2
- [ ] **Do 23**: Verify SPA files served correctly (check `app.js` for `MODE` variable) - See plan §5.3

---

## ☑️ Post-Deploy Validation (T+15 min)

### Regression Testing (Journal Mode)
- [ ] **Do 24**: Test journal login with existing link (`?e=...&t=...`) - See plan §6.1
- [ ] **Do 25**: Verify OTP input appears (no identifier chooser)
- [ ] **Do 26**: Verify documents load after OTP entry
- [ ] **Do 27**: Verify chat is visible and functional
- [ ] **Do 28**: Approve a document → Status changes to "Approved"
- [ ] **Do 29**: Test Download and Print buttons (header)

### New Feature Testing (Identifier Mode - DK)
- [ ] **Do 30**: Open clean URL (no `?e=` or `?t=`) - See plan §6.2
- [ ] **Do 31**: Verify phone/email chooser appears
- [ ] **Do 32**: Select "Phone", enter DK number `12345678`
- [ ] **Do 33**: Click "Send code" → Verify OTP__c created in Salesforce
- [ ] **Do 34**: Enter OTP code → Documents load (if phone matches journals)
- [ ] **Do 35**: Verify chat is HIDDEN (not applicable in identifier mode)
- [ ] **Do 36**: Approve a document → Status changes
- [ ] **Do 37**: Test Download and Print from header AND completion modal

### New Feature Testing (Identifier Mode - Email)
- [ ] **Do 38**: Open clean URL, select "E-mail" - See plan §6.3
- [ ] **Do 39**: Enter email `test@example.com`, click "Send code"
- [ ] **Do 40**: Verify step shows email address, enter OTP
- [ ] **Do 41**: Documents load, approve/download/print work

### Edge Case Testing
- [ ] **Do 42**: Test invalid phone (enter `abc`) → Error - See plan §6.4
- [ ] **Do 43**: Test invalid email (enter `not-an-email`) → Error
- [ ] **Do 44**: Test wrong OTP code → "Invalid code" message
- [ ] **Do 45**: Test "Start Over" button → Returns to phone/email chooser

---

## ☑️ Monitoring (T+30 min - T+2 hours)

- [ ] **Do 46**: Check Lambda error rate in CloudWatch - See plan §7.1
  - **Target**: <1% over 5 minutes
  - **Alert**: If >5%, escalate to @oncall
  - **Rollback**: If >10%, initiate immediate rollback (plan §8.1)

- [ ] **Do 47**: Check Lambda p99 duration - See plan §7.1
  - **Target**: <3000ms
  - **Alert**: If >5000ms, investigate (may need SOQL optimization)

- [ ] **Do 48**: Monitor Salesforce `OTP__c` growth - See plan §7.3
  - **Query**: `SELECT COUNT() FROM OTP__c WHERE CreatedDate = TODAY`
  - **Alert**: If >10,000 in first hour, investigate (potential abuse)

- [ ] **Do 49**: Check CloudWatch Logs for errors - See plan §7.4
  - **Query**: Filter by `ERROR` level, look for patterns
  - **Red flags**: "Session expired", "Invalid session", "SOQL exception"

- [ ] **Do 50**: Review OTP success rate - See plan §7.4
  - **Query**: Count verified vs failed OTP attempts
  - **Target**: >90% success rate
  - **Alert**: If <80%, investigate (email/SMS delivery issues?)

---

## ☑️ Communication (T+1 hour, T+24 hours)

- [ ] **Do 51**: Post initial status update in #deploy-dfj-docshare Slack - See plan §10.1
  - Include: "Deploy complete at {TIME}, monitoring for {DURATION}"
  - Metrics: Error rate, OTP success rate, latency
  - Status: "No issues" OR "Minor issues being investigated"

- [ ] **Do 52**: Send post-deploy summary email (T+24 hours) - See plan §10.1
  - Subject: "DFJ DocShare Identifier Auth Deploy - 24h Summary"
  - Include: Metrics, issues encountered, next steps

---

## ☑️ Rollback (IF NEEDED)

**Trigger**: Error rate >10% OR session token failures >50% OR Salesforce OAuth errors

- [ ] **Do 53**: Execute immediate rollback - See plan §8.1
  1. Rollback Lambda code to previous version
  2. Rollback Lambda env vars from backup
  3. Rollback SPA assets from backup
  4. Invalidate CloudFront cache
  5. (Optional) Remove `/identifier/*` routes from API Gateway

- [ ] **Do 54**: Verify journal mode still works after rollback - See plan §8.4

- [ ] **Do 55**: Post rollback notification in Slack - See plan §10.1
  - Subject: "[ROLLBACK] DFJ DocShare Deploy Rolled Back"
  - Reason: {ERROR_DESCRIPTION}
  - Status: "Journal mode verified working"

---

## ☑️ Post-Deployment (Week 1)

- [ ] **Do 56**: Monitor OTP__c growth daily (alert if >10K/day) - See plan §13.1
- [ ] **Do 57**: Review CloudWatch logs for errors (daily digest) - See plan §13.1
- [ ] **Do 58**: Track identifier mode adoption % (daily report) - See plan §13.1
- [ ] **Do 59**: Collect user feedback from support tickets - See plan §13.1
- [ ] **Do 60**: Schedule retrospective meeting (end of Week 1) - See plan §13.3

---

## ☑️ Success Criteria Checklist

**Deployment Success**:
- [ ] All Salesforce metadata deployed (OTP__c, Account fields, Shared_Document__c fields)
- [ ] Lambda code deployed with correct environment variables (`SESSION_HMAC_SECRET` set)
- [ ] API Gateway routes active and CORS configured
- [ ] SPA assets served from CloudFront with correct versions
- [ ] `/ping`, `/sf-oauth-check`, `/diag/net` all return 200 OK

**Functional Success**:
- [ ] Journal mode regression tests pass (100%)
- [ ] Identifier mode tests pass for all markets (DK/SE/IE)
- [ ] OTP request/verify flow works end-to-end
- [ ] Session tokens validated correctly
- [ ] Document list/view/approve work in both modes

**Performance Success**:
- [ ] Lambda p99 latency <3000ms
- [ ] OTP request latency <500ms
- [ ] Identifier list latency <800ms
- [ ] Error rate <1% over 1 hour

**Business Success (Week 1)**:
- [ ] Identifier mode adoption >10% of total logins
- [ ] OTP success rate >90%
- [ ] Zero critical bugs reported
- [ ] Customer satisfaction score unchanged or improved

---

## 🚨 Emergency Contacts

| Role | Name | Slack | Phone |
|------|------|-------|-------|
| **Engineering Lead** | {NAME} | @eng-lead | {PHONE} |
| **DevOps Lead** | {NAME} | @ops-lead | {PHONE} |
| **Salesforce Admin** | {NAME} | @sf-admin | {PHONE} |
| **On-Call Engineer** | {NAME} | @oncall | {PHONE} |

**Escalation Path**:
1. Issue detected → Alert in #deploy-dfj-docshare
2. If error rate >5% for >5 min → Ping @oncall
3. If error rate >10% OR OAuth fails → **ROLLBACK IMMEDIATELY**

---

## 📋 Quick Reference Commands

### Check Lambda Status
```bash
aws lambda get-function --function-name dfj-docshare-prod --query 'Configuration.Version'
```

### Check Error Rate (Last 5 min)
```bash
aws cloudwatch get-metric-statistics --namespace AWS/Lambda --metric-name Errors \
  --dimensions Name=FunctionName,Value=dfj-docshare-prod \
  --start-time $(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 --statistics Sum
```

### Check OTP__c Count (Today)
```bash
sf data query -o prod -q "SELECT COUNT() FROM OTP__c WHERE CreatedDate = TODAY" -t
```

### Test API Endpoint
```bash
curl -X POST https://{API_ENDPOINT}/identifier/request-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+4512345678", "country": "DK"}' -v
```

### Immediate Rollback (Copy-Paste)
```bash
# Restore Lambda env vars
aws lambda update-function-configuration --function-name dfj-docshare-prod \
  --environment Variables="$(cat lambda-env-prod-backup-$(date +%Y%m%d).json)"

# Restore SPA assets
aws s3 sync ./spa-backup-$(date +%Y%m%d)/ s3://dfj-spa-bucket/ --delete

# Invalidate CDN
DIST_ID=$(aws cloudfront list-distributions --query 'DistributionList.Items[?Origins.Items[0].DomainName contains `dfj-spa-bucket`].Id' --output text)
aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"
```

---

**Deploy Date**: ________________  
**Deploy Start Time**: ________________  
**Deploy End Time**: ________________  
**Deployed By**: ________________  
**Status**: ☐ Success  ☐ Rollback  ☐ Partial (with notes)  

**Notes**:
_______________________________________________________________________
_______________________________________________________________________
_______________________________________________________________________

---

**END OF OPERATOR CHECKLIST**
