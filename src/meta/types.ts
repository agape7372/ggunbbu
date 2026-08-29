// 메타(미션·재화·로드아웃) 공용 타입. DOM/캔버스 없음.

export type WazaId = 'tenchi' | 'ageba' | 'tetsu';
export type GimmickId = 'none' | 'glass' | 'ice' | 'night' | 'orbit';
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
