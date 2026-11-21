// 원소 다섯 공통 초승달(crescent.ts) + 본보기 불새 — 달 기하 · 바뀌는 박자 · 조각 상한.
// ⚠ legend5는 bladeFx와 순환 import — bladeFx를 먼저 들인다
import { beforeEach, describe, expect, it } from 'vitest';
import { RECIPES, pool, resetBladeFx, updateBladeFx, weaponAlong, weaponBloom } from '../src/render/bladeFx';
import { liveBits } from '../src/render/weaponFx';
import { WEAPON_INK, WEAPON_LITE } from '../src/config';
import { greatArcPoint } from '../src/render/sprites';
import { moonAt, moonPoint, moonPts, moonsFor, swingMoon } from '../src/render/legend5/crescent';

const c = WEAPON_INK.phoenix;
const alive = (): number => pool.filter((p) => p.alive).length;
const step = (n: number): void => { for (let i = 0; i < n; i++) updateBladeFx(1 / 60); };

beforeEach(() => resetBladeFx());

describe('공통 초승달 기하', () => {
  it('moonAt — 친 자리가 호 한가운데, 양 끝은 반지름 위', () => {
    const m = moonAt(100, 200, 40, -Math.PI / 2, 2.4, 1);
    const [x, y] = moonPoint(m, 0.5);
    expect(x).toBeCloseTo(100);
    expect(y).toBeCloseTo(200);
    for (const u of [0, 1]) {
      const [px, py] = moonPoint(m, u);
      expect(Math.hypot(px - m.cx, py - m.cy)).toBeCloseTo(40);
    }
    expect(moonPts(m, 12)).toHaveLength(24);
  });

  it('swingMoon — 참격 호의 시작(꼬리) · 칼끝(앞날)을 지난다', () => {
    const m = swingMoon(200, 600);
    const [ax, ay] = greatArcPoint(1);
    const [cx, cy] = greatArcPoint(0);
    const [t0x, t0y] = moonPoint(m, 0);
    const [t1x, t1y] = moonPoint(m, 1);
    expect(Math.hypot(t0x - (200 + ax), t0y - (600 + ay))).toBeLessThan(0.5);
    expect(Math.hypot(t1x - (200 + cx), t1y - (600 + cy))).toBeLessThan(0.5);
  });

  it('완파는 두 겹 — 뒤(위쪽으로 볼록) · 앞(아래쪽으로 볼록) 납작한 반 타원', () => {
    const [back, front] = moonsFor('destroy', 300, 400, 1);
    expect(moonPoint(back, 0.5)[1]).toBeLessThan(400);
    expect(moonPoint(front, 0.5)[1]).toBeGreaterThan(400);
    expect(back.f).toBeLessThan(1);
    expect(front.f).toBeLessThan(1);
  });
});

describe('불새 — 달 → 불 날개 → 불티', () => {
  it('타격: 즉시는 달 둘(몸 + 달군 앞날), 2~3프레임 뒤 날개가 붙고, 2초 뒤 0', () => {
    RECIPES.wing.hit(300, 400, 1, c);
    expect(alive()).toBe(2);
    expect(pool.filter((p) => p.alive).map((p) => p.c1).sort()).toEqual([c, WEAPON_LITE.phoenix].sort());
    step(2);
    expect(alive()).toBe(2); // 0.033초 — 아직 달만
    step(2);
    expect(alive()).toBeGreaterThan(2); // 0.067초 — 날개가 솟기 시작
    step(125);
    expect(liveBits()).toHaveLength(0);
  });

  it('필살 along · bloom — 상한(24 · 48) 안 · 전부 keep · 2초 뒤 0', () => {
    let born = 0;
    weaponAlong('phoenix', [0, 600, 300, 200, 700, 100], 1.3, 0.35);
    for (let i = 0; i < 130; i++) {
      born = Math.max(born, alive());
      expect(liveBits().every((p) => p.keep)).toBe(true);
      updateBladeFx(1 / 60);
    }
    expect(born).toBeGreaterThan(3);
    expect(born).toBeLessThanOrEqual(24);
    expect(liveBits()).toHaveLength(0);
    weaponBloom('phoenix', 300, 300, -Math.PI / 2, 1.4);
    let peak = 0;
    for (let i = 0; i < 130; i++) { peak = Math.max(peak, alive()); updateBladeFx(1 / 60); }
    expect(peak).toBeGreaterThan(5);
    expect(peak).toBeLessThanOrEqual(48);
    expect(liveBits()).toHaveLength(0);
  });
});
