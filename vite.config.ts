/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { offlineAppShell } from './scripts/lib/offline-shell.mjs';

export default defineConfig({
  // GitHub Pages 서브경로(/ggunbbu/) + 로컬 모두 상대 경로로 동작
  base: './',
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  build: { target: 'es2022', emptyOutDir: true },
  plugins: [offlineAppShell()],
  test: {
    include: ['tests/**/*.test.{ts,mjs}'],
    environment: 'node',
  },
});
