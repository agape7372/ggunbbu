// 2막 페이즈 FSM: cathedral → tower → bolt → rock → moon.
// 체크포인트 산술 [정본]: 30 → 40 → 148 → 168 → 180 → 228 → 달 230+.

import type { GameState, Lane } from './types';
import { makeFloor, makeStack } from './building';
import { registerHit, hurtPlayer, addScore, addGauge, addCombo, gaugePerHit } from './combat';
import { guardActive, makePlayer } from './player';
import { ACT2, GUARD_GAUGE, PLAYER, SCORE, STACK, TICK, VIEW } from '../config';
import { initBoss, stepBoss, tryHitBoss } from './boss';

export function enterAct2(s: GameState): void {
  s.mode = 'act2';
  s.act2Phase = 'cathedral';
  s.wazaGauge = 0; // [정본] 기술 게이지 리셋 (방어 게이지는 유지)
  if (!SCORE.CARRY_COMBO_TO_ACT2) s.combo = 0;
  s.stack = null;
  s.entities = [];
  s.debris = [];
  s.groundRocks = 0;
  s.boss = null;
  s.stackSpawnCd = ACT2.INTERLUDE_TICKS;
  s.act2c = { spawned: false, bolts: 0, rocks: 0, cd: 0, t: 0 };
  s.fullCombo = true; // 2막 로컬 풀콤보 판정 시작
  s.checkpoint = 0;
  s.events.push({ kind: 'phaseClear', n: 0 });
}

/** 페이즈 셀렉트/이어하기용 직접 진입 (디버그·체크포인트) */
export function enterAct2Phase(s: GameState, phase: NonNullable<GameState['act2Phase']>): void {
  s.mode = 'act2';
  s.act2Phase = phase;
  s.stack = null;
  s.entities = [];
  s.debris = [];
  s.groundRocks = 0;
  s.boss = null;
  s.hitstop = 0;
  s.act2c = { spawned: false, bolts: 0, rocks: 0, cd: 0, t: 0 };
  s.stackSpawnCd = ACT2.INTERLUDE_TICKS;
  if (phase === 'moon') { s.boss = initBoss(); s.combo = 0; }
}

function nextPhase(s: GameState): void {
  const order: NonNullable<GameState['act2Phase']>[] = ['cathedral', 'tower', 'bolt', 'rock', 'moon'];
  const i = order.indexOf(s.act2Phase!);
  s.events.push({ kind: 'phaseClear', n: i + 1 });
  const next = order[i + 1];
  s.act2Phase = next;
  s.stack = null;
  s.entities = [];
  s.groundRocks = 0;
  s.act2c = { spawned: false, bolts: 0, rocks: 0, cd: 0, t: 0 };
  s.stackSpawnCd = ACT2.INTERLUDE_TICKS;
  if (next === 'moon') {
    s.boss = initBoss();
    s.combo = 0; // [정본] 달 개시 시 콤보 리셋 (단절 이벤트 아님, fullCombo 유지)
  }
}

export function stepAct2(s: GameState): void {
  const c = s.act2c!;
  c.t += 1;

  switch (s.act2Phase) {
    case 'cathedral': {
      if (!c.spawned) {
        if (s.stackSpawnCd > 0) { s.stackSpawnCd -= 1; break; }
        const floors = Array.from({ length: ACT2.CATHEDRAL_FLOORS }, () => makeFloor('cathedral'));
        s.stack = makeStack({ variant: 'cathedral', theme: 'europe', floors, specialImmune: true });
        c.spawned = true;
      } else if (!s.stack) {
        nextPhase(s);
      }
      break;
    }
    case 'tower': {
      if (!c.spawned) {
        if (s.stackSpawnCd > 0) { s.stackSpawnCd -= 1; break; }
        const floors = [
          makeFloor('lobby'),
          ...Array.from({ length: ACT2.TOWER_OFFICE_FLOORS }, () => makeFloor('office')),
          makeFloor('penthouse'),
        ];
        s.stack = makeStack({ variant: 'skyscraper', theme: 'modern', floors, specialImmune: true });
        c.spawned = true;
      } else if (s.stack) {
        // 체크포인트 기록: 로비 격파(40) / 사무층 완료(148)
        const bottom = s.stack.floors[0]?.mat;
        if (bottom === 'office' && s.checkpoint < 40) s.checkpoint = 40;
        if (bottom === 'penthouse' && s.checkpoint < 148) s.checkpoint = 148;
      } else {
        s.checkpoint = 168;
        nextPhase(s);
      }
      break;
    }
    case 'bolt': {
      stepBoltSpawner(s, c);
      if (c.bolts >= ACT2.BOLT_COUNT && !s.entities.some((e) => e.kind === 'bolt')) nextPhase(s);
      break;
    }
    case 'rock': {
      stepRockSpawner(s, c);
      const timeUp = c.t >= ACT2.ROCK_TIMEBOX_TICKS;
      const allDone = c.rocks >= ACT2.ROCK_COUNT && !s.entities.some((e) => e.kind === 'rock' && !e.remnant);
      if (timeUp || allDone) {
        s.groundRocks = 0;
        s.entities = s.entities.filter((e) => e.kind !== 'rock' && e.kind !== 'bolt');
        nextPhase(s);
      }
      break;
    }
    case 'moon': {
      stepBoss(s);
      break;
    }
  }

  stepEntities(s);
}

// ── 번개 ────────────────────────────────────────────────────────
function stepBoltSpawner(s: GameState, c: { bolts: number; cd: number }): void {
  if (c.bolts >= ACT2.BOLT_COUNT) return;
  if (s.stackSpawnCd > 0) { s.stackSpawnCd -= 1; return; } // 인터루드
  if (c.cd > 0) { c.cd -= 1; return; }
  spawnBolt(s, 0);  // 단일 레인 — 12발 전부 플레이어 머리 위 [정본 180 = 전탄 격파]
  c.bolts += 1;
  c.cd = c.bolts <= ACT2.BOLT_EARLY ? ACT2.BOLT_EARLY_GAP : ACT2.BOLT_RHYTHM_GAP;
}

/** cueDelay = 큐 지연(틱). 단일 레인에서 다발 볼트를 시차로 흩기 위해 사용. */
export function spawnBolt(s: GameState, lane: Lane, cueDelay = 0): void {
  s.entities.push({ kind: 'bolt', lane, y: VIEW.H, vy: 0, cueTicks: ACT2.BOLT_CUE_TICKS + cueDelay });
  s.events.push({ kind: 'boltCue', lane });
}

// ── 화산탄 ──────────────────────────────────────────────────────
function stepRockSpawner(s: GameState, c: { rocks: number; cd: number; t: number }): void {
  if (c.rocks >= ACT2.ROCK_COUNT) return;
  if (s.stackSpawnCd > 0) { s.stackSpawnCd -= 1; return; }
  if (c.cd > 0) { c.cd -= 1; return; }
  // 단일 레인 — 전탄이 플레이어 머리 위. 지면 적재는 ROCK_STACK_MAX(3)에서 포화한다.
  const lane: Lane = 0;
  s.entities.push({ kind: 'rock', lane, y: VIEW.H, vy: 0, hp: ACT2.ROCK_HP });
  s.events.push({ kind: 'boltCue', lane }); // 낙하 예고 재사용 (렌더는 kind로 구분 불가하므로 rockWhistle은 스폰 시)
  c.rocks += 1;
  const k = c.rocks / ACT2.ROCK_COUNT;
  c.cd = Math.round(ACT2.ROCK_GAP_START + (ACT2.ROCK_GAP_END - ACT2.ROCK_GAP_START) * k);
}

// ── 엔티티 스테핑 (번개/화산탄/전기탄 — 드론·대포는 boss.ts) ────
export function stepEntities(s: GameState): void {
  const remove: number[] = [];
  for (let i = 0; i < s.entities.length; i++) {
    const e = s.entities[i];
    if (e.kind === 'bolt') {
      if (e.cueTicks > 0) { e.cueTicks -= 1; continue; }
      e.vy = e.y > ACT2.BOLT_ZONE_Y ? -ACT2.BOLT_FALL_V : -ACT2.BOLT_ZONE_V;
      e.y += e.vy * TICK;
      if (e.y <= 0) {
        // 낙뢰 [정본: 가드 불가]. 단일 레인이라 회피 불가 — 존 16f 창에서 베는 것이 유일 해법.
        hurtPlayer(s);
        s.events.push({ kind: 'boltStrike', lane: e.lane });
        remove.push(i);
      }
    } else if (e.kind === 'rock') {
      e.vy -= STACK.ROCK_G * TICK;
      if (e.vy < -STACK.ROCK_VTERM) e.vy = -STACK.ROCK_VTERM;
      e.y += e.vy * TICK;
      if (e.y <= 0) {
        if (e.remnant) {
          remove.push(i); // 격파 잔해: 착지 무해, 적재 없음
        } else {
          // 가드 중·공중·깔림 중이면 무해하게 적재 [원작 공략 재현]
          // pinned 면제는 08-30 검증 발견: 깔림 진입이 무적 0이라 후속 돌이 직격해
          // 방치 시 ~2초 전멸하던 신규 경로 봉인 — 깔린 몸 위 돌은 쌓이기만 한다.
          if (s.player.y <= 4 && !guardActive(s.player) && s.player.pose !== 'pinned') {
            hurtPlayer(s);
          }
          if (s.groundRocks < ACT2.ROCK_STACK_MAX) s.groundRocks += 1;
          s.events.push({ kind: 'land', lane: e.lane });
          remove.push(i);
        }
      }
    } else if (e.kind === 'shot') {
      e.x += e.vx * TICK;
      e.y += e.vy * TICK;
      const px = VIEW.LANE_X[s.player.lane];
      if (Math.abs(e.x - px) < 24 && e.y < s.player.y + 48 && e.y > s.player.y - 4) {
        const blocked = e.guardable && guardActive(s.player) !== null;
        if (!blocked) hurtPlayer(s);
        remove.push(i);
        continue;
      }
      if (e.y <= 0 && e.vy < 0) {
        // 대포탄 착지 → 양옆 지면 스파크 분산 [정본]
        if (!e.cancellable && !e.guardable && Math.abs(e.vx) < 1) {
          s.entities.push(
            { kind: 'shot', lane: e.lane, x: e.x, y: 12, vx: -300, vy: 0, guardable: false, cancellable: false },
            { kind: 'shot', lane: e.lane, x: e.x, y: 12, vx: 300, vy: 0, guardable: false, cancellable: false },
          );
          s.events.push({ kind: 'boltStrike', lane: e.lane });
        }
        remove.push(i);
        continue;
      }
      if (e.x < -40 || e.x > VIEW.W + 40 || e.y > VIEW.H + 40) remove.push(i);
    }
    // rabbit/cannon은 boss.ts가 스테핑
  }
  for (let i = remove.length - 1; i >= 0; i--) s.entities.splice(remove[i], 1);
}

/**
 * 2막 공격 대상 우선순위: 투사체(자기 레인) → 보스 → 바닥 화산탄 더미.
 * 명중 시 true (스택 판정은 sim이 이후 수행).
 */
export function tryHitAct2Targets(s: GameState): boolean {
  const p = s.player;
  const lo = p.y - 8;
  const hi = p.y + ACT2.REACH; // 2막 리치 — config 승격(08-30), 수치 불변
  const px = VIEW.LANE_X[p.lane];

  // 1) 번개 (존 통과 중만 타격 가능)
  for (let i = 0; i < s.entities.length; i++) {
    const e = s.entities[i];
    if (e.kind === 'bolt' && e.lane === p.lane && e.cueTicks <= 0 && e.y >= lo && e.y <= hi) {
      s.entities.splice(i, 1);
      registerHit(s, { scoreBonus: SCORE.BOLT_BONUS });
      s.events.push({ kind: 'hit', lane: p.lane, y: e.y, combo: s.combo });
      return true;
    }
  }
  // 2) 공중 화산탄 / 격파 잔해
  for (let i = 0; i < s.entities.length; i++) {
    const e = s.entities[i];
    if (e.kind === 'rock' && e.lane === p.lane && e.y >= lo && e.y <= hi) {
      e.hp -= 1;
      e.vy = Math.max(e.vy, STACK.HIT_LIFT_V);
      const remnant = !!e.remnant;
      if (e.hp <= 0) s.entities.splice(i, 1);
      if (remnant) addCombo(s); // [정본] 격파 잔해 = 콤보만, 점수 없음
      else registerHit(s);
      s.events.push({ kind: 'hit', lane: p.lane, y: e.y, combo: s.combo });
      return true;
    }
  }
  // 3) 전기탄 상쇄 (cancellable만)
  for (let i = 0; i < s.entities.length; i++) {
    const e = s.entities[i];
    if (e.kind === 'shot' && e.cancellable && Math.abs(e.x - px) < 60 && e.y >= lo && e.y <= hi) {
      s.entities.splice(i, 1);
      registerHit(s, { scoreBonus: SCORE.CANCEL_BONUS });
      s.events.push({ kind: 'hit', lane: p.lane, y: e.y, combo: s.combo });
      return true;
    }
  }
  // 4) 보스 본체 / 드론 / 대포
  if (s.boss && tryHitBoss(s, lo, hi)) return true;
  // 5) 바닥 화산탄 더미 파밍 [정본: 반복 점수. 콤보는 플래그(기본 off)]
  if (s.groundRocks > 0 && lo <= s.groundRocks * ACT2.ROCK_PILE_H) {
    if (SCORE.GROUND_ROCK_COMBO) {
      registerHit(s);
    } else {
      addScore(s, SCORE.BASE_HIT * Math.min(Math.max(s.combo, 1), SCORE.COMBO_CAP));
      addGauge(s, gaugePerHit(s.combo));
    }
    s.events.push({ kind: 'hit', lane: p.lane, y: 20, combo: s.combo });
    return true;
  }
  return false;
}

/** 2막 게임오버 → 체크포인트 이어하기 [설계: 모바일용] */
export function continueFromCheckpoint(s: GameState): void {
  const cp = s.checkpoint;
  s.over = null;
  s.lives = PLAYER.LIVES;
  s.wazaGauge = 0;
  s.guardGauge = GUARD_GAUGE.MAX;
  s.hitstop = 0;
  s.debris = [];
  s.events = [];
  s.bonus = null;
  s.fullCombo = false;
  s.player = makePlayer();
  s.player.invulnTicks = 60;
  if (cp >= 168) { enterAct2Phase(s, 'bolt'); s.combo = 168; s.checkpoint = 168; }
  else if (cp >= 148) {
    enterAct2Phase(s, 'tower');
    s.combo = 148;
    const floors = [makeFloor('penthouse')];
    s.stack = makeStack({ variant: 'skyscraper', theme: 'modern', floors, specialImmune: true });
    s.act2c!.spawned = true;
    s.checkpoint = 148;
  } else if (cp >= 40) {
    enterAct2Phase(s, 'tower');
    s.combo = 40;
    const floors = [
      ...Array.from({ length: ACT2.TOWER_OFFICE_FLOORS }, () => makeFloor('office')),
      makeFloor('penthouse'),
    ];
    s.stack = makeStack({ variant: 'skyscraper', theme: 'modern', floors, specialImmune: true });
    s.act2c!.spawned = true;
    s.checkpoint = 40;
  } else {
    enterAct2Phase(s, 'cathedral');
    s.combo = 0;
  }
}
