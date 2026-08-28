// 타이틀 / 게임오버 / 결과 / 보너스 / 메뉴 — 플레이어가 읽는 화면 카피.

import { BOSS_NAME, HERO, TAGLINE, TITLE } from './world';

export const SCREENS = {
  title: {
    logo: TITLE,
    tagline: TAGLINE,
    skip: '(공격 버튼으로 넘기기)',
    hint: '점프 · 가드 · 공격 · 필살',
    soundOn: '켜짐',
    soundOff: '꺼짐',
    neighborhood: '동네 최고',
    tokotonBest: '토코톤 최고',
    maxCombo: '최대콤보',
    buddha: '※ 2막부터 시작 (디버그)',
    galleryLocked: '미해금',
    records: '동네 기록',
  },

  menu: {
    arcade: '아케이드 시작',
    tokoton: '토코톤 (엔드리스)',
    tokotonLocked: '토코톤 — 잠김',
    butter: (round: number) => `버터바 챌린지 (${round}회차)`,
    butterLocked: '버터바 챌린지 — 잠김',
  },

  /** 결과 카드. 엔딩 씬 짧은 표기. */
  result: {
    success: '작전성공',
    petals: '민들레 홀씨가 흩날린다…',
    score: (n: number) => `점수 ${n.toLocaleString()}`,
    combo: (n: number) => `콤보 ${n.toLocaleString()}`,
    tokotonUnlock: '토코톤이 열렸다. 아무 일도 없었던 것처럼.',
    counterstop: '기계가 더 못 셉니다',
    fullCombo: '무단절. 점수가 더 이상 오르지 않는다.',
    fullComboNote: '풀콤보 — 기계가 더 못 셉니다. 토코톤이 열렸다.',
    pauseStats: (score: number, combo: number) =>
      `점수 ${score.toLocaleString()}  ·  콤보 ${combo}`,
    overScore: (score: number, combo: number) =>
      `점수 ${score.toLocaleString()}  ·  콤보 ${combo}`,
    endScore: (score: number, maxCombo: number) =>
      `점수 ${score.toLocaleString()}  ·  최고콤보 ${maxCombo}`,
  },

  gameover: {
    title: '철거 실패',
    toTitle: '공격: 타이틀로',
    continue: '공격: 이어하기 / 필살: 타이틀',
    continueNamed: (place: string) => `${place} 격파 지점`,
  },

  overlay: {
    skip: '(공격 버튼으로 넘기기)',
  },

  butter: {
    banner: '— 버터바 타임! —',
    bannerHud: '버터바 타임!',
    short: '버터바',
    challengeEnd: '버터바 챌린지 종료!',
    perfect: 'PERFECT',
    mashed: '버터가 뭉개졌습니다. 라이프는 그대로.',
    rounds: ['1회차 · 얇은 겹', '2회차 · 세 겹', '3회차 · 100겹 타워'] as const,
  },

  tokoton: {
    name: '토코톤',
    blurb: '끝이 없는 철거. 카운터는 999에서 멈춘다.',
  },
} as const;

/** 게임오버 만담. 톤 = 건조한 전단지. 점수·틱으로 고르면 된다. */
export const GAMEOVER_QUIPS: readonly string[] = [
  '건물주가 당신을 고소했습니다',
  '철거 자격증 정지 3개월',
  '보험 처리가 거절되었습니다',
  '오늘 알바는 여기까지입니다',
  '깔린 채로 퇴근 도장을 찍었습니다',
  `${HERO}의 머리가 납작해졌습니다`,
  `${BOSS_NAME}가 평가를 남겼다: 「못생김.」`,
  '현장 실습 학점이 인정되지 않았습니다',
];

export function gameoverQuip(seed: number): string {
  const i = Math.abs(seed | 0) % GAMEOVER_QUIPS.length;
  return GAMEOVER_QUIPS[i]!;
}

export function butterChallengeEnd(score: number): readonly string[] {
  return [SCREENS.butter.challengeEnd, SCREENS.result.score(score)];
}

export function butterEnterLines(chapterLines: readonly string[]): readonly string[] {
  return [...chapterLines, '', SCREENS.butter.banner];
}
