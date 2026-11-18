// 건뿌 인앱 결제 포트 — ads.ts와 같은 방식으로 플러그인을 런타임에 찾는다(@capgo/native-purchases, 앱 껍데기에만 설치).
// 순서가 본체다: 구매 → 지급 → 저장 → 지급 표식(IndexedDB, 반복 상품만) → 소비·승인. 지급 전에 소비하면 앱이 죽을 때 돈만 나간다.
// 소비·승인 전에 앱이 죽어도 다음 부팅의 restore()가 다시 지급 칸으로 넣고, 토큰이 같으면 grantSku가 두 번 주지 않는다.
// 저장이 안 써지면(onPaid가 false) 소비·승인하지 않는다 — 다음 restore가 다시 저장하고 그때 끝낸다.
// 플러그인의 자동 승인은 init에서 끈다 — 켜 두면 지급 전에 복구 경로가 먼저 승인해 버릴 수 있다.
// 환불: 1회 상품은 Play 보유 목록과 맞대고(Ledger.held), 반복 상품은 환불 확인 서버에 묻는다(voidedOf). 그 결제로 준 것을 거둔다.
// 웹은 결제가 없다. 시험 빌드(isDevUnlocked)만 「시험 결제」로 흐름을 돈다.

import { SKU_IDS, skuById, type SkuId } from '../meta/catalog';
import { isDevUnlocked } from './devUnlock';
import { nativePlugin } from './native';

export type { SkuId };
export type IapResult = 'ok' | 'cancel' | 'fail' | 'pending';

/** 구매 하나 — token은 멱등 지급 키, order는 Play 주문 번호(장부 · 문의 대조). 네이티브 포트 밖으로 영수증을 내지 않는다 */
export interface Paid {
  id: SkuId;
  token: string;
  order?: string;
}

/** 지급 + 저장. false = 저장이 안 써졌다 → 소비·승인을 미룬다. 그 밖(true · 없음)은 저장됐다 */
export type OnPaid = (p: Paid) => boolean | void;

/** 저장 쪽 결제 기록 — 지급 표식 맞대기와 1회 상품 환불 맞대기 */
export interface Ledger {
  /** 이 토큰의 지급이 저장에 있나 */
  has(token: string): boolean;
  /** Play 보유 목록을 읽었을 때만 부른다(조회 실패 · 오프라인이면 안 부른다). 목록에 없는 1회 상품 결제를 거둔다 */
  held(tokens: ReadonlySet<string>): void;
}

export interface IapPort {
  /** 결제 경로가 실재하는가 — 스토어 연결이 되고 상품을 받았을 때만 true */
  available(): boolean;
  /** 스토어 연결 + 가격 받기. 실패해도 throw하지 않고, 다시 부르면 다시 붙는다(겹쳐 부르면 한 번만 돈다) */
  init(): Promise<void>;
  /** 스토어 가격 문자열. 못 받았으면 null — 화면은 krw로 대체 표기 */
  price(id: SkuId): string | null;
  /** 지금 팔 수 있나 — 스토어가 가격을 준 상품만. 웹 · 시험 결제는 전부 true */
  sellable(id: SkuId): boolean;
  /** 지급(onPaid)이 끝나고 저장이 써져야 소비·승인까지 간다 */
  purchase(id: SkuId, onPaid: OnPaid, ledger?: Ledger): Promise<IapResult>;
  /** 끝나지 않은 구매를 다시 지급한다. 지급 건수를 돌려주고, 스토어에서 못 읽었거나 다른 결제 중이면 null — 0건과 다르다 */
  restore(onPaid: OnPaid, ledger?: Ledger): Promise<number | null>;
}

/** Google Play 구매 상태 — 1 = 결제 완료. 그 밖(대기 중 등)은 지급하지 않는다 */
const PURCHASED = '1';

interface Tx {
  productIdentifier: string;
  purchaseToken?: string;
  transactionId?: string;
  purchaseState?: string;
  isAcknowledged?: boolean;
  orderId?: string;
}

interface Product {
  identifier: string;
  priceString: string;
}

interface PurchasesPlugin {
  configure(o: { autoFinishTransactions: boolean }): Promise<void>;
  isBillingSupported(): Promise<{ isBillingSupported: boolean }>;
  getProducts(o: { productIdentifiers: string[]; productType: 'inapp' }): Promise<{ products: Product[] }>;
  purchaseProduct(o: {
    productIdentifier: string; productType: 'inapp'; quantity: number; isConsumable: boolean; autoAcknowledgePurchases: boolean;
  }): Promise<Tx>;
  getPurchases(o: { productType: 'inapp' }): Promise<{ purchases: Tx[] }>;
  consumePurchase(o: { purchaseToken: string }): Promise<void>;
  acknowledgePurchase(o: { purchaseToken: string }): Promise<void>;
}

function getPlugin(): PurchasesPlugin | null {
  const p = nativePlugin('NativePurchases') as unknown as Partial<PurchasesPlugin> | null;
  return typeof p?.purchaseProduct === 'function' && typeof p.getProducts === 'function' ? (p as PurchasesPlugin) : null;
}

// 플러그인(Android)은 취소 · 이미 보유를 reject(message, code)의 code로 알린다. 대기만 code 없이 message "Purchase is pending"
const codeOf = (e: unknown): string => String((e as { code?: unknown } | null)?.code ?? '');
const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String((e as { message?: unknown } | null)?.message ?? e));
const isCancel = (e: unknown): boolean => codeOf(e) === 'USER_CANCELED';
const isPending = (e: unknown): boolean => /pending/i.test(messageOf(e));
const isOwned = (e: unknown): boolean => codeOf(e) === 'ITEM_ALREADY_OWNED';

/** 1회 상품은 acknowledge로 영구 소유, 반복 상품은 consume으로 다시 살 수 있게 한다 */
const isConsumable = (id: SkuId): boolean => !skuById(id)?.once;

// ── 지급 표식(2026-11-18 어뷰징 점검) ──────────────────────────────
// 지급을 적은 localStorage는 WebView가 모았다가 5초 ~ 1분 뒤에야 디스크에 내린다. 그 사이 앱이 죽으면
// 이미 소비된 결제(Play 목록에서 사라짐)의 지급이 저장에 없다. 그래서 소비 전에 IndexedDB(strict = 디스크까지)에
// 표식을 남기고, restore가 「표식은 있는데 저장에 토큰이 없는」 결제를 다시 준다. 냥수제비 src/platform/iap.ts 이식.
export interface Mark { token: string; id: SkuId; at: number; order?: string }
const DB_NAME = 'gunbbu-paid';
const IDB_MS = 3000;
/** 하루 지나면 저장도 디스크에 있다 → 저장에 토큰이 있는 표식을 지운다 */
const MARK_KEEP_MS = 864e5;

/** IndexedDB 한 번. 없거나 실패 · 3초 넘으면 undefined(던지지 않는다) */
function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(undefined); return; }
    const timer = setTimeout(() => resolve(undefined), IDB_MS);
    const end = (v?: T): void => { clearTimeout(timer); resolve(v); };
    try {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => open.result.createObjectStore('paid', { keyPath: 'token' });
      open.onerror = () => end();
      open.onsuccess = () => {
        const db = open.result;
        try {
          const tx = db.transaction('paid', mode, { durability: 'strict' });
          const req = run(tx.objectStore('paid'));
          tx.oncomplete = () => { db.close(); end(req.result); };
          tx.onerror = tx.onabort = () => { db.close(); end(); };
        } catch {
          db.close();
          end();
        }
      };
    } catch {
      end();
    }
  });
}

/** 지급 표식 저장소. 시험이 갈아 끼운다 */
export const marks = {
  /** IndexedDB 자체가 없는 기기는 표식 없이 간다(더 나은 길이 없다). 있는데 못 쓰면 false */
  put: async (m: Mark): Promise<boolean> => typeof indexedDB === 'undefined' || (await idb('readwrite', (s) => s.put(m))) !== undefined,
  all: async (): Promise<Mark[]> => ((await idb('readonly', (s) => s.getAll())) ?? []) as Mark[],
  del: async (token: string): Promise<void> => void (await idb('readwrite', (s) => s.delete(token))),
};

// ── 반복 상품 환불 확인(2026-11-18) ────────────────────────────────
// 서버(ota/api/refund.ts)가 Play 환불 목록을 받아 두고, 앱이 보낸 토큰 중 환불된 것을 돌려준다. 주소가 비면 묻지 않는다.
const REFUND_URL: string = (() => {
  const u = ((import.meta.env.VITE_REFUND_URL as string | undefined) ?? '').trim();
  return u.startsWith('https://') ? u : '';
})();
const REFUND_MS = 6000;
type Post = (url: string, body: unknown) => Promise<{ status: number; data: unknown }>;
const textPost: Post = async (url, body) => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REFUND_MS);
  try {
    // text/plain = 사전 요청 없이 가는 단순 요청
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body), signal: ctl.signal });
    return { status: r.status, data: await r.json().catch(() => null) };
  } finally {
    clearTimeout(timer);
  }
};

/** 이 토큰들 중 Play가 환불 · 취소한 것. 주소 없음 · 서버 꺼짐 · 실패 = [](아무것도 안 거둔다) */
export async function voidedOf(tokens: readonly string[], url: string = REFUND_URL, post: Post = textPost): Promise<string[]> {
  if (!url || !tokens.length) return [];
  try {
    const r = await post(url, { op: 'refund.check', tokens });
    const v = (r.data as { voided?: unknown } | null)?.voided;
    return r.status === 200 && Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && tokens.includes(x)) : [];
  } catch {
    return [];
  }
}

export function createIapPort(): IapPort {
  const prices = new Map<string, string>();
  let ready = false;
  let busy = false;
  let initing: Promise<void> | null = null;

  /** 끝난 구매 하나 처리. 지급과 저장이 끝난 뒤에만 스토어에 알린다 */
  async function finish(p: PurchasesPlugin, tx: Tx, onPaid: OnPaid): Promise<boolean> {
    const token = tx.purchaseToken ?? '';
    const sku = skuById(tx.productIdentifier);
    if (!token || !sku) return false;
    const paid: Paid = { id: sku.id, token, order: tx.orderId };
    if (onPaid(paid) === false) return true; // 지급은 됐고 저장이 안 써졌다 → 끝내지 않는다
    try {
      if (isConsumable(sku.id)) {
        // 표식이 디스크에 없으면 소비하지 않는다 — 다음 복구가 다시 남기고 소비한다(3일 안에 못 끝내면 Play가 돌려준다)
        if (!(await marks.put({ ...paid, at: Date.now() }))) return true;
        await p.consumePurchase({ purchaseToken: token });
      } else if (!tx.isAcknowledged) await p.acknowledgePurchase({ purchaseToken: token });
    } catch {
      // 지급은 끝났다 — 스토어 알림만 실패. 다음 부팅의 restore가 다시 알린다
    }
    return true;
  }

  /** 지급 표식을 맞대고, 스토어에 남은 구매를 전부 다시 지급한다. 목록을 못 읽으면 null */
  async function sweep(p: PurchasesPlugin, onPaid: OnPaid, ledger?: Ledger): Promise<number | null> {
    try {
      let n = 0;
      // 표식은 있는데 저장에 토큰이 없다 = 저장이 디스크에 내려가기 전에 앱이 죽었다(이미 소비돼 Play 목록엔 없다) → 다시 준다
      if (ledger) {
        for (const m of await marks.all()) {
          if (ledger.has(m.token)) {
            if (Date.now() - m.at > MARK_KEEP_MS) await marks.del(m.token);
          } else if (skuById(m.id) && isConsumable(m.id)) {
            onPaid({ id: m.id, token: m.token, order: m.order });
            n += 1;
          }
        }
      }
      const { purchases } = await p.getPurchases({ productType: 'inapp' });
      for (const tx of purchases) {
        // 1회 상품은 승인된 뒤에도 목록에 남는다 — 재설치한 사람은 이걸로 되찾고, 이미 가진 사람은 grantSku가 걸러 준다
        if (tx.purchaseState === PURCHASED && (await finish(p, tx, onPaid))) n += 1;
      }
      // 목록을 읽었다 — 목록에 없는 1회 상품 결제는 환불 · 취소된 것이다
      ledger?.held(new Set(purchases.map((tx) => tx.purchaseToken ?? '').filter(Boolean)));
      return n;
    } catch {
      return null;
    }
  }

  return {
    available(): boolean {
      return ready || isDevUnlocked();
    },

    init(): Promise<void> {
      // 결제 · 복구 중이면 끼어들지 않는다 — 다음 복귀 · 상점 열기가 다시 부른다. busy는 쥐지 않는다: 준비가 늦어도 복구 · 결제를 막지 않게
      initing ??= (async () => {
        const p = getPlugin();
        if (!p || busy) return;
        try {
          await p.configure({ autoFinishTransactions: false });
          const { isBillingSupported } = await p.isBillingSupported();
          if (!isBillingSupported) return;
          const { products } = await p.getProducts({ productIdentifiers: [...SKU_IDS], productType: 'inapp' });
          for (const x of products) prices.set(x.identifier, x.priceString);
          ready = products.length > 0;
        } catch {
          ready = false;
        }
      })().finally(() => { initing = null; });
      return initing;
    },

    price(id: SkuId): string | null {
      return prices.get(id) ?? null;
    },

    sellable(id: SkuId): boolean {
      return !ready || prices.has(id); // 가격을 못 받은 상품은 결제 창이 못 뜬다 — 목록에서 뺀다
    },

    async purchase(id: SkuId, onPaid: OnPaid, ledger?: Ledger): Promise<IapResult> {
      if (busy) return 'fail';
      const p = getPlugin();
      if (!p) {
        if (!isDevUnlocked()) return 'fail';
        onPaid({ id, token: `test-${Date.now()}` }); // 시험판 — 결제 없이 지급 흐름만 돈다
        return 'ok';
      }
      busy = true;
      try {
        const tx = await p.purchaseProduct({
          productIdentifier: id, productType: 'inapp', quantity: 1, isConsumable: isConsumable(id), autoAcknowledgePurchases: false,
        });
        if (tx.purchaseState !== undefined && tx.purchaseState !== PURCHASED) return 'pending'; // 편의점 결제 등 — restore가 받는다
        return (await finish(p, tx, onPaid)) ? 'ok' : 'fail';
      } catch (e) {
        if (isCancel(e)) return 'cancel';
        if (isPending(e)) return 'pending';
        if (isOwned(e)) return ((await sweep(p, onPaid, ledger)) ?? 0) > 0 ? 'ok' : 'fail'; // 이미 샀는데 지급이 안 된 것 — 복구로 받는다
        return 'fail';
      } finally {
        busy = false;
      }
    },

    async restore(onPaid: OnPaid, ledger?: Ledger): Promise<number | null> {
      const p = getPlugin();
      if (!p) return 0;
      if (busy) return null;
      busy = true;
      try {
        return await sweep(p, onPaid, ledger);
      } finally {
        busy = false;
      }
    },
  };
}
