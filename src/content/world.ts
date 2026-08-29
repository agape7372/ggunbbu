// 건뿌 세계관 고유명 — 오리지널. 원작(키루비루) 명칭·내레이션 미사용.
// 수치/페이즈 id는 config·core가 정본. 여기는 표시용 문자열만.
// 멸망해가는 지구. 하늘이 건물을 뽑아 던지고, 자격 없는 졸라맨이 벤다.

import type { Act2Phase, Theme } from '../core/types';

/** 주인공. 얼굴 없는 졸라맨. 자격증은 없다. */
export const HERO = '뿌뿌';

/** 2막 보스. 고장난 감시위성 — 파괴자의 얼굴. */
export const BOSS_NAME = '보름호';

export const TITLE = '건뿌!!';
export const TITLE_EN = 'GUNBBU';
export const TAGLINE = '하늘이 던지면, 베면 된다';

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
    blurb: '땅이 죽었다. 아치가 날아온다.',
    locked: '제1구역 — ???',
  },
  {
    index: 1,
    theme: 'asia',
    name: '강턱 시장',
    headline: '제2구역 — 강턱 시장',
    blurb: '가게는 비었다. 지붕이 떨어진다.',
    locked: '제2구역 — ???',
  },
  {
    index: 2,
    theme: 'eastasia',
    name: '기와능선',
    headline: '제3구역 — 기와능선',
    blurb: '능선은 비었다. 기와가 쏟아진다.',
    locked: '제3구역 — ???',
  },
  {
    index: 3,
    theme: 'modern',
    name: '철근 해안',
    headline: '제4구역 — 철근 해안',
    blurb: '바다는 말랐다. 철근이 꽂힌다.',
    locked: '제4구역 — ???',
  },
] as const;

export function regionOf(chapter: number): RegionCopy {
  const i = Math.max(0, Math.min(3, chapter | 0)) as 0 | 1 | 2 | 3;
  return REGIONS[i];
}

/** 아케이드 4구역 위에 얹는 기믹 작전. id는 GimmickId 와 1:1 (none 제외). */
export type GimmickZoneId = 'glass' | 'ice' | 'night' | 'orbit';

export interface GimmickZoneCopy {
  gimmick: GimmickZoneId;
  name: string;
  headline: string;
  blurb: string;
  locked: string;
}

export const GIMMICK_ZONES: readonly GimmickZoneCopy[] = [
  {
    gimmick: 'glass',
    name: '유리 골목',
    headline: '특별작전 — 유리 골목',
    blurb: '유리가 먼저 깨진다. 조각이 남는다.',
    locked: '특별작전 — ???',
  },
  {
    gimmick: 'ice',
    name: '빙결 부두',
    headline: '특별작전 — 빙결 부두',
    blurb: '부두가 얼었다. 튕김이 시원찮다.',
    locked: '특별작전 — ???',
  },
  {
    gimmick: 'night',
    name: '야간 투척',
    headline: '특별작전 — 야간 투척',
    blurb: '밤에도 하늘은 던진다. 겹친다.',
    locked: '특별작전 — ???',
  },
  {
    gimmick: 'orbit',
    name: '궤도 직하',
    headline: '특별작전 — 궤도 직하',
    blurb: '궤도에서 꽂힌다. 빛만 먼저 온다.',
    locked: '특별작전 — ???',
  },
] as const;

export function gimmickZoneOf(id: GimmickZoneId): GimmickZoneCopy {
  for (const z of GIMMICK_ZONES) if (z.gimmick === id) return z;
  return GIMMICK_ZONES[0];
}

/** 구역 작전 기믹. none = 기본 낙하. */
export type GimmickId = 'none' | 'glass' | 'ice' | 'night' | 'orbit';

export interface OperationCopy {
  id: string;
  name: string;
  blurb: string;
  gimmick: GimmickId;
  themeIndex: 0 | 1 | 2 | 3;
}

/** 아케이드 4구역 + 기믹 4작전. themeIndex 는 REGIONS 배경. */
export const OPERATIONS: readonly OperationCopy[] = [
  {
    id: 'west',
    name: '서쪽 회랑',
    blurb: '땅이 죽었다. 아치가 날아온다.',
    gimmick: 'none',
    themeIndex: 0,
  },
  {
    id: 'market',
    name: '강턱 시장',
    blurb: '가게는 비었다. 지붕이 떨어진다.',
    gimmick: 'none',
    themeIndex: 1,
  },
  {
    id: 'ridge',
    name: '기와능선',
    blurb: '능선은 비었다. 기와가 쏟아진다.',
    gimmick: 'none',
    themeIndex: 2,
  },
  {
    id: 'coast',
    name: '철근 해안',
    blurb: '바다는 말랐다. 철근이 꽂힌다.',
    gimmick: 'none',
    themeIndex: 3,
  },
  {
    id: 'glass',
    name: '유리 골목',
    blurb: '유리가 먼저 깨진다. 조각이 남는다.',
    gimmick: 'glass',
    themeIndex: 0,
  },
  {
    id: 'ice',
    name: '빙결 부두',
    blurb: '부두가 얼었다. 튕김이 시원찮다.',
    gimmick: 'ice',
    themeIndex: 1,
  },
  {
    id: 'night',
    name: '야간 투척',
    blurb: '밤에도 하늘은 던진다. 겹친다.',
    gimmick: 'night',
    themeIndex: 2,
  },
  {
    id: 'orbit',
    name: '궤도 직하',
    blurb: '궤도에서 꽂힌다. 빛만 먼저 온다.',
    gimmick: 'orbit',
    themeIndex: 3,
  },
];

/** 장착 필살 1종. 효과 수치는 config·core 정본 — 문구만. */
export type WazaCopyId = 'tenchi' | 'ageba' | 'tetsu';

export interface WazaCopy {
  id: WazaCopyId;
  name: string;
  desc: string;
  blurb: string;
}

export const WAZA_COPY: Record<WazaCopyId, WazaCopy> = {
  tenchi: {
    id: 'tenchi',
    name: '천지개벽',
    desc: '화면을 가른다. 아래는 빈 자리.',
    blurb: '화면을 가른다. 아래는 빈 자리.',
  },
  ageba: {
    id: 'ageba',
    name: '올려베기',
    desc: '발밑에서 위로만 벤다.',
    blurb: '발밑에서 위로만 벤다.',
  },
  tetsu: {
    id: 'tetsu',
    name: '철벽',
    desc: '부수지 않는다. 튕기고 버틴다.',
    blurb: '부수지 않는다. 튕기고 버틴다.',
  },
};

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
    banner: ['— 석조 대성당 —', '하늘이 종탑을 뽑아 던진다.'],
  },
  tower: {
    id: 'tower',
    name: '110층 마천루',
    banner: ['— 110층 마천루 —', '한 동이 통째로 내려온다.'],
  },
  bolt: {
    id: 'bolt',
    name: '궤도 낙뢰',
    banner: ['— 궤도 낙뢰 —', '지붕 없는 밤에 떨어진다.'],
  },
  rock: {
    id: 'rock',
    name: '화산탄',
    banner: ['— 화산탄 —', '죽은 땅에 돌만 쌓인다.'],
  },
  moon: {
    id: 'moon',
    name: BOSS_NAME,
    banner: [`— 파괴자 ${BOSS_NAME} —`, '얼굴이 내려온다. 지붕을 걷는다.'],
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
