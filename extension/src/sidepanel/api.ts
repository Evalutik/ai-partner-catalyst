const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

export interface ConversationRequest {
    transcript: string;
    context?: string;
    conversation_id?: string;
}

export interface Action {
    type: 'click' | 'type' | 'scroll' | 'navigate' | 'focus';
    elementId?: string;
    value?: string;
    waitForPage?: boolean;  // Wait for page navigation/load
    needsDom?: boolean;     // Need fresh DOM snapshot before executing
    description?: string;   // What this action does (for logging)
}

export interface ConversationResponse {
    response: string;
    audioUrl?: string;
    actions?: Action[];
    requiresFollowUp?: boolean;
    conversation_id?: string;
}

/**
 * Send user transcript to backend, get response + optional actions
 */
export async function sendToBackend(request: ConversationRequest): Promise<ConversationResponse> {
    const response = await fetch(`${BACKEND_URL}/conversation`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        throw new Error(`Backend error: ${response.status}`);
    }

    return response.json();
}

/**
 * Get TTS audio from backend (ElevenLabs via backend)
 */
export async function getAudioUrl(text: string): Promise<string> {
    const response = await fetch(`${BACKEND_URL}/speak`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
    });

    if (!response.ok) {
        throw new Error(`TTS error: ${response.status}`);
    }

    // Return blob URL for audio playback
    const blob = await response.blob();
    return URL.createObjectURL(blob);
}

/**
 * Play audio from URL
 */
export function playAudio(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const audio = new Audio(url);
        audio.onended = () => {
            URL.revokeObjectURL(url); // Clean up blob URL
            resolve();
        };
        audio.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Audio playback failed'));
        };
        audio.play().catch(reject);
    });
}
