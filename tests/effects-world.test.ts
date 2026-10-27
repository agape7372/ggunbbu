// BL-09 — 파티클은 월드 좌표로 저장하고 그릴 때 카메라를 한 번 더한다.
// 스폰 시점 카메라를 구워 넣으면 점프 정점에서 터진 파편이 월드에 안 붙고 화면에 붙어 따라온다.
import { beforeEach, describe, expect, it } from 'vitest';
import { VIEW } from '../src/config';
import { makeState } from '../src/core/sim';
import type { GameState } from '../src/core/types';
import { drawEffects, resetEffects, spawnBossBreak, spawnFromEvent, tickEffects, updateEffects } from '../src/render/effects';

/** 그린 점들의 y를 모으는 기록용 ctx — arc/moveTo/translate 좌표만 본다. */
function recorder(): { ctx: CanvasRenderingContext2D; ys: number[]; shifts: number[] } {
  const ys: number[] = [];
  const shifts: number[] = [];
  const target: Record<string, unknown> = {
    arc: (_x: number, y: number) => ys.push(y),
    moveTo: (_x: number, y: number) => ys.push(y),
    translate: (_x: number, y: number) => shifts.push(y),
  };
  const ctx = new Proxy(target, {
    get: (t, k: string) => t[k] ?? (() => undefined),
    set: (t, k: string, v) => { t[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, ys, shifts };
}

function state(): GameState {
  const s = makeState();
  s.stack = null;
  return s;
}

beforeEach(() => resetEffects());

describe('파티클 월드 좌표', () => {
  it('같은 이벤트를 cam만 달리 그리면 y가 정확히 cam만큼 밀린다', () => {
    const s = state();
    spawnFromEvent(s, { kind: 'boltStrike', lane: 0 });
    const a = recorder();
    drawEffects(a.ctx, 0);
    const b = recorder();
    drawEffects(b.ctx, 120);
    expect(a.ys.length).toBeGreaterThan(5);
    expect(b.ys).toHaveLength(a.ys.length);
    a.ys.forEach((y, i) => expect(b.ys[i] - y).toBeCloseTo(120));
  });

  it('스폰 뒤 카메라가 움직여도 파티클의 저장 좌표는 그대로다 — 그릴 때만 카메라를 탄다', () => {
    const s = state();
    s.player.y = 400;
    spawnFromEvent(s, { kind: 'stackDestroy', n: 4 });
    updateEffects(0);                     // 시간만 흘려도 좌표 적분에 cam이 끼어들지 않는다
    const a = recorder();
    drawEffects(a.ctx, 150);
    const first = a.ys.slice();
    const b = recorder();
    drawEffects(b.ctx, 20);               // 카메라가 내려온 뒤
    b.ys.forEach((y, i) => expect(first[i] - y).toBeCloseTo(130));
  });

  it('필살 중앙 폭발만 화면 고정(카메라를 안 탄다), 플레이어 쪽 폭발은 월드', () => {
    const s = state();
    spawnFromEvent(s, { kind: 'special', lane: 0 });
    const a = recorder();
    drawEffects(a.ctx, 0);
    const b = recorder();
    drawEffects(b.ctx, 100);
    const moved = b.ys.filter((y, i) => Math.abs(y - a.ys[i] - 100) < 1e-6).length;
    const fixed = b.ys.filter((y, i) => Math.abs(y - a.ys[i]) < 1e-6).length;
    expect(moved).toBeGreaterThan(0);
    expect(fixed).toBeGreaterThan(0);
    expect(moved + fixed).toBe(a.ys.length);
  });

  it('보급 상자도 월드 좌표 — 그릴 때 한 번 카메라 이동(translate)이 걸린다', () => {
    const s = state();
    spawnFromEvent(s, { kind: 'supply', item: 'hat', y: 100 });
    const r = recorder();
    drawEffects(r.ctx, 90);
    expect(r.shifts).toContain(90);
  });

  it('착지 먼지: 플레이어 착지(레인 없음)만 4알, 화산탄 착지(레인 있음)는 더미가 보여 준다', () => {
    const s = state();
    spawnFromEvent(s, { kind: 'land', lane: 0 });
    const rock = recorder();
    drawEffects(rock.ctx, 0);
    expect(rock.ys).toHaveLength(0);
    spawnFromEvent(s, { kind: 'land' });
    const mine = recorder();
    drawEffects(mine.ctx, 0);
    expect(mine.ys).toHaveLength(4);
  });

  it('입장 BREAK 파편은 좌·중·우 세 덩이', () => {
    spawnBossBreak(VIEW.W / 2, 300);
    const r = recorder();
    drawEffects(r.ctx, 0);
    expect(r.ys.length).toBeGreaterThanOrEqual(9);
  });
});

describe('격파 배속(slow) — 파티클만 느리다', () => {
  it('같은 시간을 slow 0.2로 흘리면 파티클이 덜 움직인다', () => {
    const s = state();
    const advance = (slow: number): number => {
      resetEffects();
      spawnFromEvent(s, { kind: 'boltStrike', lane: 0 });
      for (let i = 0; i < 6; i++) updateEffects((1 / 60) * slow);
      const r = recorder();
      drawEffects(r.ctx, 0);
      return Math.min(...r.ys);
    };
    const fast = advance(1);
    const slow = advance(0.2);
    expect(slow).toBeGreaterThan(fast); // 위로 덜 올라갔다(화면 y는 위가 작다)
  });

  it('tickEffects(slow)는 호출 형태만 검증 — 던지지 않는다', () => {
    expect(() => tickEffects(0.2)).not.toThrow();
    expect(() => tickEffects()).not.toThrow();
  });
});
