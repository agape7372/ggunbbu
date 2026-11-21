// 그림자 대검 3판 — 발 높이 젖은 먹 면이 몸 밖에서 옆으로 기어 나감(몸 둘레 비움) → 위로 피는 갈래(끝 몇 가닥만 남보라) →
// 머리 위쪽 뒤 소용돌이(화면 가로 60~300 안) → 조각이 오른다. 필살 상한 · keep.
// ⚠ legend5는 bladeFx와 순환 import — bladeFx를 먼저 들인다
import { beforeEach, describe, expect, it } from 'vitest';
import { RECIPES, pool, resetBladeFx, updateBladeFx, weaponAlong, weaponBloom } from '../src/render/bladeFx';
import { liveBits } from '../src/render/weaponFx';
import { PALETTE, WEAPON_INK } from '../src/config';

const c = WEAPON_INK.shade;
const alive = (): number => pool.filter((p) => p.alive).length;
const live = (k: string) => pool.filter((p) => p.alive && p.k === k);
const step = (n: number): void => { for (let i = 0; i < n; i++) updateBladeFx(1 / 60); };
/** 꺾은 획의 점들(월드 x) */
const xs = (p: (typeof pool)[number]): number[] => p.pts.filter((_, i) => i % 2 === 0).map((q) => q + p.x);

beforeEach(() => resetBladeFx());

describe('그림자 — 낮게 퍼졌다 위로', () => {
  it('타격: 면은 발 높이 · 몸 밖에서 바깥으로 번지고, 갈래가 위로 피며 남보라는 한 가닥, 소용돌이는 머리 위 · 화면 안, 2초 뒤 0', () => {
    RECIPES.smoke.hit(300, 400, 1, c); // 발 = 400 + 52
    const reach0 = Math.max(...live('spat').map((p) => Math.abs(p.x - 300)));
    step(9);
    const blots = live('spat');
    expect(blots).toHaveLength(4);
    expect(blots.every((p) => p.y > 440 && Math.abs(p.x - 300) >= 9)).toBe(true); // 몸 둘레엔 번짐이 없다
    expect(Math.max(...blots.map((p) => Math.abs(p.x - 300)))).toBeGreaterThan(reach0); // 기어 나간다
    expect(blots.every((p) => p.c1 === PALETTE.INK)).toBe(true); // 번짐은 먹
    const strokes = live('stroke');
    const rising = strokes.filter((p) => Math.sin(p.rot) < -0.5);
    const sheets = strokes.filter((p) => Math.sin(p.rot) >= -0.5);
    expect(sheets).toHaveLength(6); // 면 세 장 × 양옆
    expect(sheets.every((p) => p.y > 440 && Math.abs(p.x - 300) >= 8.9 && p.c1 === PALETTE.INK)).toBe(true);
    expect(rising).toHaveLength(4); // 갈래 넷이 위로
    expect(rising.every((p) => p.y + Math.sin(p.rot) * p.size < 452 - 16)).toBe(true);
    expect(strokes.filter((p) => p.c1 === c)).toHaveLength(1); // 남보라는 갈래 꼬리 한 가닥
    step(6);
    const curl = live('zig');
    expect(curl.length).toBeGreaterThan(0);
    expect(curl.every((p) => p.y < 452 - 25)).toBe(true); // 면 위 · 머리 높이
    expect(curl.every((p) => xs(p).every((x) => x >= 60 && x <= 300))).toBe(true); // 화면 끝에 잘리지 않는다
    step(125);
    expect(liveBits()).toHaveLength(0);
  });

  it('완파: 화면 끝 가까이 쳐도 소용돌이는 화면 가로 60~300 안, 남보라 갈래는 셋', () => {
    RECIPES.smoke.destroy(330, 400, 1.25, c);
    step(12);
    expect(live('stroke').filter((p) => p.c1 === c)).toHaveLength(3);
    const curl = live('zig');
    expect(curl.length).toBeGreaterThan(0);
    expect(curl.every((p) => xs(p).every((x) => x >= 60 && x <= 300))).toBe(true);
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
