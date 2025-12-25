/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./src/**/*.{js,ts,jsx,tsx}",
        "./public/**/*.html"
    ],
    theme: {
        extend: {
            colors: {
                // Custom dark theme palette
                dark: {
                    900: '#0a0a0f',
                    800: '#0f0f18',
                    700: '#161625',
                    600: '#1e1e32',
                    500: '#2a2a45',
                },
                accent: {
                    DEFAULT: '#6c5ce7',
                    light: '#a29bfe',
                    glow: 'rgba(108, 92, 231, 0.4)',
                },
                success: '#00d26a',
                error: '#ff5757',
            },
            fontFamily: {
                sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
            },
            animation: {
                'pulse-ring': 'pulse-ring 1.5s ease-out infinite',
                'mic-pulse': 'mic-pulse 1s ease-in-out infinite',
                'bar-bounce': 'bar-bounce 0.5s ease-in-out infinite',
                'fade-in': 'fade-in 0.3s ease-out',
                'slide-up': 'slide-up 0.3s ease-out',
            },
            keyframes: {
                'pulse-ring': {
                    '0%': { boxShadow: '0 0 0 0 rgba(0, 210, 106, 0.4)' },
                    '100%': { boxShadow: '0 0 0 15px rgba(0, 210, 106, 0)' },
                },
                'mic-pulse': {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.5' },
                },
                'bar-bounce': {
                    '0%, 100%': { transform: 'scaleY(0.3)' },
                    '50%': { transform: 'scaleY(1)' },
                },
                'fade-in': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                'slide-up': {
                    '0%': { opacity: '0', transform: 'translateY(10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
            },
            backdropBlur: {
                xs: '2px',
            },
        },
    },
    plugins: [],
}
