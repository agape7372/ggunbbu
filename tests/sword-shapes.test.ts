// 칼 모양 자료 — 상점 그림(ink.ts swordSvg)과 판 속 칼(sprites.ts)이 같은 자료(render/swordShapes)를 쓴다.
// Path2D는 node에 없으니 풀이(parseShape)까지만 본다. 캔버스 그리기는 캡처로 확인한다.
import { describe, expect, it } from 'vitest';
import { WEAPON_IDS } from '../src/meta/loadout';
import { SWORD_HOLD, SWORDS, parseShape } from '../src/render/swordShapes';
import { swordSvg } from '../src/ui/ink';

describe('sword shapes', () => {
  it('열두 무기 모두 모양 · 쥐는 법이 있다', () => {
    expect(WEAPON_IDS).toHaveLength(12);
    for (const id of WEAPON_IDS) {
      expect(SWORDS[id], id).toBeTruthy();
      const hold = SWORD_HOLD[id];
      expect(hold, id).toBeTruthy();
      expect(Math.abs(hold.handY - hold.tipY), id).toBeGreaterThan(50);
      expect(hold.k, id).toBeGreaterThan(0);
    }
  });

  it('풀이 결과가 비어 있지 않고 조각마다 path · 알려진 색 뜻만 든다', () => {
    for (const id of WEAPON_IDS) {
      const parts = parseShape(id);
      expect(parts.length, id).toBeGreaterThan(0);
      for (const p of parts) {
        expect(p.d, id).toMatch(/^M/);
        expect(['', 'p', 'g', 'pr', 'y'], id).toContain(p.cls);
      }
    }
  });

  it('SVG 요소 수 = 풀이 조각 수(원 · 사각형도 path로 바뀌어 빠지는 것 없음) · 색 뜻이 보존된다', () => {
    for (const id of WEAPON_IDS) {
      const n = (SWORDS[id].match(/<(path|circle|rect)\b/g) ?? []).length;
      expect(parseShape(id), id).toHaveLength(n);
    }
    expect(parseShape('gold').filter((p) => p.cls === 'pr')).toHaveLength(2); // 속 빈 고리 둘
    expect(parseShape('flame').filter((p) => p.cls === 'y')).toHaveLength(6); // 불꽃 혀 노랑
    expect(parseShape('iron').some((p) => p.cls === 'p')).toBe(true);        // 한지색 갈필
  });

  it('원 · 사각형은 path로 풀린다(마스크 도트 · 그라인더 축)', () => {
    expect(parseShape('grinder').some((p) => p.d.includes('a44 44'))).toBe(true);
    expect(parseShape('mask').some((p) => p.d === 'M40 70 h12 v12 h-12 Z')).toBe(true);
  });

  it('모르는 id는 철거칼 모양', () => {
    expect(parseShape('???')).toEqual(parseShape('sword'));
  });

  it('상점 swordSvg가 같은 자료를 쓴다', () => {
    for (const id of WEAPON_IDS) expect(swordSvg(id), id).toContain(SWORDS[id]);
    expect(swordSvg('???')).toContain(SWORDS.sword);
  });
});
