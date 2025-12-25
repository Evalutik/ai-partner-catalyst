# Aeyes - Voice Browser Assistant

> Voice-controlled browser extension for visually impaired users. Speak your goal, the AI agent acts.

**AI Partner Catalyst Hackathon - ElevenLabs Challenge**

## Features

- 🎤 **Voice Control** — Speak naturally to browse the web
- 🔊 **High-Quality Voice** — ElevenLabs TTS for clear audio feedback
- 📌 **Persistent Side Panel** — Stays open during navigation
- 🧠 **AI-Powered** — Gemini understands intent and plans actions
- ✨ **Modern UI** — Glassmorphism design with smooth animations

---

## Developer Setup

### Prerequisites

| Tool | Version | Download |
|------|---------|----------|
| Node.js | 18+ | https://nodejs.org/ |
| Python | 3.10+ | https://python.org/ |
| Chrome | Latest | https://google.com/chrome |
| Git | Latest | https://git-scm.com/ |

### 1. Clone the Repository

```bash
git clone https://github.com/Evalutik/ai-partner-catalyst.git
cd ai-partner-catalyst
```

---

### 2. Backend Setup

The backend handles AI processing (Gemini) and voice synthesis (ElevenLabs). It runs on localhost:8000.

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
.\venv\Scripts\activate       # Windows (PowerShell)
# source venv/bin/activate    # Mac/Linux

# Install dependencies
pip install -r requirements.txt
```

**Create `.env` file** (copy from example):
```bash
# backend/.env
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
```

> **Get your ElevenLabs API key:**  
> 1. Sign up at https://elevenlabs.io/ (free tier available)
> 2. Go to https://elevenlabs.io/app/settings/api-keys
> 3. Create new key → Copy it

**Start the backend:**
```bash
python main.py
# Backend runs at http://localhost:8000
# Keep this terminal open!
```

---

### 3. Extension Setup

The extension is the Chrome Side Panel that handles voice input and displays responses.

```bash
cd extension

# Install dependencies
npm install

# Build for production
npm run build

# Or watch mode for development (auto-rebuild on changes)
npm run dev
```

The build output goes to `extension/dist/` — this is what you load in Chrome.

---

### 4. Load Extension in Chrome

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `extension/dist` folder
5. Pin the extension for easy access

---

### 5. Test It Works

1. Make sure backend is running (`python main.py`)
2. Press **Alt+V** → Side Panel opens
3. Click **Grant Permission** → Allow microphone
4. Say "Hello" → Agent responds with voice!
5. Navigate to any page → Panel stays open

---

## Project Structure

```
ai-partner-catalyst/
├── extension/               # Chrome Extension
│   ├── src/
│   │   ├── sidepanel/       # Voice UI (React + Tailwind)
│   │   ├── background/      # Opens Side Panel on Alt+V
│   │   └── content/         # DOM extraction (Step 2)
│   ├── public/              # Static files (manifest, HTML)
│   └── dist/                # Build output → Load this in Chrome
│
├── backend/                 # Python FastAPI server
│   ├── main.py              # API endpoints
│   ├── requirements.txt     # Python packages
│   └── venv/                # Virtual environment (not committed)
│
└── ARCHITECTURE.md          # Detailed implementation plan
```

---

## Security: Protecting API Keys

> [!CAUTION]
> **Never commit `.env` files or API keys to Git!**

**Safe files (committed):**
- `.env.example` — Template showing what keys are needed
- `.gitignore` — Configured to exclude secrets

**Secret files (NOT committed):**
- `backend/.env` — Contains `ELEVENLABS_API_KEY`
- `extension/.env` — Not needed (no secrets in frontend)
- `backend/venv/` — Virtual environment

**How we protect secrets:**
1. `.gitignore` excludes all `.env` files
2. API keys stay in backend, never exposed to browser
3. `.env.example` shows structure without real values

**If you accidentally commit secrets:**
1. Immediately revoke/regenerate the API key
2. Use `git filter-branch` or BFG to remove from history
3. Force push the cleaned history

---

## Development Workflow

### Making Changes

1. **Frontend (extension):**
   ```bash
   cd extension
   npm run dev   # Watch mode - auto-rebuilds
   ```
   After changes, click the refresh icon on the extension in `chrome://extensions`

2. **Backend:**
   ```bash
   cd backend
   python main.py  # Restart to pick up changes
   ```

### Useful Commands

| Command | Location | Purpose |
|---------|----------|---------|
| `npm run build` | extension/ | Production build |
| `npm run dev` | extension/ | Watch mode |
| `python main.py` | backend/ | Start server |
| `pip freeze > requirements.txt` | backend/ | Update deps |

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| UI | Chrome Side Panel + React + Tailwind CSS |
| STT | Web Speech API (Chrome native) |
| TTS | ElevenLabs REST API |
| LLM | Gemini 2.0 Flash (Step 2) |
| Backend | FastAPI (Python) |

---

## Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Full technical docs and implementation plan
- **[ElevenLabs Docs](https://elevenlabs.io/docs)** — TTS API reference
- **[Chrome Extensions](https://developer.chrome.com/docs/extensions/)** — MV3 documentation

---

## License

MIT
