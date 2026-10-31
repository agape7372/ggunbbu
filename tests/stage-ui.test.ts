// 작업 지시서 화면의 순수 셈 — 사유 고르기 · HUD 줄 · 진척 · 보고서 한 장 · 일지 합계. 그리기는 화면 검수.
import { describe, expect, it } from 'vitest';
import { STAGES } from '../src/core/stages';
import { stageDef, type StageResult } from '../src/core/stage';
import { fmtStageTime } from '../src/content/stages';
import { runStage } from './stageBot';
import { emptyRecord, mergeResult, stampBits } from '../src/meta/stageRecord';
import {
  bossName, endView, masterLine, pickReason, progressText, stageHudLine, stampTotals, workProgress,
} from '../src/ui/stageLogic';

const ALL = { done: true, safe: true, inTime: true, secret: true, master: true };

function result(o: Partial<StageResult>): StageResult {
  return { id: '1-1', diff: 1, cleared: true, ticks: 3000, score: 100, peakCombo: 10, stamps: { ...ALL }, splits: [], extra: false, ...o };
}

describe('반려 사유', () => {
  const def = stageDef('1-1');
  it('못 찍은 첫 자리 하나: 접수 > 이상 없음 > 기한 내 > 전임자 확인', () => {
    expect(pickReason(result({ cleared: false, stamps: { ...ALL, done: false } }), 0)).toBe('사유: 미완료.');
    expect(pickReason(result({ stamps: { ...ALL, safe: false, inTime: false } }), 2)).toBe('사유: 목숨 2.');
    expect(pickReason(result({ stamps: { ...ALL, safe: false } }), 0)).toBe('사유: 안전모.');
    expect(pickReason(result({ ticks: def.par + 90, stamps: { ...ALL, inTime: false, master: false } }), 0)).toBe('사유: 1.5초 늦음.');
  });

  it('전임자 확인은 차이를 「미처리 N건」으로 말한다 — 전임자 걸음 기록보다 늦은 걸음 수', () => {
    const splits = [300, 700, def.master - 10, def.master + 50, def.master + 90];
    const line = pickReason(result({ ticks: def.master + 108, splits, stamps: { ...ALL, master: false } }), 0);
    expect(line).toBe('사유: 1.8초. 미처리 2건.');
  });

  it('특기 사항만 비면 사유가 없다(수수께끼가 그 자리 밑에 늘 보인다)', () => {
    expect(pickReason(result({ stamps: { ...ALL, secret: false } }), 0)).toBe('');
  });
});

describe('판 위 한 줄과 진척', () => {
  it('「id 이름 · 시간 · 걸음」, 대본이 빈 보스판은 걸음을 뺀다', () => {
    expect(stageHudLine({ id: '1-1', ticks: 12 * 60, step: 3, total: 7 })).toBe('1-1 회랑 3번지 · 0:12.00 · 3/7');
    expect(stageHudLine({ id: '1-B', ticks: 90, step: 0, total: 0 })).toBe('1-B 종탑 · 0:01.50');
  });

  it('걸음 셈은 쉼을 뺀다 — 보스 아닌 판은 총 걸음 = 봇이 깬 판의 splits 수, 1-2는 건물 9채', () => {
    for (const d of STAGES.filter((x) => !x.boss)) {
      const run = runStage(d.id, 1);
      expect(run.result.cleared, d.id).toBe(true);
      expect(workProgress(d.id, 0), d.id).toEqual({ done: 0, total: run.result.splits.length });
    }
    expect(workProgress('1-2', 0).total).toBe(9);
    expect(workProgress('1-2', 999).done).toBe(9); // 끝까지 가면 총 걸음과 같다
  });

  it('못 깬 진척: 대본 중이면 걸음, 명물 앞이면 명물 이름(집행기는 자기 이름)', () => {
    expect(progressText({ id: '2-1', step: 4, total: 9, phase: 'script' })).toBe('4/9');
    expect(progressText({ id: '1-B', step: 0, total: 0, phase: 'boss' })).toBe('종탑');
    expect(progressText({ id: 'HQ', step: 9, total: 9, phase: 'boss' })).toBe(bossName('HQ'));
    expect(bossName('HQ')).not.toBe('본사');
  });

  it('전임자 줄: 같은 시간이면 동률', () => {
    expect(masterLine(1700, 1680)).toBe('전임자 0:28.00');
    expect(masterLine(1608, 1680)).toBe('전임자 0:28.00 · 1.2초 앞');
    expect(masterLine(1680, 1680)).toBe('전임자 0:28.00 · 동률');
  });
});

describe('철거 보고서 한 장', () => {
  const rec = emptyRecord();
  const base = {
    lifeLost: 0, finishSpecial: false, step: 7, total: 7, phase: 'done' as const, nextId: null as string | null,
  };

  it('정규를 깨면 시간 · 도장 비트 · 전임자 줄이 서고, 뒷면은 착수 · 철거 · 첫 철거', () => {
    const r = result({ stamps: { ...ALL, secret: false } });
    const m = mergeResult(rec, r, '2026-10-31');
    const v = endView({ ...base, kind: 'real', result: r, news: m.news, rec: m.rec });
    expect(v.time).toBe(fmtStageTime(3000));
    expect(v.stamps).toBe(stampBits(r.stamps));
    expect(v.newStamps).toBe(stampBits(r.stamps));
    expect(v.master).toBe(masterLine(3000, stageDef('1-1').master));
    expect(v.firstClear).toBe(true);
    expect(v.newBest).toBe(true);
    expect(v.prevBest).toBe(''); // 전 기록 없음
    expect(v.flip).toBe('착수 0 · 철거 1 · 첫 철거 2026-10-31');
    expect(v.riddle).toBe('막지 않아도 되는 날이 있다.');
  });

  it('견습 · 외주는 도장 · 전임자 줄이 없다', () => {
    for (const diff of [0, 2] as const) {
      const r = result({ diff });
      const v = endView({ ...base, kind: 'real', result: r, news: mergeResult(rec, r, 'd').news, rec: null });
      expect(v.stamps).toBe(0);
      expect(v.master).toBe('');
      expect(v.reason).toBe('');
    }
  });

  it('못 깬 판: 시간 자리에 진척, 사유는 미완료', () => {
    const r = result({ cleared: false, ticks: 900, stamps: { done: false, safe: false, inTime: false, secret: false, master: false } });
    const v = endView({ ...base, kind: 'real', result: r, step: 3, phase: 'script', news: mergeResult(rec, r, 'd').news, rec: null });
    expect(v.time).toBe('3/7');
    expect(v.reason).toBe('사유: 미완료.');
  });

  it('보스 연습은 기록 없이 시간 · 깼나만, 퇴장 대사 없음. 보스 판을 진짜로 깼으면 대사가 선다', () => {
    const id = '1-B';
    const r = result({ id, ticks: 2800 });
    const pr = endView({ ...base, kind: 'practice', result: r, news: null, rec: null });
    expect(pr.stamps).toBe(0);
    expect(pr.outro).toEqual([]);
    const real = endView({ ...base, kind: 'real', result: r, news: mergeResult(rec, r, 'd').news, rec: null });
    expect(real.outro.length).toBeGreaterThan(0);
    // 2판 기믹(result.extra)을 채우면 퇴장 대사가 그 줄로 바뀐다 — 연습에선 여전히 없다
    const xr = result({ id, ticks: 2800, extra: true });
    const x = endView({ ...base, kind: 'real', result: xr, news: mergeResult(rec, xr, 'd').news, rec: null });
    expect(x.outro).toEqual(['13시였다.']);
    expect(endView({ ...base, kind: 'practice', result: xr, news: null, rec: null }).outro).toEqual([]);
  });
});

describe('현장 일지 합계', () => {
  it('정규 도장 수 / 65, 전임자 확인 수 / 13', () => {
    expect(STAGES.length).toBe(13);
    const t = stampTotals({ '1-1': { ...emptyRecord(), stamps: 0b11111 }, '1-2': { ...emptyRecord(), stamps: 0b10001 } });
    expect(t).toEqual({ stamps: 7, stampMax: 65, masters: 2, masterMax: 13 });
  });
});
