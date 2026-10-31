// 조작 키 배치 — 순수 계산(DOM 없음). 좌표는 전부 논리 무대(360×780) 기준, 키의 왼쪽 위 모서리.
// 저장은 「오른손 기준」: 왼손잡이면 그릴 때만 좌우를 뒤집는다(style.css #touch-layer.mirror 와 같은 식: x' = 360 − x − 너비).
// 기본 자리는 style.css #btn-* 와 같아야 한다(tests/layout.test.ts 가 CSS 에서 읽어 맞춰 본다).

import { VIEW } from '../config';
import type { TouchAction } from './touch';

export interface Pos { x: number; y: number }
export type ButtonLayout = Partial<Record<TouchAction, Pos>>;
export type FullLayout = Record<TouchAction, Pos>;

export const KEY_ACTIONS: readonly TouchAction[] = ['jump', 'guard', 'attack', 'special'];

/** 조작 구역 = 필드 아래 */
export const ZONE = { x: 0, y: VIEW.FIELD_H, w: VIEW.W, h: VIEW.H - VIEW.FIELD_H } as const;

export const KEY_SIZE: Record<TouchAction, { w: number; h: number }> = {
  jump: { w: 84, h: 124 },
  guard: { w: 104, h: 64 },
  attack: { w: 120, h: 120 },
  special: { w: 88, h: 88 },
};

/** 눌림 판정이 키 밖으로 번지는 폭(style.css .tbtn::before) — 겹침은 이 판정 영역끼리 본다 */
export const HIT_MARGIN: Record<TouchAction, number> = { jump: 8, guard: 3, attack: 3, special: 3 };

/** 처음 배치(오른손 기준) */
export const DEFAULT_LAYOUT: FullLayout = {
  jump: { x: 12, y: ZONE.y + 38 },
  attack: { x: 228, y: ZONE.y + 34 },
  guard: { x: 110, y: ZONE.y + 100 },
  special: { x: 118, y: ZONE.y },
};

/** 키 전체가 조작 구역 안에 들도록 가둔다. 정수로 맞춘다 */
export function clampPos(action: TouchAction, p: Pos): Pos {
  const { w, h } = KEY_SIZE[action];
  const x = Number.isFinite(p.x) ? p.x : 0;
  const y = Number.isFinite(p.y) ? p.y : 0;
  return {
    x: Math.round(Math.min(Math.max(x, ZONE.x), ZONE.x + ZONE.w - w)),
    y: Math.round(Math.min(Math.max(y, ZONE.y), ZONE.y + ZONE.h - h)),
  };
}

/** 두 키의 판정 영역이 겹치나(맞닿기만 하면 겹침 아님) */
export function keysOverlap(a: TouchAction, pa: Pos, b: TouchAction, pb: Pos): boolean {
  const ma = HIT_MARGIN[a];
  const mb = HIT_MARGIN[b];
  const A = KEY_SIZE[a];
  const B = KEY_SIZE[b];
  return pa.x - ma < pb.x + B.w + mb && pb.x - mb < pa.x + A.w + ma
    && pa.y - ma < pb.y + B.h + mb && pb.y - mb < pa.y + A.h + ma;
}

/** action 을 p 에 놓으면 겹치는 다른 키. 없으면 null */
export function findOverlap(action: TouchAction, p: Pos, all: Readonly<Record<TouchAction, Pos>>): TouchAction | null {
  for (const other of KEY_ACTIONS) {
    if (other !== action && keysOverlap(action, p, other, all[other])) return other;
  }
  return null;
}

export function mirrorX(action: TouchAction, x: number): number {
  return ZONE.w - x - KEY_SIZE[action].w;
}

/** 저장값(오른손 기준, 일부만 있어도 됨) → 지금 화면에 놓을 자리. 왼손잡이면 좌우를 뒤집는다 */
export function resolveLayout(stored: ButtonLayout | null | undefined, leftHanded: boolean): FullLayout {
  const out = {} as FullLayout;
  for (const a of KEY_ACTIONS) {
    const p = stored?.[a] ?? DEFAULT_LAYOUT[a];
    out[a] = { x: leftHanded ? mirrorX(a, p.x) : p.x, y: p.y };
  }
  return out;
}

/** 화면에 놓인 자리 → 저장값(오른손 기준). 전부 기본 자리면 null(= 저장하지 않음) */
export function toStored(display: Readonly<Record<TouchAction, Pos>>, leftHanded: boolean): ButtonLayout | null {
  const out: ButtonLayout = {};
  let moved = false;
  for (const a of KEY_ACTIONS) {
    const p = clampPos(a, { x: leftHanded ? mirrorX(a, display[a].x) : display[a].x, y: display[a].y });
    out[a] = p;
    if (p.x !== DEFAULT_LAYOUT[a].x || p.y !== DEFAULT_LAYOUT[a].y) moved = true;
  }
  return moved ? out : null;
}

/** 기본 자리 그대로인가(설정 줄의 배치 표시용) */
export function isDefaultLayout(layout: ButtonLayout | null | undefined): boolean {
  return KEY_ACTIONS.every((a) => {
    const p = layout?.[a] ?? DEFAULT_LAYOUT[a];
    return p.x === DEFAULT_LAYOUT[a].x && p.y === DEFAULT_LAYOUT[a].y;
  });
}

/**
 * 불러온 값 검증 — 옛 저장본(필드 없음)·깨진 값은 undefined(= 기본 배치).
 * 숫자가 아닌 키는 기본 자리로 대신하고, 구역 밖은 가두고, 합쳐서 겹치면 통째로 버린다.
 */
export function sanitizeLayout(raw: unknown): ButtonLayout | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const src = raw as Record<string, unknown>;
  const out: ButtonLayout = {};
  for (const a of KEY_ACTIONS) {
    const v = src[a];
    if (typeof v !== 'object' || v === null) continue;
    const { x, y } = v as Record<string, unknown>;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    out[a] = clampPos(a, { x, y });
  }
  const full = resolveLayout(out, false);
  for (const a of KEY_ACTIONS) if (findOverlap(a, full[a], full)) return undefined;
  return KEY_ACTIONS.some((a) => out[a]) ? out : undefined;
}
