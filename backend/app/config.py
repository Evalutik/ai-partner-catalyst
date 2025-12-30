"""
Configuration module for Aeyes Backend
Handles environment loading, credentials, and settings.
"""
import os
import json as json_lib
from dotenv import load_dotenv

# Load environment variables
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
print(f"[Aeyes] Loading environment from: {env_path}")
load_dotenv(env_path, override=True)

# Google Cloud Credentials
GOOGLE_CREDENTIALS_PATH = os.getenv(
    "GOOGLE_APPLICATION_CREDENTIALS",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "service-account-key.json")
)
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")

# Auto-extract project ID from service account JSON or environment
PROJECT_ID = os.getenv("GCP_PROJECT")
if not PROJECT_ID:
    try:
        with open(GOOGLE_CREDENTIALS_PATH, 'r') as f:
            sa_data = json_lib.load(f)
            PROJECT_ID = sa_data.get('project_id')
            print(f"[Aeyes] Loaded project ID from service account: {PROJECT_ID}")
    except Exception as e:
        print(f"[Aeyes] Warning: Could not read project ID from service account: {e}")
else:
    print(f"[Aeyes] Using project ID from environment: {PROJECT_ID}")

# Set credentials environment variable for Google libraries only if file exists
if os.path.exists(GOOGLE_CREDENTIALS_PATH):
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = GOOGLE_CREDENTIALS_PATH
    print(f"[Aeyes] Using credentials file: {GOOGLE_CREDENTIALS_PATH}")
else:
    print("[Aeyes] No credentials file found - using environment default (Cloud Run service account)")


def get_elevenlabs_api_key() -> str | None:
    """Get ElevenLabs API key from environment."""
    return os.getenv("ELEVENLABS_API_KEY")
