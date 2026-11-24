// 이벤트 스테이지(11-24 사용자 「아케이드 중간에 버터바챌린지가 왜 나와? … 이벤트 스테이지라는 항목으로」).
// 아케이드는 구역 경계 셋을 넘어 2막까지 가도 버터바(mode 'bonus')를 한 번도 안 탄다.
// 홈 일감 · 목록 · 저장 호환은 tests/home-logic.test.ts가 본다.
import { describe, expect, it } from 'vitest';
import { ACT1 } from '../src/config';
import { advance, makeState } from '../src/core/sim';
import { EMPTY_INPUT, type GameState, type InputFrame } from '../src/core/types';

/** 연타 + 비상 가드(act1curve 봇과 같은 정책) */
function bot(s: GameState): InputFrame {
  const i: InputFrame = { ...EMPTY_INPUT };
  if (s.player.pose === 'pinned') { i.guard = true; return i; }
  const st = s.stack;
  if (st && s.player.y <= 0 && st.vy < 0 && st.y <= 56 && s.guardGauge >= 25) i.guard = true;
  else i.attack = true;
  return i;
}

describe('아케이드엔 버터바가 끼지 않는다', () => {
  for (const seed of [1, 7, 18]) {
    it(`시드 ${seed}: 구역 경계 셋을 넘어 2막까지 — bonus 0번 · 구역 해금 1 · 2 · 3`, () => {
      const s = makeState({ seed });
      s.perk = { picked: [], seen: [], offer: null }; // 아케이드 판처럼 쪽지도 뜬다
      s.lives = 99;
      const unlocks: number[] = [];
      let bonusTicks = 0;
      let bonusEvents = 0;
      // 봇이 진짜로 치면서, 10초마다 점수를 1/8씩 얹어 2막 문턱까지 민다
      for (let t = 0; t < 60 * 60 * 3 && s.mode !== 'act2' && !s.over; t++) {
        if (t % 600 === 599) s.score += Math.ceil(ACT1.UNLOCK_SCORE / 8);
        advance(s, bot(s));
        if (s.mode === 'bonus') bonusTicks += 1;
        for (const e of s.events) {
          if (e.kind === 'bonusEnter') bonusEvents += 1;
          if (e.kind === 'chapterUnlock') unlocks.push(e.n ?? -1);
        }
        s.events.length = 0;
      }
      expect(s.mode).toBe('act2');
      expect(unlocks).toEqual([1, 2, 3]);
      expect(bonusTicks).toBe(0);
      expect(bonusEvents).toBe(0);
      expect(s.bonus).toBeNull();
    }, 60_000);
  }
});
