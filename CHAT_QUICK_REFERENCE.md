# Document-Specific Chat - Quick Reference

## 🎯 What Changed?

Chat now shows messages **per-document** instead of per-journal, using:
- **Backend**: `Shared_Document__c.Related_Record_ID__c` → `ChatMessage__c.Parent_Record__c`
- **Frontend**: `currentDocumentId` tracks which document is open

---

## 📦 Files Modified

### Backend
- ✅ `lambda.py` (~150 lines changed)
  - `handle_chat_list()` - Added `docId` parameter support
  - `handle_chat_send()` - Added `docId` parameter support
  - `handle_identifier_chat_list()` - NEW endpoint (POST /identifier/chat/list)
  - `handle_identifier_chat_send()` - NEW endpoint (POST /identifier/chat/send)
  - Router - Added 2 new routes

### Frontend
- ✅ `app.js` (~100 lines changed)
  - Added `currentDocumentId` global variable
  - Updated `loadCurrent()` to set `currentDocumentId`
  - Rewrote `fetchChat()` for dual-mode support
  - Rewrote `sendChat()` for dual-mode support
  - Updated `openChatPanel()` to validate document is open
  - Updated `enterPortalUI()` to show chat in both modes
  - Added empty state with emoji to `renderChat()`

- ✅ `texts.js` (6 lines added)
  - `CHAT_EMPTY` - Empty state message (da/sv/en)
  - `CHAT_NO_DOC_WARNING` - Warning when no document open (da/sv/en)

---

## 🔑 Key Endpoints

### Journal Mode
```bash
# List messages for document
GET /chat/list?e={externalId}&t={accessToken}&docId={currentDocumentId}

# Send message to document
POST /chat/send
Body: {
  "externalId": "J12345",
  "accessToken": "token123",
  "docId": "a0X5e000000AbcDE",
  "body": "<p>Message HTML</p>"
}
```

### Identifier Mode
```bash
# List messages for document
POST /identifier/chat/list
Headers: Authorization: Bearer {sessionToken}
Body: {"docId": "a0X5e000000AbcDE"}

# Send message to document
POST /identifier/chat/send
Headers: Authorization: Bearer {sessionToken}
Body: {
  "docId": "a0X5e000000AbcDE",
  "body": "<p>Message HTML</p>"
}
```

---

## 🧪 Quick Test Script

```bash
# 1. Verify Salesforce schema
sf data query -o prod -q "SELECT Id, Related_Record_ID__c FROM Shared_Document__c LIMIT 1" -t

# 2. Test journal mode chat (GET with docId param)
curl "https://API_URL/chat/list?e=TEST&t=TOKEN&docId=a0X..." | jq

# 3. Test identifier mode chat (POST with Bearer)
curl -X POST "https://API_URL/identifier/chat/list" \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"docId":"a0X..."}' | jq
```

---

## ⚠️ Breaking Changes

**NONE** - Fully backward compatible!
- ✅ Existing journal links work unchanged
- ✅ Chat without `docId` parameter still works (uses journal ID)
- ✅ Identifier mode now has chat (was hidden before)

---

## 🚀 Deployment Checklist

- [ ] **Salesforce**: Verify `Related_Record_ID__c` field exists on `Shared_Document__c`
- [ ] **Salesforce**: Verify `Parent_Record__c` field exists on `ChatMessage__c`
- [ ] **Lambda**: Deploy updated `lambda.py` code
- [ ] **API Gateway**: Create 2 new routes (`/identifier/chat/list`, `/identifier/chat/send`)
- [ ] **API Gateway**: Deploy stage to production
- [ ] **SPA**: Upload `app.js` and `texts.js` to S3
- [ ] **CloudFront**: Invalidate cache (`/*`)
- [ ] **Testing**: Test journal mode (regression)
- [ ] **Testing**: Test identifier mode (new chat functionality)
- [ ] **Monitoring**: Watch CloudWatch logs for errors

---

## 📊 Expected User Experience

### Before (WIP)
- **Journal Mode**: Chat visible, shows ALL messages for journal
- **Identifier Mode**: Chat hidden (intentionally disabled)

### After (NEW)
- **Journal Mode**: Chat visible, shows messages for **current document** only
- **Identifier Mode**: Chat visible, shows messages for **current document** only
- **Both Modes**: Switching documents → Chat updates to show new document's messages
- **Both Modes**: Chat before opening document → Warning: "Please open a document first"

---

## 🔍 Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Empty chat (but messages exist) | `Related_Record_ID__c` is null | Update `Shared_Document__c` record with correct parent ID |
| 401 Unauthorized (identifier) | Session expired | User must re-verify OTP to get new token |
| Messages from wrong document | Cache not cleared | Already fixed - `openChatPanel()` clears cache |
| Chat FAB not visible | CSS/JS error | Check browser console for errors |

---

## 📞 Support

**Questions?** Contact:
- **Engineering**: @eng-lead (Slack)
- **DevOps**: @ops-lead (Slack)
- **Salesforce**: @sf-admin (Slack)

**Deployment Issues?** See `CHAT_IMPLEMENTATION_SUMMARY.md` for detailed troubleshooting.

---

**Status**: ✅ READY FOR DEPLOYMENT  
**Last Updated**: October 18, 2025  
**Version**: 1.0.0
