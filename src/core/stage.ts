// 작업 지시서 진행 — 대본 걸음을 차례로 내보내고, 다 치우면 보스, 보스를 넘기면 끝난다. 정본 = docs/STAGES_2026-10-31.md.
// 한 걸음 = 같이 나오는 묶음. 앞 걸음을 다 치워야(건물 · 번개 · 떠 있는 화산탄 없음) 다음 걸음 대기를 건다.
// 건물 걸음의 대기는 stackSpawnCd가 센다 — 렌더 ▼ 예고와 소리(audio/consume.ts)가 그 값 하나를 읽는다.
// 난수는 대본에 없다. 시드는 판 id에서 나오고, 연출 잔해 · 집행기 패턴 고르기만 쓴다.
// 도장 판정용 집계(tally)는 이 틱의 이벤트와 개체 수 차이로만 센다 — 기존 규칙 코드는 모른다.

import type { GameState, InputFrame, StageDiff, StageTally, WazaId, WeaponId } from './types';
import { ACT1, ACT2, LANDMARK, STAGE, VIEW } from '../config';
import { parseScript, type ScriptItem, type ScriptStep } from './script';
import { STAGES, type SecretId, type StageDef } from './stages';
import { makeFloor, makeStack } from './building';
import { spawnBolt, stepEntities } from './act2';
import { initBoss, stepBoss } from './boss';
import { initLandmark, stepLandmark } from './landmark';

const DEFS = new Map<string, StageDef>(STAGES.map((d) => [d.id, d]));
const SCRIPTS = new Map<string, ScriptStep[]>();

export function stageDef(id: string): StageDef {
  const d = DEFS.get(id);
  if (!d) throw new Error(`판 없음: ${id}`);
  return d;
}

export function stageScript(id: string): ScriptStep[] {
  let steps = SCRIPTS.get(id);
  if (!steps) {
    steps = parseScript(stageDef(id).script);
    SCRIPTS.set(id, steps);
  }
  return steps;
}

/** 판마다 고정 시드(FNV-1a) — 모두가 같은 판을 받는다 */
export function stageSeed(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export interface StageStart {
  id: string;
  diff: StageDiff;
  weapon: WeaponId;
  waza: WazaId;
  /** 보스 연습 — 대본을 건너뛰고 보스부터. 기록은 남기지 않는다(씬 몫) */
  fromBoss?: boolean;
}

function emptyTally(): StageTally {
  return {
    guardPress: 0, guardHeld: false, jumps: 0, specials: 0, breaks: 0, lifeLost: 0, hatBreak: 0,
    strikes: 0, landed: 0, maxPile: 0, rockKills: [], quad: false, bellCuts: 0, stall7: false, cargoDown: 0,
    stallCuts: 0, chimeBreaks: 0, bell13: false, market: false,
    hastyDrops: 0, finishSpecial: false, splits: [], rocksSeen: 0, boltsSeen: 0, boltGround: 0,
  };
}

/** makeState({ seed: stageSeed(id) })로 갓 만든 상태에 건다. 재생도 같은 두 줄로 시작한다 */
export function startStage(s: GameState, o: StageStart): void {
  const def = stageDef(o.id);
  s.mode = 'stage';
  s.weapon = o.weapon;
  s.waza = o.waza;
  s.chapter = Math.max(0, (ACT1.CHAPTER_THEMES as readonly string[]).indexOf(def.theme));
  s.fullCombo = false; // 2막 풀콤보 점수 고정(boss.ts)은 아케이드 것
  s.stackSpawnCd = 0;
  s.stage = {
    id: o.id, diff: o.diff, step: o.fromBoss ? stageScript(o.id).length : 0,
    armed: false, wait: 0, phase: 'script', fallG: STAGE.G[0], fallV: STAGE.VTERM[0], liftMul: 1,
    hasty: false, hastyT: 0, clearTick: 0, tally: emptyTally(),
  };
}

export function stepStage(s: GameState, input: InputFrame, evStart: number): void {
  const st = s.stage;
  if (!st) return;
  const t = st.tally;
  // 이번 틱에 필살 · 공격이 없앤 화산탄 — 둘 다 판 진행보다 먼저 돈다(sim.advance). 착지는 아래 stepEntities
  const killed = t.rocksSeen - countRocks(s);
  for (let i = 0; i < killed; i++) t.rockKills.push(s.tick);
  const boltKills = t.boltsSeen - countKind(s, 'bolt');
  if (boltKills > 0 && s.player.y <= 0) t.boltGround += boltKills;
  if (st.phase === 'script') stepScript(s);
  // 깬 뒤(done)에도 보스는 쓰러지는 연출을 마저 돈다 — 끝(over)은 그쪽이 낸다
  if (st.phase === 'boss' || (st.phase === 'done' && (s.boss || s.lm))) stepStageBoss(s, evStart);
  const boltsBefore = countKind(s, 'bolt');
  const rocksMid = countRocks(s);
  stepEntities(s);
  t.strikes += boltsBefore - countKind(s, 'bolt');
  t.landed += rocksMid - countRocks(s);
  t.rocksSeen = countRocks(s);
  t.boltsSeen = countKind(s, 'bolt');
  if (s.groundRocks > t.maxPile) t.maxPile = s.groundRocks;
  // 「기와 한 번에 넷」 = 60틱 안에 넷
  while (t.rockKills.length > 0 && s.tick - t.rockKills[0] > 60) t.rockKills.shift();
  if (t.rockKills.length >= 4) t.quad = true;

  if (input.guard && !t.guardHeld) t.guardPress += 1;
  t.guardHeld = input.guard;
  for (let i = evStart; i < s.events.length; i++) {
    const k = s.events[i].kind;
    if (k === 'jump') t.jumps += 1;
    else if (k === 'special') t.specials += 1;
    else if (k === 'comboBreak') t.breaks += 1;
    else if (k === 'lifeLost') t.lifeLost += 1;
    else if (k === 'hatBreak') t.hatBreak += 1;
  }
}

function countRocks(s: GameState): number {
  let n = 0;
  for (const e of s.entities) if (e.kind === 'rock' && !e.remnant) n += 1;
  return n;
}

function countKind(s: GameState, kind: 'bolt'): number {
  let n = 0;
  for (const e of s.entities) if (e.kind === kind) n += 1;
  return n;
}

/** 앞 걸음이 아직 판에 있나 — 격파 잔해(remnant)는 무해한 연출이라 안 센다 */
function busy(s: GameState): boolean {
  if (s.stack) return true;
  return s.entities.some((e) => e.kind === 'bolt' || e.kind === 'shot' || (e.kind === 'rock' && !e.remnant));
}

function stepScript(s: GameState): void {
  const st = s.stage!;
  stepHasty(s);
  if (busy(s)) return;
  const steps = stageScript(st.id);
  if (!st.armed) {
    clearPile(s);
    // 「N채」는 치운 걸음만 센다 — 쉼은 걸음이 아니다
    if (st.step > 0 && steps[st.step - 1].items[0].k !== 'rest') st.tally.splits.push(s.tick);
    if (st.step >= steps.length) { finishScript(s); return; }
    const step = steps[st.step];
    const head = step.items[0];
    const base = head.k === 'rest' ? head.beats * STAGE.BEAT
      : step.joined ? STAGE.JOINED_GAP
        : Math.round((st.step === 0 ? STAGE.FIRST_WAIT : STAGE.GAP) * STAGE.DIFF[st.diff].gap);
    st.armed = true;
    if (step.items.some((it) => it.k === 'build')) { s.stackSpawnCd = base; st.wait = 0; }
    else { s.stackSpawnCd = 0; st.wait = base; }
  }
  // 1막 trySpawn과 같은 셈 — 0이 된 다음 틱에 나온다(▼ 예고 · incoming 소리가 그 박을 안다)
  if (s.stackSpawnCd > 0) { s.stackSpawnCd -= 1; return; }
  if (st.wait > 0) { st.wait -= 1; return; }
  for (const it of steps[st.step].items) emit(s, it);
  st.step += 1;
  st.armed = false;
}

/** 성급한 건물: 최하층을 HP1로 남겨 두면 세다가 급락한다(정석 「HP1 남기고 점프 가드」를 한 번 깬다). 급락은 건물당 한 번 — 층마다 겹치면 ×9가 된다 */
function stepHasty(s: GameState): void {
  const st = s.stage!;
  if (!st.hasty) return;
  const bottom = s.stack?.floors[0];
  if (!bottom) { st.hasty = false; st.hastyT = 0; return; }
  if (bottom.segs[0].hp !== 1) { st.hastyT = 0; return; }
  st.hastyT += 1;
  if (st.hastyT === STAGE.HASTY_TICKS) {
    st.hasty = false;
    st.hastyT = 0;
    st.fallG *= STAGE.HASTY_FALL;
    st.fallV *= STAGE.HASTY_FALL;
    st.tally.hastyDrops += 1;
    s.events.push({ kind: 'boltCue', lane: 0 }); // 급락 예고음 — 2막 낙하 예고와 같은 소리
  }
}

function emit(s: GameState, it: ScriptItem): void {
  const st = s.stage!;
  const def = stageDef(st.id);
  const diff = STAGE.DIFF[st.diff];
  if (it.k === 'build') {
    const speed = Math.min(1.25, def.speed + (it.fast ? STAGE.FAST_SPEED_ADD : 0));
    st.fallG = (STAGE.G[0] + (STAGE.G[1] - STAGE.G[0]) * speed) * diff.fall;
    st.fallV = (STAGE.VTERM[0] + (STAGE.VTERM[1] - STAGE.VTERM[0]) * speed) * diff.fall;
    st.hasty = it.hasty;
    st.hastyT = 0;
    s.stack = makeStack({
      variant: 'building', theme: def.theme, floors: it.floors.map(makeFloor),
      vy: it.fast ? STAGE.FAST_SPAWN_VY : STAGE.SPAWN_VY,
    });
  } else if (it.k === 'bolt') {
    for (let i = 0; i < it.n; i++) spawnBolt(s, 0, Math.max(1 - ACT2.BOLT_CUE_TICKS, i * STAGE.BOLT_STAGGER + diff.cue));
  } else if (it.k === 'rock') {
    for (let i = 0; i < it.n; i++) {
      s.entities.push({ kind: 'rock', lane: 0, y: VIEW.H + i * STAGE.ROCK_SPACING, vy: 0, hp: ACT2.ROCK_HP });
    }
    s.events.push({ kind: 'boltCue', lane: 0 }); // 2막 화산탄과 같은 낙하 예고
  }
}

/** 화산탄 더미는 그 걸음 것 — 다음 걸음 전에 무너뜨린다(깔림 탈출 Z와 같은 먹 터짐) */
function clearPile(s: GameState): void {
  for (; s.groundRocks > 0; s.groundRocks -= 1) s.events.push({ kind: 'floorCollapse', y: 0 });
}

function finishScript(s: GameState): void {
  const st = s.stage!;
  const def = stageDef(st.id);
  s.stackSpawnCd = 0;
  if (def.boss === 'executor') {
    st.phase = 'boss';
    s.boss = initBoss();
    s.combo = 0; // 2막 달 개시와 같다 — 연습(보스부터)과 본판이 같은 조건에서 싸운다. 끊김 이벤트 없음
    return;
  }
  if (def.boss) {
    st.phase = 'boss';
    initLandmark(s, def.boss);
    return;
  }
  clearStage(s);
}

/** 깼다 — 시간은 이 틱이다. 보스가 있으면 쓰러진 틱(연출 시간은 안 센다) */
export function clearStage(s: GameState): void {
  const st = s.stage!;
  if (st.phase === 'boss') st.tally.splits.push(s.tick); // 보스 = 마지막 한 채
  st.phase = 'done';
  st.clearTick = s.tick;
  // 보스가 있으면 쓰러지는 연출 뒤에 그쪽(boss.ts · landmark.ts)이 끝을 낸다
  if (!s.boss && !s.lm) s.over = 'cleared';
}

function stepStageBoss(s: GameState, evStart: number): void {
  const st = s.stage!;
  if (s.boss) {
    stepBoss(s); // 쓰러진 뒤 연출 시간이 지나면 boss.ts가 over = 'cleared'
    if (s.boss?.st === 'defeated' && !st.clearTick) finishBoss(s);
    return;
  }
  stepLandmark(s, evStart);
  if (s.lm?.st === 'down' && !st.clearTick) finishBoss(s);
}

/** 보스가 쓰러진 틱 — 마지막 한 타가 필살인가(이 틱에 필살이 터졌으면 그렇다). 퇴장 대사 · HQ 특기 사항이 읽는다 */
function finishBoss(s: GameState): void {
  s.stage!.tally.finishSpecial = s.wazaHitTick === s.tick;
  clearStage(s);
}

// ── 판정 ────────────────────────────────────────────────────────

export interface StageStamps {
  /** 접수 */ done: boolean;
  /** 이상 없음 — 목숨도 안전모도 안 잃음 */ safe: boolean;
  /** 기한 내 */ inTime: boolean;
  /** 특기 사항 */ secret: boolean;
  /** 전임자 확인 */ master: boolean;
}

export interface StageResult {
  id: string;
  diff: StageDiff;
  cleared: boolean;
  /** 깬 틱(못 깼으면 끝난 틱) */
  ticks: number;
  score: number;
  peakCombo: number;
  stamps: StageStamps;
  /** 걸음(건물 · 보스)마다 치운 틱 — 「N채」 비교용 */
  splits: number[];
  /** 숨은 막을 봤나 — 1-B 13시 종을 받음 · 2-B 장터 · 3-B 아홉 층 전부 풍경 창. 퇴장 대사만 바꾼다 */
  extra: boolean;
}

const SECRETS: Readonly<Record<SecretId, (t: StageTally, s: GameState) => boolean>> = {
  noGuard: (t) => t.guardPress === 0,
  noBreak: (t) => t.breaks === 0,
  noJump: (t) => t.jumps === 0,
  noHasty: (t) => t.hastyDrops === 0,
  pile3: (t) => t.maxPile >= ACT2.ROCK_STACK_MAX,
  quad: (t) => t.quad,
  airBolt: (t) => t.boltGround === 0 && t.strikes === 0,
  noSpecial: (t) => t.specials === 0,
  bellNoCut: (t) => t.bellCuts === 0,
  stall7: (t) => t.stall7,
  tileZero: (t) => t.landed === 0,
  cargoAir: (t) => t.cargoDown === 0,
  finishSpecial: (t) => t.finishSpecial,
};

export function judgeStage(s: GameState): StageResult {
  const st = s.stage!;
  const def = stageDef(st.id);
  const t = st.tally;
  const cleared = st.clearTick > 0 && s.over !== 'gameover';
  const ticks = cleared ? st.clearTick : s.tick;
  return {
    id: st.id,
    diff: st.diff,
    cleared,
    ticks,
    score: s.score,
    peakCombo: s.peakCombo,
    stamps: {
      done: cleared,
      safe: cleared && t.lifeLost === 0 && t.hatBreak === 0,
      inTime: cleared && ticks <= def.par,
      secret: cleared && SECRETS[def.secret](t, s),
      master: cleared && ticks <= def.master,
    },
    splits: [...t.splits],
    extra: cleared && (def.boss === 'bell' ? t.bell13 : def.boss === 'wind' ? t.market
      : def.boss === 'pagoda' ? t.chimeBreaks >= LANDMARK.PAGODA.FLOORS : false),
  };
}
