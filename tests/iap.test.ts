// 결제 포트 — 지급이 끝나기 전엔 스토어에 끝났다고 알리지 않는다. 대기 · 취소는 안 준다. 복구는 두 번 주지 않는다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIapPort, type Paid } from '../src/platform/iap';
import { grantSku, type Buyer } from '../src/meta/catalog';
import { emptyItems } from '../src/meta/kit';
import { emptySeason } from '../src/meta/season';

type Tx = { productIdentifier: string; purchaseToken: string; purchaseState?: string; isAcknowledged?: boolean };

/** 플러그인이 실제로 내는 거절 모양 — reject(message, code). 취소 · 이미 보유는 code, 대기는 message만 */
const rejection = (message: string, code?: string): Error => Object.assign(new Error(message), code ? { code } : {});

function fakePlugin(tx: Tx | Error, list: Tx[] = []) {
  const log: string[] = [];
  const plugin = {
    configure: vi.fn(async (o: { autoFinishTransactions: boolean }) => { log.push(`configure:${o.autoFinishTransactions}`); }),
    isBillingSupported: vi.fn(async () => ({ isBillingSupported: true })),
    getProducts: vi.fn(async () => ({ products: [{ identifier: 'orbit_s', priceString: '₩900' }] })),
    purchaseProduct: vi.fn(async () => {
      if (tx instanceof Error) throw tx;
      return tx;
    }),
    getPurchases: vi.fn(async () => ({ purchases: list })),
    consumePurchase: vi.fn(async (o: { purchaseToken: string }) => { log.push(`consume:${o.purchaseToken}`); }),
    acknowledgePurchase: vi.fn(async (o: { purchaseToken: string }) => { log.push(`ack:${o.purchaseToken}`); }),
  };
  vi.stubGlobal('window', { Capacitor: { Plugins: { NativePurchases: plugin } } });
  return { plugin, log };
}

const buyer = (): Buyer => ({
  dust: 0, orbit: 0, owned: [], blanks: 0, items: emptyItems(), bought: [], noAds: false, salary: { left: 0, key: '' }, iapTokens: [],
  season: emptySeason(), regular: { stamps: 0, got: 0 }, firstGift: true,
});

afterEach(() => vi.unstubAllGlobals());

describe('iap', () => {
  it('자동 마감을 끄고 시작하고, 가격을 받아야 결제가 열린다', async () => {
    const { log } = fakePlugin(new Error('x'));
    const iap = createIapPort();
    expect(iap.available()).toBe(false);
    await iap.init();
    expect(log[0]).toBe('configure:false');
    expect(iap.available()).toBe(true);
    expect(iap.price('orbit_s')).toBe('₩900');
    expect(iap.price('toolbox')).toBeNull();
  });

  it('반복 상품 — 지급이 먼저, 소비가 나중', async () => {
    const { log } = fakePlugin({ productIdentifier: 'orbit_s', purchaseToken: 't1', purchaseState: '1' });
    const r = await createIapPort().purchase('orbit_s', (p) => log.push(`paid:${p.token}`));
    expect(r).toBe('ok');
    expect(log).toEqual(['paid:t1', 'consume:t1']);
  });

  it('1회 상품 — 소비하지 않고 승인한다', async () => {
    const { log } = fakePlugin({ productIdentifier: 'no_ads', purchaseToken: 't2', purchaseState: '1', isAcknowledged: false });
    await createIapPort().purchase('no_ads', (p) => log.push(`paid:${p.token}`));
    expect(log).toEqual(['paid:t2', 'ack:t2']);
  });

  it('자동 승인을 꺼서 구매한다 — 지급 전 소비를 플러그인이 하지 못하게', async () => {
    const { plugin } = fakePlugin({ productIdentifier: 'orbit_s', purchaseToken: 't', purchaseState: '1' });
    await createIapPort().purchase('orbit_s', () => undefined);
    expect(plugin.purchaseProduct.mock.calls[0]).toEqual([expect.objectContaining({ autoAcknowledgePurchases: false, isConsumable: true })]);
  });

  it('대기 중 결제는 주지도 끝내지도 않는다', async () => {
    const { log } = fakePlugin({ productIdentifier: 'orbit_s', purchaseToken: 't3', purchaseState: '2' });
    const paid: Paid[] = [];
    expect(await createIapPort().purchase('orbit_s', (p) => paid.push(p))).toBe('pending');
    expect(paid).toEqual([]);
    expect(log).toEqual([]);
  });

  it('취소 · 실패는 주지 않는다', async () => {
    fakePlugin(rejection('Purchase is not purchased', 'USER_CANCELED'));
    const paid: Paid[] = [];
    expect(await createIapPort().purchase('orbit_s', (p) => paid.push(p))).toBe('cancel');
    fakePlugin(rejection('Purchase is not purchased', 'BILLING_UNAVAILABLE'));
    expect(await createIapPort().purchase('orbit_s', (p) => paid.push(p))).toBe('fail');
    fakePlugin(new Error('network'));
    expect(await createIapPort().purchase('orbit_s', (p) => paid.push(p))).toBe('fail');
    expect(paid).toEqual([]);
  });

  it('플러그인의 대기 거절(Purchase is pending)은 대기로 알린다', async () => {
    fakePlugin(rejection('Purchase is pending'));
    const paid: Paid[] = [];
    expect(await createIapPort().purchase('orbit_s', (p) => paid.push(p))).toBe('pending');
    expect(paid).toEqual([]);
  });

  it('이미 가진 상품(ITEM_ALREADY_OWNED)은 복구로 받아 성공으로 안내한다', async () => {
    const { log } = fakePlugin(rejection('Purchase is not purchased', 'ITEM_ALREADY_OWNED'), [
      { productIdentifier: 'orbit_s', purchaseToken: 'stuck', purchaseState: '1' },
    ]);
    const paid: Paid[] = [];
    expect(await createIapPort().purchase('orbit_s', (p) => paid.push(p))).toBe('ok');
    expect(paid.map((p) => p.token)).toEqual(['stuck']);
    expect(log).toEqual(['consume:stuck']);
    fakePlugin(rejection('Purchase is not purchased', 'ITEM_ALREADY_OWNED'), []);
    expect(await createIapPort().purchase('orbit_s', () => undefined)).toBe('fail');
  });

  it('소비가 실패해도 지급은 남고 결과는 성공이다 — 다음 부팅이 다시 알린다', async () => {
    const { plugin } = fakePlugin({ productIdentifier: 'orbit_s', purchaseToken: 't4', purchaseState: '1' });
    plugin.consumePurchase.mockRejectedValueOnce(new Error('offline'));
    const paid: Paid[] = [];
    expect(await createIapPort().purchase('orbit_s', (p) => paid.push(p))).toBe('ok');
    expect(paid).toHaveLength(1);
  });

  it('복구 — 끝난 구매만 받고, 같은 토큰은 두 번 지급되지 않는다', async () => {
    const list: Tx[] = [
      { productIdentifier: 'orbit_s', purchaseToken: 'a', purchaseState: '1' },
      { productIdentifier: 'orbit_m', purchaseToken: 'b', purchaseState: '2' },
    ];
    fakePlugin(new Error('x'), list);
    const b = buyer();
    const iap = createIapPort();
    const onPaid = (p: Paid): void => { grantSku(b, p.id, p.token); };
    expect(await iap.restore(onPaid)).toBe(1);
    expect(await iap.restore(onPaid)).toBe(1); // 소비 실패로 또 올라와도
    expect(b.orbit).toBe(120); // 60의 첫 구매 두 배가 한 번만
    expect(b.iapTokens).toEqual(['a']);
  });

  it('복구를 못 읽은 것은 0건과 다르고, 결제 중에는 복구가 끼어들지 않는다', async () => {
    const { plugin } = fakePlugin(new Error('x'));
    plugin.getPurchases.mockRejectedValueOnce(new Error('offline'));
    const iap = createIapPort();
    expect(await iap.restore(() => undefined)).toBeNull();
    expect(await iap.restore(() => undefined)).toBe(0);
    let release: (v: { productIdentifier: string; purchaseToken: string; purchaseState: string }) => void = () => undefined;
    plugin.purchaseProduct.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const buying = iap.purchase('orbit_s', () => undefined);
    expect(await iap.restore(() => undefined)).toBeNull();
    release({ productIdentifier: 'orbit_s', purchaseToken: 'z', purchaseState: '1' });
    expect(await buying).toBe('ok');
  });

  it('가격을 받은 상품만 판다 — 못 받은 것은 목록에서 빠진다', async () => {
    fakePlugin(new Error('x'));
    const iap = createIapPort();
    await iap.init();
    expect(iap.sellable('orbit_s')).toBe(true);
    expect(iap.sellable('toolbox')).toBe(false);
    vi.stubGlobal('window', {});
    const web = createIapPort();
    await web.init();
    expect(web.sellable('toolbox')).toBe(true); // 웹 · 시험 결제는 그대로
  });

  it('재설치 복구 — 저장에 토큰이 없어도 1회 상품을 되찾는다', async () => {
    fakePlugin(new Error('x'), [{ productIdentifier: 'no_ads', purchaseToken: 'old', purchaseState: '1', isAcknowledged: true }]);
    const b = buyer();
    await createIapPort().restore((p) => { grantSku(b, p.id, p.token); });
    expect(b.noAds).toBe(true);
  });

  it('플러그인이 없으면 결제가 없다', async () => {
    vi.stubGlobal('window', {});
    const iap = createIapPort();
    await iap.init();
    expect(iap.available()).toBe(false);
    expect(await iap.purchase('orbit_s', () => undefined)).toBe('fail');
    expect(await iap.restore(() => undefined)).toBe(0);
  });
});
