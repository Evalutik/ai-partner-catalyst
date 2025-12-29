import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { playStartupSound, playListeningSound, playDoneSound, playMuteSound, playUnmuteSound, resumeAudioContext } from './services/audioCues';
import { openPermissionPage } from './services/chrome';
import LockIcon from './components/LockIcon';
import { MicIcon, StopIcon, StopIconSmall } from './components/icons';
import { useAudioVisualization } from './hooks/useAudioVisualization';
import { isEchoOfSpokenText, capitalizeFirst } from './services/echoFilter';
import { useSpeaker } from './hooks/useSpeaker';
import { useAgentLoop } from './hooks/useAgentLoop';

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
    const lastSpeechTimeRef = useRef<number>(Date.now());
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
        abort: abortListening
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

            await speaker.speak("Hi, I'm Aeyes. How can I help you?");

            await playDoneSound();

            const success = await startAudioVisualization();
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
    }, [hasGreeted, updateStatus, startListening, startAudioVisualization, speaker]);

    // Auto-start
    useEffect(() => {
        if (autoStart && !hasAttemptedAutoStart && isSupported) {
            setHasAttemptedAutoStart(true);
            setTimeout(() => playGreeting(), 500);
        }
    }, [autoStart, hasAttemptedAutoStart, isSupported, playGreeting]);

    const prevTextRef = useRef('');

    // Buffer to hold the last valid text in case recognition resets (e.g. no-speech or auto-restart)
    const lastSeenTextRef = useRef('');

    // Input Processing Logic
    useEffect(() => {
        // Guard: Don't listen if processing or speaking
        if (statusRef.current === 'processing' || statusRef.current === 'speaking' || agentLoop.processing || speaker.speakingRef.current) return;

        const fullCurrentText = (transcript + interimTranscript).trim();

        onStreamingTranscript?.(fullCurrentText ? capitalizeFirst(fullCurrentText) : '');

        // Update activity timestamp ONLY whenever text changes content
        if (fullCurrentText && fullCurrentText !== prevTextRef.current) {
            lastSpeechTimeRef.current = Date.now();
            prevTextRef.current = fullCurrentText;
            lastSeenTextRef.current = fullCurrentText; // Update buffer
        } else if (!fullCurrentText) {
            prevTextRef.current = '';
            // Do NOT clear lastSeenTextRef here.
        }
    }, [transcript, interimTranscript, onStreamingTranscript, status, agentLoop, speaker]);

    // Robust Silence Detection Loop (Independent of Renders)
    useEffect(() => {
        // Optimization: Only run silence check interval when we are actually listening
        if (status !== 'listening') return;

        let tick = 0;
        const checkSilence = async () => {
            tick++;

            // Extra safety guards (though effect should cleanup on status change)
            if (agentLoop.processing || speaker.speakingRef.current) {
                return;
            }

            // Check if we have text to process
            // Use buffered text if transcript is empty (handled the case where it was wiped by restart)
            let textToProcess = transcriptRef.current?.trim();
            if (!textToProcess) {
                textToProcess = lastSeenTextRef.current?.trim();
            }

            if (!textToProcess) {
                return;
            }

            const now = Date.now();
            const timeSinceSpeech = now - lastSpeechTimeRef.current;

            if (timeSinceSpeech > 1000) {
                // SIlence detected
                console.log(`[VoiceAgent] Silence detected (${timeSinceSpeech}ms). Processing: "${textToProcess}"`);

                // Reset timestamp IMMEDIATELY to prevent double-firing
                lastSpeechTimeRef.current = Date.now();

                // Echo check logic moved here
                const spoken = speaker.lastSpokenTextRef.current;
                if (spoken && textToProcess && isEchoOfSpokenText(textToProcess, spoken)) {
                    console.log('[Aeyes] Ignored self-hearing (final):', textToProcess);
                    startListening(); // Restart to clear
                    lastSeenTextRef.current = ''; // Clear buffer since we consumed it (as echo)
                    return;
                }

                await playDoneSound();

                // Clear the buffer right before processing
                lastSeenTextRef.current = '';
                await agentLoop.processTranscript(textToProcess);
            }
        };

        const interval = setInterval(checkSilence, 200);
        return () => clearInterval(interval);
    }, [status, agentLoop, speaker, startListening]); // Stable deps

    // Watchdog
    useEffect(() => {
        if (status === 'listening' && !isListening && !isPaused && !error && !agentLoop.processing) {
            const timeout = setTimeout(() => {
                // Double check if we are still in "should be listening" state
                if (status === 'listening' && !isListening && !isPaused && !error) {
                    console.log('[VoiceAgent] Watchdog: Restarting stalled recognition...');
                    startListening();
                }
            }, 1000); // Relaxed timeout from 500ms to 1000ms
            return () => clearTimeout(timeout);
        }
    }, [status, isListening, isPaused, error, startListening, agentLoop.processing]);

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
            await resumeAudioContext(); // Resuming
            await playUnmuteSound();
            setIsPaused(false);
            agentLoop.setStandby(false);
            stoppedManuallyRef.current = false;
            startListening();
            updateStatus('listening');
        } else {
            // Pause/Stop
            await playMuteSound();
            setIsPaused(true);
            agentLoop.setStandby(false);
            stoppedManuallyRef.current = true;

            agentLoop.cancelRequests();
            speaker.stopAudio();
            stopListening();

            updateStatus('idle');
        }
    }, [isPaused, agentLoop, startListening, stopListening, speaker, updateStatus]);

    if (!isSupported) return <div className="error-text">Speech recognition not supported</div>;

    const isActive = status !== 'idle';
    const getStateColor = () => {
        switch (status) {
            case 'listening': return 'var(--color-listening)';
            case 'processing': return 'var(--color-processing)';
            case 'speaking': return 'var(--color-speaking)';
            default: return 'var(--color-idle)';
        }
    };

    const isIdleMode = isPaused || agentLoop.isStandby;

    return (
        <div className="flex flex-col gap-3">
            {/* Audio Visualizer */}
            <div className="flex items-end justify-center gap-0.5 h-8">
                {audioLevel.map((level, i) => (
                    <div
                        key={i}
                        className="audio-bar"
                        style={{
                            height: `${Math.max(12, level * 100)}%`,
                            background: isActive ? getStateColor() : 'var(--color-idle)',
                            opacity: isActive ? 0.8 : 0.3
                        }}
                    />
                ))}
            </div>

            {/* Toggle Button */}
            {!needsPermission && (
                <button
                    onClick={handlePauseToggle}
                    className={`btn-voice ${isIdleMode ? 'btn-voice-idle' : `btn-voice-${status}`}`}
                    aria-label={isIdleMode ? 'Start listening' : status === 'processing' ? 'Stop processing' : 'Stop listening'}
                >
                    {isIdleMode ? (
                        <MicIcon />
                    ) : status === 'processing' ? (
                        <div className="spinner-wrapper">
                            <div className="spinner-ring" />
                            <StopIconSmall />
                        </div>
                    ) : (
                        <StopIcon />
                    )}
                    <span>{isIdleMode ? 'Start' : status === 'processing' ? 'Processing...' : 'Stop'}</span>
                </button>
            )}

            {/* Permission Card */}
            {needsPermission && (
                <div className="permission-card animate-fade-in">
                    <div className="mb-3 text-center"><LockIcon /></div>
                    <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
                        Microphone Access Needed
                    </h3>
                    <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)', lineHeight: '1.5' }}>
                        Please allow microphone access to use voice commands.
                    </p>
                    <button
                        onClick={openPermissionPage}
                        className="permission-btn w-full justify-center"
                        style={{ background: '#E2E2E2', color: '#060606' }}
                    >
                        Open Permission Settings
                    </button>
                </div>
            )}

            {/* Error Display */}
            {error && !needsPermission && (
                <p className="error-text animate-fade-in">{error}</p>
            )}
        </div>
    );
}
