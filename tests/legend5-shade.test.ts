// 그림자 대검 — 연기 달(먹이 꼬리 7할을 덮는다) → 연기 갈래 · 꺾인 줄 → 먹 조각. 조각 상한 · 필살 keep.
// ⚠ legend5는 bladeFx와 순환 import — bladeFx를 먼저 들인다
import { beforeEach, describe, expect, it } from 'vitest';
import { RECIPES, pool, resetBladeFx, updateBladeFx, weaponAlong, weaponBloom } from '../src/render/bladeFx';
import { liveBits } from '../src/render/weaponFx';
import { PALETTE, WEAPON_INK, WEAPON_LITE } from '../src/config';

const c = WEAPON_INK.shade;
const alive = (): number => pool.filter((p) => p.alive).length;
const step = (n: number): void => { for (let i = 0; i < n; i++) updateBladeFx(1 / 60); };

beforeEach(() => resetBladeFx());

describe('그림자 — 연기 달 → 갈래 · 꺾인 줄 → 먹 조각', () => {
  it('타격: 즉시는 달 넷(한 붓 몸 + 먹 연기 둘 + 좁은 달군 앞날), 먹이 가장 많고, 2~3프레임 뒤 바뀌고, 2초 뒤 0', () => {
    RECIPES.smoke.hit(300, 400, 1, c);
    const cols = pool.filter((p) => p.alive).map((p) => p.c1);
    expect(cols.sort()).toEqual([c, PALETTE.INK, PALETTE.INK, WEAPON_LITE.shade].sort());
    step(2);
    expect(alive()).toBe(4); // 0.033초 — 아직 달만
    step(3);
    expect(alive()).toBeGreaterThan(4); // 0.083초 — 갈래 · 꺾인 줄이 붙는다
    expect(pool.some((p) => p.alive && p.k === 'zig' && p.c1 === WEAPON_LITE.shade)).toBe(true);
    step(125);
    expect(liveBits()).toHaveLength(0);
  });

  it('먹 조각은 위로 흩어진다(불새 불티와 반대)', () => {
    RECIPES.smoke.floor(300, 400, 1, c);
    step(30);
    const leaves = pool.filter((p) => p.alive && p.k === 'leaf');
    expect(leaves.length).toBeGreaterThan(0);
    expect(leaves.every((p) => p.y < 400)).toBe(true);
  });

  it('필살 along · bloom — 상한(24 · 48) 안 · 전부 keep · 2초 뒤 0', () => {
    let born = 0;
    weaponAlong('shade', [0, 600, 300, 200, 700, 100], 1.3, 0.35);
    for (let i = 0; i < 130; i++) {
      born = Math.max(born, alive());
      expect(liveBits().every((p) => p.keep)).toBe(true);
      updateBladeFx(1 / 60);
    }
    expect(born).toBeGreaterThan(3);
    expect(born).toBeLessThanOrEqual(24);
    expect(liveBits()).toHaveLength(0);
    weaponBloom('shade', 300, 300, -Math.PI / 2, 1.4);
    let peak = 0;
    for (let i = 0; i < 130; i++) { peak = Math.max(peak, alive()); updateBladeFx(1 / 60); }
    expect(peak).toBeGreaterThan(5);
    expect(peak).toBeLessThanOrEqual(48);
    expect(liveBits()).toHaveLength(0);
  });
});
