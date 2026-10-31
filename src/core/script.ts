// 작업 지시서 대본 — 손으로 짠 고정 순서. 난수가 없어 모두가 같은 판을 받는다(공략 · 기록이 같은 판 위에서 겨룬다).
// 토큰은 빈칸으로 나눈다. 앞 걸음이 다 치워져야 다음 걸음이 나온다. 정본 설명 = docs/STAGES_2026-10-31.md §3.
//   층 글자(아래 → 위)  w 약 · m 중 · h 강                   예) wwm
//   끝 !                빠른 낙하                             예) hh!
//   끝 ~                성급한 건물(최하층 HP1로 오래 두면 급락)  예) mhm~
//   앞 >                바로 이어서(대기를 짧게)              예) >ww
//   Z · Z3              번개 1발 · 3발
//   R · R4              화산탄 1 · 4
//   . · ..              쉼 한 박 · 두 박
//   +                   이으면 같이 나온다                    예) wm+R2
// 틀린 토큰은 던진다 — 대본은 개발자가 쓰고 테스트가 전부 읽어 본다.

import type { Material } from './types';

export type ScriptItem =
  | { k: 'build'; floors: Material[]; fast: boolean; hasty: boolean }
  | { k: 'bolt'; n: number }
  | { k: 'rock'; n: number }
  | { k: 'rest'; beats: number };

/** 같이 나오는 묶음 하나. joined = 앞 걸음을 치우자마자 짧은 대기로 나온다 */
export interface ScriptStep { items: ScriptItem[]; joined: boolean }

const FLOOR: Readonly<Record<string, Material>> = { w: 'weak', m: 'mid', h: 'hard' };

function parseItem(tok: string): ScriptItem {
  if (/^\.+$/.test(tok)) return { k: 'rest', beats: tok.length };
  const hz = /^([ZR])(\d*)$/.exec(tok);
  if (hz) {
    const n = hz[2] ? Number(hz[2]) : 1;
    if (!(n >= 1 && n <= 12)) throw new Error(`대본: 개수 범위 밖 「${tok}」`);
    return { k: hz[1] === 'Z' ? 'bolt' : 'rock', n };
  }
  const b = /^([wmh]+)(!?)(~?)$/.exec(tok);
  if (b) {
    if (b[1].length > 12) throw new Error(`대본: 층이 너무 많다 「${tok}」`);
    return { k: 'build', floors: [...b[1]].map((c) => FLOOR[c]), fast: b[2] === '!', hasty: b[3] === '~' };
  }
  throw new Error(`대본: 모르는 토큰 「${tok}」`);
}

export function parseScript(src: string): ScriptStep[] {
  const steps: ScriptStep[] = [];
  for (const raw of src.trim().split(/\s+/)) {
    if (!raw) continue;
    const joined = raw.startsWith('>');
    const items = (joined ? raw.slice(1) : raw).split('+').map(parseItem);
    if (items.some((it) => it.k === 'rest') && (items.length > 1 || joined)) throw new Error(`대본: 쉼은 잇지 않는다 「${raw}」`);
    if (items.filter((it) => it.k === 'build').length > 1) throw new Error(`대본: 건물은 한 걸음에 하나 「${raw}」`);
    steps.push({ items, joined });
  }
  return steps;
}

/** 대본의 건물 수 · 층 수 · HP 합(타격 수 하한) · 위험물 수 — 기한 목표의 근거 */
export function scriptStats(steps: readonly ScriptStep[], hp: Readonly<Record<string, number>>): {
  buildings: number; floors: number; hits: number; hazards: number;
} {
  let buildings = 0;
  let floors = 0;
  let hits = 0;
  let hazards = 0;
  for (const step of steps) {
    for (const it of step.items) {
      if (it.k === 'build') {
        buildings += 1;
        floors += it.floors.length;
        for (const m of it.floors) hits += hp[m];
      } else if (it.k === 'bolt' || it.k === 'rock') hazards += it.n;
    }
  }
  return { buildings, floors, hits, hazards };
}
