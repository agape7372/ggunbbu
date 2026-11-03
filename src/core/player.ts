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
  // ★10-28 검수: 지면 공격 중에 누른 점프는 그 공격이 끝날 때까지 남겨 둔다. 버퍼(실효 2틱)가
  // 공격 6틱 안에서 사라져 연타 중 점프가 0% 나갔다(10/s·8.6/s 전 틱 실측). 공중 공격은 그대로 감쇠.
  if (p.bufJump > 0 && !(p.pose === 'attack' && !p.attackFromAir)) p.bufJump -= 1;
  if (p.bufGuard > 0) p.bufGuard -= 1;
  if (p.pose === 'pinned' || p.pose === 'dead') return;

  const airborne = p.y > 0;

  // ── 상태별 진행 ──
  switch (p.pose) {
    case 'idle': {
      // 점프가 공격보다 먼저다 — 연타 중엔 공격 버퍼가 늘 차 있어 공격이 앞서면 점프가 끝내 안 나간다.
      // 같이 눌렸으면 뛰고, 남은 공격 버퍼가 다음 틱 공중 공격이 된다.
      if (p.bufJump > 0 && p.y <= 0) {
        p.bufJump = 0;
        p.vy = PLAYER.JUMP_V0;
        p.y = 0.001;
        p.pose = 'jump';
        s.events.push({ kind: 'jump' });
        break;
      }
      if (p.bufAttack > 0) { startAttack(p, false); break; }
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
      // ★09-05: 공중에서 게이지가 터졌으면 스턴이 끝나도 여전히 공중이다 — 'jump'로 복귀한다.
      // 'idle' 고정이면 ① 이어지는 공격이 startAttack(p,false)로 들어가 attackFromAir가 죽고
      // (밑면 관통이 무효화) ② 가드 입력이 공중인데도 지면가드(guardG)로 성립해
      // combat.tryGuardBounce의 'ground' 분기(콤보 단절·게이지 소모)가 허공에서 발동했다.
      // attack/special 종료 분기와 같은 규칙으로 통일한다.
      if (p.poseTick >= PLAYER.GUARD_BREAK_STUN) { p.pose = p.y > 0 ? 'jump' : 'idle'; p.poseTick = 0; }
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
    // ★08-30 5차: 상승·하강 같은 중력. 4차의 FALL_MUL(하강 가속)은 가변 점프와 한 세트였고
    // 둘 다 철거했다 — 체공이 1.60초면 하강을 따로 재촉할 이유가 없다.
    p.vy -= PLAYER.GRAVITY * dt;
    p.y += p.vy * dt;
    contactWithStack(s, p);
    if (p.y <= 0) land(s, p);
  }
}

function land(s: GameState, p: PlayerState): void {
  p.y = 0;
  p.vy = 0;
  s.events.push({ kind: 'land' });
  if (p.pose === 'jump') { p.pose = 'idle'; p.poseTick = 0; }
  // [정본 재현] 공중 가드 유지 중 착지 → 지면 가드로 전이, 선딜 4f 재적용
  else if (p.pose === 'guardA') { p.pose = 'guardG'; p.poseTick = 0; }
}

function startAttack(p: PlayerState, fromAir: boolean): void {
  p.bufAttack = 0;
  p.pose = 'attack';
  p.poseTick = 0;
  p.attackHit = false;
  p.attackFromAir = fromAir;
}

/**
 * 낙하 건물 밑면과의 접촉 — **막고, 누른다.**
 *
 * ★계획 정본(원작 대조)이 정한 루프가 이것이다:
 *   - "공격: 건물을 약간 위로 밀어냄" · "정석: 최하층 HP1 남기고 점프가드 → 공중에서 아래층 제거 → 반복"
 *   - "건물 완전 접지 = 라이프 1 손실 + 깔림"
 *   즉 **계속 부수며 건물을 띄워 버티는 게 공격이고, 못 부수면 눌려 내려가 죽는 게 리스크**다.
 *   관통은 그 리스크를 지워 게임을 무르게 만든다(08-30 사용자 지적).
 *
 * 두 방향 모두 접촉으로 처리한다:
 *   ① 상승 중 머리가 밑면에 닿으면 거기서 멈춘다(통과 금지).
 *   ② 밑면이 내려와 머리를 덮으면 **같이 눌려 내려간다**. 지면까지 눌리면 sim의 접지 검사가
 *      깔림([정본] 라이프 1 손실)으로 받는다.
 *
 * ★08-29 cling과 다른 점: cling은 **접촉하지 않았는데도** `p.vy <= stack.vy`만으로 밑면에 스냅해
 * 점프가 13px 홉으로 소멸했다. 여기서는 **실제로 겹칠 때만** 개입하고, 밑면 아래에 설 자리가
 * 없으면(headroom ≤ 0) 좌표를 건드리지 않는다(그 구간은 깔림 판정 영역이다).
 * 필살 중에는 무적·전파괴라 개입하지 않는다.
 *
 * ③ 붙어 내려가기는 건물이 움직인 뒤 carryUnderStack이 맡는다(10-28) — ②만으로는 5차 중력이 건물보다
 *   빨라 박고 7틱 만에 떨어져 나갔다.
 */
function contactWithStack(s: GameState, p: PlayerState): void {
  const st = s.stack;
  if (!st || s.mode === 'bonus') return;
  if (p.pose === 'special' || p.pose === 'pinned' || p.pose === 'dead') return;

  // ★10-28 원작 대조 검수 · 사용자 결정: **공중 공격도 밑면에서 멈춘다.** 08-30에 넣은 「공중 공격 중엔
  // 막히지 않는다(원작 포즈4 = 뚫으며 부순다)」를 거둔다. 원작은 닿은 층을 그 자리에서 부수지만,
  // 여기선 층이 HP로 버티고 무너져도 위층이 그 자리로 내려앉아 밑면이 안 올라간다 — 접촉을 무시하면
  // 몸이 건물 속 76px까지 들어갔다가 공격 끝 틱에 76px 아래로 순간이동했다(머리박음 동반).
  // 비대칭은 남는다: 그냥 뛰면 박기만 하고, 뛰면서 베면 박는 자리에서 밑층이 깎인다(무기 사거리 60~88 >
  // 머리 높이 PLAYER.H 55라 접촉 시 밑층이 창 안 — tests/weapons.test.ts가 지킨다).

  const headroom = st.y - PLAYER.H;
  if (p.y + PLAYER.H <= st.y) return; // 아직 안 닿았다

  // ① 올라가다 부딪힘 — 그 높이에서 멈춘다
  if (p.vy > 0 && headroom > 0) {
    p.y = headroom;
    p.vy = 0;
    s.events.push({ kind: 'headBonk' });
    return;
  }

  // ② 밑면이 내려와 덮음 — 같이 눌려 내려간다(스택보다 느리게 못 내려간다)
  if (st.vy < 0 || st.resting) {
    p.y = Math.max(0, headroom);
    if (st.vy < 0) p.vy = Math.min(p.vy, st.vy);
  }
}

/**
 * ③ 밑면에 붙어 같이 내려가기 — 건물이 이번 틱 움직인 **뒤에** sim이 부른다.
 *
 * ★10-28 원작 대조 검수 · 사용자 결정: 원작 `FUN_00405140` 포즈3은 닿아 있는 동안 매 프레임 플레이어를
 * 밑면에 다시 붙인다 — y가 물리가 아니라 건물 침하 속도를 따라간다(벤치마크 §5 세부 2). ②만으로는
 * 5차 중력(1735)이 건물보다 빨라 박고 7틱 만에 떨어져 나가 먼저 착지했다(4차 204에선 74px까지 붙어 내려왔다).
 * 그래서 닿아 있는 동안은 밑면에 맞추고 속도를 「건물 속도 + 한 틱 중력」으로 둔다 — 다음 틱 중력을
 * 먹어도 건물보다 빨리 떨어지지 않아 계속 붙는다.
 * - 실제로 닿아 있을 때만이다. 닿지도 않았는데 붙이던 cling(08-29, 아래)과 다르다.
 * - 밑면이 멈추거나(resting) 올라가면(vy >= 0) 안 붙는다 — 따라 올라가지 않는다(wave0 비접착 가드).
 * - 빠져나가는 길: 공중가드(건물 띄움 + 아래로 반동) · 공중 공격(밑층을 깎고 띄움) · 필살.
 * - 건물이 움직인 뒤에 맞추는 건 그림 때문이다 — 앞에서 맞추면 그 틱에 내려온 만큼(4~16px) 머리가
 *   밑면 위로 겹쳐 그려진다(플레이어를 건물보다 나중에 그린다).
 */
export function carryUnderStack(s: GameState, dt: number): void {
  const p = s.player;
  const st = s.stack;
  if (!st || st.resting || st.vy >= 0 || s.mode === 'bonus' || p.y <= 0) return;
  if (p.pose === 'special' || p.pose === 'pinned' || p.pose === 'dead') return;
  // 0.5px = 붙어 내려가던 틱의 부동소수 오차만 받는다(튜닝값 아님)
  if (p.y + PLAYER.H < st.y - 0.5) return;
  if (p.vy > 0) s.events.push({ kind: 'headBonk' }); // 올라가다 이번 틱에 처음 닿았다
  p.y = st.y - PLAYER.H;
  p.vy = st.vy + PLAYER.GRAVITY * dt;
  if (p.y <= 0) land(s, p);
}

// ★08-30: clingToFloors(층 밑면 밀착, 08-29 도입)는 삭제됐다. 낙하 건물 아래서 점프하면
// 거의 항상 밑면에 접착돼 점프가 13px 홉으로 소멸하고(QA 실측), 같이 끌려 내려가 깔림에
// 직행하는 구조적 자살 버튼이었다. 점프에 무적은 없다(sim.ts 착지 깔림 검사 주석 — 공중이 안전한 건
// 밑면 접촉이 지면에서만 성립하기 때문). 재도입하려면 docs/ROADMAP_2026-08-30.md Wave 0 근거를 먼저 뒤집을 것.

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
