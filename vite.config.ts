import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const projectRoot = __dirname;
const hasMarked = fs.existsSync(
  path.resolve(projectRoot, 'node_modules/marked'),
);
const hasDomPurify = fs.existsSync(
  path.resolve(projectRoot, 'node_modules/dompurify'),
);
const markdownAliases = [
  !hasMarked && {
    find: 'marked',
    replacement: path.resolve(projectRoot, 'src/help/markedFallback.ts'),
  },
  !hasDomPurify && {
    find: 'dompurify',
    replacement: path.resolve(projectRoot, 'src/help/dompurifyFallback.ts'),
  },
].filter(Boolean) as { find: string; replacement: string }[];

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [vue()],
  optimizeDeps: {
    exclude: [
      '@coderline/alphatab',
      '@coderline/alphatab/dist/alphaTab.worker.mjs',
      '@coderline/alphatab/dist/alphaTab.worker.min.mjs',
    ],
  },
  resolve: {
    alias: markdownAliases,
  },
  test: {
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      exclude: [
        '**/*.md',
        '**/*.png',
        '**/*.jpg',
        '**/*.jpeg',
        '**/*.gif',
        '**/*.svg',
        'src/assets/**',
        'src/help/**',
      ],
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },
}));
