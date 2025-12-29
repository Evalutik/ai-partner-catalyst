/**
 * DOM Analysis - Extract and analyze page DOM structure
 */

export interface DOMSnapshot {
    url: string;
    title: string;
    elements: DOMElement[];
    message?: string;
}

export interface DOMElement {
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
}

/**
 * Extract DOM from current page via content script
 */
export async function extractDOM(
    tabId: number,
    selector?: string,
    limit: number = 50,
    optimize: boolean = true
): Promise<DOMSnapshot | null> {
    try {
        const response = await chrome.tabs.sendMessage(tabId, {
            type: 'EXTRACT_DOM',
            selector,
            limit,
            optimize
        });

        if (response?.success && response?.data) {
            return response.data;
        }
        return null;
    } catch (e: any) {
        // Try to inject content script
        if (isConnectionError(e.message)) {
            return await retryWithInjection(tabId, selector, limit, optimize);
        }
        console.warn('[Aeyes] DOM extraction failed:', e.message);
        return null;
    }
}

/**
 * Extract DOM with retry logic
 */
export async function extractDOMWithRetry(maxAttempts: number = 2): Promise<DOMSnapshot | null> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return null;

    // Skip restricted pages
    if (tab.url && isRestrictedUrl(tab.url)) {
        console.log('[Aeyes] Skipping DOM extraction for restricted page');
        return null;
    }

    for (let i = 0; i < maxAttempts; i++) {
        const dom = await extractDOM(tab.id);
        if (dom) return dom;
        await new Promise(r => setTimeout(r, 500));
    }
    return null;
}

function isConnectionError(message: string): boolean {
    return message?.includes('message port closed') ||
        message?.includes('receiving end does not exist') ||
        message?.includes('Could not establish connection');
}

function isRestrictedUrl(url: string): boolean {
    return url.startsWith('chrome://') ||
        url.startsWith('edge://') ||
        url.startsWith('about:') ||
        url.startsWith('view-source:') ||
        url.includes('chrome.google.com/webstore');
}

async function retryWithInjection(
    tabId: number,
    selector?: string,
    limit: number = 50,
    optimize: boolean = true
): Promise<DOMSnapshot | null> {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
        });
        await new Promise(r => setTimeout(r, 300));

        const response = await chrome.tabs.sendMessage(tabId, {
            type: 'EXTRACT_DOM',
            selector,
            limit,
            optimize
        });

        if (response?.success && response?.data) {
            return response.data;
        }
    } catch (e: any) {
        console.warn('[Aeyes] Failed to inject for DOM extraction:', e.message);
    }
    return null;
}
