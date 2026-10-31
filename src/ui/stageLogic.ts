// 작업 지시서 화면의 순수 셈 — DOM 없음. 그리기는 stageView.ts, 판 시작 · 끝은 scenes.ts, 시험은 tests/stage-ui.test.ts.
// 규칙 · 기록은 core/stage.ts · meta/stageRecord.ts가 이미 갖고 있다. 여기는 그 값을 화면에 놓을 모양으로만 바꾼다.

import { BOSS_NAME } from '../content';
import { REJECT, STAGE_MODE, STAGE_TEXT, fmtGap, fmtStageTime, stageOutro, stageShareText } from '../content/stages';
import { decodeReplay, encodeReplay, replayCheck, type ReplayHead } from '../core/replay';
import { LANDMARK } from '../config';
import { lmAct } from '../core/landmark';
import { stageDef, stageScript, type StageResult } from '../core/stage';
import { verifyReplay } from '../core/stageReplay';
import { STAGES } from '../core/stages';
import type { GameState, StageDiff } from '../core/types';
import { STAMP_KEYS, chaeBehind, hasStamp, stampBits, type RecordNews, type StageRecord } from '../meta/stageRecord';

/** 반려 사유 한 줄 — 못 찍은 첫 자리(접수 · 이상 없음 · 기한 내 · 전임자 확인 차례). 특기 사항은 사유 대신 수수께끼가 늘 보인다 */
export function pickReason(r: StageResult, lifeLost: number): string {
  const def = stageDef(r.id);
  if (!r.stamps.done) return REJECT.done;
  if (!r.stamps.safe) return REJECT.safe(lifeLost);
  if (!r.stamps.inTime) return REJECT.inTime(r.ticks - def.par);
  if (!r.stamps.master) return REJECT.master(r.ticks - def.master, chaeBehind(r.splits, def.master));
  return '';
}

/** 전임자 줄. 시간이 같으면 「동률」 */
export function masterLine(ticks: number, master: number): string {
  const t = `${STAGE_MODE.master} ${fmtStageTime(master)}`;
  if (ticks === master) return `${t} · ${STAGE_MODE.tie}`;
  return ticks < master ? `${t} · ${fmtGap(master - ticks)}초 ${STAGE_MODE.ahead}` : t;
}

/**
 * 걸음 셈 — 쉼(.)은 걸음이 아니다(core/stage.ts 와 같은 판정). HUD · 보고서 · 「미처리 N건」이 같은 수를 본다.
 * step = 대본에서 지나간 칸 수(쉼 포함), done = 그중 걸음, total = 대본 전체 걸음
 */
export function workProgress(id: string, step: number): { done: number; total: number } {
  const steps = stageScript(id);
  const isWork = (x: (typeof steps)[number]): boolean => x.items[0].k !== 'rest';
  return { done: steps.slice(0, step).filter(isWork).length, total: steps.filter(isWork).length };
}

/** 판 위 한 줄 — 「1-1 회랑 3번지 · 0:12.34 · 3/7」. 총 걸음이 0(대본이 빈 보스판)이면 걸음을 뺀다 */
export function stageHudLine(o: { id: string; ticks: number; step: number; total: number; replaying: boolean }): string {
  const parts = [`${o.id} ${STAGE_TEXT[o.id]?.name ?? ''}`.trim(), fmtStageTime(o.ticks)];
  if (o.total > 0) parts.push(`${Math.min(o.step, o.total)}/${o.total}`);
  const line = parts.join(' · ');
  return o.replaying ? `${STAGE_MODE.replaying} · ${line}` : line;
}

/** 명물 이름 — 집행기는 자기 이름이 따로 있다 */
export function bossName(id: string): string {
  return stageDef(id).boss === 'executor' ? BOSS_NAME : (STAGE_TEXT[id]?.name ?? '');
}

/** 못 깬 판의 진척 — 대본 중이면 걸음, 명물 앞이면 명물 이름 */
export function progressText(o: { id: string; step: number; total: number; phase: 'script' | 'boss' | 'done' }): string {
  if (o.phase !== 'script' || o.total <= 0) return bossName(o.id);
  return `${o.step}/${o.total}`;
}

/**
 * 판마다 새로 만드는 메모 — 바람탑에서 좌판을 한 번이라도 앉혔나 · 크레인에서 짐이 부서진 수 ·
 * 바람탑 3막 들숨 창의 땅 헛손질 수(swung = 지난 틱에도 베는 중이었나) · 이미 말한 자막
 */
export interface HintMemo { sat: boolean; broke: number; whiff: number; swung: boolean; said: string[] }
export const newHintMemo = (): HintMemo => ({ sat: false, broke: 0, whiff: 0, swung: false, said: [] });

/**
 * 바람탑 3막 들숨 창의 헛손질 셈. 신호 = 창(sit)이 3막 들숨(air 0)이라 몸이 사거리 밖인데 땅에서 베기를 시작한 틱.
 * 창은 역풍 꽂힘으로 열려 날숨에 서는 일이 많고 숨은 창 중에도 바뀐다 — 그래서 창이 아니라 틱의 상태로 본다.
 */
function trackWindWhiff(s: GameState, memo: HintMemo): void {
  const lm = s.lm;
  const p = s.player;
  const swinging = p.pose === 'attack';
  if (swinging && !memo.swung && p.y <= 0 && lm?.id === 'wind' && lm.st === 'sit' && lm.air === 0
    && lmAct(s) === 3 && (lm.body?.y ?? 0) > LANDMARK.SIT_Y + 32) memo.whiff += 1;
  memo.swung = swinging;
}

/** 지금 말할 수 있는 자막들 — 급한 것(구체적인 것)부터. 메모는 매 틱 여기서 갱신한다 */
function hintsNow(s: GameState, memo: HintMemo): string[] {
  const st = s.stage;
  const lm = s.lm;
  if (!st) return [];
  if (lm?.st === 'sit') memo.sat = true;
  for (const e of s.events) if (e.kind === 'stackDestroy') memo.broke += 1;
  trackWindWhiff(s, memo);
  const out: string[] = [];
  if (lm?.id === 'bell' && lm.st === 'slam' && lmAct(s) === 3) out.push(STAGE_MODE.bellAct3Hint);
  if (lm?.id === 'wind' && memo.whiff >= 2) out.push(STAGE_MODE.windAct3Hint);
  if (lm?.id === 'pagoda' && st.diff >= 1 && lmAct(s) >= 2 && s.groundRocks >= 2) out.push(STAGE_MODE.pagodaPullHint);
  if (lm?.id === 'crane' && lm.cue === 2) out.push(STAGE_MODE.craneDoubleHint);
  if (st.tally.bellCuts >= 3) out.push(STAGE_MODE.bellHint);
  if (lm?.id === 'wind' && lm.n >= 4 && !memo.sat) out.push(STAGE_MODE.windHint);
  if (lm?.id === 'crane' && memo.broke >= 2) out.push(STAGE_MODE.craneHint);
  return out;
}

/** 판 도중 힌트 한 줄 — 막힌 흔적이 보일 때만(자연층). 없으면 ''. 한 번만 보이는 건 nextHint 몫 */
export function stageHint(s: GameState, memo: HintMemo): string {
  return hintsNow(s, memo)[0] ?? '';
}

/** 자막마다 한 판에 한 번만 — 이미 한 말은 건너뛰고, 메모는 말이 없어도 갱신한다 */
export function nextHint(s: GameState, run: { memo: HintMemo }): string {
  const h = hintsNow(s, run.memo).find((x) => !run.memo.said.includes(x)) ?? '';
  if (h) run.memo.said.push(h);
  return h;
}

/** 사건 열에서 끝 틱 이후를 자른다 — 깬 뒤 연출 동안 누른 입력은 코드에 넣지 않는다(decodeReplay가 사건 합 ≤ 끝 틱을 요구) */
export function trimEvents(events: readonly number[], ticks: number): number[] {
  const out: number[] = [];
  let t = 0;
  for (const e of events) {
    t += Math.floor(e / 8);
    if (t >= ticks) break;
    out.push(e);
  }
  return out;
}

/**
 * 판 하나의 기록 코드. 끝 틱까지만 적고, 깬 판은 한 번 다시 돌려 본다 —
 * 깬 뒤 연출 입력을 잘랐으면 점수가 달라질 수 있어서, 다시 돌린 점수를 코드에 적는다(받는 쪽도 같은 값을 낸다).
 */
export function sealCode(head: ReplayHead, r: StageResult, events: readonly number[]): string {
  const kept = trimEvents(events, r.ticks);
  const build = (score: number): string => encodeReplay({ head, end: { ticks: r.ticks, score, cleared: r.cleared }, events: kept });
  const code = build(r.score);
  if (!r.cleared) return code;
  const rep = decodeReplay(code);
  const v = rep ? verifyReplay(rep) : null;
  if (v && !('error' in v) && !v.match && v.result.ticks === r.ticks && v.result.cleared) return build(v.result.score);
  return code;
}

/** 현장 일지 합계 — 정규 도장 찍힌 수 / 전체 · 전임자 확인 수 / 판 수 */
export function stampTotals(recs: Readonly<Record<string, StageRecord>>): { stamps: number; stampMax: number; masters: number; masterMax: number } {
  let stamps = 0;
  let masters = 0;
  for (const d of STAGES) {
    const bits = recs[d.id]?.stamps ?? 0;
    for (const k of STAMP_KEYS) if (hasStamp(bits, k)) stamps += 1;
    if (hasStamp(bits, 'master')) masters += 1;
  }
  return { stamps, stampMax: STAGES.length * STAMP_KEYS.length, masters, masterMax: STAGES.length };
}

/** real = 기록하는 판 · practice = 보스 연습(기록 없음) · watch = 다시 보기(기록 합치기 없음) */
export type StageEndKind = 'real' | 'practice' | 'watch';

/** 철거 보고서 한 장에 놓을 것 전부 — 그리기는 stageView.paintStageEnd */
export interface StageEndView {
  kind: StageEndKind;
  id: string;
  name: string;
  diff: StageDiff;
  cleared: boolean;
  /** 큰 글자 — 깼으면 시간, 못 깼으면 걸음 진척 */
  time: string;
  /** 정규 도장(비트)과 이번에 처음 찍힌 것 */
  stamps: number;
  newStamps: number;
  /** 못 찍은 첫 자리의 사유(없으면 '') */
  reason: string;
  /** 전임자 줄 · 전임자를 처음 앞선 날의 두 줄 */
  master: string;
  masterBeat: boolean;
  riddle: string;
  firstClear: boolean;
  newBest: boolean;
  /** 전 기록 시간 글(없으면 '') */
  prevBest: string;
  outro: readonly string[];
  /** 확인 번호 · 코드 · 공유 글(깬 진짜 판만) */
  check: string;
  code: string;
  share: string;
  /** 다음 지시서 id — 깼고 열렸을 때만 */
  nextId: string | null;
  /** 도장 줄 길게 누르면 나오는 뒷면 */
  flip: string;
}

export function endView(o: {
  kind: StageEndKind;
  result: StageResult;
  lifeLost: number;
  finishSpecial: boolean;
  step: number;
  total: number;
  phase: 'script' | 'boss' | 'done';
  news: RecordNews | null;
  rec: StageRecord | null;
  code: string;
  nextId: string | null;
}): StageEndView {
  const r = o.result;
  const def = stageDef(r.id);
  const real = o.kind === 'real';
  const regular = r.diff === 1 && o.kind !== 'practice';
  const bits = stampBits(r.stamps);
  const news = o.news;
  const code = r.cleared && real ? o.code : '';
  const check = code ? replayCheck(code) : '';
  return {
    kind: o.kind,
    id: r.id,
    name: STAGE_TEXT[r.id]?.name ?? '',
    diff: r.diff,
    cleared: r.cleared,
    time: r.cleared ? fmtStageTime(r.ticks) : progressText({ id: r.id, step: o.step, total: o.total, phase: o.phase }),
    stamps: regular ? bits : 0,
    newStamps: real && news ? news.newStamps : 0,
    reason: regular || !r.cleared ? pickReason(r, o.lifeLost) : '',
    master: regular && r.cleared ? masterLine(r.ticks, def.master) : '',
    masterBeat: !!news && hasStamp(news.newStamps, 'master'),
    riddle: STAGE_TEXT[r.id]?.riddle ?? '',
    firstClear: !!news?.firstClear,
    newBest: !!news?.newBest,
    prevBest: news?.newBest && news.prevBest > 0 ? fmtStageTime(news.prevBest) : '',
    outro: def.boss && r.cleared && o.kind !== 'practice'
      ? stageOutro(r.id, { secret: r.stamps.secret, finishSpecial: o.finishSpecial, extra: r.extra })
      : [],
    check,
    code,
    share: code ? stageShareText({ id: r.id, diff: r.diff, ticks: r.ticks, bits, check, cleared: r.cleared }) : '',
    nextId: o.nextId,
    flip: o.rec
      ? `${STAGE_MODE.start} ${o.rec.tries} · ${STAGE_MODE.clears} ${o.rec.clears} · ${STAGE_MODE.firstClear} ${o.rec.first || STAGE_MODE.none}`
      : '',
  };
}
