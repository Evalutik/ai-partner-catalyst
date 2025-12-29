/**
 * Chrome Extension API utilities for tab and DOM operations
 */

export interface PageContext {
    url: string;
    title: string;
    width: number;
    height: number;
    tabId?: number;
}

export interface DOMSnapshot {
    url: string;
    title: string;
    elements: Array<{
        id: string;
        tagName: string;
        type?: string;
        role?: string;
        text?: string;
        label?: string;
        placeholder?: string;
        value?: string;
        checked?: boolean;
        truncated?: boolean;
    }>;
    message?: string;
}

/**
 * Extract DOM from the current page via content script
 */
export async function extractDOMFromPage(): Promise<DOMSnapshot | null> {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return null;

        // Check if it's a restricted page where we can't inject
        if (tab.url && (
            tab.url.startsWith('chrome://') ||
            tab.url.startsWith('edge://') ||
            tab.url.startsWith('about:') ||
            tab.url.startsWith('view-source:') ||
            tab.url.includes('chrome.google.com/webstore')
        )) {
            console.log('[Aeyes] Skipping content script for restricted page:', tab.url);
            return null;
        }

        try {
            const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_DOM' });
            if (response?.success && response?.data) {
                return response.data;
            }
            return null;
        } catch (e: any) {
            // Check if content script is unreachable
            const isConnectionError = e.message && (
                e.message.includes('message port closed') ||
                e.message.includes('receiving end does not exist') ||
                e.message.includes('Could not establish connection')
            );

            if (isConnectionError) {
                console.log('[Aeyes] Content script not found, attempting to inject...');
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content.js']
                    });
                    console.log('[Aeyes] Content script injected successfully, retrying...');
                    await new Promise(r => setTimeout(r, 300));

                    // Retry the message
                    const retryResponse = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_DOM' });
                    if (retryResponse?.success && retryResponse?.data) {
                        return retryResponse.data;
                    }
                } catch (injectError: any) {
                    console.warn('[Aeyes] Failed to inject content script:', injectError.message);
                }
            }
            return null;
        }
    } catch (e: any) {
        console.warn('[Aeyes] extractDOMFromPage failed:', e.message);
        return null;
    }
}

/**
 * Extract DOM with retry logic
 */
export async function extractDOMWithRetry(): Promise<DOMSnapshot | null> {
    let attempts = 0;
    while (attempts < 2) {
        const dom = await extractDOMFromPage();
        if (dom) return dom;
        await new Promise(r => setTimeout(r, 500));
        attempts++;
    }
    return null;
}

/**
 * Capture lightweight page context (URL, title, dimensions)
 */
export async function capturePageContext(): Promise<PageContext | null> {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return null;

        return {
            url: tab.url || '',
            title: tab.title || '',
            width: tab.width || 0,
            height: tab.height || 0,
            tabId: tab.id
        };
    } catch (e) {
        console.warn('[Aeyes] Failed to capture page context:', e);
        return null;
    }
}

/**
 * Open the permission settings page
 */
export async function openPermissionPage(): Promise<void> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const returnTabId = tab?.id;

    const url = returnTabId
        ? chrome.runtime.getURL(`permission.html?returnTo=${returnTabId}`)
        : chrome.runtime.getURL('permission.html');

    chrome.tabs.create({ url });
}

