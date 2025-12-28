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
    onPlan?: (text: string) => void;
}

export default function VoiceAgent({
    onStatusChange,
    onTranscript,
    onResponse,
    autoStart = false,
    onAutoStartComplete,
    status,
    onPermissionRequired,
    onStreamingTranscript,
    onPlan
}: VoiceAgentProps) {
    const [error, setError] = useState<string | null>(null);
    const [audioLevel, setAudioLevel] = useState<number[]>(new Array(16).fill(0));
    const [needsPermission, setNeedsPermission] = useState(false);
    const [hasAttemptedAutoStart, setHasAttemptedAutoStart] = useState(false);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [hasGreeted, setHasGreeted] = useState(false);
    const [isPaused, setIsPaused] = useState(false); // Listening paused by user

    // Refs for audio and processing state
    const statusRef = useRef(status);
    const hasGreetedRef = useRef(false);
    const audioElementRef = useRef<HTMLAudioElement | null>(null);
    const processingRef = useRef(false);
    const speakingRef = useRef(false); // Synchronous speaking state
    const lastSpokenTextRef = useRef<string>(''); // For echo cancellation
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
        statusRef.current = status;
    }, [status]);

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
        if (statusRef.current === 'processing' || statusRef.current === 'speaking' || processingRef.current || speakingRef.current) return;

        // Calculate current real-time text
        // transcript is automatically reset by startListening(), so we can use it directly
        const fullCurrentText = (transcript + interimTranscript).trim();

        // Echo Masking

        // Content Check: If text matches last spoken, hide it.
        const spoken = lastSpokenTextRef.current;
        if (spoken && fullCurrentText) {
            const cleanInput = fullCurrentText.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim();
            const cleanSpoken = spoken.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim();

            // Check if input is a substring of spoken (Echo)
            if (cleanSpoken.includes(cleanInput)) {
                onStreamingTranscript?.('');
                return;
            }
        }

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
                // Double check status before processing using Refs for live state
                if (statusRef.current === 'processing' || statusRef.current === 'speaking' || processingRef.current || speakingRef.current) return;

                const newText = transcript.trim();

                // Final Echo Check before processing
                if (spoken && newText) {
                    const cleanInput = newText.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim();
                    const cleanSpoken = spoken.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim();
                    if (cleanSpoken.includes(cleanInput)) {
                        console.log('[Aeyes] Ignored self-hearing (final):', newText);
                        startListening(); // Reset
                        return;
                    }
                }

                if (newText) {
                    // Audio cue: user finished speaking
                    await playDoneSound();
                    await processTranscript(newText);
                }
            }, 1000);
        }

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

    // Ref to track paused state in async functions
    const isPausedRef = useRef(isPaused);
    const stoppedManuallyRef = useRef(false); // Track manual stop to avoid race conditions
    const listeningStartTimeRef = useRef<number>(0);

    useEffect(() => {
        isPausedRef.current = isPaused;
        if (!isPaused) stoppedManuallyRef.current = false;
    }, [isPaused]);

    // Track when listening starts for grace period
    useEffect(() => {
        if (status === 'listening') {
            listeningStartTimeRef.current = Date.now();
        }
    }, [status]);

    // Get DOM from current page via content script
    const extractDOMFromPage = useCallback(async (): Promise<any | null> => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) return null;

            const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_DOM' });
            if (response?.success && response?.data) {
                return response.data; // Return object directly
            }
            return null;
            // patched catch block
        } catch (e: any) {
            if (e.message && (e.message.includes('message port closed') || e.message.includes('receiving end does not exist'))) {
                return null;
            }
            return null;
        }
    }, []);

    // DOM extraction with stricter null handling
    const extractDOMWithRetry = useCallback(async (): Promise<any | null> => {
        let attempts = 0;
        while (attempts < 2) {
            const dom = await extractDOMFromPage();
            if (dom) return dom;
            await new Promise(r => setTimeout(r, 500));
            attempts++;
        }
        return null;
    }, [extractDOMFromPage]);

    // Capture page context (lightweight)
    const capturePageContext = useCallback(async (): Promise<any | null> => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) return null;

            return {
                url: tab.url || '',
                title: tab.title || '',
                width: tab.width || 0,
                height: tab.height || 0,
                tabId: tab.id
            };
        } catch (e) {
            console.warn('[Aeyes] Failed to capture page context:', e);
            return null;
        }
    }, []);

    // Tab Management Actions
    const handleTabAction = useCallback(async (action: any): Promise<{ success: boolean; message?: string }> => {
        try {
            console.log('[Aeyes] Handling Tab Action:', action.type, action);
            if (action.type === 'open_tab' || (action.type === 'navigate' && action.newTab)) {
                const url = action.value || 'about:blank';
                await chrome.tabs.create({ url });
                return { success: true, message: `Opened new tab: ${url}` };
            }

            if (action.type === 'close_tab') {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab?.id) {
                    await chrome.tabs.remove(tab.id);
                    return { success: true, message: 'Closed current tab' };
                }
            }

            if (action.type === 'switch_tab') {
                // Simple logic: switch to next tab or specific index if provided (not implemented deep yet)
                // For now, let's just query and switch to the "next" numerical ID or index? 
                // Better: "switch_tab" usually implies satisfying a user request like "previous tab".
                // Let's implement basic next/prev or relative switching if value is 'next'/'previous'.
                const tabs = await chrome.tabs.query({ currentWindow: true });
                const currentTab = tabs.find(t => t.active);
                if (!currentTab) return { success: false, message: 'No active tab' };

                let targetIndex = currentTab.index;
                if (action.value === 'next') targetIndex = (currentTab.index + 1) % tabs.length;
                else if (action.value === 'previous') targetIndex = (currentTab.index - 1 + tabs.length) % tabs.length;
                // If ID provided
                else if (action.tabId) {
                    const target = tabs.find(t => t.id === action.tabId);
                    if (target) {
                        await chrome.tabs.update(target.id!, { active: true });
                        return { success: true, message: `Switched to tab ${target.title}` };
                    }
                }

                const targetTab = tabs.find(t => t.index === targetIndex);
                if (targetTab?.id) {
                    await chrome.tabs.update(targetTab.id, { active: true });
                    return { success: true, message: `Switched to tab ${targetTab.title}` };
                }
            }

            return { success: false, message: `Unknown tab action: ${action.type}` };
        } catch (e) {
            return { success: false, message: `Tab action failed: ${e}` };
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
        tabId?: number;
    }>): Promise<{ success: boolean; failedAction?: string; failReason?: string; lastDom?: any }> => {
        if (!actions || actions.length === 0) return { success: true };

        try {
            let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            // Note: Global restricted page check removed to allow navigation/safe actions.
            // Check is now per-action loop.

            let lastDom: any | null = null;

            for (let i = 0; i < actions.length; i++) {
                const rawAction = actions[i];
                const action: any = {
                    ...rawAction,
                    ...((rawAction as any).args || {})
                };
                const actionName = action.description || action.type;

                // Safety Check: Restricted Pages (Only block if we need to interact)
                if (tab && tab.url && (
                    tab.url.startsWith('chrome://') ||
                    tab.url.startsWith('edge://') ||
                    tab.url.startsWith('about:') ||
                    tab.url.startsWith('view-source:') ||
                    tab.url.includes('chrome.google.com/webstore')
                )) {
                    // Safe actions: navigation, opening tabs, talking, waiting, scanning
                    const isSafeAction = ['navigate', 'open_tab', 'switch_tab', 'say', 'ask', 'wait', 'close_tab', 'scan_page', 'notify_plan', 'go_back', 'reload'].includes(action.type);
                    if (!isSafeAction) {
                        return {
                            success: false,
                            failedAction: actionName,
                            failReason: 'I cannot interact with this protected browser page. Please try navigating to a different website first.'
                        };
                    }
                }

                console.log(`[Aeyes Orchestrator] Step ${i + 1}/${actions.length}: Executing ${action.type}`, action);

                // 1. Intercept Tab Actions
                if (['open_tab', 'close_tab', 'switch_tab'].includes(action.type)) {
                    // Update value/url mapping for tab actions
                    if (!action.value && action.url) action.value = action.url;

                    const result = await handleTabAction(action);
                    console.log(`[Aeyes Orchestrator] Tab Action Result:`, result);
                    if (!result.success) {
                        return { success: false, failedAction: actionName, failReason: result.message };
                    }
                    // Wait for tab switch/create
                    await new Promise(r => setTimeout(r, 500));
                    // Refresh current tab reference
                    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    continue;
                }

                // 2. Intercept Communication/Wait Actions
                if (['say', 'ask', 'wait', 'scan_page', 'notify_plan', 'go_back', 'reload', 'fetch_dom', 'get_page_status'].includes(action.type)) {
                    if (action.type === 'wait') {
                        const duration = parseInt(action.value || (action.args && action.args.duration) || '1000');
                        await new Promise(r => setTimeout(r, duration));
                    } else if (action.type === 'scan_page') {
                        // "scan_page" just means refresh context. We do nothing here, loop continues and extracts DOM.
                        await new Promise(r => setTimeout(r, 500));
                    } else if (action.type === 'fetch_dom') {
                        // Execute DOM extraction with optional selector and optimize flag
                        if (tab?.id) {
                            try {
                                const selector = action.args?.selector || '';
                                const limit = action.args?.limit || 50;
                                const optimize = action.args?.optimize ?? true;
                                await chrome.tabs.sendMessage(tab.id, {
                                    type: 'EXTRACT_DOM',
                                    selector,
                                    limit,
                                    optimize
                                });
                            } catch (e) {
                                console.warn('[Aeyes] fetch_dom failed:', e);
                            }
                        }
                    } else if (action.type === 'get_page_status') {
                        // Execute page status check
                        if (tab?.id) {
                            try {
                                await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_STATUS' });
                            } catch (e) {
                                console.warn('[Aeyes] get_page_status failed:', e);
                            }
                        }
                    } else if (action.type === 'notify_plan') {
                        const planText = action.value || (action.args && action.args.plan) || action.args?.text;
                        if (planText) onPlan?.(planText);
                    } else if (action.type === 'go_back') {
                        if (tab?.id) {
                            await chrome.tabs.goBack(tab.id);
                            await new Promise(r => setTimeout(r, 1000)); // Wait for nav
                            // Critical: Refresh tab reference
                            [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        }
                    } else if (action.type === 'reload') {
                        if (tab?.id) {
                            await chrome.tabs.reload(tab.id);
                            await new Promise(r => setTimeout(r, 1500)); // Wait for reload
                            // Critical: Refresh tab reference
                            [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                        }
                    } else {
                        // "say" or "ask"
                        const textToSpeak = action.value || (action.args && action.args.text);
                        if (textToSpeak) {
                            // Stop any previous audio
                            stopAudio();

                            // Visual update (optional, maybe too noisy to show every 'say' action text?)
                            // onResponse?.(textToSpeak); 

                            // Fetch and play
                            try {
                                updateStatus('speaking');
                                speakingRef.current = true;
                                const audioUrl = await getAudioUrl(textToSpeak);
                                const audio = new Audio(audioUrl);
                                audioElementRef.current = audio;

                                await new Promise<void>((resolve) => {
                                    audio.onended = () => resolve();
                                    audio.onerror = () => resolve();
                                    audio.play().catch(() => resolve());
                                });
                                audioElementRef.current = null;
                                speakingRef.current = false;
                                updateStatus('processing'); // Go back to processing/listening state
                            } catch (e) {
                                console.warn('[Aeyes] TTS failed for action:', e);
                            }
                        }
                    }
                    continue;
                }

                // 3. Handle Navigate (Legacy wrapper)
                // Normalize url/value
                if (!action.value && action.url) action.value = action.url;

                if (action.type === 'navigate' && action.value) {
                    let url = action.value;
                    if (!url.startsWith('http')) url = 'https://' + url;

                    if ((action as any).newTab) {
                        await chrome.tabs.create({ url });
                    } else {
                        if (tab?.id) await chrome.tabs.update(tab.id, { url });
                    }

                    if (action.waitForPage !== false) await new Promise(r => setTimeout(r, 2000));

                    // Critical: Refresh tab reference after navigation so subsequent actions see the new URL
                    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    continue;
                }

                if (!tab?.id) return { success: false, failedAction: actionName, failReason: 'No active tab for page action' };

                // 4. Page Actions (Click, Type, etc.)

                // If action needs DOM, fetch it
                if (action.needsDom) {
                    console.log('[Aeyes] Fetching fresh DOM for element resolution...');
                    // ... (existing logic for resolve-element) ...
                    // Get fresh DOM from the current page
                    let domContext: any | null = null;
                    try {
                        const response = await chrome.tabs.sendMessage(tab.id!, { type: 'EXTRACT_DOM' });
                        if (response?.success && response?.data) {
                            domContext = response.data;
                            lastDom = domContext;
                        }
                    } catch (e: any) {
                        console.warn('[Aeyes] Could not extract DOM:', e);
                        // If it's just a port closed (e.g. during nav), we might want to continue blindly?
                        // But we need DOM for resolution. If we can't get it, we can't resolve.
                        // We will return failure for resolution, which is correct.
                        return {
                            success: false,
                            failedAction: actionName,
                            failReason: 'Could not fetch DOM for resolution: ' + (e.message || 'Unknown error')
                        };
                    }

                    if (domContext && (action as any).description) {
                        // Backend Resolution Call
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
                            if (resolved.success && resolved.element_id) {
                                action.elementId = resolved.element_id;
                            } else {
                                return {
                                    success: false,
                                    failedAction: actionName,
                                    failReason: `Resolution failed: ${resolved.message}`
                                };
                            }
                        } catch (e) {
                            return { success: false, failedAction: actionName, failReason: 'Backend resolution error' };
                        }
                    }
                }

                // Send to Content Script
                try {
                    const result = await chrome.tabs.sendMessage(tab.id!, { type: 'EXECUTE_ACTION', action });
                    console.log(`[Aeyes Orchestrator] Action Result:`, result);

                    if (!result || !result.success) {
                        return {
                            success: false,
                            failedAction: actionName,
                            failReason: result?.message || 'Content script error',
                            lastDom: lastDom || undefined
                        };
                    }
                } catch (e: any) {
                    // Check if error is due to page unloading (navigation)
                    if (e.message && (e.message.includes('message port closed') || e.message.includes('receiving end does not exist'))) {
                        console.log('[Aeyes] Action caused probable navigation (port closed). checks out.');
                        return { success: true, lastDom: undefined };
                    }
                    return { success: false, failedAction: actionName, failReason: 'Content script unreachable. Try reloading the page.' };
                }

                // Post-Action Wait
                await new Promise(r => setTimeout(r, 500));
            }

            console.log('[Aeyes] All actions completed successfully');
            return { success: true, lastDom: lastDom || undefined };
        } catch (error: any) {
            console.error('[Aeyes] Action execution failed:', error);
            return {
                success: false,
                failedAction: 'execution_error',
                failReason: `Unexpected error: ${error.message}`
            };
        }
    }, [handleTabAction]);

    const processTranscript = useCallback(async (text: string) => {
        if (processingRef.current) return;
        processingRef.current = true;

        // Stop listening during processing phase
        abortListening();

        const capitalizedText = text.charAt(0).toUpperCase() + text.slice(1);
        onTranscript?.(capitalizedText);

        updateStatus('processing');

        const MAX_TOTAL_STEPS = 30; // Increased to 50 to handle complex multi-step tasks
        const MAX_CONSECUTIVE_FAILURES = 3;

        let stepCount = 0;
        let consecutiveFailures = 0;
        let currentTranscript = capitalizedText;
        let finalResponseText = '';
        let loopDomContext: any | null = null; // Track DOM across loop
        let response: any = null; // Store response across iterations

        let currentConversationId = conversationId; // Local copy for loop continuity

        try {
            while (stepCount < MAX_TOTAL_STEPS) {
                // Check if user stopped manually during loop
                if (stoppedManuallyRef.current) break;

                stepCount++;

                // 1. Get DOM context from current page
                // Note: On restricted pages, extractDOMWithRetry will return null (handled deep in extractDOMFromPage via message error or simple null return)
                // But we don't want to crash. 
                // We should probably check URL here too to avoid "I can't see" loop if we are genuinely on newtab.
                // But let's let backend handle "I can't see anything" naturally.
                loopDomContext = await extractDOMWithRetry();
                const pageContext = await capturePageContext();

                // Safety: If follow-up requested but NO DOM, break loop to prevent infinite recursion
                if (stepCount > 1 && !loopDomContext && !response?.actions?.length) {
                    // Exception: we might be navigating.
                    // If we just navigated, loopDomContext might be null temporarily.
                    // But if we are persistently null, we break.

                    // Simple logic: if connection is good, proceed.
                    // If restricted page, we likely have NULL dom, but we might want to ask questions.
                    // We'll let it proceed. 
                    // Wait-- original logic blocked if !loopDomContext.
                    // Let's modify: if page is protected, we proceed WITHOUT dom.

                    const isProtected = pageContext?.url?.startsWith('chrome://') || pageContext?.url?.startsWith('edge://');
                    if (!isProtected) {
                        console.warn('[Aeyes] Infinite loop risk: Follow-up requested but no DOM available.');
                        finalResponseText = "I can't see the page content right now. Please make sure you're on an accessible web page.";
                        break;
                    }
                }


                // 2. Send transcript AND context to backend with conversation ID
                response = await sendToBackend({
                    transcript: currentTranscript,
                    context: loopDomContext || undefined,
                    page_context: pageContext || undefined,
                    conversation_id: currentConversationId || undefined
                });

                if (stoppedManuallyRef.current) break;

                // Store conversation ID for continuity
                if (response.conversation_id) {
                    currentConversationId = response.conversation_id; // Update local loop var
                    if (!conversationId) setConversationId(response.conversation_id); // Sync React state if needed
                }

                // 3. Execute actions if any
                let actionResult = { success: true } as { success: boolean; failedAction?: string; failReason?: string; lastDom?: any };
                if (response.actions && response.actions.length > 0) {
                    actionResult = await executeActions(response.actions);
                }

                // 3b. Execute post_analysis tools if actions succeeded
                // This implements "Execute Action -> Execute Analysis -> Return Combined Result"
                if (actionResult.success && response.post_analysis && response.post_analysis.length > 0) {
                    console.log('[Aeyes] Executing post_analysis tools:', response.post_analysis);
                    // Small delay to let page settle after action
                    await new Promise(resolve => setTimeout(resolve, 500));

                    // Execute perception tools (results feed into next loop iteration via DOM extraction)
                    const analysisResult = await executeActions(response.post_analysis);
                    if (!analysisResult.success) {
                        console.warn('[Aeyes] Post-analysis failed:', analysisResult.failReason);
                        // Don't fail the whole action, just log the warning
                    }
                }

                if (stoppedManuallyRef.current) break;

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

            if (stoppedManuallyRef.current) {
                updateStatus('idle');
                processingRef.current = false;
                return;
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

            if (stoppedManuallyRef.current) { updateStatus('idle'); return; }

            const audio = new Audio(audioUrl);
            audioElementRef.current = audio;
            lastSpokenTextRef.current = finalResponseText.trim().toLowerCase(); // Store for echo cancellation

            onResponse?.(finalResponseText);

            await new Promise<void>((resolve) => {
                const finish = () => {
                    resolve();
                };
                audio.onended = finish;
                audio.onpause = finish; // Resolve on pause (Stop button) to unblock the loop
                audio.onerror = finish;
                audio.play().catch(() => finish());
            });

            audioElementRef.current = null;
            speakingRef.current = false;

            // Restart listening if not paused
            // CRITICAL: Check stoppedManuallyRef instead of just isPausedRef
            if (!stoppedManuallyRef.current && !isPausedRef.current) {
                // Wait delay to ensure audio is fully done and avoid self-hearing
                // Increased to 1000ms to allow physical Room Echo to dissipate naturally
                await new Promise(resolve => setTimeout(resolve, 1000));

                if (!stoppedManuallyRef.current && !isPausedRef.current) {
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

            if (!isPaused && !stoppedManuallyRef.current) {
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
    }, [transcript, onTranscript, onResponse, updateStatus, extractDOMWithRetry, executeActions, isPaused, abortListening, stopListening, startListening, conversationId]);


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

    // Toggle pause/resume listening
    const handlePauseToggle = useCallback(async () => {
        if (isPaused) {
            // Resume listening
            await playUnmuteSound();
            setIsPaused(false);
            stoppedManuallyRef.current = false;
            // State update will trigger ref update, but for immediate logic we can assume false
            startListening();
            updateStatus('listening');
        } else {
            // Pause listening AND stop speaking
            await playMuteSound();
            setIsPaused(true);
            stoppedManuallyRef.current = true; // Set manual stop flag to prevent race conditions
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

            {/* Debug Controls */}
            <div style={{ marginTop: '20px', borderTop: '1px solid #333', paddingTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                    className="kbd"
                    style={{ cursor: 'pointer', background: '#333', color: '#fff', border: 'none', padding: '6px 10px' }}
                    onClick={async () => {
                        try {
                            const res = await fetch('http://localhost:8000/health');
                            const data = await res.json();
                            alert('Backend Health: ' + JSON.stringify(data));
                        } catch (e: any) {
                            alert('Backend Error: ' + e.message);
                        }
                    }}
                >
                    Test Health
                </button>
                <button
                    className="kbd"
                    style={{ cursor: 'pointer', background: '#333', color: '#fff', border: 'none', padding: '6px 10px' }}
                    onClick={async () => {
                        try {
                            const url = await getAudioUrl('Testing text to speech connection.');
                            const audio = new Audio(url);
                            audio.play();
                        } catch (e: any) {
                            alert('TTS Error: ' + e.message);
                        }
                    }}
                >
                    Test Speak
                </button>
            </div>
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
