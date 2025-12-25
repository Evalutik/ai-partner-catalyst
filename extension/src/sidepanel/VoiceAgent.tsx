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
    const [audioLevel, setAudioLevel] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0]);
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

    // Update status and notify parent
    const updateStatus = useCallback((newStatus: Status) => {
        setStatus(newStatus);
        onStatusChange?.(newStatus);
    }, [onStatusChange]);

    // Handle speech error
    useEffect(() => {
        if (speechError) {
            if (speechError.includes('permission denied') || speechError.includes('not-allowed')) {
                setNeedsPermission(true);
            }
            setError(speechError);
            updateStatus('idle');
        }
    }, [speechError, updateStatus]);

    // Audio visualization
    const startAudioVisualization = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const audioContext = new AudioContext();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 32;

            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);

            audioContextRef.current = audioContext;
            analyserRef.current = analyser;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const updateLevels = () => {
                if (!analyserRef.current) return;

                analyserRef.current.getByteFrequencyData(dataArray);

                const levels: number[] = [];
                const bandSize = Math.floor(dataArray.length / 8);
                for (let i = 0; i < 8; i++) {
                    const start = i * bandSize;
                    let sum = 0;
                    for (let j = 0; j < bandSize; j++) {
                        sum += dataArray[start + j];
                    }
                    levels.push(Math.min(100, (sum / bandSize / 255) * 150));
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
        setAudioLevel([0, 0, 0, 0, 0, 0, 0, 0]);
    }, []);

    // Auto-start on mount if enabled
    useEffect(() => {
        if (autoStart && !hasAttemptedAutoStart && isSupported) {
            setHasAttemptedAutoStart(true);
            handleStart();
            onAutoStartComplete?.();
        }
    }, [autoStart, hasAttemptedAutoStart, isSupported]);

    // Cleanup on unmount
    useEffect(() => {
        return () => stopAudioVisualization();
    }, [stopAudioVisualization]);

    // Detect when user stops speaking (silence detection)
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

    // Process transcript through backend
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

    // Open permission page
    const openPermissionPage = useCallback(() => {
        chrome.tabs.create({ url: chrome.runtime.getURL('permission.html') });
    }, []);

    // Start voice session
    const handleStart = useCallback(async () => {
        setError(null);
        setLastTranscript('');

        const success = await startAudioVisualization();
        if (success) {
            startListening();
            updateStatus('listening');
        }
    }, [startListening, startAudioVisualization, updateStatus]);

    // Stop voice session
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
            <div className="voice-agent">
                <div className="error-message">
                    Speech recognition not supported in this browser.
                </div>
            </div>
        );
    }

    return (
        <div className="voice-agent">
            {/* Audio Level Visualizer */}
            <div className="audio-visualizer">
                {audioLevel.map((level, i) => (
                    <div
                        key={i}
                        className="audio-bar"
                        style={{ height: `${Math.max(4, level)}%` }}
                    />
                ))}
            </div>

            {/* Microphone Button */}
            <button
                className={`mic-button ${status}`}
                onClick={isActive ? handleStop : handleStart}
                aria-label={isActive ? 'Stop listening' : 'Start listening'}
            >
                <MicrophoneIcon isActive={isActive} />
                <span className="mic-label">
                    {status === 'idle' && 'Start'}
                    {status === 'listening' && 'Listening'}
                    {status === 'processing' && 'Thinking...'}
                    {status === 'speaking' && 'Speaking'}
                </span>
            </button>

            {/* Live Transcript */}
            {isListening && (interimTranscript || transcript) && (
                <div className="transcript-preview">
                    {transcript.slice(lastTranscript.length)}
                    <span className="interim">{interimTranscript}</span>
                </div>
            )}

            {/* Permission Request */}
            {needsPermission && (
                <div className="permission-request">
                    <p>Microphone access needed</p>
                    <button className="permission-btn" onClick={openPermissionPage}>
                        Grant Permission
                    </button>
                </div>
            )}

            {/* Error Display */}
            {error && !needsPermission && <div className="error-message">{error}</div>}
        </div>
    );
}

function MicrophoneIcon({ isActive }: { isActive: boolean }) {
    return (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`mic-icon ${isActive ? 'active' : ''}`}
        >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
    );
}
