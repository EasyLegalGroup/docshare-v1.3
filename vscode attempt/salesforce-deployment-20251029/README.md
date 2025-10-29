# DocShare Block Approval Feature - Deployment Package

## Contents

This deployment package contains the Block Approval feature for the DocShare application.

### Files Included

**Apex Classes:**
- `DocShareService.cls` - Added `updateBlockApproval()` method
- `DocShare_Query.cls` - Added `isApprovalBlocked` field to query wrapper

**Lightning Web Component:**
- `journalDocConsole.js` - Added block approval checkbox handler
- `journalDocConsole.html` - Added block approval checkbox UI
- `journalDocConsole.css` - Existing styles
- `journalDocConsole.js-meta.xml` - LWC metadata

## Deployment Instructions

### Option 1: Using Salesforce CLI

1. Ensure you have Salesforce CLI installed:
   ```bash
   sf --version
   ```

2. Authenticate to your sandbox (if not already):
   ```bash
   sf org login web --alias MySandbox --instance-url https://test.salesforce.com
   ```

3. Deploy the package:
   ```bash
   cd "vscode attempt/salesforce-deployment-20251029"
   sf project deploy start --target-org MySandbox
   ```

### Option 2: Using VS Code Salesforce Extension

1. Open VS Code
2. Open Command Palette (Cmd+Shift+P)
3. Run: "SFDX: Authorize an Org" and select Sandbox
4. Right-click the `force-app` folder
5. Select "SFDX: Deploy Source to Org"

### Option 3: Manual Deployment via Workbench

1. Create a ZIP file of the metadata:
   ```bash
   cd force-app/main/default
   zip -r ../../../deployment.zip classes/ lwc/
   ```

2. Go to: https://workbench.developerforce.com/
3. Login to your Sandbox
4. Navigate to: Migration → Deploy
5. Upload the ZIP file
6. Click "Deploy"

## Backup Location

Original sandbox files backed up to:
`vscode attempt/salesforce-backup-20251029-143826/`

## Testing

After deployment:
1. Open a Journal record in Salesforce
2. Navigate to the Journal Documents component
3. Verify the "Block Approval" checkbox appears for non-Approved documents
4. Check/uncheck the box and verify it saves successfully
5. Test the blocked approval flow in the client-facing app

## Rollback

If needed, deploy files from the backup directory:
`vscode attempt/salesforce-backup-20251029-143826/`
