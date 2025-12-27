"""
Aeyes Backend - FastAPI server with Gemini + ElevenLabs TTS
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import os
import json
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
        sa_data = json.load(f)
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
SYSTEM_PROMPT = """You are Aeyes, a helpful voice assistant for visually impaired users.

CRITICAL: You MUST respond with ONLY valid JSON. No extra text, no markdown, no explanations.

When user asks you to do something, break it into steps and return JSON with this EXACT format:

{
  "response": "Short friendly message about what you're doing, and offer to help more",
  "actions": [list of actions],
  "requiresFollowUp": false
}

ACTION TYPES:
1. navigate - Go to URL: {"type": "navigate", "value": "https://url.com", "waitForPage": true, "newTab": true}
   - Use "newTab": true (default) when user says "open", "open in new tab", etc.
   - Use "newTab": false when user says "go to", "navigate to" in current tab
2. type - Type text: {"type": "type", "description": "what element to find", "value": "text to type", "needsDom": true}
3. click - Click element: {"type": "click", "description": "what element to click", "needsDom": true}
4. scroll - Scroll page: {"type": "scroll", "value": "down"}

NOTE: For actions with needsDom: true, use "description" (human-readable) instead of "elementId".
The system will find the actual element ID from the page DOM.

EXAMPLES:

User: "Go to YouTube and search for cats"
YOU MUST RETURN:
{
  "response": "I'll take you to YouTube and search for cats. Let me know if you need anything else!",
  "actions": [
    {"type": "navigate", "value": "https://youtube.com", "waitForPage": true, "newTab": false},
    {"type": "type", "description": "search input box", "value": "cats", "needsDom": true},
    {"type": "click", "description": "search button", "needsDom": true}
  ],
  "requiresFollowUp": false
}

User: "Open Google"
YOU MUST RETURN:
{
  "response": "Opening Google for you. Anything else?",
  "actions": [
    {"type": "navigate", "value": "https://google.com", "waitForPage": true, "newTab": true}
  ],
  "requiresFollowUp": false
}

User: "Hello"
YOU MUST RETURN:
{
  "response": "Hi! How can I help you today?",
  "actions": [],
  "requiresFollowUp": false
}

SPECIAL MESSAGES:

1. [ACTION_FAILED] - An action failed. Analyze the error and DOM context to suggest recovery:
   - If element not visible: suggest {"type": "scroll", "value": "down"} to reveal it
   - If login required: respond asking user to log in first
   - If element doesn't exist: try alternative description or ask user
   
2. [Continue] - Previous actions completed. Analyze the new page DOM and complete the task.

REMEMBER:
- ALWAYS include "actions" field (empty array [] if no actions needed)
- For multi-step requests (like "go to X and do Y"), include ALL actions in ONE response
- The "response" is spoken AFTER all actions complete - describe what you did briefly
- Set waitForPage: true for navigate actions
- Set needsDom: true for actions that need DOM elements from the new page
- When recovering from [ACTION_FAILED], suggest ONE recovery action at a time
- If you need to analyze page content, set requiresFollowUp: true
- CRITICAL: Before finishing, verify you fulfilled the user's ENTIRE request. 
  * Example: if user said "open video", merely searching is NOT enough. You must click the video.
  * If the goal is not fully reached, return requiresFollowUp: true to continue.
- Response with JSON ONLY - nothing else!"""

app = FastAPI(title="Aeyes Backend")

# CORS for extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory conversation history (in production, use Redis or database)
# Format: {conversation_id: [{"role": "user"|"assistant", "content": str, "timestamp": float}]}
conversation_history = {}


class ConversationRequest(BaseModel):
    transcript: str
    context: str | None = None  # DOM snapshot as JSON string
    conversation_id: str | None = None  # For maintaining conversation history


class ConversationResponse(BaseModel):
    response: str
    actions: list | None = None
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
    Supports multi-step workflows and conversation history.
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
        if len(history) > 1:  # If there's previous conversation
            recent_history = history[-6:]  # Last 3 exchanges (6 messages)
            history_text = "\n\nRecent conversation:\n"
            for msg in recent_history[:-1]:  # Exclude current message
                role = "User" if msg["role"] == "user" else "Aeyes"
                history_text += f"{role}: {msg['content']}\n"

        if request.context:
            prompt = f"""User request: "{user_text}"
{history_text}
Current page DOM (interactive elements):
{request.context}

Analyze the request and DOM, then respond with JSON."""
        else:
            prompt = f"""User request: "{user_text}"
{history_text}
No DOM context provided - the user may be on the side panel or asking a general question.

Respond with JSON."""

        # Build full prompt with system instructions
        full_prompt = SYSTEM_PROMPT + "\n\n" + prompt
        
        # Call Vertex AI with retry logic for rate limits
        import time
        from vertexai.generative_models import GenerationConfig
        
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = gemini_model.generate_content(
                    full_prompt,
                    generation_config=GenerationConfig(
                        temperature=0.3,  # Lower temperature for more consistent JSON
                        max_output_tokens=2048,  # Allow complete responses
                    )
                )
                break  # Success, exit retry loop
            except Exception as retry_error:
                if "quota" in str(retry_error).lower() or "rate" in str(retry_error).lower():
                    wait_time = (attempt + 1) * 5  # 5s, 10s, 15s
                    time.sleep(wait_time)
                    if attempt == max_retries - 1:
                        raise  # Re-raise on final attempt
                else:
                    raise  # Non-rate-limit error, re-raise immediately
        
        # Parse the response
        response_text = response.text.strip()

        # Debug logging
        print(f"\n{'='*60}")
        print(f"[AEYES DEBUG] Raw Gemini Response:")
        print(response_text)
        print(f"{'='*60}\n")

        # Try to extract JSON from the response
        # Handle cases where Gemini might wrap in markdown code blocks or add extra text

        # Remove markdown code blocks
        if "```json" in response_text or "```" in response_text:
            # Extract content between ``` markers
            import re
            match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', response_text, re.DOTALL)
            if match:
                response_text = match.group(1).strip()

        # Handle case where Gemini adds thinking/explanation before JSON
        # Look for the first { and last } to extract just the JSON object
        first_brace = response_text.find('{')
        last_brace = response_text.rfind('}')

        if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
            response_text = response_text[first_brace:last_brace + 1]

        print(f"[AEYES DEBUG] Cleaned JSON:")
        print(response_text)
        print(f"{'='*60}\n")

        try:
            parsed = json.loads(response_text)

            assistant_response = parsed.get("response", "I understood your request.")
            actions = parsed.get("actions", None)
            requires_follow_up = parsed.get("requiresFollowUp", False)

            # Add assistant response to history
            history.append({
                "role": "assistant",
                "content": assistant_response,
                "timestamp": time.time()
            })

            # Update conversation history
            conversation_history[conversation_id] = history

            return ConversationResponse(
                response=assistant_response,
                actions=actions,
                requiresFollowUp=requires_follow_up,
                conversation_id=conversation_id
            )
        except json.JSONDecodeError as je:
            # Try to extract just the response field using regex
            import re
            match = re.search(r'"response"\s*:\s*"([^"]*)"', response_text)
            if match:
                extracted_response = match.group(1)

                # Add to history
                history.append({
                    "role": "assistant",
                    "content": extracted_response,
                    "timestamp": time.time()
                })
                conversation_history[conversation_id] = history

                return ConversationResponse(
                    response=extracted_response,
                    actions=None,
                    conversation_id=conversation_id
                )

            # Last resort: clean up any JSON-like artifacts from the text
            clean_text = response_text
            clean_text = re.sub(r'^\s*\{?\s*"response"\s*:\s*"?', '', clean_text)
            clean_text = re.sub(r'"?\s*,?\s*"actions"\s*:\s*\[.*\]?\s*\}?\s*$', '', clean_text)
            clean_text = clean_text.strip().strip('"')

            fallback_response = clean_text[:200] if clean_text else "I had trouble understanding. Could you try again?"

            # Add to history
            history.append({
                "role": "assistant",
                "content": fallback_response,
                "timestamp": time.time()
            })
            conversation_history[conversation_id] = history

            return ConversationResponse(
                response=fallback_response,
                actions=None,
                conversation_id=conversation_id
            )

    except Exception as e:
        fallback_msg = "I had a problem processing that. Please try again."

        # Add to history
        history.append({
            "role": "assistant",
            "content": fallback_msg,
            "timestamp": time.time()
        })
        conversation_history[conversation_id] = history

        return ConversationResponse(
            response=fallback_msg,
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
        error_msg = str(e)
        if "quota_exceeded" in error_msg.lower():
            error_msg = "ElevenLabs API quota exceeded. Please check your account credits."
        raise HTTPException(status_code=500, detail=error_msg)

class ResolveElementRequest(BaseModel):
    dom_context: str  # DOM snapshot as JSON string
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
{request.dom_context}

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
        
        parsed = json.loads(response_text)
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
