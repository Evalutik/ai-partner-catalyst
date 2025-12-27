import { useState, useCallback, useRef, useEffect } from 'react';

// Web Speech API types (Chrome-specific)
interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
    resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
    error: string;
    message: string;
}

type SpeechRecognition = {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start: () => void;
    stop: () => void;
    abort: () => void;
    onresult: (event: SpeechRecognitionEvent) => void;
    onerror: (event: SpeechRecognitionErrorEvent) => void;
    onend: () => void;
    onstart: () => void;
};

declare global {
    interface Window {
        webkitSpeechRecognition: new () => SpeechRecognition;
        SpeechRecognition: new () => SpeechRecognition;
    }
}

export interface UseSpeechRecognitionResult {
    isListening: boolean;
    transcript: string;
    interimTranscript: string;
    error: string | null;
    isSupported: boolean;
    start: () => void;
    stop: () => void;
    abort: () => void;
}

export function useSpeechRecognition(): UseSpeechRecognitionResult {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [interimTranscript, setInterimTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);

    const isAbortedRef = useRef(false);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const shouldAutoRestartRef = useRef(true);  // Controls auto-restart behavior
    const isSupported = typeof window !== 'undefined' &&
        ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

    // Initialize speech recognition
    useEffect(() => {
        if (!isSupported) return;

        const SpeechRecognitionClass = window.webkitSpeechRecognition || window.SpeechRecognition;
        const recognition = new SpeechRecognitionClass();

        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            setIsListening(true);
            setError(null);
        };

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            if (isAbortedRef.current) return; // STRICT DROP of results if aborted

            let interim = '';
            let final = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                if (result.isFinal) {
                    final += result[0].transcript;
                } else {
                    interim += result[0].transcript;
                }
            }

            if (final) {
                setTranscript(prev => prev + final);
            }
            setInterimTranscript(interim);
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            console.error('[Speech] Error:', event.error);

            // Handle specific errors
            switch (event.error) {
                case 'not-allowed':
                    setError('Microphone permission denied. Please allow microphone access.');
                    break;
                case 'no-speech':
                    // Not an error, just no speech detected - restart silently
                    return;
                case 'audio-capture':
                    setError('No microphone found. Please connect a microphone.');
                    break;
                case 'network':
                    setError('Network error. Please check your connection.');
                    break;
                case 'aborted':
                    // Expected when we abort
                    return;
                default:
                    setError(`Speech recognition error: ${event.error}`);
            }

            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
            // Auto-restart only if allowed (not manually stopped/aborted) and no error
            if (recognitionRef.current && shouldAutoRestartRef.current && !error && !isAbortedRef.current) {
                // Restart after brief pause
                setTimeout(() => {
                    try {
                        if (!isAbortedRef.current) {
                            recognitionRef.current?.start();
                        }
                    } catch {
                        // Already started, ignore
                    }
                }, 100);
            }
        };

        recognitionRef.current = recognition;

        return () => {
            recognition.abort();
        };
    }, [isSupported]);

    const start = useCallback(() => {
        if (!recognitionRef.current) return;
        // Don't start if already listening
        if (isListening) return;

        // Enable auto-restart when user starts listening
        shouldAutoRestartRef.current = true;
        isAbortedRef.current = false; // Reset abort flag

        setTranscript('');
        setInterimTranscript('');
        setError(null);

        try {
            recognitionRef.current.start();
        } catch {
            // Already started - silently ignore
        }
    }, [isListening]);

    const stop = useCallback(() => {
        if (!recognitionRef.current) return;

        // Disable auto-restart when user explicitly stops
        shouldAutoRestartRef.current = false;

        try {
            recognitionRef.current.stop();
        } catch {
            // Already stopped
        }
        setIsListening(false);
    }, []);

    const abort = useCallback(() => {
        if (!recognitionRef.current) return;
        shouldAutoRestartRef.current = false;
        isAbortedRef.current = true; // Set flag to drop all pending results
        try {
            recognitionRef.current.abort();
        } catch {
            // Already stopped
        }
        setIsListening(false);
    }, []);

    return {
        isListening,
        transcript,
        interimTranscript,
        error,
        isSupported,
        start,
        stop,
        abort,
    };
}
