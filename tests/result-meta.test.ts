import { describe, expect, it } from 'vitest';
import { TICK, UI_FLOW } from '../src/config';
import { LOOK_DUST_COST, nextDustGoal, WEAPON_DUST_COST } from '../src/meta/economy';
import { ACHIEVES, claimableCount, DAILY_POOL, dailyDone } from '../src/meta/missions';
import type { DailyState, MissionProgress } from '../src/meta/types';

describe('nextDustGoal — 결과 카드의 다음 목표', () => {
  const cheapest = Math.min(...Object.values(WEAPON_DUST_COST));

  it('가장 싼 미보유 먼지 구매품을 고른다', () => {
    const g = nextDustGoal([], 0);
    expect(g).not.toBeNull();
    expect(g!.cost).toBe(cheapest);
    expect(g!.short).toBe(cheapest);
  });

  it('모자란 만큼만 돌려준다 — 먼지가 있으면 줄어든다', () => {
    expect(nextDustGoal([], 214)!.short).toBe(cheapest - 214);
  });

  it('살 수 있으면 short 0', () => {
    expect(nextDustGoal([], cheapest + 50)!.short).toBe(0);
  });

  it('이미 가진 건 건너뛰고 그다음으로 싼 것을 고른다', () => {
    const first = nextDustGoal([], 0)!;
    const second = nextDustGoal([first.id], 0)!;
    expect(second.id).not.toBe(first.id);
    expect(second.cost).toBeGreaterThanOrEqual(first.cost);
  });

  it('무기를 다 가지면 마스크, 그것까지 가졌으면 null', () => {
    expect(nextDustGoal(Object.keys(WEAPON_DUST_COST), 0)!.id).toBe('mask');
    expect(nextDustGoal([...Object.keys(WEAPON_DUST_COST), ...Object.keys(LOOK_DUST_COST)], 0)).toBeNull();
  });
});

describe('미션 배지 · 오늘 N/3', () => {
  const daily = (counts: [number, boolean][]): DailyState => ({
    dateKey: '2026-10-27',
    items: counts.map(([count, claimed], i) => ({ id: DAILY_POOL[i]!.id, count, claimed })),
  });

  it('daily가 없으면 0', () => {
    expect(claimableCount(null, [])).toBe(0);
    expect(dailyDone(null)).toEqual({ done: 0, total: 0 });
  });

  it('목표를 채웠고 아직 안 받은 것만 센다', () => {
    const d = daily([
      [DAILY_POOL[0]!.goal, false], // 받을 수 있음
      [DAILY_POOL[1]!.goal, true], // 이미 받음
      [0, false], // 미달
    ]);
    expect(claimableCount(d, [])).toBe(1);
  });

  it('업적도 센다', () => {
    const a: MissionProgress[] = [
      { id: ACHIEVES[0]!.id, count: ACHIEVES[0]!.goal, claimed: false },
      { id: ACHIEVES[1]!.id, count: 0, claimed: false },
    ];
    expect(claimableCount(null, a)).toBe(1);
  });

  it('오늘 N/3 — 받았든 아니든 채운 것이 한 건으로 센다', () => {
    const d = daily([
      [DAILY_POOL[0]!.goal, false],
      [DAILY_POOL[1]!.goal, true],
      [0, false],
    ]);
    expect(dailyDone(d)).toEqual({ done: 2, total: 3 });
  });
});

describe('화면 흐름 박자 (UI_FLOW)', () => {
  it('결과 카드는 약 0.5초 뒤 — 사망 연출이 보일 만큼, 답답하지 않을 만큼', () => {
    const sec = UI_FLOW.GAMEOVER_CARD_DELAY * TICK;
    expect(sec).toBeGreaterThanOrEqual(0.4);
    expect(sec).toBeLessThanOrEqual(0.7);
  });

  it('와이프는 구역 0.25초 · 보스 0.4초, 보스가 더 길다', () => {
    expect(UI_FLOW.WIPE_TICKS * TICK).toBeCloseTo(0.25, 2);
    expect(UI_FLOW.WIPE_BOSS_TICKS * TICK).toBeCloseTo(0.4, 2);
    expect(UI_FLOW.WIPE_BOSS_TICKS).toBeGreaterThan(UI_FLOW.WIPE_TICKS);
  });

  it('입력 잠금은 있되 1초를 넘지 않는다', () => {
    expect(UI_FLOW.GAMEOVER_LOCK).toBeGreaterThan(0);
    expect(UI_FLOW.GAMEOVER_LOCK * TICK).toBeLessThan(1);
  });
});
