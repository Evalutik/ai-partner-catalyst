import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { playStartupSound, playListeningSound, playDoneSound, playMuteSound, playUnmuteSound, resumeAudioContext } from './services/audioCues';
// import { openPermissionPage } from './services/chrome'; // Removed: Handled by PermissionCard
import VoiceVisualizer from './components/VoiceVisualizer';
import VoiceControl from './components/VoiceControl';
import PermissionCard from './components/PermissionCard';
import { useAudioVisualization } from './hooks/useAudioVisualization';
import { capitalizeFirst } from './services/echoFilter';
import { useSpeaker } from './hooks/useSpeaker';
import { useAgentLoop } from './hooks/useAgentLoop';
import { useVoiceActivity } from './hooks/useVoiceActivity';

type Status = 'idle' | 'listening' | 'processing' | 'speaking';

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
    const [error, setError] = useState<string | null>(null);
    const [hasAttemptedAutoStart, setHasAttemptedAutoStart] = useState(false);
    const [hasGreeted, setHasGreeted] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [needsPermission, setNeedsPermission] = useState(false);

    // Refs for control logic
    const statusRef = useRef(status);
    const isPausedRef = useRef(isPaused);
    const stoppedManuallyRef = useRef(false);
    const hasGreetedRef = useRef(false);
    const transcriptRef = useRef<string>('');

    // 1. Audio Visualization
    const onVisPermission = useCallback((required: boolean) => {
        setNeedsPermission(required);
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

    // Sync refs for robust loops
    useEffect(() => {
        transcriptRef.current = transcript;
    }, [transcript]);

    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    useEffect(() => {
        isPausedRef.current = isPaused;
        if (!isPaused) stoppedManuallyRef.current = false;
    }, [isPaused]);

    const updateStatus = useCallback((newStatus: Status) => {
        onStatusChange?.(newStatus);
    }, [onStatusChange]);

    // 3. Output Speaker (TTS)
    // Memoize callbacks to prevent stable reference changes
    const speakerCallbacks = useMemo(() => ({
        onStatusChange: updateStatus,
        onResponse
    }), [updateStatus, onResponse]);

    const speaker = useSpeaker(speakerCallbacks);

    // 4. Core Agent Loop (Brain)

    // Memoize controls to prevent recreating the object on every render (which triggers useAgentLoop update)
    const agentControls = useMemo(() => ({
        isPausedRef,
        stoppedManuallyRef
    }), []);

    // Memoize callbacks for the same reason
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

    const agentLoop = useAgentLoop(
        speaker,
        agentCallbacks,
        agentControls
    );

    // Sync refs
    useEffect(() => { statusRef.current = status; }, [status]);
    useEffect(() => {
        isPausedRef.current = isPaused;
        if (!isPaused) stoppedManuallyRef.current = false;
    }, [isPaused]);

    // Error Handling
    useEffect(() => {
        if (speechError) {
            console.log('[VoiceAgent] Speech error:', speechError);
            if (speechError.includes('permission denied') || speechError.includes('not-allowed')) {
                setNeedsPermission(true);
                onPermissionRequired?.(true);
            }
            // For 'no-speech', we generally don't show error to user, just restart via Watchdog.
            // But if it's persistent...
            if (speechError !== 'no-speech') {
                setError(speechError);
            }

            // Only go idle if it's a critical error
            if (speechError.includes('permission') || speechError.includes('not-allowed') || speechError.includes('audio-capture')) {
                updateStatus('idle');
            }
        }
    }, [speechError, updateStatus, onPermissionRequired]);

    // Cleanup
    useEffect(() => {
        return () => {
            stopAudioVisualization();
        };
    }, [stopAudioVisualization]);

    useEffect(() => {
        return () => {
            speaker.stopAudio();
        };
    }, [speaker]);

    // Greeting Logic
    const playGreeting = useCallback(async () => {
        if (hasGreetedRef.current) return;
        hasGreetedRef.current = true;
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

            // Re-check after async startVisualization (though it should be fast)
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
            updateStatus('idle');
        }
    }, [hasGreeted, updateStatus, startListening, startAudioVisualization, stopAudioVisualization, speaker]);

    // Auto-start
    useEffect(() => {
        if (autoStart && !hasAttemptedAutoStart && isSupported) {
            setHasAttemptedAutoStart(true);
            setTimeout(() => playGreeting(), 500);
        }
    }, [autoStart, hasAttemptedAutoStart, isSupported, playGreeting]);

    // Streaming Transcript Update
    useEffect(() => {
        // Guard: Don't listen if processing or speaking
        if (status === 'processing' || status === 'speaking' || agentLoop.processing || speaker.speakingRef.current) return;

        const fullCurrentText = (transcript + interimTranscript).trim();

        onStreamingTranscript?.(fullCurrentText ? capitalizeFirst(fullCurrentText) : '');
    }, [transcript, interimTranscript, onStreamingTranscript, status, agentLoop, speaker]);


    // 5. Voice Activity Management (Silence Detection + Watchdog)
    useVoiceActivity({
        status,
        isListening,
        isPaused,
        error,
        transcript,
        agentProcessing: agentLoop.processing,
        speakerSpeaking: speaker.speakingRef.current,
        lastSpokenText: speaker.lastSpokenTextRef.current,
        onProcess: agentLoop.processTranscript,
        onRestartListening: startListening
    });

    // Permission Check
    useEffect(() => {
        navigator.permissions.query({ name: 'microphone' as PermissionName }).then((permissionStatus) => {
            const check = () => {
                const denied = permissionStatus.state === 'denied';
                setNeedsPermission(denied);
                onPermissionRequired?.(denied);
                if (!denied && !hasGreetedRef.current) playGreeting();
            };
            check();
            permissionStatus.onchange = check;
        });
    }, [onPermissionRequired, hasGreeted, playGreeting]);

    const handlePauseToggle = useCallback(async () => {
        const isCurrentlyInactive = isPaused || agentLoop.isStandby;

        if (isCurrentlyInactive) {
            // Resume
            // For start, we can play sound first as feedback
            await resumeAudioContext(); // Resuming
            await playUnmuteSound();
            setIsPaused(false);
            agentLoop.setStandby(false);
            stoppedManuallyRef.current = false;
            startListening();
            updateStatus('listening');
        } else {
            // Pause/Stop - EXECUTE INSTANTLY
            stoppedManuallyRef.current = true;
            setIsPaused(true);
            agentLoop.setStandby(false);

            agentLoop.cancelRequests();
            speaker.stopAudio();
            stopListening();
            resetTranscript(); // Clear residual text to prevent echo processing
            updateStatus('idle');

            // Feedback sound last (or parallel, but don't block state)
            playMuteSound();
        }
    }, [isPaused, agentLoop, startListening, stopListening, speaker, updateStatus]);

    if (!isSupported) return <div className="error-text">Speech recognition not supported</div>;

    const isIdleMode = isPaused || agentLoop.isStandby;

    return (
        <div className="flex flex-col gap-3">
            {/* Audio Visualizer */}
            <VoiceVisualizer
                audioLevel={audioLevel}
                status={status}
                isPaused={isPaused}
            />

            {/* Toggle Button */}
            {!needsPermission && (
                <VoiceControl
                    status={status}
                    isIdleMode={isIdleMode}
                    onToggle={handlePauseToggle}
                />
            )}

            {/* Permission Card */}
            {needsPermission && (
                <PermissionCard />
            )}

            {/* Error Display */}
            {error && !needsPermission && (
                <p className="error-text animate-fade-in">{error}</p>
            )}
        </div>
    );
}

