# Aeyes - Voice Browser Assistant

> Voice-controlled browser extension for visually impaired users. Speak your goal, the AI acts.

**AI Partner Catalyst Hackathon - ElevenLabs Challenge**

---

## Quick Start

### 1. Backend

```bash
cd backend
python -m venv venv
.\venv\Scripts\activate          # Windows
# source venv/bin/activate       # Mac/Linux

pip install -r requirements.txt

# Create .env with your API key (get from https://elevenlabs.io/app/settings/api-keys)
echo ELEVENLABS_API_KEY=your_key > .env

python main.py                   # Runs at localhost:8000
```

### 2. Extension

```bash
cd extension
npm install
npm run build
```

### 3. Load in Chrome

1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `extension/dist`
4. Press **Alt+V** to open

---

## Security

> ⚠️ **Never commit `.env` files!** They contain API keys.

- `backend/.env` → Your `ELEVENLABS_API_KEY` (gitignored)
- `.env.example` → Template only (safe to commit)

---

## Docs

📖 **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Full technical documentation, implementation plan, and system design.

---

MIT License
