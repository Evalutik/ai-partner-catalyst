"""
ElevenLabs Text-to-Speech service for Aeyes Backend.
"""
from app.config import get_elevenlabs_api_key


async def generate_speech(text: str, voice_id: str = "21m00Tcm4TlvDq8ikWAM", model_id: str = "eleven_turbo_v2_5"):
    """
    Convert text to speech using ElevenLabs API.
    Returns an iterator of audio chunks for streaming.
    """
    api_key = get_elevenlabs_api_key()
    if not api_key:
        raise RuntimeError("ELEVENLABS_API_KEY not configured")

    try:
        from elevenlabs import ElevenLabs
        client = ElevenLabs(api_key=api_key)
        
        # Generate audio iterator
        return client.text_to_speech.convert(
            voice_id=voice_id,
            text=text,
            model_id=model_id,
            output_format="mp3_44100_128",
        )
        
    except ImportError:
        raise ImportError("ElevenLabs package not installed. Run: pip install elevenlabs")
    except Exception as e:
        error_msg = str(e)
        if "quota_exceeded" in error_msg.lower():
            error_msg = "ElevenLabs API quota exceeded. Please check your account credits."
        raise RuntimeError(error_msg)
