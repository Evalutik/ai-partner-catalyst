import { ActionResult } from '../../types';
import { findElementById, findElementByText, getAeyesId } from '../analysis/dom';

export async function actionSearch(query: string): Promise<ActionResult> {
    // 1. Try to find a search input
    const searchSelectors = ['input[type="search"]', 'input[name="q"]', 'input[placeholder*="Search"]', 'input[aria-label*="Search"]'];
    let searchInput: HTMLInputElement | null = null;

    for (const selector of searchSelectors) {
        searchInput = document.querySelector(selector) as HTMLInputElement;
        if (searchInput) break;
    }

    if (searchInput) {
        searchInput.focus();
        searchInput.value = query;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));

        // Try submitting form
        const form = searchInput.closest('form');
        if (form) {
            form.requestSubmit();
        } else {
            // Try pressing enter
            searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }

        return { success: true, message: `Performed search for "${query}"` };
    }

    return { success: false, message: 'No search input found on this page.' };
}

export function actionRead(elementId: string): ActionResult {
    const el = findElementById(elementId);
    if (!el) return { success: false, message: `Element ${elementId} not found` };

    const text = el.innerText || el.textContent || '';
    return { success: true, message: `Read content`, data: { text: text.substring(0, 500) } }; // Limit read size
}
