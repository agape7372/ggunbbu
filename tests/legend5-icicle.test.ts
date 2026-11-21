// 고드름 대검 3판 — 한쪽으로 기운 가시 다발이 툭 꽂힘 → 10프레임 버팀(움직임 0) → 쩍 갈라짐 → 세모 조각이 돌며 떨어짐.
// ⚠ legend5는 bladeFx와 순환 import — bladeFx를 먼저 들인다
import { beforeEach, describe, expect, it } from 'vitest';
import { RECIPES, pool, resetBladeFx, updateBladeFx, weaponAlong, weaponBloom } from '../src/render/bladeFx';
import { liveBits } from '../src/render/weaponFx';
import { WEAPON_INK } from '../src/config';

const c = WEAPON_INK.icicle;
const alive = (): typeof pool => pool.filter((p) => p.alive);
const step = (n: number): void => { for (let i = 0; i < n; i++) updateBladeFx(1 / 60); };

beforeEach(() => resetBladeFx());

describe('고드름 — 기운 다발 → 버팀 → 쩍 → 세모 조각', () => {
  it('타격: 즉시 가시 다섯이 한쪽으로 기울어 꽂히고, 10프레임 그대로 버틴 뒤 금 + 조각이 돌며 떨어진다', () => {
    RECIPES.icicle.hit(300, 400, 1, c);
    const spikes = alive();
    expect(spikes).toHaveLength(5);
    expect(spikes.every((p) => p.k === 'stroke' && p.vx === 0 && p.vy === 0)).toBe(true);
    // 한쪽으로 — 모두 위로 가고, 모두 같은 옆쪽으로 기운다(수직 서리와 갈린다)
    const dx = spikes.map((p) => Math.cos(p.rot));
    expect(spikes.every((p) => Math.sin(p.rot) < 0)).toBe(true);
    expect(dx.every((v) => Math.sign(v) === Math.sign(dx[2]))).toBe(true);
    expect(Math.abs(dx[2])).toBeGreaterThan(0.5);
    const at = spikes.map((p) => [p.x, p.y, p.size]);
    step(10);
    expect(alive()).toHaveLength(5); // 버팀 — 새 조각 없음 · 자리 그대로
    expect(spikes.map((p) => [p.x, p.y, p.size])).toEqual(at);
    step(4);
    expect(alive().some((p) => p.k === 'zig')).toBe(true); // 쩍
    const leaf = liveBits().filter((p) => p.k === 'leaf');
    expect(leaf.length).toBe(4);
    expect(leaf.every((p) => p.spin !== 0 && p.st === 3)).toBe(true);
    step(20);
    expect(liveBits().filter((p) => p.k === 'leaf').every((p) => p.vy > 0)).toBe(true); // 아래로
    step(120);
    expect(liveBits()).toHaveLength(0);
  });

  it('크기 순서 whiff < hit < floor < destroy · 완파 · 칼 기운 상한 안', () => {
    const longest = (f: () => void): number => {
      resetBladeFx();
      f();
      return Math.max(...alive().map((p) => p.size));
    };
    const w = longest(() => RECIPES.icicle.whiff?.(300, 400, c));
    const h = longest(() => RECIPES.icicle.hit(300, 400, 1, c));
    const f = longest(() => RECIPES.icicle.floor(300, 400, 1, c));
    const d = longest(() => RECIPES.icicle.destroy(300, 400, 1, c));
    expect(w).toBeLessThan(h);
    expect(h).toBeLessThan(f);
    expect(f).toBeLessThan(d);
    resetBladeFx();
    RECIPES.icicle.destroy(300, 500, 1.5, c);
    let peak = 0;
    for (let i = 0; i < 130; i++) { peak = Math.max(peak, alive().length); step(1); }
    expect(peak).toBeLessThanOrEqual(40);
    resetBladeFx();
    RECIPES.icicle.aura?.([300, 400, 340, 480], 3, c);
    expect(alive()).toHaveLength(3);
  });

  it('필살 along · bloom — 상한(24 · 48) 안 · 전부 keep · 2초 뒤 0', () => {
    let born = 0;
    weaponAlong('icicle', [0, 600, 300, 200, 700, 100], 1.3, 0.35);
    for (let i = 0; i < 130; i++) {
      born = Math.max(born, alive().length);
      expect(liveBits().every((p) => p.keep)).toBe(true);
      updateBladeFx(1 / 60);
    }
    expect(born).toBeGreaterThan(3);
    expect(born).toBeLessThanOrEqual(24);
    expect(liveBits()).toHaveLength(0);
    weaponBloom('icicle', 300, 300, -Math.PI / 2, 1.4);
    let peak = 0;
    for (let i = 0; i < 130; i++) { peak = Math.max(peak, alive().length); updateBladeFx(1 / 60); }
    expect(peak).toBeGreaterThan(5);
    expect(peak).toBeLessThanOrEqual(48);
    expect(liveBits()).toHaveLength(0);
  });
});
