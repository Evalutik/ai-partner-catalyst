"""
Text-to-Speech API endpoint.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.core.logging import logger
from app.models import SpeakRequest
from app.services import elevenlabs as tts_service

router = APIRouter()


@router.get("/speak")
@router.post("/speak")
async def speak(request_or_text: SpeakRequest | str):
    """
    Convert text to speech using ElevenLabs API.
    Returns audio stream.
    Supports both POST with JSON body and GET with text query param.
    """
    try:
        text = request_or_text.text if isinstance(request_or_text, SpeakRequest) else request_or_text
        audio_stream = await tts_service.generate_speech(text)
        
        return StreamingResponse(
            audio_stream,
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline; filename=speech.mp3"}
        )
        
    except ImportError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Speak failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
