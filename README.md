# Aeyes - Voice Browser Assistant

> Voice-controlled browser extension for visually impaired users. Speak your goal, the AI acts.

**AI Partner Catalyst Hackathon - ElevenLabs Challenge**

---

## Quick Start

### 1. Get API Keys First

You need **two things** before starting:

#### A. ElevenLabs API Key (for voice)
1. Go to https://elevenlabs.io/app/settings/api-keys
2. Create an API key
3. Copy it somewhere safe

#### B. Google Cloud Service Account (for AI brain)
1. Go to https://console.cloud.google.com/
2. Create or select a project
3. Search "Vertex AI API" and **Enable** it
4. Go to **IAM & Admin > Service Accounts**
5. Click **Create Service Account**
6. Name it anything (e.g., "aeyes-backend")
7. Grant role: **Vertex AI User**
8. Click the service account > **Keys** > **Add Key** > **Create new key** > **JSON**
9. Download the file and rename it to `service-account-key.json`

---

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
.\venv\Scripts\activate          # Windows
# source venv/bin/activate       # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Setup environment
cp .env.example .env
```

**Now edit `backend/.env`:**
```env
ELEVENLABS_API_KEY=sk_your_actual_key_here
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
```

**Place your `service-account-key.json` in the `backend/` folder.**

**Start the server:**
```bash
python main.py
```

You should see:
```
[Aeyes] Loaded project ID from service account: your-project-id
[Aeyes] Vertex AI initialized in us-central1
```

---

### 3. Extension Setup

```bash
cd extension
npm install

# Setup environment (optional - defaults work)
cp .env.example .env

npm run build
```

---

### 4. Load in Chrome

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select `extension/dist`
4. Press **Alt+V** to open Aeyes

---

## File Structure

```
ai-partner-catalyst/
├── backend/
│   ├── .env                      # YOUR secrets
│   ├── .env.example              # Template
│   ├── service-account-key.json  # YOUR GCP key
│   ├── main.py                   # Entry point
│   └── app/                      # App logic
├── extension/
│   ├── .env                      # Optional config
│   ├── .env.example              # Template
│   └── dist/                     # Load this in Chrome
└── README.md
```

---

## Security

> ⚠️ **Never commit secrets!** These files are gitignored:

| File | Contains |
|------|----------|
| `backend/.env` | ElevenLabs API key |
| `backend/service-account-key.json` | Google Cloud credentials |

---

## Troubleshooting

**"Gemini not configured"**
- Check that `service-account-key.json` is in `backend/` folder
- Check that Vertex AI API is enabled in Google Cloud

**"ELEVENLABS_API_KEY not configured"**
- Make sure you copied `.env.example` to `.env`
- Make sure you added your actual API key

**Extension not loading**
- Make sure you ran `npm run build` in the extension folder
- Load the `extension/dist` folder, not `extension/`

---

## Docs

📖 **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Full technical documentation

---

MIT License
