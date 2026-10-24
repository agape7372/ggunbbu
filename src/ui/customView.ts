// 꾸미기 탭 조각. 장착만 — 필살 종류 말고는 판정·대미지를 바꾸지 않는다.

import { DEFAULT_LOADOUT, isOwned } from '../meta/loadout';
import type { BladeId, BodyId, LettersId, Loadout, WazaId } from '../meta/types';
import { WAZA_COPY } from '../content/world';
import { ICON } from './icons';
import { escapeHtml } from './html';

type Slot = 'body' | 'blade' | 'waza' | 'letters';

interface CatalogItem {
  id: string;
  name: string;
}

interface CatalogSection {
  slot: Slot;
  title: string;
  items: readonly CatalogItem[];
}

const BODY_ITEMS: readonly { id: BodyId; name: string }[] = [
  { id: 'ink', name: '먹물' },
  { id: 'amber', name: '호박' },
  { id: 'slate', name: '석판' },
];

const BLADE_ITEMS: readonly { id: BladeId; name: string }[] = [
  { id: 'wire', name: '철사' },
  { id: 'rebar', name: '철근' },
  { id: 'crescent', name: '초승달' },
];

const WAZA_ITEMS: readonly { id: WazaId; name: string }[] = [
  { id: 'tenchi', name: '천지개벽' },
  { id: 'ageba', name: '올려베기' },
  { id: 'tetsu', name: '철벽' },
];

const LETTER_ITEMS: readonly { id: LettersId; name: string }[] = [
  { id: 'flyer', name: '전단지' },
  { id: 'stamp', name: '도장' },
  { id: 'orbit', name: '궤도' },
];

const SECTIONS: readonly CatalogSection[] = [
  { slot: 'body', title: '졸라맨', items: BODY_ITEMS },
  { slot: 'blade', title: '무기', items: BLADE_ITEMS },
  { slot: 'waza', title: '필살', items: WAZA_ITEMS },
  { slot: 'letters', title: '효과글자', items: LETTER_ITEMS },
];

export function paintCustom(
  root: HTMLElement,
  loadout: Loadout,
  owned: ReadonlySet<string>,
  onEquip: (slot: string, id: string) => void,
): void {
  const blocks = SECTIONS.map((sec) => {
    const current = equippedId(loadout, sec.slot);
    const picks = sec.items.map((item) => {
      const open = isOwned(owned, sec.slot, item.id);
      const on = open && current === item.id;
      // 잠김은 여는 곳을 말한다 — 상점 (08-30, D-3)
      return open
        ? `<button type="button" class="pick${on ? ' on' : ''}" data-equip-slot="${sec.slot}" data-equip-id="${item.id}" aria-pressed="${on}">${escapeHtml(item.name)}${on ? '<small>장착</small>' : ''}</button>`
        : `<button type="button" class="pick" disabled>${ICON.lock}${escapeHtml(item.name)}<small>상점</small></button>`;
    }).join('');
    const note = sec.slot === 'waza'
      ? `<p class="pick-note">${escapeHtml(WAZA_COPY[equippedId(loadout, 'waza') as WazaId].desc)}</p>`
      : '';
    return `<p class="sec-h">${escapeHtml(sec.title)}</p><div class="pick-grid">${picks}</div>${note}`;
  }).join('');
  root.innerHTML = `
    <header class="sheet-head">
      <h2>꾸미기</h2>
      <p class="sheet-lead">필살 말고는 색과 모양만 바뀝니다. 세기는 그대로.</p>
    </header>
    ${blocks}`;
  root.onclick = (e) => {
    const t = (e.target as HTMLElement).closest('[data-equip-slot]') as HTMLButtonElement | null;
    if (!t || t.disabled) return;
    const slot = t.getAttribute('data-equip-slot');
    const id = t.getAttribute('data-equip-id');
    if (!slot || !id || !isOwned(owned, slot, id)) return;
    e.preventDefault();
    onEquip(slot, id);
  };
}

function equippedId(loadout: Loadout, slot: Slot): string {
  if (slot === 'body') return loadout.body || DEFAULT_LOADOUT.body;
  if (slot === 'blade') return loadout.blade || DEFAULT_LOADOUT.blade;
  if (slot === 'waza') return loadout.waza || DEFAULT_LOADOUT.waza;
  return loadout.letters || DEFAULT_LOADOUT.letters;
}

