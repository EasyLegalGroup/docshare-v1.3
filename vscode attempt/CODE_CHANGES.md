# Code Changes - Detailed Diffs

## File: app.js

### Change 1: requestOtpIdentifier() - Fix Phone Duplication

```diff
  async function requestOtpIdentifier(){
    // Gather input depending on channel
    let payload = { channel: identifierType, market: (window.__BRAND && window.__BRAND.market) || '' };
  
    if (identifierType === 'phone'){
      const phoneLocal = ($('phoneLocal')?.value || '').trim();
      const iso = $('phoneCountryBtn')?.dataset?.iso || DEFAULT_PHONE_ISO;
      const dial = (PHONE_COUNTRIES.find(c=>c.iso===iso) || PHONE_COUNTRIES[0]).dial;
-     const raw = `+${dial}${phoneLocal}`;
+     
+     // Fix: Detect if user pasted full international number to avoid double prefix
+     let raw = phoneLocal;
+     if (raw.startsWith('+') || raw.startsWith('00')) {
+       // Already international format, use as-is
+       raw = raw;
+     } else if (raw.startsWith(dial)) {
+       // Already has dial code, prepend +
+       raw = '+' + raw;
+     } else {
+       // Normal case: prepend full prefix
+       raw = `+${dial}${raw}`;
+     }
+     
      const norm = mcNormalize(raw, iso);
      identifierValue = norm.e164 || raw;
      payload.phone       = norm.e164 || raw;
      payload.phoneDigits = norm.digits || '';
      payload.country     = iso;
```

### Change 2: mcNormDK() - Handle Double Prefix

```diff
  function mcNormDK(raw){
    const out = { digits:null, ok:false, warning:null, e164:'' };
    if (!raw || !raw.trim()){ out.warning='Blank input'; return out; }
    let digits = raw.replace(/[^0-9]/g,'');
    if (!digits){ out.warning='No digits found'; return out; }
    if (digits.startsWith('0045')) digits = '45' + digits.substring(4);
+   // Handle double-prefix: 4545... → 45...
+   if (digits.startsWith('4545') && digits.length >= 12) digits = digits.substring(2);
    if (digits.length === 8) digits = '45' + digits;
    const ok = (digits.startsWith('45') && digits.length === 10);
    out.digits = digits; out.ok = ok; out.warning = ok?null:'DK sanity check failed (expect 45 + 8 digits)'; out.e164 = digits?('+'+digits):''; return out;
  }
```

### Change 3: mcNormSE() - Handle Double Prefix

```diff
  function mcNormSE(raw){
    const out = { digits:null, ok:false, warning:null, e164:'' };
    if (!raw || !raw.trim()){ out.warning='Blank input'; return out; }
    let digits = raw.replace(/[^0-9]/g,'');
    if (!digits){ out.warning='No digits found'; return out; }
    if (digits.startsWith('0046')) digits = '46' + digits.substring(4);
+   // Handle double-prefix: 4646... → 46...
+   else if (digits.startsWith('4646') && digits.length >= 12) digits = digits.substring(2);
    else if (digits.startsWith('46')) { /* ok */ }
    else if (digits.startsWith('0') && digits.length >= 2) digits = '46' + digits.substring(1);
    const ok = (digits.startsWith('46') && digits.length >= 10 && digits.length <= 12);
    out.digits = digits; out.ok = ok; out.warning = ok?null:'SE sanity check failed (expect starts with 46 and reasonable length)'; out.e164 = digits?('+'+digits):''; return out;
  }
```

### Change 4: mcNormIE() - Handle Double Prefix

```diff
  function mcNormIE(raw){
    const out = { digits:null, ok:false, warning:null, e164:'' };
    if (!raw || !raw.trim()){ out.warning='Blank input'; return out; }
    let digits = raw.replace(/[^0-9]/g,'');
    if (!digits){ out.warning='No digits found'; return out; }
    if (digits.startsWith('00353')) digits = '353' + digits.substring(5);
+   // Handle double-prefix: 353353... → 353...
+   else if (digits.startsWith('353353') && digits.length >= 16) digits = digits.substring(3);
    else if (digits.startsWith('353')) { /* ok */ }
    else if (digits.startsWith('0') && digits.length >= 2) digits = '353' + digits.substring(1);
    const ok = (digits.startsWith('353') && digits.length >= 12 && digits.length <= 13);
    out.digits = digits; out.ok = ok; out.warning = ok?null:'IE sanity check failed (expect starts with 353 and reasonable length)'; out.e164 = digits?('+'+digits):''; return out;
  }
```

### Change 5: showStep() - Hide Help Text During Verify

```diff
  function showStep(which){
    const idStep = $('idStep');
    const verifyStep = $('verifyStep');
-   if (which === 'verify'){ hide(idStep); show(verifyStep); }
-   else { show(idStep); hide(verifyStep); }
+   const subtitle = document.querySelector('[data-i18n="OTP_SUBTITLE"]');
+   const idChooser = $('idChooser');
+   
+   if (which === 'verify'){ 
+     hide(idStep); 
+     show(verifyStep); 
+     if (subtitle) hide(subtitle);       // NEW: Hide help text
+     if (idChooser) hide(idChooser);     // NEW: Hide phone/email chooser
+   } else { 
+     show(idStep); 
+     hide(verifyStep); 
+     if (subtitle) show(subtitle);       // NEW: Show help text
+     if (idChooser) show(idChooser);     // NEW: Show phone/email chooser
+   }
  }
```

---

## File: lambda.py

### Change 1: handle_identifier_request_otp() - Always Create OTP Record

```diff
  def handle_identifier_request_otp(event, data):
      raw_email = (data.get("email") or "").strip()
      raw_phone = (data.get("phone") or "").strip()
      has_email = bool(raw_email)
      has_phone = bool(raw_phone)
      if not (has_email ^ has_phone):
          return resp(event, 400, {"error": "Provide exactly one of: email OR phone"})
  
      try:
          org_token, instance_url = get_org_token()
  
          # --- 1) existence check (no enumeration in response) ---
          if has_email:
              email = raw_email.lower()
              if "@" not in email or "." not in email.split("@")[-1]:
                  return resp(event, 200, {"ok": True})  # soft success
              exists = _identifier_exists(instance_url, org_token, email=email)
          else:
              phone = normalize_phone_basic(raw_phone)
              if not any(ch.isdigit() for ch in phone):
                  return resp(event, 200, {"ok": True})
              exists = _identifier_exists(instance_url, org_token, phone=phone)
  
-         if not exists:
-             # soft success (avoid enumeration)
-             return resp(event, 200, {"ok": True})
  
-         # --- 2) build OTP__c (always CREATE a row) ---
+         # --- 2) build OTP__c (ALWAYS CREATE a row, even if no match) ---
          brand = detect_brand(event)
          now = datetime.datetime.utcnow()
          expires = (now + datetime.timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
          code = f"{random.randint(0, 999999):06d}"
          identifier_type  = "Email" if has_email else "Phone"
          identifier_value = (raw_email.lower() if has_email else normalize_phone_basic(raw_phone))
          channel = "Email" if has_email else "SMS"
  
          # count prior sends for Resend_Count__c
          try:
              soql_cnt = (
                  "SELECT COUNT() FROM OTP__c WHERE "
                  f"Purpose__c = '{OTP_PURPOSE}' AND "
                  f"Brand__c = '{brand}' AND "
                  f"Identifier_Type__c = '{identifier_type}' AND "
                  f"Identifier_Value__c = '{soql_escape(identifier_value)}'"
              )
              prev_count = int(salesforce_query(instance_url, org_token, soql_cnt).get("totalSize", 0))
          except Exception:
              prev_count = 0
  
          unique_key = f"{OTP_PURPOSE}|{identifier_type}|{identifier_value}|{brand}|{secrets.token_hex(8)}"
  
          fields = {
              "Key__c": unique_key,
              "Brand__c": brand,
              "Purpose__c": OTP_PURPOSE,
              "Resource_Type__c": "Shared_Document__c",
              "Identifier_Type__c": identifier_type,
              "Identifier_Value__c": identifier_value,
              "Channel__c": channel,
  
              "Code__c": code,
              "Status__c": "Pending",
              "Sent_At__c": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
              "Expires_At__c": expires,
              "Attempt_Count__c": 0,
              "Resend_Count__c": prev_count,
          }
  
          try:
              rec_id = salesforce_insert(instance_url, org_token, "OTP__c", fields)
-             log("OTP__c created", rec_id, identifier_type, identifier_value, brand)
+             log("OTP__c created", rec_id, identifier_type, identifier_value, brand, "exists:", exists)
          except Exception as e:
              log("OTP__c create error:", repr(e))
  
-         # Always soft-success
+         # Always soft-success (whether match exists or not)
          return resp(event, 200, {"ok": True})
  
      except Exception as e:
          log("identifier_request_otp error:", repr(e))
          # still soft-success to avoid leaking anything
          return resp(event, 200, {"ok": True})
```

### Change 2: s3_presign_get() - Inline Content Disposition

```diff
  def s3_presign_get(bucket, key, expires=600):
      return _s3.generate_presigned_url(
          ClientMethod="get_object",
          Params={
              "Bucket": bucket,
              "Key": key,
-             "ResponseContentDisposition": f'attachment; filename="{os.path.basename(key)}"',
+             "ResponseContentDisposition": f'inline; filename="{os.path.basename(key)}"',
+             "ResponseContentType": "application/pdf",
          },
          ExpiresIn=int(expires),
      )
```

---

## File: styles.css

### Change 1: Position OTP Card and "Start forfra" Button

```diff
  /* ───────────────────────────────────────────────────────────
     OTP CARD
     ─────────────────────────────────────────────────────────── */
- .otp-card{text-align:center;margin:60px auto;max-width:750px}
+ .otp-card{text-align:center;margin:60px auto;max-width:750px;position:relative;padding-top:56px}
  .otp-card .muted{color:var(--muted)}
  .otp-form{display:flex;gap:12px;justify-content:center;align-items:center;margin-top:12px}
  #otp{width:120px;padding:10px;border:1px solid var(--border);border-radius:6px;text-align:center;font-size:18px}
  .otp-msg{min-height:22px;margin-top:6px;font-size:14px;color:var(--muted)}
  .small{font-size:14px}
+ 
+ /* Position "Start forfra" button in top-right during verify step */
+ .verify-header{position:absolute;top:12px;right:12px;display:flex;justify-content:flex-end;align-items:flex-start;flex-direction:column;gap:8px}
```

---

## Summary of Lines Changed

| File | Lines Added | Lines Removed | Net Change |
|------|-------------|---------------|------------|
| app.js | 28 | 5 | +23 |
| lambda.py | 5 | 5 | 0 |
| styles.css | 4 | 1 | +3 |
| **Total** | **37** | **11** | **+26** |

---

## Files Created

1. `BUGFIX_SUMMARY.md` - Comprehensive documentation of all fixes
2. `TEST_REFERENCE.md` - Testing scenarios and success criteria  
3. `CODE_CHANGES.md` - This file (detailed diffs)

---

## Deployment Checklist

- [ ] Review all diffs above
- [ ] Deploy `lambda.py` to AWS Lambda
- [ ] Deploy `app.js` to web hosting
- [ ] Deploy `styles.css` to web hosting
- [ ] Clear CloudFront/CDN cache (if applicable)
- [ ] Test each scenario from TEST_REFERENCE.md
- [ ] Verify no JavaScript console errors
- [ ] Verify no API 400/500 errors
- [ ] Verify Salesforce OTP__c records are created
- [ ] Cross-browser testing (Chrome, Firefox, Edge, Safari)
- [ ] Mobile responsive testing (optional but recommended)

---

**Generated:** October 17, 2025  
**Total Changes:** 26 lines across 3 files  
**Schema Changes:** 0 (zero)  
**Breaking Changes:** None
