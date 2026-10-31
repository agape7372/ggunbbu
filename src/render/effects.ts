// 타격감 파티클 풀 — JUICE.*.particles 를 소비해 프로시저럴 점/선/먼지를 뿌린다.
// 고정 풀 JUICE_SYS.PARTICLE_POOL. 초과 시 링 커서로 오래된 슬롯 재활용.
// core rngState와 무관한 렌더 LCG. DOM import 없음 — 에셋은 보급 상자 그림('crate') 하나만 시도하고,
// 층 조각 캔버스는 document가 있을 때만 만든다(테스트는 회색 파편으로 대신한다).
// 히트스톱 중에도 updateEffects는 호출되어야 한다(정지감 속 운동감).
//
// ★좌표 계약(BL-09): 파티클·상자는 **월드 좌표**(지면 y = VIEW.GROUND_Y 기준 화면 좌표, 카메라 미적용)로 저장하고
// drawEffects(ctx, cam)가 그릴 때 한 번 cam을 더한다. 스폰 시점 카메라를 구워 넣으면 점프 정점에서 터진 파편이
// 월드에 안 붙고 화면에 붙어 따라온다. 필살 중앙 폭발처럼 화면에 붙어야 하는 것만 `fixed`(화면 좌표).

import type { FallingStack, GameState, ItemId, JuiceEvent, WeaponId } from '../core/types';
import { DEBRIS, JUICE, JUICE_SYS, PALETTE, TICK, VIEW } from '../config';
import { drawAsset } from './assets';
import { bladeReact, resetBladeFx, tierK, updateBladeFx } from './bladeFx';
import { stackScale } from './feel';
import { enso, inkBlot, inkDrop, inkSplat, popScale } from './ink';
import { greatLook } from './sprites';

/**
 * chip = 잉크 외곽선 두른 파편(안전모 조각) · frag = 층 그림을 그대로 든 조각 · puff = 만화 먼지 구름 · star = 타격 별
 * — 먹 한 획(ink.ts): ink = 먹 방울 · splat = 땅에 번진 먹 · blot = 친 자리에 터진 먹 · enso = 붓으로 그은 원
 */
type Style = 'spark' | 'shard' | 'chip' | 'dust' | 'cream' | 'ring' | 'pollen' | 'frag' | 'puff' | 'star'
  | 'ink' | 'splat' | 'blot' | 'enso';

/** 그리는 순서 — 조각·파편·엔소가 뒤, 먼지 구름이 가운데, 불꽃·별·먹 방울이 맨 앞 */
const LAYER: Record<Style, number> = {
  frag: 0, shard: 0, chip: 0, cream: 0, enso: 0, splat: 0, blot: 0, dust: 1, puff: 1,
  spark: 2, ring: 2, star: 2, pollen: 2, ink: 2,
};
/**
 * 층 조각·먼지 구름·먹 터짐 — 건물과 같은 층이라 졸라맨을 가리지 않게 플레이어보다 먼저 그린다(drawBackEffects).
 * 먹 터짐은 맞은 건물 밑면에 튄 먹이다(머리 위에서 졸라맨을 덮지 않는다). 화면 고정으로는 안 뿌린다.
 */
const BACK: ReadonlySet<Style> = new Set<Style>(['frag', 'puff', 'blot']);
/** 제자리에서 모양만 바뀌는 것 — 적분하지 않는다 */
const STILL: ReadonlySet<Style> = new Set<Style>(['ring', 'enso', 'blot', 'splat']);

interface Particle {
  alive: boolean;
  style: Style;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  maxLife: number;
  size: number;
  rot: number;
  spin: number;
  color: string;
  bounce: number;
  /** true면 화면 좌표(카메라를 안 탄다) */
  fixed: boolean;
  /** 초당 속도 감쇠(0 = 없음) — 먼지 구름이 퍼지다 선다 */
  drag: number;
  /** puff·star 모양을 정하는 수 */
  seed: number;
  /** frag: 구운 조각 캔버스(FRAG_SS배) · 그 안의 기준점(무게중심) · 논리 크기 — enso: w = 획 굵기 · h = 세로 배율 */
  img: HTMLCanvasElement | null;
  ax: number;
  ay: number;
  w: number;
  h: number;
  /** 둘째 색 — enso: 베는 순간(앞 12%)만 이 색으로 그린다(노랑 = 베는 순간) · ink: 땅에 닿으면 번진다(빈 문자열 = 안 번짐) */
  c2: string;
}

const POOL = JUICE_SYS.PARTICLE_POOL;
const DUST = ['#B9B3A6', '#948E82', '#6E695F'] as const;
const HAT_WHITE = '#FFFFFF'; // 안전모 — sprites.ts hardHat과 같은 흰색
const PUFF_FILL = '#D9D2C3';  // 만화 먼지 구름 면 — 하늘(아이보리)보다 어둡고 잉크보다 한참 밝다
const FLASH_WHITE = '#FFFFFF'; // 타격 별 속 — 아이보리(PALETTE.WHITE) 위에서도 튀는 순백

function blank(): Particle {
  return {
    alive: false,
    style: 'spark',
    x: 0, y: 0, vx: 0, vy: 0, g: 0,
    life: 0, maxLife: 1,
    size: 1, rot: 0, spin: 0,
    color: PALETTE.INK,
    bounce: 0,
    fixed: false,
    drag: 0,
    seed: 0,
    img: null, ax: 0, ay: 0, w: 0, h: 0,
    c2: '',
  };
}

const pool: Particle[] = Array.from({ length: POOL }, blank);
let allocAt = 0;
let live = 0;
let fxSeed = 1;
/** 지금 뿌리는 파티클이 화면 고정인가 — fill()이 읽는다. spawnScreen이 잠깐 켠다. */
let spawnFixed = false;

// 08-30(P1-3): blade 코스메틱 — 참격 스파크 색
let slashColor: string = PALETTE.YELLOW;
export function setSlashColor(c: string): void {
  slashColor = c;
}

function n01(): number {
  fxSeed = (Math.imul(fxSeed, 1103515245) + 12345) & 0x7fffffff;
  return (fxSeed >>> 8) / 0x7fffff;
}

function signed(): number {
  return n01() * 2 - 1;
}

function take(): Particle {
  for (let k = 0; k < POOL; k++) {
    const i = (allocAt + k) % POOL;
    if (!pool[i].alive) {
      allocAt = (i + 1) % POOL;
      pool[i].alive = true;
      live += 1;
      return pool[i];
    }
  }
  const p = pool[allocAt];
  allocAt = (allocAt + 1) % POOL;
  return p;
}

function matDust(mat?: string): string {
  if (mat === 'butter') return PALETTE.YELLOW;
  if (mat === 'hard' || mat === 'cathedral' || mat === 'penthouse') return DUST[2];
  if (mat === 'mid' || mat === 'lobby' || mat === 'office') return DUST[1];
  return DUST[n01() * 3 | 0];
}

function fill(
  style: Style,
  x: number, y: number,
  vx: number, vy: number, g: number,
  life: number, size: number,
  color: string,
  extra?: { rot?: number; spin?: number; bounce?: number; drag?: number; seed?: number; c2?: string },
): Particle {
  const p = take();
  if (p.img) releaseFrag(p); // 풀이 넘쳐 살아 있던 조각 칸을 덮을 때 — 캔버스를 먼저 돌려받는다
  p.style = style;
  p.x = x;
  p.y = y;
  p.vx = vx;
  p.vy = vy;
  p.g = g;
  p.life = life;
  p.maxLife = life;
  p.size = size;
  p.rot = extra?.rot ?? 0;
  p.spin = extra?.spin ?? 0;
  p.color = color;
  p.bounce = extra?.bounce ?? 0;
  p.fixed = spawnFixed;
  p.drag = extra?.drag ?? 0;
  p.seed = extra?.seed ?? 0;
  p.c2 = extra?.c2 ?? '';
  return p;
}

// ── 층 조각 — 층 그림을 칸으로 잘라 조각마다 따로 구워 둔다(매 프레임 클립하지 않게). 죽으면 캔버스를 돌려받는다. ──
const FRAG_SS = 2;
const FRAG_CANVAS_MAX = 48;
const fragFree: HTMLCanvasElement[] = [];
let fragMade = 0;

function borrowFragCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  let cv = fragFree.pop();
  if (!cv) {
    if (fragMade >= FRAG_CANVAS_MAX) return null;
    cv = document.createElement('canvas');
    fragMade += 1;
  }
  // 커지기만 한다 — 다시 빌릴 때마다 크기를 바꾸면 그때마다 메모리를 새로 잡는다
  const W = Math.ceil(w * FRAG_SS);
  const H = Math.ceil(h * FRAG_SS);
  if (cv.width < W) cv.width = W;
  if (cv.height < H) cv.height = H;
  return cv;
}

function releaseFrag(p: Particle): void {
  if (p.img) fragFree.push(p.img);
  p.img = null;
}

interface Baked { cv: HTMLCanvasElement; ax: number; ay: number; w: number; h: number }

/** 다각형 하나(층 안 좌표)를 층 그림째 잘라 굽는다 — 잉크 외곽선까지. 캔버스가 바닥나면 null. */
function bakeFrag(tile: HTMLCanvasElement, tw: number, th: number, pts: readonly number[]): Baked | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i += 2) {
    minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]);
    minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1]);
    cx += pts[i]; cy += pts[i + 1];
  }
  cx /= pts.length / 2;
  cy /= pts.length / 2;
  const pad = 2;
  const w = maxX - minX + pad * 2;
  const h = maxY - minY + pad * 2;
  const cv = borrowFragCanvas(w, h);
  if (!cv) return null;
  const c = cv.getContext('2d');
  if (!c) { fragFree.push(cv); return null; }
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, Math.ceil(w * FRAG_SS), Math.ceil(h * FRAG_SS));
  c.setTransform(FRAG_SS, 0, 0, FRAG_SS, (pad - minX) * FRAG_SS, (pad - minY) * FRAG_SS);
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  c.save();
  c.clip();
  c.imageSmoothingEnabled = true;
  c.drawImage(tile, 0, 0, tw, th);
  c.restore();
  c.lineJoin = 'round';
  c.strokeStyle = PALETTE.INK;
  c.lineWidth = 1.6;
  c.stroke();
  return { cv, ax: cx - minX + pad, ay: cy - minY + pad, w, h };
}

/**
 * 층 붕괴 — 그 층 그림을 COLS×ROWS 칸(일부는 대각선으로 한 번 더)으로 잘라 제자리에서 터뜨린다.
 * (x0, y0) = 층 왼쪽 위(월드), w·h = 그려지던 크기. 그림이 없거나(DOM 없음) 캔버스가 바닥나면 회색 파편으로 대신한다.
 * radial = 필살 해체(한가운데서 사방으로), 아니면 아래에서 벤 층(위·옆으로 튀었다 떨어진다).
 */
export function spawnFloorShatter(tile: HTMLCanvasElement | undefined, x0: number, y0: number, w: number, h: number,
  power = 1, radial = false, cols: number = w < VIEW.LANE_W * 0.5 ? 2 : JUICE_SYS.FRAG_COLS,
  rows: number = JUICE_SYS.FRAG_ROWS): void {
  // 격자 점 — 안쪽 점은 x·y 둘 다, 가장자리 점은 가장자리를 따라서만 흔든다(조각을 다시 맞추면 층이 된다)
  const gx: number[] = [];
  const gy: number[] = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      gx.push((c / cols) * w + (c > 0 && c < cols ? signed() * 0.2 * (w / cols) : 0));
      gy.push((r / rows) * h + (r > 0 && r < rows ? signed() * 0.25 * (h / rows) : 0));
    }
  }
  const at = (c: number, r: number): number => r * (cols + 1) + c;
  const pt = (i: number): [number, number] => [gx[i], gy[i]];
  const polys: Array<{ pts: number[]; row: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = pt(at(c, r)), b = pt(at(c + 1, r)), d = pt(at(c + 1, r + 1)), e = pt(at(c, r + 1));
      const cut = n01();
      if (cut < 0.4) polys.push({ pts: [...a, ...b, ...d, ...e], row: r });
      else if (cut < 0.7) {
        polys.push({ pts: [...a, ...b, ...d], row: r });
        polys.push({ pts: [...a, ...d, ...e], row: r });
      } else {
        polys.push({ pts: [...a, ...b, ...e], row: r });
        polys.push({ pts: [...b, ...d, ...e], row: r });
      }
    }
  }
  for (const { pts, row } of polys) {
    let cx = 0, cy = 0;
    for (let i = 0; i < pts.length; i += 2) { cx += pts[i]; cy += pts[i + 1]; }
    cx /= pts.length / 2;
    cy /= pts.length / 2;
    const dx = (cx - w / 2) / (w / 2); // -1(왼쪽) … 1(오른쪽)
    const dy = (cy - h / 2) / (h / 2);
    let vx: number;
    let vy: number;
    if (radial) {
      vx = dx * (260 + n01() * 260) * power + signed() * 60;
      vy = dy * (120 + n01() * 140) * power - (160 + n01() * 200);
    } else { // 바깥 조각일수록 옆으로 멀리, 아랫줄이 더 높이 — 층이 제자리에서 흘러내리지 않고 '터진다'
      vx = dx * (240 + n01() * 260) * power + signed() * 70;
      vy = -(220 + n01() * 300) * (row === rows - 1 ? 1.1 : 0.85) * power;
    }
    const baked = tile ? bakeFrag(tile, w, h, pts) : null;
    if (!baked) {
      fill('shard', x0 + cx, y0 + cy, vx, vy, 980, 0.5 + n01() * 0.4, 4 + n01() * 4, matDust(),
        { rot: signed() * Math.PI, spin: signed() * 10 });
      continue;
    }
    const p = fill('frag', x0 + cx, y0 + cy, vx, vy, JUICE_SYS.FRAG_G,
      JUICE_SYS.FRAG_LIFE * (0.8 + n01() * 0.4), Math.max(baked.w, baked.h) * 0.25, PALETTE.INK,
      { spin: signed() * 5 + vx * 0.02, bounce: 1 });
    p.img = baked.cv;
    p.ax = baked.ax;
    p.ay = baked.ay;
    p.w = baked.w;
    p.h = baked.h;
  }
}

/** 만화 먼지 구름 — 잉크 외곽선을 두른 납작한 구름. 가운데서 바깥으로 밀려나며 부풀었다가 마지막에 확 줄어 사라진다. */
function puffs(x: number, y: number, n: number, spreadX: number, size: number, out: number, life = 0.6): void {
  for (let i = 0; i < n; i++) {
    const ox = n === 1 ? signed() * spreadX : (i / (n - 1) * 2 - 1) * spreadX + signed() * spreadX * 0.15;
    const dir = ox < 0 ? -1 : 1;
    fill('puff', x + ox, y + signed() * 4,
      dir * out * (0.5 + n01() * 0.7), -(10 + n01() * 30), -30,
      life * (0.85 + n01() * 0.5), size * (0.8 + n01() * 0.4), PUFF_FILL,
      { drag: 2.6, seed: n01() * 1000 });
  }
}

/** 타격 별 — 노랑 별 + 흰 속 + 잉크 외곽. 몇 프레임만 튀었다 사라진다. */
function star(x: number, y: number, r: number, life: number): void {
  fill('star', x, y, 0, 0, 0, life, r, PALETTE.YELLOW, { rot: n01() * Math.PI, seed: n01() * 1000 });
}

// ── 먹 한 획 — 먹 방울 · 먹 터짐 · 엔소(모양은 ink.ts). 옅어지지 않고 줄고 마른다 ──
// 무게 위계: 타격(작은 먹 터짐 · 방울 몇) < 층 붕괴·가드·피격(땅에 눕는 엔소 · 번지는 방울) < 완파·필살·격파(겹 엔소 · 먹 왕관).
// 노랑은 베는 순간만 — 엔소의 노랑 획은 앞 12%뿐이고 곧 먹으로 바뀐다.

/** 먹 방울 n개 — a0~a1 방향, s0~s1 속도. lands = 땅에 닿으면 번진다(큰 순간만 — 연타마다 땅이 얼룩지면 지저분하다) */
function drops(x: number, y: number, n: number, a0: number, a1: number, s0: number, s1: number, r: number, life: number, lands = false): void {
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * n01();
    const sp = s0 + (s1 - s0) * n01();
    fill('ink', x + signed() * 4, y + signed() * 3, Math.cos(a) * sp, Math.sin(a) * sp, 1500,
      life * (0.75 + n01() * 0.5), r * (0.55 + n01() * 0.75), PALETTE.INK, { drag: 0.8, c2: lands ? PALETTE.INK : '' });
  }
}

/** 친 자리에 터진 먹 — 맞은 밑면에 묻는다(BACK, 졸라맨 뒤) */
function blot(x: number, y: number, R: number, life: number): void {
  fill('blot', x, y, 0, 0, 0, life, R, PALETTE.INK, { seed: n01() * 1000 });
}

/** 흰 별 「깡」 — 먹 테 두른 흰 타격 별(맨 앞). 막아 낸 순간 · 안전모가 깨진 순간 — 노랑 별(벤 순간)과 짝 */
function clang(x: number, y: number, r: number, life: number): void {
  fill('star', x, y, 0, 0, 0, life, r, FLASH_WHITE, { rot: n01() * Math.PI, seed: n01() * 1000 });
}

/** 엔소 충격파 — r0에서 grow만큼 퍼지며 붓이 한 바퀴를 긋고 시작점부터 마른다. w = 굵기 · flat = 세로 배율 · core = 베는 순간 색 */
function ensoAt(x: number, y: number, r0: number, grow: number, life: number, w: number, flat = 1, core = ''): void {
  const p = fill('enso', x, y, 0, 0, grow, life, r0, PALETTE.INK, { rot: n01() * Math.PI * 2, spin: signed() * 0.8, seed: n01() * 1000, c2: core });
  p.w = w;
  p.h = flat;
}

/** 타격 — 맞은 밑면에 작은 먹 터짐, 방울이 위로 튄다. 콤보 단(k)이 오르면 방울이 늘고 100부터 작은 엔소가 휙 */
function inkHit(x: number, y: number, k: number): void {
  blot(x + signed() * 6, y + 2, 4.5 + 2 * k, 0.12); // 연타라 작고 짧게 — 머리 위가 늘 시커멓지 않게
  drops(x, y, Math.round(2 + 2 * k), -Math.PI / 2 - 1.1, -Math.PI / 2 + 1.1, 180, 360 + 60 * k, 2.4, 0.3);
  if (k >= 1.5) ensoAt(x, y - 4, 8, 22 + 10 * k, 0.2, 3.5);
}

/** 층 붕괴 — 큰 먹 터짐 · 땅에 떨어져 번지는 방울 · 층 밑면을 따라 눕는 엔소 */
function inkCollapse(x: number, y: number, k: number): void {
  blot(x + signed() * 8, y + 2, 12 + 2 * k, 0.2);
  drops(x, y, Math.round(5 + 3 * k), -Math.PI / 2 - 1.35, -Math.PI / 2 + 1.35, 240, 520, 3, 0.65, true);
  ensoAt(x, y + 2, 20, 110 + 20 * k, 0.32, 6, 0.3);
}

/** 가드 — 막힌 자리에 흰 별 · 밑면을 따라 좌우로 쳐내는 굵은 획 · 눕는 엔소 · 옆으로 튀는 방울 */
function parry(x: number, y: number, air: boolean): void {
  const k = air ? 1.2 : 1;
  clang(x, y, 15 * k, 0.12);
  ensoAt(x, y, 16, 96 * k, 0.3, 7 * k, 0.28);
  for (const d of [-1, 1]) {
    fill('spark', x + d * 12, y + 1, d * 620 * k, -24, 0, 0.07, 20, PALETTE.INK); // size > 16 → 굵은 획 · 옅어지기 전에 빠진다
    drops(x + d * 8, y, 2, d > 0 ? -0.9 : Math.PI + 0.15, d > 0 ? -0.15 : Math.PI + 0.9, 200, 380, 2.4, 0.4);
  }
}

/** 피격·깔림 — 발밑에 눕는 큰 엔소 · 양옆으로 밀려 나오는 먼지 구름 · 번지는 방울 몇 */
function crush(x: number, footY: number): void {
  ensoAt(x, footY - 2, 26, 120, 0.36, 9, 0.22);
  puffs(x, footY - 6, 4, VIEW.LANE_W * 0.42, 12, 210, 0.5);
  drops(x, footY - 10, 4, -Math.PI + 0.2, -0.2, 160, 340, 2.6, 0.45, true);
}

function sparks(x: number, y: number, n: number, color: string, spread: number, up: number): void {
  for (let i = 0; i < n; i++) {
    fill(
      'spark',
      x + signed() * 8, y + signed() * 6,
      signed() * spread, -up - n01() * up,
      40,
      0.10 + n01() * 0.12,
      3 + n01() * 5,
      i % 3 === 0 ? PALETTE.YELLOW : color,
    );
  }
}

function shards(
  x: number, y: number, n: number, mat: string | undefined, amp: number,
  color?: string, style: Style = 'shard',
): void {
  for (let i = 0; i < n; i++) {
    fill(
      style,
      x + signed() * 14 * amp, y + signed() * 8,
      signed() * 160 * amp, -70 - n01() * 200 * amp,
      980,
      0.35 + n01() * 0.40,
      2.5 + n01() * 4 * amp,
      color ?? matDust(mat),
      { rot: signed() * Math.PI, spin: signed() * 10 },
    );
  }
}

/** 빠루: 위로 길게 튀는 가는 줄 불꽃 (size ≤16 → 가는 선) */
function longSparks(x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    fill(
      'spark',
      x + signed() * 6, y,
      signed() * 50, -380 - n01() * 220,
      700,
      0.20 + n01() * 0.10,
      10 + n01() * 5,
      i % 3 === 0 ? PALETTE.YELLOW : PALETTE.INK,
    );
  }
}

/** 그라인더: 앞쪽 위로 부채꼴 작은 불꽃 다발 — 참격의 연장이라 참격 색 */
function fanSparks(x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const u = n <= 1 ? 0.5 : i / (n - 1);
    const ang = -0.15 * Math.PI - u * 0.7 * Math.PI + signed() * 0.06;
    const spd = 220 + n01() * 180;
    fill(
      'spark',
      x + 6, y,
      Math.cos(ang) * spd, Math.sin(ang) * spd,
      650,
      0.16 + n01() * 0.14,
      2 + n01() * 3,
      i % 3 === 2 ? PALETTE.INK : slashColor,
    );
  }
}

/** 무기별 타격 파편. 개수는 JUICE particles(n)의 ±50% 안. */
function weaponBurst(w: WeaponId, kind: 'hit' | 'floorCollapse', x: number, y: number, footY: number, n: number, mat?: string): void {
  const collapse = kind === 'floorCollapse';
  if (greatLook(w)) {
    // 대검 — 칼마다 파편은 bladeFx. 여기선 무너지는 층의 재질 조각만
    if (collapse) shards(x, y, n, mat, 1);
    return;
  }
  switch (w) {
    case 'hammer': {
      // 먼지 많고 덩어리 파편 + 발밑 링, 불꽃 1
      const t = Math.floor(n * 1.5);
      const chunks = Math.ceil(t * 0.4);
      fill('ring', x, footY, 0, 0, 34, 0.26, 8, DUST[2]);
      shards(x, y, chunks, mat, collapse ? 1.6 : 1.3);
      sparks(x, y, 1, PALETTE.INK, 120, 100);
      dust(x, y, Math.max(1, t - chunks - 2));
      return;
    }
    case 'crowbar':
      if (collapse) shards(x, y, Math.round(n * 0.5), mat, 1);
      longSparks(x, y, 3);
      return;
    case 'grinder':
      if (collapse) shards(x, y, Math.round(n * 0.5), mat, 1);
      fanSparks(x, y, collapse ? Math.round(n * 0.8) : Math.round(n * 1.5));
      return;
    default:
      burst(kind, x, y, n, mat);
  }
}

// ── 보급 상자 연출 — 파티클 풀과 별개(동시 2개). 좌표는 월드(그릴 때 cam). ──
interface Crate { item: ItemId; x: number; y0: number; y: number; vy: number; t: number; bounced: boolean; opened: boolean }
const crates: Crate[] = [];
const CRATE_MAX = 2;
const CRATE_LIFE = 0.85;
const CRATE_G = 1500;
const CRATE_OPEN_AT = 0.38;
const CRATE_W = 20;
const CRATE_H = 15;
const ITEM_SCALE = 1.4; // 졸라맨 선 굵기(2)에 맞춘다 — drawItem 선 1.5 × 1.4

function updateCrates(step: number): void {
  for (let i = crates.length - 1; i >= 0; i--) {
    const k = crates[i];
    k.t += step;
    if (k.t >= CRATE_LIFE) { crates.splice(i, 1); continue; }
    if (k.vy !== 0 || k.y < k.y0) {
      k.vy += CRATE_G * step;
      k.y += k.vy * step;
      if (k.y >= k.y0) {
        k.y = k.y0;
        k.vy = k.bounced ? 0 : -k.vy * 0.4; // 한 번만 통
        k.bounced = true;
      }
    }
    if (!k.opened && k.t >= CRATE_OPEN_AT) {
      k.opened = true;
      dust(k.x, k.y0 - CRATE_H, 4);
    }
  }
}

function drawItem(ctx: CanvasRenderingContext2D, item: ItemId, cx: number, cy: number): void {
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  switch (item) {
    case 'hat': { // 흰 안전모
      const R = 7, base = cy + 2;
      ctx.arc(cx, base, R, Math.PI, 0);
      ctx.lineTo(cx + R + 4, base + 0.5);
      ctx.lineTo(cx + R + 4, base + 2.5);
      ctx.lineTo(cx - R - 1, base + 2.5);
      ctx.closePath();
      ctx.fillStyle = HAT_WHITE;
      ctx.fill();
      ctx.stroke();
      return;
    }
    case 'coffee': { // 막대 커피 봉지 — 길쭉한 사각형 + 대각선
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.35);
      ctx.rect(-3, -9, 6, 18);
      ctx.fillStyle = PALETTE.YELLOW; // 믹스커피 막대는 노랑이라야 읽힌다
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-3, -4);
      ctx.lineTo(3, -7);
      ctx.stroke();
      ctx.restore();
      return;
    }
    case 'gloves': { // 목장갑 실루엣 — 손바닥 + 손가락 넷 + 엄지
      ctx.moveTo(cx - 5, cy + 8);
      ctx.lineTo(cx - 5, cy - 4);
      for (let f = 0; f < 4; f++) {
        const fx = cx - 5 + f * 2.75;
        ctx.lineTo(fx, cy - 8 + (f === 0 || f === 3 ? 1.5 : 0));
        ctx.lineTo(fx + 2.75, cy - 8 + (f === 0 || f === 3 ? 1.5 : 0));
        ctx.lineTo(fx + 2.75, cy - 4);
      }
      ctx.lineTo(cx + 6, cy + 1);
      ctx.lineTo(cx + 9, cy - 2);
      ctx.lineTo(cx + 10, cy);
      ctx.lineTo(cx + 6, cy + 5);
      ctx.lineTo(cx + 6, cy + 8);
      ctx.closePath();
      ctx.fillStyle = '#E8E4DA';
      ctx.fill();
      ctx.stroke();
      return;
    }
    default: { // 먼지 자루 — 둥근 몸통 + 묶은 목 + 벌어진 주둥이
      ctx.moveTo(cx - 2, cy - 4);
      ctx.quadraticCurveTo(cx - 9, cy + 1, cx - 7, cy + 7);
      ctx.lineTo(cx + 7, cy + 7);
      ctx.quadraticCurveTo(cx + 9, cy + 1, cx + 2, cy - 4);
      ctx.lineTo(cx + 5, cy - 9);
      ctx.lineTo(cx - 5, cy - 9);
      ctx.closePath();
      ctx.fillStyle = DUST[1];
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 3, cy - 4);
      ctx.lineTo(cx + 3, cy - 4);
      ctx.stroke();
    }
  }
}

function drawCrates(ctx: CanvasRenderingContext2D): void {
  for (const k of crates) {
    const fade = Math.min(1, (CRATE_LIFE - k.t) / 0.2);
    const W = CRATE_W, H = CRATE_H;
    const top = k.y - H;
    ctx.save();
    ctx.globalAlpha = fade;
    // 내용물 — 열린 뒤 위로 솟는다(상자 뒤에서 먼저 그려 상자가 아랫부분을 가린다)
    if (k.opened) {
      const u = Math.min(1, (k.t - CRATE_OPEN_AT) / 0.25);
      const rise = 1 - (1 - u) * (1 - u);
      ctx.globalAlpha = fade * Math.min(1, u * 2);
      ctx.save();
      ctx.translate(k.x, top - 3 - rise * 18);
      ctx.scale(ITEM_SCALE, ITEM_SCALE);
      drawItem(ctx, k.item, 0, 0);
      ctx.restore();
      ctx.globalAlpha = fade;
    }
    if (!drawAsset(ctx, 'crate', k.x, k.y - H / 2)) {
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = PALETTE.INK;
      ctx.fillStyle = DUST[0];
      ctx.fillRect(k.x - W / 2, top, W, H);
      ctx.strokeRect(k.x - W / 2, top, W, H);
      ctx.lineWidth = 1;
      ctx.beginPath();                     // 띠 십자
      ctx.moveTo(k.x, top);
      ctx.lineTo(k.x, k.y);
      ctx.moveTo(k.x - W / 2, top + H / 2);
      ctx.lineTo(k.x + W / 2, top + H / 2);
      ctx.stroke();
      // 뚜껑 — 왼쪽 경첩을 축으로 젖혀진다
      const open = k.opened ? Math.min(1, (k.t - CRATE_OPEN_AT) / 0.1) : 0;
      ctx.save();
      ctx.translate(k.x - W / 2 - 1, top);
      ctx.rotate(-open * 1.9);
      ctx.lineWidth = 1.5;
      ctx.fillStyle = DUST[0];
      ctx.fillRect(0, -4, W + 2, 4);
      ctx.strokeRect(0, -4, W + 2, 4);
      ctx.restore();
    }
    ctx.restore();
  }
}

function dust(x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    fill(
      'dust',
      x + signed() * 16, y + signed() * 10,
      signed() * 55, -15 + n01() * 50,
      120,
      0.40 + n01() * 0.25,
      4 + n01() * 5,
      DUST[i % 3],
    );
  }
}

function cream(x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    fill(
      'cream',
      x + signed() * 12, y - n01() * 6,
      signed() * 90, -160 - n01() * 180,
      1400,
      0.70 + n01() * 0.40,
      2.5 + n01() * 2.5,
      i % 2 === 0 ? PALETTE.YELLOW : '#FFF07A',
      { bounce: 2 },
    );
  }
}

function radial(x: number, y: number, n: number, color: string): void {
  for (let i = 0; i < n; i++) {
    const ang = (i / Math.max(n, 1)) * Math.PI * 2 + signed() * 0.18;
    const spd = 160 + n01() * 240;
    fill(
      i % 2 === 0 ? 'spark' : 'shard',
      x, y,
      Math.cos(ang) * spd, Math.sin(ang) * spd,
      220,
      0.22 + n01() * 0.18,
      3 + n01() * 4,
      i % 3 === 0 ? PALETTE.YELLOW : color,
      { rot: ang, spin: signed() * 6 },
    );
  }
}

function pollen(x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    fill(
      'pollen',
      x + signed() * 28, y + signed() * 18,
      signed() * 36, -24 - n01() * 50,
      -18,
      1.0 + n01() * 0.8,
      1.2 + n01() * 1.4,
      n01() > 0.45 ? PALETTE.YELLOW : DUST[0],
    );
  }
}

function burst(kind: string, x: number, y: number, count: number, mat?: string): void {
  switch (kind) {
    case 'hit':
      sparks(x, y, count, PALETTE.INK, 170, 140);
      return;
    case 'bossHit': // 보스 몸이 먹 터짐(BACK)을 가린다 — 방울만 맨 앞으로
      sparks(x, y, count, PALETTE.INK, 170, 140);
      drops(x, y, 3, -Math.PI / 2 - 1.2, -Math.PI / 2 + 1.2, 180, 360, 2.4, 0.3);
      return;
    case 'floorCollapse':
      shards(x, y, count, mat, 1);
      return;
    case 'stackDestroy':
      shards(x, y, count, mat, 1.65);
      return;
    case 'butterCollapse':
      cream(x, y, count);
      return;
    case 'special': {
      // 예비동작 동안 그어 둔 엔소가 터져 나간다 — 첫 획은 노랑(베는 순간), 안쪽 둘째 획은 먹. 먹 왕관이 사방으로
      ensoAt(x, y, 34, 210, 0.58, 16, 1, PALETTE.YELLOW);
      if (!spawnFixed) ensoAt(x, y, 14, 120, 0.42, 9); // 안쪽 둘째 획은 졸라맨 쪽만 — 가운데까지 겹이면 화면이 막힌다
      drops(x, y, 12, 0, Math.PI * 2, 260, 640, 3.4, 0.6, !spawnFixed);
      radial(x, y, count, PALETTE.INK);
      sparks(x, y, Math.max(12, count >> 1), PALETTE.YELLOW, 280, 240);
      const slashN = 8 + Math.min(4, (count / 12) | 0);
      for (let i = 0; i < slashN; i++) {
        const u = slashN <= 1 ? 0.5 : i / (slashN - 1);
        fill(
          'spark',
          x - 40 + u * 90, y + 80 + u * -200,
          720 + n01() * 80, -1600 - n01() * 120,
          0,
          0.16 + n01() * 0.10,
          20 + n01() * 8,
          PALETTE.YELLOW,
        );
      }
      shards(x, y, 8 + (count / 8 | 0), mat, 1.9);
      return;
    }
    case 'hurt':
      dust(x, y, count);
      crush(x, y);
      return;
    // 밑면에 머리를 부딪힘 — 위로 튀는 먼지 몇 알. 가드 바운스와 같은 톤(먼지색)이되 더 작게.
    case 'headBonk':
      sparks(x, y, Math.max(3, count >> 1), '#6E695F', 60, 120);
      return;
    case 'guardBounce':
      parry(x, y, false);
      return;
    case 'guardAirBounce':
      parry(x, y, true);
      return;
    case 'bossDefeat': {
      // 링은 defeatRings가 셋을 따로 깐다
      const seeds = Math.floor(count * 0.55);
      shards(x, y, count - seeds, undefined, 2.1);
      pollen(x, y, seeds);
      return;
    }
    default:
      sparks(x, y, count, PALETTE.INK, 120, 100);
  }
}

/** 씬 전환·새 런 시작 시 풀을 비운다. */
export function resetEffects(): void {
  for (let i = 0; i < POOL; i++) {
    if (pool[i].img) releaseFrag(pool[i]);
    pool[i].alive = false;
  }
  allocAt = 0;
  live = 0;
  fxSeed = 1;
  crates.length = 0;
  resetBladeFx();
}

/**
 * 히트/가드/붕괴 파티클 스폰.
 * `count` 생략 시 `JUICE[kind].particles`. 0 또는 미등록 키는 무동작.
 * `x`,`y`는 캔버스 픽셀 — renderer는 `VIEW.LANE_X[lane]`, `VIEW.GROUND_Y - (e.y ?? player.y)` 를 넘긴다.
 */
export function spawnHitParticles(
  kind: string,
  x: number,
  y: number,
  count?: number,
  mat?: string,
): void {
  const n = count ?? JUICE[kind]?.particles ?? 0;
  if (n <= 0) return;
  burst(kind, x, y, n, mat);
}

/**
 * 파티클 적분. `dt`는 초(drawGame에서 `TICK`).
 * 히트스톱 중에도 호출 — sim은 멈춰도 파편은 움직인다.
 */
export function updateEffects(dt: number): void {
  const step = dt > 0 ? Math.min(dt, 0.05) : TICK;
  if (crates.length) updateCrates(step);
  updateBladeFx(step);
  if (live <= 0) return;
  const ground = VIEW.GROUND_Y;
  for (let i = 0; i < POOL; i++) {
    const p = pool[i];
    if (!p.alive) continue;
    p.life -= step;
    if (p.life <= 0) {
      p.alive = false;
      live -= 1;
      if (p.img) releaseFrag(p);
      continue;
    }
    if (STILL.has(p.style)) continue;
    if (p.drag > 0) {
      const k = Math.max(0, 1 - p.drag * step);
      p.vx *= k;
      p.vy *= k;
    }
    p.vy += p.g * step;
    p.x += p.vx * step;
    p.y += p.vy * step;
    p.rot += p.spin * step;
    // 땅은 떨어지는 중(vy > 0)에만 닿는다 — 땅 가까이서 생겨 위로 뜨는 조각이 첫 프레임에 「튐」으로 뒤집혀 바로 부서지지 않게
    if (p.style === 'frag' && p.vy > 0 && p.y > ground - p.size) {
      // 층 조각은 땅에 한 번 튀고, 두 번째로 닿으면 먼지로 부서진다 — 바닥에 판지 더미가 쌓이지 않게
      p.y = ground - p.size;
      if (p.bounce > 0) {
        p.vy *= DEBRIS.BOUNCE_VY;
        p.vx *= DEBRIS.BOUNCE_VX;
        p.spin *= 0.5;
        p.bounce -= 1;
      } else if (p.bounce === 0) {
        p.bounce = -1; // 부서짐 표시 — 한 번만
        p.vy = 0;
        p.vx *= 0.5;
        p.spin *= 0.5;
        p.life = Math.min(p.life, 0.15);
        p.maxLife = p.life / 0.3; // 그리기 알파(t / 0.3)가 1에서 시작해 0.15초에 0
        dust(p.x, ground - 4, 1);
      } else {
        p.vy = 0;
      }
    } else if (p.style === 'ink' && p.c2 && p.vy > 0 && p.y >= ground - 1) {
      // 땅에 떨어진 먹 방울 — 납작하게 번졌다가 오그라든다
      p.style = 'splat';
      p.y = ground - 0.5;
      p.vx = 0;
      p.vy = 0;
      p.size *= 2.4;
      p.life = 0.3 + n01() * 0.25;
      p.maxLife = p.life;
      p.seed = n01() * 1000;
    } else if (p.bounce > 0 && p.vy > 0 && p.y > ground - p.size) {
      p.y = ground - p.size;
      p.vy *= DEBRIS.BOUNCE_VY;
      p.vx *= DEBRIS.BOUNCE_VX;
      p.bounce -= 1;
      if (Math.abs(p.vy) < 24) p.bounce = 0;
    }
  }
}

const BRONZE = ['#8A6F3E', '#6B5530', '#A88A52'] as const; // sprites.ts 종 재질 색

/** 종 「깡」 — 안 깎이니 금은 없다. 흰 별 · 놋쇠 불꽃 · 퍼지는 엔소 한 고리 (x, y = 월드 캔버스 좌표) */
export function spawnBellClang(x: number, y: number): void {
  clang(x, y, 20, 0.14);
  ensoAt(x, y, 14, 70, 0.26, 5, 0.5);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + n01() * 0.4;
    const sp = 380 + n01() * 260;
    fill('spark', x + Math.cos(a) * 10, y + Math.sin(a) * 8, Math.cos(a) * sp, Math.sin(a) * sp - 60, 0,
      0.09 + n01() * 0.08, 4 + n01() * 3, BRONZE[2]);
  }
}

/** 땅에서 깨진 종 — 놋쇠 조각이 튀고 눕는 엔소 하나(퉁). x, y = 월드 캔버스 좌표(지면) */
export function spawnBellShatter(x: number, y: number): void {
  for (let i = 0; i < 14; i++) {
    fill('shard', x + signed() * 40, y - 8 - n01() * 30, signed() * 260, -(120 + n01() * 260), 980,
      0.5 + n01() * 0.4, 4 + n01() * 5, BRONZE[i % 3], { rot: signed() * Math.PI, spin: signed() * 10 });
  }
  puffs(x, y - 4, 3, 50, 10, 120, 0.4);
  ensoAt(x, y + 2, 14, 80, 0.26, 5, 0.28);
}

/**
 * consumeEvents 루프용. 캔버스 좌표로 변환한 뒤 spawnHitParticles에 위임.
 * 병렬 renderer가 이 이름을 이미 import하므로 유지한다.
 */
export function spawnFromEvent(s: GameState, e: JuiceEvent): void {
  bladeReact(s, e); // 대검 덧칠 — 베기 자국·잔상·칼마다 파편(bladeFx)
  const x = VIEW.LANE_X[e.lane ?? s.player.lane];
  const y = VIEW.GROUND_Y - (e.y ?? s.player.y); // 월드 좌표 — 카메라는 그릴 때 한 번(BL-09)
  if (e.kind === 'land') {
    // 플레이어 착지만(레인 없음) — 화산탄 착지(lane 있음)는 더미가 대신 보여 준다
    if (e.lane === undefined) dust(x, y - 2, JUICE_SYS.LAND_DUST);
    return;
  }
  if (e.kind === 'boltStrike') {
    boltStrikeBurst(x, VIEW.GROUND_Y, JUICE.boltStrike.particles);
    return;
  }
  if (e.kind === 'stackDestroy') {
    stackBurst(x, y - 40, e.n); // 이벤트 y가 없어 발 높이다 — 마지막 층이 있던 머리 위로 올린다
    return;
  }
  if (e.kind === 'bossDefeat') {
    const by = s.boss ? VIEW.GROUND_Y - s.boss.y : y;
    spawnHitParticles('bossDefeat', VIEW.W / 2, by, JUICE.bossDefeat.particles);
    defeatRings(VIEW.W / 2, by);
    return;
  }
  if (e.kind === 'slash') {
    switch (s.weapon) {
      case 'hammer': // 짧고 굵게 (size>16 → 굵은 획)
        fill('spark', x + 8, y - 24, 50, -20, 0, 0.12, 17, slashColor);
        fill('spark', x + 6, y - 16, 30, -30, 0, 0.10, 17, slashColor);
        return;
      case 'crowbar': // 높게
        fill('spark', x + 8, y - 40, 60, -160, 0, 0.16, 18, slashColor);
        fill('spark', x + 4, y - 24, 30, -120, 0, 0.13, 12, slashColor);
        return;
      case 'grinder': { // 둥글게 — 원을 따라 도는 짧은 획 다섯
        for (let k = 0; k < 5; k++) {
          const a = -0.9 * Math.PI + k * 0.45 * Math.PI;
          fill('spark', x + 12 + Math.cos(a) * 10, y - 26 + Math.sin(a) * 10,
            -Math.sin(a) * 90, Math.cos(a) * 90, 0, 0.14, 9, slashColor);
        }
        return;
      }
      case 'sword':
        fill('spark', x + 10, y - 28, 90, -50, 0, 0.14, 16, slashColor);
        fill('spark', x + 4, y - 18, 40, -80, 0, 0.12, 12, slashColor);
        return;
      default: // 대검 — 참격 잔상·칼끝 알갱이는 bladeFx가 그린다
        return;
    }
  }
  if (e.kind === 'hit' || e.kind === 'floorCollapse') {
    const footY = VIEW.GROUND_Y - s.player.y;
    weaponBurst(s.weapon, e.kind, x, y, footY, JUICE[e.kind]?.particles ?? 0, e.mat);
    if (s.gimmick === 'glass') glassBurst(x, y, e.kind === 'floorCollapse' ? JUICE_SYS.GLASS_CHIPS : JUICE_SYS.GLASS_CHIPS_HIT);
    const collapse = e.kind === 'floorCollapse';
    const k = tierK(e.combo ?? s.combo);
    if (collapse) inkCollapse(x, y, k);
    else inkHit(x, y, k);
    star(x + signed() * 10, y - 3, JUICE_SYS.STAR_PX[e.kind], collapse ? 0.18 : 0.12);
    if (collapse) puffs(x, y + 2, JUICE_SYS.PUFF_COLLAPSE, VIEW.LANE_W * 0.36, 12, 120); // 벤 자리(층 밑면)에서 옆으로 밀려 나온다
    return;
  }
  if (e.kind === 'gaugeFull') {
    // 필살이 찼다 — 몸을 감는 먹 엔소 하나(필살 예비동작이 긋는 원의 예고). 반짝 별은 weaponFx
    ensoAt(x, VIEW.GROUND_Y - s.player.y - 31, 20, 16, 0.5, 4.5);
    return;
  }
  if (e.kind === 'supply') {
    if (crates.length >= CRATE_MAX) crates.shift();
    crates.push({ item: e.item ?? 'hat', x, y0: y, y, vy: -200, t: 0, bounced: false, opened: false });
    dust(x, y, (JUICE.supply?.particles ?? 8) >> 1);
    return;
  }
  if (e.kind === 'hatBreak') {
    // 흰 파편(잉크 외곽선) 5개 + 남은 수만큼 먼지
    const n = JUICE.hatBreak?.particles ?? 10;
    clang(x, y, 17, 0.14); // 막아 준 순간 — 흰 별과 작은 엔소
    ensoAt(x, y, 10, 50, 0.28, 5);
    shards(x, y, 5, undefined, 1.1, HAT_WHITE, 'chip');
    dust(x, y, Math.max(0, n - 5));
    return;
  }
  if (e.kind === 'special') {
    const n = JUICE.special?.particles ?? 0;
    spawnHitParticles('special', x, y, n, e.mat);
    spawnFixed = true; // 화면 중앙 폭발은 카메라를 안 탄다
    spawnHitParticles('special', VIEW.W / 2, VIEW.FIELD_H / 2, n, e.mat);
    spawnFixed = false;
    return;
  }
  if (e.kind === 'guardBounce' && s.gimmick === 'ice') iceSparks(x, y, JUICE_SYS.ICE_SPARKS);
  spawnHitParticles(e.kind, x, y, JUICE[e.kind]?.particles ?? 0, e.mat);
  const starPx = JUICE_SYS.STAR_PX[e.kind];
  if (starPx) star(x, y - 3, starPx, 0.16);
}

/** glass 구역: 잉크 외곽선 두른 아이보리 유리 조각 + 파란 가는 반짝. PALETTE만 — 노랑 0. */
function glassBurst(x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    if (i % 3 === 2) {
      fill('spark', x + signed() * 10, y + signed() * 6, signed() * 140, -90 - n01() * 160, 600,
        0.22 + n01() * 0.16, 10 + n01() * 6, PALETTE.BLUE);
    } else {
      fill('chip', x + signed() * 14, y + signed() * 8, signed() * 150, -80 - n01() * 190, 980,
        0.45 + n01() * 0.35, 7 + n01() * 7, PALETTE.WHITE, { rot: signed() * Math.PI, spin: signed() * 10 });
    }
  }
}

/** ice 구역: 지면 가드 때 땅을 따라 번지는 차가운(파랑) 스파크 + 작은 링. 노랑 0. */
function iceSparks(x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    fill('spark', x + dir * (6 + n01() * 20), y, dir * (90 + n01() * 140), -30 - n01() * 120, 500,
      0.22 + n01() * 0.14, 9 + n01() * 7, i % 3 === 0 ? PALETTE.INK : PALETTE.BLUE);
  }
  fill('ring', x, y, 0, 0, 70, 0.3, 12, PALETTE.BLUE);
}

/** 완파 — 층수(n)가 클수록 파편·엔소가 커진다. 층수 3 이상이면 노랑으로 긋는 바깥 엔소가 하나 더 붙는다. 먹 왕관이 위로 */
function stackBurst(x: number, y: number, n?: number): void {
  const k = stackScale(n);
  const count = Math.min(48, Math.round(JUICE.stackDestroy.particles * k));
  shards(x, y, count, undefined, 1.45 + 0.2 * k);
  blot(x, y, 15 * k, 0.24);
  ensoAt(x, y, 18, 70 * k, 0.4, 8 * k);
  if ((n ?? 0) >= JUICE_SYS.STACK_RING_FLOORS) ensoAt(x, y, 30, 120 * k, 0.5, 11 * k, 1, PALETTE.YELLOW);
  drops(x, y, Math.round(8 * k), -Math.PI / 2 - 1.5, -Math.PI / 2 + 1.5, 260, 640, 3.4, 0.7, true);
  puffs(x, y, JUICE_SYS.PUFF_DESTROY, VIEW.LANE_W * 0.42, 15 + 3 * k, 150, 0.8);
  star(x, y, JUICE_SYS.STAR_PX.stackDestroy * Math.min(1.3, k), 0.24);
}

/** 번개 착탄 — 땅에서 솟는 세로 불꽃(노랑·잉크) + 먼지 + 작은 링. */
function boltStrikeBurst(x: number, groundY: number, n: number): void {
  for (let i = 0; i < n; i++) {
    fill(
      'spark',
      x + signed() * 10, groundY - 2,
      signed() * 45, -420 - n01() * 320,
      900,
      0.18 + n01() * 0.14,
      14 + n01() * 8,
      i % 2 === 0 ? PALETTE.YELLOW : PALETTE.INK,
    );
  }
  dust(x, groundY - 4, 6);
  fill('ring', x, groundY - 2, 0, 0, 44, 0.25, 8, PALETTE.INK);
}

/** 보스 격파 — 한가운데서 번지는 엔소 셋(먹 · 노랑으로 긋는 먹 · 먹, 크기·수명이 달라 겹겹이 읽힌다). */
function defeatRings(x: number, y: number): void {
  ensoAt(x, y, 24, 90, 0.5, 10);
  ensoAt(x, y, 44, 150, 0.7, 15, 1, PALETTE.YELLOW);
  ensoAt(x, y, 70, 230, 0.9, 12);
}

/** 보스 입장 — 물고 온 층이 부서지는 틱: 파편 + 먼지. y는 월드(화면) 좌표. */
export function spawnBossBreak(x: number, y: number): void {
  // 층이 세 조각으로 갈라지니 조각마다 한 덩이씩(좌·중·우)
  const per = Math.ceil(JUICE.bossBreak.particles / 3);
  for (const dx of [-90, 0, 90]) {
    shards(x + dx, y, per, 'mid', 1.5);
    dust(x + dx, y, 3);
  }
}

/**
 * 필살로 사라진 건물을 층 단위로 흩뿌린다 — 예비동작이 끝나는 프레임의 해체.
 * 층마다 그 층 그림을 두세 조각으로 잘라 사방으로(먼지 구름은 같은 묶음의 완파가 낸다).
 * (높은 탑은 층을 솎아 상한을 지킨다) tileAt(i) = i층 그림 — 없으면 회색 파편.
 */
export function spawnStackShatter(stack: FallingStack, tileAt?: (index: number) => HTMLCanvasElement | undefined): void {
  const cx = VIEW.LANE_X[0];
  const w = stack.variant === 'butterbar' ? VIEW.BUTTER_W : VIEW.LANE_W;
  const stepF = Math.max(1, Math.ceil(stack.floors.length / 12));
  let cum = 0;
  stack.floors.forEach((f, i) => {
    const top = VIEW.GROUND_Y - stack.y - cum - f.h;
    cum += f.h;
    if (i % stepF !== 0) return;
    spawnFloorShatter(tileAt?.(i), cx - w / 2, top, w, f.h, 1.15, true, 2, 1);
  });
}

/**
 * drawGame용 스텝. 히트스톱과 무관하게 매 드로우 호출할 것.
 * ★08-30(P1-5): rAF마다 고정 TICK을 적분하면 120Hz 기기에서 파티클이 2배속,
 * 프레임 드랍 시 슬로우가 된다 — 실경과 시간으로 적분한다.
 * slow = 배속(1 = 실시간). 보스 격파·사망 직후 파티클만 느리게 흘릴 때 쓴다(core 틱은 그대로).
 */
let fxLastNow = -1;
export function tickEffects(slow = 1): void {
  const now = typeof performance !== 'undefined' ? performance.now() : -1;
  if (now < 0 || fxLastNow < 0) {
    fxLastNow = now;
    updateEffects(TICK * slow);
    return;
  }
  const dt = Math.min((now - fxLastNow) / 1000, 0.05);
  fxLastNow = now;
  updateEffects((dt > 0 ? dt : TICK) * slow);
}

/** shake transform이 적용된 ctx에 그린다. cam = 렌더 카메라(월드 좌표 → 화면). 월드(플레이어 다음) ~ HUD 전. */
export function drawEffects(ctx: CanvasRenderingContext2D, cam = 0): void {
  if (crates.length) {
    ctx.save();
    ctx.translate(0, cam);
    drawCrates(ctx);
    ctx.restore();
  }
  if (live <= 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < POOL; i++) {
      const p = pool[i];
      if (p.alive && !BACK.has(p.style) && LAYER[p.style] === layer) drawParticle(ctx, p, p.y + (p.fixed ? 0 : cam));
    }
  }
  ctx.restore();
}

/** BACK만 — ctx에 이미 카메라가 들어 있어 cam을 더하지 않는다. 조각 위에 구름(LAYER 순서 그대로). */
export function drawBackEffects(ctx: CanvasRenderingContext2D): void {
  if (live <= 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const style of BACK) {
    for (let i = 0; i < POOL; i++) {
      const p = pool[i];
      if (p.alive && p.style === style) drawParticle(ctx, p, p.y);
    }
  }
  ctx.restore();
}

/** 파티클 하나. py = 카메라를 더한 화면 y. */
function drawParticle(ctx: CanvasRenderingContext2D, p: Particle, py: number): void {
  const t = Math.max(0, p.life / p.maxLife);
  ctx.globalAlpha = t;
  ctx.fillStyle = p.color;
  ctx.strokeStyle = p.color;
  switch (p.style) {
    case 'spark': {
      const ang = Math.atan2(p.vy, p.vx);
      const slash = p.size > 16;
      const len = p.size + Math.hypot(p.vx, p.vy) * (slash ? 0.06 : 0.018);
      ctx.lineWidth = slash ? 2.6 : 1.4;
      ctx.beginPath();
      ctx.moveTo(p.x, py);
      ctx.lineTo(p.x - Math.cos(ang) * len, py - Math.sin(ang) * len);
      ctx.stroke();
      return;
    }
    case 'shard': {
      ctx.save();
      ctx.translate(p.x, py);
      ctx.rotate(p.rot);
      ctx.fillRect(-p.size * 0.5, -p.size * 0.28, p.size, p.size * 0.56);
      ctx.restore();
      return;
    }
    case 'chip': {
      ctx.save();
      ctx.translate(p.x, py);
      ctx.rotate(p.rot);
      ctx.fillRect(-p.size * 0.5, -p.size * 0.35, p.size, p.size * 0.7);
      ctx.strokeStyle = PALETTE.INK;
      ctx.lineWidth = 1;
      ctx.strokeRect(-p.size * 0.5, -p.size * 0.35, p.size, p.size * 0.7);
      ctx.restore();
      return;
    }
    case 'frag': {
      if (!p.img) return;
      const W = Math.ceil(p.w * FRAG_SS);
      const H = Math.ceil(p.h * FRAG_SS);
      ctx.globalAlpha = Math.min(1, t / 0.3); // 끝 3할에만 옅어진다 — 처음부터 비치면 콘크리트가 종이처럼 가볍다
      ctx.save();
      ctx.translate(p.x, py);
      ctx.rotate(p.rot);
      ctx.drawImage(p.img, 0, 0, W, H, -p.ax, -p.ay, W / FRAG_SS, H / FRAG_SS);
      ctx.restore();
      return;
    }
    case 'dust': {
      ctx.globalAlpha = t * 0.5;
      ctx.beginPath();
      ctx.arc(p.x, py, p.size * (1.35 - 0.35 * t), 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case 'puff':
      drawPuff(ctx, p, py, 1 - t);
      return;
    case 'star':
      drawStar(ctx, p, py, 1 - t);
      return;
    case 'cream': {
      ctx.beginPath();
      ctx.arc(p.x, py, p.size, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case 'ring': {
      const k = 1 - t;
      ctx.lineWidth = 2.4 * t;
      ctx.beginPath();
      ctx.arc(p.x, py, p.size + k * (p.g > 0 ? p.g : 52), 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    case 'ink': { // 머리는 끝 35%에만 줄고, 꼬리는 빠를수록 길다(늘어남)
      ctx.globalAlpha = 1;
      const r = p.size * Math.min(1, t / 0.35);
      inkDrop(ctx, p.x, py, r, Math.atan2(p.vy, p.vx), Math.min(16, Math.hypot(p.vx, p.vy) * 0.02) * (r / p.size) + r * 0.4);
      return;
    }
    case 'splat':
      ctx.globalAlpha = 1;
      inkSplat(ctx, p.x, py, p.size, Math.pow(t, 0.6), p.seed);
      return;
    case 'blot':
      ctx.globalAlpha = 1;
      inkBlot(ctx, p.x, py, p.size * popScale(1 - t), p.seed);
      return;
    case 'enso': {
      // 빨리 퍼지다 선다 · 앞 16%에 붓이 한 바퀴를 긋는다 · 30%부터 시작점이 말라 꼬리가 머리를 쫓는다 · 마를수록 세 갈래(비백)
      ctx.globalAlpha = 1;
      const u = 1 - t;
      const r = p.size + p.g * (1 - (1 - u) ** 3);
      const head = Math.min(1, u / 0.16);
      const tail = u < 0.3 ? 0 : ((u - 0.3) / 0.7) ** 1.15;
      const dry = Math.min(1, Math.max(0, (u - 0.18) / 0.45));
      const w = p.w * (1 - 0.45 * u);
      const a0 = p.rot + p.spin * (p.maxLife - p.life);
      if (p.c2 && u < 0.12) {
        ctx.fillStyle = PALETTE.INK; // 노랑 획엔 먹 테 — 아이보리 위에서도 읽히게
        enso(ctx, p.x, py, r, w * 1.5 + 2, a0, tail, head, 0, p.h, p.seed);
        ctx.fillStyle = p.c2;
      }
      enso(ctx, p.x, py, r, w, a0, tail, head, dry, p.h, p.seed);
      return;
    }
    default: {
      ctx.beginPath();
      ctx.arc(p.x, py, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/**
 * 만화 먼지 구름 — 원 넷을 한 경로에 겹쳐 외곽선을 먼저 긋고 면을 위에 칠한다(겹친 안쪽 선은 면이 덮어 바깥 테두리만 남는다).
 * u = 0 → 1(수명 진행). 처음 4분의 1에 부풀고, 마지막 3할에 확 줄어 사라진다 — 옅어지지 않는다.
 */
/** 구름 덩이 [x, y, 반지름] — 반지름 1 기준. 가운데 큰 덩이에서 좌우로 작아지고 아래는 평평하다(옆으로 긴 먼지). */
const PUFF_LOBES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 1], [-0.85, 0.18, 0.68], [0.85, 0.15, 0.72], [-0.45, -0.42, 0.62],
  [0.42, -0.38, 0.58], [-1.35, 0.32, 0.42], [1.3, 0.3, 0.45],
];

function drawPuff(ctx: CanvasRenderingContext2D, p: Particle, py: number, u: number): void {
  const grow = u < 0.2 ? 0.45 + 0.55 * Math.sin((u / 0.2) * Math.PI / 2) : 1;
  const shrink = u > 0.6 ? Math.max(0, 1 - (u - 0.6) / 0.4) : 1;
  const r = p.size * grow * shrink;
  if (r < 0.8) return;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  for (let k = 0; k < PUFF_LOBES.length; k++) {
    const [lx, ly, lr] = PUFF_LOBES[k];
    const j = Math.sin(p.seed + k * 2.3) * 0.12; // 덩이마다 조금씩 다르게
    const bx = p.x + lx * r;
    const by = py + (ly + j * 0.5) * r;
    const br = r * (lr + j);
    ctx.moveTo(bx + br, by);
    ctx.arc(bx, by, br, 0, Math.PI * 2);
  }
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = PALETTE.INK;
  ctx.stroke();
  ctx.fillStyle = p.color;
  ctx.fill();
}

/** 타격 별 — 들쭉날쭉한 별(노랑 = 벤 순간 · 흰 = 막은 순간) + 잉크 외곽 + 노랑 별만 흰 속. 첫 프레임이 가장 크고 줄어든다. */
function drawStar(ctx: CanvasRenderingContext2D, p: Particle, py: number, u: number): void {
  const R = p.size * (1.15 - 0.75 * u);
  const spikes = 10;
  ctx.globalAlpha = u > 0.8 ? (1 - u) / 0.2 : 1;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = p.rot + (i / (spikes * 2)) * Math.PI * 2;
    const rr = i % 2 === 0 ? R * (0.75 + 0.25 * Math.abs(Math.sin(p.seed + i * 2.7))) : R * 0.42;
    const sx = p.x + Math.cos(a) * rr;
    const sy = py + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.closePath();
  ctx.fillStyle = p.color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = PALETTE.INK;
  ctx.stroke();
  if (p.color === FLASH_WHITE) return;
  ctx.beginPath();
  ctx.moveTo(p.x + R * 0.28, py);
  ctx.arc(p.x, py, R * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = FLASH_WHITE;
  ctx.fill();
}
