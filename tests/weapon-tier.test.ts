// 무기 등급 = 연출을 얼마나 담았나(힘이 아니다). 전설은 실제 칼 기운 · 물들임 · 제 소리의 출처에 묶는다.
import { describe, expect, it } from 'vitest';
import * as snd from '../src/audio/consume';
import { RECIPES } from '../src/render/bladeFx';
import * as wfx from '../src/render/weaponFx';
import { greatLook } from '../src/render/sprites';
import type { WeaponId } from '../src/core/types';
import { GREATSWORD_IDS, WEAPON_IDS } from '../src/meta/loadout';
import { WEAPON_DUST_COST } from '../src/meta/economy';
import { FX_SLOTS, TIERS, WEAPON_TIER, filledSlots } from '../src/meta/tier';

const ids = [...WEAPON_IDS];

type Fx = { aura?: unknown; tint?: unknown } | undefined;
// 연장 전설(다이아 드릴)은 그림 담당의 연장 표에서 읽는다: weaponFx TOOL_RECIPES · consume TOOL_OWN. 없으면 빈 표
const TOOL_RECIPES = ((wfx as Record<string, unknown>).TOOL_RECIPES ?? {}) as Partial<Record<WeaponId, Fx>>;
const TOOL_OWN = ((snd as Record<string, unknown>).TOOL_OWN ?? {}) as Partial<Record<WeaponId, unknown>>;
/** 칼 기운 · 물들임 · 제 소리 — 대검은 칼날 모양 레시피, 연장은 연장 표 */
function legendParts(id: WeaponId): { aura: boolean; tint: boolean; own: boolean } {
  const g = greatLook(id);
  const r: Fx = g ? RECIPES[g.shape] : TOOL_RECIPES[id];
  return { aura: !!r?.aura, tint: !!r?.tint, own: !!(snd.GREAT_OWN[id] ?? TOOL_OWN[id]) };
}
const rank = (id: (typeof ids)[number]): number => TIERS.indexOf(WEAPON_TIER[id]);

describe('무기 등급', () => {
  it('모든 무기에 등급이 있다', () => {
    for (const id of ids) expect(TIERS, id).toContain(WEAPON_TIER[id]);
  });

  it('값이 오를수록 등급이 내려가지 않는다', () => {
    const byCost = ids.filter((id) => id in WEAPON_DUST_COST).sort((a, b) => WEAPON_DUST_COST[a] - WEAPON_DUST_COST[b]);
    for (let i = 1; i < byCost.length; i++) expect(rank(byCost[i]), byCost[i]).toBeGreaterThanOrEqual(rank(byCost[i - 1]));
  });

  it('전설 = 칼 기운 · 물들임 · 제 소리를 실제로 가진 무기(대검 · 연장 같은 조건)', () => {
    for (const id of ids) {
      const p = legendParts(id);
      // 전설은 셋 다, 전설이 아닌 무기는 셋 중 어느 것도 갖지 않는다
      const want = WEAPON_TIER[id] === 'legend';
      expect(p, id).toEqual({ aura: want, tint: want, own: want });
    }
  });

  it('전설 여덟 = 대검 일곱 + 연장 하나(다이아 드릴)', () => {
    const legend = ids.filter((id) => WEAPON_TIER[id] === 'legend');
    expect(legend.filter((id) => !(GREATSWORD_IDS as readonly string[]).includes(id))).toEqual(['diadrill']);
    expect(legend.length).toBe(8);
  });

  it('등급이 오를수록 찬 칸 수가 줄지 않는다', () => {
    const n = TIERS.map((t) => filledSlots(t).size);
    for (let i = 1; i < n.length; i++) expect(n[i]).toBeGreaterThanOrEqual(n[i - 1]);
    expect(n[0]).toBe(0);
    expect(n[n.length - 1]).toBe(FX_SLOTS.length);
  });
});
