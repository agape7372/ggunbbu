import { describe, it, expect } from 'vitest';
import { makeState, advance } from '../src/core/sim';
import { makeFloor, makeStack } from '../src/core/building';
import { cameraFollowY } from '../src/core/camera';
import { EMPTY_INPUT, type GameState, type Material } from '../src/core/types';
import { PLAYER, VIEW } from '../src/config';

/** 건물 밑에서 뛰어 period틱마다 공격을 누른다. 땅에 닿거나 건물이 없어지면 끝 */
export function airRun(mats: Material[], y0: number, period: number, vy = 0, weapon?: GameState['weapon']) {
  const s = makeState();
  s.stackSpawnCd = 100000;
  if (weapon) s.weapon = weapon;
  s.stack = makeStack({ variant: 'building', theme: 'europe', floors: mats.map(makeFloor), y: y0, vy });
  let hits = 0, cuts = 0, whiffs = 0, bonks = 0, peak = 0, cam = 0, left = false;
  advance(s, { ...EMPTY_INPUT, jump: true });
  for (let t = 0; t < 900; t++) {
    const n = s.events.length;
    advance(s, { ...EMPTY_INPUT, attack: t % period === 0 });
    for (const e of s.events.slice(n)) {
      if (e.kind === 'hit') hits += 1;
      else if (e.kind === 'floorCollapse') { hits += 1; cuts += 1; }
      else if (e.kind === 'slash') whiffs += 1;
      else if (e.kind === 'headBonk') bonks += 1;
    }
    peak = Math.max(peak, s.player.y);
    cam = Math.max(cam, cameraFollowY(s));
    if (s.player.y > 0) left = true;
    if (left && s.player.y <= 0) break;
    if (!s.stack && s.player.vy <= 0) break;
  }
  return { hits, cuts, whiffs, bonks, peak: Math.round(peak), cam: Math.round(cam), floors: peak / VIEW.FLOOR_H };
}

// ★11-22 사용자: "원작처럼 높게 올라가서 다다다다다 쳐야 하는데 — 여러번 고쳐도 안된다".
// 고치기 전 기준선(이 파일 첫 판으로 잼): 약한 8층 밑에서 뛰어 연타 = 공중 타격 1 · 헛스윙 3 · 최고 2층 · cam 0.
// 벤 건물은 떠밀려 올라가고 몸은 떨어져서, 그리고 층이 깨져도 위층이 내려앉아 밑면이 안 올라서였다.
const w = (n: number, m: Material = 'weak'): Material[] => Array.from({ length: n }, () => m);

describe('공중 베기 — 매달려 베고, 층을 깨며 오른다 (11-22)', () => {
  // 연타 7틱(8.6타/s) ~ 12틱(5타/s) = 사용자 대역
  for (const period of [7, 9, 12]) {
    it(`약한 8층: 한 번 뛰어 연타 ${period}틱으로 여덟 층을 다 깬다 — 땅에 안 닿고 화면보다 높이 오른다`, () => {
      const r = airRun(w(8), 200, period);
      expect(r.cuts).toBe(8);
      expect(r.peak).toBeGreaterThan(VIEW.FIELD_H - VIEW.FIELD_TOP);
      expect(r.cam).toBeGreaterThan(400);
    });

    it(`보통 6층(HP 2): 연타 ${period}틱이 공중에서 끊기지 않는다 — 열두 번 다 닿는다`, () => {
      const r = airRun(w(6, 'mid'), 200, period);
      expect(r.hits).toBe(12);
      expect(r.cuts).toBe(6);
    });

    it(`내려오는 건물(낙하 238)도 연타 ${period}틱으로 타고 오른다`, () => {
      const r = airRun(w(8), 300, period, -238);
      expect(r.cuts).toBe(8);
      expect(r.floors).toBeGreaterThan(9);
    });
  }

  it('사거리가 가장 짧은 무기(60)도 끊기지 않는다', () => {
    const r = airRun(w(6, 'mid'), 200, 9, 0, 'hammer');
    expect(r.hits).toBe(12);
  });

  it('베며 오르는 동안엔 머리 박음 반응이 없다(처음 닿을 때 한 번까지)', () => {
    expect(airRun(w(8), 200, 7).bonks).toBeLessThanOrEqual(1);
  });

  it('땅에서 벤 층은 그대로 내려앉는다 — 밑면이 안 올라간다(땅 연타 균형)', () => {
    const s = makeState();
    s.stackSpawnCd = 100000;
    s.stack = makeStack({ variant: 'building', theme: 'europe', floors: w(4).map(makeFloor), y: 60 });
    for (let t = 0; t < 12 && s.stack.floors.length === 4; t++) advance(s, { ...EMPTY_INPUT, attack: t === 0 });
    expect(s.stack.floors.length).toBe(3);
    expect(s.stack.y).toBeLessThan(60 + VIEW.FLOOR_H / 2);
    expect(s.player.y).toBe(0);
  });

  it('밑면이 상한을 넘으면 층이 다시 내려앉는다 — 끝없이 오르지 않는다', () => {
    const r = airRun(w(60), 200, 7);
    expect(r.peak).toBeLessThan(PLAYER.AIR_CUT_CEIL + VIEW.FLOOR_H + 300);
  });

  it('그냥 뛰면(안 베면) 옛날대로 밑면에 막힌다', () => {
    const r = airRun(w(8), 200, 100000);
    expect(r.peak).toBeLessThan(200);
  });
});
