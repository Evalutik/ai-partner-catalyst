# Aeyes - Voice Browser Assistant

> Voice-controlled browser extension for visually impaired users. Speak your goal, the AI agent acts.

**AI Partner Catalyst Hackathon - ElevenLabs Challenge**

## Features

- 🎤 **Voice Control** — Speak naturally to browse the web
- 🔊 **High-Quality Voice** — ElevenLabs TTS for clear audio feedback
- 📌 **Persistent Side Panel** — Stays open during navigation
- 🧠 **AI-Powered** — Gemini understands intent and plans actions

## Quick Start

### 1. Backend Setup

```bash
cd backend
python -m venv venv
.\venv\Scripts\pip install -r requirements.txt   # Windows
# source venv/bin/pip install -r requirements.txt  # Mac/Linux

# Get ElevenLabs API key from: https://elevenlabs.io/app/settings/api-keys
echo ELEVENLABS_API_KEY=your_key_here > .env

.\venv\Scripts\python main.py  # Backend runs at localhost:8000
```

### 2. Extension Setup

```bash
cd extension
npm install
npm run build
```

### 3. Load in Chrome

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `extension/dist`

### 4. Use

1. Press **Alt+V** → Side Panel opens
2. Grant microphone permission
3. Say "Hello" → Agent responds!

## Documentation

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full technical documentation including:
- System architecture diagrams
- Repository structure
- Implementation plan
- Demo scenarios

## Tech Stack

| Component | Technology |
|-----------|------------|
| UI | Chrome Side Panel API |
| STT | Web Speech API (Chrome native) |
| TTS | ElevenLabs REST API |
| LLM | Gemini 2.0 Flash |
| Backend | FastAPI (Python) |
| Extension | Manifest V3 + React + Vite |

## License

MIT
