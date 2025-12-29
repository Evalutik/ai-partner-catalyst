import { useState, useRef, useCallback, useMemo } from 'react';
import { SpeakerState } from './useSpeaker';
import { AgentControlRefs, AgentLoopCallbacks } from './useAgentLoop';
import { performPerception, performCognition, performActionExecution } from '../services/agentSteps';
import { checkInfiniteLoop, detectPlanLoop, determineFinalResponse, LoopDetectionState } from './agentProcessorUtils';

export function useAgentProcessor(
    speaker: SpeakerState,
    callbacks: AgentLoopCallbacks,
    controls: AgentControlRefs
) {
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);
    const processingRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const lastPlanTextRef = useRef<string>('');

    // Sync refs with state
    const setProcessingState = (val: boolean) => {
        setProcessing(val);
        processingRef.current = val;
    };

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

        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        callbacks.abortListening();

        // Capitalize for UI
        const capitalizedText = text.charAt(0).toUpperCase() + text.slice(1);
        callbacks.onTranscript(capitalizedText);
        callbacks.onStatusChange('processing');

        const MAX_TOTAL_STEPS = 30;
        const MAX_CONSECUTIVE_FAILURES = 3;
        const MAX_SAME_PLAN_REPEATS = 3;

        let stepCount = 0;
        let consecutiveFailures = 0;
        const loopState: LoopDetectionState = {
            samePlanRepeatCount: 0,
            lastPlanText: lastPlanTextRef.current
        };
        let currentTranscript = capitalizedText;
        let finalResponseText = '';
        let currentConversationId = conversationId;

        try {
            while (stepCount < MAX_TOTAL_STEPS) {
                if (controls.stoppedManuallyRef.current) break;
                stepCount++;

                // 1. Perception
                const perception = await performPerception();

                // Loop Safety Check
                const loopWarning = checkInfiniteLoop(stepCount, perception);
                if (loopWarning) {
                    finalResponseText = loopWarning;
                    break;
                }

                if (signal.aborted) break;

                // 2. Cognition (Backend)
                const cognition = await performCognition(
                    currentTranscript,
                    perception,
                    currentConversationId,
                    signal
                );

                const response = cognition.response;
                if (cognition.conversationId) {
                    currentConversationId = cognition.conversationId;
                    if (!conversationId) setConversationId(currentConversationId);
                }

                if (controls.stoppedManuallyRef.current) break;

                // Plan Loop Detection
                const newLoopState = detectPlanLoop(response.actions, loopState, MAX_SAME_PLAN_REPEATS);
                // Update local state
                loopState.samePlanRepeatCount = newLoopState.samePlanRepeatCount;
                loopState.lastPlanText = newLoopState.lastPlanText;

                // 3. Action Execution
                let actionResult = { success: true } as any;
                if (response.actions && response.actions.length > 0) {
                    actionResult = await performActionExecution(response.actions, {
                        onPlan: callbacks.onPlan,
                        onStatusChange: callbacks.onStatusChange,
                        speak: (t) => speaker.speak(t, signal),
                        getLastShownPlan: () => lastPlanTextRef.current,
                        setLastShownPlan: (p) => { lastPlanTextRef.current = p; }
                    }, signal);
                }

                // 3b. Post-Analysis
                if (actionResult.success && response.post_analysis && response.post_analysis.length > 0) {
                    await new Promise(r => setTimeout(r, 500));
                    await performActionExecution(response.post_analysis, {
                        speak: (t) => speaker.speak(t, signal)
                    });
                }

                if (controls.stoppedManuallyRef.current) break;

                // 4. Failure Handling
                if (!actionResult.success) {
                    consecutiveFailures++;
                    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                        throw new Error(`Failed after ${MAX_CONSECUTIVE_FAILURES} attempts: ${actionResult.failReason}`);
                    }
                    console.log(`[Aeyes] Action failed:`, actionResult.failReason);
                    currentTranscript = `[ACTION_FAILED] I tried to "${actionResult.failedAction}" but it failed: ${actionResult.failReason}. Suggest recovery.`;
                    continue;
                }

                consecutiveFailures = 0;

                // 5. Follow Up
                if (response.requiresFollowUp) {
                    if (response.actions?.length) await new Promise(r => setTimeout(r, 1500));
                    currentTranscript = "[Continue - analyze the current page and complete the task]";
                    continue;
                }

                // 6. Completion
                finalResponseText = response.response;
                break;
            }

            // Cleanup & Respond
            if (controls.stoppedManuallyRef.current || signal.aborted) {
                callbacks.onStatusChange('idle');
                resetConversation(); // Clear plan
                setProcessingState(false);
                return;
            }

            finalResponseText = determineFinalResponse(stepCount, MAX_TOTAL_STEPS, finalResponseText);

            // Speak Final Response
            await speaker.speak(finalResponseText, signal);

            if (controls.stoppedManuallyRef.current) {
                resetConversation();
                return;
            }

            // Reset for next task
            resetConversation();

            // Enter Standby (mimicking original logic)
            if (!controls.isPausedRef.current) {
                await new Promise(r => setTimeout(r, 1000));
                if (!controls.stoppedManuallyRef.current && !controls.isPausedRef.current) {
                    // Just return, useAgentLoop handles active->standby if idle
                } else {
                    callbacks.onStatusChange('idle');
                }
            } else {
                callbacks.onStatusChange('idle');
            }

        } catch (err: any) {
            if (err?.name === 'AbortError') {
                callbacks.onStatusChange('idle');
                resetConversation();
                setProcessingState(false);
                return;
            }
            console.error('[Aeyes] Process failed:', err);
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            await speaker.speak("I'm having trouble. " + errorMsg, signal);

            if (!controls.isPausedRef.current && !controls.stoppedManuallyRef.current) {
                await new Promise(r => setTimeout(r, 1000));
            }
            callbacks.onStatusChange('idle');
        } finally {
            setProcessingState(false);
            abortControllerRef.current = null;
        }
    }, [conversationId, controls, speaker, callbacks, resetConversation]);

    return useMemo(() => ({
        processing,
        conversationId,
        processTranscript,
        cancelRequests,
        resetConversation
    }), [processing, conversationId, processTranscript, cancelRequests, resetConversation]);
}
