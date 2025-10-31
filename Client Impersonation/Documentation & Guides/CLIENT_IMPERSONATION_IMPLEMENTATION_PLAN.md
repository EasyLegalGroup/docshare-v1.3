# Client Impersonation Feature - Implementation Plan

**Date:** October 31, 2025  
**Feature:** Client Impersonation (formerly "Mirror Session")  
**Purpose:** Allow lawyers to view documents from a client's perspective via secure, time-limited links

---

## Executive Summary

This feature enables lawyers to open a specific client's journal in the document portal (read-only by default) by clicking a Quick Action in Salesforce. The implementation:

- Reuses existing **Identifier Session** infrastructure (no new authentication surface)
- Creates **single-journal, time-boxed** access links (60-minute default TTL)
- Enforces **server-side scope** restrictions (only the specified journal)
- Leaves an **audit trail** in Salesforce
- Supports **optional approval rights** (configurable per impersonation)

---

## Current Architecture Analysis

### Existing Components

#### 1. **Salesforce**
- **Journal__c** object with `External_ID__c` and `Access_Token__c` fields
- **Shared_Document__c** with relationships to Journal__c and fields:
  - `Status__c`, `Is_Approval_Blocked__c`, `Journal__c`, `Sort_Order__c`
- **Apex Classes:**
  - `DocShareService` - handles document creation, ordering, approval blocking
  - `DocShare_Query` - fetches documents for a journal
  - `DocShare_JournalCreds` - provisions credentials
- **LWC:** `journalDocConsole` - internal console for lawyers to manage documents

#### 2. **Lambda (Python)**
- **Session Management:** HMAC-signed JWT-style tokens with:
  - `typ` (identifier_type): "email" | "phone"
  - `sub` (identifier_value): normalized email/phone
  - `iat`, `exp`, `nonce` for security
- **Endpoints:**
  - `/identifier/request-otp` - request OTP for email/phone
  - `/identifier/verify-otp` - verify OTP and issue session token
  - `/identifier/list` - list documents (filtered by identifier)
  - `/identifier/doc-url` - get presigned S3 URL
  - `/identifier/approve` - approve documents
  - `/identifier/chat/send`, `/identifier/chat/list` - chat functionality

#### 3. **SPA (Frontend)**
Located in `Client Impersonation` folder:
- `app.js`, `brand.js`, `index.html`, `styles.css`, `texts.js`
- Uses Bearer token authentication
- Supports journal filtering

---

## Implementation Plan

### Phase 1: Salesforce (Custom Object + Quick Action)

#### 1.1 Create Custom Object: `Client_Impersonation__c`

**Fields:**

| API Name | Type | Properties | Description |
|----------|------|------------|-------------|
| `Token__c` | Text(64) | Unique, External ID | Crypto-random token for link |
| `Journal__c` | Lookup(Journal__c) | Required | The journal being impersonated |
| `Identifier_Type__c` | Picklist | Values: Email, Phone | Matches session identifier type |
| `Identifier_Value__c` | Text(255) | Required | Email or formatted phone from account |
| `Allow_Approve__c` | Checkbox | Default: false | Whether approvals are permitted |
| `Expires_At__c` | Date/Time | Required | Link expiration (default NOW + 60 min) |
| `Used_At__c` | Date/Time | | First use timestamp |
| `Used_By_IP__c` | Text(64) | | IP address of first use (audit) |

**Object Settings:**
- Label: "Client Impersonation"
- Record Name: Auto Number (CI-{00000})
- Sharing: Controlled by Parent (Journal__c)

**Deployment Command:**
```bash
# Create metadata files in Client Impersonation/salesforce/main/default/objects/Client_Impersonation__c/
sf project deploy start -o prod -d "Client Impersonation/salesforce/main/default/objects"
```

---

#### 1.2 Create Quick Action on Journal__c

**Quick Action: "Create Client Impersonation"**

This will be an **Invocable Action** that:
1. Collects identifier type (Email or Phone) from user
2. Calls Apex to generate token and create `Client_Impersonation__c` record
3. Displays the impersonation URL to copy/paste

**Implementation Options:**

**Option A: Flow-based Quick Action (Recommended)**
- Create Screen Flow with:
  - Input: Radio button for Identifier Type (Email/Phone)
  - Action: Call `ClientImpersonationService.createClientImpersonation` Apex
  - Output: Display URL in success screen with copy button

**Option B: Lightning Component Quick Action**
- Build custom LWC that calls Apex and shows URL in modal

---

#### 1.3 Create Apex Class: `ClientImpersonationService`

**Purpose:** Generate secure tokens and create impersonation records

**File:** `Client Impersonation/salesforce/main/default/classes/ClientImpersonationService.cls`

```apex
public with sharing class ClientImpersonationService {
    
    public class Req {
        @InvocableVariable(required=true)
        public Id journalId;
        
        @InvocableVariable(required=true)
        public String identifierType; // 'Email' or 'Phone'
        
        @InvocableVariable
        public Boolean allowApprove;
    }
    
    public class Resp {
        @InvocableVariable
        public String url;
        
        @InvocableVariable
        public String token;
        
        @InvocableVariable
        public String identifierValue;
        
        @InvocableVariable
        public Boolean success;
        
        @InvocableVariable
        public String errorMessage;
    }
    
    @InvocableMethod(label='Create Client Impersonation' description='Generate impersonation link for a journal')
    public static List<Resp> createClientImpersonation(List<Req> requests) {
        List<Resp> responses = new List<Resp>();
        
        for (Req req : requests) {
            Resp response = new Resp();
            response.success = false;
            
            try {
                // Validate input
                if (req.journalId == null) {
                    response.errorMessage = 'Journal ID is required';
                    responses.add(response);
                    continue;
                }
                
                String identifierType = String.isNotBlank(req.identifierType) 
                    ? req.identifierType.trim() 
                    : 'Email';
                
                if (identifierType != 'Email' && identifierType != 'Phone') {
                    response.errorMessage = 'Identifier Type must be Email or Phone';
                    responses.add(response);
                    continue;
                }
                
                // Fetch journal and account data
                Journal__c journal = [
                    SELECT Id, Name, 
                           Account__r.PersonEmail, 
                           Account__r.Phone_Formatted__c,
                           Account__r.Spouse_Email__pc,
                           Account__r.Spouse_Phone__pc
                    FROM Journal__c 
                    WHERE Id = :req.journalId 
                    LIMIT 1
                ];
                
                // Get identifier value
                String identifierValue;
                if (identifierType == 'Email') {
                    identifierValue = journal.Account__r.PersonEmail;
                    // Fallback to spouse email if primary is blank
                    if (String.isBlank(identifierValue)) {
                        identifierValue = journal.Account__r.Spouse_Email__pc;
                    }
                } else { // Phone
                    identifierValue = journal.Account__r.Phone_Formatted__c;
                    // Fallback to spouse phone if primary is blank
                    if (String.isBlank(identifierValue)) {
                        identifierValue = journal.Account__r.Spouse_Phone__pc;
                    }
                }
                
                if (String.isBlank(identifierValue)) {
                    response.errorMessage = 'No ' + identifierType + ' found for this journal\'s account';
                    responses.add(response);
                    continue;
                }
                
                // Generate secure token (64 hex chars)
                Blob tokenBlob = Crypto.generateAesKey(256);
                String token = EncodingUtil.convertToHex(tokenBlob).substring(0, 64);
                
                // Create Client_Impersonation__c record
                Client_Impersonation__c impersonation = new Client_Impersonation__c(
                    Token__c = token,
                    Journal__c = journal.Id,
                    Identifier_Type__c = identifierType,
                    Identifier_Value__c = identifierValue,
                    Allow_Approve__c = (req.allowApprove != null ? req.allowApprove : false),
                    Expires_At__c = System.now().addHours(1)
                );
                
                insert impersonation;
                
                // Build URL based on brand detection
                // TODO: Adjust domain based on Market_Unit__c or org config
                String baseUrl = detectBrandUrl(journal);
                String impersonationUrl = baseUrl + '?impersonate=' + token;
                
                // Populate success response
                response.success = true;
                response.token = token;
                response.url = impersonationUrl;
                response.identifierValue = identifierValue;
                
            } catch (Exception e) {
                response.errorMessage = 'Error: ' + e.getMessage();
            }
            
            responses.add(response);
        }
        
        return responses;
    }
    
    private static String detectBrandUrl(Journal__c journal) {
        // Detect brand from Market_Unit__c if available
        String marketUnit = '';
        try {
            Journal__c j = [SELECT Market_Unit__c FROM Journal__c WHERE Id = :journal.Id LIMIT 1];
            marketUnit = j.Market_Unit__c;
        } catch (Exception e) {
            // Ignore
        }
        
        if (marketUnit == 'DFJ_DK' || String.isBlank(marketUnit)) {
            return 'https://dok.dinfamiliejurist.dk';
        } else if (marketUnit == 'FA_SE') {
            return 'https://dok.dinfamiljejurist.se';
        } else if (marketUnit == 'Ireland') {
            return 'https://docs.hereslaw.ie';
        }
        
        // Default to DK
        return 'https://dok.dinfamiliejurist.dk';
    }
}
```

**Test Class:** `ClientImpersonationService_Test.cls`

```apex
@isTest
private class ClientImpersonationService_Test {
    
    @testSetup
    static void setup() {
        // Create test account
        Account acc = new Account(
            FirstName = 'Test',
            LastName = 'Client',
            PersonEmail = 'test@example.com',
            Phone_Formatted__c = '+4512345678'
        );
        insert acc;
        
        // Create test journal
        Journal__c journal = new Journal__c(
            Name = 'J-TEST001',
            Account__c = acc.Id,
            Market_Unit__c = 'DFJ_DK'
        );
        insert journal;
    }
    
    @isTest
    static void testCreateClientImpersonationEmail() {
        Journal__c journal = [SELECT Id FROM Journal__c LIMIT 1];
        
        ClientImpersonationService.Req req = new ClientImpersonationService.Req();
        req.journalId = journal.Id;
        req.identifierType = 'Email';
        req.allowApprove = false;
        
        Test.startTest();
        List<ClientImpersonationService.Resp> results = 
            ClientImpersonationService.createClientImpersonation(new List<ClientImpersonationService.Req>{req});
        Test.stopTest();
        
        System.assertEquals(1, results.size());
        ClientImpersonationService.Resp resp = results[0];
        System.assertEquals(true, resp.success);
        System.assertNotEquals(null, resp.token);
        System.assertEquals(64, resp.token.length());
        System.assert(resp.url.contains('impersonate='));
        
        // Verify record created
        List<Client_Impersonation__c> impersonations = [SELECT Id, Token__c FROM Client_Impersonation__c];
        System.assertEquals(1, impersonations.size());
    }
    
    @isTest
    static void testCreateClientImpersonationPhone() {
        Journal__c journal = [SELECT Id FROM Journal__c LIMIT 1];
        
        ClientImpersonationService.Req req = new ClientImpersonationService.Req();
        req.journalId = journal.Id;
        req.identifierType = 'Phone';
        req.allowApprove = true;
        
        Test.startTest();
        List<ClientImpersonationService.Resp> results = 
            ClientImpersonationService.createClientImpersonation(new List<ClientImpersonationService.Req>{req});
        Test.stopTest();
        
        ClientImpersonationService.Resp resp = results[0];
        System.assertEquals(true, resp.success);
        
        Client_Impersonation__c imp = [SELECT Allow_Approve__c FROM Client_Impersonation__c LIMIT 1];
        System.assertEquals(true, imp.Allow_Approve__c);
    }
}
```

---

### Phase 2: Lambda (API) - Minimal Patch

#### 2.1 Update `make_session` to Support Extra Claims

**File:** `Client Impersonation/lambda.py`

**Current implementation already supports this!** The existing `make_session` function is:

```python
def make_session(identifier_type: str, identifier_value: str, ttl=SESSION_TTL_SECONDS) -> str:
```

**Required change:** Add `**extras` parameter to accept additional claims:

```python
def make_session(identifier_type: str, identifier_value: str, ttl=SESSION_TTL_SECONDS, **extras) -> str:
    if not SESSION_HMAC_SECRET:
        raise RuntimeError("Missing SESSION_HMAC_SECRET")
    now = int(time.time())
    payload = {
        "iat": now,
        "exp": now + int(ttl),
        "typ": identifier_type,   # "email" | "phone"
        "sub": identifier_value,  # normalized (email lower, phone normalized)
        "nonce": secrets.token_hex(8)
    }
    # NEW: allow impersonation flags etc.
    for k, v in (extras or {}).items():
        if v is not None:
            payload[k] = v
    
    body = _b64u(json.dumps(payload, separators=(",",":")).encode("utf-8"))
    sig  = _b64u(hmac.new(SESSION_HMAC_SECRET.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest())
    return body + "." + sig
```

**Location in file:** Around line 290

---

#### 2.2 New Endpoint: `/impersonation/login`

**Add this handler function before `lambda_handler`:**

```python
def handle_impersonation_login(event, data):
    """
    POST /impersonation/login
    Body: { "token": "64-char-hex-token" }
    Returns: { "ok": true, "session": "...", "identifierType": "email", "identifierValue": "...", "journalId": "...", "journalName": "...", "readOnly": true }
    """
    token = (data.get("token") or "").strip()
    if not token:
        return resp(event, 400, {"error": "Missing token"})

    try:
        org_tok, inst = get_org_token()
        safe = soql_escape(token)
        soql = (
            "SELECT Id, Identifier_Type__c, Identifier_Value__c, Journal__c, "
            "       Journal__r.Name, Allow_Approve__c, Expires_At__c "
            f"FROM Client_Impersonation__c WHERE Token__c = '{safe}' LIMIT 1"
        )
        recs = salesforce_query(inst, org_tok, soql).get("records", [])
        if not recs:
            return resp(event, 200, {"ok": False, "error": "Invalid or expired token"})

        row = recs[0]
        
        # Check expiry (reuse robust parser)
        exp_dt = _parse_sf_datetime(row.get("Expires_At__c") or "")
        now_utc = datetime.datetime.now(datetime.timezone.utc)
        if not (exp_dt and now_utc <= exp_dt):
            return resp(event, 200, {"ok": False, "error": "Token expired"})

        # Extract identifier info
        typ = "email" if (row.get("Identifier_Type__c") or "").lower() == "email" else "phone"
        val = (row.get("Identifier_Value__c") or "").strip()
        if typ == "email": 
            val = val.lower()
        else:              
            val = normalize_phone_basic(val)

        # Calculate TTL (min of link expiry and normal session TTL)
        ttl = min(SESSION_TTL_SECONDS, int((exp_dt - now_utc).total_seconds()))

        # Create session with impersonation claims
        sess = make_session(
            typ, val, ttl=ttl,
            role="impersonation",
            allowApprove=bool(row.get("Allow_Approve__c")),
            jid=row.get("Journal__c"),
            msid=row.get("Id")  # Client_Impersonation__c record ID for audit
        )

        # Best-effort audit: record first use
        try:
            source_ip = (event.get("requestContext", {}).get("http", {}) or {}).get("sourceIp")
            salesforce_patch(inst, org_tok, "Client_Impersonation__c", row["Id"], {
                "Used_At__c": datetime.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                "Used_By_IP__c": source_ip or ""
            })
        except Exception:
            pass  # Don't fail login if audit fails

        return resp(event, 200, {
            "ok": True,
            "session": sess,
            "identifierType": typ,
            "identifierValue": val,
            "journalId": row.get("Journal__c"),
            "journalName": (row.get("Journal__r") or {}).get("Name") or "",
            "readOnly": not bool(row.get("Allow_Approve__c"))
        })
    except Exception as e:
        log("impersonation_login error:", repr(e))
        return resp(event, 500, {"error": "Server error"})
```

**Add route in `lambda_handler` (around line 1960):**

```python
# Impersonation login (NEW)
if path.endswith("/impersonation/login")        and method == "POST": return handle_impersonation_login(event, data)
```

Place this **before** the identifier routes to avoid path conflicts.

---

#### 2.3 Enforce Scope and Read-Only on Existing Routes

##### 2.3.1 Update `handle_identifier_list`

**Location:** Around line 630

**Change:** Enforce `sess['jid']` if present

```python
def handle_identifier_list(event, event_json):
    data = event_json or {}
    raw_email = (data.get("email") or "").strip()
    raw_phone = (data.get("phone") or "").strip()
    journal_id = (data.get("journalId") or "").strip()  # EXISTING: optional filter by journal
    # ... existing validation ...

    # Require a verified session
    sess, err = _require_identifier_session(event, raw_email if has_email else "", raw_phone if has_phone else "")
    if err: return err

    # NEW: If impersonation session, enforce journal_id
    if sess and sess.get("jid"):
        journal_id = sess["jid"]  # Override with server-enforced journal

    # ... rest of function unchanged (it already supports journal_id filter) ...
```

**Note:** The existing function already has logic to filter by `journal_id`, so we just need to force it when `sess['jid']` is present.

---

##### 2.3.2 Update `handle_identifier_doc_url`

**Location:** Around line 780

**Changes:**
1. Include `Journal__c` in SOQL SELECT
2. Enforce journal match if `sess['jid']` exists

```python
def handle_identifier_doc_url(event, event_json):
    # ... existing token validation ...

    try:
        org_token, instance_url = get_org_token()
    except Exception as e:
        log("identifier_doc_url oauth error:", repr(e))
        return resp(event, 500, {"error": "Salesforce OAuth failed"})

    try:
        safe_id = soql_escape(doc_id)
        if sess and sess.get("typ") == "email":
            soql = (
                "SELECT Id, S3_Key__c, Journal__c, "  # ADDED Journal__c
                "       Journal__r.Account__r.PersonEmail, Journal__r.Account__r.Spouse_Email__pc, "
                "       Journal__r.Account__r.Is_Spouse_Shared_Document_Recipient__pc, Status__c "
                "FROM Shared_Document__c "
                "WHERE Id = '" + safe_id + "' "
                "LIMIT 1"
            )
        else:
            soql = (
                "SELECT Id, S3_Key__c, Journal__c, "  # ADDED Journal__c
                "       Journal__r.Account__r.Phone_Formatted__c, Journal__r.Account__r.Spouse_Phone__pc, "
                "       Journal__r.Account__r.Is_Spouse_Shared_Document_Recipient__pc, Status__c "
                "FROM Shared_Document__c "
                "WHERE Id = '" + safe_id + "' "
                "LIMIT 1"
            )
        recs = salesforce_query(instance_url, org_token, soql).get("records", [])
        if not recs:
            return resp(event, 404, {"error": "Not found"})
        doc = recs[0]

        # NEW: Enforce journal scope for impersonation sessions
        if sess and sess.get("jid") and doc.get("Journal__c") != sess["jid"]:
            return resp(event, 403, {"error": "Forbidden"})

        # ... rest of function unchanged ...
```

---

##### 2.3.3 Update `handle_identifier_approve`

**Location:** Around line 1680

**Changes:**
1. Block approvals if `role == "impersonation"` and `allowApprove == false`
2. Enforce journal scope
3. Include `Journal__c` in SOQL

```python
def handle_identifier_approve(event, data):
    # Authorization: Bearer <session>
    token = get_bearer(event)
    if not token:
        return resp(event, 401, {"error": "Missing session"})
    try:
        sess = verify_session(token)
    except Exception:
        return resp(event, 401, {"error": "Invalid session"})

    # NEW: Check impersonation permissions
    is_impersonation = (sess.get("role") == "impersonation")
    impersonation_can_approve = bool(sess.get("allowApprove"))
    impersonation_jid = sess.get("jid")

    if is_impersonation and not impersonation_can_approve:
        return resp(event, 403, {"error": "Approvals disabled for impersonation sessions"})

    ids = data.get("docIds") or []
    if not isinstance(ids, list) or not ids:
        return resp(event, 400, {"error": "Missing docIds"})

    try:
        org_tok, inst = get_org_token()
        approved, skipped = 0, 0
        for doc_id in ids:
            try:
                safe_id = soql_escape(doc_id)
                if sess.get("typ") == "email":
                    soql = (
                        "SELECT Id, Journal__c, "  # ADDED Journal__c
                        "       Journal__r.Account__r.PersonEmail, Journal__r.Account__r.Spouse_Email__pc, "
                        "       Journal__r.Account__r.Is_Spouse_Shared_Document_Recipient__pc, "
                        "       Is_Approval_Blocked__c "
                        "FROM Shared_Document__c "
                        "WHERE Id = '" + safe_id + "' LIMIT 1"
                    )
                else:  # phone
                    soql = (
                        "SELECT Id, Journal__c, "  # ADDED Journal__c
                        "       Journal__r.Account__r.Phone_Formatted__c, Journal__r.Account__r.Spouse_Phone__pc, "
                        "       Journal__r.Account__r.Is_Spouse_Shared_Document_Recipient__pc, "
                        "       Is_Approval_Blocked__c "
                        "FROM Shared_Document__c "
                        "WHERE Id = '" + safe_id + "' LIMIT 1"
                    )
                recs = salesforce_query(inst, org_tok, soql).get("records", [])
                if not recs: 
                    skipped += 1; continue
                row = recs[0]
                
                # NEW: Enforce journal scope for impersonation
                if is_impersonation and impersonation_jid and row.get("Journal__c") != impersonation_jid:
                    skipped += 1; continue
                
                # Check if approval is blocked
                if row.get("Is_Approval_Blocked__c") == True:
                    skipped += 1; continue
                
                # ... existing identifier validation (email/phone matching) ...
                
                salesforce_patch(inst, org_tok, "Shared_Document__c", doc_id, {"Status__c": "Approved"})
                approved += 1
            except Exception:
                skipped += 1
        return resp(event, 200, {"ok": True, "approved": approved, "skipped": skipped})
    except Exception as e:
        log("identifier_approve error:", repr(e))
        return resp(event, 500, {"error": "Server error"})
```

---

##### 2.3.4 Update Chat Endpoints

**`handle_identifier_chat_list` and `handle_identifier_chat_send`**

**Location:** Around lines 1840-1920

**Changes:** Enforce `sess['jid']` if present

```python
def handle_identifier_chat_list(event, data):
    # ... existing session validation ...
    
    journal_id = (data.get("journalId") or "").strip()
    
    # NEW: Enforce impersonation scope
    if sess.get("jid"):
        if data.get("journalId") and data.get("journalId") != sess["jid"]:
            return resp(event, 403, {"error": "Forbidden"})
        journal_id = sess["jid"]
    
    if not journal_id:
        return resp(event, 400, {"error": "Missing journalId"})
    
    # ... rest unchanged ...

def handle_identifier_chat_send(event, data):
    # ... existing session validation ...
    
    journal_id = (data.get("journalId") or "").strip()
    body       = (data.get("body") or "").strip()
    
    # NEW: Enforce impersonation scope
    if sess.get("jid"):
        if data.get("journalId") and data.get("journalId") != sess["jid"]:
            return resp(event, 403, {"error": "Forbidden"})
        journal_id = sess["jid"]
    
    if not journal_id:
        return resp(event, 400, {"error": "Missing journalId"})
    if not body:
        return resp(event, 400, {"error": "Missing body"})
    
    # ... rest unchanged ...
```

---

### Phase 3: SPA (Frontend) - Tiny Addition

The SPA files are already present in the `Client Impersonation` folder. We need to add impersonation login support.

#### 3.1 Add Impersonation Endpoint Constant

**File:** `Client Impersonation/app.js`

**Location:** Near the top where other API endpoints are defined (search for `const API`)

**Add:**
```javascript
const IMPERSONATION_LOGIN = `${API}/impersonation/login`;
```

---

#### 3.2 Add Impersonation Boot Function

**File:** `Client Impersonation/app.js`

**Location:** After `texts` and `brand` initialization, before any UI is shown

**Add this function:**

```javascript
/**
 * Auto-boot impersonation if ?impersonate=<token> is present in URL
 * Skips OTP flow and jumps directly to document viewer
 */
async function bootImpersonationIfPresent() {
  const urlParams = new URLSearchParams(location.search);
  const impersonateToken = urlParams.get('impersonate');
  
  if (!impersonateToken) return;  // Not an impersonation link

  showSpinner(true);
  
  try {
    const response = await fetch(IMPERSONATION_LOGIN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: impersonateToken })
    });
    
    const result = await response.json().catch(() => ({}));
    
    if (response.ok && result.ok) {
      // Store session info
      sessionToken = result.session;
      identifierType = (result.identifierType === 'email') ? 'email' : 'phone';
      identifierValue = result.identifierValue;
      selectedJournalId = result.journalId || '';
      selectedJournalName = result.journalName || '';
      isReadOnly = result.readOnly !== false;  // Default to read-only
      
      // Show impersonation banner
      showImpersonationBanner(result.journalName, isReadOnly);
      
      // Jump straight to viewer (skip OTP)
      hideElement(document.getElementById('otpCard'));
      showElement(document.getElementById('sidebar'));
      showElement(document.getElementById('viewerCard'));
      
      await fetchDocs();
      renderLists();
      await loadCurrent();
      
    } else {
      // Invalid/expired token
      showMessage('error', result.error || 'Impersonation link is invalid or expired.');
      showStep('identifier');  // Back to login
    }
    
  } catch (err) {
    console.error('Impersonation login failed:', err);
    showMessage('error', 'Failed to activate impersonation session.');
    showStep('identifier');
    
  } finally {
    showSpinner(false);
  }
}

/**
 * Display a banner indicating impersonation mode
 */
function showImpersonationBanner(journalName, readOnly) {
  const banner = document.createElement('div');
  banner.id = 'impersonationBanner';
  banner.className = 'impersonation-banner';
  banner.innerHTML = `
    <span class="impersonation-icon">👁️</span>
    <span class="impersonation-text">
      <strong>Client Impersonation Active:</strong> ${journalName || 'Unknown Journal'}
      ${readOnly ? '(Read-Only)' : '(Approvals Enabled)'}
    </span>
  `;
  
  // Insert at top of body
  document.body.insertBefore(banner, document.body.firstChild);
}

// Call on page load (after brand/texts init)
document.addEventListener('DOMContentLoaded', async () => {
  await initBrand();
  await initTexts();
  await bootImpersonationIfPresent();
  // ... rest of init ...
});
```

---

#### 3.3 Add CSS for Impersonation Banner

**File:** `Client Impersonation/styles.css`

**Add at the end:**

```css
/* Impersonation Banner */
.impersonation-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10000;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 12px 20px;
  text-align: center;
  font-size: 14px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.impersonation-icon {
  font-size: 20px;
}

.impersonation-text {
  font-weight: 400;
}

.impersonation-text strong {
  font-weight: 600;
}

/* Adjust body padding when banner is present */
body.impersonation-active {
  padding-top: 50px;
}
```

---

#### 3.4 Update Approval Button Logic

**File:** `Client Impersonation/app.js`

**Location:** Where approval buttons are rendered/handled

**Add check for read-only mode:**

```javascript
function renderApprovalButton(doc) {
  // Don't show approval button if:
  // 1. Read-only impersonation session
  // 2. Document is already approved
  // 3. Approval is blocked on the document
  
  if (isReadOnly) {
    return '';  // No approval button in read-only mode
  }
  
  if (doc.status === 'Approved') {
    return '<span class="badge badge-success">✓ Approved</span>';
  }
  
  if (doc.isApprovalBlocked) {
    return '<span class="badge badge-warning">🔒 Approval Blocked</span>';
  }
  
  return `<button class="btn btn-approve" onclick="approveDocument('${doc.id}')">Approve</button>`;
}
```

---

## Testing Plan

### Phase 1: Salesforce Testing

#### Test Case 1.1: Create Impersonation (Email)
1. Open a Journal record in Production
2. Click "Create Client Impersonation" Quick Action
3. Select "Email" identifier type
4. Verify:
   - Token is 64 characters
   - URL contains `?impersonate=<token>`
   - Record created in `Client_Impersonation__c`
   - `Expires_At__c` is ~60 minutes in future
   - `Allow_Approve__c` is false

#### Test Case 1.2: Create Impersonation (Phone)
1. Same as 1.1 but select "Phone" identifier type
2. Verify phone number is normalized correctly

#### Test Case 1.3: Missing Identifier
1. Test with account that has no email/phone
2. Verify appropriate error message

---

### Phase 2: Lambda Testing

#### Test Case 2.1: Valid Impersonation Login
```bash
curl -X POST https://ysu7eo2haj.execute-api.eu-north-1.amazonaws.com/prod/impersonation/login \
  -H "Content-Type: application/json" \
  -d '{"token": "abc123..."}'
```

**Expected:**
```json
{
  "ok": true,
  "session": "<jwt-token>",
  "identifierType": "email",
  "identifierValue": "client@example.com",
  "journalId": "a0X...",
  "journalName": "J-0054489",
  "readOnly": true
}
```

#### Test Case 2.2: Expired Token
1. Create impersonation with past expiry
2. Attempt login
3. Expect: `{"ok": false, "error": "Token expired"}`

#### Test Case 2.3: Invalid Token
1. Use non-existent token
2. Expect: `{"ok": false, "error": "Invalid or expired token"}`

#### Test Case 2.4: Scope Enforcement
1. Login with impersonation session
2. Try to fetch document from different journal
3. Expect: `403 Forbidden`

#### Test Case 2.5: Read-Only Enforcement
1. Login with `Allow_Approve__c = false`
2. Try to approve a document
3. Expect: `403 {"error": "Approvals disabled for impersonation sessions"}`

---

### Phase 3: SPA Testing

#### Test Case 3.1: Manual URL Test
1. Copy impersonation URL from Salesforce
2. Paste in browser
3. Verify:
   - Banner appears at top
   - Shows journal name
   - Shows "Read-Only" or "Approvals Enabled"
   - Document list loads automatically
   - Can view documents
   - Cannot approve (if read-only)

#### Test Case 3.2: Expired Link
1. Use expired impersonation link
2. Verify error message
3. Verify redirect to login screen

---

## Deployment Sequence

### Step 1: Deploy Salesforce Changes (Production)

```powershell
cd "C:\Users\Mathias\Downloads\docshare-16-10-2025-fixed\Client Impersonation"

# 1. Deploy custom object
sf project deploy start -o prod -d "salesforce/main/default/objects/Client_Impersonation__c"

# 2. Deploy Apex class
sf project deploy start -o prod -d "salesforce/main/default/classes/ClientImpersonationService.cls"
sf project deploy start -o prod -d "salesforce/main/default/classes/ClientImpersonationService_Test.cls"

# 3. Run tests
sf apex run test -o prod -t ClientImpersonationService_Test -w 10

# 4. Deploy Quick Action (Flow or LWC component)
# (Manual via Setup UI or deploy flow metadata)
```

---

### Step 2: Deploy Lambda Changes

```powershell
# 1. Backup current lambda.py
Copy-Item lambda.py lambda.py.backup

# 2. Apply changes to lambda.py
# (Use the code changes documented above)

# 3. Package and deploy
Compress-Archive -Path lambda.py -DestinationPath lambda.zip -Force
aws lambda update-function-code --function-name <prod-function-name> --zip-file fileb://lambda.zip

# 4. Test endpoint
curl -X POST https://ysu7eo2haj.execute-api.eu-north-1.amazonaws.com/prod/impersonation/login `
  -H "Content-Type: application/json" `
  -d '{"token": "test-token"}'
```

---

### Step 3: Deploy SPA Changes

```powershell
# Assuming SPA is hosted on S3

# 1. Update app.js with impersonation code
# 2. Update styles.css with banner styles

# 3. Upload to S3
aws s3 cp app.js s3://your-spa-bucket/app.js --content-type "application/javascript"
aws s3 cp styles.css s3://your-spa-bucket/styles.css --content-type "text/css"

# 4. Invalidate CloudFront cache (if using)
aws cloudfront create-invalidation --distribution-id <dist-id> --paths "/app.js" "/styles.css"
```

---

## Security Considerations

### ✅ Strengths

1. **No New Authentication Surface**
   - Reuses proven Identifier Session infrastructure
   - Same HMAC-signed tokens
   - Same expiry/validation logic

2. **Server-Side Enforcement**
   - Journal scope enforced in Lambda, not client
   - Read-only flag in session payload (not URL)
   - Tampering session = invalid signature = 401

3. **Time-Boxed Access**
   - Default 60-minute expiry
   - Calculated dynamically on login
   - Links auto-expire even if not used

4. **Audit Trail**
   - Every impersonation attempt logged in Salesforce
   - Records IP address, timestamp
   - Can query `Client_Impersonation__c` for usage reports

5. **Single-Use Tokens**
   - Though re-usable within TTL, scope is fixed
   - Each link is journal-specific
   - No privilege escalation possible

---

### ⚠️ Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Link Sharing** | Links are time-limited; lawyer can revoke by deleting `Client_Impersonation__c` record |
| **Token Leakage** | HTTPS-only; short TTL; audit trail for investigation |
| **Accidental Approval** | Read-only by default; explicit flag required for approval rights |
| **Journal Enumeration** | Tokens are 64-char random hex (2^256 entropy); infeasible to guess |
| **Session Hijacking** | Bearer token in memory only; no cookies; HTTPS required |

---

## Rollback Plan

If issues arise:

### Salesforce Rollback
```powershell
# Delete all Client_Impersonation__c records
sf data delete record -o prod -s Client_Impersonation__c --where "Id != null"

# Remove Apex class
sf project delete source -o prod -m "ApexClass:ClientImpersonationService"
```

### Lambda Rollback
```powershell
# Restore backup
Copy-Item lambda.py.backup lambda.py

# Redeploy
Compress-Archive -Path lambda.py -DestinationPath lambda.zip -Force
aws lambda update-function-code --function-name <prod-function-name> --zip-file fileb://lambda.zip
```

### SPA Rollback
```powershell
# Revert to previous version from S3 versioning
aws s3api list-object-versions --bucket your-spa-bucket --prefix app.js
aws s3api copy-object --copy-source your-spa-bucket/app.js?versionId=<version-id> `
  --bucket your-spa-bucket --key app.js
```

---

## Success Criteria

### Functional Requirements
- [ ] Lawyer can create impersonation link from Journal record
- [ ] Link opens document portal with client's view
- [ ] Correct journal is loaded (no other journals visible)
- [ ] Read-only mode prevents approvals by default
- [ ] Optional approval flag works when enabled
- [ ] Links expire after 60 minutes
- [ ] Expired links show appropriate error
- [ ] Audit trail records usage

### Non-Functional Requirements
- [ ] No impact on existing identifier login flow
- [ ] No impact on existing journal login flow
- [ ] API response time < 500ms for impersonation login
- [ ] Zero false positives (wrong journal access)
- [ ] Zero privilege escalation vulnerabilities

---

## Future Enhancements

1. **Customizable TTL**
   - Allow lawyer to set expiry (30 min, 1 hour, 4 hours, etc.)

2. **Multi-Journal Links**
   - Some use cases may benefit from "all journals for this client"
   - Requires different architecture (identifier-scoped vs journal-scoped)

3. **Link Revocation UI**
   - Dedicated list view in Salesforce to see/revoke active links

4. **Notification on Use**
   - Email lawyer when impersonation link is first used

5. **Session Activity Log**
   - Track which documents were viewed during impersonation session

---

## Questions for Mathias

1. **Brand Detection:** The current proposal assumes we can detect brand from `Market_Unit__c`. Is this correct, or should we add a `Brand__c` field to Journal__c?

2. **Quick Action UI:** Would you prefer a Flow-based Quick Action or a custom LWC component? Flow is simpler but less flexible.

3. **Default Expiry:** Is 60 minutes appropriate, or should it be configurable per-link?

4. **Approval Rights:** Should `Allow_Approve__c` default to `false` (read-only) or should it be a required choice during link creation?

5. **SPA Location:** Are the SPA files in `Client Impersonation` folder the correct ones to modify, or should I work from a different location (e.g., `Assorted files/prod-version/`)?

---

## Conclusion

This implementation plan provides a **secure, minimal-change** approach to enable Client Impersonation by:

- Reusing existing session infrastructure
- Adding a single new endpoint (`/impersonation/login`)
- Enforcing all security server-side
- Providing clear audit trails
- Minimizing changes to existing code

The phased approach allows testing at each stage before proceeding to the next, reducing risk of production issues.

**Estimated Implementation Time:**
- Salesforce: 2-3 hours
- Lambda: 2-3 hours  
- SPA: 1-2 hours
- Testing: 2-3 hours
- **Total: 7-11 hours**

Ready to proceed when you give the green light! 🚀
