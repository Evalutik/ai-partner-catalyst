// Background service worker - handles hotkey and message routing

// Handle keyboard commands
chrome.commands.onCommand.addListener((command: string) => {
  if (command === "toggle-side-panel") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.sidePanel.open({ tabId: tabs[0].id });
      }
    });
  }

  if (command === "close-panel") {
    // Send close message to sidepanel - it will handle cleanup
    chrome.runtime.sendMessage({ type: "CLOSE_PANEL" });
  }

  if (command === "reload-conversation") {
    // Send reload message to sidepanel to reset conversation
    chrome.runtime.sendMessage({ type: "RELOAD_CONVERSATION" });
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
  (
    message: { type: string;[key: string]: unknown },
    _sender,
    sendResponse
  ) => {
    if (message.type === "EXTRACT_DOM") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, message, sendResponse);
        } else {
          sendResponse({ error: "No active tab" });
        }
      });
      return true;
    }

    if (message.type === "EXECUTE_ACTION") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, message, sendResponse);
        } else {
          sendResponse({ error: "No active tab" });
        }
      });
      return true;
    }

    return false;
  }
);
