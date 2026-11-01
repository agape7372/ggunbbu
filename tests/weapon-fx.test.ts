// 연장·작은 순간 이펙트(weaponFx) — 연장 넷이 서로 다른 조각으로 터지고, 한 이벤트의 조각 수는 상한 안이고,
// 연타 줄은 박자마다 획 각이 바뀌고, 마스크를 쓰면 필살·완파에 그 색 도트가 흩어진다. 다 터진 뒤엔 하나도 안 남는다.
// 판 위 필살 그림은 wazaShow가 맡는다(11-01) — 여기선 필살 때 마스크 도트만 본다.
import { beforeEach, describe, expect, it } from 'vitest';
import { makeState } from '../src/core/sim';
import type { GameState, JuiceEvent, JuiceKind, WazaId, WeaponId } from '../src/core/types';
import { WAZA_IDS, WEAPON_IDS } from '../src/meta/loadout';
import { bladeReact, drawBladeFx, resetBladeFx, updateBladeFx, type Bit } from '../src/render/bladeFx';
import { liveBits, setFxMask } from '../src/render/weaponFx';
import { drawWazaShot } from '../src/render/wazaShow';

const TOOL_IDS: readonly WeaponId[] = ['sword', 'hammer', 'crowbar', 'grinder'];
const STRIKES = ['hit', 'floorCollapse', 'stackDestroy', 'slash'] as const;
const MOMENTS = ['special', 'gaugeFull', 'comboBreak', 'pinEscape'] as const;
/** 한 이벤트가 새로 뿌리는 조각 상한 — 평타 10 · 층 깨기 24 · 완파·필살 48 */
const CAP: Partial<Record<JuiceKind, number>> = {
  hit: 10, slash: 10, floorCollapse: 24, stackDestroy: 48, special: 48, gaugeFull: 10, comboBreak: 10, pinEscape: 10,
};

/** 아무 그리기나 받는 ctx — 그리다 던지지 않는지만 본다 */
const sink = new Proxy({}, { get: () => () => undefined, set: () => true }) as unknown as CanvasRenderingContext2D;

function state(w: WeaponId, waza: WazaId = 'tenchi'): GameState {
  const s = makeState();
  s.weapon = w;
  s.waza = waza;
  s.player.pose = 'attack';
  return s;
}

/** 그린 순서 그대로 — 메서드 이름 + 반올림한 인자 + 색 */
function traced(draw: (c: CanvasRenderingContext2D) => void): string {
  const log: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k) => (...a: unknown[]) => { log.push(`${String(k)}(${a.map((v) => (typeof v === 'number' ? Math.round(v) : v)).join(',')})`); },
    set: (_t, k, v) => {
      if (k === 'fillStyle' || k === 'strokeStyle') log.push(String(v));
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  draw(ctx);
  return log.join(' ');
}

const ev = (kind: JuiceKind, combo = 10): JuiceEvent => ({ kind, lane: 0, y: 120, combo, n: 4 });

/** 자국(베기 자국·잔상)을 뺀 조각 수 — 톱날 대검 평타는 기존 그대로 자국 포함 11개라 상한은 조각으로 잰다 */
const pieces = (): number => liveBits().filter((p) => p.k !== 'cut' && p.k !== 'ghost').length;
/** 붓 획 · 베기 자국 — 연장은 hook, 대검은 stroke(먹 붓 획) · cut(옛 렌즈 자국) */
const strokes = (): Bit[] => liveBits().filter((p) => p.k === 'cut' || p.k === 'hook' || p.k === 'stroke');
const kinds = (): string => [...new Set(liveBits().map((p) => p.k))].sort().join(' ');

/** 다 흘려 보낸다 — 2초 */
function settle(): void {
  for (let i = 0; i < 125; i++) updateBladeFx(1 / 60);
}

beforeEach(() => {
  setFxMask(null);
  resetBladeFx();
});

describe('연장·필살 이펙트', () => {
  it('무기 12종 × 타격·층 깨기·완파·헛스윙 — 던지지 않고, 3타째·높은 콤보·마스크까지 얹어도 상한 안, 2초 뒤엔 0', () => {
    setFxMask(['#E5302E', '#FFD200']);
    for (const w of WEAPON_IDS) {
      // 대검의 높은 콤보는 기존 RECIPES가 일부러 키운다(비쌀수록 화려) — 연장만 콤보 210까지 본다
      for (const combo of TOOL_IDS.includes(w) ? [10, 210] : [10]) {
        for (const kind of STRIKES) {
          resetBladeFx();
          const s = state(w);
          s.tick = 0;
          bladeReact(s, ev('hit', combo));
          s.tick = 10;
          bladeReact(s, ev('hit', combo));
          s.tick = 20; // 이번이 줄의 3타 — 제일 크다
          const before = pieces();
          bladeReact(s, ev(kind, combo));
          const n = pieces() - before;
          expect(n, `${w} ${kind} ${combo}`).toBeLessThanOrEqual(CAP[kind]!);
          drawBladeFx(sink, 0);
          settle();
          expect(liveBits(), `${w} ${kind}`).toHaveLength(0);
        }
      }
    }
  });

  it('필살 셋 · 게이지 참 · 콤보 끊김 · 깔림 탈출 — 무기마다 그림이 있고 상한 안, 2초 뒤엔 0', () => {
    setFxMask(['#1A1A20', '#FFD200', '#F07AA0']);
    for (const w of WEAPON_IDS) {
      for (const waza of WAZA_IDS) {
        for (const kind of MOMENTS) {
          resetBladeFx();
          bladeReact(state(w, waza), { kind, lane: 0, combo: 30 });
          const n = liveBits().length;
          expect(n, `${w} ${waza} ${kind}`).toBeGreaterThan(0);
          expect(n, `${w} ${waza} ${kind}`).toBeLessThanOrEqual(CAP[kind]!);
          drawBladeFx(sink, 0);
          settle();
          expect(liveBits(), `${w} ${waza} ${kind}`).toHaveLength(0);
        }
      }
    }
  });

  it('연장 넷은 서로 다른 조각으로 터진다', () => {
    const sigs = TOOL_IDS.map((w) => {
      resetBladeFx();
      const s = state(w);
      for (const kind of STRIKES) bladeReact(s, ev(kind));
      return kinds();
    });
    expect(new Set(sigs).size).toBe(TOOL_IDS.length);
  });

  it('연타 줄 — 1·2·3타 자국이 내려베기 → 올려베기 → 가로로 돌고 3타째가 크다. 0.6초 넘게 쉬면 다시 1타', () => {
    for (const w of ['sword', 'iron'] as const) {
      resetBladeFx();
      const s = state(w);
      const cuts = [0, 20, 40, 120].map((tick) => {
        settle(); // 앞 타격 조각은 흘려 보낸다 — 박자는 시뮬 틱으로 센다
        s.tick = tick;
        bladeReact(s, ev('hit'));
        return strokes().sort((a, b) => b.size - a.size)[0];
      });
      const [down, up, flat, again] = cuts;
      expect(down.rot, w).toBeGreaterThan(0.15);
      expect(up.rot, w).toBeLessThan(-0.25);
      expect(Math.abs(flat.rot), w).toBeLessThan(0.15);
      expect(flat.size, w).toBeGreaterThan(down.size * 1.1);
      expect(again.rot, w).toBeGreaterThan(0.15);
    }
  });

  it('마스크 — 쓰면 필살·완파에 그 색 네모 도트가 흩어지고, 평타엔 없고, 벗으면(null·빈 목록) 안 나온다', () => {
    const ink = ['#E5302E', '#1E62D0'];
    setFxMask(ink);
    for (const kind of ['special', 'stackDestroy'] as const) {
      for (const w of ['sword', 'gold'] as const) {
        resetBladeFx();
        bladeReact(state(w), { kind, lane: 0, n: 4 });
        const pix = liveBits().filter((p) => p.k === 'pix');
        expect(pix.length, `${kind} ${w}`).toBeGreaterThan(0);
        expect(pix.every((p) => ink.includes(p.c1)), `${kind} ${w}`).toBe(true);
      }
    }
    resetBladeFx();
    bladeReact(state('sword'), ev('hit'));
    expect(liveBits().some((p) => p.k === 'pix')).toBe(false);
    for (const off of [null, []]) {
      setFxMask(off);
      resetBladeFx();
      bladeReact(state('sword'), { kind: 'special', lane: 0 });
      bladeReact(state('sword'), { kind: 'stackDestroy', n: 4 });
      expect(liveBits().some((p) => p.k === 'pix')).toBe(false);
    }
  });

  it('한 틱에 여러 번 쳐도(필살이 깬 층 여럿) 한 박으로 센다', () => {
    const s = state('sword');
    s.tick = 0;
    bladeReact(s, ev('hit'));
    bladeReact(s, ev('hit')); // 같은 틱
    settle();
    s.tick = 20;
    bladeReact(s, ev('hit'));
    const cut = strokes().sort((a, b) => b.size - a.size)[0];
    expect(cut.rot).toBeLessThan(-0.25); // 2타(올려베기) — 같은 틱 둘을 따로 셌다면 3타(가로)
  });

  it('필살 그림은 같은 틱 층 깨기·완파가 풀을 넘겨도 남는다', () => {
    setFxMask(['#E5302E']);
    for (const w of ['iron', 'saw', 'gold'] as const) {
      resetBladeFx();
      const s = state(w, 'ageba');
      bladeReact(s, { kind: 'special', lane: 0 });
      const mine = liveBits().length;
      for (let i = 0; i < 40; i++) bladeReact(s, { kind: 'floorCollapse', lane: 0, y: 120 + i * 40, combo: 250, n: 4 });
      bladeReact(s, { kind: 'stackDestroy', lane: 0, combo: 250, n: 4 });
      expect(liveBits().length, w).toBe(192); // 넘쳤다
      expect(liveBits().filter((p) => p.keep).length, w).toBe(mine);
    }
  });

  it('버터바에 깔려 뭉개질 땐(lane 없음) 타격 그림이 없다 — 벤 버터바는 그대로', () => {
    for (const w of ['sword', 'hammer', 'iron'] as const) {
      resetBladeFx();
      bladeReact(state(w), { kind: 'butterCollapse', y: 0 });
      expect(liveBits(), w).toHaveLength(0);
      bladeReact(state(w), { kind: 'butterCollapse', lane: 0, y: 120, combo: 10 });
      expect(liveBits().length, w).toBeGreaterThan(0);
    }
  });

  it('resetBladeFx는 조각도 연타 줄도 다 비운다', () => {
    const s = state('sword');
    s.tick = 0;
    bladeReact(s, ev('hit'));
    s.tick = 10;
    bladeReact(s, ev('hit'));
    bladeReact(s, { kind: 'special', lane: 0 });
    expect(liveBits().length).toBeGreaterThan(0);
    resetBladeFx();
    expect(liveBits()).toHaveLength(0);
    s.tick = 20; // 줄이 이어졌다면 3타(가로)였다
    bladeReact(s, ev('hit'));
    expect(strokes()[0].rot).toBeGreaterThan(0.15);
  });

  it('상점 필살 칸 그림은 필살마다 다르고, 마스크 도트는 없고, 빌린 판 풀은 비워 둔다', () => {
    const purple = '#7A44B8';
    setFxMask([purple]);
    const sigs = WAZA_IDS.map((waza) => {
      const sig = traced((c) => drawWazaShot(c, waza, 40, 74)); // 먹 연출은 같은 색 · 같은 메서드라 좌표까지 본다
      expect(sig, waza).not.toBe('');
      expect(sig, waza).not.toContain(purple);
      expect(liveBits(), waza).toHaveLength(0);
      return sig;
    });
    expect(new Set(sigs).size).toBe(WAZA_IDS.length);
  });
});
