# Deployment Required

## Recent Fixes Applied (Just Now)

### 1. Button Positioning Fix ✅
**Files changed:**
- `index.html` - Removed `.verify-header` wrapper div
- `styles.css` - Changed CSS to `.start-over-btn` absolute positioning

**Action**: Refresh the page to see the fix

### 2. Lambda PDF Inline Display Fix ⚠️
**File changed:**
- `lambda.py` (line 216) - Added `ResponseContentDisposition: inline`

**Action**: **DEPLOY TO AWS LAMBDA**

```bash
# Example deployment command (adjust based on your setup):
# Using AWS CLI:
aws lambda update-function-code \
  --function-name YOUR_FUNCTION_NAME \
  --zip-file fileb://lambda.zip

# Or using AWS SAM:
sam build && sam deploy

# Or using Serverless Framework:
serverless deploy
```

## Current Issue Status

| Issue | Status | Action Required |
|-------|--------|-----------------|
| "Start forfra" button positioning | ✅ Fixed | Refresh page |
| PDFs auto-download | ⚠️ Code ready | **Deploy Lambda** |
| PDF viewer hidden | ❓ Investigating | Check browser console |

## Testing Checklist

After deploying Lambda:
1. [ ] Refresh the document portal page
2. [ ] Verify "Start forfra" button is in top-right corner
3. [ ] Click on a document in the sidebar
4. [ ] Confirm PDF displays inline (not downloading)
5. [ ] Check browser console (F12) for any JavaScript errors

## Debugging the Hidden Viewer

If the viewer is still hidden after refresh:

1. **Open browser DevTools** (F12)
2. **Check Console tab** for errors
3. **Check Elements/Inspector tab**:
   - Find element with `id="viewerCard"`
   - Check if it has class `hidden`
   - Check computed styles for `display` property
4. **Check if `enterPortalUI()` was called**:
   - Add `console.log()` to line 692 in `app.js`
   - Or check if sidebar is visible (it should show at same time)

## Lambda Deployment Details

The Lambda function needs these changes to be deployed:

**File**: `lambda.py`
**Function**: `s3_presign_get()`
**Lines**: 210-221

```python
def s3_presign_get(bucket, key, expires=600):
    return _s3.generate_presigned_url(
        ClientMethod="get_object",
        Params={
            "Bucket": bucket,
            "Key": key,
            "ResponseContentDisposition": f'inline; filename="{os.path.basename(key)}"',
            "ResponseContentType": "application/pdf",
        },
        ExpiresIn=int(expires),
    )
```

The key change is the `ResponseContentDisposition` parameter set to `inline` instead of `attachment`.
