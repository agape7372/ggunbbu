// 내레이션 — 웅장한 다큐 톤 + 김새는 내용. 원작 텍스트 미사용.
// 줄 길이는 360폭 캔버스(13px) 기준 대략 18자 이내.

import { INTRO } from '../config';
import { BOSS_NAME, HERO, REGIONS } from './world';

/** 1막 챕터 전환 조각. 인덱스 = GameState.chapter (0~3). */
export const CHAPTER_LINES: readonly (readonly string[])[] = [
  [
    REGIONS[0].headline + '.',
    '땅이 먼저 죽었다.',
    '하늘만 아직 던진다.',
  ],
  [
    REGIONS[1].headline + '.',
    `「${BOSS_NAME}」가 던진다.`,
    '건물이 먼저 떨어진다.',
  ],
  [
    REGIONS[2].headline + '.',
    `무면허 철거는 ${HERO}.`,
    '자격증은 없다.',
  ],
  [
    REGIONS[3].headline + '.',
    '허가 같은 건 없었다.',
    '베면 된다.',
  ],
] as const;

/** 1막 → 2막. 짧은 내레이션 [정본 구조]. */
export const ACT2_INTRO: readonly string[] = [
  '최종 국면',
  '',
  '하늘에서 집게가 내려왔다.',
  '건물만 집으라는 지시는 없었다.',
  '',
  `협상 인턴은 ${HERO}.`,
  '명함엔 「견습」이라 적혀 있다.',
  '',
  '「여긴 내 구역인데.」',
];

/** 클리어 후 전체 내레이션. 엔딩 오버레이. */
export const ENDING_LINES: readonly string[] = [
  '작전성공',
  '',
  '집행이 멈췄다.',
  '지구는 절반쯤 무너져 있다.',
  `베어 낸 쪽은 전부 ${HERO}다.`,
  '',
  '담당자는 끝내 나타나지 않았다.',
  `${HERO}는 실기에 합격했다.`,
  '필기는 여전히 미응시.',
  '',
  '민들레 홀씨가 흩날린다.',
  '아무 일도 없었던 것처럼.',
];

/** 2막 풀콤보(99,999,999) 엔딩에 덧붙이는 한 줄. */
export const ENDING_FULL_COMBO = '「기계가 더 못 셉니다.」';

/** 평생 첫 판에만 나오는 숨은 줄 */
export const INTRO_HIDDEN_LINE = '※ 신입 환영. 보험은 없다.';

export interface IntroPlan {
  lines: readonly string[];
  ticks: number;
}

/**
 * 1구역 인트로 사다리. nth = 이번 세션에서 아케이드를 시작한 횟수(1부터, 저장 밖).
 * 첫 판 3줄 → 2~4판째 한 줄 → 이후 머리말만 짧게. 뒤 칸일수록 짧고 첫 칸으로 안 돌아간다.
 */
export function introFor(nth: number, lifetimeFirst: boolean): IntroPlan {
  const n = Math.floor(nth);
  const head = REGIONS[0].headline;
  if (!(n >= 2)) {
    return {
      lines: lifetimeFirst ? [...CHAPTER_LINES[0], INTRO_HIDDEN_LINE] : CHAPTER_LINES[0],
      ticks: INTRO.FIRST_TICKS,
    };
  }
  if (n <= INTRO.SHORT_UNTIL) return { lines: [`${head}. 또.`], ticks: INTRO.SHORT_TICKS };
  return { lines: [`${head}.`], ticks: INTRO.HEAD_TICKS };
}
