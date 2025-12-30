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
    stoppedManuallyRef
}: UseAgentControlsProps) {
    const handlePauseToggle = useCallback(async () => {
        const isCurrentlyInactive = isPaused || agentLoop.isStandby;

        if (isCurrentlyInactive) {
            // Resume
            await resumeAudioContext();
            await playUnmuteSound();
            setIsPaused(false);
            agentLoop.setStandby(false);
            stoppedManuallyRef.current = false;
            startListening();
            updateStatus('listening');
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
    }, [isPaused, agentLoop, startListening, stopListening, speaker, resetTranscript, updateStatus, setIsPaused, stoppedManuallyRef]);

    return {
        handlePauseToggle
    };
}
