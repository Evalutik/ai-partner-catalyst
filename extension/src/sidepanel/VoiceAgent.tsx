import { useState, useCallback, useRef, useEffect } from 'react';
import { useSpeechRecognition } from './useSpeechRecognition';
import { sendToBackend, getAudioUrl } from './api';
import { playStartupSound, playListeningSound, playDoneSound } from './audioCues';
import LockIcon from './LockIcon';

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
}

export default function VoiceAgent({
    onStatusChange,
    onTranscript,
    onResponse,
    autoStart = false,
    onAutoStartComplete,
    status,
    onPermissionRequired,
    onStreamingTranscript
}: VoiceAgentProps) {
    const [error, setError] = useState<string | null>(null);
    const [lastTranscript, setLastTranscript] = useState('');
    const [audioLevel, setAudioLevel] = useState<number[]>(new Array(16).fill(0));
    const [needsPermission, setNeedsPermission] = useState(false);
    const [hasAttemptedAutoStart, setHasAttemptedAutoStart] = useState(false);
    const [conversationId, setConversationId] = useState<string | null>(null);

    const processingRef = useRef(false);
    const silenceTimeoutRef = useRef<number | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioElementRef = useRef<HTMLAudioElement | null>(null);

    const {
        transcript,
        interimTranscript,
        error: speechError,
        isSupported,
        start: startListening,
        stop: stopListening
    } = useSpeechRecognition();

    const updateStatus = useCallback((newStatus: Status) => {
        onStatusChange?.(newStatus);
    }, [onStatusChange]);



    useEffect(() => {
        if (speechError) {
            if (speechError.includes('permission denied') || speechError.includes('not-allowed')) {
                setNeedsPermission(true);
                onPermissionRequired?.(true);
            }
            setError(speechError);
            updateStatus('idle');
        }
    }, [speechError, updateStatus, onPermissionRequired]);

    const startAudioVisualization = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const audioContext = new AudioContext();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 64;

            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);

            audioContextRef.current = audioContext;
            analyserRef.current = analyser;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const updateLevels = () => {
                if (!analyserRef.current) return;

                analyserRef.current.getByteFrequencyData(dataArray);

                const levels: number[] = [];
                const bandSize = Math.floor(dataArray.length / 16);
                for (let i = 0; i < 16; i++) {
                    const start = i * bandSize;
                    let sum = 0;
                    for (let j = 0; j < bandSize; j++) {
                        sum += dataArray[start + j];
                    }
                    const avg = sum / bandSize / 255;
                    levels.push(Math.max(0.15, Math.pow(avg, 0.7)));
                }

                setAudioLevel(levels);
                animationFrameRef.current = requestAnimationFrame(updateLevels);
            };

            updateLevels();
            setNeedsPermission(false);
            onPermissionRequired?.(false);
            setError(null);
            return true;
        } catch {
            setNeedsPermission(true);
            onPermissionRequired?.(true);
            return false;
        }
    }, [onPermissionRequired]);

    const stopAudioVisualization = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        analyserRef.current = null;
        setAudioLevel(new Array(16).fill(0));
    }, []);

    // Stop any playing audio
    const stopAudio = useCallback(() => {
        if (audioElementRef.current) {
            audioElementRef.current.pause();
            audioElementRef.current.currentTime = 0;
            audioElementRef.current = null;
        }
    }, []);

    const [hasGreeted, setHasGreeted] = useState(false);

    useEffect(() => {
        // Only auto-start AFTER greeting is done (or if we don't need to greet for some reason)
        // But for this flow, we assume greeting happens first. 
        // Actually, playGreeting calls startListening itself.
        // So we strictly prevent this effect from running if we are in the "waiting to greet" phase.
        // However, if we've ALREADY greeted (hasGreeted=true), this shouldn't run either because playGreeting handled it?
        // Wait, if hasAttemptedAutoStart is persistent, we just need to make sure we don't start listening BEFORE speaking.

        // BETTER FIX: Do nothing here if we rely on playGreeting to start us.
        // We can just disable this effect's logic if "permission granted & waiting to greet" logic is active.
        // Since playGreeting sets state to listening at end, we can arguably remove this effect or guard it.

        // If we just want to suppress the flash:
        if (autoStart && !hasAttemptedAutoStart && isSupported && hasGreeted) {
            setHasAttemptedAutoStart(true);
            // handleStart(); // playGreeting does this. So we might not need to call it again.
            // But if playGreeting fails or is skipped?
            // Let's rely on playGreeting for the first run.
            onAutoStartComplete?.();
        }
    }, [autoStart, hasAttemptedAutoStart, isSupported, hasGreeted]);

    useEffect(() => {
        return () => {
            stopAudioVisualization();
            stopAudio();
        };
    }, [stopAudioVisualization, stopAudio]);

    useEffect(() => {
        if (processingRef.current) return;

        // Calculate current real-time text
        const currentPart = transcript.slice(lastTranscript.length);
        const fullCurrentText = (currentPart + interimTranscript).trim();

        if (fullCurrentText) {
            const capitalizedText = fullCurrentText.charAt(0).toUpperCase() + fullCurrentText.slice(1);
            onStreamingTranscript?.(capitalizedText);
        }

        if (!transcript) return;

        if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);

        if (transcript.length > lastTranscript.length) {
            silenceTimeoutRef.current = window.setTimeout(async () => {
                const newText = transcript.slice(lastTranscript.length).trim();
                if (newText && !processingRef.current) {
                    // Audio cue: user finished speaking
                    await playDoneSound();
                    await processTranscript(newText);
                }
            }, 1500);
        }

        return () => {
            if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
        };
    }, [transcript, interimTranscript, lastTranscript, onStreamingTranscript]);

    const playGreeting = useCallback(async () => {
        if (hasGreeted) return;
        setHasGreeted(true);

        try {
            // Play startup sound first for blind users
            await playStartupSound();

            updateStatus('speaking');

            const greetingText = "Hi, I'm Aeyes. How can I help you?";

            const audioUrl = await getAudioUrl(greetingText);

            const audio = new Audio(audioUrl);
            audioElementRef.current = audio;

            // Sync: Show text just before playing
            onResponse?.(greetingText);

            await new Promise<void>((resolve) => {
                audio.onended = () => resolve();
                audio.onerror = () => resolve();
                audio.play().catch(() => resolve());
            });

            audioElementRef.current = null;

            // Play done sound after speaking
            await playDoneSound();

            // Seamless transition to listening
            const success = await startAudioVisualization();
            if (success) {
                await playListeningSound(); // Audio cue for listening start
                updateStatus('listening');
                startListening();
            } else {
                updateStatus('idle');
            }

        } catch (e) {
            console.warn("Greeting failed", e);
            updateStatus('idle');
        }
    }, [hasGreeted, updateStatus, startListening, startAudioVisualization, onResponse]);

    useEffect(() => {
        // Check initial permission state
        navigator.permissions.query({ name: 'microphone' as PermissionName }).then((permissionStatus) => {
            if (permissionStatus.state === 'denied') {
                setNeedsPermission(true);
                onPermissionRequired?.(true);
            } else if (permissionStatus.state === 'granted' && !hasGreeted) {
                playGreeting();
            }
            permissionStatus.onchange = () => {
                const denied = permissionStatus.state === 'denied';
                setNeedsPermission(denied);
                onPermissionRequired?.(denied);

                if (!denied && !hasGreeted) {
                    playGreeting();
                }
            };
        });
    }, [onPermissionRequired, hasGreeted, playGreeting]);

    // Get DOM from current page via content script
    const extractDOMFromPage = useCallback(async (): Promise<string | null> => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) return null;

            const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_DOM' });
            if (response?.success && response?.data) {
                return JSON.stringify(response.data);
            }
            return null;
        } catch {
            return null;
        }
    }, []);

    // Execute actions on current page via content script with multi-step support
    const executeActions = useCallback(async (actions: Array<{
        type: string;
        elementId?: string;
        value?: string;
        waitForPage?: boolean;
        needsDom?: boolean;
        description?: string;
    }>) => {
        if (!actions || actions.length === 0) return;

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) return;

            for (let i = 0; i < actions.length; i++) {
                const action = actions[i];
                console.log(`[Aeyes] Executing action ${i + 1}/${actions.length}:`, action.description || action.type);

                // If action needs fresh DOM, get it first
                if (action.needsDom && i > 0) {
                    console.log('[Aeyes] Getting fresh DOM snapshot...');
                    // Small delay to let page settle
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                // Execute the action
                await chrome.tabs.sendMessage(tab.id, { type: 'EXECUTE_ACTION', action });

                // If action requires waiting for page load (e.g., navigation)
                if (action.waitForPage) {
                    console.log('[Aeyes] Waiting for page to load...');
                    // Wait for page to load (simple approach: fixed delay)
                    // In production, use chrome.tabs.onUpdated or webNavigation API
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

                // Small delay between actions for stability
                if (i < actions.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }

            console.log('[Aeyes] All actions completed');
        } catch (error) {
            console.error('[Aeyes] Action execution failed:', error);
            // Silently fail - action execution is best-effort
        }
    }, []);

    const processTranscript = useCallback(async (text: string) => {
        if (processingRef.current) return;
        processingRef.current = true;

        setLastTranscript(transcript);

        const capitalizedText = text.charAt(0).toUpperCase() + text.slice(1);
        onTranscript?.(capitalizedText);

        updateStatus('processing');

        try {
            // Get DOM context from current page
            const domContext = await extractDOMFromPage();

            // Send transcript AND context to backend with conversation ID
            const response = await sendToBackend({
                transcript: capitalizedText,
                context: domContext || undefined,
                conversation_id: conversationId || undefined
            });

<<<<<<< HEAD
            // Store conversation ID for continuity
            if (response.conversation_id && !conversationId) {
                setConversationId(response.conversation_id);
=======
            // Execute actions IMMEDIATELY (before audio plays)
            // This ensures navigation/clicks happen right away
            if (response.actions && response.actions.length > 0) {
                await executeActions(response.actions);
>>>>>>> karaya-branch
            }

            updateStatus('speaking');
            const audioUrl = await getAudioUrl(response.response);

            const audio = new Audio(audioUrl);
            audioElementRef.current = audio;

            onResponse?.(response.response);

            await new Promise<void>((resolve) => {
                audio.onended = () => resolve();
                audio.onerror = () => resolve();
                audio.play().catch(() => resolve());
            });

            audioElementRef.current = null;

<<<<<<< HEAD
            // Execute any actions from Gemini (with multi-step support)
            if (response.actions && response.actions.length > 0) {
                console.log(`[Aeyes] Executing ${response.actions.length} action(s)...`);
                await executeActions(response.actions);
            }
=======
            // Audio cue: done speaking, now listening again
            await playDoneSound();
            await playListeningSound();
>>>>>>> karaya-branch

            updateStatus('listening');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed');
            updateStatus('idle');
        } finally {
            processingRef.current = false;
        }
    }, [transcript, onTranscript, onResponse, updateStatus, extractDOMFromPage, executeActions]);

    const openPermissionPage = useCallback(async () => {
        // Get current active tab to return to it later
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const returnTabId = tab?.id;

        const url = returnTabId
            ? chrome.runtime.getURL(`permission.html?returnTo=${returnTabId}`)
            : chrome.runtime.getURL('permission.html');

        chrome.tabs.create({ url });
    }, []);

    const isActive = status !== 'idle';

    // Get color for current state
    const getStateColor = () => {
        switch (status) {
            case 'listening': return 'var(--color-listening)';
            case 'processing': return 'var(--color-processing)';
            case 'speaking': return 'var(--color-speaking)';
            default: return 'var(--color-idle)';
        }
    };

    if (!isSupported) {
        return <div className="error-text">Speech recognition not supported</div>;
    }

    return (
        <div className="flex flex-col gap-3">
            {/* Audio Visualizer - color synced with status */}
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

            {/* Button removed for accessibility - agent auto-starts with voice */}

            {/* Permission Request */}
            {needsPermission && (
                <div className="permission-card animate-fade-in">
                    <div className="mb-3 text-center">
                        <LockIcon />
                    </div>
                    <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
                        Microphone Access Needed
                    </h3>
                    <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)', lineHeight: '1.5' }}>
                        Please allow microphone access to use voice commands. You will be redirected to the settings page to enable access.
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

            {/* Error */}
            {error && !needsPermission && (
                <p className="error-text animate-fade-in">{error}</p>
            )}
        </div>
    );
}
