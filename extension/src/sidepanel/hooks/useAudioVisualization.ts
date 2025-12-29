import { useState, useCallback, useRef } from 'react';

interface UseAudioVisualizationResult {
    audioLevel: number[];
    needsPermission: boolean;
    startVisualization: () => Promise<boolean>;
    stopVisualization: () => void;
}

/**
 * Custom hook for audio visualization using Web Audio API.
 * Provides real-time audio level data from microphone input.
 */
export function useAudioVisualization(
    onPermissionChange?: (required: boolean) => void
): UseAudioVisualizationResult {
    const [audioLevel, setAudioLevel] = useState<number[]>(new Array(16).fill(0));
    const [needsPermission, setNeedsPermission] = useState(false);

    // Refs for audio context management
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const startVisualization = useCallback(async (): Promise<boolean> => {
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
            onPermissionChange?.(false);
            return true;
        } catch {
            setNeedsPermission(true);
            onPermissionChange?.(true);
            return false;
        }
    }, [onPermissionChange]);

    const stopVisualization = useCallback(() => {
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

    return {
        audioLevel,
        needsPermission,
        startVisualization,
        stopVisualization
    };
}
