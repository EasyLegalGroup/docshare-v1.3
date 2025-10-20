# Comprehensive Deployment Plan
## DFJ Document Share Platform - Identifier Authentication Release

**Version**: Work-in-Progress → Production  
**Target Deploy Date**: {TBD}  
**Estimated Downtime**: Zero (rolling deployment)  
**Rollback Time**: <15 minutes  

---

## Table of Contents
1. [Pre-Deployment](#1-pre-deployment)
2. [Salesforce Metadata Deploy](#2-salesforce-metadata-deploy)
3. [Lambda Configuration](#3-lambda-configuration)
4. [API Gateway Updates](#4-api-gateway-updates)
5. [SPA Deployment](#5-spa-deployment)
6. [Post-Deployment Validation](#6-post-deployment-validation)
7. [Monitoring & Alerts](#7-monitoring--alerts)
8. [Rollback Procedures](#8-rollback-procedures)

---

## 1. Pre-Deployment

### 1.1 Approvals & Sign-Offs
- [ ] **Engineering Lead**: Review code changes, approve deployment
- [ ] **Product Owner**: Approve feature release (identifier auth)
- [ ] **Security Team**: Review session token implementation, OTP anti-enumeration
- [ ] **Ops Team**: Review deployment plan, confirm monitoring setup

### 1.2 Backup Current Production State
```bash
# Backup Lambda function code
aws lambda get-function --function-name dfj-docshare-prod \
  --query 'Code.Location' --output text | xargs curl -o lambda-prod-backup-$(date +%Y%m%d).zip

# Backup Lambda environment variables
aws lambda get-function-configuration --function-name dfj-docshare-prod \
  --query 'Environment.Variables' --output json > lambda-env-prod-backup-$(date +%Y%m%d).json

# Backup SPA assets (S3)
aws s3 sync s3://dfj-spa-bucket/ ./spa-backup-$(date +%Y%m%d)/ --exclude "*.pdf"

# Export API Gateway routes
aws apigatewayv2 get-routes --api-id {API_ID} --output json > api-routes-backup-$(date +%Y%m%d).json
```

### 1.3 Validate Salesforce Org Health
```bash
# Check Named Credentials exist
sf data query -o prod -q "SELECT Id, DeveloperName FROM NamedCredential WHERE DeveloperName LIKE 'DocShare%'" -t

# Check Remote Site Settings
sf data query -o prod -q "SELECT Id, SiteName, EndpointUrl FROM RemoteSiteSetting WHERE SiteName LIKE '%docshare%'" -t

# Check Custom Metadata Types (if used for config)
sf data query -o prod -q "SELECT Id, Label FROM CustomMetadata WHERE DeveloperName LIKE 'DocShare%'" -t

# Verify org has no pending deployments
sf org display --target-org prod
```

### 1.4 Generate Production Secrets
```bash
# Generate SESSION_HMAC_SECRET (save securely!)
python3 -c "import secrets; print('SESSION_HMAC_SECRET=' + secrets.token_hex(32))" > .env.prod.secret
chmod 600 .env.prod.secret

# Verify entropy (should be 256 bits = 64 hex chars)
grep SESSION_HMAC_SECRET .env.prod.secret | cut -d'=' -f2 | wc -c  # Output: 65 (64 + newline)

# Store in AWS Secrets Manager (recommended)
aws secretsmanager create-secret \
  --name dfj-docshare-session-hmac-secret-prod \
  --secret-string $(grep SESSION_HMAC_SECRET .env.prod.secret | cut -d'=' -f2)
```

---

## 2. Salesforce Metadata Deploy

### 2.1 Create OTP__c Custom Object
**Deploy via Change Set or Metadata API**

#### Fields Required:
| API Name | Type | Properties |
|----------|------|------------|
| `Key__c` | Text(255) | Unique, External ID, Required |
| `Brand__c` | Picklist | Values: DK, SE, IE; Required |
| `Purpose__c` | Text(50) | Required |
| `Resource_Type__c` | Text(100) | Default: "Shared_Document__c" |
| `Identifier_Type__c` | Picklist | Values: Email, Phone; Required |
| `Identifier_Value__c` | Text(255) | Indexed, Required |
| `Channel__c` | Picklist | Values: Email, SMS; Required |
| `Code__c` | Text(6) | Required |
| `Status__c` | Picklist | Values: Pending, Verified, Expired, Failed; Default: Pending |
| `Sent_At__c` | DateTime | Required |
| `Expires_At__c` | DateTime | Required |
| `Attempt_Count__c` | Number(3,0) | Default: 0 |
| `Resend_Count__c` | Number(3,0) | Default: 0 |
| `Verified_At__c` | DateTime | Nullable |

#### Command (Metadata API):
```bash
# Package OTP__c object
sf project generate manifest --metadata CustomObject:OTP__c --output-dir force-app/main/default

# Deploy to sandbox first
sf project deploy start --target-org sandbox --manifest force-app/main/default/package.xml --test-level NoTestRun

# Validate in production (dry run)
sf project deploy start --target-org prod --manifest force-app/main/default/package.xml --test-level NoTestRun --dry-run

# Deploy to production (after validation passes)
sf project deploy start --target-org prod --manifest force-app/main/default/package.xml --test-level RunLocalTests --wait 30
```

### 2.2 Update Account Object (Person Account Fields)
**Add Custom Fields if Missing**:
- `Phone_Formatted__c` (Text(20), Formula: normalize phone to `+XX...` format)
- `Spouse_Email__pc` (Email)
- `Spouse_Phone__pc` (Phone)

#### Command:
```bash
# Deploy Account fields (if new)
sf project deploy start --target-org prod --source-dir force-app/main/default/objects/Account --test-level NoTestRun

# Populate Phone_Formatted__c for existing records (one-time data migration)
sf data upsert bulk --sobject Account --file account-phone-migration.csv --external-id Id --target-org prod
```

### 2.3 Update Shared_Document__c Object
**Add Fields**:
- `Sort_Order__c` (Number(5,0), Nullable)
- `First_Viewed__c` (DateTime, Nullable)
- `Last_Viewed__c` (DateTime, Nullable) – if not already present

#### Command:
```bash
sf project deploy start --target-org prod --source-dir force-app/main/default/objects/Shared_Document__c --test-level NoTestRun
```

### 2.4 Deploy Apex Classes (If Applicable)
**Expected Classes** (if any backend changes):
- `DocShareService` (core service layer)
- `DocShareService_Tests` (unit tests)
- `DocShare_Query` (SOQL helpers)
- `DocShare_Query_Test` (test coverage)

#### Command:
```bash
# Run all tests and deploy
sf project deploy start --target-org prod --source-dir force-app/main/default/classes --test-level RunLocalTests --coverage-formatters json --results-dir test-results

# Verify coverage ≥85% on changed classes
cat test-results/test-result-coverage.json | jq '.coverage | map(select(.name | startswith("DocShare"))) | map({name, coveredPercent})'
```

### 2.5 Post-Salesforce-Deploy Validation
```bash
# Verify OTP__c object exists
sf data query -o prod -q "SELECT COUNT() FROM OTP__c" -t  # Should return 0 initially

# Verify Account fields
sf data query -o prod -q "SELECT Id, Phone_Formatted__c, Spouse_Email__pc FROM Account LIMIT 1" -t

# Verify Shared_Document__c fields
sf data query -o prod -q "SELECT Id, Sort_Order__c, First_Viewed__c, Last_Viewed__c FROM Shared_Document__c LIMIT 1" -t
```

---

## 3. Lambda Configuration

### 3.1 Update Environment Variables
**⚠️ CRITICAL: Update these before deploying new Lambda code**

```bash
# Set production values (replace placeholders)
aws lambda update-function-configuration --function-name dfj-docshare-prod \
  --environment Variables='{
    "BUCKET": "dfj-docs-prod",
    "DOCS_BUCKET": "dfj-docs-prod",
    "DEBUG_ALLOW_IDENTIFIER_DOCURL": "false",
    "S3_PREFIX_MAP": "{\"DFJ_DK\":\"dk/customer-documents\",\"FA_SE\":\"se/customer-documents\",\"Ireland\":\"ie/customer-documents\"}",
    "SESSION_HMAC_SECRET": "'"$(aws secretsmanager get-secret-value --secret-id dfj-docshare-session-hmac-secret-prod --query SecretString --output text)"'",
    "SF_CLIENT_ID": "3MVG9fTLmJ60pJ5JV7gw2RzwHg29hUbYFZ_oKch84JnTDmY7aSwJcp146kTa8CKc1ShzoS4x7U61qhCTFOXAm",
    "SF_CLIENT_SECRET": "'"$(aws secretsmanager get-secret-value --secret-id dfj-salesforce-client-secret-prod --query SecretString --output text)"'",
    "SF_LOGIN_URL": "https://login.salesforce.com",
    "SF_REFRESH_TOKEN": "'"$(aws secretsmanager get-secret-value --secret-id dfj-salesforce-refresh-token-prod --query SecretString --output text)"'",
    "SF_TOKEN_URL": "https://dfj.my.salesforce.com/services/oauth2/token",
    "URL_TTL_SECONDS": "900"
  }'

# Wait for update to complete
aws lambda wait function-updated --function-name dfj-docshare-prod
```

### 3.2 Deploy Lambda Code
```bash
# Package Lambda (from WIP directory)
cd "vscode attempt"
zip -r lambda-wip.zip lambda.py

# Upload to Lambda
aws lambda update-function-code --function-name dfj-docshare-prod --zip-file fileb://lambda-wip.zip

# Wait for deployment to complete
aws lambda wait function-updated --function-name dfj-docshare-prod

# Verify function version (should increment)
aws lambda get-function --function-name dfj-docshare-prod --query 'Configuration.Version' --output text
```

### 3.3 Test Lambda Health Endpoints
```bash
# Test /ping
aws lambda invoke --function-name dfj-docshare-prod \
  --payload '{"rawPath": "/ping", "requestContext": {"http": {"method": "GET"}}}' \
  /tmp/ping-response.json
cat /tmp/ping-response.json  # Expected: {"statusCode": 200, "body": "{\"ok\": true}"}

# Test /sf-oauth-check
aws lambda invoke --function-name dfj-docshare-prod \
  --payload '{"rawPath": "/sf-oauth-check", "requestContext": {"http": {"method": "GET"}}}' \
  /tmp/sf-check-response.json
cat /tmp/sf-check-response.json  # Expected: {"statusCode": 200, "body": "{\"ok\": true, \"instanceUrl\": \"https://dfj.my.salesforce.com\"}"}

# Test /diag/net
aws lambda invoke --function-name dfj-docshare-prod \
  --payload '{"rawPath": "/diag/net", "requestContext": {"http": {"method": "GET"}}}' \
  /tmp/diag-response.json
cat /tmp/diag-response.json  # Expected: {"statusCode": 200, "body": "{\"ok\": true, \"https_to_salesforce\": true}"}
```

### 3.4 Smoke Test Identifier Endpoints (Lambda Only)
```bash
# Create test payload for /identifier/request-otp
echo '{
  "rawPath": "/identifier/request-otp",
  "requestContext": {"http": {"method": "POST"}},
  "body": "{\"phone\": \"+4512345678\", \"country\": \"DK\", \"market\": \"DFJ_DK\"}"
}' > /tmp/test-request-otp.json

aws lambda invoke --function-name dfj-docshare-prod --payload fileb:///tmp/test-request-otp.json /tmp/otp-response.json
cat /tmp/otp-response.json  # Expected: {"statusCode": 200, "body": "{\"ok\": true}"}

# Verify OTP__c created in Salesforce
sf data query -o prod -q "SELECT Id, Code__c, Status__c FROM OTP__c WHERE Identifier_Value__c = '+4512345678' ORDER BY CreatedDate DESC LIMIT 1" -t
```

---

## 4. API Gateway Updates

### 4.1 Create /identifier/* Routes (If Not Exist)
```bash
# Get API ID
API_ID=$(aws apigatewayv2 get-apis --query 'Items[?Name==`dfj-docshare-api`].ApiId' --output text)

# Get Lambda integration ID
INTEGRATION_ID=$(aws apigatewayv2 get-integrations --api-id $API_ID --query 'Items[?IntegrationUri contains `dfj-docshare-prod`].IntegrationId' --output text)

# Create routes
aws apigatewayv2 create-route --api-id $API_ID --route-key 'POST /identifier/request-otp' --target integrations/$INTEGRATION_ID
aws apigatewayv2 create-route --api-id $API_ID --route-key 'POST /identifier/verify-otp' --target integrations/$INTEGRATION_ID
aws apigatewayv2 create-route --api-id $API_ID --route-key 'POST /identifier/list' --target integrations/$INTEGRATION_ID
aws apigatewayv2 create-route --api-id $API_ID --route-key 'POST /identifier/doc-url' --target integrations/$INTEGRATION_ID
aws apigatewayv2 create-route --api-id $API_ID --route-key 'POST /identifier/approve' --target integrations/$INTEGRATION_ID
aws apigatewayv2 create-route --api-id $API_ID --route-key 'POST /identifier/search' --target integrations/$INTEGRATION_ID
```

### 4.2 Update CORS Configuration
```bash
# Ensure Authorization header is allowed
aws apigatewayv2 update-integration --api-id $API_ID --integration-id $INTEGRATION_ID \
  --integration-type AWS_PROXY \
  --payload-format-version 2.0

# Update CORS (if needed)
aws apigatewayv2 update-api --api-id $API_ID \
  --cors-configuration AllowOrigins='https://dok.dinfamiliejurist.dk,https://dok.dinfamiljejurist.se,https://docs.hereslaw.ie,http://localhost:*',AllowHeaders='Content-Type,Authorization',AllowMethods='GET,POST,OPTIONS'
```

### 4.3 Deploy API Gateway Stage
```bash
# Deploy to production stage
aws apigatewayv2 create-deployment --api-id $API_ID --stage-name prod --description "Identifier auth release $(date +%Y-%m-%d)"

# Verify deployment
aws apigatewayv2 get-stage --api-id $API_ID --stage-name prod --query 'LastDeploymentStatusMessage' --output text
```

### 4.4 Test API Gateway Endpoints (End-to-End)
```bash
# Get API endpoint
API_ENDPOINT=$(aws apigatewayv2 get-api --api-id $API_ID --query 'ApiEndpoint' --output text)

# Test /identifier/request-otp via API Gateway
curl -X POST ${API_ENDPOINT}/identifier/request-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+4587654321", "country": "DK", "market": "DFJ_DK"}' \
  -v  # Expected: HTTP 200, {"ok": true}

# Verify OTP__c created
sf data query -o prod -q "SELECT Id, Code__c FROM OTP__c WHERE Identifier_Value__c = '+4587654321' ORDER BY CreatedDate DESC LIMIT 1" -t
```

---

## 5. SPA Deployment

### 5.1 Upload New SPA Assets to S3
```bash
# Sync new files from WIP directory
aws s3 sync "./vscode attempt/" s3://dfj-spa-bucket/ \
  --exclude "*.md" \
  --exclude "*.py" \
  --exclude "lambda_env_variables" \
  --exclude ".git/*" \
  --include "*.js" \
  --include "*.css" \
  --include "*.html" \
  --include "*.png" \
  --include "*.jpg" \
  --cache-control "public, max-age=3600" \
  --metadata-directive REPLACE
```

### 5.2 Invalidate CloudFront Cache
```bash
# Get CloudFront distribution ID
DIST_ID=$(aws cloudfront list-distributions --query 'DistributionList.Items[?Origins.Items[0].DomainName contains `dfj-spa-bucket`].Id' --output text)

# Create invalidation for all SPA assets
aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"

# Wait for invalidation to complete (can take 5-10 minutes)
aws cloudfront wait invalidation-completed --distribution-id $DIST_ID --id $(aws cloudfront list-invalidations --distribution-id $DIST_ID --query 'InvalidationList.Items[0].Id' --output text)
```

### 5.3 Verify SPA Files Served Correctly
```bash
# Check app.js version (look for MODE variable = identifier vs journal)
curl -s https://dok.dinfamiliejurist.dk/app.js | grep -o 'const MODE.*' | head -n 1
# Expected: const MODE = (externalId && accessToken) ? 'journal' : 'identifier';

# Check styles.css has identifier UI styles
curl -s https://dok.dinfamiliejurist.dk/styles.css | grep -c '.id-chooser'
# Expected: > 0

# Check index.html has identifier HTML structure
curl -s https://dok.dinfamiliejurist.dk/index.html | grep -c 'id="idStep"'
# Expected: 1
```

---

## 6. Post-Deployment Validation

### 6.1 Regression Test: Journal Mode (Existing Links)
```bash
# Use a test journal link (non-prod if available)
TEST_LINK="https://dok.dinfamiliejurist.dk/?e=TEST_EXTERNAL_ID&t=TEST_ACCESS_TOKEN"

# Open in browser (manual test)
# Expected:
# 1. OTP input field appears (no identifier chooser)
# 2. Enter OTP code (request via /otp-send if needed)
# 3. Documents load
# 4. Chat is visible and functional
# 5. Approve document → Status changes to "Approved"
# 6. Download/Print buttons work
```

### 6.2 New Feature Test: Identifier Mode (Phone - DK)
```bash
# Open clean URL (no ?e= or ?t=)
# Expected:
# 1. Phone/Email chooser appears
# 2. Select "Phone"
# 3. Country picker shows Denmark (+45)
# 4. Enter phone: 12345678
# 5. Click "Send code" → Backend creates OTP__c
# 6. Verify step appears with "Vi har sendt en kode til telefon +4512345678"
# 7. Enter OTP code
# 8. Documents load (if phone matches journals)
# 9. Chat is HIDDEN (not applicable in identifier mode)
# 10. Approve document → Status changes
# 11. Download/Print work (header + completion modal)
```

### 6.3 New Feature Test: Identifier Mode (Email)
```bash
# Open clean URL
# Expected:
# 1. Select "E-mail"
# 2. Enter email: test@example.com
# 3. Click "Send code" → OTP__c created
# 4. Verify step shows "Vi har sendt en kode til e-mail test@example.com"
# 5. Enter OTP → Documents load (if email matches)
# 6. Approve/Download/Print work as expected
```

### 6.4 Edge Case Tests
```bash
# Test 1: Invalid phone (no digits)
# Enter: abc → Expected: Error (no digits)

# Test 2: Invalid email (no @ or .)
# Enter: not-an-email → Expected: Error

# Test 3: Expired OTP (wait >5 min after request)
# Enter code after expiry → Expected: "Code expired"

# Test 4: Wrong OTP code
# Enter incorrect 6-digit code → Expected: "Invalid code"

# Test 5: No documents for identifier
# Use phone/email with no journal matches → Expected: Empty list with "No documents" message

# Test 6: Session timeout (wait >15 min after login)
# Try to view document → Expected: 401 Unauthorized, redirect to login

# Test 7: "Start Over" button
# On verify step, click "Start Over" → Expected: Returns to phone/email chooser, inputs cleared
```

### 6.5 Performance Validation
```bash
# Test OTP request latency
time curl -X POST ${API_ENDPOINT}/identifier/request-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+4512345678", "country": "DK"}'
# Target: <500ms

# Test identifier list latency (with valid session)
time curl -X POST ${API_ENDPOINT}/identifier/list \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {VALID_SESSION_TOKEN}" \
  -d '{"phone": "+4512345678"}'
# Target: <800ms (includes Salesforce SOQL)
```

---

## 7. Monitoring & Alerts

### 7.1 CloudWatch Metrics to Track
```bash
# Lambda invocation metrics
aws cloudwatch put-metric-alarm --alarm-name dfj-lambda-errors-high \
  --alarm-description "Lambda error rate >5% over 5 min" \
  --metric-name Errors --namespace AWS/Lambda --statistic Sum \
  --period 300 --threshold 5 --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --dimensions Name=FunctionName,Value=dfj-docshare-prod

# Lambda duration (latency)
aws cloudwatch put-metric-alarm --alarm-name dfj-lambda-duration-high \
  --alarm-description "Lambda p99 duration >3000ms" \
  --metric-name Duration --namespace AWS/Lambda --statistic p99 \
  --period 300 --threshold 3000 --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --dimensions Name=FunctionName,Value=dfj-docshare-prod
```

### 7.2 Custom Application Metrics
**Emit from Lambda code** (via CloudWatch Logs Insights or custom metric namespace):
- `OTP_Requested` (count by `identifier_type`, `brand`)
- `OTP_Verified` (count, success rate %)
- `Session_Created` (count)
- `Session_Expired` (count)
- `Identifier_Login_Success` (count)
- `Journal_Login_Success` (count)
- `Mode_Split` (gauge: % identifier vs % journal)

### 7.3 Salesforce Monitoring
```bash
# Monitor OTP__c growth
sf data query -o prod -q "SELECT COUNT() FROM OTP__c WHERE CreatedDate = TODAY" -t
# Alert if >10,000 in 24 hours (potential abuse)

# Monitor Shared_Document__c approval rate
sf data query -o prod -q "SELECT COUNT() FROM Shared_Document__c WHERE Status__c = 'Approved' AND LastModifiedDate = TODAY" -t
# Compare to historical baseline
```

### 7.4 Log Analysis Queries (CloudWatch Logs Insights)
```sql
-- OTP success rate (last 1 hour)
fields @timestamp, identifier_type, status
| filter @message like /OTP_VERIFY/
| stats count() as total, sum(status == 'verified') as success by identifier_type
| eval success_rate = 100 * success / total

-- Session token errors (last 1 hour)
fields @timestamp, error
| filter @message like /Session expired/ or @message like /Invalid session/
| stats count() as error_count by error

-- Identifier mode adoption (last 24 hours)
fields @timestamp, mode
| filter @message like /Mode=/
| stats count() as logins by mode
| eval mode_pct = 100 * logins / sum(logins)
```

---

## 8. Rollback Procedures

### 8.1 Immediate Rollback (If Critical Issues)
**Trigger**: Error rate >10% OR session token failures >50% OR Salesforce OAuth errors

```bash
# Step 1: Rollback Lambda code (takes ~30 seconds)
PREV_VERSION=$(aws lambda list-versions-by-function --function-name dfj-docshare-prod --query 'Versions[-2].Version' --output text)
aws lambda update-function-configuration --function-name dfj-docshare-prod --environment Variables="$(cat lambda-env-prod-backup-$(date +%Y%m%d).json)"
aws lambda publish-version --function-name dfj-docshare-prod --code-sha-256 "$(aws lambda get-function --function-name dfj-docshare-prod:$PREV_VERSION --query 'Configuration.CodeSha256' --output text)"

# Step 2: Rollback SPA assets (takes ~5 minutes)
aws s3 sync ./spa-backup-$(date +%Y%m%d)/ s3://dfj-spa-bucket/ --delete
aws cloudfront create-invalidation --distribution-id $DIST_ID --paths "/*"

# Step 3: Remove /identifier/* routes from API Gateway (optional, prevents new identifier logins)
for route in request-otp verify-otp list doc-url approve search; do
  ROUTE_ID=$(aws apigatewayv2 get-routes --api-id $API_ID --query "Items[?RouteKey=='POST /identifier/$route'].RouteId" --output text)
  aws apigatewayv2 delete-route --api-id $API_ID --route-id $ROUTE_ID
done
aws apigatewayv2 create-deployment --api-id $API_ID --stage-name prod --description "Rollback identifier routes"

# Step 4: Verify journal mode still works
curl -X POST ${API_ENDPOINT}/otp-send -H "Content-Type: application/json" -d '{"externalId": "TEST"}' -v
# Expected: HTTP 200
```

### 8.2 Partial Rollback (Disable Identifier Mode Only)
**Trigger**: Identifier mode issues, but journal mode works fine

```bash
# Option A: Set feature flag to disable identifier in SPA (requires SPA code support)
# Update brand.js or app.js to check ?feature=identifier (not implemented in current code)

# Option B: Remove identifier routes from API Gateway (prevents new logins, existing sessions continue)
# (Same as Step 3 in immediate rollback above)

# Option C: Set DEBUG_ALLOW_IDENTIFIER_DOCURL=false (already should be false in prod)
# This only affects doc-url bypass; doesn't disable mode
```

### 8.3 Salesforce Rollback (Rarely Needed)
**Trigger**: OTP__c causing org performance issues

```bash
# Delete all OTP__c records (if safe to do so)
sf data delete bulk --sobject OTP__c --file all-otp-ids.csv --target-org prod --wait 10

# Or schedule deletion of old records (retention policy)
sf apex run --target-org prod <<'EOF'
DELETE [SELECT Id FROM OTP__c WHERE CreatedDate < LAST_N_DAYS:7];
EOF
```

### 8.4 Post-Rollback Validation
```bash
# Test journal login still works
# Open https://dok.dinfamiliejurist.dk/?e={EXTERNAL_ID}&t={ACCESS_TOKEN}
# Expected: OTP input appears, documents load after OTP verify

# Verify error rate drops below threshold
aws cloudwatch get-metric-statistics --namespace AWS/Lambda --metric-name Errors \
  --dimensions Name=FunctionName,Value=dfj-docshare-prod \
  --start-time $(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%S) --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 --statistics Sum
```

---

## 9. Success Criteria

### 9.1 Deployment Success
- [  ] All Salesforce metadata deployed (OTP__c, Account fields, Shared_Document__c fields)
- [ ] Lambda code deployed with correct environment variables
- [ ] API Gateway routes active and CORS configured
- [ ] SPA assets served from CloudFront with correct versions
- [ ] `/ping`, `/sf-oauth-check`, `/diag/net` all return 200 OK

### 9.2 Functional Success
- [ ] Journal mode regression tests pass (100%)
- [ ] Identifier mode tests pass for all markets (DK/SE/IE)
- [ ] OTP request/verify flow works end-to-end
- [ ] Session tokens validated correctly
- [ ] Document list/view/approve work in both modes

### 9.3 Performance Success
- [ ] Lambda p99 latency <3000ms
- [ ] OTP request latency <500ms
- [ ] Identifier list latency <800ms
- [ ] Error rate <1% over 1 hour

### 9.4 Business Success (Week 1)
- [ ] Identifier mode adoption >10% of total logins
- [ ] OTP success rate >90%
- [ ] Zero critical bugs reported
- [ ] Customer satisfaction score unchanged or improved

---

## 10. Communication Plan

### 10.1 Internal Communication
**Audience**: Engineering, Ops, Support teams

**Timeline**:
- **T-7 days**: Deployment plan review meeting
- **T-3 days**: Pre-deployment checklist sign-off email
- **T-1 day**: Final go/no-go decision meeting
- **T-0 (deploy day)**: Real-time Slack channel for monitoring
- **T+1 hour**: Initial status update
- **T+24 hours**: Post-deploy summary email

### 10.2 External Communication
**Audience**: Customers (optional, no breaking changes for existing users)

**Timeline**:
- **T-3 days**: Optional announcement: "New login method coming soon"
- **T+1 week**: Blog post: "Introducing phone/email login for faster access"

### 10.3 Support Team Briefing
**Key Points**:
- "Journal links still work (no change for existing customers)"
- "New users can log in with phone or email (no link required)"
- "OTP codes expire after 5 minutes; click 'Send code' again if needed"
- "Chat only available for journal links (by design)"
- "Session expires after 15 minutes (user must re-login)"

**FAQs to Prepare**:
1. Q: "I didn't receive the OTP code"  
   A: Check spam folder, wait 1 minute, click "Send code" again
2. Q: "My session expired, why?"  
   A: Sessions last 15 minutes for security; please log in again
3. Q: "Why can't I see chat?"  
   A: Chat is only available via journal links (not identifier login)

---

## 11. Deployment Timeline (Example)

| Time | Activity | Owner | Duration |
|------|----------|-------|----------|
| 09:00 | Go/no-go decision meeting | Eng Lead | 15 min |
| 09:15 | Backup production state | Ops | 15 min |
| 09:30 | Deploy Salesforce metadata (OTP__c, fields) | Eng | 30 min |
| 10:00 | Validate Salesforce deploy | Eng | 15 min |
| 10:15 | Update Lambda env vars | Ops | 10 min |
| 10:25 | Deploy Lambda code | Ops | 10 min |
| 10:35 | Test Lambda health endpoints | Eng | 10 min |
| 10:45 | Create API Gateway routes | Ops | 15 min |
| 11:00 | Test API Gateway end-to-end | Eng | 15 min |
| 11:15 | Upload SPA assets to S3 | Ops | 10 min |
| 11:25 | Invalidate CloudFront cache | Ops | 5 min |
| 11:30 | **WAIT** for CDN invalidation | Ops | 10 min |
| 11:40 | Regression test journal mode | QA | 15 min |
| 11:55 | Test identifier mode (DK/SE/IE) | QA | 20 min |
| 12:15 | Monitor logs & metrics | Ops | 30 min |
| 12:45 | **DEPLOY COMPLETE** | All | – |
| 13:00 | Post-deploy summary email | Eng Lead | 15 min |

**Total Duration**: ~4 hours (including buffer)

---

## 12. Contacts & Escalation

| Role | Name | Email | Phone | Slack |
|------|------|-------|-------|-------|
| Engineering Lead | {NAME} | {EMAIL} | {PHONE} | @eng-lead |
| DevOps Lead | {NAME} | {EMAIL} | {PHONE} | @ops-lead |
| Salesforce Admin | {NAME} | {EMAIL} | {PHONE} | @sf-admin |
| Product Owner | {NAME} | {EMAIL} | {PHONE} | @product |
| On-Call Engineer | {NAME} | {EMAIL} | {PHONE} | @oncall |

**Escalation Path**:
1. Issue detected → Alert in #deploy-dfj-docshare Slack channel
2. If error rate >5% for >5 minutes → Ping @oncall
3. If error rate >10% OR OAuth failures → **ROLLBACK IMMEDIATELY** (Ops Lead decision)
4. If Salesforce org issues → Contact Salesforce Admin + open Salesforce support case (P1)

---

## 13. Post-Deployment Tasks

### 13.1 Week 1
- [ ] Monitor OTP__c growth daily (alert if >10K/day)
- [ ] Review CloudWatch logs for errors (daily digest)
- [ ] Track identifier mode adoption % (daily report)
- [ ] Collect user feedback from support tickets

### 13.2 Week 2-4
- [ ] Optimize SOQL queries if latency >1s (add indexes if needed)
- [ ] Rotate `SESSION_HMAC_SECRET` (planned for +90 days, but test rotation procedure now)
- [ ] Implement OTP__c retention policy (delete records >7 days old)
- [ ] Add CAPTCHA to OTP request if bot traffic detected

### 13.3 Month 1
- [ ] Review metrics: OTP success rate, session token errors, mode split
- [ ] Conduct retrospective meeting (what went well, what to improve)
- [ ] Update documentation based on learnings
- [ ] Plan next feature release (if applicable)

---

**END OF DEPLOYMENT PLAN**

---

**Sign-Off**:
- [ ] Engineering Lead: __________________ Date: ________
- [ ] Product Owner: __________________ Date: ________
- [ ] DevOps Lead: __________________ Date: ________
