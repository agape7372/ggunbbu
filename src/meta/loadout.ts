// 필살·코스메틱 로드아웃. 해금 집합은 호출측 owned가 정본.
// tenchi / ink / wire / flyer 는 항상 소유.

import type { BladeId, BodyId, CosmeticSlot, LettersId, Loadout, WazaId } from './types';

export type { BladeId, BodyId, CosmeticSlot, LettersId, Loadout, WazaId };
export type EquipSlot = 'waza' | CosmeticSlot;

/** index.ts 호환 별칭 — 슬롯 id는 types.ts가 정본. */
export type BodySkinId = BodyId;
export type BladeSkinId = BladeId;
export type LetterSkinId = LettersId;
export type StickSkinId = BodyId;

export const WAZA_UNLOCK_DEFAULT: readonly WazaId[] = ['tenchi'];

export const WAZA_IDS: readonly WazaId[] = ['tenchi', 'ageba', 'tetsu'];
export const BODY_IDS: readonly BodyId[] = ['ink', 'amber', 'slate'];
export const BLADE_IDS: readonly BladeId[] = ['wire', 'rebar', 'crescent'];
export const LETTERS_IDS: readonly LettersId[] = ['flyer', 'stamp', 'orbit'];

const WAZA_SET: ReadonlySet<string> = new Set(WAZA_IDS);
const BODY_SET: ReadonlySet<string> = new Set(BODY_IDS);
const BLADE_SET: ReadonlySet<string> = new Set(BLADE_IDS);
const LETTERS_SET: ReadonlySet<string> = new Set(LETTERS_IDS);

export const DEFAULT_OWNED_IDS: readonly string[] = ['tenchi', 'ink', 'wire', 'flyer'];
const DEFAULT_OWNED: ReadonlySet<string> = new Set(DEFAULT_OWNED_IDS);

export const DEFAULT_LOADOUT: Loadout = {
  waza: 'tenchi',
  body: 'ink',
  blade: 'wire',
  letters: 'flyer',
};

export const WAZA_CATALOG: Record<WazaId, { name: string; blurb: string; unlockedByDefault: boolean }> = {
  tenchi: {
    name: '천지개벽',
    blurb: '현재 구조물을 통째로 접는다. 기본 필살.',
    unlockedByDefault: true,
  },
  ageba: {
    name: '올려베기',
    blurb: '위를 한 칼에 열어 착지 공간을 만든다.',
    unlockedByDefault: false,
  },
  tetsu: {
    name: '철벽',
    blurb: '잠깐 버틴다. 깔림보다 먼저 쓰는 방패.',
    unlockedByDefault: false,
  },
};

/** 기본 소유 복사본. 호출측이 mutate해도 모듈 상수는 안 변한다. */
export function ownedDefaults(): Set<string> {
  return new Set(DEFAULT_OWNED_IDS);
}

export function slotOf(id: string): EquipSlot | undefined {
  if (WAZA_SET.has(id)) return 'waza';
  if (BODY_SET.has(id)) return 'body';
  if (BLADE_SET.has(id)) return 'blade';
  if (LETTERS_SET.has(id)) return 'letters';
  return undefined;
}

function belongs(slot: string, id: string): boolean {
  switch (slot) {
    case 'waza': return WAZA_SET.has(id);
    case 'body': return BODY_SET.has(id);
    case 'blade': return BLADE_SET.has(id);
    case 'letters': return LETTERS_SET.has(id);
    default: return false;
  }
}

/** 기본 소유이거나 owned에 id / `slot:id` 가 있으면 true. 슬롯 불일치는 false. */
export function isOwned(owned: ReadonlySet<string>, slot: string, id: string): boolean {
  if (!belongs(slot, id)) return false;
  if (DEFAULT_OWNED.has(id)) return true;
  return owned.has(id) || owned.has(`${slot}:${id}`);
}

/**
 * 소유한 아이템만 장착. 아니면 동일 참조를 돌려준다.
 * slot = waza | body | blade | letters.
 */
export function equip(
  loadout: Loadout,
  slot: string,
  id: string,
  owned: ReadonlySet<string>,
): Loadout {
  if (!isOwned(owned, slot, id)) return loadout;
  switch (slot) {
    case 'waza':
      if (loadout.waza === id) return loadout;
      return { ...loadout, waza: id as WazaId };
    case 'body':
      if (loadout.body === id) return loadout;
      return { ...loadout, body: id as BodyId };
    case 'blade':
      if (loadout.blade === id) return loadout;
      return { ...loadout, blade: id as BladeId };
    case 'letters':
      if (loadout.letters === id) return loadout;
      return { ...loadout, letters: id as LettersId };
    default:
      return loadout;
  }
}

export function isWazaUnlocked(id: WazaId, unlocked: readonly WazaId[]): boolean {
  return WAZA_CATALOG[id].unlockedByDefault || unlocked.includes(id);
}

/** 저장 파싱. 모르는 값은 DEFAULT_LOADOUT 필드로. */
export const parseLoadout = validateLoadout;

/** 저장 파싱. 모르는 값은 DEFAULT_LOADOUT 필드로. */
export function validateLoadout(raw: unknown): Loadout {
  if (typeof raw !== 'object' || raw === null) {
    return { ...DEFAULT_LOADOUT };
  }
  const rec = raw as Record<string, unknown>;
  return {
    waza: pickId(rec.waza, WAZA_IDS, DEFAULT_LOADOUT.waza),
    body: pickId(rec.body, BODY_IDS, DEFAULT_LOADOUT.body),
    blade: pickId(rec.blade, BLADE_IDS, DEFAULT_LOADOUT.blade),
    letters: pickId(rec.letters, LETTERS_IDS, DEFAULT_LOADOUT.letters),
  };
}

function pickId<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}
