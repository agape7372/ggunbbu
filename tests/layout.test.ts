// 버튼 배치: 가두기 · 겹침 · 좌우 뒤집기 · 저장값 검증 · 기본 자리 = style.css
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_LAYOUT, KEY_ACTIONS, KEY_SIZE, ZONE, clampPos, findOverlap, isDefaultLayout, keysOverlap, mirrorX,
  resolveLayout, sanitizeLayout, toStored,
} from '../src/input/layout';
import { loadSave } from '../src/storage';
import { SAVE_KEY } from '../src/config';
// @ts-ignore node 타입 패키지가 없다(다른 .mjs 시험은 그냥 쓴다)
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

/** style.css 에서 `#btn-x { left: Npx; top: Npx; width: ...; height: ... }` 읽기 */
function cssBox(id: string, mirror = false): { left: number; top: number; width: number; height: number } {
  const re = new RegExp(`${mirror ? `#touch-layer\\.mirror ` : ''}#${id}\\s*\\{([^}]*)\\}`);
  const body = css.match(re)?.[1] ?? '';
  const n = (k: string): number => Number(body.match(new RegExp(`${k}:\\s*(-?\\d+)(?:px)?[;\\s]`))?.[1] ?? NaN);
  return { left: n('left'), top: n('top'), width: n('width'), height: n('height') };
}

describe('기본 자리 = style.css', () => {
  for (const a of KEY_ACTIONS) {
    it(`${a}: 오른손 · 왼손(.mirror) · 크기가 CSS 와 같다`, () => {
      const c = cssBox(`btn-${a}`);
      expect(c.left).toBe(DEFAULT_LAYOUT[a].x);
      expect(c.top).toBe(DEFAULT_LAYOUT[a].y - ZONE.y);
      expect([c.width, c.height]).toEqual([KEY_SIZE[a].w, KEY_SIZE[a].h]);
      expect(cssBox(`btn-${a}`, true).left).toBe(resolveLayout(null, true)[a].x);
    });
  }

  it('기본 배치는 구역 안이고 서로 겹치지 않는다', () => {
    for (const a of KEY_ACTIONS) {
      expect(clampPos(a, DEFAULT_LAYOUT[a])).toEqual(DEFAULT_LAYOUT[a]);
      expect(findOverlap(a, DEFAULT_LAYOUT[a], DEFAULT_LAYOUT)).toBeNull();
    }
  });
});

describe('가두기', () => {
  it('구역 밖은 키 전체가 안에 들도록 끌어들인다', () => {
    expect(clampPos('attack', { x: -50, y: 0 })).toEqual({ x: 0, y: ZONE.y });
    expect(clampPos('attack', { x: 999, y: 999 })).toEqual({ x: ZONE.w - 120, y: ZONE.y + ZONE.h - 120 });
    expect(clampPos('guard', { x: 100.4, y: 700.6 })).toEqual({ x: 100, y: 701 });
  });
  it('NaN · Infinity 도 구역 안으로', () => {
    const p = clampPos('jump', { x: NaN, y: Infinity });
    expect(p.x).toBe(0);
    expect(p.y).toBe(ZONE.y);
  });
});

describe('겹침', () => {
  it('판정 영역이 닿기만 하면 겹침이 아니고 1px 파고들면 겹침', () => {
    // 점프(오른쪽 끝 96 + 판정 8) ↔ 가드(왼쪽 110 − 판정 3): 사이 틈 = 110−3 − (96+8) = 3
    expect(keysOverlap('jump', DEFAULT_LAYOUT.jump, 'guard', DEFAULT_LAYOUT.guard)).toBe(false);
    const g = { x: DEFAULT_LAYOUT.guard.x - 3, y: DEFAULT_LAYOUT.guard.y };
    expect(keysOverlap('jump', DEFAULT_LAYOUT.jump, 'guard', g)).toBe(false);
    expect(keysOverlap('jump', DEFAULT_LAYOUT.jump, 'guard', { ...g, x: g.x - 1 })).toBe(true);
  });
  it('findOverlap 은 겹치는 상대를 알려 준다', () => {
    expect(findOverlap('special', DEFAULT_LAYOUT.attack, DEFAULT_LAYOUT)).toBe('attack');
  });
});

describe('좌우 뒤집기 · 저장 변환', () => {
  it('왼손잡이 기본 배치 = 점프 ↔ 공격 통째 교환(CSS .mirror 와 같은 식)', () => {
    expect(mirrorX('jump', 12)).toBe(264);
    expect(mirrorX('attack', 228)).toBe(12);
    expect(mirrorX('guard', 110)).toBe(146);
    expect(mirrorX('special', 118)).toBe(154);
  });
  it('저장 → 그리기 → 저장이 왕복한다(오른손 · 왼손 모두)', () => {
    const stored = { attack: { x: 200, y: ZONE.y + 20 } };
    for (const left of [false, true]) {
      const shown = resolveLayout(stored, left);
      const back = toStored(shown, left);
      expect(back?.attack).toEqual(stored.attack);
      expect(back?.jump).toEqual(DEFAULT_LAYOUT.jump);
    }
    expect(resolveLayout(stored, true).attack.x).toBe(mirrorX('attack', 200));
  });
  it('전부 기본 자리면 null(저장하지 않음)', () => {
    expect(toStored(resolveLayout(null, false), false)).toBeNull();
    expect(toStored(resolveLayout(null, true), true)).toBeNull();
    expect(isDefaultLayout(null)).toBe(true);
    expect(isDefaultLayout({ jump: DEFAULT_LAYOUT.jump })).toBe(true);
    expect(isDefaultLayout({ jump: { x: 13, y: DEFAULT_LAYOUT.jump.y } })).toBe(false);
  });
  it('일부만 저장돼 있어도 나머지는 기본 자리', () => {
    const r = resolveLayout({ guard: { x: 0, y: ZONE.y } }, false);
    expect(r.guard).toEqual({ x: 0, y: ZONE.y });
    expect(r.attack).toEqual(DEFAULT_LAYOUT.attack);
  });
});

describe('저장값 검증', () => {
  it('깨진 모양은 기본 배치(undefined)', () => {
    for (const bad of [undefined, null, 5, 'x', [], {}, { jump: 3 }, { jump: { x: 'a', y: 1 } }, { jump: { x: NaN, y: 700 } }]) {
      expect(sanitizeLayout(bad)).toBeUndefined();
    }
  });
  it('구역 밖은 가두고, 합쳐서 겹치면 통째로 버린다', () => {
    expect(sanitizeLayout({ attack: { x: 9999, y: 9999 } })?.attack).toEqual({ x: ZONE.w - 120, y: ZONE.y + ZONE.h - 120 });
    expect(sanitizeLayout({ special: { ...DEFAULT_LAYOUT.attack } })).toBeUndefined();
  });
  it('알 수 없는 키는 무시', () => {
    const out = sanitizeLayout({ jump: { x: 4, y: ZONE.y + 40 }, ghost: { x: 1, y: 1 } });
    expect(Object.keys(out ?? {})).toEqual(['jump']);
  });
});

describe('불러오기', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    };
  });
  afterEach(() => { delete (globalThis as Record<string, unknown>).localStorage; });

  it('옛 저장본(buttonLayout 없음)은 그대로 열리고 배치는 없다', () => {
    store.set(SAVE_KEY, JSON.stringify({ v: 1, settings: { sound: false, leftHanded: true } }));
    const s = loadSave().settings;
    expect(s.leftHanded).toBe(true);
    expect('buttonLayout' in s).toBe(false);
  });
  it('저장된 배치는 살리고, 깨진 배치는 버린다', () => {
    const good = { jump: { x: 4, y: ZONE.y + 40 } };
    store.set(SAVE_KEY, JSON.stringify({ v: 1, settings: { buttonLayout: good } }));
    expect(loadSave().settings.buttonLayout).toEqual(good);
    store.set(SAVE_KEY, JSON.stringify({ v: 1, settings: { buttonLayout: { jump: 'x' } } }));
    expect(loadSave().settings.buttonLayout).toBeUndefined();
  });
});
