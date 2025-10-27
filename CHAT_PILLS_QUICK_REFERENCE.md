# Chat Interaction Pills - Quick Reference

## Pill Colors & Meanings

### 🔵 Blue Pills (Info)
- **"Asked AI"** - Customer submitted a question to the AI chatbot
- **"Switched to AI"** - Customer was in human mode but clicked "Ask AI" button

### 🟢 Green Pill (Success)
- **"Satisfied with AI response"** - Customer clicked "Helpful" button on AI response

### 🟠 Orange Pill (Warning)
- **"Escalated"** - Customer clicked "Escalate" button, requesting human assistance

### ⚫️ Gray Pill (Default)
- **"Asked Human"** - Customer submitted message directly to human lawyer (no AI)

## Common Pill Combinations

### Single Pills
| Pills | Meaning |
|-------|---------|
| 🔵 Asked AI | Customer asked AI, awaiting feedback |
| 🟢 Satisfied with AI response | Customer happy with AI answer |
| ⚫️ Asked Human | Customer contacted lawyer directly |

### Double Pills
| Pills | Meaning |
|-------|---------|
| 🔵 Asked AI + 🟠 Escalated | Customer tried AI first, then escalated |
| ⚫️ Asked Human + 🔵 Switched to AI | Customer started with lawyer, then tried AI |

## What Actions Trigger Pills

### Customer Actions → Pills Created
1. **Opens chat in AI mode, asks question**
   - Creates: 🔵 "Asked AI"
   
2. **Clicks "Helpful" on AI response**
   - Changes to: 🟢 "Satisfied with AI response"
   
3. **Clicks "Escalate" on AI response**
   - Changes to: 🔵 "Asked AI" + 🟠 "Escalated"
   
4. **Opens chat in Human mode, sends message**
   - Creates: ⚫️ "Asked Human"
   
5. **In Human mode, clicks "Ask AI" on their message**
   - Creates: ⚫️ "Asked Human" + 🔵 "Switched to AI"

## Reading the Timeline

Pills appear on each message in chronological order. Example conversation:

```
[10:00] Customer: "What is this document about?"
        🔵 Asked AI

[10:00] AI: "This is a will document..."
        🔵 Asked AI

[10:01] Customer: "Can you explain section 3?"
        ⚫️ Asked Human + 🔵 Switched to AI

[10:01] AI: "Section 3 covers..."
        🟢 Satisfied with AI response
```

**Reading**: Customer first tried AI, then asked a follow-up that they routed to AI from human mode, and was satisfied with the second response.

## Button Visibility (Customer View Only)

Customers only see action buttons on the **last message**:

- **Helpful/Escalate buttons**: Only on last AI response
- **Ask AI button**: Only on last customer message (in human mode)

This prevents confusion and duplicate actions on old messages.

## Technical Details

### Field Mapping
| Pill | Salesforce Fields |
|------|------------------|
| 🔵 Asked AI | `Message_Type__c = 'AI'` |
| 🟢 Satisfied | `AI_Helpful__c = true` |
| 🟠 Escalated | `AI_Escalated__c = true` |
| ⚫️ Asked Human | `Message_Type__c = 'Human'` AND `Original_Target__c = 'Human'` |
| 🔵 Switched to AI | `Target_Changed__c = true` AND `Final_Target__c = 'AI'` |

### Logic Flow
```
Message Created
    ↓
Lambda sets metadata fields
    ↓
SPA/Salesforce queries messages
    ↓
LWC enrichMessage() determines pills
    ↓
Pills rendered in UI
```

## FAQ

**Q: Why don't I see any pills?**
A: Pills only appear if the corresponding metadata fields are populated. Check that the message has `Message_Type__c` set and interaction fields like `AI_Helpful__c` or `Original_Target__c`.

**Q: Can a message have 3+ pills?**
A: No. Maximum is 2 pills (e.g., "Asked Human" + "Switched to AI").

**Q: What if customer escalates but then marks helpful?**
A: The "Escalated" pill takes precedence. Once escalated, the pill won't change to "Satisfied".

**Q: Do pills appear in real-time?**
A: In Salesforce, click the refresh button to see updated pills. In SPA, pills update when chat refreshes (every few seconds or on manual refresh).

**Q: Can lawyers add pills manually?**
A: No. Pills are system-generated based on customer actions. They cannot be edited manually.

## For Developers

### Adding New Pill Types
1. Add new field to `ChatMessage__c` (e.g., `AI_Clarification_Requested__c`)
2. Update Lambda to set field when action occurs
3. Add new case to `enrichMessage()` in `chatMessageViewer.js`:
   ```javascript
   else if (msg.AI_Clarification_Requested__c) {
       pills.push({ label: 'Requested Clarification', variant: 'info' });
   }
   ```
4. Update SOQL queries to include new field
5. Deploy and test

### Pill Variant Classes
- `info` → Blue (#0176d3)
- `success` → Green (#2e844a)
- `warning` → Orange (#fe9339)
- `default` → Gray (#706e6b)
- `error` → Red (not currently used)

### Component Files
- **LWC**: `salesforce/lwc/chatMessageViewer/`
- **Apex**: `DocShareService.getChatMessages()`
- **Lambda**: `handle_identifier_chat_list()` SOQL query
- **SPA**: `app.js` renderChat() function
