import { useState, useRef, useEffect } from 'react';
import VoiceAgent from './VoiceAgent';
import AnimatedMessage from './AnimatedMessage';

type Status = 'idle' | 'listening' | 'processing' | 'speaking';

interface Message {
    type: 'user' | 'agent' | 'plan';
    text: string;
}

export default function App() {
    const [status, setStatus] = useState<Status>('idle');
    const [messages, setMessages] = useState<Message[]>([]);
    const [autoStarted, setAutoStarted] = useState(false);
    const messagesTopRef = useRef<HTMLDivElement>(null);

    const [streamingText, setStreamingText] = useState('');
    const [reloadKey, setReloadKey] = useState(0);

    // Listen for keyboard shortcut commands from background script
    useEffect(() => {
        const handleMessage = (message: { type: string }) => {
            if (message.type === 'CLOSE_PANEL') {
                window.close();
            }
            if (message.type === 'RELOAD_CONVERSATION') {
                // Clear messages and reload VoiceAgent
                setMessages([]);
                setStreamingText('');
                setAutoStarted(false);
                setReloadKey(prev => prev + 1);
            }
        };

        chrome.runtime.onMessage.addListener(handleMessage);
        return () => chrome.runtime.onMessage.removeListener(handleMessage);
    }, []);

    const handleTranscript = (text: string) => {
        setStreamingText(''); // Clear streaming text when final transcript is received
        setMessages(prev => [...prev, { type: 'user', text }]);
    };

    const handleResponse = (text: string) => {
        setMessages(prev => [...prev, { type: 'agent', text }]);
    };

    const handlePlan = (text: string) => {
        setMessages(prev => [...prev, { type: 'plan', text }]);
    };

    const [permissionRequired, setPermissionRequired] = useState(false);

    // Reversed messages - newest first
    const reversedMessages = [...messages].reverse();

    return (
        <div className="h-full flex flex-col p-4 gap-3 overflow-hidden">
            {/* Minimal Header */}
            <header className="shrink-0 text-center">
                <h1 className="text-lg font-semibold tracking-tight" style={{ color: '#E2E2E2' }}>Aeyes.</h1>
            </header>

            {/* Voice Control */}
            <section className="shrink-0">
                <VoiceAgent
                    key={reloadKey}
                    onStatusChange={setStatus}
                    onTranscript={handleTranscript}
                    onStreamingTranscript={setStreamingText}
                    onResponse={handleResponse}
                    onPlan={handlePlan}
                    autoStart={!autoStarted}
                    onAutoStartComplete={() => setAutoStarted(true)}
                    status={status}
                    onPermissionRequired={setPermissionRequired}
                />
            </section>

            {/* Messages - NEW at top, OLD goes down */}
            <section className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {(messages.length > 0 || streamingText) ? (
                    <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
                        <div ref={messagesTopRef} />

                        {/* Streaming Message (Newest, appearing at top) */}
                        {streamingText && (
                            <div className="message animate-fade-in message-user">
                                <div className="message-label">You</div>
                                <AnimatedMessage
                                    text={streamingText}
                                    isUser={true}
                                    speed={40} // Fast but visible animation for streaming
                                />
                            </div>
                        )}

                        {reversedMessages.map((msg, i) => (
                            <div
                                key={messages.length - 1 - i}
                                className={`message animate-fade-in ${msg.type === 'user' ? 'message-user' : msg.type === 'plan' ? 'message-plan' : 'message-agent'}`}
                            >
                                <div className="message-label">
                                    {msg.type === 'user' ? 'You' : msg.type === 'plan' ? 'Plan' : 'Aeyes.'}
                                </div>
                                {msg.type === 'plan' ? (
                                    <div className="message-text message-plan">{msg.text}</div>
                                ) : (
                                    <AnimatedMessage
                                        text={msg.text}
                                        isUser={msg.type === 'user'}
                                        speed={msg.type === 'user' ? 80 : 250}
                                        startVisible={msg.type === 'user'}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        {!permissionRequired && (
                            <p className="text-xs text-[var(--color-text-muted)]">
                                Say something to start...
                            </p>
                        )}
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
