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
// ★전설 여덟(11-21, docs/INK_FX_2026-11-01.md §12)은 예외다: 공통 먹 베기 획을 깔지 않고(own) 시그니처 색이 몸인 면(cel)으로
// 무기마다 다른 꼴 · 움직임을 그린다. 화염 불 몸 · 서리 얼음 가시와 얼음판 · 번개 꺾인 띠 · 흑철 톱니 틈 · 크레인 탑 · 지브 · 걸쇠 갈고리 · 먹 쪽빛 붓 획 · 황금 찢긴 금박 · 다이아 드릴 나선 원추.
// 참격 호(sprites.ts)도 전설은 긋지 않는다 — 칼길은 swing이 그 칼의 꼴로 긋는다(먹 띠에 색 속을 심지 않는다).
// 지우기는 같다(알파 없이 모양으로) — 번짐 · 빛 모양 그림도 없다.

import type { GameState, JuiceEvent, WeaponId } from '../core/types';
import { PALETTE, SEAL_INK, TICK, VIEW, WEAPON_FX, WEAPON_INK, WEAPON_LITE } from '../config';
import { comboMilestone } from '../audio/consume';
import { brushArc, brushLine, brushPath, hotCore, inkDrop, inkDust, inkSplat, popScale, PRESS, spatter } from './ink';
import { greatArcPoint, greatLook, playerBlade, type GreatLook } from './sprites';
import { TOOL_RECIPES, drawWeaponBit, resetWeaponFx, toolBurst, weaponReact } from './weaponFx';

/** 먹 조각: stroke 곧은 붓 획 · sweep 호 붓 획 · zig 꺾은 획(철골 · 지그재그 · 얼음 금) · dots 리벳 점 줄 · spat 먹 튐 · drop 먹 방울(땅에 닿으면 번짐) ·
 *  dust 마른 가루 · leaf 금박
 *  — 아래 줄은 weaponFx가 그린다: pix 마스크 도트 · hook 붓 획 · nail 불티 분수 · disc 먹 튐 · chunk 나는 먹 · arc 끊긴 붓 고리 · tap 잘게 떠는 획 · ring 퍼지는 고리 */
export type Kind =
  | 'stroke' | 'sweep' | 'zig' | 'dots' | 'spat' | 'drop' | 'dust' | 'leaf'
  | 'pix' | 'hook' | 'nail' | 'disc' | 'chunk' | 'arc' | 'tap' | 'ring' | 'cel';

/** 그리는 순서 — 가루 · 붓 잔상이 뒤, 베기 획 · 튐 · 색 몸 조각이 가운데, 날아가는 방울 · 금박이 맨 앞 */
const LAYER: Record<Kind, number> = {
  disc: 0, dust: 0, sweep: 0,
  hook: 1, arc: 1, tap: 1, ring: 1, stroke: 1, zig: 1, dots: 1, spat: 1, cel: 1,
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
  /** 뿌린 자리 y(월드) — 크레인 갈고리 줄 꼭대기가 여기 붙는다 */
  oy: number;
}

const POOL = 192;
const GROUND = VIEW.GROUND_Y;
const TAU = Math.PI * 2;
const INK = PALETTE.INK;
/** 칼 휘두른 붓 잔상 누름 — 휘두르기 시작한 데서 가늘게 들어가 칼끝 쪽(뒤 3분의 2)에서 가장 굵다 */
const TRAIL = (s: number): number => Math.sin(Math.PI * Math.min(1, Math.max(0, s)) ** 1.6);
/** 붓 — 붓머리를 눌러 대(1.3배 뭉툭) 몸은 고르게 가다 끝이 갈라지듯 0.3배로 빠진다(먹 전설의 획) */
const BRUSH = (s: number): number => Math.min(1, s / 0.03) * (1 + 0.3 * Math.exp(-(((s - 0.07) / 0.07) ** 2))) * (1 - 0.7 * Math.min(1, s) ** 1.8);
const PRESSES = [PRESS.cut, PRESS.flick, PRESS.line, TRAIL, PRESS.yi, BRUSH] as const;
const NO_PTS: readonly number[] = [];

export const pool: Bit[] = Array.from({ length: POOL }, (): Bit => ({
  alive: false, k: 'stroke', x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, life: 0, max: 1,
  size: 1, rot: 0, spin: 0, c1: INK, c2: INK, v: 0, a: 0, bounce: 0, seed: 0,
  dry: 0, pr: 0, sw: 0, gr: 0, st: 0, hold: 0, pts: NO_PTS, keep: false, oy: 0,
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
/** 무작위 쪽 — 1 또는 −1(난수 하나) */
const side = (): number => (sgn() > 0 ? 1 : -1);

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
const WIDE: ReadonlySet<Kind> = new Set<Kind>(['stroke', 'sweep', 'zig', 'hook', 'arc', 'tap', 'ring', 'cel']);
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
  if (big && big.k !== 1) dt *= WEAPON_FX.LIFE; // 키운 그림은 그만큼 오래 사니 박자도 같이 늘인다(얼음이 깨지는 때 = 가시가 다 사는 때)
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
  p.oy = y;
}

/** 각(라디안, 0 = 앞, −π/2 = 위)과 속력 → 속도 */
export const vel = (a: number, s: number): { vx: number; vy: number } => ({ vx: Math.cos(a) * s, vy: Math.sin(a) * s });
export const N = (n: number, k: number): number => Math.round(n * k);
type Seg = readonly [number, number, number, number];
const along = (b: Seg, u: number): [number, number] => [b[0] + (b[2] - b[0]) * u, b[1] + (b[3] - b[1]) * u];

// ── 먹 뿌리개 ────────────────────────────────────────────────

/** body = 획 몸 색(없으면 먹 · 전설은 시그니처 색) */
interface StrokeOpt { life?: number; dry?: number; pr?: number; bend?: number; stripes?: number; gr?: number; hold?: number; vx?: number; vy?: number; body?: string }

/** 곧은 붓 획 — (x0,y0) 댄 곳 → (x1,y1) 뗀 곳. core = 벤 순간 속 색('' = 없음) */
export function line(x0: number, y0: number, x1: number, y1: number, w: number, core: string, o: StrokeOpt = {}): void {
  put('stroke', x0, y0, {
    life: o.life ?? 0.22, size: Math.hypot(x1 - x0, y1 - y0), rot: Math.atan2(y1 - y0, x1 - x0), v: w, a: o.bend ?? 0,
    c1: o.body ?? INK, c2: core, dry: o.dry ?? 0.15, pr: o.pr ?? 0, st: o.stripes ?? 0, gr: o.gr ?? 0, hold: o.hold, vx: o.vx, vy: o.vy,
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
    c1: o.body ?? INK, c2: core, dry: o.dry ?? 0.15, pr: o.pr ?? 0, st: o.stripes ?? 0, gr: o.gr ?? 0, hold: o.hold, vx: o.vx, vy: o.vy,
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
    life: o.life ?? 0.26, size: 0, v: w, c1: o.body ?? INK, c2: core, dry: o.dry ?? 0.3, pr: o.pr ?? 2, gr: o.gr ?? 0.15, hold: o.hold, vx: o.vx, vy: o.vy,
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

/** 먹 방울 — 부채로 튀어 떨어지고 땅에 닿으면 번졌다 오그라든다. g < 0이면 불씨처럼 오른다. keep = 먹으로 마르지 않는다(전설 물감 · 불티) */
export function drops(x: number, y: number, n: number, a0: number, a1: number, s0: number, s1: number, r: number, c: string = INK, g = 1000, keep = false): void {
  for (let i = 0; i < n; i++) {
    const a = a0 + (a1 - a0) * (n === 1 ? 0.5 : i / (n - 1)) + sgn() * 0.12;
    put('drop', x + sgn() * 4, y + sgn() * 3, {
      ...vel(a, s0 + n01() * (s1 - s0)), g, drag: g < 0 ? 1.6 : 0,
      life: g < 0 ? 0.45 + n01() * 0.3 : 0.9, size: r * (0.7 + n01() * 0.6), c1: c, hold: keep ? 1 : 0,
    });
  }
}

// ── 색 몸 조각(전설) ─────────────────────────────────────────

/** 색 몸 조각 모양 — cel의 a. 그리기는 drawCel */
export const CEL = { flame: 0, spike: 1, slit: 2, tile: 3, drill: 4, bolt: 6, truss: 7, hook: 8, curl: 9, plate: 10 } as const;

interface CelOpt {
  life: number; size: number; v: number; c1: string; c2?: string;
  rot?: number; spin?: number; vx?: number; vy?: number; g?: number; drag?: number;
  /** gr 앞 몫에 자라고 hold 뒤엔 모양으로 사라진다 · sw 흔들림 · dry 갈래(번개 1 = 머리가 굵다 · 갈고리 = 매단 토막 크기) */
  gr?: number; hold?: number; sw?: number; dry?: number; pts?: readonly number[];
  /** false = 먹 테 없음 */
  rim?: boolean;
}

/** 색 몸 조각 하나 — (x, y) 기준, 모양 a(CEL) */
export function cel(a: number, x: number, y: number, o: CelOpt): void {
  const { rim, ...rest } = o;
  put('cel', x, y, { ...rest, a, c2: o.c2 ?? '', st: rim === false ? 1 : 0 });
}

/** 월드 점들 → 첫 점 기준 상대 좌표 */
const rel = (pts: readonly number[]): number[] => pts.map((q, i) => q - pts[i % 2]);

/** 두 각 사이(f = 0이면 a, 1이면 b) */
const toward = (a: number, b: number, f: number): number =>
  Math.atan2((1 - f) * Math.sin(a) + f * Math.sin(b), (1 - f) * Math.cos(a) + f * Math.cos(b));

/** 참격 호 위의 점들(월드) — 휘두르기 시작한 쪽 → 칼끝, n개. off(i) = 바깥으로 */
function arcPts(fx: number, fy: number, n: number, turn: number, grow: number, off: (i: number) => number = () => 0): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = greatArcPoint(1 - i / (n - 1), off(i), turn, grow);
    pts.push(fx + x, fy + y);
  }
  return pts;
}

/** 호 위 t 자리(월드)와 바깥 쪽 각 */
function arcOut(fx: number, fy: number, t: number, turn: number, grow: number): [number, number, number] {
  const [ax, ay] = greatArcPoint(t, 0, turn, grow);
  const [bx, by] = greatArcPoint(t, 8, turn, grow);
  return [fx + ax, fy + ay, Math.atan2(by - ay, bx - ax)];
}

/** 불 혀 — (x, y) 밑동에서 ang 쪽으로 h만큼 솟는 시그니처 색 면(속 = 밝은 짝). 흔들리며 오르고 밑동부터 줄어든다. flip = 곁가지 끝이 붙는 쪽 */
function tongue(x: number, y: number, h: number, w: number, ang: number, c: string, rise = 70, life = 0.42, flip = n01() < 0.5): void {
  cel(CEL.flame, x, y, {
    life: life + n01() * 0.05, size: h, v: w, c1: c, c2: WEAPON_LITE.flame, rot: ang,
    vx: Math.cos(ang) * rise * 0.4, vy: -rise, drag: 0.6, gr: 0.16, hold: 0.42, sw: w * 0.45, dry: flip ? 1 : 0,
  });
}

/** 불티 — 짧은 마름모 불씨가 위로 오르다 꺾여 사그라든다(먹 테 둥근 방울은 알약 · 당근으로 읽힌다) */
function embers(x: number, y: number, n: number, spd: number): void {
  for (let i = 0; i < n; i++) {
    put('pix', x + sgn() * 8, y + sgn() * 4, {
      ...vel(-Math.PI / 2 + sgn() * 0.7, spd * (0.5 + n01() * 0.6)), g: 260, drag: 1.4,
      life: 0.26 + n01() * 0.1, size: 2.4 + n01() * 1.4, v: 2.6, a: 4, rot: sgn() * 0.3, spin: sgn() * 3, c1: i % 2 ? WEAPON_INK.flame : WEAPON_LITE.flame,
    });
  }
}

/**
 * 불 몸 — 밑동이 이어진 한 덩이 불. 큰 혀 하나 · 중간 둘 · 작은 둘이 모두 lean 쪽(− 왼쪽 · + 오른쪽)으로 함께 눕고 같은 박자로 흔들린다.
 * 같은 크기 혀를 줄 세우면 화구 · 초 줄로 읽힌다 — 크기를 세 단으로 나누고 밑동을 겹친다
 */
function fireBody(x: number, y: number, h: number, w: number, lean: number, c: string, rise = 70, life = 0.42): void {
  const a = -Math.PI / 2 + lean * 0.32;
  const f = lean > 0;
  tongue(x, y, h, w, a + sgn() * 0.05, c, rise, life, f);
  for (const d of [-1, 1]) {
    tongue(x + d * w * 0.42, y + 2, h * (0.58 + 0.1 * n01()), w * 0.8, a + d * 0.06, c, rise * 0.9, life * 0.9, f);
    tongue(x + d * w * 0.8, y + 3, h * (0.3 + 0.08 * n01()), w * 0.62, a + d * 0.12, c, rise * 0.8, life * 0.75, f);
  }
}

/** 얼음 가시 — 밑동 (x, y)에서 ang 쪽으로 len 솟는 각진 결정(반쪽 = 밝은 면). 솟아 멈춘 채 버티다 다 살면 깨져 n조각이 떨어진다 */
function spike(x: number, y: number, ang: number, len: number, w: number, c: string, life = 0.36, n = 2): void {
  cel(CEL.spike, x, y, { life, size: len, v: w, c1: c, c2: WEAPON_LITE.frost, rot: ang, gr: 0.1, hold: 0.88 });
  if (n > 0) later(life * 0.9, () => iceShards(x + Math.cos(ang) * len * 0.55, y + Math.sin(ang) * len * 0.55, n, len * 0.2, c, 150 + len * 3));
}

/** 깨진 얼음 — 또렷한 마름모 조각이 중력으로 떨어진다(흩날리지 않는다 · 밝은 면 셋에 둘). 작고 길쭉하거나 둥근 조각은 씨 · 물방울 · 비로 읽힌다 */
function iceShards(x: number, y: number, n: number, spread: number, c: string, spd = 260): void {
  for (let i = 0; i < n; i++) {
    put('pix', x + sgn() * spread, y + sgn() * spread * 0.4, {
      ...vel(Math.PI / 2 + sgn() * 1.1, spd * (0.2 + n01() * 0.35)), g: 1100, drag: 0.3,
      life: 0.36 + n01() * 0.12, size: 5.5 + n01() * 3, v: 1.35, a: 4, rot: n01() * TAU, spin: sgn() * 4, c1: i % 3 === 2 ? c : WEAPON_LITE.frost,
    });
  }
}

/** 얼음판 — 깨져 rot만큼 기운 각진 얼음 한 장이 퍼지며 얼었다가, 다 살 때 곧은 금이 가고 깨져 세모 조각이 떨어진다 */
function icePlate(x: number, y: number, W: number, H: number, c: string, life = 0.4, rot = 0): void {
  cel(CEL.plate, x, y, { life, size: W, v: H, c1: c, c2: WEAPON_LITE.frost, rot, gr: 0.14, hold: 0.86, dry: 1 });
  later(life * 0.88, () => iceShards(x, y - H * 0.5, W > 40 ? 3 : 2, W * 0.35, c, 200));
}

/** 번개 몸 — 월드 점들을 지나는 날카로운 꺾인 띠(보라 몸 · 먹 테 · 갓 친 동안 가운데 밝은 짝 띠). head = 머리(첫 점)가 굵다 */
function boltBody(pts: readonly number[], w: number, c: string, life = 0.24, head = false): void {
  cel(CEL.bolt, pts[0], pts[1], { life, size: 0, v: w, c1: c, c2: WEAPON_LITE.thunder, gr: 0.03, hold: 0.55, dry: head ? 1 : 0, pts: rel(pts) });
}

/** 낙뢰 — 하늘에서 (x, y)까지 len, 마디 n, 좌우로 꺾이는 폭 amp(len 몫). 하늘 쪽이 굵고 끝으로 가늘다. branch = 가운데 마디에서 곁가지 하나(굵기 3분의 1). lean = 하늘 쪽 끝이 기우는 쪽(−1 ~ 1) */
function strike(x: number, y: number, len: number, w: number, c: string, life = 0.24, n = 5, amp = 0.18, branch = true, lean = sgn()): void {
  const tx = x + lean * len * 0.14;
  const ty = y - len;
  const pts = [tx, ty];
  // 마디 길이 · 꺾임 폭을 고르지 않게 — 번갈아 같은 폭이면 계단(지그재그 무늬)으로 읽힌다
  for (let k = 1, f = 0; k < n; k++) {
    f = Math.min(0.94, f + (1 / n) * (0.55 + 0.9 * n01()));
    pts.push(tx + (x - tx) * f + (k % 2 ? 1 : -1) * len * amp * (0.25 + 0.75 * n01()), ty + (y - ty) * f);
  }
  pts.push(x, y);
  boltBody(pts, w, c, life, true);
  if (!branch) return;
  const i = 2 * (1 + Math.floor(n01() * (n - 2)));
  const [bx, by] = [pts[i], pts[i + 1]];
  const d = bx > x ? 1 : -1;
  const L = Math.min(len, 160);
  boltBody([bx, by, bx + d * L * 0.16, by + L * 0.1, bx + d * L * 0.11, by + L * 0.2, bx + d * L * 0.27, by + L * 0.3], w * 0.34, c, life * 0.85, true);
}

/** 땅을 타는 번개 — 맞은 자리에서 양옆으로 기는 꺾인 띠 둘(머리가 굵고 끝으로 가늘다) */
function crawlBolt(x: number, y: number, len: number, w: number, c: string, life = 0.18): void {
  for (const d of [-1, 1]) {
    const pts = [x, y];
    for (let k = 1; k <= 3; k++) pts.push(x + (d * len * k) / 3, y + (k % 2 ? -1 : 1) * len * 0.12 * (0.5 + n01()));
    boltBody(pts, w, c, life, true);
  }
}

/** 틈 — (x, y)를 가운데로 ang 방향 len 길이로 찢긴 틈(속 = 먹 구멍 + 안 벽 띠 · 둘레 = 얇은 자주 입술, 아랫변만 톱니 · 끝 실금). 확 벌어져 걸려 있다가 두 프레임에 탁 닫힌다 */
function rift(x: number, y: number, ang: number, len: number, w: number, c: string, life = 0.3): void {
  cel(CEL.slit, x, y, { life, size: len, v: w, c1: c, c2: WEAPON_LITE.onyx, rot: ang, gr: 0.3, hold: 0.93 }); // 앞 3할 = 실금이 번지고 → 벌어진다
}

/** 닫힘 — 틈이 닫힌 자리에 자주 한 줄이 탁 그어지고 끝난다(조각을 뿌리지 않는다 — 꼬리가 다 흩어지는 조각이면 여덟이 같은 문법으로 닫힌다) */
function snap(x: number, y: number, a: number, len: number, c: string): void {
  stroke(x, y, a, len, 3, '', { life: 0.12, dry: 0.15, body: c });
}

/** 금박 리본 — 한쪽 끝(−)에서 풀려 나와 펄럭이는 폭 같은 띠(tile · v 1). 크기 문턱 대신 v로 가른다(필살 배율에 잔 박이 리본으로 바뀌지 않게) */
function ribbon(x: number, y: number, size: number, rot: number, c: string, life: number, gr = 0.4, thin = 0): void {
  cel(CEL.tile, x, y, { life, size, v: 1, c1: c, c2: WEAPON_LITE.gold, rot, gr, hold: 0.9, sw: 2, dry: thin }); // dry = 가늘기(0.5 = 폭 절반)
}

/** 격자 지브 — 월드 점들을 따라 레일 둘 + 지그재그 살(연두 · 먹 테). 머리부터 놓이고 끝에서 거둬진다 */
function truss(pts: readonly number[], h: number, c: string, life = 0.4, gr = 0.3): void {
  cel(CEL.truss, pts[0], pts[1], { life, size: 0, v: h, c1: c, gr, hold: 0.72, pts: rel(pts) });
}

/**
 * 갈고리 — 위 jib 높이(친 자리에서 위로)에 와이어로 매인 도르래 · 갈고리가 빠르게 내려와 (x, y)의 토막을 걸고 확 끌어 올린다.
 * block = 매단 토막 크기(갈고리 크기 배수) · 내려오는 동안은 빈 갈고리. 지브에 닿으면 사라진다
 */
function hookLift(x: number, y: number, size: number, block: number, c: string, jib = 70, life = 0.4): void {
  const low = 21.6; // 내려와 가장 낮은 자리 = 출발 + low(vy 360 · g −3000)
  const y0 = y - low - size * (0.5 + block * 1.1);
  cel(CEL.hook, x, y0, { life, size: jib - (y - y0), v: size, c1: c, c2: PALETTE.RUBBLE, vy: 360, g: -3000, sw: 0.12, dry: block, gr: 0.01, hold: 0.86 }); // 토막 = 잔해 색(먹 네모는 먹 덩이 · 검열 칸으로 읽힌다)
}

/** 금박 한 장 — 찢긴 얇은 박이 뒤집히며(앞 금 → 옆으로 선 가는 선 → 뒤 밝은 금) 흔들리며 내린다 */
function leafPiece(x: number, y: number, size: number, o: { vx: number; vy: number; g: number; drag: number; life: number; sw?: number }, c: string): void {
  cel(CEL.tile, x, y, { ...o, size, v: 0, c1: c, c2: WEAPON_LITE.gold, rot: n01() * TAU, spin: sgn() * (6 + n01() * 3), gr: 0.06, hold: 0.86, sw: o.sw ?? 6 }); // 장마다 박자가 다르게 앞뒤가 뒤집힌다(앞뒤 바뀜 초당 3번 아래 — 광과민) — 색이 바뀌어야 금속박(그대로 떠다니면 색종이)
}

function dust(x: number, y: number, R: number, c: string, life = 0.4, vy = 20, n = 10): void {
  put('dust', x, y, { life, size: R, v: n, c1: c, vx: sgn() * 14, vy, drag: 1.2 });
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
export function shards(x: number, y: number, n: number, spread: number, c: string, spd = 300): void {
  for (let i = 0; i < n; i++) {
    put('leaf', x + sgn() * spread, y + sgn() * spread * 0.4, {
      ...vel(-Math.PI / 2 + sgn() * 1.4, spd * (0.45 + n01() * 0.7)), g: 700, drag: 0.8,
      life: 0.5 + n01() * 0.25, size: 3.6 + n01() * 3.4, rot: n01() * TAU, spin: sgn() * 10, c1: i % 3 === 2 ? INK : c, st: 3,
    });
  }
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
  /** 완파 물들임 — 완파 때 그 칼의 모티프가 한 번 더 크게(전화면은 칠하지 않는다). own이면 destroy가 둘째 박자로 스스로 한다 */
  tint?: true;
  /** 전설 — 공통 먹 베기 획 · 튐을 깔지 않는다(제 그림만) */
  own?: true;
  /** 전설 칼길 — 붓 잔상 대신 그 칼의 꼴로(fx, fy = 발, turn · grow = 연타 줄 박자) */
  swing?(fx: number, fy: number, w: number, life: number, c: string, turn: number, grow: number): void;
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
  // ★전설 일곱(아래)은 own — 공통 먹 베기 획 없이 시그니처 색이 몸인 제 꼴로만 그린다(§12)
  // 화염 — 불 몸(밑동이 이어진 혀 다섯 · 크기 세 단 · 함께 한쪽으로 눕는다 · 주홍 몸 · 밝은 주황 속). 칼길은 호를 따라 칼끝 쪽으로 커지는 혀 줄.
  // 친 자리엔 불 몸 하나와 불티, 층 깨기는 부딪친 두 자리에 붙은 불이 벽을 타고 한 덩이 더 오르고, 완파는 플레이어 양옆 불기둥 둘이 솟아 위가 찢겨 날아오른다
  wave: {
    trail: { w: 10, dry: 0.1 },
    own: true,
    swing(fx, fy, w, life, c, turn, grow) {
      const s = Math.max(0.9, Math.min(1.3, w / 10)); // 헛스윙(가는 칼길)에도 혀가 1배에서 보이게
      // 굵은 불 띠 하나 + 바깥 테에 밑동을 묻은 혀 여섯(칼끝 쪽이 크다) — 불꽃 톱니 호. 혀는 띠와 같이 나서 같이 살고, 끝 2할에만 줄어든다.
      // 혀가 띠보다 늦게 남아 밑동이 밀리며 오그라들면 알약 점선 · 소시지 줄이, 가는 띠는 서리 · 먹 칼길과 같은 초승달이, 떨어져 뜬 혀는 새 · 금붕어가 된다
      trail(fx, fy, w * 1.3, '', { life: life * 0.8, dry: 0.1, body: c }, turn, grow);
      for (let i = 0; i < 6; i++) {
        const [x, y, a] = arcOut(fx, fy, 0.05 + i * 0.17, turn, grow);
        const d = 0.01 * (5 - i); // 차례로 붙되(한 틱에 다 뿌리지 않는다) 늦게 붙은 만큼 짧게 — 띠와 같이 끝난다
        later(d, () => cel(CEL.flame, x - Math.cos(a) * 3, y - Math.sin(a) * 3, {
          life: life * 0.8 - d, size: (27 - i * 2.4 + n01() * 3) * s, v: (5.6 - i * 0.4) * s, c1: c, c2: WEAPON_LITE.flame, // 좁고 길게 — 통통한 혀는 지네 다리
          rot: toward(a, -Math.PI / 2, 0.4), gr: 0.12, hold: 0.8, sw: 2.4 * s, dry: 1,
        }));
      }
    },
    // 타격 — 바람에 눕듯 옆으로 길게 누운 낮고 넓은 불 둘(위로 솟는 덩이는 서리 가시 다발과 같은 구도다) + 위로 오르는 불티
    hit(x, y, k, c) {
      const s = side();
      fireBody(x - s * 6, y - 2, 24 * k, 10, s * 1.7, c, 30, 0.11); // 다 눕히면 꼬리가 가늘어져 불새 · 용 머리로 읽힌다 — 비스듬히
      later(0.03, () => fireBody(x + s * 18, y, 14 * k, 7, s * 1.5, c, 30, 0.09));
      later(0.05, () => embers(x, y - 10, N(2, k), 160));
    },
    floor(x, y, k, c) {
      const lean = side();
      fireBody(x - 26, y + 2, 32 * k, 10, lean, c, 70, 0.3);
      later(0.04, () => fireBody(x + 28, y + 2, 26 * k, 8.5, lean, c, 70, 0.28));
      later(0.1, () => fireBody(x + 4 * lean, y - 22 * k, 22 * k, 8, lean, c, 110, 0.24)); // 벽을 타고 오른다
      later(0.16, () => embers(x, y - 16, N(3, k), 200));
    },
    // 완파 — 잔해를 따라 양옆으로 번지는 낮은 불길(혀 여섯 · 높이 들쭉날쭉 · 바람 부는 한쪽으로 기움). 맞은 자리에서 바깥으로 차례로 붙고,
    // 큰 혀 끝이 찢겨 불티로 오른다. 바닥에서 솟은 큰 불기둥은 서리 가시 · 드릴과 같은 「솟은 세모」 구도라 쓰지 않는다. 플레이어 자리는 비운다
    destroy(x, y, k, c) {
      const s = side();
      const H = [26, 44, 34, 0, 48, 30, 40];
      for (let i = 0; i < 7; i++) {
        if (!H[i]) continue;
        const dx = (i - 3) * 22 + sgn() * 4; // 같은 간격 · 같은 짝이면 고른 톱니 울타리 · 왕관으로 읽힌다
        later(Math.abs(i - 3) * 0.03, () => {
          tongue(x + dx, y + 14, H[i] * k, 11, -Math.PI / 2 + s * (0.45 + n01() * 0.15), c, 40, 0.36, s > 0);
          if (H[i] >= 40) tongue(x + dx + s * 9, y + 16, H[i] * 0.55 * k, 8, -Math.PI / 2 + s * 0.55, c, 30, 0.3, s > 0);
        });
      }
      later(0.16, () => {
        tongue(x + 22, y + 14 - 48 * k, 16 * k, 8, -Math.PI / 2 + s * 0.3, c, 200, 0.26, s > 0);
        tongue(x - 44, y + 14 - 44 * k, 13 * k, 7, -Math.PI / 2 + s * 0.3, c, 180, 0.24, s > 0);
      });
      later(0.24, () => embers(x, y - 10, N(5, k), 240));
    },
    // 헛스윙 — 위로 길게 늘어났다 꺼지는 혀 하나 + 불티 둘(나란히 뜬 혀 셋은 새 · 나비로, 가로로 누운 혀는 올챙이 · 금붕어로 읽힌다)
    whiff(x, y, c) {
      const s = side();
      tongue(x, y, 26, 5.5, -Math.PI / 2 + s * 0.08, c, 70, 0.16, s > 0);
      embers(x, y - 12, 2, 120);
    },
    // 칼 기운 — 날에 작은 혀가 날 길이 3분의 1 아래로 타오르고, 드물게 불티가 오른다
    aura(b, n, c) {
      const [x, y] = along(b, 0.35 + n01() * 0.6);
      const L = Math.hypot(b[2] - b[0], b[3] - b[1]);
      tongue(x, y, Math.min(L / 3, 10 + n01() * 6), 6, -Math.PI / 2 + sgn() * 0.2, c, 40, 0.3);
      if (n % 6 === 0) embers(x, y - 6, 1, 100);
    },
    every: 0.1,
    tint: true,
  },
  // 서리 — 각진 얼음 가시(옥빛 몸 · 위 반쪽 밝은 면)가 한쪽으로 함께 기울어 솟아 멈춘 채 얼었다가, 깨져 큰 세모 조각이 떨어진다.
  // 칼길은 호를 따라 점선처럼 선 뾰족한 잔 가시, 층 깨기는 깨져 제각각 기운 얼음판 셋(크기 1 : 0.6 : 0.35) + 한쪽 가시, 완파는 한쪽 바닥에서 40~50도로 눕혀 차례로 솟는 가시 줄(세로로 선 흑철 · 드릴 완파와 갈린다)
  crystal: {
    trail: { w: 9, dry: 0.1 },
    own: true,
    swing(fx, fy, w, life, c, turn, grow) {
      const s = Math.max(0.85, Math.min(1.3, w / 9)); // 헛스윙(가는 칼길)에도 줄이지 않는다 — 작은 판 + 가시는 화살 · 물고기로 읽힌다
      // 호를 따라 곧은 변의 얼음 판이 틈 없이 마디마디 꺾여 이어지고(크기 1 : 0.7 : 0.85 : 0.5 · 기울기 제각각), 가시는 첫 판에만 하나 선다.
      // 판마다 가시가 서면 등뼈 · 벌레 꼬리로, 떨어져 뜬 같은 크기 판은 화살촉 · 물고기 떼로, 매끈한 띠는 화염 · 흑철 칼길과 같은 초승달로 읽힌다.
      // 헛스윙(짧은 칼길)은 판 둘만
      const SZ = [1, 0.7, 0.85, 0.5];
      const n = life < 0.2 ? 2 : 4;
      for (let i = 0; i < n; i++) {
        const [x, y, a] = arcOut(fx, fy, 0.08 + i * 0.15, turn, grow);
        later(0.01 * (n - 1 - i), () => icePlate(x, y, 30 * SZ[i] * s, 7 * s, c, life * 0.75, a + Math.PI / 2 + sgn() * 0.14));
      }
      const [x0, y0, a0] = arcOut(fx, fy, 0.08, turn, grow);
      spike(x0, y0, a0 + sgn() * 0.15, 24 * s, 6.5 * s, c, life * 0.8, 1);
    },
    // 타격 — 가시 넷이 한쪽으로 함께 기울어 박힌다(밑동은 가로로 흩고 가장 긴 가시는 한 끝)
    hit(x, y, k, c) {
      const s = side();
      [30, 21, 14].forEach((L, i) => // 넷이 부채로 벌어지면 파란 발톱 · 손으로 읽힌다 — 셋 · 35도 안
        spike(x + s * (i * 8 - 8), y + i * 1.5, -Math.PI / 2 + s * (0.42 + i * 0.05) + sgn() * 0.04, L * k, 10 - i * 1.5, c, 0.11, i < 2 ? 2 : 1));
    },
    // 층 깨기 — 땅에서 서로 반대로 30~35도 들려 솟은 얼음판 둘 + 판 사이에 곧게 선 가시 하나
    // (바닥에 눕힌 판은 물웅덩이 · 배로, 판 끝에 붙인 가시는 꼬리지느러미, 판 셋 줄은 고래 떼로 읽힌다)
    floor(x, y, k, c) {
      const s = side();
      // 판 둘은 한쪽에 같은 쪽으로 기울여 몰고(플레이어 어깨에서 떼어), 가시 하나는 반대쪽에 — 양옆에 거울처럼 서면 날개로 읽힌다
      icePlate(x + s * 44, y + 4, 34 * k, 11, c, 0.2, s * 1.0); // 55도 남짓 세운 결정 — 낮게 누운 넓은 판은 파도 · 언덕으로 읽힌다
      later(0.03, () => icePlate(x + s * 74, y + 6, 24 * k, 8, c, 0.18, s * 0.85));
      later(0.05, () => spike(x - s * 34, y + 4, -Math.PI / 2 - s * 0.15, 30 * k, 8, c, 0.22, 2));
    },
    // 완파 — 한쪽 바닥선에서 줄지어 눕힌 굵은 가시가 차례로 솟는다(얼음이 기어가며 선다 · 갈수록 크다 · 폭과 각이 제각각). 플레이어 자리는 건너뛴다
    destroy(x, y, k, c) {
      const s = side();
      // 여섯 — 각을 양쪽으로 크게 벌리고(−57 · −20 · +14 · +49도 …) 길이를 1 : 0.35 식으로 크게 섞는다(한쪽으로 고르게 누우면 톱날 · 상어 지느러미 줄로 읽힌다)
      const ANG = [-1.0, -0.35, 0.25, 0, 0.85, -0.6, 0.5];
      const LEN = [0.55, 0.45, 1, 0, 0.8, 0.35, 0.7];
      for (let i = 0; i < 7; i++) {
        const dx = s * (i * 30 - 96);
        if (Math.abs(dx) < 18) continue;
        later(i * 0.024, () => spike(x + dx, y + 30 - i * 5, -Math.PI / 2 + s * ANG[i], 76 * LEN[i] * k, 8 + 9 * LEN[i], c, 0.26, i % 2 ? 2 : 1));
      }
    },
    whiff(x, y, c) {
      spike(x, y, -Math.PI / 2 + sgn() * 0.6, 16, 4, c, 0.2, 1);
    },
    // 칼 기운 — 날을 따라 서리 가시 둘이 한쪽으로 솟았다 사라진다(땅에는 흩지 않는다)
    aura(b, n, c) {
      const ang = Math.atan2(b[3] - b[1], b[2] - b[0]);
      const side = n % 2 ? 1 : -1;
      for (let j = 0; j < 2; j++) {
        const [x, y] = along(b, 0.35 + j * 0.3 + n01() * 0.12);
        spike(x, y, ang + side * (Math.PI / 2 - 0.7), 11 + n01() * 5, 3.2, c, 0.28, 0); // 가늘게 — 짧고 넓으면 화살 깃 · 잔가지로 읽힌다
      }
    },
    every: 0.12,
    tint: true,
  },
  // 번개 — 날카로운 꺾인 띠(보라 몸 · 먹 테 · 갓 친 동안 밝은 짝 띠). 한 프레임에 서고 가늘어지며 꺼진다(완파 가운데 큰 줄기만 정해진 두 프레임에 깜빡).
  // 칼길 자체가 번개가 되고, 친 자리엔 하늘에서 내리꽂힌 뒤 맞은 면을 따라 짧게 긴다. 완파는 화면 위에서 양옆 · 가운데 차례로 셋
  bolt: {
    trail: { w: 9, dry: 0.15 },
    own: true,
    swing(fx, fy, w, life, c, turn, grow) {
      // 잘게 떠는 거친 호 하나(마디 열셋 · 들쭉날쭉 2px 안팎). 고른 간격으로 크게 번갈아 꺾으면 심전도 · W로, 아래로 늘어진 곁가지는 짐승 다리로 읽힌다
      boltBody(arcPts(fx, fy, 13, turn, grow, (i) => (i === 0 || i === 12 ? 0 : sgn() * 2.4)), w * 0.8, c, life * 0.8);
    },
    // 번개는 서 있는 구조물이 아니라 번쩍 — 타격 · 층 깨기 · 완파 모두 짧게 산다
    // 타격은 층 안쪽 짧은 한 줄기(떨어지는 층을 세로로 가르지 않게), 층 깨기는 한 줄기 + 곁 줄기, 완파는 화면 위에서 바닥까지 — 단계가 커진다
    hit(x, y, k, c) {
      strike(x, y, 42 * k, 7, c, 0.1, 4, 0.12);
      crawlBolt(x, y, 12 * k, 4, c, 0.1);
      later(0.05, () => strike(x + sgn() * 10, y, 26 * k, 4, c, 0.08, 3, 0.14, false));
    },
    floor(x, y, k, c) {
      strike(x - 10, y, 100 * k, 8, c, 0.16, 6, 0.1);
      later(0.05, () => strike(x + 20, y + 2, 60 * k, 5, c, 0.13, 5, 0.11, false));
      crawlBolt(x, y + 2, 24 * k, 6, c);
    },
    // 완파 — 화면 위에서 내리꽂히는 줄기 셋(서로 90 넘게 떨어져 엇갈리지 않는다): 양옆 둘 → 가운데 가장 굵은 한 줄기 + 맞은 면을 따라 긴다
    destroy(x, y, _k, c) {
      // 가장자리 둘은 짧게(띠 아래에서 시작) · 하늘 쪽 끝을 안으로 기울여 짧게 산다 — 화면 끝에 붙어 오래 선 세로 줄기는 테두리 · 커튼 · 네온관으로 읽힌다
      ([[-70, 4, 160, 6, 0.25], [70, 8, 145, 5.5, -0.25]] as const).forEach(
       ([dx, dy, L, w, lean], i) =>
        later(0.03 * i, () => strike(x + dx, y + dy, L, w, c, 0.1, 5, 0.08, true, lean)));
      later(0.07, () => {
        strike(x, y, 330, 14, c, 0.24, 8, 0.05, true, sgn() * 0.3);
        crawlBolt(x, y, 40, 6.5, c);
      });
    },
    // 헛스윙 — 칼끝에서 위로 튀는 짧은 세로 꺾임 하나(가로로 누운 지그재그 · W · M 자는 심전도 · 글자로, 나란한 둘은 짐승 머리로 읽힌다)
    whiff(x, y, c) {
      boltBody([x, y, x + 4, y - 9, x - 2, y - 17, x + 3, y - 26], 4, c, 0.12, true);
    },
    // 칼 기운 — 날을 따라 가는 방전이 붙고(날 밖으로 나가지 않는다), 세 번에 한 번 칼끝에서 땅으로 짧게 튄다
    aura(b, n, c) {
      const ang = Math.atan2(b[3] - b[1], b[2] - b[0]);
      const pts: number[] = [];
      for (let i = 0; i <= 5; i++) {
        const [x, y] = along(b, 0.25 + i * 0.14);
        const o = i && i < 5 ? (i % 2 ? 1 : -1) * (1 + n01() * 1.4) : 0; // 날을 따라 잘게 튄다(폭이 크면 글자 Z로 읽힌다)
        pts.push(x - Math.sin(ang) * o, y + Math.cos(ang) * o);
      }
      boltBody(pts, 3, c, 0.12);
      if (n % 3 === 0 && b[3] < GROUND - 14) {
        const d = side();
        const [x1, y1] = [b[2], b[3]];
        boltBody([x1, y1, x1 + d * 6, y1 + (GROUND - y1) * 0.4, x1 - d * 3, y1 + (GROUND - y1) * 0.7, x1 + d * 5, GROUND], 3.6, c, 0.1);
      }
    },
    every: 0.14,
    tint: true,
  },
  // 크레인 — 들어 올린다: 칼길이 곧은 연두 격자 지브로 놓이고, 친 자리엔 위 지브에서 와이어 두 줄 · 도르래 · 걸쇠 갈고리가 내려와 먹 토막을 걸어 확 끌어 올린다.
  // 층 깨기는 짧은 지브 + 갈고리 하나, 완파는 화면 왼쪽 4분의 1에 탑 · 꼭대기 마스트 · 당김줄 세모 + 가로 지브(뒤 팔에 먹 균형추 = T자) + 갈고리 둘이 차례로
  truss: {
    trail: { w: 7, dry: 0.3 },
    own: true,
    swing(fx, fy, w, life, c, turn, grow) {
      // 곧은 지브 하나가 호 전체를 가로질러 길게 놓인다(굽은 격자는 아치 다리 · 애벌레로, 칼 옆 짧은 토막은 사다리 · 지퍼로 읽힌다). 넓고 성긴 격자
      // 호 꼭대기 높이에 가로로 — 칼 곁에 비스듬히 기대 놓이면 벽에 기댄 사다리로 읽힌다
      const p = arcPts(fx, fy, 10, turn, grow);
      const xs = p.filter((_, i) => i % 2 === 0);
      const top = Math.min(...p.filter((_, i) => i % 2 === 1));
      truss([Math.min(...xs), top, Math.max(...xs), top], Math.max(9, w * 1.2), c, life * 0.8, 0.3);
    },
    // 타격 — 지브를 높이 두고 긴 와이어로 갈고리를 내린다(지브와 도르래 사이가 짧으면 음표 · 자물쇠로 읽힌다)
    hit(x, y, k, c) {
      truss([x - 30, y - 80 * k, x + 22, y - 80 * k], 7, c, 0.15, 0.2);
      hookLift(x, y - 16, 9, 1.3, c, 80 * k - 16, 0.15); // 매단 토막이 머리를 덮지 않게 걸 자리를 위로
    },
    // 층 깨기 — 지브 하나 + 갈고리 하나(가로 줄에 갈고리 둘이 매달리면 빨랫줄 · 커튼 고리로 읽힌다)
    floor(x, y, k, c) {
      truss([x - 40, y - 86 * k, x + 36, y - 86 * k], 8, c, 0.26, 0.2); // 다음 타격과 덜 겹치게 짧게 · 화면 폭을 덮으면 난간 · 철교로 읽힌다
      later(0.04, () => hookLift(x + 6, y - 40, 9, 1.5, c, 86 * k - 40, 0.24)); // 층 밑변 = 머리 높이 — 토막은 머리 위 40에서 건다
    },
    destroy(x, y, _k, c) {
      const mx = x - 56; // 탑은 화면 왼쪽 4분의 1(레인이 하나라 늘 화면 안)
      const jy = y - 64;
      truss([mx, y + 36, mx, jy - 24], 11, c, 0.36, 0.18); // 탑 + 지브 위로 솟은 마스트 · 다음 층이 떨어지기 전에 거둔다
      later(0.06, () => {
        truss([x + 74, jy, mx - 34, jy], 10, c, 0.32, 0.22); // 지브(오른쪽 긴 팔 · 탑 뒤로 짧은 팔) — 긴 팔 끝부터 놓여 균형추 쪽이 맨 나중에 거둬진다
        cel(CEL.plate, mx - 28, jy + 9, { life: 0.32, size: 20, v: 10, c1: c, gr: 0.2, hold: 0.72 }); // 균형추 — 연두 판(먹 덩이는 「먹 안에 색」 · 잔해 색은 잔해 뜻과 겹친다) · 지브와 함께 거둔다
        for (const ex of [mx - 34, x + 74]) line(mx, jy - 24, ex, jy, 1.8, '', { life: 0.32, pr: 2, gr: 0.22, dry: 0 }); // 마스트 꼭대기 → 두 팔 끝 당김줄(세모)
      });
      later(0.12, () => hookLift(x + 34, y - 20, 10, 2.2, c, 44, 0.3)); // 갈고리 하나에 큰 토막 · 머리 옆 위에서 건다(한 지브에 갈고리 둘이면 빨랫줄 · 겹음표로 읽힌다)
    },
    // 헛스윙 — 위에서 긴 와이어에 매달린 갈고리 하나가 흔들린다(와이어 없이 뜬 갈고리 + 도르래는 음표로, 짧은 격자 토막은 # · = 기호로 읽힌다)
    whiff(x, y, c) {
      cel(CEL.hook, x, y + 8, { life: 0.16, size: 64, v: 6, c1: c, sw: 0.35, gr: 0.05, hold: 0.8 });
    },
    // 칼 기운 — 칼끝 밑에 갈고리가 매달려 흔들리고, 가끔 날이 격자 팔로 번쩍 놓인다
    aura(b, n, c) {
      if (n % 2 === 0 && b[3] < GROUND - 30) cel(CEL.hook, b[2], b[3] + 16, { life: 0.34, size: 16, v: 5, c1: c, sw: 0.3, gr: 0.05, hold: 0.8 });
      else if (n % 4 === 1) truss([...along(b, 0.2), ...along(b, 0.95)], 5, c, 0.26, 0.45);
    },
    every: 0.18,
    tint: true,
  },
  // 먹 — 쪽빛 붓글씨(먹은 쓰지 않는다): 칼길이 쪽빛 마른 붓 획이 된다. 획은 붓 누름(머리를 눌러 대 뭉툭 · 끝이 갈라지며 빠진다).
  // 친 자리엔 비스듬히 오르는 굵은 가로 획 + 물방울 점, 층 깨기는 삐침 하나 + 점(가로 띠로 깔지 않는다), 완파는 플레이어 옆 한 칸에 클 태 자를 빠른 획 순서로. 방울은 땅에 닿으면 사라진다(웅덩이 없음)
  sumi: {
    trail: { w: 15, dry: 0.6 },
    own: true,
    swing(fx, fy, w, life, c, turn, grow) {
      trail(fx, fy, w * 1.1, '', { life: life * 1.2, dry: 0.45, body: c }, turn, grow); // 둥근 파란 방울은 빗방울로 읽힌다 — 튐은 획 끝 갈라짐만
    },
    // 타격 — 머리 위로 비스듬히 오르는 굵은 가로 한 획 + 아래 물방울 점(사선 삐침은 칼길 획과 엇갈려 X · 가위표로 읽힌다)
    hit(x, y, k, c) {
      const s = side();
      line(x - s * 26 * k, y - 18 * k, x + s * 26 * k, y - 28 * k, 14, '', { body: c, pr: 5, gr: 0.22, dry: 0.35, life: 0.12 });
      later(0.04, () => line(x + s * 22 * k, y - 8 * k, x + s * 16 * k, y - 16 * k, 12, '', { body: c, pr: 1, gr: 0.25, dry: 0.15, life: 0.1 })); // 점 — 눌러 둥근 끝에서 뾰족하게(물방울)
    },
    floor(x, y, k, c) {
      const s = side();
      line(x + s * 62 * k, y - 40 * k, x + s * 8, y - 6, 15, '', { body: c, pr: 5, gr: 0.24, dry: 0.4, life: 0.3 }); // 꼬리는 플레이어 앞에서 끝난다(몸을 덮지 않게)
      later(0.1, () => {
        line(x - s * 14, y - 4, x - s * 46 * k, y + 8, 14, '', { body: c, pr: 1, gr: 0.2, dry: 0.4, life: 0.26 }); // 첫 획과 같은 쪽으로 이어 빠지는 파임(마주 그으면 V = 새 · 체크 표시)
      });
    },
    // 완파 — 플레이어 옆 한 칸(화면 120 남짓 · 화면 안)에 클 태 자: 가로 · 삐침 → 파임 → 점이 빠른 박자로 그어져 여섯째 프레임에 다 선다.
    // 머리 바로 위 한 글자는 머리 위 경고 글자 연출로 읽히고, 느리게 그으면 가장 센 순간에 덜 쓴 글자가 보인다. 화면 끝에 잘리면 점이 가려져 큰 대 자로 읽힌다
    destroy(x, y, k, c) {
      const s = side();
      const [cx, cy] = [x + s * 40, y - 30];
      const o = { body: c, gr: 0.1, dry: 0.4, life: 0.46 };
      line(cx - 35, cy - 13, cx + 35, cy - 18, 15, '', { ...o, pr: 5 }); // 가로
      line(cx + 3, cy - 40, cx - 35, cy + 35, 14, '', { ...o, pr: 5, bend: -8 }); // 삐침
      later(0.04, () => line(cx + 2, cy - 11, cx + 38, cy + 34, 15, '', { ...o, pr: 4, dry: 0.3, life: 0.42 })); // 파임
      later(0.08, () => {
        line(cx + 6, cy + 26, cx - 6, cy + 14, 20, '', { ...o, pr: 1, dry: 0.1, life: 0.38 }); // 점(물방울 · 따로 선 덩이로 크게)
        drops(cx, cy + 8, N(2, k), -Math.PI - 0.3, 0.3, 160, 320, 2.4, c, 900, true);
      });
    },
    whiff(x, y, c) {
      line(x, y, x - 14, y + 12, 5, '', { body: c, pr: 5, gr: 0.3, dry: 0.4, life: 0.2 });
    },
    // 칼 기운 — 날 곁 허공에 날을 따라 눕힌 마른 획(끝이 갈라짐)이 그어졌다 끊긴다. 위로 오르는 획은 화염 칼 기운과 같은 꼴(파란 불꽃)로,
    // 붓 날 곁 파란 점은 우산 · 빗방울로 읽힌다. 땅에서 띄운 날 자리 바깥에서 긋는다
    // (서 있을 땐 칼끝이 땅에 닿아 있다 — 칼끝만 보면 늘 건너뛰어 칼 기운이 안 보이고, 날 위에 그으면 먹 칼에 묻힌다)
    aura(b, n, c) {
      let t = 0.9;
      while (t > 0 && along(b, t)[1] >= GROUND - 28) t -= 0.1;
      if (t <= 0) return;
      const [bx, by] = along(b, t);
      const ang = Math.atan2(b[3] - b[1], b[2] - b[0]);
      const sd = (n % 4 < 2 ? 1 : -1) * 8;
      const [x, y] = [bx - Math.sin(ang) * sd, by + Math.cos(ang) * sd];
      const o = ang + sgn() * 0.12; // 손 쪽에서 칼끝 쪽으로 날을 따라 긋는다
      if (Math.abs(Math.atan2(Math.sin(o + Math.PI / 2), Math.cos(o + Math.PI / 2))) < 0.87) return; // 위 ±50도로 솟는 획은 파란 불꽃으로 읽힌다
      const len = Math.min(26, (GROUND - 14 - y) / Math.max(0.3, Math.sin(o))); // 끝이 땅에 닿으면 파란 웅덩이 · 물방울로 읽힌다 — 남은 높이만큼 줄인다(건너뛰면 서 있을 때 한 번도 안 그려진다)
      if (len < 10) return;
      line(x, y, x + Math.cos(o) * len, y + Math.sin(o) * len, 6, '', { body: c, pr: 5, gr: 0.3, dry: 0.6, life: 0.26 });
    },
    every: 0.16,
    tint: true,
  },
  // 흑철 — 공간이 찢긴다: 맞은 자리에서 먼저 먹 실금이 곧게 번지고, 그 금을 따라 자주 틈이 확 벌어졌다가 탁 닫혀 자주 한 줄만 남는다.
  // 틈 = 시그니처 자주 몸 + 한 단 짙은 자주 속(먹 없음) · 한쪽 가장자리만 큰 이(찢긴 천 올), 다른 쪽은 잔 이. 맞은 자리에 붙어 사선으로 찢어 나간다 —
  // 타격은 칼끝 앞에서 벽을 타고 급하게, 층 깨기는 큰 틈 + 다른 각의 작은 틈, 완파는 플레이어 옆 위에서 휘두른 쪽 위로 35도(머리에 닿지 않게 · 화면 끝에 닿지 않게).
  // 머리 위에 가로로 뜬 띠는 황금 리본 몫이라 쓰지 않는다. 칼길은 칼끝 쪽 짧은 칼금 하나
  jag: {
    trail: { w: 12, dry: 0.45 },
    own: true,
    swing(fx, fy, w, life, c, turn, grow) {
      // 호를 긋지 않는다 — 칼이 지난 현(곧은 칼금) 하나가 열렸다 닫힌다(호 띠는 화염 · 서리 칼길과 같은 초승달이 된다)
      const [ax, ay] = greatArcPoint(0.36, 0, turn, grow); // 칼끝 쪽 짧은 현만 — 머리까지 닿으면 맞은 자리 틈과 엇갈려 곡괭이로 읽힌다
      const [bx, by] = greatArcPoint(0.05, 0, turn, grow);
      const [mx, my, ma, ml] = [fx + (ax + bx) / 2, fy + (ay + by) / 2, Math.atan2(by - ay, bx - ax), Math.hypot(bx - ax, by - ay) * 1.2];
      later(0.03, () => rift(mx, my, ma, ml * 0.85, w * 0.4, c, life * 0.35)); // 칼금 굵기 — 너무 가늘면 1배에서 안 보이고, 길고 넓게 오래 뜨면 둘째 칼 · 곡괭이로 읽힌다
      later(0.03 + life * 0.4, () => snap(mx, my, ma, ml * 0.8, c));
    },
    // 타격 — 칼끝 앞에서 건물 벽을 타고 급하게(70도) 짧고 넓게 찢어 오른다(칼 위에 가로로 얹으면 칼과 T자가 되어 곡괭이 · 우산 · 망치로 읽힌다)
    hit(x, y, k, c) {
      const s = side();
      const a = s > 0 ? -1.2 : Math.PI + 1.2;
      const [rx, ry] = [x + s * 30, y - 14];
      rift(rx, ry, a, 32 * k, 24, c, 0.12);
      later(0.11, () => snap(rx, ry, a, 22 * k, c));
    },
    // 층 깨기 — 벽을 타고 비스듬히 찢긴 큰 틈 하나 + 반대쪽 다른 각의 작은 틈(나란한 틈 여럿은 짐승 발톱 자국으로 읽힌다)
    floor(x, y, k, c) {
      const s = side();
      const yy = y - 34;
      const a = s > 0 ? -1.0 : Math.PI + 1.0;
      rift(x + s * 30, yy, a, 54 * k, 26, c, 0.18);
      later(0.05, () => rift(x - s * 44, yy - 26, s > 0 ? Math.PI + 1.45 : -1.45, 28 * k, 12, c, 0.14));
      later(0.17, () => snap(x + s * 30, yy, a, 40 * k, c));
    },
    // 완파 — 플레이어 옆 위(넓은 끝)에서 휘두른 쪽 위로 35도 찢어 나간다. 실금이 먼저 번진 뒤 벌어지고 탁 닫혀 자주 한 줄.
    // 넓은 끝이 머리에 닿으면 플레이어를 겨눈 창으로, 화면 끝에서 들어오면 깃발 · 리본으로, 화면 폭을 덮는 대칭 방추형은 비행선 · 감은 눈으로 읽힌다
    destroy(x, y, k, c) {
      const s = side();
      const a = s > 0 ? -0.6 : Math.PI + 0.6;
      let L = 64 * Math.min(k, 1.25); // 콤보 단을 다 타면 가는 끝이 화면 밖에서 잘린다
      let [rx, ry] = [x, y];
      for (let i = 0; i < 6; i++) { // 두 끝이 화면 안 24px 안쪽에 들 때까지 줄인다(그림은 확대 1.6배로 놓인다)
        [rx, ry] = [x + s * 26 + Math.cos(a) * L * 0.3, y - 30 + Math.sin(a) * L * 0.3]; // 넓은 자리(−L 쪽 3할)가 플레이어 옆 위에 온다
        const ends = [-1, 1].map((d) => x + (rx + (d * Math.cos(a) * L) / 2 - x) * WEAPON_FX.SIZE);
        if (Math.min(...ends) >= 24 && Math.max(...ends) <= VIEW.W - 24) break;
        L *= 0.88;
      }
      rift(rx, ry, a, L, 40, c, 0.28);
      later(0.27, () => snap(rx, ry, a, L * 0.85, c));
    },
    // 헛스윙 — 칼길 칼금 하나뿐(따로 그은 틈이 칼금과 엇갈리면 X · 가위 · 잠자리로 읽힌다)
    // 칼 기운 — 날 곁에 날 결을 따라 가는 틈(자주 몸)이 숨 쉬듯 열렸다 닫힌다(칼날보다 길면 지느러미 · 우산으로 읽힌다 · 날에 겹치면 먹 칼에 묻힌다).
    // 자리는 날 한쪽 · 날 길이 절반쯤에 고정(번갈아 건너뛰면 틈이 깜빡이며 옮겨 다닌다)
    aura(b, _n, c) {
      const ang = Math.atan2(b[3] - b[1], b[2] - b[0]);
      const [bx, by] = along(b, 0.55 + n01() * 0.1);
      rift(bx - Math.sin(ang) * 9, by + Math.cos(ang) * 9, ang + sgn() * 0.1, 18 + n01() * 4, 3.5, c, 0.28);
    },
    every: 0.3,
    tint: true,
  },
  // 황금 — 금박. 리본(폭이 같은 띠 · 같은 쪽으로 비스듬히 잘린 두 끝 · 접힘 금에서 앞 밝은 금 7할 · 뒤 금)이 한쪽 끝에서 풀려 나오고, 잔 박은 곧은 변의 얇은 평행사변형이
  // 앞 밝은 금 → 옆으로 선 가는 선 → 뒤 금으로 뒤집히며 흔들리며 내린다. 칼길은 칼끝에서 벗겨져 말리는 좁은 리본 한 가닥, 친 자리엔 리본 한 가닥 + 잔 박 둘,
  // 층 깨기는 리본 + 바닥에서 말려 오르는 박, 완파는 맞은 자리에서 풀려 나온 화면 절반 길이 리본이 펄럭이다 띠를 따라 금박 열둘로 찢겨 흩어져 내린다.
  // 머리 위 가로 자리는 황금 몫(흑철은 맞은 자리 사선). 가운데 큰 원판 · 방사형은 쓰지 않는다
  royal: {
    trail: { w: 9, dry: 0.15 },
    own: true,
    swing(fx, fy, w, life, c, turn, grow) {
      const s = Math.max(0.9, Math.min(1.3, w / 9));
      const [x, y, a] = arcOut(fx, fy, 0.3, turn, grow);
      ribbon(x, y, 44 * s, a + Math.PI / 2, c, life * 0.9, 0.3, 0.5); // 칼날에서 띄우면 칼 옆 바나나로 읽힌다 // 호를 따라 눕혀 끌리는 가는 리본 — 잔 박만 튀면 색종이로, 짧고 굵게 서면 바나나 · 불꽃으로 읽힌다
      for (let i = 0; i < 2; i++) {
        const [px, py, pa] = arcOut(fx, fy, 0.35 + i * 0.3, turn, grow);
        later(0.02 * i, () => leafPiece(px, py, (6 + i * 2) * s, { ...vel(pa, 60 + n01() * 50), g: 160, drag: 1.8, life: life + 0.3 }, c));
      }
    },
    // 타격 — 맞은 층 곁에서 리본 한 가닥이 풀려 나오고 + 잔 박 둘
    hit(x, y, k, c) {
      const s = side();
      ribbon(x + s * 14, y - 34, 36 * k, s > 0 ? 0 : Math.PI, c, 0.16, 0.25, -0.2); // 길이 : 폭 6.5 : 1(가늘고 길면 지렁이 · 장어, 5 : 1로 넓으면 감자칩 · 라자냐 면) // 머리를 가리지 않게 층 안쪽 위로 · 플레이어 쪽 끝에서 빠르게 풀린다(늦게 풀리면 첫 틱이 한 굽이 = 부메랑)
      later(0.07, () => {
        for (let i = 0; i < 2; i++) leafPiece(x + s * 14 + sgn() * 10, y - 8, 7 + n01() * 2, { ...vel(-Math.PI / 2 + sgn() * 1.2, 240 * (0.5 + n01() * 0.6)), g: 240, drag: 2.6, life: 0.3 }, c);
      });
    },
    floor(x, y, k, c) {
      const s = side();
      ribbon(x + s * 20, y - 34, 46 * k, s > 0 ? 0 : Math.PI, c, 0.2, 0.25);
      for (let i = 0; i < N(4, k); i++) {
        const dx = sgn() * 64 * k;
        later(n01() * 0.1, () => leafPiece(x + dx, y + 2, 9 + n01() * 5, { vx: sgn() * 30, vy: -120 - n01() * 90, g: 180, drag: 1.6, life: 0.3 }, c));
      }
    },
    // 완파 — 머리 위 가운데에서 화면 절반 길이 리본이 바로 풀려 나와(15도 기움 · 두 끝 다 화면 안) S자로 펄럭이다, 띠를 따라 금박 열둘로
    // 한 장씩 차례로 찢겨 위아래 · 양옆으로 흩어져 가라앉는다(같은 틱에 고른 간격으로 나면 대각선 점선으로 읽힌다). 플레이어 옆 사선 자리는 흑철 몫
    destroy(x, y, _k, c) {
      const s = side();
      const rot = s > 0 ? -0.26 : Math.PI + 0.26;
      const A = 66 * 0.5 * 1.6; // 리본 반 길이(축 기준)
      const sx = Math.min(264, Math.max(96, x)); // 화면 폭 360 — 리본 끝이 잘리지 않게(화면 자리로 잡아 축 기준으로 되돌린다)
      const [bx, by] = [x + (sx - x) / WEAPON_FX.SIZE, y - 60];
      ribbon(bx, by, 66, rot, c, 0.3, 0.25);
      for (let j = 0; j < 12; j++) { // 띠 안 아무 자리에서 한 장씩 · 위아래로 넓게(고른 간격 · 같은 높이면 점선 · 금괴 줄로 읽힌다)
        later(0.1 + j * 0.022, () => {
          const d = (n01() * 2 - 1) * A * 0.9;
          leafPiece(bx + Math.cos(rot) * d, by + Math.sin(rot) * d + sgn() * 24 * n01(), 5 + (j % 3) * 2 + n01() * 1.5, {
            vx: sgn() * (30 + n01() * 70), vy: -80 + n01() * 110, g: 150, drag: 1.5, life: 0.46 + n01() * 0.16, sw: 6 + n01() * 3,
          }, c);
        });
      }
    },
    // 헛스윙 — 칼길 리본에 박 둘만 더한다(리본을 한 가닥 더 풀면 칼길 리본과 엇갈려 X · 바람개비로 읽힌다)
    whiff(x, y, c) {
      for (let i = 0; i < 2; i++) leafPiece(x + sgn() * 6, y, 7 + i * 2, { ...vel(-Math.PI / 2 + sgn() * 1.2, 90 + n01() * 40), g: 240, drag: 2.6, life: 0.4 }, c);
    },
    // 칼 기운 — 날에서 얇은 금박이 한 장씩 벗겨져 나풀거리며 떠올랐다 뒤집히며 내린다
    aura(b, n, c) {
      if (n % 2) return;
      const [x, y] = along(b, 0.3 + n01() * 0.6);
      leafPiece(x, y, 9 + n01() * 2, { vx: sgn() * 16, vy: -40 - n01() * 20, g: 110, drag: 1.6, life: 0.5, sw: 10 }, c);
    },
    every: 0.12,
    tint: true,
  },
};

const GOLD_GLINT = '#F6E3A0';
/** 다이아 드릴 홈 — 몸 청록보다 한 단 짙은 청록(먹 빗금은 「먹 안에 색」 · 공사중 빗금과 겹친다) */
const DRILL_DEEP = '#167C88';
/** 흑철 틈 속 — 몸 자주보다 한 단 짙은 자주(먹 속은 「먹 안에 색」 · 가운데 먹 줄은 깃대로 읽힌다) */
const ONYX_DEEP = '#4E2858';

const inkOf = (w: WeaponId): string => (WEAPON_INK as Record<string, string>)[w] ?? PALETTE.YELLOW_DEEP;

/** 콤보 단 — 50·100·200에서 한 단씩 */
export const tierK = (c: number): number => (c >= 200 ? 1.8 : c >= 100 ? 1.5 : c >= 50 ? 1.25 : 1);

/** 콤보 고비를 넘는 타격 — 크게 돈 붓 잔상 하나 + 그 칼의 타격을 두 배로 */
function flare(r: Recipe, g: GreatLook, c: number, x: number, y: number, footX: number, footY: number, col: string): void {
  const m = comboMilestone(lastCombo, c);
  lastCombo = c;
  if (m === null) return;
  if (r.swing) r.swing(footX, footY, r.trail.w * 1.4, 0.42, col, 0.12, 1.25);
  else if (g.shape === 'beam') bentTrail(footX, footY, r.trail.w * 1.4, col, 0.42);
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
    if (r.swing) r.swing(footX, footY, w, life, col, turn, grow);
    else if (g.shape === 'beam') bentTrail(footX, footY, w, core, life);
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
      if (r.own && e.last) {
        lastCombo = c; // 버터 마지막 겹 — 같은 틱에 완파가 나간다(칼길 · 타격까지 그리면 두 겹)
        return;
      }
      const y = GROUND - (e.y ?? s.player.y) - (r.own ? 24 : 0); // 전설은 맞은 층 안쪽에 — 층 밑변(맞은 자리)은 플레이어 머리와 겹친다
      if (swing) swish(r.trail.w * b.k, 0.26, col, b.turn, b.k);
      const a = b.ang + sgn() * 0.08; // 내려베기 → 올려베기 → 가로
      const len = (44 + 8 * k) * b.k;
      scaled(x, y, WEAPON_FX.SIZE, () => {
        if (!r.own) {
          stroke(x + sgn() * 6, y, a, len, 4.5 * b.k, col, { life: 0.2, stripes, dry: r.trail.dry * 0.5 });
          if (c >= 100) stroke(x + sgn() * 8, y + 8, a + 0.07, len * 0.75, 3, '', { life: 0.2, dry: 0.4 }); // 겹 베기
          spat(x, y, 3.2 * k * b.k, -Math.PI / 2 + sgn() * 0.4, col, '', 0.12, 3); // 벤 순간 — 포인트 색 튐
        }
        r.hit(x, y, k * (r.own ? b.k : 1), col);
      });
      flare(r, g, c, x, y, footX, footY, col);
      return;
    }
    case 'floorCollapse': {
      const y = GROUND - (e.y ?? s.player.y);
      // 전설 — 마지막 층이면 같은 틱에 완파가 나간다. 칼길 · 층 깨기 그림까지 그리면 완파 대표 순간이 두 겹(틈 둘 · 리본 둘 · 줄기 덩굴 · 격자 사다리)이 된다
      if (r.own && (e.last || e.waza)) { // 올려베기는 한 틱에 층을 여럿 깬다 — 층마다 그리면 겹겹이 쌓인다(필살 그림이 맡는다)
        lastCombo = c; // 콤보 고비 그림은 완파가 맡는다 — 셈만 밀리지 않게
        return;
      }
      if (swing) swish(r.trail.w, 0.3, col);
      scaled(x, y, WEAPON_FX.SIZE, () => {
        if (!r.own) stroke(x, y, 0.3, 96 + 10 * k, 8, col, { life: 0.26, stripes, dry: r.trail.dry * 0.5 }); // 한 사건 = 한 획
        r.floor(x, y, k, col);
      });
      flare(r, g, c, x, y, footX, footY, col);
      return;
    }
    case 'stackDestroy': {
      const y = footY - 70; // 이벤트 y가 없다 — 마지막 층이 있던 머리 위
      const kk = Math.max(k, 1.25);
      scaled(x, y, WEAPON_FX.SIZE, () => {
        if (!r.own) stroke(x, y, 0.22, 230, 14, col, { life: 0.32, dry: 0.3, stripes });
        r.destroy(x, y, kk, col);
        // 완파 물들임 — 모티프 한 번 더(화면은 칠하지 않는다). 전설(own)은 완파 자체가 시그니처 색 몸의 둘째 박자 마무리라
        // 층 깨기 그림을 옆에 덧얹지 않는다(공중에 뜬 얼음판 · 획 순서 깨짐)
        if (r.tint && !r.own) r.floor(x + sgn() * 40, y - 46, kk, col);
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
    const r = RECIPES[g.shape];
    if (!r.own) stroke(x, y, power === 'hit' ? sgn() * 0.6 : 0.3, whole ? 170 : 96, whole ? 13 : 8, col, { life: 0.3, stripes: g.shape === 'stripe' ? 1 : 0, dry: 0.2 });
    r[power](x, y, 1.5, col);
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
        if (p.hold >= 1) {
          // 전설 물감 방울은 땅에 고이지 않는다(웅덩이로 읽힌다) — 닿으면 곧 사라진다
          p.alive = false;
          live -= 1;
          continue;
        }
        p.st = 1;
        p.y = GROUND;
        p.vx = 0;
        p.vy = 0;
        p.g = 0;
        if (1 - p.life / p.max >= 0.4 && p.hold < 1) p.c1 = INK; // 공중에서 이미 마른 방울은 번져도 마른 채로(나이를 새로 세면 포인트 색이 되살아난다)
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
    if (p.c2 !== INK) hotCore(ctx, u / hold, (k) => paint(p.v * 0.42 * k, c0, c1, 0)); // 먹 속(흑철 틈)은 빛나지 않는다
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

/** 튐 · 방울 · 가루의 포인트 색은 벤 순간(삶의 앞 4할)뿐 — 그 뒤엔 먹으로 마른다(불씨는 재, 톱밥은 먼지). hold 1 = 전설 물감 · 불티라 마르지 않는다 */
const dried = (p: Bit, u: number): string => (u < 0.4 || p.hold >= 1 ? p.c1 : INK);

/** 앞 몫에 살짝 넘치며 다 큰다(0 → 1.07 → 1) */
const backOut = (t: number): number => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;

/** 꺾인 띠 — 상대 좌표 점들을 지나는 모서리 날카로운 면(지금 fillStyle). hw(i) = i번째 점의 반폭 */
function band(ctx: CanvasRenderingContext2D, pts: readonly number[], hw: (i: number) => number): void {
  const n = pts.length >> 1;
  const L: number[] = [];
  const R: number[] = [];
  for (let i = 0; i < n; i++) {
    let nx = 0;
    let ny = 0;
    for (const j of [i - 1, i]) {
      if (j < 0 || j >= n - 1) continue;
      const dx = pts[2 * j + 2] - pts[2 * j];
      const dy = pts[2 * j + 3] - pts[2 * j + 1];
      const l = Math.hypot(dx, dy) || 1;
      nx -= dy / l;
      ny += dx / l;
    }
    const l = Math.hypot(nx, ny) || 1;
    const m = (i > 0 && i < n - 1 ? Math.min(2.4, 2 / l) : 1) * hw(i); // 모서리는 마이터 길이만큼(너무 뾰족하면 자른다)
    L.push(pts[2 * i] + (nx / l) * m, pts[2 * i + 1] + (ny / l) * m);
    R.push(pts[2 * i] - (nx / l) * m, pts[2 * i + 1] - (ny / l) * m);
  }
  ctx.beginPath();
  for (let i = 0; i < n; i++) ctx.lineTo(L[2 * i], L[2 * i + 1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[2 * i], R[2 * i + 1]);
  ctx.closePath();
  ctx.fill();
}

/** 선 길이를 따라 d 자리 — [x, y, 법선 x, 법선 y] */
function pathAt(pts: readonly number[], cum: readonly number[], d: number): [number, number, number, number] {
  let j = 0;
  while (j < cum.length - 2 && cum[j + 1] < d) j++;
  const dx = pts[2 * j + 2] - pts[2 * j];
  const dy = pts[2 * j + 3] - pts[2 * j + 1];
  const l = Math.hypot(dx, dy) || 1;
  const f = Math.min(1, Math.max(0, (d - cum[j]) / l));
  return [pts[2 * j] + dx * f, pts[2 * j + 1] + dy * f, -dy / l, dx / l];
}

/**
 * 색 몸 조각(전설) — 시그니처 색(c1)이 몸, c2가 밝은 면, 얇은 먹 테(st 1 = 없음). 앞 gr에 살짝 넘치며 자라고 hold 뒤엔 모양으로 사라진다.
 * 모양은 a(CEL): 불 혀 · 얼음 가시 · 틈 · 찢긴 금박 · 드릴 비트 · 꺾인 띠(번개) · 격자 지브 · 갈고리 · 말린 부스러기 · 판
 */
function drawCel(ctx: CanvasRenderingContext2D, p: Bit, py: number, u: number, age: number): void {
  const gr = p.gr || 0.12;
  const hold = p.hold || 0.7;
  const g = u < gr ? backOut(u / gr) : 1;
  const e = u > hold ? (1 - u) / (1 - hold) : 1;
  const fill = (c: string, path: () => void): void => {
    ctx.fillStyle = c;
    ctx.beginPath();
    path();
    ctx.fill();
  };
  const rim = (path: () => void, lw = 1.4): void => {
    if (p.st) return;
    ctx.strokeStyle = INK;
    ctx.lineWidth = lw;
    ctx.beginPath();
    path();
    ctx.stroke();
  };
  ctx.save();
  ctx.translate(p.x, py);
  switch (p.a) {
    case CEL.flame: {
      // 불 혀 — 둥근 밑동에서 흔들리며 뾰족하게 솟는다(속 = 밝은 짝). 한 덩이 혀는 같은 박자로 흔들리고(뿌린 높이로 위상) 곁가지 끝도 같은 쪽(dry).
      // 사라질 땐 밑동이 떨어져 오르며 줄어든다
      ctx.rotate(p.rot);
      const H = p.size * g * (0.35 + 0.65 * e);
      const w = p.v * 0.5 * Math.min(1, g) * e;
      if (H < 1 || w < 0.4) break;
      const x0 = p.size * (1 - e) * 0.45;
      const sw = p.sw * Math.sin(age * 13 + p.oy * 0.02);
      if (p.dry) ctx.scale(1, -1);
      const inner = (h: number, r: number, b: number) => (): void => {
        ctx.moveTo(b, -r);
        ctx.bezierCurveTo(b + h * 0.35, -r * 1.15, b + h * 0.6, -r * 0.35 + sw * 0.5, b + h, sw);
        ctx.bezierCurveTo(b + h * 0.6, r * 0.35 + sw * 0.5, b + h * 0.35, r * 1.15, b, r);
        ctx.arc(b, 0, r, Math.PI / 2, Math.PI * 1.5);
      };
      // 바깥 혀는 한쪽 옆구리에 곁가지 끝이 하나 더 갈라진다(대칭 물방울이 아니라 불)
      const out = (): void => {
        const [h, r, b] = [H, w, x0];
        ctx.moveTo(b, -r);
        ctx.bezierCurveTo(b + h * 0.2, -r * 1.3, b + h * 0.42, -r * 1.25, b + h * 0.64 + sw * 0.3, -r * 0.98 + sw * 0.2);
        ctx.quadraticCurveTo(b + h * 0.47, -r * 0.5, b + h * 0.5, -r * 0.2);
        ctx.bezierCurveTo(b + h * 0.7, -r * 0.3, b + h * 0.86, sw * 0.6 - r * 0.1, b + h, sw);
        ctx.bezierCurveTo(b + h * 0.64, r * 0.45 + sw * 0.5, b + h * 0.35, r * 1.15, b, r);
        ctx.arc(b, 0, r, Math.PI / 2, Math.PI * 1.5);
      };
      fill(p.c1, out);
      if (p.c2) fill(p.c2, inner(H * 0.62, w * 0.56, x0 + w * 0.2)); // 속은 밝은 짝 한 단으로 끝낸다(종이빛 가운데는 네온으로 튄다)
      rim(out);
      break;
    }
    case CEL.spike: {
      // 얼음 가시 — 각진 결정. 어깨가 밑동 가까이(5분의 2)라 끝이 길게 뾰족하다(어깨가 멀면 알약으로 읽힌다). 위 반쪽이 밝은 면이라 가운데 등줄기가 선다
      ctx.rotate(p.rot);
      const L = p.size * g * e;
      const w = p.v * 0.5 * Math.min(1, g) * e;
      if (L < 1) break;
      const out = (): void => {
        ctx.moveTo(0, -w * 0.7);
        ctx.lineTo(L * 0.4, -w);
        ctx.lineTo(L, 0);
        ctx.lineTo(L * 0.4, w);
        ctx.lineTo(0, w * 0.7);
        ctx.closePath();
      };
      fill(p.c1, out);
      if (p.c2) {
        fill(p.c2, () => {
          ctx.moveTo(0, -w * 0.7);
          ctx.lineTo(L * 0.4, -w);
          ctx.lineTo(L, 0);
          ctx.lineTo(0, 0);
          ctx.closePath();
        });
      }
      rim(out);
      break;
    }
    case CEL.slit: {
      // 찢김 — 먼저 먹 실금이 양끝에서 찢김 결을 따라 곧게 번지고(앞 3할), 그 금을 따라 틈이 확 벌어진다(넓은 자리는 −L 쪽 3할 · 반대 끝은 가늘게 빠진다).
      // 몸 = 시그니처 자주 · 속 = 한 단 짙은 자주(폭 4할 남짓 · 먹 없음). 한쪽(위) 가장자리에만 찢긴 천 올 같은 큰 이 넷, 다른 쪽은 잔 이.
      // 둘레에서 밀려나 떨어진 가늘고 긴 밝은 천 조각 둘. 걸려 있다가 탁 닫힌다.
      // 위아래가 같은 톱니 + 가운데 먹 줄은 지네 · 깃털 · 고사리 · 지퍼로, 꺾이거나 갈래 친 실금은 잔가지로, 매끈한 윤곽은 창으로,
      // 먹이 7할인 구멍은 검은 칼날 · 배로, 위아래 대칭 방추형은 비행선 · 입술로 읽힌다. 가는 틈(칼길 · 칼 기운)은 실금 · 조각 없이
      ctx.rotate(p.rot);
      const L = p.size * 0.5;
      const big = p.v >= 8;
      const cp = Math.min(1, u / (gr * 0.5)) * Math.min(1, e * 1.5); // 실금이 번진 정도
      const op = big ? (u < gr * 0.35 ? 0 : Math.min(1, (u - gr * 0.35) / (gr * 0.65))) : Math.min(1, u / gr);
      // 벌어짐은 넓은 자리(t 0.3)에서 양끝으로 달려 나가고, 닫힘은 양끝에서 넓은 자리로 돌아온다(한꺼번에 부풀고 줄면 붙여 둔 그림으로 읽힌다)
      const oc = Math.min(op, e);
      const run = (t: number): number => Math.min(1, Math.max(0, (oc * 1.4 - Math.abs(t - 0.3)) / 0.3));
      const w = p.v * 0.5 * (op < 1 ? 1 + 0.15 * Math.sin(op * Math.PI) : 1);
      // 넓은 끝(−L)은 뭉툭하게 뜯긴 단면 · 반대 끝만 뾰족(양끝이 다 뾰족한 렌즈는 깃털로 읽힌다)
      const prof = (t: number): number => (t < 0.3 ? 0.55 + 0.45 * (t / 0.3) ** 0.5 : ((1 - t) / 0.7) ** 0.75) * run(t);
      const BIG = [0.14, 0.33, 0.52, 0.72];
      const X = (t: number): number => -L + 2 * L * t;
      const jit = (j: number): number => 0.8 + 0.2 * Math.abs(Math.sin(p.seed * 1.3 + j * 2.1));
      const edge = (k: number, add: number) => (): void => {
        ctx.moveTo(-L - add, -(w * k * prof(0) * 0.6 + add));
        BIG.forEach((t, j) => { // 큰 이는 가장자리에 곧게 선다(끝 쪽으로 누우면 바람에 누운 불 혀로 읽힌다)
          ctx.lineTo(X(t - 0.05), -(w * k * prof(t - 0.05) * 0.45 + add));
          ctx.lineTo(X(t - 0.03), -(w * k * prof(t) * jit(j) + add)); // 뭉툭한 끝 쪽으로 젖힌 뜯긴 판
          ctx.lineTo(X(t + 0.05), -(w * k * prof(t + 0.05) * 0.45 + add));
        });
        ctx.lineTo(X(0.86), -(w * k * prof(0.86) * 0.45 + add));
        ctx.lineTo(L + add, 0);
        for (let j = 13; j >= 1; j--) ctx.lineTo(X(j / 14), w * k * 0.7 * prof(j / 14) * (j % 2 ? 0.82 : 1) + add);
        ctx.lineTo(-L - add, w * k * 0.7 * prof(0) + add);
        ctx.closePath();
      };
      if (big) {
        // 실금 — 양끝에서 찢김 결을 따라 곧게 둘씩(꺾이거나 갈래 치면 잔가지, 옆으로 뻗으면 다리로 읽힌다)
        const CR = [[-1, Math.PI + 0.1, 0.45], [-1, Math.PI - 0.24, 0.28], [1, 0.08, 0.5], [1, -0.26, 0.3]] as const;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        CR.forEach(([t, a, lf], j) => {
          const jj = Math.sin(p.seed * 1.7 + j * 2.3);
          const len = L * lf * (0.8 + 0.4 * Math.abs(jj)) * cp;
          if (len < 1) return;
          const b = a + jj * 0.08;
          ctx.moveTo(t * L, 0);
          ctx.lineTo(t * L + Math.cos(b) * len, Math.sin(b) * len);
        });
        ctx.stroke();
      }
      if (w < 0.4) break;
      const lip = 1.5;
      fill(p.c1, edge(1, lip));
      ctx.translate(0, -w * 0.22); // 속은 큰 이 쪽으로 치우친 깊은 골(가운데 놓이면 깃대로 읽힌다)
      fill(ONYX_DEEP, edge(0.42, 0));
      ctx.translate(0, w * 0.22);
      if (big && p.c2) {
        const q = Math.max(2.5, w * 0.3);
        for (const [t, side] of [[0.24, -1], [0.58, 1]] as const) {
          if (run(t) < 1) continue;
          const [sx, sy] = [X(t), side * (w * prof(t) * 0.9 + lip + 3)];
          const shard = (): void => {
            ctx.moveTo(sx - q * 1.8, sy);
            ctx.lineTo(sx + q * 1.8, sy + side * q * 0.5);
            ctx.lineTo(sx + q * 0.3, sy - side * q * 0.35);
            ctx.closePath();
          };
          fill(p.c2, shard);
          rim(shard, 1);
        }
      }
      rim(edge(1, lip), 1.2);
      break;
    }
    case CEL.tile: {
      // 금박 — v > 0 = 리본(아래), v 0 = 찢긴 얇은 박: 돌며 뒤집힌다(앞 밝은 짝 — 건물 베이지에 묻히지 않게 → 옆으로 선 가는 선 → 뒤 몸 색).
      // 기울기는 ±20° 안(45°로 서면 다이아 무늬로 읽힌다). 박은 곧은 변의 얇은 평행사변형(구겨진 변 · 접힌 귀는 감자튀김 · 치즈 · 상자로 읽힌다). 흔들리며 내리고 끝에 오그라든다
      const s = p.size * 0.5 * Math.min(1, g) * e;
      if (s < 0.4) break;
      const fx = Math.cos(p.rot);
      ctx.translate(Math.sin(p.seed + age * 3.4) * p.sw, 0);
      ctx.rotate(((p.seed % 1) - 0.5) * 0.7);
      if (p.v > 0) {
        // 리본 — 폭이 끝까지 같은 띠(길이 : 폭 8 : 1)가 얕게 물결치며 −쪽 끝에서 풀려 나온다(앞 gr 동안). 비스듬한 접힘 금 둘이 띠를 따라 흘러
        // 앞(밝은 금 · 7할) · 뒤(몸 색)를 가른다. 두 끝은 같은 쪽으로 비스듬히 잘린 단면 — V로 파인 제비꼬리는 현수막 · 상장 리본으로 읽힌다.
        // 크림 윤은 앞면 쪽 접힘 모서리에만 가늘게(넓은 크림 면은 구운 빵으로 읽힌다). 꼬인 자리에서 폭이 졸리면 혹이 생겨 꼬인 빵 · 나비 매듭으로 읽힌다
        ctx.rotate(p.rot - ((p.seed % 1) - 0.5) * 0.55);
        const sr = p.size * 0.5 * e;
        const A = sr * 1.6;
        const h = sr * 0.2 * (1 - p.dry);
        const cut = h * 1.6;
        const cyAt = (x: number): number => Math.sin(((Math.PI * x) / A) * 1.6 + p.seed + age * 7) * sr * 0.2 * (1 - p.dry * 0.8); // 가는 리본은 얕게(깊게 굽이치면 J · 물음표) · 두 굽이 S자로 펄럭인다(한 굽이 활꼴은 부메랑 · 바나나 · 해먹으로 읽힌다)
        const dg = h * 0.9;
        const band = (): void => {
          for (let j = 0; j <= 24; j++) {
            const x = -A + cut + ((2 * A - cut) * j) / 24;
            ctx.lineTo(x, cyAt(x) - h);
          }
          for (let j = 24; j >= 0; j--) {
            const x = -A + ((2 * A - cut) * j) / 24;
            ctx.lineTo(x, cyAt(x) + h);
          }
          ctx.closePath();
        };
        ctx.save();
        ctx.beginPath();
        ctx.rect(-A - 4 * h, -sr * 2, (2 * A + 8 * h) * Math.min(1, u / gr), sr * 4); // 풀려 나온 만큼
        ctx.clip();
        const t = age * 1.2 + p.seed;
        const ph = (x: number): number => ((((x + A) / (2 * A) - t) % 1) + 1) % 1;
        const isFront = (x: number): boolean => ph(x) < 0.7;
        const fold = [0, 0.7].map((k) => -A + 2 * A * ((((k + t) % 1) + 1) % 1)).sort((a, b) => a - b);
        const xs = [-A - 8 * dg, ...fold, A + 8 * dg];
        fill(p.c1, band);
        ctx.save();
        ctx.beginPath();
        band();
        ctx.clip();
        for (let i = 0; i + 1 < xs.length; i++) {
          const [xa, xb] = [xs[i], xs[i + 1]];
          if (!isFront((xa + xb) / 2)) continue;
          fill(p.c2 || p.c1, () => {
            ctx.moveTo(xa - 6 * dg, cyAt(xa) - 6 * h);
            ctx.lineTo(xb - 6 * dg, cyAt(xb) - 6 * h);
            ctx.lineTo(xb + 6 * dg, cyAt(xb) + 6 * h);
            ctx.lineTo(xa + 6 * dg, cyAt(xa) + 6 * h);
            ctx.closePath();
          });
          if (p.c2) {
            // 금속 광택 — 앞면 위쪽에 길이 방향으로 경계가 딱 끊긴 크림 금 줄 하나(평평한 두 톤만으로는 노란 테이프로 읽힌다 · 그라데이션 아님)
            fill(GOLD_GLINT, () => {
              ctx.moveTo(xa, cyAt(xa) - h * 0.62);
              ctx.lineTo(xb, cyAt(xb) - h * 0.62);
              ctx.lineTo(xb, cyAt(xb) - h * 0.3);
              ctx.lineTo(xa, cyAt(xa) - h * 0.3);
              ctx.closePath();
            });
          }
        }
        for (const f of fold) {
          const [x0, y0, x1, y1] = [f - dg, cyAt(f) - h, f + dg, cyAt(f) + h];
          if (p.c2) {
            const o = isFront(f + 1) ? 2 : -2; // 앞면 쪽으로 2px 비킨 윤
            ctx.strokeStyle = GOLD_GLINT;
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(x0 + o, y0);
            ctx.lineTo(x1 + o, y1);
            ctx.stroke();
          }
          ctx.strokeStyle = INK;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
        ctx.restore();
        rim(band, 1.6);
        ctx.restore();
        break;
      }
      if (Math.abs(fx) < 0.2) {
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.5);
        ctx.lineTo(0, s * 0.5);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2.8;
        ctx.stroke();
        ctx.strokeStyle = p.c1;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        break;
      }
      ctx.scale(Math.abs(fx), 1);
      const front = fx >= 0 && p.c2 ? p.c2 : p.c1;
      const [A, B] = p.size < 18 ? [s * 1.1, s * 0.46] : [s * 1.4, s * 0.34];
      const par = (): void => {
        ctx.moveTo(-A, -B * 0.9);
        ctx.lineTo(A * 0.7, -B);
        ctx.lineTo(A, B * 0.9);
        ctx.lineTo(-A * 0.7, B);
        ctx.closePath();
      };
      fill(front, par);
      rim(par, 1.3);
      break;
    }
    case CEL.drill: {
      // 오거 비트 — rot 쪽으로 밑동(지름 = v)에서 끝 한 점까지 좁아지는 원추 하나(길이 : 밑 지름 2 : 1 남짓 · 어깨 · 자루 없음 · 가늘고 높으면 고깔).
      // 몸에 짙은 청록 나선 띠가 비스듬히 감기고 띠 사이가 끝으로 갈수록 조밀해진다(남은 길이가 일정 비율로 준다) — 원추 위에 좁아지는 나선이라야 드릴이다.
      // 띠 끝마다 윤곽이 얕게 둥글게 부푼 나사산(위 · 아래 반 칸 엇갈림), 밝은 짝 = 몸 위쪽 윤. 띠는 3프레임마다 3분의 1칸씩 끝 쪽으로 흘러 돈다.
      // 오독: 크게 튀어나온 톱니 단 = 전나무, 원기둥 + 같은 간격 줄무늬 = 연필 · 이발소 기둥, 매끈한 원추 = 고깔, 긴 촉 + 자루 = 로켓, 먹 빗금 = 「먹 안에 색」
      ctx.rotate(p.rot);
      const L = p.size * g * e;
      const w = p.v * 0.5 * Math.min(1, g) * e;
      if (L < 2 || w < 0.5) break;
      const RT = 0.68;
      const ph = (((age / 0.05) | 0) % 3) / 3;
      const qAt = (n: number): number => L * (1 - RT ** (n + ph));
      const nAt = (q: number): number => Math.log(Math.max(1e-3, 1 - q / L)) / Math.log(RT) - ph;
      const base = (q: number): number => w * Math.max(0, 1 - q / L) ** 0.9;
      const r = (q: number, side: number): number => base(q) * (1 + 0.2 * Math.sin(Math.PI * ((((nAt(q) + (side > 0 ? 0.5 : 0)) % 1) + 1) % 1)) ** 2);
      const body = (): void => {
        for (let j = 0; j <= 64; j++) ctx.lineTo((L * j) / 64, -r((L * j) / 64, -1));
        for (let j = 64; j >= 0; j--) ctx.lineTo((L * j) / 64, r((L * j) / 64, 1));
        ctx.closePath();
      };
      fill(p.c1, body);
      ctx.save();
      ctx.beginPath();
      body();
      ctx.clip();
      if (p.c2) fill(p.c2, () => ctx.rect(0, -w * 1.2, L, w * 0.5)); // 위쪽 윤
      for (let n = -1; n < 16; n++) {
        const [q0, q1, q2] = [qAt(n), qAt(n + 0.45), qAt(n + 1)];
        if (q2 - q0 < 1.5) break;
        const sl = (q2 - q0) * 0.5; // 위에서 아래로 반 칸 비껴 감긴다
        const bow = (q2 - q0) * 0.35; // 둥근 몸을 감는 나선의 앞면 — 가운데가 끝 쪽으로 휜 활꼴(곧은 평행 사선은 줄무늬 고깔로 읽힌다)
        fill(DRILL_DEEP, () => {
          ctx.moveTo(q0, -w * 1.2);
          ctx.lineTo(q1, -w * 1.2);
          ctx.quadraticCurveTo(q1 + sl * 0.5 + bow, 0, q1 + sl, w * 1.2);
          ctx.lineTo(q0 + sl, w * 1.2);
          ctx.quadraticCurveTo(q0 + sl * 0.5 + bow, 0, q0, -w * 1.2);
          ctx.closePath();
        });
      }
      ctx.restore();
      rim(body);
      if (p.dry === 1) {
        // 척 — 밑동 뒤 짧고 좁은 짙은 청록 토막 + 평평한 뚜껑(밑 지름 4할 · 길이 1.5할). 넓고 짧으면 러버콘 바닥판, 길면 자루 = 전나무 · 로켓으로 읽힌다
        const cw = w * 0.42;
        const cl = Math.max(2, L * 0.15);
        const ck = (): void => ctx.rect(-cl, -cw, cl, cw * 2);
        fill(DRILL_DEEP, ck);
        rim(ck, 1.2);
      }
      break;
    }
    case CEL.bolt: {
      // 번개 — 한 프레임에 서고, 완파 가운데 큰 줄기(굵기 17 넘게)만 정해진 두 프레임(넷째 · 아홉째)에 꺼진다. 타격 · 칼 기운은 꺼지지 않는다
      // (자주 나오는 그림이 깜빡이면 되풀이 깜빡임이 되고, 대표 순간이 빈다). 몸 = 시그니처 색, 먹 테,
      // 갓 친 동안 가운데 가는 밝은 짝 띠. dry = 머리(첫 점)가 굵고 끝으로 3할까지 가늘다. 끝에 가늘어지며 꺼진다
      const f = Math.round(age * 60);
      if (p.v >= 17 && (f === 4 || f === 9)) break;
      const n = p.pts.length >> 1;
      const k = p.v * 0.5 * e;
      const hw = (i: number): number => k * (p.dry ? 1 - (0.7 * i) / (n - 1) : 0.45 + (0.55 * i) / (n - 1));
      if (k < 0.3) break;
      if (!p.st) {
        ctx.fillStyle = INK;
        band(ctx, p.pts, (i) => hw(i) + 1.6);
      }
      ctx.fillStyle = p.c1;
      band(ctx, p.pts, hw);
      if (p.c2 && u < 0.5) {
        ctx.fillStyle = p.c2;
        band(ctx, p.pts, (i) => hw(i) * 0.24);
      }
      break;
    }
    case CEL.truss: {
      // 격자 지브 — 레일 둘 + 지그재그 살. 머리부터 놓이고(앞 gr) hold 뒤엔 꼬리부터 거둬진다
      const n = p.pts.length >> 1;
      const cum = [0];
      for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(p.pts[2 * i] - p.pts[2 * i - 2], p.pts[2 * i + 1] - p.pts[2 * i - 1]));
      const tot = cum[n - 1];
      const d0 = (u > hold ? (u - hold) / (1 - hold) : 0) * tot;
      const d1 = Math.min(1, u / gr) * tot;
      if (d1 - d0 < Math.max(2, p.v * 2.5)) break; // 거둬지다 남은 짧은 토막은 = · || · # 기호로 읽힌다
      const h = p.v / 2;
      const path = (): void => {
        for (const side of [-1, 1]) {
          for (let d = d0, first = true; ; d = Math.min(d1, d + 6), first = false) {
            const [x, y, nx, ny] = pathAt(p.pts, cum, d);
            if (first) ctx.moveTo(x + nx * h * side, y + ny * h * side);
            else ctx.lineTo(x + nx * h * side, y + ny * h * side);
            if (d >= d1) break;
          }
        }
        const step = Math.max(9, p.v * 1.6); // 살 사이가 넉넉히 비어야 격자로 읽힌다(좁으면 띠 · 애벌레)
        for (let i = Math.ceil(d0 / step), first = true; i * step <= d1; i++, first = false) {
          const [x, y, nx, ny] = pathAt(p.pts, cum, i * step);
          const side = i % 2 ? 1 : -1;
          if (first) ctx.moveTo(x + nx * h * side, y + ny * h * side);
          else ctx.lineTo(x + nx * h * side, y + ny * h * side);
        }
      };
      ctx.beginPath();
      path();
      const lw = Math.min(2.2, 1 + p.v * 0.16);
      ctx.strokeStyle = INK;
      ctx.lineWidth = lw + 1.6;
      ctx.stroke();
      ctx.strokeStyle = p.c1;
      ctx.lineWidth = lw;
      ctx.stroke();
      break;
    }
    case CEL.hook: {
      // 크레인 갈고리 — 매인 자리(뿌린 높이 − size)에서 내려온 먹 와이어 한 줄 → 큰 도르래 덩이(몸 색 · 먹 축) → 먹색 쇠 갈고리(긴 대 · 반달 배 · 위로 뾰족한 끝).
      // 오를 때(vy < 0)만 굽이에 먹 토막이 매달린다.
      // 흔들리고 끝에 오그라든다. 와이어가 지브까지 다 감기면 사라진다
      const s = p.v;
      const pt = -s * 2.35; // 도르래 윗변
      if (p.y + pt <= p.oy - p.size + 2) break;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(0, p.oy - p.size - p.y); // 와이어 한 줄(나란한 두 줄 + 초록 상자는 전선 · 플러그로 읽힌다)
      ctx.lineTo(0, pt);
      ctx.stroke();
      ctx.scale(e, e);
      ctx.rotate(p.sw * Math.sin(age * 9 + p.seed));
      if (p.vy < 0 && p.dry > 0) {
        const b = p.dry * s;
        const hx = -s * 0.46;
        const top = s * 0.3 + b * 1.3; // 걸이 줄을 길게 — 토막이 갈고리에 바로 붙으면 음표 머리로 읽힌다
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(hx - b * 0.5, top);
        ctx.lineTo(hx, s * 0.3);
        ctx.lineTo(hx + b * 0.5, top);
        ctx.stroke();
        fill(p.c2 || INK, () => ctx.rect(hx - b * 0.5, top, b, b * 0.72));
      }
      const pulley = (): void => ctx.rect(-s * 0.93, pt, s * 1.86, s * 1.3);
      fill(p.c1, pulley);
      rim(pulley, 1.2);
      fill(INK, () => ctx.rect(-s * 0.93, pt + s * 0.55, s * 1.86, s * 0.18)); // 도르래 축
      // 갈고리 — 도르래 밑 긴 대 → 반달 배 → 위로 뾰족하게 선 끝(열린 J · 가는 먹 선). 굵게 찬 둥근 배 · 걸쇠로 닫힌 고리는 음표 머리 · 자물쇠로 읽힌다
      ctx.beginPath();
      ctx.moveTo(0, pt + s * 1.3);
      ctx.lineTo(0, -s * 0.3);
      ctx.arc(-s * 0.46, -s * 0.3, s * 0.46, 0, Math.PI);
      ctx.lineTo(-s * 0.92, -s * 0.62);
      ctx.strokeStyle = INK;
      ctx.lineWidth = s * 0.22 + 1;
      ctx.stroke();
      fill(INK, () => {
        ctx.moveTo(-s * 0.92 - s * 0.2, -s * 0.56);
        ctx.lineTo(-s * 0.92, -s * 0.86);
        ctx.lineTo(-s * 0.92 + s * 0.2, -s * 0.56);
        ctx.closePath();
      });
      break;
    }
    case CEL.curl: {
      // 절삭 부스러기 — 얕게 휜 쇳밥 가시(가운데가 굵고 양끝이 뾰족 · 먹 테 · 몸 색)가 돌며 날아간다.
      // 감긴 용수철 · 나선 · C자는 글자(3 · @)로, 물결 띠는 벌레로 읽힌다
      ctx.rotate(p.rot);
      const r = p.size * Math.min(1, g) * e;
      if (r < 0.6) break;
      const t = Math.max(2, r * 0.42); // 몸이 가늘면 먹 테가 이겨 검은 갈매기(하늘의 새)로 읽힌다
      const sliver = (): void => {
        ctx.moveTo(-r, 0);
        ctx.quadraticCurveTo(0, -r * 0.42 - t, r, 0);
        ctx.quadraticCurveTo(0, -r * 0.42 + t, -r, 0);
        ctx.closePath();
      };
      fill(p.c1, sliver);
      rim(sliver, 1);
      break;
    }
    case CEL.plate: {
      // 판 — 납작한 덩이(얼음판 · 크레인 균형추). 가로로 퍼지며 놓인다. dry 1 = 얼음(다 살 때 곧은 금 세 줄이 간다)
      ctx.rotate(p.rot);
      const W = p.size * 0.5 * g * e;
      const H = p.v * Math.min(1, g) * e;
      if (W < 1 || H < 0.5) break;
      const slab = (): void => {
        ctx.moveTo(-W, 0);
        ctx.lineTo(-W + H * 0.7, -H);
        ctx.lineTo(W - H * 0.5, -H);
        ctx.lineTo(W, 0);
        ctx.lineTo(W - H * 0.4, H * 0.4);
        ctx.lineTo(-W + H * 0.5, H * 0.4);
        ctx.closePath();
      };
      if (p.dry) {
        // 얼음 — 깨져 기운 각진 판 한 장(밑은 평평 · 양끝은 비스듬히 잘림). 밝은 짝은 윗모서리를 따라 가는 띠만 — 통째로 칠하거나 고른 톱니를 두르면 왕관 · 판자로,
        // 양끝이 뾰족하면 배 · 고래로 읽힌다
        const ice = (): void => {
          ctx.moveTo(-W, H * 0.35);
          ctx.lineTo(-W, -H * 0.85); // 한쪽 끝은 곧게 잘린다(양끝이 뾰족하면 배 · 고래로 읽힌다)
          ctx.lineTo(-W * 0.35, -H * 1.2);
          ctx.lineTo(W * 0.1, -H * 0.8);
          ctx.lineTo(W * 0.55, -H * 1.1);
          ctx.lineTo(W, -H * 0.25);
          ctx.lineTo(W * 0.92, H * 0.35);
          ctx.closePath();
        };
        fill(p.c1, ice);
        if (p.c2) {
          fill(p.c2, () => {
            ctx.moveTo(-W, -H * 0.85);
            ctx.lineTo(-W * 0.35, -H * 1.2);
            ctx.lineTo(W * 0.1, -H * 0.8);
            ctx.lineTo(W * 0.55, -H * 1.1);
            ctx.lineTo(W * 0.95, -H * 0.35);
            ctx.lineTo(W * 0.55, -H * 0.82);
            ctx.lineTo(W * 0.1, -H * 0.52);
            ctx.lineTo(-W * 0.35, -H * 0.9);
            ctx.lineTo(-W, -H * 0.58);
            ctx.closePath();
          });
        }
        rim(ice, 1.2);
      } else {
        fill(p.c1, slab);
      }
      // 깨질 때(끝 3할)만 위에서 아래까지 곧게 갈라지는 금 둘 — 판 안에 짧은 금이 일찍 서면 물고기 눈으로 읽힌다
      if (p.dry && u > hold) {
        const c0 = Math.sin(p.seed) * W * 0.3;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(c0, -H * 1.05);
        ctx.lineTo(c0 + H * 0.5, H * 0.35);
        ctx.moveTo(c0 - W * 0.5, -H * 0.95);
        ctx.lineTo(c0 - W * 0.36, H * 0.35);
        ctx.stroke();
      }
      if (!p.dry) rim(slab);
      break;
    }
    default:
  }
  ctx.restore();
}

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
    case 'cel':
      drawCel(ctx, p, py, u, age);
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
