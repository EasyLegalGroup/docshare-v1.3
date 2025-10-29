# Block Approval Rollback Plan

## Quick Rollback (If Critical Issue Discovered)

### 1. Salesforce Rollback (5 minutes)
**If LWC/Apex has critical bugs:**

```bash
# In VS Code with Salesforce Extension
1. Open journalDocConsole.html
2. Comment out the checkbox:
   <!-- <lightning-input type="checkbox" ... data-id={doc.id} ... </lightning-input> -->
3. Deploy journalDocConsole component (hide UI, keeps field working)

# OR full revert:
1. Restore from prod-retrieved/ directory:
   - Copy journalDocConsole/* from prod-retrieved/salesforce/lwc/
   - Copy DocShareService.cls from prod-retrieved/salesforce/classes/
2. Deploy to production
```

**Result:** Checkbox hidden from users, block approval field remains but unused

### 2. Lambda Rollback (2 minutes)
**If API validation causes issues:**

```python
# In AWS Lambda console:
1. Go to Lambda function: dfj-document-share-lambda (or your lambda name)
2. Click "Versions" → Find previous version before block approval
3. Click "Actions" → "Publish new version" to restore old code

# OR manual fix:
# Comment out these 3 lines in both approval handlers (lines 1075, 1118, 1149):
# if row.get("Is_Approval_Blocked__c") == True:
#     skipped += 1; continue
```

**Result:** API stops enforcing block approval validation (allows all approvals)

### 3. SPA Rollback (2 minutes)
**If customer portal has visual issues:**

```bash
# Restore from backup:
1. Copy app.js.backup-20251029-184939 → app.js
2. Upload to S3: dok.dinfamiliejurist.dk, dok.dinfamiljejurist.se, docs.hereslaw.ie
3. Clear CloudFront cache (if using CDN)
```

**Result:** SPA reverts to version before block approval UI changes

---

## Partial Rollback Options

### Option A: Disable Feature Without Code Changes
1. **In Salesforce Setup:**
   - Go to Object Manager → Shared Document → Fields → Is Approval Blocked
   - Remove field from Journal Doc Console layout
   - Result: Lawyers can't toggle checkbox, existing blocked docs stay blocked

### Option B: Emergency Fix - Clear All Blocks
```apex
// Execute Anonymous Apex (if all blocks need clearing):
List<Shared_Document__c> docs = [SELECT Id FROM Shared_Document__c WHERE Is_Approval_Blocked__c = true];
for(Shared_Document__c doc : docs) {
    doc.Is_Approval_Blocked__c = false;
}
update docs;
```

---

## Recovery Steps (After Rollback)

1. **Analyze Issue:**
   - Check Salesforce debug logs: Setup → Debug Logs
   - Check Lambda CloudWatch logs: `/aws/lambda/dfj-document-share-lambda`
   - Check browser console errors (F12)

2. **Fix in Sandbox:**
   - Reproduce issue in mt@dinfamiliejurist.dk.itdev
   - Apply fix
   - Re-test thoroughly

3. **Re-deploy to Production:**
   - Follow original deployment steps with fix applied

---

## Validation After Rollback

- [ ] Customers can approve documents normally (no "blocked" errors)
- [ ] Lawyers can view/edit documents in Salesforce
- [ ] SPA loads without JavaScript errors
- [ ] Lambda /approve and /identifier/approve endpoints work
- [ ] No red tint containers visible in LWC

---

**Estimated Total Rollback Time:** 10 minutes (all 3 components)
**Risk Level:** Low (feature is additive, no data loss on rollback)
