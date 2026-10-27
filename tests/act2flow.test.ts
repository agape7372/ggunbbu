// 2막 흐름: 체크포인트 이어하기, 화산탄 착지 깔림, 번개 가드 불가, 페이즈 잔여 소거.
import { describe, it, expect } from 'vitest';
import { makeState, advance, grantMercyLife } from '../src/core/sim';
import { continueFromCheckpoint, enterAct2Phase } from '../src/core/act2';
import { makeFloor, makeStack } from '../src/core/building';
import { EMPTY_INPUT, type InputFrame } from '../src/core/types';
import { ACT2, GUARD_GAUGE, PLAYER, SCORE, STACK } from '../src/config';

function inp(o: Partial<InputFrame> = {}): InputFrame {
  return { ...EMPTY_INPUT, ...o };
}

describe('체크포인트 이어하기', () => {
  it('148: 펜트하우스부터, 콤보 148, 라이프 풀, 풀콤보 소멸', () => {
    const s = makeState();
    enterAct2Phase(s, 'tower');
    s.checkpoint = 148;
    s.over = 'gameover';
    s.lives = 0;
    s.combo = 50;
    s.wazaGauge = 80;
    s.guardGauge = 10;
    s.hitstop = 12;
    s.player.pose = 'dead';
    s.fullCombo = true;
    continueFromCheckpoint(s);
    expect(s.over).toBeNull();
    expect(s.lives).toBe(PLAYER.LIVES);
    expect(s.combo).toBe(148);
    expect(s.act2Phase).toBe('tower');
    expect(s.stack?.floors[0]?.mat).toBe('penthouse');
    expect(s.wazaGauge).toBe(0);
    expect(s.guardGauge).toBe(GUARD_GAUGE.MAX);
    expect(s.hitstop).toBe(0);
    expect(s.player.pose).toBe('idle');
    expect(s.fullCombo).toBe(false);
  });

  it('40: 사무층+펜트하우스 재구성', () => {
    const s = makeState();
    s.checkpoint = 40;
    s.over = 'gameover';
    continueFromCheckpoint(s);
    expect(s.act2Phase).toBe('tower');
    expect(s.combo).toBe(40);
    expect(s.stack?.floors[0]?.mat).toBe('office');
    expect(s.stack?.floors.at(-1)?.mat).toBe('penthouse');
    expect(s.stack?.floors.length).toBe(ACT2.TOWER_OFFICE_FLOORS + 1);
  });

  it('40 미만: 대성당부터 처음부터, 콤보 0, 체크포인트는 그대로 낮은 값', () => {
    const s = makeState();
    enterAct2Phase(s, 'rock');
    s.checkpoint = 30;
    s.over = 'gameover';
    s.lives = 0;
    s.combo = 77;
    continueFromCheckpoint(s);
    expect(s.over).toBeNull();
    expect(s.act2Phase).toBe('cathedral');
    expect(s.combo).toBe(0);
    expect(s.checkpoint).toBe(30);
    expect(s.stack).toBeNull();
    expect(s.stackSpawnCd).toBe(ACT2.INTERLUDE_TICKS);
    expect(s.lives).toBe(PLAYER.LIVES);
  });

  it('168: 번개 페이즈, 콤보 168', () => {
    const s = makeState();
    s.checkpoint = 168;
    s.over = 'gameover';
    continueFromCheckpoint(s);
    expect(s.act2Phase).toBe('bolt');
    expect(s.combo).toBe(168);
    expect(s.stack).toBeNull();
    expect(s.checkpoint).toBe(168);
  });
});

describe('화산탄 더미 착지 [정본: 공중 무적, 착지 시 깔림]', () => {
  it('쌓인 더미 위에 착지하면 피격·콤보 단절', () => {
    const s = makeState();
    enterAct2Phase(s, 'rock');
    s.stackSpawnCd = 9999;
    advance(s, inp({ jump: true }));
    for (let t = 0; t < 16; t++) advance(s, inp());
    expect(s.player.y).toBeGreaterThan(50);
    s.groundRocks = 2;
    s.combo = 12;
    const lives = s.lives;
    while (s.player.y > 0 && s.tick < 300) advance(s, inp());
    expect(s.lives).toBe(lives - 1);
    expect(s.combo).toBe(0);
  });

  it('지상 가드 중 착탄은 무해 적재이고, 서 있는 동안 반복 피격되지 않는다', () => {
    const s = makeState();
    enterAct2Phase(s, 'rock');
    s.stackSpawnCd = 9999;
    s.guardGauge = 100;
    s.combo = 7;
    for (let i = 0; i < 8; i++) advance(s, inp({ guard: true }));
    const lives = s.lives;
    s.entities.push({ kind: 'rock', lane: 0, y: 10, vy: -400, hp: 2 });
    for (let t = 0; t < 8; t++) advance(s, inp({ guard: true }));
    expect(s.groundRocks).toBeGreaterThanOrEqual(1);
    expect(s.lives).toBe(lives);
    expect(s.combo).toBe(7);
    for (let t = 0; t < 30; t++) advance(s, EMPTY_INPUT);
    expect(s.lives).toBe(lives);
  });
});

describe('번개 가드 불가 [정본]', () => {
  it('가드 중이어도 낙뢰는 피격·콤보 단절', () => {
    const s = makeState();
    enterAct2Phase(s, 'bolt');
    s.stackSpawnCd = 9999;
    s.guardGauge = 100;
    s.combo = 9;
    for (let i = 0; i < 8; i++) advance(s, inp({ guard: true }));
    const lives = s.lives;
    s.entities.push({ kind: 'bolt', lane: 0, y: 6, vy: 0, cueTicks: 0 });
    advance(s, inp({ guard: true }));
    expect(s.lives).toBe(lives - 1);
    expect(s.combo).toBe(0);
  });
});

describe('페이즈 전환', () => {
  it('화산탄 타임박스 종료 시 잔여 낙하물을 지우고 보스로 넘어간다', () => {
    const s = makeState();
    enterAct2Phase(s, 'rock');
    s.stackSpawnCd = 0;
    s.entities.push({ kind: 'rock', lane: 0, y: 400, vy: 0, hp: 2 });
    s.act2c!.t = ACT2.ROCK_TIMEBOX_TICKS - 1;
    s.act2c!.rocks = ACT2.ROCK_COUNT;
    advance(s, EMPTY_INPUT);
    expect(s.act2Phase).toBe('moon');
    expect(s.entities.some((e) => e.kind === 'rock' && !e.remnant)).toBe(false);
    expect(s.groundRocks).toBe(0);
  });

  it('달 개시 콤보 리셋은 fullCombo를 유지한다', () => {
    const s = makeState();
    enterAct2Phase(s, 'rock');
    s.combo = 228;
    s.fullCombo = true;
    s.act2c!.rocks = ACT2.ROCK_COUNT;
    s.act2c!.t = ACT2.ROCK_TIMEBOX_TICKS;
    s.stackSpawnCd = 0;
    advance(s, EMPTY_INPUT);
    expect(s.act2Phase).toBe('moon');
    expect(s.combo).toBe(0);
    expect(s.fullCombo).toBe(true);
  });
});

describe('격파 잔해 [정본: 콤보만, 점수 없음]', () => {
  it('잔해 타격은 콤보만 올리고 점수는 그대로다', () => {
    const s = makeState();
    enterAct2Phase(s, 'moon');
    s.fullCombo = false;
    const b = s.boss!;
    b.hp = 1;
    b.dmg = 229;
    b.tier = 2;
    b.st = 'idle';
    b.hittable = true;
    b.y = 80;
    for (let i = 0; i < 12 && s.boss?.st !== 'defeated'; i++) {
      advance(s, inp({ attack: i === 0 }));
    }
    expect(b.st).toBe('defeated');
    expect(s.entities.some((e) => e.kind === 'rock' && e.remnant)).toBe(true);
    s.hitstop = 0;
    const remnant = s.entities.find((e) => e.kind === 'rock' && e.remnant);
    if (remnant && remnant.kind === 'rock') remnant.y = 40;
    const score0 = s.score;
    const combo0 = s.combo;
    s.player.pose = 'idle';
    s.player.y = 0;
    for (let i = 0; i < 12; i++) advance(s, inp({ attack: i === 0 }));
    expect(s.combo).toBeGreaterThan(combo0);
    expect(s.score).toBe(score0);
  });
});

describe('바닥 화산탄 더미 파밍 [정본: 반복 점수, 콤보는 플래그 off]', () => {
  it('더미를 치면 점수·게이지만 오르고 콤보는 그대로, 타격 이벤트는 틱당 하나', () => {
    expect(SCORE.GROUND_ROCK_COMBO).toBe(false);
    const s = makeState();
    enterAct2Phase(s, 'rock');
    s.stackSpawnCd = 9999;
    s.groundRocks = 2;
    s.combo = 5;
    const score0 = s.score;
    const gauge0 = s.wazaGauge;
    let hits = 0;
    for (let i = 0; i < 14; i++) {
      advance(s, inp({ attack: i === 0 }));
      hits += s.events.filter((e) => e.kind === 'hit').length;
      s.events.length = 0;
    }
    expect(s.score).toBeGreaterThan(score0);
    expect(s.wazaGauge).toBeGreaterThan(gauge0);
    expect(s.combo).toBe(5);
    expect(hits).toBe(1);
  });
});

describe('광고 부활 grantMercyLife', () => {
  it('라이프 1·무적 틱 부여, 콤보·점수 유지, 한 틱 지나면 무적이 한 칸 줄고 피격은 막힌다', () => {
    const s = makeState();
    enterAct2Phase(s, 'rock');
    s.stackSpawnCd = 9999;
    s.over = 'gameover';
    s.lives = 0;
    s.combo = 33;
    s.score = 123456;
    s.player.pose = 'dead';
    grantMercyLife(s);
    expect(s.over).toBeNull();
    expect(s.lives).toBe(1);
    expect(s.combo).toBe(33);
    expect(s.score).toBe(123456);
    expect(s.player.pose).toBe('idle');
    expect(s.player.invulnTicks).toBe(PLAYER.HIT_IFRAMES);
    advance(s, EMPTY_INPUT);
    expect(s.player.invulnTicks).toBe(PLAYER.HIT_IFRAMES - 1);
    s.entities.push({ kind: 'bolt', lane: 0, y: 6, vy: 0, cueTicks: 0 });
    advance(s, EMPTY_INPUT);
    expect(s.lives).toBe(1);          // 무적이라 번개가 닿아도 라이프를 안 먹는다
  });

  it('깔려 죽은 판이면 눌려 있던 건물이 풀려 위로 뜬다', () => {
    const s = makeState();
    enterAct2Phase(s, 'cathedral');
    s.stackSpawnCd = 9999;
    s.stack = makeStack({ variant: 'cathedral', theme: 'modern', floors: [makeFloor('cathedral')], y: 0, vy: 0 });
    s.stack.resting = true;
    s.over = 'gameover';
    s.lives = 0;
    grantMercyLife(s);
    expect(s.stack.resting).toBe(false);
    expect(s.stack.vy).toBeGreaterThanOrEqual(STACK.PIN_ESCAPE_V);
    expect(s.stack.y).toBeGreaterThan(0);
  });
});
