# Sandbox AI Chat Deployment Guide

## ✅ Already Deployed to Sandbox

### Salesforce Components
The following have been deployed to your sandbox (`my-sandbox`):

```
✅ LightningComponentBundle: simplifiedChat
   - simplifiedChat.html
   - simplifiedChat.js
   - simplifiedChat.css
   - simplifiedChat.js-meta.xml

✅ ApexClass: SimplifiedChatService
   - SimplifiedChatService.cls
   - SimplifiedChatService.cls-meta.xml
```

**Deploy ID**: `0Afbd000007ltxuCAA`

---

## 📦 S3 Bucket - Files to Upload

### Upload to your TEST S3 bucket:

**Bucket Structure**:
```
your-test-bucket/
├── index.html          (Upload from: vscode attempt/index.html)
├── app.js              (Upload from: vscode attempt/app.js)
├── styles.css          (Upload from: vscode attempt/styles.css)
├── texts.js            (Upload from: vscode attempt/texts.js)
└── brand.js            (Upload from: vscode attempt/brand.js)
```

### Files to Upload:

1. **index.html**
   - Path: `/Users/mathiastonder/docshare-v1.3/vscode attempt/index.html`
   - Content-Type: `text/html`

2. **app.js**
   - Path: `/Users/mathiastonder/docshare-v1.3/vscode attempt/app.js`
   - Content-Type: `application/javascript`
   - **Contains**: AI chat endpoints, journal selection, enhanced identifier flow

3. **styles.css**
   - Path: `/Users/mathiastonder/docshare-v1.3/vscode attempt/styles.css`
   - Content-Type: `text/css`

4. **texts.js**
   - Path: `/Users/mathiastonder/docshare-v1.3/vscode attempt/texts.js`
   - Content-Type: `application/javascript`

5. **brand.js**
   - Path: `/Users/mathiastonder/docshare-v1.3/vscode attempt/brand.js`
   - Content-Type: `application/javascript`

**Make all files publicly readable** (or configure appropriate S3 bucket policy).

---

## 🔧 Lambda Code Update

### YES - You need to update your test Lambda

**Upload**: `/Users/mathiastonder/docshare-v1.3/vscode attempt/lambda.py`

**Key Changes in This Version**:

1. **AI Chat Endpoints**:
   - `POST /chat/list` - List chat messages for a journal
   - `POST /chat/send` - Send message to AI (Bedrock/Claude)
   - `POST /identifier/chat/ask` - AI Q&A during verification

2. **Bedrock Integration**:
   - Uses AWS Bedrock for AI responses
   - Claude 3.5 Haiku model by default
   - PDF text extraction and caching

3. **Enhanced Features**:
   - Journal selection when multiple journals found
   - Identifier-based authentication flow
   - Session management with HMAC signatures

### Environment Variables Required

**Your test Lambda needs these environment variables**:

```bash
# Existing (keep as-is)
AWS_REGION=eu-north-1
DOCS_BUCKET=your-test-bucket-name
SF_LOGIN_URL=https://test.salesforce.com
SF_CLIENT_ID=your_sandbox_connected_app_client_id
SF_CLIENT_SECRET=your_sandbox_connected_app_secret
SF_REFRESH_TOKEN=your_sandbox_refresh_token
SESSION_HMAC_SECRET=your_random_secret_string

# NEW - AI Chat Configuration
AI_ENABLED=true
BEDROCK_MODEL_ID=us.anthropic.claude-3-5-haiku-20241022-v1:0
BEDROCK_REGION=us-east-1
DYNAMODB_TEXT_CACHE_TABLE=dfj-pdf-text-cache

# Optional
DEBUG_ALLOW_IDENTIFIER_DOCURL=false
SESSION_TTL_SECONDS=900
```

### Lambda IAM Permissions Required

Your Lambda execution role needs these additional permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": "arn:aws:bedrock:us-east-1::foundation-model/us.anthropic.claude-3-5-haiku-20241022-v1:0"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:eu-north-1:YOUR_ACCOUNT:table/dfj-pdf-text-cache"
    }
  ]
}
```

---

## 🗄️ DynamoDB Table Setup

### Create the PDF Text Cache Table

**Table Name**: `dfj-pdf-text-cache`

**Key Schema**:
- Partition Key: `s3_key` (String)

**Attributes**:
- `s3_key` (String) - The S3 key of the PDF
- `text_content` (String) - Extracted text from PDF
- `extracted_at` (Number) - Unix timestamp
- `ttl` (Number) - TTL expiration timestamp

**Settings**:
- On-demand billing (or provisioned 5 RCU / 5 WCU for testing)
- Enable TTL on `ttl` attribute

**AWS CLI Command**:
```bash
aws dynamodb create-table \
  --table-name dfj-pdf-text-cache \
  --attribute-definitions \
    AttributeName=s3_key,AttributeType=S \
  --key-schema \
    AttributeName=s3_key,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region eu-north-1
```

**Enable TTL**:
```bash
aws dynamodb update-time-to-live \
  --table-name dfj-pdf-text-cache \
  --time-to-live-specification "Enabled=true, AttributeName=ttl" \
  --region eu-north-1
```

---

## 📋 Testing Checklist

### 1. Test SPA (S3 Hosted)
- [ ] Navigate to your test S3 bucket URL
- [ ] Enter phone number or email
- [ ] Receive OTP code
- [ ] Verify OTP
- [ ] If multiple journals: see journal selection screen
- [ ] Select journal and continue
- [ ] See document list
- [ ] Click chat pill button (should appear after chat seen)
- [ ] Open chat panel
- [ ] Send message to AI
- [ ] Receive AI response
- [ ] Test action buttons (if any)

### 2. Test Salesforce LWC
- [ ] Add `simplifiedChat` component to a Lightning page in sandbox
- [ ] Configure with a Journal ID
- [ ] Component loads without errors
- [ ] Send message to chat
- [ ] See visualization pills
- [ ] Messages persist and display correctly

### 3. Test API Endpoints
Test these endpoints with your sandbox Lambda URL:

```bash
# Identifier OTP Request
POST /identifier/request-otp
{
  "identifierType": "phone",
  "identifierValue": "+4512345678"
}

# Verify OTP
POST /identifier/verify-otp
{
  "identifierType": "phone",
  "identifierValue": "+4512345678",
  "otp": "123456"
}

# List journals (if multiple)
GET /identifier/journals
Headers: X-Session-Token: {token_from_verify}

# Chat list
POST /chat/list
{
  "journalId": "a0Xxx000000XXXXX"
}

# Chat send
POST /chat/send
{
  "journalId": "a0Xxx000000XXXXX",
  "message": "What documents do I need to sign?"
}

# AI Q&A during verification
POST /identifier/chat/ask
{
  "question": "What is this about?",
  "identifierType": "phone"
}
Headers: X-Session-Token: {token_from_verify}
```

---

## 🚨 Important Notes

### 1. Bedrock Model Availability
- Claude 3.5 Haiku is in `us-east-1` region
- Make sure your AWS account has access to Bedrock
- Request model access in AWS Console > Bedrock > Model access if needed

### 2. Cost Considerations
- Bedrock charges per token (input + output)
- DynamoDB charges for read/write
- S3 bucket should have lifecycle policies for old data

### 3. CORS Configuration
The Lambda already includes these allowed origins:
```
https://dfj.lightning.force.com
https://dfj.my.salesforce.com
http://localhost:* (for testing)
https://dok.dinfamiliejurist.dk
https://dok.dinfamiljejurist.se
https://docs.hereslaw.ie
```

Add your test S3 bucket URL if needed.

### 4. Salesforce Connected App
Make sure your sandbox Connected App has:
- OAuth scopes: `api`, `refresh_token`, `offline_access`
- Callback URL configured
- Refresh token generated and stored in Lambda env vars

---

## 📝 Quick Deploy Commands

### Upload to S3 (Example - adjust bucket name):
```bash
cd "/Users/mathiastonder/docshare-v1.3/vscode attempt"

# Upload SPA files
aws s3 cp index.html s3://your-test-bucket/index.html --content-type text/html
aws s3 cp app.js s3://your-test-bucket/app.js --content-type application/javascript
aws s3 cp styles.css s3://your-test-bucket/styles.css --content-type text/css
aws s3 cp texts.js s3://your-test-bucket/texts.js --content-type application/javascript
aws s3 cp brand.js s3://your-test-bucket/brand.js --content-type application/javascript

# Set public-read ACL (if your bucket allows)
aws s3 cp s3://your-test-bucket/ s3://your-test-bucket/ --recursive --acl public-read --exclude "*" --include "*.html" --include "*.js" --include "*.css"
```

### Package and Deploy Lambda:
```bash
cd "/Users/mathiastonder/docshare-v1.3/vscode attempt"

# Zip lambda code
zip lambda.zip lambda.py

# Upload to Lambda (replace function name)
aws lambda update-function-code \
  --function-name your-test-lambda-function \
  --zip-file fileb://lambda.zip \
  --region eu-north-1
```

---

## 🔍 What's Different from Production

**Deployed to Sandbox**:
- ✅ AI chat in SPA (app.js)
- ✅ SimplifiedChat LWC
- ✅ Journal selection feature
- ✅ Bedrock integration
- ✅ Enhanced identifier flow

**Still in Production** (not updated):
- Basic document sharing (no AI chat)
- journalDocConsole LWC (with block approval + sort order fixes)
- Simple identifier verification (no journal selection)

---

## 📞 Support

If you encounter issues:
1. Check CloudWatch logs for Lambda errors
2. Check browser console for JavaScript errors
3. Verify all environment variables are set
4. Confirm Bedrock model access is enabled
5. Test Salesforce API connectivity with curl

**Lambda Logs**:
```bash
aws logs tail /aws/lambda/your-test-lambda-function --follow
```
