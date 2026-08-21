// FallingStack 생성·물리·타격·붕괴 규칙.
// 핵심 [정본]: 플레이어 레인의 층 세그먼트 HP가 0이 되면 층 전체 붕괴(타 레인 부분 대미지 소멸).

import type { FallingStack, Floor, GameState, Lane, Material, Theme } from './types';
import { MAT_HP, STACK, VIEW } from '../config';

export function makeFloor(mat: Material, sharedHp = false): Floor {
  const hp = MAT_HP[mat];
  void sharedHp;
  return {
    segs: [
      { hp, maxHp: hp },
      { hp, maxHp: hp },
      { hp, maxHp: hp },
    ],
    mat,
    h: VIEW.FLOOR_H,
  };
}

export interface StackOpts {
  variant: FallingStack['variant'];
  theme: Theme;
  floors: Floor[];
  specialImmune?: boolean;
  sharedHp?: boolean;
  y?: number;
  vy?: number;
}

export function makeStack(o: StackOpts): FallingStack {
  return {
    kind: 'stack',
    variant: o.variant,
    theme: o.theme,
    floors: o.floors,
    y: o.y ?? STACK.SPAWN_Y,
    vy: o.vy ?? 0,
    specialImmune: o.specialImmune ?? false,
    sharedHp: o.sharedHp ?? false,
    resting: false,
    totalFloors: o.floors.length,
  };
}

/** 페이즈별 낙하 물리 파라미터 */
export function stackPhysics(s: GameState): { g: number; vterm: number } {
  if (s.mode === 'bonus') return { g: STACK.BUTTER_G, vterm: STACK.BUTTER_VTERM };
  if (s.mode === 'act2') {
    if (s.act2Phase === 'cathedral') return { g: STACK.CATHEDRAL_G, vterm: STACK.CATHEDRAL_VTERM };
    if (s.act2Phase === 'tower') return { g: STACK.TOWER_G, vterm: STACK.TOWER_VTERM };
  }
  // act1 / tokoton: p로 보간 (tokoton은 p∈[1,2] 구간 연장)
  const p = s.p;
  if (p <= 1) {
    const g = STACK.ACT1_G[0] + (STACK.ACT1_G[1] - STACK.ACT1_G[0]) * p;
    const vterm = STACK.ACT1_VTERM[0] + (STACK.ACT1_VTERM[1] - STACK.ACT1_VTERM[0]) * Math.pow(p, 0.7);
    return { g, vterm };
  }
  const q = Math.min(p - 1, 1);
  const g = STACK.ACT1_G[1] + (STACK.TOKOTON_G_MAX - STACK.ACT1_G[1]) * q;
  const vterm = STACK.ACT1_VTERM[1] + (STACK.TOKOTON_VTERM_MAX - STACK.ACT1_VTERM[1]) * q;
  return { g, vterm };
}

/** 스택 1틱 물리. 접지 여부 반환(이번 틱에 지면 도달) */
export function stepStack(stack: FallingStack, g: number, vterm: number, dt: number): boolean {
  if (stack.resting) return false;
  stack.vy -= g * dt;
  if (stack.vy < -vterm) stack.vy = -vterm;
  stack.y += stack.vy * dt;
  if (stack.y <= 0 && stack.vy < 0) {
    stack.y = 0;
    return true;
  }
  return false;
}

/** 층 i의 수직 범위 [bottom, top] (물리 좌표) */
export function floorSpan(stack: FallingStack, i: number): [number, number] {
  let bottom = stack.y;
  for (let k = 0; k < i; k++) bottom += stack.floors[k].h;
  return [bottom, bottom + stack.floors[i].h];
}

/** 스택 전체 높이 */
export function stackHeight(stack: FallingStack): number {
  return stack.floors.reduce((a, f) => a + f.h, 0);
}

/**
 * 히트박스 [lo, hi]와 겹치는 가장 낮은 층에 dmg. 층 붕괴 시 true 반환.
 * sharedHp면 레인 무관 층 공유 HP(segs 전체 동기 감소).
 * 반환: 'miss' | 'hit' | 'collapse'
 */
export function damageStack(
  stack: FallingStack, lane: Lane, lo: number, hi: number, dmg: number,
): 'miss' | 'hit' | 'collapse' {
  for (let i = 0; i < stack.floors.length; i++) {
    const [b, t] = floorSpan(stack, i);
    if (t < lo) continue;
    if (b > hi) return 'miss';
    const f = stack.floors[i];
    if (stack.sharedHp) {
      const hp = f.segs[0].hp - dmg;
      for (const seg of f.segs) seg.hp = hp;
    } else {
      f.segs[lane].hp -= dmg;
    }
    const remaining = stack.sharedHp ? f.segs[0].hp : f.segs[lane].hp;
    if (remaining <= 0) {
      stack.floors.splice(i, 1);
      return 'collapse';
    }
    return 'hit';
  }
  return 'miss';
}
