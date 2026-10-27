// 특별작전 등급 — 순수 산술. 수치는 config OPERATION 한 곳.
// 건물 작전은 한도 안에 부순 채 수, 버티기 작전은 버틴 초가 값이다. 값이 문턱을 넘으면 그 등급 도장.

import { OPERATION, TPS } from '../config';

export const OP_IDS = ['glass', 'ice', 'night', 'orbit'] as const;
export type OpId = (typeof OP_IDS)[number];
export type OpGrade = 'B' | 'A' | 'S';

const RANK: Record<OpGrade, number> = { B: 1, A: 2, S: 3 };
const BY_RANK: readonly (OpGrade | undefined)[] = [undefined, 'B', 'A', 'S'];

export function isOpId(v: unknown): v is OpId {
  return typeof v === 'string' && (OP_IDS as readonly string[]).includes(v);
}

export function isOpGrade(v: unknown): v is OpGrade {
  return v === 'B' || v === 'A' || v === 'S';
}

export function opLimitTicks(id: OpId): number {
  return OPERATION[id].limitSec * TPS;
}

/** 이 등급 도장에 필요한 값 */
export function opNeed(id: OpId, grade: OpGrade): number {
  return OPERATION[id].grade[grade];
}

export function opValue(id: OpId, run: { buildings: number; ticks: number }): number {
  return OPERATION[id].metric === 'seconds' ? Math.floor(run.ticks / TPS) : run.buildings;
}

/** 값 → 도장. B 미만이면 null */
export function opGrade(id: OpId, value: number): OpGrade | null {
  const g = OPERATION[id].grade;
  if (value >= g.S) return 'S';
  if (value >= g.A) return 'A';
  if (value >= g.B) return 'B';
  return null;
}

/** 더 높은 도장 — 기록은 내려가지 않는다 */
export function betterGrade(a: OpGrade | undefined, b: OpGrade | undefined): OpGrade | undefined {
  return BY_RANK[Math.max(a ? RANK[a] : 0, b ? RANK[b] : 0)];
}

const NEXT_GRADE = { B: 'A', A: 'S' } as const;

/** 다음 도장까지 모자란 값. 도장이 없으면 B까지, S면 null */
export function opShort(id: OpId, value: number): { next: OpGrade; short: number } | null {
  const have = opGrade(id, value);
  if (have === 'S') return null;
  const next: OpGrade = have === null ? 'B' : NEXT_GRADE[have];
  return { next, short: Math.max(0, opNeed(id, next) - value) };
}
