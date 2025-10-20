# Code Diffs - Ready to Copy/Paste

## 🎨 styles.css Changes

### Find this section (around line 54):
```css
.otp-card{text-align:center;margin:60px auto;max-width:750px}
```

### Replace with:
```css
.otp-card{
  text-align:center;
  margin:60px auto;
  max-width:750px;
  position:relative;
  padding-top:56px;
}
```

---

### Add this NEW rule after .otp-msg (around line 60):
```css
/* ISSUE 6 FIX: Position "Start forfra" button in top-right corner */
.verify-header{
  position:absolute;
  top:12px;
  right:12px;
  display:flex;
  justify-content:flex-end;
  align-items:center;
  gap:8px;
}
.verify-sub{
  margin:0;
  font-size:14px;
  color:var(--muted);
}
```

---

### Add this NEW rule after .ghost.colorful3 (around line 80):
```css
.ghost.danger{border-color:#ef4444;color:#ef4444}
.ghost.danger:hover{background:#fee2e2}
```

---

## 📱 app.js Changes

### Change 1: Update `requestOtpIdentifier()` function

**Find (around line 299):**
```javascript
async function requestOtpIdentifier(){
  spin(true); setIdMsg('');
  try {
    const market = window.__BRAND?.market || 'DFJ_DK';
    
    if (identifierType === 'phone') {
      const btn   = $('phoneCountryBtn');
      const local = ($('phoneLocal').value || '').trim();
      const iso   = btn.dataset.iso || 'DK';
      const dial  = btn.dataset.dial || '45';
      
      if (!local) {
        setIdMsg('⚠️ ' + _t_safe('OTP_ERROR_PHONE_EMPTY'));
        spin(false);
        return;
      }
      
      const raw = '+' + dial + local;
      const norm = mcNormalize(raw, iso);
```

**Replace entire function with:**
```javascript
async function requestOtpIdentifier(){
  spin(true); setIdMsg('');
  try {
    const market = window.__BRAND?.market || 'DFJ_DK';
    
    if (identifierType === 'phone') {
      const btn   = $('phoneCountryBtn');
      const local = ($('phoneLocal').value || '').trim();
      const iso   = btn.dataset.iso || 'DK';
      const dial  = btn.dataset.dial || '45';
      
      if (!local) {
        setIdMsg('⚠️ ' + _t_safe('OTP_ERROR_PHONE_EMPTY'));
        spin(false);
        return;
      }
      
      // ISSUE 1 FIX: Detect if user pasted a full international number
      let raw = local;
      const startsWithPlus = raw.startsWith('+');
      const startsWithZeroZero = raw.replace(/\s/g, '').startsWith('00');
      const digitsOnly = raw.replace(/\D/g, '');
      
      // Check if digits already start with the dial code
      const alreadyHasDial = digitsOnly.startsWith(dial);
      
      // Only prepend + and dial code if not already present
      if (!startsWithPlus && !startsWithZeroZero && !alreadyHasDial) {
        raw = '+' + dial + local;
      } else if (startsWithZeroZero) {
        // Convert 00XX to +XX
        raw = '+' + raw.replace(/\s/g, '').substring(2);
      } else if (!startsWithPlus && alreadyHasDial) {
        // Add + prefix if missing but dial code is there
        raw = '+' + raw;
      }
      
      const norm = mcNormalize(raw, iso);
      if (!norm.ok) {
        setIdMsg('⚠️ ' + (norm.warning || _t_safe('OTP_ERROR_PHONE_INVALID')));
        spin(false);
        return;
      }
      
      identifierValue = norm.e164;
      const payload = {
        channel: 'phone',
        market,
        phone: norm.e164,
        phoneDigits: norm.digits,
        country: iso
      };
      
      const resp = await fetch(ID_REQUEST_OTP, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!resp.ok) throw new Error('Request failed');
      setIdMsg('✓ ' + _t_safe('OTP_SENT_SUCCESS'));
      showStep('verify');
      
    } else {
      // email
      const email = ($('emailInput').value || '').trim();
      if (!email || !/\S+@\S+\.\S+/.test(email)) {
        setIdMsg('⚠️ ' + _t_safe('OTP_ERROR_EMAIL_INVALID'));
        spin(false);
        return;
      }
      
      identifierValue = email;
      const payload = { channel: 'email', market, email };
      
      const resp = await fetch(ID_REQUEST_OTP, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!resp.ok) throw new Error('Request failed');
      setIdMsg('✓ ' + _t_safe('OTP_SENT_SUCCESS'));
      showStep('verify');
    }
  } catch (err) {
    console.error(err);
    setIdMsg('⚠️ ' + _t_safe('OTP_ERROR_GENERIC'));
  } finally {
    spin(false);
  }
}
```

---

### Change 2: Update `showStep()` function

**Find (around line 274):**
```javascript
function showStep(which){
  if (which === 'verify') {
    hide($('idStep'));
    show($('verifyStep'));
    setVerifySub();
  } else {
    show($('idStep'));
    hide($('verifyStep'));
  }
}
```

**Replace with:**
```javascript
function showStep(which){
  const idStep = $('idStep');
  const verifyStep = $('verifyStep');
  const subtitle = document.querySelector('[data-i18n="OTP_SUBTITLE"]');
  const idChooser = $('idChooser');
  
  if (which === 'verify') {
    hide(idStep);
    if (subtitle) hide(subtitle);   // ISSUE 5 FIX: Hide help text
    if (idChooser) hide(idChooser); // ISSUE 5 FIX: Hide chooser
    show(verifyStep);
    setVerifySub();
  } else {
    show(idStep);
    if (subtitle) show(subtitle);   // ISSUE 5 FIX: Show help text
    if (idChooser) show(idChooser); // ISSUE 5 FIX: Show chooser
    hide(verifyStep);
  }
}
```

---

### Optional Change 3: Enhance `mcNormDK()` (around line 215)

**Find:**
```javascript
function mcNormDK(raw){
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('45')) d = d.substring(2);
  if (d.length !== 8) return { digits: d, ok: false, warning: 'Danish mobile must be 8 digits', e164: '+45' + d };
  return { digits: '45' + d, ok: true, warning: null, e164: '+45' + d };
}
```

**Replace with:**
```javascript
function mcNormDK(raw){
  let d = raw.replace(/\D/g, '');
  
  // ISSUE 1 FIX: Handle double-prefixed "4545..."
  if (d.startsWith('4545') && d.length > 10) {
    d = d.substring(2); // Remove duplicate "45"
  }
  
  if (d.startsWith('45')) d = d.substring(2);
  if (d.length !== 8) return { digits: d, ok: false, warning: 'Danish mobile must be 8 digits', e164: '+45' + d };
  return { digits: '45' + d, ok: true, warning: null, e164: '+45' + d };
}
```

---

### Optional Change 4: Enhance `mcNormSE()` (around line 225)

**Find:**
```javascript
function mcNormSE(raw){
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('46')) d = d.substring(2);
  if (!/^7[0236]/.test(d)) return { digits: d, ok: false, warning: 'Swedish mobile must start with 70/72/73/76', e164: '+46' + d };
  if (d.length < 9 || d.length > 10) return { digits: d, ok: false, warning: 'Swedish mobile must be 9-10 digits', e164: '+46' + d };
  return { digits: '46' + d, ok: true, warning: null, e164: '+46' + d };
}
```

**Replace with:**
```javascript
function mcNormSE(raw){
  let d = raw.replace(/\D/g, '');
  
  // ISSUE 1 FIX: Handle double-prefixed "4646..."
  if (d.startsWith('4646') && d.length > 11) {
    d = d.substring(2); // Remove duplicate "46"
  }
  
  if (d.startsWith('46')) d = d.substring(2);
  if (!/^7[0236]/.test(d)) return { digits: d, ok: false, warning: 'Swedish mobile must start with 70/72/73/76', e164: '+46' + d };
  if (d.length < 9 || d.length > 10) return { digits: d, ok: false, warning: 'Swedish mobile must be 9-10 digits', e164: '+46' + d };
  return { digits: '46' + d, ok: true, warning: null, e164: '+46' + d };
}
```

---

### Optional Change 5: Enhance `mcNormIE()` (around line 236)

**Find:**
```javascript
function mcNormIE(raw){
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('353')) d = d.substring(3);
  if (!d.startsWith('8')) return { digits: d, ok: false, warning: 'Irish mobile must start with 8', e164: '+353' + d };
  if (d.length !== 9) return { digits: d, ok: false, warning: 'Irish mobile must be 9 digits', e164: '+353' + d };
  return { digits: '353' + d, ok: true, warning: null, e164: '+353' + d };
}
```

**Replace with:**
```javascript
function mcNormIE(raw){
  let d = raw.replace(/\D/g, '');
  
  // ISSUE 1 FIX: Handle double-prefixed "353353..."
  if (d.startsWith('353353') && d.length > 12) {
    d = d.substring(3); // Remove duplicate "353"
  }
  
  if (d.startsWith('353')) d = d.substring(3);
  if (!d.startsWith('8')) return { digits: d, ok: false, warning: 'Irish mobile must start with 8', e164: '+353' + d };
  if (d.length !== 9) return { digits: d, ok: false, warning: 'Irish mobile must be 9 digits', e164: '+353' + d };
  return { digits: '353' + d, ok: true, warning: null, e164: '+353' + d };
}
```

---

## ⚡ lambda.mjs Changes (AWS SDK v3)

### Change 1: Update `/identifier/request-otp` handler

**Current pattern (pseudo-code):**
```javascript
// Find matching person
const person = await findPersonByPhone(phoneDigits);

if (!person) {
  return { statusCode: 404, body: 'Not found' }; // ❌ OLD - Don't do this
}

// Create OTP only if match found
const otpRecord = {
  Code__c: otpCode,
  Person__c: person.id,  // Only set if person exists
};
await createOTP(otpRecord);
```

**New pattern:**
```javascript
// ISSUE 2 FIX: Find matching person (optional)
const person = await findPersonByPhone(phoneDigits);

// Generate OTP code regardless of match
const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

// Create OTP record - set lookups to null if no match
const otpRecord = {
  Code__c: otpCode,
  Channel__c: 'phone',
  Identifier__c: phone,
  Market__c: market,
  Expires_At__c: expiresAt,
  Used__c: false,
  
  // Lookups - null if no person found (Salesforce accepts this)
  Person__c: person ? person.id : null,
  Contact__c: person ? person.contactId : null,
  Account__c: person ? person.accountId : null
};

await createOTP(otpRecord);

// Send SMS/Email
await sendOTP(channel, phone || email, otpCode);

// Always return success (don't reveal if identifier exists)
return { statusCode: 200, body: JSON.stringify({ success: true }) };
```

**⚠️ IMPORTANT:** Replace field names (Code__c, Person__c, etc.) with YOUR actual Salesforce field names from your existing lambda.mjs code!

---

### Change 2: Update presigned URL generation (AWS SDK v3)

**Find pattern like:**
```javascript
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Current
const command = new GetObjectCommand({
  Bucket: bucketName,
  Key: objectKey
});
```

**Replace with:**
```javascript
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// ISSUE 3 FIX: Add inline content disposition
const command = new GetObjectCommand({
  Bucket: bucketName,
  Key: objectKey,
  ResponseContentDisposition: `inline; filename="${sanitizeFilename(filename)}.pdf"`,
  ResponseContentType: 'application/pdf'
});

// Helper to prevent header injection
function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}
```

---

### Alternative: AWS SDK v2

**Find pattern like:**
```javascript
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

// Current
const params = {
  Bucket: bucketName,
  Key: objectKey,
  Expires: 3600
};

const url = s3.getSignedUrl('getObject', params);
```

**Replace with:**
```javascript
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

// ISSUE 3 FIX: Add inline content disposition
const params = {
  Bucket: bucketName,
  Key: objectKey,
  Expires: 3600,
  ResponseContentDisposition: `inline; filename="${sanitizeFilename(filename)}.pdf"`,
  ResponseContentType: 'application/pdf'
};

const url = s3.getSignedUrl('getObject', params);

// Helper to prevent header injection
function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}
```

---

## 🧪 Quick Test Commands

### Test Phone Duplication (Browser Console)
```javascript
// Paste this in browser console after entering phone
const payload = {
  channel: 'phone',
  market: 'DFJ_DK',
  phone: document.querySelector('#phoneLocal').value,
  phoneDigits: document.querySelector('#phoneLocal').value.replace(/\D/g, ''),
  country: 'DK'
};
console.log(JSON.stringify(payload, null, 2));
// Should NOT have duplicate dial code in phone/phoneDigits
```

### Test OTP Creation (Salesforce SOQL)
```sql
SELECT Id, Code__c, Channel__c, Identifier__c, Person__c, Contact__c, Used__c, Expires_At__c
FROM OTP__c
WHERE Identifier__c = '+4599999999'
ORDER BY CreatedDate DESC
LIMIT 1

-- Should return a record even if Person__c is null
```

### Test Inline Rendering (Browser DevTools)
```javascript
// Check iframe src in console
const iframeSrc = document.querySelector('#pdf').src;
console.log('Iframe URL:', iframeSrc);
console.log('Has inline?', iframeSrc.includes('inline'));

// Check response headers (Network tab → click S3 URL → Headers)
// Should show: Content-Disposition: inline; filename="..."
```

---

## 📋 Pre-Deployment Checklist

- [ ] Backed up production files
- [ ] Reviewed all diffs above
- [ ] Identified exact Salesforce field names from current lambda.mjs
- [ ] Replaced placeholder field names (Code__c, etc.) with actual names
- [ ] Tested phone normalization logic locally
- [ ] Confirmed AWS SDK version (v2 or v3)
- [ ] Prepared rollback plan

## 🚀 Deployment Order

1. Deploy `styles.css` first (safest, visual only)
2. Deploy `app.js` second (client-side logic)
3. Deploy `lambda.mjs` last (backend logic)
4. Run smoke tests from TESTING_GUIDE.md

## ✅ Post-Deployment Validation

```bash
# Test 1: Phone duplication
curl -X POST https://YOUR-API/identifier/request-otp \
  -H "Content-Type: application/json" \
  -d '{"channel":"phone","market":"DFJ_DK","phone":"+4542455150","phoneDigits":"4542455150","country":"DK"}'
# Expect: 200 OK

# Test 2: Non-existent identifier
curl -X POST https://YOUR-API/identifier/request-otp \
  -H "Content-Type: application/json" \
  -d '{"channel":"phone","market":"DFJ_DK","phone":"+4599999999","phoneDigits":"4599999999","country":"DK"}'
# Expect: 200 OK (should create OTP even without match)

# Test 3: Presigned URL has inline
curl -I "PRESIGNED-S3-URL"
# Expect header: Content-Disposition: inline; filename="..."
```

---

## 🆘 Troubleshooting

**Phone still duplicates:**
- Check browser console for mcNormalize warnings
- Verify dial code detection logic (`alreadyHasDial`)
- Test with different formats: +45..., 45..., 004545...

**OTP not created for non-existent user:**
- Check Lambda logs for errors
- Verify Salesforce field names match exactly
- Ensure lookup fields allow null values

**PDF still downloads instead of inline:**
- Check S3 response headers in Network tab
- Verify `ResponseContentDisposition` parameter in Lambda
- Check browser - Safari may behave differently
- Verify CORS headers expose Content-Disposition

**Help text not hiding:**
- Verify selector: `document.querySelector('[data-i18n="OTP_SUBTITLE"]')`
- Check if element exists (might be in different location in your HTML)
- Inspect element to ensure `.hidden` class is toggled

**Button not in corner:**
- Clear browser cache (CSS might be cached)
- Verify `.verify-header` has `position: absolute`
- Check `.otp-card` has `position: relative`
- Inspect with DevTools to see computed styles

---

## 📞 Support

For implementation help, refer to:
- **APP_JS_FIXES.md** - Detailed app.js explanations
- **LAMBDA_FIXES.md** - Detailed lambda.mjs explanations  
- **TESTING_GUIDE.md** - Complete test scenarios
- **IMPLEMENTATION_SUMMARY.md** - Overview and checklist

**Ready to deploy!** 🎉
