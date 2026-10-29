import { describe, it, expect } from 'vitest';
import { makeState, advance } from '../src/core/sim';
import { makeFloor, makeStack } from '../src/core/building';
import { EMPTY_INPUT, type GameState, type InputFrame } from '../src/core/types';
import { GUARD_GAUGE, JUICE, PLAYER } from '../src/config';

function inp(o: Partial<InputFrame> = {}): InputFrame {
  return { ...EMPTY_INPUT, ...o };
}

// ★08-30 Wave 0 회귀 가드 — 구코드(8a9da28 cling·피어싱 착지·렌더 히트스톱)에서 빨갛다.
// ★08-30 개정(사용자 지시 "통과 안 하고 막히는 거"): 밑면은 **막힌다**로 계약이 바뀌었다.
// 바뀌지 않은 것 = cling이 죽인 것들: 접착·끌려 내려감·머리 위가 빈데도 점프가 소멸하는 것.
// ★10-28(원작 대조 검수 · 사용자 결정): 「끌려 내려감」은 **닿아 있고 밑면이 내려오는 동안만** 돌아왔다
// (원작 §5 세부 2 — player.ts carryUnderStack). 닿지 않았는데 붙는 것·위로 따라가는 것은 여전히 없다.
// 같은 날 공중 공격 관통도 거뒀다 — 공중 공격도 밑면에서 멈추고 박는 자리에서 밑층을 깎는다.
describe('Wave 0/08-30: 밑면은 막히되 접착은 없다', () => {
  it('머리 위가 비면 점프는 그대로다 — 정점 250px 이상', () => {
    const s = makeState();
    s.stackSpawnCd = 100000;
    advance(s, inp({ jump: true }));
    let maxY = 0;
    // ★원작 물리 도입(08-30): 정점 555px(8.2층)·체공 280f — 전 비행을 돌려 정점을 본다
    for (let i = 0; i < 320; i++) {
      advance(s, inp());
      maxY = Math.max(maxY, s.player.y);
    }
    expect(maxY).toBeGreaterThan(500);
  });

  it('낙하 건물 밑면에 부딪히면 거기서 멈춘다 (통과 금지)', () => {
    const s = makeState();
    s.stack = makeStack({
      variant: 'building',
      theme: 'europe',
      floors: [makeFloor('hard'), makeFloor('hard'), makeFloor('hard')],
      y: 140,
    });
    s.stack.vy = 0;
    s.stack.resting = true; // 진짜로 고정 — vy=0만으로는 중력이 계속 떨어뜨린다
    // (구 물리에선 플레이어가 빨라 이 전제 오류가 가려졌었다 — 원작 물리 도입이 드러냄)
    advance(s, inp({ jump: true }));
    let maxY = 0;
    for (let i = 0; i < 20; i++) {
      advance(s, inp());
      maxY = Math.max(maxY, s.player.y);
    }
    // 밑면(140) − 키(55) = 85가 상한. 그 위로는 한 픽셀도 못 올라간다.
    expect(maxY).toBeLessThanOrEqual(85 + 0.01);
    expect(maxY).toBeGreaterThan(70);
  });

  it('내려오는 밑면은 플레이어를 눌러 내린다 (계획 정본: 못 부수면 깔린다)', () => {
    const s = makeState();
    s.stack = makeStack({
      variant: 'building',
      theme: 'europe',
      floors: [makeFloor('hard'), makeFloor('hard')],
      y: 300,
    });
    s.stack.vy = -400;
    advance(s, inp({ jump: true }));
    let pressed = false;
    for (let i = 0; i < 120; i++) {
      advance(s, inp());
      // 밑면 바로 아래에 붙어 같이 내려오는 구간이 있어야 한다(눌림)
      if (s.player.y > 0 && Math.abs(s.player.y - (s.stack!.y - 55)) < 1.5) pressed = true;
      if (s.player.pose === 'pinned') break;
    }
    expect(pressed).toBe(true);
    expect(s.player.pose).toBe('pinned'); // 지면까지 눌리면 깔림
  });

  it('★그래도 접착은 아니다 — 밑면이 위로 도망가면 따라 올라가지 않는다', () => {
    const s = makeState();
    s.stack = makeStack({
      variant: 'building',
      theme: 'europe',
      floors: [makeFloor('hard'), makeFloor('hard'), makeFloor('hard')],
      y: 140,
    });
    s.stack.vy = 0;
    s.stack.resting = true; // 밑면 고정(위와 동일 이유)
    advance(s, inp({ jump: true }));
    for (let i = 0; i < 15; i++) advance(s, inp()); // 원작 물리로는 막힘 도달에 ~11틱
    // 밑면(140)에서 막힌 상태에서, 스택을 위로 밀어낸다(공격의 HIT_LIFT와 같은 방향)
    s.stack.y = 400;
    s.stack.vy = 300;
    const before = s.player.y;
    for (let i = 0; i < 10; i++) advance(s, inp());
    // 접착이면 밑면을 따라 400 근처로 끌려 올라갔을 것. 막힘은 붙지 않는다 — 그대로 낙하.
    expect(s.player.y).toBeLessThanOrEqual(before + 0.01);
  });

  it('공중 공격도 밑면에서 멈추고, 박는 자리에서 밑층을 깎는다 (10-28 — 관통 거둠)', () => {
    const s = makeState();
    s.stackSpawnCd = 100000;
    s.stack = makeStack({
      variant: 'building',
      theme: 'europe',
      floors: [makeFloor('weak'), makeFloor('weak'), makeFloor('weak')],
      y: 140,
    });
    s.stack.resting = true;
    s.stack.vy = 0;
    const floorsBefore = s.stack.floors.length;
    advance(s, inp({ jump: true }));
    // 상승 중에 공중 공격 개시(밑면 85에 닿기 전).
    for (let i = 0; i < 60 && s.player.y < 40; i++) advance(s, inp());
    advance(s, inp({ attack: true }));
    let maxY = 0;
    for (let i = 0; i < 25; i++) {
      // 타격은 스택을 밀어올린다(HIT_LIFT_V) — 매 틱 제자리에 못 박아 막힘 상한을 상수로 둔다.
      s.stack!.y = 140;
      s.stack!.vy = 0;
      s.stack!.resting = true;
      advance(s, inp());
      maxY = Math.max(maxY, s.player.y);
    }
    // 평범한 점프와 같은 막힘 상한(밑면140−키55=85) — 몸이 건물 속으로 들어가지 않는다
    expect(maxY).toBeLessThanOrEqual(85 + 0.01);
    // 그래도 깎는다 — 그냥 뛰면 박기만 하고, 뛰면서 베면 밑층이 준다(비대칭은 남는다)
    expect(s.stack!.floors.length).toBeLessThan(floorsBefore);
  });

  it('공중 공격 연타로도 몸이 건물 속에 안 들어간다 — 76px 파고듦·순간이동 재발 가드 (10-28)', () => {
    for (const mat of ['hard', 'weak'] as const) {
      const s = makeState();
      s.stackSpawnCd = 100000;
      s.stack = makeStack({
        variant: 'building',
        theme: 'europe',
        floors: [makeFloor(mat), makeFloor(mat), makeFloor(mat), makeFloor(mat), makeFloor(mat)],
        y: 420,
      });
      advance(s, inp({ jump: true }));
      let maxPen = 0;
      for (let t = 0; t < 200 && s.player.pose !== 'pinned'; t++) {
        advance(s, inp({ attack: t % 3 === 0 }));
        if (s.stack && s.player.y > 0) maxPen = Math.max(maxPen, s.player.y + PLAYER.H - s.stack.y);
      }
      expect(maxPen, mat).toBeLessThanOrEqual(0.5); // 옛 관통: 76px
    }
  });

  it('머리를 박은 뒤 내려오는 밑면에 붙어 지면까지 같이 내려간다 — 원작 §5 세부 2 (10-28)', () => {
    // ★옛 코드: 박고 7틱 만에 떨어져 나가 건물보다 먼저 착지했다(5차 중력 1735 > 건물 낙하).
    const s = makeState();
    s.stackSpawnCd = 100000;
    s.stack = makeStack({
      variant: 'building',
      theme: 'europe',
      floors: [makeFloor('hard'), makeFloor('hard'), makeFloor('hard'), makeFloor('hard')],
      y: 260,
    });
    advance(s, inp({ jump: true }));
    let bonked = false;
    let carried = 0;
    for (let i = 0; i < 300 && s.player.pose !== 'pinned'; i++) {
      const before = s.events.length;
      advance(s, inp());
      if (s.events.slice(before).some((e) => e.kind === 'headBonk')) bonked = true;
      if (bonked && s.player.y > 0) {
        // 밑면에서 떨어져 나가지도, 밑면 위로 겹쳐 그려지지도 않는다
        expect(Math.abs(s.stack!.y - (s.player.y + PLAYER.H))).toBeLessThan(0.5);
        carried += 1;
      }
    }
    expect(bonked).toBe(true);
    expect(carried).toBeGreaterThan(10);
    expect(s.player.pose).toBe('pinned'); // 못 부수고 버티기만 하면 깔린다
  });

  it('붙어 내려가다 공중 가드를 쥐면 건물을 띄우고 빠져나온다 (10-28)', () => {
    const s = makeState();
    s.stackSpawnCd = 100000;
    s.stack = makeStack({
      variant: 'building',
      theme: 'europe',
      floors: [makeFloor('hard'), makeFloor('hard'), makeFloor('hard'), makeFloor('hard')],
      y: 260,
    });
    advance(s, inp({ jump: true }));
    let carried = 0;
    for (let i = 0; i < 100 && carried < 5; i++) {
      advance(s, inp());
      if (s.player.y > 0 && Math.abs(s.stack!.y - (s.player.y + PLAYER.H)) < 0.5) carried += 1;
    }
    expect(carried).toBe(5); // 붙어 내려가는 중
    let bounced = false;
    for (let i = 0; i < 8 && !bounced; i++) {
      const before = s.events.length;
      advance(s, inp({ guard: true }));
      bounced = s.events.slice(before).some((e) => e.kind === 'guardAirBounce');
    }
    expect(bounced).toBe(true);
    for (let i = 0; i < 120 && s.player.y > 0; i++) advance(s, inp());
    expect(s.player.y).toBe(0);
    expect(s.player.pose).not.toBe('pinned');
    expect(s.stack!.y).toBeGreaterThan(PLAYER.H); // 건물보다 먼저 내려와 섰다
  });

  it('정지 스택 아래에서도 점프는 즉시 발동한다 (13px 홉 소멸 방지)', () => {
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
    let maxY = 0;
    for (let i = 0; i < 20; i++) {
      advance(s, inp());
      maxY = Math.max(maxY, s.player.y);
    }
    // 밑면 200 − 키 55 = 145까지는 오른다(막힌 뒤엔 곧장 내려오므로 순간값이 아니라 정점을 본다).
    // 13px 홉으로 죽지 않는다.
    expect(maxY).toBeGreaterThan(120);
    expect(maxY).toBeLessThanOrEqual(145 + 0.01);
    expect(s.player.pose).toBe('jump');
  });
});

// ★09-05(P2-1): 가드 브레이크가 공중에서 'idle'로 복귀하던 결함.
// 'idle'은 지면 상태다 — 그 위에서 공격하면 attackFromAir가 죽어 지면 공격으로 셈되고
// (10-28부터 지면 공격 중엔 점프 버퍼가 묶인다), 가드를 누르면 허공인데도 지면가드(guardG)가 성립한다.
describe('공중 가드 브레이크는 점프 상태로 복귀한다 (09-05 P2-1)', () => {
  /** 공중에서 게이지를 터뜨려 guardBreak 스턴이 끝난 직후 상태를 만든다. */
  function airGuardBreakDone(): GameState {
    const s = makeState();
    s.stackSpawnCd = 100000;
    advance(s, inp({ jump: true }));
    advance(s, inp({ guard: true }));
    expect(s.player.pose).toBe('guardA'); // 공중 가드 진입 확인
    s.guardGauge = 0.2; // 다음 틱에 터지도록 — 홀드 소모(22/s)를 100틱 기다리지 않는다
    advance(s, inp({ guard: true }));
    expect(s.player.pose).toBe('guardBreak');
    // 스턴(20f) 종료까지 방치. 이 동안에도 계속 상승 중이다(체공 96f).
    for (let i = 0; i < 60 && s.player.pose === 'guardBreak'; i++) advance(s, EMPTY_INPUT);
    expect(s.player.pose).not.toBe('guardBreak');
    expect(s.player.y).toBeGreaterThan(0); // 아직 공중 — 전제가 깨지면 테스트 자체가 무의미
    return s;
  }

  it('스턴이 끝나도 공중이면 pose는 jump다 (구코드는 idle)', () => {
    const s = airGuardBreakDone();
    expect(s.player.pose).toBe('jump');
  });

  it('이어지는 공격은 attackFromAir=true — 밑면에서 멈추고 층을 깎는다', () => {
    const s = airGuardBreakDone();
    // 머리 위 24px에 밑면이 오도록 정지 스택을 놓는다. 평범한 점프의 상한 = ceil.
    const ceil = s.player.y + 24;
    const stackY = ceil + PLAYER.H;
    s.stack = makeStack({
      variant: 'building',
      theme: 'europe',
      floors: [makeFloor('weak'), makeFloor('weak'), makeFloor('weak')],
      y: stackY,
    });
    s.stack.resting = true;
    s.stack.vy = 0;
    const floorsBefore = s.stack.floors.length;

    advance(s, inp({ attack: true }));
    expect(s.player.attackFromAir).toBe(true); // ★핵심: idle 복귀면 false가 된다

    let maxY = 0;
    for (let i = 0; i < 20; i++) {
      // 타격은 스택을 밀어올린다(HIT_LIFT_V) — 매 틱 제자리에 못 박아 ceil을 상수로 만든다.
      s.stack!.y = stackY;
      s.stack!.vy = 0;
      s.stack!.resting = true;
      advance(s, EMPTY_INPUT);
      maxY = Math.max(maxY, s.player.y);
    }
    expect(maxY).toBeLessThanOrEqual(ceil + 0.01); // 막힘 상한에서 멈춘다(10-28 관통 거둠)
    expect(s.stack!.floors.length).toBeLessThan(floorsBefore);
  });

  it('이어지는 가드는 공중가드(guardA)다 — 허공에서 지면가드가 서지 않는다', () => {
    const s = airGuardBreakDone();
    s.guardGauge = GUARD_GAUGE.MAX; // 터뜨린 게이지를 되돌려 진입 문턱을 통과시킨다
    advance(s, inp({ guard: true }));
    expect(s.player.pose).toBe('guardA');
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
    for (let i = 0; i < 400 && s.player.y > 0; i++) advance(s, inp()); // 체공 280f(원작 물리)
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

// ★08-30 검증 후속 가드
describe('검증 후속 (08-30)', () => {
  it('히트스톱 중에도 입력 버퍼가 수집되어 종료 후 해소된다 (불변식 가드)', () => {
    const s = makeState();
    s.hitstop = 4;
    advance(s, inp({ jump: true })); // 히트스톱 틱 — 버퍼만 수집
    expect(s.player.bufJump).toBeGreaterThan(0);
    for (let i = 0; i < 5; i++) advance(s, inp());
    expect(s.player.pose).toBe('jump'); // 버퍼가 살아남아 점프 발동
  });

  it('돌더미에 깔린 동안 후속 화산탄은 직격하지 않고 적재만 된다', () => {
    const s = makeState();
    s.stackSpawnCd = 100000;
    s.groundRocks = 1;
    advance(s, inp({ jump: true }));
    for (let i = 0; i < 400 && s.player.y > 0; i++) advance(s, inp()); // 체공 280f(원작 물리)
    expect(s.player.pose).toBe('pinned');
    const lives = s.lives;
    s.entities.push({ kind: 'rock', lane: 0, y: 6, vy: -300, hp: 2 });
    s.mode = 'act2';
    s.act2Phase = 'rock';
    // rock 착지는 act2 stepEntities 경로 — rocks<24로 두어 페이즈 전환(더미 초기화) 방지
    s.act2c = { spawned: true, bolts: 0, rocks: 0, cd: 99999, t: 0 };
    for (let i = 0; i < 10; i++) advance(s, inp());
    expect(s.lives).toBe(lives); // 직격 없음
    expect(s.groundRocks).toBe(2); // 적재만
  });

  it('토코톤 사이클 경계가 히트스톱에 삼켜져도 버터바가 소실되지 않는다', () => {
    const s = makeState({ mode: 'tokoton' });
    s.stackSpawnCd = 100000;
    // 경계 직전 틱으로 점프시키고 경계 틱을 히트스톱으로 삼키게 한다
    s.tick = 7199 - 2;
    s.hitstop = 4; // 7198~7201 틱이 스킵 — 구코드는 % 일치 실패로 사이클 소실
    for (let i = 0; i < 10; i++) advance(s, inp());
    expect(s.mode).toBe('bonus');
  });
});
