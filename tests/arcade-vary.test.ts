// 아케이드 「판 안 재미」(11-19) — 변종 건물(ARCADE_VARY) · 현장 조건(PERK) · 초반 기다림(생김 높이).
// 지시서 판 결정성(불변 14)은 tests/stage.test.ts가 지킨다 — 여기는 아케이드 판에서만 달라짐을 본다.
import { describe, expect, it } from 'vitest';
import { ACT1, ARCADE_VARY, BONUS, GUARD_GAUGE, PERK, PERK_RUN, STACK, STAGE, TICK, VIEW, WEAPON } from '../src/config';
import { makeFloor, makeStack, stackPhysics } from '../src/core/building';
import { destroyStack, hitGauge } from '../src/core/combat';
import { spawnTopY } from '../src/core/camera';
import { dustMul, guardMax, liftOf, reachOf } from '../src/core/perks';
import { advance, enterBonus, makeState } from '../src/core/sim';
import { rollVary, spawnAct1Building } from '../src/core/spawner';
import { EMPTY_INPUT, type GameState, type InputFrame, type PerkId, type StackVary } from '../src/core/types';
import { rngSkip } from '../src/core/rng';

const JUMP: InputFrame = { ...EMPTY_INPUT, jump: true };
const ATTACK: InputFrame = { ...EMPTY_INPUT, attack: true };

function arcade(seed = 7): GameState {
  const s = makeState({ seed });
  s.perk = { picked: [], seen: [], offer: null };
  return s;
}

/** 버터바를 끝내고 아케이드로 돌아오는 틱까지 — 쪽지가 뜬다 */
function finishBonus(s: GameState): void {
  enterBonus(s, 1);
  s.bonus!.queue = [];
  s.stackSpawnCd = 0;
  advance(s, EMPTY_INPUT);
  s.events.length = 0;
}

/** 쪽지를 고른다 — 손을 CALM틱 놓았다가 누른다 */
function pick(s: GameState, f: InputFrame): void {
  for (let i = 0; i < PERK_RUN.CALM; i++) advance(s, EMPTY_INPUT);
  advance(s, f);
}

describe('변종 확률표', () => {
  it('확률은 0~1이고 구역마다 얼굴이 다르다(1 거의 없음 · 2 빠름+붙어 옴 · 3 성급 · 4 셋 다)', () => {
    for (const r of ARCADE_VARY.RATE) for (const k of ['fast', 'hasty', 'joined'] as const) {
      expect(r[k][0]).toBeGreaterThanOrEqual(0);
      expect(r[k][1]).toBeLessThanOrEqual(1);
      expect(r[k][1]).toBeGreaterThanOrEqual(r[k][0]); // p와 함께 오른다
    }
    const [c1, c2, c3, c4] = ARCADE_VARY.RATE;
    expect(Math.max(c1.fast[1], c1.hasty[1], c1.joined[1])).toBeLessThanOrEqual(0.05);
    expect(c2.hasty[1]).toBe(0);
    expect(c2.fast[0]).toBeGreaterThan(0);
    expect(c2.joined[0]).toBeGreaterThan(0);
    expect(c3.fast[1] + c3.joined[1]).toBe(0);
    expect(c3.hasty[0]).toBeGreaterThan(0);
    expect(Math.min(c4.fast[0], c4.hasty[0], c4.joined[0])).toBeGreaterThan(0);
  });

  it('뽑힌 빈도가 표를 따른다(구역 끝, 3000채)', () => {
    const ends = [0.249, 0.499, 0.749, 1];
    ends.forEach((pc, ch) => {
      const s = makeState({ seed: 100 + ch });
      const n = { fast: 0, hasty: 0, joined: 0 };
      for (let i = 0; i < 3000; i++) {
        const v = rollVary(s, pc);
        if (v?.fast) n.fast += 1;
        if (v?.hasty) n.hasty += 1;
        if (v?.joined) n.joined += 1;
      }
      for (const k of ['fast', 'hasty', 'joined'] as const) {
        const want = ARCADE_VARY.RATE[ch][k][1];
        expect(Math.abs(n[k] / 3000 - want)).toBeLessThan(0.03);
      }
    });
  });

  it('판 시작 CALM채까지는 뽑지 않는다 — 그 뒤엔 난수 셋을 더 쓴다', () => {
    const used = (drops: number) => {
      const s = makeState({ seed: 9 });
      s.p = 0.6;
      s.drops = drops;
      const before = s.rngState;
      spawnAct1Building(s);
      let n = 0;
      while (rngSkip(before, n) !== s.rngState && n < 100) n += 1;
      return { n, stack: s.stack! };
    };
    const early = used(ARCADE_VARY.CALM - 1);
    const late = used(ARCADE_VARY.CALM);
    expect(early.stack.vary).toBeUndefined();
    expect(late.n - early.n).toBe(3);
  });

  it('특별작전 판은 변종도 생김 높이도 그대로다', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s = makeState({ seed });
      s.gimmick = 'night';
      s.p = 0.9;
      s.drops = 50;
      spawnAct1Building(s);
      expect(s.stack!.vary).toBeUndefined();
      expect(s.stack!.y).toBe(STACK.SPAWN_Y);
    }
  });
});

describe('변종 동작 — 지시서와 같다', () => {
  const stack = (s: GameState, vary: Partial<StackVary>) => {
    s.stack = makeStack({ variant: 'building', theme: 'asia', floors: [makeFloor('mid'), makeFloor('weak')], y: 300 });
    s.stack.vary = { fast: false, hasty: false, hastyT: 0, joined: false, fall: 1, ...vary };
  };

  it('빠른 낙하 = 한 단계(FAST_SPEED_ADD) 앞의 p', () => {
    const s = makeState();
    s.p = 0.4;
    stack(s, {});
    const plain = stackPhysics(s);
    s.stack!.vary!.fast = true;
    const fast = stackPhysics(s);
    s.p = 0.4 + STAGE.FAST_SPEED_ADD;
    s.stack!.vary!.fast = false;
    expect(fast).toEqual(stackPhysics(s));
    expect(fast.vterm).toBeGreaterThan(plain.vterm);
  });

  it('성급한 건물 — 최하층 HP1로 HASTY_TICKS 남으면 낙하 ×HASTY_FALL · 급락 예고음 한 번', () => {
    const s = makeState();
    s.p = 0.6;
    s.stackSpawnCd = 9999;
    stack(s, { hasty: true });
    s.stack!.y = 5000; // 땅에 안 닿게
    s.stack!.floors[0].segs[0].hp = 1;
    let cues = 0;
    for (let t = 0; t < STAGE.HASTY_TICKS + 5; t++) {
      advance(s, EMPTY_INPUT);
      cues += s.events.filter((e) => e.kind === 'boltCue').length;
      s.events.length = 0;
    }
    expect(cues).toBe(1);
    expect(s.stack!.vary!.fall).toBe(STAGE.HASTY_FALL);
    const g1 = stackPhysics(s).g;
    s.stack!.vary!.fall = 1;
    expect(g1).toBeCloseTo(stackPhysics(s).g * STAGE.HASTY_FALL, 6);
  });

  it('성급한 건물의 맨 아래는 약재가 아니다(생기자마자 세지 않게)', () => {
    let seen = 0;
    for (let seed = 1; seed <= 400 && seen < 10; seed++) {
      const s = makeState({ seed });
      s.p = 0.6;
      s.drops = 20;
      spawnAct1Building(s);
      if (!s.stack!.vary?.hasty) continue;
      seen += 1;
      expect(s.stack!.floors[0].mat).not.toBe('weak');
    }
    expect(seen).toBe(10);
  });

  it('붙어 오기 — 부수면 다음 건물 대기가 JOINED_GAP', () => {
    const s = makeState();
    stack(s, { joined: true });
    destroyStack(s);
    expect(s.stackSpawnCd).toBe(STAGE.JOINED_GAP);
    stack(s, {});
    destroyStack(s);
    expect(s.stackSpawnCd).toBe(STACK.RESPAWN_TICKS);
  });
});

describe('초반 기다림 — 생김 높이', () => {
  it('아케이드 건물은 화면 맨 위 바로 위(spawnTopY)에서 생긴다', () => {
    const s = makeState();
    spawnAct1Building(s);
    expect(s.stack!.y).toBe(spawnTopY(s));
    expect(s.stack!.y).toBe(VIEW.GROUND_Y - VIEW.FIELD_TOP + STAGE.SPAWN_ABOVE);
  });

  it('판 시작 1.5초 안에 첫 건물이 화면에 보인다', () => {
    const s = makeState();
    let t = 0;
    while (t < 600 && !(s.stack && s.stack.y < VIEW.GROUND_Y - VIEW.FIELD_TOP)) { advance(s, EMPTY_INPUT); t += 1; }
    expect(t).toBeLessThanOrEqual(90);
  });
});

describe('현장 조건 — 제안 · 고르기', () => {
  it('perk가 없는 판(토코톤 · 작전 · 지시서 · 버터바 도전)은 쪽지가 안 뜬다', () => {
    const s = makeState();
    finishBonus(s);
    expect(s.mode).toBe('act1');
    expect(s.perk).toBeNull();
  });

  it('버터바에서 돌아오면 쪽지가 뜨고 판이 선다 — 이벤트 하나', () => {
    const s = arcade();
    enterBonus(s, 1);
    s.bonus!.queue = [];
    s.stackSpawnCd = 0;
    advance(s, EMPTY_INPUT);
    expect(s.events.filter((e) => e.kind === 'perkOffer')).toHaveLength(1);
    const o = s.perk!.offer!;
    expect(PERK[o.a].side).toBe('safe');
    expect(PERK[o.b].side).toBe('greed');
    const tick = s.tick;
    const cd = s.stackSpawnCd;
    for (let i = 0; i < 100; i++) advance(s, EMPTY_INPUT);
    expect(s.tick).toBe(tick);
    expect(s.stackSpawnCd).toBe(cd);
  });

  it('점프 = 왼쪽 · 공격 = 오른쪽, 고를 때 이벤트 하나', () => {
    const l = arcade(3);
    finishBonus(l);
    const a = l.perk!.offer!.a;
    pick(l, JUMP);
    expect(l.perk!.picked).toEqual([a]);
    expect(l.perk!.offer).toBeNull();
    expect(l.events.filter((e) => e.kind === 'perkPick')).toEqual([{ kind: 'perkPick', n: 0 }]);

    const r = arcade(3);
    finishBonus(r);
    const b = r.perk!.offer!.b;
    pick(r, ATTACK);
    expect(r.perk!.picked).toEqual([b]);
  });

  it('연타가 이어지면 안 고른다(손을 CALM틱 놓아야) — AUTO틱이 지나면 왼쪽', () => {
    const s = arcade(5);
    finishBonus(s);
    const a = s.perk!.offer!.a;
    for (let i = 0; i < PERK_RUN.AUTO - 1; i++) advance(s, i % 6 === 0 ? ATTACK : EMPTY_INPUT);
    expect(s.perk!.offer).not.toBeNull();
    advance(s, EMPTY_INPUT);
    expect(s.perk!.offer).toBeNull();
    expect(s.perk!.picked).toEqual([a]);
  });

  it('한 판에 셋 — 같은 조건은 두 번 안 나오고, 쓰고 있으면 새 안전모는 안 나온다', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = arcade(seed);
      const shown: PerkId[] = [];
      for (let round = 0; round < 4; round++) {
        s.hat = true;
        finishBonus(s);
        const o = s.perk!.offer;
        if (round === 3) { expect(o).toBeNull(); break; } // 넷째는 없다(MAX 3)
        expect(o).not.toBeNull();
        expect(o!.a).not.toBe('hat');
        shown.push(o!.a, o!.b);
        pick(s, round % 2 ? JUMP : ATTACK);
      }
      expect(new Set(shown).size).toBe(shown.length);
    }
  });

  it('같은 시드 + 같은 입력 = 같은 판(쪽지 · 고른 것 포함)', () => {
    const run = () => {
      const s = arcade(42);
      s.lives = 99;
      s.score = Math.ceil(ACT1.CHAPTER_BOUNDS[0] * ACT1.UNLOCK_SCORE) - 2000;
      for (let t = 0; t < 60 * 60 * 2; t++) {
        advance(s, s.perk?.offer ? (t % 40 === 0 ? ATTACK : EMPTY_INPUT) : t % 7 === 0 ? ATTACK : EMPTY_INPUT);
        s.events.length = 0;
      }
      return s;
    };
    const a = run();
    expect(a.perk!.picked.length).toBeGreaterThan(0); // 버터바를 지나 하나 골랐다
    expect(JSON.stringify(a)).toBe(JSON.stringify(run()));
  });
});

describe('현장 조건 — 효과', () => {
  const take = (s: GameState, id: PerkId) => { s.perk = { picked: [id], seen: [id], offer: null }; };

  it('perk가 없으면 무기 값 그대로(지시서 판 결정성)', () => {
    const s = makeState();
    s.weapon = 'hammer';
    expect(reachOf(s)).toBe(WEAPON.hammer.reach);
    expect(liftOf(s)).toBe(WEAPON.hammer.lift);
    expect(guardMax(s)).toBe(GUARD_GAUGE.MAX);
    expect(hitGauge(s)).toBe(hitGauge({ ...s, perk: { picked: [], seen: [], offer: null } }));
  });

  it('긴 자루 사거리 +10 · 맨손 띄우기 +12(상한 LIFT_MAX) · 사거리 -14', () => {
    const s = makeState();
    take(s, 'reach');
    expect(reachOf(s)).toBe(WEAPON.sword.reach + 10);
    take(s, 'bare');
    expect(reachOf(s)).toBe(WEAPON.sword.reach - 14);
    expect(liftOf(s)).toBe(WEAPON.sword.lift + 12);
    for (const w of Object.keys(WEAPON) as (keyof typeof WEAPON)[]) {
      s.weapon = w;
      expect(liftOf(s)).toBeLessThan(102); // tests/weapons.test.ts 조건
    }
  });

  it('진한 커피 · 속전속결 = 필살 게이지 ×1.3 · ×1.6', () => {
    const s = makeState();
    s.combo = 40;
    const base = hitGauge(s);
    take(s, 'coffee');
    expect(hitGauge(s)).toBeCloseTo(base * 1.3, 9);
    take(s, 'rush');
    expect(hitGauge(s)).toBeCloseTo(base * 1.6, 9);
  });

  it('속전속결 가드 최대 -25 — 고르는 순간 게이지가 줄고 회복도 거기서 멈춘다', () => {
    const s = arcade(11);
    finishBonus(s);
    s.perk!.offer!.b = 'rush';
    pick(s, ATTACK);
    expect(s.guardGauge).toBe(GUARD_GAUGE.MAX - 25);
    s.guardGauge = 10;
    s.stackSpawnCd = 99999;
    for (let i = 0; i < 60 * 20; i++) advance(s, EMPTY_INPUT);
    expect(s.guardGauge).toBe(GUARD_GAUGE.MAX - 25);
  });

  it('두꺼운 장갑 = 가드 회복 ×1.4', () => {
    const regen = (id: PerkId | null) => {
      const s = makeState();
      if (id) take(s, id);
      s.stackSpawnCd = 99999;
      s.guardGauge = 0;
      advance(s, EMPTY_INPUT);
      return s.guardGauge;
    };
    expect(regen('glove')).toBeCloseTo(regen(null) * 1.4, 9);
    expect(regen(null)).toBeCloseTo(GUARD_GAUGE.REGEN_PER_S * TICK, 9);
  });

  it('새 안전모 = 고르는 순간 쓴다', () => {
    const s = arcade(2);
    finishBonus(s);
    s.perk!.offer!.a = 'hat';
    pick(s, JUMP);
    expect(s.hat).toBe(true);
  });

  it('야근 = 먼지 ×1.5 · 건물 +1층', () => {
    const s = makeState({ seed: 4 });
    s.p = 0.3;
    spawnAct1Building(s);
    const n = s.stack!.floors.length;
    const t = makeState({ seed: 4 });
    t.p = 0.3;
    take(t, 'overtime');
    spawnAct1Building(t);
    expect(t.stack!.floors.length).toBe(n + 1);
    expect(dustMul(t)).toBe(1.5);
    expect(dustMul(s)).toBe(1);
  });

  it('버터바 · 토코톤엔 쪽지가 없다(돌아갈 곳이 토코톤)', () => {
    const s = arcade();
    s.mode = 'tokoton';
    enterBonus(s, BONUS.ROUNDS.length + 1, 'tokoton');
    s.bonus!.queue = [];
    s.stackSpawnCd = 0;
    advance(s, EMPTY_INPUT);
    expect(s.mode).toBe('tokoton');
    expect(s.perk!.offer).toBeNull();
  });
});
