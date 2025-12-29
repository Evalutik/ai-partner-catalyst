/**
 * Wake word detection utilities for Aeyes voice assistant
 */

const WAKE_WORDS = [
    'aeyes',
    'a eyes',
    'eyes',
    'hey eyes',
    'hey aeyes',
    'hi eyes',
    'hi aeyes'
];

/**
 * Check if the given text contains a wake word
 */
export function checkForWakeWord(text: string): boolean {
    const normalizedText = text.toLowerCase().trim();
    return WAKE_WORDS.some(word => normalizedText.includes(word));
}

/**
 * Get the list of configured wake words
 */
export function getWakeWords(): readonly string[] {
    return WAKE_WORDS;
}
