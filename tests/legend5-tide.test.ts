// 해일 대검 3판 — 땅에서 앞으로 말리는 파도 하나(둥근 갈고리) · 일어남 → 무너짐 → 물방울 박자 · 조각 상한 · 소멸.
// ⚠ legend5는 bladeFx와 순환 import — bladeFx를 먼저 들인다
import { beforeEach, describe, expect, it } from 'vitest';
import { RECIPES, pool, resetBladeFx, scaled, updateBladeFx, weaponAlong, weaponBloom } from '../src/render/bladeFx';
import { liveBits } from '../src/render/weaponFx';
import { PALETTE, VIEW, WEAPON_FX, WEAPON_INK, WEAPON_LITE } from '../src/config';

const c = WEAPON_INK.tide;
const alive = (): number => pool.filter((p) => p.alive).length;
const step = (n: number): void => { for (let i = 0; i < n; i++) updateBladeFx(1 / 60); };
/** 물 몸(시그니처 색 꺾은 획)의 월드 점들 */
const bodyPts = (): [number, number][] => {
  const p = pool.find((q) => q.alive && q.k === 'zig' && q.c1 === c);
  if (!p) return [];
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < p.pts.length; i += 2) out.push([p.x + p.pts[i], p.y + p.pts[i + 1]]);
  return out;
};

beforeEach(() => resetBladeFx());

describe('해일 — 말리는 파도 하나', () => {
  it('타격: 즉시는 물 몸 하나(달 · 호 조각 없음) · 몸은 마루 하나에 앞으로 감긴 갈고리 · 무너짐은 거품 속 · 2초 뒤 0', () => {
    RECIPES.surf.hit(180, 400, 1, c);
    expect(alive()).toBe(1);
    expect(pool.some((p) => p.alive && p.k === 'sweep')).toBe(false); // 공통 초승달(sweep) 없음
    const pts = bodyPts();
    expect(pts.length).toBeGreaterThan(15); // 굽은 몸(마디 여럿)
    // 마루는 하나 — 꼭대기(가장 높은 점)까지 오르기만 하고, 톱니(오르내림 반복)가 없다
    const top = pts.reduce((m, q, i) => (q[1] < pts[m][1] ? i : m), 0);
    for (let i = 1; i <= top; i++) expect(pts[i][1]).toBeLessThanOrEqual(pts[i - 1][1] + 0.01);
    // 갈고리 — 감긴 끝은 꼭대기보다 낮고, 가장 앞 점보다 뒤로 말려 들어왔다
    const end = pts[pts.length - 1];
    expect(end[1]).toBeGreaterThan(pts[top][1] + 5);
    expect(end[0]).toBeLessThan(Math.max(...pts.map((q) => q[0])) - 3);
    step(5); // 4프레임 뒤 — 거품 줄 · 갈퀴 · 무너짐(밝은 짝 몸 + 종이빛 속)
    const foam = pool.filter((p) => p.alive && p.k === 'zig' && p.c2 === PALETTE.BG);
    expect(foam.length).toBeGreaterThanOrEqual(2);
    expect(foam.every((p) => p.c1 === WEAPON_LITE.tide)).toBe(true);
    step(125);
    expect(liveBits()).toHaveLength(0);
  });

  it('완파: 몸은 땅에서 솟고 굵은 마루는 주인공 둘레(±22px) 앞 바깥 · 땅 밑 없음 · 조각 상한 안 · 2초 뒤 0', () => {
    const [x, y] = [180, VIEW.GROUND_Y - 70];
    scaled(x, y, WEAPON_FX.SIZE, () => RECIPES.surf.destroy(x, y, 1.25, c));
    const pts = bodyPts();
    expect(pts[0][1]).toBeGreaterThan(VIEW.GROUND_Y - 6); // 등 머리 = 발 높이
    const top = pts.reduce((m, q) => (q[1] < m[1] ? q : m));
    expect(top[0]).toBeGreaterThan(x + 22); // 마루는 앞쪽 바깥
    expect(VIEW.GROUND_Y - top[1]).toBeGreaterThan(70); // 주인공보다 높이 솟는다(가로 띠가 아니다)
    let peak = 0;
    for (let i = 0; i < 130; i++) {
      peak = Math.max(peak, alive());
      expect(pool.every((p) => !p.alive || p.y <= VIEW.GROUND_Y)).toBe(true);
      expect(pool.some((p) => p.alive && p.k === 'sweep')).toBe(false);
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
