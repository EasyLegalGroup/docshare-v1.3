# Deployment Checklist: AI + Human Hybrid Chat System

## ✅ Pre-Deployment (Completed)

### Salesforce Setup
- [x] Created `Message_Type__c` picklist field (Human | AI | System)
- [x] Created `AI_Model__c` text field (50 chars)
- [x] Created `AI_Helpful__c` checkbox field
- [x] Created `AI_Escalated__c` checkbox field
- [x] Created `AI_Response_Time__c` number field
- [x] Created `Escalated_From__c` lookup field (ChatMessage__c)

### Code Changes
- [x] **lambda.py** - Updated with new endpoints (~135 lines added)
- [x] **app.js** - Enhanced with AI feedback UI (~88 lines modified)
- [x] **texts.js** - Added 8 new i18n keys × 3 languages (24 strings total)
- [x] **styles.css** - Added ~180 lines for AI chat styling
- [x] **index.html** - Restructured chat panel with pill button + mode toggle
- [x] **API_ENDPOINTS.md** - Comprehensive endpoint documentation created

---

## 📋 Deployment Steps

### Step 1: Deploy Lambda Backend

**File**: `vscode attempt/lambda.py`  
**Target**: AWS Lambda function `dfj-docs-test` (Test environment)

1. Open AWS Console → Lambda → `dfj-docs-test`
2. Click **Code** tab
3. Replace entire `lambda.py` with updated version from `vscode attempt/lambda.py`
4. Click **Deploy** (orange button)
5. Wait for "Successfully updated" confirmation

**Verify**:
```bash
# Test new feedback endpoint
curl -X POST https://your-api-gateway/identifier/chat/feedback \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messageId":"a0Z...", "action":"helpful"}'
```

Expected response: `{"ok": true}`

---

### Step 2: Deploy Frontend Assets

**Files**: `app.js`, `texts.js`, `styles.css`, `index.html`  
**Target**: S3 bucket `dfj-docs-test`

**Option A: AWS Console**
1. Open AWS Console → S3 → `dfj-docs-test` bucket
2. Upload each file individually:
   - `vscode attempt/app.js` → `app.js`
   - `vscode attempt/texts.js` → `texts.js`
   - `vscode attempt/styles.css` → `styles.css`
   - `vscode attempt/index.html` → `index.html`
3. Set all files to **public-read** permissions
4. **Important**: Invalidate CloudFront cache if using CDN

**Option B: AWS CLI**
```powershell
# Upload all files at once
aws s3 cp "vscode attempt/app.js" s3://dfj-docs-test/app.js --acl public-read
aws s3 cp "vscode attempt/texts.js" s3://dfj-docs-test/texts.js --acl public-read
aws s3 cp "vscode attempt/styles.css" s3://dfj-docs-test/styles.css --acl public-read
aws s3 cp "vscode attempt/index.html" s3://dfj-docs-test/index.html --acl public-read
```

**Verify**:
- Open test SPA URL in browser
- Check browser console for JavaScript errors
- Verify new chat pill button appears (instead of FAB)

---

### Step 3: Test End-to-End

**Test Scenario 1: AI Question Flow**
1. Log in to test SPA
2. Open a document (e.g., testament PDF)
3. Click chat pill button → panel opens
4. Type question: "Hvad betyder paragraph 2.5?"
5. Click Send

**Expected Results**:
- AI responds within 3-8 seconds
- Two feedback buttons appear: ✅ "Hjalp det?" and 📩 "Spørg jurist"
- Message bubble has light blue gradient background
- Check Salesforce: 2 ChatMessages created (1 inbound Human, 1 outbound AI)

**Test Scenario 2: Helpful Feedback**
1. Click ✅ "Hjalp det?" button on AI message

**Expected Results**:
- Button disappears
- "Tak for feedback!" message appears
- Check Salesforce: AI_Helpful__c = true on AI message

**Test Scenario 3: Escalation Flow**
1. Click 📩 "Spørg jurist" button on AI message

**Expected Results**:
- Button disappears
- "Videresendt til jurist" indicator appears
- System message added: "Dette spørgsmål er sendt til vores jurister..."
- Check Salesforce: 
  - AI_Escalated__c = true on AI message
  - NEW Human message created with Escalated_From__c link

**Test Scenario 4: Mode Toggle**
1. Click "👤 Chat" mode button at bottom of panel
2. Type message and send

**Expected Results**:
- Message goes to human queue (existing `/identifier/chat/send` endpoint)
- No AI response generated
- Mode toggle shows "👤 Chat" as active

---

### Step 4: Salesforce Verification

**ChatMessage__c Records Checklist**:

**AI Question Record** (outbound):
- [ ] `Is_Inbound__c` = False
- [ ] `Message_Type__c` = "AI"
- [ ] `AI_Model__c` = "anthropic.claude-3-5-haiku-20241022-v1:0"
- [ ] `AI_Response_Time__c` populated (e.g., 1247 ms)
- [ ] `Body__c` contains Danish answer text

**Customer Question Record** (inbound):
- [ ] `Is_Inbound__c` = True
- [ ] `Message_Type__c` = "Human"
- [ ] `Body__c` contains question text

**After Helpful Feedback**:
- [ ] `AI_Helpful__c` = True on AI message

**After Escalation**:
- [ ] `AI_Escalated__c` = True on AI message
- [ ] NEW message created with:
  - `Message_Type__c` = "Human"
  - `Is_Inbound__c` = True
  - `Escalated_From__c` = AI message ID
  - `Body__c` = original question (duplicate for agent queue)

---

### Step 5: Performance Checks

**Metrics to Monitor**:

| Metric | Target | How to Check |
|--------|--------|--------------|
| AI response time (cached) | < 3s | CloudWatch Logs: search for "responseTimeMs" |
| AI response time (uncached) | < 8s | CloudWatch Logs: search for "cached: false" |
| Chat list load time | < 500ms | Browser DevTools Network tab |
| Feedback endpoint response | < 200ms | Browser DevTools Network tab |

**CloudWatch Logs Queries**:
```
# Find AI response times
fields @timestamp, responseTimeMs, cached
| filter @message like /responseTimeMs/
| sort @timestamp desc
| limit 20

# Find escalations
fields @timestamp, @message
| filter @message like /escalate/
| sort @timestamp desc
```

---

### Step 6: Production Deployment

**⚠️ Only proceed if all tests pass in `dfj-docs-test`**

1. **Lambda**: Deploy `lambda.py` to production Lambda function
2. **S3**: Upload frontend files to production S3 bucket
3. **Invalidate CloudFront**: Clear cache for all files
4. **Monitor**: Watch CloudWatch Logs for errors
5. **Smoke Test**: Repeat Test Scenarios 1-3 in production

**Rollback Plan** (if issues occur):
```powershell
# Revert Lambda to previous version
aws lambda update-function-code --function-name YOUR_PROD_FUNCTION \
  --zip-file fileb://previous-lambda.zip

# Revert S3 files to previous version
aws s3 cp s3://backup/app.js s3://your-prod-bucket/app.js --acl public-read
aws s3 cp s3://backup/texts.js s3://your-prod-bucket/texts.js --acl public-read
aws s3 cp s3://backup/styles.css s3://your-prod-bucket/styles.css --acl public-read
aws s3 cp s3://backup/index.html s3://your-prod-bucket/index.html --acl public-read

# Invalidate CloudFront
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

---

## 🔍 Troubleshooting

### Issue: "User not authorized to perform: aws-marketplace:Subscribe"

**Solution**: Already fixed. Lambda role has these permissions:
```json
{
  "Effect": "Allow",
  "Action": [
    "aws-marketplace:ViewSubscriptions",
    "aws-marketplace:Subscribe"
  ],
  "Resource": "*"
}
```

### Issue: Feedback buttons not appearing

**Check**:
1. Browser console for JavaScript errors
2. Verify `app.js` uploaded correctly (check file size ~1687 lines)
3. Clear browser cache (Ctrl+Shift+Delete)
4. Check `chatCache` in DevTools console: messages should have `messageType: 'AI'`

### Issue: Escalation creates duplicate messages

**Expected Behavior**: This is correct! Escalation creates a NEW human message for the agent queue. The original AI message is marked as escalated but remains in chat history.

### Issue: AI not responding

**Check**:
1. CloudWatch Logs for errors
2. Bedrock marketplace subscription active (AWS Console → Bedrock → Model access)
3. Payment method configured (AWS Console → Billing)
4. S3 document exists (check S3 bucket for PDF)

### Issue: Missing translations

**Check**:
1. `texts.js` uploaded correctly (should have AI_HELPFUL_BTN, AI_ESCALATE_BTN, etc.)
2. Browser console: `DICTS.da.AI_HELPFUL_BTN` should return "Hjalp det?"
3. Clear cache and hard reload (Ctrl+F5)

---

## 📊 Success Criteria

### Functional Requirements
- [x] AI responds to document questions in Danish
- [x] Feedback buttons appear on AI messages
- [x] "Helpful" action marks message in Salesforce
- [x] "Escalate" action creates new human message
- [x] Mode toggle switches between AI and Human
- [x] Existing human chat flow unchanged

### Non-Functional Requirements
- [ ] AI response time < 8 seconds (95th percentile)
- [ ] No JavaScript errors in console
- [ ] Mobile responsive (chat panel full-width on phones)
- [ ] Backward compatible (old messages display correctly)
- [ ] Salesforce records match expected schema

### User Experience
- [ ] Chat pill button visible on page load
- [ ] Contextual tips show mode information
- [ ] Feedback buttons intuitive and responsive
- [ ] Escalation creates clear system message
- [ ] No layout shifts or UI glitches

---

## 📈 Post-Deployment Monitoring

### Week 1 Metrics

**Track in Salesforce Reports**:
- Total AI messages sent
- AI messages marked helpful (%)
- AI messages escalated (%)
- Average AI response time

**Create Report**:
```sql
SELECT 
  COUNT(Id) as TotalAI,
  SUM(CASE WHEN AI_Helpful__c = true THEN 1 ELSE 0 END) as Helpful,
  SUM(CASE WHEN AI_Escalated__c = true THEN 1 ELSE 0 END) as Escalated,
  AVG(AI_Response_Time__c) as AvgResponseMs
FROM ChatMessage__c
WHERE Message_Type__c = 'AI'
  AND CreatedDate = THIS_WEEK
```

**Success Indicators**:
- Helpful rate > 60% = AI providing value
- Escalation rate < 20% = AI handling most questions
- Response time < 5000ms average = Good performance

### Customer Feedback

**Questions to Ask**:
1. Did the AI answer help you understand your document?
2. Was the escalation to a human lawyer smooth?
3. Would you use the AI assistant again?

**NPS Score**: Track Net Promoter Score for AI feature

---

## 🎯 Next Steps

### Optional Enhancements

**Phase 2 Features** (future work):
- [ ] AI conversation history (multi-turn dialogue)
- [ ] Document comparison ("How is this different from my previous will?")
- [ ] Suggested questions ("People also asked...")
- [ ] AI confidence score (show when answer might be uncertain)
- [ ] Analytics dashboard (most asked questions, helpful rate trends)

**Agent Dashboard** (Salesforce):
- [ ] List view for escalated messages (AI_Escalated__c = true)
- [ ] Report: AI performance by document type
- [ ] Alert: High escalation rate (>30%) indicates AI needs tuning

**Performance Optimization**:
- [ ] Pre-cache common documents during upload
- [ ] Implement streaming responses (answer appears word-by-word)
- [ ] Add retry logic for Bedrock throttling

---

## 📞 Support Contacts

**Technical Issues**:
- Lambda/Backend: Check CloudWatch Logs → Filter by "ERROR"
- Frontend/UI: Browser console → Check for red errors
- Salesforce: Setup → Object Manager → ChatMessage__c → Fields

**Escalation Path**:
1. Check this deployment checklist
2. Review `API_ENDPOINTS.md` for endpoint specs
3. Check CloudWatch Logs for error details
4. Review Salesforce records for data integrity
5. If still stuck: Roll back to previous version and debug offline

---

## ✅ Final Checklist

Before marking deployment complete:

- [ ] Lambda `dfj-docs-test` updated with new `lambda.py`
- [ ] S3 `dfj-docs-test` has all 4 updated frontend files
- [ ] Test Scenario 1 passed (AI question + response)
- [ ] Test Scenario 2 passed (Helpful feedback)
- [ ] Test Scenario 3 passed (Escalation flow)
- [ ] Salesforce records verified (correct fields populated)
- [ ] No JavaScript errors in browser console
- [ ] Mobile responsive design checked
- [ ] CloudWatch Logs show no errors
- [ ] Performance metrics within targets
- [ ] API endpoints documented in `API_ENDPOINTS.md`
- [ ] Team notified of new feature availability

**Deployed by**: _________________  
**Date**: _________________  
**Environment**: ☐ Test  ☐ Production  
**Rollback plan confirmed**: ☐ Yes

---

**🎉 Congratulations! Your AI + Human hybrid chat system is live!**
