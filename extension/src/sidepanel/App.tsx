import { useState, useEffect, useRef } from 'react';
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
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const handleTranscript = (text: string) => {
        setMessages(prev => [...prev, { type: 'user', text }]);
    };

    const handleResponse = (text: string) => {
        setMessages(prev => [...prev, { type: 'agent', text }]);
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="h-full flex flex-col p-4 gap-3 overflow-hidden">
            {/* Minimal Header */}
            <header className="shrink-0 text-center">
                <h1 className="text-lg font-semibold text-white tracking-tight">Aeyes</h1>
            </header>

            {/* Voice Control */}
            <section className="shrink-0">
                <VoiceAgent
                    onStatusChange={setStatus}
                    onTranscript={handleTranscript}
                    onResponse={handleResponse}
                    autoStart={!autoStarted}
                    onAutoStartComplete={() => setAutoStarted(true)}
                    status={status}
                />
            </section>

            {/* Messages - ChatGPT style flat list */}
            <section className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {messages.length > 0 ? (
                    <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
                        {messages.map((msg, i) => (
                            <div
                                key={i}
                                className={`message animate-fade-in ${msg.type === 'user' ? 'message-user' : 'message-agent'}`}
                            >
                                <div className="message-label">
                                    {msg.type === 'user' ? 'You' : 'Aeyes'}
                                </div>
                                <p className="message-text">{msg.text}</p>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <p className="text-xs text-[var(--color-text-muted)]">
                            Say something to start...
                        </p>
                    </div>
                )}
            </section>

            {/* Footer */}
            <footer className="shrink-0 text-center">
                <span className="text-[10px] text-[var(--color-text-muted)]">
                    <span className="kbd">Alt</span>
                    <span className="mx-0.5">+</span>
                    <span className="kbd">V</span>
                </span>
            </footer>
        </div>
    );
}
