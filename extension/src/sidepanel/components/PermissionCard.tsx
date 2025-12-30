import React from 'react';
import LockIcon from './LockIcon';
import { openPermissionPage } from '../services/chrome';


interface PermissionCardProps {
    onOpenSettings?: () => void; // Optional override, defaults to openPermissionPage
    onRetry?: () => void;
}

export default function PermissionCard({ onOpenSettings = openPermissionPage, onRetry }: PermissionCardProps) {
    return (
        <div className="permission-card animate-fade-in">
            <div className="mb-3 text-center"><LockIcon /></div>
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-primary)' }}>
                Microphone Access Needed
            </h3>
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)', lineHeight: '1.5' }}>
                Please allow microphone access to use voice commands.
            </p>

            {onRetry && (
                <button
                    onClick={onRetry}
                    className="permission-btn w-full justify-center mb-2"
                    style={{ background: 'var(--color-primary)', color: 'white' }}
                >
                    Enable Microphone
                </button>
            )}

            <button
                onClick={onOpenSettings}
                className="permission-btn w-full justify-center"
                style={{ background: '#E2E2E2', color: '#060606' }}
            >
                Open Permission Settings
            </button>
        </div>
    );
}

