// 이달의 현장 — 한 달짜리 도장 수첩. 오늘 작업 · 일당 · 출근으로 점수를 모아 칸을 연다. DOM 없음.
// 일반 줄은 누구나, 특근 줄은 특근 수당을 산 달에만. 특근 줄은 재화 · 소모품 · 외형뿐이고 판 능력치는 없다.
// 달 = kstDateKey 앞 일곱 자. 달이 바뀌면 열린 칸은 저절로 받고 못 연 칸은 없어진다(구매 창에 적는다). 되돌린 달로는 안 돌아간다.

import { KIT_IDS, type KitPick } from './kit';
import type { Reward } from './progress';

export const RUNGS = 30;
/** 앞 다섯 칸은 하루 안에 열리는 맛 — 뒤는 하루 완주(105점)로 칸 하나 반 */
const EARLY = 5;
const EARLY_NEED = 40;
const LATE_NEED = 76;
/** 달의 끝 이 날수는 점수 두 배 — 달 중간에 시작해도 끝 칸까지 간다 */
export const LATE_DAYS = 10;

export interface Season {
  key: string;
  pts: number;
  /** 받은 일반 칸 수 */
  free: number;
  /** 받은 특근 칸 수 */
  paid: number;
  /** 이번 달 특근 수당을 샀나 */
  pass: boolean;
}

export function emptySeason(): Season {
  return { key: '', pts: 0, free: 0, paid: 0, pass: false };
}

/** 앞에서 n칸을 여는 데 드는 점수 */
export const rungNeed = (n: number): number => Math.min(n, EARLY) * EARLY_NEED + Math.max(0, n - EARLY) * LATE_NEED;

/** 지금 점수로 열린 칸 수 */
export function rungsOpen(pts: number): number {
  const early = EARLY * EARLY_NEED;
  const n = pts < early ? Math.floor(pts / EARLY_NEED) : EARLY + Math.floor((pts - early) / LATE_NEED);
  return Math.min(RUNGS, n);
}

/** 달이 바뀌었으면 새 판(제자리). 지난달 열린 칸은 받아서 돌려준다 — 돈 낸 칸이 안 눌렀다고 사라지면 안 된다 */
export function rollSeason(s: Season, dateKey: string): Reward | null {
  const key = dateKey.slice(0, 7);
  if (key <= s.key) return null;
  const left = claimSeason(s);
  Object.assign(s, emptySeason(), { key });
  return left;
}

function monthDays(dateKey: string): number {
  return new Date(Date.UTC(+dateKey.slice(0, 4), +dateKey.slice(5, 7), 0)).getUTCDate();
}

/** 이 달 남은 날 — 오늘 포함 */
export function seasonDaysLeft(dateKey: string): number {
  return monthDays(dateKey) - +dateKey.slice(8, 10) + 1;
}

/** 점수를 더하고 실제로 더한 값을 돌려준다 */
export function addSeasonPts(s: Season, n: number, dateKey: string): number {
  const got = seasonDaysLeft(dateKey) <= LATE_DAYS ? n * 2 : n;
  s.pts += got;
  return got;
}

/** 오늘 작업 난이도 → 점수. 네 칸 합 65 */
export const seasonPtsOf = (tier: number): number => [10, 15, 25][tier] ?? 10;
/** 일당 단계 · 출근 점수. 하루 합은 오늘 작업과 더해 105 */
export const WAGE_PTS = [10, 20] as const;
export const ATTEND_PTS = 10;
const DAY_PTS = 65 + WAGE_PTS[0] + WAGE_PTS[1] + ATTEND_PTS;

/** 내일부터 달 끝까지 매일 만점이면 열리는 칸 수 — 오늘은 이미 했을 수 있어 뺀다. 구매 창은 이 몫만 약속한다 */
export function rungsReach(s: Season, dateKey: string): number {
  const days = seasonDaysLeft(dateKey) - 1;
  const late = Math.min(days, LATE_DAYS);
  return rungsOpen(s.pts + (days + late) * DAY_PTS);
}

export interface SeasonTheme {
  id: string;
  name: string;
  /** 특근 줄 가운데 칸 — 졸라맨 */
  body: string;
  /** 특근 줄 끝 칸 — 칼빛 */
  blade: string;
}

/** 셋이 달마다 돈다 */
export const SEASON_THEMES: readonly SeasonTheme[] = [
  { id: 'night', name: '야간 철거', body: 's_night', blade: 's_moon' },
  { id: 'blast', name: '폭파 해체', body: 's_powder', blade: 's_fuse' },
  { id: 'high', name: '고공 철거', body: 's_high', blade: 's_steel' },
];

export function seasonTheme(key: string): SeasonTheme {
  const n = +key.slice(0, 4) * 12 + +key.slice(5, 7);
  return SEASON_THEMES[n % SEASON_THEMES.length];
}

/** 일반 줄 i칸(0부터). 다섯 칸마다 장비, 끝 칸은 마스크 */
export function freeReward(i: number): Reward {
  if (i === RUNGS - 1) return { orbit: 50, masks: 1 };
  if ((i + 1) % 10 === 0) return { orbit: 30 };
  if ((i + 1) % 5 === 0) return { items: { waza: 1 } };
  return i % 2 === 0 ? { dust: 60 } : { orbit: 8 };
}

const PAID_KIT = ['life', 'waza', 'dust2x'] as const;

/** 특근 줄 i칸. 첫 칸이 커서 사자마자 받을 것이 있다 */
export function paidReward(i: number, t: SeasonTheme): Reward {
  if (i === 0) return { orbit: 60, items: { waza: 2 } };
  if (i === 14) return { orbit: 20, owns: [t.body] };
  if (i === RUNGS - 1) return { orbit: 100, owns: [t.blade] };
  if ((i + 1) % 10 === 0) return { orbit: 20, masks: 1 };
  if ((i + 1) % 3 === 0) return { orbit: 10, items: { [PAID_KIT[((i + 1) / 3) % PAID_KIT.length]]: 1 } };
  return { orbit: 15 };
}

/** 보상 둘을 합친다 — 모두 받기 · 수첩 칸 */
export function addReward(a: Reward | null, b: Reward): Reward {
  const items: KitPick = { ...a?.items };
  for (const id of KIT_IDS) if (b.items?.[id]) items[id] = (items[id] ?? 0) + b.items[id]!;
  const owns = [...(a?.owns ?? []), ...(b.owns ?? [])];
  const out: Reward = {};
  const dust = (a?.dust ?? 0) + (b.dust ?? 0);
  const orbit = (a?.orbit ?? 0) + (b.orbit ?? 0);
  const masks = (a?.masks ?? 0) + (b.masks ?? 0);
  if (dust) out.dust = dust;
  if (orbit) out.orbit = orbit;
  if (masks) out.masks = masks;
  if (owns.length) out.owns = owns;
  if (Object.keys(items).length) out.items = items;
  return out;
}

/** 열린 칸 중 안 받은 것 전부를 합쳐 받는다(제자리). 없으면 null */
export function claimSeason(s: Season): Reward | null {
  const open = rungsOpen(s.pts);
  const t = seasonTheme(s.key);
  let r: Reward | null = null;
  for (; s.free < open; s.free++) r = addReward(r, freeReward(s.free));
  if (s.pass) for (; s.paid < open; s.paid++) r = addReward(r, paidReward(s.paid, t));
  return r;
}

/** 받을 칸이 있나 */
export function seasonReady(s: Season): boolean {
  const open = rungsOpen(s.pts);
  return s.free < open || (s.pass && s.paid < open);
}

/** 특근 줄 앞 n칸의 합 — 구매 창 · 값어치 */
export function paidTotal(t: SeasonTheme, n = RUNGS): Reward {
  let r: Reward | null = null;
  for (let i = 0; i < n; i++) r = addReward(r, paidReward(i, t));
  return r ?? {};
}

export function validateSeason(v: unknown): Season {
  const o = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  const n = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0);
  return {
    key: typeof o.key === 'string' && /^\d{4}-\d{2}$/.test(o.key) ? o.key : '',
    pts: n(o.pts),
    free: Math.min(n(o.free), RUNGS),
    paid: Math.min(n(o.paid), RUNGS),
    pass: o.pass === true,
  };
}
