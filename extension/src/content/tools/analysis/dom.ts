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

export function extractDOM(selector: string = 'body', limit: number = 50, optimize: boolean = true): DOMSnapshot {
    const root = document.querySelector(selector) as HTMLElement;
    if (!root) return { url: window.location.href, title: document.title, elements: [], message: 'Root element not found' };

    const elements: ExtractedElement[] = [];
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
    while (walker.nextNode() && count < limit) {
        const el = walker.currentNode as HTMLElement;
        const text = el.textContent?.trim() || '';
        const isInteractive = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || el.onclick || el.getAttribute('role') === 'button';

        // Filter out empty non-interactive elements unless they are images
        if (!isInteractive && !text && el.tagName !== 'IMG') continue;

        // Optimization: Skip very short text for massive pages
        if (optimize && !isInteractive && text.length < 3) continue;

        const extracted: ExtractedElement = {
            id: getAeyesId(el),
            tagName: el.tagName.toLowerCase(),
            text: text.substring(0, 100) + (text.length > 100 ? '...' : ''), // Truncate long text
            truncated: text.length > 100
        };

        if (isInteractive) extracted.type = (el as any).type;
        if (el.getAttribute('role')) extracted.role = el.getAttribute('role')!;
        if ((el as HTMLInputElement).placeholder) extracted.placeholder = (el as HTMLInputElement).placeholder;
        if ((el as HTMLImageElement).alt) extracted.alt = (el as HTMLImageElement).alt;
        if ((el as HTMLInputElement).value) extracted.value = (el as HTMLInputElement).value;
        if ((el as HTMLInputElement).checked) extracted.checked = (el as HTMLInputElement).checked;

        const label = getAssociatedLabel(el);
        if (label) extracted.label = label;

        elements.push(extracted);
        count++;
    }

    return {
        url: window.location.href,
        title: document.title,
        elements
    };
}
