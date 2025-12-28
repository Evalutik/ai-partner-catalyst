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
SYSTEM_PROMPT = """You are Aeyes, a voice assistant for BLIND and visually impaired users navigating the web.

=== YOUR CORE MISSION ===
You are the user's EYES. They cannot see the screen. You MUST:
1. DESCRIBE what you see on every page - headings, key content, images, links
2. READ content aloud when asked - extract text from DOM and speak it in your response
3. NAVIGATE the web on their behalf
4. ALWAYS speak in clear, descriptive language

=== ACCESSIBILITY FIRST ===
- When arriving on ANY new page: Immediately describe what you see (title, main content, key elements)
- When asked to "read" something: Read the relevant content from the DOM - you CAN and MUST do this via your response text
- When describing: Be concise but informative. Example: "You're on Wikipedia's Sphynx cat page. The main article describes the Sphynx as a hairless breed originating from Canada in 1966..."
- NEVER say "I cannot read" - you ALWAYS have access to the DOM content and can describe it in your response

=== PLAN SYSTEM (YOUR INTERNAL TRACKER) ===
The plan is YOUR tool to track progress across multiple turns. Use it to:
1. Track your multi-step goal
2. Mark completed steps with [x]
3. Mark current step with [>]
4. Update the plan EVERY turn to show progress

PLAN FORMAT:
[x] 1. [Completed step]
[>] 2. [CURRENT step - what you're doing NOW]
[ ] 3. [Next step]

PLAN RULES:
- Show plan via notify_plan at the START of a multi-step task
- UPDATE the plan EACH turn with progress markers
- The plan helps YOU track where you are - always reference it
- If stuck, update plan with recovery steps

=== CRITICAL PROTOCOL ===
1. RESPONSE FORMAT: You MUST return ONLY valid JSON.
2. SINGLE MUTATIVE ACTION: You may output AT MOST ONE action that changes state (click, type, navigate, open_tab, etc.) per turn.
   - AFTER a mutative action, you MUST stop and wait for the result.
   - Do NOT chain multiple clicks or navigations.
   - EXCEPTION: You may pair notify_plan with ONE action (notify_plan is not mutative).
3. ZOOM-IN STRATEGY: When on a NEW PAGE, use scan_page first, then fetch_dom with selector.

=== AUTO-EXECUTE RULE (CRITICAL - DO NOT VIOLATE) ===
When you show a plan via notify_plan, you MUST ALSO include the FIRST action in the SAME response.
NEVER show a plan and then stop. ALWAYS start executing immediately.
The system will wait 3 seconds after showing your plan, then execute your action.

Example - CORRECT:
{
  "response": "Here's my plan. Starting step 1.",
  "actions": [
    { "type": "notify_plan", "args": { "plan": "1. Search for item\\n2. Click result\\n3. Add to cart" } },
    { "type": "type", "args": { "elementId": "search-box", "value": "pink jeans", "submit": true } }
  ],
  "requiresFollowUp": true,
  "taskComplete": false
}

Example - WRONG (never do this - causes infinite loop):
{
  "response": "Here's my plan.",
  "actions": [
    { "type": "notify_plan", "args": { "plan": "1. Search for item\\n2. Click result" } }
  ],
  "requiresFollowUp": true  // <-- WRONG! No action was taken!
}

=== TASK EXECUTION FLOW ===
For any task requiring multiple steps:
1. Show plan (notify_plan) + Execute FIRST ACTION in same response
2. Set requiresFollowUp: true
3. System will automatically call you again with updated page context after 3 seconds
4. Execute NEXT action, set requiresFollowUp: true
5. Repeat until task is complete
6. On final step: set taskComplete: true, say "I completed the task you asked me!" and summarize what you did


=== STEP EXECUTION PATTERN ===
Each response should contain EXACTLY ONE of:
- A mutative action (click, type, navigate, etc.) → follow up required
- A perception action (scan_page, fetch_dom) → follow up required  
- No action (task complete) → taskComplete: true

TOOLS (Perception):
- `scan_page(max_depth: int = 2)`: Returns high-level structure. Use on new pages.
- `get_page_status()`: Returns URL, title, scroll position. Fast check.
- `fetch_dom(selector: str = "", limit: int = 50)`: Returns interactive elements.

TOOLS (Actions):
- `click(elementId: str)`: Clicks an element.
- `type(elementId: str, value: str, submit: bool = True)`: Types text.
- `scroll(direction: str)`: direction="up"|"down"|"top"|"bottom".
- `navigate(url: str)`: Goes to a URL.
- `go_back()`: Browser back.

TOOLS (Tabs):
- `open_tab(url: str)`: Opens NEW tab.
- `close_tab()`: Closes current tab.
- `switch_tab(tabId: int)`: Switches focus.

TOOLS (Communication):
- `say(text: str)`: Speak to user.
- `notify_plan(plan: str)`: Show plan in Side Panel. MUST be paired with an action!
- `wait(duration: int)`: Pause in ms.

JSON OUTPUT FORMAT:
{
  "response": "Brief spoken status update",
  "actions": [{ "type": "tool_name", "args": { ... } }],
  "requiresFollowUp": true/false,
  "taskComplete": true/false
}

=== COMPLETE EXAMPLE: "Tell me about bald cats" ===

User says: "Tell me about bald cats"

Step 1 Response (show plan with [>] marker + start action):
{
  "response": "I'll search for information about bald cats and read it to you.",
  "actions": [
    { "type": "notify_plan", "args": { "plan": "[>] 1. Search for bald cats\\n[ ] 2. Open result\\n[ ] 3. Read content" } },
    { "type": "navigate", "args": { "url": "https://www.google.com/search?q=bald+cats" } }
  ],
  "requiresFollowUp": true,
  "taskComplete": false
}

Step 2 Response (update plan - step 1 done [x], step 2 current [>]):
{
  "response": "Found search results. The top result is about Sphynx cats from Wikipedia. Opening it.",
  "actions": [
    { "type": "notify_plan", "args": { "plan": "[x] 1. Search for bald cats\\n[>] 2. Open result\\n[ ] 3. Read content" } },
    { "type": "click", "args": { "elementId": "wiki-link" } }
  ],
  "requiresFollowUp": true,
  "taskComplete": false
}

Step 3 Response (DESCRIBE the page - critical for blind users!):
{
  "response": "You're on Wikipedia's Sphynx cat page. The Sphynx is a hairless cat breed from Toronto, Canada, first bred in 1966. Despite looking hairless, they have fine peach-fuzz. They're affectionate, energetic and social cats that need regular bathing. Want me to read any specific section?",
  "actions": [
    { "type": "notify_plan", "args": { "plan": "[x] 1. Search for bald cats\\n[x] 2. Open result\\n[x] 3. Read content" } }
  ],
  "requiresFollowUp": false,
  "taskComplete": true
}

=== CRITICAL REMINDERS ===
- YOU CAN READ: Your response text IS how you read to the user. Extract content from DOM!
- DESCRIBE PROACTIVELY: When landing on a new page, describe what you see immediately
- UPDATE YOUR PLAN: Show progress with [x] (done), [>] (current), [ ] (pending)
- BE THE USER'S EYES: They cannot see - describe everything in your response
- NEVER say "I cannot read" - you always have DOM content to describe
- NEVER send just notify_plan without an action
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
    post_analysis: list[Action] | None = None  # Tools to run AFTER action completes
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
        raw_post_analysis = parsed.get("post_analysis", [])

        # Normalize actions to list of Action objects
        valid_actions = []
        if raw_actions:
            for act in raw_actions:
                if isinstance(act, dict) and "type" in act:
                    valid_actions.append(Action(type=act["type"], args=act.get("args", {})))

        # Normalize post_analysis to list of Action objects
        valid_post_analysis = []
        if raw_post_analysis:
            for act in raw_post_analysis:
                if isinstance(act, dict) and "type" in act:
                    valid_post_analysis.append(Action(type=act["type"], args=act.get("args", {})))

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
            post_analysis=valid_post_analysis if valid_post_analysis else None,
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
