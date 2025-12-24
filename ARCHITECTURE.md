# Aeyes: Voice-Driven Browser Accessibility Extension

**AI Partner Catalyst Hackathon - ElevenLabs Challenge**

> A Chrome extension that helps blind and visually impaired users navigate the web entirely through voice commands.

---

### Naming Note

**Primary Name: Aeyes** (pronounced "A.I. Eyes") — AI that sees for you.

**Alternatives:** Auralis, Echovue, Voxis, VoiceSight

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Hackathon Alignment](#hackathon-alignment)
3. [System Architecture](#system-architecture)
4. [Repository Structure](#repository-structure)
5. [Technology Stack](#technology-stack)
6. [Implementation Plan](#implementation-plan)
7. [Demo Scenarios](#demo-scenarios)

---

## Executive Summary

**Aeyes** enables blind users to browse the web using natural voice commands. User speaks their goal ("buy headphones on Amazon"), and the agent autonomously navigates across multiple pages, fetching DOM and executing actions until the goal is complete.

**Core features:**
- **Natural language goals** — user states what they want, not how to do it
- **Multi-page navigation** — agent handles page transitions, fetches new DOM each time
- **Iterative action loop** — keeps acting until goal achieved or asks for clarification
- **Conversational memory** — remembers context across pages and actions
- **Audio feedback** — confirms progress and completion via speech

---

## Hackathon Alignment

### ElevenLabs Challenge ✅

| Requirement | Our Solution |
|-------------|--------------|
| Conversational + voice-driven | ElevenLabs Conversational AI Agent |
| Google Cloud Vertex AI / Gemini | Backend calls Gemini 2.0 Flash for DOM analysis |
| React SDK or server-side calls | Both: React SDK for voice, Cloud Run for Gemini |

### Required Technologies

- **ElevenLabs:** Conversational AI Agent (voice in/out)
- **Google Cloud:** Gemini 2.0 Flash via Vertex AI, Cloud Run for backend

> [!IMPORTANT]
> No OpenAI/Whisper — hackathon rules require Google Cloud AI only.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER'S BROWSER                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌──────────────────┐    ┌───────────────────────────┐  │
│  │   Hotkey    │───►│ Extension Popup  │◄──►│ ElevenLabs Agent (WebRTC) │  │
│  │  (Alt+V)    │    │  (React + SDK)   │    │  Voice In/Out + Tools     │  │
│  └─────────────┘    └────────┬─────────┘    └───────────────────────────┘  │
│                              │                                              │
│                              │ chrome.runtime.sendMessage                   │
│                              ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        CONTENT SCRIPT                                 │  │
│  │    extractDOM()  ←→  executeAction(click, type, scroll, navigate)    │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTPS (tool webhook)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GOOGLE CLOUD                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                    CLOUD RUN (Backend API)                          │    │
│  │                                                                      │    │
│  │  POST /analyze    ─► Gemini parses DOM + user intent → action plan  │    │
│  │  POST /execute    ─► Gemini plans multi-step sequences              │    │
│  │                                                                      │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                              │                                              │
│                              ▼                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                 VERTEX AI (Gemini 2.0 Flash)                        │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User presses Alt+V** → popup opens, ElevenLabs session starts
2. **User speaks naturally:** "Find me the weather in Amsterdam"
3. **ElevenLabs Agent** understands intent, calls `analyze_page` tool
4. **Backend** receives DOM, Gemini figures out: need to find search box, type query, submit
5. **Gemini** returns action plan: `[{type, "search", "weather amsterdam"}, {click, "submit"}]`
6. **Extension** executes the sequence automatically
7. **Agent speaks:** "Here you go — it's 8 degrees and cloudy in Amsterdam"

### Multi-Step Actions (Iterative Loop)

Complex tasks require multiple DOM fetches and actions. The agent operates in a loop:

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENT ACTION LOOP                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌──────────────┐                                          │
│   │ Fetch DOM    │◄─────────────────────────────────┐       │
│   └──────┬───────┘                                  │       │
│          │                                          │       │
│          ▼                                          │       │
│   ┌──────────────┐                                  │       │
│   │ Analyze +    │  "Page changed, need new DOM"    │       │
│   │ Plan Action  │──────────────────────────────────┤       │
│   └──────┬───────┘                                  │       │
│          │                                          │       │
│          ▼                                          │       │
│   ┌──────────────┐     ┌──────────────┐             │       │
│   │ Execute      │────►│ Page Changes │─────────────┘       │
│   │ Action       │     │ (navigation, │                     │
│   └──────────────┘     │  new content)│                     │
│                        └──────────────┘                     │
│                                                             │
│   Loop continues until goal is achieved or agent asks user  │
└─────────────────────────────────────────────────────────────┘
```

**Example: "Buy the cheapest Sony headphones on Amazon"**
1. Fetch DOM → find search box → type "Sony headphones" → submit
2. *Page navigates to results*
3. Fetch new DOM → find sort dropdown → click "Price: Low to High"
4. *Page updates*
5. Fetch new DOM → find first result → click it
6. *Product page loads*
7. Fetch new DOM → find "Add to Cart" → click it
8. Agent: "Done — added Sony headphones for $89 to your cart"

### Why Backend?

| Reason | Explanation |
|--------|-------------|
| **API key security** | Gemini/Vertex AI keys stay server-side |
| **Complex prompts** | Custom prompt engineering for DOM analysis |
| **Hackathon requirement** | Must use Google Cloud services |

---

## Repository Structure

```
ai-partner-catalyst/
├── ARCHITECTURE.md           # This file
├── README.md                 # User-facing project overview
│
├── extension/                # Chrome Extension (Manifest V3)
│   ├── public/
│   │   └── manifest.json     # Extension config
│   └── src/
│       ├── background/       # Service worker: hotkey, message routing
│       ├── content/          # DOM extraction + action execution
│       └── popup/            # React UI + ElevenLabs SDK
│
├── backend/                  # Cloud Run API (Python/FastAPI)
│   └── (Gemini integration, prompt templates)
│
└── shared/                   # Shared types (if needed)
```

### Component Responsibilities

| Component | Purpose |
|-----------|---------|
| `extension/background` | Listen for Alt+V, route messages between popup ↔ content, handle page navigation events |
| `extension/content` | Extract DOM on demand (called multiple times as pages change), execute browser actions |
| `extension/popup` | ElevenLabs voice interface, orchestrate action loop, request new DOM after page changes |
| `backend/` | Gemini API calls, maintain conversation state, plan multi-step sequences across pages |

---

## Technology Stack

| Layer | Technology | Purpose | Docs |
|-------|-----------|---------|------|
| **Voice** | ElevenLabs Conversational AI | STT + TTS + conversation memory | [Docs](https://elevenlabs.io/docs/conversational-ai) |
| **Voice SDK** | @elevenlabs/react | React hooks for voice | [npm](https://www.npmjs.com/package/@elevenlabs/react) \| [GitHub](https://github.com/elevenlabs/elevenlabs-js) |
| **LLM** | Gemini 2.0 Flash | Intent parsing, DOM analysis | [Vertex AI Docs](https://cloud.google.com/vertex-ai/docs/generative-ai/start/quickstarts) |
| **Backend** | FastAPI + Cloud Run | API hosting | [FastAPI](https://fastapi.tiangolo.com/) \| [Cloud Run](https://cloud.google.com/run/docs/quickstarts) |
| **Extension** | Chrome Manifest V3 | Browser integration | [MV3 Docs](https://developer.chrome.com/docs/extensions/mv3/) |
| **Build** | Vite | Extension bundling | [Vite Docs](https://vitejs.dev/guide/) |
| **Languages** | TypeScript, Python | Extension, Backend | |

### ElevenLabs Conversational AI Agent

**Docs:** https://elevenlabs.io/docs/conversational-ai

Handles the full voice loop:
- **STT:** Transcribes user speech (built-in, no separate API needed)
- **Conversation state:** Remembers context ("go back" = previous page)
- **Tool calls:** Triggers our backend when user gives commands
- **TTS:** Speaks responses with natural voice

### Gemini 2.0 Flash (Vertex AI)

**Docs:** https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/gemini

Used for:
1. **Intent parsing:** "find weather" → `{intent: "search", query: "weather"}`
2. **Element matching:** Find which DOM element matches user's description
3. **Action planning:** Complex commands → sequence of actions

---

## Implementation Plan

### Development Flow Summary

We build in layers: **Foundation → Intelligence → Integration → Polish**. First, we create the extension shell and get voice working (user can talk to the agent). Then we add the "brain" — DOM extraction and Gemini analysis. Finally, we wire everything together so the agent can actually control the browser. Each phase produces a testable milestone, so we always have something working to demo.

---

### Phase 1: Foundation

*Goal: Get a working extension that can have voice conversations (but can't do anything yet).*

**Step 1.1: Extension skeleton**

We start by creating the Chrome extension structure. This gives us a container that Chrome can load, and establishes the three-part architecture: background script (always running), content script (injected into pages), and popup (UI). Without this foundation, nothing else can run.

| What | Details |
|------|---------|
| **Files** | `extension/public/manifest.json`, `extension/src/background/index.ts` |
| **Language** | TypeScript |
| **Tools** | Vite, npm |
| **Docs** | [Chrome MV3 Getting Started](https://developer.chrome.com/docs/extensions/mv3/getstarted/) |

Tasks:
- Create Manifest V3 structure with permissions: `activeTab`, `scripting`, `storage`
- Register Alt+V hotkey in manifest `commands`
- Set up Vite for extension building
- Create empty React popup in `extension/src/popup/`

---

**Step 1.2: ElevenLabs Agent**

Now we add the voice interface. The ElevenLabs Agent handles speech-to-text, conversation flow, and text-to-speech — all in one package. After this step, users can talk to the agent and get responses, proving the voice pipeline works. This is the core of the ElevenLabs hackathon requirement.

| What | Details |
|------|---------|
| **Files** | `extension/src/popup/VoiceAgent.tsx` |
| **Language** | TypeScript (React) |
| **Package** | `@elevenlabs/react` |
| **Docs** | [ElevenLabs React SDK](https://elevenlabs.io/docs/conversational-ai/libraries/react) |

Tasks:
- Create ElevenLabs account, get API key
- Create Conversational AI Agent in [ElevenLabs dashboard](https://elevenlabs.io/app/conversational-ai)
- Configure system prompt for accessibility assistant
- Install SDK: `npm install @elevenlabs/react`
- Use `useConversation` hook in VoiceAgent.tsx
- Test: speak "hello" → agent responds

---

**Step 1.3: Backend setup**

We set up the backend that will host Gemini. Even though Gemini isn't connected yet, having the backend deployed means we can start testing the extension→backend→extension round trip. This also satisfies the Google Cloud requirement.

| What | Details |
|------|---------|
| **Files** | `backend/main.py` |
| **Language** | Python |
| **Framework** | FastAPI |
| **Hosting** | Google Cloud Run |
| **Docs** | [FastAPI](https://fastapi.tiangolo.com/) \| [Cloud Run Quickstart](https://cloud.google.com/run/docs/quickstarts/build-and-deploy/python) |

Tasks:
- Create FastAPI app with `/analyze` endpoint
- Set up Vertex AI client for Gemini: `pip install google-cloud-aiplatform`
- Write Dockerfile
- Deploy: `gcloud run deploy`
- Test API call from extension

---

### Phase 2: Core Intelligence

*Goal: Give the agent the ability to understand pages and plan actions (but not execute them yet).*

**Step 2.1: DOM extraction**

The content script needs to "see" the page. We extract all interactive elements into a compact JSON format that Gemini can understand. This runs every time the agent needs to analyze a new page, supporting our multi-page navigation loop.

| What | Details |
|------|---------|
| **Files** | `extension/src/content/index.ts` |
| **Language** | TypeScript |
| **APIs** | DOM APIs, `chrome.runtime.sendMessage` |
| **Docs** | [Content Scripts](https://developer.chrome.com/docs/extensions/mv3/content_scripts/) |

Tasks:
- Extract all interactive elements: buttons, links, inputs, headings
- Include accessibility info: `aria-label`, `role`, `alt`
- Create compact JSON format (limit to ~50 elements for large pages)
- Test on Google, Wikipedia, Amazon

---

**Step 2.2: Gemini prompts**

This is where the intelligence lives. We craft prompts that let Gemini understand what the user wants, match it to elements on the page, and plan a sequence of actions. Good prompts are critical — they determine whether the agent feels smart or dumb.

| What | Details |
|------|---------|
| **Files** | `backend/prompts/` (or inline in main.py) |
| **Language** | Python |
| **API** | Vertex AI Gemini |
| **Docs** | [Gemini API Reference](https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/gemini) |

Tasks:
- Write intent parsing prompt (natural language → structured intent)
- Write element matching prompt (intent + DOM → element ID)
- Write action planning prompt (complex goal → action sequence)
- Test with sample commands

---

**Step 2.3: Action execution**

Now the content script can actually do things. We implement click, type, scroll, and navigate functions. After this step, we can manually send action commands and watch the browser respond — proving the execution layer works.

| What | Details |
|------|---------|
| **Files** | `extension/src/content/index.ts` |
| **Language** | TypeScript |
| **APIs** | DOM APIs (click, focus, value, dispatchEvent) |

Tasks:
- Implement `click(elementId)` — find element, trigger click
- Implement `type(elementId, text)` — focus, set value, dispatch input event
- Implement `scroll(direction)` — smooth scroll
- Implement `navigate(url)` — window.location
- Return success/failure with details

---

### Phase 3: Integration

*Goal: Connect all the pieces so voice commands actually control the browser.*

**Step 3.1: Wire it together**

This is where everything comes together. We connect ElevenLabs tools to our backend, which fetches DOM, calls Gemini, returns actions, and the extension executes them. After this step, we have a working end-to-end product — user speaks, browser acts.

| What | Details |
|------|---------|
| **Files** | `extension/src/popup/VoiceAgent.tsx`, `backend/main.py` |
| **Flow** | ElevenLabs → Backend webhook → Gemini → Content script → Result → Speech |

Tasks:
- Define ElevenLabs tool schemas in dashboard (server-side tools)
- Backend receives tool call, fetches DOM from extension, calls Gemini
- Return action plan to extension for execution
- Return result to ElevenLabs for confirmation speech

---

**Step 3.2: Error handling**

Real-world usage will hit edge cases. We make the agent graceful — it should explain problems and offer alternatives instead of just failing silently. This makes the difference between a demo that works and a product that's usable.

Tasks:
- Element not found → Gemini suggests similar elements
- Ambiguous commands → Agent asks for clarification
- Page still loading → Wait and retry
- Network error → Speak error, offer retry

---

### Phase 4: Polish

*Goal: Make it demo-ready and submit.*

**Step 4.1: Demo prep**

We rehearse the demo scenarios and fix any edge cases we find. Record a backup video so we have something to show even if the live demo fails.

Tasks:
- Test Scenario 1: Google search
- Test Scenario 2: Form fill
- Test Scenario 3: E-commerce navigation
- Record backup video in case live demo fails

**Step 4.2: Submission**

Package everything for the judges. They need to be able to install and test the extension themselves.

Tasks:
- 3-minute demo video (YouTube/Vimeo)
- README with installation instructions
- Public GitHub repo with open source license

---

## Demo Scenarios

### Scenario 1: Google Search (single page)
```
User: "What's the weather in Amsterdam?"
→ [DOM fetch #1] Agent finds search box, types query, submits
→ [Page navigates to results]
→ [DOM fetch #2] Agent reads weather card
Agent: "It's 8 degrees and cloudy in Amsterdam right now."
```

### Scenario 2: Form Fill (single page, multi-step)
```
User: "Help me fill out this contact form"
→ [DOM fetch #1] Agent sees form fields
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
→ [DOM fetch #2] New page shows confirmation
Agent: "Done. The page says 'Thank you for your message.'"
```

### Scenario 3: E-commerce (multi-page navigation)
```
User: "Find me the cheapest Sony headphones on Amazon"
→ [DOM fetch #1: Amazon homepage] Agent finds search, types "Sony headphones"
→ [Page navigates to results]
→ [DOM fetch #2: Results page] Agent finds sort dropdown, clicks "Price: Low to High"
→ [Page updates]
→ [DOM fetch #3: Sorted results] Agent reads first result
Agent: "The cheapest are Sony MDR-ZX110 at $12. Want me to open it?"
User: "Yes"
→ [DOM fetch #4: Product page]
Agent: "4.5 stars from 89,000 reviews. Basic on-ear headphones. Add to cart?"
User: "Yes"
→ Agent clicks Add to Cart
Agent: "Done, added to your cart."
```

---

## Resources

| Resource | Link |
|----------|------|
| ElevenLabs Conversational AI | https://elevenlabs.io/docs/conversational-ai |
| ElevenLabs React SDK | https://github.com/elevenlabs/elevenlabs-js |
| Vertex AI Gemini | https://cloud.google.com/vertex-ai/docs/generative-ai |
| Chrome Extension MV3 | https://developer.chrome.com/docs/extensions/mv3/ |
| FastAPI | https://fastapi.tiangolo.com/ |
| Cloud Run | https://cloud.google.com/run/docs |
| Vite | https://vitejs.dev/ |

---

*Last updated: December 24, 2024*
