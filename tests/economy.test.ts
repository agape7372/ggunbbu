import { describe, it, expect } from 'vitest';
import {
  DUST_EXCHANGE, EXCHANGE_DAILY, LICENSE_EXAMS, LICENSE_TITLES, examStatus, exchangeDust, exchangeLeft, licenseTitle, nextExam, takeExam,
} from '../src/meta/economy';
import { kstDateKey } from '../src/meta/missions';
import { DEFAULT_SAVE } from '../src/storage';

describe('철거 자격 (C4)', () => {
  const sheet = (license: number, buildings: number, dust: number) => ({ license, dust, stats: { buildings } });

  it('견습 → 3급 → 2급 → 1급, 응시는 셋', () => {
    expect(LICENSE_TITLES).toEqual(['견습', '3급', '2급', '1급']);
    expect(LICENSE_EXAMS).toHaveLength(LICENSE_TITLES.length - 1);
  });

  it('응시 조건과 응시료는 단계마다 오른다', () => {
    for (let i = 1; i < LICENSE_EXAMS.length; i++) {
      expect(LICENSE_EXAMS[i].buildings).toBeGreaterThan(LICENSE_EXAMS[i - 1].buildings);
      expect(LICENSE_EXAMS[i].fee).toBeGreaterThan(LICENSE_EXAMS[i - 1].fee);
    }
  });

  it('칭호와 다음 응시: 범위를 벗어난 등급도 안전하다', () => {
    expect(licenseTitle(0)).toBe('견습');
    expect(licenseTitle(3)).toBe('1급');
    expect(licenseTitle(99)).toBe('1급');
    expect(licenseTitle(-5)).toBe('견습');
    expect(nextExam(0)).toEqual(LICENSE_EXAMS[0]);
    expect(nextExam(3)).toBeNull();
  });

  it('조건 상태: 건물이 모자라면 buildings, 먼지가 모자라면 dust, 둘 다 되면 ok', () => {
    const e = LICENSE_EXAMS[0];
    expect(examStatus(0, e.buildings - 1, 99999)).toBe('buildings');
    expect(examStatus(0, e.buildings, e.fee - 1)).toBe('dust');
    expect(examStatus(0, e.buildings, e.fee)).toBe('ok');
    expect(examStatus(3, 99999, 99999)).toBe('max');
    // 건물과 먼지 둘 다 모자라면 건물이 먼저(조건이 먼저, 돈은 그다음)
    expect(examStatus(0, 0, 0)).toBe('buildings');
  });

  it('응시: 응시료가 빠지고 한 단계 오른다', () => {
    const e = LICENSE_EXAMS[0];
    const w = sheet(0, e.buildings + 5, e.fee + 40);
    expect(takeExam(w)).toBe(true);
    expect(w.license).toBe(1);
    expect(w.dust).toBe(40);
  });

  it('조건 미달이면 false, 지갑·등급 불변', () => {
    const e = LICENSE_EXAMS[0];
    const w = sheet(0, e.buildings - 1, 99999);
    expect(takeExam(w)).toBe(false);
    expect(w).toEqual(sheet(0, e.buildings - 1, 99999));
    const v = sheet(0, e.buildings, e.fee - 1);
    expect(takeExam(v)).toBe(false);
    expect(v.license).toBe(0);
    expect(v.dust).toBe(e.fee - 1);
  });

  it('1급이면 더 볼 시험이 없다', () => {
    const w = sheet(3, 99999, 99999);
    expect(takeExam(w)).toBe(false);
    expect(w.license).toBe(3);
  });

  it('차례대로 응시해야 1급이 된다 — 건너뛰기 없음', () => {
    const w = sheet(0, 99999, 99999);
    expect([takeExam(w), takeExam(w), takeExam(w), takeExam(w)]).toEqual([true, true, true, false]);
    expect(w.license).toBe(3);
    expect(w.dust).toBe(99999 - LICENSE_EXAMS.reduce((a, x) => a + x.fee, 0));
  });
});

describe('먼지 교환 — 하루 10번', () => {
  const day = () => ({ key: '', n: 0 });
  const K = '2026-11-10';

  it('충분하면 먼지 50이 빠지고 궤도조각 5가 늘며 횟수를 센다', () => {
    const w = { dust: 120, orbit: 3 };
    const d = day();
    expect(exchangeDust(w, d, K)).toBe(true);
    expect(w).toEqual({ dust: 120 - DUST_EXCHANGE.dust, orbit: 3 + DUST_EXCHANGE.orbit });
    expect(d).toEqual({ key: K, n: 1 });
    expect(exchangeLeft(d, K)).toBe(EXCHANGE_DAILY - 1);
  });

  it('모자라면 false, 지갑 · 횟수 불변', () => {
    const w = { dust: 49, orbit: 3 };
    const d = day();
    expect(exchangeDust(w, d, K)).toBe(false);
    expect(w).toEqual({ dust: 49, orbit: 3 });
    expect(d).toEqual({ key: '', n: 0 });
  });

  it('하루 열 번까지, 열한 번째는 거부하고 지급 0', () => {
    expect(EXCHANGE_DAILY).toBe(10);
    const w = { dust: 9999, orbit: 0 };
    const d = day();
    for (let i = 0; i < 10; i++) expect(exchangeDust(w, d, K)).toBe(true);
    expect(w).toEqual({ dust: 9999 - 500, orbit: 50 });
    expect(exchangeLeft(d, K)).toBe(0);
    expect(exchangeDust(w, d, K)).toBe(false);
    expect(w).toEqual({ dust: 9999 - 500, orbit: 50 });
    expect(d.n).toBe(10);
  });

  it('새로 세기는 오늘 미션과 같은 05:00 KST — 04:59:59는 어제, 05:00:00부터 0번째', () => {
    const before = Date.UTC(2026, 10, 9, 19, 59, 59); // 11월 10일 04:59:59 KST
    const after = before + 1000; // 05:00:00 KST
    expect(kstDateKey(before)).toBe('2026-11-09');
    expect(kstDateKey(after)).toBe('2026-11-10');
    const w = { dust: 9999, orbit: 0 };
    const d = day();
    for (let i = 0; i < 10; i++) exchangeDust(w, d, kstDateKey(before));
    expect(exchangeDust(w, d, kstDateKey(before + 999))).toBe(false); // 아직 어제
    expect(exchangeLeft(d, kstDateKey(after))).toBe(10);
    expect(exchangeDust(w, d, kstDateKey(after))).toBe(true);
    expect(d).toEqual({ key: '2026-11-10', n: 1 });
  });

  it('옛 저장 기본값은 0번이다', () => {
    expect(DEFAULT_SAVE.exchangeDay).toEqual({ key: '', n: 0 });
    expect(exchangeLeft(DEFAULT_SAVE.exchangeDay, K)).toBe(EXCHANGE_DAILY);
  });
});
