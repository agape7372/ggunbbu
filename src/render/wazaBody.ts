// 필살 몸 연기 — 필살마다 키 자세 시간표를 두고 키 사이를 이음새(이징)로 잇는다(11-02 「졸라맨 후속모션이 없으니 허전함」).
// 시계 = 필살 연출 프레임(wazaShow f — 히트스톱 중에도 흐른다, 발동 히트스톱 P 동안이 예비동작). 박자는 연출이 받은 값을 그대로 쓰고,
// 아직 안 온 박자는 core 틱 간격으로 내다본다(늦어지면 다음 프레임으로 밀어 — 몸이 박자를 앞질러 가지 않는다).
// core는 건드리지 않는다 — 몸은 그림이고 판정 · 무적 · 봇 입력은 그대로다.
// 문법 = 예비동작(반대로 당김) → 한두 프레임에 풀림 → 닿은 자세로 멈춤 → 천천히 회복(Game-studio pixelfx · game-feel).
// 무음일섬 · 월하난무는 참철도 · 월영즉식 영상 순서 그대로(docs/INK_FX_2026-11-01.md §9).

import { JUICE, WAZA_RUN } from '../config';
import type { GameState, WazaId } from '../core/types';
import { greatLook, shoulderOf, type Body } from './sprites';

/** 연출이 넘기는 박자 — wazaShowState() */
export interface WazaShowView {
  id: WazaId;
  f: number;
  burst: number;
  /** 휘두른 박자(wazaSwing)를 받은 프레임들 */
  hitF: readonly number[];
  /** 필살 자세가 풀린 뒤 졸라맨이 딴 동작을 했다 — 몸 연기를 거둔다 */
  free: boolean;
}

const P = JUICE.special.hitstop;
/** 무음일섬 칼끝 별빛 — 터지기 이만큼 전(참철도 영상: 머리 위로 휘두른 칼끝이 번쩍 → 0.6초 뒤 터짐). 연출도 같은 박자를 읽는다 */
export const MUKJUL_STAR = 35;

type Pt = readonly [number, number];
type Ease = (u: number) => number;
const io: Ease = (u) => (1 - Math.cos(Math.PI * u)) / 2; // 천천히 옮긴다
const out: Ease = (u) => 1 - (1 - u) ** 3; // 확 들어가 선다(베기 · 휘두르기)

/** [이 키의 프레임, 자세, 앞 키에서 오는 이음새(기본 io)] */
type Key = readonly [number, Body, Ease?];

/** 서기 — buildIdle과 같은 자리(필살이 끝나 구운 서기로 넘어갈 때 튀지 않게) */
export const STAND: Body = {
  head: [0, -48], hip: [0, -22], fF: [7, 0], fB: [-7, 0], hF: [9, -30], hB: [-9, -26],
  sa: Math.atan2(25, 4), sl: 1.05, eF: 0, eB: 0, turn: 1,
};
/** 대검 서기 — 칼끝을 앞 바닥에 댄다(buildIdle의 대검 칼과 같은 자리). 시간표의 처음 · 끝 키가 무기에 맞춰 이쪽을 쓴다 */
const STAND_GREAT: Body = { ...STAND, sa: Math.atan2(29, 16), sl: 1 };

const ARM = 13;

/**
 * 자세 — 머리 · 골반 · 두 발 + 팔 각(어깨에서 0 = 앞, π/2 = 아래, 길이 ARM)과 칼 각. 손을 팔 길이 안에 놓아야 팔이 늘어나 보이지 않는다.
 * aB 'grip' = 뒷손도 칼자루(앞손 바로 뒤). 머리 위로 쳐든 손만 lF로 조금 더 뻗는다(어깨 → 머리 꼭대기가 팔 길이와 같다)
 */
function pose(head: Pt, hip: Pt, fF: Pt, fB: Pt, aF: number, aB: number | 'grip', sa: number, o: Partial<Body> & { lF?: number } = {}): Body {
  const [sx, sy] = shoulderOf(head, hip);
  const lF = o.lF ?? ARM;
  const hF: Pt = [sx + Math.cos(aF) * lF, sy + Math.sin(aF) * lF];
  const hB: Pt = aB === 'grip' ? [hF[0] - Math.cos(sa) * 3, hF[1] - Math.sin(sa) * 3] : [sx + Math.cos(aB) * ARM, sy + Math.sin(aB) * ARM];
  return { head, hip, fF, fB, hF, hB, sa, sl: o.sl ?? 1.05, eF: o.eF ?? 0, eB: o.eB ?? 0, turn: o.turn ?? 1 };
}

const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
const lerpP = (a: Pt, b: Pt, u: number): Pt => [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];

function mix(a: Body, b: Body, u: number): Body {
  return {
    head: lerpP(a.head, b.head, u), hip: lerpP(a.hip, b.hip, u),
    fF: lerpP(a.fF, b.fF, u), fB: lerpP(a.fB, b.fB, u),
    hF: lerpP(a.hF, b.hF, u), hB: lerpP(a.hB, b.hB, u),
    sa: lerp(a.sa, b.sa, u), sl: lerp(a.sl, b.sl, u),
    eF: lerp(a.eF, b.eF, u), eB: lerp(a.eB, b.eB, u), turn: lerp(a.turn, b.turn, u),
  };
}

function play(keys: readonly Key[], f: number): Body {
  if (f <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [f1, b1, e = io] = keys[i];
    if (f < f1) {
      const [f0, b0] = keys[i - 1];
      return mix(b0, b1, e((f - f0) / (f1 - f0)));
    }
  }
  return keys[keys.length - 1][1];
}

/** 발은 땅에 둔 채 몸만 d px 내려앉힌다(− = 솟는다) — 닿은 뒤 가라앉기 · 숨 */
function sink(b: Body, d: number, da = 0): Body {
  const m = (p: Pt): Pt => [p[0], p[1] + d];
  return { ...b, head: m(b.head), hip: m(b.hip), hF: m(b.hF), hB: m(b.hB), sa: b.sa + da };
}

/** 몸 전체를 (dx, dy)만큼 — 뜀 */
function shift(b: Body, dx: number, dy: number): Body {
  const m = (p: Pt): Pt => [p[0] + dx, p[1] + dy];
  return { ...b, head: m(b.head), hip: m(b.hip), fF: m(b.fF), fB: m(b.fB), hF: m(b.hF), hB: m(b.hB) };
}

/**
 * core 틱 t의 박자가 올 프레임 — 마지막으로 받은 박자 뒤로 틱 간격 + 그 사이 한 타 히트스톱. 층이 무너지면 히트스톱이 더 길어
 * 늦게 오니, 지났는데 안 왔으면 다음 프레임으로 민다(박자 전 키가 그 자리에서 기다린다)
 */
function eta(v: WazaShowView, ticks: readonly number[], t: number): number {
  const k = v.hitF.length;
  const f0 = k ? v.hitF[k - 1] : P - 1;
  const t0 = k ? ticks[k - 1] : 0;
  const n = ticks.filter((x) => x > t0 && x < t).length + (k ? 1 : 0);
  return Math.max(f0 + t - t0 + n * JUICE.wazaHit.hitstop, v.f + 1);
}

const hitAt = (v: WazaShowView, ticks: readonly number[], i: number): number => (i < v.hitF.length ? v.hitF[i] : eta(v, ticks, ticks[i]));

function burstAt(v: WazaShowView): number {
  if (v.burst >= 0) return v.burst;
  const run = (WAZA_RUN as Record<string, { burst: number; hits: readonly number[] }>)[v.id];
  return eta(v, run.hits, run.burst);
}

// ── 천지개벽 — 칼을 거꾸로 쥐고 머리 위로 들었다가 땅에 꽂으며 한 무릎으로 앉는다. 벼락이 그 자리에서 하늘로 솟는다 ──

const T_RAISE = pose([-1, -50], [-1, -24], [8, 0], [-6, 0], -Math.PI / 2 + 0.3, 'grip', Math.PI / 2, { lF: 16, eF: 2 });
const T_PLANT = pose([6, -30], [-3, -11], [10, 0], [-16, -1], -0.05, 'grip', Math.PI / 2 + 0.05, { lF: 11 });
const T_PULL = pose([3, -44], [0, -20], [9, 0], [-8, 0], 0.35, 'grip', Math.PI / 2 + 0.15);

function tenchi(f: number, st: Body): Body {
  return play([
    [0, st], [4, T_RAISE], [P - 2, sink(T_RAISE, -1)], [P, T_PLANT, out], [P + 2, sink(T_PLANT, 2), out],
    [P + 28, sink(T_PLANT, 2)], [P + 36, T_PULL], [P + 44, st],
  ], f);
}

// ── 올려베기 — 칼끝을 뒤 땅에 끌며 웅크렸다가 한 프레임에 하늘로 쳐올리며 뛰어오른다 ──

const A_LOW = pose([3, -34], [-5, -13], [11, 0], [-12, 0], Math.PI - 0.6, 0.6, Math.PI - 0.5, { eF: 2 });
const A_UP = shift(pose([6, -52], [3, -26], [7, -2], [-4, 0], -Math.PI / 2 + 0.35, 'grip', -Math.PI / 2 + 0.2, { lF: 16, eF: 2 }), 0, -8);
const A_LAND = pose([4, -42], [1, -18], [9, 0], [-9, 0], 0.15, 'grip', -0.35);

function ageba(f: number, st: Body): Body {
  return play([
    [0, st], [P - 4, A_LOW], [P - 1, sink(A_LOW, 1)], [P, A_UP, out], [P + 4, shift(A_UP, 0, -2), out],
    [P + 10, shift(A_UP, 0, 4)], [P + 13, A_LAND, out], [P + 24, st],
  ], f);
}

// ── 무음일섬 — 참철도: 낮게 웅크려 칼을 뒤로 감춤 → 풀리는 프레임에 앞으로 휘둘러(화면이 검게 덮인다) → 화면이 돌아오면
//    칼을 수평으로 뻗은 낮은 돌진 자세로 정적 → 반쯤 일어나 칼끝을 앞 아래로 → 칼을 머리 위로 휘두르며 한 바퀴(칼끝 별빛) →
//    칼을 비스듬히 치켜든 가드로 서서 기다리면 터진다 → 칼을 어깨에 걸치고 선다 ──

const M_COIL = pose([7, -34], [-3, -14], [12, 0], [-13, 0], Math.PI - 0.45, 0.35, Math.PI - 0.2);
const M_SWING = pose([9, -37], [1, -15], [16, 0], [-14, 0], -0.15, Math.PI - 0.2, -0.08, { sl: 1.15 });
const M_LUNGE = pose([10, -37], [2, -14], [18, 0], [-17, 0], -0.06, Math.PI + 0.3, 0, { sl: 1.1 });
const M_RISE = pose([6, -44], [1, -19], [14, 0], [-12, 0], 0.5, Math.PI - 0.7, 0.7);
const M_OVER = pose([1, -48], [0, -22], [10, 0], [-9, 0], -Math.PI / 2 + 0.2, Math.PI - 0.4, -Math.PI / 2 - 0.7, { lF: 15, eF: 2, turn: -1 });
const M_GUARD = pose([1, -47], [0, -21], [11, 0], [-10, 0], -0.3, 1.9, -Math.PI / 2 - 0.12, { eF: 2 });
const M_REST = pose([0, -48], [0, -22], [8, 0], [-8, 0], 0.08, 1.75, -Math.PI + 0.15, { lF: 12 });

function mukjul(v: WazaShowView, st: Body): Body {
  const B = burstAt(v);
  const S = B - MUKJUL_STAR;
  // 어깨에서 내릴 때 칼끝이 뒤로 떨어진다(각은 키 값 그대로 보간 — 2π 낮춘 서기). 연출이 터지고 30프레임에 끝나니 그 안에 선다
  const down: Body = { ...st, sa: st.sa - 2 * Math.PI };
  return play([
    [0, st], [3, M_COIL, out], [P - 3, sink(M_COIL, 2)], [P - 1, M_SWING, out], [P + 2, M_LUNGE, out],
    [P + 34, sink(M_LUNGE, 1)], [S - 12, M_RISE], [S - 8, M_OVER], [S - 4, { ...M_OVER, sa: M_OVER.sa - 0.4, turn: 1 }],
    [S, M_GUARD, out], [B, sink(M_GUARD, -0.5)], [B + 3, sink(M_GUARD, 1.5), out], [B + 9, M_REST], [B + 19, M_REST], [B + 30, down],
  ], v.f);
}

// ── 월하난무 — 월영즉식: 두 팔을 크게 벌림 → 칼을 두 손으로 머리 위에 수직으로 세우고 고요(밤의 구가 몸을 감싼다) →
//    첫 칼에 내리베며 한 무릎으로 앉는다(보름달 앞 실루엣) → 웅크린 채 칼 넷이 몸을 떨게 하고 → 터지며 일어나 칼을 낮게 늘어뜨린다 ──

const D_SPREAD = pose([0, -49], [0, -23], [9, 0], [-9, 0], -0.3, Math.PI + 0.3, -0.85);
const D_RAISE = pose([-1, -48], [0, -22], [8, 0], [-8, 0], -Math.PI / 2 + 0.65, 'grip', -Math.PI / 2, { lF: 16, sl: 1.12, eF: 2 });
const D_WIND = pose([-1, -47], [0, -21], [9, 0], [-9, 0], -Math.PI / 2 + 0.5, 'grip', -Math.PI / 2 - 0.6, { lF: 16, sl: 1.12, eF: 2 });
const D_KNEEL = pose([8, -31], [-2, -11], [14, 0], [-14, 0], 0.5, 'grip', 0.42, { sl: 1.12 });
const D_UP = pose([5, -44], [1, -19], [15, 0], [-13, 0], 0.75, Math.PI - 0.6, 1.0);
const D_LOW = pose([3, -46], [0, -21], [13, 0], [-12, 0], 1.05, Math.PI - 0.9, 1.25);

function dalmuri(v: WazaShowView, st: Body): Body {
  const { hits } = WAZA_RUN.dalmuri;
  const B = burstAt(v);
  const h1 = hitAt(v, hits, 0);
  const keys: Key[] = [[0, st], [4, D_SPREAD, out], [P, D_RAISE], [h1 - 6, sink(D_RAISE, -1)], [h1 - 1, D_WIND], [h1 + 1, D_KNEEL, out]];
  // 칼 넷 — 웅크린 몸이 칠 때마다 한 번 떨린다(박자 전엔 그대로 기다린다)
  for (let i = 1; i < hits.length; i++) {
    const h = hitAt(v, hits, i);
    keys.push([h, D_KNEEL], [h + 1, sink(D_KNEEL, 1.5, 0.08), out], [h + 3, D_KNEEL]);
  }
  keys.push([B, D_KNEEL], [B + 4, D_UP, out], [B + 10, D_LOW], [B + 24, D_LOW], [B + 38, st]);
  return play(keys, v.f);
}

// ── 십이연참 — 팔상으로 겨누었다가 네 방향을 번갈아 열두 번 → 도장이 찍히는 순간 칼을 아래로 털고 멈춘다 ──

const N_READY = pose([1, -44], [-1, -19], [11, 0], [-11, 0], -Math.PI / 2 + 0.5, 'grip', -1.9, { lF: 15, eF: 2 });
const N_CUT = [
  pose([5, -43], [2, -19], [13, 0], [-10, 0], 0.6, 'grip', 0.5),
  pose([-1, -45], [-1, -20], [11, 0], [-11, 0], -Math.PI / 2 - 0.1, 'grip', -2.2, { lF: 15 }),
  pose([6, -42], [3, -18], [14, 0], [-11, 0], -0.05, 'grip', -0.15),
  pose([3, -46], [0, -21], [11, 0], [-11, 0], -1.2, 'grip', -1.1, { lF: 14 }),
];
const N_FIN = pose([3, -40], [-2, -16], [12, 0], [-14, 0], 0.7, Math.PI - 0.5, 0.35);

function nakgwan(v: WazaShowView, st: Body): Body {
  const k = v.hitF.length;
  if (v.burst < 0 && k > 0) {
    // 연참 — 칠 때마다 다음 자세로 두 프레임에 확
    const u = out(Math.min(1, (v.f - v.hitF[k - 1]) / 2));
    return mix(k > 1 ? N_CUT[(k - 2) % 4] : N_READY, N_CUT[(k - 1) % 4], u);
  }
  if (v.burst < 0) return play([[0, st], [P - 3, N_READY]], v.f);
  const B = v.burst;
  return play([[B - 1, N_CUT[(k + 3) % 4]], [B + 1, N_FIN, out], [B + 16, N_FIN], [B + 30, st]], v.f);
}

// ── 용오름 — 웅크려 칼을 뒤로 감았다가 제자리에서 팽이처럼 돈다. 회오리가 솟을 때마다 칼을 하늘로 쳐올린다 ──

const R_COIL = pose([-5, -38], [-2, -15], [10, 0], [-10, 0], Math.PI - 0.7, Math.PI - 1.0, Math.PI - 0.2);
const R_SPIN = pose([0, -47], [0, -23], [5, 0], [-5, 0], 0, Math.PI, 0.05);
const R_GUST = pose([2, -50], [1, -25], [5, -1], [-5, 0], -1.2, Math.PI + 0.6, -1.4, { lF: 15, eF: 2 });
const SPIN = 8; // 한 바퀴 프레임

function baram(v: WazaShowView, st: Body): Body {
  const { hits } = WAZA_RUN.baram;
  const f = v.f;
  if (f < P) return play([[0, st], [P - 3, R_COIL]], f);
  const lastG = hitAt(v, hits, hits.length - 1);
  const spinEnd = P + SPIN * Math.ceil((lastG + 6 - P) / SPIN);
  let b = R_SPIN;
  for (let i = 0; i < hits.length; i++) {
    const a = f - hitAt(v, hits, i);
    if (a >= -1 && a < 8) b = mix(R_SPIN, R_GUST, a < 2 ? out((a + 1) / 3) : 1 - io((a - 2) / 6));
  }
  if (f < spinEnd) return { ...b, turn: Math.cos((2 * Math.PI * (f - P)) / SPIN) };
  return play([[spinEnd, R_SPIN], [spinEnd + 10, st]], f);
}

/** 박자 v에서의 몸 — 판(wazaBody) · 상점 칸(drawWazaShot) · 연출의 칼끝 별빛이 같은 시간표를 읽는다. great = 대검(서기가 다르다) */
export function wazaBodyAt(v: WazaShowView, great = false): Body {
  const st = great ? STAND_GREAT : STAND;
  switch (v.id) {
    case 'tenchi': return tenchi(v.f, st);
    case 'ageba': return ageba(v.f, st);
    case 'mukjul': return mukjul(v, st);
    case 'dalmuri': return dalmuri(v, st);
    case 'nakgwan': return nakgwan(v, st);
    case 'baram': return baram(v, st);
  }
}

/**
 * 판 졸라맨의 몸 — 필살 자세 동안, 그리고 자세가 풀린 뒤에도 연출이 남아 있고 졸라맨이 가만히 서 있으면 시간표를 끝까지 연기한다.
 * 딴 동작(점프 · 공격 · 가드 · 다침)을 하면 거둔다(free). 연출 없이 필살 자세만 남은 틱은 서기.
 */
export function wazaBody(s: GameState, v: WazaShowView | null): Body | null {
  const p = s.player.pose;
  const great = !!greatLook(s.weapon);
  if (p === 'special') return v ? wazaBodyAt(v, great) : great ? STAND_GREAT : STAND;
  if (p === 'idle' && v && !v.free) return wazaBodyAt(v, great);
  return null;
}
