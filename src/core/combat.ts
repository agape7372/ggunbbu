// 타격 판정·콤보·점수·게이지 이벤트 처리.
//
// 콤보 전수 [정본] — 다른 경로 없음. cap 999.
//   +1: 건물 세그 타격 / 번개탄 파괴 / 화산탄 타격 / 토끼탄 상쇄 / 보스·드론·대포 타격
//       / 명물 몸 타격(landmark.ts tryHitLandmark) / 시간차 필살의 연참·검풍 한 타(sim.ts wazaHit).
//       (바닥 화산탄 파밍은 SCORE.GROUND_ROCK_COMBO, 기본 off)
//   →0: ① 지면 가드 바운스 · 종탑 내려찍기를 지면 가드로 막음(landmark.ts stepSlam). 무기 keepCombo(삽)면 유지
//       ② 구조물 접지(깔림) · 버터바 뭉개짐 ③ 플레이어 피격 전부
//       ④ 집행기 보스 개시(2막 달 · 작업 지시서 HQ) — 카운터만 0, fullCombo 유지, comboBreak 이벤트 없음
//       ⑤ 2막 이어하기 — 콤보를 체크포인트(40/148/168)로 재설정, fullCombo 소멸
//   유지: 헛스윙 / 점프 가드 / 점프 / 시간 경과 / 1막→2막 / 필살기 발동·터짐 / 가드 브레이크
//         / 안전모가 대신 받은 깔림(items.ts absorbWithHat — ②에서 빠진다).

import type { FallingStack, GameState, Lane } from './types';
import { arcadeRule, damageStack } from './building';
import { DEBRIS, GIMMICK, GUARD_GAUGE, HAT, MAT_LIFT, STAGE, WAZA_GAUGE, PLAYER, SCORE, STACK, WEAPON } from '../config';
import { VIEW } from '../config';
import { rand } from './rng';
import { liftOf, reachOf, wazaMul } from './perks';

export function addScore(s: GameState, n: number): void {
  s.score = Math.min(s.score + n, SCORE.CAP);
}

export function addCombo(s: GameState): void {
  if (s.combo < SCORE.COMBO_CAP) s.combo += 1;
  // 999 카운터스톱: 이벤트는 타격 지점이 발행한다 (여기서 중복 발행 금지)
  // 안전모 = 콤보 고비 상. 2막은 벗고 들어가니 주지 않는다. 같은 틱 뒤의 깔림도 바로 막는다
  // 작업 지시서 외주는 안전모가 없다
  const hatOk = s.mode !== 'act2' && !(s.stage && !STAGE.DIFF[s.stage.diff].hat);
  if (!s.hat && hatOk && HAT.COMBO_AT.includes(s.combo)) {
    s.hat = true;
    s.events.push({ kind: 'hatGet', combo: s.combo, y: s.player.y + PLAYER.H });
  }
}

export function breakCombo(s: GameState): void {
  if (s.combo > 0) {
    s.events.push({ kind: 'comboBreak', combo: s.combo });
    const g = WEAPON[s.weapon].breakGauge; // 불새 대검: 끊길 때마다 필살 게이지(재에서 다시 일어난다 · 튜토리얼은 없음)
    if (g && s.mode !== 'training') addGauge(s, g);
  }
  if (s.combo > s.peakCombo) s.peakCombo = s.combo;   // 0으로 만들기 전에 봉인
  s.combo = 0;
  if (s.mode === 'act2') s.fullCombo = false;
}

/** 가드가 튕겼다(땅 · 공중 · 종탑 막기). 무기 guardGauge(철근)만큼 필살 게이지를 그대로 더한다 */
export function guardBounced(s: GameState, ground: boolean): void {
  const w = WEAPON[s.weapon];
  if (w.guardGauge) addGauge(s, w.guardGauge);
  if (w.guardFreeze && s.stack && arcadeRule(s)) s.stack.chill = w.guardFreeze; // 고드름 대검: 튕긴 건물이 얼어 멈춘다(sim 스택 물리가 센다)
  if (ground) groundGuardCombo(s);
}

/** 땅 가드가 막았다(튕김 · 종탑 내려찍기). 삽 keepCombo는 그 몫만 남긴다 */
function groundGuardCombo(s: GameState): void {
  cutCombo(s, WEAPON[s.weapon].keepCombo);
}

/** 콤보를 끊는다. keep(0~1)이 있으면 끊지 않고 그 몫만 남긴다(1 밑으론 안 간다 · 삽 땅 가드 · 흑철 깔림) */
export function cutCombo(s: GameState, keep: number | undefined): void {
  if (!keep || s.combo === 0) { breakCombo(s); return; }
  if (s.combo > s.peakCombo) s.peakCombo = s.combo;
  s.combo = Math.max(1, Math.floor(s.combo * keep));
}

export function gaugePerHit(combo: number): number {
  return Math.min(WAZA_GAUGE.PER_HIT_MAX, WAZA_GAUGE.PER_HIT_BASE + Math.floor(combo / WAZA_GAUGE.PER_HIT_DIV));
}

/** 무기 게이지 배율. comboGauge(코어 드릴)는 콤보 100까지 곧게 더 곱한다: 1 + comboGauge × min(콤보, 100)/100 */
export function weaponGaugeMul(s: GameState): number {
  const w = WEAPON[s.weapon];
  const last = s.lives === 1 ? w.lastLifeGauge ?? 1 : 1; // 화염 대검: 목숨 하나면 이 배율
  return w.gauge * (1 + (w.comboGauge ?? 0) * Math.min(s.combo, 100) / 100) * last;
}

/** 이번 타격이 채우는 필살 게이지 — 콤보 계단 × 무기 배율 */
export function hitGauge(s: GameState): number {
  return gaugePerHit(s.combo) * weaponGaugeMul(s) * wazaMul(s);
}

export function addGauge(s: GameState, n: number): void {
  const before = s.wazaGauge;
  if (before < WAZA_GAUGE.MAX && n > 0) s.wazaFree = false; // 스스로 채우기 시작했다(먹 대검 덤 셈)
  s.wazaGauge = Math.max(0, Math.min(WAZA_GAUGE.MAX, s.wazaGauge + n));
  if (before < WAZA_GAUGE.MAX && s.wazaGauge >= WAZA_GAUGE.MAX) s.events.push({ kind: 'gaugeFull' });
}

/** 유효 타격 공통 처리: 콤보 +1 → 점수 → 게이지. collapse = 이 타격에 층이 무너졌다(무기 collapseGauge를 그대로 더한다) */
export function registerHit(s: GameState, opts?: { scoreBonus?: number; noGauge?: boolean; collapse?: boolean }): void {
  addCombo(s);
  if (opts?.collapse) for (let i = WEAPON[s.weapon].collapseCombo ?? 0; i > 0; i--) addCombo(s); // 톱날 대검: 층 붕괴 콤보 더
  addScore(s, SCORE.BASE_HIT * Math.min(s.combo, SCORE.COMBO_CAP) + (opts?.scoreBonus ?? 0));
  if (!opts?.noGauge) addGauge(s, hitGauge(s) + (opts?.collapse ? WEAPON[s.weapon].collapseGauge ?? 0 : 0));
}

/** 공격 히트박스 수직 범위 (물리 좌표). reach = 무기 사거리(건물 판정에만 넘긴다) */
export function attackRange(footY: number, reach: number = PLAYER.ATTACK_REACH): [number, number] {
  return [footY - 8, footY + reach];
}

/**
 * 공격 활성 프레임에 스택 타격 시도. 명중 시 이벤트/콤보/점수/게이지/밀어올림 처리.
 * 반환: 명중 여부.
 */
export function tryHitStack(s: GameState, lane: Lane, footY: number): boolean {
  const stack = s.stack;
  if (!stack) return false;
  const [lo, hi] = attackRange(footY, reachOf(s));
  const mat = stack.floors.length > 0 ? stack.floors[0].mat : 'weak';
  const yHit = stack.y;
  const res = damageStack(stack, lane, lo, hi, hitDamage(s));
  if (res === 'miss') return false;
  s.hitAt = s.tick;

  // 종은 세게 밀린다(저글링) · 바람탑 들숨은 두 배 — 아케이드 재질은 배율 1.
  // 쥔 채 반복 타격(드릴류)은 밀지 않고 드릴이 박혀 끌어내린다(WeaponSpec.holdPull · 명물 포함 · 2막 빼고): 쥐고만 있으면 건물이 금방 내려와 깔린다(tests/weapons.test.ts)
  const grind = s.player.attackHold;
  if (!grind) {
    stack.vy = Math.max(stack.vy, liftOf(s) * (MAT_LIFT[mat] ?? 1) * (s.stage?.liftMul ?? 1));
    stack.resting = false;
  } else if (s.mode !== 'act2') stack.y = Math.max(0, stack.y - (WEAPON[s.weapon].holdPull ?? 0));

  if (res === 'collapse') {
    const isButter = mat === 'butter';
    const chain = stack.floors.length > 0 && chainDue(s);
    s.events.push({
      kind: isButter ? 'butterCollapse' : 'floorCollapse',
      lane, y: yHit, mat, combo: Math.min(SCORE.COMBO_CAP, s.combo + 1 + (WEAPON[s.weapon].collapseCombo ?? 0)),
      ...(stack.floors.length === 0 ? { last: true } : {}),
      ...(chain ? { chain: true } : {}),
      ...(grind ? { grind: true } : {}),
    });
    registerHit(s, { scoreBonus: SCORE.FLOOR_BONUS, collapse: true });
    spawnFloorDebris(s, yHit);
    if (stack.floors.length === 0) {
      destroyStack(s);
    } else if (chain) chainHit(s, stack);
  } else {
    s.events.push({ kind: 'hit', lane, y: yHit, mat, combo: s.combo + 1, ...(grind ? { grind: true } : {}) });
    registerHit(s);
  }
  return true;
}

/** 베기 한 번의 층 대미지 — 1. 원소 대검 둘만 1막 · 토코톤에서 늘린다:
 *  그림자 restBreak = 베기가 그 틱 넘게 안 닿았으면 맨 아래층 통째로 · 해일 comboDouble = 콤보가 그 배수가 되는 베기는 2 */
function hitDamage(s: GameState): number {
  const w = WEAPON[s.weapon];
  if (!arcadeRule(s)) return 1;
  if (w.restBreak !== undefined && s.tick - s.hitAt > w.restBreak) return 1e9;
  return w.comboDouble && (s.combo + 1) % w.comboDouble === 0 ? 2 : 1;
}

/** 고압선 대검: 위층이 남은 층 깨기를 세어 collapseChain 번마다 true(1막 · 토코톤) */
function chainDue(s: GameState): boolean {
  const n = WEAPON[s.weapon].collapseChain;
  if (!n || !arcadeRule(s)) return false;
  s.chainN += 1;
  return s.chainN % n === 0;
}

/** 전류가 남은 맨 아래층으로 번진다 — 대미지 1. 무너지면 콤보 · 게이지 없이 층 깨기(필살 붕괴와 같은 꼴 · 이벤트 하나) */
function chainHit(s: GameState, stack: FallingStack): void {
  const f = stack.floors[0];
  if (f.mat === 'bell') return;
  f.segs[0].hp -= 1;
  if (f.segs[0].hp > 0) return;
  stack.floors.shift();
  s.events.push({ kind: 'floorCollapse', lane: s.player.lane, y: stack.y, mat: f.mat, ...(stack.floors.length === 0 ? { last: true } : {}) });
  addScore(s, SCORE.FLOOR_BONUS);
  if (stack.floors.length === 0) destroyStack(s);
}

/** spawnFloorDebris 한 번이 뽑는 난수 수(조각 셋 × 다섯). 작업 지시서 집행기 난수가 이 값으로 대본 잔해를 건너뛴다(stage.ts finishScript) */
export const DEBRIS_RANDS = 15;

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
      life: DEBRIS.LIFE_F,
    });
  }
}

/** 스택 완파 처리 (마지막 층 붕괴 or 필살기) */
export function destroyStack(s: GameState): void {
  const stack = s.stack;
  if (!stack) return;
  if (stack.variant === 'butterbar') {
    s.events.push({ kind: 'stackDestroy', n: stack.totalFloors });
    addScore(s, stack.totalFloors * SCORE.BUTTER_DESTROY_PER_LAYER);
    if (s.bonus) s.bonus.destroyed += 1;
  } else {
    const pts = Math.round(SCORE.DESTROY_BONUS * (WEAPON[s.weapon].destroyMul ?? 1)); // 황금 대검: 완파 점수 배율
    s.events.push({ kind: 'stackDestroy', n: stack.totalFloors, pts });
    addScore(s, pts);
  }
  s.stack = null;
  s.stackSpawnCd = stack.vary?.joined ? STAGE.JOINED_GAP // 아케이드 변종 「붙어 오기」(대본 「>」)
    : s.gimmick === 'night'
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
      stack.vy = STACK.GUARD_GROUND_V * (s.gimmick === 'ice' ? GIMMICK.ICE_BOUNCE_GROUND : 1) * (WEAPON[s.weapon].guardLift ?? 1);
      stack.resting = false;
      s.guardGauge = Math.max(0, s.guardGauge - GUARD_GAUGE.BOUNCE_COST_GROUND);
      s.guardRegenCd = GUARD_GAUGE.REGEN_DELAY_TICKS;
      guardBounced(s, true); // [정본] 지면 가드 = 콤보 단절(삽 keepCombo는 몫만큼 남는다)
      s.events.push({ kind: 'guardBounce', y: stack.y });
      return true;
    }
  } else {
    const plane = footY + PLAYER.H;
    const crossed = prev >= plane - STACK.GUARD_ZONE_AIR && stack.y <= plane + STACK.GUARD_ZONE_AIR;
    if (crossed || Math.abs(stack.y - plane) <= STACK.GUARD_ZONE_AIR) {
      stack.vy = STACK.GUARD_AIR_V * (s.gimmick === 'ice' ? GIMMICK.ICE_BOUNCE_AIR : 1) * (WEAPON[s.weapon].guardLift ?? 1);
      stack.resting = false;
      // ★원작 이식(2026-08-30 사용자 확정): 공중가드 바운스는 플레이어를 아래로 튕긴다.
      // 원작 vy=8.0px/f 아래로(FUN_00405490 포즈10) — 초속 대비 비율로 옮긴다(config). 위로 상승 중이었어도 하향 덮어쓰기.
      s.player.vy = Math.min(s.player.vy, -STACK.GUARD_AIR_RECOIL_V);
      s.guardGauge = Math.max(0, s.guardGauge - GUARD_GAUGE.BOUNCE_COST_AIR);
      s.guardRegenCd = GUARD_GAUGE.REGEN_DELAY_TICKS;
      guardBounced(s, false); // [정본] 점프 가드 = 콤보 유지
      s.events.push({ kind: 'guardAirBounce', y: stack.y });
      return true;
    }
  }
  return false;
}

/** 판을 깼다(보스 · 명물이 쓰러졌거나 작업 지시서가 끝났다). 이 뒤엔 피격 · 깔림 · 깔린 채 손실 모두 없다 —
 *  쓰러지는 연출 동안 날아오던 탄이나 더미에 깬 판이 게임오버 · 「미완료」가 되지 않게 */
export function wonAlready(s: GameState): boolean {
  return s.stage?.phase === 'done' || s.boss?.st === 'defeated' || s.lm?.st === 'down';
}

/** 플레이어 피격 공통 처리 (무적 중이면 무시) */
export function hurtPlayer(s: GameState): boolean {
  const p = s.player;
  if (p.invulnTicks > 0 || p.pose === 'special' || wonAlready(s)) return false;
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
