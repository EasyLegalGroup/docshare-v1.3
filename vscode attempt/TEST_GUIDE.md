# 🧪 Post-Deployment Testing Guide

**Version**: v1.3  
**Time Required**: 30-45 minutes  
**Environments**: DK, SE, IE

---

## Testing Checklist Overview

- [ ] Lambda Function Health Check
- [ ] Identifier-Based Access (All Markets)
- [ ] Journal Link Access (Legacy Flow)
- [ ] Multi-Journal Selection
- [ ] Document Operations
- [ ] Chat Functionality
- [ ] LWC Component
- [ ] Cross-Browser Testing
- [ ] Mobile Testing

---

## 1. Lambda Function Health Check

### Test: Basic Lambda Connectivity
```
Action: Open any DocShare URL
Expected: Page loads without errors
Check: Browser console shows no 5xx errors
```

### Test: Lambda Timeout Configuration
```
Action: Check AWS Lambda configuration
Expected: Timeout set to 30 seconds (not default 3 seconds)
Verify: AWS Console → Lambda → Configuration → General
```

**✅ PASS**: Page loads successfully  
**❌ FAIL**: 500 errors or timeout errors → Check Lambda logs

---

## 2. Identifier-Based Access (All Markets)

### Test 2.1: Danish Market - Phone Access
```
1. Navigate to: https://[your-cloudfront-url]/?brand=DK
2. Select country: "Danmark (+45)"
3. Enter phone: 42455150 (without country code)
4. Click "Send Code"
5. Check Salesforce: OTP__c record created with normalized phone (+4542455150)
6. Enter OTP code from Salesforce
7. Click "Verify"
```

**Expected Results**:
- ✅ OTP sent successfully
- ✅ Code verification successful
- ✅ Journal overview or documents displayed
- ✅ No console errors

**✅ PASS**: All steps complete  
**❌ FAIL**: Error at any step → Check Lambda logs and Salesforce OTP records

---

### Test 2.2: Swedish Market - Email Access
```
1. Navigate to: https://[your-cloudfront-url]/?brand=SE
2. Select "E-post"
3. Enter email: test@example.com
4. Click "Skicka kod"
5. Check Salesforce: OTP__c record created with email
6. Enter OTP code from Salesforce
7. Click "Verifiera"
```

**Expected Results**:
- ✅ OTP created with email identifier
- ✅ Swedish translations display correctly
- ✅ Verification successful

---

### Test 2.3: Irish Market - International Phone
```
1. Navigate to: https://[your-cloudfront-url]/?brand=IE
2. Select country: "Ireland (+353)"
3. Paste full international number: +353871234567
4. Click "Send Code"
5. Verify: No phone number duplication (should be +353871234567, not +353353871234567)
```

**Expected Results**:
- ✅ Phone normalized correctly
- ✅ No duplication when pasting international format

---

## 3. Journal Link Access (Legacy Flow)

### Test: Email Link Still Works
```
1. Get existing journal link format: ?e=[externalId]&t=[accessToken]
2. Open link in browser
3. Verify: Documents load immediately (no OTP screen)
```

**Expected Results**:
- ✅ Bypasses identifier flow
- ✅ Documents display immediately
- ✅ Existing workflows unaffected

**✅ PASS**: Legacy links work  
**❌ FAIL**: Redirects to OTP screen → Check token validation logic

---

## 4. Multi-Journal Selection

### Test 4.1: User with Multiple Journals
```
1. Use identifier with documents in 2+ journals
2. Complete OTP verification
3. Observe: Journal overview page displays
4. Check: Each journal card shows correct document count
5. Click: Select first journal
6. Verify: Only documents from that journal display
7. Click: "← Back to Overview" button
8. Verify: Returns to journal selection
9. Click: Select different journal
10. Verify: Different set of documents loads
```

**Expected Results**:
- ✅ Journal cards display with logos
- ✅ Document counts accurate
- ✅ Back button appears in sidebar
- ✅ Documents filter correctly by journal

---

### Test 4.2: User with Single Journal
```
1. Use identifier with documents in only 1 journal
2. Complete OTP verification
3. Observe: Journal overview shows single journal card
4. Click: Select the journal
5. Verify: Documents display, no back button needed
```

**Expected Results**:
- ✅ Single journal selection works
- ✅ No errors with single-journal users

---

## 5. Document Operations

### Test 5.1: View Document
```
1. Navigate to any document list
2. Click: Any pending document
3. Verify: PDF loads in iframe (no auto-download)
4. Check: Download button present
5. Check: Approve button present (if pending)
```

**Expected Results**:
- ✅ PDF renders inline
- ✅ No console errors
- ✅ Buttons functional

---

### Test 5.2: Approve Document
```
1. Click: "Approve" button on pending document
2. Observe: Confirmation modal appears
3. Click: "Approve" in modal
4. Verify: Document moves to "Approved" section
5. Verify: Green checkmark appears
6. Check Salesforce: Document_Approval_Status__c = 'Approved'
```

**Expected Results**:
- ✅ Approval persists
- ✅ UI updates immediately
- ✅ Salesforce record updated

---

### Test 5.3: Download Document
```
1. Click: "Download" button
2. Verify: File downloads to browser
3. Check: Filename matches document title
```

**Expected Results**:
- ✅ Download initiates
- ✅ File is valid PDF

---

## 6. Chat Functionality

### Test 6.1: Chat Disclaimer Banner
```
1. Open chat panel
2. Verify: Yellow disclaimer banner at top
3. Read: "This chat is not live. We aim to reply within 2 business days"
4. Click: Close (X) button
5. Refresh page
6. Open chat again
7. Verify: Disclaimer does not reappear
```

**Expected Results**:
- ✅ Disclaimer shows on first chat open
- ✅ Dismissal persists across sessions
- ✅ LocalStorage key: dfj_chat_disclaimer_dismissed = "true"

---

### Test 6.2: Send Chat Message
```
1. Select any journal
2. Open chat panel
3. Type message: "Test message"
4. Click: Send
5. Verify: Message appears in chat
6. Check Salesforce: ChatMessage__c record created
7. Verify: Parent_Record__c = Journal__c.Id (not document ID)
```

**Expected Results**:
- ✅ Message sent successfully
- ✅ Appears in chat immediately
- ✅ Linked to journal, not document

---

### Test 6.3: Chat Persists Across Documents
```
1. Send chat message while viewing Document A
2. Click: Document B in sidebar
3. Open chat panel
4. Verify: Previous message still visible
5. Send: New message
6. Return to: Document A
7. Open chat
8. Verify: Both messages visible
```

**Expected Results**:
- ✅ Chat scoped to journal, not document
- ✅ Messages persist across document changes

---

## 7. LWC Component Testing (Salesforce)

### Test 7.1: Document Sorting in LWC
```
1. Log into Salesforce
2. Navigate to: Journal__c record
3. Open: journalDocConsole component
4. Verify: Sort dropdown present
5. Select: "A-Z"
6. Verify: Documents sorted alphabetically
7. Select: "Newest First"
8. Verify: Documents sorted by creation date
```

**Expected Results**:
- ✅ All sort options work
- ✅ Sort persists during session

---

### Test 7.2: Launch Portal from LWC
```
1. In journalDocConsole component
2. Click: "Launch Portal" button
3. Verify: New tab opens
4. Verify: Portal loads with documents (no OTP screen)
5. Check URL: Contains ?e=[externalId]&t=[accessToken]
```

**Expected Results**:
- ✅ Portal opens in new tab
- ✅ Auto-authenticated (no OTP required)
- ✅ All documents visible

---

## 8. Cross-Browser Testing

### Test on Each Browser
- [ ] **Chrome** (latest)
- [ ] **Safari** (latest)
- [ ] **Firefox** (latest)
- [ ] **Edge** (latest)

**For Each Browser**:
1. Test OTP flow
2. View 1 PDF
3. Send 1 chat message
4. Approve 1 document

**Expected Results**:
- ✅ Consistent behavior across all browsers
- ✅ No browser-specific errors

---

## 9. Mobile Testing

### Test on Mobile Devices
- [ ] **iOS Safari**
- [ ] **Android Chrome**

**Mobile Test Steps**:
```
1. Access portal on mobile browser
2. Complete OTP flow (phone number entry)
3. Select journal
4. View document (PDF should be scrollable/zoomable)
5. Open chat (should be responsive)
6. Send message
```

**Expected Results**:
- ✅ Responsive layout
- ✅ Touch interactions work
- ✅ PDF viewer functional on mobile

---

## 10. Translation Testing

### Test Each Market
- [ ] **Denmark (DK)**: All text in Danish
- [ ] **Sweden (SE)**: All text in Swedish
- [ ] **Ireland (IE)**: All text in English

**Check Translations For**:
- OTP screen labels
- Button text
- Error messages
- Chat disclaimer
- Document states (Pending/Approved)

**Expected Results**:
- ✅ No English text on DK/SE sites
- ✅ Consistent terminology

---

## Common Issues and Solutions

### Issue: OTP Not Received
**Check**:
1. Salesforce OTP__c record created?
2. Phone/email normalized correctly?
3. Lambda logs for errors?

**Solution**: Verify Salesforce connectivity and phone normalization

---

### Issue: Chat Messages Not Sending
**Check**:
1. Browser console for errors
2. Lambda logs for API failures
3. Salesforce ChatMessage__c permissions

**Solution**: Check Salesforce API credentials in Lambda env vars

---

### Issue: PDF Not Loading
**Check**:
1. S3 presigned URL generation
2. CORS configuration on S3 bucket
3. Browser console for CSP errors

**Solution**: Verify S3 bucket policy and Lambda s3_presign_get() function

---

### Issue: Journal Selection Not Showing
**Check**:
1. User has documents in multiple journals?
2. Lambda response includes `journals` array?
3. Browser console for JavaScript errors

**Solution**: Check Lambda handle_identifier_list() logic

---

## Test Sign-Off

**Tester Name**: ___________________________  
**Date**: ___________________________  
**Environment**: ___________________________

**Results**:
- [ ] All tests passed
- [ ] Some tests failed (see notes below)
- [ ] Deployment approved
- [ ] Rollback required

**Notes**:
```
[Add any issues found or observations here]
```

---

## Emergency Contacts

**If Critical Issues Found**:
1. **DO NOT PROCEED** with full rollout
2. Consult ROLLBACK_GUIDE.md
3. Contact technical lead
4. Document issues in test notes

---

**Testing Complete?** Proceed to full production rollout or consult ROLLBACK_GUIDE.md if issues found.
