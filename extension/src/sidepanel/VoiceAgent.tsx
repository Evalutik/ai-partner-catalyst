import { useState, useCallback, useRef, useEffect } from 'react';
import { useSpeechRecognition } from './useSpeechRecognition';
import { sendToBackend, getAudioUrl } from './api';
import { playStartupSound, playListeningSound, playDoneSound, playMuteSound, playUnmuteSound } from './audioCues';
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
    const [audioLevel, setAudioLevel] = useState<number[]>(new Array(16).fill(0));
    const [needsPermission, setNeedsPermission] = useState(false);
    const [hasAttemptedAutoStart, setHasAttemptedAutoStart] = useState(false);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [hasGreeted, setHasGreeted] = useState(false);
    const [isPaused, setIsPaused] = useState(false); // Listening paused by user

    // Refs for audio and processing state
    const hasGreetedRef = useRef(false);
    const audioElementRef = useRef<HTMLAudioElement | null>(null);
    const processingRef = useRef(false);
    const speakingRef = useRef(false); // Synchronous speaking state
    const silenceTimeoutRef = useRef<number | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

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
        speakingRef.current = false; // Ensure speaking flag is cleared
    }, []);

    const playGreeting = useCallback(async () => {
        if (hasGreetedRef.current) return;
        hasGreetedRef.current = true;
        setHasGreeted(true);

        try {
            // Play startup sound first for blind users
            await playStartupSound();

            updateStatus('speaking');
            speakingRef.current = true;

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
            speakingRef.current = false;

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
            speakingRef.current = false;
        }
    }, [hasGreeted, updateStatus, startListening, startAudioVisualization, onResponse]);

    // Initial greeting on mount
    useEffect(() => {
        if (autoStart && !hasAttemptedAutoStart && isSupported) {
            setHasAttemptedAutoStart(true);
            // Small delay to ensure permissions are ready
            setTimeout(() => {
                playGreeting();
            }, 500);
        }
    }, [autoStart, hasAttemptedAutoStart, isSupported, playGreeting]);

    useEffect(() => {
        return () => {
            stopAudioVisualization();
            stopAudio();
        };
    }, [stopAudioVisualization, stopAudio]);

    useEffect(() => {
        // STRICT GUARD: Ignore any input if we are processing or speaking
        if (status === 'processing' || status === 'speaking' || processingRef.current || speakingRef.current) return;

        // Calculate current real-time text
        // transcript is automatically reset by startListening(), so we can use it directly
        const fullCurrentText = (transcript + interimTranscript).trim();

        if (fullCurrentText) {
            const capitalizedText = fullCurrentText.charAt(0).toUpperCase() + fullCurrentText.slice(1);
            onStreamingTranscript?.(capitalizedText);
        } else {
            onStreamingTranscript?.('');
        }

        if (!transcript) return;

        if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);

        if (transcript.trim()) {
            silenceTimeoutRef.current = window.setTimeout(async () => {
                // Double check status before processing
                if (status === 'processing' || status === 'speaking' || processingRef.current || speakingRef.current) return;

                const newText = transcript.trim();
                if (newText) {
                    // Audio cue: user finished speaking
                    await playDoneSound();
                    await processTranscript(newText);
                }
            }, 1500);
        }

        return () => {
            if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
        };
        return () => {
            if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
        };
    }, [transcript, interimTranscript, onStreamingTranscript, status]);

    // Watchdog: Ensure speech recognition is actually running when we think it is
    useEffect(() => {
        if (status === 'listening' && !isListening && !isPaused && !error && !processingRef.current) {
            const timeout = setTimeout(() => {
                if (status === 'listening' && !isListening && !isPaused && !error) {
                    console.log('[VoiceAgent] Watchdog: Restarting stalled recognition...');
                    startListening();
                }
            }, 500); // Give it a moment to transition
            return () => clearTimeout(timeout);
        }
    }, [status, isListening, isPaused, error, startListening]);



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
    // Returns execution result for adaptive error handling
    const executeActions = useCallback(async (actions: Array<{
        type: string;
        elementId?: string;
        value?: string;
        waitForPage?: boolean;
        needsDom?: boolean;
        description?: string;
    }>): Promise<{ success: boolean; failedAction?: string; failReason?: string; lastDom?: string }> => {
        if (!actions || actions.length === 0) return { success: true };

        try {
            let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) return { success: false, failReason: 'No active tab' };

            let lastDom: string | null = null;

            for (let i = 0; i < actions.length; i++) {
                const action = actions[i];
                console.log(`[Aeyes] Executing action ${i + 1}/${actions.length}:`, action.description || action.type);

                // Handle navigate actions directly with Chrome tabs API
                if (action.type === 'navigate' && action.value) {
                    let url = action.value;
                    if (!url.startsWith('http://') && !url.startsWith('https://')) {
                        url = 'https://' + url;
                    }

                    const openInNewTab = (action as any).newTab !== false;

                    if (openInNewTab) {
                        console.log('[Aeyes] Opening in new tab:', url);
                        const newTab = await chrome.tabs.create({ url });
                        if (newTab?.id) {
                            tab = newTab;
                        }
                    } else {
                        console.log('[Aeyes] Navigating current tab to:', url);
                        if (tab.id) {
                            await chrome.tabs.update(tab.id, { url });
                        }
                    }

                    if (action.waitForPage !== false) {
                        await new Promise(resolve => setTimeout(resolve, 2500));
                    }
                    continue;
                }

                // If action needs DOM, fetch it and resolve the element ID
                if (action.needsDom) {
                    console.log('[Aeyes] Fetching fresh DOM for element resolution...');
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    // Get fresh DOM from the current page
                    let domContext: string | null = null;
                    try {
                        const response = await chrome.tabs.sendMessage(tab.id!, { type: 'EXTRACT_DOM' });
                        if (response?.success && response?.data) {
                            domContext = JSON.stringify(response.data);
                            lastDom = domContext;
                        }
                    } catch (e) {
                        console.warn('[Aeyes] Could not extract DOM:', e);
                        return {
                            success: false,
                            failedAction: action.description || action.type,
                            failReason: 'Could not access page content. The page may not be fully loaded.',
                            lastDom: lastDom || undefined
                        };
                    }

                    if (domContext && (action as any).description) {
                        console.log('[Aeyes] Resolving element:', (action as any).description);
                        try {
                            const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
                            const resolveResponse = await fetch(`${backendUrl}/resolve-element`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    dom_context: domContext,
                                    action_type: action.type,
                                    action_description: (action as any).description,
                                    action_value: action.value
                                })
                            });

                            const resolved = await resolveResponse.json();
                            console.log('[Aeyes] Element resolution result:', resolved);

                            if (resolved.success && resolved.element_id) {
                                action.elementId = resolved.element_id;
                            } else {
                                // Element not found - return failure for adaptive handling
                                return {
                                    success: false,
                                    failedAction: (action as any).description || action.type,
                                    failReason: `Could not find "${(action as any).description}". ${resolved.message || 'Element may not be visible, may need to scroll, or login may be required.'}`,
                                    lastDom: domContext
                                };
                            }
                        } catch (e) {
                            console.error('[Aeyes] Element resolution API failed:', e);
                            return {
                                success: false,
                                failedAction: (action as any).description || action.type,
                                failReason: 'Failed to communicate with backend',
                                lastDom: domContext
                            };
                        }
                    }
                }

                // Execute the action via content script
                try {
                    const result = await chrome.tabs.sendMessage(tab.id!, { type: 'EXECUTE_ACTION', action });
                    if (result && !result.success) {
                        return {
                            success: false,
                            failedAction: action.description || action.type,
                            failReason: result.message || 'Action failed',
                            lastDom: lastDom || undefined
                        };
                    }
                } catch (e) {
                    console.warn('[Aeyes] Content script not available:', action.type);
                    return {
                        success: false,
                        failedAction: action.description || action.type,
                        failReason: 'Page is not accessible (may be a restricted page)',
                        lastDom: lastDom || undefined
                    };
                }

                if (action.waitForPage) {
                    console.log('[Aeyes] Waiting for page to load...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }

                if (i < actions.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            }

            console.log('[Aeyes] All actions completed successfully');
            return { success: true, lastDom: lastDom || undefined };
        } catch (error) {
            console.error('[Aeyes] Action execution failed:', error);
            return {
                success: false,
                failReason: 'Unexpected error during action execution'
            };
        }
    }, []);

    const processTranscript = useCallback(async (text: string) => {
        if (processingRef.current) return;
        processingRef.current = true;

        // Stop listening during processing phase
        abortListening();

        const capitalizedText = text.charAt(0).toUpperCase() + text.slice(1);
        onTranscript?.(capitalizedText);

        updateStatus('processing');

        const MAX_TOTAL_STEPS = 10;
        const MAX_CONSECUTIVE_FAILURES = 3;

        let stepCount = 0;
        let consecutiveFailures = 0;
        let currentTranscript = capitalizedText;
        let finalResponseText = '';

        try {
            while (stepCount < MAX_TOTAL_STEPS) {
                stepCount++;

                // 1. Get DOM context from current page
                let domContext = await extractDOMFromPage();

                // 2. Send transcript AND context to backend with conversation ID
                let response = await sendToBackend({
                    transcript: currentTranscript,
                    context: domContext || undefined,
                    conversation_id: conversationId || undefined
                });

                // Store conversation ID for continuity
                if (response.conversation_id && !conversationId) {
                    setConversationId(response.conversation_id);
                }

                // 3. Execute actions if any
                let actionResult = { success: true } as { success: boolean; failedAction?: string; failReason?: string; lastDom?: string };
                if (response.actions && response.actions.length > 0) {
                    actionResult = await executeActions(response.actions);
                }

                // 4. Handle Failure
                if (!actionResult.success) {
                    consecutiveFailures++;
                    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                        throw new Error(`Failed to complete task after ${MAX_CONSECUTIVE_FAILURES} failed attempts on step "${actionResult.failedAction}": ${actionResult.failReason}`);
                    }

                    console.log(`[Aeyes] Action failed (consecutive failure ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`, actionResult.failReason);

                    // Build recovery message for AI
                    currentTranscript = `[ACTION_FAILED] I tried to "${actionResult.failedAction}" but it failed: ${actionResult.failReason}. Please suggest a recovery action (scroll, wait, ask user for help, or try a different approach). Current page context is attached.`;

                    // Use the last DOM from the failed action if available to give AI better context
                    if (actionResult.lastDom) {
                        // Ideally we would pass this to the next loop iteration's sendToBackend,
                        // but extractDOMFromPage() will run again at top of loop.
                        // We rely on the page state being whatever it is now.
                    }
                    continue; // Loop back to try recovery
                }

                // Success! Reset consecutive failures
                consecutiveFailures = 0;

                // 5. Check Follow Up
                if (response.requiresFollowUp) {
                    console.log(`[Aeyes] Follow-up required (step ${stepCount}/${MAX_TOTAL_STEPS})...`);

                    // Wait a bit for new page to fully load if actions were just taken
                    if (response.actions && response.actions.length > 0) {
                        await new Promise(resolve => setTimeout(resolve, 1500));
                    }

                    currentTranscript = "[Continue - analyze the current page and complete the task]";
                    continue; // Loop back to continue task
                }

                // 6. No failure, no follow-up -> We are done!
                finalResponseText = response.response;
                break;
            }

            // Exited loop. Check if we failed to get a final response.
            if (!finalResponseText) {
                if (stepCount >= MAX_TOTAL_STEPS) {
                    console.error('[Aeyes] Max total steps reached');
                    finalResponseText = "I'm sorry, I tried to complete the task but it required too many steps. Could you try breaking it down into simpler requests?";
                } else {
                    // Should not start here unless empty response from backend
                    finalResponseText = "Task completed.";
                }
            }

            // Speak final response
            updateStatus('speaking');
            speakingRef.current = true;
            const audioUrl = await getAudioUrl(finalResponseText);

            const audio = new Audio(audioUrl);
            audioElementRef.current = audio;

            onResponse?.(finalResponseText);

            await new Promise<void>((resolve) => {
                audio.onended = () => resolve();
                audio.onerror = () => resolve();
                audio.play().catch(() => resolve());
            });

            audioElementRef.current = null;
            speakingRef.current = false;

            // Restart listening if not paused
            if (!isPausedRef.current) {
                // Wait delay to ensure audio is fully done and avoid self-hearing
                await new Promise(resolve => setTimeout(resolve, 1500));

                // Check again after delay
                if (!isPausedRef.current) {
                    await playDoneSound();
                    await playListeningSound();
                    startListening();
                    updateStatus('listening');
                } else {
                    updateStatus('idle');
                }
            } else {
                updateStatus('idle');
            }

        } catch (err) {
            console.error('[Aeyes] Process failed:', err);
            const errorMsg = err instanceof Error ? err.message : 'I encountered an error.';

            // Speak the error to the user
            try {
                updateStatus('speaking');
                speakingRef.current = true;
                const audioUrl = await getAudioUrl("I'm having trouble with that. " + errorMsg);
                const audio = new Audio(audioUrl);
                audioElementRef.current = audio;
                onResponse?.("Error: " + errorMsg);
                await new Promise<void>((resolve) => {
                    audio.onended = () => resolve();
                    audio.onerror = () => resolve();
                    audio.play().catch(() => resolve());
                });
                audioElementRef.current = null;
                speakingRef.current = false;
            } catch (e) { /* ignore audio error */ }

            if (!isPaused) {
                stopListening(); // Make sure we stop in error state or reset?
                // Wait small delay here too
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Actually usually better to go back to listening
                await playListeningSound();
                startListening();
                updateStatus('listening');
            } else {
                updateStatus('idle');
            }
        } finally {
            processingRef.current = false;
        }
    }, [transcript, onTranscript, onResponse, updateStatus, extractDOMFromPage, executeActions, isPaused, abortListening, stopListening, startListening, conversationId]);


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

    // Ref to track paused state in async functions
    const isPausedRef = useRef(isPaused);
    useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

    // Toggle pause/resume listening
    const handlePauseToggle = useCallback(async () => {
        if (isPaused) {
            // Resume listening
            await playUnmuteSound();
            setIsPaused(false);
            // State update will trigger ref update, but for immediate logic we can assume false
            startListening();
            updateStatus('listening');
        } else {
            // Pause listening AND stop speaking
            await playMuteSound();
            setIsPaused(true);
            stopAudio(); // Stop any current speech
            stopListening();
            updateStatus('idle');
        }
    }, [isPaused, startListening, stopListening, stopAudio, updateStatus]);

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

            {/* Pause/Resume Toggle Button */}
            {!needsPermission && (
                <button
                    onClick={handlePauseToggle}
                    className={`btn-voice ${isPaused ? 'btn-voice-idle' : `btn-voice-${status}`}`}
                    aria-label={isPaused ? 'Start listening' : 'Stop listening'}
                    disabled={status === 'processing'}
                >
                    {isPaused ? (
                        <MicIcon />
                    ) : status === 'processing' ? (
                        <div className="spinner-wrapper">
                            <div className="spinner-ring" />
                            <StopIconSmall />
                        </div>
                    ) : (
                        <StopIcon />
                    )}
                    <span>{isPaused ? 'Start' : status === 'processing' ? 'Processing...' : 'Stop'}</span>
                </button>
            )}

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

function MicIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
    );
}

function StopIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
    );
}

function StopIconSmall() {
    return (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="spinner-icon">
            <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
    );
}

