import { speak } from '../actions';
import { ActionHandler } from './types';

export const communicationHandler: ActionHandler = {
    canHandle: (type) => ['say', 'ask'].includes(type),
    execute: async (action, callbacks, context) => {
        const text = action.value || action.args?.text;
        if (text) {
            await speak(text, callbacks);
        }
        return { success: true };
    }
};
