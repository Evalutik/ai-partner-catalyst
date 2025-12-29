import { useCallback, useRef, useState, useEffect, MutableRefObject } from 'react';
import { resumeAudioContext, playStartupSound, playListeningSound, playDoneSound } from '../services/audioCues';
import { SpeakerState } from './useSpeaker';
import { Status } from '../types';

interface UseAgentGreetingProps {
    speaker: SpeakerState;
    startListening: () => void;
    startAudioVisualization: () => Promise<boolean>;
    stopAudioVisualization: () => void;
    updateStatus: (status: Status) => void;
    autoStart?: boolean;
    isSupported: boolean;
    stoppedManuallyRef: MutableRefObject<boolean>;
}

export function useAgentGreeting({
    speaker,
    startListening,
    startAudioVisualization,
    stopAudioVisualization,
    updateStatus,
    autoStart = false,
    isSupported,
    stoppedManuallyRef
}: UseAgentGreetingProps) {
    const [hasGreeted, setHasGreeted] = useState(false);
    const hasGreetedRef = useRef(false);
    const [hasAttemptedAutoStart, setHasAttemptedAutoStart] = useState(false);

    const playGreeting = useCallback(async () => {
        if (hasGreetedRef.current) return;
        hasGreetedRef.current = true;

        // Don't set state immediately if unmounted?
        // But for safe side:
        setHasGreeted(true);

        try {
            await resumeAudioContext(); // Ensure audio is ready
            await playStartupSound();

            // Check before speaking
            if (stoppedManuallyRef.current) return;

            await speaker.speak("Hi, I'm Aeyes. How can I help you?");

            // Check if user stopped while speaking
            if (stoppedManuallyRef.current) return;

            await playDoneSound();

            // Critical check: don't start listening if user pressed stop during greeting
            if (stoppedManuallyRef.current) return;

            const success = await startAudioVisualization();

            // Re-check after async startVisualization
            if (stoppedManuallyRef.current) {
                stopAudioVisualization();
                updateStatus('idle');
                return;
            }

            if (success) {
                await playListeningSound();
                updateStatus('listening');
                startListening();
            } else {
                updateStatus('idle');
            }
        } catch (e) {
            console.error('Greeting failed:', e);
            updateStatus('idle');
        }
    }, [updateStatus, startListening, startAudioVisualization, stopAudioVisualization, speaker, stoppedManuallyRef]);

    // Auto-start logic
    useEffect(() => {
        if (autoStart && !hasAttemptedAutoStart && isSupported) {
            setHasAttemptedAutoStart(true);
            setTimeout(() => playGreeting(), 500);
        }
    }, [autoStart, hasAttemptedAutoStart, isSupported, playGreeting]);

    return {
        playGreeting,
        hasGreeted,
        hasGreetedRef
    };
}
