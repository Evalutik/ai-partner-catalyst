/**
 * Page Context - Lightweight page information capture
 */

export interface PageContext {
    url: string;
    title: string;
    width: number;
    height: number;
    tabId?: number;
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
 * Get page loading status
 */
export async function getPageStatus(tabId: number): Promise<{ ready: boolean; status?: string }> {
    try {
        const response = await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_STATUS' });
        return { ready: response?.ready || false, status: response?.status };
    } catch (e) {
        return { ready: false, status: 'error' };
    }
}

/**
 * Check if current page is a restricted browser page
 */
export function isRestrictedPage(url: string): boolean {
    return (
        url.startsWith('chrome://') ||
        url.startsWith('edge://') ||
        url.startsWith('about:') ||
        url.startsWith('view-source:') ||
        url.includes('chrome.google.com/webstore')
    );
}
