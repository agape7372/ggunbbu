// 건뿌 부트스트랩: 캔버스 스케일링 + 고정 타임스텝 루프 + 씬 구동.
import './style.css';
import { VIEW, PALETTE, TICK } from './config';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// dpr ≤2 클램프 (podoalgraph 기법) + 정수배 픽셀아트 스케일
function setupCanvas(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = VIEW.W * dpr;
  canvas.height = VIEW.H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

// 레터박스: #stage를 화면에 맞춰 CSS 스케일
function fitStage(): void {
  const stage = document.getElementById('stage')!;
  const scale = Math.min(window.innerWidth / VIEW.W, window.innerHeight / VIEW.H);
  stage.style.transform = `scale(${scale})`;
}

setupCanvas();
fitStage();
window.addEventListener('resize', () => { setupCanvas(); fitStage(); });

// ── 고정 타임스텝 루프 ──────────────────────────────────────────
export type FrameFn = (dt: number) => void;
let update: FrameFn = () => {};
let draw: () => void = () => {
  ctx.fillStyle = PALETTE.BG;
  ctx.fillRect(0, 0, VIEW.W, VIEW.H);
  ctx.fillStyle = PALETTE.YELLOW;
  ctx.font = '16px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('건뿌!! M0', VIEW.W / 2, VIEW.H / 2);
};

/** 씬 레이어가 루프 콜백을 교체한다 */
export function setLoop(u: FrameFn, d: () => void): void { update = u; draw = d; }

let acc = 0;
let last = performance.now();
let paused = false;

function frame(now: number): void {
  requestAnimationFrame(frame);
  if (paused) { last = now; return; }
  acc += Math.min((now - last) / 1000, 0.25);
  last = now;
  while (acc >= TICK) { update(TICK); acc -= TICK; }
  draw();
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
