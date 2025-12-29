import { useEffect, useRef } from 'react';
import { isEchoOfSpokenText } from '../services/echoFilter';
import { playDoneSound } from '../services/audioCues';

interface VoiceActivityOptions {
    status: 'idle' | 'listening' | 'processing' | 'speaking';
    isListening: boolean;
    isPaused: boolean;
    error: string | null;
    transcript: string;
    agentProcessing: boolean;
    speakerSpeaking: boolean;
    lastSpokenText: string | null;
    onProcess: (text: string) => Promise<void>;
    onRestartListening: () => void;
}

export function useVoiceActivity({
    status,
    isListening,
    isPaused,
    error,
    transcript,
    agentProcessing,
    speakerSpeaking,
    lastSpokenText,
    onProcess,
    onRestartListening
}: VoiceActivityOptions) {

    // Use refs for callbacks to prevent effect re-runs on prop changes
    const onProcessRef = useRef(onProcess);
    const onRestartListeningRef = useRef(onRestartListening);

    const lastSpeechTimeRef = useRef<number>(Date.now());
    const prevTextRef = useRef('');
    const lastSeenTextRef = useRef('');

    useEffect(() => {
        onProcessRef.current = onProcess;
    }, [onProcess]);

    useEffect(() => {
        onRestartListeningRef.current = onRestartListening;
    }, [onRestartListening]);

    // Input Processing Logic: Track last activity
    useEffect(() => {
        // Guard: Don't listen if processing or speaking
        if (status === 'processing' || status === 'speaking' || agentProcessing || speakerSpeaking) return;

        const fullCurrentText = transcript.trim();

        // Update activity timestamp ONLY whenever text changes content
        if (fullCurrentText && fullCurrentText !== prevTextRef.current) {
            lastSpeechTimeRef.current = Date.now();
            prevTextRef.current = fullCurrentText;
            lastSeenTextRef.current = fullCurrentText; // Update buffer
        } else if (!fullCurrentText) {
            prevTextRef.current = '';
            // Do NOT clear lastSeenTextRef here.
        }
    }, [transcript, status, agentProcessing, speakerSpeaking]);

    // Robust Silence Detection Loop
    useEffect(() => {
        // Optimization: Only run silence check interval when we are actually listening
        if (status !== 'listening') return;

        const checkSilence = async () => {
            // Extra safety guards
            if (agentProcessing || speakerSpeaking) {
                return;
            }

            // Check if we have text to process
            // Use buffered text if transcript is empty (handled the case where it was wiped by restart)
            let textToProcess = transcript.trim();
            if (!textToProcess) {
                textToProcess = lastSeenTextRef.current?.trim();
            }

            if (!textToProcess) {
                return; // Nothing to process
            }

            const now = Date.now();
            const timeSinceSpeech = now - lastSpeechTimeRef.current;

            if (timeSinceSpeech > 1000) {
                // Silence detected
                console.log(`[VoiceAgent] Silence detected (${timeSinceSpeech}ms). Processing: "${textToProcess}"`);

                // Reset timestamp IMMEDIATELY to prevent double-firing
                lastSpeechTimeRef.current = Date.now();

                // Echo check logic
                if (lastSpokenText && textToProcess && isEchoOfSpokenText(textToProcess, lastSpokenText)) {
                    console.log('[Aeyes] Ignored self-hearing (final):', textToProcess);
                    onRestartListeningRef.current(); // Restart to clear
                    lastSeenTextRef.current = ''; // Clear buffer since we consumed it (as echo)
                    return;
                }

                await playDoneSound();

                // Clear the buffer right before processing
                lastSeenTextRef.current = '';
                await onProcessRef.current(textToProcess);
            }
        };

        const interval = setInterval(checkSilence, 200);
        return () => clearInterval(interval);
    }, [status, agentProcessing, speakerSpeaking, transcript, lastSpokenText]); // Removed callbacks from deps

    // Watchdog
    useEffect(() => {
        if (status === 'listening' && !isListening && !isPaused && !error && !agentProcessing) {
            const timeout = setTimeout(() => {
                // Double check if we are still in "should be listening" state
                if (status === 'listening' && !isListening && !isPaused && !error) {
                    console.log('[VoiceAgent] Watchdog: Restarting stalled recognition...');
                    onRestartListeningRef.current();
                }
            }, 1000); // Relaxed timeout from 500ms to 1000ms
            return () => clearTimeout(timeout);
        }
    }, [status, isListening, isPaused, error, agentProcessing]); // Removed callbacks from deps
}
