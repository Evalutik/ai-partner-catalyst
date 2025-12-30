/**
 * Chrome Extension API utilities
 * 
 * NOTE: Most functionality has been moved to specialized tools:
 * - DOM extraction -> tools/analysis/domAnalysis.ts
 * - Page context -> tools/analysis/pageContext.ts
 * - Tab actions -> tools/actions/tabActions.ts
 */

/**
 * Open the permission settings page
 */
export async function openPermissionPage(): Promise<void> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const returnTabId = tab?.id;

    const url = returnTabId
        ? chrome.runtime.getURL(`permission.html?returnTo=${returnTabId}`)
        : chrome.runtime.getURL('permission.html');

    chrome.tabs.create({ url });
}
