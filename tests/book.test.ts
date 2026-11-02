// 도감 칸 목록 — 묶음 · 가짐 · 번호 · 모은 수 (순수 함수만; 그리기는 화면 검수)
import { describe, expect, it } from 'vitest';
import { WEAPON_IDS } from '../src/meta';
import { bookCount, bookGroups } from '../src/ui/bookView';

const flat = (owned: ReadonlySet<string>) => bookGroups(owned).flatMap((g) => g.entries);

describe('도감', () => {
  it('기본 계정: 기본 소유와 보급품만 가진다', () => {
    const have = flat(new Set()).filter((e) => e.has).map((e) => e.key).sort();
    expect(have).toEqual([
      'blade:wire', 'body:ink', 'item:coffee', 'item:dust', 'item:gloves', 'item:hat',
      'letters:flyer', 'waza:tenchi', 'weapon:sword',
    ]);
  });

  it('모은 수 = 가진 칸 / 전체 칸, 산 것이 늘린다', () => {
    const base = bookCount(bookGroups(new Set()));
    expect(base.have).toBe(9);
    expect(base.total).toBe(46);
    const more = bookCount(bookGroups(new Set(['iron', 'ageba', 'mask'])));
    expect(more.have).toBe(12);
    expect(more.total).toBe(46);
  });

  it('모든 무기 id가 한 번씩, 상점 순서대로', () => {
    const ids = flat(new Set()).filter((e) => e.slot === 'weapon').map((e) => e.id);
    expect(ids).toEqual([...WEAPON_IDS]);
  });

  it('번호는 1부터 묶음을 넘어 이어지고 키는 겹치지 않는다', () => {
    const all = flat(new Set());
    expect(all.map((e) => e.no)).toEqual(all.map((_, i) => i + 1));
    expect(new Set(all.map((e) => e.key)).size).toBe(all.length);
  });

  it('가면 목록이 오면 가면마다 칸 하나, 모두 가진 것', () => {
    const g = bookGroups(new Set(), [{ id: 'a', name: '가', art: 'x' }, { id: 'b', name: '나', art: 'y' }]);
    const masks = g.find((x) => x.id === 'mask')!.entries;
    expect(masks.map((e) => e.key)).toEqual(['mask:a', 'mask:b']);
    expect(masks.every((e) => e.has)).toBe(true);
  });
});
