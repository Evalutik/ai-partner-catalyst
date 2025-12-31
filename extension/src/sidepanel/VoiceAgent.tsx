import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useAudioVisualization } from './hooks/useAudioVisualization';
import { useSpeaker } from './hooks/useSpeaker';
import { useAgentLoop } from './hooks/useAgentLoop';
import { useVoiceActivity } from './hooks/useVoiceActivity';
import { useAgentPermissions } from './hooks/useAgentPermissions';
import { useAgentGreeting } from './hooks/useAgentGreeting';
import { useAgentControls } from './hooks/useAgentControls';
import { capitalizeFirst } from './services/echoFilter';
import VoiceVisualizer from './components/VoiceVisualizer';
import VoiceControl from './components/VoiceControl';
import PermissionCard from './components/PermissionCard';
import { Status } from './types';

interface VoiceAgentProps {
    onStatusChange?: (status: Status) => void;
    onTranscript?: (text: string) => void;
    onResponse?: (text: string) => void;
    autoStart?: boolean;
    onAutoStartComplete?: () => void;
    status: Status;
    onPermissionRequired?: (required: boolean) => void;
    onStreamingTranscript?: (text: string) => void;
    onPlan?: (text: string) => void;
    onClearPlan?: () => void;
}

export default function VoiceAgent({
    onStatusChange,
    onTranscript,
    onResponse,
    autoStart = false,
    status,
    onPermissionRequired,
    onStreamingTranscript,
    onPlan,
    onClearPlan
}: VoiceAgentProps) {
    // Local UI State
    const [error, setError] = useState<string | null>(null);

    // Control State (Lifted for Hook Coordination)
    const [isPaused, setIsPaused] = useState(false);
    const isPausedRef = useRef(isPaused);
    const stoppedManuallyRef = useRef(false);

    // Sync refs
    useEffect(() => {
        isPausedRef.current = isPaused;
        if (!isPaused) stoppedManuallyRef.current = false;
    }, [isPaused]);

    // 1. Audio Visualization
    // Callback proxy to update permissions if visualization fails
    const onVisPermission = useCallback((required: boolean) => {
        // We can't directly set "needsPermission" here as it's controlled by useAgentPermissions
        // But useAgentPermissions gives us the state. 
        // Actually, internal logic in useAudioVisualization calls this if getUserMedia fails.
        // We should notify parent.
        onPermissionRequired?.(required);
    }, [onPermissionRequired]);

    const {
        audioLevel,
        startVisualization: startAudioVisualization,
        stopVisualization: stopAudioVisualization
    } = useAudioVisualization(onVisPermission);

    // 2. Speech Recognition
    const {
        isListening,
        transcript,
        interimTranscript,
        error: speechError,
        isSupported,
        start: startListening,
        stop: stopListening,
        abort: abortListening,
        resetTranscript
    } = useSpeechRecognition();

    // 3. Status Helper
    const updateStatus = useCallback((newStatus: Status) => {
        onStatusChange?.(newStatus);
    }, [onStatusChange]);

    // 4. Output Speaker
    const speakerCallbacks = useMemo(() => ({
        onStatusChange: updateStatus,
        onResponse
    }), [updateStatus, onResponse]);

    const speaker = useSpeaker(speakerCallbacks);

    // 5. Agent Loop (Brain)
    const agentCallbacks = useMemo(() => ({
        onStatusChange: updateStatus,
        onTranscript: onTranscript || (() => { }),
        onResponse: onResponse || (() => { }),
        onPlan: onPlan || (() => { }),
        onClearPlan: onClearPlan || (() => { }),
        startListening,
        stopListening,
        abortListening,
        startAudioVisualization
    }), [updateStatus, onTranscript, onResponse, onPlan, onClearPlan, startListening, stopListening, abortListening, startAudioVisualization]);

    const agentControlsRefs = useMemo(() => ({
        isPausedRef,
        stoppedManuallyRef
    }), []);

    // We pass the refs to agent loop so it can check paused state during async operations
    const agentLoop = useAgentLoop(
        speaker,
        agentCallbacks,
        agentControlsRefs
    );

    // 6. Permission Management (must come before greeting to check mic access first)
    const onPermissionUpdate = useCallback((needsAccess: boolean) => {
        onPermissionRequired?.(needsAccess);
    }, [onPermissionRequired]);

    const { needsPermission, wasGrantedInitially } = useAgentPermissions(onPermissionUpdate);

    // 7. Greeting Logic (depends on permission state)
    // Auto-start is handled inside useAgentGreeting ONLY when permission was already granted on load
    const { hasGreeted, playGreeting } = useAgentGreeting({
        speaker,
        startListening,
        startAudioVisualization,
        stopAudioVisualization,
        updateStatus,
        autoStart: autoStart && wasGrantedInitially, // Only auto-start if permission was already granted
        isSupported,
        stoppedManuallyRef,
        needsPermission
    });

    // 8. Agent Controls (Pause/Resume logic - depends on greeting state)
    const { handlePauseToggle } = useAgentControls({
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
    });


    // Error Handling
    useEffect(() => {
        if (speechError) {
            console.log('[VoiceAgent] Speech error:', speechError);
            if (speechError.includes('permission denied') || speechError.includes('not-allowed')) {
                onPermissionRequired?.(true);
            }
            if (speechError !== 'no-speech') {
                setError(speechError);
            }
            if (speechError.includes('permission') || speechError.includes('not-allowed') || speechError.includes('audio-capture')) {
                updateStatus('idle');
            }
        }
    }, [speechError, updateStatus, onPermissionRequired]);

    // Cleanup
    useEffect(() => {
        return () => {
            stopAudioVisualization();
            speaker.stopAudio();
        };
    }, [stopAudioVisualization, speaker]);

    // Streaming Transcript Update
    useEffect(() => {
        if (status === 'processing' || status === 'speaking' || agentLoop.processing || speaker.speakingRef.current) return;
        const fullCurrentText = (transcript + interimTranscript).trim();
        onStreamingTranscript?.(fullCurrentText ? capitalizeFirst(fullCurrentText) : '');
    }, [transcript, interimTranscript, onStreamingTranscript, status, agentLoop, speaker]);

    // Voice Activity Management
    useVoiceActivity({
        status,
        isListening,
        isPaused,
        error,
        transcript,
        agentProcessing: agentLoop.processing,
        speakerSpeakingRef: speaker.speakingRef, // Pass ref, not current value
        lastSpokenTextRef: speaker.lastSpokenTextRef, // Pass ref, not current value
        onProcess: async (text) => {
            resetTranscript();
            await agentLoop.processTranscript(text);
        },
        onRestartListening: startListening
    });

    if (!isSupported) return <div className="error-text">Speech recognition not supported</div>;

    // Show Start button if paused, in standby, OR greeting hasn't happened yet
    const isIdleMode = isPaused || agentLoop.isStandby || !hasGreeted;

    return (
        <div className="flex flex-col gap-3">
            <VoiceVisualizer
                audioLevel={audioLevel}
                status={status}
                isPaused={isPaused}
            />

            {!needsPermission && (
                <VoiceControl
                    status={status}
                    isIdleMode={isIdleMode}
                    onToggle={handlePauseToggle}
                />
            )}

            {needsPermission && (
                <PermissionCard />
            )}

            {error && !needsPermission && (
                <p className="error-text animate-fade-in">{error}</p>
            )}
        </div>
    );
}
