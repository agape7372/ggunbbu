// 메타(미션·재화·로드아웃) 공용 타입. DOM/캔버스 없음.

// 08-30 스윕: WazaId·GimmickId는 core/types가 정본 — 이중 정의 제거, 재수출만
import type { WazaId, GimmickId } from '../core/types';
export type { WazaId, GimmickId };
export type CosmeticSlot = 'body' | 'blade' | 'letters';
export type BodyId = 'ink' | 'amber' | 'slate';
export type BladeId = 'wire' | 'rebar' | 'crescent';
export type LettersId = 'flyer' | 'stamp' | 'orbit';

export interface Loadout {
  waza: WazaId;
  body: BodyId;
  blade: BladeId;
  letters: LettersId;
}

export interface MissionDef {
  id: string;
  kind: 'daily' | 'achieve';
  title: string;
  desc: string;
  goal: number;
  rewardDust: number;
  rewardOrbit: number;
}

export interface MissionProgress {
  id: string;
  count: number;
  claimed: boolean;
}

export interface DailyState {
  /** KST date key YYYY-MM-DD at 05:00 boundary */
  dateKey: string;
  items: MissionProgress[];
}
