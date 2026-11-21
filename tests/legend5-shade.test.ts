// 그림자 대검 3판 — 발 높이 먹 번짐이 옆으로 느리게 기어 나감(몸 둘레 비움 · 남보라는 가장자리) → 위 소용돌이 → 조각이 오른다. 필살 상한 · keep.
// ⚠ legend5는 bladeFx와 순환 import — bladeFx를 먼저 들인다
import { beforeEach, describe, expect, it } from 'vitest';
import { RECIPES, pool, resetBladeFx, updateBladeFx, weaponAlong, weaponBloom } from '../src/render/bladeFx';
import { liveBits } from '../src/render/weaponFx';
import { PALETTE, WEAPON_INK } from '../src/config';

const c = WEAPON_INK.shade;
const alive = (): number => pool.filter((p) => p.alive).length;
const live = (k: string) => pool.filter((p) => p.alive && p.k === k);
const step = (n: number): void => { for (let i = 0; i < n; i++) updateBladeFx(1 / 60); };

beforeEach(() => resetBladeFx());

describe('그림자 — 낮게 퍼졌다 위로', () => {
  it('타격: 덩어리는 발 높이 · 몸 밖에서 8프레임에 걸쳐 바깥으로 기어 나가고, 남보라는 한 군데, 소용돌이는 그 위, 2초 뒤 0', () => {
    RECIPES.smoke.hit(300, 400, 1, c); // 발 = 400 + 52
    const reach0 = Math.max(...live('spat').map((p) => Math.abs(p.x - 300)));
    step(9);
    const blots = live('spat');
    expect(blots).toHaveLength(4);
    expect(blots.every((p) => p.y > 430 && Math.abs(p.x - 300) >= 14)).toBe(true); // 몸 둘레엔 덩어리가 없다
    expect(Math.max(...blots.map((p) => Math.abs(p.x - 300)))).toBeGreaterThan(reach0); // 기어 나간다
    expect(blots.every((p) => p.c1 === PALETTE.INK)).toBe(true); // 덩어리는 먹
    const strokes = live('stroke');
    expect(strokes.filter((p) => p.c1 === c)).toHaveLength(1); // 남보라는 갈래 꼬리 한 군데
    expect(strokes.filter((p) => p.c1 === PALETTE.INK).length).toBeGreaterThanOrEqual(3);
    expect(strokes.every((p) => p.y > 420)).toBe(true); // 면 · 갈래도 발 높이
    step(6);
    const curl = live('zig');
    expect(curl.length).toBeGreaterThan(0);
    expect(curl.every((p) => p.y < 440)).toBe(true); // 덩어리 위
    step(125);
    expect(liveBits()).toHaveLength(0);
  });

  it('먹 조각은 천천히 위로 오른다', () => {
    RECIPES.smoke.floor(300, 400, 1, c);
    step(30);
    const leaves = live('leaf');
    expect(leaves.length).toBeGreaterThan(0);
    expect(leaves.every((p) => p.vy < 0 && p.vy > -80)).toBe(true);
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
