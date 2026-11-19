// 판 원경 — 먹 농담 두 단(선 없는 면)과 살아 있는 것(해 · 새 · 연기 · 이파리). 렌더 전용, 시뮬은 읽기만 한다.
// 문법(docs/ART_DIRECTION.md · CLAUDE.md 불변 13): 밝은 바탕 · 먼지 톤 · 번짐과 그라데이션 없음. 면은 한 가지 색으로 평평하게,
// 옅을수록 멀다. 가운데 레인은 건물이 가리니 그림은 화면 폭 전체에 깔고 양옆 여백에서 읽히게 둔다.
// 두 단은 배경 캐시에 한 번 구워지고(assets.drawBackdropCached), 살아 있는 것만 매 프레임 그린다.

import { PALETTE, VIEW } from '../config';

type C = CanvasRenderingContext2D;
export type SceneTheme = 'europe' | 'asia' | 'eastasia' | 'modern';

/** 곱하기로 얹는 면 색 — 종이에 곱해 먼 단은 3%쯤, 가까운 단은 7%쯤 어둡다 */
export const SCENE_WASH = { far: '#F7F5F0', mid: '#EEEBE3', sun: '#F4ECDB', puff: '#E6E1D5', bird: '#8E8A80' } as const;

const THEMES: readonly SceneTheme[] = ['europe', 'asia', 'eastasia', 'modern'];
export function sceneTheme(key: string): SceneTheme | null {
  const t = key.replace(/^bg-/, '') as SceneTheme;
  return THEMES.includes(t) ? t : null;
}

/** 그림 전용 난수 — 테마마다 같은 풍경이 나오게 고정 값. 시뮬 난수(rngState)와 무관하다 */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 면 조각(모두 시계 방향 — 겹쳐도 구멍이 나지 않는다) ──
function box(c: C, x: number, top: number, w: number, base: number): void {
  // 옆 조각과 반 픽셀 겹친다 — 딱 맞닿으면 가장자리 다듬기가 이음선을 남긴다
  c.moveTo(x - 0.5, top); c.lineTo(x + w + 0.5, top); c.lineTo(x + w + 0.5, base); c.lineTo(x - 0.5, base); c.closePath();
}
function gable(c: C, x: number, top: number, w: number, rise: number): void {
  c.moveTo(x - 2, top); c.lineTo(x + w / 2, top - rise); c.lineTo(x + w + 2, top); c.closePath();
}
function mansard(c: C, x: number, top: number, w: number, rise: number): void {
  c.moveTo(x - 1, top); c.lineTo(x + 5, top - rise); c.lineTo(x + w - 5, top - rise); c.lineTo(x + w + 1, top); c.closePath();
}
function dome(c: C, cx: number, top: number, r: number): void {
  c.moveTo(cx - r, top); c.arc(cx, top, r, Math.PI, 0); c.closePath();
  box(c, cx - 2.5, top - r - 9, 5, top - r + 2);
}
/** 처마가 들린 지붕 한 겹 */
function eave(c: C, cx: number, y: number, half: number, rise: number): void {
  c.moveTo(cx - half - 7, y - 3);
  c.quadraticCurveTo(cx - half * 0.6, y, cx - half * 0.34, y - rise);
  c.lineTo(cx + half * 0.34, y - rise);
  c.quadraticCurveTo(cx + half * 0.6, y, cx + half + 7, y - 3);
  c.lineTo(cx + half, y + 3); c.lineTo(cx - half, y + 3); c.closePath();
}
function ridge(c: C, w: number, base: number, lo: number, hi: number, r: () => number): void {
  // 봉우리 점을 잡고 점 사이 가운데를 지나는 곡선으로 잇는다 — 꺾인 골이 생기지 않는다
  const n = 6;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= n; i++) { xs.push(-30 + ((w + 60) * i) / n); ys.push(base - (lo + (hi - lo) * r())); }
  c.moveTo(-30, base);
  c.lineTo(xs[0], ys[0]);
  for (let i = 1; i < n; i++) c.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[i + 1]) / 2, (ys[i] + ys[i + 1]) / 2);
  c.lineTo(xs[n], ys[n]);
  c.lineTo(w + 30, base); c.closePath();
}

function europe(c: C, w: number, h: number, far: boolean): void {
  const r = seeded(far ? 11 : 12);
  let x = -12;
  while (x < w + 10) {
    const bw = far ? 34 + r() * 28 : 26 + r() * 22;
    const bh = far ? 118 + r() * 54 : 60 + r() * 42;
    const top = h - bh;
    box(c, x, top, bw, h);
    if (r() < 0.55) mansard(c, x, top, bw, far ? 16 : 12); else gable(c, x, top, bw, far ? 20 : 15);
    const n = r() < 0.5 ? 1 : 2;
    for (let i = 0; i < n; i++) box(c, x + 6 + r() * (bw - 16), top - (far ? 26 : 20), 5, top);
    x += bw + (r() < 0.25 ? 6 : 0);
  }
  if (far) {
    // 종탑 하나 · 돔 하나 — 구역의 얼굴. 레인 밖(양옆 여백)에서도 꼭대기가 보이게 높이 세운다
    box(c, 22, h - 236, 20, h); gable(c, 22, h - 236, 20, 40);
    box(c, 286, h - 176, 50, h); box(c, 296, h - 190, 30, h - 176); dome(c, 311, h - 190, 15);
  }
}

function asia(c: C, w: number, h: number, far: boolean): void {
  const r = seeded(far ? 21 : 22);
  let x = -10;
  while (x < w + 10) {
    const bw = far ? 30 + r() * 26 : 24 + r() * 20;
    const bh = far ? 110 + r() * 96 : 58 + r() * 50;
    const top = h - bh;
    box(c, x, top, bw, h);
    if (r() < 0.4) box(c, x + 4, top - 8, bw - 8, top); // 옥상 턱
    if (r() < (far ? 0.4 : 0.25)) { // 물통: 다리 · 통 · 고깔
      const tx = x + 5 + r() * (bw - 18);
      box(c, tx + 1, top - 7, 1.6, top); box(c, tx + 8.4, top - 7, 1.6, top);
      box(c, tx, top - 19, 11, top - 7); gable(c, tx + 1, top - 19, 9, 6);
    } else if (r() < 0.3) box(c, x + bw * 0.5, top - 22, 1.4, top); // 안테나
    if (!far && r() < 0.5) { // 차양
      c.moveTo(x - 4, h - 30); c.lineTo(x + bw * 0.5, h - 38); c.lineTo(x + bw * 0.5, h - 30); c.closePath();
    }
    x += bw + (r() < 0.3 ? 5 : 0);
  }
}

function eastasia(c: C, w: number, h: number, far: boolean): void {
  const r = seeded(far ? 31 : 33);
  if (far) { ridge(c, w, h, 190, 300, r); return; }
  ridge(c, w, h, 84, 150, r);
  // 구층탑 실루엣 — 오른쪽 여백 쪽
  const cx = 322;
  let y = h - 96;
  for (let i = 0; i < 5; i++) {
    const half = 22 - i * 3.2;
    box(c, cx - half * 0.55, y - 20, half * 1.1, y + 3);
    eave(c, cx, y - 20, half, 5);
    y -= 24;
  }
  box(c, cx - 1, y - 16, 2, y + 6);
  // 기와집 지붕 둘 — 왼쪽 여백 쪽
  box(c, -6, h - 118, 52, h); eave(c, 20, h - 118, 30, 12);
  box(c, 4, h - 148, 30, h - 126); eave(c, 19, h - 148, 19, 9);
}

function modern(c: C, w: number, h: number, far: boolean): void {
  const r = seeded(far ? 41 : 42);
  let x = -8;
  while (x < w + 10) {
    const bw = far ? 26 + r() * 22 : 22 + r() * 24;
    const bh = far ? 150 + r() * 140 : 70 + r() * 70;
    const top = h - bh;
    box(c, x, top, bw, h);
    if (r() < 0.5) box(c, x + bw * 0.2, top - 14 - r() * 12, bw * 0.6, top); // 물러난 꼭대기
    if (far && r() < 0.3) box(c, x + bw * 0.5, top - 44, 1.4, top);           // 첨탑
    x += bw + (r() < 0.35 ? 7 : 1);
  }
  if (far) {
    // 타워크레인 — 가는 기둥 · 긴 팔 · 짧은 뒤 팔과 추 · 팔 끝에 늘어진 줄
    const mx = 338;
    const top = h - 296;
    box(c, mx, top - 12, 3.4, h);
    box(c, mx - 74, top, 74, top + 3);
    box(c, mx + 3.4, top, 20, top + 3);
    box(c, mx + 14, top + 3, 9, top + 12);
    c.moveTo(mx + 1.7, top - 12); c.lineTo(mx + 22, top); c.lineTo(mx + 20, top); c.closePath();
    c.moveTo(mx + 1.7, top - 12); c.lineTo(mx - 48, top); c.lineTo(mx - 51, top); c.closePath();
    box(c, mx - 60, top + 3, 1.2, top + 38);
    box(c, mx - 63, top + 38, 7, top + 43);
  }
}

const PAINT: Record<SceneTheme, (c: C, w: number, h: number, far: boolean) => void> = { europe, asia, eastasia, modern };

/** 배경 캐시에 먹 농담 두 단을 곱해 얹는다(w × h = 필드, 바닥이 땅). 한 번만 불린다 */
export function paintSceneTiers(c: C, key: string, w: number, h: number): void {
  const theme = sceneTheme(key);
  if (!theme) return;
  c.save();
  c.globalCompositeOperation = 'multiply';
  for (const far of [true, false]) {
    c.fillStyle = far ? SCENE_WASH.far : SCENE_WASH.mid;
    c.beginPath();
    PAINT[theme](c, w, h, far);
    c.fill();
  }
  c.restore();
}

// ── 살아 있는 것 ──
/** 해 자리 — 1막 진행도 p(0~1)를 따라 왼쪽에서 오른쪽으로 하루를 지난다. [x, y] 화면 좌표 */
export function sunAt(p: number): [number, number] {
  const t = Math.min(Math.max(p, 0), 1);
  return [52 + 256 * t, 290 - 170 * Math.sin(Math.PI * (0.12 + 0.76 * t))];
}

const FLOCK_PERIOD = 1500; // 새 떼가 25초에 한 번 지나간다
const FLOCK_CROSS = 620;
const FLOCK = [[0, 0], [-13, 7], [-25, -5], [-36, 11], [-50, 2]] as const;

function drawFlock(c: C, tick: number): void {
  const lap = Math.floor(tick / FLOCK_PERIOD);
  const t = (tick % FLOCK_PERIOD) / FLOCK_CROSS;
  if (t > 1) return;
  const dir = lap % 2 === 0 ? 1 : -1;
  const baseY = 128 + ((lap * 53) % 130);
  const headX = dir > 0 ? -10 + (VIEW.W + 70) * t : VIEW.W + 10 - (VIEW.W + 70) * t;
  c.strokeStyle = SCENE_WASH.bird;
  c.lineWidth = 1.3;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  for (let i = 0; i < FLOCK.length; i++) {
    const x = headX + FLOCK[i][0] * dir;
    const y = baseY + FLOCK[i][1] + Math.sin(tick * 0.03 + i) * 3;
    const flap = 1.2 + 2.6 * (0.5 + 0.5 * Math.sin(tick * 0.22 + i * 1.7));
    c.moveTo(x - 4.5, y - flap);
    c.lineTo(x, y);
    c.lineTo(x + 4.5, y - flap);
  }
  c.stroke();
}

/** 굴뚝 연기 — 납작한 면 셋이 비스듬히 오르며 커지고, 사라질 땐 줄어든다(알파로 지우지 않는다) */
function drawSmoke(c: C, tick: number, x0: number, y0: number, phase: number, dir: number): void {
  c.fillStyle = SCENE_WASH.puff;
  const LIFE = 320;
  for (let i = 0; i < 3; i++) {
    const a = ((tick + phase + i * (LIFE / 3)) % LIFE) / LIFE;
    const grow = a < 0.75 ? a / 0.75 : 1 - (a - 0.75) / 0.25;
    const rad = 2.5 + 7.5 * grow;
    if (rad < 0.8) continue;
    const x = x0 + dir * (a * 34 + Math.sin(a * 4 + i) * 3);
    const y = y0 - a * 58;
    c.beginPath();
    c.ellipse(x, y, rad * 1.5, rad, -0.25 * dir, 0, Math.PI * 2);
    c.fill();
  }
}

/** 흩날리는 이파리 — 짧은 먹 점 여섯이 비스듬히 내린다 */
function drawLeaves(c: C, tick: number): void {
  c.strokeStyle = SCENE_WASH.bird;
  c.lineWidth = 1.2;
  c.lineCap = 'round';
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const span = 700 + i * 90;
    const a = ((tick + i * 233) % span) / span;
    const x = ((i * 67 + 30) % VIEW.W) + 46 * a - 23 + Math.sin(a * 9 + i) * 7;
    const y = VIEW.FIELD_TOP + 20 + a * 430;
    const tilt = Math.sin(a * 14 + i * 2) * 2.2;
    c.moveTo(x - 2.4, y - tilt);
    c.lineTo(x + 2.4, y + tilt);
  }
  c.stroke();
}

export interface SceneLive { key: string; tick: number; p: number; night: boolean }

/**
 * 살아 있는 원경 — 배경 PNG 바로 위, 땅 · 건물보다 뒤. 배경과 같은 시차 변환 안에서 부른다.
 * 해는 1막 진행도 p를 따라 간다(판이 얼마나 지났는지가 하늘에 보인다).
 */
export function drawSceneLive(c: C, s: SceneLive): void {
  const theme = sceneTheme(s.key);
  if (!theme) return;
  c.save();
  if (!s.night) {
    const [sx, sy] = sunAt(s.p);
    c.globalCompositeOperation = 'multiply';
    c.fillStyle = SCENE_WASH.sun;
    c.beginPath();
    c.arc(sx, sy, 30, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = 'source-over';
  }
  const g = VIEW.GROUND_Y;
  // 연기는 양옆 여백에서 화면 안쪽으로 흐른다(가운데는 건물이 가린다)
  if (theme === 'europe') { drawSmoke(c, s.tick, 4, g - 122, 0, 1); drawSmoke(c, s.tick, 354, g - 118, 150, -1); }
  else if (theme === 'asia') { drawSmoke(c, s.tick, 8, g - 130, 40, 1); drawSmoke(c, s.tick, 350, g - 152, 190, -1); }
  else if (theme === 'eastasia') drawLeaves(c, s.tick);
  drawFlock(c, s.tick);
  c.restore();
}

// ── 부순 흔적 ──
/** 잔해 한 덩이를 쌓는 데 드는 층 수 · 한쪽에 쌓이는 덩이 수(레인 밖 여백 45px 안에 든다) */
export const HEAP = { FLOORS_PER_BLOCK: 10, PER_SIDE: 6, FILL: '#CFC9BC' } as const;
/** 한쪽 더미의 자리 [여백 안쪽 x, 땅에서 높이, 크기] — 아래 셋 · 가운데 둘 · 위 하나 */
const HEAP_SEAT = [[3, 0, 15], [27, 0, 14], [15, 0, 16], [9, 13, 14], [23, 12, 13], [16, 24, 13]] as const;

/** 이 판에서 부순 층 수만큼 양옆 여백에 잔해가 쌓인다 — 판이 얼마나 갔는지가 땅에 남는다. 월드 좌표(카메라 변환 안) */
export function drawRubbleHeaps(c: C, razedFloors: number, groundY: number): void {
  const blocks = Math.min(HEAP.PER_SIDE * 2, Math.floor(razedFloors / HEAP.FLOORS_PER_BLOCK));
  if (blocks <= 0) return;
  c.save();
  c.fillStyle = HEAP.FILL;
  c.strokeStyle = PALETTE.INK;
  c.lineWidth = 1.4;
  c.lineJoin = 'round';
  for (let i = 0; i < blocks; i++) {
    const right = i % 2 === 1;
    const [sx, up, size] = HEAP_SEAT[i >> 1];
    const cx = right ? VIEW.W - sx - size / 2 : sx + size / 2;
    const tilt = (((i * 37) % 9) - 4) * 0.05;
    c.save();
    c.translate(cx, groundY - up - size / 2);
    c.rotate(tilt);
    c.fillRect(-size / 2, -size / 2, size, size);
    c.strokeRect(-size / 2, -size / 2, size, size);
    c.restore();
  }
  c.restore();
}

