/**
 * Navigation Actions - Navigate, go back, reload, check restricted pages
 */

export interface NavigationResult {
    success: boolean;
    newTab?: chrome.tabs.Tab;
    message?: string;
}

/**
 * URLs that are browser-restricted (no content script access)
 */
const RESTRICTED_PATTERNS = [
    'chrome://',
    'edge://',
    'about:',
    'view-source:',
    'chrome.google.com/webstore'
];

/**
 * Actions safe to run on restricted pages
 */
export const SAFE_ACTIONS_ON_RESTRICTED = [
    'navigate', 'open_tab', 'switch_tab', 'say', 'ask', 'wait',
    'close_tab', 'scan_page', 'notify_plan', 'go_back', 'reload'
];

/**
 * Check if URL is a restricted browser page
 */
export function isRestrictedPage(url: string): boolean {
    return RESTRICTED_PATTERNS.some(pattern => url.includes(pattern));
}

/**
 * Navigate to URL in current or new tab
 */
export async function navigate(
    url: string,
    tabId: number,
    openInNewTab: boolean = false,
    waitForLoad: boolean = true
): Promise<NavigationResult> {
    try {
        let normalizedUrl = url;
        if (!normalizedUrl.startsWith('http')) {
            normalizedUrl = 'https://' + normalizedUrl;
        }

        if (openInNewTab) {
            const newTab = await chrome.tabs.create({ url: normalizedUrl });
            return { success: true, newTab };
        }

        await chrome.tabs.update(tabId, { url: normalizedUrl });

        if (waitForLoad) {
            await new Promise(r => setTimeout(r, 2000));
        }

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return { success: true, newTab: tab };
    } catch (e: any) {
        return { success: false, message: e.message || 'Navigation failed' };
    }
}

/**
 * Navigate back in history
 */
export async function goBack(tabId: number): Promise<NavigationResult> {
    try {
        await chrome.tabs.goBack(tabId);
        await new Promise(r => setTimeout(r, 1000));
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return { success: true, newTab: tab };
    } catch (e: any) {
        return { success: false, message: e.message || 'Go back failed' };
    }
}

/**
 * Reload current page
 */
export async function reload(tabId: number): Promise<NavigationResult> {
    try {
        await chrome.tabs.reload(tabId);
        await new Promise(r => setTimeout(r, 1500));
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return { success: true, newTab: tab };
    } catch (e: any) {
        return { success: false, message: e.message || 'Reload failed' };
    }
}
