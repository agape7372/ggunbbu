// 메타(미션·재화·로드아웃) 공용 타입. DOM/캔버스 없음.

// 08-30 스윕: WazaId·GimmickId는 core/types가 정본 — 이중 정의 제거, 재수출만
import type { WazaId, GimmickId, GreatswordId, WeaponId } from '../core/types';
import type { KitPick } from './kit';
export type { WazaId, GimmickId, GreatswordId, WeaponId };
export type CosmeticSlot = 'body' | 'blade' | 'letters' | 'mask';
// 각 목록의 앞 셋만 상점에서 판다 — 나머지는 꾸러미 · 실적 · 특근으로만 들어온다(이름과 얻는 길은 LOOK_EARNED)
export type BodyId = 'ink' | 'amber' | 'slate' | 'coverall' | 'crown' | 'ash' | 'apron' | 's_night' | 's_powder' | 's_high';
export type BladeId = 'wire' | 'rebar' | 'crescent' | 'arc' | 'royal' | 'ember' | 'inju' | 's_moon' | 's_fuse' | 's_steel';
export type LettersId = 'flyer' | 'stamp' | 'orbit' | 'rivet' | 'gilt' | 'sprout';
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
  /** 일일 난이도 — 0 쉬움 · 1 보통 · 2 도전 */
  tier?: 0 | 1 | 2;
  /** 실적 부문 — 같은 부문은 지금 단계 하나만 보인다 */
  line?: string;
  /** 실적 값을 저장에서 읽는 칸(progress.ts Facts). 없으면 이벤트로 센다 */
  stat?: StatKey;
  /** 먼지 · 궤도조각 말고 더 주는 것 */
  rewardItems?: KitPick;
  owns?: readonly string[];
}

/** 평생 값 — 실적 · 신입 과제가 읽는다 */
export type StatKey = 'buildings' | 'specials' | 'guards' | 'bosses' | 'runs' | 'stageClears' | 'weapons' | 'book' | 'license';

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
