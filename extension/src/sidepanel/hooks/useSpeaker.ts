import { useRef, useCallback, useMemo, useEffect } from 'react';

export interface SpeakerCallbacks {
    onStatusChange?: (status: 'speaking' | 'processing' | 'idle' | 'listening') => void;
    onResponse?: (text: string) => void;
}

export interface SpeakerState {
    audioElementRef: React.MutableRefObject<HTMLAudioElement | null>;
    speakingRef: React.MutableRefObject<boolean>;
    lastSpokenTextRef: React.MutableRefObject<string>;
    stopAudio: () => void;
    speak: (text: string, signal?: AbortSignal) => Promise<void>;
}

export function useSpeaker(callbacks: SpeakerCallbacks): SpeakerState {
    const audioElementRef = useRef<HTMLAudioElement | null>(null);
    const speakingRef = useRef(false);
    const lastSpokenTextRef = useRef<string>('');

    // Latest Ref Pattern: keep callbacks in a ref to avoid dependency churn
    const callbacksRef = useRef(callbacks);
    useEffect(() => {
        callbacksRef.current = callbacks;
    }, [callbacks]);

    const stopAudio = useCallback(() => {
        if (audioElementRef.current) {
            console.log('[UseSpeaker] Stopping current audio');
            audioElementRef.current.pause();
            audioElementRef.current.src = '';
            audioElementRef.current = null;
        }
        speakingRef.current = false;
    }, []);

    const speak = useCallback(async (text: string, signal?: AbortSignal) => {
        if (!text) return;

        // NEW: Implement Interruption - STOP old speech immediately when new speech starts
        stopAudio();

        try {
            // Update state
            callbacksRef.current.onStatusChange?.('speaking');
            speakingRef.current = true;

            // Store for echo cancellation
            lastSpokenTextRef.current = text.trim().toLowerCase();

            // Notify UI
            callbacksRef.current.onResponse?.(text);

            const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
            const audioUrl = `${BACKEND_URL}/speak?text=${encodeURIComponent(text)}`;

            console.log('[UseSpeaker] Playing streaming audio from:', audioUrl);

            const audio = new Audio(audioUrl);
            audioElementRef.current = audio;

            await new Promise<void>((resolve) => {
                let resolved = false;
                const finish = (reason: string) => {
                    if (resolved) return;
                    resolved = true;
                    console.log(`[UseSpeaker] Audio finished: ${reason}`);
                    audio.onended = null;
                    audio.onerror = null;
                    audio.onpause = null;
                    resolve();
                };

                const onAbort = () => {
                    audio.pause();
                    audio.src = '';
                    finish('aborted');
                };

                signal?.addEventListener('abort', onAbort);

                audio.onended = () => {
                    signal?.removeEventListener('abort', onAbort);
                    finish('onended');
                };
                audio.onerror = (e) => {
                    signal?.removeEventListener('abort', onAbort);
                    console.error('[UseSpeaker] Audio element error:', e);
                    finish('error');
                };
                audio.onpause = () => {
                    // Pause can happen due to interruption (stopAudio) or system.
                    // If we are still "speakingRef", it's probably an interruption.
                    finish('paused');
                };

                audio.play().catch((e) => {
                    signal?.removeEventListener('abort', onAbort);
                    console.warn('[UseSpeaker] Play failed:', e);
                    finish('play_failed');
                });
            });

        } catch (e: any) {
            if (e.name === 'AbortError') return;
            console.warn('[UseSpeaker] Speak failed:', e);
        } finally {
            console.log('[UseSpeaker] Speak cycle complete');
            audioElementRef.current = null;
            speakingRef.current = false;
        }
    }, [stopAudio]);

    return useMemo(() => ({
        audioElementRef,
        speakingRef,
        lastSpokenTextRef,
        stopAudio,
        speak
    }), [stopAudio, speak]);
}
