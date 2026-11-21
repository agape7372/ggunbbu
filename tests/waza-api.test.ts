// 필살 × 무기 이펙트 API(11-21 설계서 §3) — samplePath · strokeTone · weaponAlong · weaponBloom.
// 기본 판(waza 없는 무기)만으로도 26 무기 전부 조각이 나오고, 한 번 부름의 조각 수가 상한 안이어야 한다(풀 192 · keep 여유 ~94).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PALETTE, WEAPON_INK, WEAPON_LITE } from '../src/config';
import type { WazaId } from '../src/core/types';
import { WAZA_IDS, WEAPON_IDS } from '../src/meta/loadout';
import {
  RECIPES, drawBladeFx, drops, line, pool, resetBladeFx, samplePath, strokeTone, updateBladeFx, weaponAlong, weaponBloom, type Bit,
} from '../src/render/bladeFx';
import { TOOL_RECIPES, liveBits } from '../src/render/weaponFx';
import { drawWazaShot } from '../src/render/wazaShow';

const INK = PALETTE.INK;
const LEGEND_IDS = Object.keys(WEAPON_LITE) as (keyof typeof WEAPON_LITE)[];
const sink = new Proxy({}, { get: () => () => undefined, set: () => true }) as unknown as CanvasRenderingContext2D;

/** 지난번 본 뒤 새로 태어난 조각 수(덮어쓴 칸 포함) — 즉시 + later 합을 센다 */
const seen = new Map<Bit, number>();
function births(): number {
  let n = 0;
  for (const p of pool) {
    if (!p.alive) { seen.delete(p); continue; }
    if (seen.get(p) !== p.seed) { n++; seen.set(p, p.seed); }
  }
  return n;
}
/** f를 부르고 2초 흘려 [태어난 합, 동시에 산 keep 조각 최대] */
function run(f: () => void): { total: number; keepPeak: number } {
  resetBladeFx();
  seen.clear();
  f();
  let total = births();
  let keepPeak = pool.filter((p) => p.alive && p.keep).length;
  for (let i = 0; i < 125; i++) {
    updateBladeFx(1 / 60);
    total += births();
    keepPeak = Math.max(keepPeak, pool.filter((p) => p.alive && p.keep).length);
  }
  return { total, keepPeak };
}

/** 길이 약 700px 꺾은선 — 상한 시험용 긴 획 */
const LONG = [100, 700, 500, 100, 900, 300, 100, 500];
const SHORT = [200, 400, 260, 400]; // 60px

beforeEach(() => resetBladeFx());

describe('samplePath', () => {
  it('곧은 선 100px · step 50 → 양 끝 포함 셋, 간격 50, 진행 0 · 0.5 · 1, 각은 진행 방향', () => {
    const s = samplePath([0, 0, 100, 0], 50);
    expect(s.map((p) => [p.x, p.y, p.ang, p.u])).toEqual([[0, 0, 0, 0], [50, 0, 0, 0.5], [100, 0, 0, 1]]);
  });

  it('꺾은선 — 길이 비례로 표본하고 마디마다 그 마디의 각을 쓴다', () => {
    const s = samplePath([0, 0, 100, 0, 100, 100], 50); // 오른쪽 100 → 아래 100
    expect(s).toHaveLength(5);
    expect(s[0].ang).toBeCloseTo(0);
    expect(s[1].x).toBeCloseTo(50);
    expect(s[2]).toMatchObject({ x: 100, y: 0 });
    expect(s[3].ang).toBeCloseTo(Math.PI / 2); // 아래로(캔버스 +y)
    expect(s[3].y).toBeCloseTo(50);
    expect(s[4]).toMatchObject({ x: 100, y: 100, u: 1 });
    expect(s.map((p) => p.u)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it('step이 길이보다 길면 양 끝 둘 · 점 하나는 표본 하나 · 빈 배열은 빈 결과 · 겹친 점은 무시', () => {
    expect(samplePath([0, 0, 30, 40], 500)).toEqual([{ x: 0, y: 0, ang: Math.atan2(40, 30), u: 0 }, { x: 30, y: 40, ang: Math.atan2(40, 30), u: 1 }]);
    expect(samplePath([5, 6], 50)).toEqual([{ x: 5, y: 6, ang: 0, u: 0 }]);
    expect(samplePath([], 50)).toEqual([]);
    const d = samplePath([0, 0, 0, 0, 100, 0], 50); // 첫 두 점이 겹친다 — 각이 NaN이 되면 안 된다
    expect(d).toHaveLength(3);
    expect(d.every((p) => Number.isFinite(p.ang) && p.ang === 0)).toBe(true);
  });

  it('길이 비례 — 표본 수는 길이 ÷ step + 1 (다른 길이 · 다른 간격)', () => {
    expect(samplePath([0, 0, 1000, 0], 50)).toHaveLength(21);
    expect(samplePath([0, 0, 0, 175], 50)).toHaveLength(4); // floor(3.5) + 1
  });
});

describe('strokeTone', () => {
  /** 그라데이션 만들기 기록(선 · 멈춤점)을 모으는 ctx */
  function recorder(): { ctx: CanvasRenderingContext2D; log: string[] } {
    const log: string[] = [];
    const r = (v: number): number => Math.round(v * 100) / 100;
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_t, k) => (k === 'createLinearGradient'
        ? (...a: number[]) => {
          log.push(`lin(${a.map(r).join(',')})`);
          return { addColorStop: (o: number, c: string) => log.push(`stop(${r(o)},${c})`) };
        }
        : () => undefined),
      set: () => true,
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, log };
  }

  it('전설이 아니면 undefined', () => {
    for (const w of WEAPON_IDS) if (!(w in WEAPON_LITE)) expect(strokeTone(sink, w, 0, 0, 100, 0, 1), w).toBeUndefined();
  });

  it('전설 여덟은 legendTone과 같은 그라데이션을 짓는다 — 같은 기하 · seed면 선과 멈춤점이 똑같다(화염 거꾸로 포함)', () => {
    expect(LEGEND_IDS).toHaveLength(8);
    for (const w of LEGEND_IDS) {
      resetBladeFx();
      line(120, 300, 320, 210, 12, '', { body: WEAPON_INK[w], life: 0.3 });
      const p = pool.find((b) => b.alive)!;
      updateBladeFx(0.05); // 막 그은 획은 아직 안 그려진다 — 조금 흘린 뒤
      const viaBit = recorder();
      drawBladeFx(viaBit.ctx, 0);
      const x1 = p.x + Math.cos(p.rot) * p.size;
      const y1 = p.y + Math.sin(p.rot) * p.size;
      const viaApi = recorder();
      const tone = strokeTone(viaApi.ctx, w, p.x, p.y, x1, y1, p.seed);
      expect(typeof tone, w).toBe('function');
      expect(viaApi.log.length, w).toBeGreaterThan(0);
      expect(viaApi.log, w).toEqual(viaBit.log);
    }
  });

  it('기본은 먹 머리 → 시그니처 색, 화염만 거꾸로(밑동 그 색 → 끝 먹)', () => {
    for (const w of LEGEND_IDS) {
      const { ctx, log } = recorder();
      strokeTone(ctx, w, 0, 0, 100, 0, 3);
      const stops = log.filter((l) => l.startsWith('stop'));
      const first = stops[0];
      const last = stops.slice(0, 6).map((l) => l.slice(l.indexOf(',') + 1, -1));
      if (w === 'flame') {
        expect(first, w).toContain(WEAPON_INK.flame);
        expect(last[3], w).toBe(INK);
      } else {
        expect(first, w).toContain(INK);
        expect(last[5], w).toBe(WEAPON_LITE[w]);
      }
    }
  });

  it('tone(k)가 fillStyle을 바꾼다 — 몸통(0)과 가닥(1~)', () => {
    let fill: unknown;
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop: () => undefined }) : () => undefined),
      set: (_t, k, v) => { if (k === 'fillStyle') fill = v; return true; },
    }) as unknown as CanvasRenderingContext2D;
    const tone = strokeTone(ctx, 'gold', 0, 0, 100, 0, 5)!;
    tone(0);
    expect(fill).toBeTruthy();
    fill = undefined;
    tone(2);
    expect(fill).toBeTruthy();
  });
});

describe('weaponAlong · weaponBloom 기본 판(waza 없음)', () => {
  it('26 무기 모두 짧은 획에서도 조각 1개 이상, 2초 뒤엔 0, 그리다 던지지 않는다', () => {
    for (const w of WEAPON_IDS) {
      const { total } = run(() => {
        weaponAlong(w, SHORT, 1, 0.25);
        drawBladeFx(sink, 0);
      });
      expect(total, w).toBeGreaterThanOrEqual(1);
      expect(liveBits(), w).toHaveLength(0);
    }
  });

  it('26 무기 × 긴 획 — k 1에서 한 번 부름당 즉시 + later 합이 24 이하, 전부 keep 조각', () => {
    for (const w of WEAPON_IDS) {
      for (const path of [LONG, SHORT, [0, 0, 1500, 0]]) {
        const { total, keepPeak } = run(() => weaponAlong(w, path, 1, 0.35));
        expect(total, `${w} ${path.length}`).toBeLessThanOrEqual(24);
        expect(total, `${w} ${path.length}`).toBeGreaterThanOrEqual(1);
        expect(keepPeak, w).toBeGreaterThan(0); // 필살 그림은 풀이 넘쳐도 안 덮인다
      }
    }
  });

  it('dur 동안 뿌리 → 끝 차례: 시작 표본은 바로, 끝 표본은 dur 뒤에 나온다', () => {
    resetBladeFx();
    weaponAlong('iron', [0, 400, 600, 400], 1, 0.5);
    expect(liveBits().length).toBeGreaterThan(0);
    expect(Math.max(...liveBits().map((p) => p.x))).toBeLessThan(150); // 뿌리(앞 끝)에서만
    let reached = false;
    for (let i = 0; i < 40; i++) { // 0.67초 — 끝 표본까지
      updateBladeFx(1 / 60);
      if (liveBits().some((p) => p.x > 450)) reached = true;
    }
    expect(reached).toBe(true);
  });

  it('weaponBloom — 26 무기 모두 조각 1개 이상 · 상한 48 이하(k 1.4) · 2초 뒤 0', () => {
    for (const w of WEAPON_IDS) {
      for (const k of [1, 1.4]) {
        const { total } = run(() => weaponBloom(w, 300, 300, -Math.PI / 2, k));
        expect(total, `${w} ${k}`).toBeGreaterThanOrEqual(1);
        expect(total, `${w} ${k}`).toBeLessThanOrEqual(48);
        expect(liveBits(), w).toHaveLength(0);
      }
    }
  });

  it('천지개벽 한 박(along 1.3 + 곁 둘 0.9 + bloom 1.0)을 한꺼번에 얹어도 keep이 풀 여유(94) 안', () => {
    for (const w of WEAPON_IDS) {
      const { keepPeak } = run(() => {
        weaponAlong(w, LONG, 1.3, 0.35);
        weaponAlong(w, [100, 500, 260, 140], 0.9, 0.25);
        weaponAlong(w, [500, 500, 640, 140], 0.9, 0.25);
        weaponBloom(w, 300, 520, -Math.PI / 2, 1);
      });
      expect(keepPeak, w).toBeLessThanOrEqual(94);
    }
  });

  it('상점 필살 칸(drawWazaShot)은 여전히 조각 0', () => {
    for (const waza of WAZA_IDS as readonly WazaId[]) {
      drawWazaShot(sink, waza, 40, 74);
      expect(liveBits(), waza).toHaveLength(0);
    }
  });
});

describe('waza 선택 칸', () => {
  afterEach(() => {
    delete RECIPES.plain.waza;
    delete TOOL_RECIPES.sword;
  });

  it('대검 레시피에 waza가 있으면 기본 판 대신 그것을 부른다 — pts · k · 그 무기 색 · dur 그대로', () => {
    const along = vi.fn();
    const bloom = vi.fn();
    RECIPES.plain.waza = { along, bloom };
    weaponAlong('iron', LONG, 1.3, 0.35);
    weaponBloom('iron', 10, 20, -Math.PI / 2, 1.4);
    expect(along).toHaveBeenCalledWith(LONG, 1.3, WEAPON_INK.iron, 0.35);
    expect(bloom).toHaveBeenCalledWith(10, 20, -Math.PI / 2, 1.4, WEAPON_INK.iron);
    expect(liveBits()).toHaveLength(0); // 기본 판은 안 돈다
  });

  it('연장 TOOL_RECIPES에도 waza 칸이 통한다', () => {
    const along = vi.fn();
    const bloom = vi.fn();
    TOOL_RECIPES.sword = { waza: { along, bloom } };
    weaponAlong('sword', SHORT, 1, 0.2);
    weaponBloom('sword', 1, 2, 0, 1);
    expect(along).toHaveBeenCalledTimes(1);
    expect(bloom).toHaveBeenCalledTimes(1);
  });

  it('waza 안에서 뿌린 조각도 keep(풀이 넘쳐도 안 덮인다)', () => {
    RECIPES.plain.waza = { along: (pts, _k, c) => drops(pts[0], pts[1], 3, -2, -1, 100, 200, 3, c), bloom: () => undefined };
    weaponAlong('iron', SHORT, 1, 0.2);
    expect(liveBits().length).toBeGreaterThan(0);
    expect(liveBits().every((p) => p.keep)).toBe(true);
  });
});
