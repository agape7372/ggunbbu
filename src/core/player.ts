// 플레이어 상태기계 — 이동/점프/가드/공격 진행. 스택·엔티티 상호작용은 sim이 담당.
// [정본 재현] "착지 직후 점프가드 불가": 공중 가드는 선딜 0, 지면 가드는 선딜 4f.
// GUARD_AIR 유지 중 착지 → GUARD_GROUND로 자동 전이(선딜 재적용).

import type { GameState, InputFrame, PlayerState } from './types';
import { GUARD_GAUGE, PLAYER } from '../config';

export function makePlayer(): PlayerState {
  return {
    lane: 1, y: 0, vy: 0,
    pose: 'idle', poseTick: 0,
    invulnTicks: 0,
    bufAttack: 0, bufJump: 0, bufGuard: 0,
    pinTick: 0,
    attackHit: false, attackFromAir: false,
  };
}

/** 현재 가드 판정 활성 여부 ('ground' = 선딜 경과한 지면 가드) */
export function guardActive(p: PlayerState): 'ground' | 'air' | null {
  if (p.pose === 'guardA') return 'air';
  if (p.pose === 'guardG' && p.poseTick >= PLAYER.GUARD_STARTUP_GROUND) return 'ground';
  return null;
}

/** 공격 활성 프레임인가 */
export function attackActive(p: PlayerState): boolean {
  return p.pose === 'attack'
    && p.poseTick >= PLAYER.ATTACK_PRE
    && p.poseTick < PLAYER.ATTACK_PRE + PLAYER.ATTACK_ACTIVE;
}

const ATTACK_TOTAL = PLAYER.ATTACK_PRE + PLAYER.ATTACK_ACTIVE + PLAYER.ATTACK_POST;
const SPECIAL_POSE_TICKS = 20;

/** 입력 버퍼 수집 — 히트스톱 중에도 호출된다(버퍼 침범 금지 규칙) */
export function collectBuffers(p: PlayerState, input: InputFrame): void {
  if (input.attack) p.bufAttack = PLAYER.INPUT_BUFFER;
  if (input.jump) p.bufJump = PLAYER.INPUT_BUFFER;
  if (input.guard) p.bufGuard = PLAYER.INPUT_BUFFER;
}

/**
 * 플레이어 1틱. pinned/dead는 sim이 별도 처리(여기선 무시).
 * 좌우 이동 이벤트는 s.events에 laneMove로 기록.
 */
export function stepPlayer(s: GameState, input: InputFrame, dt: number): void {
  const p = s.player;
  if (p.invulnTicks > 0) p.invulnTicks -= 1;
  if (p.bufAttack > 0) p.bufAttack -= 1;
  if (p.bufJump > 0) p.bufJump -= 1;
  if (p.bufGuard > 0) p.bufGuard -= 1;
  if (p.pose === 'pinned' || p.pose === 'dead') return;

  const airborne = p.y > 0;

  // ── 레인 이동 (attack/guardBreak 중 불가, 가드 중 가능 [정본]) ──
  if (p.pose !== 'attack' && p.pose !== 'guardBreak') {
    if (input.left && p.lane > 0) {
      p.lane = (p.lane - 1) as typeof p.lane;
      s.events.push({ kind: 'laneMove', lane: p.lane });
    }
    if (input.right && p.lane < 2) {
      p.lane = (p.lane + 1) as typeof p.lane;
      s.events.push({ kind: 'laneMove', lane: p.lane });
    }
  }

  // ── 상태별 진행 ──
  switch (p.pose) {
    case 'idle': {
      if (p.bufAttack > 0) { startAttack(p, false); break; }
      if (p.bufJump > 0 && p.y <= 0) {
        p.bufJump = 0;
        p.vy = PLAYER.JUMP_V0;
        p.y = 0.001;
        p.pose = 'jump';
        s.events.push({ kind: 'jump' });
        break;
      }
      if (input.guard) tryEnterGuard(s, false);
      break;
    }
    case 'jump': {
      if (p.bufAttack > 0) { startAttack(p, true); break; }
      if (input.guard) tryEnterGuard(s, true);
      break;
    }
    case 'guardG':
    case 'guardA': {
      p.poseTick += 1;
      // 게이지 지속 소모 [정본]
      s.guardGauge = Math.max(0, s.guardGauge - GUARD_GAUGE.HOLD_DRAIN_PER_S * dt);
      s.guardRegenCd = GUARD_GAUGE.REGEN_DELAY_TICKS;
      if (s.guardGauge <= 0) {
        p.pose = 'guardBreak';
        p.poseTick = 0;
        s.events.push({ kind: 'guardDenied' });
        break;
      }
      if (!input.guard) {
        p.pose = airborne ? 'jump' : 'idle';
        p.poseTick = 0;
      }
      break;
    }
    case 'guardBreak': {
      p.poseTick += 1;
      if (p.poseTick >= PLAYER.GUARD_BREAK_STUN) { p.pose = 'idle'; p.poseTick = 0; }
      break;
    }
    case 'attack': {
      p.poseTick += 1;
      if (p.poseTick >= ATTACK_TOTAL) {
        p.pose = p.y > 0 ? 'jump' : 'idle';
        p.poseTick = 0;
      }
      break;
    }
    case 'special': {
      p.poseTick += 1;
      if (p.poseTick >= SPECIAL_POSE_TICKS) {
        p.pose = p.y > 0 ? 'jump' : 'idle';
        p.poseTick = 0;
      }
      break;
    }
  }

  // ── 수직 물리 (전 상태 공통, 지상 고정 상태 제외) ──
  if (p.y > 0 || p.vy > 0) {
    p.vy -= PLAYER.GRAVITY * dt;
    p.y += p.vy * dt;
    if (p.y <= 0) {
      p.y = 0;
      p.vy = 0;
      s.events.push({ kind: 'land' });
      if (p.pose === 'jump') { p.pose = 'idle'; p.poseTick = 0; }
      // [정본 재현] 공중 가드 유지 중 착지 → 지면 가드로 전이, 선딜 4f 재적용
      else if (p.pose === 'guardA') { p.pose = 'guardG'; p.poseTick = 0; }
    }
  }
}

function startAttack(p: PlayerState, fromAir: boolean): void {
  p.bufAttack = 0;
  p.pose = 'attack';
  p.poseTick = 0;
  p.attackHit = false;
  p.attackFromAir = fromAir;
}

function tryEnterGuard(s: GameState, airborne: boolean): void {
  const p = s.player;
  if (s.guardGauge < GUARD_GAUGE.MIN_TO_GUARD) {
    // 최소 게이지 미달 — 경고 (엣지에서만 울리도록 buf 사용)
    if (p.bufGuard === PLAYER.INPUT_BUFFER - 1) s.events.push({ kind: 'guardDenied' });
    return;
  }
  p.pose = airborne ? 'guardA' : 'guardG';
  p.poseTick = 0;
}
