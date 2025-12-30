#!/bin/bash

# Deployment script for Aeyes backend to Google Cloud Run

set -e

echo "=== Aeyes Backend - GCP Cloud Run Deployment ==="
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "Error: gcloud CLI is not installed."
    echo "Install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Get project ID
PROJECT_ID=$(gcloud config get-value project)
if [ -z "$PROJECT_ID" ]; then
    echo "Error: No GCP project set."
    echo "Set your project with: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo "Project ID: $PROJECT_ID"
echo ""

# Configuration
SERVICE_NAME="aeyes-backend"
REGION="us-central1"

# Prompt for deployment type
echo "Choose deployment option:"
echo "1) Quick deploy (with environment variables - less secure)"
echo "2) Deploy with Secret Manager (recommended for production)"
read -p "Enter choice [1 or 2]: " DEPLOY_CHOICE

if [ "$DEPLOY_CHOICE" == "1" ]; then
    echo ""
    echo "--- Quick Deploy Mode ---"

    # Check if .env exists
    if [ ! -f .env ]; then
        echo "Error: .env file not found. Please create it from .env.example"
        exit 1
    fi

    # Load .env file
    source .env

    if [ -z "$ELEVENLABS_API_KEY" ]; then
        echo "Error: ELEVENLABS_API_KEY not found in .env"
        exit 1
    fi

    echo "Deploying to Cloud Run..."
    gcloud run deploy $SERVICE_NAME \
        --source . \
        --platform managed \
        --region $REGION \
        --allow-unauthenticated \
        --set-env-vars ELEVENLABS_API_KEY=$ELEVENLABS_API_KEY \
        --set-env-vars GOOGLE_APPLICATION_CREDENTIALS=/app/service-account-key.json

elif [ "$DEPLOY_CHOICE" == "2" ]; then
    echo ""
    echo "--- Secret Manager Deploy Mode ---"

    # Enable required APIs
    echo "Enabling required GCP services..."
    gcloud services enable \
        run.googleapis.com \
        cloudbuild.googleapis.com \
        secretmanager.googleapis.com \
        aiplatform.googleapis.com

    echo ""
    read -p "Enter your ElevenLabs API key: " ELEVENLABS_KEY

    # Create secrets
    echo "Creating secrets in Secret Manager..."

    # Check if secret exists, create or update
    if gcloud secrets describe elevenlabs-api-key --project=$PROJECT_ID &> /dev/null; then
        echo "Updating existing elevenlabs-api-key secret..."
        echo -n "$ELEVENLABS_KEY" | gcloud secrets versions add elevenlabs-api-key --data-file=-
    else
        echo "Creating elevenlabs-api-key secret..."
        echo -n "$ELEVENLABS_KEY" | gcloud secrets create elevenlabs-api-key --data-file=-
    fi

    # Create service account key secret if file exists
    if [ -f service-account-key.json ]; then
        if gcloud secrets describe vertex-ai-credentials --project=$PROJECT_ID &> /dev/null; then
            echo "Updating existing vertex-ai-credentials secret..."
            gcloud secrets versions add vertex-ai-credentials --data-file=service-account-key.json
        else
            echo "Creating vertex-ai-credentials secret..."
            gcloud secrets create vertex-ai-credentials --data-file=service-account-key.json
        fi
    else
        echo "Warning: service-account-key.json not found. Vertex AI may not work."
    fi

    echo ""
    echo "Deploying to Cloud Run with secrets..."
    gcloud run deploy $SERVICE_NAME \
        --source . \
        --platform managed \
        --region $REGION \
        --allow-unauthenticated \
        --update-secrets ELEVENLABS_API_KEY=elevenlabs-api-key:latest \
        --update-secrets GOOGLE_APPLICATION_CREDENTIALS=vertex-ai-credentials:latest
else
    echo "Invalid choice. Exiting."
    exit 1
fi

echo ""
echo "=== Deployment Complete! ==="
echo ""

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)')
echo "Your backend is deployed at: $SERVICE_URL"
echo ""
echo "Next steps:"
echo "1. Test your backend: curl $SERVICE_URL/health"
echo "2. Update extension/.env with: VITE_API_URL=$SERVICE_URL"
echo "3. Rebuild your extension: cd ../extension && npm run build"
echo ""
