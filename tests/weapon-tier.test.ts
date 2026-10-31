// 무기 등급 = 연출을 얼마나 담았나(힘이 아니다). 전설은 실제 칼 기운 · 물들임 · 제 소리의 출처에 묶는다.
import { describe, expect, it } from 'vitest';
import { GREAT_OWN } from '../src/audio/consume';
import { RECIPES } from '../src/render/bladeFx';
import { greatLook } from '../src/render/sprites';
import { WEAPON_IDS } from '../src/meta/loadout';
import { WEAPON_DUST_COST } from '../src/meta/economy';
import { FX_SLOTS, TIERS, WEAPON_TIER, filledSlots } from '../src/meta/tier';

const ids = [...WEAPON_IDS];
const rank = (id: (typeof ids)[number]): number => TIERS.indexOf(WEAPON_TIER[id]);

describe('무기 등급', () => {
  it('모든 무기에 등급이 있다', () => {
    for (const id of ids) expect(TIERS, id).toContain(WEAPON_TIER[id]);
  });

  it('값이 오를수록 등급이 내려가지 않는다', () => {
    const byCost = ids.filter((id) => id in WEAPON_DUST_COST).sort((a, b) => WEAPON_DUST_COST[a] - WEAPON_DUST_COST[b]);
    for (let i = 1; i < byCost.length; i++) expect(rank(byCost[i]), byCost[i]).toBeGreaterThanOrEqual(rank(byCost[i - 1]));
  });

  it('전설 = 칼 기운 · 물들임 · 제 소리를 실제로 가진 칼', () => {
    const real = ids.filter((id) => {
      const g = greatLook(id);
      const r = g && RECIPES[g.shape];
      return !!(r?.aura && r.tint && GREAT_OWN[id]);
    });
    expect(ids.filter((id) => WEAPON_TIER[id] === 'legend').sort()).toEqual(real.sort());
    // 전설이 아닌 칼은 셋 중 어느 것도 갖지 않는다
    for (const id of ids.filter((w) => WEAPON_TIER[w] !== 'legend')) {
      const g = greatLook(id);
      const r = g && RECIPES[g.shape];
      expect(!!(r?.aura || r?.tint || GREAT_OWN[id]), id).toBe(false);
    }
  });

  it('등급이 오를수록 찬 칸 수가 줄지 않는다', () => {
    const n = TIERS.map((t) => filledSlots(t).size);
    for (let i = 1; i < n.length; i++) expect(n[i]).toBeGreaterThanOrEqual(n[i - 1]);
    expect(n[0]).toBe(0);
    expect(n[n.length - 1]).toBe(FX_SLOTS.length);
  });
});
