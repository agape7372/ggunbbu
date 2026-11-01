// 타격감 파티클 풀 — JUICE.*.particles 를 소비해 프로시저럴 점/선/먼지를 뿌린다.
// 고정 풀 JUICE_SYS.PARTICLE_POOL. 초과 시 링 커서로 오래된 슬롯 재활용.
// core rngState와 무관한 렌더 LCG. DOM import 없음 — 에셋은 보급 상자 그림('crate') 하나만 시도하고,
// 층 조각 캔버스는 document가 있을 때만 만든다(테스트는 회색 파편으로 대신한다).
// 히트스톱 중에도 updateEffects는 호출되어야 한다(정지감 속 운동감).
//
// ★좌표 계약(BL-09): 파티클·상자는 **월드 좌표**(지면 y = VIEW.GROUND_Y 기준 화면 좌표, 카메라 미적용)로 저장하고
// drawEffects(ctx, cam)가 그릴 때 한 번 cam을 더한다. 스폰 시점 카메라를 구워 넣으면 점프 정점에서 터진 파편이
// 월드에 안 붙고 화면에 붙어 따라온다. 화면에 붙는 파티클은 없다(필살 그림은 wazaShow가 맡는다).

import type { FallingStack, GameState, ItemId, JuiceEvent, WeaponId } from '../core/types';
import { DEBRIS, JUICE, JUICE_SYS, PALETTE, SLASH_INK, TICK, VIEW, WEAPON_INK } from '../config';
import { drawAsset } from './assets';
import { bladeReact, resetBladeFx, tierK, updateBladeFx } from './bladeFx';
import { stackScale } from './feel';
import { PRESS, brushLine, enso, inkDrop, inkDust, inkSplat, popScale, spatter } from './ink';
import { inkFlick, setSwordInk } from './weaponFx';

/**
 * chip = 잉크 외곽선 두른 파편(안전모 · 유리 조각) · frag = 층 그림을 그대로 든 조각 · star = 흰 별 「깡」(막아 낸 순간만)
 * — 먹 한 획(ink.ts): spark = 튕긴 가는 획 · ink = 먹 방울 · splat = 땅에 번진 먹 · spat = 친 쪽으로 튄 먹
 * · dry = 마른 먹 가루 무리 · dust = 마른 가루 한 점 · enso = 붓으로 그은 원. 알파로 지우지 않는다 — 줄고 꼬리부터 깎인다
 */
type Style = 'spark' | 'shard' | 'chip' | 'dust' | 'cream' | 'frag' | 'star'
  | 'ink' | 'splat' | 'spat' | 'dry' | 'enso';

/** 그리는 순서 — 조각·파편·엔소가 뒤, 가루가 가운데, 튕긴 획·별·먹 방울이 맨 앞 */
const LAYER: Record<Style, number> = {
  frag: 0, shard: 0, chip: 0, cream: 0, enso: 0, splat: 0, spat: 0, dust: 1, dry: 1,
  spark: 2, star: 2, ink: 2,
};
/**
 * 층 조각 · 먹 튐 — 건물과 같은 층이라 졸라맨을 가리지 않게 플레이어보다 먼저 그린다(drawBackEffects).
 * 먹 튐은 맞은 건물 밑면에 튄 먹이다(머리 위에서 졸라맨을 덮지 않는다). 화면 고정으로는 안 뿌린다.
 */
const BACK: ReadonlySet<Style> = new Set<Style>(['frag', 'spat']);
/** 제자리에서 모양만 바뀌는 것 — 적분하지 않는다 */
const STILL: ReadonlySet<Style> = new Set<Style>(['enso', 'spat', 'splat']);

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
  /** 초당 속도 감쇠(0 = 없음) — 먼지 구름이 퍼지다 선다 */
  drag: number;
  /** puff·star 모양을 정하는 수 */
  seed: number;
  /** frag: 구운 조각 캔버스(FRAG_SS배) · 그 안의 기준점(무게중심) · 논리 크기 — enso: w = 획 굵기 · h = 세로 배율 · spat · dry: w = 방울 · 점 수 */
  img: HTMLCanvasElement | null;
  ax: number;
  ay: number;
  w: number;
  h: number;
  /** 둘째 색 — enso · spat: 터진 순간(앞 12~15%)만 이 포인트 색 속 · ink: 땅에 닿으면 번진다(빈 문자열 = 안 번짐) */
  c2: string;
}

const POOL = JUICE_SYS.PARTICLE_POOL;
const DUST = ['#B9B3A6', '#948E82', '#6E695F'] as const;
const HAT_WHITE = '#FFFFFF'; // 안전모 — sprites.ts hardHat과 같은 흰색
const FLASH_WHITE = '#FFFFFF'; // 흰 별 「깡」 — 아이보리(PALETTE.WHITE) 위에서도 튀는 순백
const BUTTER = ['#E39E00', '#C98A12'] as const; // 버터 방울 — 형광 노랑 대신 짙은 버터색 둘

function blank(): Particle {
  return {
    alive: false,
    style: 'spark',
    x: 0, y: 0, vx: 0, vy: 0, g: 0,
    life: 0, maxLife: 1,
    size: 1, rot: 0, spin: 0,
    color: PALETTE.INK,
    bounce: 0,
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

// 08-30(P1-3): blade 코스메틱 — 칼빛. 11-01 먹 개편: 저장값은 그대로 두고 먹에 맞는 색으로 바꿔 철거칼 획 속 · 포인트 색에 쓴다
let slashInk: string = WEAPON_INK.sword;
export function setSlashColor(c: string): void {
  slashInk = SLASH_INK[c.toUpperCase()] ?? c;
  setSwordInk(slashInk);
}

/** 무기의 포인트 색 — 벤 순간 먹 튐 속 · 큰 엔소 속. 철거칼은 칼빛 설정 색 */
function pointInk(w: WeaponId): string {
  return w === 'sword' ? slashInk : WEAPON_INK[w];
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
  if (mat === 'butter') return BUTTER[0];
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

/** 마른 먹 가루 한 무리 — 점 n개가 R 안에 흩어져 vx 쪽으로 밀리며 오그라든다(먼지 구름 대신) */
function dryDust(x: number, y: number, R: number, n: number, vx: number, life: number, color: string = DUST[2]): void {
  const p = fill('dry', x, y, vx, -12, 0, life, R, color, { drag: 3, seed: n01() * 1000 });
  p.w = n;
}

// ── 먹 한 획 — 먹 방울 · 먹 튐 · 엔소(모양은 ink.ts). 옅어지지 않고 줄고 마른다 ──
// 사건 무게(docs/INK_FX_2026-11-01.md §3): 타격(작은 먹 튐 · 방울 몇) < 층 붕괴 · 가드 · 다침(땅에 눕는 엔소 하나 · 번지는 방울)
// < 완파 · 격파(큰 먹 튐 · 엔소 하나, 포인트 색 속). 포인트 색은 터진 순간(앞 15%)뿐이고 곧 먹으로 마른다.

/** 먹 방울 n개 — a0~a1 방향, s0~s1 속도. lands = 땅에 닿으면 번진다(큰 순간만 — 연타마다 땅이 얼룩지면 지저분하다) */
function drops(x: number, y: number, n: number, a0: number, a1: number, s0: number, s1: number, r: number, life: number, lands = false): void {
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * n01();
    const sp = s0 + (s1 - s0) * n01();
    fill('ink', x + signed() * 4, y + signed() * 3, Math.cos(a) * sp, Math.sin(a) * sp, 1500,
      life * (0.75 + n01() * 0.5), r * (0.55 + n01() * 0.75), PALETTE.INK, { drag: 0.8, c2: lands ? PALETTE.INK : '' });
  }
}

/** 친 쪽(ang)으로 튄 먹 — 맞은 밑면에 묻는다(BACK, 졸라맨 뒤). core = 터진 순간 가운데 포인트 색, n = 튄 방울 수 */
function spat(x: number, y: number, R: number, ang: number, life: number, core = '', n = 5): void {
  const p = fill('spat', x, y, 0, 0, 0, life, R, PALETTE.INK, { rot: ang, seed: n01() * 1000, c2: core });
  p.w = n;
}

/** 흰 별 「깡」 — 먹 테 두른 흰 별(맨 앞). 막아 낸 순간 · 안전모가 깨진 순간뿐, 한 장면에 하나 작게 */
function clang(x: number, y: number, r: number, life: number): void {
  fill('star', x, y, 0, 0, 0, life, r, FLASH_WHITE, { rot: n01() * Math.PI, seed: n01() * 1000 });
}

/** 엔소 충격파 — r0에서 grow만큼 퍼지며 붓이 한 바퀴를 긋고 시작점부터 마른다. w = 굵기 · flat = 세로 배율 · core = 베는 순간 색 */
function ensoAt(x: number, y: number, r0: number, grow: number, life: number, w: number, flat = 1, core = ''): void {
  const p = fill('enso', x, y, 0, 0, grow, life, r0, PALETTE.INK, { rot: n01() * Math.PI * 2, spin: signed() * 0.8, seed: n01() * 1000, c2: core });
  p.w = w;
  p.h = flat;
}

/** 타격 — 맞은 밑면에 위로 튄 작은 먹(포인트 색 속) · 방울 몇. own = 무기가 맞은 자리를 제 그림으로 누른다(오함마 발묵) */
function inkHit(x: number, y: number, k: number, core: string, own: boolean): void {
  if (!own) spat(x + signed() * 5, y + 2, 3.5 + 1.2 * k, -Math.PI / 2 + signed() * 0.45, 0.2, core, 4); // 연타라 작고 짧게
  drops(x, y, Math.round(1.5 + k), -Math.PI / 2 - 1.1, -Math.PI / 2 + 1.1, 180, 360 + 60 * k, 2.2, 0.3);
}

/** 층 붕괴 — 큰 먹 튐 · 땅에 떨어져 번지는 방울. 고리는 긋지 않는다(고리는 큰 완파 · 보스 격파 · 게이지 참만) */
function inkCollapse(x: number, y: number, k: number, core: string, own: boolean): void {
  if (!own) spat(x + signed() * 8, y + 2, 11 + 2 * k, -Math.PI / 2 + signed() * 0.35, 0.3, core, 7);
  drops(x, y, Math.round(4 + 2 * k), -Math.PI / 2 - 1.35, -Math.PI / 2 + 1.35, 240, 520, 2.8, 0.65, true);
}

/** 가드 — 막힌 자리에 작은 흰 별 · 밑면을 따라 좌우로 쳐내는 굵은 먹 획 · 옆으로 튀는 방울 */
function parry(x: number, y: number, air: boolean): void {
  const k = air ? 1.2 : 1;
  clang(x, y, 9 * k, 0.1);
  for (const d of [-1, 1]) {
    inkFlick(x + d * 8, y + 1, d > 0 ? -0.12 : Math.PI + 0.12, 58 * k, 8 * k, 0.26);
    drops(x + d * 8, y, 2, d > 0 ? -0.9 : Math.PI + 0.15, d > 0 ? -0.15 : Math.PI + 0.9, 200, 380, 2.4, 0.4);
  }
}

/** 다침 · 깔림 — 발밑에 눕는 큰 엔소 · 양옆으로 밀려 나오는 마른 먹 가루 · 번지는 방울 몇 */
function crush(x: number, footY: number): void {
  for (const d of [-1, 1]) dryDust(x + d * 18, footY - 6, 16, 10, d * 150, 0.42);
  drops(x, footY - 10, 6, -Math.PI + 0.2, -0.2, 160, 340, 2.6, 0.45, true); // 땅에 떨어져 번진다 — 눌린 자리 웅덩이
}

/** 튕긴 가는 획 — 맞은 자리에서 위로 흩어진다(한 색) */
function sparks(x: number, y: number, n: number, color: string, spread: number, up: number): void {
  for (let i = 0; i < n; i++) {
    fill('spark', x + signed() * 8, y + signed() * 6, signed() * spread, -up - n01() * up, 40,
      0.10 + n01() * 0.12, 3 + n01() * 5, color, { seed: n01() * 1000 });
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
      BUTTER[i % 2],
      { bounce: 2 },
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
    case 'hurt':
      crush(x, y);
      return;
    // 밑면에 머리를 부딪힘 — 마른 먹 가루 한 줌(가드보다 작게)
    case 'headBonk':
      dryDust(x, y, 10, Math.max(5, count >> 1), 0, 0.3);
      return;
    case 'guardBounce':
      parry(x, y, false);
      return;
    case 'guardAirBounce':
      parry(x, y, true);
      return;
    case 'bossDefeat': // 먹 튐 · 엔소는 defeatRings가 따로 — 여기선 부서진 조각만
      shards(x, y, Math.round(count * 0.45), undefined, 2.1);
      return;
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
        p.maxLife = p.life / 0.3; // 그리기 크기(t / 0.3)가 1에서 시작해 0.15초에 0
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
  clang(x, y, 12, 0.12);
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
  dryDust(x, y - 4, 40, 14, 0, 0.4, DUST[1]);
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
    stackBurst(x, y - 40, e.n, pointInk(s.weapon)); // 이벤트 y가 없어 발 높이다 — 마지막 층이 있던 머리 위로 올린다
    return;
  }
  if (e.kind === 'bossDefeat') {
    const by = s.boss ? VIEW.GROUND_Y - s.boss.y : y;
    spawnHitParticles('bossDefeat', VIEW.W / 2, by, JUICE.bossDefeat.particles);
    defeatRings(VIEW.W / 2, by, pointInk(s.weapon));
    return;
  }
  if (e.kind === 'slash') return; // 헛스윙 획은 weaponFx(연장) · bladeFx(대검)가 긋는다
  if (e.kind === 'hit' || e.kind === 'floorCollapse') {
    // 층 조각은 renderer(shatterFloor)가 그 층 그림째 부순다 — 여기선 맞은 자리 먹만
    if (s.gimmick === 'glass') glassBurst(x, y, e.kind === 'floorCollapse' ? JUICE_SYS.GLASS_CHIPS : JUICE_SYS.GLASS_CHIPS_HIT);
    const k = tierK(e.combo ?? s.combo);
    // 오함마는 맞은 자리를 제 발묵으로 누르고, 그라인더는 젖은 먹 대신 불티 · 쇳가루로 갈린다(weaponFx) — 먹 튐을 겹치지 않는다
    const own = s.weapon === 'hammer' || s.weapon === 'grinder';
    if (e.kind === 'floorCollapse') inkCollapse(x, y, k, pointInk(s.weapon), own);
    else inkHit(x, y, k, pointInk(s.weapon), own);
    return;
  }
  if (e.kind === 'gaugeFull') {
    // 필살이 찼다 — 몸을 감는 먹 엔소 하나(필살 예비동작이 긋는 원의 예고). 피어오르는 먹 방울은 weaponFx
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
    clang(x, y, 11, 0.12); // 막아 준 순간 — 작은 흰 별과 작은 엔소
    ensoAt(x, y, 10, 50, 0.28, 5);
    shards(x, y, 5, undefined, 1.1, HAT_WHITE, 'chip');
    dust(x, y, Math.max(0, n - 5));
    return;
  }
  if (e.kind === 'special') return; // 필살은 wazaShow가 그린다
  if (e.kind === 'guardBounce' && s.gimmick === 'ice') iceSparks(x, y, JUICE_SYS.ICE_SPARKS);
  spawnHitParticles(e.kind, x, y, JUICE[e.kind]?.particles ?? 0, e.mat);
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

/** ice 구역: 지면 가드 때 땅을 따라 튀는 차가운(파랑) 가는 획. 엔소는 가드가 이미 하나 긋는다. 노랑 0. */
function iceSparks(x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    fill('spark', x + dir * (6 + n01() * 20), y, dir * (90 + n01() * 140), -30 - n01() * 120, 500,
      0.22 + n01() * 0.14, 9 + n01() * 7, i % 3 === 0 ? PALETTE.INK : PALETTE.BLUE, { seed: n01() * 1000 });
  }
}

/** 완파 — 층수(n)가 클수록 조각 · 방울이 많아진다. 먹 튐은 같은 틱 층 붕괴가 이미 찍었다(겹치면 한 덩이로 뭉친다). 층수 3 이상이면 엔소 하나를 포인트 색 속으로 긋는다 */
function stackBurst(x: number, y: number, n: number | undefined, core: string): void {
  const k = stackScale(n);
  shards(x, y, Math.min(16, Math.round(JUICE.stackDestroy.particles * k * 0.4)), undefined, 1.45 + 0.2 * k);
  const big = (n ?? 0) >= JUICE_SYS.STACK_RING_FLOORS;
  if (big) ensoAt(x, y, 22, 36 + 28 * k, 0.5, 5 + 2.5 * k, 1, core); // 10층(k 1.8)이어도 반지름 ≈ 110 — 화면을 덮지 않는다
  drops(x, y, Math.round(4 + 3 * k), -Math.PI / 2 - 1.5, -Math.PI / 2 + 1.5, 260, 640, 3.4, 0.7, true); // 같은 틱 층 붕괴 방울과 합쳐 덕지덕지해지지 않게
}

/** 번개 착탄 — 땅에서 솟는 먹 줄기(튕긴 획) + 마른 가루 + 땅에 눕는 엔소 하나 */
function boltStrikeBurst(x: number, groundY: number, n: number): void {
  for (let i = 0; i < n; i++) {
    fill('spark', x + signed() * 10, groundY - 2, signed() * 45, -420 - n01() * 320, 900,
      0.18 + n01() * 0.14, 14 + n01() * 8, PALETTE.INK, { seed: n01() * 1000 });
  }
  dust(x, groundY - 4, 6);
  ensoAt(x, groundY - 2, 10, 40, 0.25, 4, 0.3);
}

/** 보스 격파 — 한가운데 큰 먹 튐 하나 · 엔소 하나(포인트 색 속으로 긋는다) · 땅에 번지는 방울 */
function defeatRings(x: number, y: number, core: string): void {
  spat(x, y, 26, -Math.PI / 2, 0.6, core, 9);
  ensoAt(x, y, 44, 170, 0.8, 15, 1, core);
  drops(x, y, 12, -Math.PI / 2 - 1.6, -Math.PI / 2 + 1.6, 300, 700, 3.6, 0.8, true);
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
      if (p.alive && !BACK.has(p.style) && LAYER[p.style] === layer) drawParticle(ctx, p, p.y + cam);
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
  const k = Math.min(1, t / 0.3); // 끝 3할에 오그라든다 — 옅어지지 않는다
  ctx.globalAlpha = 1;
  ctx.fillStyle = p.color;
  ctx.strokeStyle = p.color;
  switch (p.style) {
    case 'spark': {
      // 튕긴 가는 획 — 머리가 굵고 지나온 쪽으로 뾰족하다. 수명이 줄면 짧고 가늘어진다
      const sp = Math.hypot(p.vx, p.vy) || 1;
      const slash = p.size > 16;
      const len = (p.size + sp * (slash ? 0.06 : 0.018)) * (0.35 + 0.65 * t);
      brushLine(ctx, p.x, py, p.x - (p.vx / sp) * len, py - (p.vy / sp) * len, (slash ? 3.4 : 2) * (0.45 + 0.55 * t), 0, 1, 0, p.seed, 0, PRESS.flick);
      return;
    }
    case 'shard': {
      const s = p.size * k;
      ctx.save();
      ctx.translate(p.x, py);
      ctx.rotate(p.rot);
      ctx.fillRect(-s * 0.5, -s * 0.28, s, s * 0.56);
      ctx.restore();
      return;
    }
    case 'chip': {
      const s = p.size * k;
      ctx.save();
      ctx.translate(p.x, py);
      ctx.rotate(p.rot);
      ctx.fillRect(-s * 0.5, -s * 0.35, s, s * 0.7);
      ctx.strokeStyle = PALETTE.INK;
      ctx.lineWidth = 1;
      ctx.strokeRect(-s * 0.5, -s * 0.35, s, s * 0.7);
      ctx.restore();
      return;
    }
    case 'frag': {
      if (!p.img) return;
      const W = Math.ceil(p.w * FRAG_SS);
      const H = Math.ceil(p.h * FRAG_SS);
      ctx.save();
      ctx.translate(p.x, py);
      ctx.rotate(p.rot);
      if (k < 1) ctx.scale(k, k); // 끝 3할에만 오그라든다 — 처음부터 줄면 콘크리트가 종이처럼 가볍다
      ctx.drawImage(p.img, 0, 0, W, H, -p.ax, -p.ay, W / FRAG_SS, H / FRAG_SS);
      ctx.restore();
      return;
    }
    case 'dust': { // 마른 가루 한 점 — 끝 4할에 오그라든다
      ctx.beginPath();
      ctx.arc(p.x, py, p.size * 0.42 * Math.min(1, t / 0.4), 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case 'dry':
      inkDust(ctx, p.x, py, p.size * (1.3 - 0.3 * t), Math.pow(t, 0.6), p.seed, p.w);
      return;
    case 'star':
      drawStar(ctx, p, py, 1 - t);
      return;
    case 'cream': // 버터 방울 — 나는 쪽으로 머리, 끝 3할에 오그라든다
      inkDrop(ctx, p.x, py, p.size * k, Math.atan2(p.vy, p.vx), Math.min(8, Math.hypot(p.vx, p.vy) * 0.015) * k);
      return;
    case 'ink': { // 머리는 끝 35%에만 줄고, 꼬리는 빠를수록 길다(늘어남)
      const r = p.size * Math.min(1, t / 0.35);
      inkDrop(ctx, p.x, py, r, Math.atan2(p.vy, p.vx), Math.min(16, Math.hypot(p.vx, p.vy) * 0.02) * (r / p.size) + r * 0.4);
      return;
    }
    case 'splat':
      inkSplat(ctx, p.x, py, p.size, Math.pow(t, 0.6), p.seed);
      return;
    case 'spat': {
      // 친 쪽으로 튄 먹 — 부풀었다 오그라든다(popScale). 터진 순간(앞 15%)엔 가운데가 포인트 색
      const u = 1 - t;
      const R = p.size * popScale(u);
      spatter(ctx, p.x, py, R, p.rot, p.seed, p.w);
      if (p.c2 && u < 0.15) {
        ctx.fillStyle = p.c2;
        spatter(ctx, p.x, py, R * 0.5, p.rot, p.seed, 0);
      }
      return;
    }
    case 'enso': {
      // 빨리 퍼지다 선다 · 앞 16%에 붓이 한 바퀴를 긋는다 · 30%부터 시작점이 말라 꼬리가 머리를 쫓는다 · 마를수록 세 갈래(비백)
      const u = 1 - t;
      const r = p.size + p.g * (1 - (1 - u) ** 3);
      const head = Math.min(1, u / 0.16);
      const tail = u < 0.3 ? 0 : ((u - 0.3) / 0.7) ** 1.15;
      const dry = Math.min(1, Math.max(0, (u - 0.18) / 0.45));
      const w = p.w * (1 - 0.45 * u);
      const a0 = p.rot + p.spin * (p.maxLife - p.life);
      if (p.c2 && u < 0.12) {
        ctx.fillStyle = PALETTE.INK; // 포인트 색 획엔 먹 테 — 아이보리 위에서도 읽히게
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

/** 흰 별 「깡」 — 들쭉날쭉한 흰 별 + 잉크 외곽. 첫 프레임이 가장 크고 줄어든다(옅어지지 않는다). */
function drawStar(ctx: CanvasRenderingContext2D, p: Particle, py: number, u: number): void {
  const R = p.size * (1.15 - 0.75 * u);
  const spikes = 10;
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
}
