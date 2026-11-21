// 불새 4판 — 친 자리에서 위로 솟는 불기둥 → 비대칭 두 날개(한쪽 위로 길게 · 한쪽 옆으로 짧게) → 떨어져 나가는 불 혀 · 위로 뜨는 불티.
// 크기 순서 헛스윙 < 타격 < 층 깨기 < 완파 · 한 사건 획 40 안 · 공통 달(sweep) 없음 · 칼 기운은 콤보가 쌓이면 길어진다 · 필살 상한 · keep.
// ⚠ legend5는 bladeFx와 순환 import — bladeFx를 먼저 들인다
import { beforeEach, describe, expect, it } from 'vitest';
import { RECIPES, pool, resetBladeFx, updateBladeFx, weaponAlong, weaponBloom } from '../src/render/bladeFx';
import { liveBits } from '../src/render/weaponFx';
import { WEAPON_INK } from '../src/config';

const c = WEAPON_INK.phoenix;
const r = RECIPES.wing;
type Bit = (typeof pool)[number];
const live = (): Bit[] => pool.filter((p) => p.alive);
const step = (n: number): void => { for (let i = 0; i < n; i++) updateBladeFx(1 / 60); };
/** 조각의 점들(월드) — 획은 댄 곳 · 뗀 곳, 꺾은 획은 모든 점, 나머지는 자리 */
const pts = (p: Bit): [number, number][] => {
  if (p.k === 'stroke') return [[p.x, p.y], [p.x + Math.cos(p.rot) * p.size, p.y + Math.sin(p.rot) * p.size]];
  if (p.k === 'zig') return p.pts.reduce<[number, number][]>((a, q, i) => (i % 2 ? [...a, [p.pts[i - 1] + p.x, q + p.y]] : a), []);
  return [[p.x, p.y]];
};
/** 한 사건을 frames 동안 돌리며 — 가장 많이 살아 있던 조각 수 · 그동안 닿은 둘레 [x0, y0, x1, y1] */
function run(fire: () => void, frames = 40): { peak: number; box: [number, number, number, number] } {
  resetBladeFx();
  fire();
  let peak = 0;
  const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < frames; i++) {
    const ls = live();
    peak = Math.max(peak, ls.length);
    for (const p of ls.filter((b) => b.k === 'stroke' || b.k === 'zig')) {
      for (const [x, y] of pts(p)) {
        box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y);
        box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
      }
    }
    step(1);
  }
  return { peak, box };
}
const area = (b: readonly number[]): number => (b[2] - b[0]) * (b[3] - b[1]);

beforeEach(() => resetBladeFx());

describe('불새 — 불기둥 → 비대칭 날개 → 위로 떨어져 나가는 불', () => {
  it('타격: 첫 프레임에 불길 몸이 다 그어지고 곁 혀 셋 · 갈라진 끝 둘이 따라 서며, 뿌리는 옆으로 벌어져 있고 모든 획이 친 자리 위 · 2초 뒤 0', () => {
    r.hit(180, 500, 1, c);
    const body = live().filter((p) => p.k === 'zig');
    expect(body).toHaveLength(1); // 불길 몸이 먼저, 혀는 1~3프레임 뒤
    expect(Math.min(...pts(body[0]).map(([, y]) => y))).toBeLessThan(500 - 80); // 높이 ~0.95H
    expect(body[0].gr * body[0].max).toBeLessThanOrEqual(1 / 60 + 1e-9); // 첫 프레임에 다 그어진다 — 먹 뿌리만 덩이로 남는 프레임이 없다
    step(6);
    const zs = live().filter((p) => p.k === 'zig');
    expect(zs.length).toBeGreaterThanOrEqual(6);
    const roots = zs.map((p) => p.x); // 뿌리가 한 점에 모이면 거꾸로 매달린 다발로 읽혔다
    expect(Math.max(...roots) - Math.min(...roots)).toBeGreaterThan(25);
    for (const p of zs) for (const [, y] of pts(p)) expect(y).toBeLessThan(500);
    step(125);
    expect(liveBits()).toHaveLength(0);
  });

  it('완파: 날개는 비대칭 — 긴 쪽 끝이 짧은 쪽보다 훨씬 높고, 기둥 꼭대기는 친 자리 위 H 넘게', () => {
    r.destroy(180, 500, 1.25, c);
    step(16);
    const tips = live().filter((p) => p.k === 'stroke').map((p) => pts(p)[1]);
    const L = tips.filter(([x]) => x < 175);
    const R = tips.filter(([x]) => x > 185);
    expect(L.length).toBeGreaterThan(2);
    expect(R.length).toBeGreaterThan(2);
    const top = (a: [number, number][]): number => Math.min(...a.map(([, y]) => y));
    expect(Math.abs(top(L) - top(R))).toBeGreaterThan(30); // 한쪽은 위로 길게 · 한쪽은 옆으로 짧게
    const pillar = Math.min(...live().filter((p) => p.k === 'zig').flatMap((p) => pts(p).map(([, y]) => y)));
    expect(pillar).toBeLessThan(500 - 120);
  });

  it('완파 펼침: 깃은 한꺼번에 나오지 않는다 — 한 프레임에 새 깃 둘 이하(날개마다 하나)', () => {
    r.destroy(180, 500, 1.25, c);
    let prev = new Set<Bit>();
    for (let i = 0; i < 40; i++) {
      const now = live().filter((p) => p.k === 'stroke');
      expect(now.filter((p) => !prev.has(p)).length).toBeLessThanOrEqual(2);
      prev = new Set(now);
      step(1);
    }
  });

  it('크기 순서 헛스윙 < 타격 < 층 깨기 < 완파 · 한 사건 획 40 안 · 어느 사건도 초승달(sweep)을 긋지 않는다', () => {
    const w = run(() => r.whiff?.(180, 500, c));
    const h = run(() => r.hit(180, 500, 1, c));
    const f = run(() => r.floor(180, 500, 1, c));
    const d = run(() => r.destroy(180, 500, 1.25, c));
    expect(area(w.box)).toBeLessThan(area(h.box));
    expect(area(h.box)).toBeLessThan(area(f.box));
    expect(area(f.box)).toBeLessThan(area(d.box));
    for (const e of [w, h, f, d]) expect(e.peak).toBeLessThanOrEqual(40);
    expect(run(() => r.destroy(180, 500, 1.8, c)).peak).toBeLessThanOrEqual(40); // 콤보가 높아도 개수는 그대로
    resetBladeFx();
    r.hit(300, 400, 1, c); r.floor(300, 400, 1, c); r.destroy(300, 300, 1, c); r.whiff?.(300, 400, c);
    r.swing?.(300, 600, 12, 0.26, c, 0, 1); r.waza?.bloom(300, 300, -1, 1, c);
    for (let i = 0; i < 40; i++) {
      expect(live().some((p) => p.k === 'sweep')).toBe(false);
      step(1);
    }
  });

  it('불티 · 재는 위로 뜬다 · 칼길 불 혀는 위로 선다', () => {
    r.destroy(180, 500, 1.25, c);
    step(30);
    const ls = live().filter((p) => p.k === 'leaf');
    expect(ls.length).toBeGreaterThan(4);
    expect(ls.every((p) => p.vy < 0)).toBe(true);
    resetBladeFx();
    r.swing?.(180, 610, 12, 0.26, c, 0, 1);
    step(4);
    const t = live().filter((p) => p.k === 'zig');
    expect(t.length).toBeGreaterThanOrEqual(4);
    for (const p of t) { const q = pts(p); expect(q[q.length - 1][1]).toBeLessThan(q[0][1]); } // 끝이 뿌리보다 위
  });

  it('칼 기운: 콤보가 쌓일수록 불 혀가 길다(1.3배 안팎 — 1.5배 안)', () => {
    const len = (cr: number): number => {
      resetBladeFx();
      for (let n = 0; n < 40; n++) r.aura?.([180, 560, 200, 600], n, c, cr);
      const zs = live().filter((p) => p.k === 'zig');
      return zs.reduce((a, p) => { const q = pts(p); return a + Math.hypot(q[q.length - 1][0] - q[0][0], q[q.length - 1][1] - q[0][1]); }, 0) / zs.length;
    };
    expect(len(1)).toBeGreaterThan(len(0) * 1.2);
    expect(len(1)).toBeLessThan(len(0) * 1.5);
  });

  it('칼 기운 상한: 서 있기 칼날에 붙어 감긴다 — 외곽은 칼날에서 35 안 · 칼끝 너머 20(콤보 100은 30) 안 · 몸 상자 안 획은 칼날에 붙은 것뿐 · 콤보 0 굵기 4.5~5.5', () => {
    // 서 있기 칼날(발 (180, 610) 기준 손 (9, −30) → 칼끝 (25, −1) · 길이 33)
    const [hx, hy, tx, ty] = [189, 580, 205, 609];
    const L = Math.hypot(tx - hx, ty - hy);
    const [ux, uy] = [(tx - hx) / L, (ty - hy) / L];
    for (const cr of [0, 1]) {
      resetBladeFx();
      let far = 0;
      let beyond = 0;
      for (let f = 0; f < 240; f++) {
        if (f % 5 === 0) r.aura?.([hx, hy, tx, ty], f / 5, c, cr);
        for (const p of live().filter((b) => b.k === 'zig')) {
          if (cr === 0) { expect(p.v).toBeLessThanOrEqual(5.5); expect(p.v).toBeGreaterThanOrEqual(3); } // 큰 혀 4.8 · 곁 혀 3.4
          for (const [x, y] of pts(p)) {
            const t = (x - hx) * ux + (y - hy) * uy;
            const tc = Math.max(0, Math.min(L, t));
            const d = Math.hypot(x - (hx + ux * tc), y - (hy + uy * tc));
            far = Math.max(far, d + p.v / 2);
            beyond = Math.max(beyond, t - L + p.v / 2);
            if (Math.abs(x - 180) <= 18 && 610 - y >= 0 && 610 - y <= 60) expect(d).toBeLessThan(10); // 몸 상자 안이면 칼날 곁
          }
        }
        step(1);
      }
      expect(far).toBeGreaterThan(15); // 칼 길이만 한 혀가 실제로 선다
      expect(far).toBeLessThanOrEqual(35);
      expect(beyond).toBeLessThanOrEqual(cr ? 30 : 20);
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
