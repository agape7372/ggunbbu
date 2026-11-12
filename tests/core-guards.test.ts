// core 가드 (2026-11-13 출시 전 감사 2차) — 쓰러뜨린 뒤 무적 · 히트스톱 중 필살 · 면역 건물 띄움 · 포효가 끊은 패턴 · 시간차 필살 중 모드 전환
import { describe, it, expect } from 'vitest';
import { makeState, advance } from '../src/core/sim';
import { enterAct2Phase } from '../src/core/act2';
import { makeFloor, makeStack } from '../src/core/building';
import { startStage, stageSeed, judgeStage } from '../src/core/stage';
import { EMPTY_INPUT, type GameState, type InputFrame, type JuiceEvent } from '../src/core/types';
import { ACT1, BOSS, PLAYER, TOKOTON, VIEW } from '../src/config';
import { stageBot } from './stageBot';

const inp = (o: Partial<InputFrame> = {}): InputFrame => ({ ...EMPTY_INPUT, ...o });

function step(s: GameState, f: InputFrame, log: JuiceEvent[]): void {
  advance(s, f);
  log.push(...s.events);
  s.events.length = 0;
}

describe('쓰러뜨린 뒤엔 안 다친다', () => {
  it('아케이드 집행기 — 마지막 한 타 뒤 날아오던 탄에 맞아도 클리어', () => {
    const s = makeState({ seed: 7 });
    enterAct2Phase(s, 'moon');
    const b = s.boss!;
    b.st = 'attacking'; b.stTick = 50; b.pattern = 'rabbits'; b.step = BOSS.RABBIT.COUNT;
    b.y = BOSS.HOVER_LOW; b.hittable = true; b.hp = 1; b.dmg = 0; b.tier = 0;
    s.lives = 1;
    s.entities.push({ kind: 'shot', lane: 0, x: VIEW.LANE_X[0] - 200, y: 24, vx: 480, vy: 0, guardable: true, cancellable: true });
    const log: JuiceEvent[] = [];
    let defeated = false; let lostAfter = 0;
    for (let i = 0; i < 400 && !s.over; i++) {
      step(s, i === 0 ? inp({ attack: true }) : inp(), log);
      if (log.some((e) => e.kind === 'bossDefeat')) defeated = true;
      if (defeated) lostAfter += log.filter((e) => e.kind === 'lifeLost').length;
      log.length = 0;
    }
    expect(defeated).toBe(true);
    expect(lostAfter).toBe(0);
    expect(s.over).toBe('cleared');
  });

  function downedPagoda(): GameState {
    const s = makeState({ seed: stageSeed('3-B') });
    startStage(s, { id: '3-B', diff: 1, weapon: 'sword', waza: 'tenchi' });
    while (!s.over && s.lm?.st !== 'down' && s.tick < 60 * 60 * 5) { advance(s, stageBot(s)); s.events.length = 0; }
    expect(s.lm?.st).toBe('down');
    s.lives = 1;
    s.hat = false;
    return s;
  }

  it('3-B 구층탑 — 쓰러뜨린 뒤 기와 더미에 내려앉아도 안 깔린다', () => {
    const s = downedPagoda();
    s.groundRocks = 3;
    s.player.y = 40; s.player.vy = 0; s.player.pose = 'jump'; s.player.invulnTicks = 0;
    const log: JuiceEvent[] = [];
    for (let i = 0; i < 600 && !s.over; i++) step(s, inp(), log);
    expect(log.filter((e) => e.kind === 'lifeLost')).toEqual([]);
    expect(s.over).toBe('cleared');
    expect(judgeStage(s).cleared).toBe(true);
  });

  it('쓰러뜨릴 때 깔려 있었으면 풀려나고 방치 손실도 없다', () => {
    const s = downedPagoda();
    s.groundRocks = 3;
    s.player.y = 0; s.player.pose = 'pinned'; s.player.pinTick = PLAYER.PIN_REPEAT_TICKS - 2;
    s.player.bufAttack = 0; s.player.bufGuard = 0; s.player.bufJump = 0; // 봇이 남긴 버퍼로 빠져나가지 않게
    const log: JuiceEvent[] = [];
    for (let i = 0; i < 600 && !s.over; i++) step(s, inp(), log);
    expect(log.filter((e) => e.kind === 'lifeLost')).toEqual([]);
    expect(s.over).toBe('cleared');
  });
});

describe('히트스톱 중 누른 필살', () => {
  const tower = () => makeStack({ variant: 'building', theme: 'europe', floors: [makeFloor('hard'), makeFloor('hard')], y: 300 });

  it('히트스톱이 풀리면 나간다', () => {
    const s = makeState({ seed: 1 });
    s.stack = tower(); s.wazaGauge = 100; s.hitstop = 2;
    const log: JuiceEvent[] = [];
    step(s, inp({ special: true }), log);
    for (let i = 0; i < 10; i++) step(s, inp(), log);
    expect(log.filter((e) => e.kind === 'special').length).toBe(1);
  });

  it('게이지 부족이면 거부음 한 번(두 번 울리지 않는다)', () => {
    const s = makeState({ seed: 1 });
    s.stack = tower(); s.wazaGauge = 0; s.hitstop = 2;
    const log: JuiceEvent[] = [];
    step(s, inp({ special: true }), log);
    for (let i = 0; i < 10; i++) step(s, inp(), log);
    expect(log.filter((e) => e.kind === 'guardDenied').length).toBe(1);
  });

  it('필살 자세 중 누른 필살은 쌓아 두지 않는다', () => {
    const s = makeState({ seed: 1 });
    s.stack = tower(); s.wazaGauge = 200;
    const log: JuiceEvent[] = [];
    step(s, inp({ special: true }), log);
    step(s, inp({ special: true }), log);
    for (let i = 0; i < 200; i++) step(s, inp(), log);
    expect(log.filter((e) => e.kind === 'special').length).toBe(1);
  });
});

describe('필살 면역 건물은 뜨지 않는다', () => {
  it('3-B 구층탑 + 용오름 — 바닥 근처 탑이 화면 위로 안 뜬다', () => {
    const s = makeState({ seed: stageSeed('3-B') });
    startStage(s, { id: '3-B', diff: 1, weapon: 'sword', waza: 'baram' });
    while (s.lm?.st !== 'play') { advance(s, inp()); s.events.length = 0; }
    while (s.stack && s.stack.y > 60) { advance(s, s.player.pose === 'pinned' ? inp({ guard: true }) : inp()); s.events.length = 0; }
    s.wazaGauge = 100;
    const log: JuiceEvent[] = [];
    let peak = 0;
    step(s, inp({ special: true }), log);
    for (let i = 0; i < 60; i++) { step(s, inp(), log); peak = Math.max(peak, s.stack?.y ?? 0); }
    expect(log.filter((e) => e.kind === 'wazaSwing').length).toBe(3);
    expect(peak).toBeLessThan(200);
  });

  it('보통 건물은 용오름 한 타마다 뜬다', () => {
    const s = makeState({ seed: 1 });
    s.waza = 'baram'; s.wazaGauge = 100;
    s.stack = makeStack({ variant: 'building', theme: 'europe', floors: Array.from({ length: 6 }, () => makeFloor('hard')), y: 30 });
    advance(s, inp({ special: true })); s.events.length = 0;
    let lifted = false;
    for (let i = 0; i < 40; i++) { advance(s, inp()); s.events.length = 0; if ((s.stack?.vy ?? 0) > 0) lifted = true; }
    expect(lifted).toBe(true);
  });
});

describe('포효가 끊은 패턴', () => {
  function roarWith(kind: 'rabbit' | 'cannon'): GameState {
    const s = makeState({ seed: 11 });
    enterAct2Phase(s, 'moon');
    const b = s.boss!;
    b.st = 'attacking'; b.stTick = 40; b.step = 2; b.y = BOSS.HOVER_LOW; b.hittable = true;
    b.pattern = kind === 'rabbit' ? 'rabbits' : 'cannons'; b.lastPattern = b.pattern;
    b.dmg = BOSS.TIER1_DMG; b.hp = BOSS.HP - b.dmg; // 다음 틱에 포효로 넘어간다
    if (kind === 'rabbit') s.entities.push({ kind: 'rabbit', x: 60, y: 200, side: -1, hp: 1, fireTicks: 5, leaveTicks: -1 });
    else s.entities.push({ kind: 'cannon', lane: 0, x: BOSS.CANNON.X[0], hp: BOSS.CANNON.HP, fireTicks: 10 });
    s.player.invulnTicks = 99999;
    return s;
  }

  for (const kind of ['rabbit', 'cannon'] as const) {
    it(`${kind} — 포효가 끝나기 전에 쏘지 않고 물러난다`, () => {
      const s = roarWith(kind);
      const shots0 = s.entities.filter((e) => e.kind === 'shot').length;
      advance(s, inp()); s.events.length = 0;
      expect(s.boss!.st).toBe('roar');
      for (let i = 0; i < BOSS.ROAR_TICKS; i++) { advance(s, inp()); s.events.length = 0; }
      expect(s.entities.filter((e) => e.kind === kind)).toEqual([]);
      expect(s.entities.filter((e) => e.kind === 'shot').length).toBe(shots0);
    });
  }
});

describe('시간차 필살 중엔 모드를 바꾸지 않는다', () => {
  function go(where: 'chapter' | 'act2' | 'tokoton'): { s: GameState; log: JuiceEvent[] } {
    const s = makeState({ seed: 4, mode: where === 'tokoton' ? 'tokoton' : 'act1' });
    s.waza = 'nakgwan';
    if (where === 'chapter') s.score = Math.floor(ACT1.UNLOCK_SCORE * ACT1.CHAPTER_BOUNDS[0]) - 50;
    if (where === 'act2') { s.score = ACT1.UNLOCK_SCORE - 50; s.chapter = ACT1.CHAPTER_BOUNDS.length; }
    if (where === 'tokoton') s.tick = TOKOTON.CHAPTER_CYCLE_TICKS - 5;
    s.p = s.score / ACT1.UNLOCK_SCORE;
    s.stack = makeStack({ variant: 'building', theme: 'europe', floors: Array.from({ length: 12 }, () => makeFloor('hard')), y: 200 });
    s.wazaGauge = 100;
    const log: JuiceEvent[] = [];
    step(s, inp({ special: true }), log);
    for (let i = 0; i < 120; i++) step(s, inp(), log);
    return { s, log };
  }

  for (const where of ['chapter', 'act2', 'tokoton'] as const) {
    it(`${where} — 벤 건물이 터진 뒤에 넘어간다`, () => {
      const { s, log } = go(where);
      const burst = log.find((e) => e.kind === 'wazaBurst') as { n: number } | undefined;
      expect(burst?.n).toBe(12);
      expect(log.some((e) => e.kind === 'stackDestroy')).toBe(true);
      expect(s.mode).toBe(where === 'act2' ? 'act2' : 'bonus');
    });
  }
});
