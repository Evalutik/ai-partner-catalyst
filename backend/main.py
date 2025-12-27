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

# Get credentials path from env or use default
GOOGLE_CREDENTIALS_PATH = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", 
    os.path.join(os.path.dirname(__file__), "..", "project-a20ae662-5941-48ee-a0d-91a6281350f0.json"))
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "project-a20ae662-5941-48ee-a0d")
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")

try:
    # Set credentials environment variable
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = GOOGLE_CREDENTIALS_PATH
    
    # Initialize Vertex AI
    vertexai.init(project=PROJECT_ID, location=LOCATION)
    gemini_model = GenerativeModel("gemini-2.0-flash-001")
except Exception as e:
    print(f"[Aeyes] Failed to initialize Vertex AI: {e}")
    gemini_model = None

# System prompt for Aeyes agent
SYSTEM_PROMPT = """You are Aeyes, a helpful voice assistant for visually impaired users.

CRITICAL: You MUST respond with ONLY valid JSON. No extra text, no markdown, no explanations.

When user asks you to do something, break it into steps and return JSON with this EXACT format:

{
  "response": "Short friendly message about what you'll do",
  "actions": [list of actions],
  "requiresFollowUp": false
}

<<<<<<< HEAD
ACTION TYPES:
1. navigate - Go to URL: {"type": "navigate", "value": "https://url.com", "waitForPage": true}
2. type - Type text: {"type": "type", "elementId": "id-from-dom", "value": "text to type", "needsDom": true}
3. click - Click element: {"type": "click", "elementId": "id-from-dom"}
4. scroll - Scroll page: {"type": "scroll", "value": "down"}
=======
Action types:
- click: Click an element (requires elementId)
- type: Type text into an input (requires elementId and value)
- scroll: Scroll the page (value: "up", "down", "top", "bottom", or elementId to scroll to a heading/section)
- navigate: Go to a URL (requires value with URL)
>>>>>>> karaya-branch

EXAMPLES:

User: "Go to YouTube and search for cats"
YOU MUST RETURN:
{
  "response": "I'll take you to YouTube and search for cats",
  "actions": [
    {"type": "navigate", "value": "https://youtube.com", "waitForPage": true},
    {"type": "type", "elementId": "search", "value": "cats", "needsDom": true},
    {"type": "click", "elementId": "search-button", "needsDom": true}
  ],
  "requiresFollowUp": false
}

User: "Navigate to Google"
YOU MUST RETURN:
{
  "response": "Opening Google for you",
  "actions": [
    {"type": "navigate", "value": "https://google.com", "waitForPage": true}
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

REMEMBER:
- ALWAYS include "actions" field (empty array [] if no actions needed)
- For multi-step requests (like "go to X and do Y"), include ALL actions
- Set waitForPage: true for navigate actions
- Set needsDom: true for actions that need fresh page elements
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
<<<<<<< HEAD
                chat = gemini_model.start_chat(history=[])
                response = chat.send_message(
                    SYSTEM_PROMPT + "\n\n" + prompt,
                    generation_config=genai.types.GenerationConfig(
                        temperature=0.3,  # Lower temperature for more consistent JSON
                        max_output_tokens=2048,  # Increased from 500 to allow complete responses
                        response_mime_type="application/json"  # Force JSON output
=======
                response = gemini_model.generate_content(
                    full_prompt,
                    generation_config=GenerationConfig(
                        temperature=0.7,
                        max_output_tokens=500,
>>>>>>> karaya-branch
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
