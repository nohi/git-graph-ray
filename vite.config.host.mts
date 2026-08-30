import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  build: {
    ssr: true,
    sourcemap: true,
    minify: false,
    outDir: 'dist/host',
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        extension: path.resolve('src/host/extension.ts'),
        askpass: path.resolve('src/host/askpass/main.ts'),
      },
      external: ['vscode'],
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'runtime.js',
        format: 'cjs',
      },
    },
  },
});
