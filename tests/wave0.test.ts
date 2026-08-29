import { describe, it, expect } from 'vitest';
import { makeState, advance } from '../src/core/sim';
import { makeFloor, makeStack } from '../src/core/building';
import { EMPTY_INPUT, type InputFrame } from '../src/core/types';
import { JUICE } from '../src/config';

function inp(o: Partial<InputFrame> = {}): InputFrame {
  return { ...EMPTY_INPUT, ...o };
}

// ★08-30 Wave 0 회귀 가드 — 셋 다 구코드(8a9da28 cling·피어싱 착지·렌더 히트스톱)에서 빨갛다.
describe('Wave 0: 점프 부활 (cling 삭제)', () => {
  it('낙하 건물 아래서 점프해도 잡아먹히지 않는다 — 정점 250px 이상', () => {
    const s = makeState();
    s.stack = makeStack({
      variant: 'building',
      theme: 'europe',
      floors: [makeFloor('hard'), makeFloor('hard'), makeFloor('hard')],
      y: 140,
    });
    s.stack.vy = -100;
    advance(s, inp({ jump: true }));
    let maxY = 0;
    for (let i = 0; i < 35; i++) {
      advance(s, inp());
      maxY = Math.max(maxY, s.player.y);
    }
    // 구코드: 밑면 접착으로 y≈85(140−55)에 고정. 신코드: 관통해 정상 탄도.
    expect(maxY).toBeGreaterThan(250);
  });

  it('정지 스택 옆에서도 점프가 즉시 발동한다 (13px 홉 소멸 방지)', () => {
    const s = makeState();
    s.stack = makeStack({
      variant: 'building',
      theme: 'europe',
      floors: [makeFloor('hard'), makeFloor('hard')],
      y: 200,
    });
    s.stack.resting = true;
    s.stack.vy = 0;
    advance(s, inp({ jump: true }));
    for (let i = 0; i < 20; i++) advance(s, inp());
    // 구코드: cling이 y=145(200−55)에 스냅해 vy=0. 신코드: 20틱이면 상승 중(y>200도 가능).
    expect(s.player.y).toBeGreaterThan(150);
    expect(s.player.pose).toBe('jump');
  });
});

describe('Wave 0: 화산탄 더미 착지 = 깔림 (연쇄 피격 아님)', () => {
  function landOnRocks(): ReturnType<typeof makeState> {
    // 착지 검사(sim)는 모드 무관(bonus 제외) — act1에서 스폰만 막고 더미를 놓는다.
    const s = makeState();
    s.stackSpawnCd = 100000;
    s.groundRocks = 2;
    s.lives = 3;
    advance(s, inp({ jump: true }));
    for (let i = 0; i < 200 && s.player.y > 0; i++) advance(s, inp());
    return s;
  }

  it('착지 순간 hurtPlayer 직행이 아니라 PINNED로 들어간다', () => {
    const s = landOnRocks();
    expect(s.player.pose).toBe('pinned');
    expect(s.lives).toBe(2); // 깔림 진입 = 라이프 1 손실 [정본], 그 이상 아님
  });

  it('가드(하)로 몸을 빼면 무적과 함께 탈출한다', () => {
    const s = landOnRocks();
    while (s.hitstop > 0) advance(s, inp()); // 깔림 진입 히트스톱 소진
    advance(s, inp({ guard: true }));
    expect(s.player.pose).not.toBe('pinned');
    expect(s.player.invulnTicks).toBeGreaterThan(0);
  });

  it('공격(Z)은 최상단 돌을 부수고 탈출한다', () => {
    const s = landOnRocks();
    while (s.hitstop > 0) advance(s, inp()); // 깔림 진입 히트스톱 소진
    advance(s, inp({ attack: true }));
    expect(s.player.pose).not.toBe('pinned');
    expect(s.groundRocks).toBe(1);
  });
});

describe('Wave 0: 히트스톱은 core가 주입한다 (P0-5)', () => {
  it('타격 이벤트 틱에 s.hitstop이 JUICE.hit만큼 찬다', () => {
    const s = makeState();
    s.stack = makeStack({
      variant: 'building',
      theme: 'europe',
      floors: [makeFloor('weak'), makeFloor('weak')],
      y: 30,
    });
    let sawHitstop = 0;
    for (let i = 0; i < 30; i++) {
      advance(s, inp({ attack: i % 3 === 0 }));
      sawHitstop = Math.max(sawHitstop, s.hitstop);
      if (sawHitstop > 0) break;
    }
    expect(sawHitstop).toBeGreaterThanOrEqual(JUICE.hit.hitstop);
  });
});
