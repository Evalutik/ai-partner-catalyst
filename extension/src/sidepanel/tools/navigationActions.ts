/**
 * Navigation action handlers - go_back, reload, navigate
 */

export interface NavigationResult {
    success: boolean;
    newTab?: chrome.tabs.Tab;
    message?: string;
}

/**
 * Handle navigate action - goes to a URL in current or new tab
 */
export async function handleNavigateAction(
    url: string,
    tabId: number,
    openInNewTab: boolean = false,
    waitForPage: boolean = true
): Promise<NavigationResult> {
    try {
        let normalizedUrl = url;
        if (!normalizedUrl.startsWith('http')) {
            normalizedUrl = 'https://' + normalizedUrl;
        }

        if (openInNewTab) {
            const newTab = await chrome.tabs.create({ url: normalizedUrl });
            return { success: true, newTab };
        } else {
            await chrome.tabs.update(tabId, { url: normalizedUrl });
        }

        if (waitForPage) {
            await new Promise(r => setTimeout(r, 2000));
        }

        // Refresh tab reference
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return { success: true, newTab: tab };
    } catch (e: any) {
        return { success: false, message: e.message || 'Navigation failed' };
    }
}

/**
 * Handle go_back action - navigates to previous page in history
 */
export async function handleGoBackAction(tabId: number): Promise<NavigationResult> {
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
 * Handle reload action - refreshes the current page
 */
export async function handleReloadAction(tabId: number): Promise<NavigationResult> {
    try {
        await chrome.tabs.reload(tabId);
        await new Promise(r => setTimeout(r, 1500));
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return { success: true, newTab: tab };
    } catch (e: any) {
        return { success: false, message: e.message || 'Reload failed' };
    }
}

/**
 * Check if a URL is a restricted browser page
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

/**
 * List of action types that are safe on restricted pages
 */
export const SAFE_ACTIONS_ON_RESTRICTED = [
    'navigate', 'open_tab', 'switch_tab', 'say', 'ask', 'wait',
    'close_tab', 'scan_page', 'notify_plan', 'go_back', 'reload'
];
