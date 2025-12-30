import { useState, useCallback, useRef, useEffect } from 'react';
import { SpeechEngine } from '../services/SpeechEngine';

export interface UseSpeechRecognitionResult {
    isListening: boolean;
    transcript: string;
    interimTranscript: string;
    error: string | null;
    isSupported: boolean;
    start: () => void;
    stop: () => void;
    abort: () => void;
    resetTranscript: () => void;
}

export function useSpeechRecognition(): UseSpeechRecognitionResult {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [interimTranscript, setInterimTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);

    const engineRef = useRef<SpeechEngine | null>(null);
    const isSupported = typeof window !== 'undefined' &&
        ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

    useEffect(() => {
        if (!isSupported) return;

        engineRef.current = new SpeechEngine({
            onStart: () => {
                setIsListening(true);
                setTranscript('');
                setInterimTranscript('');
                setError(null);
            },
            onResult: (text, isFinal) => {
                if (isFinal) {
                    setTranscript(prev => prev + text);
                    setInterimTranscript('');
                } else {
                    setInterimTranscript(text);
                }
            },
            onError: (err) => {
                console.error('[UseSpeech] Error:', err);
                // Filter out purely informational errors if desired, but Engine handles most
                if (err !== 'no-speech') {
                    setError(err);
                }
                setIsListening(false);
            },
            onEnd: () => {
                setIsListening(false);
            }
        });

        return () => {
            engineRef.current?.abort();
        };
    }, [isSupported]);

    const start = useCallback(() => {
        engineRef.current?.start();
    }, []);

    const stop = useCallback(() => {
        engineRef.current?.stop();
    }, []);

    const abort = useCallback(() => {
        engineRef.current?.abort();
    }, []);

    const resetTranscript = useCallback(() => {
        setTranscript('');
        setInterimTranscript('');
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
        resetTranscript
    };
}

