// 홈 일감 — 순수 계산(DOM 없음). 일감 순서 · 키 얼굴 · 「착수」가 실제로 하는 일을 한 곳에서 정한다.
// 키 얼굴(touch.setFaces)과 확인 동작(scenes.confirmTitle)이 같은 jobAction 을 읽는다.

import { STAGES } from '../core/stages';
import { parseScript } from '../core/script';
import type { Material, StageDiff, Theme } from '../core/types';
import { diffUnlocked, recordOf, type StageRecord } from '../meta/stageRecord';
import type { KeyFace, KeyFaces } from '../input/touch';

export const JOBS = ['arcade', 'stage', 'ops', 'tokoton', 'event'] as const;
export type JobId = (typeof JOBS)[number];

/** 저장값 검증 — 모르는 값은 아케이드. 옛 일감 'butter'(11-24 전 버터바 챌린지) = 이벤트 스테이지 */
export function toJob(v: unknown): JobId {
  if (v === 'butter') return 'event';
  return (JOBS as readonly unknown[]).includes(v) ? (v as JobId) : 'arcade';
}

/** 다섯 일감을 돌아가며 넘긴다(끝에서 처음으로) */
export function stepJob(job: JobId, dir: -1 | 1): JobId {
  const i = JOBS.indexOf(job);
  return JOBS[(i + dir + JOBS.length) % JOBS.length];
}

export interface HomeFacts {
  act2Cleared: boolean;
  butterTierReached: number;
  stages: Readonly<Record<string, StageRecord>>;
  /** 지시서 화면에서 마지막에 고른 난이도(세션) */
  diffPick: StageDiff;
  /** 시험판 전해금 */
  allOpen: boolean;
}

/** 저장에서 읽은 것 + 세션 난이도 + 전해금 → 판단 재료(홈 화면과 확인 동작이 같은 것을 만든다) */
export function homeFactsOf(
  s: { act2Cleared: boolean; butterTierReached: number; stages: Readonly<Record<string, StageRecord>> },
  diffPick: StageDiff, allOpen: boolean,
): HomeFacts {
  return { act2Cleared: s.act2Cleared, butterTierReached: s.butterTierReached, stages: s.stages, diffPick, allOpen };
}

export type JobGo =
  | { k: 'arcade' }
  | { k: 'stage'; id: string; diff: StageDiff }
  | { k: 'stageMap' }
  | { k: 'ops' }
  | { k: 'tokoton' }
  | { k: 'events' }
  | { k: 'deny' };

/** 다음 차례 판 = 아직 못 깬 첫 판. 다 깼으면 null */
export function nextStage(recs: Readonly<Record<string, StageRecord>>): string | null {
  return STAGES.find((d) => recordOf(recs, d.id).lamp === 0)?.id ?? null;
}

/** 버터바 챌린지에서 열린 회차 수. 1회차는 처음부터 열려 있다(11-24, 판에서 안 만나니 잠가 두면 못 연다).
 *  2 · 3회차는 아케이드에서 그 구역 경계를 넘으면 열린다(옛 「판에서 만난 회차」와 같은 저장 값 butterTierReached) */
export function butterTier(f: HomeFacts): number {
  return f.allOpen ? Math.max(3, f.butterTierReached) : Math.max(1, f.butterTierReached);
}

export function jobAction(job: JobId, f: HomeFacts): JobGo {
  switch (job) {
    case 'arcade': return { k: 'arcade' };
    case 'stage': {
      const id = nextStage(f.stages);
      if (!id) return { k: 'stageMap' };
      const diff = f.allOpen || diffUnlocked(recordOf(f.stages, id), f.diffPick) ? f.diffPick : 1;
      return { k: 'stage', id, diff };
    }
    case 'ops': return { k: 'ops' };
    case 'tokoton': return f.act2Cleared || f.allOpen ? { k: 'tokoton' } : { k: 'deny' };
    case 'event': return { k: 'events' };
  }
}

/** 「착수」 = 바로 들어간다 · 「고르기」 = 고르는 화면이 먼저 · 「잠김」 = 못 들어간다 */
export function confirmLabel(go: JobGo): '착수' | '고르기' | '잠김' {
  if (go.k === 'deny') return '잠김';
  return go.k === 'stageMap' || go.k === 'ops' || go.k === 'events' ? '고르기' : '착수';
}

/** 홈 쪽지 맨 아래 주홍 띠 글 — 쪽지 누름(scenes onJobTap)을 따른다: 지시서는 늘 지도부터라 「고르기」. 잠김이면 띠가 없다 */
export function slipLabel(job: JobId, f: HomeFacts): '착수' | '고르기' | '' {
  const label = confirmLabel(jobAction(job, f));
  if (label === '잠김') return '';
  return job === 'stage' ? '고르기' : label;
}

/** 매달린 건물 — 판에서 쓰는 층(core makeStack · makeFloor)으로만 짓는다 */
export interface JobBuilding { variant: 'building' | 'butterbar'; theme: Theme; floors: readonly Material[] }

const ARCADE_FLOORS: readonly Material[] = ['mid', 'weak', 'mid', 'mid'];
const OPS_FLOORS: readonly Material[] = ['weak', 'mid', 'weak'];
const TOKOTON_FLOORS: readonly Material[] = ['hard', 'mid', 'hard', 'hard', 'mid', 'hard'];
const BUTTER_FLOORS: readonly Material[] = Array<Material>(6).fill('butter');

/** 다음 차례 판 정의(다 깼으면 마지막 판) */
export function nextStageDef(recs: Readonly<Record<string, StageRecord>>) {
  const id = nextStage(recs);
  return STAGES.find((d) => d.id === id) ?? STAGES[STAGES.length - 1];
}

export function jobBuilding(job: JobId, f: HomeFacts, homeTheme: Theme): JobBuilding {
  switch (job) {
    case 'event': return { variant: 'butterbar', theme: homeTheme, floors: BUTTER_FLOORS };
    case 'tokoton': return { variant: 'building', theme: 'modern', floors: TOKOTON_FLOORS };
    case 'ops': return { variant: 'building', theme: homeTheme, floors: OPS_FLOORS };
    case 'arcade': return { variant: 'building', theme: homeTheme, floors: ARCADE_FLOORS };
    case 'stage': {
      // 그 판 대본의 첫 건물. 보스판(대본 없음)은 그 지역 건물
      const def = nextStageDef(f.stages);
      const first = parseScript(def.script).flatMap((st) => st.items).find((it) => it.k === 'build');
      return { variant: 'building', theme: def.theme, floors: first?.k === 'build' ? first.floors : ARCADE_FLOORS };
    }
  }
}

/** 홈에서 조작 키 넷이 보일 얼굴 */
export function homeFaces(job: JobId, f: HomeFacts): KeyFaces {
  const label = confirmLabel(jobAction(job, f));
  const attack: KeyFace = { label, tone: label === '잠김' ? 'faint' : 'seal' };
  return {
    jump: { label: '이전', tone: 'ink' },
    guard: { label: '다음', tone: 'ink' },
    attack,
    special: { label: '', tone: 'rest' },
  };
}
