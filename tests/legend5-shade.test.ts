// 그림자 대검 4판 — 바닥 촉수 무리: 땅 웅덩이에서 키 제각각 촉수가 솟아 한쪽으로 휘고 끝이 갈라진다 · 보라는 끝 갈래 · 점 몇 곳 ·
// 크기 순서 헛스윙 < 타격 < 층 깨기 < 완파 · 몸 상자 · 콤보 도장 자리 비움 · 사건 조각 40 안 · 달(sweep) 없음 · 필살 상한 · keep.
// ⚠ legend5는 bladeFx와 순환 import — bladeFx를 먼저 들인다
import { beforeEach, describe, expect, it } from 'vitest';
import { RECIPES, pool, resetBladeFx, scaled, updateBladeFx, weaponAlong, weaponBloom } from '../src/render/bladeFx';
import { liveBits } from '../src/render/weaponFx';
import { PALETTE, VIEW, WEAPON_FX, WEAPON_INK } from '../src/config';

const c = WEAPON_INK.shade;
const r = RECIPES.smoke;
type Bit = (typeof pool)[number];
const alive = (): Bit[] => pool.filter((p) => p.alive);
const step = (n: number): void => { for (let i = 0; i < n; i++) updateBladeFx(1 / 60); };
/** 조각이 지나는 자리들(월드) — 꺾은 획은 점 전부, 곧은 획은 양 끝, 나머지는 제자리 */
const ptsOf = (p: Bit): [number, number][] => {
  if (p.k === 'zig') return Array.from({ length: p.pts.length / 2 }, (_, i) => [p.pts[i * 2] + p.x, p.pts[i * 2 + 1] + p.y]);
  if (p.k === 'stroke') return [[p.x, p.y], [p.x + Math.cos(p.rot) * p.size, p.y + Math.sin(p.rot) * p.size]];
  return [[p.x, p.y]];
};
const zigLen = (p: Bit): number => {
  let L = 0;
  for (let i = 2; i < p.pts.length; i += 2) L += Math.hypot(p.pts[i] - p.pts[i - 2], p.pts[i + 1] - p.pts[i - 1]);
  return L;
};
/** 한 사건을 끝까지 돌리며 — 매 프레임 f(살아 있는 조각) · 가장 많이 산 수를 돌려준다 */
const run = (f: (bits: Bit[]) => void = () => {}): number => {
  let peak = 0;
  for (let i = 0; i < 160; i++) {
    const a = alive();
    peak = Math.max(peak, a.length);
    f(a);
    updateBladeFx(1 / 60);
  }
  return peak;
};
/** 사건 그림 크기 — 획(꺾은 · 곧은)이 지난 자리의 가로 · 세로 폭 */
const extent = (fire: () => void): [number, number] => {
  resetBladeFx();
  fire();
  const xs: number[] = [];
  const ys: number[] = [];
  run((bits) => bits.filter((p) => p.k === 'zig' || p.k === 'stroke').forEach((p) => ptsOf(p).forEach(([x, y]) => { xs.push(x); ys.push(y); })));
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
};
const FOOT = VIEW.GROUND_Y;
/** 실제 판처럼 — 친 자리를 축으로 WEAPON_FX.SIZE배. 서 있는 졸라맨 발이 땅(610)이 되는 친 자리 */
const fire = {
  hit: () => scaled(180, FOOT - 52 * WEAPON_FX.SIZE, WEAPON_FX.SIZE, () => r.hit(180, FOOT - 52 * WEAPON_FX.SIZE, 1, c)),
  floor: () => scaled(180, FOOT - 38 * WEAPON_FX.SIZE, WEAPON_FX.SIZE, () => r.floor(180, FOOT - 38 * WEAPON_FX.SIZE, 1, c)),
  destroy: () => scaled(180, FOOT - 44 * WEAPON_FX.SIZE, WEAPON_FX.SIZE, () => r.destroy(180, FOOT - 44 * WEAPON_FX.SIZE, 1.25, c)),
};

beforeEach(() => resetBladeFx());

describe('그림자 — 바닥 촉수 무리', () => {
  it('완파: 촉수가 4프레임 안에 어긋나게 다 솟고, 화면 폭 60% 넘게 · 촉수 키 주인공 2배 넘게, 조각 40 안 · 달 없음 · 2.5초 뒤 0', () => {
    fire.destroy();
    step(5);
    expect(alive().filter((p) => p.k === 'zig').length).toBeGreaterThanOrEqual(10); // 촉수 아홉 + 큰 가닥 · 바닥 쓸기
    resetBladeFx();
    fire.destroy();
    const xs: number[] = [];
    let top: number = FOOT;
    const peak = run((bits) => {
      expect(bits.some((p) => p.k === 'sweep')).toBe(false); // 공통 초승달 · 고리 없음
      for (const p of bits.filter((q) => q.k === 'zig')) for (const [x, y] of ptsOf(p)) { xs.push(x); top = Math.min(top, y); }
    });
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(VIEW.W * 0.6);
    expect(FOOT - top).toBeGreaterThan(110);
    expect(peak).toBeLessThanOrEqual(40);
    expect(liveBits()).toHaveLength(0);
  });

  it('몸 상자(발 위 0~60 · 좌우 ±18)와 오른쪽 아래 콤보 도장 자리는 비운다 — 여러 판', () => {
    const body = (x: number, y: number): boolean => Math.abs(x - 180) < 18 && y < FOOT - 6 && y > FOOT - 60;
    const stamp = (x: number, y: number): boolean => x > 248 && x < 330 && y < FOOT - 6 && y > FOOT - 100;
    // 점마다 expect를 부르면 전체 실행에서 5초를 넘긴다 — 걸린 자리만 모아 끝에 한 번 견준다
    const bad: string[] = [];
    for (const ev of ['hit', 'floor', 'destroy'] as const) {
      for (let n = 0; n < 10; n++) {
        resetBladeFx();
        fire[ev]();
        run((bits) => {
          for (const p of bits) {
            for (const [x, y] of ptsOf(p)) {
              if (body(x, y)) bad.push(`${ev} ${p.k} 몸 (${x | 0}, ${y | 0})`);
              if (stamp(x, y)) bad.push(`${ev} ${p.k} 도장 (${x | 0}, ${y | 0})`);
            }
          }
        });
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('보라는 끝 갈래(짧은 가닥) · 점 · 조각 몇 곳에만 — 웅덩이 · 본 촉수는 먹', () => {
    for (let n = 0; n < 6; n++) {
      resetBladeFx();
      fire.destroy();
      step(14);
      const bits = alive();
      const zigs = bits.filter((p) => p.k === 'zig');
      const longest = Math.max(...zigs.map(zigLen));
      const hued = bits.filter((p) => p.c1 === c);
      expect(hued.length).toBeGreaterThanOrEqual(3);
      expect(hued.length).toBeLessThanOrEqual(9);
      expect(hued.filter((p) => p.k === 'zig').every((p) => zigLen(p) < longest * 0.5)).toBe(true);
      expect(bits.filter((p) => p.k === 'stroke' || p.k === 'spat').every((p) => p.c1 === PALETTE.INK)).toBe(true);
      expect(bits.filter((p) => p.k === 'drop' || p.k === 'leaf').every((p) => p.vy < 0)).toBe(true); // 점 · 조각은 위로
    }
  });

  it('크기 순서 헛스윙 < 타격 < 층 깨기 < 완파(가로 · 세로 모두)', () => {
    const avg = (f: () => void): [number, number] => {
      const e = [0, 1, 2, 3].map(() => extent(f));
      return [e.reduce((a, q) => a + q[0], 0) / 4, e.reduce((a, q) => a + q[1], 0) / 4];
    };
    const w = avg(() => r.whiff?.(180, 400, c));
    const h = avg(() => r.hit(180, 400, 1, c));
    const f = avg(() => r.floor(180, 400, 1, c));
    const d = avg(() => r.destroy(180, 400, 1.25, c));
    expect(w[0]).toBeLessThan(h[0]);
    expect(h[0]).toBeLessThan(f[0]);
    expect(f[0]).toBeLessThan(d[0]);
    expect(w[1]).toBeLessThan(h[1]);
    expect(h[1]).toBeLessThan(f[1]);
    expect(f[1]).toBeLessThan(d[1]);
  });

  it('칼길 · 칼 기운도 달 없이 꺾은 획 — 칼 기운은 칼날 둘레를 크게 벗어나지 않는다', () => {
    r.swing?.(180, 610, 12, 0.26, c, 0, 1);
    for (let n = 0; n < 8; n++) r.aura?.([170, 560, 200, 520], n, c);
    const peak = run((bits) => expect(bits.some((p) => p.k === 'sweep')).toBe(false));
    expect(peak).toBeGreaterThan(4);
    resetBladeFx();
    r.aura?.([170, 560, 200, 520], 0, c);
    const tendril = alive().find((p) => p.k === 'zig');
    expect(tendril).toBeDefined();
    expect(ptsOf(tendril as Bit).every(([x, y]) => x > 155 && x < 215 && y > 505 && y < 575)).toBe(true);
  });

  it('필살 along · bloom — 상한(24 · 48) 안 · 전부 keep · 2.2초 뒤 0. 공중 마무리엔 웅덩이가 없다', () => {
    weaponAlong('shade', [0, 600, 300, 200, 700, 100], 1.3, 0.35);
    let born = 0;
    for (let i = 0; i < 130; i++) {
      born = Math.max(born, alive().length);
      expect(liveBits().every((p) => p.keep)).toBe(true);
      updateBladeFx(1 / 60);
    }
    expect(born).toBeGreaterThan(3);
    expect(born).toBeLessThanOrEqual(24);
    expect(liveBits()).toHaveLength(0);
    weaponBloom('shade', 300, 300, -Math.PI / 2, 1.4); // 공중
    let peak = 0;
    let puddle = false;
    for (let i = 0; i < 130; i++) {
      peak = Math.max(peak, alive().length);
      puddle ||= alive().some((p) => p.k === 'stroke');
      updateBladeFx(1 / 60);
    }
    expect(puddle).toBe(false);
    expect(peak).toBeGreaterThan(5);
    expect(peak).toBeLessThanOrEqual(48);
    expect(liveBits()).toHaveLength(0);
    weaponBloom('shade', 180, FOOT - 2, -Math.PI / 2, 1); // 땅 — 웅덩이
    step(3);
    expect(alive().some((p) => p.k === 'stroke')).toBe(true);
  });
});
