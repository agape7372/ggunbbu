import { describe, it, expect } from 'vitest';
import { EMPTY_INPUT, type InputFrame } from '../src/core/types';
import { debounceSpecial, mergeFrame, SPECIAL_DEBOUNCE_MS } from '../src/input/input';

function f(p: Partial<InputFrame>): InputFrame {
  return { ...EMPTY_INPUT, ...p };
}

describe('mergeFrame', () => {
  it('키보드만 있으면 그대로', () => {
    const kb = f({ attack: true, guard: true });
    expect(mergeFrame(kb, null)).toEqual(kb);
  });

  it('터치 엣지와 키보드 홀드를 합친다 (가드+공격 동시)', () => {
    expect(mergeFrame(f({ guard: true }), f({ attack: true }))).toEqual(
      f({ guard: true, attack: true }),
    );
  });

  it('한쪽만 true여도 true (OR)', () => {
    expect(mergeFrame(f({ jump: true }), f({ jump: false })).jump).toBe(true);
    expect(mergeFrame(f({ special: false }), f({ special: true })).special).toBe(true);
  });
});

describe('debounceSpecial', () => {
  it('첫 필살은 통과', () => {
    const r = debounceSpecial(true, 1000, Number.NEGATIVE_INFINITY);
    expect(r.fire).toBe(true);
    expect(r.nextLast).toBe(1000);
  });

  it('창 안 재탭은 버린다 (오탭)', () => {
    const r = debounceSpecial(true, 1000 + SPECIAL_DEBOUNCE_MS - 1, 1000);
    expect(r.fire).toBe(false);
    expect(r.nextLast).toBe(1000);
  });

  it('창이 지나면 다시 통과', () => {
    const r = debounceSpecial(true, 1000 + SPECIAL_DEBOUNCE_MS, 1000);
    expect(r.fire).toBe(true);
    expect(r.nextLast).toBe(1000 + SPECIAL_DEBOUNCE_MS);
  });

  it('special=false면 마지막 통과 시각을 바꾸지 않는다', () => {
    const r = debounceSpecial(false, 5000, 1000);
    expect(r.fire).toBe(false);
    expect(r.nextLast).toBe(1000);
  });
});
