# Aeyes - GCP Deployment Guide

This guide will help you deploy the Aeyes backend to Google Cloud Platform (GCP) using Cloud Run.

## Prerequisites

1. **Google Cloud Account** - [Create one here](https://cloud.google.com/free)
2. **gcloud CLI** - [Install instructions](https://cloud.google.com/sdk/docs/install)
3. **ElevenLabs API Key** - [Get it here](https://elevenlabs.io/)
4. **GCP Project** - Create a new project or use an existing one

## Quick Start

### Step 1: Install and Configure gcloud CLI

```bash
# Install gcloud CLI (if not already installed)
# macOS
brew install google-cloud-sdk

# Other platforms: https://cloud.google.com/sdk/docs/install

# Login to GCP
gcloud auth login

# Set your project (replace YOUR_PROJECT_ID)
gcloud config set project YOUR_PROJECT_ID
```

### Step 2: Run GCP Setup Script

This script will enable required APIs and create a service account:

```bash
cd backend
./setup-gcp.sh
```

This will:
- Enable Cloud Run, Cloud Build, Secret Manager, and Vertex AI APIs
- Create a service account for Vertex AI access
- Generate a `service-account-key.json` file
- Grant necessary permissions

### Step 3: Configure Environment Variables

Make sure your `.env` file exists and has your ElevenLabs API key:

```bash
cd backend
cp .env.example .env
# Edit .env and add your ELEVENLABS_API_KEY
```

### Step 4: Deploy to Cloud Run

```bash
cd backend
./deploy.sh
```

You'll be prompted to choose:
1. **Quick deploy** - Uses environment variables (less secure, easier for testing)
2. **Secret Manager** - Stores secrets securely (recommended for production)

For production, choose option 2.

The script will:
- Build a Docker container from your code
- Push it to Google Cloud Container Registry
- Deploy to Cloud Run
- Output your backend URL

### Step 5: Update Extension Configuration

After deployment, you'll get a URL like `https://aeyes-backend-xxx.run.app`

Update your extension to use this URL:

```bash
cd extension
# Edit .env file
echo "VITE_API_URL=https://aeyes-backend-xxx.run.app" > .env

# Rebuild the extension
npm run build
```

### Step 6: Test Deployment

```bash
# Test health endpoint
curl https://aeyes-backend-xxx.run.app/health

# Expected response: {"status":"ok"}
```

## Deployment Options Explained

### Option 1: Quick Deploy (Development)

Pros:
- Fast and simple
- Good for testing

Cons:
- Environment variables visible in Cloud Run console
- Less secure for production

Usage:
```bash
./deploy.sh
# Choose option 1
```

### Option 2: Secret Manager (Production)

Pros:
- Secrets encrypted and managed securely
- Best practice for production
- Secrets can be rotated without redeploying

Cons:
- Slightly more complex setup
- Small additional cost for Secret Manager

Usage:
```bash
./deploy.sh
# Choose option 2
# Enter your ElevenLabs API key when prompted
```

## Manual Deployment (Advanced)

If you prefer to deploy manually:

```bash
cd backend

# Build and deploy
gcloud run deploy aeyes-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars ELEVENLABS_API_KEY=your_key_here
```

## Troubleshooting

### "gcloud: command not found"
Install the gcloud CLI: https://cloud.google.com/sdk/docs/install

### "Permission denied" errors
Make sure scripts are executable:
```bash
chmod +x backend/setup-gcp.sh
chmod +x backend/deploy.sh
```

### "API not enabled" errors
Run the setup script again:
```bash
./setup-gcp.sh
```

### Extension can't connect to backend
1. Check that your backend URL is correct in `extension/.env`
2. Verify CORS is enabled (it should be by default)
3. Check Cloud Run logs:
```bash
gcloud run logs read aeyes-backend --region us-central1
```

### Vertex AI authentication errors
1. Verify `service-account-key.json` exists in backend folder
2. Check that it's uploaded to Secret Manager (if using option 2)
3. Verify service account has `aiplatform.user` role

## Cost Estimates

Cloud Run pricing (as of 2025):
- **Free tier**: 2 million requests/month
- **After free tier**: ~$0.40 per million requests
- **Typical usage**: For personal use, likely stays in free tier

For this app with moderate usage (100 requests/day):
- Monthly cost: **$0 (free tier)**

## Updating Your Deployment

To deploy updates:

```bash
cd backend
./deploy.sh
```

Cloud Run will:
- Build a new container
- Deploy with zero downtime
- Keep previous versions (can rollback if needed)

## Rollback

If something goes wrong:

```bash
# List revisions
gcloud run revisions list --service aeyes-backend --region us-central1

# Rollback to previous revision
gcloud run services update-traffic aeyes-backend \
  --to-revisions REVISION_NAME=100 \
  --region us-central1
```

## Monitoring

View logs:
```bash
gcloud run logs read aeyes-backend --region us-central1 --limit 50
```

View metrics in GCP Console:
https://console.cloud.google.com/run

## Security Best Practices

1. **Use Secret Manager** for production (deployment option 2)
2. **Rotate API keys** regularly
3. **Monitor usage** in GCP Console
4. **Enable authentication** if needed:
   ```bash
   gcloud run services update aeyes-backend \
     --no-allow-unauthenticated \
     --region us-central1
   ```

## Next Steps

1. Test your deployed backend thoroughly
2. Consider setting up:
   - Custom domain name
   - SSL certificate (automatic with Cloud Run)
   - CI/CD pipeline for automated deployments
   - Monitoring and alerting

## Support

- GCP Cloud Run docs: https://cloud.google.com/run/docs
- Vertex AI docs: https://cloud.google.com/vertex-ai/docs
- ElevenLabs docs: https://elevenlabs.io/docs

## Files Created

- `backend/Dockerfile` - Container configuration
- `backend/.dockerignore` - Files to exclude from container
- `backend/setup-gcp.sh` - GCP project setup script
- `backend/deploy.sh` - Deployment automation script
- `DEPLOYMENT.md` - This guide
