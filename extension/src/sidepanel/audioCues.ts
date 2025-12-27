/**
 * Audio cues for blind accessibility
 * Uses Web Audio API to generate synthesized tones (no external files needed)
 */

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
    if (!audioContext) {
        audioContext = new AudioContext();
    }
    return audioContext;
}

/**
 * Play a tone at a specific frequency
 */
function playTone(frequency: number, duration: number, type: OscillatorType = 'sine'): Promise<void> {
    return new Promise((resolve) => {
        const ctx = getAudioContext();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

        // Gentle volume envelope
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
        gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + duration);

        setTimeout(resolve, duration * 1000);
    });
}

/**
 * Agent startup sound - ascending two-tone (C4 → E4)
 * Played when side panel opens
 */
export async function playStartupSound(): Promise<void> {
    await playTone(262, 0.1); // C4
    await playTone(330, 0.15); // E4
}

/**
 * Listening started sound - quick soft blip
 * Played when speech recognition starts
 */
export async function playListeningSound(): Promise<void> {
    await playTone(440, 0.08, 'sine'); // A4 blip
}

/**
 * Done speaking sound - descending two-tone (E4 → C4)
 * Played when TTS finishes speaking
 */
export async function playDoneSound(): Promise<void> {
    await playTone(330, 0.1); // E4
    await playTone(262, 0.15); // C4
}

/**
 * Error sound - low buzz
 */
export async function playErrorSound(): Promise<void> {
    await playTone(150, 0.2, 'sawtooth');
}

/**
 * Mute/deafen sound - descending sweep (listening paused)
 */
export async function playMuteSound(): Promise<void> {
    await playTone(440, 0.08); // A4
    await playTone(330, 0.08); // E4
    await playTone(220, 0.12); // A3
}

/**
 * Unmute/undeafen sound - ascending sweep (listening resumed)
 */
export async function playUnmuteSound(): Promise<void> {
    await playTone(220, 0.08); // A3
    await playTone(330, 0.08); // E4
    await playTone(440, 0.12); // A4
}
