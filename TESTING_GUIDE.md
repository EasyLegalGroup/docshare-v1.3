# Complete Testing Guide

## Pre-Testing Setup

1. Deploy updated `app.js` with Issues 1 and 5 fixes
2. Deploy updated `styles.css` with Issue 6 fix
3. Deploy updated `lambda.mjs` with Issues 2 and 3 fixes
4. Clear browser cache and cookies
5. Open browser DevTools (F12) → Network tab

---

## Issue 1: Phone Normalization Duplication

### Test Case 1.1: Paste Full International Number (Denmark)
**Steps:**
1. Navigate to the identifier page
2. Ensure "Telefon" tab is selected
3. Ensure "Denmark (+45)" is selected in country picker
4. Paste `+4542455150` into phone input field
5. Click "Send kode" / "Send code"

**Expected Results:**
- Network tab shows POST to `/identifier/request-otp`
- Request payload: 
  ```json
  {
    "channel": "phone",
    "market": "DFJ_DK",
    "phone": "+4542455150",
    "phoneDigits": "4542455150",
    "country": "DK"
  }
  ```
- **NOT** `"phone": "+454542455150"` ❌
- Success message appears
- UI moves to verify step

### Test Case 1.2: Paste Full International Number (Sweden)
**Steps:**
1. Navigate to identifier page
2. Select "Telefon" tab
3. Select "Sweden (+46)" from country picker
4. Paste `+46701234567` into phone input
5. Click "Send kode"

**Expected Results:**
- Request payload:
  ```json
  {
    "channel": "phone",
    "market": "FA_SE",
    "phone": "+46701234567",
    "phoneDigits": "46701234567",
    "country": "SE"
  }
  ```
- **NOT** `"phone": "+4646701234567"` ❌

### Test Case 1.3: Type Local Number (Normal Flow)
**Steps:**
1. Navigate to identifier page
2. Select "Denmark (+45)"
3. Type `42 45 51 50` (with spaces)
4. Click "Send kode"

**Expected Results:**
- Request payload:
  ```json
  {
    "channel": "phone",
    "market": "DFJ_DK",
    "phone": "+4542455150",
    "phoneDigits": "4542455150",
    "country": "DK"
  }
  ```
- Same as pasting full number

### Test Case 1.4: Paste Number Starting with 00
**Steps:**
1. Select "Denmark (+45)"
2. Paste `004542455150`
3. Click "Send kode"

**Expected Results:**
- Converted to `+4542455150`
- Same payload as Test 1.1

### Test Case 1.5: Paste Local Digits Only
**Steps:**
1. Select "Denmark (+45)"
2. Paste `42455150` (8 digits, no prefix)
3. Click "Send kode"

**Expected Results:**
- Prepended to `+4542455150`
- Same payload as Test 1.1

---

## Issue 2: Always Create OTP Record

### Test Case 2.1: Non-Existent Phone Number
**Steps:**
1. Navigate to identifier page
2. Select "Denmark (+45)"
3. Enter phone: `99 99 99 99` (doesn't exist in Salesforce)
4. Click "Send kode"
5. Check Salesforce Org

**Expected Results:**
- Frontend: Success message + moves to verify step
- Network: POST returns 200 OK
- **Salesforce:** OTP record created with:
  - Code: 6-digit number
  - Channel: `phone`
  - Identifier: `+4599999999`
  - Person/Contact lookups: `null` or empty
  - Expires_At: ~10 minutes from now
  - Used: `false`

### Test Case 2.2: Non-Existent Email
**Steps:**
1. Navigate to identifier page
2. Click "E-mail" tab
3. Enter: `nonexistent@test.com`
4. Click "Send kode"
5. Check Salesforce

**Expected Results:**
- Frontend: Success message + moves to verify step
- **Salesforce:** OTP record created with:
  - Code: 6-digit number
  - Channel: `email`
  - Identifier: `nonexistent@test.com`
  - Person/Contact lookups: `null` or empty

### Test Case 2.3: Existing Phone Number
**Steps:**
1. Use a phone number that EXISTS in Salesforce
2. Request OTP
3. Check Salesforce

**Expected Results:**
- OTP record created with:
  - Code: 6-digit number
  - Person/Contact lookups: **populated** with matching record IDs
  - All other fields same as 2.1

### Test Case 2.4: Verify Non-Existent Identifier OTP
**Steps:**
1. Complete Test 2.1 (non-existent phone)
2. Retrieve OTP code from Salesforce
3. Enter code in UI
4. Click "Verificer" / "Verify"

**Expected Results:**
- Verification succeeds (200 OK)
- UI shows "No documents" message or empty document list
- Does NOT show error about invalid identifier

---

## Issue 3: Stop Auto-Downloads, Render Inline

### Test Case 3.1: View Document Inline
**Steps:**
1. Complete OTP verification with an identifier that has documents
2. Click on a document in the sidebar
3. Observe browser behavior

**Expected Results:**
- PDF renders **inside the iframe** on the page
- File does **NOT** auto-download to Downloads folder
- PDF toolbar appears (zoom, navigate, etc.)
- URL in iframe contains `#toolbar=0&zoom=150`

### Test Case 3.2: Check Network Response
**Steps:**
1. Open DevTools → Network tab
2. Click on a document
3. Find the S3 presigned URL request
4. Click on it → Headers tab

**Expected Response Headers:**
```
Content-Type: application/pdf
Content-Disposition: inline; filename="document_name.pdf"
```
- **NOT** `Content-Disposition: attachment; ...` ❌

### Test Case 3.3: Manual Download Button
**Steps:**
1. View a document (rendering inline)
2. Click "Download" / "Hent" button

**Expected Results:**
- File downloads to Downloads folder
- Filename matches document name
- PDF opens in external PDF viewer when clicked

### Test Case 3.4: Manual Print Button
**Steps:**
1. View a document (rendering inline)
2. Click "Print" / "Udskriv" button

**Expected Results:**
- Browser print dialog opens
- Print preview shows the PDF
- Can print or save as PDF

### Test Case 3.5: Multiple Documents
**Steps:**
1. Click document A → renders inline
2. Click document B → renders inline
3. Click Download button → downloads B
4. Click document A again
5. Click Print button → prints A

**Expected Results:**
- Each document renders inline when clicked
- Download/Print operate on currently viewed document
- No auto-downloads at any point

---

## Issue 4: Ensure PDF Viewer Appears

### Test Case 4.1: Verify Viewer Visibility
**Steps:**
1. Complete OTP verification
2. Click on first document

**Expected Results:**
- `.viewer-container` element is visible (not `.hidden`)
- `#pdf` iframe is visible inside `.viewer-wrap`
- Iframe has non-zero height (check with DevTools)
- PDF content is rendered

### Test Case 4.2: Check Console for Errors
**Steps:**
1. Open DevTools → Console tab
2. Click on a document

**Expected Results:**
- No errors about iframe loading
- No CORS errors
- No errors about presigned URL

---

## Issue 5: Hide Identifier Help Text After OTP Entry

### Test Case 5.1: Help Text Hidden on Verify Step
**Steps:**
1. Navigate to identifier page
2. Observe the subtitle text with instructions
3. Enter phone/email
4. Click "Send kode"
5. Observe UI after transition

**Expected Results:**
- **Before:** Subtitle `[data-i18n="OTP_SUBTITLE"]` is **visible**
- **After:** Subtitle is **hidden** (has `.hidden` class or `display: none`)
- ID chooser (phone/email tabs) is also **hidden**
- Only OTP input and verify button visible

### Test Case 5.2: Help Text Shown on Return
**Steps:**
1. Complete Test 5.1 (on verify step)
2. Click "Start forfra" / "Start over" button

**Expected Results:**
- UI returns to identifier step
- Subtitle text is **visible again**
- Phone/email chooser is **visible again**
- OTP input is **hidden**

### Test Case 5.3: Multiple Transitions
**Steps:**
1. Identifier step → Verify step → Identifier step → Verify step

**Expected Results:**
- Each transition correctly shows/hides subtitle
- No visual glitches or orphaned elements

---

## Issue 6: Move "Start forfra" to Top-Right Corner

### Test Case 6.1: Button Position on Verify Step
**Steps:**
1. Navigate to identifier page
2. Enter phone/email and request OTP
3. Observe verify step layout

**Expected Results:**
- "Start forfra" button is in **top-right corner** of OTP card
- Button has `danger` styling (red/pink)
- Button does NOT overlap with:
  - OTP title
  - Subtitle text
  - OTP input field
- Card has sufficient top padding (~56px)

### Test Case 6.2: Responsive Layout (Mobile)
**Steps:**
1. Resize browser to 375px width (iPhone size)
2. Navigate to verify step
3. Observe button position

**Expected Results:**
- Button still in top-right corner
- Readable and clickable
- No overflow or wrapping issues

### Test Case 6.3: Button Functionality
**Steps:**
1. On verify step, click "Start forfra" button

**Expected Results:**
- Returns to identifier step
- Phone/email input is cleared
- State is reset (can request new OTP)

---

## Issue 6: Visual Verification (CSS)

### Test Case 6.4: Inspect CSS
**Steps:**
1. Open DevTools → Elements tab
2. Navigate to verify step
3. Inspect `.otp-card` element

**Expected CSS:**
```css
.otp-card {
  position: relative;
  padding-top: 56px;
  /* ... other styles */
}
```

4. Inspect `.verify-header` element

**Expected CSS:**
```css
.verify-header {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  justify-content: flex-end;
  /* ... other styles */
}
```

---

## Cross-Browser Testing

Test all 6 issues in:
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari (macOS/iOS)

---

## Market-Specific Testing

Test all flows with each market:

### Denmark (DFJ_DK)
- Brand: Din Familiejurist
- Language: Danish (da)
- Default country: DK (+45)
- Phone format: 8 digits

### Sweden (FA_SE)
- Brand: Din Familjejurist
- Language: Swedish (sv)
- Default country: SE (+46)
- Phone format: 9-10 digits, starts with 70/72/73/76

### Ireland (Ireland)
- Brand: Here's Law
- Language: English (en)
- Default country: IE (+353)
- Phone format: 9 digits, starts with 8

---

## Regression Testing

Ensure existing functionality still works:

1. **Journal Flow** (with `?e=xxx&t=xxx` query params)
   - OTP verification
   - Document list
   - Approve documents
   - Chat functionality

2. **Brand Detection**
   - Auto-detect from domain
   - Override with `?brand=dk|se|ie`
   - Logo/favicon swap
   - Language switching

3. **Translations**
   - All i18n keys render correctly
   - Dynamic `{btn}` substitution works
   - FAQ accordion content

4. **Tour Feature**
   - First-time tour triggers
   - Can re-launch tour
   - Tooltips position correctly

5. **Modals**
   - Intro video modal
   - FAQ modal
   - Completion modal
   - Approval confirmation

---

## Performance Testing

1. **Large Document Lists**
   - 20+ documents load correctly
   - Sidebar scrolls smoothly
   - No memory leaks

2. **PDF Rendering**
   - Large PDFs (10+ MB) render without timeout
   - No crashes or hangs

3. **Network Conditions**
   - Slow 3G: graceful loading states
   - Offline: appropriate error messages

---

## Security Testing

1. **OTP Expiration**
   - Expired OTP codes rejected
   - Can request new code

2. **OTP Reuse**
   - Used OTP codes cannot be reused
   - Marked as `Used: true` in Salesforce

3. **Presigned URL Expiration**
   - URLs expire after 1 hour
   - Can request new URL

---

## Edge Cases

1. **Special Characters in Filename**
   - Document with name: `Test & Document (2024).pdf`
   - Should download as: `Test___Document__2024_.pdf`

2. **Very Long Phone Numbers**
   - Input: `+4512345678901234`
   - Should validate and reject

3. **Invalid Email Formats**
   - `test@` → rejected
   - `@test.com` → rejected
   - `test@test` → rejected

4. **Rapid Clicks**
   - Click "Send kode" multiple times rapidly
   - Should only send one request (debounce)

5. **Browser Back Button**
   - Navigate: ID → Verify → Documents
   - Press back
   - Should maintain state correctly

---

## Success Criteria Summary

✅ **Issue 1:** Pasting `+4542455150` results in payload `{"phone":"+4542455150"}`, not `"+454542455150"`

✅ **Issue 2:** Non-existent phone `+4599999999` creates OTP record in Salesforce with null lookups

✅ **Issue 3:** PDFs render inline in iframe; no auto-downloads; Download/Print buttons work

✅ **Issue 4:** PDF viewer visible and functional (no additional fixes needed)

✅ **Issue 5:** Help text hidden on verify step, shown on identifier step

✅ **Issue 6:** "Start forfra" button in top-right corner of OTP card

✅ **No Regressions:** All existing features still work (journal flow, chat, modals, tour, etc.)

✅ **All Markets:** DK, SE, IE all function correctly

✅ **All Browsers:** Chrome, Firefox, Safari all render correctly
