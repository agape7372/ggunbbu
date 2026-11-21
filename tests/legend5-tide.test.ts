// 해일 대검 — 달 → 파도 마루 → 물방울 박자 · 조각 상한 · 소멸.
// ⚠ legend5는 bladeFx와 순환 import — bladeFx를 먼저 들인다
import { beforeEach, describe, expect, it } from 'vitest';
import { RECIPES, pool, resetBladeFx, updateBladeFx, weaponAlong, weaponBloom } from '../src/render/bladeFx';
import { liveBits } from '../src/render/weaponFx';
import { PALETTE, VIEW, WEAPON_INK, WEAPON_LITE } from '../src/config';

const c = WEAPON_INK.tide;
const alive = (): number => pool.filter((p) => p.alive).length;
const step = (n: number): void => { for (let i = 0; i < n; i++) updateBladeFx(1 / 60); };

beforeEach(() => resetBladeFx());

describe('해일 — 달 → 파도 마루 → 물방울', () => {
  it('타격: 즉시는 달 둘 + 앞날 거품, 2~3프레임 뒤 거품 속 든 파도 마루, 2초 뒤 0', () => {
    RECIPES.surf.hit(300, 400, 1, c);
    expect(alive()).toBe(3);
    expect(pool.filter((p) => p.alive && p.c2 === PALETTE.BG).map((p) => p.c1)).toEqual([WEAPON_LITE.tide]); // 거품 = 밝은 짝 몸 + 종이빛 속
    step(2);
    expect(alive()).toBe(3);
    step(2);
    const crest = pool.find((p) => p.alive && p.k === 'zig');
    expect(crest?.c1).toBe(c);
    expect(crest?.c2).toBe(PALETTE.BG);
    expect(crest?.pts.length).toBeGreaterThan(30); // 굽은 물결(마디 여럿) — 곧은 톱니면 번개로 읽힌다
    step(125);
    expect(liveBits()).toHaveLength(0);
  });

  it('완파: 땅 물 튐은 땅 위에서 · 조각 상한 안 · 2초 뒤 0', () => {
    RECIPES.surf.destroy(300, 500, 1.25, c);
    let peak = 0;
    for (let i = 0; i < 130; i++) {
      peak = Math.max(peak, alive());
      expect(pool.every((p) => !p.alive || p.y <= VIEW.GROUND_Y)).toBe(true);
      updateBladeFx(1 / 60);
    }
    expect(peak).toBeGreaterThan(10);
    expect(peak).toBeLessThanOrEqual(40);
    expect(liveBits()).toHaveLength(0);
  });

  it('필살 along · bloom — 상한(24 · 48) 안 · 전부 keep · 2초 뒤 0', () => {
    let born = 0;
    weaponAlong('tide', [0, 600, 300, 200, 700, 100], 1, 0.35);
    for (let i = 0; i < 130; i++) {
      born = Math.max(born, alive());
      expect(liveBits().every((p) => p.keep)).toBe(true);
      updateBladeFx(1 / 60);
    }
    expect(born).toBeGreaterThan(3);
    expect(born).toBeLessThanOrEqual(24);
    expect(liveBits()).toHaveLength(0);
    weaponBloom('tide', 300, 300, -Math.PI / 2, 1.4);
    let peak = 0;
    for (let i = 0; i < 130; i++) { peak = Math.max(peak, alive()); updateBladeFx(1 / 60); }
    expect(peak).toBeGreaterThan(5);
    expect(peak).toBeLessThanOrEqual(48);
    expect(liveBits()).toHaveLength(0);
  });
});
