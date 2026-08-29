// 메타 진행(미션·재화·로드아웃) 단일 출구.

export {
  applyAdBoost,
  COSMETIC_ORBIT_COST,
  DUST_NAME,
  DUST_PER_BUILDING,
  DUST_PER_SPECIAL,
  grant,
  grantDust,
  grantOrbit,
  MAX_REVIVES_PER_RUN,
  MISSION_AD_MULT,
  ORBIT_COSTS,
  ORBIT_MISSION_BASE,
  ORBIT_NAME,
  ORBIT_PER_AD,
  orbitCost,
  REVIVE_MAX,
  spendOrbit,
  WAZA_ORBIT_COST,
} from './economy';
export type { Wallet } from './economy';

export {
  DEFAULT_LOADOUT,
  DEFAULT_OWNED_IDS,
  equip,
  isOwned,
  isWazaUnlocked,
  ownedDefaults,
  validateLoadout,
  validateLoadout as parseLoadout,
  WAZA_CATALOG,
  WAZA_IDS,
} from './loadout';
export type { BladeSkinId, BodySkinId, LetterSkinId, Loadout, WazaId } from './loadout';
export type StickSkinId = import('./loadout').BodySkinId;
export const WAZA_UNLOCK_DEFAULT = ['tenchi'] as const;

export {
  ACHIEVES,
  ACHIEVE_DEFS,
  applyMissionEvent,
  applyMissionEvent as applyJuiceToMissions,
  claim,
  defById,
  DAILY_DEFS,
  DAILY_POOL,
  DAILY_POOL as MISSIONS,
  ensureDaily,
  initAchieveProgress,
  kstDateKey,
} from './missions';
export type {
  DailyState,
  MissionDef,
  MissionEvent,
  MissionKind,
  MissionProgress,
} from './missions';
export type MissionId = string;
