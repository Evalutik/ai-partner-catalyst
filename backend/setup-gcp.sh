#!/bin/bash

# GCP Project Setup Script for Aeyes

set -e

echo "=== Aeyes - GCP Project Setup ==="
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "Error: gcloud CLI is not installed."
    echo "Install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

echo "This script will:"
echo "  1. Enable required GCP APIs"
echo "  2. Create a service account for Vertex AI"
echo "  3. Grant necessary permissions"
echo "  4. Generate service account key"
echo ""

read -p "Continue? [y/N]: " CONFIRM
if [[ ! $CONFIRM =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

# Get or set project ID
PROJECT_ID=$(gcloud config get-value project)
if [ -z "$PROJECT_ID" ]; then
    read -p "Enter your GCP Project ID: " PROJECT_ID
    gcloud config set project $PROJECT_ID
fi

echo ""
echo "Using project: $PROJECT_ID"
echo ""

# Enable required APIs
echo "Step 1: Enabling required APIs..."
gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    secretmanager.googleapis.com \
    aiplatform.googleapis.com \
    containerregistry.googleapis.com

echo "APIs enabled successfully!"
echo ""

# Create service account
SERVICE_ACCOUNT_NAME="aeyes-backend"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "Step 2: Creating service account..."
if gcloud iam service-accounts describe $SERVICE_ACCOUNT_EMAIL &> /dev/null; then
    echo "Service account already exists: $SERVICE_ACCOUNT_EMAIL"
else
    gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
        --display-name="Aeyes Backend Service Account" \
        --description="Service account for Aeyes backend to access Vertex AI"
    echo "Service account created: $SERVICE_ACCOUNT_EMAIL"
fi
echo ""

# Grant permissions
echo "Step 3: Granting permissions..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="roles/aiplatform.user" \
    --condition=None

echo "Permissions granted!"
echo ""

# Generate key
echo "Step 4: Generating service account key..."
KEY_FILE="service-account-key.json"

if [ -f $KEY_FILE ]; then
    read -p "Key file already exists. Overwrite? [y/N]: " OVERWRITE
    if [[ ! $OVERWRITE =~ ^[Yy]$ ]]; then
        echo "Keeping existing key file."
    else
        gcloud iam service-accounts keys create $KEY_FILE \
            --iam-account=$SERVICE_ACCOUNT_EMAIL
        echo "New key generated: $KEY_FILE"
    fi
else
    gcloud iam service-accounts keys create $KEY_FILE \
        --iam-account=$SERVICE_ACCOUNT_EMAIL
    echo "Key generated: $KEY_FILE"
fi
echo ""

echo "=== Setup Complete! ==="
echo ""
echo "Summary:"
echo "  Project ID: $PROJECT_ID"
echo "  Service Account: $SERVICE_ACCOUNT_EMAIL"
echo "  Key File: $KEY_FILE"
echo ""
echo "Next steps:"
echo "  1. Make sure your .env file has ELEVENLABS_API_KEY set"
echo "  2. Run './deploy.sh' to deploy to Cloud Run"
echo ""
