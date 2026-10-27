// 보스 피격 반응(렌더 전용): 본체 지터 · 10타마다 턱 덜컥 · 티어 균열선 · 타이머가 알아서 잦아든다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOSS, VIEW } from '../src/config';
import { initBoss } from '../src/core/boss';
import { img } from '../src/render/assets';
import { bossBodyHit, drawExecutor, introFloorTop, resetBossFx, stepBossFx } from '../src/render/executor';

vi.mock('../src/render/assets', async (orig) => ({
  ...await orig<typeof import('../src/render/assets')>(),
  img: vi.fn(),
}));

interface Rec { translates: number[]; rotates: number[]; strokes: number; fills: number }
function recorder(): { ctx: CanvasRenderingContext2D; rec: Rec } {
  const rec: Rec = { translates: [], rotates: [], strokes: 0, fills: 0 };
  const target: Record<string, unknown> = {
    translate: (x: number) => rec.translates.push(x),
    rotate: (a: number) => rec.rotates.push(a),
    stroke: () => { rec.strokes++; },
    fill: () => { rec.fills++; },
  };
  const ctx = new Proxy(target, {
    get: (t, k: string) => t[k] ?? (() => undefined),
    set: (t, k: string, v) => { t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, rec };
}

beforeEach(() => {
  resetBossFx();
  vi.mocked(img).mockReturnValue(null); // 이미지 없이도 같은 실루엣(폴백)으로 그린다
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
});
afterEach(() => vi.unstubAllGlobals());

function draw(tier: 0 | 1 | 2 = 0): Rec {
  const b = initBoss();
  b.st = 'idle';
  b.tier = tier;
  const { ctx, rec } = recorder();
  drawExecutor(ctx, b, VIEW.GROUND_Y);
  return rec;
}

describe('피격 지터', () => {
  it('맞은 틱에는 본체가 가로로 흔들리고 3틱 안에 잦아든다', () => {
    const base = draw();
    bossBodyHit(false);
    const hit = draw();
    expect(hit.translates).not.toEqual(base.translates);
    const dx = hit.translates.map((x, i) => x - base.translates[i]).filter((d) => d !== 0);
    expect(dx.length).toBeGreaterThan(0);
    expect(Math.max(...dx.map(Math.abs))).toBeLessThanOrEqual(2 + 1e-9); // 2px 이하
    stepBossFx(); stepBossFx(); stepBossFx();
    expect(draw().translates).toEqual(base.translates);
  });

  it('지터 방향이 틱마다 번갈아 간다(+ − +)', () => {
    const base = draw().translates[0]; // 본체 중심 translate(x + 지터, cy)
    const dx: number[] = [];
    bossBodyHit(false);
    for (let i = 0; i < 3; i++) {
      dx.push(draw().translates[0] - base);
      stepBossFx();
    }
    expect(dx[0]).toBeGreaterThan(0);
    expect(dx[1]).toBeLessThan(0);
    expect(dx[2]).toBeGreaterThan(0);
    expect(Math.abs(dx[2])).toBeLessThan(Math.abs(dx[0])); // 갈수록 잦아든다
  });
});

describe('턱 덜컥', () => {
  it('10타 표식(clunk)일 때만 턱이 더 벌어졌다 닫힌다', () => {
    const base = draw();
    bossBodyHit(false);
    expect(draw().rotates).toEqual(base.rotates); // 일반 타격: 턱은 그대로(지터만)
    resetBossFx();
    bossBodyHit(true);
    expect(draw().rotates).not.toEqual(base.rotates);
    for (let i = 0; i < 8; i++) stepBossFx();
    expect(draw().rotates).toEqual(base.rotates); // 끝나면 원래대로
  });
});

describe('티어 균열선', () => {
  it('티어가 오를 때마다 선이 늘어난다(코드로 긋는 선 그림)', () => {
    const t0 = draw(0).strokes;
    const t1 = draw(1).strokes;
    const t2 = draw(2).strokes;
    expect(t1).toBeGreaterThan(t0);
    expect(t2).toBeGreaterThan(t1);
  });
});

describe('입장 층 위치', () => {
  it('introFloorTop은 층이 떨어질수록 아래로 내려간다(BREAK 파편이 이 위치에서 터진다)', () => {
    const b = initBoss();
    b.st = 'enter';
    b.y = BOSS.HOVER_HIGH;
    b.stTick = BOSS.INTRO.RELEASE;
    const a = introFloorTop(b, VIEW.GROUND_Y);
    b.stTick = BOSS.INTRO.BREAK;
    expect(introFloorTop(b, VIEW.GROUND_Y)).toBeGreaterThan(a);
  });
});
