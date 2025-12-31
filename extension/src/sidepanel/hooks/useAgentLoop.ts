import { useState, useRef, useCallback, MutableRefObject, useEffect, useMemo } from 'react';
import { playListeningSound, playMuteSound, playUnmuteSound } from '../services/audioCues';
import { SpeakerState } from './useSpeaker';
import { useAgentProcessor } from './useAgentProcessor';

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
    const [isStandby, setIsStandby] = useState(false);
    const isStandbyRef = useRef(false);

    // Latest Ref Pattern for callbacks to ensure stability
    const callbacksRef = useRef(callbacks);
    useEffect(() => {
        callbacksRef.current = callbacks;
    }, [callbacks]);

    // Use the processor hook
    const processor = useAgentProcessor(speaker, callbacks, controls);

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

    // Wrapper to handle Standby transition after task completion
    const processTranscriptWrapper = useCallback(async (text: string) => {
        await processor.processTranscript(text);

        // If we're waiting for user input (ask action), don't enter standby
        // Use ref for synchronous check (state updates are async)
        if (processor.waitingForInputRef.current) {
            console.log('[Aeyes] Waiting for user input, skipping standby');
            return;
        }

        // After processing check if we should enter standby
        // Only enter standby when task is complete (not waiting for input)
        if (!controls.isPausedRef.current && !controls.stoppedManuallyRef.current) {
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
        }
    }, [processor, controls]);

    return useMemo(() => ({
        processing: processor.processing,
        conversationId: processor.conversationId,
        isStandby,
        setStandby: setIsStandby,
        processTranscript: processTranscriptWrapper,
        activateFromStandby,
        cancelRequests: processor.cancelRequests,
        resetConversation: processor.resetConversation
    }), [processor.processing, processor.conversationId, isStandby, processTranscriptWrapper, activateFromStandby, processor.cancelRequests, processor.resetConversation]);
}

