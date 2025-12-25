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
                copyFileSync('public/sidepanel.html', 'dist/sidepanel.html');
                copyFileSync('public/permission.html', 'dist/permission.html');
                copyFileSync('public/permission.js', 'dist/permission.js');
            }
        }
    ],

    build: {
        outDir: 'dist',
        emptyDirBeforeWrite: true,
        cssCodeSplit: false,
        rollupOptions: {
            input: {
                sidepanel: resolve(__dirname, 'src/sidepanel/index.tsx'),
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
