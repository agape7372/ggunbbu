// 불새 3판 — 친 자리 위 V자 날개 한 쌍(펼침 → 퍼덕) · 떨어지는 불티 · 공통 초승달 없음 · 조각 상한.
// ⚠ legend5는 bladeFx와 순환 import — bladeFx를 먼저 들인다
import { beforeEach, describe, expect, it } from 'vitest';
import { RECIPES, pool, resetBladeFx, updateBladeFx, weaponAlong, weaponBloom } from '../src/render/bladeFx';
import { liveBits } from '../src/render/weaponFx';
import { WEAPON_INK } from '../src/config';

const c = WEAPON_INK.phoenix;
const live = () => pool.filter((p) => p.alive);
const step = (n: number): void => { for (let i = 0; i < n; i++) updateBladeFx(1 / 60); };
const tip = (p: { x: number; y: number; rot: number; size: number }): [number, number] => [p.x + Math.cos(p.rot) * p.size, p.y + Math.sin(p.rot) * p.size];

beforeEach(() => resetBladeFx());

describe('불새 — 날개 한 쌍 → 퍼덕 → 불티', () => {
  it('타격: 3프레임 안에 한쪽 셋씩 깃이 펼쳐져 친 자리 위로 V자, 0.1초에 접힌 깃이 더 나오고, 2초 뒤 0', () => {
    RECIPES.wing.hit(300, 400, 1, c);
    step(3);
    const a = live();
    expect(a).toHaveLength(6);
    for (const p of a) expect(tip(p)[1]).toBeLessThan(400); // 깃 끝은 모두 위
    expect(a.filter((p) => tip(p)[0] < 290)).toHaveLength(3); // 왼쪽 부채
    expect(a.filter((p) => tip(p)[0] > 310)).toHaveLength(3); // 오른쪽 부채
    step(5);
    expect(live().filter((p) => p.k === 'stroke').length).toBeGreaterThan(6); // 퍼덕 — 접힌 깃이 나와 다시 펴진다
    step(125);
    expect(liveBits()).toHaveLength(0);
  });

  it('완파: 불티는 금박보다 크고 많으며 아래로 떨어진다 · 어느 사건도 초승달(sweep)을 긋지 않는다', () => {
    RECIPES.wing.destroy(300, 300, 1.25, c);
    let leaves = 0;
    for (let i = 0; i < 40; i++) {
      step(1);
      leaves = Math.max(leaves, live().filter((p) => p.k === 'leaf').length);
    }
    expect(leaves).toBeGreaterThanOrEqual(14);
    const ls = live().filter((p) => p.k === 'leaf');
    expect(Math.min(...ls.map((p) => p.size))).toBeGreaterThan(3.8);
    expect(ls.filter((p) => p.vy > 0).length).toBeGreaterThan(ls.length / 2);
    resetBladeFx();
    const r = RECIPES.wing;
    r.hit(300, 400, 1, c); r.floor(300, 400, 1, c); r.destroy(300, 300, 1, c); r.whiff?.(300, 400, c);
    r.swing?.(300, 600, 12, 0.26, c, 0, 1); r.waza?.bloom(300, 300, -1, 1, c);
    for (let i = 0; i < 40; i++) {
      expect(live().some((p) => p.k === 'sweep')).toBe(false);
      step(1);
    }
  });

  it('필살 along · bloom — 상한(24 · 48) 안 · 전부 keep · 2초 뒤 0', () => {
    let born = 0;
    weaponAlong('phoenix', [0, 600, 300, 200, 700, 100], 1.3, 0.35);
    for (let i = 0; i < 130; i++) {
      born = Math.max(born, live().length);
      expect(liveBits().every((p) => p.keep)).toBe(true);
      updateBladeFx(1 / 60);
    }
    expect(born).toBeGreaterThan(3);
    expect(born).toBeLessThanOrEqual(24);
    expect(liveBits()).toHaveLength(0);
    weaponBloom('phoenix', 300, 300, -Math.PI / 2, 1.4);
    let peak = 0;
    for (let i = 0; i < 130; i++) { peak = Math.max(peak, live().length); updateBladeFx(1 / 60); }
    expect(peak).toBeGreaterThan(5);
    expect(peak).toBeLessThanOrEqual(48);
    expect(liveBits()).toHaveLength(0);
  });
});
