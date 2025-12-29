/**
 * Action Executor - Orchestrates execution of AI-planned actions
 * 
 * Routes actions to appropriate handlers via Strategy Pattern
 */

import { ACTION_HANDLERS } from './handlers';
import { ActionHandler } from './handlers/types';

// Types (re-exported or defined here if not circular)
// We need to keep Action/ActionResult exports if used by other files
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

export interface SpeakCallbacks {
    speak: (text: string, signal?: AbortSignal) => Promise<void>;
}

export interface ExecutionCallbacks extends SpeakCallbacks {
    onPlan?: (text: string) => void;
    onStatusChange?: (status: any) => void; // Added to match usage in useAgentLoop/Processor
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

            console.log(`[Aeyes] Step ${i + 1}/${actions.length}: ${action.type}`, action);

            // Find Handler
            const handler = ACTION_HANDLERS.find(h => h.canHandle(action.type));

            if (!handler) {
                return {
                    success: false,
                    failedAction: action.type,
                    failReason: `No handler found for action type: ${action.type}`
                };
            }

            // Execute
            const result = await handler.execute(action, callbacks, { tab, lastDom });

            // Update Context
            if (result.updatedTab) {
                tab = result.updatedTab;
            }
            if (result.lastDom) {
                lastDom = result.lastDom;
            }

            if (!result.success) {
                return result;
            }

            // Wait a bit (mostly for UX pacing between actions)
            if (i < actions.length - 1) {
                await new Promise(r => setTimeout(r, 500));
            }
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

