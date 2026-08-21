// 게이지 경제: 콤보 스케일 획득(최대율 10타=풀), 홀드 드레인, 성공 추가 소모.
import { describe, it, expect } from 'vitest';
import { gaugePerHit } from '../src/core/combat';
import { WAZA_GAUGE } from '../src/config';

describe('게이지 경제', () => {
  it('획득식: min(10, 1+floor(combo/10))', () => {
    expect(gaugePerHit(0)).toBe(1);
    expect(gaugePerHit(9)).toBe(1);
    expect(gaugePerHit(10)).toBe(2);
    expect(gaugePerHit(45)).toBe(5);
    expect(gaugePerHit(90)).toBe(10);
    expect(gaugePerHit(999)).toBe(10);
  });

  it('[정본] 최대 증가율 10타 = 풀 게이지', () => {
    expect(gaugePerHit(999) * 10).toBe(WAZA_GAUGE.MAX);
  });
});
