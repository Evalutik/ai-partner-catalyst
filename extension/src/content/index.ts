// Content script - injected into web pages for DOM extraction and action execution

// Message listener - responds to requests from popup/background
chrome.runtime.onMessage.addListener(
    (message: { type: string;[key: string]: unknown }, _sender, sendResponse) => {
        console.log('[Aeyes Content] Message:', message.type);

        if (message.type === 'EXTRACT_DOM') {
            // Will be implemented in Step 2.1
            const dom = extractDOM();
            sendResponse({ success: true, data: dom });
        }

        if (message.type === 'EXECUTE_ACTION') {
            // Will be implemented in Step 2.3
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
    type: 'click' | 'type' | 'scroll' | 'navigate';
    elementId?: string;
    value?: string;
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
        'a', 'button', 'input', 'select', 'textarea',
        '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="menuitem"]',
        '[role="tab"]', '[role="radio"]', '[role="switch"]', '[role="treeitem"]',
        '[onclick]', '[contenteditable="true"]', '[tabindex]:not([tabindex="-1"])'
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

// Placeholder - will be implemented in Step 2.3
function executeAction(action: Action) {
    console.log('[Aeyes Content] Execute action:', action);
    return {
        success: false,
        message: 'Action execution will be implemented in Step 2.3',
    };
}

// Expose for testing in console
(window as any).extractDOM = () => {
    const dom = extractDOM();
    console.log('[Aeyes] Extracted DOM:', dom);
    return dom;
};

console.log('[Aeyes] Content script loaded on:', window.location.href);
