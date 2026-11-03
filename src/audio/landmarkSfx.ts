// 명물 보스 소리 중 이벤트가 없는 것 — 직전 틱과 지금 틱의 lm 차이로 낸다(순수, 소리는 consume.ts가 낸다).
// 이벤트로 나는 소리(깡 · 퉁 · 몸을 친 댕)는 consume.ts mapEvent 몫이다.
// 시뮬 상태는 읽기만 한다(작업 지시서는 같은 입력이면 같은 판 — 불변 14).

import type { GameState, LandmarkId, LandmarkSt } from '../core/types';
import { LANDMARK, STAGE, TPS } from '../config';
import { lmAct } from '../core/landmark';
import type { SfxName } from './sfx';

/** 직전 틱과 비교하려고 쥐는 lm 한 장면 */
export interface LmSnap {
  tick: number;
  id: LandmarkId;
  st: LandmarkSt;
  air: number;
  wave: number;
  cue: number;
  /** 종탑: 이번 파에 꽂은 점수 */
  got: number;
  stack: boolean;
  diff: 0 | 1 | 2;
  /** 막(남은 층으로 정한다) */
  act: 1 | 2 | 3;
  /** lm.k · lm.x · lm.flying — 보스마다 뜻이 다르다(types.ts LandmarkState) */
  k: number;
  x: number;
  flying: boolean;
  /** 던진 것의 밑면 높이(없으면 −1) */
  sy: number;
  /** 크레인 띠 아래 끝(내려오는 동안은 미끄러지는 중의 값) · 아니면 0 */
  band: number;
  /** 땅의 화산탄 더미 수 */
  piles: number;
  /** 이 틱에 몸에 꽂혔다(bossHit) · 가드가 튕겼다(guardBounce · guardAirBounce) */
  hit: boolean;
  guard: boolean;
}

export interface LmSound { name: SfxName; semis?: number; dur?: number; /** 초 */ delay?: number }

/** 시계 초침 한 칸 = 이 틱 수(렌더 초침도 같은 칸으로 간다) */
export const CLOCK_STEP = 8;
/** 크레인이 짐을 내리는 동안 톱니 한 칸 = 이 틱 수 */
export const RATCHET_STEP = 6;
/** 바람탑 노래 여덟 음의 높이(반음) — 오음계라 어떻게 이어도 동요처럼 들린다 */
export const WIND_NOTES: readonly number[] = [0, 4, 2, 7, 4, 9, 7, 2];
/** 구층탑 밑면이 이 밑이면 땅에 닿는 끝이 임박했다(그림자 · 나무 소리) */
export const PAGODA_LOW_Y = 120;
/** 크레인 줄이 끊겼다고 보는 기준: 놓는 순간 짐 밑면이 LOWER_TO보다 이만큼 높다 */
const CUT_SLACK = 8;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** 종탑 2막 정각: 파가 시작되고 지금까지 간 몫 0..1. 1이면 덩이가 떨어진다 */
export function blockProgress(hours: number, k: number): number {
  return clamp01(k / (hours * LANDMARK.BELL.BLOCK_PACE));
}

/** 정각이 가까울수록 똑딱이 잦다 — 몫 p에서 똑딱 사이 틱 수(0 = 아직 조용) */
export function blockTickEvery(p: number): number {
  return p >= 1 ? 0 : p >= 0.9 ? 6 : p >= 0.75 ? 10 : p >= 0.5 ? 16 : 0;
}

/** 구층탑 나무 소리 사이 틱 수(0 = 조용). pull = 당김이 도는 판(2막 이상 · 견습 아님), low = 밑면이 PAGODA_LOW_Y 밑 */
export function creakEvery(piles: number, low: boolean, pull: boolean): number {
  const base = pull ? [0, 150, 100, 70][Math.min(Math.max(piles, 0), 3)] : 0;
  if (!low) return base;
  return base > 0 ? Math.round(base * 0.6) : 90;
}

/** 크레인 띠가 짐의 원래 띠에서 읽은 띠로 가는 걸음 0..1 — 짐이 내려가는 앞 80%에 자리 잡는다 */
export function bandEase(u: number): number {
  const s = clamp01(u / 0.8);
  return s * s * (3 - 2 * s);
}

/** 내리는 중인 짐의 지금 띠 아래 끝. 내리는 중이 아니면 lm.k 그대로 */
export function craneBand(s: GameState): number {
  const lm = s.lm;
  if (!lm || lm.id !== 'crane') return 0;
  const st = s.stack;
  const C = LANDMARK.CRANE;
  if (!st || lm.air !== 0 || lm.wave < 1) return lm.k;
  const from = C.CARGO[(lm.wave - 1) % C.CARGO.length][1];
  const y0 = C.LOWER_TOP - st.floors.reduce((h, f) => h + f.h, 0);
  const u = y0 > C.LOWER_TO ? clamp01((y0 - st.y) / (y0 - C.LOWER_TO)) : 1;
  return from + (lm.k - from) * bandEase(u);
}

/** 띠 높이에 따라 끼릭 음높이(반음 0..5). 낮은 띠 = 낮은 음 */
export function bandSemis(band: number): number {
  const C = LANDMARK.CRANE;
  return Math.round(clamp01((band - C.BAND_LO) / (C.BAND_HI - C.BAND_LO)) * 5);
}

export function snapOf(s: GameState): LmSnap | null {
  const lm = s.lm;
  if (!lm) return null;
  let hit = false;
  let guard = false;
  for (const e of s.events ?? []) {
    if (e.kind === 'bossHit') hit = true;
    else if (e.kind === 'guardBounce' || e.kind === 'guardAirBounce') guard = true;
  }
  return {
    tick: s.tick, id: lm.id, st: lm.st, air: lm.air, wave: lm.wave, cue: lm.cue, got: lm.got, stack: s.stack !== null,
    diff: s.stage?.diff ?? 1, act: lmAct(s), k: lm.k, x: lm.x, flying: lm.flying,
    sy: s.stack ? s.stack.y : -1, band: craneBand(s), piles: s.groundRocks ?? 0, hit, guard,
  };
}

/** 노래 한 음의 길이(초) — 숨이 그 음 동안 이어진다 */
function windNoteSec(cur: LmSnap): number {
  const song = cur.diff === 2 ? LANDMARK.WIND.SONG_OUTSOURCE : LANDMARK.WIND.SONG;
  return (song[cur.wave % song.length][1] * STAGE.BEAT) / TPS;
}

/** 종탑: 이번 파에서 꽂은 수가 시각의 절반 이상인가(core가 파 끝에 값을 비우므로 play 중만. 3막엔 절반 규칙이 없다) */
export function bellSafe(c: LmSnap): boolean {
  return c.st === 'play' && c.act !== 3 && c.got * 2 >=LANDMARK.BELL.HOURS[c.wave % LANDMARK.BELL.HOURS.length];
}

/** prev(없으면 첫 틱) → cur 사이에 나야 할 소리. 같은 틱이거나 명물이 바뀌었으면 없다 */
export function landmarkSounds(prev: LmSnap | null, cur: LmSnap): LmSound[] {
  if (!prev || prev.id !== cur.id || cur.tick <= prev.tick) return [];
  const out: LmSound[] = [];
  // 막이 바뀌었다 — 몸에 도장 하나
  if (cur.act > prev.act) out.push({ name: 'stamp', semis: -5 });
  switch (cur.id) {
    case 'bell': {
      const hours = LANDMARK.BELL.HOURS[cur.wave % LANDMARK.BELL.HOURS.length];
      // 똑딱 — 초침이 한 칸 갈 때마다, 똑 · 딱 번갈아. 마지막 칸(cue 0)은 댕이 대신한다
      if (cur.st === 'play' && !cur.stack && cur.cue > 0 && cur.cue < prev.cue && cur.cue % CLOCK_STEP === 0) {
        out.push({ name: 'clockTick', semis: (cur.cue / CLOCK_STEP) % 2 === 0 ? 0 : -4 });
      }
      // 정각(2막) — 덩이가 떨어질 때가 가까울수록 똑딱이 잦아진다. 높은 똑딱이 겹친다
      if (cur.act === 2 && cur.diff !== 0 && cur.st === 'play' && cur.k > prev.k) {
        const every = blockTickEvery(blockProgress(hours, cur.k));
        if (every > 0 && cur.k % every === 0) out.push({ name: 'clockTick', semis: 9 });
      }
      // 댕 — 새 종이 빠졌다. 3막 시보는 쾅, 13시(쓰러진 뒤)는 소리 없이
      if (!prev.stack && cur.stack && cur.st !== 'down') {
        out.push(cur.act === 3 ? { name: 'bellBoom', semis: 7 } : { name: 'bellToss' });
      }
      // 공중 가드로 올린 종이 꽂혔다(2점) — 몸 울림 위에 댕댕 한 겹 더
      if (cur.hit && prev.flying && prev.stack && cur.st !== 'down') out.push({ name: 'bellTwin' });
      // 13시 종을 가드로 받았다
      if (cur.st === 'down' && prev.x === 2 && prev.stack && cur.guard) out.push({ name: 'bellClear' });
      // 내려찍기 예고 — 파를 절반도 못 꽂고 끝났다. 아케이드 집행기 예고음(낮은 으르렁)을 빌린다
      if (prev.st !== 'slam' && cur.st === 'slam') out.push({ name: 'bossTele' });
      // 「이번 파는 안전」 — 꽂은 수가 절반에 처음 닿은 틱(칸이 한 번 튀는 틱)
      if (bellSafe(cur) && !bellSafe(prev)) out.push({ name: 'uiOk' });
      break;
    }
    case 'wind': {
      // 휘파람 — 숨이 바뀔 때마다 한 음(첫 숨은 등장이 끝나는 틱)
      if (cur.wave !== prev.wave || (prev.st === 'enter' && cur.st === 'play')) {
        out.push({ name: cur.air === 0 ? 'windIn' : 'windOut', semis: WIND_NOTES[cur.wave % WIND_NOTES.length], dur: windNoteSec(cur) });
      }
      // 좌판이 가벼워졌다 — 확정 틱(uiOk)
      const light = LANDMARK.WIND.LIGHT[cur.diff];
      if (prev.k < light && cur.k >= light) out.push({ name: 'uiOk', semis: 5 });
      // 맞바람 — 탑에 튕겨 나왔다(퉁)
      if (cur.x > prev.x) out.push({ name: 'bellThud', semis: 4 });
      break;
    }
    case 'pagoda': {
      // 풍경 — 울림 창이 막 열렸다(cue가 올라간다. 베어서 닫히는 건 내려간다)
      if (cur.cue > prev.cue) out.push({ name: 'chime' });
      // 나무 소리 — 당김이 돌거나 땅이 임박하면 잦다
      const low = cur.sy >= 0 && cur.sy < PAGODA_LOW_Y;
      const every = cur.st === 'play' ? creakEvery(cur.piles, low, cur.act >= 2 && cur.diff !== 0) : 0;
      if (every > 0 && cur.tick % every === 0) out.push({ name: 'pagodaCreak', semis: -2 * Math.min(cur.piles, 3) - (low ? 3 : 0) });
      // 크게 띄웠다 — 탑이 비틀린다(견습은 기와가 없다)
      if (!prev.flying && cur.flying && cur.diff !== 0) out.push({ name: 'pagodaCreak', semis: -5 });
      break;
    }
    case 'crane': {
      if (cur.air === 0 && cur.stack && cur.st === 'play' && cur.tick % RATCHET_STEP === 0) {
        out.push({ name: 'craneRatchet', semis: bandSemis(cur.band) + ((cur.tick / RATCHET_STEP) % 2 === 0 ? 0 : 2) });
      }
      if (prev.air === 0 && cur.air === 1 && cur.stack) {
        // 줄이 끊겼으면(놓는 자리보다 한참 높다) 철컥 대신 탁
        out.push({ name: cur.sy > LANDMARK.CRANE.LOWER_TO + CUT_SLACK ? 'craneSnap' : 'craneClunk' });
      }
      // 반창 — 팔이 반만 꺾였다: 끼릭 두 번
      if (prev.cue !== 2 && cur.cue === 2) {
        out.push({ name: 'craneRatchet', semis: 0 }, { name: 'craneRatchet', semis: 4, delay: 0.1 });
      }
      break;
    }
  }
  return out;
}
