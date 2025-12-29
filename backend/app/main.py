"""
Aeyes Backend - FastAPI application factory.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

# Import routers
from app.api.conversation import router as conversation_router
from app.api.speech import router as speech_router
from app.api.elements import router as elements_router

# Import services
from app.services import gemini as gemini_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Handle app startup and shutdown events.
    """
    print("[Aeyes] Starting up (lifespan)...")
    gemini_service.init_gemini()
    
    yield
    
    print("[Aeyes] Shutting down (lifespan)...")


def create_app() -> FastAPI:
    """
    Create and configure the FastAPI application.
    """
    app = FastAPI(
        title="Aeyes Backend",
        description="Voice-controlled browser assistant for visually impaired users",
        version="0.2.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Allows all origins, crucial for Chrome Extension connectivity
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(conversation_router, tags=["Conversation"])
    app.include_router(speech_router, tags=["Speech"])
    app.include_router(elements_router, tags=["Elements"])

    return app


app = create_app()
