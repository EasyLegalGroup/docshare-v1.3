# 🚀 DocShare v1.3 - Salesforce Deployment Commands

**Date:** October 24, 2025  
**Target:** Production (mt@dinfamiliejurist.dk)  
**Changes:** Sort_Order__c support + Drag-and-drop functionality

---

## ✅ PRE-DEPLOYMENT CHECKLIST

- [x] `Sort_Order__c` field created in production
- [x] Backup of current production code saved to `ROLLBACK_BACKUP_PROD/`
- [ ] Current user confirmed as `mt@dinfamiliejurist.dk` (run: `sf org list`)
- [ ] Validation run completed successfully (see Step 1 below)

---

## 📋 STEP 1: VALIDATE DEPLOYMENT (DRY RUN)

**Purpose:** Test deployment without making changes

```powershell
# Navigate to sandbox source folder
cd "C:\Users\Mathias\Downloads\sftemp_sandbox\temp"

# Run validation only (--dry-run / check-only)
sf project deploy start --target-org Prod `
  --metadata ApexClass:DocShareService `
  --metadata ApexClass:DocShareService_Tests `
  --metadata LightningComponentBundle:journalDocConsole `
  --dry-run `
  --test-level RunLocalTests

# Expected output: "Status: Succeeded" with test results
```

**If validation fails:** Review errors and fix before proceeding  
**If validation succeeds:** Continue to Step 2

---

## 🚀 STEP 2: DEPLOY TO PRODUCTION

**⚠️ THIS WILL MODIFY PRODUCTION**

```powershell
# Navigate to sandbox source folder
cd "C:\Users\Mathias\Downloads\sftemp_sandbox\temp"

# Deploy Apex classes
sf project deploy start --target-org Prod `
  --metadata ApexClass:DocShareService `
  --metadata ApexClass:DocShareService_Tests `
  --test-level RunLocalTests

# Wait for completion, then deploy LWC
sf project deploy start --target-org Prod `
  --metadata LightningComponentBundle:journalDocConsole

# Expected output: "Status: Succeeded"
```

**Deployment time:** ~2-5 minutes (Apex includes test execution)

---

## ✅ STEP 3: VERIFY DEPLOYMENT

### 3.1 Check Salesforce UI
1. Navigate to a Journal record in production
2. Open the "Journal Document Console" tab
3. **Verify:**
   - Documents load correctly
   - Can upload new documents
   - Drag-and-drop icon appears (⋮⋮)
   - Can drag documents to reorder
   - Order persists after refresh

### 3.2 Check Customer Portal
1. Visit: https://dok.dinfamiliejurist.dk (or .se / .ie)
2. Login with test credentials
3. **Verify:**
   - Documents display (should be alphabetical - no sort yet)
   - Can view PDFs
   - Approve button works
   - No JavaScript errors in console

### 3.3 Check Lambda Logs (if applicable)
```bash
# If you've deployed new Lambda, check CloudWatch
aws logs tail /aws/lambda/your-lambda-function --follow --region eu-north-1
```

---

## 🔄 ROLLBACK PROCEDURE (IF ISSUES OCCUR)

**If something breaks, immediately run these commands:**

### Option A: Quick Rollback (From Backup)

```powershell
# Navigate to workspace root
cd "C:\Users\Mathias\Downloads\docshare-16-10-2025-fixed"

# Copy backup files to a temp SFDX project for deployment
Copy-Item "ROLLBACK_BACKUP_PROD\classes\*" "C:\Users\Mathias\Downloads\sftemp\temp\force-app\main\default\classes\" -Force
Copy-Item "ROLLBACK_BACKUP_PROD\lwc\*" "C:\Users\Mathias\Downloads\sftemp\temp\force-app\main\default\lwc\journalDocConsole\" -Force

# Deploy rollback from temp folder
cd "C:\Users\Mathias\Downloads\sftemp\temp"

sf project deploy start --target-org Prod `
  --metadata ApexClass:DocShareService `
  --metadata ApexClass:DocShareService_Tests `
  --metadata LightningComponentBundle:journalDocConsole `
  --test-level RunLocalTests

# Expected: Reverts to pre-deployment state
```

### Option B: Rollback via Source Control

```powershell
# If you have the original SFDX project structure
cd "C:\Users\Mathias\Downloads\sftemp\temp"

# Retrieve current production state (before your changes)
sf project retrieve start --target-org Prod `
  --metadata ApexClass:DocShareService `
  --metadata ApexClass:DocShareService_Tests `
  --metadata LightningComponentBundle:journalDocConsole

# This overwrites local files with production state
# Then deploy again to restore
sf project deploy start --target-org Prod `
  --metadata ApexClass:DocShareService `
  --metadata ApexClass:DocShareService_Tests `
  --metadata LightningComponentBundle:journalDocConsole `
  --test-level RunLocalTests
```

---

## 🔍 WHAT CHANGED (FOR REFERENCE)

### Apex: DocShareService.cls
- ✅ Added `Sort_Order__c` field constant
- ✅ Added `nextSortFor()` helper (calculates next position)
- ✅ Added `setDocumentOrder()` method (drag-drop persistence)
- ✅ Auto-assigns sort order on create
- ✅ Preserves sort order on replace
- ✅ Changed query ORDER BY to: `Sort_Order__c NULLS LAST, Name`

### Apex: DocShareService_Tests.cls
- ✅ Added `Sort_Order__c` to SELECT statement
- ✅ Added assertion: `Sort_Order__c` should not be null after create
- ✅ Cleaned up comments

### LWC: journalDocConsole.js
- ✅ Imported `setDocumentOrder` Apex method
- ✅ Added drag-and-drop event handlers (onDragStart, onDragOver, onDrop)
- ✅ Added `busy` state for spinner overlay
- ✅ Changed API_BASE to use Custom Label (environment-aware)
- ✅ Changed toast mode from sticky to dismissible
- ✅ Added auto-clear timer for messages
- ✅ Added `_reorderNewest()` client-side logic

### LWC: journalDocConsole.html
- ⚪ No changes (identical)

### LWC: journalDocConsole.css
- ⚪ No changes (identical)

---

## 📞 SUPPORT CONTACTS

**If deployment fails:**
1. Check error message in terminal output
2. Review Salesforce deployment status: Setup → Deployment Status
3. Check test failures: Setup → Apex Test Execution
4. Review this file's rollback section

**Common issues:**
- **"Field does not exist: Sort_Order__c"** → Field not created in production (but you already did this ✅)
- **"Test failure"** → Review test output, may need to fix data issues
- **"LWC parse error"** → Check JavaScript syntax (unlikely with retrieved code)

---

## 📊 DEPLOYMENT SUMMARY

| Component | Lines Changed | Risk Level | Rollback Ready? |
|-----------|---------------|------------|-----------------|
| DocShareService.cls | +50 lines | 🟢 Low | ✅ Yes |
| DocShareService_Tests.cls | +2 lines | 🟢 Low | ✅ Yes |
| journalDocConsole.js | +80 lines | 🟡 Medium | ✅ Yes |
| journalDocConsole.html | 0 lines | 🟢 None | ✅ Yes |
| journalDocConsole.css | 0 lines | 🟢 None | ✅ Yes |

**Overall Risk:** 🟢 **LOW** - All changes are additive, no deletions or breaking changes

---

## ✅ POST-DEPLOYMENT CHECKLIST

After successful deployment:

- [ ] Internal users can drag-and-drop documents
- [ ] Document order persists after refresh
- [ ] New documents get auto-assigned sort order
- [ ] Customer portal still displays documents (alphabetical for now)
- [ ] Upload still works from internal console
- [ ] Replace document still works
- [ ] Delete document still works
- [ ] No errors in browser console
- [ ] No errors in Salesforce debug logs

**Next step:** Deploy AWS Lambda + Customer SPA for full feature set

---

## 📝 NOTES

**Current state:**
- ✅ Sort_Order__c field exists in production
- ✅ Rollback files saved in `ROLLBACK_BACKUP_PROD/`
- ⏳ Waiting for deployment execution

**After deployment:**
- Internal users: Drag-and-drop ✅
- Customer portal: Alphabetical order (until Lambda deployed)

---

**Generated:** October 24, 2025  
**Version:** DocShare v1.3 (Salesforce-only deployment)
