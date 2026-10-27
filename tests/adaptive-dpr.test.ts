// 적응형 해상도(T6 ①): 1초 평균이 20ms 넘는 상태가 2초 이어질 때만 한 단계씩 내린다.
import { describe, it, expect } from 'vitest';
import { createAdaptiveDpr, nextDprStep } from '../src/render/adaptiveDpr';

/** 같은 간격으로 ms만큼 흘려 보내며 처음 내려가는 순간의 {dpr, 경과 ms}를 돌려준다. */
function run(dt: number, totalMs: number, dpr = 2): { dpr: number | null; at: number } {
  const a = createAdaptiveDpr();
  let t = 0;
  while (t < totalMs) {
    t += dt;
    const lower = a.sample(dt, dpr);
    if (lower !== null) return { dpr: lower, at: t };
  }
  return { dpr: null, at: t };
}

describe('적응형 해상도', () => {
  it('사다리는 2 → 1.5 → 1 → 끝', () => {
    expect(nextDprStep(2)).toBe(1.5);
    expect(nextDprStep(1.5)).toBe(1);
    expect(nextDprStep(1)).toBeNull();
    expect(nextDprStep(2.625)).toBe(2);
  });

  it('60fps(16.7ms)나 120fps는 오래 돌아도 안 내린다', () => {
    expect(run(1000 / 60, 30000).dpr).toBeNull();
    expect(run(1000 / 120, 30000).dpr).toBeNull();
  });

  it('30fps(33ms)가 이어지면 1초 창이 차고 2초를 더 버틴 뒤(3초쯤) 한 단계 내린다', () => {
    const r = run(33, 10000);
    expect(r.dpr).toBe(1.5);
    expect(r.at).toBeGreaterThanOrEqual(2900);
    expect(r.at).toBeLessThanOrEqual(3300);
  });

  it('한 번 크게 멈춘 프레임(복귀·GC)은 100ms로 잘려 단독으로는 안 내린다', () => {
    const a = createAdaptiveDpr();
    let got: number | null = null;
    for (let i = 0; i < 600 && got === null; i++) got = a.sample(i === 300 ? 900 : 16.7, 2);
    expect(got).toBeNull();
  });

  it('느린 상태가 중간에 풀리면 2초 타이머가 처음부터 다시 시작한다', () => {
    const a = createAdaptiveDpr();
    let got: number | null = null;
    for (let i = 0; i < 60 && got === null; i++) got = a.sample(33, 2); // 약 2초 느림(창 채우는 1초 포함)
    for (let i = 0; i < 200 && got === null; i++) got = a.sample(10, 2);  // 빠르게 회복
    expect(got).toBeNull();
  });

  it('이미 1배면 더 내리지 않는다', () => {
    expect(run(50, 20000, 1).dpr).toBeNull();
  });
});
