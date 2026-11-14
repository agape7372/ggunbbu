// 평소 몸 연기 — 대기 · 점프 · 베기 · 가드도 필살처럼 키 자세 시간표로 그린다(11-14 사용자 「이대로 모션 총 대개편」).
// 필살 몸 연기(wazaBody.ts)와 같은 문법 · 같은 그리기(drawLiveBody)다. core는 읽기만 한다.
// 자세가 바뀌면 직전에 그린 몸에서 새 자세로 몇 틱에 걸쳐 잇는다. 베기 · 가드 깨짐은 잇지 않고 바로 선다(한 틱에 풀려야 세다).

import { PLAYER } from '../config';
import type { GameState, PlayerPose } from '../core/types';
import { greatLook, type Body } from './sprites';
import { STAND, STAND_GREAT, mix, out, play, pose, sink } from './wazaBody';

const PI = Math.PI;
const hold = (): number => 0; // 다음 키까지 앞 자세로 버틴다 — 한 틱에 넘어간다

// ── 베기 — 크게 쳐듦 → 한 틱에 낮은 런지 → 더 가라앉음 → 여운 ──
const A_WIND = pose([-2, -44], [0, -19.5], [11, 0], [-13, 0], -2.5, 0.2, -1.8, { lF: 16, sl: 1.1, eF: -3, eB: 2 });
const A_HIT = pose([12, -30], [-3, -14.5], [11, 0], [-21, 0], 0.5, PI - 0.5, -0.25, { sl: 1.2, eB: 1.5 });
const A_DEEP = pose([13.5, -28], [-2.5, -13], [11, 0], [-21, 0], 0.6, PI - 0.6, 0, { sl: 1.08, eB: 1.5 });
const A_FOLLOW = pose([12.5, -29.5], [-3, -14], [11, 0], [-21, 0], 0.7, PI - 0.75, 0.26, { eB: 1 });

function attack(t: number): Body {
  return play([[0, A_WIND], [1, A_HIT, hold], [3, A_DEEP, out], [5.5, A_FOLLOW]], t);
}

/** 공중 베기 — 윗몸은 그대로, 다리만 접어 든다 */
function inAir(b: Body): Body {
  const dy = -24 - b.hip[1];
  const m = (p: readonly [number, number]): [number, number] => [p[0], p[1] + dy];
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
function guard(head: readonly [number, number], hip: readonly [number, number], fF: readonly [number, number], fB: readonly [number, number]): Body {
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
function blendTicks(to: PlayerPose, from: PlayerPose): number {
  if (to === 'attack' || to === 'guardBreak') return 0;
  if (to === 'guardG' || to === 'guardA') return 2;
  if (to === 'jump') return from === 'idle' ? 0 : 6; // 땅에서 뛸 땐 바로 뻗는다
  if (to !== 'idle') return 0;
  if (from === 'attack') return 10; // 런지에서 천천히 일어선다
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
  const st = greatLook(s.weapon) ? STAND_GREAT : STAND;
  let b: Body;
  switch (p.pose) {
    case 'attack': b = p.attackFromAir ? inAir(attack(p.poseTick)) : attack(p.poseTick); break;
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
  const n = blendTicks(cur, prev);
  if (from && dt < n) b = mix(from, b, out(dt / n));
  drawn = b;
  return b;
}
