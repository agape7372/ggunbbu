// 매일 돌아올 이유와 쌓이는 기록 — 출근부 · 일당 · 월급 · 신입 과제 · 실적 동기화 · 칭호. DOM 없음.
// 날짜는 dateKey(KST 05:00 경계) 문자열로 비교한다. 앞으로만 간다 — 시계를 되돌려도 두 번 못 받는다.

import { addItems, type Items, type KitId, type KitPick, KIT_IDS, kitDef } from './kit';
import { ACHIEVES, hash32 } from './missions';
import { SALARY_DAILY } from './catalog';
import { LOOK_EARNED, WEAPON_IDS } from './loadout';
import type { DailyState, MissionDef, MissionProgress, StatKey } from './types';

export interface Reward {
  dust?: number;
  orbit?: number;
  items?: KitPick;
  owns?: readonly string[];
  /** 새로 그릴 수 있는 마스크 */
  masks?: number;
}

export interface Inv {
  dust: number;
  orbit: number;
  items: Items;
  owned: string[];
  blanks: number;
}

export function giveReward(inv: Inv, r: Reward): void {
  inv.dust += r.dust ?? 0;
  inv.orbit += r.orbit ?? 0;
  if (r.items) addItems(inv.items, r.items);
  if (r.owns) inv.owned = [...new Set([...inv.owned, ...r.owns])];
  inv.blanks += r.masks ?? 0;
}

/** 보상 한 줄 — 칸 설명 · 소제목 · aria-label(보상은 rewardFx로 보이고 토스트로 되돌리지 않는다, 불변 15) */
export function rewardText(r: Reward): string {
  const out: string[] = [];
  if (r.dust) out.push(`먼지 ${r.dust.toLocaleString('ko-KR')}`);
  if (r.orbit) out.push(`궤도조각 ${r.orbit}`);
  for (const id of KIT_IDS) {
    const n = r.items?.[id] ?? 0;
    if (n) out.push(`${kitDef(id)!.name} ${n}`);
  }
  for (const id of r.owns ?? []) if (LOOK_EARNED[id]) out.push(LOOK_EARNED[id].name);
  if (r.masks) out.push(`마스크 ${r.masks}개`);
  return out.join(' · ');
}

// ── 출근부 ─────────────────────────────────────────────────────
// 일곱 칸을 차례로. 빠진 날이 있어도 이어서 받는다. 일곱째가 제일 크다.
export const ATTEND: readonly Reward[] = [
  { dust: 50 },
  { orbit: 15 },
  { items: { dust2x: 1 } },
  { dust: 100 },
  { items: { waza: 1 } },
  { orbit: 25 },
  { orbit: 40, items: { life: 2 }, masks: 1 },
];

export interface Attend {
  /** 다음에 받을 칸 0~6 */
  step: number;
  /** 마지막으로 받은 날 */
  key: string;
}

export const attendReady = (a: Attend, dateKey: string): boolean => dateKey > a.key;

/** 오늘 칸을 받는다(제자리). 이미 받았으면 null */
export function claimAttend(a: Attend, dateKey: string): Reward | null {
  if (!attendReady(a, dateKey)) return null;
  const r = ATTEND[a.step % ATTEND.length];
  a.step = (a.step + 1) % ATTEND.length;
  a.key = dateKey;
  return r;
}

// ── 일당 ──────────────────────────────────────────────────────
// 일일 미션을 2개 · 4개 받으면 주는 고정 보상. 둘째 단계의 장비는 날짜로 정해지고 미리 보인다.
export const WAGE_STEPS = [2, 4] as const;

export interface Wage {
  key: string;
  /** 오늘 받은 단계 수 0~2 */
  got: number;
}

const wageToday = (w: Wage, dateKey: string): number => (w.key === dateKey ? w.got : 0);

export function wageReward(step: number, dateKey: string): Reward {
  if (step === 0) return { dust: 40 };
  const id: KitId = KIT_IDS[hash32(dateKey) % KIT_IDS.length];
  return { orbit: 15, items: { [id]: 1 } };
}

const claimedToday = (d: DailyState | null): number => d?.items.filter((p) => p.claimed).length ?? 0;

/** 지금 받을 수 있는 일당 단계. 없으면 -1 */
export function wageReady(w: Wage, d: DailyState | null): number {
  if (!d) return -1;
  const got = wageToday(w, d.dateKey);
  return got < WAGE_STEPS.length && claimedToday(d) >= WAGE_STEPS[got] ? got : -1;
}

/** 일당을 받는다(제자리). 받을 게 없으면 null */
export function claimWage(w: Wage, d: DailyState | null): Reward | null {
  const step = wageReady(w, d);
  if (step < 0 || !d) return null;
  w.key = d.dateKey;
  w.got = step + 1;
  return wageReward(step, d.dateKey);
}

// ── 오늘의 철거 대상 ─────────────────────────────────────────
// 미션 탭 맨 위 건물. 오늘 작업을 하나 받을 때마다 한 층씩 무너진다. 날짜로 정해진다.
export const DEMO_SITES: readonly { name: string; theme: string }[] = [
  { name: '미소 여관', theme: 'asia' },
  { name: '중앙 사우나', theme: 'modern' },
  { name: '청기와 예식장', theme: 'eastasia' },
  { name: '대성 오락실', theme: 'modern' },
  { name: '은하 다방', theme: 'europe' },
  { name: '옛 시청 별관', theme: 'europe' },
  { name: '소망 문방구', theme: 'asia' },
  { name: '장미 미용실', theme: 'eastasia' },
  { name: '현대 볼링장', theme: 'modern' },
  { name: '새마을 금고', theme: 'europe' },
  { name: '만복 중국집', theme: 'eastasia' },
  { name: '한양 독서실', theme: 'asia' },
];

export const demoSite = (dateKey: string): { name: string; theme: string } =>
  DEMO_SITES[hash32(`site${dateKey}`) % DEMO_SITES.length];

// ── 매점 공짜 커피 ─────────────────────────────────────────────
// 하루 한 잔. 살 것이 없어도 매점에 들를 이유.
export const FREE_COFFEE: Reward = { dust: 30 };

export const coffeeReady = (key: string, dateKey: string): boolean => dateKey > key;

// ── 월급 봉투 ──────────────────────────────────────────────────
// 칸(left)이 남아 있는 동안 하루 한 번. 빠진 날은 없어지지 않고 뒤로 밀린다. 광고 없음만 달력으로 끝난다.
export interface Salary {
  left: number;
  key: string;
  /** 이 날짜 전까지 광고 없음 */
  adUntil?: string;
}

export const salaryAdFree = (s: Salary, dateKey: string): boolean => dateKey < (s.adUntil ?? '');

/** 미래 날짜 key(시계가 앞서 갔다 돌아온 흔적)는 오늘로 되돌린다 — 돈 낸 월급이 몇 주씩 잠기지 않게. 오늘 몫은 받은 것으로 친다 */
export function salaryReady(s: Salary, dateKey: string): boolean {
  if (s.key > dateKey) s.key = dateKey;
  return s.left > 0 && dateKey > s.key;
}

export function claimSalary(s: Salary, dateKey: string): Reward | null {
  if (!salaryReady(s, dateKey)) return null;
  s.left -= 1;
  s.key = dateKey;
  return SALARY_DAILY;
}

// ── 평생 값 ────────────────────────────────────────────────────
export type Facts = Record<StatKey, number> & { kitRuns: number; chapters: number };

export interface FactSource {
  stats: { buildings: number; runs: number; specials: number; guards: number; bosses: number; kitRuns: number };
  stages: Readonly<Record<string, { lamp: number }>>;
  owned: readonly string[];
  license: number;
  unlockedChapters: number;
}

/** book = 도감에서 모은 칸 — 도감 그리기와 같은 수를 호출측이 넘긴다 */
export function factsOf(s: FactSource, book: number): Facts {
  return {
    ...s.stats,
    stageClears: Object.values(s.stages).filter((r) => r.lamp > 0).length,
    weapons: WEAPON_IDS.filter((id) => id === 'sword' || s.owned.includes(id)).length,
    book,
    license: s.license,
    chapters: s.unlockedChapters,
  };
}

// ── 신입 과제 ──────────────────────────────────────────────────
// 차례로 하나씩. 첫 칸 보상이 망치 값이라 첫 판이 끝나자마자 살 것이 생긴다.
export interface RookieStep {
  title: string;
  desc: string;
  done(f: Facts): boolean;
  reward: Reward;
}

export const ROOKIE: readonly RookieStep[] = [
  { title: '첫 판 끝내기', desc: '어디까지 가든 첫 출근이다.', done: (f) => f.runs >= 1, reward: { dust: 300, items: { life: 3, waza: 3, dust2x: 2 } } },
  { title: '무기 한 자루', desc: '상점에서 새 연장을 산다.', done: (f) => f.weapons >= 2, reward: { orbit: 30 } },
  { title: '필살 한 번', desc: '게이지가 차면 누른다.', done: (f) => f.specials >= 1, reward: { dust: 100 } },
  { title: '시작 장비 써 보기', desc: '판 시작 때 하나 골라 들고 간다.', done: (f) => f.kitRuns >= 1, reward: { orbit: 30 } },
  { title: '구역 2 닿기', desc: '아케이드에서 다음 구역까지.', done: (f) => f.chapters >= 1, reward: { dust: 200, items: { waza: 1 } } },
  { title: '지시서 한 장', desc: '작업 지시서 하나를 끝낸다.', done: (f) => f.stageClears >= 1, reward: { orbit: 40, items: { life: 1 } } },
  { title: '3급 따기', desc: '철거 자격에 응시한다.', done: (f) => f.license >= 1, reward: { orbit: 60, owns: ['sprout'] } },
];

export const ROOKIE_TITLE = '신입 졸업';

/** 지금 단계가 끝나 받을 수 있나 */
export function rookieReady(step: number, f: Facts): boolean {
  return ROOKIE[step]?.done(f) ?? false;
}

// ── 실적 ──────────────────────────────────────────────────────
const NONE: readonly MissionDef[] = [];

/**
 * 저장에서 읽는 실적의 값을 맞춘다(제자리). 이번에 처음 채운 실적을 돌려준다 — 판 중 자막 · 결과 카드용.
 * 판 도중 틱마다 불러도 되게 할당 없이 돈다(달성이 없으면 빈 배열 상수).
 */
export function syncAchieves(list: MissionProgress[], f: Facts): readonly MissionDef[] {
  let hit: MissionDef[] | null = null;
  for (const d of ACHIEVES) {
    if (!d.stat) continue;
    const p = list.find((x) => x.id === d.id);
    if (!p || p.claimed) continue;
    const v = Math.min(d.goal, f[d.stat]);
    if (v === p.count) continue;
    const was = p.count;
    p.count = v;
    if (was < d.goal && v >= d.goal) (hit ??= []).push(d);
  }
  return hit ?? NONE;
}

/** 채웠는데 아직 안 받은 실적 */
export function readyAchieves(list: readonly MissionProgress[]): MissionDef[] {
  return ACHIEVES.filter((d) => {
    const p = list.find((x) => x.id === d.id);
    return !!p && !p.claimed && p.count >= d.goal;
  });
}

export interface AchieveLine {
  line: string;
  /** 부문에서 지금 보일 단계. 다 받았으면 null */
  def: MissionDef | null;
  done: number;
  total: number;
}

/** 부문별 지금 단계 — 받은 단계는 수로만 남는다 */
export function achieveLines(list: readonly MissionProgress[]): AchieveLine[] {
  const claimed = new Set(list.filter((p) => p.claimed).map((p) => p.id));
  const out = new Map<string, AchieveLine>();
  for (const d of ACHIEVES) {
    const key = d.line ?? d.id;
    const row = out.get(key) ?? { line: key, def: null, done: 0, total: 0 };
    row.total += 1;
    if (claimed.has(d.id)) row.done += 1;
    else row.def ??= d;
    out.set(key, row);
  }
  return [...out.values()];
}

// ── 칭호 ──────────────────────────────────────────────────────
/** 뒤로 갈수록 높다. 대표 칭호 = 가진 것 중 맨 뒤 */
export const TITLES: readonly { id: string; name: string }[] = [
  { id: 'ach_b500', name: '철거 반장' },
  { id: 'ach_w12', name: '연장 부자' },
  { id: 'ach_r200', name: '개근' },
  { id: 'ach_bo20', name: '명물 사냥꾼' },
  { id: 'ach_bk30', name: '수집가' },
  { id: 'ach_st13', name: '지시서 완수' },
  { id: 'ach_b5000', name: '철거 명인' },
  { id: 'ach_l3', name: '1급 기사' },
  { id: 'combo_999', name: '카운터 스톱' },
  { id: 'bare_moon', name: '맨손 철거' },
  { id: 'ach_bk46', name: '도감 완성' },
  { id: 'ach_b10000', name: '만 채 철거' },
];

/** 가진 칭호(낮은 것부터). 신입 졸업이 맨 앞 */
export function titlesOf(list: readonly MissionProgress[], rookie: number): string[] {
  const claimed = new Set(list.filter((p) => p.claimed).map((p) => p.id));
  const out = rookie >= ROOKIE.length ? [ROOKIE_TITLE] : [];
  for (const t of TITLES) if (claimed.has(t.id)) out.push(t.name);
  return out;
}

export const TITLE_TOTAL = TITLES.length + 1;

// ── 저장 검증 ──────────────────────────────────────────────────
const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0);
const str = (x: unknown): string => (typeof x === 'string' ? x : '');
const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

export function validateAttend(v: unknown): Attend {
  const o = rec(v);
  return { step: Math.min(num(o.step), ATTEND.length - 1), key: str(o.key) };
}

export function validateWage(v: unknown): Wage {
  const o = rec(v);
  return { key: str(o.key), got: Math.min(num(o.got), WAGE_STEPS.length) };
}

export function validateSalary(v: unknown): Salary {
  const o = rec(v);
  return { left: num(o.left), key: str(o.key), ...(o.adUntil ? { adUntil: str(o.adUntil) } : {}) };
}
