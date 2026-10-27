// 집행기: imagegen 부품 아틀라스 + 케이블/관절 애니메이션. 시뮬 상태는 읽기 전용.
import type { BossState } from '../core/types';
import { BOSS, VIEW, PALETTE } from '../config';
import { imageSize, img } from './assets';
import { flashK } from './screenfx';

// 생성 원본 1536×1024의 알파 실측 좌표. 파일은 이 원본을 축소해 내보낸 것(scripts/prepare-image-assets.mjs
// ATLAS_SCALE)이라 읽을 때 파일 크기 / 원본 크기 비율을 적용한다.
const ATLAS_SRC = { w: 1536, h: 1024 } as const;
export const EXECUTOR_PARTS = {
  body: [46, 149, 1444, 180],
  left: [333, 479, 214, 377],
  right: [989, 479, 214, 377],
} as const;

const clamp = (n: number): number => Math.max(0, Math.min(1, n));
const ease = (n: number): number => { const t = clamp(n); return t * t * (3 - 2 * t); };

// ── 피격 반응(렌더 전용 타이머) ───────────────────────────────────
// 230타 내내 몸이 무반응이던 것을 몸으로 받는다: 본체 지터 · 아이보리 얹기 · 10타마다 턱 덜컥 · 티어 균열선.
// renderer가 bossHit 이벤트를 받아 bossBodyHit()을, 매 그리기 끝에 stepBossFx()를 부른다.
const FX_HIT = 3;      // 지터 틱
const FX_FLASH = 2;    // 아이보리 얹는 틱
const FX_JAW = 6;      // 턱 덜컥 틱
const bossFx = { hit: 0, flash: 0, jaw: 0 };

/** 본체를 맞았다 — clunk면 이번 타에 턱이 한 번 덜컥 벌어진다(10타마다). */
export function bossBodyHit(clunk: boolean): void {
  bossFx.hit = FX_HIT;
  bossFx.flash = FX_FLASH;
  if (clunk) bossFx.jaw = FX_JAW;
}
export function stepBossFx(): void {
  if (bossFx.hit > 0) bossFx.hit -= 1;
  if (bossFx.flash > 0) bossFx.flash -= 1;
  if (bossFx.jaw > 0) bossFx.jaw -= 1;
}
export function resetBossFx(): void {
  bossFx.hit = 0; bossFx.flash = 0; bossFx.jaw = 0;
}

/** 준비 → 내려찍기 → 가드 반동을 같은 전투 시계로 그린다. 렌더 프레임 수와 무관. */
export function executorPose(b: BossState): { lift: number; open: number; tilt: number; split: number } {
  const t = b.stTick;
  switch (b.st) {
    case 'enter': return { lift: 0, open: t < BOSS.INTRO.RELEASE ? 0 : 0.25, tilt: 0, split: 0 };
    case 'telegraph': return { lift: -8 * ease(t / 18), open: 0.3 * ease(t / 18), tilt: 0, split: 0 };
    case 'descend': return { lift: -8 * (1 - clamp(t / BOSS.CHARGE.DESCEND)), open: 0.3, tilt: 0, split: 0 };
    case 'charging': {
      const duration = b.pattern === 'pbCharge' ? BOSS.PB_CHARGE.DASH : BOSS.CHARGE.DASH;
      const contact = duration / 2;
      const progress = clamp(t / contact);
      return { lift: -12 * (1 - progress * progress), open: 0.3 * (1 - progress), tilt: 0, split: 0 };
    }
    case 'stagger': return { lift: -12 * Math.sin(Math.PI * clamp(t / 24)), open: 0.22,
      tilt: Math.sin(t * 0.65) * 0.025 * Math.max(0, 1 - t / 36), split: 0 };
    case 'roar': return { lift: 0, open: 0.25, tilt: Math.sin(t * 0.8) * 0.012, split: 0 };
    case 'defeated': return { lift: 0, open: 0.15, tilt: 0.06 * ease(t / 60), split: 8 * ease(t / 90) };
    default: return { lift: Math.sin(t * 0.055) * 1.5, open: 0.06, tilt: 0, split: 0 };
  }
}

// 부품 캐시 — 아틀라스를 로드한 뒤 처음 그릴 때 부품마다 목적 크기의 2배로 한 번만 잘라 둔다.
// 매 프레임 아틀라스 전체를 대축소하지 않고 2배 부품을 1/2로만 줄여 그린다(floorSheetCache와 같은 패턴).
type PartKey = keyof typeof EXECUTOR_PARTS;
const PART_SS = 2;
const partCache = new Map<PartKey, HTMLCanvasElement>();
let cachedAtlas: ReturnType<typeof img> = null;

function partCanvas(atlas: NonNullable<ReturnType<typeof img>>, key: PartKey, w: number, h: number): HTMLCanvasElement | null {
  if (cachedAtlas !== atlas) { partCache.clear(); cachedAtlas = atlas; } // 재로드하면 새 이미지로 다시 만든다
  const hit = partCache.get(key);
  if (hit) return hit; // 부품마다 목적 크기는 하나뿐이다
  try {
    const size = imageSize(atlas);
    const kx = size.w / ATLAS_SRC.w, ky = size.h / ATLAS_SRC.h;
    const [sx, sy, sw, sh] = EXECUTOR_PARTS[key];
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * PART_SS); cv.height = Math.round(h * PART_SS);
    const c = cv.getContext('2d');
    if (!c) return null;
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(atlas, sx * kx, sy * ky, sw * kx, sh * ky, 0, 0, cv.width, cv.height);
    partCache.set(key, cv);
    return cv;
  } catch { return null; }
}

// 부품 캔버스 → 아이보리 실루엣(맞은 순간 몸 위에 얹는다). 부품 캔버스가 새로 만들어지면(아틀라스 재로드) 자연히 새로 굽는다.
const ivoryCache = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
function ivoryOf(cv: HTMLCanvasElement): HTMLCanvasElement | null {
  const hit = ivoryCache.get(cv);
  if (hit) return hit;
  try {
    const t = document.createElement('canvas');
    t.width = cv.width; t.height = cv.height;
    const c = t.getContext('2d');
    if (!c) return null;
    c.drawImage(cv, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = PALETTE.BG;
    c.fillRect(0, 0, t.width, t.height);
    ivoryCache.set(cv, t);
    return t;
  } catch { return null; }
}

/** 본체 위에 아이보리 반투명을 얹는다(이미지가 없을 땐 같은 사각형). */
function drawBodyIvory(ctx: CanvasRenderingContext2D, bodyTop: number): void {
  const atlas = img('boss');
  const base = atlas ? partCanvas(atlas, 'body', BOSS.BODY_W, BOSS.BODY_H) : null;
  const tint = base ? ivoryOf(base) : null;
  ctx.save();
  ctx.globalAlpha = 0.55 * flashK() * (bossFx.flash / FX_FLASH);
  if (tint) ctx.drawImage(tint, -BOSS.BODY_W / 2, bodyTop, BOSS.BODY_W, BOSS.BODY_H);
  else { ctx.fillStyle = PALETTE.BG; ctx.fillRect(-BOSS.BODY_W / 2, bodyTop, BOSS.BODY_W, BOSS.BODY_H); }
  ctx.restore();
}

/** 티어 경계를 넘을 때마다 본체에 균열선이 늘어난다(코드로 긋는 선 그림). */
const CRACKS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[-52, 0], [-46, 11], [-55, 19], [-47, 31], [-51, 44]],
  [[66, 0], [60, 9], [70, 20], [61, 30], [67, 44]],
];
const CRACK_BRANCH: ReadonlyArray<readonly [number, number]> = [[70, 20], [82, 26], [88, 24]];
function drawCracks(ctx: CanvasRenderingContext2D, tier: number, bodyTop: number): void {
  if (tier < 1) return;
  ctx.save();
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 1.3;
  ctx.globalAlpha = 0.85;
  for (let i = 0; i < Math.min(tier, CRACKS.length); i++) {
    ctx.beginPath();
    CRACKS[i].forEach(([x, y], k) => (k === 0 ? ctx.moveTo(x, bodyTop + y) : ctx.lineTo(x, bodyTop + y)));
    if (i === 1) CRACK_BRANCH.forEach(([x, y], k) => (k === 0 ? ctx.moveTo(x, bodyTop + y) : ctx.lineTo(x, bodyTop + y)));
    ctx.stroke();
  }
  ctx.restore();
}

function part(ctx: CanvasRenderingContext2D, key: PartKey,
  x: number, y: number, w: number, h: number): void {
  const atlas = img('boss');
  const cv = atlas ? partCanvas(atlas, key, w, h) : null;
  if (cv) {
    ctx.drawImage(cv, x, y, w, h);
    return;
  }
  // 이미지가 없어도 같은 실루엣을 그린다.
  ctx.fillStyle = '#AEB0B2';
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 1;
  if (key === 'body') {
    ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
    ctx.beginPath();
    for (const q of [0.29, 0.71]) { ctx.moveTo(x + w * q, y); ctx.lineTo(x + w * q, y + h); }
    ctx.stroke();
  } else {
    ctx.save(); ctx.translate(x + (key === 'right' ? w : 0), y);
    if (key === 'right') ctx.scale(-1, 1);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w * 0.3, 0);
    ctx.lineTo(w * 0.3, h * 0.8); ctx.lineTo(w, h * 0.8);
    ctx.lineTo(w * 0.8, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

function drawJaw(ctx: CanvasRenderingContext2D, side: -1 | 1, open: number, dead: boolean, tick: number): void {
  ctx.save();
  const droop = dead && side === 1 ? ease(tick / 65) : 0;
  const split = dead ? 8 * ease(tick / 90) : 0;
  ctx.translate(side * (BOSS.JAW_X + split), BOSS.BODY_BOTTOM - 2 + droop * 8);
  ctx.rotate(-side * open + droop * 0.45);
  // 생성한 힌지 중심을 관절 원점에 맞춘다.
  part(ctx, side === -1 ? 'left' : 'right', side === -1 ? -5 : 5 - BOSS.JAW_W,
    -5, BOSS.JAW_W, BOSS.JAW_H);
  ctx.restore();
}

/** 입장 연출에서 물고 온 층의 윗변 y(화면 좌표). 부서지는 틱의 파편 위치에도 쓴다. */
export function introFloorTop(b: BossState, groundY: number): number {
  const dt = Math.max(0, b.stTick - BOSS.INTRO.RELEASE);
  return groundY - b.y + BOSS.BODY_BOTTOM + 8 + dt * dt * 0.12;
}

function drawIntroFloor(ctx: CanvasRenderingContext2D, b: BossState, cy: number): void {
  if (b.st !== 'enter' || b.stTick >= BOSS.INTRO.CLEAR) return;
  const t = b.stTick;
  const dt = Math.max(0, t - BOSS.INTRO.RELEASE);
  // 물고 온 층은 등장 소품이다. 피격 판정과 추가 콤보는 발생시키지 않는다.
  const y = cy + BOSS.BODY_BOTTOM + 8 + dt * dt * 0.12;
  const broken = t >= BOSS.INTRO.BREAK;
  const crumble = clamp((t - BOSS.INTRO.BREAK) / (BOSS.INTRO.CLEAR - BOSS.INTRO.BREAK));
  const width = VIEW.LANE_W;
  ctx.save();
  ctx.globalAlpha = broken ? 1 - crumble : 1;
  for (let i = 0; i < 3; i++) {
    const x = VIEW.W / 2 - width / 2 + width * i / 3;
    ctx.save();
    if (broken) {
      ctx.translate((i - 1) * crumble * 100, -crumble * 80);
      ctx.translate(x + width / 6, y + 16);
      ctx.rotate((i - 1) * crumble * 0.45);
      ctx.translate(-x - width / 6, -y - 16);
    }
    ctx.fillStyle = '#C0BEB8'; ctx.strokeStyle = '#4A4740'; ctx.lineWidth = 1;
    ctx.fillRect(x, y, width / 3, VIEW.FLOOR_H); ctx.strokeRect(x, y, width / 3, VIEW.FLOOR_H);
    for (let j = 0; j < 2; j++) ctx.strokeRect(x + 12 + j * 28, y + 12, 20, 32);
    ctx.restore();
  }
  ctx.restore();
}

export function drawExecutor(ctx: CanvasRenderingContext2D, b: BossState, groundY: number): void {
  const pose = executorPose(b);
  const x = VIEW.W / 2;
  const cy = groundY - b.y + pose.lift;
  const bodyTop = BOSS.BODY_BOTTOM - BOSS.BODY_H;
  const dead = b.st === 'defeated';
  const cue = b.st === 'telegraph' || b.st === 'descend';
  // 맞은 순간 몸이 가로로 떤다(2px, 3틱에 걸쳐 잦아든다). 케이블 끝도 같이 간다.
  const jx = bossFx.hit > 0 ? (bossFx.hit % 2 === 1 ? 1 : -1) * 2 * (bossFx.hit / FX_HIT) : 0;
  // 10타마다 턱이 덜컥 — 맞는 순간 확 벌어지고 6틱에 걸쳐 닫힌다
  const clunk = bossFx.jaw > 0 ? 0.22 * (bossFx.jaw / FX_JAW) : 0;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // 카메라가 위로 움직여도 케이블의 시작점은 필드 밖에 남는다.
  ctx.strokeStyle = PALETTE.INK; ctx.lineWidth = 1;
  for (const side of [-1, 1]) {
    const ax = side * (BOSS.CABLE_X + pose.split);
    const ay = bodyTop + (side === 1 ? pose.split * 0.6 : 0);
    const attachmentX = jx + x + ax * Math.cos(pose.tilt) - ay * Math.sin(pose.tilt);
    const attachmentY = cy + ax * Math.sin(pose.tilt) + ay * Math.cos(pose.tilt);
    ctx.beginPath(); ctx.moveTo(x + side * BOSS.CABLE_X, -VIEW.H);
    if (dead) ctx.quadraticCurveTo(x + side * (BOSS.CABLE_X + 14), attachmentY - 40,
      attachmentX, attachmentY);
    else ctx.lineTo(attachmentX, attachmentY);
    ctx.stroke();
  }
  drawIntroFloor(ctx, b, cy);
  ctx.translate(x + jx, cy); ctx.rotate(pose.tilt);
  drawJaw(ctx, -1, pose.open + clunk, dead, b.stTick);
  drawJaw(ctx, 1, pose.open + clunk, dead, b.stTick);
  if (dead) {
    // 원본을 좌우로 클리핑해 본체 이음새를 벌린다.
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(side * pose.split, Math.abs(pose.split) * (side === 1 ? 0.6 : 0));
      const seam = BOSS.BODY_W * 0.212;
      ctx.beginPath(); ctx.rect(side === -1 ? -BOSS.BODY_W / 2 - 1 : seam, bodyTop - 1,
        side === -1 ? BOSS.BODY_W / 2 + seam + 1 : BOSS.BODY_W / 2 - seam + 1,
        BOSS.BODY_H + 2); ctx.clip();
      part(ctx, 'body', -BOSS.BODY_W / 2, bodyTop, BOSS.BODY_W, BOSS.BODY_H); ctx.restore();
    }
  } else {
    part(ctx, 'body', -BOSS.BODY_W / 2, bodyTop, BOSS.BODY_W, BOSS.BODY_H);
    if (bossFx.flash > 0 && flashK() > 0) drawBodyIvory(ctx, bodyTop);
    drawCracks(ctx, b.tier, bodyTop);
  }

  // 원본의 빈 소켓 위에 실제 상태등. 격파 후에는 노랑이 전혀 없다.
  const lampY = bodyTop + BOSS.BODY_H / 2;
  const lampX = -pose.split;
  ctx.fillStyle = '#AEB0B2'; ctx.beginPath(); ctx.arc(lampX, lampY, 5.8, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = PALETTE.INK; ctx.lineWidth = 1;
  ctx.fillStyle = dead || (cue && Math.floor(b.stTick / 5) % 2 === 0) ? '#AEB0B2' : PALETTE.YELLOW;
  ctx.beginPath(); ctx.arc(lampX, lampY, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (b.hittable && !dead) {
    ctx.strokeStyle = PALETTE.INK;
    ctx.beginPath(); ctx.moveTo(-20, BOSS.BODY_BOTTOM + 2); ctx.lineTo(20, BOSS.BODY_BOTTOM + 2); ctx.stroke();
  }
  if (b.st === 'stagger' && b.stTick < 14) {
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * 124, 0); ctx.lineTo(side * 130, -5);
      ctx.moveTo(side * 124, 9); ctx.lineTo(side * 133, 9); ctx.stroke();
    }
  }
  ctx.restore();
}
