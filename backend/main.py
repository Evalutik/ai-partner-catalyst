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

# Initialize Gemini
import google.generativeai as genai

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
    gemini_model = genai.GenerativeModel("gemini-2.5-flash")
else:
    gemini_model = None

# System prompt for Aeyes agent
SYSTEM_PROMPT = """You are Aeyes, a voice-controlled browser assistant for visually impaired users.

Your job is to help users navigate web pages using voice commands. You receive:
1. The user's spoken request (transcript)
2. A JSON snapshot of interactive elements on the current page (DOM context)

Based on this, you must:
1. Understand what the user wants to do
2. Find the relevant element(s) in the DOM
3. Return a helpful spoken response AND an action plan

IMPORTANT RULES:
- Keep responses SHORT and conversational (1-2 sentences max)
- Only suggest actions for elements that exist in the DOM
- If you can't find what the user wants, say so helpfully
- Never make up element IDs - only use IDs from the DOM snapshot

RESPONSE FORMAT (strict JSON):
{
  "response": "Your spoken response to the user",
  "actions": [
    {"type": "click", "elementId": "el-5"},
    {"type": "type", "elementId": "el-3", "value": "search query"},
    {"type": "scroll", "value": "down"},
    {"type": "navigate", "value": "https://example.com"}
  ]
}

Action types:
- click: Click an element (requires elementId)
- type: Type text into an input (requires elementId and value)
- scroll: Scroll the page (value: "up", "down", or elementId to scroll to)
- navigate: Go to a URL (requires value with URL)

If no action is needed (e.g., user just says hello), return empty actions array.
Always respond with valid JSON only - no markdown, no extra text."""

app = FastAPI(title="Aeyes Backend")

# CORS for extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConversationRequest(BaseModel):
    transcript: str
    context: str | None = None  # DOM snapshot as JSON string


class ConversationResponse(BaseModel):
    response: str
    actions: list | None = None


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
    
    try:
        # Build the prompt with context
        if request.context:
            prompt = f"""User request: "{user_text}"

Current page DOM (interactive elements):
{request.context}

Analyze the request and DOM, then respond with JSON."""
        else:
            prompt = f"""User request: "{user_text}"

No DOM context provided - the user may be on the side panel or asking a general question.

Respond with JSON."""


        
        # Call Gemini with retry logic for rate limits
        import time
        max_retries = 3
        for attempt in range(max_retries):
            try:
                chat = gemini_model.start_chat(history=[])
                response = chat.send_message(
                    SYSTEM_PROMPT + "\n\n" + prompt,
                    generation_config=genai.types.GenerationConfig(
                        temperature=0.7,
                        max_output_tokens=500,
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

        
        # Try to extract JSON from the response
        # Handle cases where Gemini might wrap in markdown code blocks
        if response_text.startswith("```"):
            # Remove markdown code block
            lines = response_text.split("\n")
            # Find the actual JSON lines (skip ```json and ```)
            json_lines = []
            for line in lines:
                if not line.startswith("```"):
                    json_lines.append(line)
            response_text = "\n".join(json_lines)
        
        try:
            parsed = json.loads(response_text)

            return ConversationResponse(
                response=parsed.get("response", "I understood your request."),
                actions=parsed.get("actions", None)
            )
        except json.JSONDecodeError as je:
            # Try to extract just the response field using regex
            import re
            match = re.search(r'"response"\s*:\s*"([^"]*)"', response_text)
            if match:
                extracted_response = match.group(1)

                return ConversationResponse(
                    response=extracted_response,
                    actions=None
                )
            
            # Last resort: clean up any JSON-like artifacts from the text
            clean_text = response_text
            clean_text = re.sub(r'^\s*\{?\s*"response"\s*:\s*"?', '', clean_text)
            clean_text = re.sub(r'"?\s*,?\s*"actions"\s*:\s*\[.*\]?\s*\}?\s*$', '', clean_text)
            clean_text = clean_text.strip().strip('"')
            

            return ConversationResponse(
                response=clean_text[:200] if clean_text else "I had trouble understanding. Could you try again?",
                actions=None
            )
            
    except Exception as e:
        return ConversationResponse(
            response="I had a problem processing that. Please try again.",
            actions=None
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
    uvicorn.run(app, host="0.0.0.0", port=8000)
