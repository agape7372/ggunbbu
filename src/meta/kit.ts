// 시작 장비 — 판 시작 전 시트에서 골라 들고 들어가는 소모품. DOM/core 없음.
// 시트는 기본 해제다(사전선택 금지). 궤도조각으로도 살 수 있어 무과금도 쓴다.

export type KitId = 'life' | 'waza' | 'dust2x';
export type Items = Record<KitId, number>;
/** 이번 판에 고른 수량. 안 고른 것은 빠진다 */
export type KitPick = Partial<Items>;

export interface KitDef {
  id: KitId;
  name: string;
  desc: string;
  /** 한 판에 들고 갈 수 있는 수 */
  max: number;
  /** 궤도조각 값 */
  orbit: number;
}

export const KITS: readonly KitDef[] = [
  { id: 'life', name: '예비 목숨', desc: '목숨 한 칸 더', max: 2, orbit: 30 },
  { id: 'waza', name: '필살 충전', desc: '게이지를 채워 시작 · 쓰면 다시 찬다', max: 3, orbit: 25 },
  { id: 'dust2x', name: '먼지 자루', desc: '이번 판 먼지 두 배', max: 1, orbit: 20 },
];

export const KIT_IDS: readonly KitId[] = KITS.map((k) => k.id);

/** 저장에 쌓아 둘 수 있는 상한 — 깨진 저장이 큰 수를 끌고 오지 않게 */
export const ITEM_MAX = 999;

export function emptyItems(): Items {
  return { life: 0, waza: 0, dust2x: 0 };
}

export function kitDef(id: string): KitDef | undefined {
  return KITS.find((k) => k.id === id);
}

/** 보유와 한 판 상한 안으로 자른다. 0은 뺀다 */
export function clampPick(pick: KitPick, items: Items): KitPick {
  const out: KitPick = {};
  for (const k of KITS) {
    const n = Math.min(Math.max(0, Math.trunc(pick[k.id] ?? 0)), k.max, items[k.id]);
    if (n > 0) out[k.id] = n;
  }
  return out;
}

export function pickCount(pick: KitPick): number {
  return KIT_IDS.reduce((n, id) => n + (pick[id] ?? 0), 0);
}

/** 고른 만큼 보유에서 뺀다(제자리). clampPick을 거친 값을 넣는다 */
export function spendKit(items: Items, pick: KitPick): void {
  for (const id of KIT_IDS) items[id] = Math.max(0, items[id] - (pick[id] ?? 0));
}

export function addItems(items: Items, add: KitPick): void {
  for (const id of KIT_IDS) items[id] = Math.min(ITEM_MAX, items[id] + (add[id] ?? 0));
}

/** 궤도조각으로 하나 산다. 모자라면 false, 지갑 불변 */
export function buyKit(inv: { orbit: number; items: Items }, id: KitId): boolean {
  const def = kitDef(id);
  if (!def || inv.orbit < def.orbit) return false;
  inv.orbit -= def.orbit;
  addItems(inv.items, { [id]: 1 });
  return true;
}

/** 시트를 띄울 만한가 — 들고 있는 게 있거나 궤도조각으로 살 수 있을 때만. 고를 게 없는 사람을 멈춰 세우지 않는다 */
export function kitSheetUseful(items: Items, orbit: number): boolean {
  return KITS.some((k) => items[k.id] > 0 || orbit >= k.orbit);
}

/** 맨손 판인가 — 먼지 자루는 판 내용을 안 바꾸니 장비로 치지 않는다 */
export function isBare(pick: KitPick): boolean {
  return !pick.life && !pick.waza;
}

/** 저장 원문 검증 */
export function validateItems(v: unknown): Items {
  const o = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  const n = (x: unknown): number =>
    typeof x === 'number' && Number.isFinite(x) ? Math.min(Math.max(0, Math.floor(x)), ITEM_MAX) : 0;
  return { life: n(o.life), waza: n(o.waza), dust2x: n(o.dust2x) };
}
