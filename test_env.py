
import os
import sys
from dotenv import load_dotenv

# Replicate config.py logic
backend_dir = os.path.join(os.getcwd(), 'backend')
env_path = os.path.join(backend_dir, '.env')

print(f"Checking for .env at: {env_path}")
print(f"File exists: {os.path.exists(env_path)}")

if os.path.exists(env_path):
    load_dotenv(env_path, override=True)
    key = os.getenv("ELEVENLABS_API_KEY")
    if key:
        print(f"Found ELEVENLABS_API_KEY: {key[:4]}...{key[-4:]} (length: {len(key)})")
    else:
        print("ELEVENLABS_API_KEY not found in .env (or environment)")
else:
    print(".env file not found!")

# Also check other variables
print(f"GOOGLE_APPLICATION_CREDENTIALS: {os.getenv('GOOGLE_APPLICATION_CREDENTIALS')}")
