"""
Aeyes Backend - FastAPI server with Gemini + ElevenLabs TTS
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Aeyes Backend")

# CORS for extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow extension origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConversationRequest(BaseModel):
    transcript: str
    context: str | None = None


class ConversationResponse(BaseModel):
    response: str
    actions: list | None = None


class SpeakRequest(BaseModel):
    text: str


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/conversation", response_model=ConversationResponse)
async def conversation(request: ConversationRequest):
    """
    Process user transcript with Gemini, return response + actions.
    For now, returns echo response. Will integrate Gemini in Step 2.
    """
    # TODO: Integrate Gemini for real processing
    # For now, simple echo for testing the pipeline
    
    user_text = request.transcript.strip()
    
    if not user_text:
        return ConversationResponse(
            response="I didn't catch that. Could you repeat?",
            actions=None
        )
    
    # Simple test responses
    lower = user_text.lower()
    
    if "hello" in lower or "hi" in lower:
        return ConversationResponse(
            response="Hello! I'm Aeyes, your voice browser assistant. How can I help you today?",
            actions=None
        )
    
    if "weather" in lower:
        return ConversationResponse(
            response="I heard you want to check the weather. Once DOM extraction is ready, I'll help you find that information on the page.",
            actions=None
        )
    
    # Default echo
    return ConversationResponse(
        response=f"I heard you say: {user_text}. Full Gemini integration coming in Step 2!",
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
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
