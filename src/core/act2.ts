// 2막 페이즈 FSM: cathedral → tower → bolt → rock → moon.
// 체크포인트 산술 [정본]: 30 → 40 → 148 → 168 → 180 → 228 → 달 230+.

import type { GameState, Lane } from './types';
import { makeFloor, makeStack } from './building';
import { registerHit, hurtPlayer, addScore, addGauge, gaugePerHit } from './combat';
import { guardActive } from './player';
import { randInt } from './rng';
import { ACT2, SCORE, STACK, TICK, VIEW } from '../config';
import { initBoss, stepBoss, tryHitBoss } from './boss';

export function enterAct2(s: GameState): void {
  s.mode = 'act2';
  s.act2Phase = 'cathedral';
  s.gauge = 0; // [정본] 게이지 리셋
  if (!SCORE.CARRY_COMBO_TO_ACT2) s.combo = 0;
  s.stack = null;
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
  s.groundRocks = [0, 0, 0];
  s.boss = null;
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
  s.act2c = { spawned: false, bolts: 0, rocks: 0, cd: 0, t: 0 };
  s.stackSpawnCd = ACT2.INTERLUDE_TICKS;
  if (next === 'moon') {
    s.boss = initBoss();
    s.combo = 0; // [정본] 달 개시 시 콤보 리셋 (단절 이벤트 아님)
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
        s.stack = makeStack({ variant: 'skyscraper', theme: 'modern', floors, specialImmune: true, sharedHp: true });
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
      const allDone = c.rocks >= ACT2.ROCK_COUNT && !s.entities.some((e) => e.kind === 'rock');
      if (timeUp || allDone) {
        s.groundRocks = [0, 0, 0]; // 더미 소멸 → 보스 인트로
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
  spawnBolt(s, randInt(s, 3) as Lane);
  c.bolts += 1;
  c.cd = c.bolts <= ACT2.BOLT_EARLY ? ACT2.BOLT_EARLY_GAP : ACT2.BOLT_RHYTHM_GAP;
}

export function spawnBolt(s: GameState, lane: Lane): void {
  s.entities.push({ kind: 'bolt', lane, y: VIEW.H, vy: 0, cueTicks: ACT2.BOLT_CUE_TICKS });
  s.events.push({ kind: 'boltCue', lane });
}

// ── 화산탄 ──────────────────────────────────────────────────────
function stepRockSpawner(s: GameState, c: { rocks: number; cd: number; t: number }): void {
  if (c.rocks >= ACT2.ROCK_COUNT) return;
  if (s.stackSpawnCd > 0) { s.stackSpawnCd -= 1; return; }
  if (c.cd > 0) { c.cd -= 1; return; }
  // 적재 3단 초과 레인 제외 재추첨
  const candidates: Lane[] = ([0, 1, 2] as Lane[]).filter((l) => s.groundRocks[l] < ACT2.ROCK_STACK_MAX);
  const lane = candidates.length > 0 ? candidates[randInt(s, candidates.length)] : (randInt(s, 3) as Lane);
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
        // 낙뢰 [정본: 가드 불가]
        if (e.lane === s.player.lane) hurtPlayer(s);
        else s.fullCombo = false; // 타 레인 무해, 풀콤보만 소멸
        s.events.push({ kind: 'boltStrike', lane: e.lane });
        remove.push(i);
      }
    } else if (e.kind === 'rock') {
      e.vy -= STACK.ROCK_G * TICK;
      if (e.vy < -STACK.ROCK_VTERM) e.vy = -STACK.ROCK_VTERM;
      e.y += e.vy * TICK;
      if (e.y <= 0) {
        if (e.lane === s.player.lane && s.player.y <= 4 && !guardActive(s.player)) {
          hurtPlayer(s); // 가드 중이면 무해하게 적재 [원작 공략 재현]
        }
        if (s.groundRocks[e.lane] < ACT2.ROCK_STACK_MAX) s.groundRocks[e.lane] += 1;
        s.events.push({ kind: 'land', lane: e.lane });
        remove.push(i);
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
  const hi = p.y + 128;
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
  // 2) 공중 화산탄
  for (let i = 0; i < s.entities.length; i++) {
    const e = s.entities[i];
    if (e.kind === 'rock' && e.lane === p.lane && e.y >= lo && e.y <= hi) {
      e.hp -= 1;
      e.vy = Math.max(e.vy, STACK.HIT_LIFT_V);
      if (e.hp <= 0) s.entities.splice(i, 1);
      registerHit(s);
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
  if (s.groundRocks[p.lane] > 0 && lo <= s.groundRocks[p.lane] * 40) {
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
  s.lives = 3;
  s.gauge = 0;
  s.fullCombo = false;
  s.player = { ...s.player, pose: 'idle', poseTick: 0, y: 0, vy: 0, invulnTicks: 60, pinTick: 0 };
  if (cp >= 168) { enterAct2Phase(s, 'bolt'); s.combo = 168; }
  else if (cp >= 148) {
    enterAct2Phase(s, 'tower');
    s.combo = 148;
    // 펜트하우스만 남은 타워 재구성
    const floors = [makeFloor('penthouse')];
    s.stack = makeStack({ variant: 'skyscraper', theme: 'modern', floors, specialImmune: true, sharedHp: true });
    s.act2c!.spawned = true;
    s.checkpoint = 148;
  } else if (cp >= 40) {
    enterAct2Phase(s, 'tower');
    s.combo = 40;
    const floors = [
      ...Array.from({ length: ACT2.TOWER_OFFICE_FLOORS }, () => makeFloor('office')),
      makeFloor('penthouse'),
    ];
    s.stack = makeStack({ variant: 'skyscraper', theme: 'modern', floors, specialImmune: true, sharedHp: true });
    s.act2c!.spawned = true;
    s.checkpoint = 40;
  } else {
    enterAct2Phase(s, 'cathedral');
    s.combo = 0;
  }
}
