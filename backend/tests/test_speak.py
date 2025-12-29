import requests
import json

try:
    response = requests.post(
        "http://localhost:8000/speak",
        json={"text": "This is a test speech."},
        stream=True
    )
    print(f"Status Code: {response.status_code}")
    if response.status_code != 200:
        print(f"Response: {response.text}")
    else:
        print("Success: Audio stream received")
except Exception as e:
    print(f"Request failed: {e}")
