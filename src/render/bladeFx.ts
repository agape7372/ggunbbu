// 대검 이펙트 — 칼마다 베기 자국·타격·층 깨기·완파 마무리·칼 기운. 렌더 전용(core·히트스톱 무관), effects.ts와 따로 도는 풀.
// effects.ts가 이벤트·적분·리셋 때 이 모듈을 부르고, 그리기는 renderer가 drawEffects 바로 뒤에 부른다(파편보다 위).
// ★좌표 계약은 effects.ts와 같다(BL-09) — 월드 좌표로 저장하고 drawBladeFx(ctx, cam)가 그릴 때 cam을 한 번 더한다.
// 대검은 모양 값이라 비쌀수록 화려하다 — 450~900 칼은 칼마다 다른 타격·붕괴·완파, 1200부터 칼 기운과 완파 물들임이 붙는다.
// 콤보 50·100·200에서 한 단씩 커지고(100부터 겹 베기), 고비(50·100·200·500·999)를 넘는 타격은 한 번 크게 터진다.
// 연장 넷·필살 셋·게이지 참·콤보 끊김·깔림 탈출·마스크 도트와 연타 줄 박자는 weaponFx.ts — 이 풀과 뿌리개를 빌려 쓴다.

import type { GameState, JuiceEvent, WeaponId } from '../core/types';
import { PALETTE, TICK, VIEW } from '../config';
import { comboMilestone } from '../audio/consume';
import { drawGreatArc, greatArcPoint, greatLook, playerBlade, twinkleStar, type GreatLook } from './sprites';
import * as fx from './screenfx';
import { drawWeaponBit, resetWeaponFx, weaponReact } from './weaponFx';

/** cut 베기 자국 · ghost 참격 잔상 · spark 불꽃 · shard 마름모 조각 · ring 퍼지는 고리 · ember 불씨 · fire 불덩이 · wisp 검은 불꽃 ·
 *  flake 눈송이 · twinkle 반짝 별 · coin 동전·리벳 · bolt 번개 · burst 가시 별·얼음 결정 · rays 빛살 · gear 톱날 · plate 테이프·철골 토막 · sign 경고판
 *  — 아래 줄은 weaponFx가 그린다: pix 마스크 도트 · hex 육각 방패 · crack 잉크 균열 · fold 접힌 종이 빛살 · hook 갈고리 베기 ·
 *  nail 못·나사 · disc 원판 잔상 · chunk 쇳덩이 · arc 끊어진 고리 토막 */
export type Kind =
  | 'cut' | 'ghost' | 'spark' | 'shard' | 'ring' | 'ember' | 'fire' | 'wisp' | 'flake'
  | 'twinkle' | 'coin' | 'bolt' | 'burst' | 'rays' | 'gear' | 'plate' | 'sign'
  | 'pix' | 'hex' | 'crack' | 'fold' | 'hook' | 'nail' | 'disc' | 'chunk' | 'arc';

/** 그리는 순서 — 잔상·빛살·고리·불덩이가 뒤, 베기 자국이 가운데, 튀는 알갱이가 맨 앞 */
const LAYER: Record<Kind, number> = {
  ghost: 0, rays: 0, ring: 0, gear: 0, fire: 0, burst: 0, crack: 0, fold: 0, hex: 0, disc: 0,
  cut: 1, sign: 1, bolt: 1, hook: 1, arc: 1,
  spark: 2, shard: 2, ember: 2, wisp: 2, flake: 2, twinkle: 2, coin: 2, plate: 2, pix: 2, nail: 2, chunk: 2,
};

export interface Bit {
  alive: boolean;
  k: Kind;
  x: number; y: number; vx: number; vy: number; g: number; drag: number;
  life: number; max: number;
  size: number; rot: number; spin: number;
  c1: string; c2: string;
  /** 둘째 치수 — cut 두께 · ring 퍼지는 폭 · burst 가시 수 · rays 줄 수 · plate 세로 비 · spark 굵기 */
  v: number;
  /** 표식 — cut 빗금 · ring 세로 배율(1 = 원) · coin 리벳 · plate 철골 · burst 얼음 */
  a: number;
  bounce: number;
  seed: number;
  /** ghost: 어느 칼의 호인가 */
  w: WeaponId;
  /** 필살 그림 — 풀이 넘쳐도 덮지 않는다(keepBits) */
  keep: boolean;
}

const POOL = 192;
const GROUND = VIEW.GROUND_Y;
const TAU = Math.PI * 2;
const INK = PALETTE.INK;
export const HOT = '#FFF6D0';                         // 불꽃 속 — 흰빛 노랑
export const SPARK = '#FF9A1F';                       // 쇠 불꽃 겉
const FIRE = ['#E0401E', '#FF9A1F', '#FFE27A'] as const; // 불덩이 겉·가운데·속
const ICE = '#E8F8FF';                                // 얼음 속
const GOLD_HI = '#FFF1B8';                            // 동전 테 빛
const RAY = '#FFE27A';                                // 빛살

export const pool: Bit[] = Array.from({ length: POOL }, (): Bit => ({
  alive: false, k: 'spark', x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, life: 0, max: 1,
  size: 1, rot: 0, spin: 0, c1: INK, c2: INK, v: 0, a: 0, bounce: 0, seed: 0, w: 'iron', keep: false,
}));
let allocAt = 0;
let live = 0;
let fxSeed = 7;
/** 칼 기운 — 지난 번 뿜은 뒤 흐른 초 · 몇 번째인가 */
let auraT = 0;
let auraN = 0;
/** 지난 타격의 콤보 — 고비를 넘는 타격을 고른다 */
let lastCombo = 0;

export function n01(): number {
  fxSeed = (Math.imul(fxSeed, 1103515245) + 12345) & 0x7fffffff;
  return (fxSeed >>> 8) / 0x7fffff;
}
export const sgn = (): number => n01() * 2 - 1;

function take(): Bit {
  for (let k = 0; k < POOL; k++) {
    const i = (allocAt + k) % POOL;
    if (!pool[i].alive) {
      allocAt = (i + 1) % POOL;
      pool[i].alive = true;
      live += 1;
      pool[i].keep = keeping;
      return pool[i];
    }
  }
  // 넘치면 가장 오래된 칸부터 덮되 필살 그림은 건너뛴다 — 한 묶음(필살 + 층 깨기 여섯 + 완파)이 풀을 넘으면 맨 앞 필살부터 덮였다
  let i = allocAt;
  for (let k = 0; k < POOL && pool[i].keep; k++) i = (i + 1) % POOL;
  allocAt = (i + 1) % POOL;
  pool[i].keep = keeping;
  return pool[i];
}

let keeping = false;
/** 이 안에서 뿌린 조각은 풀이 넘쳐도 덮이지 않는다 — 필살 그림(weaponFx) */
export function keepBits(draw: () => void): void {
  keeping = true;
  try {
    draw();
  } finally {
    keeping = false;
  }
}

interface Opt {
  life: number; size: number; c1: string; c2?: string;
  vx?: number; vy?: number; g?: number; drag?: number; rot?: number; spin?: number;
  v?: number; a?: number; bounce?: number; w?: WeaponId;
}

export function put(k: Kind, x: number, y: number, o: Opt): void {
  const p = take();
  p.k = k;
  p.x = x;
  p.y = y;
  p.vx = o.vx ?? 0;
  p.vy = o.vy ?? 0;
  p.g = o.g ?? 0;
  p.drag = o.drag ?? 0;
  p.life = o.life;
  p.max = o.life;
  p.size = o.size;
  p.rot = o.rot ?? 0;
  p.spin = o.spin ?? 0;
  p.c1 = o.c1;
  p.c2 = o.c2 ?? o.c1;
  p.v = o.v ?? 0;
  p.a = o.a ?? 0;
  p.bounce = o.bounce ?? 0;
  p.seed = n01() * 1000;
  p.w = o.w ?? 'iron';
}

/** 각(라디안, 0 = 앞, −π/2 = 위)과 속력 → 속도 */
export const vel = (a: number, s: number): { vx: number; vy: number } => ({ vx: Math.cos(a) * s, vy: Math.sin(a) * s });
export const N = (n: number, k: number): number => Math.round(n * k);
type Seg = readonly [number, number, number, number];
const along = (b: Seg, u: number): [number, number] => [b[0] + (b[2] - b[0]) * u, b[1] + (b[3] - b[1]) * u];

// ── 낱개 뿌리개 ──────────────────────────────────────────────

/** 베기 자국 — 친 자리를 가로지르는 렌즈. 앞 15%에 다 뻗고 가늘어지며 사라진다 */
export function cut(x: number, y: number, ang: number, len: number, thick: number, rim: string, core: string, stripes: number, life = 0.2): void {
  put('cut', x, y, { life, size: len, v: thick, rot: ang, c1: rim, c2: core, a: stripes });
}

/** 참격 잔상 — 칼이 지나간 호가 어깨를 축으로 조금 더 돌며 커지고 옅어진다. turn·grow = 연타 줄 박자의 기울기·크기 */
function ghost(w: WeaponId, footX: number, footY: number, alpha: number, life = 0.24, turn = 0, grow = 1): void {
  put('ghost', footX, footY, { life, size: alpha, c1: INK, w, rot: turn, v: grow });
}

export function sparkFan(
  x: number, y: number, n: number, a0: number, a1: number, s0: number, s1: number,
  c1: string, c2: string, g = 900, life = 0.24, size = 5,
): void {
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * (n === 1 ? 0.5 : i / (n - 1)) + sgn() * 0.08;
    put('spark', x + sgn() * 4, y + sgn() * 3, {
      ...vel(a, s0 + n01() * (s1 - s0)), g,
      life: life * (0.7 + n01() * 0.6), size: size * (0.7 + n01() * 0.6), c1, c2, v: 2.6,
    });
  }
}

export function shardSpray(x: number, y: number, n: number, spd: number, size: number, c1: string, c2: string): void {
  for (let i = 0; i < n; i++) {
    put('shard', x + sgn() * 12, y + sgn() * 5, {
      ...vel(-Math.PI / 2 + sgn() * 1.35, spd * (0.45 + n01() * 0.7)), g: 1100,
      life: 0.45 + n01() * 0.35, size: size * (0.7 + n01() * 0.6), rot: sgn() * 3, spin: sgn() * 14, c1, c2,
    });
  }
}

export function ring(x: number, y: number, r0: number, grow: number, life: number, color: string, flat = 1): void {
  put('ring', x, y, { life, size: r0, v: grow, c1: color, a: flat });
}

function embers(x: number, y: number, n: number, spread: number, rise: number, c1: string = FIRE[1], c2: string = FIRE[2]): void {
  for (let i = 0; i < n; i++) {
    put('ember', x + sgn() * spread, y + sgn() * spread * 0.5, {
      vx: sgn() * 50, vy: -rise * (0.4 + n01() * 0.8), g: -70, drag: 1.4,
      life: 0.45 + n01() * 0.45, size: 1.5 + n01() * 1.5, c1, c2,
    });
  }
}

function fire(x: number, y: number, size: number, life: number, vy = -40): void {
  put('fire', x, y, { vx: sgn() * 12, vy, drag: 1.5, life, size, c1: FIRE[0] });
}

function flakes(x: number, y: number, n: number, spread: number, edge: string, size = 3.5): void {
  for (let i = 0; i < n; i++) {
    put('flake', x + sgn() * spread, y + sgn() * spread * 0.4, {
      vx: sgn() * 30, vy: 20 + n01() * 40, drag: 0.6,
      life: 0.8 + n01() * 0.6, size: size * (0.7 + n01() * 0.6), rot: n01() * 3, spin: sgn() * 2.5, c1: edge, c2: '#FFFFFF',
    });
  }
}

export function twinkle(x: number, y: number, size: number, life: number, color: string, vy = -30): void {
  put('twinkle', x, y, { vx: sgn() * 20, vy, drag: 2, life, size, c1: color });
}

function coins(x: number, y: number, n: number, spd: number, g: GreatLook): void {
  for (let i = 0; i < n; i++) {
    put('coin', x + sgn() * 10, y, {
      ...vel(-Math.PI / 2 + sgn() * 0.9, spd * (0.55 + n01() * 0.6)), g: 1300,
      life: 0.95 + n01() * 0.4, size: 4 + n01() * 1.6, spin: 12 + n01() * 10, c1: g.blade, c2: g.guard, bounce: 2,
    });
  }
}

function rivets(x: number, y: number, n: number, g: GreatLook): void {
  for (let i = 0; i < n; i++) {
    put('coin', x + sgn() * 10, y, {
      ...vel(-Math.PI / 2 + sgn() * 1.1, 240 + n01() * 200), g: 1400,
      life: 0.7 + n01() * 0.3, size: 2.4 + n01(), c1: g.guard, c2: g.hi, a: 1, bounce: 2,
    });
  }
}

function bolts(x: number, y: number, n: number, len0: number, len1: number, c2: string): void {
  for (let i = 0; i < n; i++) {
    put('bolt', x, y, { life: 0.12 + n01() * 0.07, size: len0 + n01() * (len1 - len0), rot: n01() * TAU, c1: INK, c2 });
  }
}

/** 하늘에서 친 자리로 내리꽂는 번개 */
function strike(x: number, y: number, c2: string): void {
  const sx = x + sgn() * 90;
  const sy = y - 150 - n01() * 90;
  put('bolt', sx, sy, { life: 0.16 + n01() * 0.06, size: Math.hypot(x - sx, y - sy), rot: Math.atan2(y - sy, x - sx), c1: INK, c2 });
}

export function spikes(x: number, y: number, size: number, life: number, fill: string, edge: string, n: number, crystal = 0): void {
  put('burst', x, y, { life, size, v: n, rot: n01() * TAU, c1: fill, c2: edge, a: crystal });
}

function rays(x: number, y: number, n: number, size: number, life: number, g: GreatLook): void {
  put('rays', x, y, { life, size, v: n, rot: n01() * TAU, spin: 1.1, c1: RAY, c2: g.guard });
}

function gear(x: number, y: number, size: number, life: number, g: GreatLook, dir = 1): void {
  put('gear', x, y, { life, size, rot: n01() * TAU, spin: 24 * dir, c1: g.hi, c2: INK });
}

function tape(x: number, y: number, n: number, spd: number): void {
  for (let i = 0; i < n; i++) {
    put('plate', x + sgn() * 14, y + sgn() * 6, {
      ...vel(-Math.PI / 2 + sgn() * 1.3, spd * (0.5 + n01() * 0.7)), g: 1000,
      life: 0.6 + n01() * 0.35, size: 8 + n01() * 4, v: 0.42, rot: sgn() * 3, spin: sgn() * 12, c1: PALETTE.YELLOW, c2: INK, bounce: 1,
    });
  }
}

/** 긴 공사 테이프 한 줄 — 천천히 돌며 팔랑 떨어진다 */
function strip(x: number, y: number, ang: number): void {
  put('plate', x, y, {
    vx: sgn() * 60, vy: -160, g: 420, drag: 1.2,
    life: 0.95, size: 92, v: 0.12, rot: ang, spin: -ang * 1.2, c1: PALETTE.YELLOW, c2: INK,
  });
}

function girders(x: number, y: number, n: number, g: GreatLook): void {
  for (let i = 0; i < n; i++) {
    put('plate', x + sgn() * 16, y, {
      ...vel(-Math.PI / 2 + sgn() * 1.1, 260 + n01() * 160), g: 1300,
      life: 0.7 + n01() * 0.3, size: 26 + n01() * 10, v: 0.3, rot: sgn() * 0.6, spin: sgn() * 7, c1: g.blade, c2: g.guard, a: 1, bounce: 1,
    });
  }
}

function sign(x: number, y: number, size: number, life: number): void {
  put('sign', x, y, { vy: -24, drag: 1, life, size, c1: PALETTE.YELLOW, c2: INK });
}

// ── 칼마다 ───────────────────────────────────────────────────

interface Recipe {
  /** 베기 자국 [테두리, 속] */
  cut(g: GreatLook): readonly [string, string];
  /** 타격 · 층 깨기 · 완파 — (x, y) = 친 자리, k = 콤보 단 */
  hit(x: number, y: number, k: number, g: GreatLook): void;
  floor(x: number, y: number, k: number, g: GreatLook): void;
  destroy(x: number, y: number, k: number, g: GreatLook): void;
  /** 헛스윙 — 칼끝 자리에서 한두 점 */
  whiff?(x: number, y: number, g: GreatLook): void;
  /** 칼 기운 — b = 칼날(손 → 칼끝, 월드), n = 몇 번째 */
  aura?(b: Seg, n: number, g: GreatLook): void;
  every?: number;
  /** 완파 화면 물들임 */
  tint?: fx.FlashStage;
}

const RECIPES: Record<GreatLook['shape'], Recipe> = {
  // 무쇠 — 군더더기 없이 묵직하게: 쇠 불꽃 · 잉크 고리 · 쇳조각
  plain: {
    cut: (g) => [g.guard, g.hi],
    hit(x, y, k, g) {
      sparkFan(x, y, N(3, k), -2.6, -0.5, 260, 420, SPARK, HOT, 900, 0.2, 6);
      ring(x, y, 5, 26, 0.16, INK);
      shardSpray(x, y, N(2, k), 260, 5, g.blade, g.guard);
    },
    floor(x, y, k, g) {
      ring(x, y, 8, 46, 0.24, INK);
      ring(x, y, 4, 82, 0.34, g.guard);
      shardSpray(x, y, N(6, k), 340, 7, g.blade, g.guard);
      sparkFan(x, y, N(6, k), -2.9, -0.25, 300, 520, SPARK, HOT, 900, 0.26, 7);
    },
    destroy(x, y, k, g) {
      ring(x, y, 10, 92, 0.36, INK);
      ring(x, y, 6, 150, 0.5, g.guard);
      shardSpray(x, y, N(10, k), 420, 8, g.blade, g.guard);
      sparkFan(x, y, N(10, k), -3, -0.15, 340, 620, SPARK, HOT, 900, 0.3, 8);
    },
  },
  // 톱날 — 도는 톱날 잔상과 불꽃 분수
  saw: {
    cut: (g) => [g.guard, '#FFE9A8'],
    hit(x, y, k, g) {
      gear(x, y, 13, 0.2, g);
      sparkFan(x + 4, y, N(6, k), -1.45, -0.35, 320, 540, SPARK, HOT, 1000, 0.22, 5);
      shardSpray(x, y, N(2, k), 200, 3.5, g.hi, g.guard);
    },
    floor(x, y, k, g) {
      gear(x, y, 22, 0.3, g);
      sparkFan(x, y, N(14, k), -2.7, -0.45, 380, 700, SPARK, HOT, 1100, 0.36, 7);
      ring(x, y, 6, 50, 0.24, g.guard);
    },
    destroy(x, y, k, g) {
      gear(x - 30, y, 28, 0.45, g);
      gear(x + 30, y + 10, 18, 0.4, g, -1);
      sparkFan(x, y, N(22, k), -3.1, -0.05, 400, 820, SPARK, HOT, 1100, 0.42, 8);
      ring(x, y, 8, 110, 0.4, g.guard);
    },
    whiff(x, y) {
      sparkFan(x, y, 2, -1.6, -0.9, 200, 300, SPARK, HOT, 900, 0.14, 4);
    },
  },
  // 공사중 — 빗금 베기 · 테이프 토막 · 경고판
  stripe: {
    cut: () => [INK, PALETTE.YELLOW],
    hit(x, y, k) {
      tape(x, y, N(3, k), 260);
      shardSpray(x, y, N(2, k), 240, 4.5, PALETTE.YELLOW, INK);
    },
    floor(x, y, k) {
      sign(x + 26, y - 18, 15, 0.5);
      tape(x, y, N(5, k), 340);
      ring(x, y, 6, 56, 0.26, INK);
    },
    destroy(x, y, k) {
      sign(x, y - 30, 26, 0.72);
      tape(x, y, N(9, k), 420);
      strip(x - 40, y + 10, 0.35);
      strip(x + 40, y - 10, -0.4);
      ring(x, y, 8, 120, 0.42, INK);
    },
  },
  // 철골 — 튀는 리벳 · 날아가는 철골 토막 · 땅울림
  beam: {
    cut: (g) => [g.guard, g.hi],
    hit(x, y, k, g) {
      rivets(x, y, N(2, k), g);
      ring(x, y, 5, 24, 0.16, g.guard);
    },
    floor(x, y, k, g) {
      girders(x, y, 2, g);
      rivets(x, y, N(4, k), g);
      ring(x, GROUND, 8, 70, 0.34, g.guard, 0.22);
      ring(x, y, 6, 50, 0.24, g.guard);
    },
    destroy(x, y, k, g) {
      girders(x, y, 4, g);
      rivets(x, y, N(8, k), g);
      ring(x, GROUND, 10, 150, 0.5, g.guard, 0.2);
      ring(x, GROUND, 4, 96, 0.38, g.blade, 0.24);
      ring(x, y, 10, 120, 0.42, g.guard);
    },
  },
  // 화염 — 불덩이와 오르는 불씨, 칼에서도 불씨가 오른다
  wave: {
    cut: (g) => [g.blade, FIRE[2]],
    hit(x, y, k) {
      fire(x, y, 8 + k, 0.28);
      embers(x, y, N(4, k), 10, 120);
    },
    floor(x, y, k) {
      fire(x, y, 17, 0.42);
      fire(x - 22, y - 10, 9, 0.36, -70);
      fire(x + 24, y - 6, 8, 0.34, -80);
      embers(x, y, N(10, k), 22, 170);
      ring(x, y, 8, 60, 0.26, FIRE[0]);
    },
    destroy(x, y, k) {
      fire(x, y, 26, 0.6);
      fire(x - 40, y + 12, 16, 0.5);
      fire(x + 42, y + 6, 15, 0.5);
      embers(x, y, N(18, k), 50, 220);
      ring(x, y, 10, 130, 0.45, FIRE[0]);
    },
    whiff(x, y) {
      embers(x, y, 3, 6, 90);
    },
    aura(b) {
      const [x, y] = along(b, 0.35 + n01() * 0.65);
      embers(x, y, 1, 2, 50);
    },
    every: 0.07,
    tint: { color: '#FF9A3C', a: 0.2, ticks: 4 },
  },
  // 서리 — 얼음 결정이 터지고 눈이 날린다, 칼에서 반짝이와 눈송이
  crystal: {
    cut: (g) => [g.guard, ICE],
    hit(x, y, k, g) {
      spikes(x, y, 11 + k, 0.2, g.blade, g.guard, 6, 1);
      shardSpray(x, y, N(3, k), 260, 5.5, ICE, g.guard);
      twinkle(x + sgn() * 14, y - 10, 5, 0.3, '#FFFFFF');
    },
    floor(x, y, k, g) {
      spikes(x, y, 20, 0.3, g.blade, g.guard, 6, 1);
      ring(x, y, 8, 64, 0.3, g.glow ?? g.guard);
      shardSpray(x, y, N(8, k), 360, 6.5, ICE, g.guard);
      flakes(x, y, N(6, k), 50, g.guard);
    },
    destroy(x, y, k, g) {
      spikes(x - 20, y, 28, 0.42, g.blade, g.guard, 6, 1);
      spikes(x + 26, y - 14, 18, 0.36, g.blade, g.guard, 6, 1);
      shardSpray(x, y, N(12, k), 440, 7, ICE, g.guard);
      flakes(x, y - 90, N(14, k), 120, g.guard, 4.5);
      ring(x, y, 10, 130, 0.45, g.glow ?? g.guard);
    },
    whiff(x, y, g) {
      twinkle(x, y, 4, 0.25, '#FFFFFF');
      flakes(x, y, 1, 4, g.guard);
    },
    aura(b, n, g) {
      const [x, y] = along(b, 0.35 + n01() * 0.65);
      if (n % 2) twinkle(x, y, 2.8, 0.35, '#FFFFFF', 0);
      else flakes(x, y, 1, 2, g.guard, 2.4);
    },
    every: 0.16,
    tint: { color: '#CFF1FF', a: 0.28, ticks: 5 },
  },
  // 흑철 — 검은 번개와 붉은 날 조각, 칼에서 검붉은 기운
  jag: {
    cut: (g) => [INK, g.edge ?? PALETTE.RED],
    hit(x, y, k, g) {
      const edge = g.edge ?? PALETTE.RED;
      bolts(x, y, N(2, k), 26, 40, edge);
      shardSpray(x, y, N(3, k), 260, 5, g.blade, edge);
      spikes(x, y, 10, 0.16, INK, edge, 9);
    },
    floor(x, y, k, g) {
      const edge = g.edge ?? PALETTE.RED;
      spikes(x, y, 19, 0.26, INK, edge, 11);
      bolts(x, y, N(5, k), 40, 70, edge);
      shardSpray(x, y, N(6, k), 340, 6.5, g.blade, edge);
      ring(x, y, 8, 60, 0.26, edge);
    },
    destroy(x, y, k, g) {
      const edge = g.edge ?? PALETTE.RED;
      for (let i = 0; i < N(4, k); i++) strike(x + sgn() * 30, y, edge);
      bolts(x, y, N(5, k), 60, 100, edge);
      spikes(x - 18, y, 26, 0.34, INK, edge, 13);
      spikes(x + 30, y - 16, 16, 0.3, INK, edge, 9);
      shardSpray(x, y, N(10, k), 440, 7, g.blade, edge);
    },
    whiff(x, y, g) {
      bolts(x, y, 1, 14, 22, g.edge ?? PALETTE.RED);
    },
    aura(b, n, g) {
      const edge = g.edge ?? PALETTE.RED;
      const [x, y] = along(b, 0.35 + n01() * 0.65);
      if (n % 5 === 4) bolts(x, y, 1, 10, 16, edge);
      else put('wisp', x + sgn() * 2, y, { vx: sgn() * 14, vy: -50 - n01() * 40, drag: 1.2, life: 0.5 + n01() * 0.3, size: 3 + n01() * 2, c1: INK, c2: edge });
    },
    every: 0.1,
    tint: { color: INK, a: 0.22, ticks: 3 },
  },
  // 황금 — 빛살 · 동전 소나기 · 반짝 별, 칼날 위로 반짝이 흐른다
  royal: {
    cut: (g) => [g.guard, g.hi],
    hit(x, y, k, g) {
      coins(x, y, N(2, k), 260, g);
      twinkle(x + sgn() * 16, y - 8 - n01() * 10, 5, 0.3, g.hi);
      twinkle(x + sgn() * 16, y - 8 - n01() * 10, 4, 0.26, g.hi);
    },
    floor(x, y, k, g) {
      rays(x, y, 12, 46, 0.36, g);
      coins(x, y, N(9, k), 380, g);
      for (let i = 0; i < 3; i++) twinkle(x + sgn() * 34, y - n01() * 30, 5, 0.34, g.hi);
      ring(x, y, 8, 64, 0.28, g.blade);
    },
    destroy(x, y, k, g) {
      rays(x, y, 16, 84, 0.6, g);
      coins(x, y, N(16, k), 480, g);
      for (let i = 0; i < 6; i++) twinkle(x + sgn() * 70, y - n01() * 60, 6, 0.45, g.hi);
      ring(x, y, 10, 140, 0.5, g.blade);
    },
    whiff(x, y, g) {
      twinkle(x, y, 4, 0.25, g.hi);
    },
    aura(b, n, g) {
      if (n % 3 === 0) {
        // 손에서 칼끝으로 흐르는 큰 반짝
        const [x0, y0] = along(b, 0.3);
        put('twinkle', x0, y0, { vx: (b[2] - b[0]) * 2.6, vy: (b[3] - b[1]) * 2.6, life: 0.3, size: 6, c1: g.hi });
        return;
      }
      const [x, y] = along(b, 0.35 + n01() * 0.65);
      twinkle(x, y, 3.4, 0.34, g.hi, -12);
    },
    every: 0.2,
    tint: { color: '#FFE27A', a: 0.25, ticks: 5 },
  },
};

/** 콤보 단 — 50·100·200에서 한 단씩 */
export const tierK = (c: number): number => (c >= 200 ? 1.8 : c >= 100 ? 1.5 : c >= 50 ? 1.25 : 1);

/** 콤보 고비를 넘는 타격 — 큰 잔상 · 큰 고리 · 그 칼의 타격을 두 배로 */
function flare(r: Recipe, g: GreatLook, w: WeaponId, c: number, x: number, y: number, footX: number, footY: number): void {
  const m = comboMilestone(lastCombo, c);
  lastCombo = c;
  if (m === null) return;
  ghost(w, footX, footY, 1, 0.42);
  ring(x, y, 12, 120 + m / 8, 0.5, r.cut(g)[0]);
  r.hit(x, y, 2.2, g);
}

/** effects.spawnFromEvent가 이벤트마다 부른다 — 무기·필살 공통은 weaponFx가 먼저, 아래는 대검일 때만 */
export function bladeReact(s: GameState, e: JuiceEvent): void {
  if (e.kind === 'butterCollapse' && e.lane === undefined) return; // 버터바에 깔려 뭉개짐(sim) — 휘두른 게 아니다
  const b = weaponReact(s, e); // 연타 줄 박자 — 대검 베기 자국·잔상도 탄다
  const g = greatLook(s.weapon);
  if (!g) return;
  const r = RECIPES[g.shape];
  const footX = VIEW.LANE_X[s.player.lane];
  const footY = GROUND - s.player.y;
  const swing = s.player.pose === 'attack'; // 필살·깔림 탈출의 붕괴엔 잔상이 없다
  if (e.kind === 'slash') {
    ghost(s.weapon, footX, footY, 0.45, 0.18);
    const [tx, ty] = greatArcPoint(0.1);
    r.whiff?.(footX + tx, footY + ty, g);
    return;
  }
  const x = VIEW.LANE_X[e.lane ?? s.player.lane];
  const c = e.combo ?? s.combo;
  const k = tierK(c);
  const [rim, core] = r.cut(g);
  const stripes = g.shape === 'stripe' ? 1 : 0;
  switch (e.kind) {
    case 'hit':
    case 'bossHit':
    case 'butterCollapse': {
      const y = GROUND - (e.y ?? s.player.y);
      if (swing) ghost(s.weapon, footX, footY, 0.7, 0.24, b.turn, b.k);
      const a = b.ang + sgn() * 0.08; // 내려베기 → 올려베기 → 가로
      const len = (58 + 10 * k) * b.k;
      cut(x + sgn() * 8, y, a, len, 7 * b.k, rim, core, stripes);
      if (c >= 100) cut(x + sgn() * 8, y + 9, a + 0.06, len * 0.8, 5, rim, core, stripes); // 겹 베기
      if (b.n === 3) cut(x + sgn() * 6, y - 8, a - 0.75, len * 0.45, 4, rim, core, stripes); // 줄 끝 — 엇갈린 자국 하나 더
      r.hit(x, y, k, g);
      flare(r, g, s.weapon, c, x, y, footX, footY);
      return;
    }
    case 'floorCollapse': {
      const y = GROUND - (e.y ?? s.player.y);
      if (swing) ghost(s.weapon, footX, footY, 0.8, 0.3);
      cut(x, y, 0.3, 104 + 10 * k, 10, rim, core, stripes, 0.24);
      cut(x, y, -0.62, 80 + 8 * k, 8, rim, core, stripes, 0.22);
      r.floor(x, y, k, g);
      flare(r, g, s.weapon, c, x, y, footX, footY);
      return;
    }
    case 'stackDestroy': {
      const y = footY - 70; // 이벤트 y가 없다 — 마지막 층이 있던 머리 위
      cut(x, y, 0.22, 230, 14, rim, core, stripes, 0.3);
      r.destroy(x, y, Math.max(k, 1.25), g);
      if (r.tint) fx.flash(r.tint);
      return;
    }
    default:
  }
}

/** renderer.drawGame이 플레이어를 그릴 때마다 부른다 — 칼 기운(1200부터) */
export function bladeAura(s: GameState): void {
  const g = greatLook(s.weapon);
  const r = g && RECIPES[g.shape];
  if (!g || !r?.aura || auraT < (r.every ?? 1) || s.over) return;
  auraT = 0;
  const b = playerBlade(s.player.pose, s.player.poseTick);
  if (!b) return;
  const x = VIEW.LANE_X[s.player.lane];
  const y = GROUND - s.player.y;
  r.aura([x + b[0], y + b[1], x + b[2], y + b[3]], auraN++, g);
}

/** 상점 진열 사진 — 이 칼의 층 깨기를 t초 지난 모습으로 한 장. 상점은 로비 탭이라 판 풀을 잠깐 빌린다(앞뒤로 비움) */
export function drawBladeShot(ctx: CanvasRenderingContext2D, w: WeaponId, x: number, y: number, t = 0.14): void {
  const g = greatLook(w);
  if (!g) return;
  resetBladeFx();
  RECIPES[g.shape].floor(x, y, 1, g);
  for (let k = t; k > 1e-6; k -= TICK) updateBladeFx(Math.min(TICK, k));
  drawBladeFx(ctx, 0);
  resetBladeFx();
}

export function resetBladeFx(): void {
  for (const p of pool) p.alive = false;
  live = 0;
  allocAt = 0;
  auraT = 0;
  lastCombo = 0;
  resetWeaponFx();
}

/** effects.updateEffects가 같은 dt로 부른다(히트스톱 중에도 움직인다) */
export function updateBladeFx(dt: number): void {
  const step = dt > 0 ? Math.min(dt, 0.05) : TICK;
  auraT += step;
  if (live <= 0) return;
  for (let i = 0; i < POOL; i++) {
    const p = pool[i];
    if (!p.alive) continue;
    p.life -= step;
    if (p.life <= 0) {
      p.alive = false;
      live -= 1;
      continue;
    }
    if (p.drag > 0) {
      const k = Math.max(0, 1 - p.drag * step);
      p.vx *= k;
      p.vy *= k;
    }
    p.vy += p.g * step;
    p.x += p.vx * step;
    p.y += p.vy * step;
    p.rot += p.spin * step;
    if (p.vy <= 0 || p.y <= GROUND - p.size) continue;
    if (p.bounce > 0) {
      p.y = GROUND - p.size;
      p.vy *= -0.42;
      p.vx *= 0.7;
      p.spin *= 0.6;
      p.bounce -= 1;
    } else if (p.y > GROUND) {
      // 땅 밑으로는 안 간다 — 다 튄 알갱이·눈송이는 땅에 닿으면 곧 사라진다
      p.y = GROUND;
      p.vy = 0;
      p.vx *= 0.5;
      p.life = Math.min(p.life, 0.12);
    }
  }
}

export function drawBladeFx(ctx: CanvasRenderingContext2D, cam = 0): void {
  if (live <= 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < POOL; i++) {
      const p = pool[i];
      if (p.alive && LAYER[p.k] === layer) {
        ctx.globalAlpha = 1;
        drawBit(ctx, p, p.y + cam);
      }
    }
  }
  ctx.restore();
}

// ── 그리기 ───────────────────────────────────────────────────

/** 렌즈 — 길이 L, 두께 T. 굵은 데가 앞(+x)으로 조금 쏠린 붓 자국 */
function lens(ctx: CanvasRenderingContext2D, L: number, T: number): void {
  ctx.beginPath();
  ctx.moveTo(-L / 2, 0);
  ctx.quadraticCurveTo(L * 0.2, -T, L / 2, 0);
  ctx.quadraticCurveTo(L * 0.2, T, -L / 2, 0);
  ctx.closePath();
}

/** 불덩이 — 위로 불혀가 솟은 울퉁불퉁한 덩이(꼭짓점 하나가 꼭대기) */
function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number, wob: number): void {
  ctx.beginPath();
  for (let k = 0; k < 9; k++) {
    const a = -Math.PI / 2 + (k / 9) * TAU;
    const up = Math.max(0, -Math.sin(a));
    const rr = r * (1 + 0.14 * Math.sin(seed + k * 2.4 + wob) + 0.55 * up * up * up);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawBit(ctx: CanvasRenderingContext2D, p: Bit, py: number): void {
  const t = Math.max(0, p.life / p.max); // 1 → 0
  const u = 1 - t;                         // 0 → 1
  const age = p.max - p.life;
  switch (p.k) {
    case 'ghost':
      drawGreatArc(ctx, p.w, p.x, py, p.size * t ** 0.8, p.rot + u * 0.09, p.v * (1 + u * 0.14));
      return;
    case 'cut': {
      const L = p.size * (0.55 + 0.45 * Math.min(1, u / 0.15));
      const T = p.v * (u < 0.15 ? 1 : 1 - (0.8 * (u - 0.15)) / 0.85);
      ctx.globalAlpha = u < 0.55 ? 1 : (1 - u) / 0.45;
      ctx.save();
      ctx.translate(p.x, py);
      ctx.rotate(p.rot);
      lens(ctx, L, T);
      ctx.fillStyle = p.c1;
      ctx.fill();
      lens(ctx, L * 0.88, T * 0.46);
      ctx.fillStyle = p.c2;
      ctx.fill();
      if (p.a) {
        // 공사중 — 속에 잉크 빗금
        ctx.clip();
        ctx.beginPath();
        for (let s = -L / 2; s < L / 2; s += 7) {
          ctx.moveTo(s, -T);
          ctx.lineTo(s + T * 1.4, T);
        }
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    case 'spark': {
      const ang = Math.atan2(p.vy, p.vx);
      const len = p.size + Math.hypot(p.vx, p.vy) * 0.028;
      ctx.globalAlpha = Math.min(1, t * 1.6);
      ctx.beginPath();
      ctx.moveTo(p.x, py);
      ctx.lineTo(p.x - Math.cos(ang) * len, py - Math.sin(ang) * len);
      ctx.strokeStyle = p.c1;
      ctx.lineWidth = p.v;
      ctx.stroke();
      ctx.strokeStyle = p.c2;
      ctx.lineWidth = p.v * 0.45;
      ctx.stroke();
      return;
    }
    case 'shard': {
      const s = p.size;
      ctx.globalAlpha = Math.min(1, t / 0.3);
      ctx.save();
      ctx.translate(p.x, py);
      ctx.rotate(p.rot);
      ctx.beginPath();
      ctx.moveTo(-s, 0);
      ctx.lineTo(0, -s * 0.38);
      ctx.lineTo(s, 0);
      ctx.lineTo(0, s * 0.38);
      ctx.closePath();
      ctx.fillStyle = p.c1;
      ctx.fill();
      ctx.strokeStyle = p.c2;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.restore();
      return;
    }
    case 'ring': {
      const r = p.size + p.v * (1 - (1 - u) * (1 - u)); // 빨리 퍼지다 선다
      ctx.globalAlpha = t;
      ctx.strokeStyle = p.c1;
      ctx.lineWidth = (2 + p.size * 0.12) * t + 0.6;
      ctx.beginPath();
      ctx.ellipse(p.x, py, r, r * p.a, 0, 0, TAU);
      ctx.stroke();
      return;
    }
    case 'ember': {
      const fl = 0.75 + 0.25 * Math.sin(p.seed + age * 40);
      ctx.globalAlpha = t * 0.4;
      ctx.fillStyle = p.c1;
      ctx.beginPath();
      ctx.arc(p.x, py, p.size * 2.3 * fl, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = Math.min(1, t * 1.5);
      ctx.fillStyle = p.c2;
      ctx.beginPath();
      ctx.arc(p.x, py, p.size * fl, 0, TAU);
      ctx.fill();
      return;
    }
    case 'fire': {
      const grow = u < 0.2 ? 0.5 + 0.5 * (u / 0.2) : 1 + (0.3 * (u - 0.2)) / 0.8;
      const R = p.size * grow * (u > 0.65 ? 1 - (0.7 * (u - 0.65)) / 0.35 : 1);
      const wob = age * 14;
      ctx.globalAlpha = u > 0.65 ? 0.1 + (0.9 * (1 - u)) / 0.35 : 1;
      blob(ctx, p.x, py, R, p.seed, wob);
      ctx.fillStyle = FIRE[0];
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.5 + 1.3 * t;
      ctx.stroke();
      blob(ctx, p.x, py + R * 0.12, R * 0.66, p.seed + 3, wob * 1.3);
      ctx.fillStyle = FIRE[1];
      ctx.fill();
      blob(ctx, p.x, py + R * 0.22, R * 0.36, p.seed + 7, wob * 1.6);
      ctx.fillStyle = FIRE[2];
      ctx.fill();
      return;
    }
    case 'wisp': {
      // 검은 불꽃 한 혀 — 붉은 테를 두르고 오르며 줄어든다
      blob(ctx, p.x, py, p.size * (0.35 + 0.65 * t), p.seed, age * 18);
      ctx.fillStyle = p.c1;
      ctx.fill();
      ctx.strokeStyle = p.c2;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      return;
    }
    case 'flake': {
      const s = p.size;
      ctx.globalAlpha = Math.min(1, t / 0.35);
      ctx.save();
      ctx.translate(p.x + Math.sin(p.seed + age * 3.2) * 5, py);
      ctx.rotate(p.rot);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3;
        const cx = Math.cos(a);
        const sy = Math.sin(a);
        ctx.moveTo(0, 0);
        ctx.lineTo(cx * s, sy * s);
        for (const side of [0.7, -0.7]) {
          ctx.moveTo(cx * s * 0.55, sy * s * 0.55);
          ctx.lineTo(cx * s * 0.55 + Math.cos(a + side) * s * 0.32, sy * s * 0.55 + Math.sin(a + side) * s * 0.32);
        }
      }
      ctx.strokeStyle = p.c1;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.strokeStyle = p.c2;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      return;
    }
    case 'twinkle': {
      const r = p.size * Math.sin(Math.PI * Math.sqrt(u)); // 빨리 피고 천천히 진다
      if (r >= 0.4) twinkleStar(ctx, p.x, py, r, p.c1);
      return;
    }
    case 'coin': {
      ctx.globalAlpha = Math.min(1, t / 0.25);
      if (p.a) {
        // 리벳 — 어두운 머리에 빛점 하나
        ctx.fillStyle = p.c1;
        ctx.beginPath();
        ctx.arc(p.x, py, p.size, 0, TAU);
        ctx.fill();
        ctx.fillStyle = p.c2;
        ctx.beginPath();
        ctx.arc(p.x - p.size * 0.32, py - p.size * 0.32, p.size * 0.36, 0, TAU);
        ctx.fill();
        return;
      }
      const sx = Math.max(0.12, Math.abs(Math.cos(p.rot))); // 돈다 — 옆으로 서면 얇아진다
      ctx.beginPath();
      ctx.ellipse(p.x, py, p.size * sx, p.size, 0, 0, TAU);
      ctx.fillStyle = p.c1;
      ctx.fill();
      ctx.strokeStyle = p.c2;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      if (sx > 0.45) {
        ctx.beginPath();
        ctx.ellipse(p.x, py, p.size * sx * 0.55, p.size * 0.55, 0, 0, TAU);
        ctx.strokeStyle = GOLD_HI;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      return;
    }
    case 'bolt': {
      const flick = fx.flashK() > 0 && Math.floor(age * 50 + p.seed) % 3 === 2; // 깜빡 — 번쩍임 0이면 안 깜빡인다
      const jit = Math.floor(age * 30); // 초당 30번 모양이 바뀐다
      const n = Math.max(3, Math.min(9, Math.round(p.size / 14))); // 길수록 마디가 많다
      const amp = Math.min(9, p.size * 0.15);
      ctx.globalAlpha = flick ? 0.35 : 1;
      ctx.save();
      ctx.translate(p.x, py);
      ctx.rotate(p.rot);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let k = 1; k <= n; k++) {
        // 마디마다 반대쪽으로 꺾인다 — 꺾이는 폭만 흔들린다
        const off = k === n ? 0 : (k % 2 ? 1 : -1) * amp * (0.45 + 0.55 * Math.abs(Math.sin(p.seed * 7.3 + k * 12.9898 + jit * 1.7)));
        ctx.lineTo((p.size * k) / n, off);
      }
      ctx.strokeStyle = p.c1;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = p.c2;
      ctx.lineWidth = 1.7;
      ctx.stroke();
      ctx.restore();
      return;
    }
    case 'burst': {
      const R = p.size * (u < 0.18 ? 0.55 + (0.75 * u) / 0.18 : 1.3 - (0.45 * (u - 0.18)) / 0.82);
      const n = p.v;
      ctx.globalAlpha = u > 0.7 ? (1 - u) / 0.3 : 1;
      ctx.beginPath();
      for (let i = 0; i < n * 2; i++) {
        const a = p.rot + (i / (n * 2)) * TAU;
        const tip = p.a ? R : R * (0.7 + 0.3 * Math.abs(Math.sin(p.seed + i * 2.7)));
        const rr = i % 2 === 0 ? tip : R * (p.a ? 0.26 : 0.46);
        const sx = p.x + Math.cos(a) * rr;
        const sy = py + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fillStyle = p.c1;
      ctx.fill();
      ctx.strokeStyle = p.c2;
      ctx.lineWidth = 2;
      ctx.stroke();
      if (p.a) {
        // 얼음 결정 — 가운데 흰 육각
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = p.rot + (i / 6) * TAU;
          ctx.lineTo(p.x + Math.cos(a) * R * 0.2, py + Math.sin(a) * R * 0.2);
        }
        ctx.closePath();
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
      }
      return;
    }
    case 'rays': {
      const L = p.size * (0.35 + 0.65 * Math.min(1, u / 0.25));
      const r0 = L * 0.18;
      ctx.globalAlpha = u > 0.6 ? (1 - u) / 0.4 : 1;
      ctx.beginPath();
      for (let i = 0; i < p.v; i++) {
        const a = p.rot + (i / p.v) * TAU;
        const len = L * (i % 2 ? 0.62 : 1);
        ctx.moveTo(p.x + Math.cos(a - 0.09) * r0, py + Math.sin(a - 0.09) * r0);
        ctx.lineTo(p.x + Math.cos(a) * len, py + Math.sin(a) * len);
        ctx.lineTo(p.x + Math.cos(a + 0.09) * r0, py + Math.sin(a + 0.09) * r0);
        ctx.closePath();
      }
      ctx.fillStyle = p.c1;
      ctx.fill();
      ctx.strokeStyle = p.c2;
      ctx.lineWidth = 1;
      ctx.stroke();
      return;
    }
    case 'gear': {
      const R = p.size * (u < 0.15 ? 0.6 + (0.4 * u) / 0.15 : 1);
      ctx.globalAlpha = 0.85 * (u > 0.55 ? (1 - u) / 0.45 : 1);
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a0 = p.rot + (i / 12) * TAU;
        const a1 = a0 + (TAU / 12) * 0.6; // 기운 이 — 도는 쪽으로 누운 톱니
        ctx.lineTo(p.x + Math.cos(a0) * R * 0.78, py + Math.sin(a0) * R * 0.78);
        ctx.lineTo(p.x + Math.cos(a1) * R, py + Math.sin(a1) * R);
      }
      ctx.closePath();
      ctx.fillStyle = p.c1;
      ctx.fill();
      ctx.strokeStyle = p.c2;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, py, R * 0.24, 0, TAU);
      ctx.stroke();
      return;
    }
    case 'plate': {
      const w = p.size;
      const h = p.size * p.v;
      ctx.globalAlpha = Math.min(1, t / 0.3);
      ctx.save();
      ctx.translate(p.x, py);
      ctx.rotate(p.rot);
      ctx.beginPath();
      ctx.rect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = p.c1;
      ctx.fill();
      if (p.a) {
        // 철골 — 리벳 둘
        ctx.fillStyle = p.c2;
        for (const dx of [-0.3, 0.3]) {
          ctx.beginPath();
          ctx.arc(dx * w, 0, h * 0.2, 0, TAU);
          ctx.fill();
        }
      } else {
        // 공사 테이프 빗금
        ctx.save();
        ctx.clip();
        ctx.beginPath();
        for (let s = -w / 2 - h; s < w / 2; s += h * 1.25) {
          ctx.moveTo(s, h / 2);
          ctx.lineTo(s + h, -h / 2);
        }
        ctx.strokeStyle = p.c2;
        ctx.lineWidth = h * 0.42;
        ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.rect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = p.c2;
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.restore();
      return;
    }
    case 'sign': {
      // 튀어 오르며 한 번 넘쳤다 자리 잡고, 끝에 쪼그라든다
      const pop = u < 0.12 ? (1.3 * u) / 0.12 : u < 0.24 ? 1.3 - (0.3 * (u - 0.12)) / 0.12 : u > 0.82 ? Math.max(0, 1 - (u - 0.82) / 0.18) : 1;
      const s = p.size * pop;
      if (s < 0.5) return;
      ctx.save();
      ctx.translate(p.x, py);
      ctx.rotate(Math.sin(age * 9) * 0.1 * t);
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.95, s * 0.68);
      ctx.lineTo(-s * 0.95, s * 0.68);
      ctx.closePath();
      ctx.fillStyle = p.c1;
      ctx.fill();
      ctx.strokeStyle = p.c2;
      ctx.lineWidth = 2.6;
      ctx.stroke();
      ctx.fillStyle = p.c2;
      ctx.fillRect(-s * 0.1, -s * 0.48, s * 0.2, s * 0.66);
      ctx.beginPath();
      ctx.arc(0, s * 0.42, s * 0.11, 0, TAU);
      ctx.fill();
      ctx.restore();
      return;
    }
    default:
      drawWeaponBit(ctx, p, py);
  }
}
