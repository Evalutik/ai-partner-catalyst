import { handleTabAction } from '../actions';
import { ActionHandler, HandlerResult } from './types';

export const browserHandler: ActionHandler = {
    canHandle: (type) => ['open_tab', 'close_tab', 'switch_tab'].includes(type),
    execute: async (action, callbacks, context) => {
        const result = await handleTabAction(action);

        if (!result.success) {
            return {
                success: false,
                failedAction: action.description || action.type,
                failReason: result.message
            };
        }

        // Wait for tab update
        await new Promise(r => setTimeout(r, 500));
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        return {
            success: true,
            updatedTab: tab
        } as HandlerResult;
    }
};
