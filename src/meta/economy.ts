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

/** 광고 1편당 궤도 */
export const ORBIT_PER_AD = 8;

/** 일일/업적 미션 궤도 기본치 */
export const ORBIT_MISSION_BASE = 12;

/** 한 판 광고 부활 상한 */
export const MAX_REVIVES_PER_RUN = 3;

/** 표시명 · index 별칭 */
export const DUST_NAME = '먼지';
export const ORBIT_NAME = '궤도';
export const REVIVE_MAX = MAX_REVIVES_PER_RUN;
export const MISSION_AD_MULT = 2;

/** 올려베기·철벽 해금 */
export const WAZA_ORBIT_COST = 80;

/** 코스메틱 1종 */
export const COSMETIC_ORBIT_COST = 40;

/**
 * 궤도 가격표.
 * 기본 소유(tenchi / ink / wire / flyer)는 0.
 */
export const ORBIT_COSTS: Readonly<Record<string, number>> = {
  ageba: WAZA_ORBIT_COST,
  tetsu: WAZA_ORBIT_COST,
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

export function grantDust(inv: Wallet, n: number): void {
  grant(inv, n, 0);
}

export function grantOrbit(inv: Wallet, n: number): void {
  grant(inv, 0, n);
}
