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
import { BLADE_IDS, BODY_IDS, LETTERS_IDS, LOOK_EARNED, isOwned } from '../meta/loadout';
import { SAMPLE_MASK, wornMask } from '../meta/mask';
import { ACHIEVES } from '../meta/missions';
import { FX_SLOTS, WEAPON_TIER, filledSlots, type Tier } from '../meta/tier';
import { escapeHtml } from './html';
import { ICON } from './icons';
import { fmt, frameSvg, swordSvg } from './ink';
import { rewardHtml } from './rewardFx';
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
  // 꾸러미 · 실적 꾸미기의 이름은 LOOK_EARNED가 들고 있다
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
  if (LOOK_EARNED[id]) return LOOK_EARNED[id].how;
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
      entries: g.ids.map((id) => entry(owned, g.slot, id, (g.names as Record<string, string>)[id] ?? LOOK_EARNED[id].name)),
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

/** 얻는 길 — 상점 장비 · 꾸러미 · 이달의 현장. 실적(도감 칸 · 신입 졸업)과 보급품은 바로가기가 없다 */
function routeOf(e: BookEntry): BookGo | undefined {
  const how = LOOK_EARNED[e.id]?.how;
  if (e.slot === 'item') return undefined;
  if (!how) return 'gear';
  if (how.includes('특근')) return 'season';
  return /^(도감|신입 졸업)/.test(how) ? undefined : 'pack';
}

const TIER_EDGE: Readonly<Record<Tier, string>> = { common: 'dim', fine: 'ink', rare: 'navy', legend: 'gold' };

/** 칸 테두리 — 무기는 등급(연먹 · 먹 · 남 · 금), 가진 꾸러미 · 특근 꾸미기는 금 */
function edgeOf(e: BookEntry): string {
  if (e.tier) return TIER_EDGE[e.tier];
  const go = routeOf(e);
  return e.has && (go === 'pack' || go === 'season') ? 'gold' : '';
}

/** 캔버스로 찍는 그림 — 칸이 화면 근처에 들어올 때 채운다(칸 높이는 CSS가 잡아 둔다) */
const LAZY: ReadonlySet<BookSlot> = new Set(['waza', 'mask', 'body', 'blade', 'letters']);

function cellHtml(e: BookEntry, c: Ctx): string {
  const label = `${noText(e.no)} ${e.name}${e.tier ? ` ${TIER_COPY[e.tier]}` : ''}${e.has ? '' : ', 아직 없음'}`;
  const edge = edgeOf(e);
  return `<button type="button" class="bk-cell k-${e.slot} ${e.has ? 'is-have' : 'is-no'}${edge ? ` edge e-${edge}` : ''}" data-book="${e.key}" aria-label="${escapeHtml(label)}" style="--i:${e.no}">
    <span class="bk-no">${noText(e.no)}</span>
    <span class="bk-art"${LAZY.has(e.slot) ? ' data-lazy' : ''}>${LAZY.has(e.slot) ? '' : artHtml(e, c)}</span>
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

type BookTab = 'col' | 'rec';
const BOOK_TABS: readonly { id: BookTab; name: string }[] = [{ id: 'col', name: '수집' }, { id: 'rec', name: '경력' }];
let bookTab: BookTab = 'col';

/** 탭 전환 — 다시 그리지 않고 칸 묶음 · 증명서 중 하나만 보인다 */
function showTab(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.bk-pane').forEach((p) => { p.hidden = p.dataset.pane !== bookTab; });
  root.querySelectorAll<HTMLElement>('[data-bk-tab]').forEach((b) => {
    const on = b.dataset.bkTab === bookTab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });
  root.scrollTop = 0;
}

let bookIO: IntersectionObserver | null = null;

/** 찍는 그림을 보이는 칸부터 채운다. 화면에 안 보이는 칸(다른 탭 · 먼 아래)은 그리지 않는다.
 *  채운 묶음마다 끝에 restoreLook — 찍기가 바꾼 졸라맨 전역 상태를 장착대로 되돌린다(상점과 같은 이유) */
function fillArt(root: HTMLElement, groups: readonly BookGroup[], ctx: Ctx): void {
  bookIO?.disconnect();
  bookIO = null;
  const byKey = new Map(groups.flatMap((g) => g.entries).map((e) => [e.key, e]));
  const fill = (el: HTMLElement): void => {
    const e = byKey.get(el.closest('[data-book]')?.getAttribute('data-book') ?? '');
    el.removeAttribute('data-lazy');
    if (e) el.innerHTML = artHtml(e, ctx);
  };
  const els = [...root.querySelectorAll<HTMLElement>('[data-lazy]')];
  if (typeof IntersectionObserver === 'undefined') { // 관찰자가 없는 환경 — 한꺼번에
    els.forEach(fill);
    restoreLook(ctx.loadout);
    return;
  }
  const io = new IntersectionObserver((list) => {
    let n = 0;
    for (const it of list) {
      if (!it.isIntersecting) continue;
      io.unobserve(it.target);
      fill(it.target as HTMLElement);
      n++;
    }
    if (n) restoreLook(ctx.loadout);
  }, { root, rootMargin: '200px 0px' });
  bookIO = io;
  els.forEach((el) => io.observe(el));
}

let last: { groups: BookGroup[]; ctx: Ctx } | null = null;

/** 내 기록 — 도감 맨 위. 칭호는 받은 실적에서 나온다 */
export interface RecordView {
  /** 가진 칭호(낮은 것부터). 맨 뒤가 대표 */
  titles: readonly string[];
  titleTotal: number;
  rank: string;
  /** 경력증명서 맨 위 큰 숫자 셋 */
  big: readonly (readonly [string, string])[];
  rows: readonly (readonly [string, string])[];
}

/** 경력증명서 — 한지 서류. 먹 이중선 틀 · 대표 칭호(성명 자리) · 큰 숫자 셋 · 표 · 받은 칭호 · 직인 */
function recordHtml(r: RecordView): string {
  const main = r.titles[r.titles.length - 1];
  const rest = r.titles.slice(0, -1).reverse().map(escapeHtml).join(' · ');
  const big = r.big.map(([k, v]) => `<li><span>${escapeHtml(k)}</span><b>${escapeHtml(v)}</b></li>`).join('');
  const rows = r.rows.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join('');
  return `<section class="bk-recw"><div class="bk-rec">
    ${frameSvg(4, 3, 3.5, 4.5)}${frameSvg(1.5, 1.5, 1.5, 2).replace('class="frame"', 'class="frame in"')}
    <h3 class="bk-rtitle">경력증명서</h3>
    <p class="bk-rname">${escapeHtml(main ?? r.rank)}</p>
    <p class="bk-rsub">칭호 ${r.titles.length}/${r.titleTotal}</p>
    <ul class="bk-rbig">${big}</ul>
    <dl class="bk-rrows">${rows}</dl>
    <div class="bk-rfoot">
      <p class="bk-rtags">${rest ? `<span>받은 칭호</span>${rest}` : ''}</p>
      <span class="bk-stamp" role="img" aria-label="철거공사 직인">철거<br>공사</span>
    </div>
  </div></section>`;
}

const BOOK_GOALS = ACHIEVES.filter((d) => d.stat === 'book');

/** 보상 눈금 막대 + 다음 보상 — 눈금 = 도감 실적 문턱(총칸 대비 위치), 다 채웠으면 「도감 완성」 */
function goalHtml(have: number, total: number): string {
  const at = (n: number): number => Math.min(100, Math.round((1000 * n) / total) / 10);
  const ticks = BOOK_GOALS.map((d) => {
    const p = at(d.goal);
    return `<span class="bk-tk${have >= d.goal ? ' on' : ''}${p >= 97 ? ' end' : ''}" style="left:${p}%"><b>${d.goal}</b></span>`;
  }).join('');
  const next = BOOK_GOALS.find((d) => d.goal > have);
  const more = next
    ? `<p class="bk-nh"><span>다음 보상 · ${next.goal}칸</span><b>${next.goal - have}<small>칸 더</small></b></p>
      <div class="ms-rew">${rewardHtml({ dust: next.rewardDust, orbit: next.rewardOrbit, owns: next.owns })}</div>`
    : '<p class="bk-nh is-full"><i class="bk-done" aria-hidden="true">완</i><b>도감 완성</b></p>';
  return `<section class="bk-goal">
    <div class="bk-scale" role="img" aria-label="모은 것 ${have}/${total}, 보상 눈금 ${BOOK_GOALS.map((d) => d.goal).join(' · ')}">
      <span class="bk-gbar"><i style="width:${at(have)}%"></i></span>${ticks}
    </div>
    ${more}
  </section>`;
}

/** 도감 그리기. 칸을 누르면 onPick(키) — 팝업은 overlay가 bookPopup으로 연다 */
export function paintBook(
  root: HTMLElement,
  inv: { loadout: Loadout; maskArt: string },
  owned: ReadonlySet<string>,
  onPick: (key: string) => void,
  masks?: readonly BookMask[],
  record?: RecordView,
): void {
  const ctx: Ctx = { loadout: inv.loadout, maskArt: inv.maskArt };
  const groups = bookGroups(owned, masks);
  last = { groups, ctx };
  const { have, total } = bookCount(groups);
  bookTab = 'col'; // 새로 열면 늘 「수집」
  const tabsHtml = `<nav class="bk-tabs" role="tablist" aria-label="도감 구분">${BOOK_TABS.map((t) => `<button type="button" role="tab" class="ms-tab${t.id === bookTab ? ' on' : ''}" data-bk-tab="${t.id}" aria-selected="${t.id === bookTab}">${t.name}</button>`).join('')}</nav>`;
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
  root.innerHTML = `<div class="bk">
    <header class="bk-top">
      <h2 class="meta-title bk-title">도감</h2>
      <p class="bk-count">모은 것 <b>${have}</b>/${total}</p>
    </header>
    ${record ? tabsHtml : ''}
    <div class="bk-pane" data-pane="col">${goalHtml(have, total)}${body}</div>
    ${record ? `<div class="bk-pane" data-pane="rec" hidden>${recordHtml(record)}</div>` : ''}
  </div>`;
  root.onclick = (ev) => {
    const el = ev.target as HTMLElement;
    const tab = el.closest('[data-bk-tab]')?.getAttribute('data-bk-tab');
    if (tab) {
      bookTab = tab as BookTab;
      showTab(root);
      return;
    }
    const key = el.closest('[data-book]')?.getAttribute('data-book');
    if (key) onPick(key);
  };
  fillArt(root, groups, ctx);
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

/** 얻는 곳 바로가기 — 장비 탭 · 꾸러미 탭 · 이달의 현장 */
export type BookGo = 'gear' | 'pack' | 'season';

export interface BookPage {
  meta: string;
  title: string;
  html: string;
  /** 못 가진 칸의 얻는 곳. 없으면 undefined */
  go?: BookGo;
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
  const how = !e.has ? `${LOOK_EARNED[e.id] ? '얻는 곳' : '상점'} · ${e.how}` : e.slot === 'item' ? `나오는 곳 · ${e.how}` : '';
  // 고유 설정 · 쓰임 · 능력치는 가졌을 때만 — 못 가졌으면 그 자리에 한 줄
  const text = e.has
    ? `${e.tier ? statsHtml(e.id as WeaponId, e.tier) : ''}
      ${lore?.lore ? `<p class="bk-lore">${escapeHtml(lore.lore)}</p>` : ''}
      <p class="bk-use"><b>쓰임</b>${escapeHtml(lore?.use ?? descOf(e))}</p>`
    : '<p class="bk-lock">가지면 열린다.</p>';
  const html = `<div class="bk-pop ${e.has ? 'is-have' : 'is-no'}${e.user ? ' is-user' : ''}">
      <div class="bk-pop-art k-${e.slot}"><span class="bk-pno">${noText(e.no)}</span>${artHtml(e.slot === 'mask' ? e : { ...e, has: true }, last.ctx, true)}</div>
      <p class="bk-kind">${kind}${e.tier ? tierTag(e.tier) : ''}<span class="bk-state">${e.has ? '가짐' : '아직 없음'}</span></p>
    </div>
    ${text}
    ${how ? `<p class="bk-how2">${escapeHtml(how)}</p>` : ''}`;
  return {
    meta: `도감 · ${kind} · ${e.no}/${all.length}`,
    title: e.name,
    html,
    go: e.has ? undefined : routeOf(e),
    prev: all[at - 1]?.key ?? null,
    next: all[at + 1]?.key ?? null,
  };
}
