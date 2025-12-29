// Content script - injected into web pages for DOM extraction and action execution
import { extractDOM, extractClusteredDOM, scanPage } from './tools/analysis/dom';
import { getPageStatus } from './tools/analysis/pageStatus';
import { executeAction } from './tools/actionExecutor';
import { Action } from './types';

// Message listener - responds to requests from popup/background
chrome.runtime.onMessage.addListener(
    (
        message: { type: string;[key: string]: unknown },
        _sender,
        sendResponse
    ) => {
        if (message.type === 'PING') {
            sendResponse({ status: 'ok', url: window.location.href });
            return true;
        }

        if (message.type === 'EXTRACT_DOM') {
            const clusteredDom = extractClusteredDOM();
            sendResponse({
                success: true,
                data: clusteredDom
            });
            return true;
        }

        if (message.type === 'EXTRACT_DOM_LEGACY') {
            const dom = extractDOM();
            sendResponse({
                success: true,
                data: dom
            });
            return true;
        }

        if (message.type === 'GET_PAGE_STATUS' || message.type === 'GET_STATUS') {
            sendResponse(getPageStatus());
            return true;
        }

        if (message.type === 'EXECUTE_ACTION') {
            executeAction(message.action as Action).then(result => sendResponse(result));
            return true;
        }
    }
);

/* data types - moved to types.ts */

// Global exposure for debugging
(window as any).extractDOM = extractDOM;
(window as any).extractClusteredDOM = extractClusteredDOM;
(window as any).scanPage = scanPage;
(window as any).getPageStatus = getPageStatus;
(window as any).executeAction = executeAction;
