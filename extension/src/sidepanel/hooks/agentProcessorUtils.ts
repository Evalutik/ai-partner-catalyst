export interface LoopDetectionState {
    samePlanRepeatCount: number;
    lastPlanText: string;
}

export function detectPlanLoop(
    actions: any[],
    loopState: LoopDetectionState,
    maxRepeats: number
): LoopDetectionState {
    const currentPlan = actions?.find((a: any) => a.type === 'notify_plan');
    let { samePlanRepeatCount, lastPlanText } = loopState;

    if (currentPlan) {
        const planText = currentPlan.value || currentPlan.args?.plan || '';
        if (planText === lastPlanText) {
            samePlanRepeatCount++;
            if (samePlanRepeatCount >= maxRepeats) {
                console.warn('[Aeyes] Plan loop detected, continuing caution...');
            }
        } else {
            samePlanRepeatCount = 1;
            lastPlanText = planText;
        }
    }
    return { samePlanRepeatCount, lastPlanText };
}

export function checkInfiniteLoop(
    stepCount: number,
    perception: any
): string | null {
    // Safety check for loops without vision
    if (stepCount > 1 && !perception.domContext && !perception.isProtected) {
        console.warn('[Aeyes] Infinite loop risk: No DOM available.');
        return "I can't see the page content right now. Please ensure you're on a valid web page.";
    }
    return null;
}

export function determineFinalResponse(
    stepCount: number,
    maxSteps: number,
    finalText: string
): string {
    if (!finalText) {
        return stepCount >= maxSteps
            ? "I'm sorry, the task was too complex. Please try breaking it down."
            : "Task completed.";
    }
    return finalText;
}
