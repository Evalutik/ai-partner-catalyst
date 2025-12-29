"""
Pydantic models for Aeyes Backend API
"""
from pydantic import BaseModel


class PageContext(BaseModel):
    """Lightweight page context for DOM extraction."""
    url: str
    title: str
    width: int
    height: int
    tabId: int | None = None


class Action(BaseModel):
    """Single action to be executed by the frontend."""
    type: str
    args: dict = {}


class ConversationRequest(BaseModel):
    """Request body for /conversation endpoint."""
    transcript: str
    context: dict | None = None  # DOM snapshot (legacy/full)
    page_context: PageContext | None = None  # Lightweight context
    conversation_id: str | None = None


class ConversationResponse(BaseModel):
    """Response body for /conversation endpoint."""
    response: str
    actions: list[Action] | None = None
    post_analysis: list[Action] | None = None  # Tools to run AFTER action completes
    requiresFollowUp: bool = False
    conversation_id: str | None = None


class SpeakRequest(BaseModel):
    """Request body for /speak endpoint."""
    text: str


class ResolveElementRequest(BaseModel):
    """Request body for /resolve-element endpoint."""
    dom_context: dict  # DOM snapshot as JSON object
    action_type: str  # type of action (click, type, etc.)
    action_description: str  # what element to find (e.g., "search input", "submit button")
    action_value: str | None = None  # for type actions, the text to type


class ResolveElementResponse(BaseModel):
    """Response body for /resolve-element endpoint."""
    element_id: str | None
    success: bool
    message: str
