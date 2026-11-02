// 상점 — 「먹 한 획」. 사기와 장착을 같이 하는 유일한 곳(옛 장비 탭을 합쳤다).
// 무기는 칼 그림이 주인: 고른 칼을 크게(획 순서대로 다시 그림) + 칼꽂이(연장 넷 · 대검 여덟). 필살·마스크·꾸미기는 판 속 졸라맨 그림 칸.
// 주홍은 화면에 하나 — 그리는 순서로 처음 만나는 살 수 있는 「사기」·「응시」. 나머지 살 것은 먹 획, 모자라면 옅은 먹 획에 남은 양.
// 보유 = 먹 작은 도장 · 장착 중 = 먹 도장(못 누름) · 장착 = 먹 획. 먼지로 무기·마스크·응시, 궤도조각으로 필살·꾸미기.
// 탭 둘 — 「장비」(먼지 · 궤도조각으로 얻는 것, 기본) · 「꾸러미」(시작 장비 · 특가 · 결제, packView.ts). 결제는 꾸러미 탭 밖으로 안 나온다.

import './shop.css';
import { WEAPON } from '../config';
import {
  COSMETIC_ORBIT_COST, DEFAULT_OWNED_IDS, DUST_EXCHANGE, GREATSWORD_IDS, MASK_DUST_COST, ORBIT_PER_AD, WAZA_ORBIT_COST,
  WEAPON_DUST_COST, WEAPON_IDS, examStatus, licenseTitle, nextDustGoal, nextExam,
} from '../meta';
import type { Loadout, WeaponId } from '../meta';
import { MASK_MAX, SAMPLE_MASK, wornMask, wornMaskId } from '../meta/mask';
import type { MaskEntry } from '../meta/types';
import { FX_SLOTS, WEAPON_TIER, filledSlots } from '../meta/tier';
import { FX_SLOT_COPY, TIER_COPY, WAZA_COPY, WEAPON_COPY } from '../content/world';
import { SCREENS } from '../content/screens';
import { skuById } from '../meta/catalog';
import { LOOK_EARNED, slotOf } from '../meta/loadout';
import { armFuses, lazyScenes, packHtml, stopScenes, resetPackTab, setPackTab, type PackView } from './packView';
import { escapeHtml } from './html';
import { ICON } from './icons';
import { auraSvg, countTo, flashSvg, fmt, glyph, reduceMotion, swordSvg } from './ink';
import { lettersArt, maskedArt, playerArt, restoreLook, wazaArt } from './shopArt';

type Pay = 'dust' | 'orbit';
type Slot = keyof Loadout;

interface Item {
  id: string;
  slot: Slot;
  name: string;
  cost: number;
  pay: Pay;
  /** 큰 칼 위 작은 이름표(무기 · 대검) */
  kind?: string;
  /** 파는 물건이 아니다 — 꾸러미 · 실적으로만 들어오고, 가진 뒤에만 보인다 */
  how?: string;
}

const GREAT = new Set<string>(GREATSWORD_IDS);

/** 무기 열둘 — 대검은 이름표가 「대검」이라 이름은 앞말만 */
const WEAPONS: readonly Item[] = WEAPON_IDS.map((id) => ({
  id,
  slot: 'weapon',
  kind: GREAT.has(id) ? '대검' : '무기',
  name: WEAPON_COPY[id].name.replace(/ 대검$/, ''),
  cost: WEAPON_DUST_COST[id] ?? 0,
  pay: 'dust',
}));

const WAZA: readonly Item[] = (['tenchi', 'ageba', 'tetsu'] as const).map((id) => ({
  id, slot: 'waza', name: WAZA_COPY[id].name, cost: WAZA_ORBIT_COST, pay: 'orbit',
}));

/** 마스크 벗기 칸 */
const NO_MASK: Item = { id: 'none', slot: 'mask', name: '없음', cost: 0, pay: 'dust' };

const look = (slot: Slot, id: string, name: string): Item => ({ id, slot, name, cost: COSMETIC_ORBIT_COST, pay: 'orbit' });
const earned = Object.entries(LOOK_EARNED).map(([id, e]): Item => ({ id, slot: slotOf(id) as Slot, name: e.name, cost: 0, pay: 'orbit', how: e.how }));
/** 꾸미기 — 칸마다 기본 하나(되돌리기) + 살 것 둘 + 얻은 전용 꾸미기 */
const LOOKS: readonly { title: string; slot: Slot; items: readonly Item[] }[] = [
  { title: '졸라맨', slot: 'body', items: [look('body', 'ink', '먹물'), look('body', 'amber', '호박'), look('body', 'slate', '석판')] },
  { title: '칼빛', slot: 'blade', items: [look('blade', 'wire', '철사'), look('blade', 'rebar', '철근'), look('blade', 'crescent', '초승달')] },
  { title: '효과글자', slot: 'letters', items: [look('letters', 'flyer', '전단지'), look('letters', 'stamp', '도장'), look('letters', 'orbit', '궤도')] },
].map((g) => ({ ...g, slot: g.slot as Slot, items: [...g.items, ...earned.filter((it) => it.slot === g.slot)] }));

const ALL: readonly Item[] = [...WEAPONS, ...WAZA, NO_MASK, ...LOOKS.flatMap((g) => g.items)];

/** 무기 능력치 셋 — 막대 = 무기 전부 중 최댓값 대비, 오른쪽 숫자 = 실제 값(+ 장착 칼 대비 차이) */
const num = (n: number): string => String(Math.round(n * 100) / 100);
const STATS: readonly { key: 'reach' | 'lift' | 'gauge'; label: string; show: (n: number) => string }[] = [
  { key: 'reach', label: '사거리', show: num },
  { key: 'lift', label: '띄우기', show: num },
  { key: 'gauge', label: '필살', show: (n) => `×${num(n)}` },
];

/** 등급 꼬리표 — 일반 맨글씨 · 고급 굵게 · 희귀 먹 테두리 상자 · 전설 뒤집힌 먹 상자(모양은 shop.css .sh-tier) */
const tierTag = (id: string): string => {
  const t = WEAPON_TIER[id as WeaponId];
  return `<span class="sh-tier t-${t}">${TIER_COPY[t]}</span>`;
};

/** 전설 칼 순서 — 칸마다 섬광 박자를 어긋나게 */
const LEGEND = WEAPON_IDS.filter((w) => WEAPON_TIER[w] === 'legend');

/** 칼꽂이 칼 기울기 — 같은 줄이 자로 잰 듯 서지 않게 */
const TILT = [-3, 2, -2, 3, -4, 3, -2, 2, 3, -3, 1, -4];

/** 산 순간 도장 둘레 먹 튐 넷 */
const SPLASH = [[-24, -16], [26, -12], [-18, 20], [22, 18]]
  .map(([x, y]) => `<i class="spl" style="--tx:${x}px;--ty:${y}px"></i>`).join('');

export type CardState = 'owned' | 'ok' | 'short';

/** 칸 상태 — 보유가 먼저, 그다음 지갑 */
export function cardState(has: boolean, wallet: number, cost: number): CardState {
  if (has) return 'owned';
  return wallet >= cost ? 'ok' : 'short';
}

/** 상점이 읽는 지갑 + 철거 자격 현황 + 장착(그림 되돌리기·장착 표시) */
export interface ShopInv {
  dust: number;
  orbit: number;
  /** 철거 자격 등급 0~3 */
  license: number;
  /** 평생 누적 철거 건물 수 */
  buildings: number;
  loadout: Loadout;
  /** 도트판 그림(저장 maskArt) — 고른 가면의 그림 */
  maskArt: string;
  /** 내 가면 목록(만든 순서)과 고른 가면 id — 저장의 masks · maskId */
  masks?: readonly MaskEntry[];
  maskId?: string;
  /** 새로 그릴 수 있는 마스크 수 */
  blanks?: number;
}

export interface ShopHandlers {
  /** 공짜 커피 한 잔 */
  onCoffee(): void;
  /** 단골 도장 다음 칸 받기 */
  onRegular(): void;
  /** 철거 자격 응시 */
  onExam(): void;
  onBuy(skuId: string): void;
  onAdPack(): void;
  onOrbit(id: string): void;
  /** 먼지로 사는 것(무기·마스크) — economy dustCost */
  onDust(id: string): void;
  onExchange(): void;
  /** 산 것·기본 품목 장착 */
  onEquip(slot: string, id: string): void;
  /** 산 마스크의 「그리기」 — 도트판을 연다 */
  onMaskEdit(): void;
  /** 시작 장비를 궤도조각으로 산다 */
  onKitBuy(id: string): void;
  /** 끝나지 않았거나 재설치로 잃은 구매를 되찾는다 */
  onRestore(): void;
}

/** 방금 「사기」를 누른 품목 — 다음 그리기에서 보유로 바뀌었으면 도장을 쿵 찍는다 */
let pendingBuy: string | null = null;
/** 큰 칼로 보이는 무기 — 화면을 떠났다 와도 남는다 */
let picked: WeaponId | null = null;
/** 칼꽂이를 눌러 다시 그리는 중 — 등장 안무는 쉬고 큰 칼만 다시 그린다 */
let selecting = false;
/** 지난 그리기의 지갑 — 산 순간 여기서부터 숫자를 굴린다 */
let lastWallet: { dust: number; orbit: number } | null = null;

export type ShopTab = 'gear' | 'pack';
export interface ShopPaths {
  ad: boolean;
  adLeft: number;
  /** 광고 없는 현장 — 광고 단추가 바로 받기가 된다 */
  adFree: boolean;
}
/** 지금 탭 — 다시 그려도 남고, 상점을 새로 열면 장비로 돌아간다(showShop이 정한다) */
let tab: ShopTab = 'gear';

export function paintShop(
  root: HTMLElement,
  inv: ShopInv,
  owned: ReadonlySet<string>,
  paths: ShopPaths,
  pack: PackView,
  h: ShopHandlers,
  openTab?: ShopTab,
): void {
  if (openTab) { tab = openTab; resetPackTab(); }
  const fresh = pendingBuy;
  pendingBuy = null;
  const sel = selecting;
  selecting = false;
  const l = inv.loadout;
  const has = (id: string): boolean => owned.has(id) || DEFAULT_OWNED_IDS.includes(id);
  const stateOf = (it: Item): CardState => cardState(has(it.id), inv[it.pay], it.cost);
  const goal = nextDustGoal([...owned], inv.dust);
  if (!picked) picked = (goal && WEAPONS.some((w) => w.id === goal.id) ? goal.id : l.weapon) as WeaponId;

  // 주홍은 화면에 하나 — 그리는 순서로 처음 만나는 「사기」·「응시」
  let mainLeft = true;
  const takeMain = (ok: boolean): boolean => {
    if (!ok || !mainLeft) return false;
    mainLeft = false;
    return true;
  };

  // 장비 칸 그림은 장비 탭일 때만 찍는다 — 꾸러미 탭에서 쓸데없이 찍으면 첫 열기가 느려진다(아래 템플릿에서 부른다)
  const hero = (): string => heroHtml(WEAPONS.find((w) => w.id === picked) ?? WEAPONS[0], stateOf, inv, fresh, takeMain, goal?.id ?? null);
  const rack = (items: readonly Item[], from: number): string =>
    items.map((it, i) => rackCell(it, stateOf(it), it.id === picked, l.weapon === it.id, fresh === it.id, inv, from + i)).join('');
  const tools = WEAPONS.filter((w) => !GREAT.has(w.id));
  const greats = WEAPONS.filter((w) => GREAT.has(w.id));

  /** 그림 칸 하나(필살 · 마스크 · 꾸미기) */
  const cell = (it: Item, art: string, wide = false): string => {
    const st = stateOf(it);
    const on = l[it.slot] === it.id;
    const base = DEFAULT_OWNED_IDS.includes(it.id);
    const price = base ? '기본' : it.how ? escapeHtml(it.how) : `${glyph(it.pay === 'dust' ? 'dust' : 'orb')}${fmt(it.cost)}`;
    const badge = st === 'owned' && !on && !base ? ownStamp(fresh === it.id, 'sh-badge') : '';
    return `<div class="sh-it${wide ? ' wide' : ''} is-${st}">
      <div class="sh-art">${art ? `<img src="${art}" alt="" draggable="false">` : ''}${badge}</div>
      <p class="sh-name">${escapeHtml(it.name)}</p>
      <p class="sh-price">${price}</p>
      <div class="sh-acts">${actHtml(it, st, on, takeMain, inv)}</div>
    </div>`;
  };

  const look3 = { weapon: l.weapon, body: l.body, blade: l.blade };
  const waza = (): string => WAZA.map((it) => cell(it, wazaArt(it.id, look3))).join('');
  // 가진 가면들 + 「새 마스크」 + 「없음」. 남은 장이 없으면 「새 마스크」가 사기 칸이 된다(견본을 씌워 보인다)
  const masks = inv.masks ?? [];
  const blanks = inv.blanks ?? 0;
  const wornId = wornMaskId({ loadout: l, maskId: inv.maskId ?? '' });
  const maskCard = (m: MaskEntry): string => {
    const on = wornId === m.id;
    const acts = (on ? '<span class="seal ink sh-on"><b>장착 중</b></span>'
      : `<button type="button" class="stroke s3 sh-act" data-equip-slot="mask" data-equip-id="${m.id}"><b>장착</b></button>`)
      + `<button type="button" class="stroke s3 sh-act sh-draw" data-equip-slot="mask-edit" data-equip-id="${m.id}" aria-label="${escapeHtml(m.name)} 그리기"><b>그리기</b></button>`;
    return `<div class="sh-it is-owned">
      <div class="sh-art"><img src="${maskedArt(look3, wornMask(m.art))}" alt="" draggable="false"></div>
      <p class="sh-name uname">${escapeHtml(m.name)}</p>
      <div class="sh-acts sh-col">${acts}</div>
    </div>`;
  };
  const packLink = pack.iap ? '<button type="button" class="stroke s3 sh-act" data-shop-tab="pack"><b>꾸러미</b></button>' : '';
  const newCard = (): string => masks.length >= MASK_MAX ? '' : blanks > 0 ? `<div class="sh-it is-owned">
      <div class="sh-art sh-new" aria-hidden="true">${ICON.plus}</div>
      <p class="sh-name">새 마스크</p>
      <p class="sh-price">남은 ${blanks}개</p>
      <div class="sh-acts"><button type="button" class="stroke s3 sh-act" data-equip-slot="mask-new" data-equip-id="new"><b>만들기</b></button></div>
    </div>` : `<div class="sh-it">
      <div class="sh-art"><img src="${maskedArt(look3, SAMPLE_MASK)}" alt="" draggable="false"></div>
      <p class="sh-name">새 마스크</p>
      <p class="sh-price">${glyph('dust')}${fmt(MASK_DUST_COST)}</p>
      <div class="sh-acts sh-col"><button type="button" class="stroke s3 sh-act" data-equip-slot="mask-buy" data-equip-id="new" aria-label="마스크 1개 사기, 먼지 ${fmt(MASK_DUST_COST)}"${inv.dust < MASK_DUST_COST ? ' disabled' : ''}><b>사기</b></button>${packLink}</div>
    </div>`;
  const mask = (): string => masks.map(maskCard).join('') + newCard() + cell(NO_MASK, playerArt({ ...look3, pose: 'idle' }));
  const looks = (): string => LOOKS.map((g) => `<p class="sh-sub">${g.title}</p><div class="sh-grid">${g.items.filter((it) => !it.how || has(it.id)).map((it) => cell(it, lookArt(it, l))).join('')}</div>`).join('');
  const exam = (): string => examHtml(inv, takeMain);

  const canExchange = inv.dust >= DUST_EXCHANGE.dust;
  // 웹(광고 미배선)에선 광고 칸을 아예 안 그린다 — 무료 지급 위장 금지 (08-30, P0-2)
  const earn = `<div class="sh-earn">
      ${paths.ad ? `<button type="button" class="stroke s2" data-shop-ad="1"${paths.adLeft > 0 ? '' : ' disabled'}><b>${paths.adFree ? '받기' : '광고'}</b><span>궤도조각 +${ORBIT_PER_AD}<br>오늘 ${paths.adLeft}번</span></button>` : ''}
      <button type="button" class="stroke s2" data-shop-exchange="1"${canExchange ? '' : ' disabled'}><b>바꾸기</b><span>먼지 ${DUST_EXCHANGE.dust} →<br>궤도조각 ${DUST_EXCHANGE.orbit}</span></button>
    </div>`;

  const from = fresh && lastWallet ? lastWallet : inv;
  const wasFocus = (document.activeElement as HTMLElement | null)?.dataset?.sel;

  root.innerHTML = `<div class="sh${sel ? ' sel' : ''}">
    <header class="sh-top">
      <h2 class="meta-title sh-title">상점</h2>
      <p class="sh-wallet">
        <span class="cur" aria-label="먼지 ${fmt(inv.dust)}">${glyph('dust')}먼지 <b data-w="dust">${fmt(from.dust)}</b></span>
        <span class="cur" aria-label="궤도조각 ${fmt(inv.orbit)}">${glyph('orb')}궤도조각 <b data-w="orbit">${fmt(from.orbit)}</b></span>
      </p>
    </header>
    <div class="sh-tabs" role="tablist" aria-label="상점 칸">
      <button type="button" role="tab" aria-selected="${tab === 'gear'}" class="tag sh-tab${tab === 'gear' ? ' on' : ''}" data-shop-tab="gear">장비</button>
      <button type="button" role="tab" aria-selected="${tab === 'pack'}" class="tag sh-tab${tab === 'pack' ? ' on' : ''}" data-shop-tab="pack">꾸러미</button>
    </div>
    ${tab === 'pack' ? packHtml(pack) : `${wornHtml(l, inv)}
    ${hero()}
    <h3 class="sh-grp">무기</h3>
    <div class="sh-rack tools">${rack(tools, 0)}</div>
    <h3 class="sh-grp">대검</h3>
    <div class="sh-rack">${rack(greats, tools.length)}</div>
    <h3 class="sh-grp">필살 <small>궤도조각</small></h3>
    <div class="sh-grid">${waza()}</div>
    ${earn}
    <h3 class="sh-grp">마스크 <small>${masks.length}개</small></h3>
    <div class="sh-grid">${mask()}</div>
    <h3 class="sh-grp">꾸미기 <small>궤도조각</small></h3>
    ${looks()}
    <h3 class="sh-grp">${SCREENS.license.heading} <small>${escapeHtml(licenseTitle(inv.license))}</small></h3>
    ${exam()}`}
  </div>`;

  restoreLook(l); // 찍기가 바꾼 졸라맨 전역 상태를 장착대로 — 뒤 화면 졸라맨이 미리보기 색을 입고 남지 않게
  if (fresh && lastWallet) {
    countTo([root.querySelector<HTMLElement>('[data-w="dust"]')!], lastWallet.dust, inv.dust, 650);
    countTo([root.querySelector<HTMLElement>('[data-w="orbit"]')!], lastWallet.orbit, inv.orbit, 650);
  }
  lastWallet = { dust: inv.dust, orbit: inv.orbit };
  if (tab === 'pack') { armFuses(root); lazyScenes(root, () => restoreLook(l)); } else stopScenes();
  if (wasFocus) root.querySelector<HTMLElement>(`[data-sel="${wasFocus}"]`)?.focus({ preventScroll: true });

  root.onclick = (e) => {
    const t = (e.target as HTMLElement).closest('[data-sel],[data-shop-sku],[data-shop-ad],[data-orbit-id],[data-dust-id],[data-shop-exchange],[data-shop-exam],[data-equip-id],[data-shop-tab],[data-pack-tab],[data-kit-buy],[data-shop-restore],[data-shop-coffee],[data-shop-regular]') as HTMLButtonElement | null;
    if (!t || t.disabled) return;
    e.preventDefault();
    const next = t.getAttribute('data-shop-tab') as ShopTab | null;
    if (next) {
      if (next === tab) return;
      paintShop(root, inv, owned, paths, pack, h, next);
      root.scrollTop = 0;
      return;
    }
    const sub = t.getAttribute('data-pack-tab');
    if (sub) {
      setPackTab(sub);
      paintShop(root, inv, owned, paths, pack, h);
      return;
    }
    const kit = t.getAttribute('data-kit-buy');
    if (kit) { h.onKitBuy(kit); return; }
    if (t.hasAttribute('data-shop-restore')) { h.onRestore(); return; }
    if (t.hasAttribute('data-shop-coffee')) { h.onCoffee(); return; }
    if (t.hasAttribute('data-shop-regular')) { h.onRegular(); return; }
    const pick = t.getAttribute('data-sel');
    if (pick) {
      if (pick === picked) return;
      picked = pick as WeaponId;
      selecting = true;
      paintShop(root, inv, owned, paths, pack, h);
      // 목록을 내린 채 고르면 큰 칼이 붙어 있는 머리 밑에 가린다 — 가렸으면 머리 바로 아래로 끌어온다
      const top = root.querySelector('.sh-top');
      const hero = root.querySelector('.sh-hero');
      if (top && hero) {
        const gap = hero.getBoundingClientRect().top - top.getBoundingClientRect().bottom;
        const k = root.getBoundingClientRect().height / (root.offsetHeight || 1); // 무대 배율(화면 px → 무대 px)
        if (gap < 0) root.scrollBy({ top: gap / k, behavior: reduceMotion() ? 'auto' : 'smooth' });
      }
      return;
    }
    if (t.hasAttribute('data-shop-exam')) { h.onExam(); return; }
    const eid = t.getAttribute('data-equip-id');
    const slot = t.getAttribute('data-equip-slot');
    if (eid && slot) { h.onEquip(slot, eid); return; }
    const did = t.getAttribute('data-dust-id');
    if (did) {
      if (!has(did)) { pendingBuy = did; h.onDust(did); }
      return;
    }
    if (t.hasAttribute('data-shop-exchange')) { h.onExchange(); return; }
    if (t.hasAttribute('data-shop-ad')) { h.onAdPack(); return; }
    const oid = t.getAttribute('data-orbit-id');
    if (oid) {
      if (!has(oid)) { pendingBuy = oid; h.onOrbit(oid); }
      return;
    }
    const id = t.getAttribute('data-shop-sku');
    if (id && skuById(id)) h.onBuy(id);
  };
}

/** 지금 장착 — 여섯 칸 이름을 먹 쪽지로 한 줄에 */
function wornHtml(l: Loadout, inv: ShopInv): string {
  const name = (slot: Slot): string => ALL.find((it) => it.slot === slot && it.id === l[slot])?.name ?? '';
  const weapon = WEAPON_COPY[l.weapon as WeaponId]?.name ?? '';
  const mask = l.mask === 'mask' ? inv.masks?.find((m) => m.id === inv.maskId)?.name ?? '' : '';
  // 가면 이름은 사용자가 친 글자라 서브셋 글꼴이 아니라 시스템 글꼴(.uname)로 통째로 그린다
  const tags = [[weapon], [name('waza')], [mask, ' uname'], [name('body')], [name('blade')], [name('letters')]]
    .filter(([n]) => n).map(([n, c]) => `<span class="tag${c ?? ''}">${escapeHtml(n)}</span>`).join('');
  return `<p class="sh-worn"><span class="sh-worn-h">장착 중</span>${tags}</p>`;
}

/** 큰 칼 — 고른 무기. 이름표 · 이름 · 값 · 막대 셋 · 할 일 */
function heroHtml(
  it: Item,
  stateOf: (it: Item) => CardState,
  inv: ShopInv,
  fresh: string | null,
  takeMain: (ok: boolean) => boolean,
  goal: string | null,
): string {
  const st = stateOf(it);
  const l = inv.loadout;
  const on = l.weapon === it.id;
  const base = DEFAULT_OWNED_IDS.includes(it.id);
  const price = base ? '<b>기본</b>' : `<b>${fmt(it.cost)}</b> 먼지`;
  const note = st === 'owned' && !on && !base
    ? ownStamp(fresh === it.id, 'sh-own')
    : goal === it.id && st !== 'owned' ? '<span class="sh-goal">다음 목표</span>' : '';
  const eq = l.weapon as WeaponId;
  const stats = STATS.map(({ key, label, show }, i) => {
    const max = Math.max(...WEAPON_IDS.map((w) => WEAPON[w][key]));
    const val = WEAPON[it.id as WeaponId][key];
    const d = it.id === eq ? 0 : Math.round((val - WEAPON[eq][key]) * 100) / 100;
    const diff = d ? `<span class="sh-d ${d > 0 ? 'up' : 'dn'}">${d > 0 ? '+' : '-'}${num(Math.abs(d))}</span>` : '<span class="sh-d"></span>';
    return `<div class="sh-stat" style="--i:${4 + i}"><span>${label}</span><span class="sh-bar" role="img" aria-label="${label} ${show(val)}"><i style="width:${Math.round((100 * val) / max)}%"></i></span><span class="sh-v">${show(val)}</span>${diff}</div>`;
  }).join('');
  const tier = WEAPON_TIER[it.id as WeaponId];
  const fill = filledSlots(tier);
  const fx = FX_SLOTS.map(({ id }) => `<span class="${fill.has(id) ? 'on' : 'off'}">${FX_SLOT_COPY[id]}</span>`).join('');
  const rareUp = tier === 'rare' || tier === 'legend';
  const art = (rareUp ? swordSvg(it.id, 'sh-ghost') : '') + swordSvg(it.id, 'sh-big', true)
    + (tier === 'legend' ? auraSvg('sh-aura') + flashSvg('sh-flash') : '');
  return `<section class="sh-hero t-${tier}" aria-label="${escapeHtml(WEAPON_COPY[it.id as WeaponId].name)}">
    ${art}
    <div class="sh-info">
      <p class="sh-kind" style="--i:0">${escapeHtml(it.kind ?? '')}${tierTag(it.id)}</p>
      <h3 class="sh-hname" style="--i:1">${escapeHtml(it.name)}</h3>
      <p class="sh-hprice" style="--i:2">${price}${note}</p>
      <p class="sh-desc" style="--i:3">${escapeHtml(WEAPON_COPY[it.id as WeaponId].desc)}</p>
      ${stats}
      <div class="sh-fx" style="--i:7">${fx}</div>
      <div class="sh-hact" style="--i:8">${actHtml(it, st, on, takeMain, inv, true)}</div>
    </div>
  </section>`;
}

/** 칼꽂이 칸 — 고르는 단추. 살 수 있음 = 받침 획 · 모자람 = 옅은 먹 + 「N 더」 쪽지 · 보유 · 장착 = 먹 도장 */
function rackCell(it: Item, st: CardState, sel: boolean, on: boolean, fresh: boolean, inv: ShopInv, i: number): string {
  const base = DEFAULT_OWNED_IDS.includes(it.id);
  const price = base ? '기본' : fmt(it.cost);
  const badge = on ? '<span class="sh-stampw sh-badge"><span class="seal ink"><small>장착</small></span></span>'
    : st === 'owned' && !base ? ownStamp(fresh, 'sh-badge') : '';
  const more = st === 'short' ? `<span class="tag sh-more">${fmt(it.cost - inv.dust)} 더</span>` : '';
  const stand = st === 'ok' ? '<svg class="sh-stand" viewBox="0 0 60 10" aria-hidden="true"><path d="M1 3 Q30 0 59 4 L58 8 Q30 10 2 7 Z"/></svg>' : '';
  const ring = sel ? '<svg class="sh-ring" viewBox="0 0 80 104" aria-hidden="true"><path d="M40 4 C70 2 80 30 76 60 C72 92 40 104 20 96 C2 88 0 50 8 28 C14 12 28 6 44 6"/></svg>' : '';
  const say = on ? '장착 중' : st === 'owned' ? '보유' : st === 'ok' ? `${price} 먼지` : `먼지 ${fmt(it.cost - inv.dust)} 더`;
  const tier = WEAPON_TIER[it.id as WeaponId];
  const ghost = tier === 'rare' ? swordSvg(it.id, 'sh-pic sh-gh') : '';
  const flash = tier === 'legend' ? '<svg class="sw sh-cflash" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="y" d="M0 100 Q50 56 100 0 Q54 74 0 100 Z"/></svg>' : '';
  const label = tier === 'common' ? '' : tierTag(it.id);
  return `<button type="button" class="sh-cell t-${tier} is-${st}" data-sel="${it.id}" aria-pressed="${sel}" aria-label="${escapeHtml(WEAPON_COPY[it.id as WeaponId].name)} ${TIER_COPY[tier]} ${say}" style="--i:${i};--k:${LEGEND.indexOf(it.id as WeaponId)};--r:${TILT[i] ?? 0}deg">
    ${ring}<span class="sh-pw">${ghost}${swordSvg(it.id, 'sh-pic')}${flash}</span>${stand}${label}${badge}${more}
    <span class="sh-cname">${escapeHtml(it.name)}</span><span class="sh-cprice">${price}</span>
  </button>`;
}

/** 할 일 하나 — 살 수 있음 = 주홍(첫 하나) 또는 먹 획 · 모자람 = 옅은 먹 획 + 남은 양 · 장착 중 = 먹 도장 · 보유 = 장착 획.
 *  big = 큰 칼(폭이 넓어 남은 양에 재화 이름까지) */
function actHtml(it: Item, st: CardState, on: boolean, takeMain: (ok: boolean) => boolean, inv: ShopInv, big = false): string {
  if (on) return '<span class="seal ink sh-on"><b>장착 중</b></span>';
  if (st === 'owned') {
    return `<button type="button" class="stroke s3 sh-act" data-equip-slot="${it.slot}" data-equip-id="${it.id}"><b>장착</b></button>`;
  }
  const word = it.pay === 'dust' ? '먼지' : '궤도조각';
  if (st === 'ok') {
    if (takeMain(true)) {
      return `<button type="button" class="seal sh-main${big ? ' big' : ''}" data-${it.pay}-id="${it.id}" aria-label="사기 ${word} ${fmt(it.cost)}"><b>사기</b><small>${fmt(it.cost)}</small></button>`;
    }
    return `<button type="button" class="stroke s3 sh-act" data-${it.pay}-id="${it.id}" aria-label="사기 ${word} ${fmt(it.cost)}"><b>사기</b></button>`;
  }
  const left = `${big ? `${word} ` : ''}${fmt(it.cost - inv[it.pay])} 더`;
  return `<button type="button" class="stroke s3 sh-act" disabled><b>사기</b><span>${left}</span></button>`;
}

/** 보유 도장 — 산 순간이면 쿵 + 먹 튐 */
function ownStamp(fresh: boolean, cls: string): string {
  return `<span class="sh-stampw ${cls}${fresh ? ' sh-fresh' : ''}"><span class="seal ink"><small>보유</small></span>${fresh ? SPLASH : ''}</span>`;
}

/** 꾸미기 그림 — 몸 색은 서 있는 졸라맨, 칼빛은 필살 참격(호가 가장 크다), 효과글자는 판 속 글자 */
function lookArt(it: Item, l: Loadout): string {
  if (it.slot === 'body') return playerArt({ weapon: l.weapon, body: it.id, blade: l.blade, pose: 'idle' });
  if (it.slot === 'blade') return playerArt({ weapon: l.weapon, body: l.body, blade: it.id, pose: 'special' });
  return lettersArt(it.id);
}

/** 철거 자격 — 건물 조건이 먼저, 응시료는 그다음. 모자란 쪽을 옅은 먹 획에 적는다 */
function examHtml(inv: ShopInv, takeMain: (ok: boolean) => boolean): string {
  const exam = nextExam(inv.license);
  const grade = (t: string): string => `<span class="sh-grade">${escapeHtml(t)}</span>`;
  if (!exam) {
    return `<div class="sh-exam">${grade(licenseTitle(inv.license))}
      <p class="sh-ename">${escapeHtml(SCREENS.license.maxTitle)}</p>
      <span class="seal ink sh-on"><b>${escapeHtml(SCREENS.license.maxTag)}</b></span></div>`;
  }
  const to = licenseTitle(inv.license + 1);
  const status = examStatus(inv.license, inv.buildings, inv.dust);
  const word = escapeHtml(SCREENS.license.exam);
  let act: string;
  if (status === 'ok') {
    act = takeMain(true)
      ? `<button type="button" class="seal sh-main" data-shop-exam="1"><b>${word}</b><small>${fmt(exam.fee)}</small></button>`
      : `<button type="button" class="stroke s3 sh-act" data-shop-exam="1"><b>${word}</b></button>`;
  } else {
    const left = status === 'dust'
      ? `먼지 ${fmt(exam.fee - inv.dust)} 더`
      : SCREENS.license.needBuildings(exam.buildings - inv.buildings);
    act = `<button type="button" class="stroke s3 sh-act" disabled><b>${word}</b><span>${escapeHtml(left)}</span></button>`;
  }
  return `<div class="sh-exam">${grade(to)}
    <div class="sh-ebody">
      <p class="sh-ename">${escapeHtml(to)} ${word}</p>
      <p class="sh-price">${escapeHtml(SCREENS.license.progress(Math.min(inv.buildings, exam.buildings), exam.buildings))} · ${glyph('dust')}${fmt(exam.fee)}</p>
    </div>
    ${act}</div>`;
}

