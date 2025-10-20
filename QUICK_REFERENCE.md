# Quick Reference Card

## 📞 Emergency Contact Info

**Files in This Package:**
```
docshare-16-10-2025-fixed/
├── README.md                    ← Start here
├── EXECUTIVE_SUMMARY.md         ← For managers
├── IMPLEMENTATION_SUMMARY.md    ← Overview
├── COPY_PASTE_DIFFS.md         ← For developers ⭐
├── APP_JS_FIXES.md             ← app.js details
├── LAMBDA_FIXES.md             ← lambda.mjs details
├── TESTING_GUIDE.md            ← For QA ⭐
├── VISUAL_DIAGRAMS.md          ← Architecture
└── styles.css                   ← Fixed CSS file ⭐
```

---

## 🎯 Quick Implementation

### 1. CSS Fix (2 minutes)
```bash
# Copy fixed file OR apply 3 CSS changes
cp styles.css /path/to/your/project/
```

### 2. JavaScript Fix (10 minutes)
```javascript
// In app.js, update 2 functions:
// 1. requestOtpIdentifier() - Line ~299
// 2. showStep() - Line ~274
// See COPY_PASTE_DIFFS.md for exact code
```

### 3. Lambda Fix (15 minutes)
```javascript
// In lambda.mjs, update 2 handlers:
// 1. POST /identifier/request-otp
// 2. Presigned URL generation
// See COPY_PASTE_DIFFS.md for patterns
// ⚠️ Replace field names with YOUR exact names!
```

---

## ✅ Quick Test

### Test 1: Phone Duplication (30 seconds)
```
1. Paste: +4542455150
2. Click: Send code
3. ✅ Check: No duplicate "45" in payload
```

### Test 2: Non-Existent User (1 minute)
```
1. Enter: +4599999999
2. Click: Send code
3. ✅ Check Salesforce: OTP record created
4. ✅ Check: Person__c = null (or empty)
```

### Test 3: Inline PDF (30 seconds)
```
1. Verify OTP
2. Click any document
3. ✅ Check: PDF renders in iframe
4. ✅ Check: No auto-download
```

### Test 4: UI Changes (30 seconds)
```
1. Request OTP
2. ✅ Check: Help text hidden
3. ✅ Check: "Start forfra" in top-right
```

---

## 🚨 Rollback Plan

### If CSS breaks:
```bash
git checkout HEAD~1 styles.css
# Deploy old version
# Time: 1 minute
```

### If JavaScript breaks:
```bash
git checkout HEAD~1 app.js
# Deploy old version
# Time: 2 minutes
```

### If Lambda breaks:
```bash
# Revert Lambda function to previous version
# Via AWS Console or CLI
# Time: 2-5 minutes
```

---

## 📊 Success Checklist

After deployment, verify:
- [ ] Paste +45... → works ✅
- [ ] Non-existent phone → OTP created ✅
- [ ] PDF renders inline ✅
- [ ] Download button works ✅
- [ ] Print button works ✅
- [ ] Help text hidden on verify ✅
- [ ] "Start forfra" top-right ✅
- [ ] Journal flow still works ✅
- [ ] DK market works ✅
- [ ] SE market works ✅
- [ ] IE market works ✅

---

## 🔍 Troubleshooting

### Phone still duplicates?
→ Check `requestOtpIdentifier()` function
→ Verify `alreadyHasDial` detection logic

### OTP not created?
→ Check Salesforce field names
→ Verify Lambda logs
→ Ensure lookups allow null

### PDF downloads instead of inline?
→ Check S3 response headers (DevTools)
→ Verify `ResponseContentDisposition`
→ Check browser (Safari differs)

### Help text not hiding?
→ Check selector: `[data-i18n="OTP_SUBTITLE"]`
→ Verify `.hidden` class toggle
→ Inspect element in DevTools

### Button not in corner?
→ Clear browser cache
→ Check `.verify-header` CSS
→ Verify `.otp-card` has `position: relative`

---

## 📞 Support

**Implementation Help:**
- COPY_PASTE_DIFFS.md (exact code)
- APP_JS_FIXES.md (detailed guide)
- LAMBDA_FIXES.md (detailed guide)

**Testing Help:**
- TESTING_GUIDE.md (all test cases)

**Architecture Help:**
- VISUAL_DIAGRAMS.md (flow charts)

**Field Names:**
- Check your lambda.mjs file
- Search for: OTP, Code, Channel

---

## ⚡ One-Line Summary

**"Fix 6 bugs with ~85 LOC changes across 3 files, zero schema changes, low risk, 3-4 hour effort."**

---

## 🎯 Critical Reminders

1. ⚠️ Use YOUR Salesforce field names (not placeholder names)
2. ⚠️ Test on staging before production
3. ⚠️ Deploy in order: CSS → JS → Lambda
4. ⚠️ Run smoke tests after each deploy
5. ⚠️ Monitor for 24 hours post-deployment

---

## 📈 Expected Impact

**Before Fixes:**
- ❌ Can't paste international numbers
- ❌ New users blocked at OTP
- ❌ PDFs auto-download
- ⚠️ Confusing verify step UI

**After Fixes:**
- ✅ Paste any number format
- ✅ All users can proceed
- ✅ PDFs render inline
- ✅ Clean, intuitive UI

---

## 🎉 Ready to Go!

Everything you need is in this package. Start with:

**Developers** → `COPY_PASTE_DIFFS.md`  
**QA** → `TESTING_GUIDE.md`  
**Managers** → `EXECUTIVE_SUMMARY.md`

**Deployment window:** _______________  
**Estimated completion:** ~3-4 hours  
**Risk level:** 🟢 Low  
**Rollback time:** <10 minutes  

---

**Good luck! 🚀**
