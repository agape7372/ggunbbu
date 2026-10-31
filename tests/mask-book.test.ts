// 가면 여러 장 + 이름 — 옛 저장 이전 · 이름 정리 · 8장 상한 · 지우면 장착 해제 · 저장 왕복
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LOADOUT, DEFAULT_OWNED_IDS } from '../src/meta/loadout';
import {
  MASK_MAX, MASK_NAME_MAX, MASK_OLD_NAME, SAMPLE_MASK, cleanMaskName, createMask, deleteMask, emptyMask, loadMaskBook,
  ownedMasks, updateMask, wearMask, wornMaskId, type MaskSave,
} from '../src/meta/mask';
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

const SAVE = (over: Partial<MaskSave> = {}): MaskSave => ({
  masks: [], maskId: '', maskArt: emptyMask(), owned: [...DEFAULT_OWNED_IDS, 'mask'], loadout: { ...DEFAULT_LOADOUT }, ...over,
});

describe('옛 저장 이전', () => {
  it('공방(mask)을 가졌으면 maskArt가 「내 마스크」 m1 한 장이 되고 장착 mask → m1', () => {
    store.set(SAVE_KEY, JSON.stringify({ v: 1, owned: ['mask'], loadout: { mask: 'mask' }, maskArt: SAMPLE_MASK }));
    const d = loadSave();
    expect(d.masks).toEqual([{ id: 'm1', name: MASK_OLD_NAME, art: SAMPLE_MASK }]);
    expect(d.maskId).toBe('m1');
    expect(wornMaskId(d)).toBe('m1');
    expect(d.maskArt).toBe(SAMPLE_MASK);
  });

  it('그림 없이 산 옛 저장도 빈 m1 한 장 — 안 산 저장은 목록 없음', () => {
    store.set(SAVE_KEY, JSON.stringify({ v: 1, owned: ['mask'] }));
    expect(loadSave().masks).toEqual([{ id: 'm1', name: MASK_OLD_NAME, art: emptyMask() }]);
    store.set(SAVE_KEY, JSON.stringify({ v: 1, owned: ['hammer'], maskArt: SAMPLE_MASK }));
    const d = loadSave();
    expect(d.masks).toEqual([]);
    expect(d.maskArt).toBe(SAMPLE_MASK); // 안 산 사람의 그림은 남긴다
  });

  it('새 저장 왕복 — 이름 · 그림 · 고른 가면 · 쓰는 중', () => {
    const s = SAVE();
    createMask(s, '  뿌뿌 가면  ', SAMPLE_MASK);
    createMask(s, '', emptyMask());
    saveSave({ ...structuredClone(DEFAULT_SAVE), owned: s.owned, loadout: s.loadout, masks: s.masks, maskId: s.maskId, maskArt: s.maskArt });
    const d = loadSave();
    expect(d.masks.map((m) => m.name)).toEqual(['뿌뿌 가면', '마스크 2']);
    expect(d.maskId).toBe('m1'); // 그림 있는 첫 가면이 바로 씌워졌고, 둘째(빈 판)는 쓰는 걸 안 바꾼다
    expect(d.maskArt).toBe(SAMPLE_MASK);
    expect(d.loadout.mask).toBe('mask');
  });

  it('깨진 목록은 살릴 것만: 모양 틀린 장 · 겹친 id 버림, 깨진 그림은 빈 판, 모르는 고른 id는 첫 장', () => {
    const b = loadMaskBook([
      { id: 'm1', name: 'a', art: SAMPLE_MASK }, { id: 'm1', name: 'dup', art: SAMPLE_MASK },
      { id: 'x', name: 'bad', art: SAMPLE_MASK }, 7, null, { id: 'm3', name: 5, art: 'zz' },
    ], 'm9', emptyMask(), true);
    expect(b.masks).toEqual([{ id: 'm1', name: 'a', art: SAMPLE_MASK }, { id: 'm3', name: '마스크 3', art: emptyMask() }]);
    expect(b.maskId).toBe('m1');
  });
});

describe('이름 정리', () => {
  it('앞뒤 공백을 걷는다', () => {
    expect(cleanMaskName('  내 얼굴  ', 1)).toBe('내 얼굴');
  });

  it('10글자로 자른다 — 이모지도 한 글자로 센다', () => {
    expect(cleanMaskName('가나다라마바사아자차카타', 1)).toBe('가나다라마바사아자차');
    expect(Array.from(cleanMaskName('😀'.repeat(15), 1))).toHaveLength(MASK_NAME_MAX);
    expect(cleanMaskName('가나다라마바사아자 차', 1)).toBe('가나다라마바사아자'); // 자른 끝 공백도 걷는다
  });

  it('빈 이름 · 공백뿐 · 조작 문자뿐 · 문자열이 아니면 「마스크 N」', () => {
    expect(cleanMaskName('', 3)).toBe('마스크 3');
    expect(cleanMaskName('   ', 2)).toBe('마스크 2');
    expect(cleanMaskName('\n\t', 5)).toBe('마스크 5');
    expect(cleanMaskName(undefined, 4)).toBe('마스크 4');
    expect(cleanMaskName(12, 1)).toBe('마스크 1');
  });

  it('이름을 고쳐도 id · 순서는 그대로, 비우면 id 번호로', () => {
    const s = SAVE();
    createMask(s, 'A', SAMPLE_MASK);
    createMask(s, 'B', SAMPLE_MASK);
    expect(updateMask(s, 'm2', ' 새 이름 ', SAMPLE_MASK)).toBe(true);
    expect(s.masks.map((m) => `${m.id}:${m.name}`)).toEqual(['m1:A', 'm2:새 이름']);
    updateMask(s, 'm1', '', SAMPLE_MASK);
    expect(s.masks[0].name).toBe('마스크 1');
    expect(updateMask(s, 'm9', 'x', SAMPLE_MASK)).toBe(false);
  });
});

describe('8장 상한 · 공방', () => {
  it('8장까지만 만든다', () => {
    const s = SAVE();
    for (let i = 0; i < MASK_MAX; i++) expect(createMask(s, '', emptyMask()), String(i)).not.toBeNull();
    expect(createMask(s, '', emptyMask())).toBeNull();
    expect(s.masks).toHaveLength(MASK_MAX);
    expect(s.masks.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8']);
  });

  it('불러올 때도 8장에서 자른다', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: `m${i + 1}`, name: `n${i}`, art: emptyMask() }));
    expect(loadMaskBook(many, 'm1', emptyMask(), true).masks).toHaveLength(MASK_MAX);
  });

  it('공방을 안 열었으면 못 만든다', () => {
    const s = SAVE({ owned: [...DEFAULT_OWNED_IDS] });
    expect(createMask(s, 'x', SAMPLE_MASK)).toBeNull();
    expect(wearMask(s, 'none')).toBe(true);
  });

  it('빈 판 새 가면은 쓰는 가면을 안 바꾸고, 그림 있는 새 가면은 바로 쓴다', () => {
    const s = SAVE();
    createMask(s, 'A', SAMPLE_MASK);
    createMask(s, 'B', emptyMask());
    expect(wornMaskId(s)).toBe('m1');
    createMask(s, 'C', SAMPLE_MASK);
    expect(wornMaskId(s)).toBe('m3');
  });

  it('지운 뒤 만들면 빈 번호를 다시 안 쓴다(가장 큰 번호 + 1)', () => {
    const s = SAVE();
    createMask(s, '', emptyMask());
    createMask(s, '', emptyMask());
    deleteMask(s, 'm1');
    expect(createMask(s, '', emptyMask())!.id).toBe('m3');
  });
});

describe('지우기 · 쓰기', () => {
  it('쓰던 가면을 지우면 장착이 none, 고른 가면은 남은 첫 장', () => {
    const s = SAVE();
    createMask(s, 'A', SAMPLE_MASK);
    createMask(s, 'B', SAMPLE_MASK);
    expect(wornMaskId(s)).toBe('m2');
    expect(deleteMask(s, 'm2')).toBe(true);
    expect(s.loadout.mask).toBe('none');
    expect(wornMaskId(s)).toBe('none');
    expect(s.maskId).toBe('m1');
    expect(s.masks.map((m) => m.id)).toEqual(['m1']);
  });

  it('안 쓰던 가면을 지우면 쓰는 건 그대로', () => {
    const s = SAVE();
    createMask(s, 'A', SAMPLE_MASK);
    createMask(s, 'B', SAMPLE_MASK);
    deleteMask(s, 'm1');
    expect(wornMaskId(s)).toBe('m2');
    expect(deleteMask(s, 'm1')).toBe(false);
  });

  it('다 지우면 그림도 비고 다시 불러와도 되살아나지 않는다', () => {
    const s = SAVE();
    createMask(s, 'A', SAMPLE_MASK);
    deleteMask(s, 'm1');
    expect(s.maskArt).toBe(emptyMask());
    saveSave({ ...structuredClone(DEFAULT_SAVE), owned: s.owned, loadout: s.loadout, masks: s.masks, maskId: s.maskId, maskArt: s.maskArt });
    const d = loadSave();
    expect(d.masks).toEqual([]);
    expect(d.loadout.mask).toBe('none');
  });

  it('쓰기는 가면 id · none만 — 없는 id는 못 쓴다, 파생 maskArt가 따라간다', () => {
    const s = SAVE();
    createMask(s, 'A', SAMPLE_MASK);
    createMask(s, 'B', emptyMask());
    expect(wearMask(s, 'm9')).toBe(false);
    expect(wearMask(s, 'm1')).toBe(true);
    expect(s.maskArt).toBe(SAMPLE_MASK);
    expect(wearMask(s, 'none')).toBe(true);
    expect(wornMaskId(s)).toBe('none');
    expect(s.maskId).toBe('m1'); // 벗어도 고른 가면은 기억
  });
});

describe('도감용 ownedMasks', () => {
  it('만든 순서대로 { id, name, art } — 복사본', () => {
    const s = SAVE();
    createMask(s, 'A', SAMPLE_MASK);
    createMask(s, 'B', emptyMask());
    const list = ownedMasks(s);
    expect(list).toEqual([{ id: 'm1', name: 'A', art: SAMPLE_MASK }, { id: 'm2', name: 'B', art: emptyMask() }]);
    list[0].name = 'changed';
    expect(s.masks[0].name).toBe('A');
  });
});
