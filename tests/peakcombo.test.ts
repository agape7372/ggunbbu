// 이번 판 최고 콤보(peakCombo). 결과화면이 읽는 값이다.
// ★08-30 7차 사용자 판정: 결과화면 콤보가 **항상 0**이었다 — 죽는 히트가 `hurtPlayer` 안에서
// `breakCombo()` 를 먼저 부르고 그 다음 over 를 세우기 때문에, 화면이 읽던 `s.combo` 는 이미 0이었다.
// 그 전까지 이 경로를 가드하는 테스트가 0건이었다(결과화면 값은 헤드리스에서 아무도 안 봤다).
import { describe, it, expect } from 'vitest';
import { makeState, advance } from '../src/core/sim';
import { makeFloor, makeStack } from '../src/core/building';
import { breakCombo, hurtPlayer } from '../src/core/combat';
import { EMPTY_INPUT, type GameState, type InputFrame } from '../src/core/types';

function inp(o: Partial<InputFrame> = {}): InputFrame {
  return { ...EMPTY_INPUT, ...o };
}

function flushHitstop(s: GameState): void {
  while (s.hitstop > 0) advance(s, EMPTY_INPUT);
}

function withStack(s: GameState, y: number, mat: 'weak' | 'mid' | 'hard' = 'weak', floors = 6): void {
  s.stack = makeStack({
    variant: 'building', theme: 'europe',
    floors: Array.from({ length: floors }, () => makeFloor(mat)),
    y,
  });
  s.stack.vy = 0;
}

/** 스택을 때려 콤보를 n 이상 올린다 */
function raiseCombo(s: GameState, target: number): void {
  for (let i = 0; i < 400 && s.combo < target; i++) {
    if (!s.stack || s.stack.floors.length === 0) withStack(s, 30);
    s.stack!.vy = 0;
    advance(s, inp({ attack: true }));
    flushHitstop(s);
  }
}

describe('peakCombo — 이번 판 최고 콤보', () => {
  it('초기값 0, 타격을 따라 올라간다', () => {
    const s = makeState();
    expect(s.peakCombo).toBe(0);
    withStack(s, 30);
    raiseCombo(s, 3);
    expect(s.combo).toBeGreaterThanOrEqual(3);
    expect(s.peakCombo).toBe(s.combo);
  });

  it('★콤보가 끊겨도 최고치는 남는다 (결과화면이 0을 보던 원인)', () => {
    const s = makeState();
    withStack(s, 30);
    raiseCombo(s, 3);
    const peak = s.combo;
    expect(peak).toBeGreaterThanOrEqual(3);

    breakCombo(s);
    expect(s.combo).toBe(0);
    expect(s.peakCombo).toBe(peak);
  });

  it('★게임오버 시점에도 최고치가 살아 있다 — 죽는 히트가 콤보를 먼저 끊는다', () => {
    const s = makeState();
    withStack(s, 30);
    raiseCombo(s, 3);
    const peak = s.combo;

    // 라이프를 다 소진시켜 gameover 로 보낸다
    for (let i = 0; i < 10 && !s.over; i++) {
      s.player.invulnTicks = 0;
      hurtPlayer(s);
    }
    expect(s.over).toBe('gameover');
    expect(s.combo).toBe(0);          // 죽는 히트가 끊은 상태 — 결과화면이 이걸 읽으면 0이 뜬다
    expect(s.peakCombo).toBe(peak);   // 결과화면이 읽어야 하는 값
  });

  it('한 틱 안에서 올랐다가 끊겨도 잡힌다 (advance 말미 캡처만으로는 놓치는 경우)', () => {
    const s = makeState();
    s.combo = 7;                      // 타격 직후 같은 틱에 피격당하는 상황을 직접 구성
    s.player.invulnTicks = 0;
    hurtPlayer(s);                    // 내부에서 breakCombo
    expect(s.combo).toBe(0);
    expect(s.peakCombo).toBe(7);
  });

  it('최고치는 내려가지 않는다', () => {
    const s = makeState();
    s.combo = 12;
    breakCombo(s);
    s.combo = 4;
    breakCombo(s);
    expect(s.peakCombo).toBe(12);
  });
});
