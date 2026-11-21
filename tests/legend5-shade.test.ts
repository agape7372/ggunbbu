// 그림자 대검 5판 — 바닥 촉수 무리: 땅 웅덩이(화면 폭 8할 넘게)에서 S자로 굽고 끝이 말린 촉수가 양쪽으로 기울어 솟는다 ·
// 가닥마다 먹 뿌리(아래 붓) → 보라 꼬리(위 붓, 땅에서 떨어진 자리부터) · 크기 순서 헛스윙 < 타격 < 층 깨기 < 완파 ·
// 몸 상자 · 콤보 도장 자리 비움 · 사건 조각 40 안 · 달(sweep) 없음 · 칼 기운 꼬리는 칼끝 너머로 · 필살 상한 · keep.
// ⚠ legend5는 bladeFx와 순환 import — bladeFx를 먼저 들인다
import { beforeEach, describe, expect, it } from 'vitest';
import { RECIPES, pool, resetBladeFx, scaled, updateBladeFx, weaponAlong, weaponBloom } from '../src/render/bladeFx';
import { liveBits } from '../src/render/weaponFx';
import { PALETTE, VIEW, WEAPON_FX, WEAPON_INK, WEAPON_LITE } from '../src/config';

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
/** 꺾은선이 굽는 쪽이 몇 번 바뀌나(세 점마다 외적 부호) — 0이면 한쪽으로만 휜 활, 1 넘으면 S자 */
const flips = (p: Bit): number => {
  let n = 0;
  let last = 0;
  for (let i = 4; i < p.pts.length; i += 2) {
    const [ax, ay, bx, by] = [p.pts[i - 2] - p.pts[i - 4], p.pts[i - 1] - p.pts[i - 3], p.pts[i] - p.pts[i - 2], p.pts[i + 1] - p.pts[i - 1]];
    const s = Math.sign(ax * by - ay * bx);
    if (s && last && s !== last) n++;
    if (s) last = s;
  }
  return n;
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
  it('완파: 촉수가 4프레임 남짓에 다 솟고, 웅덩이가 화면 폭 8할 넘게 · 촉수 키 주인공 2.5배 넘게, 조각 40 안 · 달 없음 · 끝나면 0', () => {
    fire.destroy();
    step(6);
    expect(alive().filter((p) => p.k === 'zig' && p.c1 === PALETTE.INK).length).toBeGreaterThanOrEqual(8); // 촉수 아홉 + 바닥 쓸기의 먹 붓
    resetBladeFx();
    fire.destroy();
    const zx: number[] = [];
    const sx: number[] = [];
    let top: number = FOOT;
    const peak = run((bits) => {
      expect(bits.some((p) => p.k === 'sweep')).toBe(false); // 공통 초승달 · 고리 없음
      for (const p of bits) {
        if (p.k === 'zig') for (const [x, y] of ptsOf(p)) { zx.push(x); top = Math.min(top, y); }
        if (p.k === 'stroke') for (const [x] of ptsOf(p)) sx.push(x);
      }
    });
    expect(Math.max(...sx) - Math.min(...sx)).toBeGreaterThan(VIEW.W * 0.8); // 웅덩이
    expect(Math.max(...zx) - Math.min(...zx)).toBeGreaterThan(VIEW.W * 0.8); // 촉수 무리
    expect(FOOT - top).toBeGreaterThan(140);
    expect(peak).toBeLessThanOrEqual(40);
    expect(liveBits()).toHaveLength(0);
  });

  it('촉수 꼴: 먹 붓마다 S자(굽는 쪽이 바뀐다) · 양쪽으로 기운 가닥이 다 있다 · 뿌리가 굵다(화면 12px 넘게)', () => {
    for (let n = 0; n < 6; n++) {
      resetBladeFx();
      fire.destroy();
      step(8);
      const ink = alive().filter((p) => p.k === 'zig' && p.c1 === PALETTE.INK && p.pts.length >= 16);
      expect(ink.length).toBeGreaterThanOrEqual(7);
      expect(ink.every((p) => flips(p) >= 1)).toBe(true);
      const lean = ink.map((p) => p.pts[p.pts.length - 2] - p.pts[0]);
      expect(lean.filter((d) => d > 4).length).toBeGreaterThanOrEqual(2);
      expect(lean.filter((d) => d < -4).length).toBeGreaterThanOrEqual(2);
      expect(Math.max(...ink.map((p) => p.v))).toBeGreaterThan(12);
    }
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

  it('색: 먹 붓은 땅에서, 보라 붓은 땅에서 떨어진 자리(가닥 위쪽)부터 · 웅덩이는 먹 · 갈래는 밝은 짝 · 점과 조각은 위로', () => {
    for (let n = 0; n < 6; n++) {
      resetBladeFx();
      fire.destroy();
      step(10);
      const bits = alive();
      const zigs = bits.filter((p) => p.k === 'zig');
      const ink = zigs.filter((p) => p.c1 === PALETTE.INK);
      const hue = zigs.filter((p) => p.c1 === c);
      expect(hue.length).toBeGreaterThanOrEqual(6);
      expect(ink.every((p) => p.y > FOOT - 22)).toBe(true);
      expect(hue.every((p) => p.y < FOOT - 10)).toBe(true);
      expect(zigs.every((p) => p.c1 === PALETTE.INK || p.c1 === c || p.c1 === WEAPON_LITE.shade)).toBe(true);
      expect(bits.filter((p) => p.k === 'stroke' || p.k === 'spat').every((p) => p.c1 === PALETTE.INK)).toBe(true);
      expect(bits.filter((p) => p.k === 'drop' || p.k === 'leaf').every((p) => p.vy < 0)).toBe(true);
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

  it('칼길 · 칼 기운도 달 없이 꺾은 획 — 칼 기운은 먹 붓이 칼을 감고, 보라 꼬리가 칼끝 너머로 칼 길이 넘게 나간다', () => {
    r.swing?.(180, 610, 12, 0.26, c, 0, 1);
    for (let n = 0; n < 8; n++) r.aura?.([170, 560, 200, 520], n, c);
    const peak = run((bits) => expect(bits.some((p) => p.k === 'sweep')).toBe(false));
    expect(peak).toBeGreaterThan(4);
    resetBladeFx();
    r.aura?.([170, 560, 200, 520], 0, c);
    step(8);
    const wrap = alive().find((p) => p.k === 'zig' && p.c1 === PALETTE.INK);
    const tail = alive().find((p) => p.k === 'zig' && p.c1 === c);
    expect(wrap).toBeDefined();
    expect(tail).toBeDefined();
    const far = (p: Bit): number => Math.max(...ptsOf(p).map(([x, y]) => Math.hypot(x - 170, y - 560)));
    expect(far(wrap as Bit)).toBeLessThan(50 * 1.35);
    expect(far(tail as Bit)).toBeGreaterThan(50 * 1.3);
    expect(far(tail as Bit)).toBeLessThan(50 * 2.8);
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
