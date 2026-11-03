// 일일 미션·실적. 씬이 이벤트 요약을 넣고, 이 모듈은 날짜·카운트·수령만 담당.
// 일일 리셋 = KST 05:00. Math.random 금지 — dateKey 해시로 쉬움 1 · 보통 2 · 도전 1을 고른다.
// 실적은 부문(line)마다 단계 줄이다. 기존 id는 저장에 남아 있으니 바꾸지 않는다.

import type { DailyState, MissionDef, MissionProgress } from './types';
import { ORBIT_MISSION_BASE, ORBIT_PER_AD, applyAdBoost } from './economy';

export type { DailyState, MissionDef, MissionProgress };
export type MissionKind = MissionDef['kind'];

/** 진행 트랙. applyMissionEvent가 id 대신 이 키로 묶는다. */
export type MissionTrack =
  | 'destroy'
  | 'combo'
  | 'special'
  | 'survive'
  | 'ad'
  | 'act2'
  | 'moon'
  | 'butter'
  | 'pin'
  | 'revive'
  | 'crate'
  | 'guard'
  | 'play'
  | 'stageClear'
  | 'bareAct2'
  | 'bareMoon';

export interface MissionEvent {
  kind: string;
  n?: number;
  combo?: number;
  zone?: string;
}

/** 오늘 일일 칸 — 칸마다 난이도. 쉬운 칸이 첫 판 안에 끝나 「오늘 하나는 했다」가 먼저 온다 */
export const DAILY_SLOTS: readonly (0 | 1 | 2)[] = [0, 1, 1, 2];
export const DAILY_PICK = DAILY_SLOTS.length;

export const DAILY_POOL: readonly MissionDef[] = [
  {
    id: 'destroy_15',
    kind: 'daily',
    title: '건물 열다섯 채',
    desc: '오늘 할당량. 완파만 센다.',
    goal: 15,
    rewardDust: 30,
    rewardOrbit: ORBIT_MISSION_BASE,
    tier: 1,
  },
  {
    id: 'combo_50',
    kind: 'daily',
    title: '콤보 50',
    desc: '한 판에서 끊지 않고 50.',
    goal: 50,
    rewardDust: 20,
    rewardOrbit: ORBIT_MISSION_BASE,
    tier: 1,
  },
  {
    id: 'special_1',
    kind: 'daily',
    title: '필살 한 번',
    desc: '게이지가 가득 차면 누른다.',
    goal: 1,
    rewardDust: 10,
    rewardOrbit: ORBIT_MISSION_BASE,
    tier: 0,
  },
  {
    id: 'survive_giwa',
    kind: 'daily',
    title: '기와능선에 닿기',
    desc: '제3구역에 닿는 순간 센다.',
    goal: 1,
    rewardDust: 60,
    rewardOrbit: 20,
    minChapter: 2,
    tier: 2,
  },
  {
    id: 'watch_ad',
    kind: 'daily',
    title: '광고 한 편',
    desc: '궤도조각 광고. 선택은 본인.',
    goal: 1,
    rewardDust: 0,
    rewardOrbit: ORBIT_PER_AD,
    tier: 1,
  },
  {
    id: 'destroy_8',
    kind: 'daily',
    title: '건물 여덟 채',
    desc: '짧은 할당. 완파만 센다.',
    goal: 8,
    rewardDust: 16,
    rewardOrbit: 8,
    tier: 0,
  },
  {
    id: 'combo_30',
    kind: 'daily',
    title: '콤보 30',
    desc: '끊기 전에 서른. 워밍업.',
    goal: 30,
    rewardDust: 12,
    rewardOrbit: 8,
    tier: 0,
  },
  {
    id: 'crate_3',
    kind: 'daily',
    title: '보급 상자 셋',
    desc: '한 판이 아니어도 된다. 오늘 셋.',
    goal: 3,
    rewardDust: 15,
    rewardOrbit: 8,
    tier: 1,
  },
  { id: 'crate_1', kind: 'daily', title: '보급 상자 하나', desc: '떨어지면 줍는다.', goal: 1, rewardDust: 10, rewardOrbit: 8, tier: 0 },
  { id: 'play_2', kind: 'daily', title: '두 판 출근', desc: '어느 판이든 두 번 시작한다.', goal: 2, rewardDust: 12, rewardOrbit: 8, tier: 0 },
  { id: 'guard_5', kind: 'daily', title: '가드 다섯 번', desc: '건물을 튕겨 올린다.', goal: 5, rewardDust: 20, rewardOrbit: 12, tier: 1 },
  { id: 'special_3', kind: 'daily', title: '필살 세 번', desc: '오늘 합쳐서 셋.', goal: 3, rewardDust: 20, rewardOrbit: 12, tier: 1 },
  { id: 'destroy_40', kind: 'daily', title: '건물 마흔 채', desc: '오늘 합쳐서 마흔.', goal: 40, rewardDust: 60, rewardOrbit: 20, tier: 2 },
  { id: 'combo_100d', kind: 'daily', title: '콤보 100', desc: '한 판에서 끊지 않고 100.', goal: 100, rewardDust: 50, rewardOrbit: 20, tier: 2 },
  { id: 'guard_20', kind: 'daily', title: '가드 스무 번', desc: '오늘 합쳐서 스물.', goal: 20, rewardDust: 50, rewardOrbit: 20, tier: 2 },
  { id: 'stage_clear', kind: 'daily', title: '지시서 한 장', desc: '작업 지시서를 끝낸다. 난이도는 상관없다.', goal: 1, rewardDust: 60, rewardOrbit: 20, tier: 2 },
];

export const ACHIEVES: readonly MissionDef[] = [
  {
    id: 'first_act2',
    kind: 'achieve',
    title: '2막 입성',
    desc: '2막에 들어간다. 집게가 기다린다.',
    goal: 1,
    rewardDust: 50,
    rewardOrbit: ORBIT_MISSION_BASE * 2,
    line: '2막',
  },
  {
    id: 'moon_clear',
    kind: 'achieve',
    title: '집행기 격파',
    desc: '집게를 부수고 집행을 멈춘다.',
    goal: 1,
    rewardDust: 80,
    rewardOrbit: ORBIT_MISSION_BASE * 3,
    line: '2막',
  },
  {
    id: 'combo_100',
    kind: 'achieve',
    title: '콤보 100',
    desc: '실화냐.',
    goal: 100,
    rewardDust: 40,
    rewardOrbit: ORBIT_MISSION_BASE,
    line: '콤보',
  },
  { id: 'combo_300', kind: 'achieve', title: '콤보 300', desc: '손목은 괜찮습니까.', goal: 300, rewardDust: 60, rewardOrbit: ORBIT_MISSION_BASE, rewardItems: { waza: 1 }, line: '콤보' },
  {
    id: 'combo_500',
    kind: 'achieve',
    title: '콤보 500',
    desc: '그만하면 됩니다.',
    goal: 500,
    rewardDust: 80,
    rewardOrbit: ORBIT_MISSION_BASE * 2,
    line: '콤보',
  },
  {
    id: 'combo_999',
    kind: 'achieve',
    title: '콤보 999',
    desc: '기계가 더 못 셉니다.',
    goal: 999,
    rewardDust: 120,
    rewardOrbit: ORBIT_MISSION_BASE * 4,
    line: '콤보',
  },
  {
    id: 'butter_perfect',
    kind: 'achieve',
    title: '버터 완벽',
    desc: '시간 안에 다 부순다. PERFECT.',
    goal: 1,
    rewardDust: 40,
    rewardOrbit: ORBIT_MISSION_BASE * 2,
    line: '버터',
  },
  {
    id: 'pin_escape',
    kind: 'achieve',
    title: '깔림 탈출',
    desc: '지면에서 한 번 일어난다.',
    goal: 1,
    rewardDust: 20,
    rewardOrbit: ORBIT_MISSION_BASE,
    line: '깔림',
  },
  {
    id: 'revive_3',
    kind: 'achieve',
    title: '한 판 부활 셋',
    desc: '한 판에서 광고로 세 번 일어나기.',
    goal: 3,
    rewardDust: 40,
    rewardOrbit: ORBIT_MISSION_BASE,
    line: '부활',
  },
  { id: 'ach_b100', kind: 'achieve', title: '철거 100채', desc: '평생 누적.', goal: 100, rewardDust: 40, rewardOrbit: 12, line: '철거', stat: 'buildings' },
  { id: 'ach_b500', kind: 'achieve', title: '철거 500채', desc: '평생 누적.', goal: 500, rewardDust: 80, rewardOrbit: 20, rewardItems: { life: 1 }, line: '철거', stat: 'buildings' },
  { id: 'ach_b2000', kind: 'achieve', title: '철거 2,000채', desc: '평생 누적.', goal: 2000, rewardDust: 150, rewardOrbit: 40, rewardItems: { life: 2 }, line: '철거', stat: 'buildings' },
  { id: 'ach_b5000', kind: 'achieve', title: '철거 5,000채', desc: '평생 누적.', goal: 5000, rewardDust: 250, rewardOrbit: 60, rewardItems: { waza: 3 }, line: '철거', stat: 'buildings' },
  { id: 'ach_b10000', kind: 'achieve', title: '철거 10,000채', desc: '동네가 비었습니다.', goal: 10000, rewardDust: 400, rewardOrbit: 100, line: '철거', stat: 'buildings' },
  { id: 'ach_s10', kind: 'achieve', title: '필살 10번', desc: '평생 누적.', goal: 10, rewardDust: 30, rewardOrbit: 12, line: '필살', stat: 'specials' },
  { id: 'ach_s50', kind: 'achieve', title: '필살 50번', desc: '평생 누적.', goal: 50, rewardDust: 60, rewardOrbit: 20, rewardItems: { waza: 2 }, line: '필살', stat: 'specials' },
  { id: 'ach_s200', kind: 'achieve', title: '필살 200번', desc: '평생 누적.', goal: 200, rewardDust: 120, rewardOrbit: 40, rewardItems: { waza: 3 }, line: '필살', stat: 'specials' },
  { id: 'ach_s1000', kind: 'achieve', title: '필살 1,000번', desc: '평생 누적.', goal: 1000, rewardDust: 300, rewardOrbit: 80, line: '필살', stat: 'specials' },
  { id: 'ach_g20', kind: 'achieve', title: '가드 20번', desc: '평생 누적.', goal: 20, rewardDust: 30, rewardOrbit: 12, line: '가드', stat: 'guards' },
  { id: 'ach_g100', kind: 'achieve', title: '가드 100번', desc: '평생 누적.', goal: 100, rewardDust: 60, rewardOrbit: 20, rewardItems: { life: 1 }, line: '가드', stat: 'guards' },
  { id: 'ach_g500', kind: 'achieve', title: '가드 500번', desc: '평생 누적.', goal: 500, rewardDust: 150, rewardOrbit: 50, rewardItems: { life: 2 }, line: '가드', stat: 'guards' },
  { id: 'ach_st1', kind: 'achieve', title: '지시서 1장', desc: '서로 다른 지시서를 끝낸다.', goal: 1, rewardDust: 40, rewardOrbit: 12, rewardItems: { waza: 1 }, line: '지시서', stat: 'stageClears' },
  { id: 'ach_st5', kind: 'achieve', title: '지시서 5장', desc: '서로 다른 지시서를 끝낸다.', goal: 5, rewardDust: 100, rewardOrbit: 30, rewardItems: { dust2x: 2 }, line: '지시서', stat: 'stageClears' },
  { id: 'ach_st13', kind: 'achieve', title: '지시서 전부', desc: '열세 장을 다 끝낸다.', goal: 13, rewardDust: 300, rewardOrbit: 80, line: '지시서', stat: 'stageClears' },
  { id: 'ach_bo1', kind: 'achieve', title: '명물 첫 격파', desc: '명물이나 집행기를 쓰러뜨린다.', goal: 1, rewardDust: 40, rewardOrbit: 12, line: '명물', stat: 'bosses' },
  { id: 'ach_bo5', kind: 'achieve', title: '명물 5번', desc: '평생 누적.', goal: 5, rewardDust: 80, rewardOrbit: 25, rewardItems: { life: 1 }, line: '명물', stat: 'bosses' },
  { id: 'ach_bo20', kind: 'achieve', title: '명물 20번', desc: '평생 누적.', goal: 20, rewardDust: 200, rewardOrbit: 60, line: '명물', stat: 'bosses' },
  { id: 'ach_bk15', kind: 'achieve', title: '도감 15칸', desc: '모은 만큼 준다.', goal: 15, rewardDust: 60, rewardOrbit: 20, line: '도감', stat: 'book' },
  { id: 'ach_bk20', kind: 'achieve', title: '도감 20칸', desc: '전용 칼빛 불씨.', goal: 20, rewardDust: 100, rewardOrbit: 30, owns: ['ember'], line: '도감', stat: 'book' },
  { id: 'ach_bk25', kind: 'achieve', title: '도감 25칸', desc: '전용 졸라맨 잿빛.', goal: 25, rewardDust: 150, rewardOrbit: 40, owns: ['ash'], line: '도감', stat: 'book' },
  { id: 'ach_bk30', kind: 'achieve', title: '도감 30칸', desc: '수집가입니다.', goal: 30, rewardDust: 300, rewardOrbit: 80, line: '도감', stat: 'book' },
  { id: 'ach_bk40', kind: 'achieve', title: '도감 40칸', desc: '창고가 모자란다.', goal: 40, rewardDust: 500, rewardOrbit: 120, line: '도감', stat: 'book' },
  { id: 'ach_bk46', kind: 'achieve', title: '도감 46칸', desc: '전 칸을 채웠다.', goal: 46, rewardDust: 0, rewardOrbit: 300, line: '도감', stat: 'book' },
  { id: 'ach_w3', kind: 'achieve', title: '연장 셋', desc: '무기 세 자루를 갖는다.', goal: 3, rewardDust: 50, rewardOrbit: 15, line: '무기', stat: 'weapons' },
  { id: 'ach_w6', kind: 'achieve', title: '연장 여섯', desc: '무기 여섯 자루를 갖는다.', goal: 6, rewardDust: 120, rewardOrbit: 30, line: '무기', stat: 'weapons' },
  { id: 'ach_w12', kind: 'achieve', title: '연장 전부', desc: '열두 자루를 다 갖는다.', goal: 12, rewardDust: 300, rewardOrbit: 80, line: '무기', stat: 'weapons' },
  { id: 'ach_r10', kind: 'achieve', title: '10판 출근', desc: '평생 누적.', goal: 10, rewardDust: 30, rewardOrbit: 12, line: '근속', stat: 'runs' },
  { id: 'ach_r50', kind: 'achieve', title: '50판 출근', desc: '평생 누적.', goal: 50, rewardDust: 80, rewardOrbit: 25, rewardItems: { dust2x: 2 }, line: '근속', stat: 'runs' },
  { id: 'ach_r200', kind: 'achieve', title: '200판 출근', desc: '평생 누적.', goal: 200, rewardDust: 200, rewardOrbit: 60, line: '근속', stat: 'runs' },
  { id: 'ach_l1', kind: 'achieve', title: '3급 자격', desc: '철거 자격을 딴다.', goal: 1, rewardDust: 60, rewardOrbit: 20, line: '자격', stat: 'license' },
  { id: 'ach_l2', kind: 'achieve', title: '2급 자격', desc: '철거 자격을 딴다.', goal: 2, rewardDust: 150, rewardOrbit: 40, line: '자격', stat: 'license' },
  { id: 'ach_l3', kind: 'achieve', title: '1급 자격', desc: '철거 자격을 딴다.', goal: 3, rewardDust: 300, rewardOrbit: 80, line: '자격', stat: 'license' },
  { id: 'bare_act2', kind: 'achieve', title: '맨손 2막', desc: '시작 장비 없이 2막에 든다.', goal: 1, rewardDust: 80, rewardOrbit: 25, line: '맨손' },
  { id: 'bare_moon', kind: 'achieve', title: '맨손 집행', desc: '시작 장비 없이 집행기를 쓰러뜨린다.', goal: 1, rewardDust: 200, rewardOrbit: 60, line: '맨손' },
];

export const TRACK_BY_ID: Readonly<Record<string, MissionTrack>> = {
  destroy_15: 'destroy',
  destroy_8: 'destroy',
  combo_50: 'combo',
  combo_30: 'combo',
  special_1: 'special',
  survive_giwa: 'survive',
  watch_ad: 'ad',
  first_act2: 'act2',
  moon_clear: 'moon',
  combo_100: 'combo',
  combo_500: 'combo',
  combo_999: 'combo',
  butter_perfect: 'butter',
  pin_escape: 'pin',
  revive_3: 'revive',
  crate_3: 'crate',
  crate_1: 'crate',
  play_2: 'play',
  guard_5: 'guard',
  guard_20: 'guard',
  special_3: 'special',
  destroy_40: 'destroy',
  combo_100d: 'combo',
  stage_clear: 'stageClear',
  combo_300: 'combo',
  bare_act2: 'bareAct2',
  bare_moon: 'bareMoon',
};

/** 생존 미션이 인정하는 구역 키(scenes가 보내는 zoneSurvive.zone). */
export const SURVIVE_ZONES: Readonly<Record<string, readonly string[]>> = {
  survive_giwa: ['eastasia'],
};

const DEFS_BY_ID: ReadonlyMap<string, MissionDef> = new Map(
  [...DAILY_POOL, ...ACHIEVES].map((d) => [d.id, d]),
);

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
/** 일일 미션이 바뀌는 KST 시각 */
const ROLLOVER_HOUR = 5;

/** FNV-1a 32비트. 일일 추첨 시드. */
export function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/** KST 05:00 경계의 YYYY-MM-DD. UTC+9에서 5시간을 뺀 뒤 날짜. */
export function kstDateKey(nowMs: number): string {
  const shifted = nowMs + KST_OFFSET_MS - ROLLOVER_HOUR * 60 * 60 * 1000;
  const d = new Date(shifted);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 다음에 일일 미션이 바뀌는 시각(ms) — 미션 탭의 남은 시간 */
export function nextRollover(nowMs: number): number {
  const dayMs = 86_400_000;
  return nowMs + dayMs - ((nowMs + KST_OFFSET_MS - ROLLOVER_HOUR * 3_600_000) % dayMs);
}

export function defById(id: string): MissionDef | undefined {
  return DEFS_BY_ID.get(id);
}

/** dateKey 해시로 칸마다(DAILY_SLOTS) 그 난이도 풀에서 중복 없이 고른다. */
export function pickDailyIds(dateKey: string, allowAd = true, reached = 3): string[] {
  // 08-30: 광고 경로가 없는 환경(웹)에선 'ad' 트랙 미션이 영구 미달성이 된다 — 풀에서 제외
  // C6: 구역 조건 미션은 그 구역에 닿은 사람에게만 — 신규 플레이어가 못 깨는 항목을 안 낸다
  const pool = DAILY_POOL.filter((d) => (allowAd || TRACK_BY_ID[d.id] !== 'ad') && (d.minChapter ?? 0) <= reached);
  const ids = pool.map((d) => d.id);
  let seed = hash32(dateKey);
  for (let i = ids.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    const tmp = ids[i];
    ids[i] = ids[j];
    ids[j] = tmp;
  }
  // 섞은 순서에서 칸마다 그 난이도의 첫 것을 집는다
  const out: string[] = [];
  for (const tier of DAILY_SLOTS) {
    const hit = ids.find((id) => !out.includes(id) && DEFS_BY_ID.get(id)?.tier === tier);
    if (hit) out.push(hit);
  }
  return out;
}

/** 날짜가 같으면 동일 참조. 다음 날이거나 null이면 해시로 새로 뽑는다. 시계를 되돌린 날짜로는 다시 안 뽑는다. */
export function ensureDaily(state: DailyState | null, nowMs: number, allowAd = true, reached = 3): DailyState {
  const dateKey = kstDateKey(nowMs);
  if (state && state.dateKey >= dateKey) {
    // 광고 경로가 사라진 환경에서 이미 뽑힌 광고 미션은 그날 안에 영구 미달성 — 그 항목만 걷어낸다
    if (!allowAd && state.items.some((p) => TRACK_BY_ID[p.id] === 'ad')) {
      return { dateKey: state.dateKey, items: state.items.filter((p) => TRACK_BY_ID[p.id] !== 'ad') };
    }
    return state;
  }
  return {
    dateKey,
    items: pickDailyIds(dateKey, allowAd, reached).map(blankProgress),
  };
}

const isReady = (p: MissionProgress): boolean => p.count >= goalOf(p.id);

/** 지금 받을 수 있는 미션 수(일일 + 업적) — 미션 탭의 점 배지 */
export function claimableCount(daily: DailyState | null, achieves: readonly MissionProgress[]): number {
  const all = [...(daily?.items ?? []), ...achieves];
  return all.filter((p) => !p.claimed && isReady(p)).length;
}

/** 오늘 일일 미션 중 채운 수 / 전체 — 타이틀의 「오늘 N/4」. 받은 것도 채운 것이다. */
export function dailyDone(daily: DailyState | null): { done: number; total: number } {
  const items = daily?.items ?? [];
  return { done: items.filter(isReady).length, total: items.length };
}

export function initAchieveProgress(): MissionProgress[] {
  return ACHIEVES.map((d) => blankProgress(d.id));
}

/** 저장의 실적을 지금 목록에 맞춘다 — 받은 기록은 살리고, 새 실적은 빈 칸으로, 없어진 id는 버린다 */
export function mergeAchieves(saved: readonly MissionProgress[]): MissionProgress[] {
  return ACHIEVES.map((d) => saved.find((p) => p.id === d.id) ?? blankProgress(d.id));
}

/**
 * 이벤트 종류 → 카운트 갱신(제자리 변이).
 * stackDestroy / special / hit·floorCollapse(combo) / adWatched
 * + moonClear / act2Enter / butterPerfect / pinEscape / revive
 * + zoneSurvive / runStart(부활 런 리셋) / supply(보급 상자)  (clingSlash는 08-30 cling 삭제와 함께 제거)
 * + guardBounce·guardAirBounce / stageClear / bareAct2 / bareMoon
 */
export function applyMissionEvent(
  daily: DailyState,
  achieves: MissionProgress[],
  event: MissionEvent,
): void {
  const kind = event.kind;
  if (kind === 'runStart') {
    resetUnclaimedTrack(achieves, 'revive');
    addOnTrack(daily.items, 'play', 1);
    return;
  }
  if (kind === 'guardBounce' || kind === 'guardAirBounce') {
    addOnTrack(daily.items, 'guard', 1);
    return;
  }
  if (kind === 'stageClear') {
    addOnTrack(daily.items, 'stageClear', 1);
    return;
  }
  if (kind === 'bareAct2' || kind === 'bareMoon') {
    addOnTrack(achieves, kind, 1);
    return;
  }
  if (kind === 'stackDestroy') {
    addOnTrack(daily.items, 'destroy', 1);
    return;
  }
  if (kind === 'special') {
    addOnTrack(daily.items, 'special', amt(event, 1));
    return;
  }
  if (kind === 'hit' || kind === 'floorCollapse') {
    const combo = event.combo ?? event.n;
    if (combo != null && combo > 0) {
      maxOnTrack(daily.items, 'combo', combo);
      maxOnTrack(achieves, 'combo', combo);
    }
    return;
  }
  if (kind === 'supply') {
    addOnTrack(daily.items, 'crate', 1);
    return;
  }
  if (kind === 'adWatched') {
    addOnTrack(daily.items, 'ad', amt(event, 1));
    return;
  }
  if (kind === 'zoneSurvive') {
    addSurvive(daily.items, event.zone);
    return;
  }
  if (kind === 'moonClear') {
    addOnTrack(achieves, 'moon', amt(event, 1));
    return;
  }
  if (kind === 'act2Enter') {
    addOnTrack(achieves, 'act2', amt(event, 1));
    return;
  }
  if (kind === 'butterPerfect') {
    addOnTrack(achieves, 'butter', amt(event, 1));
    return;
  }
  if (kind === 'pinEscape') {
    addOnTrack(achieves, 'pin', amt(event, 1));
    return;
  }
  if (kind === 'revive') {
    addOnTrack(achieves, 'revive', amt(event, 1));
  }
}

/**
 * 수령. 이미 수령했거나 미달이면 throw하지 않고 0을 돌려준다.
 * boost면 먼지·궤도 2배.
 */
export function claim(
  progress: MissionProgress,
  def: MissionDef,
  boost: boolean,
): { dust: number; orbit: number } {
  if (progress.claimed || progress.count < def.goal) {
    return { dust: 0, orbit: 0 };
  }
  progress.claimed = true;
  return {
    dust: applyAdBoost(def.rewardDust, boost),
    orbit: applyAdBoost(def.rewardOrbit, boost),
  };
}





/** id에 n을 더한다. 목표는 넘지 않는다. 새 객체. */


function blankProgress(id: string): MissionProgress {
  return { id, count: 0, claimed: false };
}

function amt(event: MissionEvent, fallback: number): number {
  const n = event.n;
  if (n == null) return fallback;
  const t = Math.trunc(n);
  return t > 0 ? t : fallback;
}

function goalOf(id: string): number {
  return DEFS_BY_ID.get(id)?.goal ?? Number.POSITIVE_INFINITY;
}

function addOnTrack(list: MissionProgress[], track: MissionTrack, n: number): void {
  if (n <= 0) return;
  for (const p of list) {
    if (p.claimed) continue;
    if (TRACK_BY_ID[p.id] !== track) continue;
    p.count = Math.min(goalOf(p.id), p.count + n);
  }
}

function maxOnTrack(list: MissionProgress[], track: MissionTrack, v: number): void {
  if (v <= 0) return;
  for (const p of list) {
    if (p.claimed) continue;
    if (TRACK_BY_ID[p.id] !== track) continue;
    p.count = Math.min(goalOf(p.id), Math.max(p.count, v));
  }
}

function addSurvive(list: MissionProgress[], zone: string | undefined): void {
  for (const p of list) {
    if (p.claimed) continue;
    if (TRACK_BY_ID[p.id] !== 'survive') continue;
    if (zone) {
      const ok = SURVIVE_ZONES[p.id];
      if (ok && !ok.includes(zone)) continue;
    }
    p.count = Math.min(goalOf(p.id), p.count + 1);
  }
}

function resetUnclaimedTrack(list: MissionProgress[], track: MissionTrack): void {
  for (const p of list) {
    if (p.claimed) continue;
    if (TRACK_BY_ID[p.id] !== track) continue;
    if (p.count < goalOf(p.id)) p.count = 0;
  }
}
