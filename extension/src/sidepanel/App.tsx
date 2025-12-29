import { useState, useRef, useEffect } from 'react';
import VoiceAgent from './VoiceAgent';
import AnimatedMessage from './components/AnimatedMessage';

type Status = 'idle' | 'listening' | 'processing' | 'speaking';

interface Message {
    type: 'user' | 'agent';
    text: string;
}

export default function App() {
    const [status, setStatus] = useState<Status>('idle');
    const [messages, setMessages] = useState<Message[]>([]);
    const [currentPlan, setCurrentPlan] = useState<string | null>(null); // Current active plan
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
                setCurrentPlan(null);
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
        // Replace current plan (not append)
        setCurrentPlan(text);
    };

    const handleClearPlan = () => {
        setCurrentPlan(null);
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
                    onClearPlan={handleClearPlan}
                    autoStart={!autoStarted}
                    onAutoStartComplete={() => setAutoStarted(true)}
                    status={status}
                    onPermissionRequired={setPermissionRequired}
                />
            </section>

            {/* Current Plan Display (if any) */}
            <section className="shrink-0" style={{ minHeight: currentPlan ? 'auto' : '0px' }}>
                {currentPlan && (
                    <div className="p-2 border border-[#1a1a1a] rounded-lg bg-[var(--color-bg-card)]">
                        <div className="text-[10px] text-[var(--color-agent)] font-semibold mb-1.5">Plan</div>
                        <div className="flex flex-col gap-1">
                            {currentPlan.split('\n').map((line, i) => {
                                const trimmedLine = line.trim();
                                if (!trimmedLine) return null;

                                // Determine step status
                                const isCompleted = trimmedLine.startsWith('[x]');
                                const isCurrent = trimmedLine.startsWith('[>]');
                                const isPending = trimmedLine.startsWith('[ ]');

                                // Remove the status marker from the text
                                let stepText = trimmedLine;
                                if (isCompleted || isCurrent || isPending) {
                                    stepText = trimmedLine.slice(3).trim();
                                }

                                return (
                                    <div key={i} className="flex items-center gap-2 text-xs">
                                        {/* Icon based on status */}
                                        {isCompleted && (
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-agent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                        )}
                                        {isCurrent && (
                                            <div className="w-3 h-3 border-2 border-[var(--color-processing)] border-t-transparent rounded-full animate-spin" />
                                        )}
                                        {isPending && (
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2">
                                                <circle cx="12" cy="12" r="8" />
                                            </svg>
                                        )}
                                        {!isCompleted && !isCurrent && !isPending && (
                                            <span className="w-3" />
                                        )}
                                        {/* Step text */}
                                        <span style={{
                                            color: isCompleted ? 'var(--color-agent)' :
                                                isCurrent ? 'var(--color-text-primary)' :
                                                    'var(--color-text-muted)',
                                            textDecoration: isCompleted ? 'line-through' : 'none',
                                            opacity: isCompleted ? 0.7 : 1
                                        }}>
                                            {stepText}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
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
                                className={`message animate-fade-in ${msg.type === 'user' ? 'message-user' : 'message-agent'}`}
                            >
                                <div className="message-label">
                                    {msg.type === 'user' ? 'You' : 'Aeyes.'}
                                </div>
                                <AnimatedMessage
                                    text={msg.text}
                                    isUser={msg.type === 'user'}
                                    speed={msg.type === 'user' ? 80 : 250}
                                    startVisible={msg.type === 'user'}
                                />
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
