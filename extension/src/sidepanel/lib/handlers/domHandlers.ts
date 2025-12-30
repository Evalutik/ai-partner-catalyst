import { extractDOM } from '../analysis';
import { ActionHandler } from './types';

export const domHandler: ActionHandler = {
    canHandle: (type) => ['fetch_dom', 'get_page_status'].includes(type),
    execute: async (action, callbacks, context) => {
        const tabId = context.tab?.id;

        if (action.type === 'fetch_dom' && tabId) {
            const dom = await extractDOM(
                tabId,
                action.args?.selector,
                action.args?.limit || 50,
                action.args?.optimize ?? true
            );
            return { success: true, lastDom: dom || undefined };
        }

        if (action.type === 'get_page_status' && tabId) {
            try {
                await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_STATUS' });
            } catch (e) {
                console.warn('[Aeyes] get_page_status failed:', e);
            }
            return { success: true };
        }

        return { success: true };
    }
};
