// 무기 등급 — 「연출(이펙트)을 얼마나 담았나」이지 힘이 아니다(대검은 철거칼과 맞교환 · tests/weapons.test.ts).
// 값이 오를수록 등급이 내려가지 않는다. 가격→연출 사다리는 render/bladeFx.ts 머리 주석과 같은 선.
// 한글 이름표는 content/world.ts(TIER_COPY · FX_SLOT_COPY). DOM/render/audio 없음.

import type { WeaponId } from './types';

export type Tier = 'common' | 'fine' | 'rare' | 'legend';
/** 낮은 등급 → 높은 등급 */
export const TIERS: readonly Tier[] = ['common', 'fine', 'rare', 'legend'];

export const WEAPON_TIER: Readonly<Record<WeaponId, Tier>> = {
  sword: 'common',
  hammer: 'fine', crowbar: 'fine', grinder: 'fine',
  iron: 'rare', saw: 'rare', hazard: 'rare', beam: 'rare',
  flame: 'legend', frost: 'legend', onyx: 'legend', gold: 'legend',
};

export type FxSlot = 'hit' | 'shard' | 'trail' | 'aura' | 'tint';

/** 이펙트 칸 다섯(화면 순서) — tiers = 이 칸이 차는 등급 */
export const FX_SLOTS: readonly { id: FxSlot; tiers: readonly Tier[] }[] = [
  { id: 'hit', tiers: ['fine', 'rare', 'legend'] },   // 제 타격 소리
  { id: 'shard', tiers: ['fine', 'rare', 'legend'] }, // 제 타격 파편
  { id: 'trail', tiers: ['rare', 'legend'] },         // 잔상 + 참격 호
  { id: 'aura', tiers: ['legend'] },                  // 칼 기운
  { id: 'tint', tiers: ['legend'] },                  // 완파 화면 물들임
];

export const tierOf = (w: WeaponId): Tier => WEAPON_TIER[w];

/** 이 등급에서 찬 칸 */
export const filledSlots = (t: Tier): ReadonlySet<FxSlot> =>
  new Set(FX_SLOTS.filter((s) => s.tiers.includes(t)).map((s) => s.id));
