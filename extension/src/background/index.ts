// Background service worker - listens for hotkey (Alt+V) and routes messages

// Handle hotkey command
chrome.commands.onCommand.addListener((command: string) => {
    if (command === '_execute_action') {
        // Alt+V pressed - Chrome automatically opens popup for _execute_action
        console.log('[Aeyes] Hotkey activated');
    }
});

// Message router between popup and content script
chrome.runtime.onMessage.addListener(
    (message: { type: string;[key: string]: unknown }, _sender, sendResponse) => {
        console.log('[Aeyes Background] Message:', message.type);

        if (message.type === 'EXTRACT_DOM') {
            // Forward to content script in active tab
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                    chrome.tabs.sendMessage(tabs[0].id, message, sendResponse);
                } else {
                    sendResponse({ error: 'No active tab' });
                }
            });
            return true; // Keep channel open for async response
        }

        if (message.type === 'EXECUTE_ACTION') {
            // Forward action to content script
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                    chrome.tabs.sendMessage(tabs[0].id, message, sendResponse);
                } else {
                    sendResponse({ error: 'No active tab' });
                }
            });
            return true;
        }

        return false;
    }
);

console.log('[Aeyes] Background service worker loaded');
