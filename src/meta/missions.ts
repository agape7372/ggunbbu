// 일일 미션·업적. 씬이 이벤트 요약을 넣고, 이 모듈은 날짜·카운트·수령만 담당.
// 일일 리셋 = KST 05:00. Math.random 금지 — dateKey 해시로 3개를 고른다.

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
  | 'revive';

export interface MissionEvent {
  kind: string;
  n?: number;
  combo?: number;
  zone?: string;
}

/** 오늘 일일에서 고르는 장수. */
export const DAILY_PICK = 3;

export const DAILY_POOL: readonly MissionDef[] = [
  {
    id: 'destroy_15',
    kind: 'daily',
    title: '건물 열다섯 채',
    desc: '오늘 할당량. 완파만 센다.',
    goal: 15,
    rewardDust: 30,
    rewardOrbit: ORBIT_MISSION_BASE,
  },
  {
    id: 'combo_50',
    kind: 'daily',
    title: '콤보 50',
    desc: '한 번의 주행에서 끊기 전에 50.',
    goal: 50,
    rewardDust: 20,
    rewardOrbit: ORBIT_MISSION_BASE,
  },
  {
    id: 'special_1',
    kind: 'daily',
    title: '필살 한 번',
    desc: '게이지가 가득 차면 누른다.',
    goal: 1,
    rewardDust: 10,
    rewardOrbit: ORBIT_MISSION_BASE,
  },
  {
    id: 'survive_giwa',
    kind: 'daily',
    title: '기와능선에서 생존',
    desc: '제3구역 기와능선을 한 판 버틴다.',
    goal: 1,
    rewardDust: 25,
    rewardOrbit: ORBIT_MISSION_BASE,
  },
  {
    id: 'watch_ad',
    kind: 'daily',
    title: '광고 한 편',
    desc: '궤도 광고. 선택은 본인.',
    goal: 1,
    rewardDust: 0,
    rewardOrbit: ORBIT_PER_AD,
  },
  {
    id: 'destroy_8',
    kind: 'daily',
    title: '건물 여덟 채',
    desc: '짧은 할당. 완파만 센다.',
    goal: 8,
    rewardDust: 16,
    rewardOrbit: 8,
  },
  {
    id: 'combo_30',
    kind: 'daily',
    title: '콤보 30',
    desc: '끊기 전에 서른. 워밍업.',
    goal: 30,
    rewardDust: 12,
    rewardOrbit: 8,
  },
];

export const ACHIEVES: readonly MissionDef[] = [
  {
    id: 'first_act2',
    kind: 'achieve',
    title: '2막 입성',
    desc: '보름호가 궤도에서 내려오는 것을 본다.',
    goal: 1,
    rewardDust: 50,
    rewardOrbit: ORBIT_MISSION_BASE * 2,
  },
  {
    id: 'moon_clear',
    kind: 'achieve',
    title: '보름호 격파',
    desc: '위성을 궤도 밖으로 민다.',
    goal: 1,
    rewardDust: 80,
    rewardOrbit: ORBIT_MISSION_BASE * 3,
  },
  {
    id: 'combo_100',
    kind: 'achieve',
    title: '콤보 100',
    desc: '실화냐.',
    goal: 100,
    rewardDust: 40,
    rewardOrbit: ORBIT_MISSION_BASE,
  },
  {
    id: 'combo_500',
    kind: 'achieve',
    title: '콤보 500',
    desc: '그만하면 됩니다.',
    goal: 500,
    rewardDust: 80,
    rewardOrbit: ORBIT_MISSION_BASE * 2,
  },
  {
    id: 'combo_999',
    kind: 'achieve',
    title: '콤보 999',
    desc: '기계가 더 못 셉니다.',
    goal: 999,
    rewardDust: 120,
    rewardOrbit: ORBIT_MISSION_BASE * 4,
  },
  {
    id: 'butter_perfect',
    kind: 'achieve',
    title: '버터 완벽',
    desc: '시간 안에 전량 파괴. PERFECT.',
    goal: 1,
    rewardDust: 40,
    rewardOrbit: ORBIT_MISSION_BASE * 2,
  },
  {
    id: 'pin_escape',
    kind: 'achieve',
    title: '깔림 탈출',
    desc: '지면에서 한 번 일어난다.',
    goal: 1,
    rewardDust: 20,
    rewardOrbit: ORBIT_MISSION_BASE,
  },
  {
    id: 'revive_3',
    kind: 'achieve',
    title: '한 판 부활 셋',
    desc: '한 번의 주행에서 광고 부활 3회.',
    goal: 3,
    rewardDust: 40,
    rewardOrbit: ORBIT_MISSION_BASE,
  },
];

/** index.ts 호환 별칭 */
export const DAILY_DEFS = DAILY_POOL;
export const ACHIEVE_DEFS = ACHIEVES;
export const MISSIONS: readonly MissionDef[] = [...DAILY_POOL, ...ACHIEVES];
export type MissionId = string;

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
};

/** 생존 미션이 인정하는 구역 키(영문 id · 한글 지명). */
export const SURVIVE_ZONES: Readonly<Record<string, readonly string[]>> = {
  survive_giwa: ['eastasia', '기와능선', 'tile'],
};

const DEFS_BY_ID: ReadonlyMap<string, MissionDef> = new Map(
  [...DAILY_POOL, ...ACHIEVES].map((d) => [d.id, d]),
);

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
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

export function defById(id: string): MissionDef | undefined {
  return DEFS_BY_ID.get(id);
}

/** dateKey 해시로 풀에서 중복 없이 DAILY_PICK개를 고른다. */
export function pickDailyIds(dateKey: string): string[] {
  const n = Math.min(DAILY_PICK, DAILY_POOL.length);
  if (n <= 0) return [];
  const ids = DAILY_POOL.map((d) => d.id);
  let seed = hash32(dateKey);
  for (let i = ids.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    const tmp = ids[i];
    ids[i] = ids[j];
    ids[j] = tmp;
  }
  return ids.slice(0, n);
}

/** 날짜가 같으면 동일 참조. 다르거나 null이면 해시로 3개를 새로 뽑는다. */
export function ensureDaily(state: DailyState | null, nowMs: number): DailyState {
  const dateKey = kstDateKey(nowMs);
  if (state && state.dateKey === dateKey) return state;
  return {
    dateKey,
    items: pickDailyIds(dateKey).map(blankProgress),
  };
}

export function initAchieveProgress(): MissionProgress[] {
  return ACHIEVES.map((d) => blankProgress(d.id));
}

/** 주스/씬 이벤트 배열을 일일·업적에 순서대로 적용. */
export function applyJuiceToMissions(
  daily: DailyState,
  achieves: MissionProgress[],
  events: readonly MissionEvent[],
): void {
  for (const e of events) applyMissionEvent(daily, achieves, e);
}

/**
 * 이벤트 종류 → 카운트 갱신(제자리 변이).
 * stackDestroy / special / hit·floorCollapse(combo) / adWatched
 * + moonClear / act2Enter / butterPerfect / pinEscape / revive
 * + survive·zoneSurvive / runStart(부활 런 리셋)  (clingSlash는 08-30 cling 삭제와 함께 제거)
 */
export function applyMissionEvent(
  daily: DailyState,
  achieves: MissionProgress[],
  event: MissionEvent,
): void {
  const kind = event.kind;
  if (kind === 'runStart' || kind === 'runEnd') {
    resetUnclaimedTrack(achieves, 'revive');
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
  if (kind === 'adWatched') {
    addOnTrack(daily.items, 'ad', amt(event, 1));
    return;
  }
  if (kind === 'survive' || kind === 'zoneSurvive') {
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

// ── index.ts 호환 (MissionState 묶음 API) ────────────────────────

export interface MissionState {
  dailyDateKey: string;
  daily: MissionProgress[];
  achieve: MissionProgress[];
}

export function emptyMissionState(nowMs: number = Date.now()): MissionState {
  const daily = ensureDaily(null, nowMs);
  return {
    dailyDateKey: daily.dateKey,
    daily: daily.items,
    achieve: initAchieveProgress(),
  };
}

export function rolloverIfNeeded(state: MissionState, nowMs: number = Date.now()): MissionState {
  const next = ensureDaily({ dateKey: state.dailyDateKey, items: state.daily }, nowMs);
  if (next.dateKey === state.dailyDateKey && next.items === state.daily) return state;
  return { dailyDateKey: next.dateKey, daily: next.items, achieve: state.achieve };
}

/** id에 n을 더한다. 목표는 넘지 않는다. 새 객체. */
export function bump(state: MissionState, id: string, n = 1): MissionState {
  const add = Math.trunc(n);
  if (add <= 0) return state;
  const daily = bumpList(state.daily, id, add);
  if (daily) {
    return daily === state.daily ? state : { ...state, daily };
  }
  const achieve = bumpList(state.achieve, id, add);
  if (achieve) {
    return achieve === state.achieve ? state : { ...state, achieve };
  }
  return state;
}

export function canClaim(state: MissionState, id: string): boolean {
  const def = DEFS_BY_ID.get(id);
  if (!def) return false;
  const p = state.daily.find((x) => x.id === id) ?? state.achieve.find((x) => x.id === id);
  return p !== undefined && !p.claimed && p.count >= def.goal;
}

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

function bumpList(list: MissionProgress[], id: string, add: number): MissionProgress[] | null {
  const i = list.findIndex((p) => p.id === id);
  if (i < 0) return null;
  const count = Math.min(goalOf(id), list[i].count + add);
  if (count === list[i].count) return list;
  const copy = list.slice();
  copy[i] = { ...list[i], count };
  return copy;
}
