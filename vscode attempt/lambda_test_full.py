# =====================================================
# FULL TEST LAMBDA CODE WITH ALL AI FEATURES
# =====================================================
# Purpose: Complete test including PDF extraction + AI Q&A
# Instructions: Copy this code into dfj-docs-test Lambda
# Test with: Test event (see examples at bottom)
# =====================================================

import json
import boto3
import time
import io
from datetime import datetime, timedelta

# Initialize AWS clients
s3_client = boto3.client('s3', region_name='eu-north-1')
dynamodb = boto3.resource('dynamodb', region_name='eu-north-1')
bedrock_client = boto3.client('bedrock-runtime', region_name='us-east-1')

# Configuration
DYNAMODB_TABLE = 'dfj-pdf-text-cache-test'
S3_BUCKET = 'dfj-docs-test'  # TEST bucket (not prod)

# DynamoDB table reference
text_cache_table = dynamodb.Table(DYNAMODB_TABLE)


def extract_pdf_text(bucket: str, key: str) -> dict:
    """
    Extract text from PDF using PyMuPDF (fitz).
    
    Returns:
        {
            'text': str,
            'page_count': int,
            'file_size': int
        }
    """
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
    """
    Get cached text from DynamoDB or extract if not cached.
    
    Returns:
        (text: str, was_cached: bool)
    """
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
    """
    Send question + document to AWS Bedrock (Claude 3.5 Haiku).
    
    Args:
        document_text: Extracted PDF text
        question: Customer's question
        context: Optional metadata (document name, etc.)
    
    Returns:
        AI-generated answer
    """
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


def lambda_handler(event, context):
    """
    Test handler with multiple test modes.
    
    Test Modes:
    1. test_bedrock: Simple Bedrock connection test
    2. test_pdf_extraction: Test PDF extraction + caching
    3. test_ai_qa: Full AI Q&A with document
    """
    
    print("=== AI Chatbot Test Lambda ===")
    print(f"Event: {json.dumps(event, indent=2)}")
    
    # Determine test mode
    test_mode = event.get('test_mode', 'test_bedrock')
    
    # ============================================
    # Mode 1: Simple Bedrock Connection Test
    # ============================================
    if test_mode == 'test_bedrock':
        try:
            print("🧪 Running Bedrock connection test...")
            
            body = json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 100,
                "messages": [
                    {
                        "role": "user",
                        "content": "Say 'Bedrock is working!' in Danish"
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
            
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'test_mode': 'test_bedrock',
                    'status': 'SUCCESS',
                    'ai_response': answer,
                    'response_time_seconds': round(elapsed_time, 2),
                    'message': '✅ Bedrock connection working!'
                }, indent=2)
            }
            
        except Exception as e:
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'test_mode': 'test_bedrock',
                    'status': 'FAILED',
                    'error': str(e)
                }, indent=2)
            }
    
    # ============================================
    # Mode 2: PDF Extraction + Caching Test
    # ============================================
    elif test_mode == 'test_pdf_extraction':
        try:
            s3_key = event.get('s3_key')
            if not s3_key:
                return {
                    'statusCode': 400,
                    'body': json.dumps({
                        'error': 'Missing s3_key parameter',
                        'example': {'test_mode': 'test_pdf_extraction', 's3_key': 'dk/customer-documents/test.pdf'}
                    })
                }
            
            print(f"🧪 Testing PDF extraction for: {s3_key}")
            
            text, was_cached = get_cached_text(s3_key)
            
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'test_mode': 'test_pdf_extraction',
                    'status': 'SUCCESS',
                    's3_key': s3_key,
                    'text_length': len(text),
                    'text_preview': text[:500] + '...' if len(text) > 500 else text,
                    'was_cached': was_cached,
                    'message': f'✅ {"Cache hit" if was_cached else "Extracted and cached"}'
                }, indent=2)
            }
            
        except Exception as e:
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'test_mode': 'test_pdf_extraction',
                    'status': 'FAILED',
                    'error': str(e)
                }, indent=2)
            }
    
    # ============================================
    # Mode 3: Full AI Q&A Test
    # ============================================
    elif test_mode == 'test_ai_qa':
        try:
            s3_key = event.get('s3_key')
            question = event.get('question')
            
            if not s3_key or not question:
                return {
                    'statusCode': 400,
                    'body': json.dumps({
                        'error': 'Missing s3_key or question parameter',
                        'example': {
                            'test_mode': 'test_ai_qa',
                            's3_key': 'dk/customer-documents/test.pdf',
                            'question': 'What is this document about?'
                        }
                    })
                }
            
            print(f"🧪 Testing full AI Q&A...")
            
            # Get document text (cached or extract)
            document_text, was_cached = get_cached_text(s3_key)
            
            # Ask AI
            context = {
                'name': s3_key.split('/')[-1]
            }
            answer = ask_ai_about_document(document_text, question, context)
            
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'test_mode': 'test_ai_qa',
                    'status': 'SUCCESS',
                    's3_key': s3_key,
                    'question': question,
                    'answer': answer,
                    'text_was_cached': was_cached,
                    'message': '✅ Full AI Q&A working!'
                }, indent=2)
            }
            
        except Exception as e:
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'test_mode': 'test_ai_qa',
                    'status': 'FAILED',
                    'error': str(e)
                }, indent=2)
            }
    
    # ============================================
    # Unknown Test Mode
    # ============================================
    else:
        return {
            'statusCode': 400,
            'body': json.dumps({
                'error': 'Invalid test_mode',
                'valid_modes': ['test_bedrock', 'test_pdf_extraction', 'test_ai_qa'],
                'examples': {
                    'test_bedrock': {},
                    'test_pdf_extraction': {'test_mode': 'test_pdf_extraction', 's3_key': 'dk/customer-documents/test.pdf'},
                    'test_ai_qa': {'test_mode': 'test_ai_qa', 's3_key': 'dk/customer-documents/test.pdf', 'question': 'What is this about?'}
                }
            }, indent=2)
        }


# =====================================================
# TEST EVENTS - Use these in Lambda console
# =====================================================

# Test 1: Simple Bedrock Connection
# {
#   "test_mode": "test_bedrock"
# }

# Test 2: PDF Extraction (replace with real S3 key)
# {
#   "test_mode": "test_pdf_extraction",
#   "s3_key": "dk/customer-documents/J-0055362/sample.pdf"
# }

# Test 3: Full AI Q&A (replace with real S3 key)
# {
#   "test_mode": "test_ai_qa",
#   "s3_key": "dk/customer-documents/J-0055362/sample.pdf",
#   "question": "What is this document about?"
# }
