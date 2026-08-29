// 건뿌 보상형 광고 포트.
// 웹 = 광고 없음(봉인). 네이티브 셸 = @capacitor-community/admob 을 **런타임 조회**로만 사용
// (정적/동적 bare import 금지 — podoal 프로덕션 검증 패턴 이식, 08-30 Wave 4).
// 계약: 이 모듈은 어떤 환경에서도 throw 하지 않는다. 결과는 전부 반환값이다.
// 지급: gunbbu는 백엔드 0·로컬 세이브 게임 — 클라 콜백 지급(SSV 없음)을 의도로 문서화한다
// (ROADMAP Wave 4). 서버가 생기면 podoal admobSsv.ts 이식이 다음 단계.

export type AdKind = 'revive' | 'missionBoost' | 'orbitPack';
export type AdResult = 'ok' | 'fail' | 'skip';

export interface AdsPort {
  ready(): boolean;
  showRewarded(kind: AdKind): Promise<AdResult>;
}

/** AdMob 공식 테스트 리워드 단위 — 실 단위 ID로 교체 전까지 항상 이 값 (shell/README 짝값 표). */
const TEST_REWARDED_AD_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917';
const REWARDED_AD_UNIT_ID = TEST_REWARDED_AD_UNIT_ID;

// 플러그인 이벤트 — @capacitor-community/admob RewardAdPluginEvents와 짝
const REWARD_EVENT = 'onRewardedVideoAdReward';
const DISMISS_EVENT = 'onRewardedVideoAdDismissed';
const LOAD_FAILED_EVENT = 'onRewardedVideoAdFailedToLoad';
// show 실패는 Dismissed가 안 오고 show() 콜도 영구 미결(플러그인 소스 실측) — 이 이벤트가 유일 공지
const SHOW_FAILED_EVENT = 'onRewardedVideoAdFailedToShow';
// prepare가 reject도 resolve도 없이 림보에 빠지는 경우의 상한 — settle 경주는 prepare 후에야 시작되므로 별도
const PREPARE_TIMEOUT_MS = 30_000;
// 닫힘 이벤트 미도달 상한 — 버튼이 영구히 물리는 것을 막는다 (podoal 실측 처방)
const SETTLE_TIMEOUT_MS = 180_000;

interface ListenerHandle { remove?: () => unknown }
interface AdMobPlugin {
  initialize?: (options?: unknown) => Promise<unknown>;
  prepareRewardVideoAd?: (options: unknown) => Promise<unknown>;
  showRewardVideoAd?: (options?: unknown) => Promise<unknown>;
  addListener?: (event: string, handler: (info?: unknown) => void) => Promise<ListenerHandle> | ListenerHandle;
}

function getAdMobPlugin(): AdMobPlugin | null {
  if (typeof window === 'undefined') return null;
  const plugins = (window as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor?.Plugins;
  return (plugins?.AdMob as AdMobPlugin | undefined) ?? null;
}

/** 플러그인 존재만이 아니라 쓸 메서드가 함수인지까지 본다 — 모양 다른 빌드에서 죽은 버튼 방지 */
function nativeAdSupported(): boolean {
  const admob = getAdMobPlugin();
  return admob !== null
    && typeof admob.prepareRewardVideoAd === 'function'
    && typeof admob.showRewardVideoAd === 'function';
}

function urlHasDebug1(): boolean {
  try {
    if (typeof location === 'undefined') return false;
    return new URLSearchParams(location.search).get('debug') === '1';
  } catch {
    return false;
  }
}

let initPromise: Promise<void> | null = null;
function ensureInitialized(admob: AdMobPlugin): Promise<void> {
  if (typeof admob.initialize !== 'function') return Promise.resolve();
  if (initPromise) return initPromise;
  const p = Promise.resolve(admob.initialize())
    .then(() => undefined)
    .catch(() => { initPromise = null; }); // 실패는 기억하지 않는다 — 다음 시도에서 재시도
  initPromise = p;
  return p;
}

async function addListenerSafe(
  admob: AdMobPlugin,
  event: string,
  handler: (info?: unknown) => void,
): Promise<ListenerHandle | null> {
  if (typeof admob.addListener !== 'function') return null;
  try {
    return (await admob.addListener(event, handler)) ?? null;
  } catch {
    return null;
  }
}

function hasRewardAmount(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const amount = (value as { amount?: unknown }).amount;
  return typeof amount === 'number' && Number.isFinite(amount) && amount > 0;
}

// ★동시 호출 가드(08-30 검증 P1): 리스너가 전역이라 더블탭 시 광고 1개의 보상 이벤트가
// 두 호출 모두에 전달돼 N배 지급이 됐다. 진행 중이면 즉시 'fail' — 세 호출부를 한 번에 막는다.
let adInFlight = false;

/** 네이티브 리워드 광고 1회 — earned/dismissed/failed 를 AdResult로 접는다 */
async function showNativeRewarded(): Promise<AdResult> {
  const admob = getAdMobPlugin();
  if (!admob) return 'fail';
  if (adInFlight) return 'fail';
  adInFlight = true;
  const handles: ListenerHandle[] = [];
  let earned = false;
  let settle: ((o: AdResult) => void) | null = null;
  const closed = new Promise<AdResult>((resolve) => { settle = resolve; });
  try {
    await ensureInitialized(admob);
    const rewardHandle = await addListenerSafe(admob, REWARD_EVENT, () => { earned = true; });
    const dismissHandle = await addListenerSafe(admob, DISMISS_EVENT, () => {
      settle?.(earned ? 'ok' : 'skip');
      settle = null;
    });
    const failHandle = await addListenerSafe(admob, LOAD_FAILED_EVENT, (info) => {
      // 에러 코드(1=잘못된 요청·3=no fill)가 실패 원인 특정의 유일한 창구 — 로그로만
      console.warn('[ads] load failed', info);
    });
    // ★show 실패(액티비티 전환 등)는 Dismissed도 show() resolve도 없다 — 이걸 안 들으면
    // 경주 전 팔이 침묵해 180초를 꽉 채운다 (08-30 검증)
    const showFailHandle = await addListenerSafe(admob, SHOW_FAILED_EVENT, (info) => {
      console.warn('[ads] show failed', info);
      settle?.('fail');
      settle = null;
    });
    for (const h of [rewardHandle, dismissHandle, failHandle, showFailHandle]) if (h) handles.push(h);

    // ★prepare 림보 상한(08-30 검증): settle 경주는 prepare 이후에야 시작되므로 여기가 사각.
    await Promise.race([
      admob.prepareRewardVideoAd!({ adId: REWARDED_AD_UNIT_ID }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('prepare timeout')), PREPARE_TIMEOUT_MS)),
    ]);

    // ★show()를 그대로 await 금지: 플러그인은 보상 획득 시에만 resolve한다 —
    // 중간에 닫으면 영영 대기라 닫힘·타임아웃과 경주시킨다 (podoal 실측).
    const shownRace: Promise<AdResult> = Promise.resolve(admob.showRewardVideoAd!()).then(
      (shown) => {
        if (hasRewardAmount(shown)) earned = true;
        return dismissHandle ? new Promise<never>(() => { /* 닫힘 이벤트에 판정 위임 */ }) : 'ok';
      },
      () => 'fail' as const,
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<AdResult>((resolve) => {
      timer = setTimeout(() => resolve(earned ? 'ok' : 'skip'), SETTLE_TIMEOUT_MS);
    });
    try {
      return await Promise.race(dismissHandle ? [closed, timeout, shownRace] : [timeout, shownRace]);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.warn('[ads] rewarded failed', { err, adId: REWARDED_AD_UNIT_ID });
    return 'fail';
  } finally {
    adInFlight = false;
    for (const h of handles) {
      try { h.remove?.(); } catch { /* 해제 실패 무해 */ }
    }
  }
}

/**
 * AdsPort.
 * - 네이티브 셸 + AdMob 플러그인 → 실제 리워드 광고.
 * - 웹(?debug=1 제외) → ready()=false, showRewarded='skip' — 광고를 위장하지 않는다 (P0-2).
 * - 헤드리스 테스트(window 없음) → 결정론 'ok'.
 */
export function createAdsPort(opts?: { debugAutoOk?: boolean }): AdsPort {
  const debugAutoOk = opts?.debugAutoOk ?? urlHasDebug1();

  return {
    ready(): boolean {
      if (typeof window === 'undefined') return true;
      if (nativeAdSupported()) return true;
      return debugAutoOk;
    },

    async showRewarded(_kind: AdKind): Promise<AdResult> {
      try {
        if (typeof window === 'undefined') return 'ok';
        if (nativeAdSupported()) return await showNativeRewarded();
        if (debugAutoOk) return 'ok';
        return 'skip';
      } catch {
        return 'fail';
      }
    },
  };
}
