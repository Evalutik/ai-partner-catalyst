"""
Configuration module for Aeyes Backend
Handles environment loading, credentials, and settings.
"""
import os
import json as json_lib
from dotenv import load_dotenv

# Load environment variables
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
load_dotenv(env_path)

# Google Cloud Credentials
GOOGLE_CREDENTIALS_PATH = os.getenv(
    "GOOGLE_APPLICATION_CREDENTIALS",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "service-account-key.json")
)
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")

# Auto-extract project ID from service account JSON
PROJECT_ID = None
try:
    with open(GOOGLE_CREDENTIALS_PATH, 'r') as f:
        sa_data = json_lib.load(f)
        PROJECT_ID = sa_data.get('project_id')
        print(f"[Aeyes] Loaded project ID from service account: {PROJECT_ID}")
except Exception as e:
    print(f"[Aeyes] Warning: Could not read project ID from service account: {e}")

# Set credentials environment variable for Google libraries
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = GOOGLE_CREDENTIALS_PATH


def get_elevenlabs_api_key() -> str | None:
    """Get ElevenLabs API key from environment."""
    return os.getenv("ELEVENLABS_API_KEY")
