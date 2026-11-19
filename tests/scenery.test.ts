import { describe, expect, it } from 'vitest';
import { VIEW } from '../src/config';
import { drawSceneLive, paintSceneTiers, sceneTheme, sunAt } from '../src/render/scenery';

function fakeCtx(): { ctx: CanvasRenderingContext2D; calls: string[]; ops: string[] } {
  const calls: string[] = [];
  const ops: string[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get: (t, k: string) => (k in t ? t[k] : (...a: unknown[]) => { calls.push(k); void a; }),
    set: (t, k: string, v) => { if (k === 'globalCompositeOperation') ops.push(String(v)); t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, ops };
}

describe('판 원경(scenery)', () => {
  it('1막 구역 넷만 그린다 — 2막 · 버터바 · 집행기 배경은 건드리지 않는다', () => {
    expect(sceneTheme('bg-europe')).toBe('europe');
    expect(sceneTheme('bg-modern')).toBe('modern');
    for (const k of ['bg-act2', 'bg-bonus', 'bg-executor']) {
      expect(sceneTheme(k)).toBeNull();
      const { ctx, calls } = fakeCtx();
      paintSceneTiers(ctx, k, 360, 560);
      drawSceneLive(ctx, { key: k, tick: 100, p: 0.3, night: false });
      expect(calls).toEqual([]);
    }
  });

  it('해는 진행도를 따라 왼쪽에서 오른쪽으로 건너고 한낮에 가장 높다(필드 안)', () => {
    const [x0, y0] = sunAt(0);
    const [xm, ym] = sunAt(0.5);
    const [x1, y1] = sunAt(1);
    expect(x0).toBeLessThan(xm);
    expect(xm).toBeLessThan(x1);
    expect(ym).toBeLessThan(y0);
    expect(ym).toBeLessThan(y1);
    for (const [x, y] of [sunAt(-1), sunAt(0), sunAt(0.5), sunAt(1), sunAt(9)]) {
      expect(x - 30).toBeGreaterThanOrEqual(0);
      expect(x + 30).toBeLessThanOrEqual(VIEW.W);
      expect(y - 30).toBeGreaterThan(VIEW.FIELD_TOP);
    }
  });

  it('두 단은 곱하기로 한 번씩 칠한다(면 둘 · 선 없음)', () => {
    for (const t of ['europe', 'asia', 'eastasia', 'modern']) {
      const { ctx, calls, ops } = fakeCtx();
      paintSceneTiers(ctx, `bg-${t}`, 360, 560);
      expect(ops).toContain('multiply');
      expect(calls.filter((c) => c === 'fill')).toHaveLength(2);
      expect(calls).not.toContain('stroke');
    }
  });

  it('살아 있는 것은 어느 틱에도 그려지고, 야간엔 해를 그리지 않는다', () => {
    for (const t of ['europe', 'asia', 'eastasia', 'modern']) {
      for (const tick of [0, 300, 1499, 1500, 99999]) {
        const day = fakeCtx();
        drawSceneLive(day.ctx, { key: `bg-${t}`, tick, p: 0.4, night: false });
        expect(day.ops[0]).toBe('multiply');
        const night = fakeCtx();
        drawSceneLive(night.ctx, { key: `bg-${t}`, tick, p: 0.4, night: true });
        expect(night.ops).not.toContain('multiply');
      }
    }
  });
});
