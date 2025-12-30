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

            // Check permission before auto-starting visualization to avoid "NotAllowedError"
            // if permission is in 'prompt' state (requires user gesture)
            let permissionGranted = false;
            try {
                if (navigator.permissions && navigator.permissions.query) {
                    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
                    permissionGranted = status.state === 'granted';
                }
            } catch (e) {
                // Fallback for browsers that might not support the query or 'microphone' name strictly
                console.warn('Could not query permission state:', e);
            }

            if (permissionGranted) {
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
            } else {
                // If not granted, just go to idle. User can manually click "Enable Microphone" or "Start"
                console.log('[AgentGreeting] Permission not granted yet, skipping auto-start.');
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
