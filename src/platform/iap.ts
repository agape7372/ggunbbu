// 건뿌 인앱 결제 포트 — ads.ts와 같은 방식으로 플러그인을 런타임에 찾는다(@capgo/native-purchases, 앱 껍데기에만 설치).
// 순서가 본체다: 구매 → 지급 → 저장 → 소비·승인. 지급 전에 소비하면 앱이 죽을 때 돈만 나간다.
// 소비·승인 전에 앱이 죽어도 다음 부팅의 restore()가 다시 지급 칸으로 넣고, 토큰이 같으면 grantSku가 두 번 주지 않는다.
// 플러그인의 자동 승인은 init에서 끈다 — 켜 두면 지급 전에 복구 경로가 먼저 승인해 버릴 수 있다.
// 웹은 결제가 없다. 시험 빌드(isDevUnlocked)만 「시험 결제」로 흐름을 돈다.

import { SKU_IDS, skuById, type SkuId } from '../meta/catalog';
import { isDevUnlocked } from './devUnlock';
import { nativePlugin } from './native';

export type { SkuId };
export type IapResult = 'ok' | 'cancel' | 'fail' | 'pending';

/** 구매 하나 — token은 멱등 지급 키. 네이티브 포트 밖으로 영수증을 내지 않는다 */
export interface Paid {
  id: SkuId;
  token: string;
}

export interface IapPort {
  /** 결제 경로가 실재하는가 — 스토어 연결이 되고 상품을 받았을 때만 true */
  available(): boolean;
  /** 스토어 연결 + 가격 받기. 실패해도 throw하지 않는다 */
  init(): Promise<void>;
  /** 스토어 가격 문자열. 못 받았으면 null — 화면은 krw로 대체 표기 */
  price(id: SkuId): string | null;
  /** 지금 팔 수 있나 — 스토어가 가격을 준 상품만. 웹 · 시험 결제는 전부 true */
  sellable(id: SkuId): boolean;
  /** 지급(onPaid)이 끝나야 소비·승인까지 간다 */
  purchase(id: SkuId, onPaid: (p: Paid) => void): Promise<IapResult>;
  /** 끝나지 않은 구매를 다시 지급한다. 지급 건수를 돌려주고, 스토어에서 못 읽었거나 다른 결제 중이면 null — 0건과 다르다 */
  restore(onPaid: (p: Paid) => void): Promise<number | null>;
}

/** Google Play 구매 상태 — 1 = 결제 완료. 그 밖(대기 중 등)은 지급하지 않는다 */
const PURCHASED = '1';

interface Tx {
  productIdentifier: string;
  purchaseToken?: string;
  transactionId?: string;
  purchaseState?: string;
  isAcknowledged?: boolean;
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

export function createIapPort(): IapPort {
  const prices = new Map<string, string>();
  let ready = false;
  let busy = false;

  /** 끝난 구매 하나 처리. 지급과 저장이 끝난 뒤에만 스토어에 알린다 */
  async function finish(p: PurchasesPlugin, tx: Tx, onPaid: (x: Paid) => void): Promise<boolean> {
    const token = tx.purchaseToken ?? '';
    const sku = skuById(tx.productIdentifier);
    if (!token || !sku) return false;
    onPaid({ id: sku.id, token });
    try {
      if (isConsumable(sku.id)) await p.consumePurchase({ purchaseToken: token });
      else if (!tx.isAcknowledged) await p.acknowledgePurchase({ purchaseToken: token });
    } catch {
      // 지급은 끝났다 — 스토어 알림만 실패. 다음 부팅의 restore가 다시 알린다
    }
    return true;
  }

  /** 스토어에 남은 구매를 전부 다시 지급한다. 목록을 못 읽으면 null */
  async function sweep(p: PurchasesPlugin, onPaid: (x: Paid) => void): Promise<number | null> {
    try {
      const { purchases } = await p.getPurchases({ productType: 'inapp' });
      let n = 0;
      for (const tx of purchases) {
        // 1회 상품은 승인된 뒤에도 목록에 남는다 — 재설치한 사람은 이걸로 되찾고, 이미 가진 사람은 grantSku가 걸러 준다
        if (tx.purchaseState === PURCHASED && (await finish(p, tx, onPaid))) n += 1;
      }
      return n;
    } catch {
      return null;
    }
  }

  return {
    available(): boolean {
      return ready || isDevUnlocked();
    },

    async init(): Promise<void> {
      const p = getPlugin();
      if (!p) return;
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
    },

    price(id: SkuId): string | null {
      return prices.get(id) ?? null;
    },

    sellable(id: SkuId): boolean {
      return !ready || prices.has(id); // 가격을 못 받은 상품은 결제 창이 못 뜬다 — 목록에서 뺀다
    },

    async purchase(id: SkuId, onPaid: (x: Paid) => void): Promise<IapResult> {
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
        if (isOwned(e)) return ((await sweep(p, onPaid)) ?? 0) > 0 ? 'ok' : 'fail'; // 이미 샀는데 지급이 안 된 것 — 복구로 받는다
        return 'fail';
      } finally {
        busy = false;
      }
    },

    async restore(onPaid: (x: Paid) => void): Promise<number | null> {
      const p = getPlugin();
      if (!p) return 0;
      if (busy) return null;
      busy = true;
      try {
        return await sweep(p, onPaid);
      } finally {
        busy = false;
      }
    },
  };
}
