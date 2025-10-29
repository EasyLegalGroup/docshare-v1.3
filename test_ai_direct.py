"""
Direct test of AI functionality to diagnose the error.
Run this to see the exact error message from Bedrock.
"""

import json
import boto3

# Your configuration (from Lambda env vars)
BEDROCK_MODEL_ID = "us.anthropic.claude-3-5-haiku-20241022-v1:0"
BEDROCK_REGION = "us-east-1"

# Sample document text (short for testing)
SAMPLE_TEXT = """
Testament

Dette testamente er oprettet af Mathias Tønder og Nicole Tønder.

Paragraph 2.5: Ved arveladers død tilfalder hele arven den længstlevende ægtefælle.
Børnene arver først ved begge forældres død.

Oprettet: 15. oktober 2025
"""

SAMPLE_QUESTION = "hvad betyder paragraph 2.5?"

def test_bedrock():
    print("=" * 60)
    print("Testing Bedrock AI Invocation")
    print("=" * 60)
    
    try:
        # Initialize Bedrock client
        print(f"\n1. Initializing Bedrock client (region: {BEDROCK_REGION})...")
        bedrock = boto3.client('bedrock-runtime', region_name=BEDROCK_REGION)
        print("   ✅ Client initialized")
        
        # Build prompt
        print(f"\n2. Building prompt...")
        system_prompt = """You are a helpful legal document assistant for Din Familiejurist.
Answer questions about documents clearly and accurately in Danish."""
        
        user_prompt = f"""Document content:
{SAMPLE_TEXT}

Customer question: {SAMPLE_QUESTION}

Please answer the question based on the document content above."""
        
        print(f"   ✅ Prompt ready ({len(user_prompt)} chars)")
        
        # Build request body
        print(f"\n3. Building Bedrock request...")
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1000,
            "temperature": 0.3,
            "system": system_prompt,
            "messages": [
                {
                    "role": "user",
                    "content": user_prompt
                }
            ]
        })
        print(f"   ✅ Request body ready")
        
        # Invoke model
        print(f"\n4. Invoking Bedrock model: {BEDROCK_MODEL_ID}")
        print(f"   (This may take 3-10 seconds...)")
        
        response = bedrock.invoke_model(
            modelId=BEDROCK_MODEL_ID,
            body=body
        )
        
        print(f"   ✅ Model invoked successfully!")
        
        # Parse response
        print(f"\n5. Parsing response...")
        result = json.loads(response['body'].read())
        answer = result['content'][0]['text']
        
        print(f"   ✅ Response parsed")
        
        # Display results
        print("\n" + "=" * 60)
        print("SUCCESS! AI Response:")
        print("=" * 60)
        print(answer)
        print("=" * 60)
        
        return True
        
    except Exception as e:
        print("\n" + "=" * 60)
        print("❌ ERROR!")
        print("=" * 60)
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        print("\nFull error details:")
        import traceback
        traceback.print_exc()
        print("=" * 60)
        
        # Diagnose common issues
        print("\n📋 Diagnosis:")
        error_str = str(e).lower()
        
        if "accessdenied" in error_str or "unauthorized" in error_str:
            print("❌ IAM PERMISSION ISSUE")
            print("   The Lambda role needs bedrock:InvokeModel permission.")
            print("   Add this policy to dfj-docs-test-role-g7ecihsi:")
            print("""
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["bedrock:InvokeModel"],
       "Resource": "arn:aws:bedrock:*::foundation-model/*"
     }]
   }
            """)
        
        elif "notfound" in error_str or "does not exist" in error_str:
            print("❌ MODEL ID ISSUE")
            print(f"   Model ID '{BEDROCK_MODEL_ID}' not found.")
            print("   Check if the model is available in your region.")
        
        elif "throttl" in error_str or "rate" in error_str:
            print("❌ RATE LIMIT")
            print("   Bedrock is throttling requests. Wait and retry.")
        
        elif "validation" in error_str:
            print("❌ VALIDATION ERROR")
            print("   Request format is invalid. Check API version/parameters.")
        
        else:
            print("❓ UNKNOWN ERROR")
            print("   Check the error details above for clues.")
        
        return False

if __name__ == "__main__":
    test_bedrock()
