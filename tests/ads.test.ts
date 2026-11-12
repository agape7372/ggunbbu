// 보상형 광고 포트의 경주 로직 — 가짜 AdMob 플러그인으로 이벤트 순서를 바꿔 본다(08-30 「N배 지급」 · 「180초 물림」 고친 자리).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAdsPort } from '../src/platform/ads';

type H = (info?: unknown) => void;
function fakeAdMob(script: (emit: (ev: string, info?: unknown) => void) => Promise<unknown>, opts: { prepare?: () => Promise<unknown> } = {}) {
  const ls = new Map<string, H[]>();
  const removed: string[] = [];
  const emit = (ev: string, info?: unknown): void => { for (const h of ls.get(ev) ?? []) h(info); };
  const plugin = {
    initialize: vi.fn(async () => undefined),
    prepareRewardVideoAd: vi.fn(opts.prepare ?? (async () => ({ adUnitId: 'x' }))),
    showRewardVideoAd: vi.fn(() => script(emit)),
    addListener: vi.fn(async (ev: string, h: H) => {
      ls.set(ev, [...(ls.get(ev) ?? []), h]);
      return { remove: () => { removed.push(ev); ls.set(ev, (ls.get(ev) ?? []).filter((x) => x !== h)); } };
    }),
  };
  vi.stubGlobal('window', { Capacitor: { Plugins: { AdMob: plugin } } });
  return { plugin, removed, ls };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
afterEach(() => vi.unstubAllGlobals());

describe('ads 경주', () => {
  it('보상 → 닫힘 = ok, 리스너 4개 해제', async () => {
    const f = fakeAdMob(async (emit) => { await tick(); emit('onRewardedVideoAdReward', { amount: 1 }); emit('onRewardedVideoAdDismissed'); return { amount: 1 }; });
    expect(await createAdsPort().showRewarded('revive')).toBe('ok');
    expect(f.removed.length).toBe(4);
  });
  it('보상 없이 닫힘 = skip (show는 영영 안 끝남)', async () => {
    fakeAdMob(async (emit) => { await tick(); emit('onRewardedVideoAdDismissed'); return new Promise(() => undefined); });
    expect(await createAdsPort().showRewarded('revive')).toBe('skip');
  });
  it('닫힘이 보상보다 먼저 오면 = skip (보상 뒤늦게 옴)', async () => {
    fakeAdMob(async (emit) => { await tick(); emit('onRewardedVideoAdDismissed'); emit('onRewardedVideoAdReward', { amount: 1 }); return { amount: 1 }; });
    expect(await createAdsPort().showRewarded('revive')).toBe('skip');
  });
  it('보여주기 실패 이벤트 = fail', async () => {
    fakeAdMob(async (emit) => { await tick(); emit('onRewardedVideoAdFailedToShow', { code: 0 }); return new Promise(() => undefined); });
    expect(await createAdsPort().showRewarded('revive')).toBe('fail');
  });
  it('불러오기 실패(prepare reject) = fail', async () => {
    fakeAdMob(async () => ({}), { prepare: async () => { throw new Error('no fill'); } });
    expect(await createAdsPort().showRewarded('revive')).toBe('fail');
  });
  it('동시 두 번 = 두 번째는 fail, 보상은 한 번', async () => {
    let release: () => void = () => undefined;
    fakeAdMob((emit) => new Promise((r) => { release = () => { emit('onRewardedVideoAdReward', { amount: 1 }); emit('onRewardedVideoAdDismissed'); r({ amount: 1 }); }; }));
    const ads = createAdsPort();
    const a = ads.showRewarded('revive');
    const b = ads.showRewarded('orbitPack');
    await tick(); await tick();
    release();
    expect([await a, await b]).toEqual(['ok', 'fail']);
  });
  it('플러그인 없음(웹, debug 아님) = ready false · skip', async () => {
    vi.stubGlobal('window', {});
    const ads = createAdsPort({ debugAutoOk: false });
    expect(ads.ready()).toBe(false);
    expect(await ads.showRewarded('revive')).toBe('skip');
  });
});
