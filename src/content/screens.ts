// 타이틀 / 게임오버 / 결과 / 보너스 / 메뉴 — 플레이어가 읽는 화면 카피.

import { BOSS_NAME, HERO } from './world';

export const SCREENS = {
  title: {
    buddha: '※ 2막부터 시작 (디버그)',
    galleryLocked: '???',
    best: '최고 점수',
    tokotonBest: '야근 최고',
    maxCombo: '최대 콤보',
  },

  /** 타이틀 메뉴 — 이름표 + 한 줄 보조(잠김이면 여는 조건) */
  menu: {
    arcade: '아케이드 시작',
    arcadeSub: '4구역 지나 집행기까지',
    tokoton: '야근',
    tokotonSub: '끝없이 떨어진다',
    tokotonLocked: '2막을 깨면 열림',
    butter: '버터바 챌린지',
    butterSub: (round: number) => `${round}회차까지`,
    butterLocked: '1막 보너스를 만나면 열림',
    ops: '구역 작전',
    opsSub: '구역 골라 시작',
  },

  tabs: {
    play: '플레이',
    missions: '미션',
    custom: '꾸미기',
    shop: '상점',
    more: '설정',
  },

  /** 결과 카드. 엔딩 씬 짧은 표기. */
  result: {
    success: '작전 완료',
    petals: '민들레 홀씨가 흩날린다…',
    score: (n: number) => `점수 ${n.toLocaleString('ko-KR')}`,
    tokotonUnlock: '야근이 열렸다. 하늘은 아직 던진다.',
    fullComboNote: '풀콤보 — 기계가 더 못 셉니다. 야근이 열렸다.',
  },

  gameover: {
    title: '철거 실패',
    continue: '체크포인트에서 이어하기',
    revive: (n: number, max: number) => `광고 보고 일어나기 ${n}/${max}`,
    /** 웹(광고 미배선) — 광고를 위장하지 않는다 (08-30, P0-2) */
    reviveFree: (n: number, max: number) => `일어나기 ${n}/${max}`,
  },

  butter: {
    banner: '— 버터바 타임! —',
    bannerHud: '버터바 타임!',
    short: '버터바',
    challengeEnd: '버터바 챌린지 끝!',
    rounds: ['1회차 · 얇은 겹', '2회차 · 세 겹', '3회차 · 100겹 타워'] as const,
  },

  tokoton: {
    name: '야근',
  },
} as const;

/** 게임오버 만담. 톤 = 건조한 전단지. 점수·틱으로 고르면 된다. */
export const GAMEOVER_QUIPS: readonly string[] = [
  '건물주가 당신을 고소했습니다',
  '철거 자격증 정지 3개월',
  '보험: 천재지변 해당 없음',
  '오늘 알바는 여기까지입니다',
  '깔린 채로 퇴근 도장을 찍었습니다',
  `${HERO}의 머리가 납작해졌습니다`,
  `${BOSS_NAME}가 평가를 남겼다: 「못생김.」`,
  '현장 실습 학점이 인정되지 않았습니다',
  '하늘이 한 채 더 던졌습니다',
  '견습은 산재 처리 대상이 아닙니다',
  '허가 없이 깔렸습니다',
  '무단 철거 신고가 접수되었습니다',
  '파괴자 측 변호인이 이겼습니다',
  '지구 잔여분이 퇴근을 거부했습니다',
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
