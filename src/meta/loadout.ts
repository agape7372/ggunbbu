// 필살·무기·코스메틱 로드아웃. 해금 집합은 호출측 owned가 정본.
// tenchi / sword / ink / wire / flyer / none(마스크 없음) 은 항상 소유.

import type { BladeId, BodyId, CosmeticSlot, GreatswordId, LettersId, Loadout, MaskId, WazaId, WeaponId } from './types';

export type { BladeId, BodyId, CosmeticSlot, LettersId, Loadout, MaskId, WazaId, WeaponId };
export type EquipSlot = 'waza' | 'weapon' | CosmeticSlot;

/** index.ts 호환 별칭 — 슬롯 id는 types.ts가 정본. */
export type BodySkinId = BodyId;
export type BladeSkinId = BladeId;
export type LetterSkinId = LettersId;
export type StickSkinId = BodyId;

export const WAZA_UNLOCK_DEFAULT: readonly WazaId[] = ['tenchi'];

export const WAZA_IDS: readonly WazaId[] = ['tenchi', 'ageba', 'tetsu'];
/** 대검 — 상점은 이 순서(값 오름차순)로 판다 */
export const GREATSWORD_IDS: readonly GreatswordId[] = ['iron', 'saw', 'hazard', 'beam', 'flame', 'frost', 'onyx', 'gold'];
export const WEAPON_IDS: readonly WeaponId[] = ['sword', 'hammer', 'crowbar', 'grinder', ...GREATSWORD_IDS];
export const BODY_IDS: readonly BodyId[] = ['ink', 'amber', 'slate', 'coverall', 'crown', 'ash', 'apron', 's_night', 's_powder', 's_high'];
export const BLADE_IDS: readonly BladeId[] = ['wire', 'rebar', 'crescent', 'arc', 'royal', 'ember', 'inju', 's_moon', 's_fuse', 's_steel'];
export const LETTERS_IDS: readonly LettersId[] = ['flyer', 'stamp', 'orbit', 'rivet', 'gilt', 'sprout'];
/** 상점에서 안 파는 꾸미기 — 꾸러미 · 실적으로만 들어오고, 가진 뒤에만 상점 장착 칸에 보인다 */
export const LOOK_EARNED: Readonly<Record<string, { name: string; how: string }>> = {
  coverall: { name: '작업복', how: '신입 꾸러미' },
  crown: { name: '철거왕', how: '철거왕 세트' },
  ash: { name: '잿빛', how: '도감 25칸' },
  arc: { name: '용접불', how: '기사 세트' },
  royal: { name: '왕실', how: '철거왕 세트' },
  ember: { name: '불씨', how: '도감 20칸' },
  rivet: { name: '리벳', how: '기사 세트' },
  gilt: { name: '금박', how: '철거왕 세트' },
  sprout: { name: '새싹', how: '신입 졸업' },
  inju: { name: '인주', how: '첫 결제 선물' },
  apron: { name: '단골 앞치마', how: '단골 도장 10칸' },
  s_night: { name: '밤샘', how: '야간 철거 특근 15칸' },
  s_moon: { name: '달빛', how: '야간 철거 특근 30칸' },
  s_powder: { name: '화약', how: '폭파 해체 특근 15칸' },
  s_fuse: { name: '도화선', how: '폭파 해체 특근 30칸' },
  s_high: { name: '안전띠', how: '고공 철거 특근 15칸' },
  s_steel: { name: '강철', how: '고공 철거 특근 30칸' },
};
export const MASK_IDS: readonly MaskId[] = ['none', 'mask'];

const WAZA_SET: ReadonlySet<string> = new Set(WAZA_IDS);
const WEAPON_SET: ReadonlySet<string> = new Set(WEAPON_IDS);
const BODY_SET: ReadonlySet<string> = new Set(BODY_IDS);
const BLADE_SET: ReadonlySet<string> = new Set(BLADE_IDS);
const LETTERS_SET: ReadonlySet<string> = new Set(LETTERS_IDS);
const MASK_SET: ReadonlySet<string> = new Set(MASK_IDS);

export const DEFAULT_OWNED_IDS: readonly string[] = ['tenchi', 'sword', 'ink', 'wire', 'flyer', 'none'];
const DEFAULT_OWNED: ReadonlySet<string> = new Set(DEFAULT_OWNED_IDS);

export const DEFAULT_LOADOUT: Loadout = {
  waza: 'tenchi',
  weapon: 'sword',
  body: 'ink',
  blade: 'wire',
  letters: 'flyer',
  mask: 'none',
};

export const WAZA_CATALOG: Record<WazaId, { name: string; blurb: string; unlockedByDefault: boolean }> = {
  tenchi: {
    name: '천지개벽',
    blurb: '떨어지는 건물을 통째로 부순다.',
    unlockedByDefault: true,
  },
  ageba: {
    name: '올려베기',
    blurb: '발밑에서 위로만 벤다.',
    unlockedByDefault: false,
  },
  tetsu: {
    name: '철벽',
    blurb: '부수지 않는다. 튕기고 버틴다.',
    unlockedByDefault: false,
  },
};

/** 기본 소유 복사본. 호출측이 mutate해도 모듈 상수는 안 변한다. */
export function ownedDefaults(): Set<string> {
  return new Set(DEFAULT_OWNED_IDS);
}

export function slotOf(id: string): EquipSlot | undefined {
  if (WAZA_SET.has(id)) return 'waza';
  if (WEAPON_SET.has(id)) return 'weapon';
  if (BODY_SET.has(id)) return 'body';
  if (BLADE_SET.has(id)) return 'blade';
  if (LETTERS_SET.has(id)) return 'letters';
  if (MASK_SET.has(id)) return 'mask';
  return undefined;
}

function belongs(slot: string, id: string): boolean {
  switch (slot) {
    case 'waza': return WAZA_SET.has(id);
    case 'weapon': return WEAPON_SET.has(id);
    case 'body': return BODY_SET.has(id);
    case 'blade': return BLADE_SET.has(id);
    case 'letters': return LETTERS_SET.has(id);
    case 'mask': return MASK_SET.has(id);
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
 * slot = waza | weapon | body | blade | letters | mask.
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
    case 'weapon':
      if (loadout.weapon === id) return loadout;
      return { ...loadout, weapon: id as WeaponId };
    case 'body':
      if (loadout.body === id) return loadout;
      return { ...loadout, body: id as BodyId };
    case 'blade':
      if (loadout.blade === id) return loadout;
      return { ...loadout, blade: id as BladeId };
    case 'letters':
      if (loadout.letters === id) return loadout;
      return { ...loadout, letters: id as LettersId };
    case 'mask':
      if (loadout.mask === id) return loadout;
      return { ...loadout, mask: id as MaskId };
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
    weapon: pickId(rec.weapon, WEAPON_IDS, DEFAULT_LOADOUT.weapon), // 무기 칸 없던 옛 저장 = 철거칼
    body: pickId(rec.body, BODY_IDS, DEFAULT_LOADOUT.body),
    blade: pickId(rec.blade, BLADE_IDS, DEFAULT_LOADOUT.blade),
    letters: pickId(rec.letters, LETTERS_IDS, DEFAULT_LOADOUT.letters),
    mask: pickId(rec.mask, MASK_IDS, DEFAULT_LOADOUT.mask), // 마스크 칸 없던 옛 저장 = 없음
  };
}

function pickId<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

// ★마스크도 넣는다 — 빠지면 산 'mask'가 다음 불러오기에서 지워지고 먼지 3000이 증발한다
const CATALOG_IDS: ReadonlySet<string> = new Set([
  ...WAZA_IDS, ...WEAPON_IDS, ...BODY_IDS, ...BLADE_IDS, ...LETTERS_IDS, ...MASK_IDS,
]);

/** 저장 owned를 카탈로그 교집합으로 거른다(중복 제거). 모르는 id·문자열 아닌 값은 버린다. */
export function sanitizeOwned(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_OWNED_IDS];
  return [...new Set(raw.filter((x): x is string => typeof x === 'string' && CATALOG_IDS.has(x)))];
}

/** 소유하지 않은 칸은 기본값으로 되돌린다. 기본 소유는 isOwned가 늘 통과시킨다. */
export function enforceOwnedLoadout(loadout: Loadout, owned: readonly string[]): Loadout {
  const set = new Set(owned);
  const out = { ...loadout };
  for (const slot of ['waza', 'weapon', 'body', 'blade', 'letters', 'mask'] as const) {
    if (!isOwned(set, slot, out[slot])) (out as Record<string, string>)[slot] = DEFAULT_LOADOUT[slot];
  }
  return out;
}
