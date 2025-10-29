#!/bin/bash
# Script to prepare SPA files for production deployment
# This updates the API endpoint from test to production

set -e  # Exit on error

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SPA_DIR="$SCRIPT_DIR/block-approval-clean/spa"
PROD_API="https://ysu7eo2haj.execute-api.eu-north-1.amazonaws.com/prod"
TEST_API="https://21tpssexjd.execute-api.eu-north-1.amazonaws.com"

echo "================================================"
echo "  SPA Production Preparation Script"
echo "================================================"
echo ""
echo "This script will:"
echo "  1. Update app.js API endpoint from TEST to PROD"
echo "  2. Verify the change was successful"
echo ""
echo "Target directory: $SPA_DIR"
echo "Production API: $PROD_API"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Check if app.js exists
if [ ! -f "$SPA_DIR/app.js" ]; then
    echo "ERROR: app.js not found at $SPA_DIR/app.js"
    exit 1
fi

# Create backup
echo "Creating backup..."
cp "$SPA_DIR/app.js" "$SPA_DIR/app.js.backup-$(date +%Y%m%d-%H%M%S)"
echo "✅ Backup created"

# Update API endpoint
echo "Updating API endpoint..."
sed -i '' "s|$TEST_API|$PROD_API|g" "$SPA_DIR/app.js"
echo "✅ API endpoint updated"

# Verify the change
echo ""
echo "Verifying update..."
if grep -q "$PROD_API" "$SPA_DIR/app.js"; then
    echo "✅ Production API endpoint confirmed in app.js"
    echo ""
    echo "Current API line:"
    grep "const API" "$SPA_DIR/app.js" | head -2
else
    echo "❌ ERROR: Production API not found in app.js"
    echo "Restoring backup..."
    cp "$SPA_DIR/app.js.backup-$(date +%Y%m%d-%H%M%S)" "$SPA_DIR/app.js"
    exit 1
fi

echo ""
echo "================================================"
echo "  SPA files ready for production deployment"
echo "================================================"
echo ""
echo "Files to upload:"
echo "  - app.js"
echo "  - styles.css"
echo "  - texts.js"
echo "  - brand.js"
echo "  - index.html"
echo ""
echo "Next step: Upload to production S3 bucket"
echo ""
