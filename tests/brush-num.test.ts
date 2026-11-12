import { describe, expect, it } from 'vitest';
import { brushNum } from '../src/ui/html';

// 붓글씨 제목 속 숫자만 --black(.bn)으로 — 붓글씨 2는 Z로 읽힌다(S5)
describe('brushNum', () => {
  it('숫자 덩어리(쉼표 · 점 포함)만 감싸고 나머지는 이스케이프한다', () => {
    expect(brushNum('3일째 출근')).toBe('<span class="bn">3</span>일째 출근');
    expect(brushNum('철거 2,000채 <b>')).toBe('철거 <span class="bn">2,000</span>채 &lt;b&gt;');
    expect(brushNum('신입 특가')).toBe('신입 특가');
  });
});
