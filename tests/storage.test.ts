// ★08-30: 세이브 전멸 지뢰 제거 가드 — v 불일치·손상에도 기록을 살린다 (levain 사다리 이식)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadSave, saveSave, resetSave, DEFAULT_SAVE } from '../src/storage';
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

describe('howtoSeen 무버전 키', () => {
  it('없거나 이상한 값이면 false, true는 보존', () => {
    store.set(SAVE_KEY, JSON.stringify({ v: 1, bestArcade: 9 }));
    expect(loadSave().howtoSeen).toBe(false);
    store.set(SAVE_KEY, JSON.stringify({ v: 1, howtoSeen: 'yes' }));
    expect(loadSave().howtoSeen).toBe(false);
    store.set(SAVE_KEY, JSON.stringify({ v: 1, howtoSeen: true }));
    expect(loadSave().howtoSeen).toBe(true);
  });
});

describe('백업 사다리 (T7)', () => {
  const BAK = `${SAVE_KEY}.bak`;
  const BAD = `${SAVE_KEY}.bad`;

  it('저장에 성공하면 .bak도 같은 내용으로 갱신된다', () => {
    saveSave({ ...structuredClone(DEFAULT_SAVE), bestArcade: 777 });
    expect(store.get(BAK)).toBe(store.get(SAVE_KEY));
    expect(JSON.parse(store.get(BAK)!).bestArcade).toBe(777);
  });

  it('본 키가 깨지면 .bak으로 살리고, 깨진 원문은 .bad에 남긴다', () => {
    saveSave({ ...structuredClone(DEFAULT_SAVE), bestArcade: 4242, dust: 9 });
    store.set(SAVE_KEY, '{"bestArcade": 99,'); // 쓰다 끊긴 JSON
    const d = loadSave();
    expect(d.bestArcade).toBe(4242);
    expect(d.dust).toBe(9);
    expect(store.get(BAD)).toBe('{"bestArcade": 99,');
  });

  it('본 키가 사라져도 .bak이 있으면 살린다', () => {
    saveSave({ ...structuredClone(DEFAULT_SAVE), maxCombo: 321 });
    store.delete(SAVE_KEY);
    expect(loadSave().maxCombo).toBe(321);
  });

  it('둘 다 깨지면 기본값', () => {
    store.set(SAVE_KEY, '{x');
    store.set(BAK, 'nope');
    expect(loadSave().bestArcade).toBe(0);
  });

  it('기록 지우기는 .bak·.bad까지 지운다 — 지운 기록이 되살아나면 안 된다', () => {
    saveSave({ ...structuredClone(DEFAULT_SAVE), bestArcade: 5 });
    store.set(BAD, 'x');
    resetSave();
    expect(store.has(SAVE_KEY) || store.has(BAK) || store.has(BAD)).toBe(false);
    expect(loadSave().bestArcade).toBe(0);
  });
});

describe('소리·번쩍임 설정 정규화', () => {
  it('옛 저장(키 없음)은 음악·효과음 켬, 번쩍임 기본(2)', () => {
    store.set(SAVE_KEY, JSON.stringify({ v: 1, settings: { sound: false } }));
    const s = loadSave().settings;
    expect(s.sound).toBe(false);
    expect(s.bgm).toBe(true);
    expect(s.sfx).toBe(true);
    expect(s.flashLevel).toBe(2);
  });

  it('값이 있으면 보존하고, 이상한 값은 기본값', () => {
    store.set(SAVE_KEY, JSON.stringify({ v: 1, settings: { bgm: false, sfx: false, flashLevel: 0 } }));
    const s = loadSave().settings;
    expect([s.bgm, s.sfx, s.flashLevel]).toEqual([false, false, 0]);
    store.set(SAVE_KEY, JSON.stringify({ v: 1, settings: { bgm: 'x', sfx: 3, flashLevel: 9 } }));
    const t = loadSave().settings;
    expect([t.bgm, t.sfx, t.flashLevel]).toEqual([true, true, 2]);
  });
});

describe('소유 목록 대조 (BL-13)', () => {
  it('owned는 카탈로그 교집합 — 모르는 id·중복은 버린다', () => {
    store.set(SAVE_KEY, JSON.stringify({ v: 1, owned: ['hammer', 'hammer', 'ghost', 42, 'rebar'] }));
    expect(loadSave().owned.sort()).toEqual(['hammer', 'rebar']);
  });

  it('미소유 장착 칸은 기본값으로 되돌린다', () => {
    store.set(SAVE_KEY, JSON.stringify({
      v: 1, owned: ['hammer'],
      loadout: { waza: 'tetsu', weapon: 'grinder', body: 'amber', blade: 'wire', letters: 'flyer' },
    }));
    const l = loadSave().loadout;
    expect(l.waza).toBe('tenchi');
    expect(l.weapon).toBe('sword');
    expect(l.body).toBe('ink');
  });

  it('산 물건의 장착은 유지한다', () => {
    store.set(SAVE_KEY, JSON.stringify({
      v: 1, owned: ['grinder', 'amber'],
      loadout: { weapon: 'grinder', body: 'amber' },
    }));
    const l = loadSave().loadout;
    expect(l.weapon).toBe('grinder');
    expect(l.body).toBe('amber');
  });
});
