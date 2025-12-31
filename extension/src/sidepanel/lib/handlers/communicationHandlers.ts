import { speak } from '../actions';
import { ActionHandler } from './types';

export const communicationHandler: ActionHandler = {
    canHandle: (type) => ['say', 'ask'].includes(type),
    execute: async (action, callbacks, context) => {
        const text = action.value || action.args?.text;
        if (text) {
            await speak(text, callbacks);
        }
        // ask signals the system to wait for user speech input
        return {
            success: true,
            waitForInput: action.type === 'ask'
        };
    }
};
