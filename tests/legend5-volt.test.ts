// 고압선 대검 — 달 → 나란한 꺾인 획 둘(먹 + 시그니처) → 곧게 날아가는 불꽃 · 필살 상한.
// ⚠ legend5는 bladeFx와 순환 import — bladeFx를 먼저 들인다
import { beforeEach, describe, expect, it } from 'vitest';
import { RECIPES, pool, resetBladeFx, updateBladeFx, weaponAlong, weaponBloom } from '../src/render/bladeFx';
import { liveBits } from '../src/render/weaponFx';
import { PALETTE, WEAPON_INK, WEAPON_LITE } from '../src/config';

const c = WEAPON_INK.volt;
const alive = (): typeof pool => pool.filter((p) => p.alive);
const step = (n: number): void => { for (let i = 0; i < n; i++) updateBladeFx(1 / 60); };

beforeEach(() => resetBladeFx());

describe('고압선 — 달 → 쌍줄 → 불꽃', () => {
  it('타격: 즉시는 달 둘, 2~3프레임 뒤 먹 줄 + 노랑 줄(같은 꺾임), 불꽃은 곧게 날아가고 2초 뒤 0', () => {
    RECIPES.volt.hit(300, 400, 1, c);
    expect(alive().map((p) => p.c1).sort()).toEqual([c, WEAPON_LITE.volt].sort());
    step(3);
    const zig = alive().filter((p) => p.k === 'zig');
    expect(zig.map((p) => p.c1).sort()).toEqual([PALETTE.INK, c].sort()); // 먹 줄 · 시그니처 줄
    expect(zig.every((p) => p.pts.length === zig[0].pts.length)).toBe(true);
    expect(zig.find((p) => p.c1 === c)?.c2).toBe(WEAPON_LITE.volt); // 밝은 짝 속 → 종이빛 달군 속
    step(4);
    const sp = alive().filter((p) => p.k === 'zig' && (p.vx !== 0 || p.vy !== 0));
    expect(sp.length).toBeGreaterThan(0);
    expect(sp.every((p) => p.g === 0)).toBe(true); // 곧게 — 떨어지지 않는다
    step(125);
    expect(liveBits()).toHaveLength(0);
  });

  it('필살 along · bloom — 상한(24 · 48) 안 · 전부 keep · 2초 뒤 0', () => {
    let born = 0;
    weaponAlong('volt', [0, 600, 300, 200, 700, 100], 1.3, 0.35);
    for (let i = 0; i < 130; i++) {
      born = Math.max(born, alive().length);
      expect(liveBits().every((p) => p.keep)).toBe(true);
      updateBladeFx(1 / 60);
    }
    expect(born).toBeGreaterThan(3);
    expect(born).toBeLessThanOrEqual(24);
    expect(liveBits()).toHaveLength(0);
    weaponBloom('volt', 300, 300, -Math.PI / 2, 1.4);
    let peak = 0;
    for (let i = 0; i < 130; i++) { peak = Math.max(peak, alive().length); updateBladeFx(1 / 60); }
    expect(peak).toBeGreaterThan(5);
    expect(peak).toBeLessThanOrEqual(48);
    expect(liveBits()).toHaveLength(0);
  });
});
