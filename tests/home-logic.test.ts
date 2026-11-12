// 홈 현장: 일감 순서 · 「착수」 동작과 키 얼굴이 같은 판단 · 마지막 일감 저장 · 넓은 화면 키 밀기
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JOBS, butterTier, confirmLabel, homeFaces, jobAction, nextStage, stepJob, toJob, type HomeFacts } from '../src/ui/homeLogic';
import { STAGES } from '../src/core/stages';
import { emptyRecord, type StageRecord } from '../src/meta/stageRecord';
import { DEFAULT_LAYOUT, KEY_ACTIONS, resolveLayout, spreadSide } from '../src/input/layout';
import { DEFAULT_SAVE, loadSave, saveSave } from '../src/storage';
import { SAVE_KEY } from '../src/config';

const cleared = (n: number, lamp: 1 | 2 | 3 = 1): Record<string, StageRecord> =>
  Object.fromEntries(STAGES.slice(0, n).map((d) => [d.id, { ...emptyRecord(), lamp }]));

const facts = (o: Partial<HomeFacts> = {}): HomeFacts => ({
  act2Cleared: false, butterTierReached: 0, stages: {}, diffPick: 1, allOpen: false, ...o,
});

describe('일감 순서', () => {
  it('아케이드 · 작업 지시서 · 구역 작전 · 야근 · 버터바, 끝에서 돈다', () => {
    expect(JOBS).toEqual(['arcade', 'stage', 'ops', 'tokoton', 'butter']);
    expect(stepJob('arcade', -1)).toBe('butter');
    expect(stepJob('butter', 1)).toBe('arcade');
    expect(stepJob('stage', 1)).toBe('ops');
  });
  it('저장값 검증: 모르는 값 → 아케이드', () => {
    expect(toJob('ops')).toBe('ops');
    expect(toJob('stage2')).toBe('arcade');
    expect(toJob(3)).toBe('arcade');
    expect(toJob(undefined)).toBe('arcade');
  });
});

describe('확인 동작', () => {
  it('작업 지시서: 못 깬 첫 판을 바로, 다 깼으면 지도', () => {
    expect(nextStage({})).toBe(STAGES[0].id);
    expect(jobAction('stage', facts({ stages: cleared(4) }))).toEqual({ k: 'stage', id: STAGES[4].id, diff: 1 });
    expect(jobAction('stage', facts({ stages: cleared(STAGES.length) }))).toEqual({ k: 'stageMap' });
  });
  it('작업 지시서 난이도: 고른 난이도가 그 판에서 잠겼으면 정규', () => {
    expect(jobAction('stage', facts({ diffPick: 2 }))).toMatchObject({ diff: 1 });
    expect(jobAction('stage', facts({ diffPick: 0 }))).toMatchObject({ diff: 0 });
    expect(jobAction('stage', facts({ diffPick: 2, allOpen: true }))).toMatchObject({ diff: 2 });
  });
  it('야근: 2막 전엔 잠김', () => {
    expect(jobAction('tokoton', facts())).toEqual({ k: 'deny' });
    expect(jobAction('tokoton', facts({ act2Cleared: true }))).toEqual({ k: 'tokoton' });
  });
  it('버터바: 0 잠김 · 1회차 바로 · 2회차부터 고르기', () => {
    expect(jobAction('butter', facts())).toEqual({ k: 'deny' });
    expect(jobAction('butter', facts({ butterTierReached: 1 }))).toEqual({ k: 'butter1' });
    expect(jobAction('butter', facts({ butterTierReached: 2 }))).toEqual({ k: 'butterPick', tier: 2 });
    expect(butterTier(facts({ allOpen: true }))).toBe(3);
  });
});

describe('키 얼굴 = 확인 동작', () => {
  it('공격 키 이름은 jobAction 에서 나온다', () => {
    for (const job of JOBS) {
      for (const f of [facts(), facts({ act2Cleared: true, butterTierReached: 3, stages: cleared(STAGES.length) })]) {
        const face = homeFaces(job, f).attack;
        expect(face.label).toBe(confirmLabel(jobAction(job, f)));
        expect(face.tone).toBe(face.label === '잠김' ? 'faint' : 'seal');
      }
    }
  });
  it('점프 = 이전 · 가드 = 다음 · 필살 = 쉬는 키', () => {
    const f = homeFaces('arcade', facts());
    expect([f.jump.label, f.guard.label]).toEqual(['이전', '다음']);
    expect(f.special).toEqual({ label: '', tone: 'rest' });
    expect(homeFaces('ops', facts()).attack.label).toBe('고르기');
  });
});

describe('넓은 화면 키 밀기', () => {
  it('가운데 x < 120 왼쪽 · > 240 오른쪽 · 그 밖은 제자리', () => {
    expect(spreadSide('jump', 12)).toBe(-1);
    expect(spreadSide('attack', 228)).toBe(1);
    expect(spreadSide('guard', 110)).toBe(0);
    expect(spreadSide('special', 118)).toBe(0);
  });
  it('왼손잡이 배치는 방향도 뒤집힌다', () => {
    const r = resolveLayout(null, false);
    const l = resolveLayout(null, true);
    for (const a of KEY_ACTIONS) expect(spreadSide(a, l[a].x)).toBe(-spreadSide(a, r[a].x) || 0);
    expect(spreadSide('jump', DEFAULT_LAYOUT.jump.x)).toBe(-1);
  });
});

describe('마지막 일감 저장', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    };
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).localStorage;
  });

  it('왕복 · 옛 저장(키 없음)과 깨진 값은 아케이드', () => {
    saveSave({ ...structuredClone(DEFAULT_SAVE), homeJob: 'tokoton' });
    expect(loadSave().homeJob).toBe('tokoton');
    store.set(SAVE_KEY, JSON.stringify({ bestArcade: 1 }));
    expect(loadSave().homeJob).toBe('arcade');
    store.set(SAVE_KEY, JSON.stringify({ bestArcade: 1, homeJob: 'zzz' }));
    expect(loadSave().homeJob).toBe('arcade');
  });
});
