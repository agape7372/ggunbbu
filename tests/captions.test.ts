// 판 도중 자막(C11): 콤보 100·500 첫 도달 · 판 중 기록 돌파 · 구역 도달 — 전부 판당 한 번.
import { describe, it, expect } from 'vitest';
import { createRunCaps } from '../src/ui/runCaps';
import { CAPTIONS } from '../src/content';
import { REGIONS } from '../src/content/world';

const texts = (c: ReturnType<ReturnType<typeof createRunCaps>['observe']>): string[] => c.map((x) => x.text);

describe('콤보 이정표 자막', () => {
  it('100을 처음 넘는 틱에 「실화냐」, 500에 「그만하면 됩니다」', () => {
    const caps = createRunCaps({ prevBest: 0, countsRecord: false });
    expect(texts(caps.observe({ combo: 99, score: 0 }))).toEqual([]);
    expect(texts(caps.observe({ combo: 100, score: 0 }))).toEqual([CAPTIONS.combo100]);
    for (let c = 101; c < 500; c++) expect(caps.observe({ combo: c, score: 0 })).toEqual([]);
    expect(texts(caps.observe({ combo: 500, score: 0 }))).toEqual([CAPTIONS.combo500]);
  });

  it('판당 한 번 — 끊겼다 다시 올라도 또 안 뜬다', () => {
    const caps = createRunCaps({ prevBest: 0, countsRecord: false });
    caps.observe({ combo: 99, score: 0 });
    expect(texts(caps.observe({ combo: 100, score: 0 }))).toEqual([CAPTIONS.combo100]);
    caps.observe({ combo: 0, score: 0 });
    caps.observe({ combo: 99, score: 0 }); // 실제론 한 칸씩 올라온다 — 점프 검사는 건너뛰어도 100 도달만 본다
    expect(texts(caps.observe({ combo: 100, score: 0 }))).toEqual([]);
  });

  it('한 번에 크게 뛴 콤보(이어하기)는 타격이 아니라 세지 않는다', () => {
    const caps = createRunCaps({ prevBest: 0, countsRecord: false });
    expect(texts(caps.observe({ combo: 168, score: 0 }))).toEqual([]);
    expect(texts(caps.observe({ combo: 169, score: 0 }))).toEqual([]);
  });

  it('50·200 이정표는 소리만 있고 자막은 없다 (자막 소음 방지)', () => {
    const caps = createRunCaps({ prevBest: 0, countsRecord: false });
    expect(texts(caps.observe({ combo: 49, score: 0 }))).toEqual([]);
    expect(texts(caps.observe({ combo: 50, score: 0 }))).toEqual([]);
    for (let c = 51; c < 200; c++) caps.observe({ combo: c, score: 0 });
    expect(texts(caps.observe({ combo: 200, score: 0 }))).toEqual([]);
  });
});

describe('기록 돌파 자막', () => {
  it('이전 최고를 처음 넘는 틱에 한 번, 효과음 표시와 함께', () => {
    const caps = createRunCaps({ prevBest: 5000, countsRecord: true });
    expect(caps.observe({ combo: 0, score: 5000 })).toEqual([]);
    const hit = caps.observe({ combo: 0, score: 5001 });
    expect(texts(hit)).toEqual([CAPTIONS.record]);
    expect(hit[0].blip).toBe(true);
    expect(caps.observe({ combo: 0, score: 99999 })).toEqual([]);
  });

  it('0점 기록이면 돌파가 아니다 — 첫 판의 첫 점수에 뜨지 않는다', () => {
    const caps = createRunCaps({ prevBest: 0, countsRecord: true });
    expect(caps.observe({ combo: 0, score: 3000 })).toEqual([]);
  });

  it('기록에 안 들어가는 판(작전·디버그)은 뜨지 않는다', () => {
    const caps = createRunCaps({ prevBest: 100, countsRecord: false });
    expect(caps.observe({ combo: 0, score: 99999 })).toEqual([]);
  });

  it('시작 때 든 최고 기록 기준 — 판 도중 저장이 최고를 올려도 흔들리지 않는다', () => {
    const caps = createRunCaps({ prevBest: 1000, countsRecord: true });
    expect(texts(caps.observe({ combo: 0, score: 1500 }))).toEqual([CAPTIONS.record]);
    expect(caps.observe({ combo: 0, score: 1600 })).toEqual([]);
  });
});

describe('구역 도달 자막', () => {
  it('구역 이름을 한 번만 띄운다', () => {
    const caps = createRunCaps({ prevBest: 0, countsRecord: false });
    expect(texts(caps.observe({ combo: 0, score: 0, zone: 1 }))).toEqual([REGIONS[1].name]);
    expect(caps.observe({ combo: 0, score: 0, zone: 1 })).toEqual([]);
    expect(texts(caps.observe({ combo: 0, score: 0, zone: 2 }))).toEqual([REGIONS[2].name]);
  });

  it('한 틱에 여럿이 겹쳐도 자막은 하나 — 마지막에 읽혀야 할 것 하나', () => {
    const caps = createRunCaps({ prevBest: 10, countsRecord: true });
    caps.observe({ combo: 99, score: 5 });
    const out = caps.observe({ combo: 100, score: 50, zone: 1 });
    expect(out.length).toBeLessThanOrEqual(1);
    expect(texts(out)).toEqual([CAPTIONS.record]);
  });
});
