import { SAVE_KEY } from './config';
import { sanitizeLayout, type ButtonLayout } from './input/layout';
import {
  DEFAULT_LOADOUT, DEFAULT_OWNED_IDS, enforceOwnedLoadout, sanitizeOwned, validateLoadout, type Loadout,
} from './meta/loadout';
import { initAchieveProgress, type DailyState, type MissionProgress } from './meta/missions';
import { LICENSE_EXAMS } from './meta/economy';
import { emptyMask, isMaskArt, loadMaskBook } from './meta/mask';
import type { MaskEntry } from './meta/types';
import { isOpGrade, isOpId, type OpGrade, type OpId } from './meta/ops';

export interface SaveSettings {
  sound: boolean;
  vibration: boolean;
  leftHanded: boolean;
  shakeLevel: 0 | 1 | 2; // 0=off 1=약 2=기본
  flashLevel: 0 | 1 | 2; // 화면 번쩍임 — 0=off 1=약 2=기본
  bgm: boolean; // 음악 (sound = 전체 음소거가 우선)
  sfx: boolean; // 효과음
  /** 조작 키 배치 — 오른손 기준 무대 좌표(input/layout.ts). 없으면 기본 배치(무버전 추가 키) */
  buttonLayout?: ButtonLayout;
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
  howtoSeen: boolean; // 첫 실행 조작 안내를 봤는지 (무버전 추가 키)
  guardTaught: boolean; // 평생 첫 목숨 손실 때 가드를 가르쳤는지 (무버전 추가 키)
  stats: { buildings: number; runs: number }; // 평생 누적 — 철거 자격 조건 · 첫 판 판별 (무버전 추가 키)
  license: number; // 철거 자격 등급 0(견습)~3(1급) (무버전 추가 키)
  opsGrade: Partial<Record<OpId, OpGrade>>; // 특별작전 최고 도장 (무버전 추가 키)
  maskArt: string; // 고른 가면의 그림(파생) — 형식은 meta/mask.ts 머리 주석 (무버전 추가 키)
  masks: MaskEntry[]; // 내 가면 목록(최대 8장). 옛 저장은 loadMaskBook이 maskArt에서 옮긴다 (무버전 추가 키)
  maskId: string; // 고른 가면 id — 쓰는지는 loadout.mask (무버전 추가 키)
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
    flashLevel: 2,
    bgm: true,
    sfx: true,
  },
  dust: 0,
  orbit: 0,
  owned: [...DEFAULT_OWNED_IDS],
  loadout: { ...DEFAULT_LOADOUT },
  daily: null,
  achieves: initAchieveProgress(),
  howtoSeen: false,
  guardTaught: false,
  stats: { buildings: 0, runs: 0 },
  license: 0,
  opsGrade: {},
  maskArt: emptyMask(),
  masks: [],
  maskId: '',
};

const BAK_KEY = `${SAVE_KEY}.bak`;
const BAD_KEY = `${SAVE_KEY}.bad`;

/**
 * localStorage에서 저장 데이터를 읽고 검증한다.
 * 사다리: 본 키 → .bak(저장 성공 때마다 갱신) → 기본값. 본 키 원문이 깨졌으면 .bad에 남긴다.
 */
export function loadSave(): SaveData {
  // SSR 또는 localStorage 부재 가드
  if (typeof localStorage === 'undefined') {
    return structuredClone(DEFAULT_SAVE);
  }
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const main = parseSlot(raw);
    if (main) return main;
    if (raw) {
      // 덮어쓰기 전에 깨진 원문 보존 — 덤이라, 용량이 모자라 던져도 .bak 복구는 이어간다
      try { localStorage.setItem(BAD_KEY, raw); } catch { /* .bad 생략 */ }
    }
    return parseSlot(localStorage.getItem(BAK_KEY)) ?? structuredClone(DEFAULT_SAVE);
  } catch {
    return structuredClone(DEFAULT_SAVE);
  }
}

/** 원문 하나를 파싱·검증한다. 비었거나 객체가 아니거나 깨졌으면 null. */
function parseSlot(raw: string | null): SaveData | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  return normalize(parsed as Record<string, unknown>);
}

function normalize(raw: Record<string, unknown>): SaveData {
  // ★08-30: 파싱 순서 = parse → migrate(raw) → validateAndClamp (levain persistence 문법).
  // 구 코드는 `v !== 1 → 전체 초기화`였다 — 스키마를 올리는 순간, 그리고 미래 버전에서
  // 롤백하는 순간 전 사용자 세이브가 전멸하는 지뢰. 이제 어떤 v라도 버리지 않고
  // 마이그레이션 후 필드 검증이 살릴 수 있는 만큼 살린다(clamp — 버리지 않는다).
  const data = migrate(raw);
  const owned = sanitizeOwned(data.owned); // BL-13: 카탈로그 교집합
  // 깨진 그림은 빈 판으로 — 장착·소유는 그대로
  const book = loadMaskBook(data.masks, data.maskId, isMaskArt(data.maskArt) ? data.maskArt : emptyMask(), owned.includes('mask'));
  let loadout = enforceOwnedLoadout(validateLoadout(data.loadout), owned);
  if (loadout.mask === 'mask' && !book.maskId) loadout = { ...loadout, mask: 'none' }; // 쓸 가면이 없다
  return {
    v: 1,
    bestArcade: num(data.bestArcade, DEFAULT_SAVE.bestArcade, 99_999_999),
    bestTokoton: num(data.bestTokoton, DEFAULT_SAVE.bestTokoton, 99_999_999),
    maxCombo: num(data.maxCombo, DEFAULT_SAVE.maxCombo, 999),
    act2Cleared: typeof data.act2Cleared === 'boolean' ? data.act2Cleared : DEFAULT_SAVE.act2Cleared,
    buddhaMode: typeof data.buddhaMode === 'boolean' ? data.buddhaMode : DEFAULT_SAVE.buddhaMode,
    unlockedChapters: num(data.unlockedChapters, DEFAULT_SAVE.unlockedChapters, 3),
    butterTierReached: num(data.butterTierReached, DEFAULT_SAVE.butterTierReached, 3),
    butterBest: clampButterBest(data.butterBest),
    settings: validateSettings(data.settings),
    dust: num(data.dust, 0),
    orbit: num(data.orbit, 0),
    owned,
    loadout,
    daily: isDailyState(data.daily) ? data.daily : null,
    achieves: Array.isArray(data.achieves) ? data.achieves.filter(isProgress) : initAchieveProgress(),
    howtoSeen: typeof data.howtoSeen === 'boolean' ? data.howtoSeen : DEFAULT_SAVE.howtoSeen,
    guardTaught: data.guardTaught === true,
    stats: validateStats(data.stats),
    license: num(data.license, 0, LICENSE_EXAMS.length),
    opsGrade: validateOpsGrade(data.opsGrade),
    ...book,
  };
}

function validateStats(v: unknown): SaveData['stats'] {
  const o = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  return { buildings: num(o.buildings, 0, 99_999_999), runs: num(o.runs, 0, 99_999_999) };
}

/** 알려진 작전 id × 알려진 도장만 살린다 — 나머지는 버린다 */
function validateOpsGrade(v: unknown): SaveData['opsGrade'] {
  const out: SaveData['opsGrade'] = {};
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return out;
  for (const [id, g] of Object.entries(v as Record<string, unknown>)) {
    if (isOpId(id) && isOpGrade(g)) out[id] = g;
  }
  return out;
}

/**
 * 버전 마이그레이션 사다리 — v1이 현행. 미래에 v2를 만들면 여기서 v1→v2 변환을 단계로 쌓는다.
 * ★규칙(levain ARCHITECTURE §3 이식): 새 누적값·카운터는 버전을 올리지 말고 "무버전 추가 키"로
 * 얹는다(필드 가드가 기본값으로 채움). 버전 상향은 "기존 필드의 의미·구조가 바뀌어 구버전이
 * 오독하는 경우"로 한정 — 올리는 순간 그 버전을 모르는 과거 번들로의 OTA 롤백이 영구 금지된다.
 * 알 수 없는 v(부재·미래)는 절대 초기화하지 않는다 — 그대로 통과시켜 필드 검증에 맡긴다.
 */
function migrate(data: Record<string, unknown>): Record<string, unknown> {
  // 무버전 추가 키(guardTaught·stats)가 없는 옛 저장에 플레이 흔적이 있으면 이미 해 본 사람이다 —
  // 신입용 가드 가르치기·평생 첫 판 줄을 다시 띄우지 않는다(누적 건물 수는 되살릴 길이 없어 0부터).
  // howtoSeen 은 흔적이 아니다 — 안내만 닫고 한 판도 안 한 사람도 true 다
  const veteran = num(data.bestArcade, 0) > 0 || num(data.dust, 0) > 0 || data.act2Cleared === true;
  if (veteran && data.guardTaught === undefined) data.guardTaught = true;
  if (veteran && data.stats === undefined) data.stats = { buildings: 0, runs: 1 };
  return data;
}

/** 유한 숫자면 [0, max]로 clamp, 아니면 기본값 — NaN·음수·문자열 오염에도 기록을 버리지 않는다 */
function num(v: unknown, def: number, max = Number.MAX_SAFE_INTEGER): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.min(Math.max(0, Math.floor(v)), max)
    : def;
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
  const buttonLayout = sanitizeLayout(s.buttonLayout);

  return {
    ...(buttonLayout ? { buttonLayout } : {}),
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
    flashLevel: isValidShakeLevel(s.flashLevel)
      ? s.flashLevel
      : DEFAULT_SAVE.settings.flashLevel,
    bgm: typeof s.bgm === 'boolean' ? s.bgm : DEFAULT_SAVE.settings.bgm,
    sfx: typeof s.sfx === 'boolean' ? s.sfx : DEFAULT_SAVE.settings.sfx,
  };
}

/**
 * shakeLevel·flashLevel이 0 | 1 | 2 중 하나인지 검증한다.
 */
function isValidShakeLevel(value: unknown): value is 0 | 1 | 2 {
  return typeof value === 'number' && (value === 0 || value === 1 || value === 2);
}

/**
 * butterBest 항목별 구제 (08-30 검증: all-or-nothing 검증은 항목 하나 손상에 회차 전체
 * 기록을 날렸고, 값 clamp도 없어 1e300·음수가 영구 보존됐다). 키는 회차 1~3만.
 */
function clampButterBest(v: unknown): Record<number, number> {
  if (typeof v !== 'object' || v === null) return {};
  const out: Record<number, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const round = Number(k);
    if (!Number.isInteger(round) || round < 1 || round > 3) continue;
    if (typeof val !== 'number' || !Number.isFinite(val)) continue;
    out[round] = Math.min(Math.max(0, Math.floor(val)), 99_999_999);
  }
  return out;
}


let frozen = false;

/** 이 페이지에선 더 저장하지 않는다 — 새로고침 직전(디버그 전해금)에 부른다. 숨김 저장(onLifecycle)이 앱이 든 옛 저장으로 덮지 않게 */
export function freezeSaves(): void {
  frozen = true;
}

/**
 * 저장 데이터를 localStorage에 저장한다. 본 키가 써진 뒤에만 .bak을 같은 내용으로 갱신한다.
 * 실패 시(QuotaExceededError 포함) 조용히 무시한다. freezeSaves() 뒤엔 아무것도 쓰지 않는다.
 */
export function saveSave(d: SaveData): void {
  if (frozen || typeof localStorage === 'undefined') {
    return;
  }

  try {
    const json = JSON.stringify(d);
    localStorage.setItem(SAVE_KEY, json);
    localStorage.setItem(BAK_KEY, json);
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
    // 백업까지 지운다 — 남기면 다음 로드가 지운 기록을 되살린다
    for (const k of [SAVE_KEY, BAK_KEY, BAD_KEY]) localStorage.removeItem(k);
  } catch {
    // 삭제 실패도 무시한다.
  }
}
