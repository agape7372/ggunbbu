// 건뿌 flavor 카피 단일 출구. 전투 수치 없음.

import type { Act2Phase, Mode } from '../core/types';
import { ACT2_INTRO, CHAPTER_LINES, ENDING_FULL_COMBO, ENDING_LINES } from './story';
import { ACT2_PHASES, BOSS_NAME, ITEM_COPY, regionOf, TAGLINE, WAZA_COPY } from './world';
import { butterChallengeEnd, butterEnterLines, pickQuip, SCREENS } from './screens';
import { CAPTIONS, destroyedCaption, onomatoFor } from './juice';

export {
  ACT2_PHASES,
  BOSS_NAME,
  butterChallengeEnd,
  butterEnterLines,
  CAPTIONS,
  destroyedCaption,
  ENDING_FULL_COMBO,
  ITEM_COPY,
  onomatoFor,
  pickQuip,
  regionOf,
  SCREENS,
  TAGLINE,
  WAZA_COPY,
};

/** scenes.ts 가 쓰던 형태. 줄만 교체되고 키는 동일. */
export const STORY = {
  chapters: CHAPTER_LINES,
  intro: ACT2_INTRO,
  ending: ENDING_LINES,
} as const;

export function phaseBanner(phase: Act2Phase): readonly string[] {
  return ACT2_PHASES[phase].banner;
}

export function phaseName(phase: Act2Phase): string {
  return ACT2_PHASES[phase].name;
}

/** HUD 모드 한 줄. GameState.mode / chapter / act2Phase 훅. */
export function hudModeLabel(
  mode: Mode,
  chapter: number,
  phase: Act2Phase | null,
): string {
  if (mode === 'bonus') return SCREENS.butter.short;
  if (mode === 'tokoton') return SCREENS.tokoton.name;
  if (mode === 'act2' && phase) return ACT2_PHASES[phase].name;
  return regionOf(chapter).name;
}
