import { extractDOM } from '../analysis';
import { resolveElement, executePageAction, isRestrictedPage, SAFE_ACTIONS_ON_RESTRICTED } from '../actions';
import { ActionHandler } from './types';

export const interactionHandler: ActionHandler = {
    // Catch-all for other actions, but strictly validation can be done inside or by checking known types
    // For now, if it's not handled by others, we assume it's a page interaction or invalid.
    // Ideally we should list them: click, type, scroll, hover, submit, etc.
    // But for modularity, let's treat this as the "Default Page Action Handler"
    canHandle: (type) => true,
    execute: async (action, callbacks, context) => {
        const tab = context.tab;
        if (!tab || !tab.id) {
            return { success: false, failedAction: action.type, failReason: 'No active tab' };
        }

        const actionName = action.description || action.type;

        // Safety Check
        if (tab.url && isRestrictedPage(tab.url)) {
            if (!SAFE_ACTIONS_ON_RESTRICTED.includes(action.type)) {
                return {
                    success: false,
                    failedAction: actionName,
                    failReason: 'Cannot interact with protected browser page.'
                };
            }
        }

        // Element Resolution
        if (action.needsDom && action.description) {
            // We use context.lastDom if available, or fetch new?
            // Original code fetched new DOM: const dom = await extractDOM(tab.id);
            // Updating lastDom is side effect.

            const dom = await extractDOM(tab.id);
            if (dom) {
                // Return updated lastDom to context? Yes via result.
                const resolved = await resolveElement(dom, action.type, action.description, action.value);
                if (resolved.success && resolved.elementId) {
                    action.elementId = resolved.elementId;
                } else {
                    return { success: false, failedAction: actionName, failReason: resolved.message || 'Resolution failed', lastDom: dom };
                }

                // Proceed with execution using the resolved ID
                // Note: we must return the DOM so context tracks it
                const pageResult = await executePageAction(action, tab.id);
                return { ...pageResult, lastDom: dom };

            } else {
                return { success: false, failedAction: actionName, failReason: 'Could not fetch DOM' };
            }
        }

        const pageResult = await executePageAction(action, tab.id);

        // Wait a bit after action (original code had 500ms wait at loop end)
        // We can include that here or in executor.

        return pageResult;
    }
};
