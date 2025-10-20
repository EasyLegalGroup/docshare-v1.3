# app.js Comparison: prod-version vs work-in-progress

## Executive Summary

**RISK LEVEL: HIGH** - Major architectural changes introducing identifier-based authentication

## Key Changes

### 1. API Configuration (BREAKING CHANGE)
- **PROD**: Hard-coded API endpoint `https://ysu7eo2haj.execute-api.eu-north-1.amazonaws.com/prod`
- **WIP**: Dynamic API selection via URL parameter `?api=` with fallback to `https://21tpssexjd.execute-api.eu-north-1.amazonaws.com`
- **IMPACT**: Requires API Gateway route updates; all clients must use new endpoint or pass `?api=` parameter

### 2. Authentication Model (BREAKING CHANGE)
- **PROD**: Journal-only flow (External ID + Access Token via `?e=` and `?t=` parameters)
- **WIP**: Dual-mode authentication:
  - **Journal mode**: Legacy flow (if `?e=` and `?t=` present)
  - **Identifier mode**: New flow (phone/email + OTP + session token)
- **NEW ENDPOINTS** (WIP only):
  - `/identifier/request-otp` - Request OTP for phone or email
  - `/identifier/verify-otp` - Verify OTP and receive session token
  - `/identifier/list` - List documents (requires Bearer token)
  - `/identifier/doc-url` - Get presigned URL (requires Bearer token)
  - `/identifier/approve` - Approve documents (requires Bearer token)

### 3. Phone Normalization (McPhone)
- **NEW**: Client-side phone normalization for DK/SE/IE markets
  - DK: `+45` + 8 digits, handles `0045` and `4545` double-prefix
  - SE: `+46` + 9-11 digits, handles `0046` and `4646`, strips leading `0`
  - IE: `+353` + 9-10 digits, handles `00353` and `353353`, strips leading `0`
- **FUNCTIONS**: `mcNormDK()`, `mcNormSE()`, `mcNormIE()`, `mcNormalize()`
- **IMPACT**: All phone inputs must pass through normalization before API calls

### 4. UI Changes - OTP Card
- **PROD**: Single-step OTP input (assumes Journal link sent via email/SMS)
- **WIP**: Two-step authentication:
  - **Step 1 (`#idStep`)**: Choose phone/email, enter identifier, request OTP
  - **Step 2 (`#verifyStep`)**: Enter OTP code, verify, includes "Start Over" button
- **NEW UI ELEMENTS**:
  - `#idChooser` - Phone/Email toggle buttons
  - `#phoneGroup` - Country picker dropdown (DK/SE/NO/DE/IE/NL/FI/UK)
  - `#emailGroup` - Email input field
  - `#startOverBtn` - Reset to Step 1
  - `#verifySub` - Displays "Vi har sendt en kode til {channel} {value}"

### 5. Session Management
- **NEW**: Session token handling for identifier mode
  - Token stored in `sessionToken` variable
  - Bearer token sent in `Authorization` header for identifier API calls
  - TTL controlled by backend (`URL_TTL_SECONDS` env var, default 900s)

### 6. Document Sorting
- **NEW**: Sort by `sortOrder` field (nulls last) then alphabetically
- **FUNCTION**: `getSortField(d)` - Extracts sort order from multiple field name variants
- **IMPACT**: Documents render in deterministic order per backend configuration

### 7. Helper Functions - i18n
- **NEW**: `_t_safe(k)` - Safe translation wrapper (prevents crashes if `window._t` undefined)
- **NEW**: Dynamic token substitution in `OTP_SUBTITLE` (replaces `{btn}` with button label)
- **PROD**: Direct `_t()` calls (assumes `window._t` always exists)

### 8. Chat Visibility
- **PROD**: Chat visible for all flows
- **WIP**: Chat **hidden** in identifier mode, **visible** in journal mode only
- **LOGIC**: `enterPortalUI()` shows/hides `#chatFab` and `#chatLabel` based on `MODE`

### 9. Print/Download Actions
- **PROD**: Handlers defined inline on viewer header buttons
- **WIP**: Handlers centralized in `doDownload()` and `doPrint()`, **also wired to completion modal buttons**
- **NEW**: Completion modal includes Download/Print buttons for post-approval convenience

### 10. Brand Detection
- **PROD**: Not present (brand set via `brand.js` only)
- **WIP**: Not present (remains `brand.js`-only)
- **NOTE**: Backend Lambda has brand detection logic, but SPA does not yet consume it

## Removed Features (PROD → WIP)
- **None** - WIP is additive, all prod features retained in journal mode

## Added Features (WIP only)
1. Identifier-based authentication (phone/email)
2. Multi-country phone normalization
3. Country picker UI
4. Session token auth
5. Two-step OTP flow with "Start Over"
6. Document sorting by `sortOrder`
7. Safe i18n wrapper
8. Completion modal download/print buttons

## Breaking Changes

### API Endpoints
| Feature | PROD Endpoint | WIP Endpoint | Notes |
|---------|---------------|--------------|-------|
| OTP Send | `/otp-send` | `/otp-send` (journal) <br> `/identifier/request-otp` (identifier) | New endpoint for identifier |
| OTP Verify | `/otp-verify` | `/otp-verify` (journal) <br> `/identifier/verify-otp` (identifier) | New endpoint returns session token |
| Doc List | `/doc-list` | `/doc-list` (journal) <br> `/identifier/list` (identifier) | Identifier requires Bearer token |
| Doc URL | `/doc-url` | `/doc-url` (journal) <br> `/identifier/doc-url` (identifier) | Identifier requires Bearer token |
| Approve | `/approve` | `/approve` (journal) <br> `/identifier/approve` (identifier) | Identifier requires Bearer token |

### CSS Selectors (New)
- `.otp-card` → Repositioned (`position:relative; padding-top:56px`)
- `.start-over-btn` → Absolute positioned (top-right)
- `.verify-sub` → Subtitle under "Start Over"
- `.id-chooser`, `.id-toggle`, `.id-form`, `.id-msg` → Identifier step 1
- `.phone-group`, `.phone-chooser`, `.phone-wrap`, `.phone-country-btn`, `.phone-dropdown`, `.phone-option`, `#phoneLocal` → Phone picker
- `.ghost.danger` → Red-themed button for "Start Over"

### JavaScript Globals (New)
- `MODE` - `'journal'` or `'identifier'`
- `identifierType` - `'phone'` or `'email'`
- `identifierValue` - Normalized phone or lowercase email
- `sessionToken` - Bearer token for identifier API calls

## Backward Compatibility

### Journal Mode (Legacy)
✅ **FULLY COMPATIBLE** - All existing `?e={externalId}&t={accessToken}` links work unchanged
- Chat remains available
- Same OTP verify flow
- Same document list/approval logic

### Identifier Mode (New)
⚠️ **NEW FLOW** - Requires backend support for:
- `/identifier/*` endpoints
- `OTP__c` object with fields: `Purpose__c`, `Brand__c`, `Identifier_Type__c`, `Identifier_Value__c`, `Code__c`, `Status__c`, `Sent_At__c`, `Expires_At__c`, `Attempt_Count__c`, `Resend_Count__c`
- Session token generation (HMAC-based)
- Shared_Document__c queries by `Journal__r.Account__r.PersonEmail` / `Spouse_Email__pc` / `Phone_Formatted__c` / `Spouse_Phone__pc`

## Testing Requirements

### Regression Testing (Journal Mode)
1. Open link with `?e=...&t=...` → Should go straight to OTP verify (legacy behavior)
2. Enter correct OTP → Documents load
3. Approve document → Status changes to Approved
4. Chat → Should be visible and functional
5. Download/Print → Should work from both header and completion modal

### New Feature Testing (Identifier Mode)
1. Open link without `?e=` or `?t=` → Should show phone/email chooser
2. **Phone flow (DK)**:
   - Enter `12345678` → Normalizes to `+4512345678`
   - Enter `+45 12 34 56 78` → Normalizes to `+4512345678`
   - Enter `0045 12345678` → Normalizes to `+4512345678`
   - Enter `4545 12345678` (double prefix) → Normalizes to `+4512345678`
3. **Phone flow (SE)**:
   - Enter `0701234567` → Normalizes to `+46701234567`
   - Enter `+46 70 123 45 67` → Normalizes to `+46701234567`
   - Enter `4646 701234567` (double prefix) → Normalizes to `+46701234567`
4. **Phone flow (IE)**:
   - Enter `0851234567` → Normalizes to `+353851234567`
   - Enter `+353 85 123 4567` → Normalizes to `+353851234567`
   - Enter `353353 851234567` (double prefix) → Normalizes to `+353851234567`
5. **Email flow**:
   - Enter `test@example.com` → Normalizes to lowercase
   - Enter `TEST@EXAMPLE.COM` → Normalizes to `test@example.com`
6. **Request OTP** → Backend creates `OTP__c` record (even if no match)
7. **Verify OTP** → Returns session token
8. **List documents** → Shows documents linked to phone/email
9. **View document** → Presigned URL works
10. **Approve document** → Status changes
11. **Chat** → Should be hidden (not applicable in identifier mode)
12. **Start Over** → Resets to Step 1, clears inputs

### Edge Cases
1. **Invalid phone**: `abc` → Error (no digits)
2. **Invalid email**: `not-an-email` → Error (no `@` or `.`)
3. **Expired OTP**: Enter code after 5 minutes → Error
4. **Wrong OTP**: Enter incorrect code → Error, increments `Attempt_Count__c`
5. **No documents**: Identifier matches no journals → Empty list with "No documents" message
6. **Session timeout**: After 15 minutes (default TTL) → 401 Unauthorized, must re-authenticate

## Deployment Order

1. **Backend (Lambda)**:
   - Deploy new Lambda code with `/identifier/*` endpoints
   - Add `SESSION_HMAC_SECRET` to env vars (generate with `secrets.token_hex(32)`)
   - Add `DEBUG_ALLOW_IDENTIFIER_DOCURL=false` (prod) or `true` (dev/test)
   - Update `DOCS_BUCKET` if changed
   - Update `S3_PREFIX_MAP` if multi-region S3 paths needed

2. **Salesforce**:
   - Create `OTP__c` custom object with required fields
   - Update `Shared_Document__c` SOQL queries to support email/phone lookups
   - Add `Sort_Order__c` field to `Shared_Document__c` (Number, optional)
   - Update `Account` object:
     - `Phone_Formatted__c` (Text, normalized format)
     - `Spouse_Email__pc` (Email, person account)
     - `Spouse_Phone__pc` (Phone, person account)
   - Deploy Apex classes (if any backend changes)

3. **SPA (S3 / CloudFront)**:
   - Upload new `app.js`
   - Upload new `styles.css` (identifier UI styles)
   - Upload new `index.html` (identifier HTML structure)
   - Invalidate CDN cache: `/*`

4. **API Gateway**:
   - Verify `/identifier/*` routes exist and point to Lambda
   - Ensure CORS allows `Authorization` header
   - Test with `curl` or Postman before SPA deploy

5. **DNS / Load Balancer**:
   - No changes required (endpoints remain on same domain)

## Rollback Plan

1. **Lambda**: Redeploy previous version via AWS Console or CLI
2. **SPA**: Restore previous S3 files, invalidate CDN
3. **Salesforce**: Drop `OTP__c` object (if no data loss acceptable), or keep and ignore
4. **API Gateway**: No changes (routes are additive, won't break journal mode)

## Security Considerations

### Session Tokens
- ⚠️ **CRITICAL**: `SESSION_HMAC_SECRET` must be rotated regularly (recommend quarterly)
- ✅ Token includes `nonce` to prevent replay attacks
- ✅ Token has `exp` (expiration) field enforced by backend
- ⚠️ Tokens stored in JavaScript `sessionToken` variable (memory only, not persisted)
- ⚠️ No refresh token mechanism (user must re-authenticate after TTL expires)

### OTP Security
- ✅ OTP expires after 5 minutes
- ✅ `Attempt_Count__c` increments on failed verify (backend can rate-limit)
- ⚠️ No CAPTCHA or bot protection (recommend adding after MVP)
- ⚠️ Backend **always creates OTP__c** even if identifier doesn't match (prevents enumeration)

### Phone/Email Privacy
- ⚠️ Identifier value sent in plaintext over HTTPS (acceptable for non-PII context)
- ⚠️ No hashing of phone/email in OTP__c (Salesforce standard security applies)
- ✅ No identifiers logged to console (protected by production log level)

## Performance Impact

### Client-Side
- **Negligible**: ~50KB increase in `app.js` (minified)
- Phone normalization runs in <1ms
- No additional network requests in journal mode

### Server-Side (Lambda)
- **Identifier mode**: +2 API calls per login (request-otp, verify-otp) vs journal (1 OTP call)
- **Session validation**: +1 HMAC verification per identifier API call (~0.5ms)
- **SOQL complexity**: Identifier list queries use indexed fields (`PersonEmail`, `Phone_Formatted__c`), expect <100ms

### Database (Salesforce)
- **New object**: `OTP__c` → Expect ~1000 records/day (retention policy recommended: delete after 7 days)
- **Query load**: Email/phone lookups add ~2-5 SOQL queries per identifier session

## Monitoring Requirements

### Metrics to Track
1. **Mode split**: % journal vs % identifier logins
2. **OTP success rate**: verified / sent (target: >90%)
3. **Session token errors**: 401 Unauthorized count (watch for spikes indicating TTL issues)
4. **Phone normalization failures**: Logs showing `warning: "no digits"` or similar
5. **Lambda /identifier/* latency**: p50/p95/p99 (target: <500ms)
6. **Salesforce OTP__c growth**: Record count (alert if >10K in 24h)

### Alerts to Configure
- **CRITICAL**: `/identifier/verify-otp` 5xx rate >5% over 5 minutes
- **WARNING**: OTP success rate <80% over 1 hour
- **INFO**: Identifier mode adoption crosses 50% of total logins

## Documentation Updates Required

### End-User Docs
- Add section: "New login method: Enter your phone or email"
- FAQ: "Why do I need to enter my phone number?"
- FAQ: "I didn't receive the OTP code" (check spam, wait 1 minute, click "Send code" again)

### Developer Docs
- API reference: Document `/identifier/*` endpoints
- Phone normalization logic: DK/SE/IE examples
- Session token format: JWT-like but custom HMAC
- Migration guide: "Journal links still work, but identifier is preferred for new users"

### Ops Runbook
- **Incident**: "OTP not sending" → Check Lambda logs, Salesforce email/SMS delivery, OTP__c creation
- **Incident**: "Session expired too quickly" → Verify `URL_TTL_SECONDS` env var (default 900 = 15 min)
- **Incident**: "Phone normalization bug" → Add new country to `PHONE_COUNTRIES` list and `mcNorm{CC}()` function

---

## Summary Table

| Aspect | PROD | WIP | Risk |
|--------|------|-----|------|
| **Auth Models** | Journal only | Journal + Identifier | HIGH |
| **API Endpoint** | Hard-coded | Dynamic (`?api=` param) | MEDIUM |
| **OTP Flow** | 1-step | 2-step (identifier) or 1-step (journal) | LOW |
| **Phone Support** | N/A | DK/SE/IE with normalization | MEDIUM |
| **Session Tokens** | N/A | HMAC-based | HIGH |
| **Chat** | Always visible | Journal only | LOW |
| **Document Sorting** | None | By `sortOrder` then name | LOW |
| **Download/Print** | Header only | Header + Completion modal | LOW |

**OVERALL RISK: HIGH** - Requires careful coordination of Lambda, Salesforce, and SPA deployments. Recommend phased rollout:
1. Deploy to sandbox/dev
2. Test all identifier flows + regression test journal flows
3. Deploy to staging with 10% traffic
4. Monitor for 48 hours
5. Ramp to 100% over 7 days
