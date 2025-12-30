import { useRef, useEffect } from 'react';
import AnimatedMessage from './AnimatedMessage';

interface Message {
    type: 'user' | 'agent';
    text: string;
}

interface ChatListProps {
    messages: Message[];
    streamingText: string;
    permissionRequired: boolean;
}

export default function ChatList({ messages, streamingText, permissionRequired }: ChatListProps) {
    const messagesTopRef = useRef<HTMLDivElement>(null);
    const reversedMessages = [...messages].reverse();

    // Scroll to new messages
    useEffect(() => {
        // Since we are using flex-col-reverse logic (newest at top logic usually implies bottom-up, but here user said "Newest appearing at top" in the comments of App.tsx which is unusual but let's stick to what App.tsx was doing)
        // Actually, looking at App.tsx: 
        // reversedMessages.map...
        // <div ref={messagesTopRef} /> is at the TOP of the container.
        // It seems the UI is designed to show newest messages at the top.
    }, [messages, streamingText]);

    return (
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
    );
}
