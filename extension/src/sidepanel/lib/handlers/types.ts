import { Action, ActionResult, ExecutionCallbacks } from '../actionExecutor';
import { executePageAction } from '../actions';

export interface HandlerResult extends ActionResult {
    updatedTab?: chrome.tabs.Tab;
}

export interface ActionHandler {
    canHandle: (actionType: string) => boolean;
    execute: (
        action: Action,
        callbacks: ExecutionCallbacks,
        context: {
            tab?: chrome.tabs.Tab;
            lastDom?: any;
        }
    ) => Promise<HandlerResult>;
}

export interface ActionContext {
    tab?: chrome.tabs.Tab;
    lastDom?: any;
}
