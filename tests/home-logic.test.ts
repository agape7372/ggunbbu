// 홈 현장: 일감 순서 · 「착수」 동작과 키 얼굴이 같은 판단 · 마지막 일감 저장 · 넓은 화면 키 밀기
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JOBS, butterTier, confirmLabel, homeFactsOf, homeFaces, jobAction, nextStage, slipLabel, stepJob, toJob, type HomeFacts } from '../src/ui/homeLogic';
import { EVENT_STAGES } from '../src/content';
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
  it('아케이드 · 작업 지시서 · 구역 작전 · 야근 · 이벤트 스테이지, 끝에서 돈다', () => {
    expect(JOBS).toEqual(['arcade', 'stage', 'ops', 'tokoton', 'event']);
    expect(stepJob('arcade', -1)).toBe('event');
    expect(stepJob('event', 1)).toBe('arcade');
    expect(stepJob('stage', 1)).toBe('ops');
  });
  it('저장값 검증: 모르는 값 → 아케이드', () => {
    expect(toJob('ops')).toBe('ops');
    expect(toJob('stage2')).toBe('arcade');
    expect(toJob(3)).toBe('arcade');
    expect(toJob(undefined)).toBe('arcade');
  });
  it('저장 호환: 옛 일감 butter(버터바 챌린지) → 이벤트 스테이지', () => {
    expect(toJob('butter')).toBe('event');
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
  it('이벤트 스테이지: 늘 열려 있고 목록(고르기)부터', () => {
    expect(jobAction('event', facts())).toEqual({ k: 'events' });
    expect(confirmLabel(jobAction('event', facts()))).toBe('고르기');
  });
  it('이벤트 목록에 버터바 챌린지가 있다', () => {
    expect(EVENT_STAGES.map((e) => e.id)).toContain('butter');
    expect(EVENT_STAGES.find((e) => e.id === 'butter')?.name).toBe('버터바 챌린지');
  });
  it('버터바 회차: 1회차는 처음부터 · 그 위는 저장 값(옛 기록 그대로)', () => {
    expect(butterTier(facts())).toBe(1);
    expect(butterTier(facts({ butterTierReached: 1 }))).toBe(1);
    expect(butterTier(facts({ butterTierReached: 2 }))).toBe(2);
    expect(butterTier(facts({ butterTierReached: 3 }))).toBe(3);
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
  it('쪽지 주홍 띠 = 쪽지 누름: 지시서는 늘 지도(고르기) · 잠김이면 띠 없음', () => {
    expect(slipLabel('arcade', facts())).toBe('착수');
    expect(slipLabel('stage', facts())).toBe('고르기');
    expect(slipLabel('ops', facts())).toBe('고르기');
    expect(slipLabel('event', facts())).toBe('고르기');
    expect(slipLabel('tokoton', facts())).toBe('');
    expect(slipLabel('tokoton', facts({ act2Cleared: true }))).toBe('착수');
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
  it('저장 호환: 옛 버터바 저장 → 새 판 로드 → 기록 · 회차 · 일감 그대로', () => {
    // 11-24 전 기기의 저장 — 버터바 일감을 골라 둔 채 2회차까지 만나고 회차별 최고점을 남겼다
    const old = { ...structuredClone(DEFAULT_SAVE), homeJob: 'butter', butterTierReached: 2, butterBest: { 1: 12_345, 2: 67_890 } };
    store.set(SAVE_KEY, JSON.stringify(old));
    const d = loadSave();
    expect(d.butterTierReached).toBe(2);
    expect(d.butterBest).toEqual({ 1: 12_345, 2: 67_890 });
    expect(d.homeJob).toBe('event');
    expect(butterTier(homeFactsOf(d, 1, false))).toBe(2);
    // 다시 써도 같은 키 · 같은 값(형식 안 바뀜)
    saveSave(d);
    const again = JSON.parse(store.get(SAVE_KEY)!);
    expect(again.butterTierReached).toBe(2);
    expect(again.butterBest).toEqual({ 1: 12_345, 2: 67_890 });
  });
});
