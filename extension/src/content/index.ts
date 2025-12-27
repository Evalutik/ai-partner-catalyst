// Content script - injected into web pages for DOM extraction and action execution

// Message listener - responds to requests from popup/background
chrome.runtime.onMessage.addListener(
    (message: { type: string;[key: string]: unknown }, _sender, sendResponse) => {
        if (message.type === 'EXTRACT_DOM') {
            const dom = extractDOM();
            sendResponse({ success: true, data: dom });
        }

        if (message.type === 'EXECUTE_ACTION') {
            const result = executeAction(message.action as Action);
            sendResponse(result);
        }

        return true;
    }
);

/* data types:
ExtractedElement - element from the DOM (button/link/input etc)
DOMSnapshot - DOM snapshot ( JSON, url, title, elements list )
Action - action AI will tell the extension to do
*/

// Extracted elements types
interface ExtractedElement {
    id: string;
    tagName: string;
    type?: string;
    role?: string;
    text?: string;
    label?: string;
    placeholder?: string;
    alt?: string;
    value?: string;
    checked?: boolean;
}

interface DOMSnapshot {
    url: string;
    title: string;
    elements: ExtractedElement[];
    message?: string;
}

// Types for actions
interface Action {
    type: 'click' | 'type' | 'scroll' | 'navigate' | 'focus';
    elementId?: string;
    value?: string;
    waitForPage?: boolean;
    needsDom?: boolean;
    description?: string;
}

const AEYES_ID_ATTR = 'data-aeyes-id';
let elementCounter = 0;

// Helper to check if an element is visible and truly interactive for the user
function isVisible(el: HTMLElement): boolean {
    // 1. Check using modern browser API if available (Chrome 105+)
    // This handles display: none, visibility: hidden, and opacity: 0 automatically
    if ((el as any).checkVisibility) {
        if (!(el as any).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
            return false;
        }
    }

    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);

    return (
        // 2. Element must have dimensions
        rect.width > 0 && rect.height > 0 &&
        // 3. Fallback for older environments or specific CSS checks
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        style.opacity !== '0' &&
        // 4. Must allow pointer events (not disabled by CSS)
        style.pointerEvents !== 'none' &&
        // 5. Must not be hidden from screen readers/accessibility tree
        el.getAttribute('aria-hidden') !== 'true'
    );
}

// Helper to get or create a unique ID for an element
function getAeyesId(el: HTMLElement): string {
    let id = el.getAttribute(AEYES_ID_ATTR);
    if (!id) {
        id = `el-${++elementCounter}`;
        el.setAttribute(AEYES_ID_ATTR, id);
    }
    return id;
}

// Helper to find the most relevant label text for an element
function getAssociatedLabel(el: HTMLElement): string | undefined {
    // 1. Check aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    // 2. Check aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
        const labelEl = document.getElementById(labelledBy);
        if (labelEl) return labelEl.innerText.trim();
    }

    // 3. For form elements, check associated <label> tags
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        // Find label by 'for' attribute
        if (el.id) {
            const labelFor = document.querySelector(`label[for="${el.id}"]`) as HTMLElement;
            if (labelFor) return labelFor.innerText.trim();
        }
        // Find parent label
        const parentLabel = el.closest('label') as HTMLElement;
        if (parentLabel) return parentLabel.innerText.trim();
    }

    // 4. Fallback to title
    return el.title || undefined;
}

// Main function to extract interactive elements from the DOM
function extractDOM(): DOMSnapshot {
    const interactiveSelectors = [
        // Interactive elements
        'a', 'button', 'input', 'select', 'textarea',
        '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="menuitem"]',
        '[role="tab"]', '[role="radio"]', '[role="switch"]', '[role="treeitem"]',
        '[onclick]', '[contenteditable="true"]', '[tabindex]:not([tabindex="-1"])',
        // Headings for navigation (Wikipedia sections, etc.)
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
    ].join(',');

    const elements = Array.from(document.querySelectorAll(interactiveSelectors)) as HTMLElement[];
    const extracted: ExtractedElement[] = [];

    for (const el of elements) {
        if (!isVisible(el)) continue;

        const baseElement = {
            id: getAeyesId(el),
            tagName: el.tagName.toLowerCase(),
            role: el.getAttribute('role') || undefined,
            // Truncate all text fields to 100 chars to save tokens
            text: el.innerText.trim().substring(0, 100) || undefined,
            label: getAssociatedLabel(el)?.substring(0, 100),
            placeholder: ((el as any).placeholder as string | undefined)?.substring(0, 100),
            alt: ((el as any).alt as string | undefined)?.substring(0, 100),
            value: ((el as any).value as string | undefined)?.substring(0, 100),
            checked: (el as any).checked,
        };

        // Add 'type' for input elements
        if (el instanceof HTMLInputElement) {
            extracted.push({ ...baseElement, type: el.type });
        } else {
            extracted.push(baseElement);
        }

        // Hard limit to top 100 elements for token efficiency
        if (extracted.length >= 100) break;
    }

    return {
        url: window.location.href,
        title: document.title,
        elements: extracted,
        message: 'DOM extraction completed',
    };
}

// Action result type
interface ActionResult {
    success: boolean;
    message: string;
}

// Helper to find element by our assigned ID
function findElementById(elementId: string): HTMLElement | null {
    return document.querySelector(`[${AEYES_ID_ATTR}="${elementId}"]`) as HTMLElement | null;
}

// Click action - find element and trigger click
function actionClick(elementId: string): ActionResult {
    const element = findElementById(elementId);
    if (!element) {
        return { success: false, message: `Element not found: ${elementId}` };
    }

    try {
        // Focus first (important for accessibility)
        element.focus();

        // Trigger click
        element.click();

        return { success: true, message: `Clicked element: ${elementId}` };
    } catch (error) {
        return { success: false, message: `Click failed: ${error}` };
    }
}

// Type action - focus input and set value with proper events
function actionType(elementId: string, text: string): ActionResult {
    const element = findElementById(elementId);
    if (!element) {
        return { success: false, message: `Element not found: ${elementId}` };
    }

    // Check if it's an input-like element
    if (!(element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element.isContentEditable)) {
        return { success: false, message: `Element is not a text input: ${elementId}` };
    }

    try {
        // Focus the element
        element.focus();

        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
            // Set value
            element.value = text;

            // Dispatch events to trigger any listeners
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (element.isContentEditable) {
            // For contenteditable elements
            element.innerText = text;
            element.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
        }

        return { success: true, message: `Typed "${text}" into element: ${elementId}` };
    } catch (error) {
        return { success: false, message: `Type failed: ${error}` };
    }
}

// Scroll action - scroll page or to specific element
function actionScroll(value: string): ActionResult {
    try {
        const scrollAmount = window.innerHeight * 0.8; // 80% of viewport

        if (value === 'up') {
            window.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
            return { success: true, message: 'Scrolled up' };
        } else if (value === 'down') {
            window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
            return { success: true, message: 'Scrolled down' };
        } else if (value === 'top') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return { success: true, message: 'Scrolled to top' };
        } else if (value === 'bottom') {
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            return { success: true, message: 'Scrolled to bottom' };
        } else {
            // Assume it's an element ID - scroll to element
            const element = findElementById(value);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return { success: true, message: `Scrolled to element: ${value}` };
            }
            return { success: false, message: `Unknown scroll target: ${value}` };
        }
    } catch (error) {
        return { success: false, message: `Scroll failed: ${error}` };
    }
}

// Navigate action - go to URL
function actionNavigate(url: string): ActionResult {
    try {
        // Validate URL
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        // Navigate using location.href
        window.location.href = url;

        return { success: true, message: `Navigating to: ${url}` };
    } catch (error) {
        return { success: false, message: `Navigate failed: ${error}` };
    }
}

// Focus action - set focus on element for accessibility
function actionFocus(elementId: string): ActionResult {
    const element = findElementById(elementId);
    if (!element) {
        return { success: false, message: `Element not found: ${elementId}` };
    }

    try {
        // Focus the element
        element.focus();

        // Optionally scroll into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        return { success: true, message: `Focused element: ${elementId}` };
    } catch (error) {
        return { success: false, message: `Focus failed: ${error}` };
    }
}

// Main action dispatcher
function executeAction(action: Action): ActionResult {
    console.log('[Aeyes Content Script] Executing action:', action.description || action.type);

    switch (action.type) {
        case 'click':
            if (!action.elementId) {
                return { success: false, message: 'Click action requires elementId' };
            }
            return actionClick(action.elementId);

        case 'type':
            if (!action.elementId || action.value === undefined) {
                return { success: false, message: 'Type action requires elementId and value' };
            }
            return actionType(action.elementId, action.value);

        case 'scroll':
            if (!action.value) {
                return { success: false, message: 'Scroll action requires value (up/down/top/bottom/elementId)' };
            }
            return actionScroll(action.value);

        case 'navigate':
            if (!action.value) {
                return { success: false, message: 'Navigate action requires value (URL)' };
            }
            return actionNavigate(action.value);

        case 'focus':
            if (!action.elementId) {
                return { success: false, message: 'Focus action requires elementId' };
            }
            return actionFocus(action.elementId);

        default:
            return { success: false, message: `Unknown action type: ${(action as any).type}` };
    }
}

// Expose for testing in console
(window as any).extractDOM = extractDOM;
(window as any).executeAction = executeAction;
