# 🚀 Quick Deployment Guide

## ⚡ Quick Start (5 Minutes)

### 1. Create Salesforce Fields (2 min)
Go to Salesforce Setup → Object Manager → Message__c (your message object):

1. **Original_Target__c** - Picklist with values: `AI`, `Human`
2. **Final_Target__c** - Picklist with values: `AI`, `Human`
3. **Target_Changed__c** - Checkbox

See `SALESFORCE_FIELDS_UPDATE.md` for detailed specs.

### 2. Update Lambda (2 min)
Add to your Lambda message handler:
```python
original_target = request_body.get('originalTarget', 'Human')
final_target = request_body.get('finalTarget', 'Human')
target_changed = request_body.get('targetChanged', False)

message_data = {
    # ... existing fields ...
    'Original_Target__c': original_target,
    'Final_Target__c': final_target,
    'Target_Changed__c': target_changed
}
```

### 3. Deploy Files (1 min)
Copy these files from `vscode attempt` to production:
- `app.js`
- `index.html`
- `styles.css`

### 4. Test (1 min)
- [ ] Open chat - see modern design ✨
- [ ] Send AI message - see thinking indicator
- [ ] Click "Spørg jurist" - escalates to human
- [ ] Send human message - see "Spørg AI" button
- [ ] Click "Spørg AI" - AI responds

---

## ✅ What Changed

### User-Facing
- ✨ Modern chat design (purple gradients, smooth animations)
- 🤖 "Ask AI" button on human messages (NEW!)
- 📱 Better mobile experience
- 🎯 Visible expand button

### Backend
- 📊 Routing analytics (originalTarget, finalTarget, targetChanged)
- 🔄 Bidirectional mode switching (AI ↔ Human)
- 🎨 Message_Type__c explicitly set for human messages

---

## 🧪 Quick Test

1. **AI Mode Test:**
   - Select "AI-assistent"
   - Ask: "Hvad er dette dokument?"
   - Should see: Thinking → AI answer → Feedback buttons
   - Check Salesforce: `Original_Target__c=AI`, `Target_Changed__c=false`

2. **"Ask AI" Test:**
   - Select "Jurist"
   - Type: "Test message"
   - Click "🤖 Spørg AI om dette"
   - Should see: Thinking → AI answer
   - Check Salesforce: `Original_Target__c=Human`, `Final_Target__c=AI`, `Target_Changed__c=true`

3. **Escalation Test:**
   - AI mode → Ask question
   - Click "⬆️ Spørg jurist"
   - Check Salesforce: `Original_Target__c=AI`, `Final_Target__c=Human`, `Target_Changed__c=true`

---

## 📋 Full Documentation

- **DESIGN_OVERHAUL_COMPLETE.md** - Complete summary of all changes
- **BEFORE_AFTER_COMPARISON.md** - Visual before/after comparison
- **SALESFORCE_FIELDS_UPDATE.md** - Salesforce field specifications
- **DEPLOYMENT_CHECKLIST.md** - Comprehensive deployment checklist

---

## 🆘 Troubleshooting

**Problem:** Chat button not visible
- **Fix:** Clear cache (Ctrl+F5), verify `chatPillBtn` in HTML

**Problem:** "Ask AI" doesn't work
- **Fix:** Check console, verify Lambda endpoint `/identifier/chat/ask`

**Problem:** Salesforce fields empty
- **Fix:** Verify field names match, check Lambda is sending data

**Problem:** Design looks broken
- **Fix:** Clear cache, check styles.css loaded, no CSS conflicts

---

## 📞 Need Help?

Check these files in order:
1. `DESIGN_OVERHAUL_COMPLETE.md` - What was done
2. `DEPLOYMENT_CHECKLIST.md` - Step-by-step deployment
3. `SALESFORCE_FIELDS_UPDATE.md` - Field specifications
4. Browser console (F12) - JavaScript errors
5. Lambda CloudWatch logs - Backend errors

---

**Status:** ✅ Ready to deploy!
**Estimated time:** 5-10 minutes
**Risk level:** Low (backward compatible, well-tested)

🎉 **Your chat is about to get a major upgrade!**
