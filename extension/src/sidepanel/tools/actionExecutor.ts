/**
 * Action Executor - Orchestrates execution of AI-planned actions
 * 
 * Routes actions to appropriate handlers in:
 * - actions/ - Tab, navigation, page DOM interactions
 * - analysis/ - DOM extraction, page context
 */

// Action handlers
import { handleTabAction, navigate, goBack, reload, isRestrictedPage, SAFE_ACTIONS_ON_RESTRICTED, speak, resolveElement, executePageAction } from './actions';
import type { SpeakCallbacks } from './actions';

// Analysis handlers  
import { extractDOM } from './analysis';

// Types
export interface Action {
    type: string;
    elementId?: string;
    value?: string;
    url?: string;
    waitForPage?: boolean;
    needsDom?: boolean;
    description?: string;
    tabId?: number;
    args?: Record<string, any>;
}

export interface ActionResult {
    success: boolean;
    failedAction?: string;
    failReason?: string;
    lastDom?: any;
}

export interface ExecutionCallbacks extends SpeakCallbacks {
    onPlan?: (text: string) => void;
    getLastShownPlan?: () => string;
    setLastShownPlan?: (plan: string) => void;
}

/**
 * Main action executor - processes array of actions sequentially
 */
export async function executeActions(
    actions: Action[],
    callbacks: ExecutionCallbacks
): Promise<ActionResult> {
    if (!actions || actions.length === 0) return { success: true };

    try {
        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        let lastDom: any | null = null;

        for (let i = 0; i < actions.length; i++) {
            const rawAction = actions[i];
            const action: Action = {
                ...rawAction,
                ...(rawAction.args || {})
            };

            // Normalize url/value
            if (!action.value && action.url) action.value = action.url;

            const actionName = action.description || action.type;

            // Safety: Block unsafe actions on restricted pages
            if (tab?.url && isRestrictedPage(tab.url)) {
                if (!SAFE_ACTIONS_ON_RESTRICTED.includes(action.type)) {
                    return {
                        success: false,
                        failedAction: actionName,
                        failReason: 'Cannot interact with protected browser page.'
                    };
                }
            }

            console.log(`[Aeyes] Step ${i + 1}/${actions.length}: ${action.type}`, action);

            // 1. Tab Actions
            if (['open_tab', 'close_tab', 'switch_tab'].includes(action.type)) {
                const result = await handleTabAction(action);
                if (!result.success) {
                    return { success: false, failedAction: actionName, failReason: result.message };
                }
                await new Promise(r => setTimeout(r, 500));
                [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                continue;
            }

            // 2. Communication Actions
            if (['say', 'ask'].includes(action.type)) {
                const text = action.value || action.args?.text;
                if (text) await speak(text, callbacks);
                continue;
            }

            // 3. Wait/Scan Actions
            if (action.type === 'wait') {
                const duration = parseInt(action.value || action.args?.duration || '1000');
                await new Promise(r => setTimeout(r, duration));
                continue;
            }
            if (action.type === 'scan_page') {
                await new Promise(r => setTimeout(r, 500));
                continue;
            }

            // 4. Plan Notification
            if (action.type === 'notify_plan') {
                const planText = action.value || action.args?.plan || action.args?.text || (action as any).plan;
                if (planText && planText !== callbacks.getLastShownPlan?.()) {
                    console.log('[Aeyes Plan]', planText);
                    callbacks.setLastShownPlan?.(planText);
                    callbacks.onPlan?.(planText);
                    await new Promise(r => setTimeout(r, 500));
                }
                continue;
            }

            // 5. Navigation Actions
            if (action.type === 'go_back' && tab?.id) {
                const result = await goBack(tab.id);
                if (result.newTab) tab = result.newTab;
                continue;
            }
            if (action.type === 'reload' && tab?.id) {
                const result = await reload(tab.id);
                if (result.newTab) tab = result.newTab;
                continue;
            }
            if (action.type === 'navigate' && action.value) {
                const result = await navigate(
                    action.value,
                    tab?.id || 0,
                    action.args?.newTab || false,
                    action.waitForPage !== false
                );
                if (result.newTab) tab = result.newTab;
                continue;
            }

            // 6. DOM/Analysis Actions
            if (action.type === 'fetch_dom' && tab?.id) {
                const dom = await extractDOM(
                    tab.id,
                    action.args?.selector,
                    action.args?.limit || 50,
                    action.args?.optimize ?? true
                );
                if (dom) lastDom = dom;
                continue;
            }
            if (action.type === 'get_page_status' && tab?.id) {
                try {
                    await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_STATUS' });
                } catch (e) {
                    console.warn('[Aeyes] get_page_status failed:', e);
                }
                continue;
            }

            // 7. Page Actions (click, type, etc)
            if (!tab?.id) {
                return { success: false, failedAction: actionName, failReason: 'No active tab' };
            }

            // Resolve element if needed
            if (action.needsDom && action.description) {
                const dom = await extractDOM(tab.id);
                if (dom) {
                    lastDom = dom;
                    const resolved = await resolveElement(dom, action.type, action.description, action.value);
                    if (resolved.success && resolved.elementId) {
                        action.elementId = resolved.elementId;
                    } else {
                        return { success: false, failedAction: actionName, failReason: resolved.message || 'Resolution failed' };
                    }
                } else {
                    return { success: false, failedAction: actionName, failReason: 'Could not fetch DOM' };
                }
            }

            const pageResult = await executePageAction(action, tab.id);
            if (!pageResult.success) return { ...pageResult, lastDom };

            await new Promise(r => setTimeout(r, 500));
        }

        console.log('[Aeyes] All actions completed');
        return { success: true, lastDom: lastDom || undefined };
    } catch (error: any) {
        console.error('[Aeyes] Execution failed:', error);
        return {
            success: false,
            failedAction: 'execution_error',
            failReason: `Unexpected error: ${error.message}`
        };
    }
}
