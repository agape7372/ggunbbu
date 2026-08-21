// 건뿌 부트스트랩: 캔버스 스케일링 + 고정 타임스텝 루프 + 씬/입력/터치 배선.
import './style.css';
import { VIEW, TICK } from './config';
import { initTouchLayer } from './ui/touchLayer';
import { createInput } from './input/input';
import { createApp, mountDebugPanel } from './ui/scenes';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// dpr ≤2 클램프 + 픽셀아트 설정
function setupCanvas(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = VIEW.W * dpr;
  canvas.height = VIEW.H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

// 레터박스
function fitStage(): void {
  const stage = document.getElementById('stage')!;
  const scale = Math.min(window.innerWidth / VIEW.W, window.innerHeight / VIEW.H);
  stage.style.transform = `scale(${scale})`;
}

setupCanvas();
fitStage();
window.addEventListener('resize', () => { setupCanvas(); fitStage(); });

const touch = initTouchLayer(document.getElementById('touch-layer')!);
const input = createInput(touch);
const app = createApp(ctx, input, touch);

if (new URLSearchParams(location.search).has('debug')) {
  mountDebugPanel(() => app.getState());
  (window as unknown as { __app: typeof app }).__app = app; // 브라우저 검증용
}

// ── 고정 타임스텝 루프 ──
let acc = 0;
let last = performance.now();
let paused = false;

function frame(now: number): void {
  requestAnimationFrame(frame);
  if (paused) { last = now; return; }
  acc += Math.min((now - last) / 1000, 0.25);
  last = now;
  while (acc >= TICK) { app.update(TICK); acc -= TICK; }
  app.draw();
}
requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => {
  paused = document.hidden;
});

// SW 등록 (프로덕션만)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
