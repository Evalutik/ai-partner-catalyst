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
        console.log('[UseAudioVis] startVisualization called');
        try {
            console.log('[UseAudioVis] Requesting microphone access...');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('[UseAudioVis] Microphone access granted. Stream ID:', stream.id);
            streamRef.current = stream;

            console.log('[UseAudioVis] Creating AudioContext...');
            const audioContext = new AudioContext();
            console.log('[UseAudioVis] AudioContext created. State:', audioContext.state);

            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 64;

            console.log('[UseAudioVis] Connecting source...');
            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);

            audioContextRef.current = audioContext;
            analyserRef.current = analyser;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const updateLevels = () => {
                if (!analyserRef.current) return;
                // ... (rest is fine)
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

            console.log('[UseAudioVis] Starting animation loop...');
            updateLevels();
            setNeedsPermission(false);
            onPermissionChange?.(false);
            console.log('[UseAudioVis] Visualization started successfully');
            return true;
        } catch (e) {
            console.error('[UseAudioVis] Failed to start visualization:', e);
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
