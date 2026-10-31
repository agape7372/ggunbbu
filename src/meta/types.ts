// 메타(미션·재화·로드아웃) 공용 타입. DOM/캔버스 없음.

// 08-30 스윕: WazaId·GimmickId는 core/types가 정본 — 이중 정의 제거, 재수출만
import type { WazaId, GimmickId, GreatswordId, WeaponId } from '../core/types';
export type { WazaId, GimmickId, GreatswordId, WeaponId };
export type CosmeticSlot = 'body' | 'blade' | 'letters' | 'mask';
export type BodyId = 'ink' | 'amber' | 'slate';
export type BladeId = 'wire' | 'rebar' | 'crescent';
export type LettersId = 'flyer' | 'stamp' | 'orbit';
/** 마스크 칸 — 'mask' = 가면을 쓴다(어느 가면인지는 저장의 maskId), 'none' = 안 쓴다 */
export type MaskId = 'none' | 'mask';
/** 내 가면 한 장 — id는 'm1' · 'm2'… 안 바뀌는 값, name은 사용자가 지은 이름, art는 도트판 그림(meta/mask.ts) */
export interface MaskEntry {
  id: string;
  name: string;
  art: string;
}

export interface Loadout {
  waza: WazaId;
  weapon: WeaponId;
  body: BodyId;
  blade: BladeId;
  letters: LettersId;
  mask: MaskId;
}

export interface MissionDef {
  id: string;
  kind: 'daily' | 'achieve';
  title: string;
  desc: string;
  goal: number;
  rewardDust: number;
  rewardOrbit: number;
  /** 일일 추첨 조건 — 이 구역(0~3)에 닿은 사람에게만 뽑힌다 */
  minChapter?: number;
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
