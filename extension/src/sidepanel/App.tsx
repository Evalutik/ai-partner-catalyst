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

    const getStatusConfig = () => {
        switch (status) {
            case 'listening': return { text: 'Listening — speak now', dotClass: 'status-dot-success' };
            case 'processing': return { text: 'Understanding...', dotClass: 'status-dot-accent' };
            case 'speaking': return { text: 'Speaking...', dotClass: 'status-dot-accent' };
            default: return { text: 'Ready to listen', dotClass: 'status-dot-muted' };
        }
    };

    const statusConfig = getStatusConfig();

    return (
        <div className="h-full flex flex-col p-5 gap-4 overflow-hidden">
            {/* Header */}
            <header className="text-center shrink-0">
                <h1 className="text-2xl font-bold text-white">
                    <span className="bg-gradient-to-r from-white via-white to-purple-300 bg-clip-text text-transparent">
                        Aeyes
                    </span>
                </h1>
                <p className="text-sm text-white/40 mt-0.5">Voice browser assistant</p>
            </header>

            {/* Voice Control */}
            <section className="shrink-0">
                <VoiceAgent
                    onStatusChange={setStatus}
                    onTranscript={handleTranscript}
                    onResponse={handleResponse}
                    autoStart={!autoStarted}
                    onAutoStartComplete={() => setAutoStarted(true)}
                />
            </section>

            {/* Status Card */}
            <section className="glass-card p-4 shrink-0 animate-fade-in">
                <div className="flex items-center gap-3">
                    <div className={`status-dot ${statusConfig.dotClass}`} />
                    <div>
                        <span className="text-[10px] font-medium uppercase tracking-wider text-white/35">
                            Status
                        </span>
                        <p className="text-sm text-white/85 font-medium">
                            {statusConfig.text}
                        </p>
                    </div>
                </div>
            </section>

            {/* Messages */}
            {messages.length > 0 && (
                <section className="flex-1 min-h-0 flex flex-col overflow-hidden animate-fade-in">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-white/35 mb-2 shrink-0">
                        Conversation
                    </span>
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                        {messages.map((msg, i) => (
                            <div
                                key={i}
                                className={`animate-slide-up ${msg.type === 'user' ? 'message-user' : 'message-agent'}`}
                            >
                                <span className="text-[9px] font-semibold uppercase tracking-wider text-white/35">
                                    {msg.type === 'user' ? 'You' : 'Aeyes'}
                                </span>
                                <p className={`text-sm mt-0.5 leading-relaxed ${msg.type === 'agent' ? 'text-purple-300' : 'text-white/75'}`}>
                                    {msg.text}
                                </p>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>
                </section>
            )}

            {messages.length === 0 && <div className="flex-1" />}

            {/* Footer */}
            <footer className="text-center shrink-0 pt-2">
                <span className="text-xs text-white/25">
                    <span className="kbd">Alt</span>
                    <span className="mx-1 text-white/20">+</span>
                    <span className="kbd">V</span>
                    <span className="ml-2 text-white/35">to toggle</span>
                </span>
            </footer>
        </div>
    );
}
