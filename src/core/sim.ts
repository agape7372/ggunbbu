// 1틱 오케스트레이터 — 순서: 버퍼 수집 → 히트스톱 → 필살기 → 깔림 → 플레이어 →
// 스택 물리/접지 → 가드 바운스 → 공격 판정 → 모드 진행(스폰·챕터·보너스·막 전환).
// act2/보스 스테핑은 act2.ts/boss.ts (M4/M5)에서 이 파일에 연결된다.

import type { GameState, InputFrame } from './types';
import { makePlayer, stepPlayer, collectBuffers, guardActive, attackActive } from './player';
import { stackPhysics, stepStack, damageStack } from './building';
import { tryHitStack, tryGuardBounce, destroyStack, breakCombo, addScore } from './combat';
import { spawnAct1Building, spawnButterbar, chapterOf } from './spawner';
import { ACT1, BONUS, DEBRIS, GUARD_GAUGE, JUICE, PLAYER, SCORE, SPECIAL, STACK, TICK, TOKOTON, VIEW, WAZA_GAUGE } from '../config';
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
    peakCombo: 0,
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
    gimmick: 'none',
    waza: 'tenchi',
    tokotonCycle: 0,
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
  // 이번 틱에 발행되는 이벤트만 히트스톱 주입 대상 (advance 말미 참조)
  const evStart = s.events.length;

  // ── 필살기 발동 (게이지 100, 깔림 중에도 가능 [정본]) ──
  if (input.special && s.player.pose !== 'dead' && s.player.pose !== 'special') {
    if (s.wazaGauge < WAZA_GAUGE.COST || !hasSpecialTarget(s)) {
      // 조용한 무반응 금지 (08-30, D-5·P1-4): 게이지 부족·허공 발동은 거부음으로 알린다.
      // 허공(대상 0)에 게이지 100을 태우던 경로도 여기서 봉인 — 소모 없이 거부.
      s.events.push({ kind: 'guardDenied' });
    } else {
      triggerSpecial(s);
    }
  }

  // ── 깔림 상태 ──
  const wasAirborne = s.player.y > 0;
  if (s.player.pose === 'pinned') {
    stepPinned(s, input);
  } else {
    stepPlayer(s, input, TICK);
  }

  // 착지 순간의 깔림 검사. ★09-05 정정: 여기 있던 "점프 무적의 이면"은 사실이 아니다 —
  // **점프 무적 같은 건 없다**(08-30에 관통·공중무적 계약이 폐기됐다). 공중이 안전한 건
  // 무적이라서가 아니라 밑면 접촉·접지 판정이 지면에서만 성립하기 때문이다.
  // 실제 계약: 지면에 놓인(resting) 스택 위/옆에 착지하면 그때 깔린다. 단 무적(invulnTicks)
  // 중에는 이 검사를 통과한다 — 무적이 끝난 뒤 착지·재착지에서 다시 걸린다.
  if (s.player.y <= 0 && s.player.pose !== 'pinned' && s.player.pose !== 'dead'
    && s.stack?.resting && s.player.invulnTicks <= 0 && s.player.pose !== 'special'
    && s.mode !== 'bonus') {
    onPlayerCrushed(s);
  }

  // [정본] 화산탄 더미 위 착지 = 깔림 — 공중이면 무해, 착지 순간에만.
  // ★08-30: hurtPlayer 직행(피어싱 연쇄 피격)이던 것을 깔림 상태기계로 라우팅 —
  // 탈출 3분기(하/Z/X)가 그대로 적용된다. 더미 파밍(반복 타격 점수)은 불변.
  if (wasAirborne && s.player.y <= 0 && s.groundRocks > 0
    && s.player.pose !== 'pinned' && s.player.pose !== 'dead'
    && s.player.invulnTicks <= 0 && s.player.pose !== 'special'
    && s.mode !== 'bonus') {
    onPlayerCrushed(s);
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

  // ── 히트스톱 주입 (JUICE 테이블) ──
  // ★08-30: 렌더러가 s.hitstop을 쓰던 역방향 오염(P0-5)을 제거하고 core가 직접 주입한다.
  // 헤드리스 테스트와 브라우저가 같은 시뮬을 돌게 하는 조건 — 렌더는 읽기 전용.
  for (let i = evStart; i < s.events.length; i++) {
    const spec = JUICE[s.events[i].kind];
    if (spec && spec.hitstop > s.hitstop) s.hitstop = spec.hitstop;
  }

  // 최고 콤보 갱신. breakCombo 쪽에도 같은 캡처가 있다 — 한 틱 안에서 올랐다가 끊기는
  // 경우(타격 직후 피격)는 여기까지 못 오기 때문이다. 두 지점이 함께 있어야 빠짐이 없다.
  if (s.combo > s.peakCombo) s.peakCombo = s.combo;
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
/** 필살이 의미를 갖는 대상이 하나라도 있는가 — 없으면 발동 자체를 거부한다 (08-30, P1-4) */
function hasSpecialTarget(s: GameState): boolean {
  if (s.stack || s.boss || s.groundRocks > 0) return true;
  for (const e of s.entities) {
    if (e.kind === 'rock' || e.kind === 'bolt' || e.kind === 'shot') return true;
  }
  return false;
}

function triggerSpecial(s: GameState): void {
  const p = s.player;
  s.wazaGauge -= WAZA_GAUGE.COST;
  p.pose = 'special';
  p.poseTick = 0;
  p.invulnTicks = SPECIAL.IFRAMES;
  p.pinTick = 0;
  // 히트스톱은 'special' 이벤트를 advance 말미 JUICE 주입이 처리 — 이중 출처 금지 (08-30 검증)
  s.events.push({ kind: 'special', lane: p.lane });

  if (s.waza === 'tetsu') {
    applyTetsu(s);
  } else if (s.waza === 'ageba') {
    applyAgeba(s);
  } else {
    applyTenchi(s);
  }

  // 철벽은 방패만 — 건물·화산탄을 지우지 않는다.
  if (s.waza !== 'tetsu') {
    let cleared = 0;
    s.entities = s.entities.filter((e) => {
      if (e.kind === 'rock') { cleared += 1; return false; }
      return true;
    });
    cleared += s.groundRocks;
    s.groundRocks = 0;
    if (cleared > 0) addScore(s, cleared * SCORE.FLOOR_BONUS);
  }
  if (s.boss) specialHitBoss(s);
}

function applyTetsu(s: GameState): void {
  const stack = s.stack;
  if (!stack) return;
  stack.resting = false;
  stack.vy = Math.max(stack.vy, SPECIAL.TETSU_V);
  stack.y = Math.max(stack.y, 0.001);
}

function applyAgeba(s: GameState): void {
  const stack = s.stack;
  const p = s.player;
  if (!stack) return;
  if (stack.specialImmune) {
    applyImmuneChip(s);
    return;
  }
  const lo = p.y - 8;
  const hi = p.y + VIEW.FLOOR_H * SPECIAL.AGEBA_FLOORS;
  // ★08-30(P1-4): 기존 `if (res==='hit') break`는 HP2/3 층을 만나면 1대미지로 종료 —
  // AGEBA_FLOORS(6)가 도달 불가라 80궤도 해금이 기본기(천지)보다 약했다.
  // 올려베기 = 밴드 안 층을 최대 6층 붕괴할 때까지 연속 타격 + 강한 띄움(파밍 유지가 니치).
  let destroyed = 0;
  let iter = 24; // HP3×6층 안전 상한
  while (iter-- > 0 && destroyed < SPECIAL.AGEBA_FLOORS && s.stack && s.stack.floors.length > 0) {
    const st = s.stack;
    const yHit = st.y;
    const mat = st.floors[0]?.mat;
    const res = damageStack(st, p.lane, lo, hi, 1);
    if (res === 'miss') break;
    if (res === 'collapse') {
      destroyed += 1;
      s.events.push({ kind: 'floorCollapse', mat, y: yHit });
      addScore(s, SCORE.FLOOR_BONUS);
      if (st.floors.length === 0) {
        destroyStack(s);
        break;
      }
    }
    st.vy = Math.max(st.vy, STACK.GUARD_GROUND_V);
    st.resting = false;
  }
}

function applyTenchi(s: GameState): void {
  const stack = s.stack;
  if (!stack) return;
  if (stack.specialImmune) {
    applyImmuneChip(s);
    return;
  }
  addScore(s, stack.floors.length * SCORE.FLOOR_BONUS);
  destroyStack(s);
}

function applyImmuneChip(s: GameState): void {
  const stack = s.stack;
  const p = s.player;
  if (!stack) return;
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
}

// ── 깔림 ────────────────────────────────────────────────────────
function stepPinned(s: GameState, input: InputFrame): void {
  const p = s.player;
  const stack = s.stack;
  const byStack = !!(stack && stack.resting);
  // ★08-30: 화산탄 더미 깔림도 같은 상태기계를 탄다 (sim 착지 검사에서 진입)
  const byRocks = !byStack && s.groundRocks > 0;
  if (!byStack && !byRocks) {
    // 깔림 원인이 사라졌으면 자동 해방
    p.pose = 'idle';
    p.poseTick = 0;
    return;
  }

  // 방치 페널티: 120f마다 라이프 반복 손실 + **자비 바운스**
  //
  // ★08-30 4차 [사용자 증언] — 원작은 깔린 채로 정지해 있지 않다:
  //   "라이프 깎이면서 바닥에 퉁 하고 살짝 떴다가, 못 막거나 못 부수면 다시 쿵 하고 또 깔리면서
  //    라이프 깎이는데 여기선 없네."
  // 실측(사용자 영상 10fps 계측): 2차 깔림 구간 2.0초 동안 건물 상단 y가 337에 고정 — 1px도 안
  // 움직이고 그대로 사망했다. 그 2.0초 = PIN_REPEAT_TICKS 120f. **손실은 돌고 있는데 화면에
  // 아무 일도 안 일어났다.** 빠진 건 라이프 로직이 아니라 그 손실이 만들어야 할 물리·연출이다.
  //
  // 계획 정본 §깔림도 "이후 120f 경과마다 lives−1 반복"을 규정하고, ROADMAP Wave 1의
  // "방치 사망 템포 재검(PIN_REPEAT 120f)"이 미완으로 남아 있었다 — 새 설계가 아니라 그 이행이다.
  // ⚠ 단 ORIGINAL_BENCHMARK에는 깔림 라이프·튕김의 원작 실측이 **없다**. 근거는 사용자 증언과
  // 계획서(나무위키 유래)뿐이라 [정본] 딱지를 붙이지 않는다.
  //
  // 값은 Z 실패 분기와 같은 PIN_MERCY_V를 쓴다 — 결과가 같으면("라이프 깎고 튕김") 값도 같아야 한다.
  // "쿵"(재깔림)은 새 코드가 없다: 튕긴 스택이 다시 내려앉으면 sim 루프의 매 틱 착지 검사가
  // onPlayerCrushed로 받는다. 사이클이 기존 물리에서 저절로 닫힌다.
  p.pinTick += 1;
  if (p.pinTick >= PLAYER.PIN_REPEAT_TICKS) {
    p.pinTick = 0;
    loseLife(s);
    if (s.over) return;
    s.events.push({ kind: 'hurt', y: 0 }); // 화면·진동·둔탁음 — lifeLost 단독은 JUICE 항목이 없다
    if (byStack && stack) {
      // 돌더미 깔림(byRocks)은 튕길 대상이 없다 — 이벤트만 내고 깔린 채로 둔다.
      stack.vy = STACK.PIN_MERCY_V;
      stack.resting = false;
      stack.y = Math.max(stack.y, 0.001);
      p.pose = 'idle';
      p.poseTick = 0;
      // ★탈출 무적(60/90f)을 쓰면 안 된다 — 스택 왕복(≈47f)보다 길어서 "쿵"이 영영 안 온다.
      p.invulnTicks = PLAYER.PIN_TIMEOUT_IFRAMES;
      return; // 방금 풀려났다 — 이번 틱은 탈출 입력을 먹지 않는다
    }
  }

  if (byRocks) {
    stepPinnedByRocks(s, input);
    return;
  }
  if (!stack) return; // byStack 보장 — 타입 내로잉용

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

/** 화산탄 더미 깔림 — 하: 몸만 빼냄(무상) / Z: 최상단 돌 파괴 후 탈출 / X: 필살(전역 처리) */
function stepPinnedByRocks(s: GameState, input: InputFrame): void {
  const p = s.player;
  if (input.guard || p.bufGuard > 0) {
    p.bufGuard = 0;
    p.pose = 'idle';
    p.poseTick = 0;
    p.invulnTicks = PLAYER.PIN_ESCAPE_IFRAMES_LIFT;
    s.events.push({ kind: 'guardBounce', y: 0 });
    return;
  }
  if (p.bufAttack > 0) {
    p.bufAttack = 0;
    s.groundRocks = Math.max(0, s.groundRocks - 1);
    s.events.push({ kind: 'floorCollapse', y: 0 });
    addScore(s, SCORE.FLOOR_BONUS);
    p.pose = 'idle';
    p.poseTick = 0;
    p.invulnTicks = PLAYER.PIN_ESCAPE_IFRAMES_ATK;
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

  // ★09-05 정정: 여기 붙어 있던 정본 딱지("점프 중에는 짓눌리지 않음")를 뗀다 —
  // 08-30에 **밑면이 덮으면 같이 눌린다**로 뒤집힌 계약이다(docs/ROADMAP_2026-08-30.md §밑면 접촉,
  // player.ts contactWithStack ②분기). 접지 틱에 공중이면 이 경로가 안 받을 뿐, 그 전에
  // 밑면에 눌려 지면까지 내려와 있으면 여기서 깔린다.
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
  // ★09-05: 진입 시 입력 버퍼를 비운다 — **깔림은 새 입력으로만 탈출한다.**
  // 깔리기 직전에 눌렀다 뗀 Z가 첫 pinned 틱에 탈출 시도로 소비되고, 고HP층이면 라이프를
  // 한 장 더 먹었다(stepPinned의 Z 실패 분기). 버퍼는 pinned/히트스톱 동안 감쇠하지 않아
  // (stepPlayer가 안 돌므로) 한 번 남으면 그대로 살아 있다.
  // ⚠ "버퍼 감쇠"로는 못 고친다 — advance 초입 collectBuffers가 pinned 분기보다 앞이라
  // 홀드·연타 중이면 매 틱 재장전된다. 진입 시 1회 클리어가 유일하게 유효한 지점이다.
  s.player.bufAttack = 0;
  s.player.bufJump = 0;
  s.player.bufGuard = 0;
  s.events.push({ kind: 'hurt' });
}

/** 광고 부활 등 — 콤보·점수 유지, 라이프 1, 짧은 무적. 씬이 over===gameover 일 때 호출. */
export function grantMercyLife(s: GameState): void {
  s.over = null;
  s.lives = 1;
  const p = s.player;
  p.pose = 'idle';
  p.poseTick = 0;
  p.y = Math.max(p.y, 0.001);
  p.vy = 0;
  p.invulnTicks = PLAYER.HIT_IFRAMES;
  p.pinTick = 0;
  const stack = s.stack;
  if (stack?.resting) {
    stack.resting = false;
    stack.vy = Math.max(stack.vy, STACK.PIN_ESCAPE_V);
    stack.y = Math.max(stack.y, 0.001);
  }
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
  // ★08-30: `tick % CYCLE === 0` 정확 일치는 경계 틱이 히트스톱에 삼켜지면 그 사이클의
  // 버터바가 통째로 소실됐다(검증 실측, 시드 18). 사이클 인덱스 비교로 스킵 내성 확보.
  const cyc = Math.floor(s.tick / TOKOTON.CHAPTER_CYCLE_TICKS);
  if (cyc > s.tokotonCycle) {
    s.tokotonCycle = cyc;
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
