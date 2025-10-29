# Production AI Chatbot Deployment Guide

## Overview
This guide covers deploying the AI-powered document Q&A chatbot to your **production** environment.

**Modified Files:**
- ✅ `lambda.py` - Added AI endpoint and helper functions (~450 new lines)
- ✅ `app.js` - Modified sendChat() for AI mode (~120 new lines)

**AWS Resources Required:**
- API Gateway route: POST /identifier/chat/ask
- DynamoDB table: dfj-pdf-text-cache (production)
- Lambda Layer: PyMuPDF v4
- IAM permissions: Bedrock + DynamoDB
- Environment variables: 4 new variables

---

## Deployment Steps (Execute in Order)

### Step 1: Create Production DynamoDB Table

**Table Name:** `dfj-pdf-text-cache` (production - do NOT use -test suffix)

**AWS Console Steps:**
1. Open AWS Console → DynamoDB → Tables → Create table
2. **Table details:**
   - Table name: `dfj-pdf-text-cache`
   - Partition key: `s3_key` (String)
   - No sort key needed
3. **Settings:**
   - Capacity mode: On-demand
   - Encryption: AWS owned key (default)
4. **Tags:**
   - Environment = production
   - Project = docshare
   - Purpose = pdf-text-cache
5. Click **Create table**
6. Wait for table status: ACTIVE (~1 minute)
7. **Enable TTL:**
   - Click table → Actions → Edit TTL settings
   - TTL attribute: `ttl`
   - Enable TTL → Save

**Verification:**
```bash
# Check table exists
aws dynamodb describe-table --table-name dfj-pdf-text-cache --region eu-north-1
```

**Expected output:** Status: ACTIVE, TimeToLiveDescription: ENABLED

---

### Step 2: Add API Gateway Route

You already have the HTTP API: **dfj-doc-presigner-test** (API ID: ysu7eo2haj)

**AWS Console Steps:**
1. Open AWS Console → API Gateway → APIs → dfj-doc-presigner-test
2. Click **Routes** in left sidebar
3. Click **Create** button
4. **Route settings:**
   - Method: `POST`
   - Path: `/identifier/chat/ask`
   - Click **Create**
5. Click the new route `/identifier/chat/ask` → **Attach integration**
6. **Integration settings:**
   - Integration type: Lambda function
   - Integration target: `dfj-doc-presigner` (your production Lambda)
   - Payload format version: 2.0 (default for HTTP API)
   - Click **Create**

**CORS Verification:**
Your existing CORS configuration already allows identifier routes:
- Access-Control-Allow-Origin: * (all origins allowed)
- Access-Control-Allow-Methods: GET, POST, OPTIONS
- Access-Control-Allow-Headers: content-type, authorization

No additional CORS changes needed.

**Verification:**
```bash
# Test route exists (should return 401 without auth)
curl -X POST https://ysu7eo2haj.execute-api.eu-north-1.amazonaws.com/prod/identifier/chat/ask
```

**Expected output:** 401 Unauthorized (normal - needs Bearer token)

---

### Step 3: Attach PyMuPDF Layer to Production Lambda

**Layer ARN:** `arn:aws:lambda:eu-north-1:641409597080:layer:pymupdf-layer:4`

**AWS Console Steps:**
1. Open AWS Console → Lambda → Functions → **dfj-doc-presigner**
2. Scroll down to **Layers** section
3. Click **Add a layer**
4. **Layer configuration:**
   - Layer source: Specify an ARN
   - Layer ARN: `arn:aws:lambda:eu-north-1:641409597080:layer:pymupdf-layer:4`
   - Click **Verify** → Should show "pymupdf-layer version 4"
5. Click **Add**

**Verification:**
Check that Layers section shows: `pymupdf-layer:4`

---

### Step 4: Configure Lambda Environment Variables

**AWS Console Steps:**
1. AWS Console → Lambda → Functions → **dfj-doc-presigner**
2. Click **Configuration** tab → **Environment variables**
3. Click **Edit** → Add 4 new variables:

| Key | Value | Purpose |
|-----|-------|---------|
| `AI_ENABLED` | `true` | Enable AI chatbot (set to "false" to disable) |
| `DYNAMODB_TEXT_CACHE_TABLE` | `dfj-pdf-text-cache` | Production cache table |
| `BEDROCK_MODEL_ID` | `us.anthropic.claude-3-5-haiku-20241022-v1:0` | Claude 3.5 Haiku model |
| `BEDROCK_REGION` | `us-east-1` | Bedrock region (not available in eu-north-1) |

4. Click **Save**

**Verification:**
Click **Configuration** → Environment variables should show all 4 new variables.

---

### Step 5: Update Lambda IAM Permissions

**Required Permissions:**
- ✅ S3 read access (already exists - verify includes dfj-docs-prod)
- ➕ DynamoDB: Read/write to dfj-pdf-text-cache
- ➕ Bedrock: Invoke Claude model

**AWS Console Steps:**
1. AWS Console → Lambda → Functions → **dfj-doc-presigner**
2. Click **Configuration** tab → **Permissions**
3. Click the **Role name** (opens IAM Console)
4. Click **Add permissions** → **Create inline policy**
5. Switch to **JSON** tab
6. Paste this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockInvoke",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": [
        "arn:aws:bedrock:us-east-1::foundation-model/*"
      ]
    },
    {
      "Sid": "DynamoDBCacheAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:eu-north-1:641409597080:table/dfj-pdf-text-cache"
      ]
    }
  ]
}
```

7. Click **Review policy**
8. **Policy name:** `dfj-ai-chatbot-permissions`
9. Click **Create policy**

**Verification:**
Role should now have 3+ policies:
- AWSLambdaBasicExecutionRole (CloudWatch logs)
- Existing S3/Salesforce policies
- dfj-ai-chatbot-permissions (NEW)

---

### Step 6: Deploy Lambda Code

**Option A: AWS Console Editor (Recommended for small changes)**
1. AWS Console → Lambda → Functions → **dfj-doc-presigner**
2. Click **Code** tab
3. Replace entire `lambda_function.py` content with your modified `lambda.py`
4. Click **Deploy** button (wait for "Changes deployed" message)
5. Scroll down → Click **Test** tab
6. Create test event with `/ping` route:
```json
{
  "requestContext": {
    "http": {
      "method": "GET",
      "path": "/ping"
    }
  },
  "rawPath": "/ping"
}
```
7. Click **Test** → Should return 200 with "pong"

**Option B: ZIP Upload (Better for larger files)**
```bash
# Create deployment package
cd "c:\Users\Mathias\Downloads\docshare-16-10-2025-fixed"
Compress-Archive -Path lambda.py -DestinationPath lambda-deployment.zip -Force

# Upload via AWS CLI
aws lambda update-function-code `
  --function-name dfj-doc-presigner `
  --zip-file fileb://lambda-deployment.zip `
  --region eu-north-1
```

**Verification:**
- Last modified timestamp updated
- Test /ping endpoint returns 200
- Check CloudWatch logs for startup errors

---

### Step 7: Deploy SPA Files

**Files to Deploy:**
- ✅ `app.js` (modified with AI chat)
- (index.html, styles.css, texts.js, brand.js - no changes)

**AWS Console Steps:**
1. Find your S3 bucket (likely named like `dfj-docshare` or similar)
2. Navigate to the folder containing your SPA files
3. Upload `app.js`:
   - Click **Upload** → Add files
   - Select your modified `app.js`
   - Click **Upload**
4. **If you use CloudFront:**
   - Go to CloudFront → Distributions
   - Find your distribution
   - Create invalidation for `/app.js`

**Verification:**
```bash
# Download deployed app.js and check for AI endpoint
curl https://your-s3-bucket.s3.amazonaws.com/app.js | grep "ID_CHAT_ASK"
```

**Expected output:** Should see the line defining `ID_CHAT_ASK`

---

### Step 8: Test Live AI Chatbot

**Test Scenario 1: Basic AI Q&A**
1. Open your SPA: https://your-domain.com
2. Login with identifier credentials
3. Enter a journalId that has documents
4. Click a document to view it
5. Open browser console (F12)
6. Type a question in the chat: "Hvad er dette dokument om?" (Danish)
7. Send message

**Expected Behavior:**
- Message appears in chat immediately
- AI response appears with 🤖 prefix
- Response should be relevant to document content
- First query: 5-10 seconds
- Browser console shows POST to /identifier/chat/ask

**Test Scenario 2: Cache Hit**
1. Ask the same question again
2. Response should be faster (< 2 seconds)
3. Response should include "(from cache)" text

**Test Scenario 3: Error Handling**
1. Switch to journal mode (no document active)
2. Type a message → Should use standard chat (no AI)
3. Switch back to identifier mode with invalid journalId
4. Try chatting → Should show error message

**Browser Console Debugging:**
```javascript
// Check AI mode detection
console.log('MODE:', MODE);  // Should be 'identifier'
console.log('Active doc:', active);  // Should be >= 0
console.log('AI enabled:', MODE === 'identifier' && active >= 0);

// Check endpoint
console.log('AI endpoint:', ID_CHAT_ASK);  // Should be defined
```

---

## Monitoring & Troubleshooting

### CloudWatch Logs
Monitor 3 log groups:
1. `/aws/lambda/dfj-doc-presigner` - Lambda execution logs
2. DynamoDB console → dfj-pdf-text-cache → Metrics
3. Bedrock console → Usage metrics (us-east-1 region)

### Common Issues

**Issue 1: "AI_ENABLED is not defined" error**
- Fix: Step 4 not completed - add environment variables

**Issue 2: "Cannot import name 'fitz'" error**
- Fix: Step 3 not completed - attach PyMuPDF layer

**Issue 3: "AccessDeniedException" from Bedrock**
- Fix: Step 5 not completed - add IAM permissions
- Check: Ensure Bedrock model access approved (should be already)

**Issue 4: Route not found (404)**
- Fix: Step 2 not completed - add API Gateway route
- Verify: Route is `/identifier/chat/ask` (not `/identifier/chat-ask`)

**Issue 5: CORS error in browser**
- Fix: Verify API Gateway CORS settings
- Check: OPTIONS requests return 200 with correct headers

**Issue 6: DynamoDB throttling**
- Cause: High traffic hitting cache misses
- Fix: Table is on-demand, should auto-scale
- Check: DynamoDB console → Metrics → Throttled requests

**Issue 7: Slow AI responses (> 15 seconds)**
- Cause: Large PDF documents (> 50 pages)
- Fix: Expected - first extraction can be slow
- Mitigation: Cache hit on subsequent queries

**Issue 8: AI answers in wrong language**
- Cause: Language detection based on brand (DK/SE/IE)
- Fix: Verify correct brand passed from frontend
- Override: Modify system prompt in ask_ai_about_document()

### Cost Monitoring

**Expected Costs (per 1000 queries):**
- Bedrock Claude 3.5 Haiku: ~$0.25 (input) + ~$0.50 (output) = $0.75
- DynamoDB: ~$0.25 (read) + ~$0.25 (write) = $0.50
- Lambda: ~$0.20 (execution time)
- S3: Negligible (GET requests only)
- **Total: ~$1.50 per 1000 queries**

**With caching (50% cache hit rate):**
- Bedrock: $0.75 → $0.38 (50% reduction)
- DynamoDB: $0.50 (same - still check cache)
- Lambda: $0.20 → $0.15 (faster execution)
- **Total: ~$1.03 per 1000 queries (~32% savings)**

**Set up billing alerts:**
1. AWS Console → Billing → Budgets
2. Create budget for Bedrock (us-east-1)
3. Alert threshold: $10/month (moderate usage)

---

## Rollback Plan

If issues arise, you can disable AI without redeploying:

**Quick Disable (No Code Changes):**
1. AWS Console → Lambda → dfj-doc-presigner
2. Configuration → Environment variables → Edit
3. Change `AI_ENABLED` from `true` to `false`
4. Save

This disables AI endpoint without affecting existing functionality.

**Full Rollback:**
1. API Gateway → Routes → Delete `/identifier/chat/ask`
2. Lambda → Previous versions → Restore previous code
3. S3 → Upload previous app.js version
4. DynamoDB → Delete dfj-pdf-text-cache table (optional)
5. IAM → Remove dfj-ai-chatbot-permissions policy

---

## Success Criteria

✅ **Deployment Complete When:**
- [ ] DynamoDB table `dfj-pdf-text-cache` exists and active
- [ ] API Gateway route `/identifier/chat/ask` returns 401 (not 404)
- [ ] Lambda has PyMuPDF layer attached
- [ ] Lambda has 4 AI environment variables set
- [ ] Lambda IAM role has Bedrock + DynamoDB permissions
- [ ] Lambda code deployed (version timestamp updated)
- [ ] SPA app.js uploaded with AI chat code
- [ ] Test query returns AI response with 🤖 prefix
- [ ] Second query shows "(from cache)" text
- [ ] CloudWatch logs show successful AI queries

**Estimated Total Deployment Time:** 30-45 minutes

---

## Next Steps After Deployment

1. **Monitor for 24 hours:**
   - Check CloudWatch errors
   - Verify cache hit rate (should be > 30%)
   - Monitor Bedrock costs

2. **User training:**
   - Document AI feature in user guide
   - Example questions users can ask
   - Explain cache behavior

3. **Phase 3 enhancements** (future):
   - Add "Ask AI" button in UI
   - Show loading spinner during AI query
   - Display document context used for answer
   - Add feedback buttons (👍/👎) for answer quality
   - Multi-document queries

4. **Optimization:**
   - Monitor PDF extraction time (consider caching extracted text longer)
   - Tune Bedrock model parameters (temperature, max_tokens)
   - Add request rate limiting if costs spike

---

## Support

If you encounter issues during deployment:

1. **Check CloudWatch logs** for specific error messages
2. **Verify each step** was completed in order
3. **Test individual components:**
   - DynamoDB: Try manual PutItem/GetItem
   - Bedrock: Use AWS CLI `invoke-model` command
   - Lambda: Test with /ping endpoint first
   - API Gateway: Test with curl before browser

4. **Review test environment:**
   - dfj-docs-test Lambda is working reference
   - Compare IAM permissions between test and prod
   - Compare environment variables

**Test Environment Reference:**
- Lambda: dfj-docs-test (fully working AI)
- DynamoDB: dfj-pdf-text-cache-test
- Tested with: 13-page testament, Danish language
- Performance: 4s extraction, 7s AI response, < 1s cached

Good luck with deployment! 🚀
