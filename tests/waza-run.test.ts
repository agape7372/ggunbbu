// 시간차 필살 넷(2026-11-01) — 베어 두면 멈췄다가 정해진 틱에 터진다. config WAZA_RUN이 정본.
import { describe, it, expect } from 'vitest';
import { makeState, advance } from '../src/core/sim';
import { makeFloor, makeStack } from '../src/core/building';
import { EMPTY_INPUT, type GameState, type InputFrame, type JuiceEvent } from '../src/core/types';
import { JUICE, SCORE, WAZA_GAUGE, WAZA_RUN } from '../src/config';

const inp = (o: Partial<InputFrame> = {}): InputFrame => ({ ...EMPTY_INPUT, ...o });

function tower(n = 8, mat: Parameters<typeof makeFloor>[0] = 'weak', y = 300) {
  return makeStack({ variant: 'building', theme: 'europe', floors: Array.from({ length: n }, () => makeFloor(mat)), y });
}

function fire(w: GameState['waza'], stack = tower()): { s: GameState; evs: JuiceEvent[] } {
  const s = makeState();
  s.waza = w;
  s.wazaGauge = WAZA_GAUGE.MAX;
  s.stack = stack;
  const evs: JuiceEvent[] = [];
  advance(s, inp({ special: true }));
  evs.push(...s.events);
  s.events.length = 0;
  return { s, evs };
}

/** 히트스톱을 빼고 run 틱 t까지 돌린다(입력 없음). 모인 이벤트를 돌려준다 */
function runTo(s: GameState, t: number, evs: JuiceEvent[]): void {
  for (let i = 0; i < 400 && (s.wazaRun ? s.wazaRun.t < t : false); i++) {
    advance(s, inp());
    evs.push(...s.events);
    s.events.length = 0;
  }
}

describe('시간차 필살', () => {
  it('무음일섬(mukjul) — 발동 틱엔 아무것도 안 부수고, 멈췄다가 burst 틱에 통째로 · 층 점수 두 배', () => {
    const { s, evs } = fire('mukjul');
    const st = s.stack!;
    expect(st.floors.length).toBe(8);
    expect(s.wazaRun?.id).toBe('mukjul');
    const y0 = st.y;
    runTo(s, WAZA_RUN.mukjul.burst - 1, evs);
    expect(s.stack).toBe(st);
    expect(st.y).toBe(y0); // 멈춰 있다
    const before = s.score;
    runTo(s, WAZA_RUN.mukjul.burst, evs);
    expect(s.stack).toBeNull();
    expect(s.wazaRun).toBeNull();
    expect(evs.filter((e) => e.kind === 'wazaBurst')).toHaveLength(1);
    expect(evs.some((e) => e.kind === 'stackDestroy')).toBe(true);
    expect(s.score - before).toBe(8 * SCORE.FLOOR_BONUS * 2 + SCORE.DESTROY_BONUS);
  });

  it('십이연참(nakgwan) — 열두 타가 콤보를 하나씩 올리고 게이지는 안 채운다, 도장이 남은 층을 부순다', () => {
    const { s, evs } = fire('nakgwan', tower(20, 'hard'));
    runTo(s, WAZA_RUN.nakgwan.burst, evs);
    expect(s.combo).toBe(WAZA_RUN.nakgwan.hits.length);
    expect(s.wazaGauge).toBe(0);
    expect(evs.filter((e) => e.kind === 'wazaHit' || e.kind === 'floorCollapse').length).toBe(12);
    expect(s.stack).toBeNull();
  });

  it('휘두른 박자(wazaSwing)는 벤 건물이 먼저 다 무너져도 열두 번 다 온다', () => {
    const { s, evs } = fire('nakgwan', tower(2, 'weak'));
    runTo(s, WAZA_RUN.nakgwan.burst, evs);
    expect(evs.filter((e) => e.kind === 'wazaSwing')).toHaveLength(WAZA_RUN.nakgwan.hits.length);
    expect(evs.filter((e) => e.kind === 'wazaHit' || e.kind === 'floorCollapse')).toHaveLength(2);
  });

  it('용오름(baram) — 건물을 부수지 않고 세 번 치며 띄운다, 번개 · 포탄을 쓸어 낸다', () => {
    const s0 = tower(8, 'hard', 300);
    const s = makeState();
    s.waza = 'baram';
    s.wazaGauge = WAZA_GAUGE.MAX;
    s.stack = s0;
    s.entities = [{ kind: 'bolt', lane: 0, y: 500, vy: -200, cueTicks: 0 } as never];
    advance(s, inp({ special: true }));
    expect(s.entities.some((e) => e.kind === 'bolt')).toBe(false);
    const evs: JuiceEvent[] = [];
    runTo(s, WAZA_RUN.baram.hits[2], evs);
    expect(s.stack).not.toBeNull();
    expect(evs.filter((e) => e.kind === 'wazaHit' || e.kind === 'floorCollapse').length).toBe(3);
    expect(s.stack!.vy).toBeGreaterThan(0);
    expect(evs.some((e) => e.kind === 'wazaBurst')).toBe(false);
  });

  it('월하난무(dalmuri) — 보스 · 명물이 없으면 터질 때 건물만. 무음일섬이 가장 늦게 터진다(참철도 정적 1.6초)', () => {
    const ids = Object.keys(WAZA_RUN) as (keyof typeof WAZA_RUN)[];
    const last = ids.reduce((a, b) => (WAZA_RUN[a].burst >= WAZA_RUN[b].burst ? a : b));
    expect(last).toBe('mukjul');
    const { s, evs } = fire('dalmuri');
    runTo(s, WAZA_RUN.dalmuri.burst, evs);
    expect(s.stack).toBeNull();
  });

  it('월하난무(dalmuri) — 다섯 칼(투두두두)이 벤 건물 맨 아래층을 하나씩 치고 콤보를 올린 뒤 터진다', () => {
    const { s, evs } = fire('dalmuri', tower(10, 'hard'));
    runTo(s, WAZA_RUN.dalmuri.burst, evs);
    expect(evs.filter((e) => e.kind === 'wazaSwing')).toHaveLength(WAZA_RUN.dalmuri.hits.length);
    expect(evs.filter((e) => e.kind === 'wazaHit' || e.kind === 'floorCollapse')).toHaveLength(WAZA_RUN.dalmuri.hits.length);
    expect(Math.max(...WAZA_RUN.dalmuri.hits)).toBeLessThan(WAZA_RUN.dalmuri.burst); // 숨 한 번 뒤에 터진다
    expect(s.stack).toBeNull();
  });

  it('벤 건물이 먼저 사라지면 터짐은 새 건물을 건드리지 않는다(멈추지도 않는다)', () => {
    const { s, evs } = fire('mukjul');
    for (let i = 0; i < JUICE.special.hitstop + 2; i++) advance(s, inp());
    const other = tower(3, 'weak', 500);
    s.stack = other;
    advance(s, inp());
    expect(other.y).toBeLessThan(500); // 떨어진다 — 멈춘 건 벤 건물뿐
    runTo(s, WAZA_RUN.mukjul.burst, evs);
    expect(s.stack).toBe(other);
    expect(evs.find((e) => e.kind === 'wazaBurst')?.n).toBe(0);
  });

  it('시간차 필살이 도는 동안 새 필살은 거부', () => {
    const { s } = fire('dalmuri');
    s.wazaGauge = WAZA_GAUGE.MAX;
    s.player.pose = 'idle';
    s.hitstop = 0;
    advance(s, inp({ special: true }));
    expect(s.events.some((e) => e.kind === 'guardDenied')).toBe(true);
    expect(s.wazaGauge).toBe(WAZA_GAUGE.MAX);
  });

  it('면역 건물은 터질 때 맨 아래층만 깎는다', () => {
    const st = makeStack({ variant: 'cathedral', theme: 'europe', floors: Array.from({ length: 6 }, () => makeFloor('cathedral')), y: 300, specialImmune: true });
    const { s, evs } = fire('mukjul', st);
    runTo(s, WAZA_RUN.mukjul.burst, evs);
    expect(s.stack).not.toBeNull();
    expect(s.stack!.floors.length).toBe(5);
  });
});
