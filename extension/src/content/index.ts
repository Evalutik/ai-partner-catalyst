// Content script - injected into web pages for DOM extraction and action execution

// Message listener - responds to requests from popup/background
chrome.runtime.onMessage.addListener(
    (message: { type: string;[key: string]: any }, _sender, sendResponse) => {
        if (message.type === 'EXTRACT_DOM') {
            const dom = extractDOM(message.selector, message.limit, message.optimize ?? true);
            sendResponse({ success: true, data: dom });
            return;
        }

        if (message.type === 'SCAN_PAGE') {
            const data = scanPage(message.maxDepth);
            sendResponse({ success: true, data });
            return;
        }

        if (message.type === 'GET_PAGE_STATUS') {
            const data = getPageStatus();
            sendResponse({ success: true, data });
            return;
        }

        if (message.type === 'EXECUTE_ACTION') {
            executeAction(message.action as Action).then(result => sendResponse(result));
            return true;
        }
    }
);

/* data types */
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
    truncated?: boolean;
}

interface DOMSnapshot {
    url: string;
    title: string;
    elements: ExtractedElement[];
    message?: string;
}

interface Action {
    type: 'click' | 'type' | 'scroll' | 'navigate' | 'focus' | 'search' | 'read';
    elementId?: string;
    value?: string;
    waitForPage?: boolean;
    description?: string;
}

interface ActionResult {
    success: boolean;
    message: string;
    data?: any;
}

const AEYES_ID_ATTR = 'data-aeyes-id';
let elementCounter = 0;

// --- Helper Functions ---

function isVisible(el: HTMLElement): boolean {
    // This can be expensive, wrap in try/catch if needed, but it's usually safe on single elements
    if ((el as any).checkVisibility) {
        if (!(el as any).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
            return false;
        }
    }
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return (
        rect.width > 0 && rect.height > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        style.opacity !== '0' &&
        style.pointerEvents !== 'none' &&
        el.getAttribute('aria-hidden') !== 'true'
    );
}

function getAeyesId(el: HTMLElement): string {
    let id = el.getAttribute(AEYES_ID_ATTR);
    if (!id) {
        id = `el-${++elementCounter}`;
        el.setAttribute(AEYES_ID_ATTR, id);
    }
    return id;
}

function getAssociatedLabel(el: HTMLElement): string | undefined {
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
        const labelEl = document.getElementById(labelledBy);
        if (labelEl) return labelEl.innerText.trim();
    }

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        if (el.id) {
            const labelFor = document.querySelector(`label[for="${el.id}"]`) as HTMLElement;
            if (labelFor) return labelFor.innerText.trim();
        }
        const parentLabel = el.closest('label') as HTMLElement;
        if (parentLabel) return parentLabel.innerText.trim();
    }
    return el.title || undefined;
}

function findElementById(elementId: string): HTMLElement | null {
    return document.querySelector(`[${AEYES_ID_ATTR}="${elementId}"]`) as HTMLElement | null;
}

// --- DOM Extraction Logic ---

interface PageStatus {
    url: string;
    title: string;
    scrollX: number;
    scrollY: number;
    windowWidth: number;
    windowHeight: number;
    loading: boolean;
}

function getPageStatus(): PageStatus {
    return {
        url: window.location.href,
        title: document.title,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        loading: document.readyState !== 'complete'
    };
}

interface PageStructure {
    headers: string[];
    landmarks: string[];
    interactionPoints: number;
}

function scanPage(_maxDepth: number = 2): PageStructure {
    // Quick structural scan
    const headers = Array.from(document.querySelectorAll('h1, h2, h3')).map(h => {
        return `${h.tagName}: ${(h as HTMLElement).innerText.substring(0, 50).replace(/\n/g, ' ')}`;
    });

    const landmarks = Array.from(document.querySelectorAll('main, nav, header, footer, [role="main"], [role="navigation"], [role="search"]')).map(l => {
        const role = l.getAttribute('role') || l.tagName.toLowerCase();
        const label = l.getAttribute('aria-label') || '';
        return `${role}${label ? ` ("${label}")` : ''}`;
    });

    // Estimate density
    const interactionPoints = document.querySelectorAll('a, button, input').length;

    return {
        headers,
        landmarks,
        interactionPoints,
    };
}

function extractDOM(selector?: string, limit: number = 50, optimize: boolean = true): DOMSnapshot {
    console.log(`[Aeyes Content] Extracting DOM. Selector: "${selector || 'ALL'}", Limit: ${limit}, Optimize: ${optimize}`);
    const startTime = performance.now();
    try {
        let candidateSet = new Set<HTMLElement>();

        if (selector) {
            // ZOOM-IN MODE: Use specific selector
            try {
                const results = document.querySelectorAll(selector);
                console.log(`[Aeyes Content] Zoom-in selector "${selector}" found ${results.length} items`);
                results.forEach(el => candidateSet.add(el as HTMLElement));

                // Also add children of selected elements if they are interactive
                results.forEach(parent => {
                    const children = parent.querySelectorAll('a, button, input, select, textarea');
                    children.forEach(child => candidateSet.add(child as HTMLElement));
                });
            } catch (e) {
                console.warn(`[Aeyes] Invalid selector: ${selector}, falling back to full scan`);
            }
        }

        if (candidateSet.size === 0) {
            // FULL SCAN MODE (Default)
            const interactiveSelectors = [
                'a', 'button', 'input', 'select', 'textarea',
                '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="menuitem"]',
                '[role="tab"]', '[role="radio"]', '[role="switch"]', '[role="treeitem"]',
                '[onclick]', '[contenteditable="true"]', '[tabindex]:not([tabindex="-1"])',
                'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'
            ].join(',');

            const initial = document.querySelectorAll(interactiveSelectors);
            initial.forEach(el => candidateSet.add(el as HTMLElement));
        }

        // Viewport & Visibility Filter
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        const extracted: ExtractedElement[] = [];
        const seenIds = new Set<string>();

        // Optimized processing loop
        for (const el of candidateSet) {
            if (extracted.length >= limit) break;

            const rect = el.getBoundingClientRect();

            // Fast Rejection (Off-screen)
            // Allow small buffer (500px)
            if (rect.bottom < -500 || rect.top > viewportHeight + 500) continue;
            if (rect.right < -500 || rect.left > viewportWidth + 500) continue;

            // Visibility Check
            if (!isVisible(el)) continue;

            const id = getAeyesId(el);
            if (seenIds.has(id)) continue;

            const textRaw = el.innerText?.trim();
            // SKIP EMPTY NON-INPUTS
            if (!textRaw && !(el instanceof HTMLInputElement) && !(el instanceof HTMLSelectElement) && !(el as HTMLElement).getAttribute('aria-label')) {
                continue;
            }

            // OPTIMIZATION: Skip pure wrapper elements when optimize is true
            if (optimize) {
                const tagLower = el.tagName.toLowerCase();
                const isWrapper = ['div', 'span', 'section', 'article', 'aside', 'main', 'header', 'footer', 'nav'].includes(tagLower);
                const hasNoRole = !el.getAttribute('role');
                const hasNoAriaLabel = !el.getAttribute('aria-label');
                const hasNoOnClick = !el.hasAttribute('onclick');
                const isNotTabable = el.getAttribute('tabindex') === '-1' || !el.hasAttribute('tabindex');

                // Skip if it's a structural wrapper with no interactive semantics
                if (isWrapper && hasNoRole && hasNoAriaLabel && hasNoOnClick && isNotTabable) {
                    // But keep it if it has meaningful short text (potential label/heading)
                    if (!textRaw || textRaw.length > 200) {
                        continue;
                    }
                }
            }

            let displayText = textRaw;
            let wasTruncated = false;

            if (textRaw && textRaw.length > 150) {
                displayText = textRaw.substring(0, 150) + '...';
                wasTruncated = true;
            }

            seenIds.add(id);

            const baseElement: any = {
                id: id,
                tagName: el.tagName.toLowerCase(),
                role: el.getAttribute('role') || undefined,
                text: displayText,
                truncated: wasTruncated,
                label: String(getAssociatedLabel(el) || '').substring(0, 100),
                placeholder: String((el as any).placeholder || '').substring(0, 100),
                value: String((el as any).value || '').substring(0, 100),
                checked: (el as any).checked
            };

            extracted.push(baseElement);
        }

        console.log(`[Aeyes Content] Extraction done in ${(performance.now() - startTime).toFixed(2)}ms. Found ${extracted.length} items.`);

        return {
            url: window.location.href,
            title: document.title,
            elements: extracted,
            message: `Extracted ${extracted.length} elements`
        };
    } catch (e) {
        console.error('[Aeyes Content] Extraction Failed:', e);
        return { url: window.location.href, title: document.title, elements: [], message: String(e) };
    }
}

// --- Actions ---

// Fallback Search Helper
function findElementByText(text: string): HTMLElement | null {
    if (!text) return null;
    const xpath = `//*[text()='${text}' or @aria-label='${text}' or @placeholder='${text}' or contains(text(), '${text}')]`;
    try {
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        return result.singleNodeValue as HTMLElement;
    } catch (e) { return null; }
}

function actionClick(elementId: string, description?: string): Promise<ActionResult> {
    return new Promise((resolve) => {
        let element = findElementById(elementId);

        // Self-Healing
        if (!element && description) {
            console.warn(`[Aeyes] Element ${elementId} not found. Attempting self-healing with: "${description}"`);
            element = findElementByText(description);
        }

        if (!element) {
            resolve({ success: false, message: `Element not found: ${elementId} (and fallback "${description}" failed)` });
            return;
        }

        try {
            element.focus();

            // Navigation Detection
            let navigationOccurred = false;
            const onBeforeUnload = () => { navigationOccurred = true; };
            window.addEventListener('beforeunload', onBeforeUnload);

            element.click();

            // Wait briefly to see if unload happens
            setTimeout(() => {
                window.removeEventListener('beforeunload', onBeforeUnload);
                resolve({
                    success: true,
                    message: `Clicked ${elementId}. Navigation: ${navigationOccurred}`,
                    data: { navigationOccurred }
                });
            }, 100);

        } catch (e) {
            resolve({ success: false, message: `Click failed: ${e}` });
        }
    });
}


function actionType(elementId: string, text: string): ActionResult {
    const element = findElementById(elementId);
    if (!element) return { success: false, message: `Element not found: ${elementId}` };
    try {
        element.focus();
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
            element.value = text;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));

            // Verification
            const verified = element.value === text;
            return {
                success: true,
                message: `Typed "${text}". Verified: ${verified}`,
                data: { verified, currentValue: element.value }
            };
        } else if (element.isContentEditable) {
            element.innerText = text;
            element.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
            return { success: true, message: `Typed into contentEditable.` };
        }
        return { success: false, message: "Element is not input or contentEditable" };
    } catch (e) { return { success: false, message: `Type failed: ${e}` }; }
}

function actionScroll(value: string | undefined): ActionResult {
    try {
        const scrollAmount = window.innerHeight * 0.8;
        // Default to down if no value provided
        const target = value || 'down';

        if (target === 'up') {
            window.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
        }
        else if (target === 'down') {
            window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
        }
        else if (target === 'top') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        else if (target === 'bottom') {
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }
        else {
            const element = findElementById(target);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                return { success: false, message: `Unknown scroll target: ${target}` };
            }
        }

        // Return new position
        return {
            success: true,
            message: `Scrolled ${target}`,
            data: { scrollX: window.scrollX, scrollY: window.scrollY }
        };
    } catch (e) { return { success: false, message: `Scroll failed: ${e}` }; }
}

function actionNavigate(url: string): ActionResult {
    if (!url.startsWith('http')) url = 'https://' + url;
    // Delay navigation slightly to allow response to be sent back to background
    setTimeout(() => {
        window.location.href = url;
    }, 100);
    return { success: true, message: `Navigating to ${url}` };
}

function actionFocus(elementId: string): ActionResult {
    const element = findElementById(elementId);
    if (!element) return { success: false, message: `Element not found: ${elementId}` };
    element.focus();
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return { success: true, message: `Focused ${elementId}` };
}

// Search Action
async function actionSearch(query: string): Promise<ActionResult> {
    if (!query) return { success: false, message: 'Search query empty' };

    // 1. Try window.find (simple text search)
    if ((window as any).find && (window as any).find(query)) {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const parent = range.commonAncestorContainer.parentElement;
            if (parent) {
                const id = getAeyesId(parent);
                parent.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return {
                    success: true,
                    message: `Found text "${query}" and scrolled to it. Element ID: ${id}`
                };
            }
        }
    }

    // 2. Fallback: XPath search
    try {
        const xpath = `//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${query.toLowerCase()}')]`;
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const node = result.singleNodeValue as HTMLElement;
        if (node) {
            const id = getAeyesId(node);
            node.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return {
                success: true,
                message: `Found text "${query}" (via XPath) and scrolled. Element ID: ${id}`
            };
        }
    } catch (e) { console.warn('XPath search failed:', e); }

    return { success: false, message: `Could not find text "${query}" on page.` };
}

// Read Action
function actionRead(elementId: string): ActionResult {
    const element = findElementById(elementId);
    if (!element) return { success: false, message: `Element not found: ${elementId}` };
    const fullText = element.innerText;
    return {
        success: true,
        message: `Read element ${elementId}`,
        data: { fullText: fullText }
    };
}

async function executeAction(action: Action): Promise<ActionResult> {
    console.log('[Aeyes Content Script] Executing action:', action.description || action.type);

    switch (action.type) {
        case 'click': return actionClick(action.elementId!, action.description);
        case 'type': return actionType(action.elementId!, action.value!);
        case 'scroll': return actionScroll(action.value);
        case 'navigate': return actionNavigate(action.value!);
        case 'focus': return actionFocus(action.elementId!);
        case 'search': return await actionSearch(action.value!);
        case 'read': return actionRead(action.elementId!);
        default: return { success: false, message: `Unknown action: ${(action as any).type}` };
    }
}

(window as any).extractDOM = extractDOM;
(window as any).scanPage = scanPage;
(window as any).getPageStatus = getPageStatus;
(window as any).executeAction = executeAction;
