// Background service worker - handles hotkey and message routing

// Open side panel when command is triggered
chrome.commands.onCommand.addListener((command: string) => {
    if (command === 'toggle-side-panel') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.sidePanel.open({ tabId: tabs[0].id });
            }
        });
    }
});

// Also open side panel when extension icon is clicked
chrome.action?.onClicked?.addListener((tab) => {
    if (tab.id) {
        chrome.sidePanel.open({ tabId: tab.id });
    }
});

// Message router between side panel and content scripts
chrome.runtime.onMessage.addListener(
    (message: { type: string;[key: string]: unknown }, _sender, sendResponse) => {
        console.log('[Aeyes Background] Message:', message.type);

        if (message.type === 'EXTRACT_DOM') {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                    chrome.tabs.sendMessage(tabs[0].id, message, sendResponse);
                } else {
                    sendResponse({ error: 'No active tab' });
                }
            });
            return true;
        }

        if (message.type === 'EXECUTE_ACTION') {
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
