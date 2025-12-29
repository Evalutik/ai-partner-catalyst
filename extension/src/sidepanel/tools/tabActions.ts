/**
 * Tab management action handlers for Chrome extension
 */

export interface TabAction {
    type: string;
    value?: string;
    url?: string;
    tabId?: number;
    newTab?: boolean;
}

export interface ActionResult {
    success: boolean;
    message?: string;
}

/**
 * Handle tab-related actions (open, close, switch tabs)
 */
export async function handleTabAction(action: TabAction): Promise<ActionResult> {
    try {
        console.log('[Aeyes] Handling Tab Action:', action.type, action);

        if (action.type === 'open_tab' || (action.type === 'navigate' && action.newTab)) {
            const url = action.value || action.url || 'about:blank';
            await chrome.tabs.create({ url });
            return { success: true, message: `Opened new tab: ${url}` };
        }

        if (action.type === 'close_tab') {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id) {
                await chrome.tabs.remove(tab.id);
                return { success: true, message: 'Closed current tab' };
            }
        }

        if (action.type === 'switch_tab') {
            const tabs = await chrome.tabs.query({ currentWindow: true });
            const currentTab = tabs.find(t => t.active);
            if (!currentTab) return { success: false, message: 'No active tab' };

            let targetIndex = currentTab.index;
            if (action.value === 'next') targetIndex = (currentTab.index + 1) % tabs.length;
            else if (action.value === 'previous') targetIndex = (currentTab.index - 1 + tabs.length) % tabs.length;
            else if (action.tabId) {
                const target = tabs.find(t => t.id === action.tabId);
                if (target) {
                    await chrome.tabs.update(target.id!, { active: true });
                    return { success: true, message: `Switched to tab ${target.title}` };
                }
            }

            const targetTab = tabs.find(t => t.index === targetIndex);
            if (targetTab?.id) {
                await chrome.tabs.update(targetTab.id, { active: true });
                return { success: true, message: `Switched to tab ${targetTab.title}` };
            }
        }

        return { success: false, message: `Unknown tab action: ${action.type}` };
    } catch (e) {
        return { success: false, message: `Tab action failed: ${e}` };
    }
}
