import React from 'react';
import { MicIcon, StopIcon, StopIconSmall } from './icons';

interface VoiceControlProps {
    status: 'idle' | 'listening' | 'processing' | 'speaking';
    isIdleMode: boolean; // paused or standby
    onToggle: () => void;
}

export default function VoiceControl({ status, isIdleMode, onToggle }: VoiceControlProps) {
    return (
        <button
            onClick={onToggle}
            className={`btn-voice ${isIdleMode ? 'btn-voice-idle' : `btn-voice-${status}`}`}
            aria-label={isIdleMode ? 'Start listening' : status === 'processing' ? 'Stop processing' : 'Stop listening'}
        >
            {isIdleMode ? (
                <MicIcon />
            ) : status === 'processing' ? (
                <div className="spinner-wrapper">
                    <div className="spinner-ring" />
                    <StopIconSmall />
                </div>
            ) : (
                <StopIcon />
            )}
            <span>{isIdleMode ? 'Start' : status === 'processing' ? 'Processing...' : 'Stop'}</span>
        </button>
    );
}
