/**
 * Speech Recognition Engine
 * Encapsulates the Web Speech API logic, separating it from React components.
 */

export interface SpeechEngineEvents {
    onResult: (transcript: string, isFinal: boolean) => void;
    onStart: () => void;
    onEnd: () => void;
    onError: (error: string) => void;
}

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
    maxAlternatives: number;
};

declare global {
    interface Window {
        webkitSpeechRecognition: new () => SpeechRecognition;
        SpeechRecognition: new () => SpeechRecognition;
    }
}

export class SpeechEngine {
    private recognition: SpeechRecognition | null = null;
    private isListening: boolean = false;
    private shouldAutoRestart: boolean = true;
    private isAborted: boolean = false;
    private events: SpeechEngineEvents;

    constructor(events: SpeechEngineEvents) {
        this.events = events;
        this.initialize();
    }

    private initialize() {
        if (typeof window === 'undefined') return;

        const SpeechRecognitionClass = window.webkitSpeechRecognition || window.SpeechRecognition;
        if (!SpeechRecognitionClass) {
            console.error('Speech Recognition not supported');
            return;
        }

        this.recognition = new SpeechRecognitionClass();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
        // @ts-ignore
        this.recognition.maxAlternatives = 3;

        this.recognition.onstart = () => {
            console.log('[SpeechEngine] onstart');
            this.isListening = true;
            this.events.onStart();
        };

        this.recognition.onresult = (event: SpeechRecognitionEvent) => {
            if (this.isAborted) return;

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
                this.events.onResult(final, true);
            }
            if (interim) {
                this.events.onResult(interim, false);
            }
        };

        this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            if (event.error === 'aborted') return;

            console.error('[SpeechEngine] Error:', event.error);

            // Handle specific errors
            let errorMessage = `Speech recognition error: ${event.error}`;

            switch (event.error) {
                case 'not-allowed':
                    errorMessage = 'Microphone permission denied.';
                    break;
                case 'no-speech':
                    // Silent restart will happen via onend if persistent
                    return;
                case 'audio-capture':
                    errorMessage = 'No microphone found.';
                    break;
                case 'network':
                    errorMessage = 'Network error.';
                    break;
            }

            this.events.onError(errorMessage);
        };

        this.recognition.onend = () => {
            console.log('[SpeechEngine] onend');
            this.isListening = false;
            this.events.onEnd();

            // Auto-restart logic
            if (this.shouldAutoRestart && !this.isAborted) {
                setTimeout(() => {
                    try {
                        if (this.shouldAutoRestart && !this.isAborted && !this.isListening) {
                            console.log('[SpeechEngine] Auto-restarting...');
                            this.recognition?.start();
                        }
                    } catch (e) {
                        // ignore
                    }
                }, 100);
            }
        };
    }

    public start() {
        if (!this.recognition) return;
        if (this.isListening) return;

        console.log('[SpeechEngine] start()');
        this.shouldAutoRestart = true;
        this.isAborted = false;

        try {
            this.recognition.start();
        } catch (e) {
            console.warn('[SpeechEngine] Start failed:', e);
        }
    }

    public stop() {
        if (!this.recognition) return;
        console.log('[SpeechEngine] stop()');
        this.shouldAutoRestart = false; // Disable auto-restart
        try {
            this.recognition.stop();
        } catch (e) { }
    }

    public abort() {
        if (!this.recognition) return;
        console.log('[SpeechEngine] abort()');
        this.shouldAutoRestart = false;
        this.isAborted = true;
        try {
            this.recognition.abort();
        } catch (e) { }
    }

    public isSupported(): boolean {
        return !!this.recognition;
    }
}
