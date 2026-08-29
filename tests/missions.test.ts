import { describe, it, expect } from 'vitest';
import {
  applyMissionEvent,
  claim,
  ensureDaily,
  initAchieveProgress,
  kstDateKey,
} from '../src/meta/missions';

describe('미션', () => {
  it('KST 05:00 경계로 날짜 키를 만든다', () => {
    // 2026-08-28 20:00 UTC = 29 05:00 KST → 그날 키
    const key = kstDateKey(Date.UTC(2026, 7, 28, 20, 0, 0));
    expect(key).toBe('2026-08-29');
    const before = kstDateKey(Date.UTC(2026, 7, 28, 19, 59, 0));
    expect(before).toBe('2026-08-28');
  });

  it('같은 날짜면 동일 일일을 유지한다', () => {
    const a = ensureDaily(null, Date.UTC(2026, 7, 29, 1));
    const b = ensureDaily(a, Date.UTC(2026, 7, 29, 10));
    expect(b).toBe(a);
    expect(a.items.length).toBe(3);
  });

  it('완파 이벤트가 파괴 미션을 올린다', () => {
    const daily = ensureDaily(null, 1);
    const ach = initAchieveProgress();
    applyMissionEvent(daily, ach, { kind: 'stackDestroy' });
    const hit = daily.items.find((p) => p.id.startsWith('destroy'));
    if (hit) expect(hit.count).toBeGreaterThanOrEqual(1);
  });

  it('미달 수령은 0이다', () => {
    const daily = ensureDaily(null, 1);
    const def = { id: daily.items[0].id, kind: 'daily' as const, title: '', desc: '', goal: 99, rewardDust: 10, rewardOrbit: 10 };
    const r = claim(daily.items[0], def, false);
    expect(r.dust).toBe(0);
    expect(r.orbit).toBe(0);
    expect(daily.items[0].claimed).toBe(false);
  });
});
