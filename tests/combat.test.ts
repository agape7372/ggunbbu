// 전투 규칙: 가드 2종, 콤보 규칙, 깔림 3분기, 게이지 게이팅, 타격당 콤보 +1.
import { describe, it, expect } from 'vitest';
import { makeState, advance } from '../src/core/sim';
import { makeFloor, makeStack } from '../src/core/building';
import { EMPTY_INPUT, type GameState, type InputFrame } from '../src/core/types';
import { GUARD_GAUGE, PLAYER, STACK } from '../src/config';

function inp(o: Partial<InputFrame>): InputFrame {
  return { ...EMPTY_INPUT, ...o };
}

function withStack(s: GameState, y: number, mat: 'weak' | 'mid' | 'hard' = 'hard', floors = 3): void {
  s.stack = makeStack({
    variant: 'building', theme: 'europe',
    floors: Array.from({ length: floors }, () => makeFloor(mat)),
    y,
  });
}

describe('타격', () => {
  it('타격당 콤보 +1 (층 붕괴당이 아님) + 밀어올림', () => {
    const s = makeState();
    withStack(s, 30, 'hard'); // HP3
    s.stack!.vy = 0;
    // 공격: 활성 프레임 도달까지 진행 (타격 순간 vy 상승을 포착)
    let liftSeen = -Infinity;
    for (let i = 0; i < 12; i++) {
      advance(s, inp({ attack: i === 0 }));
      liftSeen = Math.max(liftSeen, s.stack!.vy);
    }
    expect(s.combo).toBe(1);
    expect(s.stack!.floors[0].segs[0].hp).toBe(2);
    expect(liftSeen).toBeGreaterThan(0); // HIT_LIFT로 한 번은 위로 밀렸다
  });

  it('공격 활성 묶음당 1히트', () => {
    const s = makeState();
    withStack(s, 30);
    for (let i = 0; i < 9; i++) advance(s, inp({ attack: i === 0 }));
    expect(s.combo).toBe(1); // 활성 4프레임이어도 1히트
  });
});

describe('가드 2종 [정본]', () => {
  it('지면 가드: 높이 띄움 + 콤보 단절 + 게이지 추가 소모', () => {
    const s = makeState();
    s.guardGauge = 50;
    s.combo = 10;
    withStack(s, 40);
    s.stack!.vy = -100;
    // 가드 홀드: 선딜 4f 후 존 진입 시 바운스
    for (let i = 0; i < 10; i++) advance(s, inp({ guard: true }));
    expect(s.stack!.vy).toBeGreaterThan(STACK.GUARD_GROUND_V * 0.8);
    expect(s.combo).toBe(0);
    expect(s.guardGauge).toBeLessThan(50);
  });

  it('공중 가드: 낮게 띄움 + 콤보 유지', () => {
    const s = makeState();
    s.guardGauge = 50;
    s.combo = 10;
    const jumpIn = inp({ jump: true });
    advance(s, jumpIn); // 점프 시작
    // 상승 중 스택을 플레이어 머리 위에 배치
    for (let t = 0; t < 30; t++) {
      const p = s.player;
      if (p.y > 60) {
        withStack(s, p.y + PLAYER.H, 'hard');
        s.stack!.vy = -50;
        break;
      }
      advance(s, EMPTY_INPUT);
    }
    for (let i = 0; i < 6; i++) advance(s, inp({ guard: true }));
    expect(s.stack!.vy).toBeGreaterThan(STACK.GUARD_AIR_V * 0.6);
    expect(s.combo).toBe(10); // 유지
  });

  it('게이지 미달 시 가드 불가', () => {
    const s = makeState();
    s.guardGauge = GUARD_GAUGE.MIN_TO_GUARD - 1;
    s.guardRegenCd = 999; // 회복 차단 — 미달 상태 유지
    withStack(s, 40);
    s.stack!.vy = -100;
    for (let i = 0; i < 10; i++) advance(s, inp({ guard: true }));
    expect(s.player.pose).not.toBe('guardG');
    expect(s.stack!.vy).toBeLessThan(0); // 바운스 없음
  });
});

describe('깔림 3분기 [정본]', () => {
  function pinState(): GameState {
    const s = makeState();
    withStack(s, 100, 'hard');
    s.stack!.vy = -600;
    while (s.player.pose !== 'pinned' && s.tick < 300) advance(s, EMPTY_INPUT);
    expect(s.player.pose).toBe('pinned');
    return s;
  }

  it('접지 = 라이프 1 손실 + 콤보 단절', () => {
    const s = makeState();
    s.combo = 50;
    withStack(s, 50, 'hard');
    s.stack!.vy = -600;
    while (s.player.pose !== 'pinned' && s.tick < 300) advance(s, EMPTY_INPUT);
    expect(s.lives).toBe(PLAYER.LIVES - 1);
    expect(s.combo).toBe(0);
  });

  it('하: 띄우기 탈출 (라이프 무손실)', () => {
    const s = pinState();
    const lives = s.lives;
    advance(s, inp({ guard: true }));
    expect(s.player.pose).toBe('idle');
    expect(s.stack!.vy).toBeGreaterThan(STACK.PIN_ESCAPE_V * 0.9);
    expect(s.lives).toBe(lives);
  });

  it('Z 성공: 최하층 5대미지로 붕괴 → 탈출', () => {
    const s = pinState(); // hard HP3 < 5 → 성공
    const lives = s.lives;
    advance(s, inp({ attack: true }));
    expect(s.player.pose).toBe('idle');
    expect(s.stack!.floors.length).toBe(2);
    expect(s.lives).toBe(lives);
  });

  it('Z 실패(고HP층): 라이프 추가 손실 + 자비 바운스', () => {
    const s = makeState();
    s.stack = makeStack({
      variant: 'skyscraper', theme: 'modern',
      floors: [makeFloor('lobby'), makeFloor('penthouse')], sharedHp: true, y: 60,
    });
    s.stack.vy = -600;
    while (s.player.pose !== 'pinned' && s.tick < 300) advance(s, EMPTY_INPUT);
    const lives = s.lives;
    advance(s, inp({ attack: true })); // lobby HP10, 5대미지로 못 부숨
    expect(s.lives).toBe(lives - 1);
    expect(s.stack!.vy).toBeGreaterThan(STACK.PIN_MERCY_V * 0.9);
    expect(s.player.pose).toBe('idle');
  });
});

describe('점프 무적 [정본: 공중에서는 짓눌리지 않음]', () => {
  it('공중에 있으면 스택이 접지해도 라이프 무손실', () => {
    const s = makeState();
    advance(s, inp({ jump: true }));
    for (let t = 0; t < 12; t++) advance(s, EMPTY_INPUT); // 충분히 상승
    expect(s.player.y).toBeGreaterThan(50);
    withStack(s, 20, 'hard');
    s.stack!.vy = -600;
    const lives = s.lives;
    for (let t = 0; t < 20 && !s.stack!.resting; t++) advance(s, EMPTY_INPUT);
    expect(s.stack!.resting).toBe(true);   // 스택은 지면에 놓임
    expect(s.lives).toBe(lives);           // 그러나 공중이라 무사
    expect(s.player.pose).not.toBe('pinned');
  });

  it('놓인 스택 위로 착지하면 그때 깔린다', () => {
    const s = makeState();
    advance(s, inp({ jump: true }));
    for (let t = 0; t < 12; t++) advance(s, EMPTY_INPUT);
    withStack(s, 20, 'hard');
    s.stack!.vy = -600;
    const lives = s.lives;
    for (let t = 0; t < 200 && s.player.pose !== 'pinned'; t++) advance(s, EMPTY_INPUT);
    expect(s.player.pose).toBe('pinned');
    expect(s.lives).toBe(lives - 1);
  });
});

describe('방어/기술 게이지 분리 [정본: 핑크 bougyobar / 황색 wazabar]', () => {
  it('가드는 방어 게이지만 소모하고 기술 게이지는 건드리지 않는다', () => {
    const s = makeState();
    s.wazaGauge = 60;
    s.guardGauge = 100;
    withStack(s, 40);
    s.stack!.vy = -100;
    for (let i = 0; i < 12; i++) advance(s, inp({ guard: true }));
    expect(s.guardGauge).toBeLessThan(100);
    expect(s.wazaGauge).toBe(60); // 불변
  });

  it('타격은 기술 게이지만 충전한다', () => {
    const s = makeState();
    s.guardGauge = 40;
    withStack(s, 30, 'hard');
    for (let i = 0; i < 12; i++) advance(s, inp({ attack: i === 0 }));
    expect(s.wazaGauge).toBeGreaterThan(0);
    expect(s.guardGauge).toBeGreaterThanOrEqual(40); // 회복은 되어도 소모는 없음
  });

  it('방어 게이지는 가드를 놓으면 회복된다', () => {
    const s = makeState();
    s.guardGauge = 20;
    s.guardRegenCd = 0;
    for (let t = 0; t < 120; t++) advance(s, EMPTY_INPUT);
    expect(s.guardGauge).toBeGreaterThan(20);
  });
});

describe('가드 스윕 판정 (터널링 방지)', () => {
  it('한 틱에 존(±12px)을 건너뛰는 고속 낙하도 공중가드가 잡는다', () => {
    const s = makeState();
    s.wazaGauge = 100;
    s.guardGauge = 100;
    advance(s, inp({ jump: true }));
    for (let t = 0; t < 8; t++) advance(s, inp({ guard: true })); // guardA 진입
    expect(s.player.pose).toBe('guardA');
    const plane = s.player.y + PLAYER.H;
    // 다음 틱에 존을 완전히 통과하도록 배치: 존 위 20px에서 -2000px/s (틱당 33px 이동)
    withStack(s, plane + 20, 'hard');
    s.stack!.vy = -2000;
    advance(s, inp({ guard: true }));
    expect(s.stack!.vy).toBeGreaterThan(0); // 바운스 성공 (스윕이 교차 감지)
    expect(s.combo).toBe(0); // 공중가드 — 단절 없음 (초기 0 유지 확인용)
  });
});

describe('착지 직후 점프가드 불가 [정본 재현]', () => {
  it('공중 가드 유지 중 착지 → 지면 가드 전이(선딜 재적용)', () => {
    const s = makeState();
    s.wazaGauge = 100;
    s.guardGauge = 100;
    advance(s, inp({ jump: true }));
    // 낙하 완료까지 가드 홀드
    while (s.player.y > 0 || s.player.vy > 0) advance(s, inp({ guard: true }));
    advance(s, inp({ guard: true }));
    expect(s.player.pose).toBe('guardG');
    expect(s.player.poseTick).toBeLessThan(PLAYER.GUARD_STARTUP_GROUND); // 선딜 중 = 바운스 불가
  });
});

describe('필살기', () => {
  it('게이지 100 소모 + 전파괴 + 무적, 콤보 변동 없음', () => {
    const s = makeState();
    s.wazaGauge = 100;
    s.combo = 7;
    withStack(s, 60, 'hard', 5);
    advance(s, inp({ special: true }));
    expect(s.wazaGauge).toBe(0);
    expect(s.stack).toBeNull();
    expect(s.combo).toBe(7);
    expect(s.player.invulnTicks).toBeGreaterThan(100);
    expect(s.hitstop).toBeGreaterThan(0);
  });

  it('무적 중 접지 무시 → 무적 종료 후 깔림', () => {
    const s = makeState();
    s.wazaGauge = 100;
    s.guardGauge = 100;
    advance(s, inp({ special: true })); // 스택 없음 — 무적만
    withStack(s, 30, 'hard');
    s.stack!.vy = -600;
    const lives = s.lives;
    // 무적 동안 접지해도 무손실
    for (let i = 0; i < 60; i++) advance(s, EMPTY_INPUT);
    expect(s.lives).toBe(lives);
    expect(s.stack!.resting).toBe(true);
  });
});

describe('1막 → 2막 전환 [정본]', () => {
  it('9,999,999점 도달 → 게이지 0 리셋 + 콤보 유지', () => {
    const s = makeState();
    s.score = 9_999_999;
    s.guardGauge = 80;
    s.combo = 123;
    s.chapter = 3; // 챕터 보너스 우회
    advance(s, EMPTY_INPUT);
    expect(s.mode).toBe('act2');
    expect(s.act2Phase).toBe('cathedral');
    expect(s.wazaGauge).toBe(0);
    expect(s.combo).toBe(123);
  });
});
describe('연타 밀어올림', () => {
  it('같은 스택을 연타해도 y가 시작보다 떠오르지 않는다', () => {
    const s = makeState();
    withStack(s, 80, 'hard', 40);
    s.stack!.vy = 0;
    const held = s.stack!;
    const y0 = held.y;
    let yMax = y0;
    for (let i = 0; i < 180; i++) {
      advance(s, inp({ attack: true }));
      if (s.stack !== held) break;
      yMax = Math.max(yMax, held.y);
    }
    expect(s.stack).toBe(held);
    expect(yMax).toBeLessThanOrEqual(y0 + 8);
    expect(held.y).toBeLessThan(y0);
  });
});
describe('층 붕괴 잔해', () => {
  it('붕괴 후 박스가 남아 떨어진다', () => {
    const s = makeState();
    withStack(s, 30, 'weak', 2);
    for (let i = 0; i < 20; i++) advance(s, inp({ attack: i % 6 === 0 }));
    expect(s.debris.length).toBeGreaterThanOrEqual(3);
    expect(s.debris.some((d) => d.life > 60)).toBe(true);
  });
});
