// 건뿌 flavor 카피 단일 출구. 전투 수치 없음.
//
// 이미 연결된 훅 (ui/scenes.ts):
//   STORY.chapters / intro / ending
//   COPY.screens · gameoverQuip · phaseBanner · chapterLines
//
// 렌더(src/render/**) 미연결 — 사용 예시는 파일 하단 주석.

import type { Act2Phase } from '../core/types';
import { ACT2_INTRO, CHAPTER_LINES, chapterLines, ENDING_FULL_COMBO, ENDING_LINES } from './story';
import {
  ACT2_PHASES,
  BOSS_NAME,
  CHECKPOINT_LABEL,
  checkpointLabel,
  GIMMICK_ZONES,
  gimmickZoneOf,
  HERO,
  OPERATIONS,
  REGIONS,
  regionOf,
  TAGLINE,
  TITLE,
  TITLE_EN,
  WAZA_COPY,
} from './world';
import {
  butterChallengeEnd,
  butterEnterLines,
  GAMEOVER_QUIPS,
  gameoverQuip,
  SCREENS,
} from './screens';
import { CAPTIONS, ONOMATO, onomatoFor } from './juice';

export {
  ACT2_INTRO,
  ACT2_PHASES,
  BOSS_NAME,
  butterChallengeEnd,
  butterEnterLines,
  CAPTIONS,
  CHAPTER_LINES,
  chapterLines,
  CHECKPOINT_LABEL,
  checkpointLabel,
  ENDING_FULL_COMBO,
  ENDING_LINES,
  GAMEOVER_QUIPS,
  gameoverQuip,
  GIMMICK_ZONES,
  gimmickZoneOf,
  HERO,
  OPERATIONS,
  ONOMATO,
  onomatoFor,
  REGIONS,
  regionOf,
  SCREENS,
  TAGLINE,
  TITLE,
  TITLE_EN,
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

/** 타이틀 도감 한 줄. unlockedChapters = 해금된 최대 챕터 인덱스. */
export function galleryLine(unlockedChapters: number): string {
  return REGIONS.map((r) => (r.index <= unlockedChapters ? r.name : SCREENS.title.galleryLocked)).join(' · ');
}

/** HUD 모드 한 줄. GameState.mode / chapter / act2Phase 훅. */
export function hudModeLabel(
  mode: 'act1' | 'act2' | 'tokoton' | 'bonus',
  chapter: number,
  phase: Act2Phase | null,
): string {
  if (mode === 'bonus') return SCREENS.butter.short;
  if (mode === 'tokoton') return SCREENS.tokoton.name;
  if (mode === 'act2' && phase) return ACT2_PHASES[phase].name;
  return regionOf(chapter).name;
}

export const COPY = {
  STORY,
  screens: SCREENS,
  regions: REGIONS,
  phases: ACT2_PHASES,
  captions: CAPTIONS,
  onomato: ONOMATO,
} as const;

/*
 * ── 다른 에이전트 연결 예시 ─────────────────────────────────────
 *
 * ui/overlay.ts · ui/hud.ts · ui/gallery.ts · ui/debugMenu.ts — 연결됨
 *   overlay: TITLE/TAGLINE/REGIONS 도감/결과/엔딩 노트
 *   hud: hudModeLabel · ACT2_PHASES · BOSS_NAME · CAPTIONS
 *   gallery: REGIONS 스탬프
 *   debugMenu: phaseName
 *
 * render/renderer.ts (미연결 — 패치 제안만)
 *   import { onomatoFor, CAPTIONS, SCREENS } from '../content';
 *   const word = onomatoFor(e.kind, e.combo ?? s.combo);
 *   if (s.combo >= 999) drawCaption(CAPTIONS.combo999);
 *   if (s.mode === 'bonus' && s.bonus)
 *     fillText(`${SCREENS.butter.bannerHud} ${Math.ceil(s.bonus.ticksLeft / 60)}s`, ...);
 *
 * ui/touchLayer.ts (미연결)
 *   버튼 라벨은 이미 '점프/가드/공격/필살'. 카피 모듈로 옮길 필요 없음.
 */
