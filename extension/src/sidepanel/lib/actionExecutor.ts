/**
 * Action Executor - Orchestrates execution of AI-planned actions
 * 
 * Routes actions to appropriate handlers via Strategy Pattern
 */

import { ACTION_HANDLERS } from './handlers';

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
    waitForInput?: boolean; // Signal to wait for user speech (used by ask)
    failedAction?: string;
    failReason?: string;
    lastDom?: any;
}

// Action categories for ordered execution
export const ACTION_CATEGORIES = {
    speech: ['say', 'ask'],
    plan: ['notify_plan'],
    mutative: ['click', 'type', 'scroll', 'navigate', 'open_tab', 'close_tab',
        'switch_tab', 'go_back', 'reload'],
    wait: ['wait'],
    perception: ['scan_page', 'fetch_dom', 'get_page_status']
};

interface CategorizedActions {
    speech: Action[];
    plan: Action[];
    mutative: Action[];
    wait: Action[];
    perception: Action[];
}

function categorizeActions(actions: Action[]): CategorizedActions {
    const result: CategorizedActions = {
        speech: [],
        plan: [],
        mutative: [],
        wait: [],
        perception: []
    };

    for (const action of actions) {
        if (ACTION_CATEGORIES.speech.includes(action.type)) {
            result.speech.push(action);
            // Sort: say first, then ask
            result.speech.sort((a, b) => {
                if (a.type === 'say' && b.type === 'ask') return -1;
                if (a.type === 'ask' && b.type === 'say') return 1;
                return 0;
            });
        } else if (ACTION_CATEGORIES.plan.includes(action.type)) {
            result.plan.push(action);
        } else if (ACTION_CATEGORIES.mutative.includes(action.type)) {
            result.mutative.push(action);
        } else if (ACTION_CATEGORIES.wait.includes(action.type)) {
            result.wait.push(action);
        } else if (ACTION_CATEGORIES.perception.includes(action.type)) {
            result.perception.push(action);
        } else {
            // Unknown action - treat as mutative (safest assumption)
            console.warn(`[Aeyes] Unknown action type '${action.type}', treating as mutative`);
            result.mutative.push(action);
        }
    }

    // Log warnings for exceeding limits
    if (result.speech.length > 2) {
        console.warn('[Aeyes] Too many speech actions detected, expected max 2 (say + ask)');
    }
    if (result.mutative.length > 1) {
        console.warn('[Aeyes] Multiple mutative actions detected, expected max 1');
    }

    return result;
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
 * Main action executor - processes actions in category order:
 * 1. Speech (say/ask) - user hears immediately
 * 2. Plan (notify_plan) - UI shows plan
 * 3. Mutative (click/type/navigate) - page changes
 * 4. Wait - pause if specified
 * 5. Perception (scan_page/fetch_dom) - verify result
 */
export async function executeActions(
    actions: Action[],
    callbacks: ExecutionCallbacks,
    signal?: AbortSignal
): Promise<ActionResult> {
    if (!actions || actions.length === 0) return { success: true };

    // Categorize and reorder actions
    const categorized = categorizeActions(actions);
    const orderedActions = [
        ...categorized.speech,
        ...categorized.plan,
        ...categorized.mutative,
        ...categorized.wait,
        ...categorized.perception
    ];

    console.log('[Aeyes] Executing actions in category order:',
        orderedActions.map(a => a.type).join(' → '));

    try {
        let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        let lastDom: any | null = null;

        for (let i = 0; i < orderedActions.length; i++) {
            if (signal?.aborted) {
                console.log('[Aeyes] Action execution aborted by signal');
                return { success: false, failReason: 'Aborted by user' };
            }

            const rawAction = orderedActions[i];
            const action: Action = {
                ...rawAction,
                ...(rawAction.args || {})
            };

            // Normalize url/value
            if (!action.value && action.url) action.value = action.url;

            console.log(`[Aeyes] Step ${i + 1}/${orderedActions.length}: ${action.type}`, action);

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

            // If action signals wait for user input (ask), return immediately
            // This happens after speech executes (ask is speech category)
            if (result.waitForInput) {
                console.log('[Aeyes] Action requests user input, pausing execution');
                return {
                    success: true,
                    waitForInput: true
                };
            }

            // Wait logic between actions
            if (i < orderedActions.length - 1) {
                if (signal?.aborted) return { success: false, failReason: 'Aborted by user' };

                const currentType = action.type;
                const nextAction = orderedActions[i + 1];
                const currentIsMutative = ACTION_CATEGORIES.mutative.includes(currentType);
                const nextIsPerception = ACTION_CATEGORIES.perception.includes(nextAction.type);

                // 2 second wait after mutative before perception (let page settle)
                if (currentIsMutative && nextIsPerception) {
                    console.log('[Aeyes] Waiting 2s for page to settle before analysis...');
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    // Normal 500ms pacing between other actions
                    await new Promise(r => setTimeout(r, 500));
                }
            }
        }

        console.log('[Aeyes] All actions completed');
        return {
            success: true,
            lastDom: lastDom || undefined
        };
    } catch (error: any) {
        console.error('[Aeyes] Execution failed:', error);
        return {
            success: false,
            failedAction: 'execution_error',
            failReason: `Unexpected error: ${error.message}`
        };
    }
}

