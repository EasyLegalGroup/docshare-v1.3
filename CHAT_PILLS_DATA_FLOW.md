# Chat Interaction Pills - Data Flow Diagram

## Overall Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CUSTOMER INTERACTION                         │
│                         (SPA - app.js)                              │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         │ 1. Customer Action
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    AWS LAMBDA (lambda.py)                           │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  Endpoints:                                                 │   │
│  │  • /identifier/chat/send        (Human messages)          │   │
│  │  • /identifier/chat/ask         (AI Q&A)                   │   │
│  │  • /identifier/chat/feedback    (Helpful/Escalate)        │   │
│  │  • /identifier/chat/list        (Query messages)           │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  2. Lambda creates ChatMessage__c with metadata                    │
│  3. Stores: Message_Type__c, AI_Helpful__c, Target_Changed__c     │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         SALESFORCE                                   │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  ChatMessage__c Object                                      │   │
│  │  • Body__c                                                  │   │
│  │  • Is_Inbound__c                                           │   │
│  │  • Message_Type__c         ("Human" | "AI" | "System")    │   │
│  │  • AI_Helpful__c           (Checkbox)                      │   │
│  │  • AI_Escalated__c         (Checkbox)                      │   │
│  │  • Original_Target__c      ("Human" | "AI")               │   │
│  │  • Final_Target__c         ("Human" | "AI")               │   │
│  │  • Target_Changed__c       (Checkbox)                      │   │
│  │  • Parent_Record__c        (Journal__c)                    │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  4. Records stored with full metadata                              │
└────────────────────────┬────────────────────────────────────────────┘
                         │
           ┌─────────────┴─────────────┐
           │                           │
           ▼                           ▼
┌─────────────────────┐    ┌─────────────────────────┐
│   CUSTOMER VIEW     │    │     LAWYER VIEW         │
│   (SPA - app.js)    │    │  (LWC - chatMessageViewer) │
└─────────────────────┘    └─────────────────────────┘
│                           │
│ 5. Fetch messages         │ 6. Apex: getChatMessages()
│    via Lambda             │    SOQL query with metadata
│                           │
│ 7. Render with            │ 7. enrichMessage() logic
│    button restrictions    │    determines pills
│                           │
│ • Helpful/Escalate        │ 8. Display pills:
│   only on LAST AI msg     │    🔵 Asked AI
│ • Ask AI only on          │    🟢 Satisfied
│   LAST user msg           │    🟠 Escalated
│                           │    ⚫️ Asked Human
│                           │    🔵 Switched to AI
```

## Scenario Flow: AI → Helpful

```
Step 1: Customer asks AI
┌────────────┐
│  Customer  │──► "What is this document about?"
└────────────┘      │
                    ▼
            ┌──────────────┐
            │  Lambda:     │
            │  chat/ask    │
            └──────────────┘
                    │
      ┌─────────────┴─────────────┐
      │                           │
      ▼                           ▼
Creates inbound:              Creates outbound:
- Body__c: "What is..."      - Body__c: "This document..."
- Is_Inbound__c: true        - Is_Inbound__c: false
- Message_Type__c: "Human"   - Message_Type__c: "AI"
- Final_Target__c: "AI"      - AI_Model__c: "claude-3..."

Step 2: Customer clicks "Helpful"
┌────────────┐
│  Customer  │──► Clicks "Helpful" button
└────────────┘      │
                    ▼
            ┌──────────────┐
            │  Lambda:     │
            │  feedback    │
            └──────────────┘
                    │
                    ▼
Updates AI message:
- AI_Helpful__c: true

Step 3: Lawyer views in Salesforce
┌────────────┐
│   Lawyer   │──► Opens Journal record page
└────────────┘      │
                    ▼
            ┌──────────────┐
            │     LWC:     │
            │ chatMessage  │
            │   Viewer     │
            └──────────────┘
                    │
                    ▼
Renders AI message with:
🟢 "Satisfied with AI response"
```

## Scenario Flow: Human → AI Switch

```
Step 1: Customer sends human message
┌────────────┐
│  Customer  │──► Types in Human mode: "I need help"
└────────────┘      │
                    ▼
            ┌──────────────┐
            │  Lambda:     │
            │  chat/send   │
            └──────────────┘
                    │
                    ▼
Creates message:
- Body__c: "I need help"
- Is_Inbound__c: true
- Message_Type__c: "Human"
- Original_Target__c: "Human"
- Final_Target__c: "Human"
- Target_Changed__c: false

Step 2: Customer clicks "Ask AI"
┌────────────┐
│  Customer  │──► Clicks "Ask AI" button on message
└────────────┘      │
                    ▼
            ┌──────────────┐
            │  Lambda:     │
            │  chat/ask    │
            └──────────────┘
                    │
      ┌─────────────┴─────────────┐
      │                           │
      ▼                           ▼
Creates new inbound:          Creates AI response:
- Body__c: "I need help"      - Body__c: "I can help..."
- Original_Target__c: "Human" - Message_Type__c: "AI"
- Final_Target__c: "AI"
- Target_Changed__c: true

Step 3: Lawyer views
┌────────────┐
│   Lawyer   │──► Sees message with pills
└────────────┘      │
                    ▼
            ⚫️ Asked Human
            🔵 Switched to AI
```

## Button Visibility Logic (SPA)

```
┌─────────────────────────────────────────┐
│  renderChat() - Pre-scan Phase          │
└─────────────────────────────────────────┘
            │
            ▼
Loop through chatCache (reverse order)
            │
    ┌───────┴───────┐
    │               │
    ▼               ▼
Find LAST AI     Find LAST user
without feedback    in human mode
    │               │
    │               │
    ▼               ▼
lastAIMessageId   lastUserMessageId
    │               │
    └───────┬───────┘
            │
            ▼
┌─────────────────────────────────────────┐
│  renderChat() - Render Phase            │
└─────────────────────────────────────────┘
            │
            ▼
For each message:
    │
    ├─► IF isAI AND m.id === lastAIMessageId
    │   THEN show Helpful/Escalate buttons
    │
    └─► IF isUser AND m.id === lastUserMessageId
        THEN show Ask AI button

Result: Buttons only on LAST eligible message
```

## Pill Determination Logic (LWC)

```
┌─────────────────────────────────────────┐
│  enrichMessage() - Pill Logic           │
└─────────────────────────────────────────┘
            │
            ▼
Check: Message_Type__c = "Human" AND AI_Escalated__c?
    │ YES: 🔵 Asked AI + 🟠 Escalated
    │
    ▼ NO
Check: Message_Type__c = "AI" AND AI_Helpful__c?
    │ YES: 🟢 Satisfied with AI response
    │
    ▼ NO
Check: Message_Type__c = "AI" AND !AI_Helpful__c AND !AI_Escalated__c?
    │ YES: 🔵 Asked AI
    │
    ▼ NO
Check: Message_Type__c = "Human" AND (Original_Target__c = "Human" OR !Target_Changed__c)?
    │ YES: ⚫️ Asked Human
    │
    ▼ NO
Check: Message_Type__c = "Human" AND Target_Changed__c AND Final_Target__c = "AI"?
    │ YES: ⚫️ Asked Human + 🔵 Switched to AI
    │
    ▼ NO
    No pills (edge case/system message)
```

## Data Flow Summary

1. **Customer Action** → SPA sends request to Lambda
2. **Lambda Processing** → Creates/updates ChatMessage__c with metadata
3. **Salesforce Storage** → Records stored with all interaction fields
4. **Customer View** → SPA queries Lambda, shows buttons on last message only
5. **Lawyer View** → LWC queries Apex, shows pills based on metadata

## Field Dependencies

```
Pill Display Dependencies:

🔵 "Asked AI"
├─ Message_Type__c = "AI"
├─ AI_Helpful__c = false
└─ AI_Escalated__c = false

🟢 "Satisfied with AI response"
├─ Message_Type__c = "AI"
└─ AI_Helpful__c = true

🟠 "Escalated"
├─ Message_Type__c = "Human"
└─ AI_Escalated__c = true

⚫️ "Asked Human"
├─ Message_Type__c = "Human"
└─ Original_Target__c = "Human" OR Target_Changed__c = false

🔵 "Switched to AI"
├─ Message_Type__c = "Human"
├─ Target_Changed__c = true
└─ Final_Target__c = "AI"
```

## Component Integration

```
Journal__c Record Page
┌────────────────────────────────────────┐
│  Journal Details                       │
│  ┌──────────────────────────────┐    │
│  │ Standard Journal Fields       │    │
│  └──────────────────────────────┘    │
│                                        │
│  Related Lists                         │
│  ┌──────────────────────────────┐    │
│  │ journalDocConsole (existing) │    │
│  │ • Upload documents            │    │
│  │ • Manage versions             │    │
│  │ • Set document types          │    │
│  └──────────────────────────────┘    │
│                                        │
│  ┌──────────────────────────────┐    │
│  │ chatMessageViewer (NEW)      │    │
│  │ • Display messages            │    │
│  │ • Show interaction pills      │    │
│  │ • Refresh messages            │    │
│  └──────────────────────────────┘    │
└────────────────────────────────────────┘
```

## Deployment Flow

```
Development                 Testing                Production
─────────────              ─────────              ──────────────

1. Code Changes
   ├─ lambda.py
   ├─ app.js
   ├─ DocShareService.cls
   └─ chatMessageViewer/*
       │
       ▼
2. Local Validation
   └─ No errors ✓
       │
       ▼
3. Deploy to Sandbox  ──►  4. Test All Scenarios
                            ├─ AI → Helpful ✓
                            ├─ AI → Escalated ✓
                            ├─ AI → No feedback ✓
                            ├─ Human → No AI ✓
                            └─ Human → AI ✓
                                │
                                ▼
                           5. QA Approval
                                │
                                ▼
                           6. Deploy to Prod
                              ├─ Lambda
                              ├─ S3 (SPA)
                              ├─ CloudFront
                              └─ Salesforce
                                  │
                                  ▼
                              7. Monitor
                              8. Train Users
```
