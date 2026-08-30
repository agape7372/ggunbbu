// 깔림 방치 사이클 — 퉁(라이프 −1 + 자비 바운스) → 창 → 쿵(재깔림 + 라이프 −1).
//
// ★08-30 4차 [사용자 증언]: "라이프 깎이면서 바닥에 퉁 하고 살짝 떴다가, 못 막거나 못 부수면
// 다시 쿵 하고 또 깔리면서 라이프 깎이는데 여기선 없네."
// 그 전까지 `PLAYER.PIN_REPEAT_TICKS`를 가드하는 테스트가 **0건**이었다 — act1curve/act2run 정책은
// pose==='pinned'면 즉시 guard=true를 반환해 방치 루프를 한 번도 안 탄다. 회귀가 나도 아무도 못 잡는다.
import { describe, it, expect } from 'vitest';
import { makeState, advance } from '../src/core/sim';
import { makeFloor, makeStack } from '../src/core/building';
import { EMPTY_INPUT, type GameState, type InputFrame } from '../src/core/types';
import { PLAYER, STACK } from '../src/config';

function inp(o: Partial<InputFrame> = {}): InputFrame {
  return { ...EMPTY_INPUT, ...o };
}

/** 낙하 건물에 실제로 깔린 상태를 만든다(직접 상태 주입이 아니라 시뮬을 돌려서). */
function pinnedByStack(lives = 9): GameState {
  const s = makeState();
  s.lives = lives; // 사이클을 여러 바퀴 보려면 라이프가 넉넉해야 한다
  s.stack = makeStack({
    variant: 'building', theme: 'europe',
    floors: [makeFloor('hard'), makeFloor('hard'), makeFloor('hard')],
    y: 100,
  });
  s.stack.vy = -600;
  while (s.player.pose !== 'pinned' && s.tick < 300) advance(s, EMPTY_INPUT);
  expect(s.player.pose).toBe('pinned');
  return s;
}

/** 조건이 참이 될 때까지 아무것도 안 누르고 방치. 도달 못 하면 실패하도록 tick 상한을 반환. */
function neglectUntil(s: GameState, pred: (s: GameState) => boolean, cap = 400): number {
  for (let i = 0; i < cap; i++) {
    advance(s, EMPTY_INPUT);
    if (pred(s)) return i + 1;
  }
  return -1;
}

describe('깔림 방치 사이클 (08-30 4차)', () => {
  it('퉁 — 120f 방치하면 라이프가 깎이고 건물이 튕겨 오른다', () => {
    const s = pinnedByStack();
    const lives = s.lives;
    const ticks = neglectUntil(s, (x) => x.player.pose === 'idle');
    expect(ticks).toBeGreaterThan(0); // 영원히 깔린 채로 있지 않는다

    expect(s.lives).toBe(lives - 1);
    expect(s.stack!.vy).toBeGreaterThan(STACK.PIN_MERCY_V * 0.9); // Z 실패와 같은 자비 바운스
    expect(s.stack!.resting).toBe(false);
    expect(s.player.invulnTicks).toBe(PLAYER.PIN_TIMEOUT_IFRAMES);
  });

  it('퉁은 방치 주기(PIN_REPEAT_TICKS)에 맞춰 온다 — 즉시도 아니고 영영도 아니다', () => {
    const s = pinnedByStack();
    const ticks = neglectUntil(s, (x) => x.player.pose === 'idle');
    // 히트스톱(진입 hurt 4f)이 섞여 정확히 120f는 아니다 — 주기의 사거리 안이면 된다.
    expect(ticks).toBeGreaterThan(PLAYER.PIN_REPEAT_TICKS * 0.8);
    expect(ticks).toBeLessThan(PLAYER.PIN_REPEAT_TICKS * 1.5);
  });

  it('쿵 — 튕긴 건물이 다시 내려앉아 재깔림 + 라이프 또 −1 (사이클이 닫힌다)', () => {
    const s = pinnedByStack();
    expect(neglectUntil(s, (x) => x.player.pose === 'idle')).toBeGreaterThan(0);
    const afterBounce = s.lives;

    // 아무것도 안 누르고 계속 방치 — 건물이 되돌아와 다시 깔아야 한다
    const back = neglectUntil(s, (x) => x.player.pose === 'pinned');
    expect(back).toBeGreaterThan(0);
    expect(s.lives).toBe(afterBounce - 1);
    expect(s.stack!.resting).toBe(true);
  });

  it('퉁 이후 창에서 가드를 누르면 산다 — 손실 없이 탈출', () => {
    const s = pinnedByStack();
    expect(neglectUntil(s, (x) => x.player.pose === 'idle')).toBeGreaterThan(0);
    while (s.hitstop > 0) advance(s, EMPTY_INPUT);
    const lives = s.lives;

    // 지면 가드 — 건물이 내려오면 바운스로 받아낸다
    for (let i = 0; i < 90 && s.player.pose !== 'pinned'; i++) advance(s, inp({ guard: true }));
    expect(s.player.pose).not.toBe('pinned');
    expect(s.lives).toBe(lives); // 창이 실제로 열려 있다
  });

  it('연출 배선 — 방치 손실은 hurt 이벤트를 낸다 (lifeLost 단독은 JUICE 항목이 없다)', () => {
    const s = pinnedByStack();
    s.events.length = 0; // 진입 시 발행분을 비우고 방치분만 본다
    expect(neglectUntil(s, (x) => x.player.pose === 'idle')).toBeGreaterThan(0);
    expect(s.events.some((e) => e.kind === 'hurt')).toBe(true);
    expect(s.events.some((e) => e.kind === 'lifeLost')).toBe(true);
  });

  it('돌더미 깔림은 튕기지 않는다 — 라이프만 깎이고 깔린 채로 (회귀 가드)', () => {
    const s = makeState();
    s.lives = 9;
    s.stackSpawnCd = 100000;
    s.groundRocks = 2;
    s.player.pose = 'pinned';
    s.player.pinTick = 0;
    const lives = s.lives;

    const ticks = neglectUntil(s, (x) => x.lives < lives);
    expect(ticks).toBeGreaterThan(0);
    expect(s.player.pose).toBe('pinned'); // 튕길 대상이 없다 — 풀려나지 않는다
    expect(s.stack).toBeNull();
  });
});
