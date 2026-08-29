// 상점 탭. IAP SKU(≤₩1,900) + 궤도조각 해금. 부활 광고 제거 SKU 없음.

import { COSMETIC_ORBIT_COST, DEFAULT_OWNED_IDS, WAZA_ORBIT_COST } from '../meta';
import { SKUS, type Sku } from '../platform/iap';

interface OrbitRow {
  id: string;
  title: string;
  cost: number;
}

const ORBIT_ROWS: readonly OrbitRow[] = [
  { id: 'ageba', title: '올려베기', cost: WAZA_ORBIT_COST },
  { id: 'tetsu', title: '철벽', cost: WAZA_ORBIT_COST },
  { id: 'amber', title: '몸통 · 호박', cost: COSMETIC_ORBIT_COST },
  { id: 'slate', title: '몸통 · 석판', cost: COSMETIC_ORBIT_COST },
  { id: 'rebar', title: '칼 · 철근', cost: COSMETIC_ORBIT_COST },
  { id: 'crescent', title: '칼 · 초승달', cost: COSMETIC_ORBIT_COST },
  { id: 'stamp', title: '글자 · 도장', cost: COSMETIC_ORBIT_COST },
  { id: 'orbit', title: '글자 · 궤도', cost: COSMETIC_ORBIT_COST },
];

export function shopHtml(paths: { iap: boolean; ad: boolean }): string {
  // 웹(결제·광고 미배선)에선 해당 섹션을 아예 안 그린다 — 무료 지급 위장 금지 (08-30, P0-2)
  const skuBlock = paths.iap
    ? `<p class="ov-manual-lead">부가세 포함. 모든 상품 ₩1,900 이하. 궤도조각으로도 연다.</p>
    <div data-el="skus">${skuGroupsHtml()}</div>`
    : `<p class="ov-manual-lead">궤도조각으로 연다. 결제 상품은 앱 출시 후.</p>`;
  const adBtn = paths.ad
    ? `<button type="button" class="flyer-btn" data-shop-ad="1">광고로 조각</button>`
    : '';
  return `<div class="ov-shop" style="max-height:460px;overflow-y:auto">
    <h2>상점</h2>
    ${skuBlock}
    <p class="ov-records-h" data-el="wallet">먼지 0 · 궤도조각 0</p>
    <p class="ov-records-h" style="margin-top:8px">궤도조각 해금</p>
    <div data-el="orbit-rows"></div>
    ${adBtn}
  </div>`;
}

export function paintShop(
  root: HTMLElement,
  inv: { dust: number; orbit: number },
  owned: ReadonlySet<string>,
  paths: { iap: boolean; ad: boolean },
  onBuy: (skuId: string) => void,
  onAdPack: () => void,
  onOrbit: (id: string) => void,
): void {
  root.innerHTML = shopHtml(paths);
  const wallet = root.querySelector('[data-el="wallet"]');
  if (wallet) {
    wallet.textContent =
      `먼지 ${fmtNum(inv.dust)} · 궤도조각 ${fmtNum(inv.orbit)}`;
  }
  const box = root.querySelector('[data-el="orbit-rows"]');
  if (box) {
    for (const row of ORBIT_ROWS) {
      const has = hasItem(owned, row.id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'flyer-btn';
      b.style.textAlign = 'left';
      b.style.minHeight = '40px';
      b.setAttribute('data-orbit-id', row.id);
      if (has) {
        b.disabled = true;
        b.classList.add('locked');
        b.textContent = `${row.title} — 보유`;
      } else {
        b.innerHTML =
          `<span style="display:flex;justify-content:space-between;gap:8px;font-size:13px">
            <span>${escapeHtml(row.title)}</span>
            <span>궤도 ${fmtNum(row.cost)}</span>
          </span>`;
        // 잔액 부족 = 조용한 무반응 금지 — 미션 탭과 같은 disabled 문법 (08-30, B-2)
        if (inv.orbit < row.cost) {
          b.disabled = true;
          b.style.opacity = '0.42';
        }
      }
      box.appendChild(b);
    }
  }
  root.onclick = (e) => {
    const t = (e.target as HTMLElement).closest('[data-shop-sku],[data-shop-ad],[data-orbit-id]') as HTMLElement | null;
    if (!t) return;
    e.preventDefault();
    if (t.hasAttribute('data-shop-ad')) {
      onAdPack();
      return;
    }
    const oid = t.getAttribute('data-orbit-id');
    if (oid) {
      if (hasItem(owned, oid)) return;
      onOrbit(oid);
      return;
    }
    const id = t.getAttribute('data-shop-sku');
    if (!id || !skuById(id)) return;
    onBuy(id);
  };
}

function hasItem(owned: ReadonlySet<string>, id: string): boolean {
  return owned.has(id) || (DEFAULT_OWNED_IDS as readonly string[]).includes(id);
}

function skuGroupsHtml(): string {
  const groups: { title: string; match: (id: string) => boolean }[] = [
    { title: '궤도조각', match: (id) => id.startsWith('orbit') },
    { title: '스킨', match: (id) => id.startsWith('skin') },
    { title: '필살', match: (id) => id.startsWith('waza') },
  ];
  const seen = new Set<string>();
  const chunks: string[] = [];
  for (const g of groups) {
    const skus = SKUS.filter((s) => g.match(s.id) && s.krw <= 1900);
    if (!skus.length) continue;
    skus.forEach((s) => seen.add(s.id));
    chunks.push(groupHtml(g.title, skus));
  }
  const rest = SKUS.filter((s) => !seen.has(s.id) && s.krw <= 1900);
  if (rest.length) chunks.push(groupHtml('기타', rest));
  return chunks.join('');
}

function skuById(id: string): Sku | undefined {
  return SKUS.find((s) => s.id === id);
}

function groupHtml(title: string, skus: readonly Sku[]): string {
  const rows = skus.map((sku) => {
    const extra = sku.orbit != null ? `궤도조각 ${fmtNum(sku.orbit)}` : '';
    return `<button type="button" class="flyer-btn" data-shop-sku="${escapeHtml(sku.id)}" style="text-align:left;min-height:40px;padding:6px 10px">
      <span style="display:flex;justify-content:space-between;gap:8px;font-size:13px">
        <span>${escapeHtml(sku.title)}</span>
        <span>₩${fmtNum(sku.krw)}</span>
      </span>
      ${extra ? `<span style="display:block;font-size:10px;font-weight:600;color:#6E695F;margin-top:2px">${escapeHtml(extra)}</span>` : ''}
    </button>`;
  }).join('');
  return `<p class="ov-records-h" style="margin-top:6px">${escapeHtml(title)}</p>
    <div style="display:flex;flex-direction:column;gap:6px">${rows}</div>`;
}

function fmtNum(n: number): string {
  return Math.trunc(n).toLocaleString('ko-KR');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}
