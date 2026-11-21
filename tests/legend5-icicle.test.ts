// 고드름 대검 4판 — 왼쪽 위(건물 쪽)로 기운 각진 결정 덩이(곧게 좁아지는 쐐기 + 밝은 면 = 능선)가 박힘 → 얼어 멈춤(움직임 0) → 쩍(먹 금) →
// 크기 1:10 세모 조각이 왼쪽 부채로 돌며 떨어진다. 크기 순서 · 화면 차지 · 주인공 몸 · 콤보 도장 비움 · 달(sweep) 없음 · 필살 상한.
// ⚠ legend5는 bladeFx와 순환 import — bladeFx를 먼저 들인다
import { beforeEach, describe, expect, it } from 'vitest';
import { RECIPES, pool, resetBladeFx, scaled, updateBladeFx, weaponAlong, weaponBloom, type Bit } from '../src/render/bladeFx';
import { COMBO_MARK, VIEW, WEAPON_FX, WEAPON_INK, WEAPON_LITE } from '../src/config';

const c = WEAPON_INK.icicle;
const R = RECIPES.icicle;
const alive = (): Bit[] => pool.filter((p) => p.alive);
const step = (n: number): void => { for (let i = 0; i < n; i++) updateBladeFx(1 / 60); };
const strokes = (): Bit[] => alive().filter((p) => p.k === 'stroke');
const tip = (p: Bit): [number, number] => [p.x + Math.cos(p.rot) * p.size, p.y + Math.sin(p.rot) * p.size];
/** 태어난 수 — 즉시 + later 합(waza-api 시험과 같은 셈) */
function births(f: () => void, frames = 130): number {
  resetBladeFx();
  const seen = new Map<Bit, number>();
  const count = (): number => {
    let n = 0;
    for (const p of pool) {
      if (!p.alive) { seen.delete(p); continue; }
      if (seen.get(p) !== p.seed) { n++; seen.set(p, p.seed); }
    }
    return n;
  };
  f();
  let n = count();
  for (let i = 0; i < frames; i++) { updateBladeFx(1 / 60); n += count(); }
  return n;
}

beforeEach(() => resetBladeFx());

describe('고드름 — 각진 결정 덩이 → 얼어 멈춤 → 쩍 → 왼쪽 부채 조각', () => {
  it('타격: 결정이 3프레임 안에 다 박히고(왼쪽 위로 기운 쐐기 + 밝은 면) 멈춰 섰다가 먹 금 + 크기 제각각 세모 조각이 왼쪽으로 돌며 떨어진다', () => {
    R.hit(300, 400, 1, c);
    step(3);
    const xs = strokes();
    expect(xs.length).toBeGreaterThanOrEqual(6);
    expect(xs.every((p) => p.vx === 0 && p.vy === 0 && p.pr === 1)).toBe(true); // 움직임 0 · 튕김 누름(뿌리 두껍고 곧게 좁아짐)
    const main = xs.reduce((a, b) => (b.size > a.size ? b : a));
    expect(Math.sin(main.rot)).toBeLessThan(-0.7); // 위로
    expect(Math.cos(main.rot)).toBeLessThan(-0.35); // 왼쪽으로 기운다(서리의 수직 가시와 갈린다)
    expect(xs.filter((p) => Math.cos(p.rot) < 0).length).toBeGreaterThan(xs.length / 2);
    expect(xs.some((p) => p.c1 === WEAPON_LITE.icicle)).toBe(true); // 밝은 면 — 능선이 선다
    expect(xs.some((p) => p.c1 === c)).toBe(true);
    const at = xs.map((p) => [p.x, p.y, p.size, p.rot]);
    step(2);
    expect(alive().some((p) => p.k === 'leaf' || p.k === 'zig')).toBe(false); // 얼어 멈춤 — 아직 쩍 전
    expect(xs.map((p) => [p.x, p.y, p.size, p.rot])).toEqual(at);
    step(3);
    expect(alive().some((p) => p.k === 'zig')).toBe(true); // 쩍 — 먹 금
    const leaf = alive().filter((p) => p.k === 'leaf');
    expect(leaf.length).toBe(8);
    expect(leaf.every((p) => p.st === 3 && p.spin !== 0 && p.vx < 0)).toBe(true); // 세모 · 돌며 · 왼쪽 부채
    const sz = leaf.map((p) => p.size);
    expect(Math.max(...sz) / Math.min(...sz)).toBeGreaterThan(4); // 큰 조각 몇 + 가루
    step(40);
    expect(alive().filter((p) => p.k === 'leaf').every((p) => p.vy > 0)).toBe(true); // 아래로
    step(120);
    expect(alive()).toHaveLength(0);
  });

  it('크기 순서 whiff < hit < floor < destroy · 어느 사건도 달(sweep)을 긋지 않는다 · 완파 조각 40 안', () => {
    const longest = (f: () => void): number => {
      resetBladeFx();
      f();
      step(4);
      expect(alive().some((p) => p.k === 'sweep')).toBe(false);
      return Math.max(...strokes().map((p) => p.size));
    };
    const w = longest(() => R.whiff?.(300, 400, c));
    const h = longest(() => R.hit(300, 400, 1, c));
    const f = longest(() => R.floor(300, 400, 1, c));
    const d = longest(() => R.destroy(300, 400, 1.25, c));
    expect(w).toBeLessThan(h);
    expect(h).toBeLessThan(f);
    expect(f).toBeLessThan(d);
    expect(births(() => R.destroy(300, 500, 1.8, c))).toBeLessThanOrEqual(40);
    expect(births(() => R.swing?.(180, 610, 15, 0.26, c, 0, 1.25))).toBeLessThanOrEqual(6);
  });

  it('폰 화면: 완파는 높이 200~340 · 폭 360 안, 결정이 주인공 몸(발 위 0~60 · 좌우 ±18)을 덮지 않는다 · 타격 조각은 콤보 도장 자리에 안 간다', () => {
    const X = VIEW.LANE_X[0];
    const foot = VIEW.GROUND_Y;
    const body = (x: number, y: number): boolean => Math.abs(x - X) < 18 && y > foot - 60 && y < foot;
    scaled(X, foot - 70, WEAPON_FX.SIZE, () => R.destroy(X, foot - 70, 1.25, c));
    step(4);
    const ends = strokes().flatMap((p) => [[p.x, p.y], tip(p), [(p.x + tip(p)[0]) / 2, (p.y + tip(p)[1]) / 2]]);
    const ys = ends.map(([, y]) => y);
    const xs = ends.map(([x]) => x);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(200);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(340);
    expect(Math.min(...xs)).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThan(VIEW.W);
    expect(ends.some(([x, y]) => body(x, y))).toBe(false);
    // 타격 — 건물 밑변 550 위 24에서. 콤보 도장 = 레인 + DX, 밑변 + DY 둘레
    resetBladeFx();
    const hy = 550 - 24;
    const stamp = (x: number, y: number): boolean => Math.abs(x - (X + COMBO_MARK.DX)) < 40 && Math.abs(y - (550 + COMBO_MARK.DY)) < 40;
    scaled(X, hy, WEAPON_FX.SIZE, () => R.hit(X, hy, 1, c));
    for (let i = 0; i < 150; i++) {
      step(1);
      expect(alive().some((p) => stamp(p.x, p.y)), `${i}`).toBe(false);
      expect(strokes().some((p) => body(p.x, p.y) || body(...tip(p)))).toBe(false);
    }
  });

  it('칼 기운: 칼끝 결정이 다섯 번에 걸쳐 자라고(한 번에 획 다섯 안) 다섯째에 조각 하나가 떨어져 나간다', () => {
    const b = [180, 560, 205, 606] as const; // 서 있을 때 — 손에서 땅 쪽 칼끝으로
    const grow: number[] = [];
    for (let n = 0; n < 5; n++) {
      resetBladeFx();
      R.aura?.(b, n, c);
      expect(strokes().length).toBeLessThanOrEqual(5);
      expect(alive().some((p) => p.k === 'leaf')).toBe(n === 4);
      expect(strokes().every((p) => Math.sin(p.rot) < 0)).toBe(true); // 땅 밑이 아니라 위로 솟는다
      grow.push(Math.max(...strokes().map((p) => p.size)));
    }
    expect(grow).toEqual([...grow].sort((x, y) => x - y));
    expect(grow[4] / grow[0]).toBeGreaterThan(1.8);
  });

  it('필살 along · bloom — 태어남 상한(24 · 48) 안 · 전부 keep · 2초 뒤 0', () => {
    for (const path of [[0, 600, 300, 200, 700, 100], [100, 700, 500, 100, 900, 300, 100, 500], [200, 400, 260, 400]]) {
      expect(births(() => weaponAlong('icicle', path, 1, 0.35))).toBeLessThanOrEqual(24);
      expect(alive()).toHaveLength(0);
    }
    resetBladeFx();
    weaponAlong('icicle', [0, 600, 300, 200, 700, 100], 1.3, 0.35);
    let born = 0;
    for (let i = 0; i < 130; i++) {
      born = Math.max(born, alive().length);
      expect(alive().every((p) => p.keep)).toBe(true);
      updateBladeFx(1 / 60);
    }
    expect(born).toBeGreaterThan(3);
    for (const k of [1, 1.4]) {
      const n = births(() => weaponBloom('icicle', 300, 300, -Math.PI / 2, k));
      expect(n).toBeGreaterThan(5);
      expect(n).toBeLessThanOrEqual(48);
      expect(alive()).toHaveLength(0);
    }
  });
});
