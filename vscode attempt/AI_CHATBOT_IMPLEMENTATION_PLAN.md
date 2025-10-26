# 🤖 AI-Powered Document Chatbot Implementation Plan

**Last Updated**: October 26, 2025  
**Status**: Phase 1 - Infrastructure Setup (In Progress)  
**Objective**: Add AI-powered Q&A chatbot that answers questions about customer documents

---

## 🎯 **Current Progress**

### ✅ **PHASE 1 COMPLETE** - Infrastructure Fully Validated
- ✅ **DynamoDB Table Created**: `dfj-pdf-text-cache-test` (with proper tags)
- ✅ **PyMuPDF Lambda Layer Built**: Version 4 (~25 MB), built in AWS CloudShell
- ✅ **Layer Attached to Test Lambda**: `dfj-docs-test`
- ✅ **AWS Bedrock Enabled**: Automatic access + Anthropic use case approved
- ✅ **IAM Permissions Added**: BedrockInvokePolicy + DynamoDBCachePolicy + S3ReadOnlyAccess
- ✅ **Lambda Configuration**: 60s timeout, 512 MB memory (optimized for PyMuPDF)
- ✅ **Bedrock Connection Test**: PASSED - AI responded in Danish (1.51s)
- ✅ **PDF Extraction Test**: PASSED - Extracted 21,732 chars from 13-page testament (4s)
- ✅ **Full AI Q&A Test**: PASSED - AI analyzed testament and answered in Danish (7.2s)

### 🎯 **Current Status**: **Ready for Live SPA Testing**

**Test Results Summary**:
- ✅ S3 → PyMuPDF → DynamoDB caching: **Working perfectly**
- ✅ DynamoDB cache hit: **Instant retrieval** (no re-extraction)
- ✅ AWS Bedrock Claude 3.5 Haiku: **Accurate Danish responses**
- ✅ Cross-region inference (us-east-1 Bedrock from eu-north-1 Lambda): **Working**
- ✅ AI answer quality: **High** (correctly identified testament details, inheritance percentages, legacies)

### ⏳ **Next Steps**
- ⏳ **Phase 2**: Integrate AI endpoint into production Lambda (`lambda.py`)
- ⏳ **Phase 3**: Add `/identifier/chat/ask` route to API Gateway
- ⏳ **Phase 4**: Test live in SPA (temporary frontend integration)
- ⏳ **Phase 5**: Production deployment after validation

---

## 🧪 **Test Environment Configuration**

| Resource | Name | Region | Status |
|----------|------|--------|--------|
| **Lambda Function** | `dfj-docs-test` | `eu-north-1` | ✅ Active |
| **DynamoDB Table** | `dfj-pdf-text-cache-test` | `eu-north-1` | ✅ Created |
| **PyMuPDF Layer** | `pymupdf-layer` (v4) | `eu-north-1` | ✅ Attached |
| **Bedrock Model** | Claude 3.5 Haiku | `us-east-1` | ✅ Enabled |
| **S3 Bucket** | (same as prod) | `eu-north-1` | ✅ Existing |

**Layer ARN**: `arn:aws:lambda:eu-north-1:641409597080:layer:pymupdf-layer:4`

**Tags Applied**:
```
Environment: test
Project: docshare
ManagedBy: manual
CostCenter: customer-portal
Purpose: pdf-text-cache
```

---

## 📋 Executive Summary

### **Goal**
Add an AI chatbot that can:
- Answer customer questions about their legal documents
- Understand document context (divorce agreements, custody, etc.)
- Provide instant responses based on document content
- Reduce support burden while improving customer experience

### **Technical Stack**
- **PDF Text Extraction**: PyMuPDF (fitz) - Free, fast, text-based PDFs
- **AI Provider**: AWS Bedrock (Claude 3.5 Haiku) - Stays in AWS, GDPR-compliant
- **Text Caching**: DynamoDB - Fast lookups, serverless, auto-expiry
- **Current Infrastructure**: AWS Lambda (Python), S3, API Gateway

### **Estimated Cost**
- **Test Environment**: <$1/month (minimal usage)
- **Production** (1,000 documents, 500 AI queries): ~$5/month (using Haiku)
- **One-time setup**: 12-16 hours development time

---

## 🏗️ Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│  CUSTOMER INTERACTION                                         │
│  ├─ Views PDF document in browser                             │
│  ├─ Opens chat panel                                          │
│  └─ Asks: "What is my custody arrangement?"                   │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  FRONTEND (app.js)                                            │
│  ├─ Sends: documentId + question + sessionToken               │
│  └─ POST /identifier/chat/ask                                 │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  LAMBDA (lambda.py)                                           │
│  ├─ Validates session token                                   │
│  ├─ Gets S3 key from Salesforce                               │
│  └─ Checks DynamoDB cache for extracted text                  │
└──────────────────────────────────────────────────────────────┘
                            ↓
         ┌──────────────────┴──────────────────┐
         ↓                                      ↓
  ┌─────────────┐                      ┌─────────────┐
  │ CACHE HIT   │                      │ CACHE MISS  │
  │ Return text │                      │ Extract PDF │
  └─────────────┘                      └─────────────┘
                                               ↓
                            ┌──────────────────────────────────┐
                            │  PDF TEXT EXTRACTION              │
                            │  ├─ Download PDF from S3          │
                            │  ├─ PyMuPDF extracts text         │
                            │  └─ Cache in DynamoDB (30d TTL)   │
                            └──────────────────────────────────┘
                                               ↓
┌──────────────────────────────────────────────────────────────┐
│  AWS BEDROCK (Claude 3 Sonnet)                                │
│  ├─ Receives: document_text + customer_question               │
│  ├─ AI analyzes content                                       │
│  └─ Returns: contextual answer                                │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│  RESPONSE TO CUSTOMER                                         │
│  ├─ Display AI answer in chat panel                           │
│  ├─ Show "AI-generated" disclaimer                            │
│  └─ Option to escalate to human support                       │
└──────────────────────────────────────────────────────────────┘
```

---

## 📦 Implementation Phases

### **Phase 1: Infrastructure Setup** ⏳ **(IN PROGRESS)**

#### **1.1 Create DynamoDB Table** ✅ **COMPLETED**
**Purpose**: Cache extracted PDF text to avoid re-parsing

**Status**: ✅ Table `dfj-pdf-text-cache-test` created with proper configuration

**Configuration Applied**:
- **Table name**: `dfj-pdf-text-cache-test`
- **Partition key**: `s3_key` (String)
- **Billing mode**: On-demand (pay per request)
- **TTL**: Enabled on attribute `ttl`
- **Tags**: Environment=test, Project=docshare, ManagedBy=manual, Purpose=pdf-text-cache

**Table Schema**:
```json
{
  "s3_key": "dk/customer-documents/J-0055362/doc.pdf",
  "text": "Full extracted text content...",
  "extracted_at": "2025-10-26T10:30:00Z",
  "page_count": 12,
  "file_size": 245678,
  "ttl": 1735689600  // Unix timestamp (30 days from extraction)
}
```

**Expected Cost**: ~$0.25/month (on-demand, test usage)

---

#### **1.2 Add PyMuPDF Lambda Layer** ✅ **COMPLETED**
**Purpose**: Include PDF parsing library in Lambda

**Status**: ✅ Layer built and attached to `dfj-docs-test`

**Build Method Used**: AWS CloudShell

```bash
# Steps completed:
mkdir -p python/lib/python3.12/site-packages
pip3 install pymupdf -t python/lib/python3.12/site-packages
zip -r pymupdf-layer.zip python

aws lambda publish-layer-version \
  --layer-name pymupdf-layer \
  --description "PyMuPDF for PDF text extraction" \
  --zip-file fileb://pymupdf-layer.zip \
  --compatible-runtimes python3.12 \
  --region eu-north-1
```

**Result**:
- **Layer ARN**: `arn:aws:lambda:eu-north-1:641409597080:layer:pymupdf-layer:4`
- **Version**: 4 (after a few build attempts)
- **Size**: ~25 MB
- **Attached to**: `dfj-docs-test` Lambda function

**Verification**:
```python
import fitz  # PyMuPDF
print(fitz.version)  # Expected: (1, 26, 5)
```

---

#### **1.3 Enable AWS Bedrock** ✅ **COMPLETED**
**Purpose**: Activate Claude 3.5 Haiku AI model

**Status**: ✅ Automatic access enabled (AWS new policy - no manual request needed)

**AWS Changes** (October 2024):
- Model access page retired
- All serverless foundation models automatically enabled
- Access controlled via IAM policies only

**Model Selected**: 
- **Claude 3.5 Haiku** (recommended over Sonnet)
- **Model ID**: `us.anthropic.claude-3-5-haiku-20241022-v1:0` (cross-region inference profile)
- **Region**: `us-east-1` (Bedrock not available in `eu-north-1` yet)
- **Cost**: $0.25/million input tokens, $1.25/million output tokens (12x cheaper than Sonnet)

**Why Haiku** (not Sonnet):
- ✅ 12x cheaper ($0.69/month vs $8.25/month for 500 queries)
- ✅ 3x faster response times (~1-2 seconds)
- ✅ Perfect for document Q&A (legal docs are straightforward)
- ✅ 200K token context (enough for 50-page PDFs)

---

#### **1.4 Update Lambda IAM Role** ✅ **COMPLETED**
**Purpose**: Grant permissions for Bedrock + DynamoDB access

**Status**: ✅ **DONE** - Policies attached to `dfj-docs-test` execution role

**Required Policies**:

**Policy 1: Bedrock Access**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockInvokeModel",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-haiku-20241022-v1:0",
        "arn:aws:bedrock:*:*:inference-profile/*",
        "arn:aws:bedrock:*::foundation-model/*"
      ]
    }
  ]
}
```

**Policy 2: DynamoDB Cache Access**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DynamoDBCacheAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:Query",
        "dynamodb:UpdateItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:eu-north-1:641409597080:table/dfj-pdf-text-cache-test"
      ]
    }
  ]
}
```

**AWS Console Steps**:
1. Go to **IAM Console** → **Roles**
2. Find execution role for `dfj-docs-test` (e.g., `dfj-docs-test-role-xxxxx`)
   - *Or: Lambda → `dfj-docs-test` → Configuration → Permissions → Click role link*
3. Click **"Add permissions"** → **"Create inline policy"**
4. **JSON editor** → Paste Policy 1 (Bedrock)
5. **Policy name**: `BedrockInvokePolicy` → **"Create policy"**
6. Repeat steps 3-5 for Policy 2 (DynamoDB)
7. **Policy name**: `DynamoDBCachePolicy` → **"Create policy"**

---

#### **1.5 Test Bedrock Connection** ✅ **COMPLETED**
**Purpose**: Verify AI model is accessible from Lambda

**Status**: ✅ **DONE** - AI responded: "Bedrock fungerer!" (1.51s response time)

**Result**: Simple connection test passed successfully.

---

#### **1.6 Test PDF Extraction + Caching** ✅ **COMPLETED**
**Purpose**: Validate PDF text extraction and DynamoDB caching

**Status**: ✅ **DONE** - Extracted 21,732 characters from 13-page testament document

**Test Results**:
- **File**: Testament PDF (~432 KB)
- **Extraction**: 21,732 characters from 13 pages
- **Processing Time**: 4 seconds (including cold start)
- **Memory Usage**: 220 MB / 512 MB allocated
- **Cache Status**: Successfully stored in DynamoDB with 30-day TTL
- **Text Quality**: Danish characters (Tønder) preserved correctly

**Second Run** (cache hit):
- **Retrieval Time**: < 1 second
- **Cache Working**: ✅ No re-extraction needed

---

#### **1.7 Test Full AI Q&A Pipeline** ✅ **COMPLETED**
**Purpose**: End-to-end test of complete AI chatbot functionality

**Status**: ✅ **DONE** - AI successfully analyzed document and provided accurate Danish response

**Test Configuration**:
```json
{
  "test_mode": "test_ai_qa",
  "s3_key": "dk/customer-documents/J-0055362/Mathias Tønder og Nicole Tønder - Testamente (preview by mt@dinfamiliejurist.dk).pdf",
  "question": "Hvad er dette dokument om?"
}
```

**Test Results**:
- **Cache Status**: HIT (used cached text from previous extraction)
- **AI Response Time**: 7.23 seconds (Bedrock call)
- **Memory Usage**: 97 MB / 512 MB (cache hit uses less memory)
- **Answer Quality**: EXCELLENT ✅
  - Correctly identified: Mutual testament between Mathias and Nicole Tønder
  - Accurately extracted: Inheritance percentages (87.5% to surviving spouse, 12.5% to children)
  - Detailed breakdown: Specific distributions (25% nieces/nephews, 25% siblings, 25% Hugh Hefner, 23% Kattens Værn)
  - Identified provisions: Residential rights, legacies, trust terms until age 30
  - Language: Perfect Danish response matching question language

**AI Response Sample** (translated):
```
"This document is a mutual testament created by Mathias Tønder and Nicole Tønder. 
Main points:
1. Extended cohabitation testament where they wish to inherit each other fully
2. Distribution terms: 87.5% to longest-living, 12.5% mandatory to children
3. After longest-living: 25% to nieces/nephews, 25% to siblings, 25% to Hugh Hefner, 23% to Kattens Værn
4. Special provisions for residential rights, cash legacies, object legacies, trust until age 30"
```

**Validation**:
- ✅ Document content accurately analyzed
- ✅ Complex legal terms correctly interpreted
- ✅ Percentages and specific names extracted precisely
- ✅ Customer-friendly language (no legal jargon)
- ✅ Concise yet complete answer
- ✅ Correct language detection and response

---

#### **1.8 Anthropic Use Case Approval** ✅ **COMPLETED**
**Purpose**: Submit AWS Bedrock use case form for Anthropic models

**Status**: ✅ **APPROVED** - Submitted use case and received instant approval

**Submission Details**:
- **Use Case**: AI-powered document Q&A chatbot for family law firm
- **Description**: Legal document assistant for customers to ask questions about testaments, contracts, custody agreements
- **Industry**: Legal / Professional Services
- **Approval Time**: < 5 minutes (nearly instant)

**Issue Encountered**: Initial test failed with `ResourceNotFoundException: Model use case details have not been submitted`

**Resolution**: Submitted use case via Bedrock Playground (AWS changed process in October 2024 - no longer via Model Access page)

---

### **Phase 1 Completion Checklist**

| Task | Status | Performance Notes |
|------|--------|-------------------|
| **1.1 DynamoDB table** | ✅ Done | `dfj-pdf-text-cache-test` created with TTL |
| **1.2 PyMuPDF layer** | ✅ Done | Layer v4 (~25 MB) attached to `dfj-docs-test` |
| **1.3 Bedrock enabled** | ✅ Done | Claude 3.5 Haiku auto-enabled |
| **1.4 IAM permissions** | ✅ Done | Bedrock + DynamoDB + S3 access granted |
| **1.5 Test Bedrock** | ✅ Done | AI responded in Danish (1.51s) |
| **1.6 Test PDF extraction** | ✅ Done | 21,732 chars extracted, cached successfully |
| **1.7 Test AI Q&A** | ✅ Done | Accurate testament analysis in 7.2s |
| **1.8 Anthropic approval** | ✅ Done | Use case approved instantly |

**Phase 1 Status**: ✅ **100% COMPLETE** - All infrastructure validated and working perfectly!

---

### **Phase 2: Live SPA Testing** (1-2 hours) - ⏳ **IN PROGRESS**

**Goal**: Test AI chatbot functionality with real SPA frontend before full production integration

**Approach**: 
1. Create lightweight `/identifier/chat/ask` endpoint in test Lambda
2. Point SPA to test API endpoint temporarily
3. Test user flow: Login → View document → Ask AI question → Get answer
4. Validate performance and UX before production deployment

---

#### **2.1 Add AI Endpoint to Test Lambda** ⏳ **IN PROGRESS**

**Create standalone handler** in `dfj-docs-test` Lambda:

```python
def handle_identifier_chat_ask(event, event_json):
    """
    Minimal AI Q&A endpoint for live testing.
    
    POST /identifier/chat/ask
    Headers: Authorization: Bearer <session-token>
    Body: {
        "s3_key": "dk/customer-documents/J-0055362/document.pdf",
        "question": "What is this document about?"
    }
    
    Returns: {
        "answer": "Based on your document...",
        "isAI": true,
        "cached": true
    }
    """
    try:
        # Get S3 key and question from request
        s3_key = (event_json.get("s3_key") or "").strip()
        question = (event_json.get("question") or "").strip()
        
        if not s3_key or not question:
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({"error": "Missing s3_key or question"})
            }
        
        # Get cached text or extract
        document_text, was_cached = get_cached_text(s3_key)
        
        if not document_text:
            return {
                'statusCode': 500,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({"error": "Could not extract document text"})
            }
        
        # Prepare context
        context = {
            'name': s3_key.split('/')[-1]
        }
        
        # Ask AI
        answer = ask_ai_about_document(document_text, question, context)
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',  # CORS for testing
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            'body': json.dumps({
                "answer": answer,
                "isAI": True,
                "cached": was_cached,
                "s3_key": s3_key,
                "timestamp": datetime.utcnow().isoformat()
            })
        }
        
    except Exception as e:
        print(f"❌ chat/ask error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({"error": str(e)})
        }

# Update lambda_handler to route to new endpoint
def lambda_handler(event, context):
    path = event.get("rawPath") or event.get("path") or ""
    method = (event.get("requestContext") or {}).get("http", {}).get("method") or event.get("httpMethod") or "GET"
    
    event_json = {}
    try:
        body = event.get("body") or "{}"
        if event.get("isBase64Encoded"):
            body = base64.b64decode(body).decode('utf-8')
        event_json = json.loads(body)
    except:
        pass
    
    # Route to AI endpoint
    if path == "/identifier/chat/ask" and method == "POST":
        return handle_identifier_chat_ask(event, event_json)
    
    # Existing test modes
    return lambda_handler_original(event, context)  # Use existing test handler
```

---

#### **2.2 Add API Gateway Route (Test)** ⏳ **NOT STARTED**

**AWS Console Steps**:
1. Go to **API Gateway Console**
2. Find test API (or create new HTTP API for testing)
3. **Routes** → **Create**:
   - **Method**: `POST`
   - **Path**: `/identifier/chat/ask`
   - **Integration**: Lambda `dfj-docs-test`
4. **CORS Configuration**:
   - **Allow Origins**: `*` (test only)
   - **Allow Methods**: `POST, OPTIONS`
   - **Allow Headers**: `Content-Type, Authorization`
5. **Deploy** to stage (e.g., `test`)

**Test Endpoint**: `https://<test-api-id>.execute-api.eu-north-1.amazonaws.com/test/identifier/chat/ask`

---

#### **2.3 Temporary Frontend Integration** ⏳ **NOT STARTED**

**Add AI mode to chat panel** (minimal changes for testing):

**File**: `app.js`

```javascript
// Add after chat initialization
let aiModeEnabled = true;  // Enable AI mode for testing

// Update sendChat function
async function sendChat() {
  const editor = $('chatEditor');
  const txt = (editor.textContent || '').trim();
  if (!txt) return;
  
  // If AI mode enabled and we have an active document
  if (aiModeEnabled && active >= 0 && active < docs.length) {
    const currentDoc = docs[active];
    const s3Key = currentDoc.s3_key;  // Assume we have this from doc metadata
    
    try {
      spin(true);
      
      // Call AI endpoint
      const res = await fetch('https://<test-api-id>.execute-api.eu-north-1.amazonaws.com/test/identifier/chat/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`  // If needed
        },
        body: JSON.stringify({
          s3_key: s3Key,
          question: txt
        })
      });
      
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'AI request failed');
      
      // Display AI response
      appendChatBubble('me', txt);
      appendChatBubble('ai', `🤖 ${data.answer}\n\n<em>(AI-generated response)</em>`);
      
      editor.textContent = '';
      
    } catch (e) {
      console.error('AI chat error:', e);
      setIdMsg(`AI error: ${e.message}`);
    } finally {
      spin(false);
    }
    
  } else {
    // Fallback to existing human chat
    // ... existing sendChat logic ...
  }
}

// Helper to append chat bubbles
function appendChatBubble(type, message) {
  const chatList = $('chatList');
  const bubble = document.createElement('div');
  bubble.className = type === 'me' ? 'me' : 'them';
  bubble.innerHTML = `<div class="chat-row">${message.replace(/\n/g, '<br>')}</div>`;
  chatList.appendChild(bubble);
  chatList.scrollTop = chatList.scrollHeight;
}
```

---

#### **2.4 Live Testing Scenarios** ⏳ **NOT STARTED**

**Test Scenario 1: Simple Question**
- **Action**: Login with identifier, view testament document
- **Question**: "What is this document about?"
- **Expected**: AI provides document summary in Danish
- **Validate**: Response time < 10 seconds, answer accurate

**Test Scenario 2: Specific Detail**
- **Question**: "What is the inheritance split?"
- **Expected**: AI extracts specific percentages (87.5% / 12.5%)
- **Validate**: Accuracy of numbers, clarity of explanation

**Test Scenario 3: Cache Performance**
- **Action**: Ask second question about same document
- **Expected**: Response time < 3 seconds (cache hit)
- **Validate**: `cached: true` in response

**Test Scenario 4: Multi-language**
- **Action**: Test with Swedish document
- **Question** (Swedish): "Vad handlar detta dokument om?"
- **Expected**: AI responds in Swedish
- **Validate**: Language detection working

**Test Scenario 5: Error Handling**
- **Action**: Try to access document without permission
- **Expected**: 401/403 error, no AI response
- **Validate**: Security working

---

#### **2.5 Performance Validation** ⏳ **NOT STARTED**

**Metrics to Track**:
- ✅ First question response time: < 10 seconds
- ✅ Cached question response time: < 3 seconds
- ✅ Memory usage: < 300 MB
- ✅ Error rate: 0% (during testing)
- ✅ AI answer relevance: Manual review (score 4-5/5)

**Success Criteria**:
- ✅ All test scenarios pass
- ✅ No crashes or timeouts
- ✅ AI answers are accurate and helpful
- ✅ Cache hit rate > 80% (second+ questions)
- ✅ User experience smooth (no lag)

---

### **Phase 2 Complete When**:
- [ ] Test Lambda has `/identifier/chat/ask` endpoint
- [ ] API Gateway route configured and deployed
- [ ] SPA can successfully call AI endpoint
- [ ] All 5 test scenarios pass
- [ ] Performance metrics meet targets
- [ ] Ready for production integration

---

### **Phase 3: Backend Implementation** (4-6 hours) - ⏳ **NOT STARTED**

#### **2.1 Add Helper Functions to lambda.py**

**Location**: Add after existing helper functions (around line 250)

```python
# ===================== PDF TEXT EXTRACTION =====================

import fitz  # PyMuPDF (imported at top of file)

# DynamoDB client for caching
_dynamodb = boto3.resource('dynamodb', region_name=AWS_REGION)
_text_cache_table = _dynamodb.Table('dfj-pdf-text-cache')

# Bedrock client for AI
_bedrock = boto3.client('bedrock-runtime', region_name='us-east-1')

def extract_pdf_text(bucket: str, key: str) -> dict:
    """
    Extract text from PDF using PyMuPDF.
    Returns: {
        'text': str,
        'page_count': int,
        'file_size': int
    }
    """
    try:
        # Download PDF from S3
        obj = _s3.get_object(Bucket=bucket, Key=key)
        pdf_bytes = obj['Body'].read()
        file_size = len(pdf_bytes)
        
        # Open PDF with PyMuPDF
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        
        # Extract text from all pages
        text_parts = []
        for page_num, page in enumerate(doc, start=1):
            page_text = page.get_text()
            if page_text.strip():
                text_parts.append(f"--- Page {page_num} ---\n{page_text}")
        
        full_text = '\n\n'.join(text_parts)
        page_count = len(doc)
        doc.close()
        
        return {
            'text': full_text,
            'page_count': page_count,
            'file_size': file_size
        }
    except Exception as e:
        log(f"PDF extraction error for {key}: {repr(e)}")
        raise


def get_cached_text(s3_key: str) -> str:
    """
    Get cached text from DynamoDB or extract if not cached.
    """
    try:
        # Check cache first
        response = _text_cache_table.get_item(Key={'s3_key': s3_key})
        
        if 'Item' in response:
            log(f"Cache HIT for {s3_key}")
            return response['Item']['text']
        
        log(f"Cache MISS for {s3_key}, extracting...")
        
        # Extract PDF text
        result = extract_pdf_text(DOCS_BUCKET, s3_key)
        
        # Cache for 30 days
        ttl = int(time.time()) + (86400 * 30)
        _text_cache_table.put_item(Item={
            's3_key': s3_key,
            'text': result['text'],
            'extracted_at': datetime.datetime.utcnow().isoformat(),
            'page_count': result['page_count'],
            'file_size': result['file_size'],
            'ttl': ttl
        })
        
        return result['text']
        
    except Exception as e:
        log(f"get_cached_text error: {repr(e)}")
        return ""


def ask_ai_about_document(document_text: str, question: str, context: dict = None) -> str:
    """
    Send question + document to AWS Bedrock (Claude 3).
    
    Args:
        document_text: Extracted PDF text
        question: Customer's question
        context: Optional metadata (document name, journal name, etc.)
    
    Returns:
        AI-generated answer
    """
    try:
        # Build context-aware prompt
        system_prompt = """You are a helpful legal document assistant for Din Familiejurist (family law firm).
Your role is to answer customer questions about their legal documents clearly and accurately.

Guidelines:
- Only answer based on the document content provided
- If the answer is not in the document, say so politely
- Use simple, customer-friendly language (avoid legal jargon)
- Be concise but complete
- For dates, amounts, or specific terms, quote the document exactly
- If asked about legal advice, remind them to contact their lawyer
"""
        
        # Add document context if provided
        context_text = ""
        if context:
            context_text = f"\nDocument: {context.get('name', 'Unknown')}\n"
            if context.get('journal_name'):
                context_text += f"Case: {context['journal_name']}\n"
        
        # Build user prompt
        user_prompt = f"""{context_text}
Document content:
{document_text[:15000]}  # Limit to ~15K chars to stay within token limits

Customer question: {question}

Please answer the question based on the document content above."""
        
        # Call Bedrock (Claude 3 Sonnet)
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1000,
            "temperature": 0.3,  # Lower = more focused/consistent
            "system": system_prompt,
            "messages": [
                {
                    "role": "user",
                    "content": user_prompt
                }
            ]
        })
        
        response = _bedrock.invoke_model(
            modelId='anthropic.claude-3-sonnet-20240229-v1:0',
            body=body
        )
        
        result = json.loads(response['body'].read())
        answer = result['content'][0]['text']
        
        log(f"AI response generated ({len(answer)} chars)")
        return answer
        
    except Exception as e:
        log(f"AI query error: {repr(e)}")
        return "Jeg beklager, jeg kunne ikke behandle dit spørgsmål. Prøv venligst igen eller kontakt support."
```

---

#### **2.2 Add New Endpoint Handler**

**Location**: Add after existing chat handlers (around line 1350)

```python
# ===================== AI CHAT (document-aware) =====================

def handle_identifier_chat_ask(event, data):
    """
    AI-powered document Q&A endpoint.
    
    POST /identifier/chat/ask
    Body: {
        "journalId": "a015g00000...",
        "documentId": "a0M5g00000...",
        "question": "What is my custody arrangement?"
    }
    
    Returns: {
        "answer": "Based on your document...",
        "documentName": "Separation Agreement.pdf",
        "isAI": true
    }
    """
    try:
        # Validate session
        session_data = verify_session(get_bearer(event))
        if not session_data:
            return resp(event, 401, {"error": "Invalid or expired session"})
        
        journal_id = (data.get("journalId") or "").strip()
        document_id = (data.get("documentId") or "").strip()
        question = (data.get("question") or "").strip()
        
        if not all([journal_id, document_id, question]):
            return resp(event, 400, {"error": "Missing journalId, documentId, or question"})
        
        # Get Salesforce token
        org_token, instance_url = get_org_token()
        
        # Get document details from Salesforce
        soql = f"""
            SELECT Id, Name, S3_Key__c, Journal__r.Name
            FROM Shared_Document__c
            WHERE Id = '{soql_escape(document_id)}'
              AND Journal__c = '{soql_escape(journal_id)}'
            LIMIT 1
        """
        
        result = salesforce_query(instance_url, org_token, soql)
        if not result.get('records'):
            return resp(event, 404, {"error": "Document not found"})
        
        doc = result['records'][0]
        s3_key = doc.get('S3_Key__c')
        if not s3_key:
            return resp(event, 400, {"error": "Document has no S3 key"})
        
        # Get or extract document text
        document_text = get_cached_text(s3_key)
        
        if not document_text:
            return resp(event, 500, {"error": "Could not extract document text"})
        
        # Prepare context
        context = {
            'name': doc.get('Name', 'Unknown'),
            'journal_name': doc.get('Journal__r', {}).get('Name', '')
        }
        
        # Ask AI
        answer = ask_ai_about_document(document_text, question, context)
        
        # Log interaction (optional: save to Salesforce for audit)
        log(f"AI Q&A - Doc: {document_id}, Question length: {len(question)}, Answer length: {len(answer)}")
        
        return resp(event, 200, {
            "answer": answer,
            "documentName": context['name'],
            "isAI": True,
            "timestamp": datetime.datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        log(f"chat/ask error: {repr(e)}")
        return resp(event, 500, {"error": "Internal server error"})
```

---

#### **2.3 Update Router**

**Location**: In `lambda_handler` function (around line 1430)

```python
def lambda_handler(event, context):
    path = event.get("rawPath") or event.get("path") or ""
    method = (event.get("requestContext") or {}).get("http", {}).get("method") \
           or event.get("httpMethod") or "GET"
    
    event_json = _parse_body(event)
    
    # ... existing routes ...
    
    # NEW: AI-powered chat
    if path == "/identifier/chat/ask" and method == "POST":
        return handle_identifier_chat_ask(event, event_json)
    
    # ... rest of routes ...
```

---

### **Phase 3: API Gateway Configuration** (30 minutes)

#### **3.1 Add New Route**

**AWS Console Steps**:
1. Go to API Gateway Console
2. Select your API: `dfj-docshare-prod`
3. Click "Routes"
4. Click "Create" → Add route:
   - **Method**: `POST`
   - **Path**: `/identifier/chat/ask`
   - **Integration**: Lambda function (`dfj-docshare-prod`)
5. Deploy changes

---

#### **3.2 Update CORS (if needed)**

Ensure `/identifier/chat/ask` allows POST from your domains:
- `https://dok.dinfamiliejurist.dk`
- `https://dok.dinfamiljejurist.se`
- `https://docs.hereslaw.ie`

---

### **Phase 4: Frontend Integration** (2-3 hours)

**Note**: Implementation deferred per user request. See [FRONTEND_CHANGES.md](#frontend-changes) for details.

**Summary of Required Changes**:
1. Add "AI Mode" toggle in chat panel
2. Update `sendChat()` to call `/identifier/chat/ask` when AI mode enabled
3. Display AI responses with distinct styling
4. Add disclaimer: "AI-generated answer. Verify important details with your lawyer."
5. Option to escalate to human support

---

### **Phase 5: Testing & Validation** (2-3 hours)

#### **5.1 Unit Tests**

**Test PDF Extraction**:
```bash
# In Lambda console, test event:
{
  "rawPath": "/test/extract-text",
  "requestContext": {"http": {"method": "POST"}},
  "body": "{\"s3_key\": \"dk/customer-documents/test.pdf\"}"
}
```

**Expected Response**:
```json
{
  "text": "Full extracted text...",
  "page_count": 5,
  "cached": false
}
```

---

**Test AI Q&A**:
```bash
# Test event:
{
  "rawPath": "/identifier/chat/ask",
  "requestContext": {"http": {"method": "POST"}},
  "headers": {
    "authorization": "Bearer <valid-session-token>"
  },
  "body": "{\"journalId\": \"a015g00000...\", \"documentId\": \"a0M5g00000...\", \"question\": \"What is the custody arrangement?\"}"
}
```

**Expected Response**:
```json
{
  "answer": "Based on your separation agreement, the custody arrangement is...",
  "documentName": "Separation Agreement.pdf",
  "isAI": true,
  "timestamp": "2025-10-25T14:30:00Z"
}
```

---

#### **5.2 Integration Tests**

**Scenario 1: First-time extraction (cache miss)**
- Upload test PDF to S3
- Call `/identifier/chat/ask`
- Verify:
  - ✅ PDF text extracted
  - ✅ Text cached in DynamoDB
  - ✅ AI returns relevant answer
  - ✅ Response time < 10 seconds

**Scenario 2: Cached extraction (cache hit)**
- Call `/identifier/chat/ask` for same document
- Verify:
  - ✅ Text retrieved from cache
  - ✅ AI returns relevant answer
  - ✅ Response time < 3 seconds

**Scenario 3: Multi-language support**
- Test with DK, SE, IE documents
- Verify AI responds in appropriate language

---

#### **5.3 Load Testing**

**Simulate 100 concurrent users**:
```bash
# Using Apache Bench
ab -n 100 -c 10 \
  -H "Authorization: Bearer <token>" \
  -p question.json \
  -T application/json \
  https://ysu7eo2haj.execute-api.eu-north-1.amazonaws.com/prod/identifier/chat/ask
```

**Success Criteria**:
- ✅ All requests succeed (no 500 errors)
- ✅ Average response time < 5 seconds
- ✅ DynamoDB caching reduces subsequent calls to < 2 seconds

---

### **Phase 6: Monitoring & Observability** (1 hour)

#### **6.1 CloudWatch Dashboards**

Create dashboard with:
- **Lambda invocations**: `/identifier/chat/ask` call count
- **AI costs**: Bedrock token usage
- **Cache hit rate**: DynamoDB reads vs. writes
- **Error rate**: 4xx/5xx responses
- **Response times**: p50, p95, p99

---

#### **6.2 CloudWatch Alarms**

**High Error Rate**:
```yaml
Metric: Lambda Errors
Threshold: > 5 errors in 5 minutes
Action: Send SNS notification
```

**High AI Costs**:
```yaml
Metric: Bedrock InvokeModel count
Threshold: > 1000 calls per hour
Action: Send SNS notification
```

---

#### **6.3 Logging**

Ensure all interactions logged:
```python
log(f"AI Q&A - User: {session_data['identifier_value']}, Doc: {document_id}, Q: {question[:50]}...")
```

**Use for**:
- Customer support (review past questions)
- AI quality improvement (find poor answers)
- Cost tracking (token usage per customer)

---

## 🚀 Deployment Plan

### **Pre-Deployment Checklist**

- [ ] DynamoDB table created (`dfj-pdf-text-cache`)
- [ ] PyMuPDF Lambda layer attached
- [ ] AWS Bedrock access enabled for Claude 3
- [ ] IAM role updated with Bedrock permissions
- [ ] DynamoDB permissions added to Lambda role
- [ ] Lambda code updated with new functions
- [ ] API Gateway route `/identifier/chat/ask` added
- [ ] Unit tests passing
- [ ] Integration tests passing

---

### **Deployment Steps**

#### **1. Deploy Infrastructure (DynamoDB, IAM)**
```bash
# Create DynamoDB table
aws dynamodb create-table \
  --table-name dfj-pdf-text-cache \
  --attribute-definitions AttributeName=s3_key,AttributeType=S \
  --key-schema AttributeName=s3_key,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region eu-north-1

# Enable TTL
aws dynamodb update-time-to-live \
  --table-name dfj-pdf-text-cache \
  --time-to-live-specification "Enabled=true, AttributeName=ttl"
```

---

#### **2. Deploy Lambda Code**
```bash
# Package lambda.py
cd "vscode attempt"
zip lambda.zip lambda.py

# Upload to Lambda
aws lambda update-function-code \
  --function-name dfj-docshare-prod \
  --zip-file fileb://lambda.zip \
  --region eu-north-1
```

---

#### **3. Add Lambda Layer (PyMuPDF)**
```bash
# Download pre-built layer or build custom
# Then attach to Lambda
aws lambda update-function-configuration \
  --function-name dfj-docshare-prod \
  --layers arn:aws:lambda:eu-north-1:ACCOUNT_ID:layer:pymupdf-layer:1
```

---

#### **4. Update API Gateway**
- Manually add route via console (see Phase 3)
- Or use AWS CLI/CloudFormation

---

#### **5. Smoke Test**
```bash
# Test PDF extraction
curl -X POST https://ysu7eo2haj.execute-api.eu-north-1.amazonaws.com/prod/identifier/chat/ask \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"journalId":"a015g00000...", "documentId":"a0M5g00000...", "question":"What is this document about?"}'
```

---

## 📊 Cost Analysis

### **Monthly Cost Breakdown** (1,000 active users)

| Component | Usage | Unit Cost | Monthly Cost |
|-----------|-------|-----------|--------------|
| **DynamoDB** | 1,000 writes, 10,000 reads | $0.25/million requests | ~$0.25 |
| **Lambda (AI calls)** | 500 invocations × 30s avg | $0.0000166667/GB-sec | ~$2.50 |
| **AWS Bedrock (Claude 3)** | 500 queries × 2K tokens avg | $0.003/1K input + $0.015/1K output | ~$10.00 |
| **S3 (PDF downloads)** | 1,000 PDFs × 500KB avg | $0.09/GB | ~$0.05 |
| **PyMuPDF** | Open source | Free | $0.00 |
| **Total** | | | **~$12.80/month** |

**Cost per customer interaction**: ~$0.02

---

### **Scaling Cost Projections**

| Users/Month | AI Queries | DynamoDB | Lambda | Bedrock | **Total** |
|-------------|------------|----------|--------|---------|-----------|
| 1,000 | 500 | $0.25 | $2.50 | $10.00 | **$12.80** |
| 5,000 | 2,500 | $0.60 | $12.50 | $50.00 | **$63.10** |
| 10,000 | 5,000 | $1.25 | $25.00 | $100.00 | **$126.25** |

**Note**: Costs scale linearly. Cache hit rate reduces Lambda/Bedrock usage significantly.

---

## 🎯 Success Metrics

### **Technical KPIs**

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Response Time** | < 5 seconds (first query) | CloudWatch Lambda duration |
| **Cache Hit Rate** | > 80% | DynamoDB reads vs writes |
| **Error Rate** | < 1% | Lambda errors / total invocations |
| **AI Accuracy** | Customer satisfaction > 4/5 | Manual review + feedback |

---

### **Business KPIs**

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Support Ticket Reduction** | -30% | Compare tickets before/after |
| **Customer Satisfaction** | > 4.2/5 | Post-chat survey |
| **Chat Engagement** | +50% | Chat sessions before/after |
| **Cost per Support** | < €0.50 | Monthly cost / total interactions |

---

## 🔒 Security & Compliance

### **Data Privacy**

✅ **GDPR Compliance**:
- Text cached in DynamoDB (EU region: `eu-north-1`)
- AWS Bedrock in `us-east-1` (verify data residency requirements)
- TTL auto-deletes cached text after 30 days
- Customer can request deletion via Salesforce

✅ **Access Control**:
- Session token required (validates identifier)
- Document ownership verified (journal match)
- Rate limiting on API Gateway (prevent abuse)

---

### **PII Handling**

**Customer data in PDFs**:
- Names, addresses, SSNs, dates of birth
- Financial details, custody arrangements

**Mitigation**:
- AI responses don't store customer data
- Bedrock doesn't train on customer data (per AWS terms)
- Cache encrypted at rest (DynamoDB encryption)
- Logs sanitized (no PII in CloudWatch)

---

## 🐛 Troubleshooting Guide

### **Issue: PDF extraction fails**

**Symptoms**:
- Error: "Could not extract document text"
- Empty text returned

**Causes**:
- Scanned PDF (image-based, no text layer)
- Corrupted PDF file
- PyMuPDF not installed correctly

**Solutions**:
1. Check PDF type: `pdfinfo <file>` (if text layer exists)
2. If scanned, upgrade to AWS Textract (OCR support)
3. Verify Lambda layer attached correctly

---

### **Issue: AI returns generic answers**

**Symptoms**:
- Responses like "I cannot answer that" or vague answers
- AI ignores document content

**Causes**:
- Text extraction truncated (too long)
- Prompt unclear
- AI model hallucinating

**Solutions**:
1. Increase `document_text[:15000]` to `[:20000]` (test token limits)
2. Improve system prompt (add examples)
3. Add document structure hints (e.g., "Section 3 covers custody")

---

### **Issue: High Bedrock costs**

**Symptoms**:
- Monthly bill > expected
- Many repeat queries for same document

**Causes**:
- Cache not working
- Customers asking many questions per document
- Long documents (high token usage)

**Solutions**:
1. Verify DynamoDB TTL working (check cache hit rate)
2. Implement rate limiting (max 10 questions/document/session)
3. Truncate very long documents (first 20 pages only)

---

## 📚 Documentation Updates Needed

After implementation, update these files:

1. **DEPLOYMENT_GUIDE.md**
   - Add DynamoDB table creation step
   - Add Lambda layer attachment step
   - Add Bedrock IAM permissions

2. **API_REFERENCE.md** (create new)
   - Document `/identifier/chat/ask` endpoint
   - Request/response schemas
   - Authentication requirements

3. **USER_GUIDE.md** (create new)
   - How to use AI chat
   - Example questions
   - When to escalate to human support

4. **ROLLBACK_GUIDE.md**
   - How to disable AI chat
   - Revert to human-only chat
   - Remove Bedrock permissions

---

## 🔄 Rollback Plan

### **If AI chat causes issues:**

**Quick Disable** (no code changes):
1. Remove `/identifier/chat/ask` route from API Gateway
2. Frontend will fallback to human chat (existing `/identifier/chat/send`)

**Full Rollback**:
1. Deploy previous Lambda code (without AI functions)
2. Remove DynamoDB table (after backing up if needed)
3. Remove Lambda layer (PyMuPDF)
4. Revoke Bedrock IAM permissions

**Estimated Time**: 15 minutes

---

## 📅 Timeline

### **Development Phase**

| Phase | Tasks | Duration | Owner |
|-------|-------|----------|-------|
| **Phase 1** | DynamoDB, Lambda layer, Bedrock setup | 2-3 hours | DevOps |
| **Phase 2** | Lambda code (extraction + AI) | 4-6 hours | Backend Dev |
| **Phase 3** | API Gateway route | 30 min | DevOps |
| **Phase 4** | Frontend integration | 2-3 hours | Frontend Dev |
| **Phase 5** | Testing & validation | 2-3 hours | QA |
| **Phase 6** | Monitoring setup | 1 hour | DevOps |
| **Total** | | **12-16 hours** | |

---

### **Deployment Schedule**

**Week 1**:
- ✅ Infrastructure setup (DynamoDB, Bedrock, Lambda layer)
- ✅ Backend code implementation

**Week 2**:
- ✅ Testing (unit + integration)
- ✅ Deploy to test environment

**Week 3**:
- ✅ Frontend integration
- ✅ UAT (user acceptance testing)

**Week 4**:
- ✅ Production deployment
- ✅ Monitor for 1 week
- ✅ Gather customer feedback

---

## ✅ Next Steps

1. **Review this plan** with team
2. **Get approval** for AWS costs (~$13/month)
3. **Assign tasks** to developers
4. **Set up test environment** (separate Lambda/DynamoDB)
5. **Begin Phase 1** (infrastructure setup)

---

## 📞 Support Contacts

- **AWS Bedrock Issues**: AWS Support (Enterprise plan)
- **PyMuPDF Issues**: [GitHub pymupdf/PyMuPDF](https://github.com/pymupdf/PyMuPDF/issues)
- **DynamoDB Issues**: AWS Support or internal DevOps
- **AI Quality Issues**: Review prompts, consider fine-tuning

---

## 📖 References

- [AWS Bedrock Claude 3 Documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-claude.html)
- [PyMuPDF Documentation](https://pymupdf.readthedocs.io/)
- [DynamoDB TTL Guide](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html)
- [Lambda Layers Guide](https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html)

---

**Status**: ✅ Ready for Implementation  
**Last Updated**: October 25, 2025  
**Version**: 1.0
