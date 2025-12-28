"""
Aeyes Backend - FastAPI server with Gemini + ElevenLabs TTS
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import os
import json as json_lib
from dotenv import load_dotenv

# Load environment variables
env_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(env_path)

# Initialize Vertex AI with service account
import vertexai
from vertexai.generative_models import GenerativeModel

# Get credentials path - look in backend/ folder by default
GOOGLE_CREDENTIALS_PATH = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", 
    os.path.join(os.path.dirname(__file__), "service-account-key.json"))
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")

# Auto-extract project ID from service account JSON (no need for separate env var)
PROJECT_ID = None
try:
    with open(GOOGLE_CREDENTIALS_PATH, 'r') as f:
        sa_data = json_lib.load(f)
        PROJECT_ID = sa_data.get('project_id')
        print(f"[Aeyes] Loaded project ID from service account: {PROJECT_ID}")
except Exception as e:
    print(f"[Aeyes] Warning: Could not read project ID from service account: {e}")

try:
    # Set credentials environment variable
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = GOOGLE_CREDENTIALS_PATH
    
    # Initialize Vertex AI
    if PROJECT_ID:
        vertexai.init(project=PROJECT_ID, location=LOCATION)
        gemini_model = GenerativeModel("gemini-2.0-flash-001")
        print(f"[Aeyes] Vertex AI initialized in {LOCATION}")
    else:
        print("[Aeyes] No project ID found - Gemini disabled")
        gemini_model = None
except Exception as e:
    print(f"[Aeyes] Failed to initialize Vertex AI: {e}")
    gemini_model = None

# System prompt for Aeyes agent
# System prompt for Aeyes agent
SYSTEM_PROMPT = """You are Aeyes, a smart voice assistant for visually impaired users.

CRITICAL PROTOCOL:
1. RESPONSE FORMAT: You MUST return ONLY valid JSON.
2. SINGLE MUTATIVE ACTION: You may output AT MOST ONE action that changes state (click, type, navigate, open_tab, etc.) per turn.
   - AFTER a mutative action, you MUST stop and wait for the result.
   - Do NOT chain multiple clicks or navigations.
   - EXCEPTION: You may chain `wait` or perception tools (scan_page, get_page_status) if needed, but usually 1 action is best.
3. ZOOM-IN STRATEGY (Minimizing Guesses):
   - When landing on a NEW PAGE (or when context.url changes):
     - DO NOT immediately guess selectors like `#search` or `.btn`.
     - FIRST, use `scan_page` to understand the structure.
     - THEN, use `fetch_dom` with a specific `selector` based on what you saw.
   - If an element is missing, use `fetch_dom` with a broader selector rather than guessing blindly.

TOOLS (Perception):
- `scan_page(max_depth: int = 2)`: Returns high-level structure (headers, sections, nav). Use on new pages.
- `get_page_status()`: Returns URL, title, scroll position, loading state. fast.
- `fetch_dom(selector: str = "", limit: int = 50, optimize: bool = True)`: Returns interactive elements.
  - Use `selector` to focus (e.g. "header", "#search-results"). PREFER THIS over full page extraction.

TOOLS (Actions - "The Hands"):
- `click(elementId: str)`: Clicks an element. Returns {success, navigationOccurred}.
- `type(elementId: str, value: str, submit: bool = True)`: Types text.
- `scroll(direction: str, target: str = None)`: direction="up"|"down"|"top"|"bottom". target=elementId.
- `navigate(url: str)`: Goes to a URL in CURRENT tab.
- `go_back()`: Browser back.
- `reload()`: Reload page.

TOOLS (Tabs):
- `open_tab(url: str)`: Opens NEW tab and focuses it.
- `close_tab(tabId: int = None)`: Closes tab (default current).
- `switch_tab(tabId: int)`: Switches focus.

TOOLS (Communication):
- `say(text: str)`: Speak to user.
- `ask(text: str)`: Speak and wait for reply.
- `notify_plan(plan: str)`: Updates the "Plan" display in the Side Panel (Visual only).
- `wait(duration: int)`: Pause in ms.

JSON OUTPUT FORMAT:
{
  "response": "Brief spoken response to user (optional if acting)",
  "actions": [
    { "type": "tool_name", "args": { ...arguments... } }
  ],
  "requiresFollowUp": boolean // Set TRUE if you need to see the result of this action to continue.
}

EXAMPLE (Search for cats):
User: "Search for cats"
{
  "response": "Searching for cats...",
  "actions": [
    { "type": "type", "args": { "elementId": "el-12", "value": "cats", "submit": true } }
  ],
  "requiresFollowUp": true
}

EXAMPLE (New Page Landed):
(Context shows new URL)
{
  "response": "I'm looking at the page structure.",
  "actions": [
    { "type": "scan_page", "args": { "max_depth": 2 } }
  ],
  "requiresFollowUp": true
}

REMEMBER:
- If you need to find something, use `scan_page` -> `fetch_dom`.
- NO BLIND GUESSING.
- MAX 1 STATE CHANGE PER TURN.
"""

app = FastAPI(title="Aeyes Backend")

# CORS for extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory conversation history
conversation_history = {}

class PageContext(BaseModel):
    url: str
    title: str
    width: int
    height: int
    tabId: int | None = None

class ConversationRequest(BaseModel):
    transcript: str
    context: dict | None = None  # DOM snapshot (legacy/full)
    page_context: PageContext | None = None  # Lightweight context
    conversation_id: str | None = None

class Action(BaseModel):
    type: str
    args: dict = {}

class ConversationResponse(BaseModel):
    response: str
    actions: list[Action] | None = None
    requiresFollowUp: bool = False
    conversation_id: str | None = None

class SpeakRequest(BaseModel):
    text: str

@app.get("/health")
async def health():
    return {"status": "ok", "gemini": gemini_model is not None}

@app.post("/conversation", response_model=ConversationResponse)
async def conversation(request: ConversationRequest):
    """
    Process user transcript with Gemini, return response + actions.
    """
    import uuid
    import time

    user_text = request.transcript.strip()

    if not user_text:
        return ConversationResponse(
            response="I didn't catch that. Could you repeat?",
            actions=None
        )

    # If Gemini not configured, fall back to echo mode
    if not gemini_model:
        return ConversationResponse(
            response=f"Gemini not configured. You said: {user_text}",
            actions=None
        )

    # Get or create conversation ID
    conversation_id = request.conversation_id or str(uuid.uuid4())

    # Get conversation history
    history = conversation_history.get(conversation_id, [])

    # Add user message to history
    history.append({
        "role": "user",
        "content": user_text,
        "timestamp": time.time()
    })

    try:
        # Build the prompt with context and history
        history_text = ""
        if len(history) > 1:
            recent_history = history[-6:]
            history_text = "\n\nRecent conversation:\n"
            for msg in recent_history[:-1]:
                role = "User" if msg["role"] == "user" else "Aeyes"
                history_text += f"{role}: {msg['content']}\n"

        # Context construction
        context_str = ""
        if request.page_context:
            context_str += f"\nPAGE CONTEXT:\nURL: {request.page_context.url}\nTitle: {request.page_context.title}\nSize: {request.page_context.width}x{request.page_context.height}\nTabID: {request.page_context.tabId}\n"
        
        if request.context:
            # If full DOM is provided (e.g. from fetch_dom result)
            context_str += f"\nDOM ELEMENTS/DATA:\n{json_lib.dumps(request.context, indent=2)}\n"

        prompt = f"""User request: "{user_text}"
{history_text}
{context_str}

Analyze the request and context. Respond with JSON based on the System Protocol."""

        # Build full prompt with system instructions
        full_prompt = SYSTEM_PROMPT + "\n\n" + prompt
        
        # Call Vertex AI
        import time
        from vertexai.generative_models import GenerationConfig, SafetySetting, HarmCategory
        
        safety_settings = [
            SafetySetting(
                category=HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold=SafetySetting.HarmBlockThreshold.BLOCK_ONLY_HIGH,
            ),
            SafetySetting(
                category=HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                threshold=SafetySetting.HarmBlockThreshold.BLOCK_ONLY_HIGH,
            ),
            SafetySetting(
                category=HarmCategory.HARM_CATEGORY_HARASSMENT,
                threshold=SafetySetting.HarmBlockThreshold.BLOCK_ONLY_HIGH,
            ),
            SafetySetting(
                category=HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                threshold=SafetySetting.HarmBlockThreshold.BLOCK_ONLY_HIGH,
            ),
        ]

        response = gemini_model.generate_content(
            full_prompt,
            generation_config=GenerationConfig(
                temperature=0.3, 
                max_output_tokens=1024,
                response_mime_type="application/json"
            ),
            safety_settings=safety_settings
        )
        
        response_text = response.text.strip()
        print(f"\n[AEYES DEBUG] Gemini Response:\n{response_text}\n")

        # Parse JSON
        try:
            parsed = json_lib.loads(response_text)
        except json_lib.JSONDecodeError:
            # Fallback cleanup
            cleaned = response_text.replace("```json", "").replace("```", "").strip()
            parsed = json_lib.loads(cleaned)

        assistant_response = parsed.get("response", "I'm on it.")
        raw_actions = parsed.get("actions", [])
        requires_follow_up = parsed.get("requiresFollowUp", False)

        # Normalize actions to list of Action objects
        valid_actions = []
        if raw_actions:
            for act in raw_actions:
                if isinstance(act, dict) and "type" in act:
                    valid_actions.append(Action(type=act["type"], args=act.get("args", {})))

        # Add assistant response to history
        history.append({
            "role": "assistant",
            "content": assistant_response,
            "timestamp": time.time()
        })
        conversation_history[conversation_id] = history

        return ConversationResponse(
            response=assistant_response,
            actions=valid_actions,
            requiresFollowUp=requires_follow_up,
            conversation_id=conversation_id
        )

    except Exception as e:
        print(f"[Backend Error] {e}")
        return ConversationResponse(
            response=f"I had a problem processing that. Error: {str(e)}",
            actions=None,
            conversation_id=conversation_id
        )


@app.post("/speak")
async def speak(request: SpeakRequest):
    """
    Convert text to speech using ElevenLabs API.
    Returns audio stream.
    """
    api_key = os.getenv("ELEVENLABS_API_KEY")
    
    if not api_key:
        raise HTTPException(
            status_code=500, 
            detail="ELEVENLABS_API_KEY not configured. See backend/.env"
        )
    
    try:
        from elevenlabs import ElevenLabs
        
        client = ElevenLabs(api_key=api_key)
        
        # Generate audio
        audio_generator = client.text_to_speech.convert(
            voice_id="21m00Tcm4TlvDq8ikWAM",  # Rachel voice
            text=request.text,
            model_id="eleven_turbo_v2_5",
            output_format="mp3_44100_128",
        )
        
        # Collect audio chunks
        audio_data = b"".join(audio_generator)
        
        return StreamingResponse(
            iter([audio_data]),
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline; filename=speech.mp3"}
        )
        
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="ElevenLabs package not installed. Run: pip install elevenlabs"
        )
    except Exception as e:
        print(f"[Backend Error] Speak failed: {e}")
        error_msg = str(e)
        print(f"[Aeyes] TTS Error: {error_msg}")  # Added logging
        if "quota_exceeded" in error_msg.lower():
            error_msg = "ElevenLabs API quota exceeded. Please check your account credits."
        raise HTTPException(status_code=500, detail=error_msg)

class ResolveElementRequest(BaseModel):
    dom_context: dict  # DOM snapshot as JSON object
    action_type: str  # type of action (click, type, etc.)
    action_description: str  # what element to find (e.g., "search input", "submit button")
    action_value: str | None = None  # for type actions, the text to type


class ResolveElementResponse(BaseModel):
    element_id: str | None
    success: bool
    message: str


@app.post("/resolve-element", response_model=ResolveElementResponse)
async def resolve_element(request: ResolveElementRequest):
    """
    Given DOM context, find the correct element ID for an action.
    Used for multi-step workflows where element IDs aren't known upfront.
    """
    if not gemini_model:
        return ResolveElementResponse(
            element_id=None,
            success=False,
            message="Gemini not configured"
        )

    resolve_prompt = f"""You are a DOM element finder. Given a DOM snapshot, find the element that matches the description.

DOM CONTEXT:
{json_lib.dumps(request.dom_context, indent=2)}

TASK: Find the element for: {request.action_description}
Action type: {request.action_type}
{f'Text to type: {request.action_value}' if request.action_value else ''}

Return ONLY a JSON object with this format:
{{"elementId": "the-element-id-from-dom", "confidence": "high|medium|low"}}

If you can't find a suitable element, return:
{{"elementId": null, "confidence": "none", "reason": "why not found"}}

Look for elements by:
- Text content matching the description
- Label or placeholder text
- Role or aria-label
- Common patterns (search inputs usually named "search", "q", "query", etc.)

Return JSON ONLY."""

    try:
        result = await gemini_model.generate_content_async(resolve_prompt)
        response_text = result.text.strip()
        
        # Clean up response
        if "```" in response_text:
            import re
            match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', response_text, re.DOTALL)
            if match:
                response_text = match.group(1).strip()
        
        first_brace = response_text.find('{')
        last_brace = response_text.rfind('}')
        if first_brace != -1 and last_brace > first_brace:
            response_text = response_text[first_brace:last_brace + 1]
        
        parsed = json_lib.loads(response_text)
        element_id = parsed.get("elementId")
        confidence = parsed.get("confidence", "low")
        
        if element_id and confidence != "none":
            return ResolveElementResponse(
                element_id=element_id,
                success=True,
                message=f"Found element with {confidence} confidence"
            )
        else:
            return ResolveElementResponse(
                element_id=None,
                success=False,
                message=parsed.get("reason", "Element not found")
            )
            
    except Exception as e:
        print(f"[Aeyes] Element resolution failed: {e}")
        return ResolveElementResponse(
            element_id=None,
            success=False,
            message=str(e)
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",  # Use string reference instead of app object for reload to work
        host="0.0.0.0",
        port=8000,
        reload=True,  # Enable auto-reload on file changes
        reload_dirs=["./"],  # Watch current directory for changes
        log_level="info"
    )
