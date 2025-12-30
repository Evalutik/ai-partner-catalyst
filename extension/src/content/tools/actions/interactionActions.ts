import { ActionResult } from '../../types';
import { findElementById, findElementByText, isVisible, getAeyesId } from '../analysis/dom';

export function actionClick(elementId: string, description?: string): Promise<ActionResult> {
    return new Promise((resolve) => {
        const el = findElementById(elementId);
        if (!el) {
            resolve({ success: false, message: `Element ${elementId} not found` });
            return;
        }

        if (!isVisible(el)) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // Highlight for feedback
        const originalBorder = el.style.border;
        const originalBoxShadow = el.style.boxShadow;
        el.style.border = '2px solid red';
        el.style.boxShadow = '0 0 10px rgba(255,0,0,0.5)';

        setTimeout(() => {
            el.style.border = originalBorder;
            el.style.boxShadow = originalBoxShadow;

            try {
                // Robust Click Simulation
                const clickEvent = new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true
                });
                const mouseDownEvent = new MouseEvent('mousedown', {
                    view: window,
                    bubbles: true,
                    cancelable: true
                });
                const mouseUpEvent = new MouseEvent('mouseup', {
                    view: window,
                    bubbles: true,
                    cancelable: true
                });

                el.dispatchEvent(mouseDownEvent);
                el.dispatchEvent(mouseUpEvent);
                const dispatched = el.dispatchEvent(clickEvent);

                if (dispatched) {
                    // If default wasn't prevented, try native click as fallback
                    // specifically for links that might rely on it
                    el.click();
                }

                (el as HTMLElement).focus();

                resolve({ success: true, message: `Clicked ${description || elementId}` });
            } catch (e: any) {
                resolve({ success: false, message: `Click failed: ${e.message}` });
            }
        }, 300);
    });
}

export function actionType(elementId: string, text: string): ActionResult {
    const el = findElementById(elementId) as HTMLInputElement;
    if (!el) return { success: false, message: `Element ${elementId} not found` };
    if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return { success: false, message: `Element ${elementId} is not an input field` };

    el.focus();
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    return { success: true, message: `Typed "${text}"` };
}

export function actionScroll(value: string | undefined): ActionResult {
    if (!value) {
        window.scrollBy({ top: window.innerHeight / 2, behavior: 'smooth' });
        return { success: true, message: 'Scrolled down' };
    } else if (value === 'up') {
        window.scrollBy({ top: -window.innerHeight / 2, behavior: 'smooth' });
        return { success: true, message: 'Scrolled up' };
    } else if (value === 'top') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return { success: true, message: 'Scrolled to top' };
    } else if (value === 'bottom') {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        return { success: true, message: 'Scrolled to bottom' };
    }
    return { success: false, message: 'Invalid scroll value' };
}

export function actionFocus(elementId: string): ActionResult {
    const el = findElementById(elementId);
    if (!el) return { success: false, message: `Element ${elementId} not found` };

    el.focus();
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return { success: true, message: `Focused element ${elementId}` };
}
