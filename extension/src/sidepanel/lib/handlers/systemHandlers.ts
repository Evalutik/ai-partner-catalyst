import { ActionHandler } from './types';

export const systemHandler: ActionHandler = {
    canHandle: (type) => ['wait', 'scan_page', 'notify_plan'].includes(type),
    execute: async (action, callbacks, context) => {
        if (action.type === 'wait') {
            const duration = parseInt(action.value || action.args?.duration || '1000');
            await new Promise(r => setTimeout(r, duration));
        } else if (action.type === 'scan_page') {
            await new Promise(r => setTimeout(r, 500));
        } else if (action.type === 'notify_plan') {
            const planText = action.value || action.args?.plan || action.args?.text || (action as any).plan;
            if (planText && planText !== callbacks.getLastShownPlan?.()) {
                console.log('[Aeyes Plan]', planText);
                callbacks.setLastShownPlan?.(planText);
                callbacks.onPlan?.(planText);
                // Proactive Speech: Start speaking immediately without awaiting!
                callbacks.speak?.(planText).catch(e => console.warn('[Aeyes] Proactive speech failed:', e));
            }
        }
        return { success: true };
    }
};
