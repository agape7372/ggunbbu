// 현장 조건(11-19) — 아케이드 구역 경계를 넘는 틱에 쪽지 둘(왼쪽 안전 · 오른쪽 욕심)을 내민다.
// 내민 동안 시뮬은 서고(sim.advance 첫 줄), 점프 = 왼쪽 · 공격 = 오른쪽으로 고른다. 값은 config PERK 한 표.
// 무기 표는 안 바꾼다 — 판 상태(s.perk)에서 더하고 곱한다. perk가 없는 판(지시서 · 토코톤 · 작전)은 무기 값 그대로다.

import type { GameState, InputFrame, PerkId } from './types';
import { GUARD_GAUGE, PERK, PERK_RUN, WEAPON } from '../config';
import { rand } from './rng';

const IDS = Object.keys(PERK) as PerkId[];
const SAFE = IDS.filter((id) => PERK[id].side === 'safe');
const GREED = IDS.filter((id) => PERK[id].side === 'greed');

type AddKey = 'reach' | 'lift' | 'guardMax' | 'floors';
type MulKey = 'waza' | 'guardRegen' | 'dust';

function add(s: Pick<GameState, 'perk'>, k: AddKey): number {
  let n = 0;
  for (const id of s.perk?.picked ?? []) n += PERK[id][k] ?? 0;
  return n;
}

function mul(s: Pick<GameState, 'perk'>, k: MulKey): number {
  let m = 1;
  for (const id of s.perk?.picked ?? []) m *= PERK[id][k] ?? 1;
  return m;
}

/** 콤보 사거리(불새 comboReach)가 자란 몫 0~1 — 콤보 100까지 곧게, 끊기면 0. 없는 무기는 0. 렌더가 칼끝 불길 길이로 읽는다 */
export const comboReachK = (s: GameState): number =>
  WEAPON[s.weapon].comboReach ? Math.min(s.combo, 100) / 100 : 0;
/** 건물 사거리. 발이 땅에서 떨어져 있으면 무기 airReach를 더한다(비계 파이프). 콤보 사거리 · 퍽을 더한 값은 여기 한 곳에서 REACH_MAX로 자른다 */
export function reachOf(s: GameState): number {
  const w = WEAPON[s.weapon];
  const air = s.player.y > 0 ? w.airReach ?? 0 : 0;
  return Math.min(PERK_RUN.REACH_MAX, w.reach + air + (w.comboReach ?? 0) * comboReachK(s) + add(s, 'reach'));
}
/** 베기 띄우기 — 콤보 띄우기(크레인 comboLift)와 퍽을 더한 값은 여기 한 곳에서 LIFT_MAX로 자른다(연타만으로 못 버틴다) */
export function liftOf(s: GameState): number {
  const w = WEAPON[s.weapon];
  const combo = (w.comboLift ?? 0) * Math.min(s.combo, 100) / 100;
  return Math.min(PERK_RUN.LIFT_MAX, w.lift + combo + add(s, 'lift'));
}
export const wazaMul = (s: GameState): number => mul(s, 'waza');
export const guardRegenMul = (s: GameState): number => mul(s, 'guardRegen');
export const guardMax = (s: GameState): number => GUARD_GAUGE.MAX + add(s, 'guardMax');
export const extraFloors = (s: GameState): number => add(s, 'floors');
/** 그 판에 번 먼지 배율(scenes earnDust) */
export const dustMul = (s: Pick<GameState, 'perk'>): number => mul(s, 'dust');

/** 쪽지 둘을 내민다 — 안전 쪽 하나 · 욕심 쪽 하나, 내민 적 없는 것에서. 쓰고 있으면 새 안전모는 빠진다 */
export function openOffer(s: GameState): void {
  const r = s.perk;
  if (!r || r.picked.length >= PERK_RUN.MAX) return;
  const safe = SAFE.filter((id) => !r.seen.includes(id) && !(PERK[id].hat && s.hat));
  const greed = GREED.filter((id) => !r.seen.includes(id));
  if (safe.length === 0 || greed.length === 0) return;
  const a = safe[Math.floor(rand(s) * safe.length)];
  const b = greed[Math.floor(rand(s) * greed.length)];
  r.seen.push(a, b);
  r.offer = { a, b, t: 0, calm: 0 };
  s.events.push({ kind: 'perkOffer' });
}

/** 쪽지가 떠 있는 한 틱 — 손을 CALM틱 놓았다가 누른 것만 고른다. AUTO틱 지나면 왼쪽 */
export function stepOffer(s: GameState, input: InputFrame): void {
  const o = s.perk!.offer!;
  o.t += 1;
  const press = input.jump || input.attack;
  const pick = o.t >= PERK_RUN.AUTO ? o.a
    : press && o.calm >= PERK_RUN.CALM ? (input.jump ? o.a : o.b) : null;
  o.calm = press ? 0 : o.calm + 1;
  if (pick) takePerk(s, pick, pick === o.b ? 1 : 0);
}

function takePerk(s: GameState, id: PerkId, side: 0 | 1): void {
  const r = s.perk!;
  r.picked.push(id);
  r.offer = null;
  s.player.holdTick = 0; // 고른 누름이 착암기 반복으로 이어지지 않게(새로 눌러야 다시 돈다)
  if (PERK[id].hat) s.hat = true;
  s.guardGauge = Math.min(s.guardGauge, guardMax(s));
  s.events.push({ kind: 'perkPick', n: side });
}
