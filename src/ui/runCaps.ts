// 판 도중 자막(C11) — 콤보 100·500 첫 도달, 판 중 기록 돌파, 구역 도달. 판당 한 번씩.
// 순수 상태기계: 씬이 매 틱 관측값을 넣으면 띄울 자막(0~1개)을 돌려준다. 그리기는 hud.cap 이 맡는다.

import { CAPTIONS, regionOf } from '../content';
import { comboMilestone } from '../audio/consume';

export interface RunCap {
  text: string;
  /** 기록 돌파처럼 소리도 한 번 내야 하는 자막 (콤보 이정표 소리는 consume.ts 몫) */
  blip?: boolean;
}

export interface RunCapsInit {
  /** 이 판 시작 때의 최고 기록 — 판 도중 저장이 올려도 이 값으로 잰다 */
  prevBest: number;
  /** 기록에 들어가는 판인가 (작전·디버그 판은 false) */
  countsRecord: boolean;
}

export interface RunCapsInput {
  combo: number;
  score: number;
  /** 방금 닿은 구역 index — 이 틱에 구역이 바뀌었을 때만 */
  zone?: number;
}

export interface RunCaps {
  observe(i: RunCapsInput): RunCap[];
}

export function createRunCaps(init: RunCapsInit): RunCaps {
  let prevCombo = 0;
  const done = new Set<string>();
  const once = (key: string): boolean => {
    if (done.has(key)) return false;
    done.add(key);
    return true;
  };

  return {
    observe({ combo, score, zone }) {
      const m = comboMilestone(prevCombo, combo);
      prevCombo = combo;
      // 겹치면 하나만 — 기록 돌파가 제일 값지고, 콤보 큰 쪽, 구역 이름 순
      if (init.countsRecord && init.prevBest > 0 && score > init.prevBest && once('record')) {
        return [{ text: CAPTIONS.record, blip: true }];
      }
      if (m === 500 && once('c500')) return [{ text: CAPTIONS.combo500 }];
      if (m === 100 && once('c100')) return [{ text: CAPTIONS.combo100 }];
      if (zone !== undefined && once(`z${zone}`)) return [{ text: regionOf(zone).name }];
      return [];
    },
  };
}
