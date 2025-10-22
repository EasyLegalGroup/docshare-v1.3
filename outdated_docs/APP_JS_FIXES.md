# app.js Bug Fixes

## Issue 1: Fix Phone Normalization Duplication

### Location: `requestOtpIdentifier()` function (around line 299)

**Problem:** When users paste a full international number like `+4542455150`, the function prepends the dial code again, resulting in `+454542455150`.

**Solution:** Detect if the input already contains the dial code or starts with `+` or `00`, and only prepend when necessary.

### Updated `requestOtpIdentifier()` function:

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

### Enhanced normalization functions (optional but recommended):

Add double-prefix tolerance to each normalization function:

#### `mcNormDK()` enhancement:

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

#### `mcNormSE()` enhancement:

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

#### `mcNormIE()` enhancement:

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

## Issue 5: Hide Identifier Help Text After OTP Entry

### Location: `showStep()` function (around line 274)

**Problem:** The help text `[data-i18n="OTP_SUBTITLE"]` remains visible after moving to the verify step.

**Solution:** Hide the subtitle and ID chooser when showing verify step, show them when returning to ID step.

### Updated `showStep()` function:

```javascript
function showStep(which){
  const idStep = $('idStep');
  const verifyStep = $('verifyStep');
  const subtitle = document.querySelector('[data-i18n="OTP_SUBTITLE"]');
  const idChooser = $('idChooser');
  
  if (which === 'verify') {
    hide(idStep);
    if (subtitle) hide(subtitle);  // ISSUE 5 FIX: Hide help text
    if (idChooser) hide(idChooser); // ISSUE 5 FIX: Hide chooser
    show(verifyStep);
    setVerifySub();
  } else {
    show(idStep);
    if (subtitle) show(subtitle);  // ISSUE 5 FIX: Show help text again
    if (idChooser) show(idChooser); // ISSUE 5 FIX: Show chooser again
    hide(verifyStep);
  }
}
```

---

## Testing Checklist

### Issue 1 Test:
1. Select "Denmark (+45)" from country picker
2. Paste `+4542455150` into phone input
3. Click "Send kode"
4. **Expected payload:** `{"channel":"phone","market":"DFJ_DK","phone":"+4542455150","phoneDigits":"4542455150","country":"DK"}`
5. **Should NOT be:** `{"phone":"+454542455150","phoneDigits":"454542455150"}`

### Issue 5 Test:
1. Start on identifier step - help text visible
2. Enter phone/email and request OTP
3. **Expected:** Help text `[data-i18n="OTP_SUBTITLE"]` is hidden
4. Click "Start forfra"
5. **Expected:** Help text is visible again

---

## Integration Notes

- Keep all existing endpoint URLs unchanged
- Keep all existing payload field names unchanged
- Do not modify any translation keys or texts
- Preserve all market/brand logic (DK/SE/IE)
- These fixes only affect client-side validation and UI state management
