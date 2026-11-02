// 상점 「꾸러미」 탭 — 맨 위 고정 묶음(첫 결제 선물 · 공짜 커피 · 단골 도장) + 그림 탭 다섯 + 탭 하나의 상품(패널 · 세로 줄).
// 패널 = 먹판 장면(제목 · 효율 인장 · 도화선) + 구성 칸 줄 + 금 획 가격 단추(구석에 도장 쪽지). 설명 글 없음, 구입 안내는 구석 안내 단추 안에.
// 번쩍임 · 깜빡임 · 재촉 문구 없음. 결제는 웹에 없다(iap = false) — 그때는 커피와 시작 장비만 보인다.

import './shop.css';
import { KITS, KIT_IDS, type Items, type KitId } from '../meta/kit';
import {
  DUST_WON, FIRST_GIFT, ORBIT_WON, REGULAR_STEPS, SALARY_DAILY, SALARY_DAYS, WON_PER_STAMP, dustOf, firstLeft, orbitOf, regularReady, skuById, stampsOf,
  type Regular, type Sku, type SkuId,
} from '../meta/catalog';
import { LOOK_EARNED } from '../meta/loadout';
import { clockText, fuseLeft } from '../meta/offers';
import { FREE_COFFEE, type Reward } from '../meta/progress';
import { escapeHtml, infoHtml } from './html';
import { goods, moonArt, skuGoods, type GoodsId } from './goodsArt';
import { glyph } from './ink';
import { packScene, playerArt } from './shopArt';

export interface OfferRow {
  sku: SkuId;
  /** 같은 구성의 정가 상품 — 추천 탭에서 이 패널은 뺀다 */
  of: SkuId;
  title: string;
  price: string;
  /** 정가 — 실제로 파는 값 */
  regular: string;
  /** 끝 시각 · 처음 길이 — 도화선 */
  until: number;
  span: number;
  /** 효율(%). 0이면 인장이 없다 */
  eff: number;
}

export interface PackRow {
  sku: SkuId;
  title: string;
  price: string;
  /** 효율(%). 0이면 인장이 없다 */
  eff: number;
}

export interface PackView {
  iap: boolean;
  offers: readonly OfferRow[];
  rows: readonly PackRow[];
  /** 산 상품 id — 첫 구매 두 배가 남았는지 */
  bought: readonly string[];
  items: Items;
  orbit: number;
  /** 첫 결제 선물이 남았나 */
  firstGift: boolean;
  /** 오늘 공짜 커피를 받을 수 있나 */
  coffeeOn: boolean;
  regular: Regular;
  /** 특근 수당 패널의 칸 — 오늘 사면 받을 수 있는 몫(이미 가진 꾸미기 뺌) */
  passGoods: Reward;
}

/** 판매자 표시(전자상거래법) — 출시 빌드는 check-release가 빈 값을 막는다 */
const SELLER: string = import.meta.env.VITE_SELLER_INFO ?? '';

/** 결제 전에 꼭 보여야 하는 안내 — 구매 창 · 상점의 안내 단추. 홈 특가 창 · 미션 탭에서 바로 사도 구매 창을 지난다 */
export const BUY_NOTES: readonly string[] = [
  '구매 후 7일 안에 청약철회할 수 있어요. 받은 재화나 아이템을 쓴 경우에는 철회가 제한될 수 있어요. 환불은 Google Play 절차를 따라요.',
  '구매 복원은 한 번만 사는 상품만 돼요. 궤도조각\u00a0· 먼지\u00a0· 마스크\u00a0· 특근\u00a0· 월급\u00a0· 단골 도장\u00a0· 첫 결제 선물은 이 기기에만 남아요.', // 붙는 공백 = 줄 맨 앞에 · 가 안 온다
  '미성년자가 법정대리인 동의 없이 결제하면 본인이나 법정대리인이 취소할 수 있어요.',
  '특근 수당과 월급 봉투는 자동 결제가 없어요.',
  ...(SELLER ? [`판매자 · ${SELLER}`] : []),
];

/** 지금 탭 — 다시 그려도 남고, 상점을 새로 열면 첫 탭으로(shopView가 resetPackTab) */
let sub = '';
export const setPackTab = (id: string): void => { sub = id; };
export const resetPackTab = (): void => { sub = ''; };

const num = (n: number): string => n.toLocaleString('en-US');

/* ── 구성 칸 — 정사각 칸 안에 그림 + 오른쪽 아래 수량(.qty). 소유로 들어오는 것은 금 테두리. 구매 창 · 특가 창은 칸 아래 이름까지 ── */
type Cell = [art: GoodsId, name: string, qty: string, own?: boolean];

const sqHtml = ([art, , qty, own]: Cell): string =>
  `<span class="pk-sq${own ? ' own' : ''}">${goods(art)}${qty ? `<b class="qty">${qty}</b>` : ''}</span>`;

const gridHtml = (cells: Cell[]): string =>
  `<span class="pk-grid${cells.length === 1 ? ' one' : ''}">${cells.map((c) => `<span class="pk-cell">${sqHtml(c)}<span class="pk-n">${c[1]}</span></span>`).join('')}</span>`;

/** 패널 구성 줄 — 칸만 보이고 낭독은 이름까지 */
const stripHtml = (cells: Cell[]): string =>
  `<span class="pk-strip" role="img" aria-label="${escapeHtml(cells.map(([, n, q]) => `${n} ${q}`.trim()).join(', '))}">${cells.map(sqHtml).join('')}</span>`;

const ITEM: Record<KitId, [GoodsId, string]> = { life: ['life', '목숨'], waza: ['waza', '필살'], dust2x: ['dust2x', '먼지 2배'] };

/** 소유로 들어오는 것 — 긴 목록은 한 칸으로 줄인다 */
const OWNS: Partial<Record<SkuId, Cell[]>> = {
  rookie_pack: [['coverall', '작업복', '', true]],
  rookie_sale: [['coverall', '작업복', '', true]],
  knight_set: [['look', '꾸미기', '2', true]],
  king_set: [['swords', '무기', '전부', true], ['look', '꾸미기', '전부', true]],
};

const maskArt = (n: number): GoodsId => (n >= 10 ? 'mask10' : n >= 3 ? 'mask3' : 'mask1');

/** 특근 수당 — 오늘 사면 받을 수 있는 특근 줄 몫 */
function passCells(r: Reward): Cell[] {
  const c: Cell[] = [];
  if (r.owns?.length) c.push(['look', '꾸미기', String(r.owns.length), true]);
  if (r.orbit) c.push(['orb', '궤도조각', num(r.orbit)]);
  const kit = KIT_IDS.reduce((n, k) => n + (r.items?.[k] ?? 0), 0);
  if (kit) c.push(['toolbox', '장비', String(kit)]);
  if (r.masks) c.push([maskArt(r.masks), '마스크', `${r.masks}개`]);
  return c;
}

function cellsOf(sku: Sku, bought: readonly string[], pass: Reward = {}): Cell[] {
  if (sku.pass) return passCells(pass);
  const c: Cell[] = [];
  if (sku.orbit) c.push(['orb', '궤도조각', num(orbitOf(sku, bought))]);
  if (sku.dust) c.push(['dust', '먼지', num(dustOf(sku, bought))]);
  for (const k of KIT_IDS) if (sku.items?.[k]) c.push([ITEM[k][0], ITEM[k][1], String(sku.items[k])]);
  c.push(...(OWNS[sku.id] ?? []));
  if (sku.masks) c.push([maskArt(sku.masks), '마스크', `${sku.masks}개`]);
  if (sku.noAds) c.push(['noads', '광고 없음', '', true]);
  return c.sort((a, b) => Number(!!b[3]) - Number(!!a[3])); // 소유물이 맨 앞
}

/** 월급 봉투 — 구매 즉시 몫과 매일 몫 */
const salaryNow = (sku: Sku): Cell[] => [['orb', '궤도조각', num(sku.orbit ?? 0)], ['noads', '광고 없음', `${SALARY_DAYS}일`, true]];
const salaryDaily = (): Cell[] => [
  ['orb', '궤도조각', String(SALARY_DAILY.orbit)],
  ...KIT_IDS.filter((k) => SALARY_DAILY.items[k]).map((k): Cell => [ITEM[k][0], ITEM[k][1], String(SALARY_DAILY.items[k])]),
];
const tierHtml = (label: string, body: string): string => `<span class="pk-tier"><span class="pk-tl">${label}</span>${body}</span>`;
const NOW_LABEL = '구매 즉시';
const DAILY_LABEL = `매일 · ${SALARY_DAYS}일`;

/** 구매 확인 창 · 특가 창이 쓴다 — 받는 것 전부를 이름 있는 격자로 */
export function partsHtml(sku: Sku, bought: readonly string[], pass?: Reward): string {
  const body = sku.salary
    ? `<span class="pk-tiers">${tierHtml(NOW_LABEL, gridHtml(salaryNow(sku)))}${tierHtml(DAILY_LABEL, gridHtml(salaryDaily()))}</span>`
    : gridHtml(cellsOf(sku, bought, pass));
  return `<span class="pk-parts">${body}</span>`;
}

/* ── 도화선 — 남은 비율만큼 먹 심지가 남고 끝에 불꽃. 1초마다 armFuses가 태운다 ── */
const FUSE_D = 'M6 21 C28 6 44 28 72 16 S118 4 140 16 S158 23 164 12';

export function fuseHtml(until: number, span: number): string {
  return `<span class="fuse" role="timer" aria-label="남은 시간" data-until="${until}" data-span="${span}">`
    + `<svg viewBox="0 0 170 30" aria-hidden="true"><path class="fuse-burnt" d="${FUSE_D}"/><path class="fuse-live" pathLength="100" d="${FUSE_D}"/>`
    + '<path class="fuse-fl" d="M0 -11 C5 -5 6 1 0 7 C-6 1 -5 -5 0 -11 Z"/></svg>'
    + `<b class="fuse-t">${clockText(until, Date.now())}</b></span>`;
}

let fuseTimer = 0;

function burn(): void {
  const fuses = document.querySelectorAll<HTMLElement>('.fuse');
  if (!fuses.length) { clearInterval(fuseTimer); fuseTimer = 0; return; }
  const now = Date.now();
  for (const f of fuses) {
    if (!f.offsetParent) continue; // 숨은 화면 — 보일 때 armFuses가 다시 부른다
    const until = Number(f.dataset.until), span = Number(f.dataset.span);
    if (!Number.isFinite(until) || !(span > 0)) continue;
    const left = fuseLeft({ until, span }, now);
    const live = f.querySelector<SVGPathElement>('.fuse-live');
    const fl = f.querySelector<SVGPathElement>('.fuse-fl');
    const t = f.querySelector('.fuse-t');
    const text = clockText(until, now);
    if (t && t.textContent !== text) t.textContent = text;
    if (live) {
      live.style.strokeDashoffset = String(100 * (1 - left));
      live.style.strokeOpacity = left > 0 ? '1' : '0'; // 0이면 둥근 끝이 점으로 남는다
    }
    const burnt = f.querySelector<SVGPathElement>('.fuse-burnt');
    if (fl && burnt?.getPointAtLength) {
      const p = burnt.getPointAtLength(burnt.getTotalLength() * left);
      fl.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
      fl.classList.add('on');
    }
  }
}

/** 도화선을 1초마다 태운다. 화면에 도화선이 없어지면 스스로 멈춘다. 여러 번 불러도 타이머는 하나 */
export function armFuses(_root: ParentNode): void {
  burn();
  if (!fuseTimer && document.querySelector('.fuse')) fuseTimer = window.setInterval(burn, 1000);
}

/* ── 패널 — 상품 하나 ── */
interface PanelOpt { eff: number; was?: string; fuse?: { until: number; span: number }; goods?: Reward }

/** 효율 인장 — 문턱 밑이어도 여기서만 나는 것이 있으면 「전용」 */
export function effHtml(eff: number, only = false): string {
  if (eff > 0) return `<span class="pk-stamp seal"><small>효율</small><b class="n">${eff}%</b></span>`;
  return only ? '<span class="pk-stamp seal"><b>전용</b></span>' : '';
}

/** 도장 쪽지 — 결제 단추 구석 */
const tipHtml = (sku: Sku): string => `<i class="pk-tip" aria-hidden="true">도장 ${stampsOf(sku.krw)}</i>`;

function panelHtml(id: SkuId, title: string, price: string, bought: readonly string[], o: PanelOpt): string {
  const sku = skuById(id);
  if (!sku) return '';
  const pay = `<div class="pk-pay">
        ${o.was ? `<span class="pk-was">정가 <s>${escapeHtml(o.was)}</s></span>` : ''}
        <span class="pk-b"><button type="button" class="btn pay lg pk-buy" data-shop-sku="${id}" aria-label="${escapeHtml(title)} ${escapeHtml(price)}">${escapeHtml(price)}</button>${tipHtml(sku)}</span>
      </div>`;
  // 패널이 화면보다 높으면 단추가 밀린다 — 표지는 낮게, 단추는 구성 칸 옆에. 월급은 구매 즉시 줄 옆에 단추, 밑에 매일 줄
  const deal = sku.salary
    ? `<div class="pk-deal">${tierHtml(NOW_LABEL, stripHtml(salaryNow(sku)))}${pay}</div>${tierHtml(DAILY_LABEL, stripHtml(salaryDaily()))}`
    : `<div class="pk-deal">${stripHtml(cellsOf(sku, bought, o.goods))}${pay}</div>`;
  return `<article class="pk-panel">
      <div class="pk-top${o.fuse ? ' fused' : ''}">
        <div class="pk-scene" data-scene="${id}"></div>
        <h3 class="pk-title">${escapeHtml(title)}</h3>
        ${effHtml(o.eff, !!OWNS[id])}
        ${o.fuse ? fuseHtml(o.fuse.until, o.fuse.span) : ''}
      </div>
      ${deal}
    </article>`;
}

/* ── 세로 줄 — 마스크 ── */
function rowHtml(r: PackRow, art: GoodsId, big: string, tier: number): string {
  const sku = skuById(r.sku);
  return `<button type="button" class="pk-row t${tier}" data-shop-sku="${r.sku}" aria-label="${escapeHtml(r.title)} ${escapeHtml(r.price)}">
      <span class="pk-rart">${goods(art)}</span>
      <span class="pk-rbig"><b class="pk-bigq">${big}</b></span>
      <span class="pk-b"><span class="btn pay">${escapeHtml(r.price)}</span>${sku ? tipHtml(sku) : ''}</span>
    </button>`;
}

/* ── 재화 판 — 두 열 세 줄. 왼쪽 궤도조각 · 오른쪽 먼지, 가로 줄은 같은 값. 카드 전체가 누름 칸 ── */
const COIN_SKUS = ['orbit_s', 'dust_s', 'orbit_m', 'dust_m', 'orbit_l', 'dust_l'] as const;
const MASK_SKUS = ['mask_1', 'mask_3', 'mask_10'] as const;

function coinHtml(r: PackRow, sku: Sku, bought: readonly string[]): string {
  const at = COIN_SKUS.indexOf(r.sku as (typeof COIN_SKUS)[number]);
  const n = sku.orbit ?? sku.dust ?? 0;
  const coin: GoodsId = sku.orbit ? 'orb' : 'dust';
  const first = firstLeft(sku, bought);
  return `<button type="button" class="pk-coin t${(at >> 1) + 1}" data-shop-sku="${r.sku}" aria-label="${escapeHtml(r.title)} ${num(n)}${first ? `, 처음 ${num(n)} 더` : ''}, ${escapeHtml(r.price)}">
      <span class="pk-cart">${moonArt(601 + at)}${goods(skuGoods(r.sku))}</span>
      ${first ? `<span class="pk-plus"><small>처음</small><b>${goods(coin)}+${num(n)}</b></span>` : ''}
      <span class="pk-cq">${goods(coin)}${num(n)}</span>
      <span class="pk-b"><span class="btn pay">${escapeHtml(r.price)}</span>${tipHtml(sku)}</span>
    </button>`;
}

const heading = (title: string): string => `<header class="pk-head"><h3 class="pk-title">${title}</h3></header>`;

/** 시작 장비 — 궤도조각으로 사기. 결제 없이도 보인다 */
function kitBody(v: PackView): string {
  const rows = KITS.map((k, i) => `<div class="pk-row t${i + 1}">
      <span class="pk-rart">${goods(ITEM[k.id][0])}</span>
      <span class="pk-rbig"><b class="pk-kn">${k.name}</b><span>보유 ${v.items[k.id]}</span></span>
      <button type="button" class="btn" data-kit-buy="${k.id}" aria-label="${k.name} 사기, 궤도조각 ${k.orbit}"${v.orbit >= k.orbit ? '' : ' disabled'}><span class="cur">${glyph('orb')}${k.orbit}</span></button>
    </div>`).join('');
  return `${heading('시작 장비')}<div class="pk-rows">${rows}</div>`;
}

/* ── 맨 위 고정 묶음 ── */

/** 첫 결제 선물 — 눌러도 동작 없음. 인주 칼빛을 금 테두리 칸에 */
function giftHtml(): string {
  const art = playerArt({ weapon: 'sword', body: 'ink', blade: 'inju', pose: 'special' });
  return `<div class="pk-gift"><span class="pk-sq own">${art ? `<img class="pk-gimg" src="${art}" alt="" draggable="false">` : ''}</span>`
    + `<span class="pk-gt"><b>첫 결제 선물</b><span>궤도조각 ${FIRST_GIFT.orbit} · 칼빛 인주</span></span></div>`;
}

/** 공짜 커피 — 결제 없는 웹에서도 보인다 */
function coffeeHtml(on: boolean): string {
  return `<div class="pk-free"><span class="pk-sq">${goods('coffee')}</span>`
    + `<span class="pk-fm"><b>믹스커피</b><span class="cur">${glyph('dust')}먼지 ${FREE_COFFEE.dust}</span></span>`
    + `${on ? '<button type="button" class="btn cta sm" data-shop-coffee="1">받기</button>' : '<span class="pk-later">내일 또</span>'}</div>`;
}

type StepReward = (typeof REGULAR_STEPS)[number]['reward'];

const rewardText = (r: StepReward): string => [
  r.orbit && `궤도조각 ${r.orbit}`,
  ...(r.owns ?? []).map((id) => LOOK_EARNED[id]?.name ?? id),
  r.masks && `마스크 ${r.masks}`,
].filter(Boolean).join(' · ');

/** 단골 도장판 — 카페 쿠폰처럼 한 줄 열 칸. 보상이 걸린 칸은 그림 */
function regularHtml(r: Regular): string {
  const next = REGULAR_STEPS[r.got];
  if (!next) return '<div class="pk-reg done"><span class="seal ink"><b>단골</b></span></div>';
  const start = next.at > 10 ? 10 : 0; // 20칸 단계는 11~20번 칸
  const cols: string[] = [];
  const cells = Array.from({ length: 10 }, (_, i) => {
    const no = start + i + 1;
    const step = REGULAR_STEPS.findIndex((s) => s.at === no);
    const on = r.stamps >= no ? ' on' : '';
    if (step < 0) { cols.push('1fr'); return `<span class="pk-st${on}">${no}</span>`; }
    const rw = REGULAR_STEPS[step].reward;
    const own = !!rw.owns?.length;
    cols.push('1.8fr');
    return `<span class="pk-st gift${own ? ' own' : ''}${step < r.got ? ' got' : ''}">${goods(own ? 'look' : rw.masks ? 'mask3' : 'orb3')}</span>`;
  });
  const ready = regularReady(r) >= 0;
  return `<div class="pk-reg"><b class="pk-rh">단골 도장</b>`
    + `<div class="pk-sts" style="--cols:${cols.join(' ')}">${cells.join('')}</div>`
    + `<div class="pk-rn"><span>${next.at}칸 · ${rewardText(next.reward)}</span>`
    + `${ready ? '<button type="button" class="btn cta sm" data-shop-regular="1">받기</button>' : ''}</div></div>`;
}

/** body는 고른 탭만 그린다 — 장면 하나가 저사양에서 수백 ms라 한꺼번에 찍으면 첫 열기가 멈춘다 */
interface Tab { id: string; name: string; art: GoodsId; dot?: boolean; on: boolean; body: () => string }

function tabsOf(v: PackView): Tab[] {
  const kit: Tab = { id: 'kit', name: '장비', art: 'life', on: true, body: () => (v.iap ? '' : `<div class="pk-fix">${coffeeHtml(v.coffeeOn)}</div>`) + kitBody(v) };
  if (!v.iap) return [kit];
  const row = new Map(v.rows.map((r) => [r.sku, r]));
  const has = (...ids: SkuId[]): boolean => ids.some((id) => row.has(id));
  const listed = (ids: readonly SkuId[]): PackRow[] => ids.map((id) => row.get(id)).filter((r): r is PackRow => !!r);
  const panels = (...ids: SkuId[]): string =>
    listed(ids).map((r) => panelHtml(r.sku, r.title, r.price, v.bought, { eff: r.eff, goods: v.passGoods })).join('');
  const rows = (ids: SkuId[], make: (r: PackRow, sku: Sku, i: number) => string): string =>
    listed(ids).map((r, i) => {
      const sku = skuById(r.sku);
      return sku ? make(r, sku, i) : '';
    }).join('');
  const coins = (): string => rows([...COIN_SKUS], (r, sku) => coinHtml(r, sku, v.bought));
  const mask = (): string => rows([...MASK_SKUS], (r, sku, i) => rowHtml(r, maskArt(sku.masks ?? 1), `${sku.masks}개`, i + 1));
  // 첫 구매 두 배가 하나라도 남아 있을 때만 띠
  const doubled = COIN_SKUS.some((id) => { const s = skuById(id); return row.has(id) && !!s && firstLeft(s, v.bought); });
  const offers = (): string => v.offers.map((o) => panelHtml(o.sku, o.title, o.price, v.bought, {
    eff: o.eff, was: o.regular, fuse: { until: o.until, span: o.span },
  })).join('');
  const sold = new Set<SkuId>(v.offers.map((o) => o.of));
  const head = (...parts: string[]): string => (parts.some(Boolean) ? `<div class="pk-fix">${parts.join('')}</div>` : '');
  const regularDot = v.coffeeOn || regularReady(v.regular) >= 0;
  const tabs: Tab[] = [
    {
      id: 'hot', name: '추천', art: 'gift', dot: v.offers.length > 0, on: v.offers.length > 0 || v.firstGift || v.coffeeOn || has('rookie_pack', 'season_pass'),
      body: () => head(v.firstGift ? giftHtml() : '', v.coffeeOn ? coffeeHtml(true) : '') + offers() + panels(...(['rookie_pack', 'season_pass'] as const).filter((id) => !sold.has(id))),
    },
    { id: 'regular', name: '단골', art: 'envelope', dot: regularDot, on: true, body: () => head(coffeeHtml(v.coffeeOn), regularHtml(v.regular)) + panels('season_pass', 'salary', 'no_ads') },
    { id: 'set', name: '세트', art: 'crown', on: has('knight_set', 'king_set', 'toolbox'), body: () => panels('knight_set', 'king_set', 'toolbox') },
    {
      id: 'goods', name: '재화', art: 'orbSack', on: has(...COIN_SKUS, ...MASK_SKUS),
      body: () => (doubled ? '<div class="pk-top band"><div class="pk-scene" data-scene="coins"></div><h3 class="pk-title">첫 구매 2배</h3></div>' : '')
        + (has(...COIN_SKUS) ? `<div class="pk-coins">${coins()}</div>` : '')
        + (has(...MASK_SKUS) ? `${heading('마스크')}<div class="pk-rows">${mask()}</div>` : ''),
    },
    kit,
  ];
  return tabs.filter((t) => t.on);
}

/** 맨 아래 줄 — 구매 복원 + 구석 안내 단추 */
function legalHtml(): string {
  return `<div class="pk-legal"><button type="button" class="btn" data-shop-restore="1">구매 복원</button>${infoHtml([
    '결제는 Google Play로 처리해요. 전부 정해진 구성이고 뽑기는 없어요.',
    '표시된 가격에는 부가세가 포함돼 있어요.',
    `효율 = 구성품 값 ÷ 가격이에요. 구성품 값은 따로 파는 것만 더해요. 궤도조각은 대 묶음 단가(개당 ₩${ORBIT_WON.toFixed(1)}), 먼지도 대 묶음 단가(개당 ₩${DUST_WON.toFixed(1)}), 마스크는 10개 묶음 단가, 장비 · 꾸미기 · 무기는 상점 값으로 쳐요. 전용 꾸미기 · 월급의 광고 없음은 안 넣어요. 월급은 ${SALARY_DAYS}번 다 받았을 때, 특근은 매일 다 했을 때 값이에요.`,
    '궤도조각 · 먼지 묶음은 상품마다 첫 구매 한 번만 두 배예요.',
    `단골 도장은 ₩${num(WON_PER_STAMP)}마다 하나예요.`,
    ...BUY_NOTES,
  ])}</div>`;
}

export function packHtml(v: PackView): string {
  const tabs = tabsOf(v);
  const cur = tabs.find((t) => t.id === sub) ?? tabs[0];
  const bar = tabs.length > 1
    ? `<div class="pk-tabs" role="tablist" aria-label="꾸러미 칸">${tabs.map((t) =>
      `<button type="button" role="tab" aria-selected="${t === cur}" class="pk-tab${t === cur ? ' on' : ''}" data-pack-tab="${t.id}">${goods(t.art)}<span>${t.name}</span>${t.dot ? '<i class="pk-dot"></i>' : ''}</button>`).join('')}</div>`
    : '';
  return `<div class="pk">${bar}<div class="pk-view">${cur.body()}</div>${v.iap ? legalHtml() : ''}</div>`;
}

/** 특가 창 본문 — 장면 · 효율 인장 · 정가 → 특가 · 도화선 · 구성 칸 */
export function offerHtml(o: OfferRow, bought: readonly string[]): string {
  const sku = skuById(o.sku);
  if (!sku) return '';
  return `<div class="pk-offer">
      <div class="pk-top sm">
        <div class="pk-scene">${packScene(o.of)}</div>
        ${effHtml(o.eff, !!OWNS[o.sku])}
      </div>
      <p class="pk-oprice"><span class="pk-was">정가 <s>${escapeHtml(o.regular)}</s></span><i aria-hidden="true">→</i><b>${escapeHtml(o.price)}</b></p>
      ${fuseHtml(o.until, o.span)}
      ${partsHtml(sku, bought)}
    </div>`;
}

/* ── 장면 지연 그리기 — 패널이 화면 근처(200px)에 오면 그때 찍는다. 장면 하나가 저사양에서 수백 ms ── */
let sceneIo: IntersectionObserver | null = null;

export function stopScenes(): void {
  sceneIo?.disconnect();
  sceneIo = null;
}

/** 다시 그린 뒤 부른다. after는 찍고 난 뒤(졸라맨 전역 상태 복구 — restoreLook)에 한 번 */
export function lazyScenes(root: ParentNode, after: () => void): void {
  stopScenes();
  const slots = root.querySelectorAll<HTMLElement>('.pk-scene[data-scene]');
  const paint = (el: HTMLElement): void => { el.innerHTML = packScene(el.dataset.scene ?? ''); };
  if (typeof IntersectionObserver === 'undefined') { slots.forEach(paint); if (slots.length) after(); return; }
  const io = new IntersectionObserver((entries) => {
    let n = 0;
    for (const e of entries) {
      const el = e.target as HTMLElement;
      if (!el.isConnected) { io.unobserve(el); continue; }
      if (!e.isIntersecting) continue;
      io.unobserve(el);
      paint(el);
      n++;
    }
    if (n) after();
  }, { rootMargin: '200px' });
  sceneIo = io;
  slots.forEach((el) => io.observe(el));
}
