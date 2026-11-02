import { describe, it, expect } from 'vitest';
import {
  applyMissionEvent,
  claim,
  defById,
  ensureDaily,
  pickDailyIds,
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
    expect(a.items.length).toBe(4);
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

describe('일일 미션 풀 — 닿은 구역 (C6)', () => {
  const keys = Array.from({ length: 90 }, (_, i) => `2026-09-${String((i % 28) + 1).padStart(2, '0')}#${i}`);

  it('기와능선에 닿기는 그 구역에 닿은 사람에게만 뽑힌다', () => {
    for (const k of keys) {
      for (const reached of [0, 1]) expect(pickDailyIds(k, false, reached)).not.toContain('survive_giwa');
    }
    expect(keys.some((k) => pickDailyIds(k, false, 2).includes('survive_giwa'))).toBe(true);
  });

  it('닿은 사람의 추첨은 옛 추첨 그대로다 — 날짜 해시 결정성 유지', () => {
    for (const k of keys) expect(pickDailyIds(k, false, 2)).toEqual(pickDailyIds(k, false));
  });

  it('같은 날짜 · 같은 구역이면 같은 넷, 항상 넷이다', () => {
    for (const k of keys) {
      for (const reached of [0, 1, 2, 3]) {
        const a = pickDailyIds(k, true, reached);
        expect(a).toEqual(pickDailyIds(k, true, reached));
        expect(a).toHaveLength(4);
        expect(new Set(a).size).toBe(4);
      }
    }
  });

  it('ensureDaily가 도달 구역을 넘겨받는다', () => {
    for (let d = 1; d <= 60; d++) {
      const day = ensureDaily(null, Date.UTC(2026, 9, 1 + (d % 28), d % 24), false, 0);
      expect(day.items.map((p) => p.id)).not.toContain('survive_giwa');
    }
  });

  it('문구: 「기와능선에 닿기」', () => {
    const def = defById('survive_giwa')!;
    expect(def.title).toBe('기와능선에 닿기');
    expect(def.desc).toContain('닿');
    expect(def.desc).not.toContain('버틴다');
  });
});
