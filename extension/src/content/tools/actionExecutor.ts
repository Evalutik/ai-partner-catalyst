import { Action, ActionResult } from '../types';
import { actionClick, actionType, actionScroll, actionFocus } from './actions/interactionActions';
import { actionNavigate } from './actions/navigationActions';
import { actionSearch, actionRead } from './actions/searchActions';

export async function executeAction(action: Action): Promise<ActionResult> {
    console.log('[Aeyes Content] Executing action:', action);

    try {
        switch (action.type) {
            case 'click':
                return await actionClick(action.elementId!, action.description);
            case 'type':
                return actionType(action.elementId!, action.value!, action.submit);
            case 'scroll':
                return actionScroll(action.value);
            case 'navigate':
                return actionNavigate(action.value!); // value is url
            case 'focus':
                return actionFocus(action.elementId!);
            case 'search':
                return await actionSearch(action.value!); // value is query
            case 'read':
                return actionRead(action.elementId!);
            default:
                return { success: false, message: `Unknown action type: ${(action as any).type}` };
        }
    } catch (e: any) {
        console.error('[Aeyes Content] Action error:', e);
        return { success: false, message: `Action execution failed: ${e.message}` };
    }
}
