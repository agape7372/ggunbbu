import { describe, it, expect } from 'vitest';
import { makeState, advance } from '../src/core/sim';
import { makeFloor, makeStack } from '../src/core/building';
import { EMPTY_INPUT, type InputFrame } from '../src/core/types';
import { PLAYER } from '../src/config';

function inp(o: Partial<InputFrame> = {}): InputFrame {
  return { ...EMPTY_INPUT, ...o };
}

describe('층 밀착', () => {
  it('공격 없이 점프하면 층 밑면에 막히고 y는 0 아래로 안 내려간다', () => {
    const s = makeState();
    s.stack = makeStack({
      variant: 'building',
      theme: 'europe',
      floors: [makeFloor('hard'), makeFloor('hard'), makeFloor('hard')],
      y: 200,
    });
    s.stack.resting = true;
    s.stack.vy = 0;

    advance(s, inp({ jump: true }));
    for (let i = 0; i < 90; i++) advance(s, inp());

    expect(s.player.y).toBeGreaterThan(0);
    expect(s.player.y + PLAYER.H).toBeLessThanOrEqual(200 + 1);
    expect(s.player.pose).not.toBe('pinned');
    expect(s.over).toBeNull();
  });

  it('공중에서 밑면에 닿으면 스택과 같이 탄다', () => {
    const s = makeState();
    s.stack = makeStack({
      variant: 'building',
      theme: 'europe',
      floors: [makeFloor('hard'), makeFloor('hard'), makeFloor('hard')],
      y: 200,
    });
    s.stack.resting = true;
    s.stack.vy = 0;
    s.player.y = 80;
    s.player.vy = 600;
    s.player.pose = 'jump';

    for (let i = 0; i < 45; i++) advance(s, inp());

    expect(s.player.y).toBeGreaterThan(0);
    expect(s.player.y + PLAYER.H).toBeCloseTo(200, 0);
    expect(s.player.vy).toBe(0);
  });

  it('공격 활성 중에는 층을 베고 올라간다', () => {
    const s = makeState();
    s.stack = makeStack({
      variant: 'building',
      theme: 'europe',
      floors: [makeFloor('weak'), makeFloor('weak'), makeFloor('weak')],
      y: 200,
    });
    s.stack.resting = true;
    s.stack.vy = 0;
    const floors0 = s.stack.floors.length;

    advance(s, inp({ jump: true }));
    for (let i = 0; i < 20; i++) advance(s, inp());
    for (let i = 0; i < 12; i++) advance(s, inp({ attack: i === 0 }));

    expect(s.stack === null || (s.stack.floors.length < floors0) || s.combo >= 1).toBe(true);
  });
});
