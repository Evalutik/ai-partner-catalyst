import { useState, useCallback, useRef, useEffect } from 'react';
import { useSpeechRecognition } from './useSpeechRecognition';
import { sendToBackend, getAudioUrl, playAudio } from './api';

type Status = 'idle' | 'listening' | 'processing' | 'speaking';

interface VoiceAgentProps {
    onStatusChange?: (status: Status) => void;
    onTranscript?: (text: string) => void;
    onResponse?: (text: string) => void;
    autoStart?: boolean;
    onAutoStartComplete?: () => void;
}

export default function VoiceAgent({
    onStatusChange,
    onTranscript,
    onResponse,
    autoStart = false,
    onAutoStartComplete
}: VoiceAgentProps) {
    const [status, setStatus] = useState<Status>('idle');
    const [error, setError] = useState<string | null>(null);
    const [lastTranscript, setLastTranscript] = useState('');
    const [audioLevel, setAudioLevel] = useState<number[]>(new Array(12).fill(0));
    const [needsPermission, setNeedsPermission] = useState(false);
    const [hasAttemptedAutoStart, setHasAttemptedAutoStart] = useState(false);

    const processingRef = useRef(false);
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
        stop: stopListening
    } = useSpeechRecognition();

    const updateStatus = useCallback((newStatus: Status) => {
        setStatus(newStatus);
        onStatusChange?.(newStatus);
    }, [onStatusChange]);

    useEffect(() => {
        if (speechError) {
            if (speechError.includes('permission denied') || speechError.includes('not-allowed')) {
                setNeedsPermission(true);
            }
            setError(speechError);
            updateStatus('idle');
        }
    }, [speechError, updateStatus]);

    // Audio visualization with more bars
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
                const bandSize = Math.floor(dataArray.length / 12);
                for (let i = 0; i < 12; i++) {
                    const start = i * bandSize;
                    let sum = 0;
                    for (let j = 0; j < bandSize; j++) {
                        sum += dataArray[start + j];
                    }
                    const avg = sum / bandSize / 255;
                    // Add some minimum height and smoothing
                    levels.push(Math.max(0.1, Math.pow(avg, 0.8) * 1.2));
                }

                setAudioLevel(levels);
                animationFrameRef.current = requestAnimationFrame(updateLevels);
            };

            updateLevels();
            setNeedsPermission(false);
            setError(null);
            return true;
        } catch (err) {
            console.error('[VoiceAgent] Audio visualization error:', err);
            setNeedsPermission(true);
            return false;
        }
    }, []);

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
        setAudioLevel(new Array(12).fill(0));
    }, []);

    // Auto-start
    useEffect(() => {
        if (autoStart && !hasAttemptedAutoStart && isSupported) {
            setHasAttemptedAutoStart(true);
            handleStart();
            onAutoStartComplete?.();
        }
    }, [autoStart, hasAttemptedAutoStart, isSupported]);

    useEffect(() => {
        return () => stopAudioVisualization();
    }, [stopAudioVisualization]);

    // Silence detection
    useEffect(() => {
        if (!transcript || processingRef.current) return;

        if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
        }

        if (transcript.length > lastTranscript.length) {
            silenceTimeoutRef.current = window.setTimeout(async () => {
                const newText = transcript.slice(lastTranscript.length).trim();
                if (newText && !processingRef.current) {
                    await processTranscript(newText);
                }
            }, 1500);
        }

        return () => {
            if (silenceTimeoutRef.current) {
                clearTimeout(silenceTimeoutRef.current);
            }
        };
    }, [transcript, lastTranscript]);

    const processTranscript = useCallback(async (text: string) => {
        if (processingRef.current) return;
        processingRef.current = true;

        setLastTranscript(transcript);
        onTranscript?.(text);
        updateStatus('processing');

        try {
            const response = await sendToBackend({ transcript: text });
            onResponse?.(response.response);

            updateStatus('speaking');
            const audioUrl = await getAudioUrl(response.response);
            await playAudio(audioUrl);

            if (response.actions?.length) {
                for (const action of response.actions) {
                    await executeAction(action);
                }
            }

            updateStatus('listening');
        } catch (err) {
            console.error('[VoiceAgent] Error:', err);
            setError(err instanceof Error ? err.message : 'Processing failed');
            updateStatus('idle');
        } finally {
            processingRef.current = false;
        }
    }, [transcript, onTranscript, onResponse, updateStatus]);

    const executeAction = async (action: { type: string; target?: string; value?: string }) => {
        return new Promise<void>((resolve) => {
            chrome.runtime.sendMessage({ type: 'EXECUTE_ACTION', action }, () => resolve());
        });
    };

    const openPermissionPage = useCallback(() => {
        chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
    }, []);

    const handleStart = useCallback(async () => {
        setError(null);
        setLastTranscript('');

        const success = await startAudioVisualization();
        if (success) {
            startListening();
            updateStatus('listening');
        }
    }, [startListening, startAudioVisualization, updateStatus]);

    const handleStop = useCallback(() => {
        stopListening();
        stopAudioVisualization();
        updateStatus('idle');
        if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
        }
    }, [stopListening, stopAudioVisualization, updateStatus]);

    const isActive = status !== 'idle';

    if (!isSupported) {
        return (
            <div className="glass-card p-4 border-error/50">
                <p className="text-sm text-error text-center">
                    Speech recognition not supported in this browser.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center gap-4">
            {/* Audio Visualizer - Sleek bars */}
            <div className="w-full glass-card p-4 flex items-end justify-center gap-1 h-16">
                {audioLevel.map((level, i) => (
                    <div
                        key={i}
                        className="audio-bar origin-bottom"
                        style={{
                            height: `${Math.max(8, level * 100)}%`,
                            opacity: 0.6 + level * 0.4,
                            animationDelay: `${i * 50}ms`
                        }}
                    />
                ))}
            </div>

            {/* Microphone Button */}
            <button
                onClick={isActive ? handleStop : handleStart}
                className={isActive ? 'btn-listening' : 'btn-primary'}
                aria-label={isActive ? 'Stop listening' : 'Start listening'}
            >
                <MicrophoneIcon isActive={isActive} />
                <span>
                    {status === 'idle' && 'Start Listening'}
                    {status === 'listening' && 'Listening...'}
                    {status === 'processing' && 'Thinking...'}
                    {status === 'speaking' && 'Speaking...'}
                </span>
            </button>

            {/* Live Transcript */}
            {isListening && (interimTranscript || transcript) && (
                <div className="w-full glass-card p-3 border-l-2 border-accent animate-fade-in">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-white/40">
                        Hearing...
                    </span>
                    <p className="text-sm text-white/80 mt-1">
                        {transcript.slice(lastTranscript.length)}
                        <span className="text-white/40">{interimTranscript}</span>
                    </p>
                </div>
            )}

            {/* Permission Request */}
            {needsPermission && (
                <div className="w-full glass-card p-4 text-center animate-slide-up">
                    <div className="text-3xl mb-2">🎤</div>
                    <p className="text-sm text-white/60 mb-3">
                        Microphone access needed for voice commands
                    </p>
                    <button
                        onClick={openPermissionPage}
                        className="btn-primary text-sm"
                    >
                        Grant Permission
                    </button>
                </div>
            )}

            {/* Error Display */}
            {error && !needsPermission && (
                <div className="w-full glass-card p-3 border border-error/50 animate-fade-in">
                    <p className="text-sm text-error text-center">{error}</p>
                </div>
            )}
        </div>
    );
}

function MicrophoneIcon({ isActive }: { isActive: boolean }) {
    return (
        <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={isActive ? 'animate-mic-pulse' : ''}
        >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
    );
}
