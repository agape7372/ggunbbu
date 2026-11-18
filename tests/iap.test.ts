// 결제 포트 — 지급이 끝나기 전엔 스토어에 끝났다고 알리지 않는다. 대기 · 취소는 안 준다. 복구는 두 번 주지 않는다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIapPort, marks, voidedOf, type Ledger, type Mark, type Paid } from '../src/platform/iap';
import { grantSku, type Buyer } from '../src/meta/catalog';
import { emptyItems } from '../src/meta/kit';
import { emptySeason } from '../src/meta/season';

type Tx = { productIdentifier: string; purchaseToken: string; purchaseState?: string; isAcknowledged?: boolean; orderId?: string };

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

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

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

  it('부팅 때 결제 준비가 실패해도 다시 부르면 열린다 — 겹쳐 불러도 한 번만 돈다', async () => {
    const { plugin } = fakePlugin(new Error('x'));
    plugin.getProducts.mockRejectedValueOnce(new Error('offline'));
    const iap = createIapPort();
    await iap.init();
    expect(iap.available()).toBe(false);
    await Promise.all([iap.init(), iap.init()]);
    expect(iap.available()).toBe(true);
    expect(iap.price('orbit_s')).toBe('₩900');
    expect(plugin.getProducts).toHaveBeenCalledTimes(2);
  });

  it('복구 중에는 결제 준비가 끼어들지 않는다 — 끝난 뒤 다시 부르면 열린다', async () => {
    const { plugin } = fakePlugin(new Error('x'));
    let release: (v: { purchases: Tx[] }) => void = () => undefined;
    plugin.getPurchases.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const iap = createIapPort();
    const restoring = iap.restore(() => undefined);
    await iap.init();
    expect(plugin.getProducts).not.toHaveBeenCalled();
    release({ purchases: [] });
    expect(await restoring).toBe(0);
    await iap.init();
    expect(iap.available()).toBe(true);
  });

  it('반복 상품 — 지급이 먼저, 소비가 나중', async () => {
    const { log } = fakePlugin({ productIdentifier: 'orbit_s', purchaseToken: 't1', purchaseState: '1' });
    const r = await createIapPort().purchase('orbit_s', (p) => { log.push(`paid:${p.token}`); });
    expect(r).toBe('ok');
    expect(log).toEqual(['paid:t1', 'consume:t1']);
  });

  it('1회 상품 — 소비하지 않고 승인한다', async () => {
    const { log } = fakePlugin({ productIdentifier: 'no_ads', purchaseToken: 't2', purchaseState: '1', isAcknowledged: false });
    await createIapPort().purchase('no_ads', (p) => { log.push(`paid:${p.token}`); });
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
    expect(await createIapPort().purchase('orbit_s', (p) => { paid.push(p); })).toBe('pending');
    expect(paid).toEqual([]);
    expect(log).toEqual([]);
  });

  it('취소 · 실패는 주지 않는다', async () => {
    fakePlugin(rejection('Purchase is not purchased', 'USER_CANCELED'));
    const paid: Paid[] = [];
    expect(await createIapPort().purchase('orbit_s', (p) => { paid.push(p); })).toBe('cancel');
    fakePlugin(rejection('Purchase is not purchased', 'BILLING_UNAVAILABLE'));
    expect(await createIapPort().purchase('orbit_s', (p) => { paid.push(p); })).toBe('fail');
    fakePlugin(new Error('network'));
    expect(await createIapPort().purchase('orbit_s', (p) => { paid.push(p); })).toBe('fail');
    expect(paid).toEqual([]);
  });

  it('플러그인의 대기 거절(Purchase is pending)은 대기로 알린다', async () => {
    fakePlugin(rejection('Purchase is pending'));
    const paid: Paid[] = [];
    expect(await createIapPort().purchase('orbit_s', (p) => { paid.push(p); })).toBe('pending');
    expect(paid).toEqual([]);
  });

  it('이미 가진 상품(ITEM_ALREADY_OWNED)은 복구로 받아 성공으로 안내한다', async () => {
    const { log } = fakePlugin(rejection('Purchase is not purchased', 'ITEM_ALREADY_OWNED'), [
      { productIdentifier: 'orbit_s', purchaseToken: 'stuck', purchaseState: '1' },
    ]);
    const paid: Paid[] = [];
    expect(await createIapPort().purchase('orbit_s', (p) => { paid.push(p); })).toBe('ok');
    expect(paid.map((p) => p.token)).toEqual(['stuck']);
    expect(log).toEqual(['consume:stuck']);
    fakePlugin(rejection('Purchase is not purchased', 'ITEM_ALREADY_OWNED'), []);
    expect(await createIapPort().purchase('orbit_s', () => undefined)).toBe('fail');
  });

  it('소비가 실패해도 지급은 남고 결과는 성공이다 — 다음 부팅이 다시 알린다', async () => {
    const { plugin } = fakePlugin({ productIdentifier: 'orbit_s', purchaseToken: 't4', purchaseState: '1' });
    plugin.consumePurchase.mockRejectedValueOnce(new Error('offline'));
    const paid: Paid[] = [];
    expect(await createIapPort().purchase('orbit_s', (p) => { paid.push(p); })).toBe('ok');
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

  it('없어진 상품(기사 세트)이 스토어에 남아 있어도 복구가 깨지지 않고 나머지는 받는다', async () => {
    const { log } = fakePlugin(new Error('x'), [
      { productIdentifier: 'knight_set', purchaseToken: 'k', purchaseState: '1', isAcknowledged: true },
      { productIdentifier: 'no_ads', purchaseToken: 'n', purchaseState: '1', isAcknowledged: true },
    ]);
    const b = buyer();
    const iap = createIapPort();
    expect(await iap.restore((p) => { grantSku(b, p.id, p.token); })).toBe(1);
    expect(b.noAds).toBe(true);
    expect(b.bought).toEqual(['no_ads']);
    expect(log).toEqual([]); // 모르는 상품은 소비 · 승인도 안 한다
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

// 2026-11-18 어뷰징 점검 — 지급이 디스크에 남은 뒤에만 소비 · 승인. 환불이면 거둔다
describe('iap 지급 확정 · 환불', () => {
  /** 메모리 표식 저장소 — IndexedDB 대신 */
  function fakeMarks(ok = true) {
    const box = new Map<string, Mark>();
    vi.spyOn(marks, 'put').mockImplementation(async (m) => { if (ok) box.set(m.token, m); return ok; });
    vi.spyOn(marks, 'all').mockImplementation(async () => [...box.values()]);
    vi.spyOn(marks, 'del').mockImplementation(async (t) => { box.delete(t); });
    return box;
  }
  const ledgerOf = (b: Buyer, held: (t: ReadonlySet<string>) => void = () => undefined): Ledger => ({ has: (t) => b.iapTokens.includes(t), held });

  it('저장이 안 써지면 소비 · 승인하지 않는다 — 다음 복구가 저장되면 그때 끝낸다', async () => {
    fakeMarks();
    const { plugin, log } = fakePlugin({ productIdentifier: 'orbit_s', purchaseToken: 't1', purchaseState: '1' });
    const b = buyer();
    let disk = false;
    const onPaid = (p: Paid): boolean => { grantSku(b, p.id, p.token); return disk; };
    const iap = createIapPort();
    expect(await iap.purchase('orbit_s', onPaid, ledgerOf(b))).toBe('ok');
    expect(log).toEqual([]);
    plugin.getPurchases.mockResolvedValue({ purchases: [{ productIdentifier: 'orbit_s', purchaseToken: 't1', purchaseState: '1' }] });
    disk = true;
    await iap.restore(onPaid, ledgerOf(b));
    expect(log).toEqual(['consume:t1']);
    expect(b.orbit).toBe(120); // 한 번만
  });

  it('1회 상품도 저장이 안 써지면 승인하지 않는다', async () => {
    const { log } = fakePlugin({ productIdentifier: 'no_ads', purchaseToken: 'n1', purchaseState: '1', isAcknowledged: false });
    await createIapPort().purchase('no_ads', () => false);
    expect(log).toEqual([]);
  });

  it('반복 상품은 표식을 디스크에 남긴 뒤 소비한다 — 표식이 안 써지면 소비하지 않는다', async () => {
    const box = fakeMarks();
    const { log } = fakePlugin({ productIdentifier: 'orbit_s', purchaseToken: 't2', purchaseState: '1', orderId: 'GPA.1' } as Tx);
    await createIapPort().purchase('orbit_s', () => true);
    expect(box.get('t2')).toMatchObject({ id: 'orbit_s', order: 'GPA.1' });
    expect(log).toEqual(['consume:t2']);
    vi.mocked(marks.put).mockResolvedValue(false);
    const again = fakePlugin({ productIdentifier: 'orbit_s', purchaseToken: 't3', purchaseState: '1' });
    await createIapPort().purchase('orbit_s', () => true);
    expect(again.log).toEqual([]);
  });

  it('소비 뒤 저장이 디스크에 내려가기 전에 죽었다 — 표식으로 다시 준다(한 번만)', async () => {
    const box = fakeMarks();
    fakePlugin({ productIdentifier: 'orbit_s', purchaseToken: 't4', purchaseState: '1' });
    await createIapPort().purchase('orbit_s', () => true); // 소비까지 끝 · 저장은 사라짐
    expect(box.has('t4')).toBe(true);
    fakePlugin(new Error('x'), []); // 소비돼서 Play 목록엔 없다
    const b = buyer();
    const iap = createIapPort();
    const onPaid = (p: Paid): boolean => { grantSku(b, p.id, p.token); return true; };
    expect(await iap.restore(onPaid, ledgerOf(b))).toBe(1);
    expect(await iap.restore(onPaid, ledgerOf(b))).toBe(0);
    expect(b.orbit).toBe(120);
  });

  it('보유 목록을 읽었을 때만 1회 상품 맞대기를 부른다 — 못 읽으면 손대지 않는다', async () => {
    const { plugin } = fakePlugin(new Error('x'), [{ productIdentifier: 'no_ads', purchaseToken: 'n', purchaseState: '1', isAcknowledged: true }]);
    const seen: string[][] = [];
    const lg: Ledger = { has: () => true, held: (t) => { seen.push([...t]); } };
    await createIapPort().restore(() => true, lg);
    expect(seen).toEqual([['n']]);
    plugin.getPurchases.mockRejectedValueOnce(new Error('offline'));
    expect(await createIapPort().restore(() => true, lg)).toBeNull();
    expect(seen).toHaveLength(1);
  });

  it('환불 확인 — 주소가 없거나 실패면 아무것도 안 거두고, 보낸 토큰 중 환불된 것만 받는다', async () => {
    const post = vi.fn(async () => ({ status: 200, data: { voided: ['a', 'zz'] } }));
    expect(await voidedOf(['a', 'b'], '', post)).toEqual([]);
    expect(post).not.toHaveBeenCalled();
    expect(await voidedOf(['a', 'b'], 'https://x.test/api/refund', post)).toEqual(['a']);
    expect(post).toHaveBeenCalledWith('https://x.test/api/refund', { op: 'refund.check', tokens: ['a', 'b'] });
    expect(await voidedOf(['a'], 'https://x.test', async () => { throw new Error('offline'); })).toEqual([]);
    expect(await voidedOf(['a'], 'https://x.test', async () => ({ status: 500, data: { voided: ['a'] } }))).toEqual([]);
  });
});
