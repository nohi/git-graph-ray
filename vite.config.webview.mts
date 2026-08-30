import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  build: {
    sourcemap: true,
    outDir: 'dist/webview',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: path.resolve('src/webview/main.ts'),
      name: 'GitGraphRay',
      formats: ['iife'],
      fileName: () => 'webview.js',
      cssFileName: 'style',
    },
  },
});
