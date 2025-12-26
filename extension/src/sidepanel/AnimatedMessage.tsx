import { useEffect, useState } from 'react';

interface AnimatedMessageProps {
    text: string;
    isUser: boolean;
    speed?: number; // ms per word
    startVisible?: boolean;
}

export default function AnimatedMessage({ text, isUser, speed = 50, startVisible = false }: AnimatedMessageProps) {
    const words = text.split(' ');
    const [visibleWords, setVisibleWords] = useState<number>(startVisible ? words.length : 0);

    useEffect(() => {
        // Reset if text changes dramatically (optional, but good for safety)
        if (visibleWords > words.length) setVisibleWords(0);

        const interval = setInterval(() => {
            setVisibleWords(current => {
                if (current >= words.length) {
                    clearInterval(interval);
                    return current;
                }
                return current + 1;
            });
        }, speed);

        return () => clearInterval(interval);
    }, [text, speed, words.length]);

    return (
        <p className="message-text">
            {words.map((word, i) => (
                <span
                    key={i}
                    className={`inline-block transition-all duration-300 ${i < visibleWords
                        ? 'opacity-100 blur-0 translate-y-0'
                        : 'opacity-0 blur-sm translate-y-2'
                        }`}
                    style={{ marginRight: '0.25em' }}
                >
                    {word}
                </span>
            ))}
        </p>
    );
}
