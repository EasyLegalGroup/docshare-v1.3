# New Salesforce Fields for Chat Routing

## Fields to Create on ChatMessage__c

### 1. Original_Target__c (Picklist)
- **API Name**: `Original_Target__c`
- **Type**: Picklist
- **Values**: 
  - `AI`
  - `Human`
- **Description**: The initial target the user selected when composing the message
- **Required**: No
- **Default**: None

### 2. Final_Target__c (Picklist)
- **API Name**: `Final_Target__c`
- **Type**: Picklist
- **Values**:
  - `AI`
  - `Human`
- **Description**: The final target after user potentially switched modes
- **Required**: No
- **Default**: None

### 3. Target_Changed__c (Checkbox)
- **API Name**: `Target_Changed__c`
- **Type**: Checkbox
- **Description**: True if user switched from original target to different target before sending
- **Default**: False

## Usage Examples

### Scenario 1: User composes in AI mode, sends to AI
```javascript
Original_Target__c: "AI"
Final_Target__c: "AI"
Target_Changed__c: false
Message_Type__c: "Human" (inbound question)
```

### Scenario 2: User composes in AI mode, clicks "Spørg jurist" instead
```javascript
Original_Target__c: "AI"
Final_Target__c: "Human"
Target_Changed__c: true
Message_Type__c: "Human" (inbound question)
```

### Scenario 3: User composes in Human mode, clicks "Ask AI" instead
```javascript
Original_Target__c: "Human"
Final_Target__c: "AI"
Target_Changed__c: true
Message_Type__c: "Human" (inbound question)
```

### Scenario 4: User composes in Human mode, sends to Human
```javascript
Original_Target__c: "Human"
Final_Target__c: "Human"
Target_Changed__c: false
Message_Type__c: "Human" (inbound question)
```

## Benefits

1. **Analytics**: Track how often users switch between AI and Human
2. **UX Insights**: Understand if mode selection is intuitive
3. **Quality Metrics**: See if AI answers lead to more human escalations
4. **Workflow Optimization**: Identify patterns in user behavior
