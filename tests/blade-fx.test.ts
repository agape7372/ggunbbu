// 대검 이펙트(bladeFx) — 여덟 칼이 서로 다르게 터지고, 다 터진 뒤엔 하나도 안 남는다(이펙트는 제자리로 돌아온다).
// 색만으로는 못 가른다 — 그리기 묶음(선·원·타원·사각형…)까지 같이 본다.
import { describe, expect, it } from 'vitest';
import { makeState } from '../src/core/sim';
import type { JuiceEvent, WeaponId } from '../src/core/types';
import { GREATSWORD_IDS } from '../src/meta/loadout';
import { bladeReact, drawBladeFx, drawBladeShot, resetBladeFx, updateBladeFx } from '../src/render/bladeFx';

/** 그릴 때 고른 색과 부른 그리기를 모으는 ctx */
function drawn(draw = (c: CanvasRenderingContext2D) => drawBladeFx(c, 0)): string {
  const seen = new Set<string>();
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k) => () => seen.add(String(k)),
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
}

describe('대검 이펙트', () => {
  it('여덟 칼의 타격·층 깨기·완파가 서로 다르게 그려진다', () => {
    const sigs = GREATSWORD_IDS.map((w) => {
      burst(w);
      return drawn();
    });
    expect(new Set(sigs).size).toBe(GREATSWORD_IDS.length);
  });

  it('철거칼엔 덧칠이 없고, 대검도 2초 뒤엔 하나도 안 남는다', () => {
    burst('sword');
    expect(drawn()).toBe('');
    for (const w of GREATSWORD_IDS) {
      burst(w);
      expect(drawn(), w).not.toBe('');
      for (let i = 0; i < 125; i++) updateBladeFx(1 / 60);
      expect(drawn(), w).toBe('');
    }
  });

  it('상점 진열 사진은 칼마다 그리고, 빌린 판 풀은 비워 둔다', () => {
    for (const w of GREATSWORD_IDS) {
      expect(drawn((c) => drawBladeShot(c, w, 0, 0)), w).not.toBe('');
      expect(drawn(), w).toBe('');
    }
  });
});
