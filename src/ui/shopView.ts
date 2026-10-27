// 상점 탭. 궤도조각으로 연다 + 먼지 교환 + 광고 조각. IAP SKU(≤₩1,900)는 결제가 붙을 때만 그린다(v1 제외).

import { COSMETIC_ORBIT_COST, DEFAULT_OWNED_IDS, DUST_EXCHANGE, ORBIT_PER_AD, WAZA_ORBIT_COST, WEAPON_DUST_COST } from '../meta';
import type { WeaponId } from '../meta';
import { WAZA_COPY, WEAPON_COPY } from '../content/world';
import { SKUS, type Sku } from '../platform/iap';
import { ICON } from './icons';
import { escapeHtml } from './html';

interface BuyRow {
  id: string;
  title: string;
  note: string;
  cost: number;
}

const ORBIT_ROWS: readonly BuyRow[] = [
  { id: 'ageba', title: '필살 · 올려베기', note: WAZA_COPY.ageba.desc, cost: WAZA_ORBIT_COST },
  { id: 'tetsu', title: '필살 · 철벽', note: WAZA_COPY.tetsu.desc, cost: WAZA_ORBIT_COST },
  { id: 'amber', title: '졸라맨 · 호박', note: '몸 색', cost: COSMETIC_ORBIT_COST },
  { id: 'slate', title: '졸라맨 · 석판', note: '몸 색', cost: COSMETIC_ORBIT_COST },
  { id: 'rebar', title: '칼빛 · 철근', note: '참격 색', cost: COSMETIC_ORBIT_COST },
  { id: 'crescent', title: '칼빛 · 초승달', note: '참격 색', cost: COSMETIC_ORBIT_COST },
  { id: 'stamp', title: '효과글자 · 도장', note: '타격 글자', cost: COSMETIC_ORBIT_COST },
  { id: 'orbit', title: '효과글자 · 궤도', note: '타격 글자', cost: COSMETIC_ORBIT_COST },
];

/** 먼지로 사는 줄 — 무기. 가격은 economy WEAPON_DUST_COST */
const DUST_ROWS: readonly BuyRow[] = (Object.keys(WEAPON_DUST_COST) as WeaponId[]).map((id) => ({
  id,
  title: `무기 · ${WEAPON_COPY[id].name}`,
  note: WEAPON_COPY[id].desc,
  cost: WEAPON_DUST_COST[id],
}));

export interface ShopHandlers {
  onBuy(skuId: string): void;
  onAdPack(): void;
  onOrbit(id: string): void;
  /** 먼지로 사는 줄(무기) — economy WEAPON_DUST_COST */
  onDust(id: string): void;
  onExchange(): void;
}

export function paintShop(
  root: HTMLElement,
  inv: { dust: number; orbit: number },
  owned: ReadonlySet<string>,
  paths: { iap: boolean; ad: boolean },
  h: ShopHandlers,
): void {
  // 웹(결제·광고 미배선)에선 해당 줄을 아예 안 그린다 — 무료 지급 위장 금지 (08-30, P0-2)
  const canExchange = inv.dust >= DUST_EXCHANGE.dust;
  const earn = [
    `<button type="button" class="shop-row${canExchange ? '' : ' short'}" data-shop-exchange="1"${canExchange ? '' : ' disabled'}>
      <span class="shop-name">먼지 바꾸기<small>먼지 ${DUST_EXCHANGE.dust} → 궤도조각 ${DUST_EXCHANGE.orbit}</small></span>
      ${priceCol(`${ICON.dust}${DUST_EXCHANGE.dust}`, canExchange ? 0 : DUST_EXCHANGE.dust - inv.dust)}
    </button>`,
    paths.ad
      ? `<button type="button" class="shop-row" data-shop-ad="1">
          <span class="shop-name">광고 보고 받기<small>한 편에 궤도조각 ${ORBIT_PER_AD}</small></span>
          <span class="price">${ICON.ad}</span>
        </button>`
      : '',
  ].join('');

  const dustRows = DUST_ROWS.map((row) => buyRowHtml(row, 'dust', inv, owned)).join('');
  const rows = ORBIT_ROWS.map((row) => buyRowHtml(row, 'orbit', inv, owned)).join('');

  root.innerHTML = `
    <header class="sheet-head">
      <div class="sheet-head-row">
        <h2>상점</h2>
        <p class="wallet"><span aria-label="먼지">${ICON.dust}${fmt(inv.dust)}</span><span aria-label="궤도조각">${ICON.orbit}${fmt(inv.orbit)}</span></p>
      </div>
      <p class="sheet-lead">먼지는 건물을 부수면 쌓인다. 먼지로 무기를 사고, 궤도조각으로 연다.</p>
    </header>
    <p class="sec-h">궤도조각 얻기</p>
    <div class="list">${earn}</div>
    <p class="sec-h">먼지로 사기</p>
    <div class="list">${dustRows}</div>
    <p class="sec-h">열기</p>
    <div class="list">${rows}</div>
    ${paths.iap ? `<p class="sec-h">결제 <small>부가세 포함</small></p><div class="list">${skuRowsHtml()}</div>` : ''}`;

  root.onclick = (e) => {
    const t = (e.target as HTMLElement).closest('[data-shop-sku],[data-shop-ad],[data-orbit-id],[data-dust-id],[data-shop-exchange]') as HTMLButtonElement | null;
    if (!t || t.disabled) return;
    e.preventDefault();
    const did = t.getAttribute('data-dust-id');
    if (did) {
      if (!hasItem(owned, did)) h.onDust(did);
      return;
    }
    if (t.hasAttribute('data-shop-exchange')) { h.onExchange(); return; }
    if (t.hasAttribute('data-shop-ad')) { h.onAdPack(); return; }
    const oid = t.getAttribute('data-orbit-id');
    if (oid) {
      if (!hasItem(owned, oid)) h.onOrbit(oid);
      return;
    }
    const id = t.getAttribute('data-shop-sku');
    if (id && skuById(id)) h.onBuy(id);
  };
}

/** 사는 줄 하나. 잔액 부족 = 조용한 무반응 금지 — 눌리지 않게 하고 점선 칸 + 「N 모자람」이 이유를 말한다 (08-30, B-2) */
function buyRowHtml(
  row: BuyRow,
  pay: 'dust' | 'orbit',
  inv: { dust: number; orbit: number },
  owned: ReadonlySet<string>,
): string {
  const has = hasItem(owned, row.id);
  const short = !has && inv[pay] < row.cost;
  let state = '';
  if (has) state = ' owned';
  else if (short) state = ' short';
  const price = has ? '보유' : `${ICON[pay]}${fmt(row.cost)}`;
  return `<button type="button" class="shop-row${state}" data-${pay}-id="${row.id}"${has || short ? ' disabled' : ''}>
      <span class="shop-name">${escapeHtml(row.title)}<small>${escapeHtml(row.note)}</small></span>
      ${priceCol(price, short ? row.cost - inv[pay] : 0)}
    </button>`;
}

/** 가격 + 모자라면 얼마나 모자란지. 빨강은 안 쓴다 — 점선 칸과 이 글자가 말한다 */
function priceCol(price: string, lack: number): string {
  return `<span class="price-col"><span class="price">${price}</span>${lack > 0 ? `<small class="lack">${fmt(lack)} 모자람</small>` : ''}</span>`;
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

