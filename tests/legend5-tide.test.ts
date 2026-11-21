// 해일 대검 4판 — 왼쪽 땅에서 솟아 오른쪽 위로 말리는 갈퀴 마루(등 · 말림 통 · 결 줄 · 갈퀴 손가락 · 물방울 덩이 3단) ·
// 칼길 = 꼬이는 물 띠 셋 · 크기 순서 · 주인공 몸 상자와 「콤보」 도장 자리 비움 · 조각 상한 · 소멸.
// ⚠ legend5는 bladeFx와 순환 import — bladeFx를 먼저 들인다
import { beforeEach, describe, expect, it } from 'vitest';
import { RECIPES, pool, resetBladeFx, scaled, updateBladeFx, weaponAlong, weaponBloom } from '../src/render/bladeFx';
import { liveBits } from '../src/render/weaponFx';
import { VIEW, WEAPON_FX, WEAPON_INK, WEAPON_LITE } from '../src/config';

const c = WEAPON_INK.tide;
const G = VIEW.GROUND_Y;
const X = VIEW.LANE_X[0];
type P = { x: number; y: number; r: number };
const alive = (): number => pool.filter((p) => p.alive).length;
const step = (n: number): void => { for (let i = 0; i < n; i++) updateBladeFx(1 / 60); };
/** 살아 있는 꺾은 획의 월드 점들(반폭 r 포함) */
const strokePts = (): P[] =>
  pool.filter((p) => p.alive && p.k === 'zig').flatMap((p) => {
    const out: P[] = [];
    for (let i = 0; i + 1 < p.pts.length; i += 2) out.push({ x: p.x + p.pts[i], y: p.y + p.pts[i + 1], r: p.v / 2 });
    return out;
  });
/** 사건 하나를 2초 돌리며 획 점을 다 모은다(획은 움직인다 — 사는 내내) · 최대 조각 수 */
function run(ev: 'hit' | 'floor' | 'destroy', k: number, y: number): { pts: P[]; peak: number } {
  resetBladeFx();
  scaled(X, y, WEAPON_FX.SIZE, () => RECIPES.surf[ev](X, y, k, c));
  const pts: P[] = [];
  let peak = 0;
  for (let i = 0; i < 130; i++) {
    pts.push(...strokePts());
    peak = Math.max(peak, alive());
    updateBladeFx(1 / 60);
  }
  return { pts, peak };
}
const box = (pts: P[]): { w: number; h: number; x0: number; x1: number } => {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  return { w: x1 - x0, h: Math.max(...ys) - Math.min(...ys), x0, x1 };
};
/** 휘어 간 각의 합(라디안, 화면에서 시계 방향 +) — 말림이면 크다 */
const turning = (p: { pts: readonly number[] }): number => {
  let sum = 0;
  for (let i = 4; i + 1 < p.pts.length; i += 2) {
    const a = Math.atan2(p.pts[i - 1] - p.pts[i - 3], p.pts[i - 2] - p.pts[i - 4]);
    const b = Math.atan2(p.pts[i + 1] - p.pts[i - 1], p.pts[i] - p.pts[i - 2]);
    sum += Math.atan2(Math.sin(b - a), Math.cos(b - a));
  }
  return sum;
};

beforeEach(() => resetBladeFx());

describe('해일 — 갈퀴 마루', () => {
  it('완파: 등 머리는 왼쪽 땅 · 말림은 가는 두 가닥 · 갈퀴 손가락은 +6에 이미 섰다 · 물방울 덩이 크기 3단 · 공통 달(sweep) 없음', () => {
    const y = G - 70;
    scaled(X, y, WEAPON_FX.SIZE, () => RECIPES.surf.destroy(X, y, 1.25, c));
    step(6); // 말리는 때 — r6은 갈퀴가 +10~16에야 보였다
    const lite = pool.filter((p) => p.alive && p.k === 'zig' && p.c1 === WEAPON_LITE.tide);
    expect(lite.length).toBeGreaterThanOrEqual(5); // 갈퀴 손가락(밝은 짝)
    expect(lite.filter((p) => (1 - p.life / p.max) / p.gr >= 0.5).length, '+6에 반 넘게 그어진 갈퀴').toBeGreaterThanOrEqual(4);
    step(8); // 솟음 + 말림 + 갈퀴(키운 그림 1.2배)
    const zig = pool.filter((p) => p.alive && p.k === 'zig');
    expect(zig.some((p) => p.c1 === c && p.y > G - 6 && p.x < X - 70)).toBe(true); // 큰 마루 밑동 = 왼쪽 땅
    // 말림 = 몸 굵기 절반 아래 가닥 둘 넘게가 각각 0.8π 넘게 감긴다. 몸 말고 몸의 3분의 2 넘게 굵은 먹 획은 없다(r6 굵은 먹 통 = 0.9)
    const body = Math.max(...zig.filter((p) => p.c1 === c).map((p) => p.v));
    expect(zig.filter((p) => p.c1 === c && p.v <= body * 0.5 && turning(p) > Math.PI * 0.8).length).toBeGreaterThanOrEqual(2);
    expect(zig.filter((p) => p.c1 === c && p.v < body && p.v > body * 0.66)).toHaveLength(0);
    expect(pool.some((p) => p.alive && p.k === 'sweep')).toBe(false);
    step(10);
    const sizes = pool.filter((p) => p.alive && p.k === 'drop').map((p) => p.size);
    expect(sizes.length).toBeGreaterThanOrEqual(10);
    expect(Math.max(...sizes) / Math.min(...sizes)).toBeGreaterThan(2.2); // 큰 것 · 중간 · 가루
  });

  it('크기: 헛스윙 < 타격 < 층 깨기 < 완파 · 완파는 화면 폭 6~9할 · 높이는 주인공 키 3배 넘게 · 타격은 완파의 3할 넘게', () => {
    resetBladeFx();
    RECIPES.surf.whiff!(X + 30, G - 90, c);
    let whiff = 0;
    for (let i = 0; i < 40; i++) {
      const p = strokePts();
      if (p.length) whiff = Math.max(whiff, box(p).w);
      updateBladeFx(1 / 60);
    }
    const hit = box(run('hit', 1, G - 84).pts);
    const floor = box(run('floor', 1, G - 60).pts);
    const destroy = box(run('destroy', 1.25, G - 70).pts);
    expect(whiff).toBeLessThan(hit.w);
    expect(hit.w).toBeLessThan(floor.w);
    expect(floor.w).toBeLessThan(destroy.w);
    expect(destroy.w).toBeGreaterThan(VIEW.W * 0.6);
    expect(destroy.w).toBeLessThan(VIEW.W * 0.95);
    // 밑동은 화면 안(r6은 x −24에서 솟았다) — 폭 상한도 화면 안에서 잰 값
    expect(destroy.x0).toBeGreaterThanOrEqual(8);
    expect(destroy.x1).toBeLessThan(VIEW.W);
    expect(destroy.h).toBeGreaterThan(55 * 3);
    expect(hit.w).toBeGreaterThan(destroy.w * 0.3);
  });

  it('자리: 획은 주인공 몸 상자(발 위 0~60 · 좌우 ±18)와 오른쪽 아래 「콤보」 도장 자리를 밟지 않는다 · 화면 안 · 땅 밑 없음', () => {
    const hero = (p: P): boolean => Math.abs(p.x - X) < 18 + p.r && p.y > G - 60 - p.r;
    // 도장(renderer drawComboMark): 가운데 x = 레인 + 96, y ≤ 땅 − 숫자 반 − 25. 콤보 100(단 1.5)부터 세 자리 · 글자가 커져 왼쪽 · 위로 넓다
    const stamp = (k: number) => (p: P): boolean => (k >= 1.5 ? p.x > X + 42 - p.r && p.y > G - 98 - p.r : p.x > X + 60 - p.r && p.y > G - 86 - p.r);
    for (let s = 0; s < 6; s++) {
      for (const [ev, k, y] of [['floor', 1, G - 60], ['floor', 1.8, G - 60], ['destroy', 1.25, G - 70], ['destroy', 1.8, G - 70]] as const) {
        const { pts, peak } = run(ev, k, y);
        expect(pts.filter(hero), `${ev} ${k} 주인공`).toHaveLength(0);
        expect(pts.filter(stamp(k)), `${ev} ${k} 도장`).toHaveLength(0);
        expect(pts.every((p) => p.y <= G + 1 && p.x > -40 && p.x < VIEW.W + 20)).toBe(true);
        expect(peak).toBeLessThanOrEqual(40);
        expect(liveBits()).toHaveLength(0);
      }
      expect(run('hit', 1, G - 84).pts.filter(stamp(1)), '타격 도장').toHaveLength(0);
      expect(run('hit', 1.5, G - 84).pts.filter(stamp(1.5)), '타격 도장 1.5').toHaveLength(0);
    }
  });

  it('칼길: 꼬이는 물 띠 셋(굵기가 다 다르다) · 공통 달 없음 / 칼 기운: 띠 하나 · 2초 뒤 0', () => {
    RECIPES.surf.swing!(X, G, 12, 0.26, c, 0, 1);
    step(4);
    const bands = pool.filter((p) => p.alive && p.k === 'zig');
    expect(bands).toHaveLength(3);
    expect(new Set(bands.map((p) => p.v)).size).toBe(3);
    expect(pool.some((p) => p.alive && p.k === 'sweep')).toBe(false);
    step(125);
    expect(liveBits()).toHaveLength(0);
    // 칼 기운: 띠 하나가 손잡이부터 칼끝을 돌아 칼 밖 10px 넘게까지 감는다(r6 = 칼 길이 3할) · 갈고리 끝 물방울 덩이 크기 3단
    const [hx, hy, tx, ty] = [X, G - 40, X + 30, G - 6];
    const L = Math.hypot(tx - hx, ty - hy);
    RECIPES.surf.aura!([hx, hy, tx, ty], 3, c);
    const band = pool.filter((p) => p.alive && p.k === 'zig');
    expect(band).toHaveLength(1);
    const along = (i: number): number => ((band[0].x + band[0].pts[i] - hx) * (tx - hx) + (band[0].y + band[0].pts[i + 1] - hy) * (ty - hy)) / L;
    const last = band[0].pts.length - 2;
    expect(along(0)).toBeLessThan(L * 0.05);
    expect(along(last)).toBeGreaterThan(L - 2);
    expect(Math.hypot(band[0].x + band[0].pts[last] - tx, band[0].y + band[0].pts[last + 1] - ty)).toBeGreaterThan(10);
    const dr = pool.filter((p) => p.alive && p.k === 'drop').map((p) => p.size);
    expect(dr.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...dr) / Math.min(...dr)).toBeGreaterThan(1.8);
    step(125);
    expect(liveBits()).toHaveLength(0);
  });

  it('필살 along · bloom — 상한(24 · 48) 안 · 전부 keep · 땅 밑 없음 · 2초 뒤 0', () => {
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
    for (const [x, y, ang, k] of [[300, 300, -Math.PI / 2, 1.4], [180, G - 2, -Math.PI / 2, 1], [180, 300, 0, 0.5]] as const) {
      weaponBloom('tide', x, y, ang, k);
      let peak = 0;
      for (let i = 0; i < 130; i++) {
        peak = Math.max(peak, alive());
        expect(pool.every((p) => !p.alive || p.y <= G)).toBe(true);
        updateBladeFx(1 / 60);
      }
      expect(peak).toBeGreaterThan(5);
      expect(peak).toBeLessThanOrEqual(48);
      expect(liveBits()).toHaveLength(0);
    }
    // 낙관 마무리(wazaShow) = 도장 가운데 ± (구멍 59 + 30)에서 바깥으로 — 마루가 부른 자리 뒤로 30 넘게 넘어오면 「끝」을 덮는다
    for (const d of [-1, 1]) {
      for (let s = 0; s < 6; s++) {
        weaponBloom('tide', 180 + d * 89, 360, d > 0 ? 0 : Math.PI, 0.75);
        for (let i = 0; i < 130; i++) {
          expect(strokePts().filter((p) => d * (p.x - 180) - p.r < 59), `낙관 도장 ${d}`).toHaveLength(0);
          updateBladeFx(1 / 60);
        }
      }
    }
  });
});
