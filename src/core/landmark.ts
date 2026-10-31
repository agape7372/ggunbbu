// 명물 보스 넷 — 종탑 · 바람탑 · 구층탑 · 타워크레인. 정본 = docs/STAGES_2026-10-31.md §6.
// 명물은 건물이다. 체력 = 몸의 층(lm.body). 던지는 것(종 · 좌판 · 짐)과 구층탑 자체는 s.stack이라
// 베기 · 가드 · 깔림 · 밑면 접촉 규칙을 그대로 받는다. 이 파일은 그 위에 「언제 무엇을 던지나」와
// 「던진 것이 몸에 닿으면」만 얹는다.
// 공통 창: 몸이 내려앉아(sit) 밑면이 머리 높이에 오면 벤다. 창 길이 = LANDMARK.SIT_TICKS[난이도].
// 난수 없음 — 순서가 고정이라 공략이 그대로 통한다.

import type { FallingStack, Floor, GameState, LandmarkId, LandmarkSt, LandmarkState, Material } from './types';
import { LANDMARK, PLAYER, SCORE, SPECIAL, STAGE, VIEW, WEAPON, GUARD_GAUGE } from '../config';
import { makeFloor, makeStack } from './building';
import { addScore, attackRange, breakCombo, hurtPlayer, registerHit } from './combat';
import { guardActive } from './player';

const L = LANDMARK;
const MAT: Readonly<Record<string, Material>> = { w: 'weak', m: 'mid', h: 'hard' };

function floorsOf(n: number, hp: number, mat: Material): Floor[] {
  return Array.from({ length: n }, () => {
    const f = makeFloor(mat);
    f.segs[0] = { hp, maxHp: hp };
    return f;
  });
}

function stackH(floors: readonly Floor[]): number {
  let h = 0;
  for (const f of floors) h += f.h;
  return h;
}

function setSt(lm: LandmarkState, st: LandmarkSt): void {
  lm.st = st;
  lm.t = 0;
}

function diffOf(s: GameState): 0 | 1 | 2 {
  return s.stage?.diff ?? 1;
}

export function initLandmark(s: GameState, id: LandmarkId): void {
  s.stack = null;
  s.stackSpawnCd = 0;
  const lm: LandmarkState = {
    id, st: 'enter', t: 0, body: null, wave: 0, n: 0, got: 0, cue: 0, air: 0, k: 0, flying: false, x: 0,
  };
  const top = VIEW.H + 40;
  if (id === 'bell') lm.body = { floors: floorsOf(L.BELL.FLOORS, L.BELL.HP, 'hard'), y: top };
  else if (id === 'wind') lm.body = { floors: floorsOf(L.WIND.FLOORS, L.WIND.HP, 'mid'), y: top };
  else if (id === 'crane') lm.body = { floors: floorsOf(L.CRANE.FLOORS, L.CRANE.HP, 'hard'), y: top };
  else {
    s.stack = makeStack({
      variant: 'building', theme: 'eastasia', floors: floorsOf(L.PAGODA.FLOORS, L.PAGODA.HP, 'hard'),
      specialImmune: true, y: L.PAGODA.ENTER_FROM, vy: 0,
    });
    hold(s);
  }
  s.lm = lm;
}

/** 던진 것을 물리에서 뺀다(갈고리 · 등장 중) — stepStack이 g 0 · vterm 0이면 제자리다 */
function hold(s: GameState): void {
  s.stage!.fallG = 0;
  s.stage!.fallV = 0;
}

function hoverOf(id: LandmarkId): number {
  return id === 'bell' ? L.BELL.HOVER_Y : id === 'wind' ? L.WIND.HOVER_Y : id === 'crane' ? L.CRANE.HOVER_Y : 0;
}

/** 막(1 · 2 · 3) = 남은 층으로 정한다(LANDMARK.ACT). 구층탑은 몸이 s.stack이다 */
export function lmAct(s: GameState): 1 | 2 | 3 {
  const lm = s.lm;
  if (!lm) return 1;
  const floors = lm.body ? lm.body.floors.length : (s.stack?.floors.length ?? 0);
  const [a2, a3] = L.ACT[lm.id];
  return floors <= a3 ? 3 : floors <= a2 ? 2 : 1;
}

function moveBody(lm: LandmarkState, target: number): void {
  if (lm.body) lm.body.y += (target - lm.body.y) * L.EASE;
}

export function stepLandmark(s: GameState, evStart: number): void {
  const lm = s.lm;
  if (!lm) return;
  lm.t += 1;
  if (lm.st === 'down') { stepDown(s, lm, evStart); return; }
  if (lm.st === 'enter') { stepEnter(s, lm); return; }
  if (lm.id === 'bell') stepBell(s, lm, evStart);
  else if (lm.id === 'wind') stepWind(s, lm, evStart);
  else if (lm.id === 'pagoda') stepPagoda(s, lm, evStart);
  else stepCrane(s, lm, evStart);
}

/** 쓰러진 뒤 — 숨은 막(종탑 13시 · 바람탑 장터)이 남아 있으면 끝을 늦춘다. 끝 = 연출 시간이 지나고 판이 비었을 때 */
function stepDown(s: GameState, lm: LandmarkState, evStart: number): void {
  if (lm.id === 'bell') stepBell13(s, lm, evStart);
  else if (lm.id === 'wind') stepMarket(s, lm);
  if (lm.t >= L.DOWN_MAX || (lm.t >= L.DOWN_TICKS && !s.stack)) s.over = 'cleared';
}

function stepEnter(s: GameState, lm: LandmarkState): void {
  if (lm.body) moveBody(lm, hoverOf(lm.id));
  else if (s.stack) s.stack.y += (L.PAGODA.START_Y - s.stack.y) * L.EASE;
  if (lm.t < L.ENTER_TICKS) return;
  setSt(lm, 'play');
  const st = s.stage!;
  if (lm.id === 'pagoda') {
    st.fallG = L.PAGODA.G;
    st.fallV = pagodaFall(s);
    lm.air = L.PAGODA.CHIME_EVERY;
    lm.n = s.stack?.floors.length ?? 0;
    lm.k = -L.PAGODA.MERGE_TICKS;
  } else if (lm.id === 'bell') {
    lm.cue = bellTell(s, lm);
  } else if (lm.id === 'wind') {
    const song = windSong(s);
    lm.wave = 0;
    lm.air = song[0][0];
    lm.cue = song[0][1] * STAGE.BEAT;
    s.stackSpawnCd = L.WIND.STALL_GAP;
  } else {
    s.stackSpawnCd = L.CRANE.NEXT_GAP;
  }
}

/** 창(sit) · 올라가기(rise). 처리했으면 true — 그 틱엔 던지지 않는다 */
function stepSitRise(s: GameState, lm: LandmarkState): boolean {
  if (lm.st === 'sit') {
    // 크레인 반창(첫 걸림)은 낮게 못 내려오고 짧다. 바람탑 마지막 숨은 들숨에 밑면이 높다
    const half = lm.id === 'crane' && lm.cue === 2;
    const breath = lm.id === 'wind' && lmAct(s) === 3 && lm.air === 0;
    moveBody(lm, half ? L.CRANE.HALF_Y : breath ? L.SIT_Y + L.WIND.BREATH_SIT_DY : L.SIT_Y);
    if (lm.t >= (half ? L.CRANE.HALF_TICKS : L.SIT_TICKS[diffOf(s)])) {
      setSt(lm, 'rise');
      if (half) lm.cue = 1; // 걸어 둔 채 올라간다 — 다음 짐이 온창
    }
    return true;
  }
  if (lm.st === 'rise') {
    moveBody(lm, hoverOf(lm.id));
    if (lm.t >= L.RISE_TICKS) setSt(lm, 'play');
    return true;
  }
  return false;
}

/** 던진 것이 올라가다 몸 밑면에 닿았나 */
function reachedBody(s: GameState, lm: LandmarkState): boolean {
  const st = s.stack;
  const b = lm.body;
  if (!st || !b || st.vy <= 0) return false;
  return st.y + stackH(st.floors) >= b.y;
}

/** 꽂힘 — 던진 것이 몸에 박혀 사라진다 */
function impact(s: GameState, lm: LandmarkState): void {
  s.stack = null;
  lm.flying = false;
  s.events.push({ kind: 'bossHit', y: lm.body?.y ?? 0 });
}

// ── 몸 베기 ─────────────────────────────────────────────────────

/** 창에 앉은 몸의 밑면이 사거리 안이면 벤다. act2.tryHitAct2Targets가 보스 자리에서 부른다 */
export function tryHitLandmark(s: GameState): boolean {
  const lm = s.lm;
  const b = lm?.body;
  if (!lm || !b || lm.st !== 'sit' || b.floors.length === 0) return false;
  const [lo, hi] = attackRange(s.player.y, WEAPON[s.weapon].reach);
  if (b.y < lo || b.y > hi) return false;
  const mat = b.floors[0].mat;
  if (damageBody(s, lm, 1)) {
    s.events.push({ kind: 'floorCollapse', y: b.y, mat, combo: s.combo + 1 });
    registerHit(s, { scoreBonus: SCORE.FLOOR_BONUS });
  } else {
    s.events.push({ kind: 'hit', y: b.y, mat, combo: s.combo + 1 });
    registerHit(s);
  }
  return true;
}

/** 필살 — 창에 앉은 몸엔 집행기와 같은 10. 크레인 짐에 철벽이면 바로 걸린다 */
export function specialHitLandmark(s: GameState): void {
  const lm = s.lm;
  if (!lm || lm.st === 'down') return;
  if (lm.id === 'crane' && s.waza === 'tetsu' && s.stack && lm.air === 1) {
    // 철벽 즉시 걸기 — 미끄러진 걸림이라 창이 짧고, 두 번 걸기 셈은 건너뛴다
    impact(s, lm);
    setSt(lm, 'sit');
    lm.t = L.SIT_TICKS[diffOf(s)] - L.CRANE.TETSU_SIT;
    lm.cue = 0;
    lm.n = 2;
    s.stackSpawnCd = L.CRANE.NEXT_GAP;
    return;
  }
  const b = lm.body;
  if (!b || lm.st !== 'sit' || b.floors.length === 0) return;
  const mat = b.floors[0].mat;
  if (damageBody(s, lm, SPECIAL.MOON_DMG)) s.events.push({ kind: 'floorCollapse', y: b.y, mat });
  else s.events.push({ kind: 'bossHit', y: b.y });
}

/** 몸 최하층에 대미지. 층이 무너지면 true(다 무너지면 쓰러뜨린다) */
function damageBody(s: GameState, lm: LandmarkState, dmg: number): boolean {
  const b = lm.body!;
  const f = b.floors[0];
  f.segs[0].hp -= dmg;
  if (f.segs[0].hp > 0) return false;
  b.floors.shift();
  if (b.floors.length === 0) defeat(s, lm);
  else if (lm.st === 'sit') { // 한 창에 한 층 — 층이 무너지면 창을 끝내고 올라간다(넘친 피해 없음)
    setSt(lm, 'rise');
    if (lm.id === 'crane' && lm.cue === 2) lm.cue = 1;
  }
  return true;
}

function defeat(s: GameState, lm: LandmarkState): void {
  setSt(lm, 'down');
  s.stack = null;
  s.stackSpawnCd = 0;
  // 남은 기와 · 화산탄은 무해한 잔해로 — 쓰러진 뒤엔 아무도 안 다친다
  for (const e of s.entities) if (e.kind === 'rock') e.remnant = true;
  addScore(s, SCORE.BOSS_BONUS);
  s.events.push({ kind: 'bossDefeat' });
}

// ── 종탑: 지면 가드는 공격이다 ──────────────────────────────────

function bellTell(s: GameState, lm: LandmarkState): number {
  const d = diffOf(s);
  if (d === 2 && L.BELL.HOURS[lm.wave] === 12) return L.BELL.TELL_OUTSOURCE_12;
  return L.BELL.TELL[lm.wave] + (d === 0 ? 12 : 0);
}

function stepBell(s: GameState, lm: LandmarkState, evStart: number): void {
  const B = L.BELL;
  const t = s.stage!.tally;
  const d = diffOf(s);
  const act = lmAct(s);
  const isBell = s.stack?.floors[0]?.mat === 'bell';
  for (let i = evStart; i < s.events.length; i++) {
    const e = s.events[i];
    if (e.kind === 'hit' && e.mat === 'bell') t.bellCuts += 1;
    // 마지막 가드가 정한다 — 공중 가드로 올린 종은 꽂히면 2점
    else if (isBell && e.kind === 'guardAirBounce') lm.flying = true;
    else if (isBell && e.kind === 'guardBounce') lm.flying = false;
  }
  if (stepSitRise(s, lm)) return;
  if (lm.st === 'slam') { stepSlam(s, lm); return; }
  moveBody(lm, B.HOVER_Y);
  lm.k += 1; // 파 시작부터 센 틱(정각)
  if (act === 3 && lm.wave !== B.ACT3_WAVE) { lm.wave = B.ACT3_WAVE; lm.cue = bellTell(s, lm); } // 시보: 12시 고정
  const hours = B.HOURS[lm.wave];
  if (s.stack) {
    if (reachedBody(s, lm)) {
      const pts = lm.flying ? B.AIR_POINTS : 1;
      impact(s, lm);
      lm.got += pts;
      if (act === 3) {
        // 시보: 꽂은 점수가 곧 최하층 대미지
        const mat = lm.body!.floors[0].mat;
        const y = lm.body!.y;
        if (damageBody(s, lm, pts)) s.events.push({ kind: 'floorCollapse', y, mat });
        if (lm.st === 'down' && lm.n === hours && d >= 1) lm.x = 1; // 열두 번째 종으로 쓰러뜨렸다 — 13시
      }
    }
    return;
  }
  // 1 · 2막은 점수가 종 수에 닿으면 남은 종을 안 떨어뜨리고 끝낸다. 시보엔 조기 종료가 없다
  if (lm.n >= hours || (act < 3 && lm.got >= hours)) {
    // 파 끝 — 절반 이상 꽂았으면 내려앉고, 모자라면 내려찍는다. 시계는 어느 쪽이든 간다. 시보는 앉지 않는다
    const ok = act < 3 && lm.got * 2 >= hours;
    lm.wave = act === 3 ? B.ACT3_WAVE : (lm.wave + 1) % B.HOURS.length;
    lm.n = 0;
    lm.got = 0;
    lm.air = 0;
    lm.k = 0;
    setSt(lm, ok ? 'sit' : 'slam');
    lm.cue = bellTell(s, lm);
    return;
  }
  if (lm.cue > 0) { lm.cue -= 1; return; }
  // 댕 — 탑 밑에서 종 하나가 빠진다. 정각(2막 정규 · 외주): 늦으면 남은 종이 한 덩이로 온다
  const b = lm.body!;
  const left = hours - lm.n;
  const block = act === 2 && d >= 1 && lm.k >= hours * B.BLOCK_PACE && left >= 2;
  const floors = floorsOf(block ? left : 1, 999, 'bell');
  const fall = STAGE.DIFF[d].fall;
  s.stack = makeStack({
    variant: 'building', theme: 'europe', floors, specialImmune: true,
    y: block ? Math.max(b.y - stackH(floors), 200) : b.y - VIEW.FLOOR_H, vy: 0,
  });
  s.stage!.fallG = B.G * fall;
  s.stage!.fallV = B.VTERM * fall;
  s.events.push({ kind: 'boltCue', lane: 0 });
  lm.n += block ? left : 1;
  lm.flying = false;
  lm.cue = bellTell(s, lm);
}

/** 내려찍기 — 땅에서 가드하면 막는다(콤보는 끊긴다). 몸 높이 안에 있으면 맞는다 */
function stepSlam(s: GameState, lm: LandmarkState): void {
  const b = lm.body!;
  b.y = Math.max(0, b.y - L.BELL.HOVER_Y / L.BELL.SLAM_TICKS);
  if (lm.air === 0 && b.y <= PLAYER.H) {
    lm.air = 1;
    const p = s.player;
    if (p.y <= 0 && guardActive(p) === 'ground') {
      lm.air = 2; // 막았다 — 땅에 닿은 몸이 반격 창에 머문다
      s.guardGauge = Math.max(0, s.guardGauge - GUARD_GAUGE.BOUNCE_COST_GROUND);
      s.guardRegenCd = GUARD_GAUGE.REGEN_DELAY_TICKS;
      breakCombo(s);
      s.events.push({ kind: 'guardBounce', y: 0 });
    } else if (p.y < L.BELL.SLAM_HIT_H) {
      hurtPlayer(s);
    }
  }
  if (b.y <= 0) {
    if (lm.air === 2) {
      const d = diffOf(s);
      setSt(lm, 'sit');
      lm.t = L.SIT_TICKS[d] - L.COUNTER_TICKS[d];
    } else {
      setSt(lm, 'rise');
    }
  }
}

/** 13시 — 열두 번째 종으로 쓰러뜨린 뒤 화면 꼭대기에서 종 하나가 똑딱 없이 온다. 가드로 받으면 숨은 막 */
function stepBell13(s: GameState, lm: LandmarkState, evStart: number): void {
  const B = L.BELL;
  if (lm.x === 1 && lm.t === B.BELL13_T) {
    const fall = STAGE.DIFF[diffOf(s)].fall;
    s.stack = makeStack({
      variant: 'building', theme: 'europe', floors: floorsOf(1, 999, 'bell'), specialImmune: true, y: VIEW.H, vy: 0,
    });
    s.stage!.fallG = B.G * fall;
    s.stage!.fallV = B.VTERM * fall;
    lm.x = 2;
    return;
  }
  if (lm.x !== 2 || !s.stack) return;
  for (let i = evStart; i < s.events.length; i++) {
    const k = s.events[i].kind;
    if (k === 'guardBounce' || k === 'guardAirBounce') s.stage!.tally.bell13 = true;
  }
  if (s.stack.y > VIEW.H + 200) s.stack = null; // 위로 날아가 버렸다
}

// ── 바람탑: 콤보를 언제 버리나 ──────────────────────────────────

function windSong(s: GameState): readonly (readonly [number, number])[] {
  return diffOf(s) === 2 ? L.WIND.SONG_OUTSOURCE : L.WIND.SONG;
}

/** 다음 숨이 바뀌기까지 남은 틱 — 깃발 · 휘파람 예고가 읽는다 */
export function windBreathLeft(s: GameState): number {
  return s.lm?.id === 'wind' ? s.lm.cue : 0;
}

function stepWind(s: GameState, lm: LandmarkState, evStart: number): void {
  const W = L.WIND;
  const st = s.stage!;
  const d = diffOf(s);
  const act = lmAct(s);
  // 숨은 노래를 따라 바뀐다 — 창 중에도 노래는 계속 간다
  lm.cue -= 1;
  if (lm.cue <= 0) {
    const song = windSong(s);
    lm.wave = (lm.wave + 1) % song.length;
    lm.air = song[lm.wave][0];
    lm.cue = song[lm.wave][1] * STAGE.BEAT;
  }
  // 맞바람(x > 0)은 튕겨 나온 좌판이 날숨을 타는 시간이다
  const breath = lm.air === 1 || lm.x > 0 ? W.OUT : W.IN;
  const fall = STAGE.DIFF[d].fall;
  st.fallG = lm.flying ? 0 : (STAGE.G[0] + (STAGE.G[1] - STAGE.G[0]) * W.SPEED) * breath.g * fall;
  st.fallV = (STAGE.VTERM[0] + (STAGE.VTERM[1] - STAGE.VTERM[0]) * W.SPEED) * breath.v * fall;
  st.liftMul = breath.lift;
  if (lm.st === 'play' && lm.x > 0) lm.x -= 1;

  const t = st.tally;
  for (let i = evStart; i < s.events.length; i++) {
    const e = s.events[i];
    if (lm.st === 'play' && s.stack && (e.kind === 'hit' || e.kind === 'floorCollapse')) t.stallCuts += 1;
    if ((e.kind !== 'guardBounce' && e.kind !== 'guardAirBounce') || !s.stack || lm.k < 0) continue; // 젖은 좌판은 셈이 멈춘다
    const light = lm.k >= W.LIGHT[d]; // 가벼운 좌판 — 이만큼 띄운 좌판의 다음 가드
    lm.k += 1;
    if (lm.k >= W.STALL7) t.stall7 = true;
    // 역풍 — 가벼운 좌판은 어느 가드든, 아니면 날숨 · 맞바람 중 땅에서 받을 때 바람이 좌판을 탑까지 밀어 올린다
    if (light || (e.kind === 'guardBounce' && (lm.air === 1 || lm.x > 0))) {
      lm.flying = true;
      s.stack.vy = W.BLOW_V;
      st.fallG = 0;
    }
  }

  if (stepSitRise(s, lm)) return;
  moveBody(lm, W.HOVER_Y);
  if (s.stack) {
    if (s.stack.resting) { lm.k = d === 2 ? -1 : 0; lm.x = 0; } // 땅에 닿았다 — 일곱 번 셈은 처음부터(외주는 젖는다)
    if (reachedBody(s, lm)) {
      if (lm.flying) { impact(s, lm); setSt(lm, 'sit'); s.stackSpawnCd = W.STALL_GAP; }
      else {
        s.stack.vy = L.DEFLECT_V; // 들숨에 띄운 좌판은 탑에 튕겨 나온다
        if (act >= 2 && d >= 1) lm.x = W.RETURN_TICKS; // 맞바람 — 돌아오는 좌판이 날숨을 탄다
      }
    }
    return;
  }
  if (s.stackSpawnCd > 0) { s.stackSpawnCd -= 1; return; }
  const kinds = W.STALLS[lm.n % W.STALLS.length];
  const floors = [...kinds].map((c) => makeFloor(MAT[c]));
  s.stack = makeStack({ variant: 'building', theme: 'asia', floors, y: lm.body!.y - stackH(floors), vy: 0 });
  lm.n += 1;
  lm.k = 0;
  lm.x = 0;
  lm.flying = false;
}

/** 장터 — 좌판을 한 번도 안 베고 쓰러뜨리면 좌판 여섯이 한 건물로 머리 위까지 둥실 내려온다(땅에 안 닿는다) */
function stepMarket(s: GameState, lm: LandmarkState): void {
  const W = L.WIND;
  const st = s.stage!;
  if (lm.t === L.BELL.BELL13_T && lm.got === 0 && st.tally.stallCuts === 0 && diffOf(s) >= 1) {
    const floors = W.STALLS.flatMap((kinds) => [...kinds].map((c) => makeFloor(MAT[c])));
    s.stack = makeStack({ variant: 'building', theme: 'asia', floors, y: W.HOVER_Y, vy: 0 });
    st.fallG = W.MARKET_G;
    st.fallV = W.MARKET_V;
    st.liftMul = 1;
    lm.got = 1;
    st.tally.market = true;
  }
  const stk = s.stack;
  if (lm.got === 1 && stk && stk.y < L.SIT_Y) { stk.y = L.SIT_Y; stk.vy = Math.max(stk.vy, 0); }
}

// ── 구층탑: 욕심과 청소 ─────────────────────────────────────────

/** 탑이 내려오는 기준 속도 — 막과 상관없이 난이도가 정한다(외주 ×1.2) */
function pagodaFall(s: GameState): number {
  return diffOf(s) === 2 ? L.PAGODA.VTERM_OUTSOURCE : L.PAGODA.VTERM * STAGE.DIFF[diffOf(s)].fall;
}

/** 기와가 탑 밑에서 쏟아진다 */
function rainTiles(s: GameState, stk: FallingStack, n: number): void {
  for (let j = 0; j < n; j++) {
    s.entities.push({ kind: 'rock', lane: 0, y: stk.y + 10 + j * L.PAGODA.TILE_SPACING, vy: 0, hp: 1 });
  }
  if (n > 0) s.events.push({ kind: 'boltCue', lane: 0 });
}

function stepPagoda(s: GameState, lm: LandmarkState, evStart: number): void {
  const P = L.PAGODA;
  const d = diffOf(s);
  const act = lmAct(s);
  const t = s.stage!.tally;
  const stk = s.stack;
  // 풍경이 울린 직후의 한 타는 세 배 — 이번 틱에 탑을 벤 이벤트가 있으면 남은 두 배를 더 깎는다
  let hitTower = false;
  let cutDown = false; // 이번 베기가 이미 한 층을 무너뜨렸다 — 덤은 다음 층으로 넘치지 않는다
  for (let i = evStart; i < s.events.length; i++) {
    const e = s.events[i];
    if ((e.kind === 'hit' || e.kind === 'floorCollapse') && e.mat === 'hard') hitTower = true;
    if (e.kind === 'floorCollapse' && e.mat === 'hard') cutDown = true;
  }
  const chimed = hitTower && lm.cue > 0; // 풍경 창에서 벤 타격
  if (!stk) { // 아홉 층을 다 베었다
    if (chimed && d >= 1) t.chimeBreaks += 1; // 아홉 번은 정규 · 외주만
    defeat(s, lm);
    return;
  }
  if (chimed && stk.floors.length > 0) {
    lm.cue = 0;
    const f = stk.floors[0];
    if (!cutDown) f.segs[0].hp -= P.CHIME_MUL - 1;
    if (f.segs[0].hp <= 0) {
      stk.floors.shift();
      s.events.push({ kind: 'floorCollapse', y: stk.y, mat: f.mat });
      addScore(s, SCORE.FLOOR_BONUS);
    }
  }
  // 층이 깨졌다 → 기와 비. 직전에 깨진 지 MERGE_TICKS 안이면 이어진 것이라 비가 안 온다(이어 허물기)
  const broke = lm.n - stk.floors.length;
  if (chimed && d >= 1) t.chimeBreaks += broke;
  if (stk.floors.length === 0) { defeat(s, lm); return; }
  for (let i = 0; i < broke; i++) {
    const nth = P.FLOORS - (lm.n - i); // 0부터 — 몇 번째로 깨진 층인가
    lm.x = s.tick - lm.k <= P.MERGE_TICKS ? lm.x + 1 : 1;
    lm.k = s.tick;
    if (lm.x === 1) rainTiles(s, stk, P.TILES[Math.min(nth, P.TILES.length - 1)]);
    else if (lm.x === P.CHAIN_CLEAR) {
      // 셋째 층까지 이었다 — 떠 있던 기와가 부서진다
      for (const e of s.entities) {
        if (e.kind === 'rock' && !e.remnant) { e.remnant = true; s.events.push({ kind: 'floorCollapse', y: e.y }); }
      }
    }
  }
  lm.n = stk.floors.length;
  // 2막 당김 — 땅의 더미 하나마다 탑이 한 배씩 빨리 내려온다
  if (act >= 2 && d >= 1) s.stage!.fallV = pagodaFall(s) * (1 + s.groundRocks);
  // 크게 떠오르기 시작하면 흔들려 기와가 쏟아진다(베기 띄움은 아니다)
  if (d >= 1) {
    const rising = stk.vy > P.LIFT_V;
    if (rising && !lm.flying) rainTiles(s, stk, P.LIFT_TILES[d]);
    lm.flying = rising;
  }
  // 풍경 기와 — 3막 정규에선 딸랑 뒤 6틱에 기와 둘이 따라온다
  if (lm.got > 0) {
    lm.got -= 1;
    if (lm.got === 0) rainTiles(s, stk, P.CHIME_TILES);
  }
  // 풍경 — 외주에선 안 울린다
  if (lm.cue > 0) lm.cue -= 1;
  lm.air -= 1;
  if (lm.air <= 0) {
    lm.air = P.CHIME_EVERY;
    if (d !== 2) {
      lm.cue = P.CHIME_WINDOW;
      if (act === 3 && d === 1) lm.got = P.CHIME_TILE_DELAY;
    }
  }
}

// ── 타워크레인: 베기는 밀기다 ───────────────────────────────────

function stepCrane(s: GameState, lm: LandmarkState, evStart: number): void {
  const C = L.CRANE;
  const st = s.stage!;
  const d = diffOf(s);
  if (stepSitRise(s, lm)) return;
  moveBody(lm, C.HOVER_Y);
  let cuts = 0; // 이번 틱에 짐을 벤 타수
  let collapses = 0; // 그중 층이 부서진 수
  for (let i = evStart; i < s.events.length; i++) {
    const e = s.events[i];
    if (e.kind === 'hit') cuts += 1;
    else if (e.kind === 'floorCollapse') { cuts += 1; collapses += 1; }
    else if (e.kind === 'guardBounce' && s.stack && lm.air === 1 && d >= 1) {
      // 읽는 띠 — 지면 가드를 늦게 받았으면 높은 띠로, 일찍 받았으면 낮은 띠로 읽힌다
      lm.x = Math.max(-C.READ_MAX, Math.min(C.READ_MAX, lm.x + ((e.y ?? 0) < C.READ_SPLIT ? 1 : -1)));
    }
  }
  const stk = s.stack;
  // 외주: 짐 층이 하나 부서질 때마다 띠가 바뀐다
  if (d === 2 && stk) for (let i = 0; i < collapses; i++) lm.k = lm.k === C.BAND_LO ? C.BAND_HI : C.BAND_LO;
  if (!stk) {
    if (s.stackSpawnCd > 0) { s.stackSpawnCd -= 1; return; }
    // 갈고리가 다음 짐을 내린다
    const [kinds, cargoBand] = C.CARGO[lm.wave % C.CARGO.length];
    const floors = [...kinds].map((c) => makeFloor(MAT[c]));
    s.stack = makeStack({ variant: 'building', theme: 'modern', floors, y: C.LOWER_TOP - stackH(floors), vy: -C.LOWER_V });
    st.fallG = 0;
    st.fallV = C.LOWER_V;
    let band: number = cargoBand;
    if (lmAct(s) >= 2 && d >= 1) band = lm.x >= 1 ? C.BAND_HI : lm.x <= -1 ? C.BAND_LO : cargoBand;
    lm.wave += 1;
    lm.air = 0;
    lm.k = band;
    lm.got = 0;
    if (lm.n !== 2) lm.cue = 0; // 앞 짐이 걸리지 못했다 — 연속 걸기는 처음부터
    lm.n = 0;
    return;
  }
  if (lm.air === 0) {
    // 내리는 중 — 갈고리가 쥐고 있어서 베어도 안 뜬다. 세 번 베면 줄이 끊겨 그 자리에서 떨어진다
    stk.vy = -C.LOWER_V;
    stk.resting = false;
    lm.got += cuts;
    if (stk.y <= C.LOWER_TO || lm.got >= C.CABLE_HITS) {
      lm.air = 1;
      lm.got = 0;
      st.fallG = C.G;
      st.fallV = C.VTERM;
      s.events.push({ kind: 'boltCue', lane: 0 }); // 끼릭 — 놓는다
    }
    return;
  }
  if (stk.resting && lm.n === 0) { lm.n = 1; lm.cue = 0; st.tally.cargoDown += 1; } // 짐이 땅에 닿았다(특기 사항이 깨진다 · 연속 걸기도)
  // 정점에서 띠 판정 — 짐 꼭대기가 띠 안에서 멈추면 걸린다
  const rising = stk.vy > 0;
  if (lm.got === 1 && !rising) {
    const top = stk.y + stackH(stk.floors);
    if (top >= lm.k && top <= lm.k + C.BAND_H[d]) { hook(s, lm); return; }
  }
  lm.got = rising ? 1 : 0;
}

/** 걸렸다 — 크레인이 짐을 들다 팔이 꺾여 추가 레인으로 내려온다(창). 3막 첫 걸림은 반만 꺾이고, 이어 한 번 더 걸어야 온창 */
function hook(s: GameState, lm: LandmarkState): void {
  impact(s, lm);
  setSt(lm, 'sit');
  s.stackSpawnCd = L.CRANE.NEXT_GAP;
  lm.cue = lmAct(s) === 3 && diffOf(s) >= 1 && lm.cue === 0 ? 2 : 0;
  lm.n = 2;
}
