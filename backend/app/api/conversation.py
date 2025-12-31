"""
Conversation and Health API endpoints.
"""
from fastapi import APIRouter
import uuid
import json as json_lib

from app.models import ConversationRequest, ConversationResponse, Action
from app.core.prompts import SYSTEM_PROMPT
from app.core.logging import logger
from app.services import conversation as conv_service
from app.services import gemini as gemini_service

router = APIRouter()


@router.get("/health")
async def health():
    """Health check endpoint."""
    model = gemini_service.get_model()
    return {"status": "ok", "gemini": model is not None}


@router.post("/conversation", response_model=ConversationResponse)
async def conversation(request: ConversationRequest):
    """
    Process user transcript with Gemini, return response + actions.
    """
    user_text = request.transcript.strip()

    if not user_text:
        return ConversationResponse(
            response="I didn't catch that. Could you repeat?",
            actions=None,
            completed=True
        )

    # Get Gemini model/service status
    model = gemini_service.get_model()
    if not model:
        return ConversationResponse(
            response=f"Gemini not configured. You said: {user_text}",
            actions=None,
            completed=True
        )

    candidate_id = request.conversation_id or str(uuid.uuid4())
    
    # Retrieve existing context or start new
    history = conv_service.get_history(candidate_id)

    conv_service.add_message(candidate_id, "user", user_text)

    try:
        history_text = conv_service.format_history_for_prompt(history)

        context_str = ""
        if request.page_context:
            context_str += (
                f"\nPAGE CONTEXT:\nURL: {request.page_context.url}\n"
                f"Title: {request.page_context.title}\n"
                f"Size: {request.page_context.width}x{request.page_context.height}\n"
                f"TabID: {request.page_context.tabId}\n"
            )
        
        if request.context:
            context_str += f"\nDOM ELEMENTS/DATA:\n{json_lib.dumps(request.context, indent=2)}\n"

        prompt = (
            f'User request: "{user_text}"\n'
            f'{history_text}\n'
            f'{context_str}\n\n'
            f'Analyze the request and context. Respond with JSON based on the System Protocol.'
        )

        # Build full prompt with system instructions
        full_prompt = SYSTEM_PROMPT + "\n\n" + prompt
        
        # Call Gemini service
        response = await gemini_service.generate_content(full_prompt)
        
        response_text = response.text.strip()
        logger.debug(f"Gemini Response: {response_text}")

        # Parse JSON
        try:
            parsed = json_lib.loads(response_text)
        except json_lib.JSONDecodeError:
            cleaned = response_text.replace("```json", "").replace("```", "").strip()
            parsed = json_lib.loads(cleaned)

        # Note: 'response' field is legacy - frontend uses actions (say/ask) for speech
        assistant_response = parsed.get("response", "")
        raw_actions = parsed.get("actions", [])
        requires_follow_up = parsed.get("requiresFollowUp", False)
        completed_flag = parsed.get("completed", False) # Default to False if missing (CONTINUE), but prompt demands it
        raw_post_analysis = parsed.get("post_analysis", [])

        # Normalize actions to list of Action objects
        valid_actions = []
        if raw_actions:
            for act in raw_actions:
                if isinstance(act, dict) and "type" in act:
                    valid_actions.append(Action(type=act["type"], args=act.get("args", {})))

        # Normalize post_analysis to list of Action objects
        valid_post_analysis = []
        if raw_post_analysis:
            for act in raw_post_analysis:
                if isinstance(act, dict) and "type" in act:
                    valid_post_analysis.append(Action(type=act["type"], args=act.get("args", {})))

        conv_service.add_message(candidate_id, "assistant", assistant_response)

        return ConversationResponse(
            response=assistant_response,
            actions=valid_actions,
            post_analysis=valid_post_analysis if valid_post_analysis else None,
            requiresFollowUp=requires_follow_up,
            completed=completed_flag,
            conversation_id=candidate_id
        )

    except Exception as e:
        logger.error(f"Conversation error: {e}", exc_info=True)
        return ConversationResponse(
            response=f"I had a problem processing that. Error: {str(e)}",
            actions=None,
            completed=True,
            conversation_id=candidate_id if 'candidate_id' in locals() else None
        )
