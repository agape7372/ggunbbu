// 메타 진행(미션·재화·로드아웃) 단일 출구.

export {
  applyAdBoost,
  COSMETIC_ORBIT_COST,
  DUST_EXCHANGE,
  DUST_NAME,
  DUST_PER_BUILDING,
  DUST_PER_SPECIAL,
  DUST_PER_SUPPLY,
  dustCost,
  exchangeDust,
  grant,
  grantDust,
  grantOrbit,
  examStatus,
  LICENSE_EXAMS,
  LICENSE_TITLES,
  licenseTitle,
  LOOK_DUST_COST,
  MASK_DUST_COST,
  nextExam,
  takeExam,
  MAX_REVIVES_PER_RUN,
  MISSION_AD_MULT,
  ORBIT_COSTS,
  ORBIT_MISSION_BASE,
  ORBIT_NAME,
  ORBIT_PER_AD,
  nextDustGoal,
  orbitCost,
  REVIVE_MAX,
  spendDust,
  spendOrbit,
  WAZA_ORBIT_COST,
  WEAPON_DUST_COST,
} from './economy';
export type { ExamStatus, LicenseExam, Wallet } from './economy';
export {
  betterGrade,
  isOpGrade,
  isOpId,
  OP_IDS,
  opGrade,
  opLimitTicks,
  opNeed,
  opShort,
  opValue,
} from './ops';
export type { OpGrade, OpId } from './ops';

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
  GREATSWORD_IDS,
  WEAPON_IDS,
} from './loadout';
export type { BladeSkinId, BodySkinId, LetterSkinId, Loadout, MaskId, WazaId, WeaponId } from './loadout';
export type StickSkinId = import('./loadout').BodySkinId;
export const WAZA_UNLOCK_DEFAULT = ['tenchi'] as const;

export {
  ACHIEVES,
  ACHIEVE_DEFS,
  applyMissionEvent,
  applyMissionEvent as applyJuiceToMissions,
  claim,
  claimableCount,
  dailyDone,
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
