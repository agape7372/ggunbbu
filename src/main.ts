// 건뿌 부트스트랩: 캔버스 스케일링 + 고정 타임스텝 루프 + 씬/입력/터치 배선.
import './style.css';
import { VIEW, TICK } from './config';
import { initTouchLayer } from './input/touch';
import { createInput } from './input/input';
import { createApp, mountDebugPanel } from './ui/scenes';
import { preloadAssets } from './render/assets';
import { loadSave } from './storage';
import { mountInstallPrompt } from './ui/installPrompt';
import { notifyAppReady, onLifecycle, isNative } from './platform/native';
import { initOta } from './platform/ota';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

// 네이티브 셸: OTA 롤백 방지 신호 — ★모듈 최상단에서 즉시(08-30 검증: preloadAssets 뒤에 두면
// Wave 3 실PNG 투입 시 appReadyTimeout 10s를 잠식하고, 상류 throw에 신호가 유실돼 롤백 루프).
notifyAppReady();

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
  stage.style.setProperty('--field-h', `${VIEW.FIELD_H}px`);
  const scale = Math.min(window.innerWidth / VIEW.W, window.innerHeight / VIEW.H);
  stage.style.transform = `scale(${scale})`;
}

setupCanvas();
fitStage();
window.addEventListener('resize', () => { setupCanvas(); fitStage(); });

const touch = initTouchLayer(document.getElementById('touch-layer')!);
touch.setLeftHanded(loadSave().settings.leftHanded);
const input = createInput(touch);
const app = createApp(ctx, input, touch);
mountInstallPrompt();

if (new URLSearchParams(location.search).has('debug')) {
  mountDebugPanel(() => app.getState());
  (window as unknown as { __app: typeof app }).__app = app; // 브라우저 검증용
}

// PNG 에셋 프리로드 — 개별 실패는 assets.ts가 삼키므로 여기선 폴백만 방어적으로 감싼다.
// 로딩 실패/미존재 파일이어도 게임은 그대로 시작된다.
await preloadAssets().catch(() => {});

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

// 전경/배경 — 웹 visibilitychange + 네이티브 appStateChange 통합 (이중 발화 1회 dedupe)
onLifecycle((fg) => {
  paused = !fg;
});

// OTA 확인 — 네이티브 셸에서만, 부팅 3초 뒤 조용히. 받아 두기만 하고 적용은 다음 복귀 때.
initOta();

// SW 등록 (웹 프로덕션만)
// ★네이티브 셸에서는 등록하지 않는다: 셸도 http://localhost 오리진이라 SW가 그대로 살아
// OTA로 갈아끼운 새 번들 위에 **옛 캐시를 계속 서빙**한다(무선 갱신이 조용히 무효가 되는 경로).
// 이미 등록된 기기를 위해 해제도 같이 건다 — 앱 자산은 어차피 기기 안에 있어 오프라인은 무손실.
if ('serviceWorker' in navigator) {
  if (isNative()) {
    void navigator.serviceWorker.getRegistrations()
      .then((rs) => Promise.all(rs.map((r) => r.unregister())))
      .catch(() => undefined);
  } else if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
}
