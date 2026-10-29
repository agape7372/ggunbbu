// 상점 칸 상태 — 보유가 지갑보다 먼저다(이미 가진 걸 「사기」로 다시 그리면 이중 결제 버튼이 된다)
import { describe, expect, it } from 'vitest';
import { cardState } from '../src/ui/shopView';

describe('상점 칸 상태', () => {
  it('보유면 지갑과 상관없이 보유', () => {
    expect(cardState(true, 0, 300)).toBe('owned');
    expect(cardState(true, 999, 300)).toBe('owned');
  });

  it('값과 같으면 살 수 있다, 하나 모자라면 모자람', () => {
    expect(cardState(false, 300, 300)).toBe('ok');
    expect(cardState(false, 299, 300)).toBe('short');
  });
});
