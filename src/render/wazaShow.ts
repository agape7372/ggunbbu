// 필살 일곱의 먹 연출(2026-11-01) — 발동부터 끝까지 프레임마다 그린다. 무엇을 언제 부수는지는
// config WAZA_RUN · sim triggerSpecial이 정본이고, 여기선 그 박자(special · wazaHit · wazaBurst)에 그림만 맞춘다.
// 문법은 docs/INK_FX_2026-11-01.md §2 · §5: 획은 움직임에서 · 먹 + 인주 한 색(SEAL_INK) · 알파로 지우지 않는다(꼬리부터 깎기 · 줄이기).
// 박자: stepWazaShow는 consumeEvents(시뮬 advance 한 번)마다 한 칸 — 히트스톱 동안에도 흐른다.

import type { FallingStack, GameState, JuiceEvent, WazaId } from '../core/types';
import { JUICE, PALETTE, PLAYER, SEAL_INK, VIEW, WAZA_RUN } from '../config';
import { WAZA_COPY } from '../content';
import { brushLine, brushPath, enso, inkDust, PRESS, spatter } from './ink';
import { drawPlayer, drawStack, floorTile } from './sprites';
import { makeFloor, makeStack } from '../core/building';
import { spawnStackShatter } from './effects';

/** 예비동작 길이 — 이 프레임에 renderer가 쥐었던 묶음을 푼다(천지개벽 · 올려베기 · 철벽이 실제로 부서지는 순간) */
const P = JUICE.special.hitstop;
const INK = PALETTE.INK;
/** 담묵 — 구름 · 바람 결 · 먼지. 포인트 색이 아니라 먹의 농담 */
const WASH = '#8C877D';
const TAU = Math.PI * 2;
/** 끝을 모르는 연출(터짐 · 마지막 검풍을 기다린다)의 안전 상한 */
const CAP = 200;

/** 자른 선 — 선 위 한 점 + 단위 방향. slide = 윗동이 선을 따라 미끄러진다 · part = 양쪽으로 벌어진다 */
interface Cut { x: number; y: number; dx: number; dy: number; mode: 'slide' | 'part' }

interface Show {
  id: WazaId; f: number; seed: number;
  /** 발동 순간 졸라맨 발(월드 px) */
  x: number; foot: number;
  /** 벤 건물 밑면 · 보이는 높이(없으면 머리 위 빈 자리) */
  bottom: number; h: number;
  /** 한 타 — 휘두른 프레임 · 그때 노린 건물 밑면(월드 px) */
  hits: { f: number; y: number }[];
  /** 터진 프레임(−1 = 아직) */
  burst: number;
  end: number;
}

let show: Show | null = null;
/** 터지며 갈라진 건물 — 반쪽씩 미끄러지다가 조각난다. 다음 필살과 따로 논다 */
let split: { st: FallingStack; t: number; cut: Cut; gimmick: GameState['gimmick'] } | null = null;
let seedN = 1;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** f0부터 d프레임 동안 0 → 1 — 빨리 대서 감속(긋기) */
const grow = (f: number, f0: number, d: number): number => 1 - (1 - clamp01((f - f0) / d)) ** 2;
/** f0부터 d프레임 동안 0 → 1 — 천천히 시작해 빨라진다(꼬리 깎기 · 줄이기) */
const eat = (f: number, f0: number, d: number): number => clamp01((f - f0) / d) ** 1.6;
function hz(seed: number, k: number): number {
  const v = Math.sin(seed * 91.3458 + k * 47.853) * 24634.6345;
  return v - Math.floor(v);
}

/** 먹 획 + 벤 순간의 인주 속. age = 그은 뒤 프레임 — 속은 앞 4프레임 동안 가늘어지며 먹으로 마른다(음수면 아직 안 벴다) */
function cutLine(
  ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number,
  w: number, s0: number, s1: number, dry: number, seed: number, age: number, bend = 0, pr = PRESS.cut,
): void {
  ctx.fillStyle = INK;
  brushLine(ctx, x0, y0, x1, y1, w, s0, s1, dry, seed, bend, pr);
  const k = age < 0 ? 0 : 1 - age / 4;
  if (k <= 0) return;
  ctx.fillStyle = SEAL_INK;
  brushLine(ctx, x0, y0, x1, y1, w * 0.42 * k, s0, s1, 0, seed, bend, pr);
}

function cutPath(
  ctx: CanvasRenderingContext2D, pts: readonly number[], w: number, s0: number, s1: number,
  dry: number, seed: number, age: number, pr = PRESS.fall,
): void {
  ctx.fillStyle = INK;
  brushPath(ctx, pts, w, s0, s1, dry, seed, pr);
  const k = age < 0 ? 0 : 1 - age / 4;
  if (k <= 0) return;
  ctx.fillStyle = SEAL_INK;
  brushPath(ctx, pts, w * 0.4 * k, s0, s1, 0, seed, pr);
}

/** 하늘(top)에서 땅(g)까지 꺾이는 낙뢰 — 마디 7, 좌우로 jit만큼 */
function bolt(x: number, top: number, g: number, jit: number, seed: number): number[] {
  const pts = [x + (hz(seed, 0) - 0.5) * jit, top];
  for (let i = 1; i < 7; i++) {
    const side = i % 2 ? 1 : -1;
    pts.push(x + side * jit * (0.35 + 0.65 * hz(seed, i)), top + ((g - top) * i) / 7 + (hz(seed, i + 9) - 0.5) * 14);
  }
  pts.push(x, g);
  return pts;
}

/** 시간차 필살이면 터지기까지 기다리는 프레임(예비동작 + 시뮬 틱) — 0 = 시간차가 아니다 */
function expectedBurst(id: WazaId): number {
  const r = (WAZA_RUN as Record<string, { burst: number }>)[id];
  return r && r.burst > 0 ? P + r.burst : 0;
}

// ── 들머리 ───────────────────────────────────────────────────

/** 필살 발동 프레임 — renderer.beginPrelude가 부른다. st = 방금 그린 건물(천지개벽이면 곧 유령이 된다) */
export function startWazaShow(s: GameState, st: FallingStack | null): void {
  const g = VIEW.GROUND_Y;
  const foot = g - s.player.y;
  let bottom = foot - PLAYER.H - 40;
  let h = 160;
  if (st && st.floors.length) {
    bottom = g - st.y;
    h = Math.min(300, st.floors.reduce((a, f) => a + f.h, 0));
  }
  seedN = (seedN * 7919 + 17) % 9973;
  show = { id: s.waza, f: 0, seed: seedN, x: VIEW.LANE_X[s.player.lane], foot, bottom, h, hits: [], burst: -1, end: CAP };
  const fixed = { tenchi: P + 36, ageba: P + 22, tetsu: P + 46 } as Partial<Record<WazaId, number>>;
  show.end = fixed[s.waza] ?? CAP;
}

/** 한 타 · 터짐 — renderer.react가 부른다. st = 방금 그린 건물(터지는 틱엔 core가 이미 지운 그 건물) */
export function wazaShowEvent(s: GameState, e: JuiceEvent, st: FallingStack | null): void {
  const sh = show;
  if (!sh) return;
  // 휘두른 박자 — 맞든 안 맞든 core가 낸다(벤 건물이 먼저 다 무너져도 획은 끝까지 긋는다)
  if (e.kind === 'wazaSwing') {
    const tgt = s.stack;
    sh.hits.push({ f: sh.f, y: tgt ? VIEW.GROUND_Y - tgt.y : sh.bottom });
    if (sh.id === 'baram' && sh.hits.length === WAZA_RUN.baram.hits.length) sh.end = sh.f + 18;
  }
  if (e.kind !== 'wazaBurst') return;
  sh.burst = sh.f;
  sh.end = sh.f + (sh.id === 'nakgwan' ? 34 : 24);
  if (!st || !(e.n ?? 0) || typeof document === 'undefined') return;
  const tile = (i: number): HTMLCanvasElement | undefined => floorTile(st.floors[i].mat, st.theme, i, st.floors.length, s.gimmick);
  const cut = cutOf(sh);
  if (!cut) { spawnStackShatter(st, tile); return; }
  split = { st, t: 0, cut, gimmick: s.gimmick };
}

/** 터질 때 건물을 가르는 선 — 먹줄치기는 비스듬히(윗동이 미끄러진다) · 달무리는 세로로(양쪽으로 벌어진다) · 낙관은 가르지 않는다 */
function cutOf(sh: Show): Cut | null {
  const cy = sh.bottom - sh.h * 0.5;
  if (sh.id === 'mukjul') {
    const th = -0.38;
    return { x: sh.x, y: cy, dx: Math.cos(th), dy: Math.sin(th), mode: 'slide' };
  }
  if (sh.id === 'dalmuri') return { x: sh.x, y: cy, dx: 0, dy: 1, mode: 'part' };
  return null;
}

export function stepWazaShow(s: GameState): void {
  if (split) {
    split.t += 1;
    if (split.t >= 10) {
      const sp = split;
      split = null;
      if (typeof document !== 'undefined') {
        spawnStackShatter(sp.st, (i) => floorTile(sp.st.floors[i].mat, sp.st.theme, i, sp.st.floors.length, sp.gimmick));
      }
    }
  }
  if (!show) return;
  show.f += 1;
  // 시간차 필살이 터짐 없이 끝났으면(디버그로 지움 등) 거둔다 — 터지는 틱엔 wazaRun이 먼저 비고 이벤트는 이 뒤에 오니 그 틱은 빼고
  const lost = expectedBurst(show.id) > 0 && show.burst < 0 && show.f > P + 1 && !s.wazaRun
    && !s.events.some((e) => e.kind === 'wazaBurst');
  if (show.f > show.end || lost) show = null;
}

export function resetWazaShow(): void {
  show = null;
  split = null;
}

/** 시험용 */
export function wazaShowState(): { id: WazaId; f: number; burst: number; hits: number } | null {
  return show && { id: show.id, f: show.f, burst: show.burst, hits: show.hits.length };
}

// ── 그리기 — 월드 좌표(renderer가 카메라를 건 안쪽, 졸라맨 위) ──────────

export function drawWazaWorld(ctx: CanvasRenderingContext2D, s: GameState, cam: number): void {
  const g = VIEW.GROUND_Y;
  if (split) drawSplit(ctx, g);
  const sh = show;
  if (!sh) return;
  drawShow(ctx, sh, s, VIEW.FIELD_TOP - cam, g);
}

function drawShow(ctx: CanvasRenderingContext2D, sh: Show, s: GameState, top: number, g: number): void {
  ctx.save();
  switch (sh.id) {
    case 'tenchi': tenchi(ctx, sh, top, g); break;
    case 'ageba': ageba(ctx, sh, top); break;
    case 'tetsu': tetsu(ctx, sh, s); break;
    case 'mukjul': mukjul(ctx, sh, s); break;
    case 'dalmuri': dalmuri(ctx, sh); break;
    case 'nakgwan': nakgwan(ctx, sh); break;
    case 'baram': baram(ctx, sh, s); break;
  }
  ctx.restore();
}

/**
 * 상점 필살 칸 — 판에서 그리는 그 연출의 한 장면을 k배로(상점용으로 지어낸 그림 없음). (x, y) = 졸라맨 발.
 * 판의 연출 상태는 건드리지 않는다(장면마다 가짜 Show 하나).
 */
export function drawWazaShot(ctx: CanvasRenderingContext2D, id: WazaId, x: number, y: number, k = 0.25): void {
  const g = VIEW.GROUND_Y;
  const B = expectedBurst(id) || P;
  // [그릴 프레임, 한 타 프레임들, 터진 프레임] — 그 필살이 가장 그 필살다운 순간
  const pick: Record<WazaId, [number, number[], number]> = {
    tenchi: [P + 1, [], -1], ageba: [P + 1, [], -1], tetsu: [P + 1, [], -1],
    mukjul: [B + 3, [], B], dalmuri: [B + 3, [], B], nakgwan: [B + 2, [B - 9, B - 6, B - 3], B], baram: [36, [24, 34], -1],
  };
  const [f, hits, burst] = pick[id];
  // 판 화면을 그대로 줄인다 — 떨어지던 4층 건물 · 필살 자세 졸라맨 · 그 연출(먹줄치기 · 달무리는 갈라진 건물)
  const st = makeStack({ variant: 'building', theme: 'europe', floors: (['mid', 'weak', 'mid', 'mid'] as const).map((m) => makeFloor(m)), y: 130 });
  const bottom = g - st.y;
  const h = st.floors.reduce((a, fl) => a + fl.h, 0);
  const sh: Show = { id, f, seed: 5, x: VIEW.LANE_X[0], foot: g, bottom, h, hits: hits.map((t) => ({ f: t, y: bottom })), burst, end: CAP };
  const s = { player: { lane: 0, y: 0 } } as unknown as GameState;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.translate(-VIEW.LANE_X[0], -g);
  if (typeof document !== 'undefined') { // 건물 · 졸라맨 그림은 캔버스가 있어야 굽는다(시험 환경은 연출만)
    const cut = burst >= 0 ? cutOf(sh) : null;
    if (cut) drawHalves(ctx, st, cut, f - burst + 4, 'none', g);
    else drawStack(ctx, st, g, 'none');
    drawPlayer(ctx, 'special', 0, VIEW.LANE_X[0], g);
  }
  drawShow(ctx, sh, s, g - y / k, g);
  ctx.restore();
}

function drawSplit(ctx: CanvasRenderingContext2D, g: number): void {
  const sp = split!;
  drawHalves(ctx, sp.st, sp.cut, sp.t, sp.gimmick, g);
}

/** 갈라진 건물 — 반쪽씩 자른 선 바깥을 잘라 내고 미끄러뜨린다. t = 터진 뒤 프레임 */
function drawHalves(ctx: CanvasRenderingContext2D, st: FallingStack, c: Cut, t: number, gimmick: GameState['gimmick'], g: number): void {
  const u = grow(t, 0, 9);
  const D = (c.mode === 'part' ? 22 : 30) * u;
  for (const side of [1, -1] as const) {
    const nx = -c.dy * side;
    const ny = c.dx * side;
    // slide: 법선이 아래를 보는 쪽(side 1)이 아랫동 — 윗동만 선을 따라 미끄러진다 · part: 양쪽이 법선 방향으로
    const ox = c.mode === 'part' ? nx * D : side === -1 ? c.dx * D * 1.3 : -c.dx * D * 0.25;
    const oy = c.mode === 'part' ? ny * D : side === -1 ? c.dy * D * 1.3 - u * 4 : -c.dy * D * 0.25;
    const L = 2400;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(c.x - c.dx * L, c.y - c.dy * L);
    ctx.lineTo(c.x + c.dx * L, c.y + c.dy * L);
    ctx.lineTo(c.x + c.dx * L + nx * L, c.y + c.dy * L + ny * L);
    ctx.lineTo(c.x - c.dx * L + nx * L, c.y - c.dy * L + ny * L);
    ctx.closePath();
    ctx.clip();
    ctx.translate(ox, oy);
    drawStack(ctx, st, g, gimmick);
    ctx.restore();
  }
}

/**
 * 천지개벽 — 윌라드 2차 각성기의 박자(예고선 → 큰 낙뢰 → 여진 → 일제히 꽂힘 → 불티)를 먹으로.
 * 예비동작 동안 하늘에서 땅까지 가는 예고선 셋이 차례로 긋히고(건물은 유령으로 그대로 서 있다), 풀리는 순간
 * 가운데 선이 굵은 낙뢰가 되어 꽂힌다. 이어 양옆 예고선이 여진으로, 가는 먹 비가 일제히, 땅에선 먹 가루가 오른다.
 */
function tenchi(ctx: CanvasRenderingContext2D, sh: Show, top: number, g: number): void {
  const f = sh.f;
  const X = [sh.x + 6, sh.x - 76, sh.x + 70];
  // 큰 낙뢰는 세 프레임 먼저 내려와 예비동작이 풀리는 순간(건물이 터지는 틱) 땅에 닿는다
  const at = [P - 3, P + 5, P + 9];
  const W = [26, 13, 12];
  for (let i = 0; i < 3; i++) {
    const pts = bolt(X[i], top, g, i === 0 ? 22 : 12, sh.seed + i * 13);
    if (f < at[i] + 2) {
      // 예고선 — 하늘에서 땅으로 한 번에 내려긋는 가는 먹줄(낙뢰가 그 위를 덮어 내려올 때까지)
      ctx.fillStyle = INK;
      brushPath(ctx, pts, 1.6, 0, grow(f, 1 + i * 2, 3), 0, sh.seed + i, PRESS.line);
      if (f < at[i]) continue;
    }
    const age = f - at[i];
    cutPath(ctx, pts, W[i], eat(f, at[i] + 6, i === 0 ? 18 : 12), grow(f, at[i], 3), 0.25, sh.seed + i * 13, age);
    // 땅에 꽂힌 자리 — 위로 튀는 먹(친 방향 = 위)
    if (age >= 2) {
      ctx.fillStyle = INK;
      spatter(ctx, X[i], g - 3, (i === 0 ? 24 : 12) * (1 - eat(f, at[i] + 6, 14)), -Math.PI / 2, sh.seed + i * 5, i === 0 ? 9 : 5);
    }
  }
  // 일제히 꽂히는 가는 먹 비 — 건물 폭 안에서 하나씩 떨어져 땅에 닿으면 작은 튐만 남는다
  for (let j = 0; j < 6; j++) {
    const f0 = P + 11 + j * 2;
    const u = clamp01((f - f0) / 5);
    if (f < f0) break;
    const x = sh.x - 120 + hz(sh.seed, j + 30) * 240;
    if (u < 1) {
      const y = top + (g - top) * u;
      ctx.fillStyle = INK;
      brushLine(ctx, x - 6, y - 42, x, y, 4.5, 0, 1, 0, sh.seed + j, 0, PRESS.fall);
    } else {
      ctx.fillStyle = INK;
      spatter(ctx, x, g - 2, 7 * (1 - eat(f, f0 + 5, 9)), -Math.PI / 2, sh.seed + j * 3, 3);
    }
  }
  // 불티 — 큰 낙뢰 자리에서 오르는 마른 먹 가루
  if (f >= P + 4) {
    ctx.fillStyle = WASH;
    inkDust(ctx, X[0], g - 18 - (f - P) * 1.4, 34, 1 - eat(f, P + 6, 26), sh.seed + 77, 14);
  }
}

/** 올려베기 — 붓을 땅에 눕혀 대고(예비동작) 풀리는 순간 하늘로 한 번에 쳐올린다. 획 끝에서 먹이 위로 튄다 */
function ageba(ctx: CanvasRenderingContext2D, sh: Show, top: number): void {
  const f = sh.f;
  const x = sh.x;
  ctx.fillStyle = INK;
  brushLine(ctx, x - 28, sh.foot - 1, x + 26, sh.foot - 3, 6, eat(f, P, 10), grow(f, 0, P), 0.5, sh.seed, 0, PRESS.enso);
  if (f < P) return;
  const yTop = Math.max(top + 6, sh.foot - PLAYER.H - VIEW.FLOOR_H * 5);
  cutLine(ctx, x - 8, sh.foot - 10, x + 14, yTop, 24, eat(f, P + 5, 14), grow(f, P, 3), 0.3, sh.seed + 3, f - P, 9, PRESS.flick);
  if (f >= P + 3) {
    ctx.fillStyle = INK;
    spatter(ctx, x + 14, yTop, 14 * (1 - eat(f, P + 6, 12)), -Math.PI / 2, sh.seed + 5, 6);
  }
}

/** 철벽 — 머리 위에 한 일(一)을 천천히 긋는다(붓머리 · 몸 · 돈필). 풀리는 순간 양끝에서 먹이 옆으로 튀고, 졸라맨을 따라간다 */
function tetsu(ctx: CanvasRenderingContext2D, sh: Show, s: GameState): void {
  const f = sh.f;
  const x = VIEW.LANE_X[s.player.lane];
  const y = VIEW.GROUND_Y - s.player.y - PLAYER.H - 16;
  cutLine(ctx, x - 58, y + 2, x + 58, y - 2, 15, eat(f, P + 30, 14), grow(f, 0, P), 0.22, sh.seed, f - P, -3, PRESS.yi);
  if (f < P) return;
  // 쳐낸 먹이 양옆으로 — 덩이는 작게(크면 아령으로 읽힌다), 방울이 바깥으로
  const R = 4.5 * (1 - eat(f, P + 4, 12));
  ctx.fillStyle = INK;
  spatter(ctx, x - 66, y + 2, R, Math.PI, sh.seed + 1, 5);
  spatter(ctx, x + 66, y - 2, R, 0, sh.seed + 2, 5);
}

/**
 * 먹줄치기 — 목수가 먹줄을 튕기듯: 양끝에 먹점(핀)이 박히고 → 팽팽한 먹줄이 튕겨 떨다 멎는다 → 건물은 멈춘 채
 * 먹이 줄에 배어 든다 → 칼을 거두는 짧은 획 → 줄이 굵은 베기 획으로 터지며 윗동이 선을 따라 미끄러진다.
 */
function mukjul(ctx: CanvasRenderingContext2D, sh: Show, s: GameState): void {
  const f = sh.f;
  const c = cutOf(sh)!;
  const L = 168;
  const ax = c.x - c.dx * L;
  const ay = c.y - c.dy * L;
  const bx = c.x + c.dx * L;
  const by = c.y + c.dy * L;
  if (sh.burst < 0) {
    ctx.fillStyle = INK;
    if (f >= 1) dot(ctx, ax, ay, 3.2);
    if (f >= 2) dot(ctx, bx, by, 3.2);
    if (f >= 4) {
      const ring = 7 * Math.sin((f - 4) * 2.4) * Math.exp(-(f - 4) / 2.5);
      brushLine(ctx, ax, ay, bx, by, 2.2 + 1.2 * clamp01((f - P) / 40), 0, 1, 0, sh.seed, ring, PRESS.line);
    }
    // 칼을 거둔다 — 터지기 여덟 프레임 전, 졸라맨 허리춤에 짧은 획 하나
    const sheath = expectedBurst('mukjul') - 8;
    if (f >= sheath) {
      const x = VIEW.LANE_X[s.player.lane];
      const y = VIEW.GROUND_Y - s.player.y - 30;
      brushLine(ctx, x - 2, y, x + 20, y - 3, 4, eat(f, sheath + 3, 5), grow(f, sheath, 2), 0, sh.seed + 9, 0, PRESS.flick);
    }
    return;
  }
  const B = sh.burst;
  const ex = 26;
  cutLine(ctx, ax - c.dx * ex, ay - c.dy * ex, bx + c.dx * ex, by + c.dy * ex, 18, eat(f, B + 6, 14), grow(f, B, 3), 0.3, sh.seed + 4, f - B);
  const R = 12 * (1 - eat(f, B + 5, 12));
  ctx.fillStyle = INK;
  spatter(ctx, bx + c.dx * ex, by + c.dy * ex, R, Math.atan2(c.dy, c.dx), sh.seed + 6, 5);
  spatter(ctx, ax - c.dx * ex, ay - c.dy * ex, R * 0.7, Math.atan2(-c.dy, -c.dx), sh.seed + 7, 4);
}

/**
 * 달무리 — 예비동작 동안 건물을 두르는 큰 엔소(달)를 긋고, 멈춘 동안 담묵 구름이 달을 가로질러 흘러간다.
 * 터지기 직전 달 한가운데 세로 머리카락 선이 내려오고, 터지는 순간 굵은 세로 획이 달을 가르며 건물이 양쪽으로 벌어진다.
 */
function dalmuri(ctx: CanvasRenderingContext2D, sh: Show): void {
  const f = sh.f;
  const cx = sh.x;
  const cy = sh.bottom - sh.h * 0.5;
  const R = 122;
  const B = sh.burst;
  ctx.fillStyle = INK;
  enso(ctx, cx, cy, R, 9, -Math.PI / 2 - 0.3, B < 0 ? 0 : eat(f, B + 2, 12), grow(f, 0, P + 4), 0.45, 1, sh.seed);
  if (B < 0) {
    ctx.fillStyle = WASH;
    for (let j = 0; j < 3; j++) {
      const u = (f - (P + j * 12)) / 36;
      if (u <= 0) continue;
      const y = cy - 46 + j * 40;
      brushLine(ctx, cx - 175, y, cx + 175, y + 5, 6.5, clamp01(u - 0.38), clamp01(u), 0.85, sh.seed + j * 3, 3, PRESS.line);
    }
    const hair = expectedBurst('dalmuri') - 14;
    if (f >= hair) {
      ctx.fillStyle = INK;
      brushLine(ctx, cx, cy - R, cx + 2, cy + R, 1.5, 0, grow(f, hair, 10), 0, sh.seed + 8, 0, PRESS.line);
    }
    return;
  }
  cutLine(ctx, cx - 2, cy - R - 34, cx + 4, cy + R + 34, 21, eat(f, B + 6, 14), grow(f, B, 3), 0.25, sh.seed + 4, f - B);
  const r = 12 * (1 - eat(f, B + 5, 12));
  ctx.fillStyle = INK;
  spatter(ctx, cx - 2, cy - R - 34, r, -Math.PI / 2, sh.seed + 5, 5);
  spatter(ctx, cx + 4, cy + R + 34, r * 0.8, Math.PI / 2, sh.seed + 6, 4);
}

/** 낙관 — 열두 번 휘갈긴 먹 획이 겹겹이 쌓였다 깎이고, 마지막에 인주 도장 「끝」을 꾹 찍는다 */
function nakgwan(ctx: CanvasRenderingContext2D, sh: Show): void {
  const f = sh.f;
  const span = Math.min(sh.h, 220);
  ctx.fillStyle = INK;
  sh.hits.forEach(({ f: h0 }, i) => {
    if (f > h0 + 16) return;
    const sg = i % 2 ? 1 : -1;
    const a = sg * (0.22 + 0.95 * hz(sh.seed, i));
    const cx = sh.x + (hz(sh.seed, i + 20) - 0.5) * 96;
    const cy = sh.bottom - 26 - hz(sh.seed, i + 40) * span * 0.75;
    const L = 108;
    const dx = Math.cos(a) * L * sg;
    const dy = Math.sin(a) * L * sg;
    brushLine(ctx, cx - dx, cy - dy, cx + dx, cy + dy, 8.5, eat(f, h0 + 5, 9), grow(f, h0, 2), 0.35, sh.seed + i * 7, sg * 6);
  });
  if (sh.burst < 0) return;
  const B = sh.burst;
  const k = (1 + 0.3 * (1 - grow(f, B, 3))) * (1 - eat(f, B + 24, 9));
  if (k > 0.05) seal(ctx, sh.x, sh.bottom - span * 0.45, 58 * k, -0.07, sh.seed);
}

/**
 * 먹바람 — 발밑에 마른 바람 고리가 모였다가, 검풍마다 칼끝에서 건물 밑면까지 휘감아 오르는 마른 붓 획(비백).
 * 획은 칼 쪽이 굵고 위로 빠지며, 닿은 밑면 아래로 담묵 가루가 흩어진다. 세 번째로 갈수록 크게 돈다.
 */
function baram(ctx: CanvasRenderingContext2D, sh: Show, s: GameState): void {
  const f = sh.f;
  const x = VIEW.LANE_X[s.player.lane];
  const foot = VIEW.GROUND_Y - s.player.y;
  ctx.fillStyle = WASH;
  enso(ctx, x, foot - 4, 32, 5, 0, eat(f, P, 8), grow(f, 0, P), 0.8, 0.32, sh.seed);
  sh.hits.forEach(({ f: h0, y: by }, i) => {
    const age = f - h0;
    if (age > 18) return;
    const side = i % 2 ? 1 : -1;
    const x0 = x - side * (40 + i * 10);
    const y0 = foot - 34;
    const yTop = Math.min(y0 - 90, by - 24); // 밑면 바로 위까지(건물이 높이 떠 있으면 거기까지)
    const x1 = x + side * (34 + i * 12);
    const bend = side * (70 + i * 18);
    const s0 = eat(f, h0 + 4, 12);
    const s1 = grow(f, h0, 3);
    ctx.fillStyle = INK;
    brushLine(ctx, x0, y0, x1, yTop, 18 + i * 3, s0, s1, 0.9, sh.seed + i * 11, bend, PRESS.flick);
    // 바람 결 — 큰 획 바깥으로 가는 마른 획 둘이 한 박자 늦게 따라 돈다
    for (const o of [1, -1]) {
      const dx = -side * o * 16;
      brushLine(ctx, x0 + dx, y0 + 10 * o, x1 + dx * 1.4, yTop - 8 * o, 4.5, eat(f, h0 + 5, 10), grow(f, h0 + 1, 4), 0.9,
        sh.seed + i * 11 + o * 3, bend * (1 + 0.18 * o), PRESS.flick);
    }
    if (age < 4) {
      ctx.fillStyle = SEAL_INK;
      brushLine(ctx, x0, y0, x1, yTop, (18 + i * 3) * 0.36 * (1 - age / 4), s0, s1 * 0.6, 0, sh.seed + i * 11, bend, PRESS.flick);
    }
    ctx.fillStyle = WASH;
    inkDust(ctx, x1, yTop + 14 + age * 0.8, 30, 1 - eat(f, h0 + 2, 14), sh.seed + i * 5, 12);
  });
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

/** 인주 도장 — 가장자리가 고르지 않은 네모(돌에 새겨 찍은 결) + 종이색으로 남은 글자 */
function seal(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rot: number, seed: number): void {
  const h = size / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  const n = 5;
  const corner = [[-h, -h], [h, -h], [h, h], [-h, h]];
  for (let e = 0; e < 4; e++) {
    const [x0, y0] = corner[e];
    const [x1, y1] = corner[(e + 1) % 4];
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const j = (hz(seed, e * 10 + i) - 0.5) * size * 0.06;
      const px = x0 + (x1 - x0) * u + (y1 - y0 === 0 ? 0 : j);
      const py = y0 + (y1 - y0) * u + (x1 - x0 === 0 ? 0 : j);
      if (e === 0 && i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.fillStyle = SEAL_INK;
  ctx.fill();
  ctx.fillStyle = PALETTE.BG;
  ctx.font = `${Math.round(size * 0.78)}px "East Sea Dokdo", "Gowun Batang", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('끝', 0, size * 0.04);
  ctx.restore();
}

// ── 이름 — 화면 왼쪽 여백에 세로 붓글씨 + 작은 인주 낙관(판 · 테 없음) ─────

export function drawWazaTitle(ctx: CanvasRenderingContext2D): void {
  const sh = show;
  if (!sh) return;
  const name = WAZA_COPY[sh.id].name;
  const px = 30;
  const step = px * 1.04;
  const x = 24;
  const y0 = VIEW.FIELD_TOP + 70;
  const H = name.length * step;
  const last = Math.min(sh.end, P + 64);
  const shown = grow(sh.f, 0, 8);
  const gone = eat(sh.f, last - 8, 8); // 위에서부터 걷힌다 — 옅어지지 않는다
  if (gone >= 1) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - px, y0 - 4 + (H + 24) * gone, px * 2, (H + 24) * (shown - gone));
  ctx.clip();
  ctx.font = `${px}px "East Sea Dokdo", "Gowun Batang", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = INK;
  for (let i = 0; i < name.length; i++) ctx.fillText(name[i], x, y0 + i * step);
  ctx.fillStyle = SEAL_INK;
  ctx.fillRect(x - 6, y0 + H + 6, 12, 12);
  ctx.restore();
}
