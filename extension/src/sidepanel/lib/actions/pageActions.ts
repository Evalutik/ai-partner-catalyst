/**
 * Page Actions - Click, type, scroll, and other DOM interactions
 */



export interface PageActionResult {
    success: boolean;
    failedAction?: string;
    failReason?: string;
    lastDom?: any;
}

export interface SpeakCallbacks {
    onStatusChange?: (status: 'speaking' | 'processing') => void;
    speak?: (text: string) => Promise<void>;
}

/**
 * Speak text using provided callback
 */
export async function speak(text: string, callbacks: SpeakCallbacks): Promise<void> {
    if (callbacks.speak) {
        await callbacks.speak(text);
    } else {
        console.warn('[PageActions] No speak callback provided for:', text);
    }
}

/**
 * Resolve element ID from description via backend
 */
export async function resolveElement(
    domContext: any,
    actionType: string,
    description: string,
    value?: string
): Promise<{ success: boolean; elementId?: string; message?: string }> {
    try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
        const response = await fetch(`${backendUrl}/resolve-element`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                dom_context: domContext,
                action_type: actionType,
                action_description: description,
                action_value: value
            })
        });

        const result = await response.json();
        if (result.success && result.element_id) {
            return { success: true, elementId: result.element_id };
        }
        return { success: false, message: result.message || 'Resolution failed' };
    } catch (e: any) {
        return { success: false, message: e.message || 'Backend error' };
    }
}

/**
 * Execute a page action via content script
 */
export async function executePageAction(
    action: any,
    tabId: number
): Promise<PageActionResult> {
    const actionName = action.description || action.type;

    try {
        const result = await chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_ACTION', action });

        if (!result || !result.success) {
            return {
                success: false,
                failedAction: actionName,
                failReason: result?.message || 'Content script error'
            };
        }
        return { success: true };
    } catch (e: any) {
        // Try to inject content script if not connected
        if (isConnectionError(e.message)) {
            return await retryWithInjection(action, tabId, actionName);
        }
        return {
            success: false,
            failedAction: actionName,
            failReason: 'Content script error: ' + e.message
        };
    }
}

function isConnectionError(message: string): boolean {
    return message?.includes('message port closed') ||
        message?.includes('receiving end does not exist') ||
        message?.includes('Could not establish connection');
}

async function retryWithInjection(
    action: any,
    tabId: number,
    actionName: string
): Promise<PageActionResult> {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
        });
        await new Promise(r => setTimeout(r, 300));

        const result = await chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_ACTION', action });
        if (!result || !result.success) {
            return {
                success: false,
                failedAction: actionName,
                failReason: result?.message || 'Error after injection'
            };
        }
        return { success: true };
    } catch (injectError: any) {
        if (injectError.message?.includes('message port closed')) {
            return { success: true }; // Likely navigation occurred
        }
        return {
            success: false,
            failedAction: actionName,
            failReason: 'Content script unreachable'
        };
    }
}
