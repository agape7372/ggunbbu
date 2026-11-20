// 대검 이펙트 — 칼마다 베기 획·타격·층 깨기·완파 마무리·칼 기운. 렌더 전용(core·히트스톱 무관), effects.ts와 따로 도는 풀.
// effects.ts가 이벤트·적분·리셋 때 이 모듈을 부르고, 그리기는 renderer가 drawEffects 바로 뒤에 부른다(파편보다 위).
// ★좌표 계약은 effects.ts와 같다(BL-09) — 월드 좌표로 저장하고 drawBladeFx(ctx, cam)가 그릴 때 cam을 한 번 더한다.
// 「먹 한 획」 2판(11-01, docs/INK_FX_2026-11-01.md §4): 칼이 지나간 길은 붓 획(trail)으로 남아 꼬리부터 마르고,
// 친 자리엔 가는 베기 획 하나와 포인트 색(config WEAPON_INK) 튐, 그 칼이 한 일은 모티프 하나 —
// 무쇠 무거운 방울 · 톱날 톱질 왕복과 톱밥 · 공사중 빗금 띠 · 철골 꺾인 획과 리벳 점 · 화염 말려 오르는 불 혀 · 서리 결정 결과 얼음 금 ·
// 흑철 번지는 먹과 지그재그 마른 획 · 황금 금박. 아이콘(톱니 · 경고판 · 금화 · 빛살 · 번개 · 불덩이 · 눈송이)과 전화면 물들임은 없앴다.
// 알파로 지우지 않는다 — 획은 꼬리부터 깎이고(s0) 마르고, 튐 · 방울은 줄고, 금박은 접혀 사라진다.
// 대검은 모양 값이라 비쌀수록 화려하다 — 1200부터 칼 기운과 완파 때 모티프 한 번 더(tint).
// 콤보 50·100·200에서 한 단씩 커지고(100부터 겹 베기), 고비(50·100·200·500·999)를 넘는 타격은 한 번 크게.
// 연장 넷·게이지 참·콤보 끊김·깔림 탈출·마스크 도트와 연타 줄 박자는 weaponFx.ts — 이 풀과 뿌리개를 빌려 쓴다.

import type { GameState, JuiceEvent, WeaponId } from '../core/types';
import { PALETTE, SEAL_INK, TICK, VIEW, WEAPON_FX, WEAPON_INK } from '../config';
import { comboMilestone } from '../audio/consume';
import { brushArc, brushLine, brushPath, hotCore, inkDrop, inkDust, inkSplat, popScale, PRESS, spatter } from './ink';
import { greatArcPoint, greatLook, playerBlade, type GreatLook } from './sprites';
import { TOOL_RECIPES, drawWeaponBit, resetWeaponFx, toolBurst, weaponReact } from './weaponFx';

/** 먹 조각: stroke 곧은 붓 획 · sweep 호 붓 획 · zig 꺾은 획(철골 · 지그재그 · 얼음 금) · dots 리벳 점 줄 · spat 먹 튐 · drop 먹 방울(땅에 닿으면 번짐) ·
 *  dust 마른 가루 · leaf 금박
 *  — 아래 줄은 weaponFx가 그린다: pix 마스크 도트 · hook 붓 획 · nail 불티 분수 · disc 먹 튐 · chunk 나는 먹 · arc 끊긴 붓 고리 · tap 잘게 떠는 획 · ring 퍼지는 고리 */
export type Kind =
  | 'stroke' | 'sweep' | 'zig' | 'dots' | 'spat' | 'drop' | 'dust' | 'leaf'
  | 'pix' | 'hook' | 'nail' | 'disc' | 'chunk' | 'arc' | 'tap' | 'ring';

/** 그리는 순서 — 가루 · 붓 잔상이 뒤, 베기 획 · 튐이 가운데, 날아가는 방울 · 금박이 맨 앞 */
const LAYER: Record<Kind, number> = {
  disc: 0, dust: 0, sweep: 0,
  hook: 1, arc: 1, tap: 1, ring: 1, stroke: 1, zig: 1, dots: 1, spat: 1,
  pix: 2, nail: 2, chunk: 2, drop: 2, leaf: 2,
};

export interface Bit {
  alive: boolean;
  k: Kind;
  x: number; y: number; vx: number; vy: number; g: number; drag: number;
  life: number; max: number;
  size: number; rot: number; spin: number;
  c1: string; c2: string;
  /** 둘째 치수 — stroke · sweep · zig 두께 · spat · dust · dots 개수(weaponFx 조각은 저마다 다르게 쓴다) */
  v: number;
  /** 표식 — stroke 휨(weaponFx 조각은 저마다 다르게 쓴다) */
  a: number;
  bounce: number;
  seed: number;
  /** 먹 조각 — dry 마름(비백) · pr 누름 곡선(PRESSES 번호) · sw 호 각(sweep) · gr 앞 몇 %에 다 그어지나(spat은 > 0이면 번진다) ·
   *  st 공사중 빗금(stroke · sweep) · drop은 1이면 땅에 번진 먹 · hold 속 색이 남는 몫(0 = 앞 40%, 빗금은 55%) · pts 꺾은 획의 점들(zig, x·y 기준 상대 좌표) */
  dry: number; pr: number; sw: number; gr: number; st: number; hold: number; pts: readonly number[];
  /** 필살 그림 — 풀이 넘쳐도 덮지 않는다(keepBits) */
  keep: boolean;
}

const POOL = 192;
const GROUND = VIEW.GROUND_Y;
const TAU = Math.PI * 2;
const INK = PALETTE.INK;
/** 칼 휘두른 붓 잔상 누름 — 휘두르기 시작한 데서 가늘게 들어가 칼끝 쪽(뒤 3분의 2)에서 가장 굵다 */
const TRAIL = (s: number): number => Math.sin(Math.PI * Math.min(1, Math.max(0, s)) ** 1.6);
const PRESSES = [PRESS.cut, PRESS.flick, PRESS.line, TRAIL] as const;
const NO_PTS: readonly number[] = [];

export const pool: Bit[] = Array.from({ length: POOL }, (): Bit => ({
  alive: false, k: 'stroke', x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, life: 0, max: 1,
  size: 1, rot: 0, spin: 0, c1: INK, c2: INK, v: 0, a: 0, bounce: 0, seed: 0,
  dry: 0, pr: 0, sw: 0, gr: 0, st: 0, hold: 0, pts: NO_PTS, keep: false,
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

/** v가 굵기인 조각 — 키울 때 같이 굵어진다(나머지는 v가 개수 · 납작 배율) */
const WIDE: ReadonlySet<Kind> = new Set<Kind>(['stroke', 'sweep', 'zig', 'hook', 'arc', 'tap', 'ring']);
let big: { k: number; x: number; y: number } | null = null;
/**
 * 크게 — 이 안에서 뿌린 조각은 (x, y)를 축으로 k배(자리 · 크기 · 굵기 · 속도 · 무게)이고 WEAPON_FX.LIFE배 오래 산다. 땅 밑으로는 안 간다.
 * 친 자리 그림만 이 안에서 뿌린다 — 칼 잔상은 칼 길이 그대로라 밖에서 긋는다
 */
export function scaled(x: number, y: number, k: number, draw: () => void): void {
  const was = big;
  big = { k, x, y };
  try {
    draw();
  } finally {
    big = was;
  }
}

/** 둘째 박자 — dt초 뒤에 뿌린다(전설 무기 그림이 한꺼번에 터지지 않고 차례로 펼쳐진다). 부른 때의 크기 배율 · 필살 표식을 그대로 쓴다 */
const queue: { t: number; big: { k: number; x: number; y: number } | null; keep: boolean; draw: () => void }[] = [];
export function later(dt: number, draw: () => void): void {
  if (dt <= 0) draw();
  else queue.push({ t: dt, big, keep: keeping, draw });
}
function runQueue(step: number): void {
  for (let i = queue.length - 1; i >= 0; i--) {
    const q = queue[i];
    q.t -= step;
    if (q.t > 0) continue;
    queue.splice(i, 1);
    const [wasBig, wasKeep] = [big, keeping];
    big = q.big;
    keeping = q.keep;
    try {
      q.draw();
    } finally {
      big = wasBig;
      keeping = wasKeep;
    }
  }
}

interface Opt {
  life: number; size: number; c1: string; c2?: string;
  vx?: number; vy?: number; g?: number; drag?: number; rot?: number; spin?: number;
  v?: number; a?: number; bounce?: number;
  dry?: number; pr?: number; sw?: number; gr?: number; st?: number; hold?: number; pts?: readonly number[];
}

export function put(k: Kind, x: number, y: number, o: Opt): void {
  const p = take();
  const K = big ? big.k : 1;
  if (big && K !== 1) {
    x = big.x + (x - big.x) * K;
    y = Math.min(GROUND - 1, big.y + (y - big.y) * K);
  }
  p.k = k;
  p.x = x;
  p.y = y;
  p.vx = (o.vx ?? 0) * K;
  p.vy = (o.vy ?? 0) * K;
  p.g = (o.g ?? 0) * K;
  p.drag = o.drag ?? 0;
  p.life = o.life * (K !== 1 ? WEAPON_FX.LIFE : 1);
  p.max = p.life;
  p.size = o.size * K;
  p.rot = o.rot ?? 0;
  p.spin = o.spin ?? 0;
  p.c1 = o.c1;
  p.c2 = o.c2 ?? o.c1;
  p.v = (o.v ?? 0) * (WIDE.has(k) ? K : 1);
  p.a = o.a ?? 0;
  p.bounce = o.bounce ?? 0;
  p.dry = o.dry ?? 0;
  p.pr = o.pr ?? 0;
  p.sw = o.sw ?? 0;
  p.gr = o.gr ?? 0;
  p.st = o.st ?? 0;
  p.hold = o.hold ?? 0;
  p.pts = o.pts ? (K !== 1 ? o.pts.map((q) => q * K) : o.pts) : NO_PTS;
  p.seed = n01() * 1000;
}

/** 각(라디안, 0 = 앞, −π/2 = 위)과 속력 → 속도 */
export const vel = (a: number, s: number): { vx: number; vy: number } => ({ vx: Math.cos(a) * s, vy: Math.sin(a) * s });
export const N = (n: number, k: number): number => Math.round(n * k);
type Seg = readonly [number, number, number, number];
const along = (b: Seg, u: number): [number, number] => [b[0] + (b[2] - b[0]) * u, b[1] + (b[3] - b[1]) * u];

// ── 먹 뿌리개 ────────────────────────────────────────────────

interface StrokeOpt { life?: number; dry?: number; pr?: number; bend?: number; stripes?: number; gr?: number; hold?: number; vx?: number; vy?: number }

/** 곧은 붓 획 — (x0,y0) 댄 곳 → (x1,y1) 뗀 곳. core = 벤 순간 속 색('' = 없음) */
export function line(x0: number, y0: number, x1: number, y1: number, w: number, core: string, o: StrokeOpt = {}): void {
  put('stroke', x0, y0, {
    life: o.life ?? 0.22, size: Math.hypot(x1 - x0, y1 - y0), rot: Math.atan2(y1 - y0, x1 - x0), v: w, a: o.bend ?? 0,
    c1: INK, c2: core, dry: o.dry ?? 0.15, pr: o.pr ?? 0, st: o.stripes ?? 0, gr: o.gr ?? 0, hold: o.hold, vx: o.vx, vy: o.vy,
  });
}

/** 가운데 (x,y)를 지나는 ang 방향 붓 획 */
export function stroke(x: number, y: number, ang: number, len: number, w: number, core: string, o: StrokeOpt = {}): void {
  const dx = (Math.cos(ang) * len) / 2;
  const dy = (Math.sin(ang) * len) / 2;
  line(x - dx, y - dy, x + dx, y + dy, w, core, o);
}

/** 호 붓 획 — 중심 (cx,cy) 반지름 r, a0에서 sw만큼 */
function sweep(cx: number, cy: number, r: number, a0: number, sw: number, w: number, core: string, o: StrokeOpt = {}): void {
  put('sweep', cx, cy, {
    life: o.life ?? 0.26, size: r, rot: a0, sw, v: w, a: 1,
    c1: INK, c2: core, dry: o.dry ?? 0.15, pr: o.pr ?? 0, st: o.stripes ?? 0, gr: o.gr ?? 0, hold: o.hold, vx: o.vx, vy: o.vy,
  });
}

/** 칼이 지나간 길 — 대검 참격 호(세 점을 지나는 원)를 따라 그은 붓 획. turn · grow = 연타 줄 박자 */
function trail(footX: number, footY: number, w: number, core: string, o: StrokeOpt, turn = 0, grow = 1): void {
  const [ax, ay] = greatArcPoint(1, 0, turn, grow);
  const [bx, by] = greatArcPoint(0.5, 0, turn, grow);
  const [cx, cy] = greatArcPoint(0, 0, turn, grow);
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-6) {
    line(footX + ax, footY + ay, footX + cx, footY + cy, w, core, { ...o, pr: 3 });
    return;
  }
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const a0 = Math.atan2(ay - uy, ax - ux);
  const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
  const toMid = wrap(Math.atan2(by - uy, bx - ux) - a0);
  let sw = wrap(Math.atan2(cy - uy, cx - ux) - a0);
  if (Math.sign(toMid) !== Math.sign(sw) || Math.abs(toMid) > Math.abs(sw)) sw -= Math.sign(sw) * TAU;
  sweep(footX + ux, footY + uy, Math.hypot(ax - ux, ay - uy), a0, sw, w, core, { ...o, pr: 3 });
}

/** 꺾은 획 — pts = [x0,y0, x1,y1, …](월드)를 한 붓으로. 모서리가 각진 채 머리부터 그어지고 꼬리부터 깎인다 */
export function bent(pts: number[], w: number, core: string, o: StrokeOpt = {}): void {
  const [x, y] = pts;
  put('zig', x, y, {
    life: o.life ?? 0.26, size: 0, v: w, c1: INK, c2: core, dry: o.dry ?? 0.3, pr: o.pr ?? 2, gr: o.gr ?? 0.15, hold: o.hold, vx: o.vx, vy: o.vy,
    pts: pts.map((q, i) => q - (i % 2 ? y : x)),
  });
}

/** 꺾인 잔상(철골) — 참격 호의 시작 · 가운데(바깥으로 밀어 각지게) · 칼끝을 곧은 두 마디 한 붓으로 */
function bentTrail(footX: number, footY: number, w: number, core: string, life: number): void {
  const pts = [greatArcPoint(1), greatArcPoint(0.45, 10), greatArcPoint(0)].flatMap(([x, y]) => [footX + x, footY + y]);
  bent(pts, w, core, { life, pr: 3, dry: 0.25, gr: 0.12 });
}

/** 먹 튐 — 친 쪽(ang)으로. c = 덩이 색(먹 · 포인트 색), core = 앞 20%의 속 색. bleed = 천천히 번져 커진다(흑철) */
function spat(x: number, y: number, R: number, ang: number, c: string, core = '', life = 0.14, n = 5, bleed = false): void {
  put('spat', x, y, { life, size: R, rot: ang, v: n, c1: c, c2: core, gr: bleed ? 1 : 0 });
}

/** 먹 방울 — 부채로 튀어 떨어지고 땅에 닿으면 번졌다 오그라든다. g < 0이면 불씨처럼 오른다 */
export function drops(x: number, y: number, n: number, a0: number, a1: number, s0: number, s1: number, r: number, c: string = INK, g = 1000): void {
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * (n === 1 ? 0.5 : i / (n - 1)) + sgn() * 0.12;
    put('drop', x + sgn() * 4, y + sgn() * 3, {
      ...vel(a, s0 + n01() * (s1 - s0)), g, drag: g < 0 ? 1.6 : 0,
      life: g < 0 ? 0.45 + n01() * 0.3 : 0.9, size: r * (0.7 + n01() * 0.6), c1: c,
    });
  }
}

/** 마른 가루 — 톱밥 · 쇳가루 · 서리. 천천히 흘러가며 점이 작아진다 */
function dust(x: number, y: number, R: number, c: string, life = 0.4, vy = 20, n = 10): void {
  put('dust', x, y, { life, size: R, v: n, c1: c, vx: sgn() * 14, vy, drag: 1.2 });
}

/** 금박 — 접혔다 펴지며 천천히 흔들려 떨어진다 */
function leaves(x: number, y: number, n: number, spread: number, c: string, spd = 220): void {
  for (let i = 0; i < n; i++) {
    put('leaf', x + sgn() * spread, y + sgn() * spread * 0.4, {
      ...vel(-Math.PI / 2 + sgn() * 1.2, spd * (0.4 + n01() * 0.7)), g: 260, drag: 2.2,
      life: 0.8 + n01() * 0.5, size: 3.4 + n01() * 3, rot: n01() * TAU, spin: sgn() * 7, c1: c,
    });
  }
}

/** 벽돌 조각 — 네모 토막(가로로 긴)이 돌며 튀어 떨어져 한 번 튄다. 색 = 포인트 색 속 + 먹 테 */
function bricks(x: number, y: number, n: number, size: number, c: string, spd = 260): void {
  for (let i = 0; i < n; i++) {
    put('pix', x + sgn() * 10, y + sgn() * 4, {
      ...vel(-Math.PI / 2 + sgn() * 1.25, spd * (0.45 + n01() * 0.7)), g: 1100,
      life: 0.62 + n01() * 0.25, size: size * (0.8 + n01() * 0.4), v: 0.55, rot: n01() * TAU, spin: sgn() * 8, c1: i % 3 === 2 ? INK : c, bounce: 1,
    });
  }
}

/** 나란한 가는 획 — 철근 다발이 지나간 자리(n줄, 간격 gap). 가운데 한 줄만 속 색 */
function strands(x: number, y: number, ang: number, len: number, n: number, gap: number, w: number, c: string, life = 0.3): void {
  const nx = -Math.sin(ang);
  const ny = Math.cos(ang);
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * gap;
    const L = len * (0.75 + 0.25 * n01());
    stroke(x + nx * o + Math.cos(ang) * sgn() * 4, y + ny * o, ang, L, w, i === (n >> 1) ? c : '', { pr: 2, dry: 0.55, life: life + n01() * 0.05 });
  }
}

/** 유리 파편 — 날카로운 세모가 돌며 흩어져 떨어진다(접히듯 얇아지며). 셋에 하나는 먹 */
function shards(x: number, y: number, n: number, spread: number, c: string, spd = 300): void {
  for (let i = 0; i < n; i++) {
    put('leaf', x + sgn() * spread, y + sgn() * spread * 0.4, {
      ...vel(-Math.PI / 2 + sgn() * 1.4, spd * (0.45 + n01() * 0.7)), g: 700, drag: 0.8,
      life: 0.5 + n01() * 0.25, size: 3.6 + n01() * 3.4, rot: n01() * TAU, spin: sgn() * 10, c1: i % 3 === 2 ? INK : c, st: 3,
    });
  }
}

/** 번개 가지 — (x, y)에 위에서 len만큼 내리꽂히는 꺾인 한 획(마디 n, 방향이 번갈아 꺾인다) + 중간에서 갈라진 잔가지 하나 */
function bolt(x: number, y: number, len: number, w: number, core: string, life = 0.24, n = 4): void {
  const top = [x + sgn() * len * 0.25, y - len];
  const pts = [top[0], top[1]];
  for (let k = 1; k < n; k++) {
    const f = k / n;
    pts.push(top[0] + (x - top[0]) * f + (k % 2 ? 1 : -1) * len * 0.16 * (0.7 + 0.3 * n01()), top[1] + (y - top[1]) * f);
  }
  pts.push(x, y);
  bent(pts, w, core, { life, dry: 0.15, pr: 1, gr: 0.1 });
  const [bx, by] = [pts[4], pts[5]];
  const d = bx > x ? 1 : -1;
  bent([bx, by, bx + d * len * 0.2, by + len * 0.16, bx + d * len * 0.26, by + len * 0.34], w * 0.55, '', { life: life * 0.8, dry: 0.3, pr: 1 });
}

/** 들어 올림 — 맞은 자리에서 위로 곧게 뻗는 줄 + 그 밑에 걸린 갈고리(J) + 갈고리에 매달린 먹 토막. 셋이 함께 끌려 오르고 토막은 곧 떨어져 한 번 튄다 */
function lift(x: number, y: number, len: number, w: number, core: string, life = 0.3): void {
  line(x, y, x, y - len, w, core, { pr: 1, dry: 0.2, life, vy: -70, hold: 0.3 });
  const r = 4 + w;
  // 갈고리는 맞은 자리 바로 위에 걸린다 — 줄 밑동에서 내려와 왼쪽으로 감아 올린 J
  bent([x, y - r * 2.2, x, y - r * 0.9, x - r * 0.5, y - r * 0.2, x - r * 1.3, y - r * 0.5, x - r * 1.5, y - r * 1.3], w, '', { life: life + 0.1, dry: 0.05, pr: 1, vy: -70 });
  put('pix', x - r * 0.75, y - r * 1.0, { vy: -70, g: 150, life: life + 0.55, size: 3.4 + w * 0.6, v: 0.8, rot: sgn() * 0.2, spin: sgn() * 1.2, c1: INK, bounce: 1 });
}

/** 발묵 — 번지는 먹 한 덩이. 크면 곁에 작게 번지는 둘을 붙인다(튄 방울이 한쪽 부채로만 서면 큰 덩이가 발바닥으로 읽힌다) */
function bleed(x: number, y: number, R: number, c: string, life: number): void {
  spat(x, y, R, -Math.PI / 2 + sgn() * 0.5, INK, c, life, R < 8 ? 4 : 0, true);
  if (R < 8) return;
  spat(x - R * 1.15, y + R * 0.5, R * 0.42, Math.PI + sgn() * 0.4, INK, '', life * 0.85, 2, true);
  spat(x + R * 1.05, y + R * 0.2, R * 0.34, sgn() * 0.4, INK, '', life * 0.8, 2, true);
}

/** 땅을 타는 잔 번개 — 맞은 자리에서 양옆으로 짧게 기는 꺾인 획 둘(한쪽만 속 색) */
function crawl(x: number, y: number, len: number, w: number, core: string): void {
  for (const d of [-1, 1]) zig(x, y, (d > 0 ? 0 : Math.PI) + sgn() * 0.25, len * (0.7 + 0.5 * n01()), w, 4, len * 0.14, d > 0 ? core : '', 0.2, 0.2);
}

/** 거꾸로 오르는 먹 — 방울이 위로 떠오르며 줄어든다(흑철). 셋에 하나는 속 색 */
function rise(x: number, y: number, n: number, spread: number, r: number, c: string): void {
  for (let i = 0; i < n; i++) drops(x + sgn() * spread, y + sgn() * 4, 1, -1.85, -1.3, 50, 120, r * (0.8 + 0.4 * n01()), i % 3 === 0 ? c : INK, -130);
}

/** 금박 비 — 위에서 금박이 천천히 흩날려 내린다 */
function leafRain(x: number, y: number, n: number, wide: number, c: string): void {
  for (let i = 0; i < n; i++) {
    put('leaf', x + sgn() * wide, y - n01() * 40, {
      vx: sgn() * 26, vy: 20 + n01() * 40, g: 120, drag: 1.6,
      life: 0.75 + n01() * 0.4, size: 3.6 + n01() * 3.4, rot: n01() * TAU, spin: sgn() * 6, c1: c,
    });
  }
}

/** 먹 자국 — 크게 번지는 먹 한 덩이(모양으로 번진다 · 속은 포인트 색) + 사방으로 튀는 먹점 */
function blot(x: number, y: number, R: number, c: string, n: number, life = 0.42): void {
  bleed(x, y, R, c, life);
  drops(x, y, n, -Math.PI - 0.3, 0.3, 120, 300, 1.5 + R * 0.08, INK, 900);
}

/** 리벳 점 줄 — (x,y)부터 ang 쪽으로 gap 간격 n개가 차례로 찍힌다 */
function rivets(x: number, y: number, n: number, gap: number, ang: number, core: string, life = 0.42): void {
  put('dots', x, y, { life, size: gap, v: n, rot: ang, c1: INK, c2: core });
}

/** 지그재그 마른 획 — (x,y)에서 ang 쪽으로 len, n마디, 꺾이는 폭 amp */
function zig(x: number, y: number, ang: number, len: number, w: number, n: number, amp: number, core: string, life = 0.26, dry = 0.5): void {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const pts = [x, y];
  for (let k = 1; k <= n; k++) {
    const off = k === n ? 0 : (k % 2 ? 1 : -1) * amp * (0.5 + 0.5 * n01());
    const d = (len * k) / n;
    pts.push(x + ca * d - sa * off, y + sa * d + ca * off);
  }
  bent(pts, w, core, { life, dry });
}

/** 불 혀 — (x,y)에서 h만큼 솟으며 lean 쪽으로 휘는 획. 밑동이 굵고 끝이 뾰족하게 빠지고, 다 그어진 채 위로 흘러 오른다.
 *  core = 벤 순간 속 색('' = 먹 연기 — 마르고 더 휜다) */
function lick(x: number, y: number, h: number, lean: number, w: number, core: string, rise = 80, hold = 0.35): void {
  line(x, y, x + lean, y - h, w, core, {
    pr: 1, bend: (lean >= 0 ? 1 : -1) * h * (core ? 0.28 : 0.45), dry: core ? 0.2 : 0.55,
    gr: 0.3, hold, life: 0.32 + n01() * 0.1, vx: lean * 0.6, vy: -rise,
  });
}

/** 서리 결정 — 친 자리에서 ang 쪽으로 자라는 곧은 줄기 하나와 60°로 갈라진 가지 쌍(pairs) */
function frost(x: number, y: number, ang: number, len: number, pairs: number, c: string): void {
  const w = 2.2 + len * 0.06;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  line(x, y, x + ca * len, y + sa * len, w, c, { pr: 1, life: 0.32, dry: 0.1, gr: 0.18, hold: 0.4 });
  for (let i = 0; i < pairs; i++) {
    const f = 0.28 + i * 0.24;
    const bx = x + ca * len * f;
    const by = y + sa * len * f;
    const L = len * (0.5 - i * 0.12) * (0.85 + n01() * 0.3);
    for (const s of [-1, 1]) {
      const a = ang + (s * Math.PI) / 3;
      line(bx, by, bx + Math.cos(a) * L, by + Math.sin(a) * L, w * 0.7, c, { pr: 1, life: 0.3, dry: 0.1, gr: 0.3, hold: 0.4 });
    }
  }
}

// ── 칼마다 ───────────────────────────────────────────────────

interface Recipe {
  /** 붓 잔상 굵기 · 마름 */
  trail: { w: number; dry: number };
  /** 타격 · 층 깨기 · 완파 — (x, y) = 친 자리, k = 콤보 단, c = 포인트 색 */
  hit(x: number, y: number, k: number, c: string): void;
  floor(x: number, y: number, k: number, c: string): void;
  destroy(x: number, y: number, k: number, c: string): void;
  /** 헛스윙 — 칼끝 자리에서 */
  whiff?(x: number, y: number, c: string): void;
  /** 칼 기운 — b = 칼날(손 → 칼끝, 월드), n = 몇 번째 */
  aura?(b: Seg, n: number, c: string): void;
  every?: number;
  /** 완파 물들임 — 완파 때 그 칼의 모티프가 한 번 더 크게(전화면은 칠하지 않는다) */
  tint?: true;
}

/** 톱질 왕복 — 짧은 가로 획이 번갈아 밀고 당긴다(n번), 맞은 벽에 위로 조금씩 올라가며. 뒤 획일수록 늦게 마른다 */
function sawStrokes(x: number, y: number, n: number, len: number, c: string): void {
  for (let i = 0; i < n; i++) {
    const dir = i % 2 ? -1 : 1;
    const yy = y - 4 - i * 5;
    line(x - (dir * len) / 2, yy, x + (dir * len) / 2, yy - 2, 4.6 - i * 0.5, i === 0 ? c : '', { pr: 2, dry: 0.6, life: 0.22 + i * 0.05, gr: 0.2 });
  }
}

export const RECIPES: Record<GreatLook['shape'], Recipe> = {
  // 무쇠 — 가장 넓은 붓. 덧붙이는 건 무겁게 떨어지는 방울과 마른 가루뿐
  plain: {
    trail: { w: 13, dry: 0.2 },
    hit(x, y, k, c) {
      spat(x + 6, y - 6, 5 * k, -Math.PI / 2 + sgn() * 0.3, INK, c, 0.18, 2); // 뭉툭한 튐 — 방울 둘만
      drops(x, y, N(2, k), -2.3, -0.8, 120, 220, 2.6);
      dust(x, y + 2, 9, INK, 0.3);
    },
    floor(x, y, k, c) {
      spat(x, y, 6 * k, -Math.PI / 2, INK, c, 0.18, 6);
      drops(x, y, N(4, k), -2.6, -0.5, 160, 300, 3);
      dust(x, y + 4, 18, INK, 0.4);
    },
    destroy(x, y, k, c) {
      spat(x, y, 10 * k, -Math.PI / 2, INK, c, 0.22, 8);
      drops(x, y, N(7, k), -2.9, -0.25, 200, 380, 3.2);
      dust(x, y + 6, 30, INK, 0.5);
    },
  },
  // 톱날 — 갈래가 많은 거친 붓, 친 자리엔 톱질 왕복과 녹빛 톱밥
  saw: {
    trail: { w: 10, dry: 1 },
    hit(x, y, k, c) {
      sawStrokes(x, y, 2, 32 * k, c);
      dust(x, y + 8, 10, c, 0.45, 40);
    },
    floor(x, y, k, c) {
      sawStrokes(x, y, 3, 44 * k, c);
      dust(x - 10, y + 10, 15, c, 0.55, 50);
      dust(x + 12, y + 4, 11, INK, 0.45, 40, 7);
    },
    destroy(x, y, k, c) {
      sawStrokes(x - 30, y, 3, 50, c);
      sawStrokes(x + 30, y + 8, 3, 50, c);
      dust(x, y + 8, 30 * k, c, 0.7, 60, 16);
      dust(x, y - 10, 22, INK, 0.55, 40, 10);
    },
    whiff(x, y, c) {
      dust(x, y, 5, c, 0.3, 30, 5);
    },
  },
  // 공사중 — 노랑 속을 먹 빗금이 가르는 띠 획(테이프 결)
  stripe: {
    trail: { w: 10, dry: 0.3 },
    hit(x, y, k) {
      spat(x - 4, y - 6, 4.5 * k, -Math.PI / 2 - 0.5, INK, '', 0.16, 4);
    },
    floor(x, y, k, c) {
      stroke(x, y + 2, -0.42, 70 * k, 11, c, { stripes: 1, pr: 2, life: 0.32 }); // 본 획과 엇갈려 출입 금지 X
      spat(x, y - 8, 6 * k, -Math.PI / 2, INK, '', 0.18, 6);
    },
    destroy(x, y, k, c) {
      stroke(x, y, -0.28, 170 * k, 14, c, { stripes: 1, pr: 2, life: 0.42 });
      stroke(x, y + 8, 0.3, 150 * k, 13, c, { stripes: 1, pr: 2, life: 0.4 });
    },
  },
  // 철골 — 꺾인 획(잔상은 bentTrail), 밑면에 줄지어 찍히는 리벳, 둔한 마른 획
  beam: {
    trail: { w: 10, dry: 0.25 },
    hit(x, y, k, c) {
      rivets(x - 14 * k, y - 5, 3, 9 * k, 0, c);
    },
    floor(x, y, k, c) {
      rivets(x - 30, y - 5, 5, 12, 0, c, 0.5);
      line(x - 40 * k, y + 12, x + 40 * k, y + 13, 8, '', { pr: 2, dry: 0.75, life: 0.3 });
    },
    destroy(x, y, k, c) {
      rivets(x - 60, y - 4, 7, 17, 0, c, 0.6);
      rivets(x - 50, y + 16, 6, 17, 0, c, 0.6);
      line(x - 90 * k, y + 30, x, y - 20, 13, c, { pr: 2, dry: 0.3, life: 0.36 });
      line(x, y - 20, x + 90 * k, y + 26, 13, '', { pr: 1, dry: 0.4, life: 0.36 });
    },
  },
  // 벽돌 — 뭉툭한 넓은 붓. 맞은 자리에서 네모 벽돌 조각이 튀어 떨어지고 붉은 가루가 인다
  block: {
    trail: { w: 13, dry: 0.12 },
    hit(x, y, k, c) {
      bricks(x, y, N(3, k), 6, c);
      dust(x, y + 2, 9, c, 0.36, 30, 8);
    },
    floor(x, y, k, c) {
      bricks(x, y, N(5, k), 7, c, 300);
      dust(x, y + 4, 16, c, 0.45, 40, 12);
      spat(x, y - 4, 5 * k, -Math.PI / 2, INK, '', 0.16, 4);
    },
    destroy(x, y, k, c) {
      bricks(x, y, N(9, k), 8, c, 360);
      dust(x, y + 6, 28, c, 0.6, 50, 16);
      dust(x, y - 10, 18, INK, 0.5, 30, 9);
    },
    whiff(x, y, c) {
      dust(x, y, 5, c, 0.26, 20, 5);
    },
  },
  // 철근 — 가는 갈래 붓. 다발이 지나간 자리에 나란한 가는 획 여럿 + 녹 가루
  strand: {
    trail: { w: 8, dry: 0.75 },
    hit(x, y, k, c) {
      strands(x, y - 2, -0.35 + sgn() * 0.1, 40 * k, 3, 4.5, 2.2, c);
      dust(x, y + 4, 8, c, 0.4, 30, 7);
    },
    floor(x, y, k, c) {
      strands(x, y - 4, -0.3, 64 * k, 4, 5, 2.6, c, 0.34);
      dust(x - 8, y + 6, 14, c, 0.5, 40, 11);
    },
    destroy(x, y, k, c) {
      strands(x, y - 6, -0.3, 110 * k, 5, 6, 3, c, 0.4);
      strands(x, y + 8, 0.32, 90 * k, 4, 6, 2.6, '', 0.38);
      dust(x, y + 6, 26, c, 0.6, 50, 16);
    },
    whiff(x, y, c) {
      strands(x, y, -0.9, 16, 2, 3, 1.4, c, 0.16);
    },
  },
  // 유리 — 얇고 날 선 붓. 맞은 자리에 가는 한 획 + 날카로운 세모 파편이 흩어진다(빛 번짐 · 반짝이 없음)
  pane: {
    trail: { w: 6, dry: 0.1 },
    hit(x, y, k, c) {
      stroke(x, y - 2, -0.5 + sgn() * 0.3, 34 * k, 2.4, c, { life: 0.2, dry: 0.05 });
      shards(x, y, N(4, k), 8, c);
    },
    floor(x, y, k, c) {
      stroke(x, y - 4, -0.4, 58 * k, 3, c, { life: 0.26, dry: 0.05 });
      shards(x, y, N(7, k), 18, c, 340);
      zig(x - 30 * k, y + 2, 0.04, 60 * k, 2.2, 6, 4, '', 0.3, 0.1);
    },
    destroy(x, y, k, c) {
      stroke(x, y - 6, -0.3, 120 * k, 4, c, { life: 0.34, dry: 0.05 });
      shards(x, y, N(13, k), 40, c, 400);
    },
    whiff(x, y, c) {
      shards(x, y, 1, 2, c, 90);
    },
  },
  // 화염 — 친 자리에서 불 혀가 솟아 휘며 오르고(밑동 주홍 → 먹), 한 박자 뒤 먹 연기와 불티가 오른다. 층 깨기 · 완파는 가운데부터 바깥으로 번져 붙는다
  wave: {
    trail: { w: 9, dry: 0.3 },
    hit(x, y, k, c) {
      for (let i = 0; i < 3; i++) lick(x + (i - 1) * 7, y, (i === 1 ? 30 : 19) * k, (i - 1) * 11 + sgn() * 2, 5, c);
      later(0.07, () => {
        lick(x + sgn() * 4, y - 24 * k, 16 * k, sgn() * 8, 3, '');
        drops(x, y - 8, N(3, k), -2.2, -0.9, 60, 140, 1.6, c, -160);
      });
    },
    floor(x, y, k, c) {
      for (let i = 0; i < 5; i++) {
        const d = Math.abs(i - 2);
        later(d * 0.035, () => lick(x + (i - 2) * 12, y, (30 - d * 5 + (i % 2 ? 0 : 6)) * k, (i - 2) * 6 + sgn() * 3, 6, c, 100));
      }
      later(0.1, () => {
        for (let i = 0; i < 2; i++) lick(x + (i ? 14 : -14), y - 28 * k, 24 * k, i ? 8 : -8, 3, '', 110);
        drops(x, y - 6, N(5, k), -2.6, -0.5, 80, 200, 1.7, c, -180);
      });
    },
    destroy(x, y, k, c) {
      for (let i = 0; i < 7; i++) {
        const d = Math.abs(i - 3);
        later(d * 0.04, () => lick(x + (i - 3) * 22, y + (i % 2) * 8, (i % 2 ? 28 : 44) * k, (i - 3) * 5 + sgn() * 4, 7, c, 120));
      }
      // 둘째 물결 — 불 혀 사이에서 한 번 더 솟는다
      later(0.16, () => {
        for (let i = 0; i < 4; i++) lick(x + (i - 1.5) * 30, y - 6, (34 + (i % 2) * 10) * k, sgn() * 8, 5.5, c, 150);
      });
      later(0.24, () => {
        for (let i = 0; i < 3; i++) lick(x + (i - 1) * 40, y - 40 * k, 30 * k, sgn() * 10, 3.4, '', 130);
        drops(x, y - 10, N(9, k), -2.9, -0.25, 100, 260, 1.9, c, -200);
      });
    },
    whiff(x, y, c) {
      lick(x, y, 16, 5, 3.4, c, 70);
      lick(x - 6, y + 6, 10, -3, 2.4, '', 60);
    },
    // 칼 기운 — 날을 따라 불 혀가 늘 타오른다(셋에 하나는 먹 연기 · 다섯 번에 한 번 불티)
    aura(b, n, c) {
      const [x, y] = along(b, 0.2 + n01() * 0.8);
      if (n % 3 === 2) lick(x, y - 8, 16 + n01() * 8, sgn() * 7, 3.4, '', 60);
      else lick(x, y, 16 + n01() * 10, sgn() * 5, 5.4, c, 44, 0.7);
      if (n % 5 === 0) drops(x, y - 6, 1, -1.9, -1.2, 50, 100, 2, c, -150);
    },
    every: 0.07,
    tint: true,
  },
  // 서리 — 친 자리에서 결정이 자라고(곧은 줄기 + 60° 가지) 한 박자 뒤 깨져 세모 조각으로 흩어진다 · 밑면을 따라 각진 얼음 금 · 옥빛 서리 가루
  crystal: {
    trail: { w: 9, dry: 0.2 },
    hit(x, y, k, c) {
      const a = -Math.PI / 2 + sgn() * 0.7;
      frost(x, y, a, 27 * k, 2, c);
      later(0.2, () => shards(x + Math.cos(a) * 14 * k, y + Math.sin(a) * 14 * k, N(3, k), 8, c, 170));
    },
    floor(x, y, k, c) {
      zig(x - 50 * k, y + 2, 0, 100 * k, 3, 7, 4, c, 0.36, 0.15);
      later(0.04, () => frost(x - 22, y - 6, -Math.PI / 2 - 0.55, 30 * k, 2, c));
      later(0.08, () => frost(x + 22, y - 4, -Math.PI / 2 + 0.55, 26 * k, 2, c));
      later(0.26, () => {
        shards(x, y - 18 * k, N(6, k), 22, c, 220);
        dust(x, y, 14, c, 0.5, 30, 9);
      });
    },
    // 얼음 금이 먼저 달리고, 그 위로 결정이 차례로 솟은 뒤 한꺼번에 깨진다
    destroy(x, y, k, c) {
      zig(x - 90, y + 10, 0.05, 180, 3.6, 9, 6, c, 0.44, 0.15);
      [-58, -22, 14, 50].forEach((dx, i) => later(0.04 + i * 0.045, () => frost(x + dx, y - (i % 2) * 10, -Math.PI / 2 + (dx / 58) * 0.5 + sgn() * 0.1, (i % 2 ? 44 : 34) * k, 3, c)));
      later(0.4, () => {
        shards(x, y - 26 * k, N(11, k), 56, c, 300);
        dust(x, y - 10, 26, c, 0.7, 25, 14);
      });
    },
    whiff(x, y, c) {
      frost(x, y, -Math.PI / 2 + sgn() * 0.9, 10, 1, c);
    },
    // 칼 기운 — 날에 서리 결정이 생겼다 사라지고(60° 결) 찬 김이 아래로 가라앉는다
    aura(b, n, c) {
      const [x, y] = along(b, 0.25 + n01() * 0.75);
      const a = (Math.floor(n01() * 6) * Math.PI) / 3;
      if (n % 3 === 1) dust(x, y, 8, c, 0.7, 26, 7);
      else if (b[3] < GROUND - 16 || n % 3 === 2) frost(x, y, a + Math.PI / 6, 15, 1, c);
      else {
        // 칼끝이 땅에 닿아 있으면 땅이 언다 — 칼끝에서 양옆으로 번갈아 얼음 금이 가고 그 끝에 결정 하나가 선다
        const d = (n / 3) % 2 ? 1 : -1;
        const L = 16 + n01() * 12;
        zig(b[2], GROUND - 1, d > 0 ? 0 : Math.PI, L, 2.6, 3, 3, c, 0.5, 0.1);
        later(0.1, () => frost(b[2] + d * L, GROUND - 1, -Math.PI / 2 + d * 0.3, 13, 1, c));
      }
    },
    every: 0.12,
    tint: true,
  },
  // 번개 — 위에서 꺾인 가지 한 획이 내리꽂히고(보라 속) 곧 가는 가지가 한 번 더 친다. 맞은 면을 따라 잔 번개가 긴다. 완파는 연달아 내리꽂는다
  bolt: {
    trail: { w: 9, dry: 0.15 },
    hit(x, y, k, c) {
      bolt(x, y, 48 * k, 4.2, c);
      later(0.07, () => {
        bolt(x + sgn() * 5, y, 40 * k, 2.4, '', 0.16, 3);
        crawl(x, y, 20 * k, 2.4, c);
      });
    },
    floor(x, y, k, c) {
      bolt(x - 14, y, 72 * k, 5, c, 0.28);
      later(0.06, () => bolt(x + 18, y + 4, 56 * k, 3.6, c, 0.24, 3));
      later(0.11, () => {
        crawl(x, y + 2, 38 * k, 3, c);
        dust(x, y, 12, c, 0.4, 20, 8);
      });
    },
    destroy(x, y, k, c) {
      bolt(x - 6, y, 116 * k, 6.5, c, 0.34, 5);
      [[-58, 4, 92, 5], [46, 8, 84, 4.6], [-98, 12, 62, 3.6], [88, 10, 56, 3.4]].forEach(([dx, dy, L, w], i) =>
        later(0.06 * (i + 1), () => bolt(x + dx, y + dy, L * k, w, i < 2 ? c : '', 0.28, 4)));
      later(0.1, () => spat(x, y, 9 * k, -Math.PI / 2, INK, c, 0.2, 6));
      later(0.32, () => bolt(x + sgn() * 30, y + 6, 70 * k, 2.6, c, 0.18, 4)); // 잔뢰
    },
    whiff(x, y, c) {
      zig(x, y, -Math.PI / 2 + sgn() * 0.5, 20, 2.4, 3, 4, c, 0.14, 0.2);
    },
    // 칼 기운 — 날 둘레에 꺾인 가지가 번갈아 튀고, 가끔 날에서 땅으로 가는 가지 하나가 떨어진다
    aura(b, n, c) {
      const [x, y] = along(b, 0.25 + n01() * 0.75);
      const a = Math.atan2(b[3] - b[1], b[2] - b[0]) + (n % 2 ? 1 : -1) * (Math.PI / 2 - 0.5 + sgn() * 0.3);
      zig(x, y, a, 20 + n01() * 10, 3.2, 3, 5, n % 3 ? c : '', 0.18, 0.1);
      if (n % 5 === 2 && y < GROUND - 12) {
        const d = sgn() > 0 ? 1 : -1;
        bent([x, y, x + d * 12, y + (GROUND - y) * 0.45, x + d * 7, y + (GROUND - y) * 0.7, x + d * 16, GROUND], 2.8, c, { life: 0.18, dry: 0.15, pr: 1, gr: 0.2 });
      }
    },
    every: 0.09,
    tint: true,
  },
  // 크레인 — 들어 올린다: 맞은 자리에서 위로 곧게 뻗는 줄 + 갈고리 + 매달린 토막이 함께 끌려 오른다(연두 속). 완파는 줄이 차례로 걸린다
  truss: {
    trail: { w: 7, dry: 0.3 },
    hit(x, y, k, c) {
      lift(x, y, 42 * k, 3.6, c);
      dust(x, y + 4, 8, INK, 0.3, 10, 5);
    },
    floor(x, y, k, c) {
      lift(x - 18, y, 66 * k, 4.4, c, 0.34);
      later(0.06, () => lift(x + 18, y + 4, 50 * k, 3.6, c, 0.3));
      dust(x, y + 6, 16, INK, 0.4, 10, 9);
    },
    destroy(x, y, k, c) {
      [[-44, 0, 112, 5.5], [0, 6, 92, 4.8], [44, -4, 74, 4], [-84, 8, 56, 3.4]].forEach(([dx, dy, L, w], i) =>
        later(i * 0.06, () => lift(x + dx, y + dy, L * k, w, i < 3 ? c : '', 0.4 - i * 0.02)));
      dust(x, y + 8, 30, INK, 0.5, 10, 14);
    },
    whiff(x, y, c) {
      line(x, y + 4, x, y - 14, 2.4, c, { pr: 1, life: 0.16, vy: -50 });
    },
    // 칼 기운 — 칼날에서 짧은 줄이 위로 끌려 오르고, 칼끝 곁에서 잔돌 하나가 줄에 걸려 들려 오른다
    aura(b, n, c) {
      if (n % 2) {
        const [x, y] = along(b, 0.4 + n01() * 0.6);
        line(x + sgn() * 3, y + 6, x, y - 12, 3, c, { pr: 1, life: 0.32, vy: -60, dry: 0.2, hold: 0.6 });
        return;
      }
      const x = b[2] + ((n >> 1) % 2 ? 1 : -1) * (10 + n01() * 8);
      const y = Math.min(GROUND - 4, b[3] + 6);
      line(x, y - 3, x, y - 30, 2.8, c, { pr: 1, life: 0.5, vy: -46, dry: 0.15, hold: 0.7, gr: 0.2 });
      put('pix', x, y, { vy: -46, g: 70, life: 0.58, size: 5.6, v: 0.8, rot: sgn() * 0.3, spin: sgn() * 2, c1: INK });
    },
    every: 0.16,
    tint: true,
  },
  // 먹 — 가장 넓은 붓 한 획 뒤에 크게 번지는 먹 자국 + 튀는 먹점, 붓을 떼며 삐침 한 번. 칼 기운 = 붓끝에서 먹물이 듣는다
  sumi: {
    trail: { w: 15, dry: 0.6 },
    hit(x, y, k, c) {
      blot(x, y - 4, 5.5 * k, c, N(3, k), 0.36);
      later(0.06, () => {
        const a = -Math.PI / 2 + sgn() * 1.1;
        line(x, y - 4, x + Math.cos(a) * 26 * k, y - 4 + Math.sin(a) * 26 * k, 4.4, '', { pr: 1, dry: 0.55, life: 0.26 });
      });
    },
    floor(x, y, k, c) {
      line(x - 50 * k, y + 4, x + 54 * k, y - 2, 6.5, c, { pr: 2, dry: 0.75, life: 0.36 });
      later(0.06, () => blot(x, y - 6, 9 * k, c, N(6, k), 0.46));
    },
    // 큰 가로획 → 번짐 → 곁에 작은 번짐 하나 더 → 먹물이 듣는다
    destroy(x, y, k, c) {
      line(x - 100, y + 10, x + 100, y - 6, 10, c, { pr: 2, dry: 0.8, life: 0.46 });
      later(0.08, () => blot(x, y - 8, 15 * k, c, N(10, k), 0.6));
      later(0.2, () => blot(x + (n01() > 0.5 ? 54 : -54), y - 24, 7 * k, c, N(4, k), 0.44));
      later(0.3, () => drops(x, y - 60 * k, N(6, k), 1.1, 2.05, 40, 160, 2, INK, 900));
    },
    whiff(x, y, c) {
      drops(x, y, 2, 1.0, 2.1, 30, 90, 2, c, 900);
    },
    aura(b, n, c) {
      // 붓끝에서 먹물이 튀어 양옆 땅에 번진다(셋에 하나는 쪽빛) — 웅덩이는 만들지 않는다
      const [x, y] = along(b, 0.88 + n01() * 0.1);
      const a = -Math.PI / 2 + (n % 2 ? 1 : -1) * (0.35 + n01() * 0.6);
      drops(x, y - 3, 1, a, a, 70, 130, n % 3 === 2 ? 3.2 : 2.6, n % 3 === 2 ? c : INK, 700);
    },
    every: 0.13,
    tint: true,
  },
  // 흑철 — 가장 짙은 먹. 친 자리 먹이 천천히 번지고(자주 속) 한 박자 뒤 먹 방울이 거꾸로 떠오른다. 베기 획 곁에 지그재그 마른 획이 나란히 간다
  jag: {
    trail: { w: 12, dry: 0.45 },
    // 지그재그 마른 획은 번진 먹에서 뻗지 않고 베기 획을 나란히 따라간다 — 덩이에서 사방으로 뻗으면 거미 · 팔 벌린 사람으로 읽힌다
    hit(x, y, k, c) {
      bleed(x, y - 10, 4.5 * k, c, 0.36);
      zig(x - 30 * k, y - 14, -0.2, 60 * k, 3.2, 6, 4, c, 0.26, 0.5);
      later(0.08, () => rise(x, y - 12, N(3, k), 10, 2.4, c));
    },
    floor(x, y, k, c) {
      bleed(x, y - 14, 6.5 * k, c, 0.44);
      zig(x - 60 * k, y - 34, 0.3, 120 * k, 3.8, 9, 5, c, 0.32, 0.45);
      later(0.1, () => rise(x, y - 16, N(6, k), 26, 2.8, c));
    },
    destroy(x, y, k, c) {
      bleed(x, y - 10, 12 * k, c, 0.6);
      zig(x - 120, y - 2, 0.22, 240, 4.6, 14, 6, c, 0.36, 0.4);
      later(0.07, () => zig(x - 120, y - 50, 0.22, 240, 4.6, 14, 6, '', 0.36, 0.4));
      later(0.14, () => rise(x, y - 10, N(7, k), 60, 3.2, c));
      later(0.28, () => rise(x, y - 30, N(6, k), 80, 2.6, c));
    },
    whiff(x, y, c) {
      rise(x, y, 2, 4, 2, c);
    },
    // 칼 기운 — 날에서 먹이 거꾸로 떠오른다(셋에 하나는 자주 속), 두 번에 한 번은 먹 연기 한 가닥
    aura(b, n, c) {
      const [x, y] = along(b, 0.3 + n01() * 0.7);
      drops(x, y, 1, -1.9, -1.2, 40, 80, n % 3 === 2 ? 3 : 2.4, n % 3 === 2 ? c : INK, -110);
      if (n % 2) lick(x, y - 4, 18 + n01() * 10, sgn() * 8, 4, n % 6 === 5 ? c : '', 40, 0.6);
    },
    every: 0.1,
    tint: true,
  },
  // 황금 — 금빛 튐과 금박. 금박은 흔들리며 떨어지다 접혀 사라지고, 완파 뒤엔 위에서 금박 비가 한 번 더 내린다
  royal: {
    trail: { w: 9, dry: 0.25 },
    hit(x, y, k, c) {
      spat(x, y, 3.6 * k, -Math.PI / 2 + sgn() * 0.5, c, '', 0.16, 3);
      leaves(x, y, N(5, k), 10, c, 250);
    },
    floor(x, y, k, c) {
      spat(x, y, 5.5 * k, -Math.PI / 2, c, '', 0.18, 4);
      leaves(x, y, N(8, k), 24, c, 300);
      later(0.12, () => leaves(x + sgn() * 20, y - 20 * k, N(4, k), 16, c, 200));
    },
    destroy(x, y, k, c) {
      spat(x, y, 9 * k, -Math.PI / 2, c, '', 0.2, 6);
      leaves(x, y, N(14, k), 60, c, 380);
      later(0.22, () => leafRain(x, y - 90 * k, N(8, k), 80, c));
      later(0.36, () => leafRain(x, y - 110 * k, N(6, k), 100, c));
    },
    whiff(x, y, c) {
      leaves(x, y, 2, 3, c, 90);
    },
    // 칼 기운 — 금박이 날에서 일어 한 번 떠올랐다 흔들리며 내린다
    aura(b, n, c) {
      const [x, y] = along(b, 0.25 + n01() * 0.6);
      put('leaf', x, y, { vx: sgn() * 22, vy: -50 - n01() * 30, g: 150, drag: 1.4, life: 0.8 + n01() * 0.3, size: 3.6 + n01() * 2.4, rot: n01() * TAU, spin: sgn() * 6, c1: c });
      if (n % 5 === 0) dust(x, y, 6, c, 0.5, -18, 5);
    },
    every: 0.15,
    tint: true,
  },
};

const inkOf = (w: WeaponId): string => (WEAPON_INK as Record<string, string>)[w] ?? PALETTE.YELLOW_DEEP;

/** 콤보 단 — 50·100·200에서 한 단씩 */
export const tierK = (c: number): number => (c >= 200 ? 1.8 : c >= 100 ? 1.5 : c >= 50 ? 1.25 : 1);

/** 콤보 고비를 넘는 타격 — 크게 돈 붓 잔상 하나 + 그 칼의 타격을 두 배로 */
function flare(r: Recipe, g: GreatLook, c: number, x: number, y: number, footX: number, footY: number, col: string): void {
  const m = comboMilestone(lastCombo, c);
  lastCombo = c;
  if (m === null) return;
  if (g.shape === 'beam') bentTrail(footX, footY, r.trail.w * 1.4, col, 0.42);
  else trail(footX, footY, r.trail.w * 1.4, col, { life: 0.42, dry: r.trail.dry }, 0.12, 1.25);
  scaled(x, y, WEAPON_FX.SIZE, () => r.hit(x, y, 2.2, col));
}

/** effects.spawnFromEvent가 이벤트마다 부른다 — 무기·필살 공통은 weaponFx가 먼저, 아래는 대검일 때만 */
export function bladeReact(s: GameState, e: JuiceEvent): void {
  if (e.kind === 'butterCollapse' && e.lane === undefined) return; // 버터바에 깔려 뭉개짐(sim) — 휘두른 게 아니다
  const b = weaponReact(s, e); // 연타 줄 박자 — 대검 베기 획·잔상도 탄다
  const g = greatLook(s.weapon);
  if (!g) return;
  const r = RECIPES[g.shape];
  const col = inkOf(s.weapon);
  const footX = VIEW.LANE_X[s.player.lane];
  const footY = GROUND - s.player.y;
  const swing = s.player.pose === 'attack'; // 필살·깔림 탈출의 붕괴엔 잔상이 없다
  const stripes = g.shape === 'stripe' ? 1 : 0;
  const swish = (w: number, life: number, core: string, turn = 0, grow = 1): void => {
    if (g.shape === 'beam') bentTrail(footX, footY, w, core, life);
    else trail(footX, footY, w, core, { life, dry: r.trail.dry, stripes: core ? stripes : 0 }, turn, grow);
  };
  if (e.kind === 'slash') {
    swish(r.trail.w * 0.6, 0.18, '');
    const [tx, ty] = greatArcPoint(0.1);
    r.whiff?.(footX + tx, footY + ty, col);
    return;
  }
  const x = VIEW.LANE_X[e.lane ?? s.player.lane];
  const c = e.combo ?? s.combo;
  const k = tierK(c);
  switch (e.kind) {
    case 'hit':
    case 'bossHit':
    case 'butterCollapse': {
      const y = GROUND - (e.y ?? s.player.y);
      if (swing) swish(r.trail.w * b.k, 0.26, col, b.turn, b.k);
      const a = b.ang + sgn() * 0.08; // 내려베기 → 올려베기 → 가로
      const len = (44 + 8 * k) * b.k;
      scaled(x, y, WEAPON_FX.SIZE, () => {
        stroke(x + sgn() * 6, y, a, len, 4.5 * b.k, col, { life: 0.2, stripes, dry: r.trail.dry * 0.5 });
        if (c >= 100) stroke(x + sgn() * 8, y + 8, a + 0.07, len * 0.75, 3, '', { life: 0.2, dry: 0.4 }); // 겹 베기
        spat(x, y, 3.2 * k * b.k, -Math.PI / 2 + sgn() * 0.4, col, '', 0.12, 3); // 벤 순간 — 포인트 색 튐
        r.hit(x, y, k, col);
      });
      flare(r, g, c, x, y, footX, footY, col);
      return;
    }
    case 'floorCollapse': {
      const y = GROUND - (e.y ?? s.player.y);
      if (swing) swish(r.trail.w, 0.3, col);
      scaled(x, y, WEAPON_FX.SIZE, () => {
        stroke(x, y, 0.3, 96 + 10 * k, 8, col, { life: 0.26, stripes, dry: r.trail.dry * 0.5 }); // 한 사건 = 한 획
        r.floor(x, y, k, col);
      });
      flare(r, g, c, x, y, footX, footY, col);
      return;
    }
    case 'stackDestroy': {
      const y = footY - 70; // 이벤트 y가 없다 — 마지막 층이 있던 머리 위
      const kk = Math.max(k, 1.25);
      scaled(x, y, WEAPON_FX.SIZE, () => {
        stroke(x, y, 0.22, 230, 14, col, { life: 0.32, dry: 0.3, stripes });
        r.destroy(x, y, kk, col);
        if (r.tint) r.floor(x + sgn() * 40, y - 46, kk, col); // 완파 물들임 — 모티프 한 번 더(화면은 칠하지 않는다)
      });
      return;
    }
    default:
  }
}

/**
 * 필살 박자마다 그 무기 그림을 크게(WEAPON_FX.WAZA배) — 연장 넷은 weaponFx 연장 그림, 대검은 포인트 색 큰 획 + 그 칼 그림.
 * wazaShow가 부른다. 필살 그림이라 풀이 넘쳐도 덮이지 않는다
 */
export function weaponBurst(w: WeaponId, x: number, y: number, power: 'hit' | 'floor' | 'destroy'): void {
  keepBits(() => scaled(x, y, WEAPON_FX.WAZA, () => {
    const g = greatLook(w);
    if (!g) {
      toolBurst(w, x, y, power);
      return;
    }
    const col = inkOf(w);
    const whole = power === 'destroy';
    stroke(x, y, power === 'hit' ? sgn() * 0.6 : 0.3, whole ? 170 : 96, whole ? 13 : 8, col, { life: 0.3, stripes: g.shape === 'stripe' ? 1 : 0, dry: 0.2 });
    RECIPES[g.shape][power](x, y, 1.5, col);
  }));
}

/** 피 — 인주 방울 부채(땅에 닿으면 번진다) + 터진 자리 인주 튐. wazaShow가 부른다(무음일섬 · 월하난무) */
export function bloodSpray(x: number, y: number, ang: number, spread: number, n: number, spd = 420): void {
  keepBits(() => {
    drops(x, y, n, ang - spread, ang + spread, spd * 0.45, spd, 3.4, SEAL_INK, 900);
    spat(x, y, 9, ang, SEAL_INK, '', 0.3, 6);
  });
}

/** renderer.drawGame이 플레이어를 그릴 때마다 부른다 — 칼 기운(전설 · 대검과 연장 모두) */
export function bladeAura(s: GameState): void {
  const g = greatLook(s.weapon);
  const r = g ? RECIPES[g.shape] : TOOL_RECIPES[s.weapon]; // 연장 전설(다이아 드릴)도 칼 기운을 갖는다
  // 콤보 단이 오르면 칼 기운이 잦아진다(50콤보 1.25배 · 100콤보부터 1.5배)
  if (!r?.aura || auraT < (r.every ?? 1) / Math.min(1.5, tierK(s.combo)) || s.over) return;
  auraT = 0;
  const b = playerBlade(s.player.pose, s.player.poseTick);
  if (!b) return;
  const x = VIEW.LANE_X[s.player.lane];
  const y = GROUND - s.player.y;
  r.aura([x + b[0], y + b[1], x + b[2], y + b[3]], auraN++, inkOf(s.weapon));
}

export function resetBladeFx(): void {
  for (const p of pool) p.alive = false;
  live = 0;
  allocAt = 0;
  auraT = 0;
  lastCombo = 0;
  queue.length = 0;
  resetWeaponFx();
}

/** effects.updateEffects가 같은 dt로 부른다(히트스톱 중에도 움직인다) */
export function updateBladeFx(dt: number): void {
  const step = dt > 0 ? Math.min(dt, 0.05) : TICK;
  auraT += step;
  if (queue.length) runQueue(step);
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
    if (p.k === 'drop') {
      // 떨어지는 먹 방울은 땅에 닿으면 번진 먹이 되어 0.35초 동안 오그라든다
      if (p.st === 0 && p.g > 0 && p.y >= GROUND) {
        p.st = 1;
        p.y = GROUND;
        p.vx = 0;
        p.vy = 0;
        p.g = 0;
        if (1 - p.life / p.max >= 0.4) p.c1 = INK; // 공중에서 이미 마른 방울은 번져도 마른 채로(나이를 새로 세면 포인트 색이 되살아난다)
        p.life = Math.min(p.life, 0.35);
        p.max = p.life;
      }
      continue;
    }
    if (p.vy <= 0 || p.y <= GROUND - p.size) continue;
    if (p.bounce > 0) {
      p.y = GROUND - p.size;
      p.vy *= -0.42;
      p.vx *= 0.7;
      p.spin *= 0.6;
      p.bounce -= 1;
    } else if (p.y > GROUND) {
      // 땅 밑으로는 안 간다 — 다 튄 알갱이·금박은 땅에 닿으면 곧 사라진다
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

/** 획의 그려진 구간 [s0, s1] — 앞 gr(기본 12%)에 다 그어지고 40%부터 꼬리부터 깎인다 */
function span(p: Bit, u: number): [number, number] {
  return [u < 0.4 ? 0 : Math.min(1, (u - 0.4) / 0.6), Math.min(1, u / (p.gr || 0.12))];
}

/** 붓 획 하나(stroke · sweep · zig) — 먹 획 + 벤 순간 속 색 + 공사중 빗금 */
function drawBrush(ctx: CanvasRenderingContext2D, p: Bit, py: number, u: number): void {
  const [s0, s1] = span(p, u);
  if (s1 - s0 < 0.01) return;
  const dry = Math.min(1, p.dry + u * 0.7);
  const pr = PRESSES[p.pr] ?? PRESS.cut;
  const pts = p.k === 'zig' ? p.pts.map((q, i) => q + (i % 2 ? py : p.x)) : NO_PTS;
  const paint = (w: number, a: number, b: number, d: number): void => {
    if (p.k === 'sweep') brushArc(ctx, p.x, py, p.size, p.rot, p.sw, w, a, b, d, p.seed, p.a || 1, pr);
    else if (p.k === 'zig') brushPath(ctx, pts, w, a, b, d, p.seed, pr);
    else brushLine(ctx, p.x, py, p.x + Math.cos(p.rot) * p.size, py + Math.sin(p.rot) * p.size, w, a, b, d, p.seed, p.a, pr);
  };
  ctx.fillStyle = p.c1;
  paint(p.v, s0, s1, dry);
  const hold = p.hold || (p.st ? 0.55 : 0.4);
  if (!p.c2 || p.c2 === p.c1 || u >= hold) return;
  const c0 = Math.max(s0, 0.06);
  const c1 = Math.max(c0, s1 * 0.8);
  if (c1 - c0 < 0.02 || p.v * 0.45 < 0.6) return;
  ctx.fillStyle = p.c2;
  paint(p.v * (p.st ? 0.62 : 0.42), c0, c1, 0);
  if (!p.st) {
    hotCore(ctx, u / hold, (k) => paint(p.v * 0.42 * k, c0, c1, 0));
    return;
  }
  // 공사중 — 노랑 속을 먹 빗금이 가른다(방금 칠한 속을 오려 그 안에만)
  ctx.save();
  ctx.clip();
  ctx.fillStyle = INK;
  const L = p.k === 'sweep' ? p.size * 2.2 : p.size;
  ctx.translate(p.x, py);
  ctx.rotate(p.k === 'sweep' ? 0 : p.rot);
  const h = p.v;
  ctx.beginPath();
  // 빗금 간격 · 굵기를 조금씩 흔든다 — 자로 그은 테이프가 아니라 붓으로 친 빗금
  for (let s = -L, i = 0; s < L; s += 6 + 2.4 * Math.abs(Math.sin(p.seed + i * 1.7)), i++) {
    const bw = 2.2 + 1.2 * Math.abs(Math.sin(p.seed * 0.7 + i * 2.3));
    ctx.moveTo(s, -h);
    ctx.lineTo(s + bw, -h);
    ctx.lineTo(s + bw * 0.8 + h * 1.1, h);
    ctx.lineTo(s + h * 1.1, h);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

/** 튐 · 방울 · 가루의 포인트 색은 벤 순간(삶의 앞 4할)뿐 — 그 뒤엔 먹으로 마른다(불씨는 재, 톱밥은 먼지) */
const dried = (p: Bit, u: number): string => (u < 0.4 ? p.c1 : INK);

function drawBit(ctx: CanvasRenderingContext2D, p: Bit, py: number): void {
  const t = Math.max(0, p.life / p.max); // 1 → 0
  const u = 1 - t;                         // 0 → 1
  const age = p.max - p.life;
  switch (p.k) {
    case 'stroke':
    case 'sweep':
    case 'zig':
      drawBrush(ctx, p, py, u);
      return;
    case 'dots': {
      // 리벳 — 차례로 쾅쾅 찍히고(앞 6%마다 하나), 막 찍힌 점은 속이 포인트 색, 끝 30%에 오그라든다
      const r = 2.5 * (u > 0.7 ? (1 - u) / 0.3 : 1);
      if (r < 0.3) return;
      for (let i = 0; i < p.v; i++) {
        const born = i * 0.06;
        if (u < born) break;
        const x = p.x + Math.cos(p.rot) * p.size * i;
        const y = py + Math.sin(p.rot) * p.size * i;
        const pop = u - born < 0.04 ? 1.35 : 1;
        ctx.fillStyle = p.c1;
        ctx.beginPath();
        ctx.arc(x, y, r * pop, 0, TAU);
        ctx.fill();
        if (p.c2 && u - born < 0.16) {
          ctx.fillStyle = p.c2;
          ctx.beginPath();
          ctx.arc(x, y, r * 0.5, 0, TAU);
          ctx.fill();
        }
      }
      return;
    }
    case 'spat': {
      // 번지는 먹(gr) — 천천히 커지다 끝 25%에 오그라든다. 아니면 popScale(튀었다 줄어듦)
      const R = p.gr
        ? p.size * (0.55 + 0.65 * Math.min(1, u / 0.6)) * (u > 0.75 ? (1 - u) / 0.25 : 1)
        : p.size * popScale(u);
      ctx.fillStyle = dried(p, u);
      spatter(ctx, p.x, py, R, p.rot, p.seed, p.v);
      if (p.c2 && p.c2 !== p.c1 && u < 0.2) {
        ctx.fillStyle = p.c2;
        spatter(ctx, p.x, py, R * 0.5, p.rot, p.seed, 0);
        hotCore(ctx, u / 0.2, (k) => spatter(ctx, p.x, py, R * 0.5 * k, p.rot, p.seed, 0));
      }
      return;
    }
    case 'drop': {
      ctx.fillStyle = dried(p, u);
      if (p.st) {
        inkSplat(ctx, p.x, py, p.size * 1.8, t, p.seed);
        return;
      }
      const sp = Math.hypot(p.vx, p.vy);
      const r = p.g < 0 ? p.size * Math.sqrt(t) : p.size; // 불씨는 오르며 줄어든다
      inkDrop(ctx, p.x, py, r, Math.atan2(p.vy, p.vx), Math.min(10, sp * 0.018));
      return;
    }
    case 'dust':
      ctx.fillStyle = dried(p, u);
      inkDust(ctx, p.x, py, p.size * (1 + 0.4 * u), t, p.seed, p.v || 9);
      return;
    case 'leaf': {
      // 금박 — 돌면 옆으로 접혀 얇아지고, 끝 20%에 접히며 사라진다
      const s = p.size * (u > 0.8 ? (1 - u) / 0.2 : 1);
      if (s < 0.4) return;
      const sx = Math.max(0.15, Math.abs(Math.cos(p.rot)));
      ctx.save();
      ctx.translate(p.x + Math.sin(p.seed + age * 3.4) * 5, py);
      ctx.rotate(p.seed);
      ctx.scale(sx, 1);
      ctx.beginPath();
      // 찢긴 금박 — 다섯 귀가 제각각(조각마다 seed로). st = 귀 수(유리 파편은 셋 — 날카로운 세모)
      const n = p.st || 5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + 0.4 * Math.sin(p.seed + i * 3.1);
        const r = s * (0.55 + 0.5 * Math.abs(Math.sin(p.seed * 1.3 + i * 2.1)));
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = p.c1;
      ctx.fill();
      ctx.restore();
      return;
    }
    default:
      drawWeaponBit(ctx, p, py);
  }
}
