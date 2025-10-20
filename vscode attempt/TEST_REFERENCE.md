# Quick Test Reference Card

## 🧪 Test Scenarios for 6 Bug Fixes

### Test 1: Phone Normalization (Fix #1)
**Steps:**
1. Open the portal
2. Select "Telefon" (Phone)
3. Ensure Denmark (🇩🇰 +45) is selected
4. Paste: `+4542455150` into the phone input
5. Click "Send kode" (Send code)

**Expected Result:**
```json
{
  "channel": "phone",
  "market": "DFJ_DK", 
  "phone": "+4542455150",
  "phoneDigits": "4542455150",
  "country": "DK"
}
```
✅ No duplicated `45` prefix

---

### Test 2: OTP Record Creation (Fix #2)
**Steps:**
1. Enter an email that doesn't exist in Salesforce (e.g., `test99999@nonexistent.com`)
2. Click "Send kode"
3. Check Salesforce for OTP__c record

**Expected Result:**
- API returns `{"ok": true}`
- OTP__c record exists with:
  - `Purpose__c = "DocumentPortal"`
  - `Status__c = "Pending"`
  - `Identifier_Value__c = "test99999@nonexistent.com"`
  - `Code__c = "123456"` (6-digit code)
- User can proceed to verify step
- Entering the correct OTP code succeeds

---

### Test 3: PDF Inline Display (Fix #3)
**Steps:**
1. Complete OTP verification
2. View documents list
3. Click on a document

**Expected Result:**
- PDF displays **inline** in the iframe (no download prompt)
- PDF is visible in the viewer
- "Download" button still works when clicked
- "Print" button still works when clicked

---

### Test 4: PDF Viewer Visibility (Fix #4)
**Steps:**
1. Complete OTP verification
2. Check if document viewer is visible

**Expected Result:**
- ✅ Viewer card is visible
- ✅ Documents list appears in sidebar
- ✅ First document loads automatically (if any exist)
- ✅ No CSS hiding the viewer

---

### Test 5: Hide Help Text (Fix #5)
**Steps:**
1. Start on identifier entry screen
2. Check visibility of subtitle paragraph
3. Enter phone/email and send OTP
4. Check visibility on verify screen
5. Click "Start forfra"
6. Check visibility again

**Expected Result:**
- **Step 1 (Identifier Entry):** 
  - ✅ Subtitle visible: "Indtast dit mobilnummer eller e-mail..."
  - ✅ Phone/Email chooser visible
- **Step 2 (Verify OTP):** 
  - ❌ Subtitle hidden
  - ❌ Phone/Email chooser hidden
  - ✅ Only OTP input and verify button visible
- **After "Start forfra":** 
  - ✅ Back to Step 1, subtitle visible again

---

### Test 6: "Start forfra" Button Position (Fix #6)
**Steps:**
1. Enter identifier and proceed to verify step
2. Observe "Start forfra" button position

**Expected Result:**
- ✅ Button positioned in **top-right corner** of OTP card
- ✅ Button has ~12px margin from top and right edges
- ✅ Button doesn't overlap with other content
- ✅ Clicking button works correctly (returns to Step 1)

---

## 🌍 Multi-Market Tests

### Denmark (DK)
- Phone: `+4542455150` → `4542455150`
- Double: `4545421234` → `4542455150`

### Sweden (SE)  
- Phone: `+46701234567` → `46701234567`
- Double: `4646701234567` → `46701234567`

### Ireland (IE)
- Phone: `+353851234567` → `353851234567`
- Double: `353353851234567` → `353851234567`

---

## 🔍 Browser DevTools Checks

### Network Tab - Request OTP Payload:
```javascript
// Correct payload for phone:
{
  "channel": "phone",
  "market": "DFJ_DK",
  "phone": "+4542455150",
  "phoneDigits": "4542455150", 
  "country": "DK"
}

// Correct payload for email:
{
  "channel": "email",
  "market": "DFJ_DK",
  "email": "user@example.com"
}
```

### S3 Presigned URL Parameters:
```
?response-content-disposition=inline;%20filename%3D%22document.pdf%22
&response-content-type=application%2Fpdf
&X-Amz-Algorithm=AWS4-HMAC-SHA256
...
```
✅ Must contain `inline` not `attachment`
✅ Must specify `application/pdf` content type

### Console Checks:
```javascript
// After verify step:
window.sessionToken // Should contain JWT-like token

// Check hidden elements:
document.querySelector('[data-i18n="OTP_SUBTITLE"]').classList.contains('hidden') // true
document.getElementById('idChooser').classList.contains('hidden') // true
```

---

## 🚨 Edge Cases

1. **Paste phone with spaces/dashes:**
   - Input: `+45 42 45 51 50`
   - Result: Normalized to `+4542455150` ✅

2. **Paste with country code only (no +):**
   - Input: `4542455150` with DK selected
   - Result: `+4542455150` ✅

3. **Paste 00 format:**
   - Input: `004542455150`
   - Result: `+4542455150` ✅

4. **No match in SF, valid OTP:**
   - OTP record created ✅
   - User can verify ✅
   - Shows "no documents" message ✅

---

## ✅ Success Criteria

All tests pass when:
- [ ] No phone duplication occurs
- [ ] OTP records always created (match or no match)
- [ ] PDFs display inline, never auto-download
- [ ] Viewer is visible after login
- [ ] Help text hides during verify step
- [ ] "Start forfra" button in top-right corner
- [ ] No JavaScript errors in console
- [ ] No failed API calls (400/500 errors)
- [ ] Works in DK, SE, and IE markets

---

**Testing Duration:** ~15 minutes  
**Required Access:** Portal URL + Salesforce OTP__c object access  
**Browser:** Chrome/Edge/Firefox (latest)
