// 작업 지시서 시험 봇 — 규칙 봇 + 짧은 미리 보기(gs-game-ai B). 시뮬이 결정적이라 상태를 복제해 몇 틱 앞을 돌려 본다.
// 사람보다 빠르게 누르지만(6틱마다 베기) 「깰 수 있나」와 기준 시간을 재는 용도다. 정석(점프 가드)은 크레인 계획에서만 쓴다.

import type { GameState, InputFrame, StageDiff, WazaId, WeaponId } from '../src/core/types';
import { EMPTY_INPUT } from '../src/core/types';
import { makeState, advance } from '../src/core/sim';
import { stageSeed, startStage, judgeStage, type StageResult } from '../src/core/stage';
import { LANDMARK, STAGE, WAZA_GAUGE } from '../src/config';
import { rand } from '../src/core/rng';
import { lmAct } from '../src/core/landmark';

const ATTACK: InputFrame = { ...EMPTY_INPUT, attack: true };
const GUARD: InputFrame = { ...EMPTY_INPUT, guard: true };
const JUMP: InputFrame = { ...EMPTY_INPUT, jump: true };
const SPECIAL: InputFrame = { ...EMPTY_INPUT, special: true };
const HORIZON = 26;

function clone(s: GameState): GameState {
  return structuredClone(s);
}

/** first를 누르고 (wait틱 손을 놓았다가) then을 따르면 HORIZON 동안 목숨 · 안전모를 지키나 */
function safe(s0: GameState, first: InputFrame, then: InputFrame, wait = 0): boolean {
  const c = clone(s0);
  const lives = c.lives;
  const hat = c.hat;
  advance(c, first);
  c.events.length = 0;
  for (let t = 1; t < HORIZON + wait && !c.over; t++) {
    advance(c, c.player.pose === 'pinned' ? GUARD : t <= wait ? EMPTY_INPUT : then);
    c.events.length = 0;
  }
  return c.lives === lives && c.hat === hat && c.player.pose !== 'pinned' && c.over !== 'gameover';
}

/** 위험이 가까이 있나 — 없으면 미리 보기 없이 벤다 */
function threat(s: GameState): boolean {
  if (s.boss || s.groundRocks > 0) return true;
  if (s.stack && s.stack.y < 360) return true;
  return s.entities.some((e) => (e.kind === 'rock' && !e.remnant && e.y < 360) || (e.kind === 'bolt' && e.cueTicks <= 0) || e.kind === 'shot');
}

/** 베고 나서 막을 수 있으면 벤다 → 지금 막아야 하면 막는다 → 계속 베야 살면 벤다. wait = 막기까지 걸리는 반응 여유(사람 대역) */
function generic(s: GameState, wait = 0): InputFrame {
  const pose = s.player.pose;
  // 베는 중 · 필살 중 · 가드 깨짐은 입력이 안 먹는다 — 다음 결정은 풀린 틱에
  if (pose === 'attack' || pose === 'special' || pose === 'guardBreak') return EMPTY_INPUT;
  if (!threat(s)) return ATTACK;
  if (safe(s, ATTACK, GUARD, wait)) return ATTACK;
  if (safe(s, GUARD, GUARD)) return GUARD;
  if (safe(s, ATTACK, ATTACK)) return ATTACK;
  return s.stack && s.stack.y < 80 ? GUARD : ATTACK;
}

// ── 크레인: 짐을 놓는 순간 계획을 세우고 그대로 누른다 ──
interface Plan { start: number; inputs: InputFrame[]; how: string }
let cranePlan: { wave: number; start: number; inputs: InputFrame[] | null } | null = null;

/** 「a틱 동안 벨 수 있으면 베고, g틱째부터 막는다(j틱째 뛴다)」를 복제에서 돌려 걸리면 입력열을 돌려준다 */
function tryCrane(s0: GameState, cuts: number, guardAt: number, jumpAt: number): InputFrame[] | null {
  const c = clone(s0);
  const inputs: InputFrame[] = [];
  const lives = c.lives;
  const floors0 = c.stack!.floors.length;
  let up = false;
  for (let t = 0; t < 240 && !c.over; t++) {
    const cutDone = floors0 - (c.stack?.floors.length ?? 0) >= cuts;
    let f: InputFrame = EMPTY_INPUT;
    if (t === jumpAt) f = JUMP;
    else if (t >= guardAt) f = GUARD;
    else if (!cutDone) f = ATTACK;
    inputs.push(f);
    advance(c, f);
    c.events.length = 0;
    if (c.lives < lives) return null;
    if (c.lm?.st === 'sit') return inputs;
    if (!c.stack) return null;
    // 한 번 튀어 올랐다가 다시 떨어지기 시작했는데 안 걸렸으면 이 계획은 끝
    if (c.stack.vy > 400) up = true; // 베기 띄우기(80)는 아니고 가드 바운스만
    else if (up && c.stack.vy < 0) return null;
  }
  return null;
}

function planCrane(s: GameState): Plan | null {
  const n = s.stack!.floors.length;
  for (let cuts = 0; cuts < n; cuts++) {
    for (let g = 0; g <= 70; g++) {
      const inputs = tryCrane(s, cuts, g, -1);
      if (inputs) return { start: s.tick, inputs, how: `${cuts ? cuts + "층 덜고 " : "그대로 "}${g}틱 뒤 가드` };
    }
  }
  // 땅에서 못 맞추면 점프 가드로 높이를 맞춘다
  for (let cuts = 0; cuts < n; cuts++) {
    for (let j = 0; j <= 50; j += 2) {
      for (let g = j + 1; g <= j + 50; g += 2) {
        const inputs = tryCrane(s, cuts, g, j);
        if (inputs) return { start: s.tick, inputs, how: `${cuts ? cuts + "층 덜고 " : "그대로 "}${j}틱 뒤 점프 → ${g}틱 공중 가드` };
      }
    }
  }
  return null;
}

/** 걸리는 틱 목록 → 이어진 구간 「a~b」 · 가장 긴 구간 넓이 */
function runsOf(ok: number[]): { text: string; max: number } {
  const r: [number, number][] = [];
  for (const t of ok) {
    const last = r[r.length - 1];
    if (last && t === last[1] + 1) last[1] = t;
    else r.push([t, t]);
  }
  return { text: r.map(([a, b]) => (a === b ? `${a}` : `${a}~${b}`)).join(','), max: Math.max(0, ...r.map(([a, b]) => b - a + 1)) };
}

/** 짐 하나에 거는 창 — 층을 c개 덜고 g틱 뒤 막아(땅) · j틱에 뛰고 바로 쥐어(점프) 걸리는 틱을 모은다.
 *  칸 = 「가장 긴 이어진 틈 넓이(이어진 구간들)」. 사람이 맞출 틈은 이어진 구간이다(봇 손 = 6틱마다 베기) */
export function craneWindows(s: GameState): string {
  const n = s.stack!.floors.length;
  const out: string[] = [];
  for (let cuts = 0; cuts < n; cuts++) {
    const ok: number[] = [];
    for (let g = 0; g <= 70; g++) if (tryCrane(s, cuts, g, -1)) ok.push(g);
    if (ok.length) { const r = runsOf(ok); out.push(`${cuts}층 덜고 땅 ${r.max}(${r.text})`); }
    // 점프하자마자 가드를 쥐고 있는 사람 — 뛰는 틱 j의 틈
    const jok: number[] = [];
    for (let j = 0; j <= 50; j++) if (tryCrane(s, cuts, j + 1, j)) jok.push(j);
    if (jok.length) { const r = runsOf(jok); out.push(`${cuts}층 덜고 점프 ${r.max}(${r.text})`); }
  }
  return out.join(' · ') || '없음';
}

// ── 종탑 고수 길: 종마다 「공중 가드로 꽂기」 계획을 복제로 찾는다 ──
let bellPlan: { stack: unknown; start: number; inputs: InputFrame[] | null } | null = null;

/** j틱째 뛰고 g틱째부터 막으면 이 종이 공중 가드로 올라가 2점으로 꽂히나. 꽂히면 입력열을 돌려준다 */
function tryBellAir(s0: GameState, jumpAt: number, guardAt: number): InputFrame[] | null {
  const c = clone(s0);
  const inputs: InputFrame[] = [];
  const lives = c.lives;
  const got0 = c.lm!.got;
  for (let t = 0; t < 150 && !c.over; t++) {
    const f = t === jumpAt ? JUMP : t >= guardAt ? GUARD : EMPTY_INPUT;
    inputs.push(f);
    advance(c, f);
    c.events.length = 0;
    if (c.lives < lives) return null;
    if (!c.stack) return c.lm!.got - got0 >= LANDMARK.BELL.AIR_POINTS ? inputs : null;
  }
  return null;
}

function planBell(s: GameState): InputFrame[] | null {
  for (let j = 0; j <= 60; j += 2) {
    for (let g = j + 1; g <= j + 40; g++) {
      const inputs = tryBellAir(s, j, g);
      if (inputs) return inputs;
    }
  }
  return null; // 못 찾으면 이 종은 지면 가드(기본 봇)
}

function bellExpert(s: GameState): InputFrame {
  const st = s.stack;
  if (s.lm!.st !== 'play' || !st || s.player.pose === 'pinned') return stageBot(s);
  if (!bellPlan || bellPlan.stack !== st) bellPlan = { stack: st, start: s.tick, inputs: planBell(s) };
  return bellPlan.inputs?.[s.tick - bellPlan.start] ?? stageBot(s);
}

/** 크레인 계획 기록 — 짐마다 몇 층 베고 언제 막았나(공략 자료) */
export const craneLog: string[] = [];

export function stageBot(s: GameState, wait = 0): InputFrame {
  const p = s.player;
  if (p.pose === 'pinned') return GUARD;
  const lm = s.lm;
  const st = s.stack;

  if (lm?.id === 'bell') {
    if (lm.st === 'slam') return GUARD;
    if (lm.st === 'sit') return ATTACK;
    // 종은 안 벤다(특기 사항) — 늦기 전에 지면 가드로 쳐 올린다
    if (st && st.vy < 0 && !safe(s, EMPTY_INPUT, GUARD, wait)) return GUARD;
    if (st && st.vy < 0 && st.y <= 56 && p.y <= 0) return GUARD;
    return EMPTY_INPUT;
  }
  if (lm?.id === 'wind') {
    // 마지막 숨(3막): 들숨엔 앉은 몸 밑면이 땅 사거리 밖이다. 기본 봇은 뛰지 않고 날숨에 내려온 몸만 벤다(뛰어 베기는 체공이 길어 오히려 느리다 — 실측. 숙련 봇도 바람탑에선 같은 봇이다)
    if (lm.st === 'sit') return ATTACK;
    // 좌판은 안 벤다 — 낮게 오면 받는다. 날숨이면 역풍, 들숨이면 탑에 튕겨 다시 온다
    if (st && st.vy < 0 && !safe(s, EMPTY_INPUT, GUARD, wait)) return GUARD;
    if (st && p.y <= 0 && st.vy < 0 && st.y <= 56) return GUARD;
    return EMPTY_INPUT;
  }
  if (lm?.id === 'crane') {
    if (lm.st === 'sit') return ATTACK;
    if (!st || lm.air === 0) return EMPTY_INPUT;
    // 짐마다 한 번 계획한다. 계획이 없거나 다 썼으면(못 걸었으면) 30틱 뒤에 다시 세운다
    const used = cranePlan && (!cranePlan.inputs || s.tick - cranePlan.start >= cranePlan.inputs.length);
    if (!cranePlan || cranePlan.wave !== lm.wave || (used && s.tick - cranePlan.start >= 30)) {
      const plan = planCrane(s);
      cranePlan = { wave: lm.wave, start: s.tick, inputs: plan?.inputs ?? null };
      const sd = s.stage!.diff;
      craneLog.push(`${['견습', '정규', '외주'][sd]} 짐${lm.wave}(${st.floors.length}층): ${plan ? plan.how : '해법 없음'}`);
    }
    return cranePlan.inputs?.[s.tick - cranePlan.start] ?? generic(s, wait);
  }

  if (lm?.id === 'pagoda' && st) {
    // 화산탄(기와)이 있으면 그쪽 먼저(미리 보기), 없으면 뛰어올라 밑면에 붙어 벤다
    const tiles = s.entities.some((e) => e.kind === 'rock' && !e.remnant);
    // 땅의 더미는 필살로 치운다(2막 당김) — 더미가 있으면 뛰지 않는다(착지 = 깔림)
    if (s.groundRocks > 0 && s.wazaGauge >= WAZA_GAUGE.COST && p.pose !== 'special') return SPECIAL;
    if (!tiles && p.y <= 0 && st.y > 70 && s.groundRocks === 0) return JUMP;
    if (tiles) return generic(s, wait);
    return ATTACK;
  }

  return generic(s, wait);
}

/** 숙련 봇 — 떨어지는 건물을 점프로 마중 나가 공중에서 벤다. 전임자 기록의 근거(보스판은 기본 봇과 같다) */
export function expertBot(s: GameState): InputFrame {
  if (s.lm) return s.lm.id === 'bell' ? bellExpert(s) : stageBot(s);
  const p = s.player;
  const st = s.stack;
  const pose = p.pose;
  if (pose === 'pinned') return GUARD;
  if (pose === 'attack' || pose === 'special' || pose === 'guardBreak') return EMPTY_INPUT;
  const hazards = s.boss || s.entities.some((e) => (e.kind === 'rock' && !e.remnant) || e.kind === 'bolt');
  if (!hazards && st && !st.resting && p.y <= 0 && pose === 'idle' && st.y > 90 && st.y < 480 && safe(s, JUMP, ATTACK)) return JUMP;
  if (p.y > 0 && !hazards) return safe(s, ATTACK, GUARD) || !safe(s, GUARD, GUARD) ? ATTACK : GUARD;
  return generic(s);
}

/**
 * 사람 대역 — delay틱 전 모습을 보고 기본 봇처럼 고른다(반응 지연). 베기는 tap틱에 한 번까지.
 * 깔리면 보지 않고 가드를 누른다. 「몇 틱 늦게 봐도 깨나」로 판마다 사람에게 맞는 어려움을 잰다(기한과는 다른 자).
 * 가드는 누른 결과가 보일 때까지(delay틱) 떼지 않고, 그 뒤에도 가까이 내려오는 건물 · 기와가 보이면 계속 누른다.
 * 기본 봇은 막기 직전까지 베는 욕심쟁이다. 사람은 늦게 보는 만큼 일찍 막는다 — 「베고 margin틱 뒤에 막아도 사나」로 고른다.
 * 내 몸은 늦지 않게 안다 — 베는 중이면 기다리고, 다 벤 뒤엔 옛 화면 속 내 몸도 풀린 것으로 본다.
 */
export function humanBot(delay: number, tap = 8, margin = delay): (s: GameState) => InputFrame {
  const seen: GameState[] = [];
  let lastAttack = -Infinity;
  let guardFrom = -Infinity;
  return (s) => {
    seen.push(clone(s));
    if (seen.length > delay + 1) seen.shift();
    const p = s.player;
    if (p.pose === 'pinned') return GUARD;
    if (p.pose === 'attack' || p.pose === 'special' || p.pose === 'guardBreak') return EMPTY_INPUT;
    let old = seen[0];
    if (old.player.pose === 'attack') { old = clone(old); old.player.pose = 'idle'; old.player.poseTick = 0; }
    const near = (old.stack && old.stack.vy <= 0 && old.stack.y < 120)
      || old.entities.some((e) => e.kind === 'rock' && !e.remnant && e.y < 240);
    if (s.tick - guardFrom < delay || (p.pose === 'guardG' && near)) return GUARD;
    // 집행기 돌진은 예고를 보면 미리 쥐고 기다린다
    const st = old.boss?.st;
    if (st === 'telegraph' || st === 'descend' || st === 'charging') return GUARD;
    const f = stageBot(old, margin);
    if (f.guard) { guardFrom = s.tick; return f; }
    if (!f.attack) return f;
    if (s.tick - lastAttack < tap) return EMPTY_INPUT;
    lastAttack = s.tick;
    return f;
  };
}

/**
 * 사용자 대역(11-14 보정, 정본 tmp/st1114/calibrate.md) — 사람 대역에 손 늦음을 얹는다. 결정적이다(지연 · 간격 · 회차로 시드한 mulberry32).
 * 보정값 = 지연 6~16 × 베기 간격 5~9 × J 5(10-31판 사용자 실측 넷: 1-1 · 1-2 · 1-B 깸, 2-1 못 깸에 맞춤).
 * · 손 늦음 J: 막기로 마음먹을 때마다 손이 0~J틱 더 늦다(균등). 계획은 지연 + q·J(q 0.5 = 평균)로 세운다 — 늦은 쪽이 여유를 넘으면 깔린다.
 *   종탑 내려찍기는 파가 모자라게 끝나면 반드시 오는 예고된 전환이라 집행기 예고처럼 늦지 않는다(slamLate = 늦게 받는 시험용).
 * · 빠른 물체 착각 b(기본 0, 보정에서 기각): 막기 여유 × (1 − b + b·VREF/v), v = 낙하 끝속도 · VREF = 1-1 정규 끝속도.
 * 나머지(옛 화면 · 내 몸 · 가드 쥐기 · 집행기 예고)는 humanBot과 같다.
 */
export function userBot(delay: number, tap: number, o: { J: number; b?: number; q?: number; seed?: number; slamLate?: boolean }): (s: GameState) => InputFrame {
  const seen: GameState[] = [];
  let lastAttack = -Infinity;
  let guardFrom = -Infinity;
  let pressAt = -1;
  const rng = { rngState: delay * 7919 + tap * 104729 + (o.seed ?? 0) * 15485863 };
  const plan = delay + Math.round((o.q ?? 0.5) * o.J);
  const vref = STAGE.VTERM[0] * STAGE.DIFF[1].fall;
  return (s) => {
    seen.push(clone(s));
    if (seen.length > delay + 1) seen.shift();
    const p = s.player;
    if (p.pose === 'pinned') { pressAt = -1; return GUARD; }
    if (pressAt >= 0) {
      if (s.tick < pressAt) return EMPTY_INPUT;
      pressAt = -1;
      guardFrom = s.tick;
      return GUARD;
    }
    if (p.pose === 'attack' || p.pose === 'special' || p.pose === 'guardBreak') return EMPTY_INPUT;
    let old = seen[0];
    if (old.player.pose === 'attack') { old = clone(old); old.player.pose = 'idle'; old.player.poseTick = 0; }
    const near = (old.stack && old.stack.vy <= 0 && old.stack.y < 120)
      || old.entities.some((e) => e.kind === 'rock' && !e.remnant && e.y < 240);
    if (s.tick - guardFrom < delay || (p.pose === 'guardG' && near)) return GUARD;
    const st = old.boss?.st;
    if (st === 'telegraph' || st === 'descend' || st === 'charging') return GUARD;
    const v = old.stage?.fallV ?? 0;
    const b = o.b ?? 0;
    const k = b > 0 && v > vref ? 1 - b + (b * vref) / v : 1;
    const f = stageBot(old, Math.round(plan * k));
    if (f.guard) {
      const late = old.lm?.st === 'slam' && !o.slamLate ? 0 : Math.floor(rand(rng) * (o.J + 1));
      if (late > 0) { pressAt = s.tick + late; return EMPTY_INPUT; }
      guardFrom = s.tick;
      return f;
    }
    if (!f.attack) return f;
    if (s.tick - lastAttack < tap) return EMPTY_INPUT;
    lastAttack = s.tick;
    return f;
  };
}

// ── 사람 크레인(11-14, 정본 tmp/st1114/boss-human.md §1 · §2): 짐마다 거는 틈을 아는 사람 — 틈 가운데를 노리되 손이 늦는다 ──
export interface CraneTry { tick: number; diff: number; act: number; wave: number; attempt: number; how: string; lo: number; hi: number; press: number; ok: boolean }
/** 크레인 시도 기록 — 측정이 판마다 비운다 */
export const craneTries: CraneTry[] = [];

interface CraneOpt { cuts: number; jump: boolean }

/** 사람 손: tap틱 간격으로 cuts층 벤다 → p틱부터 가드를 쥔다(jump면 p틱에 뛰고 다음 틱부터). since = 마지막 베기에서 지난 틱 */
function craneRun(s0: GameState, o: CraneOpt, p: number, tap: number, since: number): { ok: boolean; late: boolean; inputs: InputFrame[] } {
  const c = clone(s0);
  const inputs: InputFrame[] = [];
  const floors0 = c.stack!.floors.length;
  let last = -since;
  let up = false;
  for (let t = 0; t < 240 && !c.over; t++) {
    const cutDone = floors0 - (c.stack?.floors.length ?? 0) >= o.cuts;
    let f: InputFrame = EMPTY_INPUT;
    if (o.jump && t === p) f = JUMP;
    else if (t >= p + (o.jump ? 1 : 0)) f = GUARD;
    else if (!cutDone && c.player.pose !== 'attack' && t - last >= tap) { f = ATTACK; last = t; }
    inputs.push(f);
    advance(c, f);
    c.events.length = 0;
    if (c.lives < s0.lives || c.hat !== s0.hat) return { ok: false, late: true, inputs };
    if (c.lm?.st === 'sit') return { ok: true, late: false, inputs };
    if (!c.stack) return { ok: false, late: false, inputs };
    if (c.stack.vy > 400) up = true; // 가드 바운스(베기 띄움 80은 아니다)
    else if (up && c.stack.vy < 0) return { ok: false, late: false, inputs };
  }
  return { ok: false, late: false, inputs };
}

/** 가장 넓은 틈 고르기 — 땅 · 점프 × 덜 층 수. 넓이가 같으면 땅 · 덜 베기. 틈이 21틱보다 넓으면 늦은 끝 21틱만 본다(그보다 일찍 쥐고 기다리지 않는다) */
export function cranePick(s: GameState, p0: number, tap: number, since: number): { o: CraneOpt; lo: number; hi: number } | null {
  const n = s.stack!.floors.length;
  let best: { o: CraneOpt; lo: number; hi: number } | null = null;
  let bw = 0;
  for (const jump of [false, true]) {
    for (let cuts = 0; cuts < n; cuts++) {
      const o = { cuts, jump };
      let lo = -1;
      const close = (hi: number) => {
        const w = Math.min(hi - lo + 1, 21);
        if (w > bw) { bw = w; best = { o, lo: Math.max(lo, hi - 20), hi }; }
      };
      for (let p = p0; p <= (jump ? 50 : 70); p++) {
        const r = craneRun(s, o, p, tap, since);
        if (r.ok) { if (lo < 0) lo = p; continue; }
        if (lo >= 0) close(p - 1);
        lo = -1;
        if (r.late) break;
      }
      if (lo >= 0) close(jump ? 50 : 70);
    }
  }
  return best;
}

/**
 * 사용자 대역의 크레인 손 — 짐을 놓으면(끼릭) 가장 넓은 틈을 골라 그 가운데를 노린다. 못 걸면 다시 떨어질 때 delay틱 뒤부터 다시 노린다.
 * 손 늦음 J는 userBot과 같은 뜻이다: 계획 = 가운데 − round(q·J)(평균 늦음만큼 일찍), 실제 누름 = 계획 + 0~J틱(균등, 같은 시드 방식).
 * 그래서 「노린 틱 − 실제 틱」의 분포가 userBot의 「막기 계획 − 실제 가드」와 같다(J 5 → −3~+2틱, 폭 6).
 * 첫 시도는 내려오는 짐을 내내 봤으니 지연 제약이 없다. 다시 노릴 땐 쥔 채 버티기(0틱 · 늦음 없음)도 손이다 — 그걸로 걸리거나 다시 맞출 틈이 없으면 쥐고 버틴다.
 * 창에선 delay틱 뒤부터 tap틱마다 벤다. 크레인 밖(등장)은 userBot이다.
 */
export function craneHuman(delay: number, tap: number, o: { J: number; q?: number; seed?: number }): (s: GameState) => InputFrame {
  const h = userBot(delay, tap, o);
  const rng = { rngState: delay * 7919 + tap * 104729 + (o.seed ?? 0) * 15485863 };
  const early = Math.round((o.q ?? 0.5) * o.J);
  let prog: { start: number; inputs: InputFrame[] } | null = null;
  let wave = -1;
  let attempt = 0;
  let lastAtk = -Infinity;
  return (s) => {
    const lm = s.lm;
    if (lm?.id !== 'crane') return h(s);
    const p = s.player;
    if (p.pose === 'pinned') { prog = null; return GUARD; }
    if (prog) {
      const f = prog.inputs[s.tick - prog.start];
      if (f) { if (f.attack) lastAtk = s.tick; return f; }
      prog = null;
    }
    if (lm.st === 'sit') {
      if (lm.t < delay || p.pose === 'attack' || s.tick - lastAtk < tap) return EMPTY_INPUT;
      lastAtk = s.tick;
      return ATTACK;
    }
    const st = s.stack;
    if (!st || lm.air === 0 || st.vy >= 0 || lm.st !== 'play') return EMPTY_INPUT;
    // 떨어지기 시작했다
    if (lm.wave !== wave) { wave = lm.wave; attempt = 0; } else attempt += 1;
    const p0 = attempt === 0 ? 0 : delay;
    const since = Math.min(999, s.tick - lastAtk);
    let pick = cranePick(s, p0, tap, since);
    let hold = false;
    if (attempt > 0 && (!pick || craneRun(s, { cuts: 0, jump: false }, 0, tap, since).ok)) {
      hold = true;
      pick = null;
    }
    const opt = pick?.o ?? { cuts: 0, jump: false };
    const aim = pick ? Math.round((pick.lo + pick.hi) / 2) : p0;
    const at = hold ? 0 : Math.max(p0, aim - early + Math.floor(rand(rng) * (o.J + 1)));
    const r = craneRun(s, opt, at, tap, since);
    craneTries.push({
      tick: s.tick, diff: s.stage!.diff, act: lmAct(s), wave, attempt,
      how: pick ? `${opt.jump ? '점프' : '땅'}${opt.cuts ? ` ${opt.cuts}층 덜고` : ''}` : hold ? '쥔 채' : '틈 없음',
      lo: pick?.lo ?? -1, hi: pick?.hi ?? -1, press: at, ok: r.ok,
    });
    prog = { start: s.tick, inputs: r.inputs };
    const f = r.inputs[0];
    if (f.attack) lastAtk = s.tick;
    return f;
  };
}

export interface BotRun {
  s: GameState;
  result: StageResult;
  frames: InputFrame[];
}

export function runStage(
  id: string, diff: StageDiff, opts?: { weapon?: WeaponId; waza?: WazaId; maxTicks?: number; policy?: (s: GameState) => InputFrame; fromBoss?: boolean },
): BotRun {
  const s = makeState({ seed: stageSeed(id) });
  startStage(s, { id, diff, weapon: opts?.weapon ?? 'sword', waza: opts?.waza ?? 'tenchi', fromBoss: opts?.fromBoss });
  cranePlan = null;
  bellPlan = null;
  const policy = opts?.policy ?? stageBot;
  const frames: InputFrame[] = [];
  const max = opts?.maxTicks ?? 60 * 60 * 5;
  while (!s.over && s.tick < max) {
    const f = policy(s);
    frames.push(f);
    advance(s, f);
    s.events.length = 0;
  }
  return { s, result: judgeStage(s), frames };
}

export function fmtTicks(t: number): string {
  const cs = Math.round((t * 100) / 60);
  const m = Math.floor(cs / 6000);
  const sec = Math.floor((cs % 6000) / 100);
  return `${m}:${String(sec).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}
