# =====================================================
# TEST LAMBDA CODE FOR BEDROCK CONNECTION
# =====================================================
# Purpose: Verify AWS Bedrock + DynamoDB access works
# Instructions: Copy this code into dfj-docs-test Lambda
# Test with: Empty test event {} or use Lambda console
# =====================================================

import json
import boto3
import time
from datetime import datetime

def lambda_handler(event, context):
    """
    Test Bedrock connection and basic functionality.
    
    This is a simple test to verify:
    1. Bedrock client can be created
    2. AI model is accessible
    3. Response is received correctly
    """
    
    print("=== Starting Bedrock Connection Test ===")
    
    # Test 1: Create Bedrock client
    try:
        bedrock = boto3.client('bedrock-runtime', region_name='us-east-1')
        print("✅ Bedrock client created successfully")
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Failed to create Bedrock client',
                'details': str(e)
            })
        }
    
    # Test 2: Invoke Claude 3.5 Haiku
    try:
        print("🤖 Calling Claude 3.5 Haiku...")
        
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
        
        response = bedrock.invoke_model(
            modelId='us.anthropic.claude-3-5-haiku-20241022-v1:0',
            body=body
        )
        
        elapsed_time = time.time() - start_time
        
        # Parse response
        result = json.loads(response['body'].read())
        answer = result['content'][0]['text']
        
        print(f"✅ AI responded in {elapsed_time:.2f}s")
        print(f"📝 Answer: {answer}")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'status': 'SUCCESS',
                'message': '✅ Bedrock connection working!',
                'ai_response': answer,
                'response_time_seconds': round(elapsed_time, 2),
                'model': 'claude-3-5-haiku',
                'timestamp': datetime.utcnow().isoformat()
            }, indent=2)
        }
        
    except Exception as e:
        error_message = str(e)
        print(f"❌ Bedrock invocation failed: {error_message}")
        
        # Check for common errors
        if 'AccessDeniedException' in error_message:
            hint = "IAM permissions missing. Check BedrockInvokePolicy is attached."
        elif 'ValidationException' in error_message:
            hint = "Model ID may be incorrect or model not available in us-east-1."
        elif 'ThrottlingException' in error_message:
            hint = "Rate limit exceeded. Wait a moment and try again."
        else:
            hint = "Check CloudWatch logs for details."
        
        return {
            'statusCode': 500,
            'body': json.dumps({
                'status': 'FAILED',
                'error': 'Bedrock invocation failed',
                'details': error_message,
                'hint': hint,
                'timestamp': datetime.utcnow().isoformat()
            }, indent=2)
        }


# =====================================================
# EXPECTED OUTPUT (Success):
# =====================================================
# {
#   "statusCode": 200,
#   "body": {
#     "status": "SUCCESS",
#     "message": "✅ Bedrock connection working!",
#     "ai_response": "Bedrock virker!",
#     "response_time_seconds": 1.23,
#     "model": "claude-3-5-haiku",
#     "timestamp": "2025-10-26T10:30:00.000000"
#   }
# }
# =====================================================
