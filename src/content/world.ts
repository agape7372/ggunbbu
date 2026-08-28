// 건뿌 세계관 고유명 — 오리지널. 원작(키루비루) 명칭·내레이션 미사용.
// 수치/페이즈 id는 config·core가 정본. 여기는 표시용 문자열만.

import type { Act2Phase, Theme } from '../core/types';

/** 주인공. 얼굴 없는 졸라맨 — 이름은 있어도 설명은 거의 없다. */
export const HERO = '뿌뿌';

/** 2막 보스. 고장난 감시위성. */
export const BOSS_NAME = '보름호';

export const TITLE = '건뿌!!';
export const TITLE_EN = 'GUNBBU';
export const TAGLINE = '진지한 게 단 하나도 없는 철거 게임';

export interface RegionCopy {
  /** GameState.chapter / Theme 인덱스 0~3 */
  index: 0 | 1 | 2 | 3;
  theme: Theme;
  /** 짧은 지명 (HUD·도감) */
  name: string;
  /** 「제n구역 — 이름」 */
  headline: string;
  /** 도감 한 줄 */
  blurb: string;
  /** 잠금 시 */
  locked: string;
}

/** 1막 챕터 4구역. 인덱스는 ACT1.CHAPTER_THEMES 와 동일. */
export const REGIONS: readonly RegionCopy[] = [
  {
    index: 0,
    theme: 'europe',
    name: '서쪽 회랑',
    headline: '제1구역 — 서쪽 회랑',
    blurb: '석회 골목. 아치창이 먼저 떨어진다.',
    locked: '제1구역 — ???',
  },
  {
    index: 1,
    theme: 'asia',
    name: '강턱 시장',
    headline: '제2구역 — 강턱 시장',
    blurb: '흙벽과 격자. 안개 너머로 또 한 채.',
    locked: '제2구역 — ???',
  },
  {
    index: 2,
    theme: 'eastasia',
    name: '기와능선',
    headline: '제3구역 — 기와능선',
    blurb: '목조와 기와. 달은 아직 안 내려온다.',
    locked: '제3구역 — ???',
  },
  {
    index: 3,
    theme: 'modern',
    name: '철근 해안',
    headline: '제4구역 — 철근 해안',
    blurb: '유리와 리벳. 여기서부터 하늘이 바빠진다.',
    locked: '제4구역 — ???',
  },
] as const;

export function regionOf(chapter: number): RegionCopy {
  const i = Math.max(0, Math.min(3, chapter | 0)) as 0 | 1 | 2 | 3;
  return REGIONS[i];
}

export interface PhaseCopy {
  id: Act2Phase;
  /** 짧은 표기 (디버그·배너) */
  name: string;
  /** 오버레이 1~3줄. 인터루드 동안 읽힌다. */
  banner: readonly string[];
}

/** 2막 페이즈. id는 GameState.act2Phase 와 1:1. */
export const ACT2_PHASES: Record<Act2Phase, PhaseCopy> = {
  cathedral: {
    id: 'cathedral',
    name: '석조 대성당',
    banner: ['— 석조 대성당 —', '종탑 여섯 단. 아래부터.'],
  },
  tower: {
    id: 'tower',
    name: '110층 마천루',
    banner: ['— 110층 마천루 —', '로비는 두껍고, 중간은 얇다.'],
  },
  bolt: {
    id: 'bolt',
    name: '궤도 낙뢰',
    banner: ['— 궤도 낙뢰 —', '가드는 소용없다. 베면 된다.'],
  },
  rock: {
    id: 'rock',
    name: '화산탄',
    banner: ['— 화산탄 —', '바닥에 쌓인다. 서두를 것 없다.'],
  },
  moon: {
    id: 'moon',
    name: BOSS_NAME,
    banner: [`— 감시위성 ${BOSS_NAME} —`, '콤보가 리셋된다. 상관없다.'],
  },
};

/** 2막 이어하기 체크포인트 표시. 값 40/148/168 은 config 정본 — 문구만. */
export const CHECKPOINT_LABEL: Record<40 | 148 | 168, string> = {
  40: '로비',
  148: '사무층',
  168: '펜트하우스',
};

export function checkpointLabel(n: number): string {
  if (n === 40 || n === 148 || n === 168) return CHECKPOINT_LABEL[n];
  return '이어하기';
}
