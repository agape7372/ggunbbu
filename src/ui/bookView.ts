// 도감 — 「먹 한 획」. 접두사 bk-. 상점과 같은 겉 틀(overlay metaScreen) 안의 스크롤 칸.
// 묶음: 무기 · 대검 · 필살 · 마스크 · 꾸미기(졸라맨 · 칼빛 · 효과글자) · 보급품. 칸마다 번호(No.01~), 묶음 머리에 모은 수 · 다 모으면 「완」 도장.
// 가진 것 = 먹 그림 + 이름 + (무기) 등급 / 안 가진 것 = 옅은 먹 실루엣 + 이름 + 나오는 곳 한 줄. 고유 설정 · 쓰임 · 능력치는 가졌을 때만 열린다.
// 칸을 누르면 overlay가 가운데 팝업(bookPopup — 도감 한 쪽)을 열고, 안의 이전 · 다음으로 칸을 넘긴다.
// 그림은 새로 그리지 않는다 — 칼 = ink.swordSvg, 필살·마스크·꾸미기 = shopArt, 보급품 = icons.ICON.
// 글은 content/lore.ts(LORE)가 채우고, 빈 항목은 기존 설명(WEAPON_COPY.desc 등)으로 메운다.

import './book.css';
import { HAT, SUPPLY, WEAPON } from '../config';
import { FX_SLOT_COPY, ITEM_COPY, MASK_COPY, TIER_COPY, WAZA_COPY, WEAPON_COPY } from '../content/world';
import { LORE } from '../content/lore';
import type { ItemId } from '../core/types';
import {
  COSMETIC_ORBIT_COST, DEFAULT_OWNED_IDS, GREATSWORD_IDS, MASK_DUST_COST, ORBIT_COSTS, WAZA_IDS, WAZA_ORBIT_COST, WEAPON_DUST_COST,
} from '../meta';
import type { Loadout, WeaponId } from '../meta';
import { BLADE_IDS, BODY_IDS, LETTERS_IDS, isOwned } from '../meta/loadout';
import { SAMPLE_MASK, wornMask } from '../meta/mask';
import { FX_SLOTS, WEAPON_TIER, filledSlots, type Tier } from '../meta/tier';
import { escapeHtml } from './html';
import { ICON } from './icons';
import { fmt, swordSvg } from './ink';
import { lettersArt, maskedArt, playerArt, restoreLook, wazaArt } from './shopArt';

export type BookSlot = 'weapon' | 'waza' | 'mask' | 'body' | 'blade' | 'letters' | 'item';

export interface BookEntry {
  /** 칸 키 — 'weapon:iron' 꼴(가면은 가면마다 'mask:<id>') */
  key: string;
  /** 도감 번호 1부터, 묶음을 넘어 이어진다 */
  no: number;
  slot: BookSlot;
  id: string;
  name: string;
  has: boolean;
  /** 나오는 곳 한 줄 — 먼지 450 · 궤도조각 80 · 기본 · 보급 상자 */
  how: string;
  tier?: Tier;
  /** 가면 그림(도트판 문자열). 없으면 저장된 maskArt 하나 */
  art?: string;
  /** 사용자가 이름을 지은 가면 — 이름을 서브셋 글꼴이 아니라 시스템 글꼴(.uname, shop.css)로 그린다 */
  user?: boolean;
}

export interface BookGroup {
  id: string;
  title: string;
  /** 있으면 이 이름이 큰 머리, title은 작은 소머리(꾸미기 아래 졸라맨 · 칼빛 · 효과글자) */
  head?: string;
  entries: BookEntry[];
}

/** 가진 가면 하나(meta/mask.ts ownedMasks가 내는 꼴) */
export interface BookMask {
  id: string;
  name: string;
  art: string;
}

const GREAT = new Set<string>(GREATSWORD_IDS);
const TOOLS: readonly WeaponId[] = ['sword', 'hammer', 'crowbar', 'grinder'];
const ITEMS: readonly ItemId[] = ['hat', ...SUPPLY.ROTATION];

const LOOKS = [
  { slot: 'body', title: '졸라맨', ids: BODY_IDS, names: { ink: '먹물', amber: '호박', slate: '석판' } },
  { slot: 'blade', title: '칼빛', ids: BLADE_IDS, names: { wire: '철사', rebar: '철근', crescent: '초승달' } },
  { slot: 'letters', title: '효과글자', ids: LETTERS_IDS, names: { flyer: '전단지', stamp: '도장', orbit: '궤도' } },
] as const;

/** 꾸미기엔 기존 설명이 없다 — 쓰임 한 줄만 여기서 */
const LOOK_USE: Readonly<Record<'body' | 'blade' | 'letters', string>> = {
  body: '졸라맨 몸 색을 바꾼다.',
  blade: '칼빛 색을 바꾼다.',
  letters: '콤보 숫자 색을 바꾼다.',
};

const KIND: Readonly<Record<BookSlot, string>> = {
  weapon: '무기', waza: '필살', mask: '마스크', body: '꾸미기 · 졸라맨', blade: '꾸미기 · 칼빛', letters: '꾸미기 · 효과글자', item: '보급품',
};

function howOf(slot: BookSlot, id: string): string {
  if (slot === 'item') return id === 'hat' ? `콤보 ${HAT.COMBO_AT.join(' · ')}` : '보급 상자';
  if (DEFAULT_OWNED_IDS.includes(id)) return '기본';
  if (slot === 'weapon') return `먼지 ${fmt(WEAPON_DUST_COST[id] ?? 0)}`;
  if (slot === 'mask') return `먼지 ${fmt(MASK_DUST_COST)}`;
  if (slot === 'waza') return `궤도조각 ${ORBIT_COSTS[id] ?? WAZA_ORBIT_COST}`;
  return `궤도조각 ${COSMETIC_ORBIT_COST}`;
}

function entry(owned: ReadonlySet<string>, slot: BookSlot, id: string, name: string): BookEntry {
  const has = slot === 'item' || isOwned(owned, slot, id); // 보급품은 늘 아는 것으로 친다
  const e: BookEntry = { key: `${slot}:${id}`, no: 0, slot, id, name, has, how: howOf(slot, id) };
  if (slot === 'weapon') e.tier = WEAPON_TIER[id as WeaponId];
  return e;
}

/** 칸 목록 — 묶음 · 가짐 여부 · 번호. DOM 없음.
 *  masks = 가진 가면들(있으면 가면마다 칸 하나). 없으면 지금 구조(저장된 가면 그림 하나) */
export function bookGroups(owned: ReadonlySet<string>, masks?: readonly BookMask[]): BookGroup[] {
  const w = (ids: readonly WeaponId[]): BookEntry[] => ids.map((id) => entry(owned, 'weapon', id, WEAPON_COPY[id].name));
  const maskEntries: BookEntry[] = masks?.length
    ? masks.map((m) => ({ ...entry(owned, 'mask', m.id, m.name), has: true, art: m.art, user: true }))
    : [entry(owned, 'mask', 'mask', MASK_COPY.name)];
  const groups: BookGroup[] = [
    { id: 'tools', title: '무기', entries: w(TOOLS) },
    { id: 'greats', title: '대검', entries: w(GREATSWORD_IDS) },
    { id: 'waza', title: '필살', entries: WAZA_IDS.map((id) => entry(owned, 'waza', id, WAZA_COPY[id].name)) },
    { id: 'mask', title: '마스크', entries: maskEntries },
    ...LOOKS.map((g) => ({
      id: g.slot,
      title: g.title,
      head: '꾸미기',
      entries: g.ids.map((id) => entry(owned, g.slot, id, (g.names as Record<string, string>)[id])),
    })),
    { id: 'item', title: '보급품', entries: ITEMS.map((id) => entry(owned, 'item', id, ITEM_COPY[id].name)) },
  ];
  let n = 0;
  for (const g of groups) for (const e of g.entries) e.no = ++n;
  return groups;
}

/** 모은 것 / 전체 (묶음 하나 또는 전체) */
export function bookCount(groups: readonly BookGroup[]): { have: number; total: number } {
  const all = groups.flatMap((g) => g.entries);
  return { have: all.filter((e) => e.has).length, total: all.length };
}

const noText = (n: number): string => `No.${String(n).padStart(2, '0')}`;

/* ── 그림 ── */

interface Ctx {
  loadout: Loadout;
  maskArt: string;
}

const ITEM_ICON: Readonly<Record<ItemId, string>> = { hat: ICON.hat, coffee: ICON.coffee, gloves: ICON.gloves, dust: ICON.sack };

/** 캔버스로 찍은 그림 주소(없으면 빈 문자열) */
function artUrl(e: BookEntry, c: Ctx): string {
  const look3 = { weapon: c.loadout.weapon, body: c.loadout.body, blade: c.loadout.blade };
  switch (e.slot) {
    case 'waza': return wazaArt(e.id, look3);
    case 'mask': return maskedArt(look3, e.has ? wornMask(e.art ?? c.maskArt) : SAMPLE_MASK);
    case 'body': return playerArt({ ...look3, body: e.id, pose: 'idle' });
    case 'blade': return playerArt({ ...look3, blade: e.id, pose: 'special' });
    case 'letters': return lettersArt(e.id);
    default: return '';
  }
}

/** 그림 한 장 — 가졌으면 그대로, 못 가졌으면 알파를 마스크로 쓴 옅은 먹 실루엣 */
function artHtml(e: BookEntry, c: Ctx, big = false): string {
  if (e.slot === 'weapon') return swordSvg(e.id, big ? 'bk-sw big' : 'bk-sw');
  if (e.slot === 'item') return ITEM_ICON[e.id as ItemId];
  const url = artUrl(e, c);
  if (!url) return '';
  return e.has ? `<img class="bk-img" src="${url}" alt="" draggable="false">` : `<span class="bk-sil" style="--art:url(&quot;${url}&quot;)"></span>`;
}

/* ── 칸 ── */

const tierTag = (t: Tier): string => `<span class="bk-tier t-${t}">${TIER_COPY[t]}</span>`;

/** 칼 이름은 앞말만(대검은 소머리가 「대검」) */
const shortName = (e: BookEntry): string => e.name.replace(/ 대검$/, '');

function cellHtml(e: BookEntry, c: Ctx): string {
  const label = `${noText(e.no)} ${e.name}${e.tier ? ` ${TIER_COPY[e.tier]}` : ''}${e.has ? '' : ', 아직 없음'}`;
  return `<button type="button" class="bk-cell k-${e.slot} ${e.has ? 'is-have' : 'is-no'}" data-book="${e.key}" aria-label="${escapeHtml(label)}" style="--i:${e.no}">
    <span class="bk-no">${noText(e.no)}</span>
    <span class="bk-art">${artHtml(e, c)}</span>
    <span class="bk-name${e.user ? ' uname' : ''}">${escapeHtml(e.slot === 'weapon' ? shortName(e) : e.name)}</span>
    ${e.tier ? tierTag(e.tier) : ''}
    ${e.has ? '' : `<span class="bk-how">${escapeHtml(e.how)}</span>`}
  </button>`;
}

/** 묶음 머리 한 줄 — 이름 + 모은 수 + 다 모았으면 「완」 도장 */
function headHtml(tag: 'h3' | 'p', cls: string, title: string, es: readonly BookEntry[]): string {
  const have = es.filter((e) => e.has).length;
  const done = have === es.length ? '<i class="bk-done" aria-label="다 모음">완</i>' : '';
  return `<${tag} class="${cls}"><span>${title}</span><small>${have}/${es.length}</small>${done}</${tag}>`;
}

let last: { groups: BookGroup[]; ctx: Ctx } | null = null;

/** 도감 그리기. 칸을 누르면 onPick(키) — 팝업은 overlay가 bookPopup으로 연다 */
export function paintBook(
  root: HTMLElement,
  inv: { loadout: Loadout; maskArt: string },
  owned: ReadonlySet<string>,
  onPick: (key: string) => void,
  masks?: readonly BookMask[],
): void {
  const ctx: Ctx = { loadout: inv.loadout, maskArt: inv.maskArt };
  const groups = bookGroups(owned, masks);
  last = { groups, ctx };
  const { have, total } = bookCount(groups);
  let head = '';
  const body = groups.map((g) => {
    let top: string;
    if (g.head) {
      top = g.head !== head
        ? headHtml('h3', 'bk-grp', g.head, groups.filter((x) => x.head === g.head).flatMap((x) => x.entries))
        : '';
      top += headHtml('p', 'bk-sub', g.title, g.entries);
    } else {
      top = headHtml('h3', 'bk-grp', g.title, g.entries);
    }
    head = g.head ?? g.title;
    const cols = g.id === 'tools' || g.id === 'greats' || g.id === 'item' ? ' c4' : '';
    return `<section class="bk-set">${top}<div class="bk-grid${cols}">${g.entries.map((e) => cellHtml(e, ctx)).join('')}</div></section>`;
  }).join('');
  // 찍기가 바꾼 졸라맨 전역 상태를 장착대로 되돌린다(상점과 같은 이유)
  restoreLook(inv.loadout);
  root.innerHTML = `<div class="bk">
    <header class="bk-top">
      <h2 class="meta-title bk-title">도감</h2>
      <div class="bk-count">
        <p>모은 것 <b>${have}</b>/${total}</p>
        <span class="bk-bar" role="img" aria-label="모은 것 ${have}/${total}"><i style="width:${Math.round((100 * have) / total)}%"></i></span>
      </div>
    </header>
    ${body}
  </div>`;
  root.onclick = (ev) => {
    const key = (ev.target as HTMLElement).closest('[data-book]')?.getAttribute('data-book');
    if (key) onPick(key);
  };
}

/* ── 팝업 — 도감 한 쪽 ── */

const num = (v: number): string => String(Math.round(v * 100) / 100);
const STATS: readonly { key: 'reach' | 'lift' | 'gauge'; label: string; show: (v: number) => string }[] = [
  { key: 'reach', label: '사거리', show: num },
  { key: 'lift', label: '띄우기', show: num },
  { key: 'gauge', label: '필살', show: (v) => `×${num(v)}` },
];
const WEAPON_KEYS = Object.keys(WEAPON) as WeaponId[];

/** 능력치 셋(막대 = 무기 전부 중 최댓값 대비, 오른쪽 = 실제 값) + 이펙트 칸 다섯 */
function statsHtml(id: WeaponId, tier: Tier): string {
  const rows = STATS.map(({ key, label, show }) => {
    const max = Math.max(...WEAPON_KEYS.map((w) => WEAPON[w][key]));
    const v = WEAPON[id][key];
    return `<div class="bk-stat"><span>${label}</span><span class="bk-sbar" role="img" aria-label="${label} ${show(v)}"><i style="width:${Math.round((100 * v) / max)}%"></i></span><b>${show(v)}</b></div>`;
  }).join('');
  const fill = filledSlots(tier);
  const fx = FX_SLOTS.map(({ id: s }) => `<span class="${fill.has(s) ? 'on' : 'off'}">${FX_SLOT_COPY[s]}</span>`).join('');
  return `<div class="bk-stats">${rows}</div><div class="bk-fx">${fx}</div>`;
}

function descOf(e: BookEntry): string {
  switch (e.slot) {
    case 'weapon': return WEAPON_COPY[e.id as WeaponId].desc;
    case 'waza': return WAZA_COPY[e.id as keyof typeof WAZA_COPY].desc;
    case 'mask': return MASK_COPY.desc;
    case 'item': return ITEM_COPY[e.id as ItemId].desc;
    default: return LOOK_USE[e.slot];
  }
}

export interface BookPage {
  meta: string;
  title: string;
  html: string;
  /** 번호순 앞 · 뒤 칸 키(끝이면 null) */
  prev: string | null;
  next: string | null;
}

/** 칸 하나의 팝업 내용. 모르는 키면 null */
export function bookPopup(key: string): BookPage | null {
  if (!last) return null;
  const all = last.groups.flatMap((g) => g.entries);
  const at = all.findIndex((x) => x.key === key);
  if (at < 0) return null;
  const e = all[at];
  const lore = LORE[e.slot === 'mask' ? 'mask:mask' : e.key]; // 가면은 가면마다 칸이 달라도 글은 하나
  const kind = e.slot === 'weapon' && GREAT.has(e.id) ? '대검' : KIND[e.slot];
  const how = !e.has ? `상점 · ${e.how}` : e.slot === 'item' ? `나오는 곳 · ${e.how}` : '';
  // 고유 설정 · 쓰임 · 능력치는 가졌을 때만 — 못 가졌으면 그 자리에 한 줄
  const text = e.has
    ? `${e.tier ? statsHtml(e.id as WeaponId, e.tier) : ''}
      ${lore?.lore ? `<p class="bk-lore">${escapeHtml(lore.lore)}</p>` : ''}
      <p class="bk-use"><b>쓰임</b>${escapeHtml(lore?.use ?? descOf(e))}</p>`
    : '<p class="bk-lock">가지면 열린다.</p>';
  const html = `<div class="bk-pop ${e.has ? 'is-have' : 'is-no'}${e.user ? ' is-user' : ''}">
      <div class="bk-pop-art k-${e.slot}"><span class="bk-pno">${noText(e.no)}</span>${artHtml(e, last.ctx, true)}</div>
      <p class="bk-kind">${kind}${e.tier ? tierTag(e.tier) : ''}<span class="bk-state">${e.has ? '가짐' : '아직 없음'}</span></p>
    </div>
    ${text}
    ${how ? `<p class="bk-how2">${escapeHtml(how)}</p>` : ''}`;
  return {
    meta: `도감 · ${kind} · ${e.no}/${all.length}`,
    title: e.name,
    html,
    prev: all[at - 1]?.key ?? null,
    next: all[at + 1]?.key ?? null,
  };
}
