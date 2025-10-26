# API Endpoints Documentation

## Chat System Endpoints

All chat endpoints require authentication via session token in the `Authorization` header.

---

### 1. POST /identifier/chat/ask

**Status**: ✅ **UPDATED** (creates both inbound + outbound ChatMessage records)

**Purpose**: Send a question to the AI assistant about a specific document

**Request**:
```http
POST {API_BASE_URL}/identifier/chat/ask
Content-Type: application/json
Authorization: Bearer {sessionToken}

{
  "journalId": "a0X...",      // Salesforce Journal__c record ID
  "documentId": "a0Y...",     // Salesforce Document__c record ID  
  "question": "Hvad betyder paragraph 2.5?",
  "brand": "dfj"              // Brand identifier (dfj, lawline, svensktestamente)
}
```

**Response**:
```json
{
  "answer": "Paragraph 2.5 beskriver...",
  "inboundMessageId": "a0Z1...",    // NEW: Customer's question ChatMessage ID
  "outboundMessageId": "a0Z2...",   // NEW: AI's answer ChatMessage ID
  "responseTimeMs": 1247,            // NEW: AI response time in milliseconds
  "cached": false,
  "extractedChars": 21732,
  "aiModel": "anthropic.claude-3-5-haiku-20241022-v1:0"
}
```

**Salesforce Records Created**:

1. **Inbound ChatMessage** (customer's question):
```javascript
{
  Parent_Record__c: journalId,
  Body__c: question,
  Is_Inbound__c: true,
  Message_Type__c: "Human"
}
```

2. **Outbound ChatMessage** (AI's answer):
```javascript
{
  Parent_Record__c: journalId,
  Body__c: answer,
  Is_Inbound__c: false,
  Message_Type__c: "AI",
  AI_Model__c: "anthropic.claude-3-5-haiku-20241022-v1:0",
  AI_Response_Time__c: 1247
}
```

**Error Responses**:
- `400`: Missing required fields
- `401`: Invalid/expired session token
- `404`: Journal or document not found
- `500`: AI service error or S3 retrieval failure

---

### 2. POST /identifier/chat/feedback

**Status**: 🆕 **NEW**

**Purpose**: Mark an AI message as helpful or escalate to human lawyer

**Request**:
```http
POST {API_BASE_URL}/identifier/chat/feedback
Content-Type: application/json
Authorization: Bearer {sessionToken}

{
  "messageId": "a0Z...",      // ChatMessage__c ID (must be AI message)
  "action": "helpful"         // "helpful" | "escalate"
}
```

**Response for "helpful" action**:
```json
{
  "ok": true
}
```

**Response for "escalate" action**:
```json
{
  "ok": true,
  "escalatedMessageId": "a0Z3..."  // NEW human message created for agent queue
}
```

**Salesforce Updates**:

**Action: "helpful"**
- Updates AI message: `AI_Helpful__c = true`

**Action: "escalate"**
1. Updates AI message: `AI_Escalated__c = true`
2. Creates NEW ChatMessage (duplicate question for human agent):
```javascript
{
  Parent_Record__c: journalId,
  Body__c: originalQuestion,
  Is_Inbound__c: true,
  Message_Type__c: "Human",
  Escalated_From__c: messageId  // Links to original AI message
}
```

**Error Responses**:
- `400`: Invalid action or messageId not provided
- `401`: Invalid/expired session token
- `403`: Trying to provide feedback on non-AI message
- `404`: Message not found
- `500`: Salesforce update failure

---

### 3. POST /identifier/chat/list

**Status**: ✅ **UPDATED** (returns AI metadata fields)

**Purpose**: Retrieve all chat messages for a journal

**Request**:
```http
POST {API_BASE_URL}/identifier/chat/list
Content-Type: application/json
Authorization: Bearer {sessionToken}

{
  "journalId": "a0X..."
}
```

**Response**:
```json
{
  "messages": [
    {
      "id": "a0Z1...",
      "body": "Hvad betyder paragraph 2.5?",
      "inbound": true,
      "at": "2025-01-16T10:23:45.000Z",
      "messageType": "Human",           // NEW
      "aiModel": null,                  // NEW
      "aiHelpful": false,               // NEW
      "aiEscalated": false,             // NEW
      "aiResponseTime": null,           // NEW
      "escalatedFrom": null             // NEW
    },
    {
      "id": "a0Z2...",
      "body": "Paragraph 2.5 beskriver...",
      "inbound": false,
      "at": "2025-01-16T10:23:47.000Z",
      "messageType": "AI",                                        // NEW
      "aiModel": "anthropic.claude-3-5-haiku-20241022-v1:0",     // NEW
      "aiHelpful": false,                                         // NEW
      "aiEscalated": false,                                       // NEW
      "aiResponseTime": 1247,                                     // NEW
      "escalatedFrom": null                                       // NEW
    }
  ]
}
```

**SOQL Query**:
```sql
SELECT Id, Body__c, Is_Inbound__c, CreatedDate, CreatedBy.Name,
       Message_Type__c, AI_Model__c, AI_Helpful__c, AI_Escalated__c,
       AI_Response_Time__c, Escalated_From__c
FROM ChatMessage__c
WHERE Parent_Record__c = '{journalId}'
ORDER BY CreatedDate ASC
LIMIT 500
```

**Error Responses**:
- `400`: Missing journalId
- `401`: Invalid/expired session token
- `404`: Journal not found
- `500`: Salesforce query failure

---

### 4. POST /identifier/chat/send

**Status**: ⚪ **UNCHANGED**

**Purpose**: Send a message to human lawyer (creates single inbound ChatMessage only)

**Request**:
```http
POST {API_BASE_URL}/identifier/chat/send
Content-Type: application/json
Authorization: Bearer {sessionToken}

{
  "journalId": "a0X...",
  "msg": "<p>I have a question about...</p>"
}
```

**Response**:
```json
{
  "id": "a0Z...",     // Created ChatMessage__c ID
  "ok": true
}
```

**Salesforce Record Created**:
```javascript
{
  Parent_Record__c: journalId,
  Body__c: msg,
  Is_Inbound__c: true,
  Message_Type__c: "Human"
}
```

**Error Responses**:
- `400`: Missing journalId or msg
- `401`: Invalid/expired session token
- `500`: Salesforce insert failure

---

## Salesforce Schema Reference

### ChatMessage__c Fields

| Field Name | Type | Description |
|------------|------|-------------|
| `Parent_Record__c` | Lookup(Journal__c) | Link to journal |
| `Body__c` | Long Text Area | Message content (HTML) |
| `Is_Inbound__c` | Checkbox | True = customer sent, False = lawyer/AI sent |
| `Message_Type__c` | Picklist | Human \| AI \| System |
| `AI_Model__c` | Text(50) | Bedrock model ID (e.g., "anthropic.claude-3-5-haiku...") |
| `AI_Helpful__c` | Checkbox | Customer marked AI answer as helpful |
| `AI_Escalated__c` | Checkbox | Customer escalated AI answer to human |
| `AI_Response_Time__c` | Number | Milliseconds taken for AI to respond |
| `Escalated_From__c` | Lookup(ChatMessage__c) | Links escalated message to original AI response |

---

## Authentication

All endpoints require a valid session token obtained from the login flow:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Session tokens are stored in `localStorage.sessionToken` and validated via DynamoDB table `dfj-sessions`.

---

## Error Handling

All endpoints return consistent error format:

```json
{
  "error": "Descriptive error message",
  "code": "ERROR_CODE"  // Optional machine-readable code
}
```

HTTP status codes:
- `200`: Success
- `400`: Bad request (validation error)
- `401`: Unauthorized (invalid/expired token)
- `403`: Forbidden (insufficient permissions)
- `404`: Not found
- `500`: Internal server error

---

## Frontend Integration

### Example: Sending AI Question

```javascript
async function askAI(question) {
  const response = await fetch(`${API_BASE_URL}/identifier/chat/ask`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`
    },
    body: JSON.stringify({
      journalId: currentJournalId,
      documentId: currentDocumentId,
      question: question,
      brand: 'dfj'
    })
  });
  
  const data = await response.json();
  
  // Add customer question to cache
  chatCache.push({
    id: data.inboundMessageId,
    body: question,
    inbound: true,
    messageType: 'Human'
  });
  
  // Add AI response to cache
  chatCache.push({
    id: data.outboundMessageId,
    body: data.answer,
    inbound: false,
    messageType: 'AI',
    aiModel: data.aiModel,
    aiResponseTime: data.responseTimeMs,
    aiHelpful: false,
    aiEscalated: false
  });
  
  renderChat();
}
```

### Example: Handling Feedback

```javascript
async function handleAIFeedback(messageId, action) {
  const response = await fetch(`${API_BASE_URL}/identifier/chat/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`
    },
    body: JSON.stringify({ messageId, action })
  });
  
  const data = await response.json();
  
  // Update local cache
  const msg = chatCache.find(m => m.id === messageId);
  if (msg) {
    if (action === 'helpful') {
      msg.aiHelpful = true;
    } else if (action === 'escalate') {
      msg.aiEscalated = true;
      // Optionally add system message
      chatCache.push({
        id: 'system-' + Date.now(),
        body: '<em>Videresendt til jurist</em>',
        messageType: 'System'
      });
    }
  }
  
  renderChat();
  
  // Refresh to get new human message if escalated
  if (action === 'escalate') {
    setTimeout(() => fetchChat(), 500);
  }
}
```

---

## Deployment Notes

### Lambda Environment Variables

No new environment variables required. Existing configuration:
- `BEDROCK_MODEL_ID`: `anthropic.claude-3-5-haiku-20241022-v1:0`
- `BEDROCK_REGION`: `us-east-1`
- `DYNAMODB_TABLE`: `dfj-pdf-text-cache`
- Salesforce credentials (instance, org ID, consumer key/secret)

### Required IAM Permissions

Lambda execution role must have:
- `bedrock:InvokeModel` (existing)
- `aws-marketplace:ViewSubscriptions` (added)
- `aws-marketplace:Subscribe` (added)
- S3 read access to document bucket
- DynamoDB read/write to cache + session tables
- CloudWatch Logs write

### Salesforce Setup Checklist

✅ **Fields Created** (user confirmed):
- Message_Type__c (Picklist)
- AI_Model__c (Text 50)
- AI_Helpful__c (Checkbox)
- AI_Escalated__c (Checkbox)
- AI_Response_Time__c (Number)
- Escalated_From__c (Lookup ChatMessage__c)

**Page Layout Updates** (recommended):
- Add AI fields to ChatMessage__c page layout
- Create list view for "AI Escalated Messages" (AI_Escalated__c = true)
- Add response time report/chart

**Validation Rules** (optional):
- Ensure AI_Model__c is populated when Message_Type__c = "AI"
- Prevent manual editing of AI_Helpful__c/AI_Escalated__c (set by API only)

---

## Testing Checklist

### Unit Tests
- [ ] `/identifier/chat/ask` creates both ChatMessages with correct fields
- [ ] `/identifier/chat/feedback` with "helpful" updates AI_Helpful__c
- [ ] `/identifier/chat/feedback` with "escalate" creates new human message
- [ ] `/identifier/chat/list` returns all AI metadata fields
- [ ] Error handling for invalid messageId, expired tokens, etc.

### Integration Tests
- [ ] Ask AI question → see feedback buttons in UI
- [ ] Click "Helpful" → button disappears, shows thank you message
- [ ] Click "Escalate" → new human message appears, system notification shown
- [ ] Verify Salesforce records match expected structure
- [ ] Test multi-device sync (escalate on mobile, see update on desktop)

### Performance Tests
- [ ] AI response time < 3 seconds for cached documents
- [ ] AI response time < 8 seconds for uncached documents
- [ ] Chat list loads < 500ms for 50+ messages
- [ ] Feedback endpoint responds < 200ms

---

## Migration Path

### Deployment Order

1. **Salesforce** (already done): Create custom fields on ChatMessage__c
2. **Lambda Backend**: Deploy updated `lambda.py` to `dfj-docs-test`
3. **Frontend Assets**: Upload `app.js`, `texts.js`, `styles.css`, `index.html` to S3
4. **Smoke Test**: Verify all endpoints work in test environment
5. **Production**: Repeat steps 2-3 for production Lambda/S3

### Backward Compatibility

✅ **Fully backward compatible**:
- Existing `/identifier/chat/send` unchanged
- Old ChatMessages without AI fields still display correctly
- Frontend gracefully handles missing AI metadata (checks for null/undefined)

### Rollback Plan

If issues arise:
1. Revert Lambda to previous version (no schema changes, safe rollback)
2. Revert S3 frontend files to previous version
3. Salesforce fields remain (no data loss, just unused)
4. Debug and redeploy when ready
