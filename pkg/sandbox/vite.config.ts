import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    optimizeDeps: {
        exclude: ['monaco-editor'],
    }
});