// 작업 지시서 기록 — 램프 · 도장 · 최고 기록 · 열림 · 저장 검증 · 보고서 글.
import { describe, it, expect } from 'vitest';
import { STAGES } from '../src/core/stages';
import type { StageResult } from '../src/core/stage';
import {
  chaeBehind, diffUnlocked, emptyRecord, hasStamp, kstDate, mergeResult, stageUnlocked, stampBits, validateStageRecords,
  type StageRecord,
} from '../src/meta/stageRecord';
import { STAGE_MODE, STAGE_TEXT, REGIONS, stageOutro, fmtGap } from '../src/content/stages';

function result(o: Partial<StageResult>): StageResult {
  return {
    id: '1-1', diff: 1, cleared: true, ticks: 2000, score: 100, peakCombo: 10,
    stamps: { done: true, safe: true, inTime: true, secret: false, master: false }, splits: [], extra: false, ...o,
  };
}

describe('기록 합치기', () => {
  it('정규만 시간 · 도장을 남기고, 도장은 한 번 찍히면 남는다', () => {
    let rec = emptyRecord();
    ({ rec } = mergeResult(rec, result({ diff: 0, ticks: 1500 }), '2026-10-31'));
    expect(rec.lamp).toBe(1);
    expect(rec.best).toBe(0); // 견습은 시간을 안 남긴다
    const m = mergeResult(rec, result({ ticks: 2000, stamps: { done: true, safe: false, inTime: true, secret: true, master: false } }), '2026-11-01');
    expect(m.news.lampUp).toBe(true);
    expect(m.news.newBest).toBe(true);
    expect(m.rec.best).toBe(2000);
    expect(m.rec.first).toBe('2026-10-31'); // 첫 철거 날은 견습 날
    const m2 = mergeResult(m.rec, result({ ticks: 2400, stamps: { done: true, safe: true, inTime: false, secret: false, master: false } }), '2026-11-02');
    expect(m2.rec.best).toBe(2000); // 느린 판은 최고를 안 바꾼다
    expect(hasStamp(m2.rec.stamps, 'safe')).toBe(true);
    expect(hasStamp(m2.rec.stamps, 'secret')).toBe(true); // 지난번 도장이 남는다
    expect(m2.news.newStamps).toBe(stampBits({ done: false, safe: true, inTime: false, secret: false, master: false }));
  });

  it('못 깬 판은 램프 · 도장을 안 바꾼다', () => {
    const { rec, news } = mergeResult(emptyRecord(), result({ cleared: false, stamps: { done: false, safe: false, inTime: false, secret: false, master: false } }), '2026-10-31');
    expect(rec).toEqual(emptyRecord());
    expect(news.firstClear).toBe(false);
  });

  it('외주는 램프만 올린다', () => {
    const { rec } = mergeResult(emptyRecord(), result({ diff: 2, ticks: 900 }), '2026-10-31');
    expect(rec.lamp).toBe(3);
    expect(rec.best).toBe(0);
  });
});

describe('열림', () => {
  it('첫 판만 열려 있고, 앞 판을 깨면(난이도 무관) 다음이 열린다', () => {
    const recs: Record<string, StageRecord> = {};
    expect(stageUnlocked(recs, '1-1')).toBe(true);
    expect(stageUnlocked(recs, '1-2')).toBe(false);
    recs['1-1'] = { ...emptyRecord(), lamp: 1 };
    expect(stageUnlocked(recs, '1-2')).toBe(true);
    expect(stageUnlocked(recs, '2-1')).toBe(false);
  });

  it('외주는 정규를 깨야 열린다', () => {
    expect(diffUnlocked({ ...emptyRecord(), lamp: 1 }, 2)).toBe(false);
    expect(diffUnlocked({ ...emptyRecord(), lamp: 2 }, 2)).toBe(true);
    expect(diffUnlocked(emptyRecord(), 1)).toBe(true);
  });
});

describe('저장 검증', () => {
  it('모르는 판 · 깨진 칸은 버리고 나머지는 살린다', () => {
    const v = validateStageRecords({ '1-1': { lamp: 9, stamps: 999, best: -5, first: 'x', tries: 2.7 }, zz: { lamp: 1 }, '1-2': 'bad' });
    expect(Object.keys(v)).toEqual(['1-1']);
    expect(v['1-1']).toMatchObject({ lamp: 3, stamps: 31, best: 0, first: '', tries: 2 });
    expect(validateStageRecords(null)).toEqual({});
  });

  it('옛 저장에 code 칸이 남아 있어도 오류 없이 읽고, 다른 칸은 그대로 두고 code만 버린다', () => {
    const old = { lamp: 2, stamps: 7, best: 1800, score: 4200, combo: 31, code: 'GB1.abcdef', tries: 5, clears: 3, first: '2026-10-31' };
    const v = validateStageRecords({ '1-1': old });
    const { code, ...rest } = old;
    expect(code).toBe('GB1.abcdef');
    expect(v['1-1']).toEqual(rest);
    expect(v['1-1']).not.toHaveProperty('code');
    expect(Object.keys(emptyRecord())).not.toContain('code');
  });
});

describe('보고서 글', () => {
  it('판마다 이름 · 지시서 세 줄 · 수수께끼가 있다', () => {
    for (const d of STAGES) {
      const t = STAGE_TEXT[d.id];
      expect(t, d.id).toBeDefined();
      expect(t.order).toHaveLength(3);
      expect(t.riddle.length).toBeGreaterThan(0);
    }
    expect(REGIONS).toHaveLength(5);
  });

  it('퇴장 대사: 특기 사항 > 필살 > 베기', () => {
    expect(stageOutro('1-B', { secret: true, finishSpecial: true })[0]).toBe('종은 끝까지 종이었다.');
    expect(stageOutro('1-B', { secret: false, finishSpecial: true })[0]).toBe('종이 한 번에 울렸다.');
    expect(stageOutro('1-B', { secret: false, finishSpecial: false })[0]).toBe('종탑은 시간을 알렸다.');
    expect(stageOutro('HQ', { secret: false, finishSpecial: true })[0]).toBe('집행기가 멈췄다.');
    expect(stageOutro('1-1', { secret: true, finishSpecial: false })).toEqual([]);
  });

  it('퇴장 대사: 2판 기믹이 가장 앞 — 없는 판(4-B · HQ · 일반 판)은 다음 순서로 떨어진다', () => {
    expect(stageOutro('1-B', { secret: true, finishSpecial: true, extra: true })).toEqual(['13시였다.']);
    expect(stageOutro('2-B', { secret: false, finishSpecial: false, extra: true })).toEqual(['좌판은 상인 것이었다.']);
    expect(stageOutro('3-B', { secret: true, finishSpecial: true, extra: true })).toEqual(['풍경이 아홉 번 울렸다.']);
    expect(stageOutro('1-B', { secret: true, finishSpecial: true, extra: false })[0]).toBe('종은 끝까지 종이었다.');
    expect(stageOutro('4-B', { secret: true, finishSpecial: false, extra: true })[0]).toBe('짐은 한 번도 땅을 안 밟았다.');
    expect(stageOutro('1-1', { secret: false, finishSpecial: false, extra: true })).toEqual([]);
  });

  it('참고 줄은 명물 판 넷에만 있다', () => {
    expect(STAGES.filter((d) => STAGE_TEXT[d.id].note).map((d) => d.id)).toEqual(['1-B', '2-B', '3-B', '4-B']);
    expect(STAGE_TEXT['2-B'].note).toBe('좌판은 상인 것이다.');
    expect(STAGE_MODE.note).toBe('참고');
  });

  it('「미처리 N건」 = 전임자가 끝냈을 때 남은 걸음', () => {
    expect(chaeBehind([100, 200, 300, 400], 250)).toBe(2);
    expect(chaeBehind([500], 250)).toBe(0); // 보스판은 건으로 안 센다
  });

  it('차이 글자: 0.05초 미만은 두 자리 — 「0.0초」가 안 나온다', () => {
    expect([0, 1, 2, 3, 108].map(fmtGap)).toEqual(['0.0', '0.02', '0.03', '0.1', '1.8']);
  });

  it('첫 철거 날짜는 한국 시각', () => {
    expect(kstDate(Date.UTC(2026, 9, 31, 15, 30))).toBe('2026-11-01');
  });
});
