// 고압선 대검 4판 — 아래서 위로 기어오르는 S자 아크(먹 머리 → 노랑 꼬리 · 마디마다 굵기가 다름 · 굵은 마디 속 종이색 줄) →
// 꼭대기 두 갈래 → 끊김 → 같은 밑동에서 다시 붙음 · 크기 순서 · 칼 기운은 날에서 솟는 고리(먹 목 + 노랑 몸) · 달(sweep) 없음 · 필살 상한.
// ⚠ legend5는 bladeFx와 순환 import — bladeFx를 먼저 들인다
import { beforeEach, describe, expect, it } from 'vitest';
import { RECIPES, pool, resetBladeFx, scaled, updateBladeFx, weaponAlong, weaponBloom } from '../src/render/bladeFx';
import { liveBits } from '../src/render/weaponFx';
import { PALETTE, VIEW, WEAPON_INK, WEAPON_LITE } from '../src/config';

const c = WEAPON_INK.volt;
const lite = WEAPON_LITE.volt;
type B = (typeof pool)[number];
const alive = (): B[] => pool.filter((p) => p.alive);
const step = (n: number): void => { for (let i = 0; i < n; i++) updateBladeFx(1 / 60); };
/** 꺾은 획의 월드 점 [x, y][] */
const world = (p: B): [number, number][] => {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < p.pts.length; i += 2) out.push([p.x + p.pts[i], p.y + p.pts[i + 1]]);
  return out;
};
/** 실(고른 먹줄 누름 2) · 부푼 마디(잔상 누름 3 + 종이색 속) */
const threads = (): B[] => alive().filter((p) => p.k === 'zig' && p.pr === 2);
const bulges = (): B[] => alive().filter((p) => p.k === 'zig' && p.pr === 3 && p.c2 === PALETTE.BG);
/** 한 사건이 사는 동안 꺾은 획이 닿은 높이 · 폭 · 가장 많이 산 조각 수 */
function reach(fire: () => void): { h: number; w: number; peak: number } {
  resetBladeFx();
  fire();
  let [x0, x1, y0, y1, peak] = [Infinity, -Infinity, Infinity, -Infinity, 0];
  for (let i = 0; i < 140; i++) {
    peak = Math.max(peak, alive().length);
    for (const p of alive()) if (p.k === 'zig') for (const [x, y] of world(p)) [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)];
    updateBladeFx(1 / 60);
  }
  return { h: y1 - y0, w: x1 - x0, peak };
}

beforeEach(() => resetBladeFx());

describe('고압선 — 아래서 기어오르는 아크', () => {
  it('타격: 먹 점 점화 → 실이 밑동에서 위로 휘며 그어진다(아래 절반 먹 머리 · 위 절반 노랑) → 굵은 마디(실의 1.8배 넘게 · 종이색 속 · 실보다 먼저 가라앉는다) → 두 갈래 → 다시 붙음 · 2초 뒤 0', () => {
    RECIPES.volt.hit(180, 500, 1, c);
    const dots = alive().filter((p) => p.k === 'spat');
    expect(dots.length).toBeGreaterThan(0);
    expect(dots.every((p) => p.c1 === PALETTE.INK)).toBe(true); // 점화 = 먹 점
    // 마디는 제 밑동 실이 깎이기 전에 가라앉는다 — 12프레임 동안 본 마디의 굵기 · 색을 떠 둔다
    const seen: { v: number; c1: string }[] = [];
    for (let i = 0; i < 12; i++) { step(1); for (const p of bulges()) seen.push({ v: p.v, c1: p.c1 }); }
    const th = threads();
    expect(th.some((p) => p.c1 === c)).toBe(true); // 먹 머리 → 노랑
    expect(th.some((p) => p.c1 === lite)).toBe(true); // 위 절반 노랑 → 밝은 짝
    for (const p of th.filter((q) => q.c1 === c)) {
      const pts = world(p);
      expect(pts[pts.length - 1][1]).toBeLessThan(pts[0][1]); // 위로 오른다
    }
    // S자 — 곧은 줄이 아니라 밑동 → 끝 곧은 선에서 옆으로 비킨 점이 있다
    const bend = Math.max(...th.map((p) => {
      const pts = world(p);
      const [[ax, ay], [bx, by]] = [pts[0], pts[pts.length - 1]];
      const L = Math.hypot(bx - ax, by - ay) || 1;
      return Math.max(...pts.map(([x, y]) => Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / L));
    }));
    expect(bend).toBeGreaterThan(4);
    const w0 = Math.max(...th.filter((p) => p.c1 === c).map((p) => p.v)); // 먹 머리 실(짧은 아크 · 위 절반도 같은 누름)
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((p) => p.v >= w0 * 1.7 && p.c1 === c)).toBe(true); // 마디마다 굵기가 다르다 · 시그니처 색 붓(밝은 짝은 종이 위에서 옅었다)
    expect(alive().some((p) => p.k === 'zig' && p.pr === 1)).toBe(true); // 꼭대기 두 갈래
    const before = alive().filter((p) => p.k === 'spat').length;
    let relit = false;
    for (let i = 0; i < 20; i++) { step(1); relit ||= alive().filter((p) => p.k === 'spat').length > before; }
    expect(relit).toBe(true); // 같은 밑동에서 다시 붙는다(새 점화 먹 점)
    step(125);
    expect(liveBits()).toHaveLength(0);
  });

  it('크기 순서 whiff < hit < floor < destroy · 완파는 높이가 주인공 키 5배 넘게(위로) · 상한 40 · 달(sweep) 없음', () => {
    const wf = reach(() => RECIPES.volt.whiff!(180, 500, c));
    const hi = reach(() => RECIPES.volt.hit(180, 500, 1, c));
    const fl = reach(() => RECIPES.volt.floor(180, 500, 1, c));
    let swept = false;
    const de = reach(() => {
      RECIPES.volt.destroy(180, 500, 1.25, c);
      RECIPES.volt.swing!(180, VIEW.GROUND_Y, 14, 0.3, c, 0, 1);
      swept = alive().some((p) => p.k === 'sweep');
    });
    expect(wf.h).toBeLessThan(hi.h);
    expect(hi.h).toBeLessThan(fl.h);
    expect(fl.h).toBeLessThan(de.h);
    expect(de.h).toBeGreaterThan(55 * 5 / 1.6); // 사건 그림은 1.6배로 키워 그린다
    expect(swept).toBe(false);
    for (const r of [wf, hi, fl, de]) expect(r.peak).toBeLessThanOrEqual(40);
  });

  it('타격은 떠 있는 마디가 둘 이하 · 완파 +24~+34프레임에 마디 셋 이하(노랑 덩이가 풀 조각처럼 뭉치지 않게)', () => {
    let most = 0;
    RECIPES.volt.hit(180, 500, 1, c);
    for (let i = 0; i < 140; i++) { most = Math.max(most, bulges().length); step(1); }
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(2);
    resetBladeFx();
    scaled(180, 500, 1.6, () => RECIPES.volt.destroy(180, 500, 1.25, c)); // 실제 판처럼 1.6배로 키워
    let late = 0;
    for (let i = 0; i <= 34; i++) { if (i >= 24) late = Math.max(late, bulges().length); step(1); }
    expect(late).toBeLessThanOrEqual(3);
    step(140);
    expect(liveBits()).toHaveLength(0);
  });

  it('칼 기운: 날 위 노랑 실 + 날에서 솟는 고리 둘(굵은 먹 목 → 노랑 몸 · 종이색 속줄) · 칼 둘레 40 안 · 땅에 닿지 않는다', () => {
    const b = [189, 580, 205, 609] as const; // 서 있을 때 칼날(손 → 칼끝, 칼끝이 땅 1px 위)
    RECIPES.volt.aura!(b, 0, c);
    // 고리 둘은 0~11프레임 사이에 어긋나 선다 — 20프레임 동안 본 목 · 몸을 모은다(풀 칸은 다시 쓰이니 본 때 값을 떠 둔다)
    type Seen = { c1: string; c2: string; v: number; pts: [number, number][] };
    const necks = new Map<B, Seen>();
    const bodies = new Map<B, Seen>();
    let th: B[] = [];
    for (let i = 0; i < 20; i++) {
      step(1);
      if (i === 7) th = threads();
      for (const p of alive().filter((q) => q.k === 'zig')) {
        const m = p.pr === 5 ? necks : p.pr === 0 && p.c2 === PALETTE.BG ? bodies : null;
        if (m && !m.has(p)) m.set(p, { c1: p.c1, c2: p.c2, v: p.v, pts: world(p) });
      }
    }
    expect(th.length).toBeGreaterThan(0);
    expect(th.every((p) => p.c1 === lite)).toBe(true); // 날 위 실은 밝은 짝(먹은 점화 점 · 고리 목)
    const nk = [...necks.values()];
    const bd = [...bodies.values()];
    expect(nk).toHaveLength(2);
    expect(bd).toHaveLength(2);
    expect(nk.every((p) => p.c1 === c && !p.c2)).toBe(true); // 목 = 시그니처 색 붓(먹 머리) · 속줄 없음(먹 테가 되지 않게)
    expect(bd.every((p) => p.c1 === lite)).toBe(true); // 몸 = 밝은 짝(먹이 다시 묻지 않는다)
    expect(Math.max(...nk.map((p) => p.v))).toBeGreaterThan(6); // 굵은 먹 목
    const L = Math.hypot(b[2] - b[0], b[3] - b[1]);
    const off = ([x, y]: [number, number]): number => Math.abs((b[2] - b[0]) * (b[1] - y) - (b[0] - x) * (b[3] - b[1])) / L;
    for (const p of nk) expect(off(p.pts[0])).toBeLessThan(3); // 날에서 떠나
    for (const p of bd) expect(off(p.pts[p.pts.length - 1])).toBeLessThan(3); // 날로 돌아온다
    expect(Math.max(...bd.flatMap((p) => p.pts.map(off)))).toBeGreaterThan(20); // 큰 고리는 20 넘게 바깥으로(10회차는 15~23)
    for (const p of [...nk, ...bd]) {
      for (const [x, y] of p.pts) {
        expect(off([x, y])).toBeLessThan(40); // 칼 밖으로 크게 나가지 않는다(칼 길이 대비)
        expect(y).toBeLessThan(VIEW.GROUND_Y);
      }
    }
    resetBladeFx();
    RECIPES.volt.aura!(b, 0, c);
    for (let i = 0; i < 20; i++) {
      step(1);
      for (const p of alive().filter((q) => q.k === 'zig')) for (const [x, y] of world(p)) {
        expect(off([x, y])).toBeLessThan(40); // 갈래 끝 · 날 위 실 포함
        expect(y).toBeLessThan(VIEW.GROUND_Y);
      }
    }
    step(60);
    expect(liveBits()).toHaveLength(0);
  });

  it('필살 along · bloom — 상한(24 · 48) 안 · 전부 keep · 2초 뒤 0', () => {
    let born = 0;
    weaponAlong('volt', [0, 600, 300, 200, 700, 100], 1.3, 0.35);
    for (let i = 0; i < 130; i++) {
      born = Math.max(born, alive().length);
      expect(liveBits().every((p) => p.keep)).toBe(true);
      updateBladeFx(1 / 60);
    }
    expect(born).toBeGreaterThan(3);
    expect(born).toBeLessThanOrEqual(24);
    expect(liveBits()).toHaveLength(0);
    weaponBloom('volt', 300, 300, -Math.PI / 2, 1.4);
    let peak = 0;
    for (let i = 0; i < 130; i++) { peak = Math.max(peak, alive().length); updateBladeFx(1 / 60); }
    expect(peak).toBeGreaterThan(5);
    expect(peak).toBeLessThanOrEqual(48);
    expect(liveBits()).toHaveLength(0);
  });
});
