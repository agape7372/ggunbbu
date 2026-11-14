// 평소 몸 연기 — 대기 · 점프 · 베기 · 가드도 필살처럼 키 자세 시간표로 그린다(11-14 사용자 「이대로 모션 총 대개편」).
// 필살 몸 연기(wazaBody.ts)와 같은 문법 · 같은 그리기(drawLiveBody)다. core는 읽기만 한다.
// 자세가 바뀌면 직전에 그린 몸에서 새 자세로 몇 틱에 걸쳐 잇는다. 베기 · 가드 깨짐은 잇지 않고 바로 선다(한 틱에 풀려야 세다).
// 무기마다 서기 · 베기가 다르다(사용자 「무기의 크기나 특성 고려해서 각각 다른모션」) — 아래 STYLE.

import { PLAYER } from '../config';
import type { GameState, PlayerPose, WeaponId } from '../core/types';
import { GREAT_L, SWORD_L, greatLook, type Body } from './sprites';
import { STAND, STAND_GREAT, mix, out, play, pose, sink, type Kit } from './wazaBody';

const PI = Math.PI;
type Pt = readonly [number, number];
type Opt = Parameters<typeof pose>[7];
const hold = (): number => 0; // 다음 키까지 앞 자세로 버틴다 — 한 틱에 넘어간다
/** 두 손으로 쥔 자세 */
const two = (head: Pt, hip: Pt, fF: Pt, fB: Pt, aF: number, sa: number, o: Opt = {}): Body => pose(head, hip, fF, fB, aF, 'grip', sa, o);

/** 무기 하나의 몸짓 — 서기 + 베기 넷(쳐듦 · 닿음 · 더 들어감 · 여운) + 일어서는 틱 수. buzz = 닿아 있는 동안 떤다 */
interface Style {
  stand: Body;
  wind: Body;
  hit: Body;
  deep: Body;
  follow: Body;
  rec: number;
  buzz?: boolean;
  /** 필살 몸에 입히는 특성 — 길이 배수 · 무게 · 한 손(wazaBody의 Kit) */
  long?: number;
  heft?: number;
  oneHand?: boolean;
}

const WIDE_F: Pt = [11, 0];
const WIDE_B: Pt = [-13, 0];

const STYLE: Record<WeaponId, Style> = {
  // 철거칼 — 기준. 크게 쳐들었다 한 틱에 낮은 런지
  sword: {
    stand: STAND,
    wind: pose([-2, -44], [0, -19.5], WIDE_F, WIDE_B, -2.5, 0.2, -1.8, { lF: 16, sl: 1.1, eF: -3, eB: 2 }),
    hit: pose([12, -30], [-3, -14.5], [11, 0], [-21, 0], 0.5, PI - 0.5, -0.25, { sl: 1.2, eB: 1.5 }),
    deep: pose([13.5, -28], [-2.5, -13], [11, 0], [-21, 0], 0.6, PI - 0.6, 0, { sl: 1.08, eB: 1.5 }),
    follow: pose([12.5, -29.5], [-3, -14], [11, 0], [-21, 0], 0.7, PI - 0.75, 0.26, { eB: 1 }),
    rec: 10,
  },
  // 오함마 — 무겁다. 깊이 앉아 늘어뜨렸다가 온몸으로 뛰며 머리 위로 올려 친다(띄우기). 일어서는 데 오래 걸린다
  hammer: {
    stand: two([0, -48], [0, -22], [7, 0], [-7, 0], 1.0, 1.3, { sl: 1.1 }),
    wind: two([5, -33], [-3, -12], [10, 0], [-11, 0], 1.35, 1.75, { sl: 1.15 }),
    hit: two([2, -52], [1, -25], [6, -3], [-4, -2], -1.35, -1.45, { lF: 16, sl: 1.15 }),
    deep: two([1, -51], [0, -24], [6, -1], [-5, 0], -1.6, -1.8, { lF: 16, sl: 1.15 }),
    follow: two([-2, -47], [-1, -21], [8, 0], [-7, 0], -1.9, -2.3, { lF: 16, sl: 1.15 }),
    rec: 16,
    long: 1.05,
    heft: 2.5,
  },
  // 빠루 — 길다. 낮게 웅크렸다가 위로 길게 뻗어 걸고 몸 쪽으로 당겨 내린다
  crowbar: {
    stand: { ...STAND, sa: -1.45, sl: 1.3 },
    wind: pose([3, -35], [-4, -14], [11, 0], [-12, 0], 2.2, 0.5, 2.65, { sl: 1.3 }),
    hit: two([4, -50], [2, -22], [8, 0], [-5, 0], -1.3, -1.4, { lF: 16, sl: 1.4, eF: 2 }),
    deep: two([5, -42], [1, -18], [10, 0], [-9, 0], -0.5, -1.05, { lF: 10, sl: 1.35 }),
    follow: two([5, -40], [1, -17], [10, 0], [-9, 0], -0.2, -0.9, { lF: 9, sl: 1.3 }),
    rec: 9,
    long: 1.24,
  },
  // 그라인더 — 짧다. 몸 앞에 당겼다가 두 손으로 머리 위에 밀어 대고 간다(닿아 있는 동안 떤다)
  grinder: {
    stand: two([0, -48], [0, -22], [7, 0], [-7, 0], 0.85, -0.15, { lF: 11, sl: 0.9 }),
    wind: two([1, -38], [-2, -15], [10, 0], [-11, 0], 0.6, -0.9, { lF: 9, sl: 0.9 }),
    hit: two([3, -49], [1, -22], [8, 0], [-6, 0], -1.15, -1.3, { lF: 16, sl: 0.95 }),
    deep: two([4, -49.5], [1.5, -22], [8, 0], [-6, 0], -1.25, -1.4, { lF: 16, sl: 0.95 }),
    follow: two([2, -47], [0, -21], [8, 0], [-7, 0], -0.7, -1.0, { sl: 0.9 }),
    rec: 8,
    buzz: true,
    long: 0.86,
  },
  // 무쇠 — 대검의 기준. 머리 위로 곧게 세웠다가 정면으로 내리친다
  iron: {
    stand: STAND_GREAT,
    wind: two([-3, -45], [0, -20], WIDE_F, WIDE_B, -1.8, -1.8, { lF: 16, eF: -2 }),
    hit: two([11, -31], [-3, -14.5], [12, 0], [-21, 0], 0.55, 0.2, { sl: 1.08 }),
    deep: two([12.5, -29], [-2.5, -13], [12, 0], [-21, 0], 0.65, 0.33),
    follow: two([12, -29.5], [-2.5, -13.5], [12, 0], [-21, 0], 0.68, 0.4),
    rec: 12,
  },
  // 톱날 — 비스듬히 위로 밀어 넣고 몸 쪽으로 당겨 켠다
  saw: {
    stand: STAND_GREAT,
    wind: two([-2, -40], [-3, -16], [9, 0], [-12, 0], 1.2, -0.9, { lF: 10 }),
    hit: two([6, -47], [2, -21], [10, 0], [-7, 0], -0.9, -1.0, { lF: 16, sl: 1.08 }),
    deep: two([0, -47], [-1, -21], [9, 0], [-8, 0], -1.7, -1.25, { lF: 14 }),
    follow: two([3, -46], [0, -20.5], [9, 0], [-8, 0], -1.2, -1.1, { lF: 15 }),
    rec: 10,
  },
  // 공사중 — 칼끝을 뒤 바닥에 끌다가 아래에서 위로 올려 친다(띄우기)
  hazard: {
    stand: STAND_GREAT,
    wind: two([4, -34], [-4, -13.5], WIDE_F, WIDE_B, 2.3, PI - 0.45),
    hit: two([5, -47], [2, -21], [10, 0], [-7, 0], -0.85, -0.95, { lF: 16, sl: 1.08 }),
    deep: two([4, -48.5], [2, -21.5], [10, 0], [-7, 0], -1.15, -1.3, { lF: 16 }),
    follow: two([2, -47], [1, -21], [10, 0], [-7, 0], -1.4, -1.65, { lF: 16 }),
    rec: 11,
  },
  // 철골 — 가장 무겁다. 어깨에 메고 다니다 깊이 앉아 곧게 세우고 기둥처럼 위로 받아 올린다. 가장 늦게 선다
  beam: {
    stand: pose([0, -48], [0, -22], [7, 0], [-7, 0], 0.1, 'grip', 0.35 - PI, { lF: 9 }),
    wind: two([-2, -36], [-2, -13.5], [10, 0], [-11, 0], 0.9, 0.15 - PI / 2, { lF: 9 }),
    hit: two([1, -51], [1, -24], [7, -1], [-6, 0], 0.2 - PI / 2, 0.05 - PI / 2, { lF: 16, eF: 2 }),
    deep: two([1, -52], [1, -25], [7, -2], [-6, -1], 0.15 - PI / 2, -PI / 2, { lF: 16, eF: 2 }),
    follow: two([0, -44], [0, -18], [9, 0], [-9, 0], -0.9, -0.1 - PI / 2),
    rec: 18,
    heft: 3,
  },
  // 불꽃 — 뒤로 눕혔다가 머리 위로 넘겨 앞을 넓게 쓸고 불길처럼 다시 올린다
  flame: {
    stand: STAND_GREAT,
    wind: two([-2, -44], [0, -20], [10, 0], [-12, 0], 2.6, 0.1 - PI, { lF: 12 }),
    hit: two([9, -40], [0, -18], [14, 0], [-13.5, 0], -0.15, -0.1, { lF: 15, sl: 1.1 }),
    deep: two([10, -40], [1, -18], [14, 0], [-13.5, 0], -0.4, -0.45, { lF: 15, sl: 1.05 }),
    follow: two([8, -42], [0.5, -18.5], [14, 0], [-13.5, 0], -0.7, -0.85, { lF: 15 }),
    rec: 10,
  },
  // 서리 — 가장 길다. 웅크려 위를 겨누었다가 온몸을 펴며 비스듬히 위로 길게 뻗는다
  frost: {
    stand: STAND_GREAT,
    wind: two([-3, -36], [-4, -14], [9, 0], [-13, 0], 1.9, -1.15, { lF: 9 }),
    hit: two([6, -50], [3, -22], [10, 0], [-4, 0], -1.15, -1.15, { lF: 16, sl: 1.15 }),
    deep: two([6.5, -50.5], [3, -22], [10, 0], [-4, 0], -1.18, -1.18, { lF: 16, sl: 1.1 }),
    follow: two([4, -48], [2, -21.5], [9, 0], [-5, 0], -0.9, -0.95, { lF: 15 }),
    rec: 12,
    long: 1.1,
  },
  // 흑철 — 칼끝을 앞 바닥에 박았다가 하늘로 찢어 올린다
  onyx: {
    stand: STAND_GREAT,
    wind: two([7, -33], [-3, -13], [11, 0], [-14, 0], 0.9, 0.95),
    hit: two([1, -50], [1, -22], [8, 0], [-6, 0], -1.45, -1.45, { lF: 16, sl: 1.1, eF: 2 }),
    deep: two([0, -50.5], [1, -22], [8, 0], [-6, 0], -1.6, -1.75, { lF: 16, eF: 2 }),
    follow: two([-1, -48], [0, -22], [7, 0], [-7, 0], -1.9, -2.1, { lF: 16 }),
    rec: 12,
    heft: 1.5,
  },
  // 황금 — 한 손. 얼굴 앞에 곧게 세워 예를 갖추고 곧은 몸으로 비스듬히 긋는다(뒷손은 허리 뒤)
  gold: {
    stand: { ...STAND_GREAT, hB: [-5, -26], eB: -2 },
    wind: pose([0, -48.5], [0, -22], [7, 0], [-7, 0], -0.55, PI - 1.1, -1.5, { lF: 12, eB: -3 }),
    hit: pose([6, -42], [1, -19], [13, 0], [-12, 0], 0.75, PI - 1.1, 0.65, { sl: 1.08, eB: -3 }),
    deep: pose([7, -41], [1.5, -18.5], [13, 0], [-12, 0], 0.9, PI - 1.1, 0.9, { eB: -3 }),
    follow: pose([6.5, -41.5], [1.5, -19], [13, 0], [-12, 0], 1.05, PI - 1.1, 1.15, { eB: -3 }),
    rec: 9,
    oneHand: true,
  },
};

/** 장착 무기의 서기와 특성 — 필살 시간표의 처음 · 끝 키가 이 서기다 */
export function kitOf(w: WeaponId): Kit {
  return STYLE[w];
}

function attack(st: Style, t: number): Body {
  const b = play([[0, st.wind], [1, st.hit, hold], [3, st.deep, out], [5.5, st.follow]], t);
  if (!st.buzz || t < 1 || t >= 4) return b;
  const d = Math.floor(t) % 2 ? 0.7 : -0.7; // 가는 동안 손이 떤다
  return { ...b, hF: [b.hF[0] + d, b.hF[1] - d], hB: [b.hB[0] + d, b.hB[1] - d] };
}

const tips = new Map<WeaponId, readonly number[]>();
/** 쳐듦 → 닿음 사이 칼끝이 지나간 길(발 기준 x, y 열한 점 · 닿은 쪽이 먼저) — 참격 호가 이 길을 따라 그려진다 */
export function slashOf(w: WeaponId): readonly number[] {
  let pts = tips.get(w);
  if (!pts) {
    const st = STYLE[w];
    const L = greatLook(w) ? GREAT_L : SWORD_L;
    const out11: number[] = [];
    for (let i = 0; i <= 10; i++) {
      const b = mix(st.hit, st.wind, i / 10);
      out11.push(b.hF[0] + Math.cos(b.sa) * L * b.sl, b.hF[1] + Math.sin(b.sa) * L * b.sl);
    }
    tips.set(w, (pts = out11));
  }
  return pts;
}

/** 공중 베기 — 윗몸은 그대로, 다리만 접어 든다 */
function inAir(b: Body): Body {
  const dy = -24 - b.hip[1];
  const m = (p: Pt): [number, number] => [p[0], p[1] + dy];
  const hip = m(b.hip);
  return { ...b, head: m(b.head), hip, hF: m(b.hF), hB: m(b.hB), fF: [hip[0] + 9, hip[1] + 13], fB: [hip[0] - 8, hip[1] + 16] };
}

// ── 점프 — 뻗으며 뜀 → 웅크림 → 내려오며 칼을 쳐듦. 속도(vy)로 자리를 정한다(가드로 튕겨도 맞는다) ──
const J_UP = pose([5, -51], [0, -25.5], [-3, -3.5], [-9, -5], 2.3, -1.0, 2.5);
const J_TUCK = pose([10, -44], [-1, -26], [5, -12], [1, -11], PI - 0.25, 0.95, PI - 0.3, { eB: 2.5 });
const J_FALL = pose([2, -50], [0, -25], [5, -7], [-6, -3], 2 * PI - 1.85, -0.5, 2 * PI - 2.3, { lF: 16, eF: -2.5 });
const J_LAND = pose([5, -31], [-3, -11.5], [9, 0], [-11, 0], 1.0, 2.4, 0.55, { eB: -1.5 });

function jump(vy: number): Body {
  const u = Math.min(1, Math.max(0, (1 - vy / PLAYER.JUMP_V0) / 2));
  return play([[0, J_UP], [14, J_TUCK, out], [58, sink(J_TUCK, 0.8)], [80, J_FALL], [96, sink(J_FALL, -1)]], u * 96);
}

// ── 가드 — 칼을 머리 위에 가로로 받치고 버틴다 ──
function guard(head: Pt, hip: Pt, fF: Pt, fB: Pt): Body {
  const y = head[1] - 10;
  return { head, hip, fF, fB, hF: [-10, y], hB: [9, y], sa: 0, sl: 1.05, eF: -3, eB: 3, turn: 1 };
}
const G_GROUND = guard([0, -44], [0, -18], [9, 0], [-9, 0]);
const G_AIR = guard([0, -48], [0, -23], [8, -10], [-5, -9]);
const G_BREAK = pose([-6, -45], [0, -22], [6, 0], [-10, -2], 0.35, PI + 0.35, 1.05);

/** 대기 숨 — 80틱에 한 번 천천히 가라앉고 칼끝이 따라 흔들린다 */
function breathe(st: Body, tick: number): Body {
  const u = (1 - Math.cos((2 * PI * tick) / 80)) / 2;
  return sink(st, 0.9 * u, 0.05 * u);
}

/** 새 자세로 넘어올 때 직전 몸에서 잇는 틱 수 — 0 = 바로 */
function blendTicks(to: PlayerPose, from: PlayerPose, rec: number): number {
  if (to === 'attack' || to === 'guardBreak') return 0;
  if (to === 'guardG' || to === 'guardA') return 2;
  if (to === 'jump') return from === 'idle' ? 0 : 6; // 땅에서 뛸 땐 바로 뻗는다
  if (to !== 'idle') return 0;
  if (from === 'attack') return rec; // 무거운 무기일수록 천천히 일어선다
  if (from === 'jump' || from === 'guardA') return 0; // 착지는 제 시간표가 있다
  return 6;
}

let cur: PlayerPose = 'idle';
let prev: PlayerPose = 'idle';
let at = 0; // 지금 자세가 시작한 틱
let last = -1;
let drawn: Body | null = null; // 직전에 그린 몸
let from: Body | null = null; // 자세가 바뀐 순간의 몸

/** 판 졸라맨의 평소 몸 — 깔림 · 사망(납작한 구운 프레임)과 필살(wazaBody)은 null */
export function moveBody(s: GameState): Body | null {
  const p = s.player;
  if (s.tick < last) { cur = p.pose; prev = 'idle'; at = s.tick - 999; drawn = from = null; } // 새 판
  last = s.tick;
  if (p.pose !== cur) { prev = cur; cur = p.pose; at = s.tick; from = drawn; }
  const dt = s.tick - at;
  const style = STYLE[s.weapon];
  const st = style.stand;
  let b: Body;
  switch (p.pose) {
    case 'attack': b = p.attackFromAir ? inAir(attack(style, p.poseTick)) : attack(style, p.poseTick); break;
    case 'jump': b = jump(p.vy); break;
    case 'guardG': b = play([[0, G_GROUND], [PLAYER.GUARD_STARTUP_GROUND, sink(G_GROUND, 1.5), out]], p.poseTick); break;
    case 'guardA': b = G_AIR; break;
    case 'guardBreak': b = play([[0, G_BREAK], [3, sink(G_BREAK, 2), out], [PLAYER.GUARD_BREAK_STUN, G_BREAK]], p.poseTick); break;
    case 'idle':
      // 착지 — 주저앉았다 일어선다
      b = (prev === 'jump' || prev === 'guardA') && dt < 15
        ? play([[0, J_LAND], [3, sink(J_LAND, 1.5), out], [15, st]], dt)
        : breathe(st, s.tick);
      break;
    default: drawn = from = null; return null;
  }
  const n = blendTicks(cur, prev, style.rec);
  if (from && dt < n) b = mix(from, b, out(dt / n));
  drawn = b;
  return b;
}
