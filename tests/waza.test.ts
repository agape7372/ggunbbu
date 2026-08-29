import { describe, it, expect } from 'vitest';
import { makeState, advance } from '../src/core/sim';
import { makeFloor, makeStack } from '../src/core/building';
import { EMPTY_INPUT, type InputFrame } from '../src/core/types';
import { SPECIAL, WAZA_GAUGE } from '../src/config';

function inp(o: Partial<InputFrame> = {}): InputFrame {
  return { ...EMPTY_INPUT, ...o };
}

function tower() {
  return makeStack({
    variant: 'building',
    theme: 'europe',
    floors: Array.from({ length: 8 }, () => makeFloor('weak')),
    y: 80,
  });
}

describe('필살 3종', () => {
  it('천지개벽은 일반 스택을 한 틱에 지운다', () => {
    const s = makeState();
    s.waza = 'tenchi';
    s.wazaGauge = WAZA_GAUGE.MAX;
    s.stack = tower();
    advance(s, inp({ special: true }));
    expect(s.stack).toBeNull();
    expect(s.events.some((e) => e.kind === 'special')).toBe(true);
  });

  it('철벽은 파괴하지 않고 띄운다', () => {
    const s = makeState();
    s.waza = 'tetsu';
    s.wazaGauge = WAZA_GAUGE.MAX;
    s.stack = tower();
    const n = s.stack.floors.length;
    advance(s, inp({ special: true }));
    expect(s.stack).not.toBeNull();
    expect(s.stack!.floors.length).toBe(n);
    expect(s.stack!.resting).toBe(false);
    expect(s.stack!.vy).toBeGreaterThan(0);
  });

  it('올려베기는 일부 층만 접고 콤보를 올리지 않는다', () => {
    const s = makeState();
    s.waza = 'ageba';
    s.wazaGauge = WAZA_GAUGE.MAX;
    s.stack = tower();
    const n = s.stack.floors.length;
    advance(s, inp({ special: true }));
    expect(s.combo).toBe(0);
    if (s.stack) expect(s.stack.floors.length).toBeLessThan(n);
  });

  it('철벽은 화산탄을 지우지 않는다', () => {
    const s = makeState();
    s.waza = 'tetsu';
    s.wazaGauge = WAZA_GAUGE.MAX;
    s.groundRocks = 2;
    s.entities = [{ kind: 'rock', lane: 0, y: 80, vy: -40, hp: 2 }];
    advance(s, inp({ special: true }));
    expect(s.groundRocks).toBe(2);
    expect(s.entities.some((e) => e.kind === 'rock')).toBe(true);
  });

  it('면역 스택은 종류와 무관하게 최하층만 깎는다', () => {
    const s = makeState();
    s.waza = 'tenchi';
    s.wazaGauge = WAZA_GAUGE.MAX;
    s.stack = makeStack({
      variant: 'cathedral',
      theme: 'europe',
      floors: Array.from({ length: 6 }, () => makeFloor('cathedral')),
      y: 40,
      specialImmune: true,
    });
    advance(s, inp({ special: true }));
    expect(s.stack).not.toBeNull();
    expect(s.stack!.floors.length).toBe(5);
  });
});

// ★08-30 Wave 1: 필살 재설계 가드 (P1-4·D-5)
describe('필살 재설계 (08-30)', () => {
  it('올려베기는 HP 벽에서 멈추지 않고 최대 층수까지 접는다', () => {
    const s = makeState();
    s.waza = 'ageba';
    s.wazaGauge = WAZA_GAUGE.MAX;
    // hard(HP3) 8층 — 구코드는 첫 층 1대미지 후 종료(층 0 붕괴)
    s.stack = makeStack({
      variant: 'building',
      theme: 'europe',
      floors: Array.from({ length: 8 }, () => makeFloor('hard')),
      y: 20,
    });
    advance(s, inp({ special: true }));
    expect(s.stack!.floors.length).toBe(8 - SPECIAL.AGEBA_FLOORS);
  });

  it('허공 필살은 거부되고 게이지를 태우지 않는다', () => {
    const s = makeState();
    s.wazaGauge = WAZA_GAUGE.MAX;
    advance(s, inp({ special: true })); // 스택·보스·투사체·더미 전무
    expect(s.wazaGauge).toBe(WAZA_GAUGE.MAX);
    expect(s.player.pose).not.toBe('special');
    expect(s.events.some((e) => e.kind === 'guardDenied')).toBe(true);
  });

  it('게이지 부족 필살은 거부음 이벤트를 낸다 (조용한 무반응 금지)', () => {
    const s = makeState();
    s.wazaGauge = 10;
    s.stack = tower();
    advance(s, inp({ special: true }));
    expect(s.player.pose).not.toBe('special');
    expect(s.events.some((e) => e.kind === 'guardDenied')).toBe(true);
  });
});
