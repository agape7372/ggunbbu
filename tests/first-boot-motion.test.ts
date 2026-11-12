// 새 저장의 첫 부팅 — OS 「동작 줄이기」를 흔들림 · 번쩍임 기본값에 한 번만 반영한다(감사 feel-03)
import { describe, expect, it } from 'vitest';
import { SAVE_KEY } from '../src/config';
import { firstBootFeedback } from '../src/ui/settings';

const store = (keys: string[]) => (k: string): string | null => (keys.includes(k) ? '{}' : null);

describe('첫 부팅 동작 줄이기', () => {
  it('저장이 없고 동작 줄이기면 흔들림 · 번쩍임을 약하게(1)', () => {
    expect(firstBootFeedback(store([]), true)).toEqual({ shakeLevel: 1, flashLevel: 1 });
  });

  it('동작 줄이기가 아니면 그대로', () => {
    expect(firstBootFeedback(store([]), false)).toBeNull();
  });

  it('저장(본 키 · .bak)이 있으면 사용자가 고른 값이라 건드리지 않는다', () => {
    expect(firstBootFeedback(store([SAVE_KEY]), true)).toBeNull();
    expect(firstBootFeedback(store([`${SAVE_KEY}.bak`]), true)).toBeNull();
  });

  it('저장소를 못 읽으면 건드리지 않는다', () => {
    expect(firstBootFeedback(() => { throw new Error('막힘'); }, true)).toBeNull();
  });
});
