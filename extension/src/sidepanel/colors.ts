/**
 * Color configuration for Aeyes UI
 * Edit these values to change the app's color scheme
 */

export const colors = {
    // Background colors
    bgBase: '#060606',      // Main background (almost black)
    bgCard: '#0e0e0e',      // Card backgrounds
    bgElevated: '#161616',  // Elevated elements

    // Text colors
    textPrimary: '#E2E2E2', // Primary text (almost white)
    textMuted: '#505051',   // Muted/secondary text (dark gray)

    // Status colors - button & audio bars use these
    idle: '#161616',        // Idle state (dark, blends with bg)
    listening: '#E2E2E2',   // Listening (almost white - user speaking)
    processing: '#70847C',  // Processing (sage green - thinking)
    speaking: '#70847C',    // Speaking (sage green - agent output)

    // Text on buttons
    buttonTextLight: '#E2E2E2',  // Light text on dark buttons
    buttonTextDark: '#060606',   // Dark text on light buttons (listening)

    // Accent colors
    agent: '#70847C',       // Agent messages accent
    error: '#c45050',       // Error state
} as const;
