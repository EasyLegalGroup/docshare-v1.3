# System Flow Diagram - Bug Fixes Applied

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER ENTERS PORTAL                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    STEP 1: IDENTIFIER ENTRY                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  📱 Phone Option           📧 Email Option                  │ │
│  │  ┌──────────────┐          ┌──────────────┐                │ │
│  │  │ Country: DK  │          │ Email Input  │                │ │
│  │  │ Input: Phone │          │              │                │ │
│  │  └──────────────┘          └──────────────┘                │ │
│  │                                                              │ │
│  │  ✅ FIX #1: Smart Phone Detection                           │ │
│  │  • Detects +45... (full e164)                              │ │
│  │  • Detects 45... (has dial code)                           │ │
│  │  • Detects 42455150 (local only)                           │ │
│  │  • NO DUPLICATION on paste                                 │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  📝 Help Text: "Indtast dit mobilnummer eller e-mail..."        │
│     ✅ FIX #5: Visible here, hidden in Step 2                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ [User Clicks "Send kode"]
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   API: /identifier/request-otp                   │
│                                                                  │
│  Payload:                                                        │
│  {                                                               │
│    "channel": "phone",                                           │
│    "market": "DFJ_DK",                                           │
│    "phone": "+4542455150",     ← ✅ FIX #1: No duplication      │
│    "phoneDigits": "4542455150",                                  │
│    "country": "DK"                                               │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LAMBDA: request-otp Handler                   │
│                                                                  │
│  1. Check if identifier exists in Salesforce                     │
│     └─ Query Shared_Document__c by email/phone                   │
│                                                                  │
│  2. ✅ FIX #2: ALWAYS Create OTP__c Record                       │
│     (Even if no match found)                                     │
│     ┌─────────────────────────────────────┐                     │
│     │ OTP__c Fields:                      │                     │
│     │ • Purpose__c = "DocumentPortal"     │                     │
│     │ • Identifier_Type__c = "Phone"      │                     │
│     │ • Identifier_Value__c = "+4542..."  │                     │
│     │ • Code__c = "123456"                │                     │
│     │ • Status__c = "Pending"             │                     │
│     │ • Expires_At__c = now + 5 min       │                     │
│     └─────────────────────────────────────┘                     │
│                                                                  │
│  3. Return {"ok": true} (always, no enumeration)                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    STEP 2: VERIFY OTP CODE                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                                          [Start forfra] ← ✅│ │
│  │                                          FIX #6: Top-right  │ │
│  │                                                              │ │
│  │              Enter 6-digit code: [______]                    │ │
│  │                     [Verify Button]                          │ │
│  │                                                              │ │
│  │  ✅ FIX #5: Help text HIDDEN                                │ │
│  │  ✅ FIX #5: Phone/Email chooser HIDDEN                      │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ [User Enters OTP]
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   API: /identifier/verify-otp                    │
│                                                                  │
│  • Find OTP__c by Purpose + Brand + Identifier                   │
│  • Verify code matches Code__c                                   │
│  • Check Expires_At__c > now                                     │
│  • Update Status__c = "Verified"                                 │
│  • Return session token                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ ✅ Success
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PORTAL UI: Document List                      │
│  ┌───────────┬────────────────────────────────────────────────┐ │
│  │ Sidebar   │ Viewer                                         │ │
│  │           │                                                │ │
│  │ Pending:  │  ┌──────────────────────────────────────────┐ │ │
│  │ • Doc 1   │  │                                          │ │ │
│  │ • Doc 2   │  │      PDF VIEWER (inline)                 │ │ │
│  │           │  │      ✅ FIX #3: No auto-download         │ │ │
│  │ Approved: │  │      ✅ FIX #4: Visible iframe           │ │ │
│  │ • Doc 3   │  │                                          │ │ │
│  │           │  │                                          │ │ │
│  │ [FAQ]     │  └──────────────────────────────────────────┘ │ │
│  │ [Help]    │                                                │ │
│  │           │  [Download] [Print] [Approve]                  │ │
│  └───────────┴────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ [User Clicks Document]
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   API: /identifier/doc-url                       │
│                                                                  │
│  • Verify session token                                          │
│  • Check document ownership                                      │
│  • Generate S3 presigned URL                                     │
│                                                                  │
│  ✅ FIX #3: S3 Presign Parameters                               │
│  {                                                               │
│    "ResponseContentDisposition": "inline; filename=doc.pdf",     │
│    "ResponseContentType": "application/pdf"                      │
│  }                                                               │
│                                                                  │
│  • Update Last_Viewed__c                                         │
│  • Change Status__c: "Sent" → "Viewed"                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PDF RENDERS IN IFRAME                         │
│                                                                  │
│  <iframe id="pdf" src="https://s3.../doc.pdf?                    │
│    response-content-disposition=inline&                          │
│    response-content-type=application/pdf#toolbar=0&zoom=150">   │
│                                                                  │
│  ✅ FIX #3: Displays inline, NO auto-download                    │
│  ✅ FIX #4: Visible and functional                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Fix Impact Summary

### 🔧 Fix #1: Phone Normalization
**Impact:** Frontend (app.js)  
**Result:** Users can paste full international numbers without duplication

### 🔧 Fix #2: Always Create OTP
**Impact:** Backend (lambda.py)  
**Result:** OTP records created even for non-existent identifiers (anti-enumeration maintained)

### 🔧 Fix #3: Inline PDFs
**Impact:** Backend (lambda.py)  
**Result:** PDFs render inline instead of forcing download

### 🔧 Fix #4: Viewer Visibility
**Impact:** None (already working correctly)  
**Result:** Confirmed viewer displays properly

### 🔧 Fix #5: Hide Help Text
**Impact:** Frontend (app.js)  
**Result:** Cleaner UX during OTP verification step

### 🔧 Fix #6: Button Position
**Impact:** Frontend (styles.css)  
**Result:** "Start forfra" button in intuitive top-right position

---

## Data Flow: Phone Input Example

```
User Input:        "+4542455150"
                        ↓
Detection:         Starts with '+' → already e164
                        ↓
Normalization:     mcNormDK("+4542455150")
                        ↓
Extract digits:    "4542455150"
                        ↓
Double-check:      Starts with "4545"? No → OK
                        ↓
Validate:          Starts with "45" ✓
                   Length = 10 ✓
                        ↓
Result:            {
                     digits: "4542455150",
                     ok: true,
                     e164: "+4542455150"
                   }
                        ↓
API Payload:       {
                     "phone": "+4542455150",
                     "phoneDigits": "4542455150"
                   }
```

### Edge Case: Double Prefix

```
User Input:        "4545421234" (accidentally doubled)
                        ↓
Extract digits:    "4545421234"
                        ↓
Double-check:      Starts with "4545" AND length ≥ 12? Yes
                        ↓
Fix:               Remove first 2 chars → "4542455150"
                        ↓
Validate:          Starts with "45" ✓
                   Length = 10 ✓
                        ↓
Result:            {
                     digits: "4542455150",
                     ok: true,
                     e164: "+4542455150"
                   }
```

---

## Salesforce Object Updates

### OTP__c Record (Fix #2)
```
Before: Created only if identifier matches
After:  ALWAYS created (match or no match)

Record Example:
{
  Id: "a0X5g000000AbCd",
  Key__c: "DocumentPortal|Phone|+4542455150|dk|abc123",
  Purpose__c: "DocumentPortal",
  Brand__c: "dk",
  Identifier_Type__c: "Phone",
  Identifier_Value__c: "+4542455150",
  Channel__c: "SMS",
  Code__c: "123456",
  Status__c: "Pending",
  Sent_At__c: "2025-10-17T10:30:00Z",
  Expires_At__c: "2025-10-17T10:35:00Z",
  Attempt_Count__c: 0,
  Resend_Count__c: 0
}
```

### Shared_Document__c Updates (Existing)
```
On View:
  Last_Viewed__c = NOW()
  Status__c = "Sent" → "Viewed"

On Approve:
  Status__c = "Viewed" → "Approved"
```

---

**Diagram Version:** 1.0  
**Last Updated:** October 17, 2025  
**Coverage:** All 6 bug fixes visualized
