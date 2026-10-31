// 작업 지시서 시험 봇 — 규칙 봇 + 짧은 미리 보기(gs-game-ai B). 시뮬이 결정적이라 상태를 복제해 몇 틱 앞을 돌려 본다.
// 사람보다 빠르게 누르지만(6틱마다 베기) 「깰 수 있나」와 기준 시간을 재는 용도다. 정석(점프 가드)은 크레인 계획에서만 쓴다.

import type { GameState, InputFrame, StageDiff, WazaId, WeaponId } from '../src/core/types';
import { EMPTY_INPUT } from '../src/core/types';
import { makeState, advance } from '../src/core/sim';
import { stageSeed, startStage, judgeStage, type StageResult } from '../src/core/stage';
import { LANDMARK, WAZA_GAUGE } from '../src/config';

const ATTACK: InputFrame = { ...EMPTY_INPUT, attack: true };
const GUARD: InputFrame = { ...EMPTY_INPUT, guard: true };
const JUMP: InputFrame = { ...EMPTY_INPUT, jump: true };
const SPECIAL: InputFrame = { ...EMPTY_INPUT, special: true };
const HORIZON = 26;

function clone(s: GameState): GameState {
  return structuredClone(s);
}

/** first를 누르고 then을 따르면 HORIZON 동안 목숨 · 안전모를 지키나 */
function safe(s0: GameState, first: InputFrame, then: InputFrame): boolean {
  const c = clone(s0);
  const lives = c.lives;
  const hat = c.hat;
  advance(c, first);
  c.events.length = 0;
  for (let t = 1; t < HORIZON && !c.over; t++) {
    advance(c, c.player.pose === 'pinned' ? GUARD : then);
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

/** 베고 나서 막을 수 있으면 벤다 → 지금 막아야 하면 막는다 → 계속 베야 살면 벤다 */
function generic(s: GameState): InputFrame {
  const pose = s.player.pose;
  // 베는 중 · 필살 중 · 가드 깨짐은 입력이 안 먹는다 — 다음 결정은 풀린 틱에
  if (pose === 'attack' || pose === 'special' || pose === 'guardBreak') return EMPTY_INPUT;
  if (!threat(s)) return ATTACK;
  if (safe(s, ATTACK, GUARD)) return ATTACK;
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

export function stageBot(s: GameState): InputFrame {
  const p = s.player;
  if (p.pose === 'pinned') return GUARD;
  const lm = s.lm;
  const st = s.stack;

  if (lm?.id === 'bell') {
    if (lm.st === 'slam') return GUARD;
    if (lm.st === 'sit') return ATTACK;
    // 종은 안 벤다(특기 사항) — 늦기 전에 지면 가드로 쳐 올린다
    if (st && st.vy < 0 && !safe(s, EMPTY_INPUT, GUARD)) return GUARD;
    if (st && st.vy < 0 && st.y <= 56 && p.y <= 0) return GUARD;
    return EMPTY_INPUT;
  }
  if (lm?.id === 'wind') {
    // 마지막 숨(3막): 들숨엔 앉은 몸 밑면이 땅 사거리 밖이다. 기본 봇은 뛰지 않고 날숨에 내려온 몸만 벤다(뛰어 베기는 체공이 길어 오히려 느리다 — 실측. 숙련 봇도 바람탑에선 같은 봇이다)
    if (lm.st === 'sit') return ATTACK;
    // 좌판은 안 벤다 — 낮게 오면 받는다. 날숨이면 역풍, 들숨이면 탑에 튕겨 다시 온다
    if (st && st.vy < 0 && !safe(s, EMPTY_INPUT, GUARD)) return GUARD;
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
    return cranePlan.inputs?.[s.tick - cranePlan.start] ?? generic(s);
  }

  if (lm?.id === 'pagoda' && st) {
    // 화산탄(기와)이 있으면 그쪽 먼저(미리 보기), 없으면 뛰어올라 밑면에 붙어 벤다
    const tiles = s.entities.some((e) => e.kind === 'rock' && !e.remnant);
    // 땅의 더미는 필살로 치운다(2막 당김) — 더미가 있으면 뛰지 않는다(착지 = 깔림)
    if (s.groundRocks > 0 && s.wazaGauge >= WAZA_GAUGE.COST && p.pose !== 'special') return SPECIAL;
    if (!tiles && p.y <= 0 && st.y > 70 && s.groundRocks === 0) return JUMP;
    if (tiles) return generic(s);
    return ATTACK;
  }

  return generic(s);
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
