# 📋 Developer Change Overview

**Version**: v1.3  
**Comparison**: Current Development vs Production  
**Last Updated**: October 22, 2025

---

## Major Features Added

### 1. Identifier-Based Authentication (NEW)

**What Changed**: Added completely new authentication mode alongside existing journal links.

**Technical Details**:
- **New Endpoints** (Lambda):
  - `POST /identifier/request-otp` - Request OTP via phone or email
  - `POST /identifier/verify-otp` - Verify OTP and create session
  - `POST /identifier/list` - List journals for identifier
  - `POST /identifier/doc-url` - Get document URL
  - `POST /identifier/approve` - Approve documents
  - `POST /identifier/chat/list` - List chat messages
  - `POST /identifier/chat/send` - Send chat message

- **Frontend Changes** (`app.js`):
  - Dual-mode detection: Journal mode (with `?e=...&t=...`) vs Identifier mode (default)
  - Phone/Email input with country picker (8 countries supported)
  - Multi-step OTP flow (request → verify → access)
  - Session token authentication (HMAC-SHA256)
  - Phone normalization for DK/SE/IE/NO/DE/NL/FI/UK

- **Files Modified**:
  - `lambda.py`: +500 lines (new handlers)
  - `app.js`: +400 lines (new UI flow)
  - `texts.js`: +150 lines (new translations)
  - `index.html`: +50 lines (new form elements)

---

### 2. Multi-Journal Selection with Bridge Page

**What Changed**: Users with documents across multiple journals see a journal overview page.

**Technical Details**:
- **Backend** (`lambda.py`):
  - `handle_identifier_list()` now accepts optional `journalId` parameter
  - Returns aggregated `journals` array with document counts
  - Groups documents by `Journal__c` field

- **Frontend** (`app.js`):
  - New function `showJournalSelection()` - renders journal cards
  - New function `selectJournal()` - filters documents by journal
  - New function `showBackToJournalsButton()` - adds navigation
  - New global state: `availableJournals`, `selectedJournalId`

- **UI Flow**:
  1. User verifies OTP
  2. System fetches all documents
  3. Journal overview page always appears (even for single journal)
  4. User selects journal
  5. Documents filtered to selected journal only
  6. "← Back to Overview" button appears in sidebar

- **Files Modified**:
  - `lambda.py`: Modified `handle_identifier_list()`
  - `app.js`: +200 lines (journal selection logic)
  - `index.html`: Added `backToJournalsBtn` in sidebar
  - `styles.css`: Added sticky button styles

---

### 3. Journal-Scoped Chat (Changed from Document-Scoped)

**What Changed**: Chat messages now scoped to journal instead of individual documents.

**Technical Details**:
- **Backend** (`lambda.py`):
  - Chat endpoints now use `journalId` instead of `docId`
  - `handle_chat_list()`: Queries by `Parent_Record__c = journalId`
  - `handle_chat_send()`: Inserts with `Parent_Record__c = journalId`
  - Identifier mode endpoints accept `journalId` in request body

- **Frontend** (`app.js`):
  - Removed global `currentDocumentId` variable
  - Chat now opens for entire journal, not per-document
  - `fetchChat()` sends `journalId` in request
  - `sendChat()` sends `journalId` in request
  - Chat persists across document navigation within same journal

- **Salesforce Relationship**:
  - Journal mode: `Journal__c.Id` → `ChatMessage__c.Parent_Record__c`
  - Identifier mode: Selected `Journal__c.Id` → `ChatMessage__c.Parent_Record__c`

- **Files Modified**:
  - `lambda.py`: Modified chat handlers (~100 lines)
  - `app.js`: Modified chat functions (~80 lines)

---

### 4. Chat Disclaimer Banner

**What Changed**: Added dismissible sticky banner at top of chat panel.

**Technical Details**:
- **HTML** (`index.html`):
  - Added `<div id="chatDisclaimer">` with close button
  - Positioned between chat header and message list

- **CSS** (`styles.css`):
  - Sticky position (stays at top when scrolling messages)
  - Yellow/amber gradient background
  - Close button in top-right corner
  - Smooth hide/show transitions

- **JavaScript** (`app.js`):
  - Dismissal persisted to `localStorage` (key: `dfj_chat_disclaimer_dismissed`)
  - Auto-hides on page load if previously dismissed
  - Close button handler

- **Translations** (`texts.js`):
  - DK: "Denne chat er ikke live. Vi sigter mod at svare inden for 2 arbejdsdage."
  - SE: "Denna chatt är inte live. Vi strävar efter att svara inom 2 arbetsdagar."
  - IE: "This chat is not live. We aim to reply within 2 business days."

- **Files Modified**:
  - `index.html`: +4 lines
  - `styles.css`: +40 lines
  - `app.js`: +30 lines
  - `texts.js`: +3 lines

---

### 5. Enhanced Sidebar Design

**What Changed**: Visual polish with gradients, shadows, and better color differentiation.

**Technical Details**:
- **Sidebar Container**:
  - Linear gradient background (#fafafa → #ffffff)
  - Enhanced box shadow with inset highlight
  - Rounded corners (12px)

- **Document Headers**:
  - Uppercase text with letter-spacing
  - Gradient background (#f8fafc → #f1f5f9)
  - 2px accent-colored top border
  - Enhanced shadow for depth

- **Document Items**:
  - Gradient backgrounds for all states
  - Pending: White → light gray
  - Approved: Light green → medium green
  - Active: Accent color → darker shade
  - Enhanced shadows with accent glow on active

- **Action Buttons**:
  - Frosted glass effect with backdrop blur
  - Color-coded buttons:
    - Tour button: Purple/indigo gradient
    - FAQ button: Amber/yellow gradient
    - Back button: Slate gray gradient
  - Enhanced hover states with lift animations

- **Visual Separation**:
  - Stronger 2px separator line with shadow
  - Increased spacing between sections
  - Sticky sections with stronger shadows

- **Files Modified**:
  - `styles.css`: +150 lines (enhanced styles)

---

### 6. PDF Rendering Improvements

**What Changed**: PDFs now render inline instead of auto-downloading.

**Technical Details**:
- **Backend** (`lambda.py`):
  - `s3_presign_get()` function updated
  - Added `ResponseContentDisposition: inline` parameter
  - Added `ResponseContentType: application/pdf` parameter

- **Effect**:
  - PDFs display in iframe viewer
  - Download only occurs when user clicks Download button
  - Print button works correctly

- **Files Modified**:
  - `lambda.py`: Modified `s3_presign_get()` function

---

### 7. Phone Normalization Fixes

**What Changed**: Fixed phone number duplication when pasting international numbers.

**Technical Details**:
- **Problem**: Pasting `+4542455150` resulted in `+454542455150`
- **Solution**: Detect existing country code before prepending
- **Functions Updated** (`app.js`):
  - `requestOtpIdentifier()`: Smart prefix detection
  - `mcNormDK()`: Handle `4545...` → `45...`
  - `mcNormSE()`: Handle `4646...` → `46...`
  - `mcNormIE()`: Handle `353353...` → `353...`

- **Files Modified**:
  - `app.js`: Modified normalization functions

---

### 8. OTP Creation for Non-Existent Users

**What Changed**: OTP records now created even when identifier doesn't match any Salesforce record.

**Technical Details**:
- **Problem**: New users couldn't proceed past OTP request
- **Solution**: Always create OTP record, set lookups to null if no match
- **Backend** (`lambda.py`):
  - Modified `handle_identifier_request_otp()`
  - OTP record created before identifier lookup
  - Lookup fields set to null when no match found

- **Files Modified**:
  - `lambda.py`: Modified OTP request handler

---

### 9. UI/UX Improvements

**What Changed**: Various small fixes for better user experience.

**Technical Details**:
- **"Start Over" Button**: Positioned absolutely in top-right corner of OTP card
- **Help Text Hiding**: Subtitle hidden during OTP verification step
- **Chat Label Fix**: Removed scroll listener (caused stretching on scroll)
- **Button Positioning**: Fixed `backToJournalsBtn` positioning in sidebar

- **Files Modified**:
  - `styles.css`: Button positioning rules
  - `app.js`: `showStep()` function, chat label positioning

---

## Salesforce LWC Changes

### journalDocConsole Component

**What Changed**: Added document sorting and improved portal launch.

**Technical Details**:
- **Document Sorting**:
  - Added sort dropdown (A-Z, Z-A, Newest, Oldest)
  - Sorts by `Document_Title__c` or `CreatedDate`
  - Persists sort preference during session

- **Portal Launch**:
  - Generates proper URL with external ID and access token
  - Improved token generation and validation
  - Better error handling

- **Files Modified**:
  - `journalDocConsole.js`: +80 lines (sorting logic)
  - `journalDocConsole.html`: +10 lines (sort dropdown)
  - `journalDocConsole.css`: +20 lines (dropdown styles)

---

## Database/Schema Changes

**No schema changes required**. All changes use existing Salesforce fields:
- `OTP__c` object (existing)
- `ChatMessage__c` object (existing)
- `Shared_Document__c` object (existing)
- `Journal__c` object (existing)

---

## Configuration Changes

### Lambda Environment Variables
No new variables required. Existing variables used:
- `SESSION_HMAC_SECRET` (for identifier session tokens)
- `BUCKET`, `S3_PREFIX_MAP` (existing S3 config)
- Salesforce OAuth variables (existing)

---

## File Summary

| File | Lines Added | Lines Modified | Purpose |
|------|-------------|----------------|---------|
| `lambda.py` | +500 | ~200 | Identifier mode, chat changes, fixes |
| `app.js` | +650 | ~300 | Identifier UI, journal selection, chat |
| `texts.js` | +150 | ~50 | New translations |
| `styles.css` | +200 | ~100 | Design polish, new components |
| `index.html` | +60 | ~20 | New form elements, chat banner |
| `brand.js` | +20 | ~10 | Phone country support |
| `journalDocConsole.js` | +80 | ~30 | Sorting, portal launch |
| `journalDocConsole.html` | +10 | ~5 | Sort dropdown |
| `journalDocConsole.css` | +20 | 0 | Dropdown styles |

**Total**: ~1,690 lines added, ~715 lines modified

---

## Breaking Changes

**None**. All changes are backward compatible:
- ✅ Existing journal links (`?e=...&t=...`) still work
- ✅ Existing API endpoints unchanged
- ✅ Existing Salesforce objects unchanged
- ✅ Existing user workflows unaffected
