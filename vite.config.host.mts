import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  // SSR builds externalize node_modules by default, which would leave a
  // runtime require('@vscode/l10n') that is NOT shipped in the .vsix
  // (.vscodeignore excludes node_modules/**). Bundle it instead.
  ssr: {
    noExternal: ['@vscode/l10n'],
  },
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
