# 🧪 Live SPA Testing Instructions - AI Chatbot

**Status**: Ready for deployment  
**Date**: October 26, 2025  
**Goal**: Test AI chatbot with real SPA frontend before production integration

---

## ✅ Prerequisites (All Complete!)

- ✅ DynamoDB table: `dfj-pdf-text-cache-test`
- ✅ Lambda function: `dfj-docs-test` (with PyMuPDF layer v4)
- ✅ AWS Bedrock: Claude 3.5 Haiku enabled and tested
- ✅ IAM permissions: Bedrock + DynamoDB + S3 access granted
- ✅ Test results: All Phase 1 tests passed ✅

---

## 📋 Deployment Steps

### **Step 1: Update Test Lambda Code**

1. **Open AWS Lambda Console**: https://eu-north-1.console.aws.amazon.com/lambda/
2. **Select function**: `dfj-docs-test`
3. **Replace code** with `lambda_test_live.py`:
   - Copy all code from `vscode attempt/lambda_test_live.py`
   - Paste into Lambda code editor
   - **Deploy** (click "Deploy" button)

**Verification**:
- Lambda function shows "Changes deployed" message
- PyMuPDF layer still attached (check Configuration → Layers)

---

### **Step 2: Create or Update API Gateway**

#### **Option A: Create New HTTP API (Recommended for Testing)**

1. **Go to API Gateway Console**: https://eu-north-1.console.aws.amazon.com/apigateway/
2. **Create API** → **HTTP API** → **Build**
3. **Integrations**:
   - Click **Add integration**
   - **Integration type**: Lambda function
   - **Lambda function**: `dfj-docs-test`
   - **API name**: `dfj-ai-chatbot-test`
   - Click **Next**
4. **Configure routes**:
   - **Method**: `POST`
   - **Resource path**: `/identifier/chat/ask`
   - **Integration**: `dfj-docs-test` (auto-selected)
   - Click **Next**
5. **Configure stages**:
   - **Stage name**: `test`
   - **Auto-deploy**: ✅ Enabled
   - Click **Next**
6. **Review and create** → Click **Create**
7. **Enable CORS**:
   - Go to **CORS** tab
   - Click **Configure**
   - **Access-Control-Allow-Origin**: `*` (or specific domains for production)
   - **Access-Control-Allow-Methods**: `POST, OPTIONS`
   - **Access-Control-Allow-Headers**: `Content-Type, Authorization`
   - Click **Save**

**Your Test API Endpoint**: 
```
https://<API-ID>.execute-api.eu-north-1.amazonaws.com/test/identifier/chat/ask
```

Save this URL - you'll need it for Step 3!

---

#### **Option B: Add Route to Existing API**

If you already have a test API:

1. Go to **API Gateway** → Select your test API
2. **Routes** → **Create**
3. **Method**: `POST`, **Path**: `/identifier/chat/ask`
4. **Attach integration**: Lambda `dfj-docs-test`
5. **CORS**: Configure as above
6. **Deploy** to stage

---

### **Step 3: Test API Endpoint (Before SPA Integration)**

**Using curl** (PowerShell):

```powershell
$testUrl = "https://<API-ID>.execute-api.eu-north-1.amazonaws.com/test/identifier/chat/ask"

$body = @{
    s3_key = "dk/customer-documents/J-0055362/Mathias Tønder og Nicole Tønder - Testamente (preview by mt@dinfamiliejurist.dk).pdf"
    question = "Hvad er dette dokument om?"
} | ConvertTo-Json

Invoke-RestMethod -Uri $testUrl -Method Post -Body $body -ContentType "application/json"
```

**Expected Response**:
```json
{
  "answer": "Dette dokument er et gensidigt testamente...",
  "isAI": true,
  "cached": true,
  "s3_key": "dk/customer-documents/...",
  "document_name": "Mathias Tønder og Nicole Tønder - Testamente...",
  "timestamp": "2025-10-26T...",
  "message": "✅ AI response generated successfully"
}
```

**If error**:
- Check Lambda logs (CloudWatch)
- Verify CORS headers in response
- Ensure S3 key is correct for your test file

---

### **Step 4: Temporary SPA Integration**

#### **Option A: Quick Test with Browser Console**

1. **Open your SPA**: https://dok.dinfamiliejurist.dk (or localhost)
2. **Login** with identifier (phone/email)
3. **Select a journal** and **view a document**
4. **Open browser console** (F12)
5. **Run this code**:

```javascript
// Set your test API URL
const TEST_API = 'https://<API-ID>.execute-api.eu-north-1.amazonaws.com/test/identifier/chat/ask';

// Example: Ask AI about current document
async function testAI() {
  // Get current document S3 key (you'll need to inspect your code to find this)
  // For now, use hardcoded test key:
  const s3Key = 'dk/customer-documents/J-0055362/Mathias Tønder og Nicole Tønder - Testamente (preview by mt@dinfamiliejurist.dk).pdf';
  
  const question = prompt('Ask a question about the document:');
  if (!question) return;
  
  console.log('🤖 Asking AI:', question);
  
  const response = await fetch(TEST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ s3_key: s3Key, question })
  });
  
  const data = await response.json();
  console.log('✅ AI Response:', data);
  alert('AI Answer:\n\n' + data.answer);
}

testAI();
```

---

#### **Option B: Modify app.js (Temporary Changes)**

**File**: `app.js`

Add this code after the chat initialization (around line 800):

```javascript
// ===== TEMPORARY AI TESTING CODE =====
const AI_TEST_MODE = true;  // Set to false to disable
const AI_TEST_API = 'https://<API-ID>.execute-api.eu-north-1.amazonaws.com/test/identifier/chat/ask';

// Override sendChat function for AI testing
const originalSendChat = sendChat;
async function sendChat() {
  if (!AI_TEST_MODE) {
    return originalSendChat();
  }
  
  const editor = $('chatEditor');
  const txt = (editor.textContent || '').trim();
  if (!txt) return;
  
  // Get current document S3 key
  const currentDoc = docs[active];
  if (!currentDoc || !currentDoc.s3_key) {
    console.error('No active document or S3 key');
    return originalSendChat();  // Fallback to human chat
  }
  
  try {
    spin(true);
    
    // Display user message
    appendChatMessage('me', txt);
    
    // Call AI endpoint
    const res = await fetch(AI_TEST_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        s3_key: currentDoc.s3_key,
        question: txt,
        document_name: currentDoc.name || 'Unknown'
      })
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || 'AI request failed');
    }
    
    // Display AI response with special styling
    appendChatMessage('ai', `🤖 ${data.answer}\n\n<em style="color:#888;font-size:12px;">(AI-generated response - ${data.cached ? 'cached' : 'new extraction'})</em>`);
    
    editor.textContent = '';
    
  } catch (e) {
    console.error('AI chat error:', e);
    appendChatMessage('system', `❌ AI Error: ${e.message}`);
  } finally {
    spin(false);
  }
}

// Helper to append chat messages
function appendChatMessage(type, html) {
  const chatList = $('chatList');
  const wrapper = document.createElement('div');
  wrapper.className = type === 'me' ? 'me' : (type === 'ai' ? 'them' : 'chat-ts');
  
  if (type !== 'system') {
    const bubble = document.createElement('div');
    bubble.className = 'chat-row';
    bubble.innerHTML = html;
    wrapper.appendChild(bubble);
  } else {
    wrapper.innerHTML = html;
  }
  
  chatList.appendChild(wrapper);
  chatList.scrollTop = chatList.scrollHeight;
}
// ===== END TEMPORARY AI TESTING CODE =====
```

**Important Notes**:
- **Assumes `currentDoc.s3_key` exists** - you may need to add this field when fetching documents
- **Modify as needed** to match your existing code structure
- **Set `AI_TEST_MODE = false`** to revert to human chat

---

### **Step 5: Test Scenarios**

Run all these tests to validate functionality:

#### **Test 1: Simple Question**
- **Document**: Any PDF (testament, contract, etc.)
- **Question**: "Hvad er dette dokument om?" (What is this document about?)
- **Expected**: AI provides summary in Danish
- **Validate**: Response < 10 seconds, answer accurate

#### **Test 2: Specific Detail**
- **Question**: "Hvad er arvefordelingen?" (What is the inheritance split?)
- **Expected**: AI extracts specific numbers/percentages
- **Validate**: Accuracy of details

#### **Test 3: Cache Performance**
- **Action**: Ask another question about same document
- **Expected**: Response < 3 seconds (cache hit)
- **Check console**: Look for `"cached": true` in response

#### **Test 4: Multi-language** (if you have Swedish/English docs)
- **Question** (Swedish): "Vad handlar detta dokument om?"
- **Expected**: AI responds in Swedish
- **Validate**: Language detection working

#### **Test 5: Error Handling**
- **Action**: Try with invalid S3 key
- **Expected**: Error message, no crash
- **Validate**: Graceful degradation

---

## 📊 Success Criteria

✅ **API endpoint working**:
- Returns 200 status
- Answer field contains AI response
- CORS headers present

✅ **SPA integration smooth**:
- No JavaScript errors
- AI responses display correctly
- Chat UI remains usable

✅ **Performance meets targets**:
- First question: < 10 seconds
- Cached questions: < 3 seconds
- No timeouts or crashes

✅ **AI quality acceptable**:
- Answers relevant to document
- Correct language used
- No hallucinations (making up facts)

---

## 🐛 Troubleshooting

### **Issue: CORS Error in Browser**

**Symptoms**: `Access-Control-Allow-Origin` error in console

**Fix**:
1. Check API Gateway CORS settings
2. Ensure `Access-Control-Allow-Origin: *` is set
3. Verify OPTIONS request returns 200

---

### **Issue: 502 Bad Gateway**

**Symptoms**: API returns 502 error

**Fix**:
1. Check Lambda logs (CloudWatch)
2. Verify Lambda returns proper response format (statusCode, headers, body)
3. Check timeout (Lambda should complete within 60s)

---

### **Issue: AI Returns Empty Answer**

**Symptoms**: Response successful but answer is empty or generic

**Fix**:
1. Check S3 key is correct
2. Verify PDF has extractable text (not scanned image)
3. Check CloudWatch logs for extraction errors

---

### **Issue: Slow Response Times**

**Symptoms**: First question takes > 15 seconds

**Fix**:
1. Check Lambda cold start time (Init Duration in logs)
2. Verify PyMuPDF layer is properly attached
3. Consider increasing Lambda memory to 1024 MB

---

## 📝 Test Results Checklist

After testing, document results:

- [ ] API endpoint responds successfully
- [ ] SPA can call endpoint without errors
- [ ] AI provides relevant answers in correct language
- [ ] Cache hit rate > 50% (after first question)
- [ ] Average response time < 5 seconds
- [ ] No crashes or timeouts during testing
- [ ] User experience smooth and professional

---

## 🚀 Next Steps After Successful Testing

1. **Gather feedback**: Note what works well and what needs improvement
2. **Review AI prompts**: Adjust system prompt if answers aren't optimal
3. **Plan production integration**: Merge into main `lambda.py`
4. **Design final UI**: Decide on AI mode toggle, disclaimer text, etc.
5. **Update documentation**: Add to deployment guide

---

## 🔒 Security Notes

**For Live Testing**:
- ✅ CORS set to `*` (open access) - **TESTING ONLY**
- ✅ No authentication required - **TESTING ONLY**
- ✅ Using test bucket (`dfj-docs-test`)

**For Production**:
- ⚠️ CORS must be restricted to specific domains
- ⚠️ Session token authentication required
- ⚠️ Switch to production bucket and DynamoDB table
- ⚠️ Add rate limiting (prevent abuse)

---

## 📞 Support

**Questions or Issues?**
1. Check Lambda CloudWatch logs first
2. Review this document's troubleshooting section
3. Test with curl before blaming SPA
4. Document exact error messages for debugging

---

**Ready to test?** Start with Step 1! 🎯
