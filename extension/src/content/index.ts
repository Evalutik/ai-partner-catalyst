// Content script - injected into web pages for DOM extraction and action execution

// Message listener - responds to requests from popup/background
chrome.runtime.onMessage.addListener(
    (message: { type: string;[key: string]: unknown }, _sender, sendResponse) => {
        console.log('[Aeyes Content] Message:', message.type);

        if (message.type === 'EXTRACT_DOM') {
            // Will be implemented in Step 2.1
            const dom = extractDOM();
            sendResponse({ success: true, data: dom });
        }

        if (message.type === 'EXECUTE_ACTION') {
            // Will be implemented in Step 2.3
            const result = executeAction(message.action as Action);
            sendResponse(result);
        }

        return true;
    }
);

// Types for actions
interface Action {
    type: 'click' | 'type' | 'scroll' | 'navigate';
    elementId?: string;
    value?: string;
}

// Placeholder - will be implemented in Step 2.1
function extractDOM() {
    return {
        url: window.location.href,
        title: document.title,
        elements: [],
        message: 'DOM extraction will be implemented in Step 2.1',
    };
}

// Placeholder - will be implemented in Step 2.3
function executeAction(action: Action) {
    console.log('[Aeyes Content] Execute action:', action);
    return {
        success: false,
        message: 'Action execution will be implemented in Step 2.3',
    };
}

console.log('[Aeyes] Content script loaded on:', window.location.href);
