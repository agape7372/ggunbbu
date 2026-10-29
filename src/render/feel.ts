// 손맛 계산 — 이벤트 → 흔들림 px · 완파 규모 · 진동 패턴. 순수 함수만(DOM·상태 없음) — 테스트가 직접 부른다.
// 그리는 일은 renderer·effects·screenfx가, 쏘는 일은 platform/native가 한다.

import type { JuiceEvent } from '../core/types';
import { BOSS, HAPTIC, JUICE, JUICE_SYS, TPS } from '../config';

export type HapticPattern = number | readonly number[];

/** 번쩍 강도 설정(0 끔 · 1 약 · 2 기본) → 알파 배율. 범위 밖 값은 기본으로 본다. */
export function flashMul(level: number): number {
  return JUICE_SYS.FLASH_LEVEL_MUL[level as 0 | 1 | 2] ?? 1;
}

/** 완파 규모 k — 층수가 많을수록 크다. n이 없으면(층수 모름) 최소. */
export function stackScale(n?: number): number {
  const { STACK_K_BASE: lo, STACK_K_PER_FLOOR: per, STACK_K_MAX: hi } = JUICE_SYS;
  return Math.min(hi, Math.max(lo, lo + (n ?? 0) * per));
}

/**
 * 이벤트 하나가 주는 흔들림 진폭(px). 곡선은 선형 — 예전 제곱 곡선은 작은 값(타격 1)을 0.06px로 눌러 버렸다.
 * 무기 배율은 타격·층붕괴만 탄다. 포효(phaseClear n>=100)는 JUICE.bossRoar.
 */
export function shakePx(e: JuiceEvent, weaponShake = 1): number {
  let px: number;
  switch (e.kind) {
    case 'hit':
    case 'floorCollapse': px = JUICE[e.kind].shake * weaponShake; break;
    case 'stackDestroy': px = JUICE.stackDestroy.shake * stackScale(e.n); break;
    case 'phaseClear': px = (e.n ?? 0) >= 100 ? JUICE.bossRoar.shake : 0; break;
    default: px = JUICE[e.kind]?.shake ?? 0;
  }
  return Math.min(JUICE_SYS.SHAKE_MAX_AMP, px);
}

/**
 * 흔들림 누적 — 큰 쪽 + 작은 쪽의 SHAKE_STACK배. 예전엔 최댓값만 남겨 연타·연쇄가 쌓이지 않았다.
 * 같은 크기를 끝없이 더하면 연타 중 화면이 계속 요동치니 더하는 몫은 작은 쪽의 일부만.
 */
export function addTrauma(cur: number, px: number): number {
  if (px <= 0) return cur;
  const hi = Math.max(cur, px);
  const lo = Math.min(cur, px);
  return Math.min(JUICE_SYS.SHAKE_MAX_AMP, hi + JUICE_SYS.SHAKE_STACK * lo);
}

/** 방향 킥(px) — 타격·붕괴·완파만. 무기 배율은 타격·층붕괴만, 완파는 층수 규모를 살짝 탄다. */
export function kickPx(e: JuiceEvent, weaponShake = 1): number {
  const base = JUICE_SYS.KICK_PX[e.kind] ?? 0;
  if (e.kind === 'hit' || e.kind === 'floorCollapse') return base * weaponShake;
  if (e.kind === 'stackDestroy') return base * Math.min(1.4, stackScale(e.n));
  return base;
}

/**
 * 흔들림 한 장면 — [dx, dy, 회전(rad)]. t = 프레임 수. 사인 둘을 더한 부드러운 떨림이라
 * 프레임마다 방향이 튀는 지지직이 없다. 각속도는 프레임당 2.6 아래(60Hz에서 겹쳐 보이지 않는 대역).
 * |dx|·|dy| ≤ amp, 회전은 진폭 비율의 제곱이라 작은 흔들림엔 거의 없다.
 */
export function shakeSample(amp: number, t: number): [number, number, number] {
  if (amp <= 0) return [0, 0, 0];
  const nx = 0.6 * Math.sin(t * 1.3) + 0.4 * Math.sin(t * 2.1 + 1.7);
  const ny = 0.6 * Math.sin(t * 1.7 + 0.6) + 0.4 * Math.sin(t * 2.6 + 2.9);
  const nr = 0.6 * Math.sin(t * 0.9 + 0.4) + 0.4 * Math.sin(t * 1.6 + 1.1);
  const k = Math.min(1, amp / JUICE_SYS.SHAKE_MAX_AMP);
  return [amp * nx, amp * 0.8 * ny, JUICE_SYS.SHAKE_ROT_MAX * k * k * nr];
}

/**
 * 보스 격파 뒤 파티클·카메라 배속. 격파 틱(stTick 0, 히트스톱 동안도 0)에 BOSS.DEFEAT_SLOW로 시작해
 * BOSS.DEFEAT_SLOW_S초에 걸쳐 1배로 돌아온다. core 틱은 건드리지 않는다.
 */
export function defeatSlow(stTick: number): number {
  const u = Math.max(0, Math.min(1, stTick / (BOSS.DEFEAT_SLOW_S * TPS)));
  return BOSS.DEFEAT_SLOW + (1 - BOSS.DEFEAT_SLOW) * u;
}

/** 패턴 총 길이(ms, 휴지 포함). */
export function hapticLength(p: HapticPattern): number {
  return typeof p === 'number' ? p : p.reduce((a, b) => a + b, 0);
}

/** 연타 스로틀 카운터 — hit·bossHit가 따로 센다. */
export interface HapticCounters { hit: number; bossHit: number }

/**
 * 한 틱의 이벤트 묶음에서 쏠 진동 하나를 고른다. 겹치면 가장 긴 패턴 하나만.
 * hit·bossHit는 HIT_THROTTLE회당 1회(3타에 1번)만 후보가 된다 — 카운터는 호출마다 올라간다.
 */
export function pickHaptic(events: readonly JuiceEvent[], counters: HapticCounters): HapticPattern | null {
  let best: HapticPattern | null = null;
  let bestLen = 0;
  for (const e of events) {
    const pat = (HAPTIC as Record<string, HapticPattern | undefined>)[e.kind];
    if (pat === undefined) continue;
    if (e.kind === 'hit' || e.kind === 'bossHit') {
      counters[e.kind] += 1;
      if (counters[e.kind] % HAPTIC.HIT_THROTTLE !== 0) continue;
    }
    const len = hapticLength(pat);
    if (len > bestLen) { best = pat; bestLen = len; }
  }
  return best;
}
