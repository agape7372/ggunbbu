import { describe, it, expect } from 'vitest';
import { DUST_EXCHANGE, exchangeDust } from '../src/meta/economy';

describe('먼지 교환', () => {
  it('충분하면 먼지 50이 빠지고 궤도조각 5가 늘며 true', () => {
    const w = { dust: 120, orbit: 3 };
    expect(exchangeDust(w)).toBe(true);
    expect(w).toEqual({ dust: 120 - DUST_EXCHANGE.dust, orbit: 3 + DUST_EXCHANGE.orbit });
  });

  it('모자라면 false, 지갑 불변', () => {
    const w = { dust: 49, orbit: 3 };
    expect(exchangeDust(w)).toBe(false);
    expect(w).toEqual({ dust: 49, orbit: 3 });
  });
});
