// 장비 탭 조각. 장착만 — 무기와 필살만 판정(사거리·띄우기·필살 게이지·종류)을 바꾸고, 나머지는 겉모습이다.

import { SUPPLY, WEAPON } from '../config';
import { DEFAULT_LOADOUT, GREATSWORD_IDS, isOwned, WEAPON_IDS } from '../meta';
import type { BladeId, BodyId, LettersId, Loadout, WazaId, WeaponId } from '../meta/types';
import { ITEM_COPY, WAZA_COPY, WEAPON_COPY } from '../content/world';
import { ICON } from './icons';
import { escapeHtml } from './html';

type Slot = 'weapon' | 'waza' | 'body' | 'blade' | 'letters';

interface CatalogItem {
  id: string;
  name: string;
}

interface CatalogSection {
  slot: Slot;
  title: string;
  items: readonly CatalogItem[];
}

const WEAPON_ITEMS: readonly { id: WeaponId; name: string }[] = WEAPON_IDS.map((id) => ({ id, name: WEAPON_COPY[id].name }));

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
  { slot: 'weapon', title: '무기', items: WEAPON_ITEMS },
  { slot: 'waza', title: '필살', items: WAZA_ITEMS },
  { slot: 'body', title: '졸라맨', items: BODY_ITEMS },
  { slot: 'blade', title: '칼빛', items: BLADE_ITEMS },
  { slot: 'letters', title: '효과글자', items: LETTER_ITEMS },
];

/** 막대 셋 — 채움 = 값 / 무기 넷 중 최댓값. 수치는 config WEAPON에서 읽는다. */
const STATS: readonly { key: 'reach' | 'lift' | 'gauge'; label: string }[] = [
  { key: 'reach', label: '사거리' },
  { key: 'lift', label: '띄우기' },
  { key: 'gauge', label: '필살' },
];

const SUPPLY_ICON = { hat: ICON.hat, coffee: ICON.coffee, gloves: ICON.gloves, dust: ICON.sack } as const;

function weaponNoteHtml(id: WeaponId): string {
  const bars = STATS.map(({ key, label }) => {
    const max = Math.max(...WEAPON_IDS.map((w) => WEAPON[w][key]));
    const pct = Math.round((100 * WEAPON[id][key]) / max);
    return `<div class="stat-row"><span class="stat-label">${label}</span><div class="stat-bar" role="img" aria-label="${label} ${pct}%"><span class="fill" style="width:${pct}%"></span></div></div>`;
  }).join('');
  return `<p class="pick-note">${escapeHtml(WEAPON_COPY[id].desc)}</p><div class="stats">${bars}</div>`;
}

/** 칸 아래 설명 — 손맛이 바뀌는 무기·필살만 */
function noteHtml(slot: Slot, loadout: Loadout): string {
  if (slot === 'weapon') return weaponNoteHtml(equippedId(loadout, 'weapon') as WeaponId);
  if (slot === 'waza') return `<p class="pick-note">${escapeHtml(WAZA_COPY[equippedId(loadout, 'waza') as WazaId].desc)}</p>`;
  return '';
}

function supplyHtml(): string {
  const rows = SUPPLY.ROTATION.map((id) =>
    `<li class="supply-row">${SUPPLY_ICON[id]}<span class="supply-name">${escapeHtml(ITEM_COPY[id].name)}<small>${escapeHtml(ITEM_COPY[id].desc)}</small></span></li>`,
  ).join('');
  return `<p class="sec-h">보급 상자</p>
    <p class="pick-note">건물 ${SUPPLY.FIRST}채째, 그 뒤로 ${SUPPLY.EVERY}채마다 하나.</p>
    <ul class="supply">${rows}</ul>`;
}

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
      const icon = sec.slot === 'weapon' ? weaponIcon(item.id as WeaponId) : '';
      // 잠김은 여는 곳을 말한다 — 상점 (08-30, D-3)
      return open
        ? `<button type="button" class="pick${on ? ' on' : ''}" data-equip-slot="${sec.slot}" data-equip-id="${item.id}" aria-pressed="${on}">${icon}${escapeHtml(item.name)}${on ? '<small>장착</small>' : ''}</button>`
        : `<button type="button" class="pick" disabled>${ICON.lock}${escapeHtml(item.name)}<small>상점</small></button>`;
    }).join('');
    return `<p class="sec-h">${escapeHtml(sec.title)}</p><div class="pick-grid${sec.slot === 'weapon' ? ' w4' : ''}">${picks}</div>${noteHtml(sec.slot, loadout)}`;
  }).join('');
  root.innerHTML = `
    <header class="sheet-head">
      <h2>장비</h2>
      <p class="sheet-lead">무기와 필살은 손맛이 바뀐다. 나머지는 겉모습.</p>
    </header>
    ${blocks}
    ${supplyHtml()}`;
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
  if (slot === 'weapon') return loadout.weapon || DEFAULT_LOADOUT.weapon;
  if (slot === 'body') return loadout.body || DEFAULT_LOADOUT.body;
  if (slot === 'blade') return loadout.blade || DEFAULT_LOADOUT.blade;
  if (slot === 'waza') return loadout.waza || DEFAULT_LOADOUT.waza;
  return loadout.letters || DEFAULT_LOADOUT.letters;
}

/** 대검 여덟은 아이콘 하나를 같이 쓴다 — 가르는 건 이름, 모양은 상점 그림이 보인다 */
function weaponIcon(id: WeaponId): string {
  return (GREATSWORD_IDS as readonly string[]).includes(id) ? ICON.greatsword : ICON[id as 'sword' | 'hammer' | 'crowbar' | 'grinder'];
}
