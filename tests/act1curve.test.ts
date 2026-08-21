// 1막 점수 곡선 실측 + 토코톤 버터바 주기 왕복.
// 곡선 목표: 봇(이론 상한 ~6.7타/s 근사)이 10분 내 2막 해금(9,999,999) 사거리에 드는지 —
// 자릿수 이탈(노잼/순삭)을 커밋 단계에서 잡는 가드.
import { describe, it, expect } from 'vitest';
import { makeState, advance } from '../src/core/sim';
import { EMPTY_INPUT, type GameState, type InputFrame } from '../src/core/types';
import { ACT1, TOKOTON } from '../src/config';

/** 1막 생존 정책: 연타 + 비상 가드 (act2run 스택 정책의 경량판) */
function act1Policy(s: GameState): InputFrame {
  const i: InputFrame = { ...EMPTY_INPUT };
  const p = s.player;
  if (p.pose === 'pinned') { i.guard = true; return i; }
  const st = s.stack;
  if (!st) { i.attack = true; return i; }
  if (p.y <= 0 && st.vy < 0 && st.y <= 56 && s.gauge >= 25) i.guard = true;
  else i.attack = true;
  return i;
}

function run(s: GameState, ticks: number): void {
  for (let t = 0; t < ticks && !s.over; t++) {
    advance(s, act1Policy(s));
    s.events.length = 0;
  }
}

describe('1막 곡선/토코톤', () => {
  it('10분 실측: 점수가 2막 해금 사거리(±1자릿수) 안', () => {
    const s = makeState({ seed: 99 });
    s.gauge = 50;
    run(s, 60 * 60 * 10);
    // 실측 로그 (DEVLOG 기록용)
    // eslint-disable-next-line no-console
    console.log(`[curve] 10min: score=${s.score.toLocaleString()} combo=${s.combo} p=${s.p.toFixed(2)} chapter=${s.chapter} mode=${s.mode} over=${s.over}`);
    expect(s.over).not.toBe('gameover');
    // 자릿수 가드: 10분에 1M 미만(너무 느림)도, 시작 3분 내 해금(순삭)도 곡선 붕괴
    expect(s.score).toBeGreaterThan(1_000_000);
  }, 60_000);

  it('3분 시점에 순삭 해금되지 않는다 (최소 플레이 타임 보장)', () => {
    const s = makeState({ seed: 7 });
    s.gauge = 50;
    run(s, 60 * 60 * 3);
    expect(s.score).toBeLessThan(ACT1.UNLOCK_SCORE);
  }, 30_000);

  it('토코톤: 챕터 순환 경계에서 버터바 타임 진입 → 토코톤 복귀', () => {
    const s = makeState({ seed: 3, mode: 'tokoton' });
    s.gauge = 100;
    let sawBonus = false;
    for (let t = 0; t < TOKOTON.CHAPTER_CYCLE_TICKS + 60 * 60 && !s.over; t++) {
      advance(s, act1Policy(s));
      s.events.length = 0;
      if (s.mode === 'bonus') sawBonus = true;
      if (sawBonus && s.mode === 'tokoton') break;
    }
    expect(sawBonus).toBe(true);
    expect(s.mode).toBe('tokoton');
    expect(s.over).not.toBe('gameover');
    expect(s.bonus).toBeNull();
  }, 60_000);
});
