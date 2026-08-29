import { SAVE_KEY } from './config';
import { DEFAULT_LOADOUT, validateLoadout, type Loadout } from './meta/loadout';
import { initAchieveProgress, type DailyState, type MissionProgress } from './meta/missions';

export interface SaveSettings {
  sound: boolean;
  vibration: boolean;
  leftHanded: boolean;
  shakeLevel: 0 | 1 | 2; // 0=off 1=약 2=기본
}

export interface SaveData {
  v: 1;
  bestArcade: number;
  bestTokoton: number;
  maxCombo: number;
  act2Cleared: boolean;
  buddhaMode: boolean; // 부처버전(2막 즉시 해금) 토글
  unlockedChapters: number; // 0~3
  butterTierReached: number; // 0~3 (경험한 버터바 회차)
  butterBest: Record<number, number>; // 회차별 최고점
  settings: SaveSettings;
  dust: number;
  orbit: number;
  owned: string[];
  loadout: Loadout;
  daily: DailyState | null;
  achieves: MissionProgress[];
}

export const DEFAULT_SAVE: SaveData = {
  v: 1,
  bestArcade: 0,
  bestTokoton: 0,
  maxCombo: 0,
  act2Cleared: false,
  buddhaMode: false,
  unlockedChapters: 0,
  butterTierReached: 0,
  butterBest: {},
  settings: {
    sound: true,
    vibration: true,
    leftHanded: false,
    shakeLevel: 2,
  },
  dust: 0,
  orbit: 0,
  owned: ['tenchi', 'ink', 'wire', 'flyer'],
  loadout: { ...DEFAULT_LOADOUT },
  daily: null,
  achieves: initAchieveProgress(),
};

/**
 * localStorage에서 저장 데이터를 읽고 검증한다.
 * 손상·부재·파싱 실패 시 기본값의 복사본을 반환한다.
 */
export function loadSave(): SaveData {
  // SSR 또는 localStorage 부재 가드
  if (typeof localStorage === 'undefined') {
    return structuredClone(DEFAULT_SAVE);
  }

  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      return structuredClone(DEFAULT_SAVE);
    }

    const parsed = JSON.parse(raw) as unknown;

    // 타입 검증 및 부분 손상 복구
    if (typeof parsed !== 'object' || parsed === null) {
      return structuredClone(DEFAULT_SAVE);
    }

    const data = parsed as Record<string, unknown>;

    // v 필드 불일치 시 기본값
    if (data.v !== 1) {
      return structuredClone(DEFAULT_SAVE);
    }

    // 필드별 타입가드 및 보정
    const result: SaveData = {
      v: 1,
      bestArcade:
        typeof data.bestArcade === 'number' ? data.bestArcade : DEFAULT_SAVE.bestArcade,
      bestTokoton:
        typeof data.bestTokoton === 'number' ? data.bestTokoton : DEFAULT_SAVE.bestTokoton,
      maxCombo:
        typeof data.maxCombo === 'number' ? data.maxCombo : DEFAULT_SAVE.maxCombo,
      act2Cleared:
        typeof data.act2Cleared === 'boolean'
          ? data.act2Cleared
          : DEFAULT_SAVE.act2Cleared,
      buddhaMode:
        typeof data.buddhaMode === 'boolean'
          ? data.buddhaMode
          : DEFAULT_SAVE.buddhaMode,
      unlockedChapters:
        typeof data.unlockedChapters === 'number'
          ? data.unlockedChapters
          : DEFAULT_SAVE.unlockedChapters,
      butterTierReached:
        typeof data.butterTierReached === 'number'
          ? data.butterTierReached
          : DEFAULT_SAVE.butterTierReached,
      butterBest: isRecordNumberNumber(data.butterBest)
        ? data.butterBest
        : DEFAULT_SAVE.butterBest,
      settings: validateSettings(data.settings),
      dust: typeof data.dust === 'number' ? data.dust : 0,
      orbit: typeof data.orbit === 'number' ? data.orbit : 0,
      owned: Array.isArray(data.owned)
        ? data.owned.filter((x): x is string => typeof x === 'string')
        : [...DEFAULT_SAVE.owned],
      loadout: validateLoadout(data.loadout),
      daily: isDailyState(data.daily) ? data.daily : null,
      achieves: Array.isArray(data.achieves) ? data.achieves.filter(isProgress) : initAchieveProgress(),
    };

    return result;
  } catch {
    // JSON 파싱 실패 또는 기타 예외
    return structuredClone(DEFAULT_SAVE);
  }
}

function isProgress(v: unknown): v is MissionProgress {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === 'string' && typeof o.count === 'number' && typeof o.claimed === 'boolean';
}

function isDailyState(v: unknown): v is DailyState {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.dateKey === 'string' && Array.isArray(o.items) && o.items.every(isProgress);
}

/**
 * SaveSettings을 검증하고 부분 손상을 복구한다.
 */
function validateSettings(settings: unknown): SaveSettings {
  if (typeof settings !== 'object' || settings === null) {
    return structuredClone(DEFAULT_SAVE.settings);
  }

  const s = settings as Record<string, unknown>;

  return {
    sound:
      typeof s.sound === 'boolean' ? s.sound : DEFAULT_SAVE.settings.sound,
    vibration:
      typeof s.vibration === 'boolean'
        ? s.vibration
        : DEFAULT_SAVE.settings.vibration,
    leftHanded:
      typeof s.leftHanded === 'boolean'
        ? s.leftHanded
        : DEFAULT_SAVE.settings.leftHanded,
    shakeLevel: isValidShakeLevel(s.shakeLevel)
      ? s.shakeLevel
      : DEFAULT_SAVE.settings.shakeLevel,
  };
}

/**
 * shakeLevel이 0 | 1 | 2 중 하나인지 검증한다.
 */
function isValidShakeLevel(value: unknown): value is 0 | 1 | 2 {
  return typeof value === 'number' && (value === 0 || value === 1 || value === 2);
}

/**
 * Record<number, number>인지 검증한다.
 */
function isRecordNumberNumber(
  value: unknown
): value is Record<number, number> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  return Object.entries(obj).every(
    ([k, v]) => !isNaN(Number(k)) && typeof v === 'number'
  );
}

/**
 * 저장 데이터를 localStorage에 저장한다.
 * 실패 시(QuotaExceededError 포함) 조용히 무시한다.
 */
export function saveSave(d: SaveData): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(d));
  } catch {
    // QuotaExceededError 포함 모든 예외를 무시한다.
    // 게임은 저장 실패에도 계속 동작한다.
  }
}

/**
 * 저장 데이터를 초기화한다 (localStorage에서 삭제).
 */
export function resetSave(): void {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 삭제 실패도 무시한다.
  }
}
