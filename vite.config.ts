/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { offlineAppShell } from './scripts/lib/offline-shell.mjs';

export default defineConfig({
  // GitHub Pages 서브경로(/ggunbbu/) + 로컬 모두 상대 경로로 동작
  base: './',
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  // 런타임 의존성 0이라 청크를 쪼갤 이득이 없다(main 약 520kB). 크기 상한은 scripts/check-budget.mjs가 지킨다
  build: { target: 'es2022', emptyOutDir: true, chunkSizeWarningLimit: 600 },
  plugins: [offlineAppShell()],
  test: {
    include: ['tests/**/*.test.{ts,mjs}'],
    environment: 'node',
  },
});
