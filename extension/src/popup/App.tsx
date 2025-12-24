import { useState } from 'react';

export default function App() {
    const [isListening, setIsListening] = useState(false);

    return (
        <div className="container">
            {/* Header */}
            <header className="header">
                <h1 className="title">Aeyes</h1>
                <p className="subtitle">Voice browser assistant</p>
            </header>

            {/* Control Section (Input) */}
            <section className="control-section">
                <span className="control-label">Voice Control</span>
                <button
                    className={`btn ${isListening ? 'active' : ''}`}
                    onClick={() => setIsListening(!isListening)}
                >
                    {isListening ? 'Stop' : 'Start listening'}
                </button>
                <span className="shortcut">
                    or press <span className="kbd">Alt</span> + <span className="kbd">V</span>
                </span>
            </section>

            {/* Status Section (Output) */}
            <section className={`status-section ${isListening ? 'listening' : ''}`}>
                <span className="status-label">Status</span>
                <p className="status-content">
                    {isListening
                        ? 'Listening — speak a command'
                        : 'Ready — waiting for input'
                    }
                </p>
            </section>

            {/* Footer */}
            <footer className="footer">
                Say "help" for available commands
            </footer>
        </div>
    );
}
