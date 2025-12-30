
import requests
import sys

try:
    response = requests.post(
        "http://localhost:8000/speak",
        json={"text": "test"},
        timeout=10
    )
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
