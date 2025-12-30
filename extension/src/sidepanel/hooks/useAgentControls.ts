import { useCallback, MutableRefObject } from 'react';
import { resumeAudioContext, playUnmuteSound, playMuteSound } from '../services/audioCues';
import { AgentLoopState } from './useAgentLoop';
import { SpeakerState } from './useSpeaker';
import { Status } from '../types';

interface UseAgentControlsProps {
    agentLoop: AgentLoopState;
    speaker: SpeakerState;
    startListening: () => void;
    stopListening: () => void;
    resetTranscript: () => void;
    updateStatus: (status: Status) => void;
    isPaused: boolean;
    setIsPaused: (val: boolean) => void;
    stoppedManuallyRef: MutableRefObject<boolean>;
    hasGreeted: boolean;
    playGreeting: () => Promise<void>;
}

export function useAgentControls({
    agentLoop,
    speaker,
    startListening,
    stopListening,
    resetTranscript,
    updateStatus,
    isPaused,
    setIsPaused,
    stoppedManuallyRef,
    hasGreeted,
    playGreeting
}: UseAgentControlsProps) {
    const handlePauseToggle = useCallback(async () => {
        // Include !hasGreeted so clicking Start triggers greeting when not yet greeted
        const isCurrentlyInactive = isPaused || agentLoop.isStandby || !hasGreeted;

        if (isCurrentlyInactive) {
            // Resume or Start
            await resumeAudioContext();

            if (!hasGreeted) {
                // First time starting - play greeting
                await playGreeting();
            } else {
                // Resuming from pause
                await playUnmuteSound();
                startListening();
                updateStatus('listening');
            }

            setIsPaused(false);
            agentLoop.setStandby(false);
            stoppedManuallyRef.current = false;
        } else {
            // Pause/Stop
            stoppedManuallyRef.current = true;
            setIsPaused(true);
            agentLoop.setStandby(false);

            agentLoop.cancelRequests();
            speaker.stopAudio();
            stopListening();
            resetTranscript();
            updateStatus('idle');

            playMuteSound();
        }
    }, [isPaused, hasGreeted, agentLoop, startListening, stopListening, speaker, resetTranscript, updateStatus, setIsPaused, stoppedManuallyRef, playGreeting]);

    return {
        handlePauseToggle
    };
}
