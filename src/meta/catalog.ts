// 유료 상품 표 + 지급. DOM 없음. 전부 고정 구성 — 랜덤 · 구독 없음(게임산업법 확률 공개 대상 아님).
// 값은 Play Console 상품과 같아야 한다. 화면은 Play 가격 문자열을 먼저 쓰고 krw는 대체값이다.

import { dustCost, orbitCost } from './economy';
import { KIT_IDS, addItems, kitDef, type Items, type KitPick } from './kit';
import { WEAPON_IDS } from './loadout';
import { MASK_MAX } from './mask';
import { RUNGS, SEASON_THEMES, paidTotal, rungsReach, type Season } from './season';

export type SkuId =
  | 'orbit_s'
  | 'orbit_m'
  | 'orbit_l'
  | 'dust_s'
  | 'dust_m'
  | 'dust_l'
  | 'toolbox'
  | 'toolbox_sale'
  | 'rookie_pack'
  | 'rookie_sale'
  | 'no_ads'
  | 'salary'
  | 'knight_set'
  | 'king_set'
  | 'mask_1'
  | 'mask_3'
  | 'mask_10'
  | 'season_pass';

export interface Sku {
  id: SkuId;
  /** 원화 정수 — Play 가격을 못 받았을 때의 대체 표기 */
  krw: number;
  title: string;
  orbit?: number;
  dust?: number;
  items?: KitPick;
  /** 소유로 들어가는 것(꾸미기 · 무기) */
  owns?: readonly string[];
  /** 새로 그릴 수 있는 마스크 수 */
  masks?: number;
  noAds?: boolean;
  /** 월급 봉투 — 30번 받을 수 있게 칸을 더하고 광고를 30일 끈다 */
  salary?: boolean;
  /** 특근 수당 — 이번 달 특근 줄을 연다. 달마다 살 수 있어 소모품이다 */
  pass?: boolean;
  /** 평생 한 번 — 산 뒤엔 목록에서 사라지고 결제도 막는다 */
  once?: boolean;
  /** 재화 묶음(궤도조각 · 먼지) — 그 상품 첫 구매 때 두 배 */
  firstDouble?: boolean;
  /** 특가 전용 — 살아 있는 특가가 있을 때만 판다(offers.ts) */
  sale?: boolean;
}

export const SALARY_DAYS = 30;
export const SALARY_DAILY: { orbit: number; items: KitPick } = { orbit: 15, items: { life: 1, waza: 1, dust2x: 1 } };

const TOOLBOX_ITEMS: KitPick = { life: 5, waza: 5, dust2x: 5 };
const ROOKIE: Pick<Sku, 'orbit' | 'dust' | 'items' | 'owns'> = {
  orbit: 120, dust: 1000, items: { life: 3, waza: 3, dust2x: 3 }, owns: ['coverall'],
};
/** 철거왕 세트의 꾸미기 — 실적으로만 주는 셋(잿빛 · 불씨 · 새싹)은 안 판다 */
const LOOKS_SOLD = ['amber', 'slate', 'rebar', 'crescent', 'stamp', 'orbit', 'coverall', 'arc', 'rivet', 'crown', 'royal', 'gilt'] as const;

export const SKUS: readonly Sku[] = [
  { id: 'orbit_s', krw: 900, title: '궤도조각 소', orbit: 60, firstDouble: true },
  { id: 'dust_s', krw: 900, title: '먼지 한 삽', dust: 600, firstDouble: true },
  { id: 'mask_1', krw: 900, title: '마스크 1개', masks: 1 },
  { id: 'rookie_sale', krw: 900, title: '신입 특가', ...ROOKIE, once: true, sale: true },
  { id: 'toolbox_sale', krw: 900, title: '도구함 특가', items: TOOLBOX_ITEMS, sale: true },
  { id: 'toolbox', krw: 1900, title: '현장 도구함', items: TOOLBOX_ITEMS },
  { id: 'mask_3', krw: 1900, title: '마스크 3개', masks: 3 },
  { id: 'rookie_pack', krw: 2900, title: '신입 꾸러미', ...ROOKIE, once: true },
  { id: 'no_ads', krw: 2900, title: '광고 없는 현장', noAds: true, once: true },
  { id: 'orbit_m', krw: 2900, title: '궤도조각 중', orbit: 220, firstDouble: true },
  { id: 'dust_m', krw: 2900, title: '먼지 한 수레', dust: 2200, firstDouble: true },
  { id: 'salary', krw: 4900, title: '월급 봉투', orbit: 200, salary: true },
  { id: 'knight_set', krw: 4900, title: '기사 세트', orbit: 450, owns: ['arc', 'rivet'], once: true },
  { id: 'season_pass', krw: 4900, title: '특근 수당', pass: true },
  { id: 'orbit_l', krw: 4900, title: '궤도조각 대', orbit: 420, firstDouble: true },
  { id: 'dust_l', krw: 4900, title: '먼지 한 트럭', dust: 4200, firstDouble: true },
  { id: 'mask_10', krw: 4900, title: '마스크 10개', masks: 10 },
  {
    id: 'king_set', krw: 9900, title: '철거왕 세트',
    owns: [...WEAPON_IDS, ...LOOKS_SOLD], masks: 10, noAds: true, once: true,
  },
];

export const SKU_IDS: readonly SkuId[] = SKUS.map((s) => s.id);

export function skuById(id: string): Sku | undefined {
  return SKUS.find((s) => s.id === id);
}

/** 신입 특가와 신입 꾸러미는 같은 물건 — 하나를 사면 둘 다 끝난다 */
const SAME_GOODS: Readonly<Partial<Record<SkuId, SkuId>>> = { rookie_sale: 'rookie_pack', rookie_pack: 'rookie_sale' };

/** 첫 결제 선물 — 어떤 상품이든 처음 사면 한 번 */
export const FIRST_GIFT: { orbit: number; owns: readonly string[] } = { orbit: 100, owns: ['inju'] };

/** 단골 도장 — ₩900마다 하나. 칸이 차면 차례로 받는다 */
export const WON_PER_STAMP = 900;
export const stampsOf = (krw: number): number => Math.floor(krw / WON_PER_STAMP);

export interface Regular {
  stamps: number;
  /** 받은 단계 수 */
  got: number;
}

export const REGULAR_STEPS: readonly { at: number; reward: { orbit?: number; owns?: readonly string[]; masks?: number } }[] = [
  { at: 5, reward: { orbit: 150 } },
  { at: 10, reward: { orbit: 150, owns: ['apron'] } },
  { at: 20, reward: { orbit: 300, masks: 5 } },
];

/** 지금 받을 단계. 없으면 -1 */
export function regularReady(r: Regular): number {
  const s = REGULAR_STEPS[r.got];
  return s && r.stamps >= s.at ? r.got : -1;
}

export function takeRegular(r: Regular): (typeof REGULAR_STEPS)[number]['reward'] | null {
  const i = regularReady(r);
  if (i < 0) return null;
  r.got = i + 1;
  return REGULAR_STEPS[i].reward;
}

export function validateRegular(v: unknown): Regular {
  const o = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  const n = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0);
  return { stamps: n(o.stamps), got: Math.min(n(o.got), REGULAR_STEPS.length) };
}

// ── 효율 ───────────────────────────────────────────────────────
// 꾸러미 값 = 구성품 중 정말 따로 파는 것만 가장 싼 묶음 단가로 더한 값. 효율은 값 ÷ 가격. 산식은 상점 안내 단추에 적는다.
// 전용 꾸미기처럼 돈 · 궤도조각 · 먼지로 못 사는 것은 넣지 않는다.
// 재화 묶음 · 마스크 묶음 · 광고 없는 현장 단품은 그 자체가 값이라 0(표시 안 함).
export const ORBIT_WON = skuById('orbit_l')!.krw / skuById('orbit_l')!.orbit!;
export const DUST_WON = skuById('dust_l')!.krw / skuById('dust_l')!.dust!;
const MASK_WON = skuById('mask_10')!.krw / skuById('mask_10')!.masks!;
const NO_ADS_WON = skuById('no_ads')!.krw;

function orbitWorth(r: { orbit?: number; items?: KitPick; owns?: readonly string[] }): number {
  let v = r.orbit ?? 0;
  for (const id of KIT_IDS) v += (r.items?.[id] ?? 0) * kitDef(id)!.orbit;
  for (const id of r.owns ?? []) v += orbitCost(id) ?? 0;
  return v;
}

/** 재화 · 단품은 0. 특근은 앞 rungs칸 몫, 월급은 다 받았을 때 몫 */
export function worthWon(sku: Sku, rungs = RUNGS): number {
  if (sku.firstDouble || (sku.masks && !sku.owns) || (sku.noAds && !sku.owns)) return 0;
  const pass = sku.pass ? paidTotal(SEASON_THEMES[0], rungs) : null; // 달마다 그림만 다르고 구성은 같다
  let orbit = orbitWorth(sku) + (pass ? orbitWorth(pass) : 0);
  if (sku.salary) orbit += SALARY_DAYS * orbitWorth(SALARY_DAILY);
  const dust = (sku.dust ?? 0) + (sku.owns ?? []).reduce((n, id) => n + (dustCost(id) ?? 0), 0);
  const won = ((sku.masks ?? 0) + (pass?.masks ?? 0)) * MASK_WON + (sku.noAds ? NO_ADS_WON : 0) + dust * DUST_WON;
  return Math.floor((orbit * ORBIT_WON + won) / 100) * 100;
}

/** 이 효율부터 인장을 찍는다 — 전용 꾸미기가 값에서 빠지는 세트는 낮게 나오니 「전용」으로 말한다 */
export const EFF_MIN = 150;

/** 효율(%). 문턱 밑은 0. 특근은 앞 rungs칸 몫 */
export function effPct(sku: Sku, rungs = RUNGS): number {
  const p = Math.round((worthWon(sku, rungs) / sku.krw) * 100);
  return p >= EFF_MIN ? p : 0;
}

/** 저장에 남는 처리 끝 토큰 수 — 미처리 구매 복구는 며칠 안쪽이라 이 정도면 된다 */
export const TOKEN_KEEP = 64;

/** 지급 대상 — 저장의 필요한 칸만 */
export interface Buyer {
  dust: number;
  orbit: number;
  owned: string[];
  blanks: number;
  items: Items;
  bought: string[];
  noAds: boolean;
  salary: { left: number; key: string; adUntil?: string };
  iapTokens: string[];
  season: Season;
  regular: Regular;
  firstGift: boolean;
}

/** 더 살 수 없는 상품인가. masks · blanks를 넘기면 마스크 묶음은 가진 장 + 남은 칸이 상한일 때 품절이다. dateKey를 넘기면 오늘 사서 손해인 특근도 품절이다 */
export function soldOut(b: Pick<Buyer, 'bought' | 'noAds'> & { masks?: readonly unknown[]; blanks?: number; season?: Season }, id: SkuId, dateKey?: string): boolean {
  const sku = skuById(id);
  if (!sku) return true;
  if (sku.masks && !sku.owns && (b.masks?.length ?? 0) + (b.blanks ?? 0) + sku.masks > MASK_MAX) return true; // 더 받아도 못 그린다(지급 0 실과금 방지)
  if (sku.noAds && !sku.owns && b.noAds) return true; // 철거왕 세트로 이미 받았다
  if (sku.pass) return !!b.season?.pass || (!!dateKey && !!b.season && worthWon(sku, rungsReach(b.season, dateKey)) < sku.krw);
  if (!sku.once) return false;
  const twin = SAME_GOODS[id];
  return b.bought.includes(id) || (twin !== undefined && b.bought.includes(twin));
}

/** 첫 구매 두 배가 남았나 */
export const firstLeft = (sku: Sku, bought: readonly string[]): boolean => !!sku.firstDouble && !bought.includes(sku.id);

/** 궤도조각 지급량 — 첫 구매 두 배 반영 */
export const orbitOf = (sku: Sku, bought: readonly string[]): number => (sku.orbit ?? 0) * (firstLeft(sku, bought) ? 2 : 1);

/** 먼지 지급량 — 첫 구매 두 배 반영 */
export const dustOf = (sku: Sku, bought: readonly string[]): number => (sku.dust ?? 0) * (firstLeft(sku, bought) ? 2 : 1);

const addDays = (key: string, n: number): string =>
  new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10) + n)).toISOString().slice(0, 10);

/**
 * 구매 지급. token이 이미 처리됐거나 1회 상품을 이미 가졌으면 아무것도 안 하고 false —
 * 복구와 정상 흐름이 겹쳐도 두 번 주지 않는다. 토큰이 없는 재설치 저장은 다시 받는다.
 * dateKey = 오늘. 월급의 광고 없음은 칸을 안 받아도 달력으로 끝나고, 남은 날 뒤에 이어 붙는다.
 */
export function grantSku(b: Buyer, id: SkuId, token: string, dateKey = ''): boolean {
  const sku = skuById(id);
  if (!sku || b.iapTokens.includes(token) || (sku.once && b.bought.includes(id))) return false;
  b.orbit += orbitOf(sku, b.bought);
  b.dust += dustOf(sku, b.bought);
  if (sku.items) addItems(b.items, sku.items);
  if (sku.owns) b.owned = [...new Set([...b.owned, ...sku.owns])];
  b.blanks += sku.masks ?? 0;
  if (sku.noAds) b.noAds = true;
  if (sku.salary) {
    b.salary = { ...b.salary, left: b.salary.left + SALARY_DAYS };
    if (dateKey) b.salary.adUntil = addDays(dateKey > (b.salary.adUntil ?? '') ? dateKey : b.salary.adUntil!, SALARY_DAYS);
  }
  if (sku.pass) b.season.pass = true;
  if (!b.firstGift) {
    b.firstGift = true;
    b.orbit += FIRST_GIFT.orbit;
    b.owned = [...new Set([...b.owned, ...FIRST_GIFT.owns])];
  }
  b.regular.stamps += stampsOf(sku.krw);
  if (!b.bought.includes(id)) b.bought = [...b.bought, id];
  b.iapTokens = [...b.iapTokens, token].slice(-TOKEN_KEEP);
  return true;
}
