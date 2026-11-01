// 명물 보스 넷 + 본사 집행기 — 봇이 깨는가, 공략 장치가 말한 대로 도는가. 정본 = docs/STAGES_2026-10-31.md §6.
import { describe, it, expect } from 'vitest';
import type { GameState, InputFrame } from '../src/core/types';
import { EMPTY_INPUT } from '../src/core/types';
import { makeState, advance } from '../src/core/sim';
import { stageSeed, startStage, judgeStage } from '../src/core/stage';
import { stepEntities } from '../src/core/act2';
import { makeFloor, makeStack } from '../src/core/building';
import { lmAct } from '../src/core/landmark';
import { LANDMARK, STAGE, VIEW, WAZA_GAUGE } from '../src/config';
import { runStage, fmtTicks, stageBot } from './stageBot';

const GUARD: InputFrame = { ...EMPTY_INPUT, guard: true };
const ATTACK: InputFrame = { ...EMPTY_INPUT, attack: true };

function bossStage(id: string, diff: 0 | 1 | 2 = 1, waza: 'tenchi' | 'ageba' = 'tenchi'): GameState {
  const s = makeState({ seed: stageSeed(id) });
  startStage(s, { id, diff, weapon: 'sword', waza });
  return s;
}

/** 등장 연출을 넘긴다 */
function skipEnter(s: GameState): void {
  for (let i = 0; i < LANDMARK.ENTER_TICKS + 2; i++) advance(s, EMPTY_INPUT);
  expect(s.lm!.st).toBe('play');
}

function step(s: GameState, f: InputFrame = EMPTY_INPUT): GameState['events'] {
  advance(s, f);
  const ev = [...s.events];
  s.events.length = 0;
  return ev;
}

function stepN(s: GameState, n: number, f: InputFrame = EMPTY_INPUT): void {
  for (let i = 0; i < n; i++) step(s, f);
}

/** 몸의 층 수를 맞춘다. 막: 종탑 4~3 / 2 / 1 · 바람탑 5~4 / 3~2 / 1 · 크레인 5~4 / 3~2 / 1 */
function setFloors(s: GameState, n: number): void {
  s.lm!.body!.floors.length = n;
}

function bellStack(y: number, vy: number, count = 1) {
  const floors = Array.from({ length: count }, () => {
    const f = makeFloor('bell');
    f.segs[0] = { hp: 999, maxHp: 999 };
    return f;
  });
  return makeStack({ variant: 'building', theme: 'europe', floors, specialImmune: true, y, vy });
}

/** 가드 선딜이 끝난 지면 가드 자세 */
function groundGuardPose(s: GameState): void {
  s.player.y = 0;
  s.player.vy = 0;
  s.player.pose = 'guardG';
  s.player.poseTick = 10;
}

/** 첫 종이 떨어질 때까지(똑딱 뒤 댕) */
function waitStack(s: GameState, max = 400): void {
  for (let i = 0; i < max && !s.stack; i++) step(s);
  expect(s.stack, '던질 것이 안 나왔다').not.toBeNull();
}

/** 떨어지는 종을 받아 쳐 올린다 — 공중 가드(발 130) 또는 지면 가드. 꽂힘(스택이 사라짐)까지 돌린다 */
function ringBell(s: GameState, how: 'air' | 'ground'): void {
  waitStack(s);
  if (how === 'air') {
    s.player.y = 130; s.player.vy = 0; s.player.pose = 'jump'; s.player.poseTick = 0;
    s.stack!.y = 130 + 55 + 10; s.stack!.vy = -200;
    step(s, GUARD);
  } else {
    groundGuardPose(s);
    s.stack!.y = 40; s.stack!.vy = -200;
    step(s, GUARD);
  }
  for (let i = 0; i < 90 && s.stack; i++) step(s);
  expect(s.stack, '꽂히지 않았다').toBeNull();
}

describe('보스판 깨기 — 봇(견습 · 정규 · 외주)', () => {
  for (const id of ['1-B', '2-B', '3-B', '4-B']) {
    it(id, () => {
      const rows: string[] = [];
      for (const diff of [0, 1, 2] as const) {
        const r = runStage(id, diff);
        rows.push(`${['견습', '정규', '외주'][diff]} ${r.result.cleared ? fmtTicks(r.result.ticks) : `실패(${r.s.lm?.st} 몸${r.s.lm?.body?.floors.length ?? r.s.stack?.floors.length})`} 목숨${r.s.lives}`);
        expect(r.result.cleared, `${id} ${diff}`).toBe(true);
      }
      console.log(`[boss] ${id}: ${rows.join(' · ')}`);
    });
  }
});

describe('종탑', () => {
  it('종을 지면 가드로 쳐 올리면 몸에 꽂힌다 — 절반 넘게 꽂으면 내려앉는다', () => {
    const s = bossStage('1-B');
    skipEnter(s);
    let sat = false;
    for (let i = 0; i < 1500 && !sat; i++) {
      advance(s, stageBot(s));
      s.events.length = 0;
      sat = s.lm!.st === 'sit';
    }
    expect(sat).toBe(true);
    expect(s.stage!.tally.bellCuts).toBe(0);
  });

  it('하나도 못 꽂으면 내려찍는다 — 땅에서 가드하면 막고(콤보 끊김), 아니면 맞는다', () => {
    for (const guard of [true, false]) {
      const s = bossStage('1-B');
      skipEnter(s);
      // 종을 그냥 보낸다(맞으면 깔린다 — 탈출은 신경 쓰지 않는다)
      let lives = s.lives;
      for (let i = 0; i < 2000 && s.lm!.st !== 'slam'; i++) {
        advance(s, s.player.pose === 'pinned' ? { ...EMPTY_INPUT, guard: true } : EMPTY_INPUT);
        s.events.length = 0;
      }
      expect(s.lm!.st).toBe('slam');
      lives = s.lives;
      s.player.invulnTicks = 0;
      s.combo = 5;
      let bounced = false;
      for (let i = 0; i < 60 && s.lm!.st === 'slam'; i++) {
        advance(s, guard && s.player.pose !== 'pinned' ? { ...EMPTY_INPUT, guard: true } : EMPTY_INPUT);
        if (s.events.some((e) => e.kind === 'guardBounce')) bounced = true;
        s.events.length = 0;
      }
      if (guard) { expect(bounced).toBe(true); expect(s.combo).toBe(0); expect(s.lives).toBe(lives); }
      else expect(s.lives).toBe(lives - 1);
    }
  });
});

describe('바람탑', () => {
  it('날숨에 땅에서 받으면 역풍 — 좌판이 탑까지 날아가 꽂힌다', () => {
    const s = bossStage('2-B');
    skipEnter(s);
    let flew = false;
    let sat = false;
    for (let i = 0; i < 3000 && !sat; i++) {
      advance(s, stageBot(s));
      s.events.length = 0;
      if (s.lm!.flying) flew = true;
      sat = s.lm!.st === 'sit';
    }
    expect(flew).toBe(true);
    expect(sat).toBe(true);
  });

  it('들숨에 띄운 좌판은 탑에 튕겨 다시 내려온다', () => {
    const s = bossStage('2-B');
    skipEnter(s);
    // 들숨으로 고정하고 좌판을 받는다
    let deflected = false;
    for (let i = 0; i < 1500 && !deflected; i++) {
      s.lm!.air = 0;
      s.lm!.cue = 999;
      const vy = s.stack?.vy ?? 0;
      advance(s, stageBot(s));
      s.events.length = 0;
      if (s.stack && vy > 0 && s.stack.vy === LANDMARK.DEFLECT_V) deflected = true;
      expect(s.lm!.st).not.toBe('sit');
    }
    expect(deflected).toBe(true);
  });
});

describe('구층탑', () => {
  it('층이 깨지면 기와가 쏟아지고, 연달아 깨면 비가 합쳐진다', () => {
    const s = bossStage('3-B');
    skipEnter(s);
    const rocks = () => s.entities.filter((e) => e.kind === 'rock' && !e.remnant).length;
    s.stack!.floors.shift();
    advance(s, EMPTY_INPUT);
    expect(rocks()).toBe(LANDMARK.PAGODA.TILES[0]);
    s.stack!.floors.shift();
    advance(s, EMPTY_INPUT);
    expect(rocks()).toBe(LANDMARK.PAGODA.TILES[0]); // 합쳐져서 더 안 온다
    s.entities = s.entities.filter((e) => e.kind !== 'rock');
    for (let i = 0; i < LANDMARK.PAGODA.MERGE_TICKS; i++) advance(s, EMPTY_INPUT);
    s.stack!.floors.shift();
    advance(s, EMPTY_INPUT);
    expect(rocks()).toBe(LANDMARK.PAGODA.TILES[2]);
  });

  it('풍경이 울린 직후 한 타는 세 배', () => {
    for (const chime of [false, true]) {
      const s = bossStage('3-B');
      skipEnter(s);
      const stk = s.stack!;
      stk.y = 30; // 사거리 안으로 끌어 내린다
      stk.vy = 0;
      if (chime) s.lm!.air = 1; // 다음 틱에 울린다
      else s.lm!.air = 999;
      advance(s, EMPTY_INPUT);
      expect(s.lm!.cue > 0).toBe(chime);
      const hp0 = stk.floors[0].segs[0].hp;
      for (let i = 0; i < 12; i++) { advance(s, i === 0 ? { ...EMPTY_INPUT, attack: true } : EMPTY_INPUT); s.events.length = 0; }
      expect(hp0 - stk.floors[0].segs[0].hp).toBe(chime ? LANDMARK.PAGODA.CHIME_MUL : 1);
    }
  });

  it('외주엔 풍경이 없다', () => {
    const s = bossStage('3-B', 2);
    skipEnter(s);
    for (let i = 0; i < LANDMARK.PAGODA.CHIME_EVERY + 5; i++) { advance(s, EMPTY_INPUT); expect(s.lm!.cue).toBe(0); s.events.length = 0; }
  });
});

describe('타워크레인', () => {
  it('짐 꼭대기가 띠 안에서 멈추면 걸려서 내려앉는다', () => {
    const s = bossStage('4-B');
    skipEnter(s);
    let sat = false;
    for (let i = 0; i < 4000 && !sat; i++) {
      advance(s, stageBot(s));
      s.events.length = 0;
      sat = s.lm!.st === 'sit';
    }
    expect(sat).toBe(true);
  });

  it('짐이 땅에 닿으면 특기 사항이 깨진다', () => {
    const s = bossStage('4-B');
    skipEnter(s);
    for (let i = 0; i < 2000 && s.stage!.tally.cargoDown === 0; i++) {
      advance(s, s.player.pose === 'pinned' ? { ...EMPTY_INPUT, guard: true } : EMPTY_INPUT);
      s.events.length = 0;
    }
    expect(s.stage!.tally.cargoDown).toBe(1);
  });
});

describe('본사', () => {
  it('대본을 치우면 집행기가 나오고, 쓰러뜨리면 깬다(마지막 한 타가 필살이면 특기 사항)', () => {
    const s = bossStage('HQ');
    for (let i = 0; i < 60 * 60 * 3 && !s.boss; i++) { advance(s, stageBot(s)); s.events.length = 0; }
    expect(s.boss, '집행기까지 못 감').not.toBeNull();
    expect(s.stage!.phase).toBe('boss');
    // 체력을 한 타로 줄이고 필살로 끝낸다
    s.boss!.hp = 1;
    s.wazaGauge = WAZA_GAUGE.MAX;
    for (let i = 0; i < 60 * 60 && !s.over; i++) {
      const f = s.boss!.hittable && s.player.pose !== 'special' ? { ...EMPTY_INPUT, special: true } : stageBot(s);
      advance(s, s.boss!.st === 'defeated' ? EMPTY_INPUT : f);
      s.events.length = 0;
    }
    expect(s.over).toBe('cleared');
    expect(s.stage!.clearTick).toBeGreaterThan(0);
  });

  it('보스부터(연습)는 대본을 건너뛴다', () => {
    const r = runStage('HQ', 1, { fromBoss: true, maxTicks: 30 });
    expect(r.s.boss).not.toBeNull();
  });
});

// ── 2판 기믹 ────────────────────────────────────────────────────────
// 규칙마다 「켜지는 조건에서 켜짐 + 바로 옆 조건(한 단계 낮은 난이도 · 앞 막)에서 꺼짐」을 같이 본다.

describe('종탑 2판', () => {
  it('공중 가드로 올린 종은 2점, 지면 가드는 1점', () => {
    for (const [how, pts] of [['air', LANDMARK.BELL.AIR_POINTS], ['ground', 1]] as const) {
      const s = bossStage('1-B');
      skipEnter(s);
      ringBell(s, how);
      expect(s.lm!.got, how).toBe(pts);
    }
  });

  it('1막: 점수가 종 수에 닿으면 남은 종 없이 바로 앉는다', () => {
    for (const diff of [0, 1, 2] as const) {
      const s = bossStage('1-B', diff);
      skipEnter(s);
      ringBell(s, 'air'); // 2
      ringBell(s, 'ground'); // 3 = 3시
      stepN(s, 4); // 히트스톱이 지난 뒤
      expect(s.lm!.st, `난이도 ${diff}`).toBe('sit');
      expect(s.stack).toBeNull();
    }
    // 점수가 모자라면 다음 종이 온다
    const s = bossStage('1-B');
    skipEnter(s);
    ringBell(s, 'ground');
    ringBell(s, 'ground'); // 2 < 3
    stepN(s, 4);
    expect(s.lm!.st).toBe('play');
    expect(s.lm!.n).toBe(2);
  });

  it('조기 종료가 없는 막: 시보(3막)는 점수가 시각을 채워도 이어 떨어진다', () => {
    const s = bossStage('1-B');
    skipEnter(s);
    setFloors(s, 1);
    s.lm!.got = 11;
    ringBell(s, 'ground'); // 12점 = 12시. 1막이면 여기서 끝난다
    stepN(s, 4);
    expect(s.lm!.st).toBe('play');
    expect(lmAct(s)).toBe(3);
    expect(s.lm!.wave).toBe(LANDMARK.BELL.ACT3_WAVE);
    waitStack(s);
    expect(s.lm!.n).toBe(2);
  });

  it('시보(3막): 12시로 고정되고 꽂은 점수가 최하층 대미지다', () => {
    const s = bossStage('1-B');
    skipEnter(s);
    setFloors(s, 1);
    s.lm!.wave = 0; // 3시였던 몸이 3막에 들어서면 12시로 간다
    const hp0 = s.lm!.body!.floors[0].segs[0].hp;
    ringBell(s, 'ground');
    expect(s.lm!.wave).toBe(LANDMARK.BELL.ACT3_WAVE);
    expect(s.lm!.body!.floors[0].segs[0].hp).toBe(hp0 - 1);
    ringBell(s, 'air');
    expect(s.lm!.body!.floors[0].segs[0].hp).toBe(hp0 - 3);
    // 2막이면 꽂아도 대미지가 없다(앉아야 벤다)
    const s2 = bossStage('1-B');
    skipEnter(s2);
    setFloors(s2, 2);
    const hp2 = s2.lm!.body!.floors[0].segs[0].hp;
    ringBell(s2, 'ground');
    expect(s2.lm!.body!.floors[0].segs[0].hp).toBe(hp2);
  });

  it('시보는 파가 끝나도 앉지 않고 내려찍는다(점수가 절반을 넘어도)', () => {
    const s = bossStage('1-B');
    skipEnter(s);
    setFloors(s, 1);
    s.lm!.body!.floors[0].segs[0].hp = 999;
    s.lm!.wave = LANDMARK.BELL.ACT3_WAVE;
    s.lm!.n = 12;
    s.lm!.got = 11;
    step(s);
    expect(s.lm!.st).toBe('slam');
    // 앞 막은 같은 점수면 앉는다
    const s2 = bossStage('1-B');
    skipEnter(s2);
    setFloors(s2, 2);
    s2.lm!.wave = LANDMARK.BELL.ACT3_WAVE;
    s2.lm!.n = 12;
    s2.lm!.got = 11;
    step(s2);
    expect(s2.lm!.st).toBe('sit');
  });

  it('반격 창: 내려찍기를 지면 가드로 막으면 몸이 땅에 머문다(견습 60 · 정규 45), 못 막으면 올라간다', () => {
    for (const diff of [0, 1] as const) {
      const s = bossStage('1-B', diff);
      skipEnter(s);
      s.lm!.n = 3; s.lm!.got = 0;
      step(s);
      expect(s.lm!.st).toBe('slam');
      groundGuardPose(s);
      for (let i = 0; i < 40 && s.lm!.st === 'slam'; i++) step(s, GUARD);
      expect(s.lm!.air).toBe(2);
      expect(s.lm!.st).toBe('sit');
      let window = 0;
      s.player.pose = 'idle';
      while (s.lm!.st === 'sit' && window < 300) { step(s); window += 1; }
      expect(window, `난이도 ${diff}`).toBe(LANDMARK.COUNTER_TICKS[diff]);
      expect(s.lm!.st).toBe('rise');
    }
    const s = bossStage('1-B');
    skipEnter(s);
    s.lm!.n = 3; s.lm!.got = 0;
    s.player.invulnTicks = 0;
    for (let i = 0; i < 60 && s.lm!.st !== 'rise'; i++) step(s);
    expect(s.lm!.air).toBe(1);
    expect(s.lm!.st).toBe('rise');
  });

  it('정각(2막 정규 · 외주): 늦으면 남은 종이 한 덩이로 온다 — 견습 · 1막 · 남은 종 하나는 아니다', () => {
    const late = (diff: 0 | 1 | 2, floors: number, n: number) => {
      const s = bossStage('1-B', diff);
      skipEnter(s);
      setFloors(s, floors);
      s.lm!.wave = 1; // 6시
      s.lm!.n = n;
      s.lm!.cue = 0;
      s.lm!.k = 6 * LANDMARK.BELL.BLOCK_PACE - 1;
      step(s);
      return s;
    };
    const s = late(1, 2, 1);
    expect(s.stack!.floors).toHaveLength(5); // 남은 종 다섯
    expect(s.lm!.n).toBe(6);
    expect(s.stack!.y).toBe(200); // 몸 밑면 − 덩이 높이가 200 밑이면 200
    expect(s.stack!.floors.every((f) => f.mat === 'bell')).toBe(true);
    expect(late(2, 2, 1).stack!.floors).toHaveLength(5);
    expect(late(0, 2, 1).stack!.floors, '견습').toHaveLength(1);
    expect(late(1, 4, 1).stack!.floors, '1막').toHaveLength(1);
    expect(late(1, 2, 5).stack!.floors, '남은 종 하나').toHaveLength(1);
    // 제때 떨어지면 덩이가 아니다
    const s2 = bossStage('1-B');
    skipEnter(s2);
    setFloors(s2, 2);
    s2.lm!.wave = 1; s2.lm!.n = 1; s2.lm!.cue = 0;
    s2.lm!.k = 6 * LANDMARK.BELL.BLOCK_PACE - 2;
    step(s2);
    expect(s2.stack!.floors).toHaveLength(1);
  });

  it('BLOCK_PACE: 정규 · 외주 기본 봇은 정각 덩이를 한 번도 안 맞는다(봇이 종 하나에 쓰는 틱 × 1.25 이상)', () => {
    // 기본 봇은 한 창에 스무 타쯤 쳐서 2막 파를 거의 안 밟는다. 그래서 막과 상관없이 종을 떨굴 때의 「파 시작부터 센 틱 ÷ 시각」(남은 종 둘 이상)을 잰다
    for (const diff of [1, 2] as const) {
      let blocks = 0;
      let worst = 0;
      let prevN = 0;
      const r = runStage('1-B', diff, {
        policy: (s) => {
          const lm = s.lm;
          if (lm?.id === 'bell') {
            if (s.stack && s.stack.floors.length > 1) blocks += 1;
            const hours = LANDMARK.BELL.HOURS[lm.wave];
            if (lm.st === 'play' && lm.n > prevN && hours - prevN >= 2) worst = Math.max(worst, lm.k / hours);
            prevN = lm.n;
          }
          return stageBot(s);
        },
      });
      expect(r.result.cleared).toBe(true);
      expect(blocks, `난이도 ${diff}`).toBe(0);
      expect(worst, `난이도 ${diff} 측정`).toBeGreaterThan(40);
      expect(LANDMARK.BELL.BLOCK_PACE, `난이도 ${diff}`).toBeGreaterThanOrEqual(Math.floor(worst * 1.25));
    }
  });

  it('BLOCK_PACE: 종을 베어 띄우기만 하면 정각 덩이를 맞는다 — 견습은 안 맞는다', () => {
    const juggle = (diff: 0 | 1 | 2) => {
      const s = bossStage('1-B', diff);
      skipEnter(s);
      setFloors(s, 2);
      let block = false;
      for (let i = 0; i < 2400 && !s.over && !block; i++) {
        if (s.stack && s.stack.floors.length > 1) block = true;
        step(s, i < 700 ? ATTACK : EMPTY_INPUT); // 700틱 띄워 두다 손을 뗀다 — 첫 종이 끝난 뒤의 다음 종이 정각을 넘겼다
      }
      return block;
    };
    expect(juggle(1)).toBe(true);
    expect(juggle(0), '견습').toBe(false);
  });

  it('덩이도 꽂으면 1점이다(공중이면 2점)', () => {
    const s = bossStage('1-B');
    skipEnter(s);
    setFloors(s, 2);
    s.lm!.wave = 1; s.lm!.n = 1; s.lm!.cue = 0;
    s.lm!.k = 6 * LANDMARK.BELL.BLOCK_PACE;
    step(s);
    expect(s.stack!.floors).toHaveLength(5);
    s.stack!.y = s.lm!.body!.y - 5 * VIEW.FLOOR_H;
    s.stack!.vy = 600;
    step(s);
    expect(s.stack).toBeNull();
    expect(s.lm!.got).toBe(1);
  });

  it('13시: 열두 번째 종으로 쓰러뜨리면(정규 · 외주) 20틱 뒤 종 하나가 온다. 가드로 받으면 숨은 막', () => {
    const finish = (diff: 0 | 1 | 2, n: number) => {
      const s = bossStage('1-B', diff);
      skipEnter(s);
      setFloors(s, 1);
      s.lm!.body!.floors[0].segs[0].hp = 1;
      s.lm!.wave = LANDMARK.BELL.ACT3_WAVE;
      s.lm!.n = n;
      s.stack = bellStack(s.lm!.body!.y - VIEW.FLOOR_H, 400);
      step(s);
      expect(s.lm!.st).toBe('down');
      return s;
    };
    const s = finish(1, 12);
    expect(s.lm!.x).toBe(1);
    for (let i = 0; i < 200 && !s.stack; i++) {
      expect(s.lm!.t).toBeLessThan(LANDMARK.BELL.BELL13_T); // 히트스톱은 틱을 세지 않는다
      step(s);
    }
    expect(s.stack).not.toBeNull();
    expect(s.lm!.t).toBe(LANDMARK.BELL.BELL13_T);
    expect(s.stack!.y).toBeGreaterThan(VIEW.H - 20);
    expect(s.lm!.x).toBe(2);
    // 받는다
    for (let i = 0; i < 200 && s.stack!.y > 50; i++) step(s);
    groundGuardPose(s);
    step(s, GUARD);
    expect(s.stage!.tally.bell13).toBe(true);
    expect(finish(2, 12).lm!.x, '외주').toBe(1);
    expect(finish(0, 12).lm!.x, '견습').toBe(0);
    expect(finish(1, 11).lm!.x, '열두 번째가 아니면').toBe(0);
    // 놓치면 잃는 것이 없다: 종이 깨지고 판이 끝난다
    const m = finish(1, 12);
    for (let i = 0; i < LANDMARK.DOWN_MAX && !m.over; i++) step(m);
    expect(m.over).toBe('cleared');
    expect(m.stage!.tally.bell13).toBe(false);
    expect(m.lives).toBe(3);
    expect(judgeStage(m).extra).toBe(false);
    m.stage!.tally.bell13 = true;
    expect(judgeStage(m).extra).toBe(true);
  });

  it('외주: 깨진 종은 더미가 된다(최대 3). 정규는 안 쌓인다', () => {
    for (const [diff, pile] of [[2, 1], [1, 0]] as const) {
      const s = bossStage('1-B', diff);
      skipEnter(s);
      s.stack = bellStack(2, -500);
      step(s);
      expect(s.stack).toBeNull();
      expect(s.groundRocks, `난이도 ${diff}`).toBe(pile);
    }
    const s = bossStage('1-B', 2);
    skipEnter(s);
    for (let i = 0; i < 5; i++) { s.stack = bellStack(2, -500); stepN(s, 6); }
    expect(s.groundRocks).toBe(3);
  });
});

describe('바람탑 2판', () => {
  const breath = (s: GameState, air: 0 | 1) => { s.lm!.air = air; s.lm!.cue = 9999; };
  /** 떨어지는 좌판을 지면 가드로 받는다 */
  const guardStall = (s: GameState) => {
    groundGuardPose(s);
    s.stack!.y = 40; s.stack!.vy = -100;
    step(s, GUARD);
  };
  const stallOf = (diff: 0 | 1 | 2, floors = 5) => {
    const s = bossStage('2-B', diff);
    skipEnter(s);
    setFloors(s, floors);
    waitStack(s);
    return s;
  };

  it('견습도 특기 사항 닿음: 일곱 번째 가드가 stall7과 역풍을 같이 · 여섯 번째는 둘 다 아님', () => {
    const s = stallOf(0);
    breath(s, 0);
    s.lm!.k = LANDMARK.WIND.STALL7 - 2; // 이번 가드가 여섯 번째
    guardStall(s);
    expect(s.lm!.flying).toBe(false);
    expect(s.stage!.tally.stall7).toBe(false);
    stepN(s, 4);
    guardStall(s);
    expect(s.lm!.flying).toBe(true);
    expect(s.stage!.tally.stall7).toBe(true);
  });

  it('가벼운 좌판: 견습 6 · 정규 7 · 외주 9번 띄운 뒤의 가드는 숨과 상관없이 역풍', () => {
    for (const diff of [0, 1, 2] as const) {
      const light = LANDMARK.WIND.LIGHT[diff];
      const before = stallOf(diff);
      breath(before, 0);
      before.lm!.k = light - 1; // 이번 가드가 light번째
      guardStall(before);
      expect(before.lm!.flying, `난이도 ${diff} ${light}번째`).toBe(false);
      const after = stallOf(diff);
      breath(after, 0);
      after.lm!.k = light; // 이번 가드가 light+1번째
      guardStall(after);
      expect(after.lm!.flying, `난이도 ${diff} ${light + 1}번째`).toBe(true);
      expect(after.stack!.vy).toBe(LANDMARK.WIND.BLOW_V);
    }
  });

  it('특기 사항 셈: 땅에 안 닿게 일곱 번 가드하면 stall7', () => {
    const s = stallOf(1);
    breath(s, 0);
    s.lm!.k = LANDMARK.WIND.STALL7 - 2;
    guardStall(s);
    expect(s.stage!.tally.stall7).toBe(false);
    stepN(s, 4); // 히트스톱이 지난 뒤 한 번 더
    guardStall(s);
    expect(s.stage!.tally.stall7).toBe(true);
  });

  it('맞바람(2막 정규 · 외주): 탑에 튕겨 나온 좌판이 90틱 동안 날숨을 탄다 — 땅에서 받으면 역풍', () => {
    const deflect = (diff: 0 | 1 | 2, floors: number) => {
      const s = stallOf(diff, floors);
      breath(s, 0);
      const h = s.stack!.floors.length * VIEW.FLOOR_H;
      s.stack!.y = s.lm!.body!.y - h + 2;
      s.stack!.vy = 300;
      step(s);
      return s;
    };
    const s = deflect(1, 3);
    expect(s.stack!.vy).toBe(LANDMARK.DEFLECT_V);
    expect(s.lm!.x).toBe(LANDMARK.WIND.RETURN_TICKS);
    step(s);
    const out = (STAGE.VTERM[0] + (STAGE.VTERM[1] - STAGE.VTERM[0]) * LANDMARK.WIND.SPEED) * LANDMARK.WIND.OUT.v;
    expect(s.stage!.fallV).toBeCloseTo(out); // 들숨(air 0)인데 날숨 속도
    // 지면 가드 = 역풍
    guardStall(s);
    expect(s.lm!.flying).toBe(true);
    // 90틱이 지나면 풀린다
    const t = deflect(1, 3);
    stepN(t, LANDMARK.WIND.RETURN_TICKS);
    expect(t.lm!.x).toBe(0);
    t.stack!.y = 300; t.stack!.vy = -50;
    guardStall(t);
    expect(t.lm!.flying, '풀린 뒤 들숨 가드').toBe(false);
    // 1막 · 견습은 안 켜진다
    expect(deflect(1, 5).lm!.x, '1막').toBe(0);
    expect(deflect(0, 3).lm!.x, '견습').toBe(0);
    expect(deflect(2, 3).lm!.x, '외주').toBe(LANDMARK.WIND.RETURN_TICKS);
  });

  it('마지막 숨(3막): 앉은 몸 밑면이 들숨엔 120, 날숨엔 56', () => {
    const sit = (floors: number, air: 0 | 1) => {
      const s = bossStage('2-B');
      skipEnter(s);
      setFloors(s, floors);
      s.lm!.body!.floors[0].segs[0].hp = 999;
      s.lm!.st = 'sit'; s.lm!.t = 0;
      breath(s, air);
      stepN(s, 90);
      expect(s.lm!.st).toBe('sit');
      return s.lm!.body!.y;
    };
    expect(sit(1, 0)).toBeCloseTo(LANDMARK.SIT_Y + LANDMARK.WIND.BREATH_SIT_DY, 0);
    expect(sit(1, 1)).toBeCloseTo(LANDMARK.SIT_Y, 0);
    expect(sit(3, 0), '2막은 숨을 안 본다').toBeCloseTo(LANDMARK.SIT_Y, 0);
    // 맞바람은 창 높이에 안 든다
    const s = bossStage('2-B');
    skipEnter(s);
    setFloors(s, 1);
    s.lm!.st = 'sit'; s.lm!.t = 0;
    breath(s, 0);
    s.lm!.x = 80;
    stepN(s, 60);
    expect(s.lm!.body!.y).toBeCloseTo(LANDMARK.SIT_Y + LANDMARK.WIND.BREATH_SIT_DY, 0);
  });

  it('좌판 벤 수(stallCuts)는 몸이 안 앉은 동안의 타격만 센다', () => {
    const s = stallOf(1);
    s.stack!.y = 20; s.stack!.vy = 0;
    stepN(s, 6, ATTACK);
    expect(s.stage!.tally.stallCuts).toBeGreaterThan(0);
    const n = s.stage!.tally.stallCuts;
    // 앉은 몸을 베는 건 안 센다
    const t = bossStage('2-B');
    skipEnter(t);
    t.lm!.st = 'sit'; t.lm!.t = 0; t.lm!.body!.y = LANDMARK.SIT_Y;
    t.stack = makeStack({ variant: 'building', theme: 'asia', floors: [makeFloor('mid'), makeFloor('mid')], y: 20, vy: 0 });
    stepN(t, 12, ATTACK);
    expect(t.lm!.body!.floors[0].segs[0].hp).toBeLessThan(LANDMARK.WIND.HP);
    expect(t.stage!.tally.stallCuts).toBe(0);
    expect(n).toBeGreaterThan(0);
  });

  it('장터: 좌판을 한 번도 안 베고 쓰러뜨리면(정규 · 외주) 여섯 좌판이 머리 위로 내려와 멈춘다', () => {
    const fell = (diff: 0 | 1 | 2, cuts: number) => {
      const s = bossStage('2-B', diff);
      skipEnter(s);
      setFloors(s, 1);
      s.stack = null;
      s.lm!.body!.floors[0].segs[0].hp = 1;
      s.lm!.st = 'sit'; s.lm!.t = 0; s.lm!.body!.y = LANDMARK.SIT_Y;
      s.stage!.tally.stallCuts = cuts;
      for (let i = 0; i < 30 && (s.lm!.st as string) !== 'down'; i++) step(s, ATTACK);
      expect(s.lm!.st).toBe('down');
      for (let i = 0; i < 200 && !s.stack && s.lm!.t < LANDMARK.DOWN_TICKS; i++) step(s);
      return s;
    };
    const s = fell(1, 0);
    const total = LANDMARK.WIND.STALLS.reduce((a, k) => a + k.length, 0);
    expect(s.stack!.floors).toHaveLength(total);
    expect(s.lm!.t).toBe(LANDMARK.BELL.BELL13_T);
    expect(s.lm!.got).toBe(1);
    expect(s.stage!.tally.market).toBe(true);
    expect(judgeStage(s).extra).toBe(true);
    expect(s.stack!.y, '둥실 — 화면 높이에서 시작').toBe(LANDMARK.WIND.HOVER_Y);
    // 땅에 안 닿는다 — 머리 위 56에서 멈춰 깔림이 없다
    let reachedAt = -1;
    for (let i = 0; i < LANDMARK.DOWN_MAX && !s.over; i++) {
      step(s);
      if (s.stack) {
        expect(s.stack.y).toBeGreaterThanOrEqual(LANDMARK.SIT_Y - 0.001);
        expect(s.stack.resting).toBe(false);
        if (reachedAt < 0 && s.stack.y <= LANDMARK.SIT_Y + 0.001) reachedAt = s.lm!.t;
      }
    }
    expect(s.lives).toBe(3);
    expect(reachedAt, 'DOWN_MAX 안에 SIT_Y에 닿는다').toBeGreaterThan(0);
    expect(reachedAt).toBeLessThan(LANDMARK.DOWN_MAX);
    expect(s.stack!.y).toBeCloseTo(LANDMARK.SIT_Y);
    expect(s.stack).not.toBeNull();
    // 판은 시간 상한에서 끝난다
    for (let i = 0; i < LANDMARK.DOWN_MAX && !s.over; i++) step(s);
    expect(s.over).toBe('cleared');
    expect(fell(2, 0).stage!.tally.market, '외주').toBe(true);
    expect(fell(1, 1).stage!.tally.market, '좌판을 하나라도 벴으면').toBe(false);
    expect(fell(0, 0).stage!.tally.market, '견습').toBe(false);
  });

  it('외주: 땅에 닿은 좌판은 젖어서 가드 셈이 멈추고 역풍이 안 된다(정규는 셈이 처음부터)', () => {
    const wet = (diff: 0 | 1 | 2) => {
      const s = stallOf(diff);
      breath(s, 1); // 날숨 — 정규라면 지면 가드는 역풍
      s.lm!.k = 3;
      s.stack!.y = 1; s.stack!.vy = -300;
      step(s); // 닿는다 → 깔림
      expect(s.stack!.resting).toBe(true);
      stepN(s, 8, GUARD); // 깔림 탈출 가드(피격 히트스톱이 지난 뒤)
      expect(s.stack!.resting).toBe(false);
      return s;
    };
    const w = wet(2);
    expect(w.lm!.k).toBe(-1);
    expect(w.lm!.flying).toBe(false);
    const n = wet(1);
    expect(n.lm!.k).toBe(1);
    expect(n.lm!.flying).toBe(true);
    // 다음 좌판은 마른다
    w.stack = null; w.stackSpawnCd = 0;
    waitStack(w);
    expect(w.lm!.k).toBe(0);
  });
});

describe('구층탑 2판', () => {
  const rocks = (s: GameState) => s.entities.filter((e) => e.kind === 'rock' && !e.remnant).length;
  const pagoda = (diff: 0 | 1 | 2 = 1, floors = 9) => {
    const s = bossStage('3-B', diff);
    skipEnter(s);
    s.stack!.floors.length = floors;
    s.lm!.n = floors;
    return s;
  };

  it('띄우면 기와: 탑이 크게 떠오르기 시작하면 정규 3 · 외주 4, 견습은 공짜. 베기 띄움은 아니다', () => {
    for (const [diff, n] of [[0, 0], [1, LANDMARK.PAGODA.LIFT_TILES[1]], [2, LANDMARK.PAGODA.LIFT_TILES[2]]] as const) {
      const s = pagoda(diff);
      s.stack!.vy = 1190 + 50; // 지면 가드(1190)
      step(s);
      expect(rocks(s), `난이도 ${diff}`).toBe(n);
      const slash = pagoda(diff);
      slash.stack!.vy = 98 + 50; // 베기 띄움(98) — 한 틱 중력 뒤에도 문턱 밑이다
      step(slash);
      expect(rocks(slash), `난이도 ${diff} 베기`).toBe(0);
    }
    // 떠오르는 동안 한 번만, 다시 떠오르면 또 쏟아진다
    const s = pagoda();
    s.stack!.vy = 1190;
    stepN(s, 3);
    expect(rocks(s)).toBe(LANDMARK.PAGODA.LIFT_TILES[1]);
    s.stack!.vy = 100;
    step(s);
    s.stack!.vy = 1190;
    step(s);
    expect(rocks(s)).toBe(LANDMARK.PAGODA.LIFT_TILES[1] * 2);
  });

  it('이어 허물기: 둘째 층은 비가 없고, 셋째 층까지 이으면 떠 있던 기와가 부서진다. 간격이 벌어지면 처음부터', () => {
    const s = pagoda();
    const brk = () => { s.stack!.floors.shift(); return step(s); };
    brk();
    expect(rocks(s)).toBe(LANDMARK.PAGODA.TILES[0]);
    brk();
    expect(rocks(s)).toBe(LANDMARK.PAGODA.TILES[0]); // 둘째 비 없음
    expect(s.lm!.x).toBe(2);
    expect(s.entities.filter((e) => e.kind === 'rock' && e.remnant)).toHaveLength(0); // 둘만 이었다
    const ev = brk();
    expect(s.lm!.x).toBe(LANDMARK.PAGODA.CHAIN_CLEAR);
    expect(rocks(s)).toBe(0); // 셋째 — 떠 있던 기와 부서짐
    expect(s.entities.filter((e) => e.kind === 'rock' && e.remnant)).toHaveLength(LANDMARK.PAGODA.TILES[0]);
    expect(ev.filter((e) => e.kind === 'floorCollapse')).toHaveLength(LANDMARK.PAGODA.TILES[0]);
    // 간격이 MERGE_TICKS를 넘으면 새 비
    stepN(s, LANDMARK.PAGODA.MERGE_TICKS + 1);
    brk();
    expect(s.lm!.x).toBe(1);
    expect(rocks(s)).toBe(LANDMARK.PAGODA.TILES[3]);
  });

  it('당김(2막 정규 · 외주): 땅의 더미 하나마다 탑이 한 배씩 빨리 내려온다. 1막 · 견습은 그대로', () => {
    const base = LANDMARK.PAGODA.VTERM;
    const fallV = (diff: 0 | 1 | 2, floors: number) => {
      const s = pagoda(diff, floors);
      s.groundRocks = 2;
      step(s);
      return s.stage!.fallV;
    };
    expect(fallV(1, 6)).toBeCloseTo(base * 3);
    expect(fallV(2, 6)).toBeCloseTo(LANDMARK.PAGODA.VTERM_OUTSOURCE * 3);
    expect(fallV(1, 7), '1막').toBeCloseTo(base);
    expect(fallV(0, 6), '견습').toBeCloseTo(base * STAGE.DIFF[0].fall);
    const s = pagoda(1, 6);
    step(s);
    expect(s.stage!.fallV, '더미 0').toBeCloseTo(base);
  });

  it('풍경 기와(3막 정규): 딸랑 뒤 6틱에 기와 둘. 2막 · 견습 · 외주는 없다', () => {
    const ring = (diff: 0 | 1 | 2, floors: number) => {
      const s = pagoda(diff, floors);
      s.lm!.air = 1;
      step(s); // 딸랑
      const window = s.lm!.cue;
      stepN(s, LANDMARK.PAGODA.CHIME_TILE_DELAY - 1);
      const early = rocks(s);
      step(s);
      return { window, early, rocks: rocks(s) };
    };
    const a = ring(1, 3);
    expect(a.window).toBe(LANDMARK.PAGODA.CHIME_WINDOW);
    expect(a.early).toBe(0);
    expect(a.rocks).toBe(LANDMARK.PAGODA.CHIME_TILES);
    expect(ring(1, 6).rocks, '2막').toBe(0);
    expect(ring(0, 3).rocks, '견습').toBe(0);
    const o = ring(2, 3);
    expect(o.rocks, '외주').toBe(0);
    expect(o.window, '외주는 풍경이 안 울린다').toBe(0);
  });

  it('풍경 창에서 층을 무너뜨리면 chimeBreaks — 창 밖이면 안 센다. 마지막 층도 센다', () => {
    const cut = (cue: number, floors: number, diff: 0 | 1 | 2 = 1) => {
      const s = pagoda(diff, floors);
      s.lm!.cue = cue;
      s.stack!.y = 30; s.stack!.vy = 0;
      s.stack!.floors[0].segs[0].hp = 1;
      stepN(s, 6, ATTACK);
      return s;
    };
    const s = cut(30, 5);
    expect(s.stage!.tally.chimeBreaks).toBe(1);
    expect(s.stack!.floors[0].segs[0].hp, '베기로 깬 층의 덤은 다음 층으로 안 넘친다').toBe(LANDMARK.PAGODA.HP);
    expect(s.lm!.cue, '풍경은 한 번 쓰면 소모').toBe(0);
    // 안 깨지는 베기는 세 배로 들어간다 — 체력 3인 층이 한 타로 무너진다
    const triple = pagoda(1, 5);
    triple.lm!.cue = 30;
    triple.stack!.y = 30; triple.stack!.vy = 0;
    triple.stack!.floors[0].segs[0].hp = LANDMARK.PAGODA.CHIME_MUL;
    stepN(triple, 6, ATTACK);
    expect(triple.stack!.floors).toHaveLength(4);
    expect(triple.stack!.floors[0].segs[0].hp).toBe(LANDMARK.PAGODA.HP);
    expect(cut(0, 5).stage!.tally.chimeBreaks).toBe(0);
    const last = cut(30, 1);
    expect(last.lm!.st).toBe('down');
    expect(last.stage!.tally.chimeBreaks).toBe(1);
    expect(cut(0, 1).stage!.tally.chimeBreaks).toBe(0);
    // 아홉 번은 정규 · 외주만 — 견습은 풍경 창에서 깨도 안 센다
    expect(cut(30, 5, 0).stage!.tally.chimeBreaks, '견습').toBe(0);
    const easyLast = cut(30, 1, 0);
    expect(easyLast.lm!.st).toBe('down');
    expect(easyLast.stage!.tally.chimeBreaks, '견습 마지막 층').toBe(0);
    easyLast.stage!.clearTick = 100;
    expect(judgeStage(easyLast).extra, '견습 extra').toBe(false);
  });

  it('judgeStage extra: 아홉 층을 전부 풍경 창에서 무너뜨렸을 때만', () => {
    const s = pagoda(1, 1);
    s.stage!.clearTick = 100;
    s.stage!.tally.chimeBreaks = LANDMARK.PAGODA.FLOORS;
    expect(judgeStage(s).extra).toBe(true);
    s.stage!.tally.chimeBreaks = LANDMARK.PAGODA.FLOORS - 1;
    expect(judgeStage(s).extra).toBe(false);
  });

  it('외주: 가드로 받은 기와는 쌓이지 않고 튕긴다. 정규는 쌓이고, 아케이드 화산탄은 그대로', () => {
    const land = (s: GameState, guard: boolean, remnant = false) => {
      s.player.y = 0; s.player.vy = 0;
      s.player.pose = guard ? 'guardG' : 'idle';
      s.player.poseTick = 10;
      s.entities.push({ kind: 'rock', lane: 0, y: 1, vy: -300, hp: 1, ...(remnant ? { remnant: true } : {}) });
      stepEntities(s);
    };
    const o = pagoda(2);
    land(o, true);
    expect(o.entities).toHaveLength(1);
    expect(o.groundRocks).toBe(0);
    expect(o.entities[0].kind === 'rock' && o.entities[0].vy).toBe(LANDMARK.PAGODA.TILE_BOUNCE_V);
    // 튕긴 기와는 다시 떨어진다
    for (let i = 0; i < 90 && o.entities.length > 0 && o.groundRocks === 0; i++) { o.player.pose = 'guardG'; o.player.poseTick = 10; stepEntities(o); }
    expect(o.entities.length > 0 || o.groundRocks > 0).toBe(true);
    const n = pagoda(1);
    land(n, true);
    expect(n.entities).toHaveLength(0);
    expect(n.groundRocks).toBe(1);
    const w = pagoda(2);
    land(w, false); // 못 막으면 맞고 쌓인다
    expect(w.entities).toHaveLength(0);
    expect(w.groundRocks).toBe(1);
    const r = pagoda(2);
    land(r, true, true); // 격파 잔해는 무해하게 사라진다
    expect(r.entities).toHaveLength(0);
    // 아케이드(s.lm 없음)
    const a = makeState({ mode: 'act2' });
    land(a, true);
    expect(a.entities).toHaveLength(0);
    expect(a.groundRocks).toBe(1);
  });
});

describe('타워크레인 2판', () => {
  const C = LANDMARK.CRANE;
  const crane = (diff: 0 | 1 | 2 = 1, floors = 5) => {
    const s = bossStage('4-B', diff);
    skipEnter(s);
    setFloors(s, floors);
    return s;
  };
  /** 내려오는 짐을 놓인 상태로 바꾼다 */
  const released = (s: GameState) => {
    waitStack(s);
    s.lm!.air = 1;
    s.stage!.fallG = C.G;
    s.stage!.fallV = C.VTERM;
  };
  /** 놓인 짐 꼭대기가 띠 정점에 닿게 두고 한 틱 — 걸린다 */
  const hookIt = (s: GameState) => {
    released(s);
    s.lm!.got = 1;
    s.stack!.y = s.lm!.k - s.stack!.floors.length * VIEW.FLOOR_H + 5;
    s.stack!.vy = -1;
    step(s);
  };

  it('읽는 띠(2막 정규 · 외주): 늦게 받으면 높은 띠(404), 일찍 받으면 낮은 띠(336) — 1막 · 견습은 짐의 띠', () => {
    const next = (diff: 0 | 1 | 2, floors: number, wave: number, y: number) => {
      const s = crane(diff, floors);
      released(s);
      groundGuardPose(s);
      s.stack!.y = y; s.stack!.vy = -100;
      step(s, GUARD);
      const x = s.lm!.x;
      s.stack = null; s.stackSpawnCd = 0;
      s.lm!.wave = wave;
      stepN(s, 6);
      waitStack(s);
      return { x, band: s.lm!.k };
    };
    const late = next(1, 3, 2, 28); // 받은 높이 < 33
    expect(late.x).toBe(1);
    expect(late.band).toBe(C.BAND_HI); // 짐의 띠는 336
    const early = next(1, 3, 1, 60);
    expect(early.x).toBe(-1);
    expect(early.band).toBe(C.BAND_LO); // 짐의 띠는 404
    expect(next(1, 5, 2, 28).band, '1막').toBe(C.CARGO[2][1]);
    const k = next(0, 3, 2, 28);
    expect(k.x, '견습').toBe(0);
    expect(k.band).toBe(C.CARGO[2][1]);
    expect(next(2, 3, 2, 28).band, '외주').toBe(C.BAND_HI);
    // 버릇 셈은 ±2에서 멈춘다
    const s = crane(1, 3);
    s.lm!.x = C.READ_MAX;
    released(s);
    groundGuardPose(s);
    s.stack!.y = 28; s.stack!.vy = -100;
    step(s, GUARD);
    expect(s.lm!.x).toBe(C.READ_MAX);
  });

  it('두 번 걸기(3막): 첫 걸림은 반창(300 · 60틱), 이어 한 번 더 걸어야 온창. 땅에 닿거나 부서지면 처음부터', () => {
    const s = crane(1, 1);
    s.lm!.body!.floors[0].segs[0].hp = 999;
    hookIt(s);
    expect(s.lm!.st).toBe('sit');
    expect(s.lm!.cue).toBe(2);
    let ticks = 0;
    while (s.lm!.st === 'sit' && ticks < 300) { step(s); ticks += 1; if (s.lm!.st === 'sit') expect(s.lm!.t).toBeLessThanOrEqual(C.HALF_TICKS); }
    expect(s.lm!.body!.y).toBeGreaterThan(C.HALF_Y - 1); // 낮게 못 내려온다
    expect(s.lm!.body!.y).toBeLessThan(C.HALF_Y + 25);
    expect(s.lm!.cue).toBe(1); // 걸어 둔 채 올라간다
    // 지면에서 베도 안 닿는다
    stepN(s, 4);
    // 둘째 짐 — 온창
    for (let i = 0; i < 200 && !(s.lm!.st === 'play' && s.stack); i++) step(s);
    expect(s.lm!.cue).toBe(1); // 이어진다
    hookIt(s);
    expect(s.lm!.st).toBe('sit');
    expect(s.lm!.cue).toBe(0);
    stepN(s, 120);
    expect(s.lm!.st).toBe('sit'); // 온창(180틱)
    expect(s.lm!.body!.y).toBeCloseTo(LANDMARK.SIT_Y, 0);

    // 둘째 짐이 땅에 닿으면 처음부터
    const g = crane(1, 1);
    g.lm!.body!.floors[0].segs[0].hp = 999;
    hookIt(g);
    for (let i = 0; i < 400 && !(g.lm!.st === 'play' && g.stack); i++) step(g);
    expect(g.lm!.cue).toBe(1);
    g.lm!.air = 1;
    g.stack!.resting = true;
    step(g);
    expect(g.lm!.cue).toBe(0);
    g.stack = null; g.stackSpawnCd = 0;
    hookIt(g);
    expect(g.lm!.cue, '땅에 닿은 뒤 첫 걸림은 다시 반창').toBe(2);

    // 둘째 짐이 부서져도 처음부터
    const b = crane(1, 1);
    b.lm!.body!.floors[0].segs[0].hp = 999;
    hookIt(b);
    for (let i = 0; i < 400 && !(b.lm!.st === 'play' && b.stack); i++) step(b);
    expect(b.lm!.cue).toBe(1);
    b.stack = null; b.stackSpawnCd = 0; // 부서졌다
    waitStack(b);
    expect(b.lm!.cue).toBe(0);

    // 2막 · 견습은 처음부터 온창
    expect(((x) => { hookIt(x); return x.lm!.cue; })(crane(1, 3)), '2막').toBe(0);
    const k = crane(0, 1);
    hookIt(k);
    expect(k.lm!.cue, '견습').toBe(0);
  });

  it('케이블: 내리는 중 짐을 세 번 베면 줄이 끊겨 그 자리에서 떨어진다(둘은 아님)', () => {
    const cut = (target: number) => {
      const s = crane(1, 5);
      s.lm!.wave = 1; // 'mmm' — 세 번 베어도 안 부서진다
      waitStack(s);
      expect(s.lm!.air).toBe(0);
      s.stack!.y = 225;
      s.player.pose = 'jump'; s.player.poseTick = 0;
      let cuts = 0;
      for (let i = 0; i < 80 && cuts < target; i++) {
        s.player.y = s.stack!.y - 62; s.player.vy = 0; // 밑면 밑에서 따라 내려간다
        const ev = step(s, (s.player.pose as string) === 'attack' ? EMPTY_INPUT : ATTACK);
        cuts += ev.filter((e) => e.kind === 'hit' || e.kind === 'floorCollapse').length;
      }
      expect(cuts).toBe(target);
      return s;
    };
    const three = cut(C.CABLE_HITS);
    expect(three.lm!.air).toBe(1);
    expect(three.stage!.fallG).toBe(C.G);
    expect(three.lm!.got).toBe(0);
    expect(three.stack!.y, '내려오다 만 자리').toBeGreaterThan(C.LOWER_TO);
    const two = cut(C.CABLE_HITS - 1);
    expect(two.lm!.air).toBe(0);
    expect(two.lm!.got).toBe(C.CABLE_HITS - 1);
  });

  it('외주: 짐 층이 하나 부서질 때마다 띠가 바뀐다(정규는 그대로)', () => {
    const smash = (diff: 0 | 1 | 2) => {
      const s = crane(diff, 5);
      released(s);
      s.stack!.floors = ['w', 'm', 'm'].map((c) => makeFloor(c === 'w' ? 'weak' : 'mid'));
      s.stack!.y = 20; s.stack!.vy = 0;
      s.lm!.k = C.BAND_LO;
      groundGuardPose(s);
      s.player.pose = 'idle';
      stepN(s, 8, ATTACK);
      return s;
    };
    const o = smash(2);
    expect(o.stack!.floors).toHaveLength(2);
    expect(o.lm!.k).toBe(C.BAND_HI);
    const n = smash(1);
    expect(n.stack!.floors).toHaveLength(2);
    expect(n.lm!.k).toBe(C.BAND_LO);
  });
});

describe('한 창에 한 층', () => {
  /** 창에 앉은 몸 — 최하층 hp 1, 그 위층은 온전 */
  const sitting = (id: string, floors: number) => {
    const s = bossStage(id);
    skipEnter(s);
    setFloors(s, floors);
    s.stack = null;
    s.lm!.body!.floors[0].segs[0].hp = 1;
    s.lm!.st = 'sit'; s.lm!.t = 0; s.lm!.air = 1; s.lm!.cue = 9999;
    s.lm!.body!.y = LANDMARK.SIT_Y;
    return s;
  };

  it('창 안에서 층이 무너지면 바로 올라간다 — 위층은 온전하고 연타해도 넘치지 않는다(종탑 · 바람탑 · 크레인)', () => {
    for (const id of ['1-B', '2-B', '4-B']) {
      const s = sitting(id, 3);
      const next = s.lm!.body!.floors[1].segs[0].hp;
      let rose = false;
      for (let i = 0; i < 40; i++) {
        step(s, ATTACK);
        if (s.lm!.body!.floors.length === 2) { rose = (s.lm!.st as string) === 'rise'; break; }
      }
      expect(rose, `${id} 무너진 틱에 rise`).toBe(true);
      stepN(s, 30, ATTACK); // 연타를 이어도
      expect(s.lm!.body!.floors, `${id} 한 층만`).toHaveLength(2);
      expect(s.lm!.body!.floors[0].segs[0].hp, `${id} 넘친 피해 없음`).toBe(next);
    }
  });

  it('마지막 층은 그대로 쓰러진다', () => {
    for (const id of ['1-B', '2-B', '4-B']) {
      const s = sitting(id, 1);
      for (let i = 0; i < 40 && (s.lm!.st as string) !== 'down'; i++) step(s, ATTACK);
      expect(s.lm!.st, id).toBe('down');
    }
  });
});
