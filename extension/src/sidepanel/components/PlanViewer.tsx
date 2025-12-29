

interface PlanViewerProps {
    currentPlan: string | null;
}

export default function PlanViewer({ currentPlan }: PlanViewerProps) {
    if (!currentPlan) return null;

    return (
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
    );
}
