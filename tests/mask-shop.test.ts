// 상점 마스크 — 슬롯·소유·장착·값·저장. ★산 'mask'가 불러오기에서 지워지면 먼지 3000이 증발한다
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LOADOUT, DEFAULT_OWNED_IDS, enforceOwnedLoadout, equip, isOwned, sanitizeOwned, slotOf, validateLoadout,
} from '../src/meta/loadout';
import {
  LICENSE_EXAMS, MASK_DUST_COST, WEAPON_DUST_COST, dustCost, nextDustGoal,
} from '../src/meta/economy';
import { SAMPLE_MASK, emptyMask, wornMask } from '../src/meta/mask';
import { DEFAULT_SAVE, loadSave, saveSave } from '../src/storage';
import { SAVE_KEY } from '../src/config';

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

const WEAPONS = Object.keys(WEAPON_DUST_COST);

describe('마스크 칸', () => {
  it('기본은 없음 — 없음은 늘 가졌고 마스크는 사야 한다', () => {
    const none = new Set<string>();
    expect(DEFAULT_LOADOUT.mask).toBe('none');
    expect(DEFAULT_OWNED_IDS).toContain('none');
    expect(slotOf('mask')).toBe('mask');
    expect(slotOf('none')).toBe('mask');
    expect(isOwned(none, 'mask', 'none')).toBe(true);
    expect(isOwned(none, 'mask', 'mask')).toBe(false);
    expect(isOwned(new Set(['mask']), 'mask', 'mask')).toBe(true);
    expect(isOwned(new Set(['mask']), 'body', 'mask')).toBe(false); // 슬롯이 다르면 아니다
  });

  it('산 뒤에만 쓰고, 없음으로 벗는다', () => {
    const owned = new Set(['mask']);
    expect(equip(DEFAULT_LOADOUT, 'mask', 'mask', new Set())).toBe(DEFAULT_LOADOUT);
    const on = equip(DEFAULT_LOADOUT, 'mask', 'mask', owned);
    expect(on.mask).toBe('mask');
    expect(equip(on, 'mask', 'none', owned).mask).toBe('none');
  });

  it('마스크 칸 없는 옛 장착·모르는 값은 없음으로 읽는다', () => {
    const { mask: _mask, ...old } = DEFAULT_LOADOUT;
    expect(validateLoadout(old).mask).toBe('none');
    expect(validateLoadout({ ...old, mask: 'helmet' }).mask).toBe('none');
    expect(validateLoadout({ ...old, mask: 'mask' }).mask).toBe('mask');
  });

  it('안 산 마스크를 쓰고 있으면 벗긴다, 샀으면 그대로', () => {
    const l = { ...DEFAULT_LOADOUT, mask: 'mask' as const };
    expect(enforceOwnedLoadout(l, []).mask).toBe('none');
    expect(enforceOwnedLoadout(l, ['mask']).mask).toBe('mask');
  });

  it('★산 마스크는 소유 목록 거르기에서 살아남는다', () => {
    expect(sanitizeOwned(['mask', 'ghost', 'mask'])).toEqual(['mask']);
  });
});

describe('마스크 값', () => {
  it('비싸게 — 대검 최고보다 비싸고 1급 응시료보다 싸다', () => {
    expect(MASK_DUST_COST).toBe(3000);
    expect(MASK_DUST_COST).toBeGreaterThan(Math.max(...Object.values(WEAPON_DUST_COST)));
    expect(MASK_DUST_COST).toBeLessThan(LICENSE_EXAMS[LICENSE_EXAMS.length - 1].fee);
  });

  it('먼지 값 찾기는 무기만 돌려준다 — 마스크는 개당 값이 따로 있다', () => {
    expect(dustCost('mask')).toBeUndefined();
    expect(dustCost('hammer')).toBe(WEAPON_DUST_COST.hammer);
    expect(dustCost('none')).toBeUndefined();
    expect(dustCost('ghost')).toBeUndefined();
  });

  it('결과 카드 목표 — 안 산 무기만, 다 사면 없다', () => {
    expect(nextDustGoal(WEAPONS.slice(1), 0)!.id).toBe(WEAPONS[0]);
    expect(nextDustGoal(WEAPONS, 0)).toBeNull();
  });
});

describe('입는 그림', () => {
  it('아직 안 그렸으면 견본, 그렸으면 그 그림', () => {
    expect(wornMask(emptyMask())).toBe(SAMPLE_MASK);
    expect(wornMask('zz')).toBe(SAMPLE_MASK);
    const mine = `4${'0'.repeat(255)}`;
    expect(wornMask(mine)).toBe(mine);
  });
});

describe('마스크 저장 (무버전 추가 키 maskArt)', () => {
  it('산 뒤 왕복 — 소유·장착·그림이 그대로 돌아온다', () => {
    saveSave({
      ...structuredClone(DEFAULT_SAVE),
      owned: [...DEFAULT_OWNED_IDS, 'mask'],
      loadout: { ...DEFAULT_LOADOUT, mask: 'mask' },
      maskArt: SAMPLE_MASK,
      dust: 12,
    });
    const d = loadSave();
    expect(d.owned).toContain('mask');
    expect(d.loadout.mask).toBe('mask');
    expect(d.maskArt).toBe(SAMPLE_MASK);
    expect(d.dust).toBe(12);
  });

  it('깨진 그림은 빈 판 — 소유·장착은 건드리지 않는다', () => {
    store.set(SAVE_KEY, JSON.stringify({ v: 1, owned: ['mask'], loadout: { mask: 'mask' }, maskArt: 'x'.repeat(256) }));
    const d = loadSave();
    expect(d.maskArt).toBe(emptyMask());
    expect(d.owned).toContain('mask');
    expect(d.loadout.mask).toBe('mask');
    store.set(SAVE_KEY, JSON.stringify({ v: 1, maskArt: 42 }));
    expect(loadSave().maskArt).toBe(emptyMask());
  });

  it('옛 저장(키 없음)은 빈 그림·마스크 없음', () => {
    store.set(SAVE_KEY, JSON.stringify({ v: 1, bestArcade: 9, loadout: { weapon: 'sword' } }));
    const d = loadSave();
    expect(d.maskArt).toBe(emptyMask());
    expect(d.loadout.mask).toBe('none');
    expect(d.owned).not.toContain('mask');
  });

  it('안 산 마스크 장착이 저장에 남아 있으면 벗긴다', () => {
    store.set(SAVE_KEY, JSON.stringify({ v: 1, owned: ['hammer'], loadout: { mask: 'mask' }, maskArt: SAMPLE_MASK }));
    const d = loadSave();
    expect(d.loadout.mask).toBe('none');
    expect(d.maskArt).toBe(SAMPLE_MASK); // 그림은 남긴다 — 다시 사면 그대로
  });
});
