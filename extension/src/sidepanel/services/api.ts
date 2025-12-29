const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

interface PageContext {
    url: string;
    title: string;
    width: number;
    height: number;
    tabId?: number;
}

export interface ConversationRequest {
    transcript: string;
    context?: string; // Full DOM
    page_context?: PageContext; // Lightweight context
    conversation_id?: string;
}

export interface Action {
    type: 'click' | 'type' | 'scroll' | 'navigate' | 'focus';
    elementId?: string;
    value?: string;
    waitForPage?: boolean;
    needsDom?: boolean;
    description?: string;
    // Tab Management
    tabId?: number; // Target tab for tab actions
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
 * @param signal - Optional AbortSignal to cancel the request
 */
export async function sendToBackend(request: ConversationRequest, signal?: AbortSignal): Promise<ConversationResponse> {
    const logPayload: any = { ...request };
    try {
        if (logPayload.context) {
            logPayload.context = JSON.parse(logPayload.context);
        }
    } catch (e) { /* ignore parse error for logging */ }

    console.log('[Aeyes Network] 📤 SENDING Payload:', logPayload);

    const response = await fetch(`${BACKEND_URL}/conversation`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal,
    });

    if (!response.ok) {
        throw new Error(`Backend error: ${response.status}`);
    }

    const json = await response.json();
    console.log('[Aeyes Network] 📥 RECEIVED Response:', json);
    return json;
}

/**
 * Get TTS audio from backend (ElevenLabs via backend)
 * @param signal - Optional AbortSignal to cancel the request
 */
export async function getAudioUrl(text: string, signal?: AbortSignal): Promise<string> {
    const response = await fetch(`${BACKEND_URL}/speak`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
        signal,
    });

    if (!response.ok) {
        let errorMessage = `TTS error: ${response.status}`;
        try {
            const errorJson = await response.json();
            if (errorJson.detail) {
                errorMessage += ` - ${errorJson.detail}`;
            }
        } catch (e) {
            // fallback to text if not json
            const errorText = await response.text();
            if (errorText) {
                errorMessage += ` - ${errorText}`;
            }
        }
        throw new Error(errorMessage);
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
