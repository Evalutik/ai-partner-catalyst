/**
 * Tab Actions - Open, close, switch tabs
 */

export interface TabActionResult {
    success: boolean;
    message?: string;
    tabId?: number;
}

/**
 * Open a new tab with given URL
 */
export async function openTab(url: string): Promise<TabActionResult> {
    try {
        let normalizedUrl = url;
        if (!normalizedUrl.startsWith('http')) {
            normalizedUrl = 'https://' + normalizedUrl;
        }
        const tab = await chrome.tabs.create({ url: normalizedUrl, active: true });
        return { success: true, tabId: tab.id };
    } catch (e: any) {
        return { success: false, message: e.message || 'Failed to open tab' };
    }
}

/**
 * Close a tab by ID or current tab
 */
export async function closeTab(tabId?: number): Promise<TabActionResult> {
    try {
        if (tabId) {
            await chrome.tabs.remove(tabId);
        } else {
            const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (current?.id) await chrome.tabs.remove(current.id);
        }
        return { success: true };
    } catch (e: any) {
        return { success: false, message: e.message || 'Failed to close tab' };
    }
}

/**
 * Switch to a tab by ID or title/URL pattern
 */
export async function switchTab(target: string | number): Promise<TabActionResult> {
    try {
        if (typeof target === 'number') {
            await chrome.tabs.update(target, { active: true });
            return { success: true, tabId: target };
        }

        // Search by title or URL
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const targetLower = target.toLowerCase();
        const found = tabs.find(t =>
            t.title?.toLowerCase().includes(targetLower) ||
            t.url?.toLowerCase().includes(targetLower)
        );

        if (found?.id) {
            await chrome.tabs.update(found.id, { active: true });
            return { success: true, tabId: found.id };
        }
        return { success: false, message: `No tab found matching: ${target}` };
    } catch (e: any) {
        return { success: false, message: e.message || 'Failed to switch tab' };
    }
}

/**
 * Handle legacy tab action format
 */
export async function handleTabAction(action: { type: string; value?: string; tabId?: number }): Promise<TabActionResult> {
    switch (action.type) {
        case 'open_tab':
            return openTab(action.value || 'about:blank');
        case 'close_tab':
            return closeTab(action.tabId);
        case 'switch_tab':
            return switchTab(action.value || action.tabId || '');
        default:
            return { success: false, message: `Unknown tab action: ${action.type}` };
    }
}
