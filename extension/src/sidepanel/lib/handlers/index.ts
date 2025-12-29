import { ActionHandler } from './types';
import { browserHandler } from './browserHandlers';
import { navigationHandler } from './navigationHandlers';
import { domHandler } from './domHandlers';
import { communicationHandler } from './communicationHandlers';
import { systemHandler } from './systemHandlers';
import { interactionHandler } from './interactionHandlers';

// Order matters! interactionHandler is catch-all.
export const ACTION_HANDLERS: ActionHandler[] = [
    browserHandler,
    navigationHandler,
    domHandler,
    communicationHandler,
    systemHandler,
    interactionHandler
];
