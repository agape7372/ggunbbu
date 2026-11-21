// 고드름 대검 — 달 → 고드름 · 가시 다발 → 세모 조각. 조각 상한 · 필살 keep.
// ⚠ legend5는 bladeFx와 순환 import — bladeFx를 먼저 들인다
import { beforeEach, describe, expect, it } from 'vitest';
import { RECIPES, pool, resetBladeFx, updateBladeFx, weaponAlong, weaponBloom } from '../src/render/bladeFx';
import { liveBits } from '../src/render/weaponFx';
import { WEAPON_INK, WEAPON_LITE } from '../src/config';

const c = WEAPON_INK.icicle;
const alive = (): number => pool.filter((p) => p.alive).length;
const step = (n: number): void => { for (let i = 0; i < n; i++) updateBladeFx(1 / 60); };

beforeEach(() => resetBladeFx());

describe('고드름 — 달 → 가시 다발 · 고드름 → 세모 조각', () => {
  it('타격: 즉시는 달 둘, 2~3프레임 뒤 얼고, 그 뒤 세모 조각(leaf)이 떨어지고, 2초 뒤 0', () => {
    RECIPES.icicle.hit(300, 400, 1, c);
    expect(alive()).toBe(2);
    expect(pool.filter((p) => p.alive).map((p) => p.c1).sort()).toEqual([c, WEAPON_LITE.icicle].sort());
    step(1);
    expect(alive()).toBe(2); // 0.017초 — 아직 달만
    step(4);
    expect(alive()).toBeGreaterThan(5); // 고드름 · 가시 다발
    let shards = 0;
    for (let i = 0; i < 40; i++) { shards = Math.max(shards, liveBits().filter((p) => p.k === 'leaf').length); step(1); }
    expect(shards).toBeGreaterThan(1);
    step(120);
    expect(liveBits()).toHaveLength(0);
  });

  it('완파 · 칼 기운 — 조각 수 상한 안', () => {
    RECIPES.icicle.destroy(300, 500, 1.5, c);
    let peak = 0;
    for (let i = 0; i < 130; i++) { peak = Math.max(peak, alive()); step(1); }
    expect(peak).toBeLessThanOrEqual(40);
    RECIPES.icicle.aura?.([300, 400, 340, 480], 3, c);
    expect(alive()).toBe(3);
  });

  it('필살 along · bloom — 상한(24 · 48) 안 · 전부 keep · 2초 뒤 0', () => {
    let born = 0;
    weaponAlong('icicle', [0, 600, 300, 200, 700, 100], 1.3, 0.35);
    for (let i = 0; i < 130; i++) {
      born = Math.max(born, alive());
      expect(liveBits().every((p) => p.keep)).toBe(true);
      updateBladeFx(1 / 60);
    }
    expect(born).toBeGreaterThan(3);
    expect(born).toBeLessThanOrEqual(24);
    expect(liveBits()).toHaveLength(0);
    weaponBloom('icicle', 300, 300, -Math.PI / 2, 1.4);
    let peak = 0;
    for (let i = 0; i < 130; i++) { peak = Math.max(peak, alive()); updateBladeFx(1 / 60); }
    expect(peak).toBeGreaterThan(5);
    expect(peak).toBeLessThanOrEqual(48);
    expect(liveBits()).toHaveLength(0);
  });
});
