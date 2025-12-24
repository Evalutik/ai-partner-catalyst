import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync } from 'fs';

// Build config for Chrome extension
export default defineConfig({
    plugins: [
        react(),
        {
            name: 'copy-extension-files',
            closeBundle() {
                // Copy static files to dist
                copyFileSync('public/manifest.json', 'dist/manifest.json');
                copyFileSync('public/popup.html', 'dist/popup.html');
            }
        }
    ],

    build: {
        outDir: 'dist',
        emptyDirBeforeWrite: true,
        cssCodeSplit: false, // Bundle CSS into popup.css
        rollupOptions: {
            input: {
                popup: resolve(__dirname, 'src/popup/index.tsx'),
                background: resolve(__dirname, 'src/background/index.ts'),
                content: resolve(__dirname, 'src/content/index.ts'),
            },
            output: {
                entryFileNames: '[name].js',
                chunkFileNames: 'chunks/[name].js',
                assetFileNames: '[name].[ext]',
            },
        },
    },
});
