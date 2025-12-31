import { sendToBackend } from './api';
import { extractDOMWithRetry, capturePageContext } from '../lib/analysis';
import { executeActions, ExecutionCallbacks, Action, ActionResult } from '../lib/actionExecutor';

export interface PerceptionResult {
    domContext: any | null;
    pageContext: any;
    isProtected: boolean;
}

export interface CognitionResult {
    response: any;
    conversationId?: string;
}

export async function performPerception(): Promise<PerceptionResult> {
    const domContext = await extractDOMWithRetry();
    const pageContext = await capturePageContext();
    const isProtected = pageContext?.url?.startsWith('chrome://') || pageContext?.url?.startsWith('edge://') || false;

    return { domContext, pageContext, isProtected };
}

export async function performCognition(
    transcript: string,
    perception: PerceptionResult,
    conversationId?: string | null,
    signal?: AbortSignal
): Promise<CognitionResult> {
    const response = await sendToBackend({
        transcript,
        context: perception.domContext || undefined,
        page_context: perception.pageContext || undefined,
        conversation_id: conversationId || undefined
    }, signal);

    return {
        response,
        conversationId: response.conversation_id
    };
}

export async function performActionExecution(
    actions: Action[],
    callbacks: ExecutionCallbacks,
    signal?: AbortSignal
): Promise<ActionResult> {
    // We pass signal implicitly via callbacks.speak usually, but here we just delegate
    return await executeActions(actions, callbacks, signal);
}
