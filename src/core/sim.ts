// 1틱 오케스트레이터 — 순서: 버퍼 수집 → 히트스톱 → 필살기 → 깔림 → 플레이어 →
// 스택 물리/접지 → 가드 바운스 → 공격 판정 → 모드 진행(스폰·챕터·보너스·막 전환).
// act2/보스 스테핑은 act2.ts/boss.ts (M4/M5)에서 이 파일에 연결된다.

import type { GameState, InputFrame } from './types';
import { makePlayer, stepPlayer, collectBuffers, guardActive, attackActive } from './player';
import { stackPhysics, stepStack, damageStack } from './building';
import { tryHitStack, tryGuardBounce, destroyStack, breakCombo, addScore, hurtPlayer } from './combat';
import { spawnAct1Building, spawnButterbar, chapterOf } from './spawner';
import { ACT1, BONUS, DEBRIS, GUARD_GAUGE, PLAYER, SCORE, SPECIAL, STACK, TICK, TOKOTON, WAZA_GAUGE } from '../config';
import { stepAct2, enterAct2, tryHitAct2Targets } from './act2';
import { specialHitBoss } from './boss';

export function makeState(opts?: { seed?: number; mode?: GameState['mode'] }): GameState {
  return {
    tick: 0,
    rngState: opts?.seed ?? 12345,
    mode: opts?.mode ?? 'act1',
    act2Phase: null,
    chapter: 0,
    player: makePlayer(),
    stack: null,
    stackSpawnCd: 30,
    entities: [],
    debris: [],
    groundRocks: 0,
    boss: null,
    bonus: null,
    act2c: null,
    combo: 0,
    score: 0,
    guardGauge: GUARD_GAUGE.MAX,
    wazaGauge: 0,
    guardRegenCd: 0,
    lives: PLAYER.LIVES,
    hitstop: 0,
    p: 0,
    checkpoint: 0,
    fullCombo: true,
    events: [],
    over: null,
  };
}

export function advance(s: GameState, input: InputFrame): void {
  if (s.over) return;
  s.tick += 1;

  // 히트스톱 중에도 입력 버퍼는 수집 (연타 리듬 보존)
  collectBuffers(s.player, input);
  if (s.hitstop > 0) {
    s.hitstop -= 1;
    return;
  }

  // ── 필살기 발동 (게이지 100, 깔림 중에도 가능 [정본]) ──
  if (input.special && s.wazaGauge >= WAZA_GAUGE.COST
    && s.player.pose !== 'dead' && s.player.pose !== 'special') {
    triggerSpecial(s);
  }

  // ── 깔림 상태 ──
  const wasAirborne = s.player.y > 0;
  if (s.player.pose === 'pinned') {
    stepPinned(s, input);
  } else {
    stepPlayer(s, input, TICK);
  }

  // [정본] 점프 무적의 이면: 지면에 놓인 스택 위/옆에 착지하면 그때 깔린다
  if (s.player.y <= 0 && s.player.pose !== 'pinned' && s.player.pose !== 'dead'
    && s.stack?.resting && s.player.invulnTicks <= 0 && s.player.pose !== 'special'
    && s.mode !== 'bonus') {
    onPlayerCrushed(s);
  }

  // 화산탄 더미 위 착지 깔림 — 공중이면 무해, 착지 순간에만 피격 (가드 적재와 구분)
  if (wasAirborne && s.player.y <= 0 && s.groundRocks > 0
    && s.player.pose !== 'pinned' && s.player.pose !== 'dead'
    && s.player.invulnTicks <= 0 && s.player.pose !== 'special'
    && s.mode !== 'bonus') {
    hurtPlayer(s);
  }

  // ── 방어 게이지 회복 (가드를 놓고 있을 때만) ──
  if (s.guardRegenCd > 0) s.guardRegenCd -= 1;
  else if (s.guardGauge < GUARD_GAUGE.MAX) {
    s.guardGauge = Math.min(GUARD_GAUGE.MAX, s.guardGauge + GUARD_GAUGE.REGEN_PER_S * TICK);
  }

  // ── 스택 물리 + 접지 ──
  const stack = s.stack;
  let prevStackY = 0;
  if (stack) {
    prevStackY = stack.y;
    const { g, vterm } = stackPhysics(s);
    const grounded = stepStack(stack, g, vterm, TICK);
    // 접지 전에 가드 스윕 판정 기회를 준다 (공중가드가 접지 직전 프레임을 잡도록)
    if (grounded && !tryGuardBounce(s, guardActive(s.player), s.player.y, prevStackY)) {
      onStackGrounded(s);
    }
  }

  // ── 가드 바운스 (비접지 프레임) ──
  if (s.stack && !s.stack.resting) {
    tryGuardBounce(s, guardActive(s.player), s.player.y, prevStackY);
  }

  // ── 공격 판정 (활성 프레임 묶음당 1히트) ──
  // 우선순위: 투사체(자기 레인) → 보스/드론/대포 → 바닥 더미 → 스택 최하층
  if (attackActive(s.player) && !s.player.attackHit) {
    if (tryHitAct2Targets(s)) s.player.attackHit = true;
    else if (tryHitStack(s, s.player.lane, s.player.y)) s.player.attackHit = true;
  }
  if (s.player.pose === 'attack' && s.player.poseTick === PLAYER.ATTACK_PRE && !s.player.attackHit) {
    s.events.push({ kind: 'slash' });
  }

  stepDebris(s);

  // ── 모드 진행 ──
  if (s.mode === 'act1') stepAct1(s);
  else if (s.mode === 'tokoton') stepTokoton(s);
  else if (s.mode === 'bonus') stepBonus(s);
  else if (s.mode === 'act2') stepAct2(s);
}

function stepDebris(s: GameState): void {
  if (s.debris.length === 0) return;
  const g = DEBRIS.GRAVITY;
  const dt = TICK;
  for (let i = s.debris.length - 1; i >= 0; i--) {
    const d = s.debris[i];
    d.vy -= g * dt;
    d.y += d.vy * dt;
    d.x += d.vx * dt;
    d.life -= 1;
    if (d.y <= 0) { d.y = 0; d.vy *= DEBRIS.BOUNCE_VY; d.vx *= DEBRIS.BOUNCE_VX; }
    if (d.life <= 0) s.debris.splice(i, 1);
  }
}
// ── 필살기 ──────────────────────────────────────────────────────
function triggerSpecial(s: GameState): void {
  const p = s.player;
  s.wazaGauge -= WAZA_GAUGE.COST;
  p.pose = 'special';
  p.poseTick = 0;
  p.invulnTicks = SPECIAL.IFRAMES;
  p.pinTick = 0;
  s.hitstop = SPECIAL.HITSTOP;
  s.events.push({ kind: 'special', lane: p.lane });

  const stack = s.stack;
  if (stack) {
    if (stack.specialImmune) {
      // [정본: 2막 일부 무효] 최하층에 10대미지만
      const res = damageStack(stack, p.lane, stack.y - 1, stack.y + 1, SPECIAL.IMMUNE_DMG);
      if (res === 'collapse') {
        s.events.push({ kind: 'floorCollapse', mat: 'cathedral', y: stack.y });
        addScore(s, SCORE.FLOOR_BONUS);
        if (stack.floors.length === 0) destroyStack(s);
        else stack.vy = Math.max(stack.vy, STACK.PIN_ESCAPE_V);
      } else {
        stack.vy = Math.max(stack.vy, STACK.PIN_ESCAPE_V);
      }
      stack.resting = false;
    } else {
      // 전체 파괴 — 고정 보너스만 (콤보/게이지 변동 없음 [설계])
      addScore(s, stack.floors.length * SCORE.FLOOR_BONUS);
      destroyStack(s);
    }
  }
  // 화산탄 전체 소거 (공중 + 바닥) — 2막 P4
  let cleared = 0;
  s.entities = s.entities.filter((e) => {
    if (e.kind === 'rock') { cleared += 1; return false; }
    return true;
  });
  cleared += s.groundRocks;
  s.groundRocks = 0;
  if (cleared > 0) addScore(s, cleared * SCORE.FLOOR_BONUS);
  // 보스: 소량 대미지 + 무적 (주 용도는 회피 [정본])
  if (s.boss) specialHitBoss(s);
}

// ── 깔림 ────────────────────────────────────────────────────────
function stepPinned(s: GameState, input: InputFrame): void {
  const p = s.player;
  const stack = s.stack;
  if (!stack || !stack.resting) {
    // 스택이 사라졌거나 떠올랐으면 자동 해방
    p.pose = 'idle';
    p.poseTick = 0;
    return;
  }

  // 방치 페널티: 120f마다 라이프 반복 손실
  p.pinTick += 1;
  if (p.pinTick >= PLAYER.PIN_REPEAT_TICKS) {
    p.pinTick = 0;
    loseLife(s);
    if (s.over) return;
  }

  if (input.guard || p.bufGuard > 0) {
    // 하: 지면 가드로 띄우기 [정본] — 게이지 무관, 소모 없음
    p.bufGuard = 0;
    stack.vy = STACK.PIN_ESCAPE_V;
    stack.resting = false;
    stack.y = Math.max(stack.y, 0.001);
    p.pose = 'idle';
    p.poseTick = 0;
    p.invulnTicks = PLAYER.PIN_ESCAPE_IFRAMES_LIFT;
    s.events.push({ kind: 'guardBounce', y: 0 });
    return;
  }

  if (p.bufAttack > 0) {
    // Z: 최하층에 5대미지 [정본]. 실패(고HP층) 시 라이프 추가 손실 [정본]
    p.bufAttack = 0;
    const res = damageStack(stack, p.lane, stack.y - 1, stack.y + 1, 5);
    if (res === 'collapse') {
      s.events.push({ kind: 'floorCollapse', mat: stack.floors[0]?.mat, y: 0 });
      addScore(s, SCORE.FLOOR_BONUS); // 층붕괴 점수만, 타격점수/콤보 없음 [설계]
      if (stack.floors.length === 0) destroyStack(s);
      else { stack.vy = STACK.PIN_ESCAPE_V; stack.resting = false; }
      p.pose = 'idle';
      p.invulnTicks = PLAYER.PIN_ESCAPE_IFRAMES_ATK;
    } else {
      loseLife(s);
      if (s.over) return;
      stack.vy = STACK.PIN_MERCY_V; // 자비 바운스
      stack.resting = false;
      p.pose = 'idle';
      p.invulnTicks = PLAYER.PIN_ESCAPE_IFRAMES_ATK;
    }
    p.poseTick = 0;
  }
}

function loseLife(s: GameState): void {
  s.lives -= 1;
  s.events.push({ kind: 'lifeLost', n: s.lives });
  if (s.lives <= 0) {
    s.player.pose = 'dead';
    s.over = 'gameover';
  }
}

// ── 접지 처리 ───────────────────────────────────────────────────
function onStackGrounded(s: GameState): void {
  const stack = s.stack;
  if (!stack) return;
  stack.vy = 0;
  stack.resting = true;

  if (s.player.invulnTicks > 0 || s.player.pose === 'special') return; // 무적 중 접지 무시

  // [정본] "점프 중에는 짓눌리지 않음" — 공중이면 피해 없음.
  // 착지 시점에 스택이 아직 지면에 있으면 그때 깔린다(sim 루프의 착지 검사).
  if (s.player.y > 0) return;

  if (s.mode === 'bonus') {
    // 버터바는 뭉개질 뿐 — 라이프 무손실, 콤보만 단절 [설계]
    breakCombo(s);
    s.events.push({ kind: 'butterCollapse', y: 0 });
    s.stack = null;
    s.stackSpawnCd = 20;
    return;
  }

  onPlayerCrushed(s);
}

/** 깔림 진입 [정본: 접지 = 라이프 1 손실] */
function onPlayerCrushed(s: GameState): void {
  loseLife(s);
  if (s.over) return;
  breakCombo(s);
  s.player.pose = 'pinned';
  s.player.poseTick = 0;
  s.player.pinTick = 0;
  s.events.push({ kind: 'hurt' });
}

// ── 1막 ─────────────────────────────────────────────────────────
function stepAct1(s: GameState): void {
  s.p = Math.min(1, s.score / ACT1.UNLOCK_SCORE);

  // 챕터 전환 → 해금 이벤트 + 버터바 보너스 스테이지 진입
  const ch = chapterOf(s.p);
  if (ch > s.chapter) {
    s.chapter = ch;
    s.events.push({ kind: 'chapterUnlock', n: ch });
    enterBonus(s, ch); // 회차 = 통과한 경계 수 (1~3)
    return;
  }

  // 2막 전환 [정본: 게이지 리셋, 콤보 유지]
  if (s.score >= ACT1.UNLOCK_SCORE) {
    enterAct2(s);
    return;
  }

  trySpawn(s);
}

function trySpawn(s: GameState): void {
  if (!s.stack) {
    if (s.stackSpawnCd > 0) s.stackSpawnCd -= 1;
    else spawnAct1Building(s);
  }
}

// ── 토코톤 ──────────────────────────────────────────────────────
function stepTokoton(s: GameState): void {
  const elapsedMin = s.tick / 3600;
  s.p = Math.min(TOKOTON.P_MAX, s.score / ACT1.UNLOCK_SCORE + elapsedMin * TOKOTON.P_PER_MIN);
  // p>1 은 현대 테마 고정. 그 전에는 2분 주기 챕터 순환 [설계]
  if (s.p > 1) s.chapter = ACT1.CHAPTER_THEMES.length - 1;
  else s.chapter = Math.floor(s.tick / TOKOTON.CHAPTER_CYCLE_TICKS) % ACT1.CHAPTER_THEMES.length;
  if (s.tick > 0 && s.tick % TOKOTON.CHAPTER_CYCLE_TICKS === 0) {
    enterBonusTokoton(s);
    return;
  }
  trySpawn(s);
}

function enterBonusTokoton(s: GameState): void {
  enterBonus(s, BONUS.ROUNDS.length + 1, 'tokoton'); // 4회차+ = 100겹 반복
}

// ── 버터바 이벤트 스테이지 ──────────────────────────────────────
export function enterBonus(s: GameState, round: number, returnMode: 'act1' | 'tokoton' = 'act1'): void {
  const idx = Math.min(round, BONUS.ROUNDS.length) - 1;
  const queue = idx >= 0 && round <= BONUS.ROUNDS.length
    ? [...BONUS.ROUNDS[idx]]
    : [...BONUS.TOKOTON_ROUND];
  s.mode = 'bonus';
  s.bonus = {
    round,
    ticksLeft: BONUS.DURATION_TICKS,
    queue,
    destroyed: 0,
    total: queue.length,
    perfect: false,
    returnMode,
  };
  s.stack = null;
  s.stackSpawnCd = BONUS.BANNER_TICKS; // 배너 시간만큼 첫 스폰 지연
  s.events.push({ kind: 'bonusEnter', n: round });
}

function stepBonus(s: GameState): void {
  const b = s.bonus;
  if (!b) { s.mode = 'act1'; return; }
  b.ticksLeft -= 1;

  // 스폰
  if (!s.stack && b.queue.length > 0) {
    if (s.stackSpawnCd > 0) s.stackSpawnCd -= 1;
    else {
      const layers = b.queue.shift()!;
      spawnButterbar(s, layers);
      s.stackSpawnCd = BONUS.SPAWN_GAP;
    }
  }

  const done = (b.queue.length === 0 && !s.stack) || b.ticksLeft <= 0;
  if (done) {
    if (b.destroyed >= b.total) {
      b.perfect = true;
      addScore(s, SCORE.BUTTER_PERFECT);
      s.events.push({ kind: 'bonusPerfect' });
    }
    s.events.push({ kind: 'phaseClear', n: b.round });
    // 본편 복귀 — 진행도·게이지·콤보 유지 [설계]
    s.mode = b.returnMode;
    s.bonus = null;
    s.stack = null;
    s.stackSpawnCd = STACK.RESPAWN_TICKS;
  }
}
