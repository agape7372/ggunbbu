// 타격 판정·콤보·점수·게이지 이벤트 처리.
//
// 콤보 전수 [정본] — 다른 경로 없음. cap 999.
//   +1: 건물 세그 타격 / 번개탄 파괴 / 화산탄 타격 / 토끼탄 상쇄 / 보스·드론·대포 타격.
//       (바닥 화산탄 파밍은 SCORE.GROUND_ROCK_COMBO, 기본 off)
//   →0: ① 지면 가드 바운스 ② 구조물 접지(깔림) ③ 플레이어 피격 전부
//       ④ 달 보스 개시 — 카운터만 0, fullCombo 유지, comboBreak 이벤트 없음
//       ⑤ 2막 이어하기 — 콤보를 체크포인트(40/148/168)로 재설정, fullCombo 소멸
//   유지: 헛스윙 / 점프 가드 / 점프 / 시간 경과 / 1막→2막 / 필살기 / 가드 브레이크.

import type { GameState, Lane } from './types';
import { damageStack } from './building';
import { GIMMICK, GUARD_GAUGE, WAZA_GAUGE, PLAYER, SCORE, STACK } from '../config';
import { VIEW } from '../config';
import { rand } from './rng';

export function addScore(s: GameState, n: number): void {
  s.score = Math.min(s.score + n, SCORE.CAP);
}

export function addCombo(s: GameState): void {
  if (s.combo < SCORE.COMBO_CAP) s.combo += 1;
  // 999 카운터스톱: 이벤트는 타격 지점이 발행한다 (여기서 중복 발행 금지)
}

export function breakCombo(s: GameState): void {
  if (s.combo > 0) s.events.push({ kind: 'comboBreak', combo: s.combo });
  s.combo = 0;
  if (s.mode === 'act2') s.fullCombo = false;
}

export function gaugePerHit(combo: number): number {
  return Math.min(WAZA_GAUGE.PER_HIT_MAX, WAZA_GAUGE.PER_HIT_BASE + Math.floor(combo / WAZA_GAUGE.PER_HIT_DIV));
}

export function addGauge(s: GameState, n: number): void {
  const before = s.wazaGauge;
  s.wazaGauge = Math.max(0, Math.min(WAZA_GAUGE.MAX, s.wazaGauge + n));
  if (before < WAZA_GAUGE.MAX && s.wazaGauge >= WAZA_GAUGE.MAX) s.events.push({ kind: 'gaugeFull' });
}

/** 유효 타격 공통 처리: 콤보 +1 → 점수 → 게이지 */
export function registerHit(s: GameState, opts?: { scoreBonus?: number; noGauge?: boolean }): void {
  addCombo(s);
  addScore(s, SCORE.BASE_HIT * Math.min(s.combo, SCORE.COMBO_CAP) + (opts?.scoreBonus ?? 0));
  if (!opts?.noGauge) addGauge(s, gaugePerHit(s.combo));
}

/** 공격 히트박스 수직 범위 (물리 좌표) */
export function attackRange(footY: number): [number, number] {
  return [footY - 8, footY + PLAYER.ATTACK_REACH];
}

/**
 * 공격 활성 프레임에 스택 타격 시도. 명중 시 이벤트/콤보/점수/게이지/밀어올림 처리.
 * 반환: 명중 여부.
 */
export function tryHitStack(s: GameState, lane: Lane, footY: number): boolean {
  const stack = s.stack;
  if (!stack) return false;
  const [lo, hi] = attackRange(footY);
  const mat = stack.floors.length > 0 ? stack.floors[0].mat : 'weak';
  const yHit = stack.y;
  const res = damageStack(stack, lane, lo, hi, 1);
  if (res === 'miss') return false;

  stack.vy = Math.max(stack.vy, STACK.HIT_LIFT_V);
  stack.resting = false;

  if (res === 'collapse') {
    const isButter = mat === 'butter';
    s.events.push({
      kind: isButter ? 'butterCollapse' : 'floorCollapse',
      lane, y: yHit, mat, combo: s.combo + 1,
    });
    registerHit(s, { scoreBonus: SCORE.FLOOR_BONUS });
    spawnFloorDebris(s, yHit);
    if (stack.floors.length === 0) {
      destroyStack(s);
    }
  } else {
    s.events.push({ kind: 'hit', lane, y: yHit, mat, combo: s.combo + 1 });
    registerHit(s);
  }
  return true;
}

/** 스택 완파 처리 (마지막 층 붕괴 or 필살기) */
function spawnFloorDebris(s: GameState, yHit: number): void {
  const cx = VIEW.LANE_X[0];
  const fw = VIEW.LANE_W;
  const fh = VIEW.FLOOR_H;
  for (let i = 0; i < 3; i++) {
    s.debris.push({
      x: cx - fw / 2 + fw * (0.2 + 0.3 * i) + (rand(s) - 0.5) * 16,
      y: yHit + fh * 0.4,
      vx: (i - 1) * 90 + (rand(s) - 0.5) * 40,
      vy: 80 + rand(s) * 60,
      w: 28 + rand(s) * 18,
      h: 22 + rand(s) * 14,
      life: 90,
    });
  }
}

export function destroyStack(s: GameState): void {
  const stack = s.stack;
  if (!stack) return;
  s.events.push({ kind: 'stackDestroy', n: stack.totalFloors });
  if (stack.variant === 'butterbar') {
    addScore(s, stack.totalFloors * SCORE.BUTTER_DESTROY_PER_LAYER);
    if (s.bonus) s.bonus.destroyed += 1;
  } else {
    addScore(s, SCORE.DESTROY_BONUS);
  }
  s.stack = null;
  s.stackSpawnCd = s.gimmick === 'night'
    ? Math.max(12, Math.floor(STACK.RESPAWN_TICKS * GIMMICK.NIGHT_RESPAWN_MUL))
    : STACK.RESPAWN_TICKS;
}

/**
 * 가드-스택 접촉 판정. guardActive: 'ground' | 'air' | null.
 * prevStackY: 이번 틱 물리 적분 전의 stack.y — 고속 낙하가 존을 틱 사이로
 * 건너뛰는 터널링을 막기 위해 스윕(구간 교차)으로 판정한다.
 * 바운스 발동 시 true.
 */
export function tryGuardBounce(
  s: GameState, guardActive: 'ground' | 'air' | null, footY: number, prevStackY?: number,
): boolean {
  const stack = s.stack;
  if (!stack || !guardActive || stack.vy >= 0) return false;
  const prev = prevStackY ?? stack.y;
  if (guardActive === 'ground') {
    if (stack.y <= STACK.GUARD_ZONE_GROUND) {
      stack.vy = STACK.GUARD_GROUND_V * (s.gimmick === 'ice' ? GIMMICK.ICE_BOUNCE_GROUND : 1);
      stack.resting = false;
      s.guardGauge = Math.max(0, s.guardGauge - GUARD_GAUGE.BOUNCE_COST_GROUND);
      s.guardRegenCd = GUARD_GAUGE.REGEN_DELAY_TICKS;
      breakCombo(s); // [정본] 지면 가드 = 콤보 단절
      s.events.push({ kind: 'guardBounce', y: stack.y });
      return true;
    }
  } else {
    const plane = footY + PLAYER.H;
    const crossed = prev >= plane - STACK.GUARD_ZONE_AIR && stack.y <= plane + STACK.GUARD_ZONE_AIR;
    if (crossed || Math.abs(stack.y - plane) <= STACK.GUARD_ZONE_AIR) {
      stack.vy = STACK.GUARD_AIR_V * (s.gimmick === 'ice' ? GIMMICK.ICE_BOUNCE_AIR : 1);
      stack.resting = false;
      s.guardGauge = Math.max(0, s.guardGauge - GUARD_GAUGE.BOUNCE_COST_AIR);
      s.guardRegenCd = GUARD_GAUGE.REGEN_DELAY_TICKS;
      // [정본] 점프 가드 = 콤보 유지
      s.events.push({ kind: 'guardAirBounce', y: stack.y });
      return true;
    }
  }
  return false;
}

/** 플레이어 피격 공통 처리 (무적 중이면 무시) */
export function hurtPlayer(s: GameState): boolean {
  const p = s.player;
  if (p.invulnTicks > 0 || p.pose === 'special') return false;
  s.lives -= 1;
  p.invulnTicks = PLAYER.HIT_IFRAMES;
  breakCombo(s);
  s.events.push({ kind: 'hurt' }, { kind: 'lifeLost', n: s.lives });
  if (s.lives <= 0) {
    p.pose = 'dead';
    s.over = 'gameover';
  }
  return true;
}
