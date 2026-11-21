// 대검 이펙트(bladeFx) — 열아홉 칼이 서로 다르게 터지고, 다 터진 뒤엔 하나도 안 남는다(이펙트는 제자리로 돌아온다).
// 색만으로는 못 가른다 — 그리기 묶음(선·원·타원·사각형…)까지 같이 본다.
import { describe, expect, it } from 'vitest';
import { WEAPON_INK } from '../src/config';
import { makeState } from '../src/core/sim';
import type { JuiceEvent, WeaponId } from '../src/core/types';
import { GREATSWORD_IDS, WEAPON_IDS } from '../src/meta/loadout';
import { RECIPES, bladeReact, drawBladeFx, resetBladeFx, updateBladeFx, weaponAlong } from '../src/render/bladeFx';
import { greatLook } from '../src/render/sprites';
import { liveBits } from '../src/render/weaponFx';

/** 그릴 때 고른 색과 부른 그리기를 모으는 ctx */
function drawn(draw = (c: CanvasRenderingContext2D) => drawBladeFx(c, 0)): string {
  const seen = new Set<string>();
  const ctx = new Proxy({} as Record<string, unknown>, {
    // 그라데이션(전설 먹 + 색)은 쓴 색을 남긴다
    get: (_t, k) => (/^create\w*Gradient$/.test(String(k))
      ? () => ({ addColorStop: (_o: number, c: string) => seen.add(c), toString: () => 'grad' })
      : () => seen.add(String(k))),
    set: (_t, k, v) => {
      if (k === 'fillStyle' || k === 'strokeStyle') seen.add(String(v));
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  draw(ctx);
  return [...seen].sort().join(' ');
}

const EVENTS: JuiceEvent[] = [
  { kind: 'hit', lane: 0, y: 120, combo: 10 },
  { kind: 'floorCollapse', lane: 0, y: 120, combo: 11 },
  { kind: 'stackDestroy', n: 4 },
];

function burst(w: WeaponId): void {
  resetBladeFx();
  const s = makeState();
  s.weapon = w;
  s.player.pose = 'attack';
  for (const e of EVENTS) bladeReact(s, e);
  for (let i = 0; i < 6; i++) updateBladeFx(1 / 60); // 전설은 둘째 박자(later)로 펼쳐진다 — 0.1초 뒤 그림까지 본다
}

describe('대검 이펙트', () => {
  it('열아홉 칼의 타격·층 깨기·완파가 서로 다르게 그려진다', () => {
    const sigs = GREATSWORD_IDS.map((w) => {
      burst(w);
      return drawn();
    });
    expect(new Set(sigs).size).toBe(GREATSWORD_IDS.length);
  });

  it('철거칼·연장도 제 덧칠이 있고(weaponFx), 모든 무기가 2초 뒤엔 하나도 안 남는다', () => {
    for (const w of WEAPON_IDS) {
      burst(w);
      expect(drawn(), w).not.toBe('');
      for (let i = 0; i < 125; i++) updateBladeFx(1 / 60);
      expect(drawn(), w).toBe('');
    }
  });

  it('전설은 마지막 층 틱에 층 깨기 그림을 건너뛴다(같은 틱 완파와 두 겹이 되지 않게)', () => {
    for (const [w, ink] of [['flame', WEAPON_INK.flame], ['gold', WEAPON_INK.gold], ['diadrill', WEAPON_INK.diadrill]] as const) {
      for (const last of [false, true]) {
        for (const kind of ['floorCollapse', 'butterCollapse'] as const) {
          resetBladeFx();
          const s = makeState();
          s.weapon = w;
          s.player.pose = 'attack'; // 칼길까지 건너뛰는지 본다
          bladeReact(s, { kind, lane: 0, y: 120, combo: 11, ...(last ? { last } : {}) });
          for (let i = 0; i < 12; i++) updateBladeFx(1 / 60);
          expect(drawn().includes(ink), `${w} ${kind} last=${last}`).toBe(!last);
        }
      }
      // 필살 올려베기(한 틱에 층 여럿)도 층마다 그리지 않는다
      resetBladeFx();
      const s = makeState();
      s.weapon = w;
      s.player.pose = 'attack';
      bladeReact(s, { kind: 'floorCollapse', lane: 0, y: 120, combo: 11, waza: true });
      for (let i = 0; i < 12; i++) updateBladeFx(1 / 60);
      expect(drawn().includes(ink), `${w} waza`).toBe(false);
    }
    // 전설 아닌 칼은 마지막 층에도 그대로 그린다(지나치게 막지 않는다)
    resetBladeFx();
    const s = makeState();
    s.weapon = 'iron';
    s.player.pose = 'attack';
    bladeReact(s, { kind: 'floorCollapse', lane: 0, y: 120, combo: 11, last: true });
    for (let i = 0; i < 12; i++) updateBladeFx(1 / 60);
    expect(drawn(), 'iron last').not.toBe('');
  });
});

describe('필살 × 대검 — 큰 획을 따라 번짐(waza.along)', () => {
  const ELEMENT5 = ['phoenix', 'tide', 'volt', 'icicle', 'shade'];
  const OLD = GREATSWORD_IDS.filter((w) => !ELEMENT5.includes(w));
  const PATH = [60, 600, 140, 470, 200, 400, 300, 230]; // 사선 꺾은선(약 430px) — 필살 큰 획 꼴

  it('기존 대검 열넷은 제 waza가 있고, 값싼 칼도 한 번에 6조각 넘게 동시에 보이며, 뿌리부터 번진다', () => {
    expect(OLD).toHaveLength(14);
    for (const w of OLD) {
      expect(RECIPES[greatLook(w)!.shape].waza, w).toBeDefined();
      resetBladeFx();
      weaponAlong(w, PATH, 1, 0.3);
      expect(Math.min(...liveBits().map((p) => p.y)), `${w} 뿌리부터`).toBeGreaterThan(470); // 아직 위쪽 끝은 안 나왔다
      let peak = 0;
      for (let i = 0; i < 40; i++) {
        updateBladeFx(1 / 60);
        peak = Math.max(peak, liveBits().length);
      }
      expect(peak, w).toBeGreaterThanOrEqual(6);
    }
  });

  it('열넷의 번짐이 서로 다르게 그려진다', () => {
    const sigs = OLD.map((w) => {
      resetBladeFx();
      weaponAlong(w, PATH, 1, 0.3);
      for (let i = 0; i < 14; i++) updateBladeFx(1 / 60);
      return drawn();
    });
    expect(new Set(sigs).size).toBe(OLD.length);
  });
});
