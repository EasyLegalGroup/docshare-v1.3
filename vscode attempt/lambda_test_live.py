# =====================================================
# LIVE SPA TEST LAMBDA - AI CHATBOT ENDPOINT
# =====================================================
# Purpose: Test AI chatbot with real SPA frontend
# Deploy to: dfj-docs-test Lambda
# API Gateway: POST /identifier/chat/ask
# =====================================================

import json
import boto3
import time
from datetime import datetime, timedelta

# Initialize AWS clients
s3_client = boto3.client('s3', region_name='eu-north-1')
dynamodb = boto3.resource('dynamodb', region_name='eu-north-1')
bedrock_client = boto3.client('bedrock-runtime', region_name='us-east-1')

# Configuration
DYNAMODB_TABLE = 'dfj-pdf-text-cache-test'
S3_BUCKET = 'dfj-docs-test'  # TEST bucket

# DynamoDB table reference
text_cache_table = dynamodb.Table(DYNAMODB_TABLE)


def extract_pdf_text(bucket: str, key: str) -> dict:
    """Extract text from PDF using PyMuPDF (fitz)."""
    try:
        import fitz  # PyMuPDF
        
        print(f"📄 Extracting text from: s3://{bucket}/{key}")
        
        # Download PDF from S3
        obj = s3_client.get_object(Bucket=bucket, Key=key)
        pdf_bytes = obj['Body'].read()
        file_size = len(pdf_bytes)
        
        print(f"📦 Downloaded {file_size} bytes")
        
        # Open PDF with PyMuPDF
        doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        
        # Extract text from all pages
        text_parts = []
        for page_num in range(len(doc)):
            page = doc[page_num]
            page_text = page.get_text()
            if page_text.strip():
                text_parts.append(f"--- Page {page_num + 1} ---\n{page_text}")
        
        full_text = '\n\n'.join(text_parts)
        page_count = len(doc)
        doc.close()
        
        print(f"✅ Extracted {len(full_text)} characters from {page_count} pages")
        
        return {
            'text': full_text,
            'page_count': page_count,
            'file_size': file_size
        }
        
    except ImportError:
        raise Exception("PyMuPDF (fitz) not available. Check Lambda layer is attached.")
    except Exception as e:
        print(f"❌ PDF extraction error: {str(e)}")
        raise


def get_cached_text(s3_key: str) -> tuple:
    """Get cached text from DynamoDB or extract if not cached."""
    try:
        # Check cache first
        print(f"🔍 Checking cache for: {s3_key}")
        response = text_cache_table.get_item(Key={'s3_key': s3_key})
        
        if 'Item' in response:
            print(f"✅ Cache HIT for {s3_key}")
            return (response['Item']['text'], True)
        
        print(f"⚠️  Cache MISS for {s3_key}, extracting...")
        
        # Extract PDF text
        result = extract_pdf_text(S3_BUCKET, s3_key)
        
        # Cache for 30 days
        ttl = int((datetime.utcnow() + timedelta(days=30)).timestamp())
        
        print(f"💾 Caching text in DynamoDB...")
        text_cache_table.put_item(Item={
            's3_key': s3_key,
            'text': result['text'],
            'extracted_at': datetime.utcnow().isoformat(),
            'page_count': result['page_count'],
            'file_size': result['file_size'],
            'ttl': ttl
        })
        
        print(f"✅ Text cached successfully (TTL: 30 days)")
        
        return (result['text'], False)
        
    except Exception as e:
        print(f"❌ get_cached_text error: {str(e)}")
        raise


def ask_ai_about_document(document_text: str, question: str, context: dict = None) -> str:
    """Send question + document to AWS Bedrock (Claude 3.5 Haiku)."""
    try:
        print(f"🤖 Asking AI: {question[:100]}...")
        
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
- Respond in the same language as the question (Danish, Swedish, or English)
"""
        
        # Add document context if provided
        context_text = ""
        if context:
            context_text = f"\nDocument: {context.get('name', 'Unknown')}\n"
            if context.get('journal_name'):
                context_text += f"Case: {context['journal_name']}\n"
        
        # Limit document text to ~15K chars (to stay within token limits)
        max_text_length = 15000
        truncated_text = document_text[:max_text_length]
        if len(document_text) > max_text_length:
            truncated_text += f"\n\n[Document truncated - showing first {max_text_length} characters]"
        
        # Build user prompt
        user_prompt = f"""{context_text}
Document content:
{truncated_text}

Customer question: {question}

Please answer the question based on the document content above."""
        
        # Call Bedrock (Claude 3.5 Haiku)
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
        
        start_time = time.time()
        
        response = bedrock_client.invoke_model(
            modelId='us.anthropic.claude-3-5-haiku-20241022-v1:0',
            body=body
        )
        
        elapsed_time = time.time() - start_time
        
        result = json.loads(response['body'].read())
        answer = result['content'][0]['text']
        
        print(f"✅ AI response generated in {elapsed_time:.2f}s ({len(answer)} chars)")
        
        return answer
        
    except Exception as e:
        print(f"❌ AI query error: {str(e)}")
        return "Jeg beklager, jeg kunne ikke behandle dit spørgsmål. Prøv venligst igen eller kontakt support."


def handle_identifier_chat_ask(event, event_json):
    """
    AI Q&A endpoint for live SPA testing.
    
    POST /identifier/chat/ask
    Body: {
        "s3_key": "dk/customer-documents/J-0055362/document.pdf",
        "question": "What is this document about?",
        "document_name": "Testament.pdf"  // optional
    }
    
    Returns: {
        "answer": "Based on your document...",
        "isAI": true,
        "cached": true,
        "timestamp": "2025-10-26T..."
    }
    """
    try:
        print("=== AI Chat/Ask Endpoint Called ===")
        print(f"Request: {json.dumps(event_json, indent=2)}")
        
        # Get S3 key and question from request
        s3_key = (event_json.get("s3_key") or "").strip()
        question = (event_json.get("question") or "").strip()
        document_name = (event_json.get("document_name") or "").strip()
        
        if not s3_key or not question:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                },
                'body': json.dumps({
                    "error": "Missing s3_key or question",
                    "example": {
                        "s3_key": "dk/customer-documents/J-0055362/document.pdf",
                        "question": "What is this document about?"
                    }
                })
            }
        
        # Get cached text or extract
        document_text, was_cached = get_cached_text(s3_key)
        
        if not document_text:
            return {
                'statusCode': 500,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({"error": "Could not extract document text"})
            }
        
        # Prepare context
        context = {
            'name': document_name or s3_key.split('/')[-1]
        }
        
        # Ask AI
        answer = ask_ai_about_document(document_text, question, context)
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',  # Open CORS for testing
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            'body': json.dumps({
                "answer": answer,
                "isAI": True,
                "cached": was_cached,
                "s3_key": s3_key,
                "document_name": context['name'],
                "timestamp": datetime.utcnow().isoformat(),
                "message": "✅ AI response generated successfully"
            })
        }
        
    except Exception as e:
        print(f"❌ chat/ask error: {str(e)}")
        import traceback
        traceback.print_exc()
        
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                "error": str(e),
                "type": type(e).__name__
            })
        }


def lambda_handler(event, context):
    """
    Main handler - routes to AI endpoint or original test modes.
    """
    
    print("=== Lambda Handler Invoked ===")
    print(f"Event: {json.dumps(event, indent=2)}")
    
    # Get path and method
    path = event.get("rawPath") or event.get("path") or ""
    method = (event.get("requestContext") or {}).get("http", {}).get("method") \
           or event.get("httpMethod") or "GET"
    
    # Parse body
    event_json = {}
    try:
        body = event.get("body") or "{}"
        # Handle base64 encoded body (API Gateway sometimes does this)
        if event.get("isBase64Encoded"):
            import base64
            body = base64.b64decode(body).decode('utf-8')
        event_json = json.loads(body)
    except Exception as e:
        print(f"Body parse error: {e}")
        event_json = {}
    
    # CORS preflight
    if method == "OPTIONS":
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            'body': ''
        }
    
    # Route to AI endpoint
    if path == "/identifier/chat/ask" and method == "POST":
        return handle_identifier_chat_ask(event, event_json)
    
    # Fallback to original test modes (from lambda_test_full.py)
    test_mode = event.get('test_mode') or event_json.get('test_mode', 'test_bedrock')
    
    # ... (include original test mode handlers from lambda_test_full.py) ...
    
    return {
        'statusCode': 404,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps({
            'error': 'Unknown path or test mode',
            'path': path,
            'method': method,
            'available_paths': ['/identifier/chat/ask'],
            'available_test_modes': ['test_bedrock', 'test_pdf_extraction', 'test_ai_qa']
        })
    }


# =====================================================
# DEPLOYMENT INSTRUCTIONS
# =====================================================
# 1. Copy this code to dfj-docs-test Lambda function
# 2. Ensure PyMuPDF layer is attached
# 3. Configure API Gateway:
#    - Create HTTP API (or use existing)
#    - Add route: POST /identifier/chat/ask
#    - Integration: Lambda (dfj-docs-test)
#    - Enable CORS: Allow * for testing
# 4. Test with curl:
#    curl -X POST https://<api-id>.execute-api.eu-north-1.amazonaws.com/test/identifier/chat/ask \
#      -H "Content-Type: application/json" \
#      -d '{"s3_key":"dk/customer-documents/J-0055362/Mathias Tønder og Nicole Tønder - Testamente (preview by mt@dinfamiliejurist.dk).pdf","question":"Hvad er dette dokument om?"}'
# =====================================================
