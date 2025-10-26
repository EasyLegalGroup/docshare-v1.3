# API Endpoints Quick Reference

## Updated Endpoints

### POST /identifier/chat/ask ✅ UPDATED
**Creates both ChatMessages (inbound + outbound)**

```javascript
// Request
{
  journalId: "a0X...",
  documentId: "a0Y...",
  question: "Hvad betyder paragraph 2.5?",
  brand: "dfj"
}

// Response
{
  answer: "Paragraph 2.5 beskriver...",
  inboundMessageId: "a0Z1...",    // NEW
  outboundMessageId: "a0Z2...",   // NEW
  responseTimeMs: 1247,            // NEW
  cached: false,
  extractedChars: 21732
}
```

---

### POST /identifier/chat/feedback 🆕 NEW
**Handles helpful/escalate actions**

```javascript
// Request
{
  messageId: "a0Z...",
  action: "helpful" | "escalate"
}

// Response (helpful)
{
  ok: true
}

// Response (escalate)
{
  ok: true,
  escalatedMessageId: "a0Z3..."  // NEW human message for agent queue
}
```

---

### POST /identifier/chat/list ✅ UPDATED
**Returns AI metadata fields**

```javascript
// Request
{
  journalId: "a0X..."
}

// Response
{
  messages: [
    {
      id: "a0Z...",
      body: "...",
      inbound: true/false,
      at: "2025-01-16T10:23:45.000Z",
      messageType: "Human|AI|System",  // NEW
      aiModel: "anthropic...",         // NEW
      aiHelpful: false,                // NEW
      aiEscalated: false,              // NEW
      aiResponseTime: 1247,            // NEW
      escalatedFrom: null              // NEW
    }
  ]
}
```

---

### POST /identifier/chat/send ⚪ UNCHANGED
**Sends message to human lawyer**

```javascript
// Request
{
  journalId: "a0X...",
  msg: "<p>I have a question...</p>"
}

// Response
{
  id: "a0Z...",
  ok: true
}
```

---

## Salesforce Fields Reference

| Field | Type | Populated By | Description |
|-------|------|--------------|-------------|
| `Message_Type__c` | Picklist | All endpoints | Human \| AI \| System |
| `AI_Model__c` | Text(50) | `/chat/ask` | Bedrock model ID |
| `AI_Helpful__c` | Checkbox | `/chat/feedback` | Customer marked helpful |
| `AI_Escalated__c` | Checkbox | `/chat/feedback` | Customer escalated |
| `AI_Response_Time__c` | Number | `/chat/ask` | Response time (ms) |
| `Escalated_From__c` | Lookup | `/chat/feedback` | Links to original AI msg |

---

## Usage Examples

### Ask AI Question
```javascript
const response = await fetch(`${API}/identifier/chat/ask`, {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json' 
  },
  body: JSON.stringify({
    journalId: currentJournal,
    documentId: currentDoc,
    question: userQuestion,
    brand: 'dfj'
  })
});

const { inboundMessageId, outboundMessageId, answer } = await response.json();
```

### Mark Helpful
```javascript
await fetch(`${API}/identifier/chat/feedback`, {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json' 
  },
  body: JSON.stringify({
    messageId: aiMessageId,
    action: 'helpful'
  })
});
```

### Escalate to Human
```javascript
const response = await fetch(`${API}/identifier/chat/feedback`, {
  method: 'POST',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json' 
  },
  body: JSON.stringify({
    messageId: aiMessageId,
    action: 'escalate'
  })
});

const { escalatedMessageId } = await response.json();
// New human message created with this ID
```

---

## Common Error Responses

| Status | Error | Solution |
|--------|-------|----------|
| 400 | Missing required fields | Check request body matches schema |
| 401 | Invalid/expired token | Re-authenticate user |
| 403 | Not an AI message | Can only provide feedback on AI messages |
| 404 | Message/Journal not found | Verify IDs exist in Salesforce |
| 500 | Bedrock/Salesforce error | Check CloudWatch Logs |

---

## Testing Commands

### Test Ask Endpoint
```powershell
curl -X POST https://your-api/identifier/chat/ask `
  -H "Authorization: Bearer YOUR_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{"journalId":"a0X...","documentId":"a0Y...","question":"Test?","brand":"dfj"}'
```

### Test Feedback Endpoint
```powershell
curl -X POST https://your-api/identifier/chat/feedback `
  -H "Authorization: Bearer YOUR_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{"messageId":"a0Z...","action":"helpful"}'
```

### Test List Endpoint
```powershell
curl -X POST https://your-api/identifier/chat/list `
  -H "Authorization: Bearer YOUR_TOKEN" `
  -H "Content-Type: application/json" `
  -d '{"journalId":"a0X..."}'
```

---

For complete documentation, see **API_ENDPOINTS.md**
