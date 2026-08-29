// 커스텀 탭 조각. 장착만 — 판정·대미지는 바꾸지 않는다.

import { DEFAULT_LOADOUT, isOwned } from '../meta/loadout';
import type { BladeId, BodyId, LettersId, Loadout, WazaId } from '../meta/types';

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

export function customHtml(): string {
  const blocks = SECTIONS.map((sec) =>
    `<p class="ov-records-h">${escapeHtml(sec.title)}</p>
     <div data-el="${sec.slot}" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px"></div>`,
  ).join('');
  return `<div class="ov-custom ui-card" style="max-height:520px;overflow-y:auto">
    <h2>커스텀</h2>
    <p class="ov-manual-lead">색과 글자만 바뀝니다. 세기는 그대로.</p>
    ${blocks}
  </div>`;
}

export function paintCustom(
  root: HTMLElement,
  loadout: Loadout,
  owned: ReadonlySet<string>,
  onEquip: (slot: string, id: string) => void,
): void {
  root.innerHTML = customHtml();
  for (const sec of SECTIONS) {
    const box = root.querySelector(`[data-el="${sec.slot}"]`);
    if (!box) continue;
    const current = equippedId(loadout, sec.slot);
    for (const item of sec.items) {
      const open = isOwned(owned, sec.slot, item.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'flyer-btn';
      btn.style.minHeight = '40px';
      btn.style.padding = '6px 4px';
      btn.style.fontSize = '11px';
      btn.setAttribute('data-equip-slot', sec.slot);
      btn.setAttribute('data-equip-id', item.id);
      if (!open) {
        btn.disabled = true;
        btn.classList.add('locked', 'silhouette');
        btn.textContent = '';
        const mark = document.createElement('span');
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = '●';
        btn.append(mark, document.createTextNode(' 잠김 · 상점')); // 해금 경로 안내 (08-30, D-3)
      } else {
        btn.textContent = item.name;
        if (current === item.id) btn.classList.add('selected');
      }
      box.appendChild(btn);
    }
  }
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}
