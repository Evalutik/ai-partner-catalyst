import { useRef, useCallback, useMemo, useEffect } from 'react';
import { getAudioUrl } from '../services/api';

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
            audioElementRef.current.pause();
            audioElementRef.current.currentTime = 0;
            audioElementRef.current = null;
        }
        speakingRef.current = false;
    }, []);

    const speak = useCallback(async (text: string, signal?: AbortSignal) => {
        if (!text) return;

        try {
            // Update state
            callbacksRef.current.onStatusChange?.('speaking');
            speakingRef.current = true;

            // Store for echo cancellation
            lastSpokenTextRef.current = text.trim().toLowerCase();

            // Notify UI
            callbacksRef.current.onResponse?.(text);

            console.log('[UseSpeaker] Fetching audio for:', text.substring(0, 20) + '...');
            // Fetch audio
            const audioUrl = await getAudioUrl(text, signal);
            console.log('[UseSpeaker] Audio URL fetched');

            // Check if aborted during fetch
            if (signal?.aborted || !speakingRef.current) {
                console.log('[UseSpeaker] Speak aborted/stopped after fetch');
                speakingRef.current = false;
                callbacksRef.current.onStatusChange?.('idle');
                return;
            }

            const audio = new Audio(audioUrl);
            audioElementRef.current = audio;

            console.log('[UseSpeaker] Playing audio...');
            // Play and wait
            await new Promise<void>((resolve) => {
                let resolved = false;
                const finish = (reason: string) => {
                    if (resolved) return;
                    resolved = true;
                    console.log(`[UseSpeaker] Audio finished: ${reason}`);
                    // Cleanup listeners to avoid leaks
                    audio.onended = null;
                    audio.onerror = null;
                    audio.onpause = null;
                    audio.ontimeupdate = null;
                    resolve();
                };

                audio.onended = () => finish('onended');
                audio.onerror = (e) => {
                    console.error('[UseSpeaker] Audio element error:', e);
                    finish('error');
                };
                audio.onpause = () => {
                    // Only consider pause as finish if we are NOT at the beginning (auto-pause on start?)
                    // Actually, manual stop calls pause.
                    // If audio is paused by system, we should probably stop?
                    // But let's verify if duration > 0 and not ended
                    if (audio.currentTime > 0 && !audio.ended && !audio.paused) {
                        // Spurious pause?
                    } else {
                        finish('paused');
                    }
                };

                // Safety: Poll for completion in case events are missed
                const checkInterval = setInterval(() => {
                    if (resolved) {
                        clearInterval(checkInterval);
                        return;
                    }
                    if (audio.ended) {
                        finish('polling_ended');
                        clearInterval(checkInterval);
                    }
                    // Optional: Check if stalled?
                }, 200);

                // Safety: Audio metadata loaded
                audio.onloadedmetadata = () => {
                    console.log(`[UseSpeaker] Audio duration: ${audio.duration}s`);
                    // If duration is Infinity or NaN, safeguard?
                };

                audio.play().then(() => {
                    // Play started
                }).catch((e) => {
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
    }, []); // Empty dependency array! Stable forever.

    return useMemo(() => ({
        audioElementRef,
        speakingRef,
        lastSpokenTextRef,
        stopAudio,
        speak
    }), [stopAudio, speak]);
}
