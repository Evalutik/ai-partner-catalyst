
import requests
import json
import uuid

def test_conversation():
    url = "http://localhost:8000/conversation"
    
    # Complex payload simulating the one that failed
    payload = {
        "transcript": "Open Google for me",
        "context": {
            "url": "https://www.google.com/search?q=test",
            "title": "Test Page",
            "elements": [],
            "message": "Some debug message"
        },
        "page_context": {
            "url": "https://www.google.com/search?q=test",
            "title": "Test Page",
            "width": 1920,
            "height": 1080,
            "tabId": 123
        },
        "conversation_id": str(uuid.uuid4())
    }
    
    try:
        print(f"Sending payload to {url}...")
        response = requests.post(url, json=payload)
        print(f"Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print("Response JSON keys:", data.keys())
            if "response" in data:
                print("Success: Backend processed payload.")
                print("Agent says:", data["response"])
            else:
                print("Warning: unexpected response structure")
        else:
            print("Error response:", response.text)
            
    except Exception as e:
        print("Request failed:", e)

if __name__ == "__main__":
    test_conversation()
