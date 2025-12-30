/**
 * Text-to-Speech utilities for audio playback
 */

import { getAudioUrl } from './api';

/**
 * Play text as speech and await completion
 * @param text - Text to speak
 * @param signal - Optional AbortSignal to cancel the request
 * @returns Promise that resolves when audio finishes playing
 */
export async function speakText(
    text: string,
    signal?: AbortSignal
): Promise<HTMLAudioElement> {
    const audioUrl = await getAudioUrl(text, signal);
    const audio = new Audio(audioUrl);
    return audio;
}

/**
 * Play audio and wait for it to complete
 * @param audio - HTMLAudioElement to play
 * @returns Promise that resolves when audio ends, pauses, or errors
 */
export function playAudioAndWait(audio: HTMLAudioElement): Promise<void> {
    return new Promise<void>((resolve) => {
        const finish = () => resolve();
        audio.onended = finish;
        audio.onpause = finish;
        audio.onerror = finish;
        audio.play().catch(finish);
    });
}

/**
 * Convenience function to speak text and wait for completion
 */
export async function speakAndWait(
    text: string,
    signal?: AbortSignal
): Promise<HTMLAudioElement> {
    const audio = await speakText(text, signal);
    await playAudioAndWait(audio);
    return audio;
}
