import { useState, useEffect } from 'react';
import VoiceAgent from './VoiceAgent';
import PlanViewer from './components/PlanViewer';
import ChatList from './components/ChatList';

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
                <PlanViewer currentPlan={currentPlan} />
            </section>

            {/* Messages */}
            <ChatList
                messages={messages}
                streamingText={streamingText}
                permissionRequired={permissionRequired}
            />

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
