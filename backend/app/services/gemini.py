"""
Gemini integration service using Vertex AI for Aeyes Backend.
"""
import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig, SafetySetting, HarmCategory
from app.config import PROJECT_ID, LOCATION
from app.core.logging import logger

# Global model instance
_gemini_model = None


def init_gemini(model_name: str = "gemini-2.0-flash-001"):
    """Initialize Vertex AI and Gemini model."""
    global _gemini_model
    try:
        if PROJECT_ID:
            vertexai.init(project=PROJECT_ID, location=LOCATION)
            _gemini_model = GenerativeModel(model_name)
            logger.info(f"Vertex AI initialized in {LOCATION} with {model_name}")
        else:
            logger.warning("No project ID found - Gemini disabled")
            _gemini_model = None
    except Exception as e:
        logger.error(f"Failed to initialize Vertex AI: {e}")
        _gemini_model = None
    
    return _gemini_model


def get_model():
    """Get the initialized Gemini model."""
    global _gemini_model
    if _gemini_model is None:
        return init_gemini()
    return _gemini_model


async def generate_content(prompt: str, config: GenerationConfig = None, safety_settings: list = None):
    """Generate content from Gemini model (async wrapper)."""
    model = get_model()
    if not model:
        raise RuntimeError("Gemini model not initialized")
    
    # Default config if not provided
    if config is None:
        config = GenerationConfig(
            temperature=0.3,
            max_output_tokens=1024,
            response_mime_type="application/json"
        )
    
    # Default safety settings if not provided
    if safety_settings is None:
        safety_settings = [
            SafetySetting(
                category=HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                threshold=SafetySetting.HarmBlockThreshold.BLOCK_ONLY_HIGH,
            ),
            # ... other safety settings can be added here or passed in
        ]

    # Note: vertexai generates content synchronously by default in the basic SDK, 
    # but we use generate_content_async for the async endpoint later if needed.
    # For now, we'll keep it simple as used in main.py.
    
    return model.generate_content(
        prompt,
        generation_config=config,
        safety_settings=safety_settings
    )


async def generate_content_async(prompt: str):
    """Generate content asynchronously (used for element resolution)."""
    model = get_model()
    if not model:
        raise RuntimeError("Gemini model not initialized")
    
    return await model.generate_content_async(prompt)
