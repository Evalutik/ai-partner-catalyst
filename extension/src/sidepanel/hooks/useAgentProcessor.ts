import { useState, useRef, useCallback, useMemo } from 'react';
import { SpeakerState } from './useSpeaker';
import { AgentControlRefs, AgentLoopCallbacks } from './useAgentLoop';
import { performPerception, performCognition, performActionExecution } from '../services/agentSteps';
import { checkInfiniteLoop, detectPlanLoop, LoopDetectionState } from './agentProcessorUtils';
import { playListeningSound } from '../services/audioCues';

// ============================================================================
// Types
// ============================================================================

interface PageState {
    domContext: any;
    pageContext: any;
    isProtected: boolean;
}

interface ConversationContext {
    signal: AbortSignal;
    speaker: SpeakerState;
    callbacks: AgentLoopCallbacks;
    controls: AgentControlRefs;
    lastPlanTextRef: React.MutableRefObject<string>;
    setConversationId: (id: string) => void;
    setWaitingForInput: (val: boolean) => void;
    waitingForInputRef: React.MutableRefObject<boolean>;
    setProcessingState: (val: boolean) => void;
    resetConversation: () => void;
}

// ============================================================================
// Pure Functions
// ============================================================================

function shouldEndConversation(response: any): boolean {
    if (!response) return true;
    const actions = response.actions || [];
    const isCompleted = response.completed === true;
    return isCompleted || actions.length === 0;
}

function getNextTranscript(actionFailed: boolean, failureMessage: string): string {
    if (actionFailed) {
        return failureMessage;
    }
    return "[Continue task if not finished. When done: use ask() to offer more help. Send empty actions and completed:true if no help is needed.]";
}

// ============================================================================
// Main Conversation Loop
// ============================================================================

async function runConversationLoop(
    initialTranscript: string,
    initialConversationId: string | null,
    ctx: ConversationContext
): Promise<boolean> { // Returns true if waiting for input, false if completed
    const MAX_STEPS = 30;
    const MAX_FAILURES = 3;
    const MAX_PLAN_REPEATS = 3;

    let transcript = initialTranscript;
    let conversationId = initialConversationId;
    let pageState: PageState | null = null;
    let failureCount = 0;
    let loopState: LoopDetectionState = { samePlanRepeatCount: 0, lastPlanText: ctx.lastPlanTextRef.current };

    for (let step = 0; step < MAX_STEPS; step++) {
        if (ctx.controls.stoppedManuallyRef.current || ctx.signal.aborted) break;

        // ═══════════════════════════════════════════════════════════════════
        // 1. CAPTURE - Get current page state
        // ═══════════════════════════════════════════════════════════════════
        if (!pageState) {
            const perception = await performPerception();
            const loopWarning = checkInfiniteLoop(step, perception);
            if (loopWarning) {
                await ctx.speaker.speak(loopWarning, ctx.signal);
                break;
            }
            pageState = perception;
        }

        if (ctx.signal.aborted) break;

        // ═══════════════════════════════════════════════════════════════════
        // 2. SEND - Ask AI what to do
        // ═══════════════════════════════════════════════════════════════════
        const cognition = await performCognition(transcript, pageState, conversationId, ctx.signal);
        const response = cognition.response;

        if (cognition.conversationId && cognition.conversationId !== conversationId) {
            conversationId = cognition.conversationId;
            ctx.setConversationId(conversationId);
        }

        if (ctx.controls.stoppedManuallyRef.current) break;

        // Plan loop detection
        loopState = detectPlanLoop(response.actions, loopState, MAX_PLAN_REPEATS);

        // ═══════════════════════════════════════════════════════════════════
        // 3. CHECK - Should we end?
        // ═══════════════════════════════════════════════════════════════════
        if (shouldEndConversation(response)) {
            console.log('[Aeyes] Conversation complete');
            break;
        }

        // ═══════════════════════════════════════════════════════════════════
        // 4. EXECUTE - Do what AI asked
        // ═══════════════════════════════════════════════════════════════════
        const actionResult = await performActionExecution(response.actions, {
            onPlan: ctx.callbacks.onPlan,
            onStatusChange: ctx.callbacks.onStatusChange,
            speak: (t) => ctx.speaker.speak(t, ctx.signal),
            getLastShownPlan: () => ctx.lastPlanTextRef.current,
            setLastShownPlan: (p) => { ctx.lastPlanTextRef.current = p; }
        }, ctx.signal);

        // Post-analysis if any
        if (actionResult.success && response.post_analysis?.length > 0) {
            await new Promise(r => setTimeout(r, 500));
            const postResult = await performActionExecution(response.post_analysis, {
                speak: (t) => ctx.speaker.speak(t, ctx.signal)
            });
            if (postResult.lastDom) {
                actionResult.lastDom = postResult.lastDom;
            }
        }

        if (ctx.controls.stoppedManuallyRef.current) break;

        // ═══════════════════════════════════════════════════════════════════
        // 5. HANDLE - Process result
        // ═══════════════════════════════════════════════════════════════════

        // Handle wait for user input (ask action)
        if (actionResult.waitForInput) {
            console.log('[Aeyes] Waiting for user input');
            ctx.setWaitingForInput(true);
            ctx.waitingForInputRef.current = true;

            // Play cue sound to indicate it's user's turn
            await playListeningSound();

            await ctx.callbacks.startAudioVisualization();
            ctx.callbacks.startListening();
            ctx.callbacks.onStatusChange('listening');
            ctx.setProcessingState(false);
            return true; // Return true = waiting for input (early exit)
        }

        // Handle failure
        if (!actionResult.success) {
            failureCount++;
            if (failureCount >= MAX_FAILURES) {
                throw new Error(`Failed after ${MAX_FAILURES} attempts: ${actionResult.failReason}`);
            }
            console.log('[Aeyes] Action failed:', actionResult.failReason);
            transcript = `[ACTION_FAILED] I tried to "${actionResult.failedAction}" but it failed: ${actionResult.failReason}. Suggest recovery.`;
            // Keep same pageState for retry
            continue;
        }

        failureCount = 0; // Reset on success

        // ═══════════════════════════════════════════════════════════════════
        // 6. PREPARE - Get ready for next iteration
        // ═══════════════════════════════════════════════════════════════════

        // Capture new page state (use AI's analysis if available)
        if (actionResult.lastDom) {
            console.log('[Aeyes] Using DOM from AI analysis');
            const perception = await performPerception();
            pageState = { domContext: actionResult.lastDom, pageContext: perception.pageContext, isProtected: false };
        } else {
            pageState = null; // Will be captured at start of next iteration
        }

        transcript = getNextTranscript(false, '');

        // Pacing delay
        await new Promise(r => setTimeout(r, 1500));
    }

    // Loop ended - cleanup (only if not waiting for input)
    ctx.resetConversation();
    return false; // Return false = loop completed normally
}

// ============================================================================
// Main Hook
// ============================================================================

export function useAgentProcessor(
    speaker: SpeakerState,
    callbacks: AgentLoopCallbacks,
    controls: AgentControlRefs
) {
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);
    const [waitingForInput, setWaitingForInput] = useState(false);
    const processingRef = useRef(false);
    const waitingForInputRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const lastPlanTextRef = useRef<string>('');

    const setProcessingState = useCallback((val: boolean) => {
        setProcessing(val);
        processingRef.current = val;
    }, []);

    const cancelRequests = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    }, []);

    const resetConversation = useCallback(() => {
        setConversationId(null);
        callbacks.onClearPlan();
        lastPlanTextRef.current = '';
    }, [callbacks]);

    const processTranscript = useCallback(async (text: string) => {
        if (processingRef.current) return;
        setProcessingState(true);

        // Reset state
        setWaitingForInput(false);
        waitingForInputRef.current = false;
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        callbacks.abortListening();

        // Capitalize for UI
        const capitalizedText = text.charAt(0).toUpperCase() + text.slice(1);
        callbacks.onTranscript(capitalizedText);
        callbacks.onStatusChange('processing');

        // Build context
        const ctx: ConversationContext = {
            signal,
            speaker,
            callbacks,
            controls,
            lastPlanTextRef,
            setConversationId,
            setWaitingForInput,
            waitingForInputRef,
            setProcessingState,
            resetConversation
        };

        try {
            const isWaitingForInput = await runConversationLoop(capitalizedText, conversationId, ctx);

            // Post-loop: enter standby (only if NOT waiting for user input)
            if (!isWaitingForInput && !controls.stoppedManuallyRef.current && !signal.aborted) {
                await new Promise(r => setTimeout(r, 1000));
                callbacks.onStatusChange('idle');
            }
        } catch (err: any) {
            if (err?.name === 'AbortError') {
                callbacks.onStatusChange('idle');
                resetConversation();
            } else {
                console.error('[Aeyes] Process failed:', err);
                const errorMsg = err instanceof Error ? err.message : 'Unknown error';
                await speaker.speak("I'm having trouble. " + errorMsg, signal);
                callbacks.onStatusChange('idle');
            }
        } finally {
            setProcessingState(false);
            abortControllerRef.current = null;
        }
    }, [conversationId, controls, speaker, callbacks, resetConversation, setProcessingState]);

    return useMemo(() => ({
        processing,
        waitingForInput,
        waitingForInputRef,
        conversationId,
        processTranscript,
        cancelRequests,
        resetConversation
    }), [processing, waitingForInput, conversationId, processTranscript, cancelRequests, resetConversation]);
}
