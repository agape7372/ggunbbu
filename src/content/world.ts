// 건뿌 세계관 고유명 — 오리지널. 원작(키루비루) 명칭·내레이션 미사용.
// 수치/페이즈 id는 config·core가 정본. 여기는 표시용 문자열만.
// 멸망해가는 지구. 하늘이 건물을 뽑아 던지고, 자격 없는 졸라맨이 벤다.

import type { Act2Phase, GimmickId, ItemId, Theme, WazaId, WeaponId } from '../core/types';
import type { FxSlot, Tier } from '../meta/tier';

/** 주인공. 얼굴 없는 졸라맨. 자격증은 없다. */
export const HERO = '뿌뿌';

/** 2막 보스. 하늘에서 건물을 집어 던지는 무인 철거 집게보. */
export const BOSS_NAME = '집행기';

export const TAGLINE = '하늘이 던진다. 베면 된다';

export interface RegionCopy {
  /** GameState.chapter / Theme 인덱스 0~3 */
  index: 0 | 1 | 2 | 3;
  theme: Theme;
  /** 짧은 지명 (HUD·도감) */
  name: string;
  /** 「제n구역: 이름」 */
  headline: string;
}

/** 1막 챕터 4구역. 인덱스는 ACT1.CHAPTER_THEMES 와 동일. */
export const REGIONS: readonly RegionCopy[] = [
  {
    index: 0,
    theme: 'europe',
    name: '서쪽 회랑',
    headline: '제1구역: 서쪽 회랑',
  },
  {
    index: 1,
    theme: 'asia',
    name: '강턱 시장',
    headline: '제2구역: 강턱 시장',
  },
  {
    index: 2,
    theme: 'eastasia',
    name: '기와능선',
    headline: '제3구역: 기와능선',
  },
  {
    index: 3,
    theme: 'modern',
    name: '철근 해안',
    headline: '제4구역: 철근 해안',
  },
] as const;

export function regionOf(chapter: number): RegionCopy {
  const i = Math.max(0, Math.min(3, chapter | 0)) as 0 | 1 | 2 | 3;
  return REGIONS[i];
}


export interface OperationCopy {
  id: string;
  name: string;
  gimmick: GimmickId;
  themeIndex: 0 | 1 | 2 | 3;
}

/** 아케이드 4구역 + 기믹 4작전. themeIndex 는 REGIONS 배경. */
export const OPERATIONS: readonly OperationCopy[] = [
  {
    id: 'west',
    name: '서쪽 회랑',
    gimmick: 'none',
    themeIndex: 0,
  },
  {
    id: 'market',
    name: '강턱 시장',
    gimmick: 'none',
    themeIndex: 1,
  },
  {
    id: 'ridge',
    name: '기와능선',
    gimmick: 'none',
    themeIndex: 2,
  },
  {
    id: 'coast',
    name: '철근 해안',
    gimmick: 'none',
    themeIndex: 3,
  },
  {
    id: 'glass',
    name: '유리 골목',
    gimmick: 'glass',
    themeIndex: 0,
  },
  {
    id: 'ice',
    name: '빙결 부두',
    gimmick: 'ice',
    themeIndex: 1,
  },
  {
    id: 'night',
    name: '야간 투척',
    gimmick: 'night',
    themeIndex: 2,
  },
  {
    id: 'orbit',
    name: '궤도 직하',
    gimmick: 'orbit',
    themeIndex: 3,
  },
];

/** 장착 필살 1종. 효과 수치는 config·core 정본 — 문구만. */
export type WazaCopyId = WazaId;

export interface WazaCopy {
  id: WazaCopyId;
  name: string;
  desc: string;
}

export const WAZA_COPY: Record<WazaCopyId, WazaCopy> = {
  tenchi: {
    id: 'tenchi',
    name: '천지개벽',
    desc: '떨어지는 건물을 통째로 부순다.',
  },
  ageba: {
    id: 'ageba',
    name: '올려베기',
    desc: '발밑에서 위로만 벤다.',
  },
  mukjul: {
    id: 'mukjul',
    name: '무음일섬',
    desc: '화면을 가르는 한 줄. 칼을 거두면 터진다. 층 점수 두 배.',
  },
  dalmuri: {
    id: 'dalmuri',
    name: '월하난무',
    desc: '달 아래 다섯 칼, 마지막에 달째 가른다. 보스에 가장 세다.',
  },
  nakgwan: {
    id: 'nakgwan',
    name: '십이연참',
    desc: '열두 번 베고 도장을 찍는다. 콤보가 오른다.',
  },
  baram: {
    id: 'baram',
    name: '용오름',
    desc: '회오리 셋으로 치고 띄운다. 번개와 포탄을 쓸어 낸다.',
  },
};

/** 무기 1종. 수치는 config WEAPON 정본 — 문구만. 대미지는 전부 같다(체크포인트 산술). */
export interface WeaponCopy {
  name: string;
  desc: string;
}

export const WEAPON_COPY: Record<WeaponId, WeaponCopy> = {
  sword: { name: '철거칼', desc: '고르게 쓴다. 기본.' },
  hammer: { name: '오함마', desc: '칠 때마다 건물을 더 띄운다. 짧다.' },
  crowbar: { name: '빠루', desc: '멀리 닿는다. 필살이 느리다.' },
  grinder: { name: '그라인더', desc: '필살이 빨리 찬다. 덜 띄운다.' },
  iron: { name: '무쇠 대검', desc: '길게 닿는다. 필살이 조금 느리다.' },
  saw: { name: '톱날 대검', desc: '필살이 빨리 찬다. 덜 띄운다.' },
  hazard: { name: '공사중 대검', desc: '멀리 닿고 높이 띄운다. 필살이 느리다.' },
  beam: { name: '철골 대검', desc: '가장 높이 띄운다. 짧다.' },
  flame: { name: '화염 대검', desc: '멀리 닿고 필살이 빨리 찬다. 덜 띄운다.' },
  frost: { name: '서리 대검', desc: '아주 멀리 닿는다. 덜 띄운다.' },
  onyx: { name: '흑철 대검', desc: '가장 멀리 닿고 높이 띄운다. 필살이 아주 느리다.' },
  gold: { name: '황금 대검', desc: '필살이 가장 빨리 찬다. 조금 덜 띄운다.' },
};

/** 상점 마스크 — 상점 카드·장비 탭·결과 카드 다음 목표가 같은 이름을 쓴다 */
export const MASK_COPY = {
  name: '내 마스크',
  desc: '도트판에 직접 찍어 얼굴에 씌운다.',
} as const;

/** 보급품(안전모는 상자 밖, 콤보 고비에서 받는다). pop = 받을 때 뜨는 말 — 안전모는 렌더러 받기 띠에 찍힌다. */
export interface ItemCopy {
  name: string;
  desc: string;
  pop: string;
}

export const ITEM_COPY: Record<ItemId, ItemCopy> = {
  hat: { name: '안전모', desc: '한 번 깔려도 버틴다.', pop: '안전모!' },
  coffee: { name: '믹스커피', desc: '필살 반 칸.', pop: '필살 +50' },
  gloves: { name: '장갑', desc: '가드를 채운다.', pop: '가드 가득' },
  dust: { name: '먼지 자루', desc: '먼지 10.', pop: '먼지 +10' },
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
    banner: ['석조 대성당', '하늘이 종탑을 뽑아 던진다.'],
  },
  tower: {
    id: 'tower',
    name: '110층 마천루',
    banner: ['110층 마천루', '한 동이 통째로 내려온다.'],
  },
  bolt: {
    id: 'bolt',
    name: '궤도 낙뢰',
    banner: ['궤도 낙뢰', '지붕 없는 밤에 떨어진다.'],
  },
  rock: {
    id: 'rock',
    name: '화산탄',
    banner: ['화산탄', '죽은 땅에 돌만 쌓인다.'],
  },
  moon: {
    id: 'moon',
    name: BOSS_NAME,
    banner: [`철거 집행: ${BOSS_NAME}`, '건물만 집으라는 지시는 없었다.'],
  },
};

/** 무기 등급 이름표(src/meta/tier.ts) — 상점 큰 칼 · 칼꽂이 꼬리표 */
export const TIER_COPY: Record<Tier, string> = {
  common: '일반', fine: '고급', rare: '희귀', legend: '전설',
};

/** 이펙트 칸 이름표(src/meta/tier.ts FX_SLOTS) */
export const FX_SLOT_COPY: Record<FxSlot, string> = {
  hit: '타격음', shard: '파편', trail: '잔상', aura: '칼 기운', tint: '물들임',
};
