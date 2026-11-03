// 시간제한 특가 — 언제 열리고 언제 닫히나. DOM 없음. now는 호출측이 넘긴다.
// 끝나면 진짜로 끝난다: 평생 한 번 열리는 특가는 다시 안 열리고, 정가 상품은 그대로 판다(거짓 할인 금지).
// 시계를 되돌려도 살아나지 않게 본 시각을 앞으로만 민다(lastSeen). 되돌린 동안은 특가를 숨기고, 남은 시간 표기도 본 시각 기준이다.

import type { SkuId } from './catalog';

const HOUR = 3600_000;
export const ROOKIE_HOURS = 48;
export const RESCUE_HOURS = 24;
/** 월초 특가 — 매월 1일 ~ 이 날짜까지(KST) */
export const MONTH_LAST_DAY = 3;
const KST = 9 * HOUR;
/** 이보다 크게 시계가 뒤로 가 있으면 되돌린 것으로 본다(몇 분의 시각 보정은 봐준다) */
const ROLLBACK_SLOP = 10 * 60_000;

export interface Offers {
  /** 신입 특가 끝 시각. 0 = 아직 안 열림 */
  rookieUntil: number;
  /** 고비 특가 끝 시각. 0 = 아직 안 열림 */
  rescueUntil: number;
  /** 고비 특가를 산 적 있나 */
  rescueUsed: boolean;
  /** 월초 특가를 산 달 'YYYY-MM' */
  monthBought: string;
  /** 오퍼 창을 띄운 날(dateKey) — 하루 한 번 */
  popDay: string;
  /** 지금까지 본 가장 늦은 시각 */
  lastSeen: number;
}

export function emptyOffers(): Offers {
  return { rookieUntil: 0, rescueUntil: 0, rescueUsed: false, monthBought: '', popDay: '', lastSeen: 0 };
}

export interface LiveOffer {
  id: 'rookie' | 'rescue' | 'month';
  sku: SkuId;
  /** 같은 물건의 정가 상품 */
  regular: SkuId;
  until: number;
  title: string;
  /** 처음 길이 — 도화선 비율 */
  span: number;
}

/** 시계를 앞으로만 민다. 되돌린 시계로는 특가가 살아나지 않는다 */
export function clockOf(o: Offers, now: number): number {
  o.lastSeen = Math.max(o.lastSeen, now);
  return o.lastSeen;
}

/** 화면에 쓸 시각 — 되돌린 시계가 아니라 본 가장 늦은 시각. 남은 시간이 늘어나 보이지 않는다 */
export const offerClock = (o: Offers, now: number): number => Math.max(o.lastSeen, now);

/** 이 판수부터 특가를 먼저 내민다. 그 전엔 상점에 들어간 사람만 본다 — 한 판도 안 한 사람에게 결제 창을 띄우지 않는다 */
export const OFFER_RUNS = 2;

/** 조건을 채운 특가를 연다(홈에 돌아올 때 부른다). 한 번 열린 건 다시 안 열린다 */
export function armOffers(o: Offers, f: { runs: number; reachedAct2: boolean }, now: number): void {
  const t = clockOf(o, now);
  if (o.rookieUntil === 0 && f.runs >= OFFER_RUNS) o.rookieUntil = t + ROOKIE_HOURS * HOUR;
  if (o.rescueUntil === 0 && f.reachedAct2) o.rescueUntil = t + RESCUE_HOURS * HOUR;
}

const monthKey = (t: number): string => new Date(t + KST).toISOString().slice(0, 7);

/** 이달 월초 특가 끝 시각. 지금이 그 안이 아니면 0 */
function monthUntil(t: number): number {
  const d = new Date(t + KST);
  if (d.getUTCDate() > MONTH_LAST_DAY) return 0;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), MONTH_LAST_DAY + 1) - KST;
}

/** 지금 살아 있는 특가. 신입 특가는 샀으면 사라진다. 시계를 되돌려 둔 동안은 하나도 안 보인다 */
export function liveOffers(o: Offers, bought: readonly string[], now: number): LiveOffer[] {
  const t = offerClock(o, now);
  const out: LiveOffer[] = [];
  if (o.lastSeen - now > ROLLBACK_SLOP) return out;
  if (t < o.rookieUntil && !bought.includes('rookie_sale') && !bought.includes('rookie_pack')) {
    out.push({
      id: 'rookie', sku: 'rookie_sale', regular: 'rookie_pack', until: o.rookieUntil,
      title: '신입 특가', span: ROOKIE_HOURS * HOUR,
    });
  }
  if (t < o.rescueUntil && !o.rescueUsed) {
    out.push({
      id: 'rescue', sku: 'toolbox_sale', regular: 'toolbox', until: o.rescueUntil,
      title: '고비 특가', span: RESCUE_HOURS * HOUR,
    });
  }
  const mu = monthUntil(t);
  // 고비 특가와 같은 상품이라 둘이 겹치면 고비 특가 하나만 보인다
  if (mu > t && o.monthBought !== monthKey(t) && !out.some((x) => x.sku === 'toolbox_sale')) {
    out.push({
      id: 'month', sku: 'toolbox_sale', regular: 'toolbox', until: mu,
      title: '월초 특가', span: MONTH_LAST_DAY * 24 * HOUR,
    });
  }
  return out;
}

/** 특가 상품을 산 뒤 부른다 — 그 특가를 닫는다 */
export function noteOfferBought(o: Offers, sku: SkuId, now: number): void {
  if (sku !== 'toolbox_sale') return;
  const t = offerClock(o, now);
  const live = liveOffers(o, [], t).find((x) => x.sku === 'toolbox_sale');
  if (live?.id === 'rescue') o.rescueUsed = true;
  else if (live?.id === 'month') o.monthBought = monthKey(t); // 끝난 뒤에 늦게 복구된 구매는 이달 특가를 닫지 않는다
}

/** 오늘 오퍼 창을 띄울 특가. 띄울 게 없거나 오늘 이미 띄웠으면 null */
export function offerToPop(o: Offers, bought: readonly string[], now: number, dateKey: string, runs: number): LiveOffer | null {
  if (o.popDay === dateKey || runs < OFFER_RUNS) return null;
  return liveOffers(o, bought, now)[0] ?? null;
}

/** 남은 시간 시:분:초 — 특가 창 · 패널의 도화선 옆 */
export function clockText(until: number, now: number): string {
  const sec = Math.max(0, Math.ceil((until - now) / 1000));
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(Math.floor(sec / 3600))}:${p(Math.floor(sec / 60) % 60)}:${p(sec % 60)}`;
}

/** 도화선 남은 비율 0~1 */
export function fuseLeft(o: Pick<LiveOffer, 'until' | 'span'>, now: number): number {
  return Math.min(1, Math.max(0, (o.until - now) / o.span));
}

/** 남은 시간 말로 — 홈 한 줄 */
export function leftText(until: number, now: number): string {
  const min = Math.max(0, Math.ceil((until - now) / 60_000));
  const h = Math.floor(min / 60);
  return h > 0 ? `${h}시간 ${min % 60}분 남음` : `${min}분 남음`;
}

export function validateOffers(v: unknown): Offers {
  const o = typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  const n = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0);
  const s = (x: unknown): string => (typeof x === 'string' ? x : '');
  return {
    rookieUntil: n(o.rookieUntil),
    rescueUntil: n(o.rescueUntil),
    rescueUsed: o.rescueUsed === true,
    monthBought: s(o.monthBought),
    popDay: s(o.popDay),
    lastSeen: n(o.lastSeen),
  };
}
