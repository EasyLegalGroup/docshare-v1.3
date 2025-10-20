# Journal Selection Feature - Implementation Summary

## Overview
Added a "bridge page" (journal overview) that **ALWAYS** displays after OTP verification, showing all journals associated with the user's identifier (phone/email). This provides a consistent navigation pattern regardless of journal count.

## User Flow

### Example 1: Multiple Journals
1. Customer verifies OTP
2. System finds 10 documents across 3 journals (5 in Journal A, 3 in Journal B, 2 in Journal C)
3. **Bridge page appears** showing all 3 journals with document counts
4. Customer selects Journal C
5. System shows only the 2 documents related to Journal C
6. Chat shows only messages related to Journal C
7. **"← Tilbage til oversigt" button** appears in top-left corner

### Example 2: Single Journal
1. Customer verifies OTP
2. System finds 3 documents all in the same journal
3. **Bridge page appears** showing the 1 journal
4. Customer clicks the journal card
5. System shows all 3 documents and related chat messages
6. **"← Tilbage til oversigt" button** still appears (returns to overview)

## Changes Made

### Backend (`lambda.py`)

#### `handle_identifier_list()` - Line ~560
- **Added**: `journalId` optional parameter to filter documents by journal
- **Added**: Returns `journals` array with aggregated journal info:
  ```python
  journals = [
    {"id": "a0Abd...", "name": "Journal 12345", "documentCount": 5},
    {"id": "a0Abd...", "name": "Journal 67890", "documentCount": 3}
  ]
  ```
- **Logic**: Groups documents by `Journal__c` field and counts documents per journal

### Frontend (`app.js`)

#### New Global State (Line ~50)
```javascript
let availableJournals = [];  // journals found for identifier
let selectedJournalId = '';  // currently selected journal ID
```

#### `verifyOtpIdentifier()` - Line ~372
- **Added**: Calls `fetchJournalsForIdentifier()` after OTP verification
- **Purpose**: Loads journal list to determine if bridge page needed

#### `fetchJournalsForIdentifier()` - NEW function
- **Purpose**: Fetches all documents and extracts unique journals
- **Logic**:
  - If 0 journals: Shows error
  - If 1+ journals: Sets `selectedJournalId = ''` to **ALWAYS** show bridge page
  - **No auto-skip**: Bridge page shown regardless of journal count for consistent UX

#### `fetchDocs()` - Line ~450
- **Added**: Includes `journalId: selectedJournalId` in payload when journal is selected
- **Purpose**: Filters documents to only show selected journal's documents

#### `showJournalSelection()` - NEW function (Line ~835)
- **Purpose**: Renders bridge page with clickable journal cards
- **UI**: 
  - Shows journal name (e.g., "Journal 12345")
  - Shows document count (e.g., "5 dokument(er)")
  - Hover effects (border changes color)
  - Responsive layout

#### `selectJournal(journalId)` - NEW function
- **Purpose**: Handles journal selection from bridge page
- **Flow**:
  1. Sets `selectedJournalId`
  2. Fetches documents (filtered by journal)
  3. Enters portal UI
  4. Shows "Back to Journals" button

#### `showBackToJournalsButton()` - NEW function
- **Purpose**: Creates floating back button in top-left corner
- **Visibility**: Always shown in identifier mode (even with 1 journal)
- **Behavior**: Returns to bridge page, hides portal UI

#### OTP Form Submission - Line ~951
- **Added**: Check for journal selection before entering portal:
  ```javascript
  if (MODE === 'identifier' && availableJournals.length >= 1 && !selectedJournalId) {
    showJournalSelection();  // Always show bridge page
    return;
  }
  ```

#### `enterPortalUI()` - Line ~940
- **Added**: Calls `showBackToJournalsButton()` if multiple journals exist

### Translations (`texts.js`)

Added 4 new translation keys across all languages (da/sv/en):

```javascript
JOURNAL_SELECT_TITLE: {
  da: "Vælg journal",
  sv: "Välj journal",
  en: "Select Journal"
}

JOURNAL_SELECT_DESC: {
  da: "Vi har fundet dokumenter relateret til flere journaler...",
  sv: "Vi har hittat dokument relaterade till flera journaler...",
  en: "We found documents related to multiple journals..."
}

JOURNAL_DOCUMENTS_COUNT: {
  da: "{count} dokument(er)",
  sv: "{count} dokument",
  en: "{count} document(s)"
}

BACK_TO_JOURNALS: {
  da: "Tilbage til journaler",
  sv: "Tillbaka till journaler",
  en: "Back to Journals"
}

NO_DOCUMENTS_FOUND: {
  da: "Ingen dokumenter fundet",
  sv: "Inga dokument hittades",
  en: "No documents found"
}
```

## Technical Details

### API Changes

**POST `/identifier/list`**
- **New Request Parameter**: `journalId` (optional)
- **New Response Field**: `journals` array
  ```json
  {
    "ok": true,
    "items": [...],
    "journals": [
      {"id": "a0Abd...", "name": "Journal 12345", "documentCount": 5}
    ]
  }
  ```

### Chat Scoping
- Chat messages remain scoped to **journal level** (not individual documents)
- When user selects Journal C, they see **all chat messages** for Journal C
- Switching journals via back button loads different journal's chat

### Backward Compatibility
- ✅ Journal mode (`?e=...&t=...`) unchanged
- ✅ Identifier mode with single journal skips bridge page
- ✅ Existing session tokens still work
- ✅ All existing endpoints unchanged

## Testing Scenarios

### Test 1: Multiple Journals
1. Request OTP for phone: +4542455150
2. Verify OTP code
3. **Expected**: Bridge page appears with 2-3 journals listed
4. Click on a journal
5. **Expected**: Document list shows only that journal's documents
6. Click "Back to Journals" button
7. **Expected**: Returns to bridge page

### Test 2: Single Journal
1. Request OTP for different identifier with only 1 journal
2. Verify OTP code
3. **Expected**: Skips directly to document list (no bridge page)
4. **Expected**: No "Back to Journals" button visible

### Test 3: Chat Messages
1. Select Journal A from bridge page
2. Open chat, send message "Test A"
3. Click "Back to Journals"
4. Select Journal B
5. Open chat
6. **Expected**: "Test A" message NOT visible (different journal)

## Deployment

### Local Testing (Already Running)
Your local server at `http://localhost:5173` has the updated frontend code.

### Lambda Deployment Required
The backend changes need to be deployed to AWS Lambda:

```powershell
cd "C:\Users\Mathias\Downloads\docshare-16-10-2025-fixed\vscode attempt"

# Create zip
Compress-Archive -Path lambda.py -DestinationPath lambda.zip -Force

# Upload to Lambda
aws lambda update-function-code `
  --function-name dfj-docshare-test `
  --zip-file fileb://lambda.zip `
  --region eu-north-1

# Wait for deployment
Start-Sleep -Seconds 5

# Test health
Invoke-RestMethod -Uri "https://21tpssexjd.execute-api.eu-north-1.amazonaws.com/ping"
```

## Files Modified

1. **lambda.py** (1 change)
   - `handle_identifier_list()`: Added journal grouping and filtering

2. **app.js** (7 changes)
   - Added global state variables
   - Updated `verifyOtpIdentifier()`
   - Added `fetchJournalsForIdentifier()`
   - Updated `fetchDocs()`
   - Added `showJournalSelection()`
   - Added `selectJournal()`
   - Added `showBackToJournalsButton()`
   - Updated OTP form submission handler
   - Updated `enterPortalUI()`

3. **texts.js** (5 new keys)
   - Journal selection UI text
   - Back button text
   - Document count format
   - No documents found error

## Known Limitations

1. **Journal Name Display**: Uses `Journal__r.Name` from Salesforce - ensure this field is populated
2. **Performance**: With many journals (50+), bridge page may become unwieldy
3. **Mobile UX**: Back button position fixed at top-left may need adjustment for small screens
4. **Session Persistence**: Journal selection not persisted - refresh resets to bridge page

## Future Enhancements

1. **Remember Selection**: Store `selectedJournalId` in localStorage
2. **Search/Filter**: Add search bar if user has many journals
3. **Breadcrumb Navigation**: Show current journal in header
4. **Recent Journals**: Sort by last viewed/most documents
5. **Mobile Optimization**: Hamburger menu for back button on small screens
