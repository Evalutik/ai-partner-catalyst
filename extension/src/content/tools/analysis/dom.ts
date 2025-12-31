import { ExtractedElement, DOMSnapshot, PageStructure } from '../../types';

const AEYES_ID_ATTR = 'data-aeyes-id';
let elementCounter = 0;

export function isVisible(el: HTMLElement): boolean {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;

    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 &&
        rect.top < window.innerHeight && rect.bottom > 0 &&
        rect.left < window.innerWidth && rect.right > 0;
}

export function getAeyesId(el: HTMLElement): string {
    if (el.hasAttribute(AEYES_ID_ATTR)) {
        return el.getAttribute(AEYES_ID_ATTR)!;
    }
    const id = `el-${elementCounter++}`;
    el.setAttribute(AEYES_ID_ATTR, id);
    return id;
}

export function getAssociatedLabel(el: HTMLElement): string | undefined {
    let label: string | undefined;
    if (el.id) {
        const labelEl = document.querySelector(`label[for="${el.id}"]`);
        if (labelEl) label = labelEl.textContent?.trim();
    }
    if (!label && el.hasAttribute('aria-label')) {
        label = el.getAttribute('aria-label')!;
    }
    if (!label && el.hasAttribute('aria-labelledby')) {
        const ids = el.getAttribute('aria-labelledby')!.split(' ');
        label = ids.map(id => document.getElementById(id)?.textContent).join(' ').trim();
    }
    return label;
}

export function findElementById(elementId: string): HTMLElement | null {
    return document.querySelector(`[${AEYES_ID_ATTR}="${elementId}"]`);
}

export function findElementByText(text: string): HTMLElement | null {
    const xpath = `//*[text()='${text}' or contains(text(), '${text}')]`;
    const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    return result.singleNodeValue as HTMLElement;
}

export function scanPage(_maxDepth: number = 2): PageStructure {
    const headers = Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.textContent?.trim() || '').filter(Boolean);
    const landmarks = Array.from(document.querySelectorAll('nav, main, aside, footer, header')).map(l => l.tagName.toLowerCase());
    const interactionPoints = document.querySelectorAll('button, a, input, select, textarea').length;

    return {
        headers: headers.slice(0, 5), // Top 5 headers
        landmarks,
        interactionPoints
    };
}

// Helper to extract data from a single element
function parseElement(el: HTMLElement, optimize: boolean = true): ExtractedElement {
    const text = el.textContent?.trim() || '';

    // Only truncate if optimizing AND text is very long
    // If not optimized (e.g. specific fetch), keep full text for reading
    const shouldTruncate = optimize && text.length > 300;

    const extracted: ExtractedElement = {
        id: getAeyesId(el),
        tagName: el.tagName.toLowerCase(),
        text: shouldTruncate ? text.substring(0, 300) + '...' : text,
        truncated: shouldTruncate
    };

    const isInteractive = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || el.onclick || el.getAttribute('role') === 'button';

    if (isInteractive) extracted.type = (el as any).type;
    if (el.getAttribute('role')) extracted.role = el.getAttribute('role')!;
    if ((el as HTMLInputElement).placeholder) extracted.placeholder = (el as HTMLInputElement).placeholder;
    if ((el as HTMLImageElement).alt) extracted.alt = (el as HTMLImageElement).alt;
    if ((el as HTMLInputElement).value) extracted.value = (el as HTMLInputElement).value;
    if ((el as HTMLInputElement).checked) extracted.checked = (el as HTMLInputElement).checked;

    const label = getAssociatedLabel(el);
    if (label) extracted.label = label;

    return extracted;
}

export function extractDOM(selector: string = 'body', limit: number = 50, optimize: boolean = true, offset: number = 0): DOMSnapshot {
    let elements: ExtractedElement[] = [];
    const containerTags = ['BODY', 'MAIN', 'SECTION', 'ARTICLE', 'DIV', 'ASIDE', 'HEADER', 'FOOTER', 'NAV', 'FORM'];

    // Check what the selector targets
    const candidates = Array.from(document.querySelectorAll(selector));

    // Store total count for pagination support
    const selectorMatches = candidates.length;

    // DECISION: Treat as Scope (Root) OR List of Items?
    // Treat as Scope if:
    // 1. Only 1 element found AND
    // 2. It's a container tag AND
    // 3. It's not a generic 'a, button' selector that just happened to match 1 item
    // (Rough heuristic: containers usually don't match list selectors like 'a', 'h1')

    const isSingleMatch = candidates.length === 1;
    let root: HTMLElement | null = null;

    if (isSingleMatch) {
        const el = candidates[0] as HTMLElement;
        if (containerTags.includes(el.tagName)) {
            root = el;
        }
    }

    // STRATEGY A: TreeWalker (Scope Mode)
    // Used if selector targets a container (like #main, body, .content)
    if (root) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
            acceptNode: (node) => {
                const el = node as HTMLElement;
                if (!isVisible(el)) return NodeFilter.FILTER_REJECT;
                // Interactive or informative elements
                if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'H1', 'H2', 'H3', 'P', 'LI', 'SPAN', 'DIV', 'IMG'].includes(el.tagName)) {
                    return NodeFilter.FILTER_ACCEPT;
                }
                return NodeFilter.FILTER_SKIP;
            }
        });

        let count = 0;
        let skipped = 0;
        while (walker.nextNode() && count < limit) {
            const el = walker.currentNode as HTMLElement;
            const text = el.textContent?.trim() || '';
            const isInteractive = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || el.onclick || el.getAttribute('role') === 'button';

            // Filter out empty non-interactive elements unless they are images
            if (!isInteractive && !text && el.tagName !== 'IMG') continue;

            // Optimization: Skip very short text for massive pages
            if (optimize && !isInteractive && text.length < 3) continue;

            // Skip elements until we reach the offset
            if (skipped < offset) {
                skipped++;
                continue;
            }

            elements.push(parseElement(el, optimize));
            count++;
        }
    }
    // STRATEGY B: Query Selector List (Filter Mode)
    // Used for 'h1', 'a', '.search-result', 'button' etc.
    else {
        let count = 0;
        let skipped = 0;

        // If using a specific selector (not 'body'), the AI explicitly wants these elements
        // even if they are off-screen, so skip visibility check
        const skipVisibilityCheck = selector !== 'body';

        for (const node of candidates) {
            if (count >= limit) break;

            const el = node as HTMLElement;

            // Only check visibility for default 'body' selector
            if (!skipVisibilityCheck && !isVisible(el)) continue;

            // Skip elements until we reach the offset
            if (skipped < offset) {
                skipped++;
                continue;
            }

            elements.push(parseElement(el, optimize));
            count++;
        }
    }

    return {
        url: window.location.href,
        title: document.title,
        elements,
        selectorMatches
    };
}
