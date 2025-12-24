// VoiceAgent - ElevenLabs SDK integration (Step 1.2)
// This file will contain the voice conversation logic

import React from 'react';

interface VoiceAgentProps {
    onStatusChange: (status: 'idle' | 'listening' | 'processing') => void;
}

// Placeholder component - will be implemented in Step 1.2
export default function VoiceAgent({ onStatusChange }: VoiceAgentProps) {
    // Will use @elevenlabs/react useConversation hook here

    const handleStart = () => {
        onStatusChange('listening');
        console.log('[VoiceAgent] Starting session...');
        // TODO: startSession() from ElevenLabs SDK
    };

    const handleStop = () => {
        onStatusChange('idle');
        console.log('[VoiceAgent] Stopping session...');
        // TODO: endSession() from ElevenLabs SDK
    };

    return (
        <div className="voice-agent">
            <button onClick={handleStart}>Start</button>
            <button onClick={handleStop}>Stop</button>
        </div>
    );
}
