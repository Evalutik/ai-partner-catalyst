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
    status: Status;
}

export default function VoiceAgent({
    onStatusChange,
    onTranscript,
    onResponse,
    autoStart = false,
    onAutoStartComplete,
    status
}: VoiceAgentProps) {
    const [error, setError] = useState<string | null>(null);
    const [lastTranscript, setLastTranscript] = useState('');
    const [audioLevel, setAudioLevel] = useState<number[]>(new Array(16).fill(0));
    const [needsPermission, setNeedsPermission] = useState(false);
    const [hasAttemptedAutoStart, setHasAttemptedAutoStart] = useState(false);

    const processingRef = useRef(false);
    const silenceTimeoutRef = useRef<number | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioElementRef = useRef<HTMLAudioElement | null>(null);

    const {
        transcript,
        error: speechError,
        isSupported,
        start: startListening,
        stop: stopListening
    } = useSpeechRecognition();

    const updateStatus = useCallback((newStatus: Status) => {
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
            setError(null);
            return true;
        } catch {
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
        setAudioLevel(new Array(16).fill(0));
    }, []);

    // Stop any playing audio
    const stopAudio = useCallback(() => {
        if (audioElementRef.current) {
            audioElementRef.current.pause();
            audioElementRef.current.currentTime = 0;
            audioElementRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (autoStart && !hasAttemptedAutoStart && isSupported) {
            setHasAttemptedAutoStart(true);
            handleStart();
            onAutoStartComplete?.();
        }
    }, [autoStart, hasAttemptedAutoStart, isSupported]);

    useEffect(() => {
        return () => {
            stopAudioVisualization();
            stopAudio();
        };
    }, [stopAudioVisualization, stopAudio]);

    useEffect(() => {
        if (!transcript || processingRef.current) return;

        if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);

        if (transcript.length > lastTranscript.length) {
            silenceTimeoutRef.current = window.setTimeout(async () => {
                const newText = transcript.slice(lastTranscript.length).trim();
                if (newText && !processingRef.current) {
                    await processTranscript(newText);
                }
            }, 1500);
        }

        return () => {
            if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
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

            // Store audio element reference for stopping
            const audio = new Audio(audioUrl);
            audioElementRef.current = audio;

            await new Promise<void>((resolve) => {
                audio.onended = () => resolve();
                audio.onerror = () => resolve();
                audio.play().catch(() => resolve());
            });

            audioElementRef.current = null;
            updateStatus('listening');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed');
            updateStatus('idle');
        } finally {
            processingRef.current = false;
        }
    }, [transcript, onTranscript, onResponse, updateStatus]);

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
        stopAudio();  // Also stop any playing audio
        updateStatus('idle');
        processingRef.current = false;
        if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
    }, [stopListening, stopAudioVisualization, stopAudio, updateStatus]);

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

    const getButtonClass = () => {
        switch (status) {
            case 'listening': return 'btn-voice btn-voice-listening';
            case 'processing': return 'btn-voice btn-voice-processing';
            case 'speaking': return 'btn-voice btn-voice-speaking';
            default: return 'btn-voice btn-voice-idle';
        }
    };

    const getButtonText = () => {
        switch (status) {
            case 'listening': return 'Listening...';
            case 'processing': return 'Thinking...';
            case 'speaking': return 'Speaking...';
            default: return 'Start';
        }
    };

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

            {/* Single button - shows Stop icon when active */}
            <button
                onClick={isActive ? handleStop : handleStart}
                className={getButtonClass()}
            >
                {isActive ? <StopIcon /> : <MicIcon />}
                <span>{isActive ? 'Stop' : getButtonText()}</span>
            </button>

            {/* Permission Request */}
            {needsPermission && (
                <div className="permission-card animate-fade-in">
                    <p className="text-xs text-[var(--color-text-secondary)] mb-3">
                        Microphone access required
                    </p>
                    <button onClick={openPermissionPage} className="permission-btn">
                        Grant Access
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
