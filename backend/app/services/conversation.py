"""
Conversation history management for Aeyes Backend.
"""
import time

# In-memory conversation history
# Structure: { conversation_id: [ {role, content, timestamp}, ... ] }
_conversation_history = {}


def get_history(conversation_id: str) -> list:
    """Get conversation history for a given ID."""
    return _conversation_history.get(conversation_id, [])


def add_message(conversation_id: str, role: str, content: str):
    """Add a message to the conversation history."""
    if conversation_id not in _conversation_history:
        _conversation_history[conversation_id] = []
    
    _conversation_history[conversation_id].append({
        "role": role,
        "content": content,
        "timestamp": time.time()
    })


def format_history_for_prompt(history: list, limit: int = 6) -> str:
    """Format recent history as text for LLM prompt."""
    if not history:
        return ""
    
    recent_history = history[-limit:]
    history_text = "\n\nRecent conversation:\n"
    for msg in recent_history:
        role = "User" if msg["role"] == "user" else "Aeyes"
        history_text += f"{role}: {msg['content']}\n"
    
    return history_text


def clear_history(conversation_id: str):
    """Clear history for a given ID."""
    if conversation_id in _conversation_history:
        del _conversation_history[conversation_id]
