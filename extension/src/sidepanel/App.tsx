import { useState, useEffect } from 'react';
import VoiceAgent from './VoiceAgent';

type Status = 'idle' | 'listening' | 'processing' | 'speaking';

interface Message {
    type: 'user' | 'agent';
    text: string;
}

export default function App() {
    const [status, setStatus] = useState<Status>('idle');
    const [messages, setMessages] = useState<Message[]>([]);
    const [autoStarted, setAutoStarted] = useState(false);

    const handleTranscript = (text: string) => {
        setMessages(prev => [...prev, { type: 'user', text }]);
    };

    const handleResponse = (text: string) => {
        setMessages(prev => [...prev, { type: 'agent', text }]);
    };

    const getStatusText = () => {
        switch (status) {
            case 'listening': return 'Listening — speak now';
            case 'processing': return 'Understanding your request...';
            case 'speaking': return 'Agent is speaking...';
            default: return 'Ready — click to start';
        }
    };

    return (
        <div className="container">
            {/* Header */}
            <header className="header">
                <h1 className="title">Aeyes</h1>
                <p className="subtitle">Voice browser assistant</p>
            </header>

            {/* Voice Control */}
            <section className="voice-section">
                <VoiceAgent
                    onStatusChange={setStatus}
                    onTranscript={handleTranscript}
                    onResponse={handleResponse}
                    autoStart={!autoStarted}
                    onAutoStartComplete={() => setAutoStarted(true)}
                />
            </section>

            {/* Status */}
            <section className={`status-section ${status}`}>
                <span className="status-label">Status</span>
                <p className="status-content">{getStatusText()}</p>
            </section>

            {/* Conversation Log - Scrollable */}
            {messages.length > 0 && (
                <section className="messages-container">
                    <span className="status-label">Conversation</span>
                    <div className="messages-scroll">
                        {messages.map((msg, i) => (
                            <div key={i} className={`message ${msg.type}`}>
                                <span className="message-label">{msg.type === 'user' ? 'You' : 'Agent'}</span>
                                <p className="message-text">{msg.text}</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Footer */}
            <footer className="footer">
                <span className="kbd">Alt</span> + <span className="kbd">V</span> to toggle
            </footer>
        </div>
    );
}
