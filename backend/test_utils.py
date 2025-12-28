import requests
import json
import uuid
import time
import sys

BASE_URL = "http://localhost:8000/conversation"

def run_test(name, transcript, context=None, page_context=None):
    print(f"\n--- Running Test: {name} ---")
    print(f"User says: '{transcript}'")
    
    payload = {
        "transcript": transcript,
        "context": context or {},
        "page_context": page_context or {},
        "conversation_id": str(uuid.uuid4())
    }
    
    try:
        start_time = time.time()
        print(f"Sending request to {BASE_URL}...")
        response = requests.post(BASE_URL, json=payload)
        duration = time.time() - start_time
        
        if response.status_code == 200:
            data = response.json()
            print(f"Success ({duration:.2f}s)")
            print(f"Agent Response: {data.get('response')}")
            
            actions = data.get('actions', [])
            if actions:
                print("Actions:")
                for i, action in enumerate(actions):
                    print(f"  {i+1}. {action['type']}: {action.get('value') or action.get('url') or action.get('description', 'No details')}")
                    if action.get('args'):
                        print(f"     Args: {action['args']}")
            else:
                print("No actions returned.")
                
            return data
        else:
            print(f"Failed. Status: {response.status_code}")
            print(f"Error: {response.text}")
            return None
            
    except requests.exceptions.ConnectionError:
        print("Error: Could not connect to the server. Is it running on port 8000?")
        return None
    except Exception as e:
        print(f"Exception: {e}")
        return None
