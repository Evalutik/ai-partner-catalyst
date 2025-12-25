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
}

export function useSpeechRecognition(): UseSpeechRecognitionResult {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [interimTranscript, setInterimTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);

    const recognitionRef = useRef<SpeechRecognition | null>(null);
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
                default:
                    setError(`Speech recognition error: ${event.error}`);
            }

            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
            // Auto-restart if we're supposed to be listening (unless error occurred)
            if (recognitionRef.current && !error) {
                // Restart after brief pause
                setTimeout(() => {
                    try {
                        recognitionRef.current?.start();
                    } catch (e) {
                        // Already started, ignore
                    }
                }, 100);
            }
        };

        recognitionRef.current = recognition;

        return () => {
            recognition.abort();
        };
    }, [isSupported, error]);

    const start = useCallback(() => {
        if (!recognitionRef.current) return;

        setTranscript('');
        setInterimTranscript('');
        setError(null);

        try {
            recognitionRef.current.start();
        } catch (e) {
            // Already started
            console.warn('[Speech] Already started');
        }
    }, []);

    const stop = useCallback(() => {
        if (!recognitionRef.current) return;

        try {
            recognitionRef.current.stop();
        } catch (e) {
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
    };
}
