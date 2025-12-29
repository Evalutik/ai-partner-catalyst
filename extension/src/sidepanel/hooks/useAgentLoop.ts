import { useState, useRef, useCallback, MutableRefObject, useEffect, useMemo } from 'react';
import { sendToBackend } from '../services/api';
import { playDoneSound, playListeningSound, playMuteSound, playUnmuteSound } from '../services/audioCues';
import { extractDOMWithRetry, capturePageContext } from '../tools/analysis';
import { executeActions, Action } from '../tools/actionExecutor';
import { SpeakerState } from './useSpeaker';
import { isEchoOfSpokenText } from '../services/echoFilter';

export interface AgentLoopCallbacks {
    onStatusChange: (status: 'speaking' | 'processing' | 'idle' | 'listening') => void;
    onTranscript: (text: string) => void;
    onResponse: (text: string) => void;
    onPlan: (text: string) => void;
    onClearPlan: () => void;
    startListening: () => void;
    stopListening: () => void;
    abortListening: () => void;
    startAudioVisualization: () => Promise<boolean>;
}

export interface AgentLoopState {
    processing: boolean;
    conversationId: string | null;
    isStandby: boolean;
    processTranscript: (text: string) => Promise<void>;
    activateFromStandby: () => Promise<void>;
    cancelRequests: () => void;
    resetConversation: () => void;
    setStandby: (val: boolean) => void;
}

export interface AgentControlRefs {
    isPausedRef: MutableRefObject<boolean>;
    stoppedManuallyRef: MutableRefObject<boolean>;
}

/**
 * Core AI Agent Logic Hook
 * Manages the conversation loop, backend communication, and action execution.
 */
export function useAgentLoop(
    speaker: SpeakerState,
    callbacks: AgentLoopCallbacks,
    controls: AgentControlRefs
): AgentLoopState {
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);
    const [isStandby, setIsStandby] = useState(false);

    // Refs for internal state
    const processingRef = useRef(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const lastPlanTextRef = useRef<string>('');
    const isStandbyRef = useRef(false);

    // Latest Ref Pattern for callbacks to ensure stability
    const callbacksRef = useRef(callbacks);
    useEffect(() => {
        callbacksRef.current = callbacks;
    }, [callbacks]);

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
        callbacksRef.current.onClearPlan();
        lastPlanTextRef.current = '';
    }, []);

    const activateFromStandby = useCallback(async () => {
        console.log('[Aeyes] Wake word detected! Activating...');
        setIsStandby(false);
        isStandbyRef.current = false;

        await playUnmuteSound();
        const wakeResponse = "Yes, how can I help you?";

        try {
            await speaker.speak(wakeResponse);

            // Wait for echo to dissipate
            await new Promise(r => setTimeout(r, 500));

            // Start thinking/listening
            await playListeningSound();
            callbacksRef.current.startListening();
            callbacksRef.current.onStatusChange('listening');
        } catch (e) {
            console.warn('[Aeyes] Wake activation failed:', e);
            callbacksRef.current.onStatusChange('idle');
        }
    }, [speaker]);

    const processTranscript = useCallback(async (text: string) => {
        if (processingRef.current) return;
        setProcessingState(true);

        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        callbacksRef.current.abortListening();

        // Capitalize for UI
        const capitalizedText = text.charAt(0).toUpperCase() + text.slice(1);
        callbacksRef.current.onTranscript(capitalizedText);
        callbacksRef.current.onStatusChange('processing');

        const MAX_TOTAL_STEPS = 30;
        const MAX_CONSECUTIVE_FAILURES = 3;
        const MAX_SAME_PLAN_REPEATS = 3;

        let stepCount = 0;
        let consecutiveFailures = 0;
        let samePlanRepeatCount = 0;
        let lastPlanText = lastPlanTextRef.current;
        let currentTranscript = capitalizedText;
        let finalResponseText = '';
        let loopDomContext: any | null = null;
        let response: any = null;
        let currentConversationId = conversationId;

        try {
            while (stepCount < MAX_TOTAL_STEPS) {
                if (controls.stoppedManuallyRef.current) break;
                stepCount++;

                // 1. Perception
                loopDomContext = await extractDOMWithRetry();
                const pageContext = await capturePageContext();

                // Safety check for loops without vision
                if (stepCount > 1 && !loopDomContext && !response?.actions?.length) {
                    const isProtected = pageContext?.url?.startsWith('chrome://') || pageContext?.url?.startsWith('edge://');
                    if (!isProtected) {
                        console.warn('[Aeyes] Infinite loop risk: No DOM available.');
                        finalResponseText = "I can't see the page content right now. Please ensure you're on a valid web page.";
                        break;
                    }
                }

                if (signal.aborted) break;

                // 2. Cognition (Backend)
                response = await sendToBackend({
                    transcript: currentTranscript,
                    context: loopDomContext || undefined,
                    page_context: pageContext || undefined,
                    conversation_id: currentConversationId || undefined
                }, signal);

                if (controls.stoppedManuallyRef.current) break;

                // Update conversation ID
                if (response.conversation_id) {
                    currentConversationId = response.conversation_id;
                    if (!conversationId) setConversationId(response.conversation_id);
                }

                // Loop Detection
                const currentPlan = response.actions?.find((a: any) => a.type === 'notify_plan');
                if (currentPlan) {
                    const planText = currentPlan.value || currentPlan.args?.plan || '';
                    if (planText === lastPlanText) {
                        samePlanRepeatCount++;
                        if (samePlanRepeatCount >= MAX_SAME_PLAN_REPEATS) {
                            console.warn('[Aeyes] Plan loop detected, continuing caution...');
                        }
                    } else {
                        samePlanRepeatCount = 1;
                        lastPlanText = planText;
                    }
                }

                // 3. Action Execution
                let actionResult = { success: true } as any;
                if (response.actions && response.actions.length > 0) {
                    actionResult = await executeActions(response.actions, {
                        onPlan: callbacksRef.current.onPlan,
                        onStatusChange: callbacksRef.current.onStatusChange,
                        speak: (t) => speaker.speak(t, signal), // Use speaker hook
                        getLastShownPlan: () => lastPlanTextRef.current,
                        setLastShownPlan: (p) => {
                            lastPlanTextRef.current = p;
                        }
                    });
                }

                // 3b. Post-Analysis
                if (actionResult.success && response.post_analysis && response.post_analysis.length > 0) {
                    await new Promise(r => setTimeout(r, 500));
                    await executeActions(response.post_analysis, {
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
                callbacksRef.current.onStatusChange('idle');
                setProcessingState(false);
                return;
            }

            if (!finalResponseText) {
                finalResponseText = stepCount >= MAX_TOTAL_STEPS
                    ? "I'm sorry, the task was too complex. Please try breaking it down."
                    : "Task completed.";
            }

            // Speak Final Response
            await speaker.speak(finalResponseText, signal);

            if (controls.stoppedManuallyRef.current) return;

            // Reset for next task
            resetConversation();

            // Enter Standby Mode
            if (!controls.isPausedRef.current) {
                await new Promise(r => setTimeout(r, 1000));

                if (!controls.stoppedManuallyRef.current && !controls.isPausedRef.current) {
                    setIsStandby(true);
                    isStandbyRef.current = true;
                    controls.stoppedManuallyRef.current = false;

                    await playMuteSound();
                    const visSuccess = await callbacksRef.current.startAudioVisualization();
                    if (visSuccess) {
                        callbacksRef.current.startListening();
                        console.log('[Aeyes] User flow complete. Entering standby.');
                    }
                    callbacksRef.current.onStatusChange('idle'); // Visually idle but listening for wake word
                } else {
                    callbacksRef.current.onStatusChange('idle');
                }
            } else {
                callbacksRef.current.onStatusChange('idle');
            }

        } catch (err: any) {
            if (err?.name === 'AbortError') {
                callbacksRef.current.onStatusChange('idle');
                setProcessingState(false);
                return;
            }
            console.error('[Aeyes] Process failed:', err);
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';

            // Speak Error
            await speaker.speak("I'm having trouble. " + errorMsg, signal);

            // Recovery: Go back to listening if not paused
            if (!controls.isPausedRef.current && !controls.stoppedManuallyRef.current) {
                await new Promise(r => setTimeout(r, 1000));
                await playListeningSound();
                callbacksRef.current.startListening();
                // Go to idle (standby-like) but keeping mic open for wake word if we implemented that logic. 
                // However, users prefer manual restart on error to avoid active listening loops.
                // Let's set it to 'listening' only if we are sure. 
                // Actually, user complained about "Listens forever". Let's go to IDLE.
                callbacksRef.current.stopListening();
                callbacksRef.current.onStatusChange('idle');
            } else {
                callbacksRef.current.onStatusChange('idle');
            }
        } finally {
            setProcessingState(false);
            abortControllerRef.current = null;
        }
    }, [conversationId, controls, speaker, resetConversation]);

    return useMemo(() => ({
        processing,
        conversationId,
        isStandby,
        setStandby: setIsStandby,
        processTranscript,
        activateFromStandby,
        cancelRequests,
        resetConversation
    }), [processing, conversationId, isStandby, processTranscript, activateFromStandby, cancelRequests, resetConversation]);
}
