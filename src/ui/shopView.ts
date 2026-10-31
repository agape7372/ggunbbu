// 상점 탭 — 「자재 카탈로그」. 품목마다 판 속 졸라맨을 찍은 그림 + 아래 띠 하나(모자람 막대 / 사기 / 장착).
// 먼지로 무기·마스크, 궤도조각으로 필살·꾸미기, 먼지로 철거 자격 응시. IAP SKU(≤₩1,900)는 결제가 붙을 때만 그린다(v1 제외).

import { WEAPON } from '../config';
import {
  COSMETIC_ORBIT_COST, DEFAULT_OWNED_IDS, DUST_EXCHANGE, GREATSWORD_IDS, MASK_DUST_COST, ORBIT_PER_AD, WAZA_ORBIT_COST,
  WEAPON_DUST_COST, WEAPON_IDS, examStatus, licenseTitle, nextDustGoal, nextExam,
} from '../meta';
import type { Loadout, WeaponId } from '../meta';
import { SAMPLE_MASK, wornMask } from '../meta/mask';
import { MASK_COPY, WAZA_COPY, WEAPON_COPY } from '../content/world';
import { SCREENS } from '../content/screens';
import { SKUS, type Sku } from '../platform/iap';
import { ICON } from './icons';
import { escapeHtml } from './html';
import { lettersArt, maskedArt, playerArt, restoreLook, swordArt, wazaArt } from './shopArt';

type Pay = 'dust' | 'orbit';
type Slot = keyof Loadout;

interface Item {
  id: string;
  slot: Slot;
  name: string;
  cost: number;
  pay: Pay;
  /** 칸 위 작은 이름표 — 칸(2열)에만. 보유 도장·다음 목표가 이 줄 오른쪽에 앉아 긴 이름과 겹치지 않는다 */
  kind?: string;
  /** 그림만으로 안 보이는 것(필살)만 한 줄 */
  desc?: string;
}

const weaponItem = (id: WeaponId, kind?: string, name = WEAPON_COPY[id].name): Item =>
  ({ id, slot: 'weapon', kind, name, cost: WEAPON_DUST_COST[id], pay: 'dust' });

/** 연장 셋 — 큰 카드 */
const TOOL_ITEMS: readonly Item[] = (['hammer', 'crowbar', 'grinder'] as const).map((id) => weaponItem(id));
/** 대검 — 칸. 이름표가 「대검」이라 이름은 앞말만 */
const GREAT_ITEMS: readonly Item[] = GREATSWORD_IDS.map((id) => weaponItem(id, '대검', WEAPON_COPY[id].name.replace(/ 대검$/, '')));

const WAZA_ITEMS: readonly Item[] = (['ageba', 'tetsu'] as const).map((id) => ({
  id, slot: 'waza', kind: '필살', name: WAZA_COPY[id].name, desc: WAZA_COPY[id].desc, cost: WAZA_ORBIT_COST, pay: 'orbit',
}));

const LOOK_ITEMS: readonly Item[] = ([
  ['amber', 'body', '졸라맨', '호박'],
  ['slate', 'body', '졸라맨', '석판'],
  ['rebar', 'blade', '칼빛', '철근'],
  ['crescent', 'blade', '칼빛', '초승달'],
  ['stamp', 'letters', '효과글자', '도장'],
  ['orbit', 'letters', '효과글자', '궤도'],
] as const).map(([id, slot, kind, name]) => ({ id, slot, kind, name, cost: COSMETIC_ORBIT_COST, pay: 'orbit' }));

/** 마스크 — 큰 카드 하나. 한 번 사면 다시 그리기는 무료 */
const MASK_ITEM: Item = { id: 'mask', slot: 'mask', name: MASK_COPY.name, cost: MASK_DUST_COST, pay: 'dust' };

/** 무기 막대 셋 — 장비 탭과 같은 값·같은 정규화(무기 전부 중 최댓값) */
const STATS: readonly { key: 'reach' | 'lift' | 'gauge'; label: string }[] = [
  { key: 'reach', label: '사거리' },
  { key: 'lift', label: '띄우기' },
  { key: 'gauge', label: '필살' },
];

export type CardState = 'owned' | 'ok' | 'short';

/** 칸 상태 — 보유가 먼저, 그다음 지갑 */
export function cardState(has: boolean, wallet: number, cost: number): CardState {
  if (has) return 'owned';
  return wallet >= cost ? 'ok' : 'short';
}

/** 상점이 읽는 지갑 + 철거 자격 현황 + 장착(그림 되돌리기·장착 띠) */
export interface ShopInv {
  dust: number;
  orbit: number;
  /** 철거 자격 등급 0~3 */
  license: number;
  /** 평생 누적 철거 건물 수 */
  buildings: number;
  loadout: Loadout;
  /** 도트판 그림(저장 maskArt) — 마스크 카드 그림 */
  maskArt: string;
}

export interface ShopHandlers {
  /** 철거 자격 응시 */
  onExam(): void;
  onBuy(skuId: string): void;
  onAdPack(): void;
  onOrbit(id: string): void;
  /** 먼지로 사는 줄(무기) — economy WEAPON_DUST_COST */
  onDust(id: string): void;
  onExchange(): void;
  /** 산 품목을 상점에서 바로 장착 */
  onEquip(slot: string, id: string): void;
  /** 산 마스크의 「그리기」 — 도트판을 연다 */
  onMaskEdit(): void;
}

/** 방금 「사기」를 누른 품목 — 다음 그리기에서 보유로 바뀌었으면 도장을 쿵 찍는다 */
let pendingBuy: string | null = null;

export function paintShop(
  root: HTMLElement,
  inv: ShopInv,
  owned: ReadonlySet<string>,
  paths: { iap: boolean; ad: boolean },
  h: ShopHandlers,
): void {
  const fresh = pendingBuy;
  pendingBuy = null;
  const goal = nextDustGoal([...owned], inv.dust);
  // 노랑은 화면에 하나 — 그리는 순서로 처음 만나는 「사기」·「응시」
  let mainLeft = true;
  const takeMain = (ok: boolean): boolean => {
    if (!ok || !mainLeft) return false;
    mainLeft = false;
    return true;
  };
  /** 품목 하나 — 무기 연장은 큰 카드(그림 옆에 막대), 나머지는 2열 칸 */
  const card = (it: Item, art: string, more = ''): string => {
    const st = cardState(hasItem(owned, it.id), inv[it.pay], it.cost);
    const tag = goal && goal.id === it.id && st === 'short' ? '<span class="cat-goal">다음 목표</span>' : '';
    const stamp = st === 'owned' ? `<span class="cat-stamp${fresh === it.id ? ' fresh' : ''}">보유</span>` : '';
    const img = art ? `<img src="${art}" alt="" draggable="false">` : '';
    const kind = it.kind ? `<p class="cat-kind">${escapeHtml(it.kind)}</p>` : '';
    // 도장·꼬리표는 서류(이름) 쪽 — 그림을 가리지 않는다
    return `<article class="${it.kind ? 'cat-tile' : 'cat-card'} is-${st}">
      <div class="cat-art">${img}</div>
      <div class="cat-body">${kind}<h3 class="cat-name">${escapeHtml(it.name)}</h3>${more}${tag}${stamp}</div>
      ${footHtml(it, st, takeMain(st === 'ok'), inv)}
    </article>`;
  };
  const tools = TOOL_ITEMS.map((it) => card(
    it,
    playerArt({ weapon: it.id as WeaponId, body: inv.loadout.body, blade: inv.loadout.blade, pose: 'attack' }),
    statsHtml(it.id as WeaponId),
  )).join('');
  const greats = GREAT_ITEMS.map((it) => card(it, swordArt(it.id as WeaponId), statsHtml(it.id as WeaponId))).join('');
  const waza = WAZA_ITEMS.map((it) => card(
    it,
    wazaArt(it.id, { weapon: inv.loadout.weapon, body: inv.loadout.body, blade: inv.loadout.blade }),
    `<p class="cat-desc">${escapeHtml(it.desc ?? '')}</p>`,
  )).join('');
  // 사기 전엔 견본을 씌워 보인다. 산 뒤엔 내 그림(아직 안 그렸으면 견본 — 판 속과 같은 규칙)
  const maskLook = hasItem(owned, MASK_ITEM.id) ? wornMask(inv.maskArt) : SAMPLE_MASK;
  const mask = card(MASK_ITEM, maskedArt(inv.loadout, maskLook), `<p class="cat-desc">${escapeHtml(MASK_COPY.desc)}</p>`);
  const looks = LOOK_ITEMS.map((it) => card(it, lookArt(it, inv.loadout))).join('');
  // 찍기가 바꾼 졸라맨 전역 상태를 장착대로 — 뒤 화면 졸라맨이 미리보기 색을 입고 남지 않게
  restoreLook(inv.loadout);
  const exam = examHtml(inv, takeMain);

  const canExchange = inv.dust >= DUST_EXCHANGE.dust;
  // 웹(광고 미배선)에선 광고 칸을 아예 안 그린다 — 무료 지급 위장 금지 (08-30, P0-2)
  const earn = `<div class="earn">
      ${paths.ad ? `<button type="button" class="earn-btn" data-shop-ad="1">${ICON.ad}광고 <b>+${ORBIT_PER_AD}${ICON.orbit}</b></button>` : ''}
      <button type="button" class="earn-btn" data-shop-exchange="1"${canExchange ? '' : ' disabled'}><b>${ICON.dust}${DUST_EXCHANGE.dust}</b>→<b>${ICON.orbit}${DUST_EXCHANGE.orbit}</b>바꾸기</button>
    </div>`;

  root.innerHTML = `
    <header class="sheet-head">
      <div class="sheet-head-row">
        <h2>상점</h2>
        <p class="wallet wallet-lg"><span aria-label="먼지 ${fmt(inv.dust)}">${ICON.dust}${fmt(inv.dust)}</span><span aria-label="궤도조각 ${fmt(inv.orbit)}">${ICON.orbit}${fmt(inv.orbit)}</span></p>
      </div>
    </header>
    <p class="sec-h">무기 <small class="cur">${ICON.dust}먼지</small></p>
    <div class="cat-list">${tools}</div>
    <p class="sec-h">대검 <small class="cur">${ICON.dust}먼지</small></p>
    <div class="cat-grid">${greats}</div>
    <p class="sec-h">필살 <small class="cur">${ICON.orbit}궤도조각</small></p>
    ${earn}
    <div class="cat-grid">${waza}</div>
    <p class="sec-h">마스크 <small class="cur">${ICON.dust}먼지</small></p>
    <div class="cat-list">${mask}</div>
    <p class="sec-h">꾸미기 <small class="cur">${ICON.orbit}궤도조각</small></p>
    <div class="cat-grid">${looks}</div>
    <p class="sec-h">${SCREENS.license.heading} <small>${escapeHtml(licenseTitle(inv.license))}</small></p>
    <div class="cat-list">${exam}</div>
    ${paths.iap ? `<p class="sec-h">결제 <small>부가세 포함</small></p><div class="list">${skuRowsHtml()}</div>` : ''}`;

  root.onclick = (e) => {
    const t = (e.target as HTMLElement).closest('[data-shop-sku],[data-shop-ad],[data-orbit-id],[data-dust-id],[data-shop-exchange],[data-shop-exam],[data-equip-id],[data-mask-edit]') as HTMLButtonElement | null;
    if (!t || t.disabled) return;
    e.preventDefault();
    if (t.hasAttribute('data-shop-exam')) { h.onExam(); return; }
    if (t.hasAttribute('data-mask-edit')) { h.onMaskEdit(); return; }
    const eid = t.getAttribute('data-equip-id');
    const slot = t.getAttribute('data-equip-slot');
    if (eid && slot) { h.onEquip(slot, eid); return; }
    const did = t.getAttribute('data-dust-id');
    if (did) {
      if (!hasItem(owned, did)) { pendingBuy = did; h.onDust(did); }
      return;
    }
    if (t.hasAttribute('data-shop-exchange')) { h.onExchange(); return; }
    if (t.hasAttribute('data-shop-ad')) { h.onAdPack(); return; }
    const oid = t.getAttribute('data-orbit-id');
    if (oid) {
      if (!hasItem(owned, oid)) { pendingBuy = oid; h.onOrbit(oid); }
      return;
    }
    const id = t.getAttribute('data-shop-sku');
    if (id && skuById(id)) h.onBuy(id);
  };
}

/** 꾸미기 그림 — 몸 색은 서 있는 졸라맨, 칼빛은 필살 참격(호가 가장 크다), 효과글자는 판 속 글자 */
function lookArt(it: Item, l: Loadout): string {
  if (it.slot === 'body') return playerArt({ weapon: l.weapon, body: it.id, blade: l.blade, pose: 'idle' });
  if (it.slot === 'blade') return playerArt({ weapon: l.weapon, body: l.body, blade: it.id, pose: 'special' });
  return lettersArt(it.id);
}

/** 옅은 칸 = 철거칼, 잉크 = 이 무기 */
function statsHtml(id: WeaponId): string {
  const rows = STATS.map(({ key, label }) => {
    const max = Math.max(...WEAPON_IDS.map((w) => WEAPON[w][key]));
    const pct = (w: WeaponId): number => Math.round((100 * WEAPON[w][key]) / max);
    return `<div class="cat-stat"><span>${label}</span><span class="bar" role="img" aria-label="${label} ${pct(id)}%"><span class="ghost" style="width:${pct('sword')}%"></span><span class="fill" style="width:${pct(id)}%"></span></span></div>`;
  }).join('');
  return `<div class="cat-stats">${rows}</div>`;
}

/** 아래 띠 — 모자람 = 차오르는 막대 + 가진 것/값, 살 수 있음 = 「사기」, 보유 = 「장착」(장착 중이면 꺼짐) */
function footHtml(it: Item, st: CardState, main: boolean, inv: ShopInv): string {
  if (st === 'owned') {
    const on = inv.loadout[it.slot] === it.id;
    const equip = `<button type="button" class="cat-foot cat-equip" data-equip-slot="${it.slot}" data-equip-id="${it.id}"${on ? ' disabled' : ''}>${on ? '장착 중' : '장착'}</button>`;
    // 마스크는 띠 둘 — 「그리기」(도트판) + 장착. 벗기는 건 장비 탭
    return it.slot === 'mask'
      ? `<div class="cat-feet"><button type="button" class="cat-foot cat-draw" data-mask-edit="1">그리기</button>${equip}</div>`
      : equip;
  }
  const icon = ICON[it.pay];
  if (st === 'ok') {
    return `<button type="button" class="cat-foot cat-buy${main ? ' is-main' : ''}" data-${it.pay}-id="${it.id}">사기<span class="price">${icon}${fmt(it.cost)}</span></button>`;
  }
  return progressFoot(icon, inv[it.pay], it.cost);
}

/** 모자란 띠 — 막대 + 「가진 것/필요」 */
function progressFoot(icon: string, have: number, need: number): string {
  const pct = Math.max(0, Math.min(100, Math.floor((100 * have) / need)));
  return `<div class="cat-foot"><span class="bar" role="img" aria-label="${fmt(have)}/${fmt(need)}"><span class="fill" style="width:${pct}%"></span></span><span class="cat-have">${icon}${fmt(have)}<b>/${fmt(need)}</b></span></div>`;
}

/** 철거 자격 — 건물 조건이 먼저, 응시료는 그다음. 모자란 쪽을 막대로 보인다 */
function examHtml(inv: ShopInv, takeMain: (ok: boolean) => boolean): string {
  const exam = nextExam(inv.license);
  const badge = (t: string): string => `<div class="cat-art cert-art"><span class="cert-badge">${escapeHtml(t)}</span></div>`;
  if (!exam) {
    return `<article class="cat-card is-owned">${badge(licenseTitle(inv.license))}<div class="cat-body"><h3 class="cat-name">${escapeHtml(SCREENS.license.maxTitle)}</h3></div></article>`;
  }
  const to = licenseTitle(inv.license + 1);
  const status = examStatus(inv.license, inv.buildings, inv.dust);
  let foot: string;
  if (status === 'ok') {
    foot = `<button type="button" class="cat-foot cat-buy${takeMain(true) ? ' is-main' : ''}" data-shop-exam="1">${escapeHtml(SCREENS.license.exam)}<span class="price">${ICON.dust}${fmt(exam.fee)}</span></button>`;
  } else if (status === 'dust') {
    foot = progressFoot(ICON.dust, inv.dust, exam.fee);
  } else {
    foot = progressFoot(ICON.play, Math.min(inv.buildings, exam.buildings), exam.buildings);
  }
  // 응시료는 띠가 건물 막대일 때만 몸에 적는다 — 「응시」·먼지 막대는 띠가 이미 값을 보인다
  const fee = status === 'buildings' ? `<p class="cat-desc cert-fee">${ICON.dust}${fmt(exam.fee)}</p>` : '';
  return `<article class="cat-card is-${status === 'ok' ? 'ok' : 'short'}">
      ${badge(to)}
      <div class="cat-body"><h3 class="cat-name">${escapeHtml(to)} ${escapeHtml(SCREENS.license.exam)}</h3>${fee}</div>
      ${foot}
    </article>`;
}

function hasItem(owned: ReadonlySet<string>, id: string): boolean {
  return owned.has(id) || (DEFAULT_OWNED_IDS as readonly string[]).includes(id);
}

function skuById(id: string): Sku | undefined {
  return SKUS.find((s) => s.id === id);
}

function skuRowsHtml(): string {
  return SKUS.filter((s) => s.krw <= 1900).map((sku) =>
    `<button type="button" class="shop-row" data-shop-sku="${escapeHtml(sku.id)}">
      <span class="shop-name">${escapeHtml(sku.title)}${sku.orbit != null ? `<small>궤도조각 ${fmt(sku.orbit)}</small>` : ''}</span>
      <span class="price">₩${fmt(sku.krw)}</span>
    </button>`,
  ).join('');
}

function fmt(n: number): string {
  return Math.trunc(n).toLocaleString('ko-KR');
}
