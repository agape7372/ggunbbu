// ★08-30: 세이브 전멸 지뢰 제거 가드 — v 불일치·손상에도 기록을 살린다 (levain 사다리 이식)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadSave, saveSave, DEFAULT_SAVE } from '../src/storage';
import { SAVE_KEY } from '../src/config';

// node 환경 — 최소 localStorage 폴리필
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
});
afterEach(() => {
  delete (globalThis as Record<string, unknown>).localStorage;
});

describe('저장 마이그레이션 사다리', () => {
  it('왕복: save → load 동일', () => {
    const d = { ...structuredClone(DEFAULT_SAVE), bestArcade: 123456, dust: 7 };
    saveSave(d);
    expect(loadSave().bestArcade).toBe(123456);
    expect(loadSave().dust).toBe(7);
  });

  it('★미래 버전(v=2) 세이브도 초기화하지 않는다 — 살릴 수 있는 필드는 살린다', () => {
    store.set(SAVE_KEY, JSON.stringify({ v: 2, bestArcade: 555, dust: 3, unknownFutureField: 1 }));
    const d = loadSave();
    expect(d.bestArcade).toBe(555); // 구코드: v!==1 → 0으로 전멸
    expect(d.dust).toBe(3);
  });

  it('v 부재 세이브도 필드 복구', () => {
    store.set(SAVE_KEY, JSON.stringify({ bestArcade: 42 }));
    expect(loadSave().bestArcade).toBe(42);
  });

  it('오염 필드는 버리지 않고 clamp — NaN·음수·초과', () => {
    store.set(SAVE_KEY, JSON.stringify({
      v: 1, bestArcade: -50, maxCombo: 5000, dust: Number.NaN, unlockedChapters: 99,
    }));
    const d = loadSave();
    expect(d.bestArcade).toBe(0);
    expect(d.maxCombo).toBe(999);
    expect(d.dust).toBe(0);
    expect(d.unlockedChapters).toBe(3);
  });

  it('JSON 파손은 기본값 (최후 사다리)', () => {
    store.set(SAVE_KEY, '{broken');
    expect(loadSave().bestArcade).toBe(0);
  });
});

describe('butterBest 항목별 구제 (08-30 검증 후속)', () => {
  it('항목 하나 손상돼도 나머지 회차 기록은 산다', () => {
    store.set(SAVE_KEY, JSON.stringify({ v: 1, butterBest: { 1: 5000, 2: null, 3: 7000 } }));
    const d = loadSave();
    expect(d.butterBest[1]).toBe(5000);
    expect(d.butterBest[3]).toBe(7000);
    expect(d.butterBest[2]).toBeUndefined();
  });

  it('거대·음수 값은 clamp, 회차 밖 키는 버림', () => {
    store.set(SAVE_KEY, JSON.stringify({ v: 1, butterBest: { 1: -5, 2: 1e300, 9: 100 } }));
    const d = loadSave();
    expect(d.butterBest[1]).toBe(0);
    expect(d.butterBest[2]).toBe(99_999_999);
    expect(d.butterBest[9 as never]).toBeUndefined();
  });
});
