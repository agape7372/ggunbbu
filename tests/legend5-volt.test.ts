// 고압선 대검 3판 — 가로 꺾인 쌍줄(먹 + 시그니처) 번쩍 → 끊김 → 같은 길로 깜빡 → 곧게 나는 조각 · 달(sweep) 없음 · 필살 상한.
// ⚠ legend5는 bladeFx와 순환 import — bladeFx를 먼저 들인다
import { beforeEach, describe, expect, it } from 'vitest';
import { RECIPES, pool, resetBladeFx, updateBladeFx, weaponAlong, weaponBloom } from '../src/render/bladeFx';
import { liveBits } from '../src/render/weaponFx';
import { PALETTE, WEAPON_INK } from '../src/config';

const c = WEAPON_INK.volt;
const alive = (): typeof pool => pool.filter((p) => p.alive);
const step = (n: number): void => { for (let i = 0; i < n; i++) updateBladeFx(1 / 60); };
/** 쌍줄(속도 0인 zig) 하나의 가로 폭 · 세로 폭 */
const extent = (p: (typeof pool)[number]): [number, number] => {
  const xs = p.pts.filter((_, i) => i % 2 === 0);
  const ys = p.pts.filter((_, i) => i % 2 === 1);
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
};
const lines = (): typeof pool => alive().filter((p) => p.k === 'zig' && p.vx === 0 && p.vy === 0);

beforeEach(() => resetBladeFx());

describe('고압선 — 가로 쌍줄 번쩍 → 깜빡 → 조각', () => {
  it('타격: 즉시 먹 줄 + 노랑 줄(같은 꺾임, 가로로 길다) · 조각은 곧게 · 끊긴 뒤 같은 길로 깜빡 · 2초 뒤 0', () => {
    RECIPES.volt.hit(300, 400, 1, c);
    const zig = lines();
    expect(zig.map((p) => p.c1).sort()).toEqual([PALETTE.INK, c].sort());
    expect(zig[0].pts.length).toBe(zig[1].pts.length);
    for (const p of zig) {
      const [dx, dy] = extent(p);
      expect(dx).toBeGreaterThan(dy * 3); // 수평 — 세로로 서면 번개 대검과 겹친다
    }
    const flash = extent(zig[1]);
    const sp = alive().filter((p) => p.k === 'zig' && (p.vx !== 0 || p.vy !== 0));
    expect(sp.length).toBeGreaterThan(0);
    expect(sp.every((p) => p.g === 0)).toBe(true); // 곧게 — 떨어지지 않는다
    step(9);
    expect(lines()).toHaveLength(0); // 끊김
    step(2);
    const blink = lines();
    expect(blink).toHaveLength(2); // 깜빡 — 같은 길
    expect(extent(blink.find((p) => p.c1 === c)!)[0]).toBeCloseTo(flash[0], 3);
    step(125);
    expect(liveBits()).toHaveLength(0);
  });

  it('완파: 달 · 고리(sweep) 없이 가장 긴 가로 줄 · 조각 상한 40 안', () => {
    let peak = 0;
    let swept = false;
    let widest = 0;
    RECIPES.volt.destroy(180, 400, 1.25, c);
    RECIPES.volt.swing!(180, 600, 14, 0.3, c, 0, 1);
    for (let i = 0; i < 130; i++) {
      peak = Math.max(peak, alive().length);
      swept ||= alive().some((p) => p.k === 'sweep');
      for (const p of lines()) widest = Math.max(widest, extent(p)[0]);
      updateBladeFx(1 / 60);
    }
    expect(swept).toBe(false);
    expect(widest).toBeGreaterThan(200);
    expect(peak).toBeLessThanOrEqual(40);
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
