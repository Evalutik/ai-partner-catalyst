# Aeyes: Voice-Driven Browser Accessibility Extension

**AI Partner Catalyst Hackathon - ElevenLabs Challenge**

> A Chrome extension that helps blind and visually impaired users navigate the web through voice commands. User speaks their goal, the agent understands, acts, and confirms via speech.

---

## Table of Contents

1. [What is Aeyes?](#what-is-aeyes)
2. [How It Works](#how-it-works)
3. [System Architecture](#system-architecture)
4. [Repository Structure](#repository-structure)
5. [Technology Stack](#technology-stack)
6. [Implementation Plan](#implementation-plan)
7. [Demo Scenarios](#demo-scenarios)
8. [Setup](#setup)
9. [Resources](#resources)


---

## What is Aeyes?

**Aeyes** (pronounced "A.I. Eyes") enables blind users to browse the web using natural voice commands. User speaks their goal ("buy headphones on Amazon"), and the agent autonomously navigates across multiple pages until the goal is complete.

**Core Features:**
- **Natural language goals** — user states what they want, not how to do it
- **Multi-page navigation** — agent handles page transitions automatically
- **Persistent Side Panel** — stays open during navigation for continuous conversation
- **Audio feedback** — confirms progress via high-quality ElevenLabs voice
- **Real-time visualization** — audio level bars show the microphone is active

**Hackathon Requirements Met:**

| Requirement | Solution |
|-------------|----------|
| Voice-driven | Web Speech API (STT) + ElevenLabs TTS (voice output) |
| Google Cloud + Gemini | Gemini 2.0 Flash for intent understanding and action planning |
| ElevenLabs | TTS REST API for high-quality voice responses |

> [!IMPORTANT]
> No OpenAI/Whisper — hackathon rules require Google Cloud AI only.

---

## How It Works

The voice pipeline consists of four stages that work together to enable hands-free browsing:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        VOICE PIPELINE                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐ │
│  │ User speaks │──►│ Web Speech  │──►│   Gemini    │──►│ ElevenLabs  │ │
│  │   (mic)     │   │ API (STT)   │   │  (backend)  │   │  TTS API    │ │
│  └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘ │
│                                                                         │
│  Chrome native      Transcribes       Understands       Speaks back     │
│  in Side Panel      to text           intent, plans     with quality    │
│                                       actions           voice           │
└─────────────────────────────────────────────────────────────────────────┘
```

**Step-by-step flow:**

1. **User presses Alt+V** → Chrome Side Panel opens on the right side
2. **User speaks naturally:** "Find me the weather in Amsterdam"
3. **Web Speech API** (Chrome native) transcribes speech to text in real-time
4. **Backend** receives transcript, sends to Gemini → returns response + action plan
5. **Content script** executes actions on the page (click, type, scroll, navigate)
6. **ElevenLabs TTS** speaks confirmation: "It's 8 degrees and cloudy in Amsterdam"
7. **Loop continues** — user can give more commands, agent keeps listening

**Multi-Step Actions:**

Complex tasks require multiple DOM fetches across pages. The agent operates in a loop:

```
User: "Buy the cheapest Sony headphones on Amazon"
→ Fetch DOM → find search → type "Sony headphones" → submit
→ [Page navigates to results]
→ Fetch DOM → find sort dropdown → click "Price: Low to High"
→ [Page updates]
→ Fetch DOM → read first result → speak price
→ User: "Add to cart"
→ [continues until goal achieved]
```

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER'S BROWSER                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌──────────────────┐    ┌───────────────────────────┐  │
│  │   Hotkey    │───►│ Side Panel       │───►│ Web Speech API (STT)      │  │
│  │  (Alt+V)    │    │ (React, persists)│    │ Chrome native, continuous │  │
│  └─────────────┘    └────────┬─────────┘    └───────────────────────────┘  │
│                              │                                              │
│                              │ Panel stays open during navigation!          │
│                              ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        CONTENT SCRIPT                                 │  │
│  │    extractDOM()  ←→  executeAction(click, type, scroll, navigate)    │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTPS (localhost:8000 / Cloud Run)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND (FastAPI)                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  POST /conversation  ─► Gemini parses intent → returns response + actions  │
│  POST /speak         ─► ElevenLabs generates TTS audio stream              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Why Side Panel instead of Popup?**

Chrome popups close when the page navigates. For a blind user doing multi-step tasks like "search Google → click result → read content", the popup would close at each step, requiring them to reopen it. The Side Panel API keeps our UI open throughout the entire task, enabling true continuous conversation.

**Why Backend instead of calling APIs directly?**

| Reason | Explanation |
|--------|-------------|
| **API key security** | Gemini/ElevenLabs keys stay server-side, never exposed to browser |
| **CSP compliance** | Chrome extensions have strict content security policies |
| **Complex processing** | DOM analysis requires custom prompts and multi-turn conversation |
| **Hackathon requirement** | Must demonstrate Google Cloud usage |

---

## Repository Structure

```
ai-partner-catalyst/
├── ARCHITECTURE.md           # Project documentation
├── README.md                 # Quick start guide
├── .gitignore                # Prevents committing secrets
│
├── backend/                  # Python FastAPI Backend
│   ├── main.py               # Minimal entry point
│   ├── requirements.txt      # Python dependencies
│   ├── app/                  # Application Package
│   │   ├── __init__.py
│   │   ├── main.py           # FastAPI app factory
│   │   ├── config.py         # App configuration
│   │   ├── models.py         # Pydantic models
│   │   ├── api/              # API Endpoints
│   │   │   ├── conversation.py
│   │   │   ├── speech.py
│   │   │   └── elements.py
│   │   ├── core/             # Core Utilities
│   │   │   ├── logging.py
│   │   │   └── prompts.py
│   │   └── services/         # Business Logic
│   │       ├── conversation.py
│   │       ├── gemini.py
│   │       └── elevenlabs.py
│   ├── tests/                # Test Suite
│   │   ├── test_payload.py
│   │   └── ...
│   ├── .env.example          # Template
│   ├── .env                  # Secrets (gitignored)
│   └── service-account-key.json
│
├── extension/                # Chrome Extension (Manifest V3)
│   ├── public/
│   │   ├── manifest.json
│   │   ├── sidepanel.html
│   │   ├── permission.html
│   │   └── permission.js
│   ├── src/
│   │   ├── background/
│   │   │   └── index.ts      # Service worker
│   │   ├── content/
│   │   │   └── index.ts      # DOM extraction
│   │   └── sidepanel/
│   │       ├── index.tsx
│   │       ├── App.tsx
│   │       ├── VoiceAgent.tsx
│   │       ├── useSpeechRecognition.ts
│   │       ├── api.ts
│   │       └── index.css
│   ├── .env.example
│   ├── .env
│   ├── dist/
│   └── package.json
```

**Environment Files (Gitignored):**

> [!CAUTION]
> **Never commit these files!** They contain secrets.

| File | Purpose | How to Create |
|------|---------|---------------|
| `backend/.env` | ElevenLabs API key | Copy from `backend/.env.example` |
| `backend/service-account-key.json` | Google Cloud credentials | Download from GCP Console |
| `extension/.env` | Backend URL (optional) | Copy from `extension/.env.example` |

---

## Technology Stack

| Layer | Technology | Purpose | Docs |
|-------|-----------|---------|------|
| **UI** | [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) | Persistent voice interface that stays open during navigation | [API Reference](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) |
| **STT** | [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) | Chrome's native speech-to-text, no external API needed | [SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) |
| **TTS** | [ElevenLabs TTS API](https://elevenlabs.io/docs/api-reference/text-to-speech) | High-quality neural voice output | [Text-to-Speech](https://elevenlabs.io/docs/api-reference/text-to-speech) |
| **LLM** | [Gemini 2.0 Flash](https://ai.google.dev/gemini-api/docs) | Intent parsing, DOM analysis, action planning | [Quickstart](https://ai.google.dev/gemini-api/docs/quickstart) |
| **Backend** | [FastAPI](https://fastapi.tiangolo.com/) | Async Python API server | [Tutorial](https://fastapi.tiangolo.com/tutorial/) |
| **Extension** | Chrome Manifest V3 | Modern extension architecture | [MV3 Docs](https://developer.chrome.com/docs/extensions/mv3/) |
| **Build** | [Vite](https://vitejs.dev/) | Fast extension bundling | [Getting Started](https://vitejs.dev/guide/) |
| **Languages** | TypeScript, Python | Type-safe frontend, simple backend | |

---

## Implementation Plan

### Development Overview

We build Aeyes in layers: **Foundation → Intelligence → Integration → Polish**. 

First, we create the extension shell and voice pipeline — user can talk to the agent and hear responses. Then we add the "brain" — DOM extraction enables the agent to "see" pages, and Gemini integration lets it understand what to do. Finally, we wire everything together so voice commands actually control the browser. Each phase produces a testable milestone, so we always have something working to demo.

This incremental approach means we can submit even if we don't complete everything — Phase 1 alone is a functional voice assistant, Phase 2 adds page understanding, Phase 3 adds actions. The judges can see progress at each stage.

---

### Phase 1: Foundation ✓

*Goal: Get a working voice interface that can speak to users (but can't control the browser yet).*

---

**Step 1.1: Extension skeleton** ✓

We start by creating the Chrome extension structure. This gives us a container that Chrome can load and establishes the three-part architecture: background script (always running), content script (injected into pages), and Side Panel (UI). Without this foundation, nothing else can run.

| What | Details |
|------|---------|
| **Files** | [`extension/public/manifest.json`](extension/public/manifest.json), [`extension/src/background/index.ts`](extension/src/background/index.ts) |
| **Language** | TypeScript |
| **Tools** | [Vite](https://vitejs.dev/) for bundling, npm for packages |
| **Docs** | [Chrome MV3 Getting Started](https://developer.chrome.com/docs/extensions/mv3/getstarted/) |

**Tasks completed:**
- Created Manifest V3 with permissions: `activeTab`, `scripting`, `storage`, `sidePanel`
- Registered Alt+V hotkey in manifest `commands`
- Set up Vite for extension building with React
- Created background service worker that handles hotkey → opens Side Panel
- Created content script placeholder with message routing

**Why Vite?** Vite provides fast builds and hot module replacement. It bundles our React code into files Chrome can load, handling TypeScript compilation and CSS processing.

---

**Step 1.2: Voice Pipeline** ✓

This step creates the voice interface. User opens the Side Panel, speaks, and hears responses. We use Chrome's native Web Speech API for speech-to-text (no external API, no CSP issues) and ElevenLabs for high-quality text-to-speech via our backend.

| What | Details |
|------|---------|
| **Files** | [`extension/src/sidepanel/`](extension/src/sidepanel/), [`backend/main.py`](backend/main.py) |
| **Language** | TypeScript (React), Python (FastAPI) |
| **Packages** | No STT package needed (browser native), `elevenlabs` Python package |
| **Docs** | [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel), [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API), [ElevenLabs TTS](https://elevenlabs.io/docs/api-reference/text-to-speech) |

**Key files:**

| File | Purpose |
|------|---------|
| [`VoiceAgent.tsx`](extension/src/sidepanel/VoiceAgent.tsx) | Main voice UI: mic button, audio visualizer, transcript display |
| [`useSpeechRecognition.ts`](extension/src/sidepanel/useSpeechRecognition.ts) | Custom hook wrapping Web Speech API with continuous listening |
| [`api.ts`](extension/src/sidepanel/api.ts) | Functions to call backend: `sendToBackend()`, `getAudioUrl()`, `playAudio()` |
| [`App.tsx`](extension/src/sidepanel/App.tsx) | Container with scrollable message history |
| [`permission.html`](extension/public/permission.html) | Dedicated page for mic permission (Chrome extension quirk) |
| [`main.py`](backend/main.py) | FastAPI with `/conversation` and `/speak` endpoints |

**Why Web Speech API?** Chrome's native speech recognition has no CSP issues, works in the Side Panel, and provides continuous listening. It's free and requires no API key.

**Why dedicated permission page?** Chrome extensions can't request microphone permission directly from Side Panel — the browser needs a full page context. We open a tab, user grants permission "Always allow", and it applies to the entire extension.

- Created custom `useSpeechRecognition` hook with error handling
- Implemented audio level visualizer (12-bar frequency display)
- Auto-start listening when Side Panel opens
- Backend `/speak` endpoint calls ElevenLabs TTS, returns audio stream
- Backend `/conversation` endpoint (echo for testing, Gemini in Step 2)
- Scrollable message history in fixed-height panel
- Modern UI with Tailwind CSS: glassmorphism, gradient buttons, micro-animations

---

**Step 1.3: Backend setup** ✓

The backend hosts Gemini calls and ElevenLabs TTS. Running locally with echo responses for now — full Gemini integration comes in Step 2.2.

| What | Details |
|------|---------|
| **Files** | [`backend/main.py`](backend/main.py), [`backend/requirements.txt`](backend/requirements.txt) |
| **Language** | Python 3.10+ |
| **Framework** | [FastAPI](https://fastapi.tiangolo.com/) with async support |
| **Hosting** | Local (localhost:8000) now, Google Cloud Run for production |
| **Docs** | [FastAPI Tutorial](https://fastapi.tiangolo.com/tutorial/), [ElevenLabs Python](https://github.com/elevenlabs/elevenlabs-python) |

**Current endpoints:**

```python
POST /conversation  # Receives transcript, returns response (echo now, Gemini later)
POST /speak         # Text → ElevenLabs TTS → audio/mpeg stream
GET /health         # Health check
```

**Tasks completed:**
- FastAPI server with CORS for extension
- `/conversation` endpoint with simple test responses
- `/speak` endpoint integrating ElevenLabs TTS API
- Virtual environment setup with requirements.txt
- `.env.example` template for API keys

---

### Phase 2: Core Intelligence (Next)

*Goal: Give the agent the ability to understand pages and plan actions.*

---

**Step 2.1: DOM extraction**

The content script needs to "see" the page. We extract all interactive elements (buttons, links, inputs, headings) into a compact JSON format that Gemini can understand. This runs every time the agent needs to analyze a new page.

| What | Details |
|------|---------|
| **Files** | [`extension/src/content/index.ts`](extension/src/content/index.ts) |
| **Language** | TypeScript |
| **APIs** | DOM APIs (`querySelectorAll`, `getAttribute`), `chrome.runtime.sendMessage` |
| **Docs** | [Content Scripts](https://developer.chrome.com/docs/extensions/mv3/content_scripts/) |

**Tasks:**
- Extract interactive elements: buttons, links, inputs, selects, headings
- Include accessibility info: `aria-label`, `role`, `alt`, `placeholder`
- Assign unique IDs for action targeting
- Create compact JSON (limit ~50 elements for token efficiency)
- Test on Google, Wikipedia, Amazon

**Why compact format?** Gemini has token limits. We extract only actionable elements and key text, keeping DOM representation under ~2000 tokens.

---

**Step 2.2: Gemini integration (via Vertex AI)**

This is where the intelligence lives. We connect to Vertex AI with a service account and use Gemini 2.0 Flash to understand user intent, match to page elements, and plan action sequences.

| What | Details |
|------|---------|
| **Files** | [`backend/main.py`](backend/main.py) |
| **Language** | Python |
| **API** | [Vertex AI Generative AI](https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/gemini) |
| **Package** | `google-cloud-aiplatform` |
| **Auth** | Service account JSON file (add to `.gitignore`!) |

**Tasks:**
- Set up Vertex AI client with service account credentials
- Write intent parsing prompt: "search for weather" → `{action: "search", query: "weather"}`
- Write element matching prompt: intent + DOM → element ID to click/type
- Write action planning prompt: complex goal → sequence of actions
- Test with sample commands

**Why Gemini 2.0 Flash?** It's fast, cheap, and supports function calling. The hackathon requires Google Cloud AI.

---

**Step 2.3: Action execution**

Now the content script can actually do things. We implement functions to click elements, type text, scroll, and navigate.

| What | Details |
|------|---------|
| **Files** | [`extension/src/content/index.ts`](extension/src/content/index.ts) |
| **APIs** | DOM APIs: `click()`, `focus()`, `value`, `dispatchEvent` |

**Tasks:**
- `click(elementId)` — find element by our ID, trigger click event
- `type(elementId, text)` — focus input, set value, dispatch input/change events
- `scroll(direction)` — smooth scroll up/down/to element
- `navigate(url)` — `window.location.href` for same-origin, message for cross-origin
- Return success/failure with details

---

### Phase 3: Integration

*Goal: Connect all pieces so voice commands actually control the browser.*

---

**Step 3.1: End-to-end wiring**

This is where everything comes together. Voice input → backend → Gemini analysis → action plan → content script execution → result → voice output.

| What | Details |
|------|---------|
| **Files** | All components working together |
| **Flow** | Side Panel → Backend → Gemini → Content script → Page → Result → TTS |

**Tasks:**
- Side Panel sends transcript to backend
- Backend fetches current DOM from extension via message
- Backend sends DOM + transcript to Gemini
- Gemini returns action plan: `[{type: "click", id: "btn-5"}, ...]`
- Backend returns plan to extension
- Side Panel sends actions to content script via background
- Content script executes, returns result
- Side Panel sends result to backend for response generation
- Backend calls Gemini for confirmation text
- TTS speaks result

---

**Step 3.2: Error handling**

Real-world usage hits edge cases. We make the agent graceful.

**Tasks:**
- Element not found → Gemini suggests alternatives from DOM
- Ambiguous command → Agent asks for clarification
- Page still loading → Wait with exponential backoff
- Network error → Speak error, offer retry
- Action failed → Report and suggest alternatives

---

### Phase 4: Polish

*Goal: Make it demo-ready and submit.*

---

**Step 4.1: Demo preparation**

Test all scenarios, record backup video.

**Tasks:**
- Test Scenario 1: Google search (single page)
- Test Scenario 2: Form fill (multi-step on one page)
- Test Scenario 3: E-commerce (multi-page navigation)
- Record 3-minute backup video

---

**Step 4.2: Submission**

Package for judges.

**Tasks:**
- Clear README with installation instructions
- Demo video (YouTube/Vimeo, linked in README)
- Public GitHub repo with MIT/Apache license
- Ensure `.env.example` files are complete

---

## Demo Scenarios

### Scenario 1: Google Search (single page)
```
User: "What's the weather in Amsterdam?"
→ Agent finds search box, types query, submits
→ [Page navigates to results]
→ Agent reads weather card
Agent: "It's 8 degrees and cloudy in Amsterdam."
```

### Scenario 2: Form Fill (multi-field, conversational)
```
User: "Help me fill out this contact form"
→ Agent sees form fields
Agent: "I see Name, Email, and Message. What's your name?"
User: "John Smith"
→ Agent types name
Agent: "Got it. What's your email?"
User: "john@example.com"
→ Agent types email
Agent: "And what message would you like to send?"
User: "I'm interested in your services"
→ Agent types message
Agent: "All filled. Should I submit?"
User: "Yes"
→ Agent clicks submit
Agent: "Done. The page says 'Thank you for your message.'"
```

### Scenario 3: E-commerce (multi-page navigation)
```
User: "Find me the cheapest Sony headphones on Amazon"
→ [DOM #1: Amazon homepage] Agent finds search, types "Sony headphones"
→ [Page navigates to results]
→ [DOM #2: Results page] Agent finds sort dropdown, clicks "Price: Low to High"
→ [Page updates]
→ [DOM #3: Sorted results] Agent reads first result
Agent: "The cheapest are Sony MDR-ZX110 at $12. Want me to open it?"
User: "Yes"
→ [DOM #4: Product page]
Agent: "4.5 stars from 89,000 reviews. Add to cart?"
User: "Yes"
→ Agent clicks Add to Cart
Agent: "Done, added to your cart."
```

---

## Setup

> 📖 **See [README.md](./README.md) for developer setup instructions.**

---

## Resources

| Resource | Link |
|----------|------|
| Chrome Side Panel API | https://developer.chrome.com/docs/extensions/reference/api/sidePanel |
| Web Speech API | https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API |
| ElevenLabs TTS API | https://elevenlabs.io/docs/api-reference/text-to-speech |
| ElevenLabs API Keys | https://elevenlabs.io/app/settings/api-keys |
| Gemini API | https://ai.google.dev/gemini-api/docs |
| Chrome Extension MV3 | https://developer.chrome.com/docs/extensions/mv3/ |
| FastAPI | https://fastapi.tiangolo.com/ |
| Vite | https://vitejs.dev/ |

---

*Built for the AI Partner Catalyst Hackathon - ElevenLabs Challenge*
