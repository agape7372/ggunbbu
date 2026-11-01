// 메타 재화. 먼지(dust)=플레이 적립, 궤도(orbit)=광고·미션·상점.
// DOM/core 없음. 지갑 객체는 호출측이 들고, 여기선 더하고 뺀다.

export interface Wallet {
  dust: number;
  orbit: number;
}

/** 건물 완파 1채당 먼지 */
export const DUST_PER_BUILDING = 2;

/** 필살기 1회당 먼지 */
export const DUST_PER_SPECIAL = 1;

/** 보급 상자 '먼지 자루' 1개 */
export const DUST_PER_SUPPLY = 10;

/** 무기는 먼지로 산다 — 플레이로 쌓은 재화가 손맛을 바꾸는 길. 철거칼은 기본 소유 */
export const WEAPON_DUST_COST: Readonly<Record<string, number>> = {
  hammer: 300,
  crowbar: 300,
  grinder: 400,
  // 대검 — 연장 셋을 다 사고 나서의 긴 목표. 맞교환이라 비쌀수록 세지는 않다(모양 값)
  iron: 450,
  saw: 600,
  hazard: 750,
  beam: 900,
  flame: 1200,
  frost: 1200,
  onyx: 1600,
  gold: 2400,
};

/** 마스크(도트판에 직접 찍는 얼굴) — 비싸게: 대검 최고 2400 위, 1급 응시료 4000 아래. 한 번 사면 다시 그리기는 무료 */
export const MASK_DUST_COST = 3000;

/** 먼지로 사는 꾸미기 — 무기 표와 따로 둔다. 결과 카드 목표는 무기를 다 가진 다음에 여기서 고른다 */
export const LOOK_DUST_COST: Readonly<Record<string, number>> = {
  mask: MASK_DUST_COST,
};

const has = (table: Readonly<Record<string, number>>, id: string): boolean =>
  Object.prototype.hasOwnProperty.call(table, id);

export function dustCost(id: string): number | undefined {
  if (has(WEAPON_DUST_COST, id)) return WEAPON_DUST_COST[id];
  return has(LOOK_DUST_COST, id) ? LOOK_DUST_COST[id] : undefined;
}

/** 결과 카드의 다음 목표 — 아직 안 가진 먼지 구매품 중 가장 싼 것(무기 먼저, 다 가졌으면 꾸미기). 모자란 먼지(0이면 지금 살 수 있다). 다 가졌으면 null */
export function nextDustGoal(
  owned: readonly string[],
  dust: number,
): { id: string; cost: number; short: number } | null {
  for (const table of [WEAPON_DUST_COST, LOOK_DUST_COST]) {
    let best: { id: string; cost: number } | null = null;
    for (const [id, cost] of Object.entries(table)) {
      if (owned.includes(id)) continue;
      if (!best || cost < best.cost) best = { id, cost };
    }
    if (best) return { ...best, short: Math.max(0, best.cost - dust) };
  }
  return null;
}

// ── 철거 자격 (C4) ─────────────────────────────────────────────
// 먼지의 영구 소비처. 누적 철거 건물 수(stats.buildings)가 조건, 먼지가 응시료다.
// 수치는 여기 한 곳에서만 만진다. 실측 수입(가드 봇, 먼지 ≈ 건물당 2.5)으로 맞췄다:
//   3급 = 첫날 한 시간 안(500 먼지 ≈ 구역1 20분) · 1급 = 하루 20~30분 플레이로 열흘 안팎.
export const LICENSE_TITLES = ['견습', '3급', '2급', '1급'] as const;

export interface LicenseExam {
  /** 응시 조건 — 누적 철거 건물 수 */
  buildings: number;
  /** 응시료(먼지) */
  fee: number;
}

/** index i = 등급 i 에서 i+1 로 가는 시험 */
export const LICENSE_EXAMS: readonly LicenseExam[] = [
  { buildings: 100, fee: 500 },
  { buildings: 500, fee: 1500 },
  { buildings: 2000, fee: 4000 },
];

const clampRank = (rank: number): number => Math.max(0, Math.min(LICENSE_EXAMS.length, Math.trunc(rank) || 0));

export function licenseTitle(rank: number): string {
  return LICENSE_TITLES[clampRank(rank)];
}

/** 다음 시험. 1급이면 null */
export function nextExam(rank: number): LicenseExam | null {
  return LICENSE_EXAMS[clampRank(rank)] ?? null;
}

export type ExamStatus = 'ok' | 'buildings' | 'dust' | 'max';

/** 지금 응시할 수 있나. 건물 조건이 먼저, 돈은 그다음 */
export function examStatus(rank: number, buildings: number, dust: number): ExamStatus {
  const exam = nextExam(rank);
  if (!exam) return 'max';
  if (buildings < exam.buildings) return 'buildings';
  return dust < exam.fee ? 'dust' : 'ok';
}

/** 응시. 되면 응시료를 빼고 한 단계 올린다. 안 되면 false, 지갑 불변 */
export function takeExam(inv: { license: number; dust: number; stats: { buildings: number } }): boolean {
  if (examStatus(inv.license, inv.stats.buildings, inv.dust) !== 'ok') return false;
  inv.dust -= nextExam(inv.license)!.fee;
  inv.license = clampRank(inv.license) + 1;
  return true;
}

/** 광고 1편당 궤도 */
export const ORBIT_PER_AD = 8;

/** 일일/업적 미션 궤도 기본치 */
export const ORBIT_MISSION_BASE = 12;

/** 한 판 광고 부활 상한 */
export const MAX_REVIVES_PER_RUN = 3;

/** 표시명 · index 별칭 */
export const DUST_NAME = '먼지';
export const ORBIT_NAME = '궤도조각';
export const REVIVE_MAX = MAX_REVIVES_PER_RUN;
export const MISSION_AD_MULT = 2;

/** 올려베기 · 용오름 해금 */
export const WAZA_ORBIT_COST = 80;

/** 코스메틱 1종 */
export const COSMETIC_ORBIT_COST = 40;

/**
 * 궤도 가격표.
 * 기본 소유(tenchi / ink / wire / flyer)는 0.
 */
export const ORBIT_COSTS: Readonly<Record<string, number>> = {
  ageba: WAZA_ORBIT_COST,
  baram: WAZA_ORBIT_COST,
  mukjul: 120,
  nakgwan: 120,
  dalmuri: 160,
  tenchi: 0,
  ink: 0,
  amber: COSMETIC_ORBIT_COST,
  slate: COSMETIC_ORBIT_COST,
  wire: 0,
  rebar: COSMETIC_ORBIT_COST,
  crescent: COSMETIC_ORBIT_COST,
  flyer: 0,
  stamp: COSMETIC_ORBIT_COST,
  orbit: COSMETIC_ORBIT_COST,
};

/** 광고 시청 시 보상 2배, 아니면 1배. */
export function applyAdBoost(base: number, watched: boolean): number {
  return watched ? base * 2 : base;
}

export function orbitCost(id: string): number | undefined {
  return Object.prototype.hasOwnProperty.call(ORBIT_COSTS, id) ? ORBIT_COSTS[id] : undefined;
}

/** 먼지·궤도를 지갑에 더한다. 음수는 0에서 멈춘다. */
export function grant(inv: Wallet, d: number, o: number): void {
  inv.dust = Math.max(0, inv.dust + d);
  inv.orbit = Math.max(0, inv.orbit + o);
}

/** 궤도 n을 쓴다. 모자라면 false, 잔액 불변. */
export function spendOrbit(inv: Wallet, n: number): boolean {
  if (n < 0) return false;
  if (inv.orbit < n) return false;
  inv.orbit -= n;
  return true;
}

/** 먼지 n을 쓴다. 모자라면 false, 잔액 불변. */
export function spendDust(inv: Wallet, n: number): boolean {
  if (n < 0) return false;
  if (inv.dust < n) return false;
  inv.dust -= n;
  return true;
}

/** 먼지 → 궤도조각 교환 단위 */
export const DUST_EXCHANGE = { dust: 50, orbit: 5 } as const;

/** 먼지 50을 궤도조각 5로 바꾼다. 모자라면 false, 지갑 불변. */
export function exchangeDust(inv: Wallet): boolean {
  if (inv.dust < DUST_EXCHANGE.dust) return false;
  inv.dust -= DUST_EXCHANGE.dust;
  inv.orbit += DUST_EXCHANGE.orbit;
  return true;
}

export function grantDust(inv: Wallet, n: number): void {
  grant(inv, n, 0);
}

export function grantOrbit(inv: Wallet, n: number): void {
  grant(inv, 0, n);
}
