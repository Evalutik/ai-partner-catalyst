"""
Text-to-Speech API endpoint.
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.core.logging import logger
from app.models import SpeakRequest
from app.services import elevenlabs as tts_service

router = APIRouter()


@router.post("/speak")
async def speak(request: SpeakRequest):
    """
    Convert text to speech using ElevenLabs API.
    Returns audio stream.
    """
    try:
        audio_data = await tts_service.generate_speech(request.text)
        
        return StreamingResponse(
            iter([audio_data]),
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline; filename=speech.mp3"}
        )
        
    except ImportError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Speak failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
