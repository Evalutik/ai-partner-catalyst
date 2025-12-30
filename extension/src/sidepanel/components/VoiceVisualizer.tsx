import React from 'react';

interface VoiceVisualizerProps {
    audioLevel: number[];
    status: 'idle' | 'listening' | 'processing' | 'speaking';
    isPaused: boolean;
}

export default function VoiceVisualizer({ audioLevel, status, isPaused }: VoiceVisualizerProps) {
    const isActive = status !== 'idle';

    const getStateColor = () => {
        switch (status) {
            case 'listening': return 'var(--color-listening)';
            case 'processing': return 'var(--color-processing)';
            case 'speaking': return 'var(--color-speaking)';
            // Fallback colors if vars not defined yet (for safety)
            default: return isPaused ? '#888' : 'var(--color-idle)';
        }
    };

    return (
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
    );
}
