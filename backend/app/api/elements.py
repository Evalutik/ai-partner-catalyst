"""
Element resolution API endpoint.
"""
from fastapi import APIRouter
import json as json_lib

from app.core.logging import logger
from app.models import ResolveElementRequest, ResolveElementResponse
from app.services import gemini as gemini_service

router = APIRouter()


@router.post("/resolve-element", response_model=ResolveElementResponse)
async def resolve_element(request: ResolveElementRequest):
    """
    Given DOM context, find the correct element ID for an action.
    """
    model = gemini_service.get_model()
    if not model:
        return ResolveElementResponse(
            element_id=None,
            success=False,
            message="Gemini not configured"
        )

    resolve_prompt = f"""You are a DOM element finder. Given a DOM snapshot, find the element that matches the description.

DOM CONTEXT:
{json_lib.dumps(request.dom_context, indent=2)}

TASK: Find the element for: {request.action_description}
Action type: {request.action_type}
{f'Text to type: {request.action_value}' if request.action_value else ''}

Return ONLY a JSON object with this format:
{{"elementId": "the-element-id-from-dom", "confidence": "high|medium|low"}}

If you can't find a suitable element, return:
{{"elementId": null, "confidence": "none", "reason": "why not found"}}

Look for elements by:
- Text content matching the description
- Label or placeholder text
- Role or aria-label
- Common patterns (search inputs usually named "search", "q", "query", etc.)

Return JSON ONLY."""

    try:
        result = await gemini_service.generate_content_async(resolve_prompt)
        response_text = result.text.strip()
        
        # Clean up response
        if "```" in response_text:
            import re
            match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', response_text, re.DOTALL)
            if match:
                response_text = match.group(1).strip()
        
        first_brace = response_text.find('{')
        last_brace = response_text.rfind('}')
        if first_brace != -1 and last_brace > first_brace:
            response_text = response_text[first_brace:last_brace + 1]
        
        parsed = json_lib.loads(response_text)
        element_id = parsed.get("elementId")
        confidence = parsed.get("confidence", "low")
        
        if element_id and confidence != "none":
            return ResolveElementResponse(
                element_id=element_id,
                success=True,
                message=f"Found element with {confidence} confidence"
            )
        else:
            return ResolveElementResponse(
                element_id=None,
                success=False,
                message=parsed.get("reason", "Element not found")
            )
            
    except Exception as e:
        logger.error(f"Element resolution failed: {e}")
        return ResolveElementResponse(
            element_id=None,
            success=False,
            message=str(e)
        )
