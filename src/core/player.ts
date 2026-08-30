// 플레이어 상태기계 — 이동/점프/가드/공격 진행. 스택·엔티티 상호작용은 sim이 담당.
// [정본 재현] "착지 직후 점프가드 불가": 공중 가드는 선딜 0, 지면 가드는 선딜 4f.
// GUARD_AIR 유지 중 착지 → GUARD_GROUND로 자동 전이(선딜 재적용).

import type { GameState, InputFrame, PlayerState } from './types';
import { GUARD_GAUGE, PLAYER, SPECIAL } from '../config';

export function makePlayer(): PlayerState {
  return {
    lane: 0, y: 0, vy: 0,
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

/** 입력 버퍼 수집 — 히트스톱 중에도 호출된다(버퍼 침범 금지 규칙) */
export function collectBuffers(p: PlayerState, input: InputFrame): void {
  if (input.attack) p.bufAttack = PLAYER.INPUT_BUFFER;
  if (input.jump) p.bufJump = PLAYER.INPUT_BUFFER;
  if (input.guard) p.bufGuard = PLAYER.INPUT_BUFFER;
}

/** 플레이어 1틱. pinned/dead는 sim이 별도 처리(여기선 무시). */
export function stepPlayer(s: GameState, input: InputFrame, dt: number): void {
  const p = s.player;
  if (p.invulnTicks > 0) p.invulnTicks -= 1;
  if (p.bufAttack > 0) p.bufAttack -= 1;
  if (p.bufJump > 0) p.bufJump -= 1;
  if (p.bufGuard > 0) p.bufGuard -= 1;
  if (p.pose === 'pinned' || p.pose === 'dead') return;

  const airborne = p.y > 0;

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
      if (p.poseTick >= SPECIAL.POSE_TICKS) {
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
    blockUnderStack(s, p);
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

/**
 * ★08-30(사용자 지시 "통과 안 하고 막히는 거"): 낙하 건물 밑면은 **막힌다**.
 * 통과도 아니고 윗면 착지도 아니다 — 머리가 밑면에 닿으면 거기서 멈춘다.
 *
 * ★08-29 cling(접착)과 다른 점이 이 함수의 존재 이유다:
 *   ① **상승 중에만** 검사한다. 하강 중에도 막으면 스택이 플레이어를 밀어 내리는 옛 경로가
 *      되살아난다(끌려 내려가 깔림 직행 = 자살 버튼, ROADMAP Wave 0의 삭제 사유).
 *   ② 부딪히면 `vy = 0`으로 **멈출 뿐** 스택 속도(`stack.vy`)를 따라가지 않는다. 접착 없음.
 *   ③ 밑면 아래에 사람이 설 자리가 없으면(headroom ≤ 0) 검사하지 않는다 — 그건 깔림 판정
 *      영역이고 여기서 건드리면 y가 음수로 튄다.
 * 필살 중에는 막지 않는다(전파괴 연출이 벽에 걸리면 안 된다).
 */
function blockUnderStack(s: GameState, p: PlayerState): void {
  const st = s.stack;
  if (!st || s.mode === 'bonus') return;
  if (p.vy <= 0 || p.pose === 'special') return;
  const headroom = st.y - PLAYER.H;
  if (headroom <= 0) return;
  if (p.y + PLAYER.H <= st.y) return;
  p.y = headroom;
  p.vy = 0;
  s.events.push({ kind: 'headBonk' });
}

// ★08-30: clingToFloors(층 밑면 밀착, 08-29 도입)는 삭제됐다. 낙하 건물 아래서 점프하면
// 거의 항상 밑면에 접착돼 점프가 13px 홉으로 소멸하고(QA 실측), 같이 끌려 내려가 깔림에
// 직행하는 구조적 자살 버튼이었다. 점프 = 제자리 회피 + 공중 무적(시각 관통 허용)이라는
// 08-28 이전 검증 상태로 복원. 재도입하려면 docs/ROADMAP_2026-08-30.md Wave 0 근거를 먼저 뒤집을 것.

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
