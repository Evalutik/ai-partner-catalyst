/**
 * Echo Filter - Prevents AI from hearing its own speech output
 * 
 * When the AI speaks, the microphone may pick up the audio.
 * This filter detects and suppresses such self-hearing.
 */

// Punctuation pattern for text normalization
const PUNCTUATION_PATTERN = /[.,\/#!$%\^&\*;:{}=\-_`~()]/g;

/**
 * Normalize text for comparison: lowercase, remove punctuation
 */
export function normalizeText(text: string): string {
    return text.toLowerCase().replace(PUNCTUATION_PATTERN, '').trim();
}

/**
 * Check if input text is an echo of previously spoken text
 * @param inputText - Text heard from microphone
 * @param spokenText - Text that was previously spoken by AI
 * @returns true if input appears to be echo of spoken text
 */
export function isEchoOfSpokenText(inputText: string, spokenText: string): boolean {
    if (!inputText || !spokenText) return false;

    const cleanInput = normalizeText(inputText);
    const cleanSpoken = normalizeText(spokenText);

    // Check if input is a substring of what was spoken (echo)
    return cleanSpoken.includes(cleanInput);
}

/**
 * Capitalize first letter of text
 */
export function capitalizeFirst(text: string): string {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
}
