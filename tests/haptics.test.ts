// 네이티브 진동 — 패턴을 [진동, 휴지, 진동…] 세그먼트로 풀어 순서대로 쏜다(예전엔 합산해 한 덩어리 진동).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vibrate, vibrationSteps } from '../src/platform/native';
import { HAPTIC } from '../src/config';

describe('vibrationSteps', () => {
  it('숫자 하나 = 진동 한 번', () => {
    expect(vibrationSteps(14)).toEqual([{ at: 0, ms: 14 }]);
    expect(vibrationSteps(0)).toEqual([]);
  });

  it('짝수 칸은 진동, 홀수 칸은 휴지 — 시작 시각이 휴지만큼 밀린다', () => {
    expect(vibrationSteps([100, 50, 200])).toEqual([{ at: 0, ms: 100 }, { at: 150, ms: 200 }]);
    expect(vibrationSteps(HAPTIC.bonusPerfect)).toEqual([
      { at: 0, ms: 20 }, { at: 50, ms: 20 }, { at: 100, ms: 40 },
    ]);
  });

  it('0ms 칸은 건너뛰고 시각만 흘린다', () => {
    expect(vibrationSteps([0, 30, 20])).toEqual([{ at: 30, ms: 20 }]);
  });

  it('한 번 상한 400ms', () => {
    expect(vibrationSteps(9999)).toEqual([{ at: 0, ms: 400 }]);
  });

  it('보스 격파 [100,50,100,50,200] — 세 번에 나뉜다(예전: 400ms 연속)', () => {
    expect(vibrationSteps(HAPTIC.bossDefeat)).toEqual([
      { at: 0, ms: 100 }, { at: 150, ms: 100 }, { at: 300, ms: 200 },
    ]);
  });
});

describe('vibrate — 네이티브 체인', () => {
  const calls: Array<{ t: number; ms: number }> = [];
  let now = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    calls.length = 0;
    now = 0;
    vi.stubGlobal('window', {
      Capacitor: {
        Plugins: {
          Haptics: {
            vibrate: (o: { duration: number }) => { calls.push({ t: Date.now() - now, ms: o.duration }); return Promise.resolve(); },
          },
        },
      },
    });
    now = Date.now();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('첫 진동은 바로, 나머지는 휴지 뒤에 순서대로', () => {
    vibrate([100, 50, 200]);
    expect(calls).toEqual([{ t: 0, ms: 100 }]);
    vi.advanceTimersByTime(149);
    expect(calls).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual([{ t: 0, ms: 100 }, { t: 150, ms: 200 }]);
  });

  it('새 패턴이 오면 이전 체인은 끊긴다', () => {
    vibrate([100, 50, 200]);   // 뒤 조각은 150ms에 예약
    vi.advanceTimersByTime(60);
    vibrate(14);               // 새 패턴 — 예약된 200ms 조각은 사라져야 한다
    vi.advanceTimersByTime(1000);
    expect(calls.map((c) => c.ms)).toEqual([100, 14]);
  });

  it('숫자 패턴은 타이머 없이 한 번', () => {
    vibrate(25);
    expect(calls).toEqual([{ t: 0, ms: 25 }]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('플러그인이 throw 해도 앱은 멀쩡하다', () => {
    vi.stubGlobal('window', { Capacitor: { Plugins: { Haptics: { vibrate: () => { throw new Error('boom'); } } } } });
    expect(() => vibrate([10, 10, 10])).not.toThrow();
    expect(() => vi.advanceTimersByTime(100)).not.toThrow();
  });
});
