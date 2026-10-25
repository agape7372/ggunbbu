// 보급 상자 — 주기·순서·난수 불변·효과, 안전모(깔림 1회 대신 받기), 1막·토코톤만 센다.
import { describe, it, expect } from 'vitest';
import { makeState, advance, enterBonus } from '../src/core/sim';
import { applyItem, onBuildingDown, pickItem } from '../src/core/items';
import { enterAct2, enterAct2Phase } from '../src/core/act2';
import { makeFloor, makeStack } from '../src/core/building';
import { EMPTY_INPUT, type GameState, type ItemId } from '../src/core/types';
import { GUARD_GAUGE, PLAYER, SUPPLY, WAZA_GAUGE } from '../src/config';

/** onBuildingDown을 n번 — 상자가 나온 완파 번호와 내용물 */
function downs(s: GameState, n: number): { at: number[]; items: ItemId[] } {
  const at: number[] = [];
  const items: ItemId[] = [];
  for (let i = 0; i < n; i++) {
    s.events.length = 0;
    onBuildingDown(s);
    for (const e of s.events) {
      if (e.kind === 'supply' && e.item) { at.push(s.drops); items.push(e.item); }
    }
  }
  return { at, items };
}

describe('보급 상자', () => {
  it('3·8·13번째 완파에서만 나온다', () => {
    expect(downs(makeState(), 15).at).toEqual([3, 8, 13]);
  });

  it('난수를 쓰지 않는다 — rngState 그대로', () => {
    const s = makeState({ seed: 5 });
    const before = s.rngState;
    downs(s, 40);
    expect(s.rngState).toBe(before);
  });

  it('안전모 → 믹스커피 → 장갑 → 먼지 자루 순서로 돈다', () => {
    const s = makeState();
    const got: ItemId[] = [];
    for (let i = 0; i < 4 * SUPPLY.EVERY; i++) {
      got.push(...downs(s, 1).items);
      s.hat = false; // 매번 벗겨서 순서만 본다
    }
    expect(got).toEqual(['hat', 'coffee', 'gloves', 'dust']);
  });

  it('안전모를 쓰고 있으면 다음 것이 나온다', () => {
    const s = makeState();
    s.hat = true;
    s.drops = SUPPLY.FIRST; // 첫 상자 = 안전모 차례
    expect(pickItem(s)).toBe('coffee');
  });

  it('네 가지 효과 — 먼지는 저장 몫이라 시뮬은 그대로', () => {
    const s = makeState();
    s.guardGauge = 10;
    applyItem(s, 'gloves');
    expect(s.guardGauge).toBe(GUARD_GAUGE.MAX);
    applyItem(s, 'coffee');
    expect(s.wazaGauge).toBe(SUPPLY.COFFEE_GAUGE);
    applyItem(s, 'coffee');
    expect(s.wazaGauge).toBe(WAZA_GAUGE.MAX);
    applyItem(s, 'hat');
    expect(s.hat).toBe(true);
    const before = JSON.stringify(s);
    applyItem(s, 'dust');
    expect(JSON.stringify(s)).toBe(before);
  });
});

/** 머리 위에 1층짜리 약한 건물을 띄워 두고 다 부술 때까지 친다 */
function smashOne(s: GameState): void {
  s.stack = makeStack({ variant: 'building', theme: 'europe', floors: [makeFloor('weak')], y: 40, vy: 0 });
  for (let t = 0; t < 60 && s.stack; t++) advance(s, { ...EMPTY_INPUT, attack: t % 7 === 0 });
  expect(s.stack).toBeNull();
}

describe('세는 곳', () => {
  it('1막 완파는 센다', () => {
    const s = makeState();
    smashOne(s);
    expect(s.drops).toBe(1);
  });

  it('토코톤 완파도 센다', () => {
    const s = makeState({ mode: 'tokoton' });
    smashOne(s);
    expect(s.drops).toBe(1);
  });

  it('버터바·2막에서 부순 건 세지 않는다', () => {
    const bonus = makeState();
    enterBonus(bonus, 1);
    smashOne(bonus);
    expect(bonus.drops).toBe(0);

    const act2 = makeState();
    enterAct2Phase(act2, 'bolt');
    smashOne(act2);
    expect(act2.drops).toBe(0);
  });
});

/** 졸라맨 머리 위로 막 내려앉는 건물 (HP3 층 셋) */
function landing(s: GameState): void {
  s.stack = makeStack({
    variant: 'building', theme: 'europe',
    floors: Array.from({ length: 3 }, () => makeFloor('hard')),
    y: 1, vy: -200,
  });
}

describe('안전모', () => {
  it('깔림 1회를 대신 받는다 — 목숨·콤보 그대로, 건물은 튕겨 오른다', () => {
    const s = makeState();
    s.hat = true;
    s.combo = 12;
    landing(s);
    advance(s, EMPTY_INPUT);
    expect(s.events.some((e) => e.kind === 'hatBreak')).toBe(true);
    expect(s.hat).toBe(false);
    expect(s.lives).toBe(PLAYER.LIVES);
    expect(s.combo).toBe(12);
    expect(s.player.pose).not.toBe('pinned');
    expect(s.stack!.vy).toBeGreaterThan(0);
  });

  it('모자가 없으면 다음 깔림은 그대로 들어온다', () => {
    const s = makeState();
    s.hat = true;
    landing(s);
    let t = 0;
    while (s.player.pose !== 'pinned' && t < 240) { advance(s, EMPTY_INPUT); t += 1; }
    expect(s.player.pose).toBe('pinned');
    expect(s.lives).toBe(PLAYER.LIVES - 1);
  });

  it('2막에 들어가면 벗는다', () => {
    const a = makeState();
    a.hat = true;
    enterAct2(a);
    expect(a.hat).toBe(false);
    const b = makeState();
    b.hat = true;
    enterAct2Phase(b, 'tower');
    expect(b.hat).toBe(false);
  });
});
