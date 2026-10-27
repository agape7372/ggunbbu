// 구역 인트로 사다리(C13): 첫 판 3줄 → 같은 세션 2~4판 1줄 → 이후 머리말 0.8초, 평생 첫 판에만 숨은 줄.
import { describe, it, expect } from 'vitest';
import { INTRO, TPS } from '../src/config';
import { CHAPTER_LINES, INTRO_HIDDEN_LINE, introFor } from '../src/content/story';
import { REGIONS } from '../src/content/world';

describe('구역 인트로 사다리', () => {
  it('세션 첫 판 = 현행 3줄', () => {
    const p = introFor(1, false);
    expect(p.lines).toEqual(CHAPTER_LINES[0]);
    expect(p.ticks).toBe(INTRO.FIRST_TICKS);
  });

  it('평생 첫 판에만 숨은 줄이 하나 붙는다', () => {
    const p = introFor(1, true);
    expect(p.lines).toEqual([...CHAPTER_LINES[0], INTRO_HIDDEN_LINE]);
    for (const nth of [2, 3, 4, 5, 9]) expect(introFor(nth, false).lines).not.toContain(INTRO_HIDDEN_LINE);
    expect(introFor(1, false).lines).not.toContain(INTRO_HIDDEN_LINE);
  });

  it('2~4판째 = 한 줄 「또.」', () => {
    for (let nth = 2; nth <= INTRO.SHORT_UNTIL; nth++) {
      const p = introFor(nth, false);
      expect(p.lines).toEqual([`${REGIONS[0].headline}. 또.`]);
      expect(p.ticks).toBe(INTRO.SHORT_TICKS);
    }
  });

  it('5판째부터 = 머리말만 0.8초, 끝까지 그대로', () => {
    for (const nth of [INTRO.SHORT_UNTIL + 1, 10, 500]) {
      const p = introFor(nth, false);
      expect(p.lines).toEqual([`${REGIONS[0].headline}.`]);
      expect(p.ticks).toBe(INTRO.HEAD_TICKS);
      expect(p.ticks / TPS).toBeCloseTo(0.8, 5);
    }
  });

  it('뒤 칸일수록 짧다 — 줄 수도 시간도 오르지 않는다', () => {
    const rungs = [introFor(1, false), introFor(2, false), introFor(INTRO.SHORT_UNTIL + 1, false)];
    for (let i = 1; i < rungs.length; i++) {
      expect(rungs[i].lines.length).toBeLessThanOrEqual(rungs[i - 1].lines.length);
      expect(rungs[i].ticks).toBeLessThanOrEqual(rungs[i - 1].ticks);
    }
  });

  it('판 수가 이상해도(0·음수·소수) 죽지 않는다 — 첫 판으로 본다', () => {
    for (const n of [0, -3, 0.4, NaN]) expect(introFor(n, false).lines).toEqual(CHAPTER_LINES[0]);
  });
});
