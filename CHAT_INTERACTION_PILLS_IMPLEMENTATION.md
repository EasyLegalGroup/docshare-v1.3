# Chat Interaction Tracking Implementation Summary

## Overview
This implementation adds comprehensive interaction tracking for the AI chatbot, allowing lawyers to see exactly how customers interacted with chat messages in Salesforce.

## Changes Made

### 1. Lambda Backend (`vscode attempt/lambda.py`)

**Updated SOQL Query** (Line ~1508):
- Added routing metadata fields to chat list query:
  - `Original_Target__c` - Where customer started ("AI" or "Human")
  - `Final_Target__c` - Where message ended up
  - `Target_Changed__c` - Whether customer switched modes
- Updated response mapping to include these fields in API responses

**Existing Metadata Storage**:
The Lambda already stores interaction metadata:
- `handle_identifier_chat_send()`: Sets `Original_Target__c`, `Final_Target__c`, `Target_Changed__c`
- `handle_identifier_chat_ask()`: Sets `Message_Type__c = "AI"`, routing metadata
- `handle_identifier_chat_feedback()`: Sets `AI_Helpful__c` or `AI_Escalated__c`

### 2. SPA Frontend (`vscode attempt/app.js`)

**Button Restriction Logic** (renderChat function):
- Action buttons now only appear on the LAST eligible message
- **AI Feedback Buttons** (Helpful/Escalate): Only on last AI message without feedback
- **Ask AI Button**: Only on last user message in human mode
- Implemented with pre-render scan to identify last eligible messages

**Before**:
```javascript
// Buttons on ALL messages
if (isAI && !feedback) { showButtons() }
```

**After**:
```javascript
// Find last eligible messages first
let lastAIMessageId = null;
let lastUserMessageId = null;
// ... scan logic ...

// Only show on last message
if (m.id === lastAIMessageId) { showAIButtons() }
if (m.id === lastUserMessageId) { showAskAIButton() }
```

### 3. Salesforce LWC Components

**New Component: chatMessageViewer**

Created 4 files:
- `chatMessageViewer.js` - Component logic with pill rendering
- `chatMessageViewer.html` - UI template
- `chatMessageViewer.css` - Styling for messages and pills
- `chatMessageViewer.js-meta.xml` - Component metadata

**Pill Display Logic** (5 Scenarios):

1. **AI → Escalated**: Customer asked AI, then escalated to human
   - Detection: `Message_Type__c = 'Human' AND AI_Escalated__c = true`
   - Pills: "Asked AI" (blue) + "Escalated" (orange)

2. **AI → Helpful**: Customer found AI response helpful
   - Detection: `Message_Type__c = 'AI' AND AI_Helpful__c = true`
   - Pill: "Satisfied with AI response" (green)

3. **AI → No feedback**: Customer asked AI but gave no feedback yet
   - Detection: `Message_Type__c = 'AI' AND !AI_Helpful__c AND !AI_Escalated__c`
   - Pill: "Asked AI" (blue)

4. **Human → No AI**: Customer asked human directly, never switched
   - Detection: `Message_Type__c = 'Human' AND (Original_Target__c = 'Human' OR !Target_Changed__c)`
   - Pill: "Asked Human" (gray)

5. **Human → AI**: Customer started in human mode, then clicked "Ask AI"
   - Detection: `Message_Type__c = 'Human' AND Target_Changed__c = true AND Final_Target__c = 'AI'`
   - Pills: "Asked Human" (gray) + "Switched to AI" (blue)

**Apex Method Update** (`DocShareService.cls`):
```apex
@AuraEnabled(cacheable=true)
public static List<ChatMessage__c> getChatMessages(Id journalId) {
    // Returns all chat messages with interaction metadata fields
}
```

## Required Salesforce Fields

Ensure `ChatMessage__c` object has these fields:

| Field API Name | Type | Description |
|----------------|------|-------------|
| `Body__c` | Long Text Area | Message content |
| `Is_Inbound__c` | Checkbox | Customer (true) vs AI/Lawyer (false) |
| `Message_Type__c` | Text/Picklist | "Human", "AI", "System" |
| `AI_Helpful__c` | Checkbox | Customer marked AI response as helpful |
| `AI_Escalated__c` | Checkbox | Customer escalated from AI to human |
| `Original_Target__c` | Text | Where customer started ("AI" or "Human") |
| `Final_Target__c` | Text | Where message ended up |
| `Target_Changed__c` | Checkbox | Customer switched modes |
| `AI_Model__c` | Text | Bedrock model ID (for AI messages) |
| `AI_Response_Time__c` | Number | Response time in milliseconds |
| `Escalated_From__c` | Text | ID of AI message that was escalated |
| `Parent_Record__c` | Master-Detail | Link to Journal__c |
| `CreatedBy` | Lookup(User) | Standard field |
| `CreatedDate` | DateTime | Standard field |

## Deployment Steps

### 1. Deploy Lambda Changes
```bash
cd /Users/mathiastonder/docshare-v1.3

# Update Lambda function
aws lambda update-function-code \
  --function-name dfj-docshare-prod \
  --zip-file fileb://lambda-deployment.zip \
  --region eu-north-1
```

### 2. Deploy Salesforce Components

**Deploy Apex Class**:
```bash
# Using Salesforce CLI
sf project deploy start \
  --source-dir "vscode attempt/salesforce/classes/DocShareService.cls" \
  --target-org production
```

**Deploy LWC Component**:
```bash
# Deploy chatMessageViewer component
sf project deploy start \
  --source-dir "vscode attempt/salesforce/lwc/chatMessageViewer" \
  --target-org production
```

### 3. Add Component to Journal Record Page

1. Navigate to **Setup → Object Manager → Journal__c → Lightning Record Pages**
2. Edit the Journal record page layout
3. Drag **chatMessageViewer** component onto the page
4. Position it below or alongside `journalDocConsole`
5. Save and activate

### 4. Deploy SPA Changes

```bash
# Upload updated app.js to S3
aws s3 cp "vscode attempt/app.js" \
  s3://dfj-docs-prod/app.js \
  --content-type "application/javascript" \
  --region eu-north-1

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id E9HR6T6YQDI3S \
  --paths "/app.js"
```

## Testing Scenarios

### Test 1: AI → Helpful
1. Customer opens chat in AI mode
2. Customer asks question
3. AI responds
4. Customer clicks "Helpful" button
5. **Expected in Salesforce**: Green pill "Satisfied with AI response"

### Test 2: AI → Escalated
1. Customer opens chat in AI mode
2. Customer asks question
3. AI responds
4. Customer clicks "Escalate" button
5. **Expected in Salesforce**: Blue pill "Asked AI" + Orange pill "Escalated"

### Test 3: AI → No Feedback
1. Customer opens chat in AI mode
2. Customer asks question
3. AI responds
4. Customer doesn't click any button
5. **Expected in Salesforce**: Blue pill "Asked AI"

### Test 4: Human → No AI
1. Customer opens chat in Human mode
2. Customer sends message
3. **Expected in Salesforce**: Gray pill "Asked Human"

### Test 5: Human → AI Switch
1. Customer opens chat in Human mode
2. Customer sends message
3. Customer clicks "Ask AI" button on that message
4. **Expected in Salesforce**: Gray pill "Asked Human" + Blue pill "Switched to AI"

### Test 6: Button Visibility (SPA Only)
1. Customer asks multiple AI questions
2. **Expected**: Feedback buttons (Helpful/Escalate) only visible on LAST AI response
3. Customer sends multiple human messages
4. **Expected**: "Ask AI" button only visible on LAST human message

## Field Validation Query

Run this SOQL in Developer Console to verify fields exist:
```sql
SELECT Id, Body__c, Is_Inbound__c, Message_Type__c, 
       AI_Helpful__c, AI_Escalated__c,
       Original_Target__c, Final_Target__c, Target_Changed__c,
       AI_Model__c, AI_Response_Time__c, Escalated_From__c,
       CreatedBy.Name, CreatedDate
FROM ChatMessage__c
WHERE Parent_Record__c = 'a015g00000XXXXXX'
ORDER BY CreatedDate DESC
LIMIT 10
```

If any fields are missing, create them via:
**Setup → Object Manager → ChatMessage__c → Fields & Relationships → New**

## Troubleshooting

### Pills Not Showing in Salesforce
- Verify `chatMessageViewer` component is on the page layout
- Check browser console for LWC errors
- Verify `getChatMessages` Apex method is deployed
- Confirm user has read access to all ChatMessage__c fields

### Buttons Appearing on All Messages in SPA
- Clear browser cache and reload
- Check that updated `app.js` is deployed to S3
- Verify CloudFront invalidation completed
- Check browser console for JavaScript errors

### Metadata Fields Not Saving
- Verify Lambda has permission to update ChatMessage__c
- Check Lambda CloudWatch logs for Salesforce API errors
- Confirm fields exist in Salesforce with correct API names
- Test field creation manually via Apex or REST API

### Wrong Pills Displayed
- Review `enrichMessage()` logic in `chatMessageViewer.js`
- Check field values in Salesforce directly via SOQL
- Verify Lambda is setting correct field values (check CloudWatch logs)
- Test each scenario independently to isolate logic errors

## Files Modified

1. `/Users/mathiastonder/docshare-v1.3/vscode attempt/lambda.py` - SOQL query update
2. `/Users/mathiastonder/docshare-v1.3/vscode attempt/app.js` - Button restriction logic
3. `/Users/mathiastonder/docshare-v1.3/vscode attempt/salesforce/classes/DocShareService.cls` - Added getChatMessages method
4. `/Users/mathiastonder/docshare-v1.3/vscode attempt/salesforce/lwc/chatMessageViewer/` - New component (4 files)

## Next Steps

1. **Deploy to Salesforce Sandbox** first for testing
2. **Verify all 6 test scenarios** work as expected
3. **Deploy to Production** after successful testing
4. **Update CloudFront** with new app.js
5. **Train lawyers** on new pill system and what each pill means
6. **Monitor Lambda logs** for first few days to catch any edge cases
