import { goBack, reload, navigate } from '../actions';
import { ActionHandler, HandlerResult } from './types';

export const navigationHandler: ActionHandler = {
    canHandle: (type) => ['go_back', 'reload', 'navigate'].includes(type),
    execute: async (action, callbacks, context) => {
        const tabId = context.tab?.id;
        if (!tabId && action.type !== 'navigate') { // Navigate might create new tab
            return { success: false, failedAction: action.type, failReason: 'No active tab' };
        }

        let result: any = { success: true };
        let newTab: chrome.tabs.Tab | undefined;

        if (action.type === 'go_back' && tabId) {
            result = await goBack(tabId);
            newTab = result.newTab;
        } else if (action.type === 'reload' && tabId) {
            result = await reload(tabId);
            newTab = result.newTab;
        } else if (action.type === 'navigate' && action.value) {
            result = await navigate(
                action.value,
                tabId || 0,
                action.args?.newTab || false,
                action.waitForPage !== false
            );
            newTab = result.newTab;
        } else if (action.type === 'navigate' && !action.value) {
            return { success: false, failedAction: action.type, failReason: 'Navigation url missing' };
        }

        return {
            success: result.success !== false,
            updatedTab: newTab,
            failReason: result.message
        } as HandlerResult;
    }
};
