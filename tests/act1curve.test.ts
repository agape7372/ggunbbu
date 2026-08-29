// 1막 점수 곡선 실측 + 토코톤 버터바 주기 왕복.
// 곡선 목표: 봇(이론 상한 ~6.7타/s 근사)이 10분 내 2막 해금(9,999,999) 사거리에 드는지 —
// 자릿수 이탈(노잼/순삭)을 커밋 단계에서 잡는 가드.
import { describe, it, expect } from 'vitest';
import { makeState, advance } from '../src/core/sim';
import { EMPTY_INPUT, type GameState, type InputFrame } from '../src/core/types';
import { ACT1, SCORE, TOKOTON } from '../src/config';

/** 1막 생존 정책: 연타 + 비상 가드 (act2run 스택 정책의 경량판) */
function act1Policy(s: GameState): InputFrame {
  const i: InputFrame = { ...EMPTY_INPUT };
  const p = s.player;
  if (p.pose === 'pinned') { i.guard = true; return i; }
  const st = s.stack;
  if (!st) { i.attack = true; return i; }
  if (p.y <= 0 && st.vy < 0 && st.y <= 56 && s.guardGauge >= 25) i.guard = true;
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
    s.guardGauge = 50;
    run(s, 60 * 60 * 10);
    // 실측 로그 (DEVLOG 기록용)
    // eslint-disable-next-line no-console
    console.log(`[curve] 10min: score=${s.score.toLocaleString()} combo=${s.combo} p=${s.p.toFixed(2)} chapter=${s.chapter} mode=${s.mode} over=${s.over}`);
    expect(s.over).not.toBe('gameover');
    // ★08-30 밴드 정직화: 봇은 콤보 유지를 못해(combo≈0~4) 점수가 층붕괴 보너스 위주 —
    // 실측 1.03M에 하한 1.0M은 3% 마진짜리 플레이키 관목이었다(검증 발견).
    // 봇 = 생존·자릿수 하한 가드일 뿐이고 인간 해금 체감은 콤보 산술이 지배
    // (BASE_HIT 30 × 평균콤보 150 × 5타/s ≈ 22.5K/s → ≈7.4분). 최종 판정 = 실플레이.
    expect(s.score).toBeGreaterThan(700_000);
    expect(s.score).toBeLessThan(ACT1.UNLOCK_SCORE); // 봇이 해금하면 인간은 순삭 — 상한 가드
  }, 60_000);

  it('3분 시점에 순삭 해금되지 않는다 (최소 플레이 타임 보장)', () => {
    const s = makeState({ seed: 7 });
    s.guardGauge = 50;
    run(s, 60 * 60 * 3);
    expect(s.score).toBeLessThan(ACT1.UNLOCK_SCORE);
  }, 30_000);

  it('토코톤: 챕터 순환 경계에서 버터바 타임 진입 → 토코톤 복귀', () => {
    const s = makeState({ seed: 3, mode: 'tokoton' });
    s.guardGauge = 100;
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

  it('토코톤 p>1 구간은 현대 테마 고정', () => {
    const s = makeState({ seed: 3, mode: 'tokoton' });
    s.score = ACT1.UNLOCK_SCORE + 1;
    s.stackSpawnCd = 1;
    advance(s, EMPTY_INPUT);
    expect(s.p).toBeGreaterThan(1);
    expect(s.chapter).toBe(ACT1.CHAPTER_THEMES.length - 1);
    for (let t = 0; t < 40 && !s.stack; t++) advance(s, EMPTY_INPUT);
    expect(s.stack?.theme).toBe('modern');
  });
});

// 08-30 검증 후속: 봇 밴드는 BASE_HIT 계열에 불감(봇 콤보≈4) — 인간 산술을 직접 가드
describe('인간 점수 산술 가드', () => {
  it('평균콤보 150·5타/s 기준 초당 점수가 15K~45K 밴드 (해금 체감 4~11분)', () => {
    const perSec = SCORE.BASE_HIT * 150 * 5;
    expect(perSec).toBeGreaterThanOrEqual(15_000); // BASE_HIT 3급 실수 → 노잼
    expect(perSec).toBeLessThanOrEqual(45_000);    // BASE_HIT 300급 실수 → 순삭
  });
});
