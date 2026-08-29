// 건뿌 보상형 광고 포트.
// 웹 스텁만. Capacitor/AdMob 등 네이티브 SDK import 금지(미설치).
// P2에서 네이티브 구현이 이 스텁을 교체한다. 플레이 중 전면·배너 없음.

export type AdKind = 'revive' | 'missionBoost' | 'orbitPack';
export type AdResult = 'ok' | 'fail' | 'skip';

export interface AdsPort {
  ready(): boolean;
  showRewarded(kind: AdKind): Promise<AdResult>;
}

/** SSR/테스트: location 없음. 브라우저: ?debug=1 이면 true. */
function urlHasDebug1(): boolean {
  try {
    if (typeof location === 'undefined') return false;
    return new URLSearchParams(location.search).get('debug') === '1';
  } catch {
    return false;
  }
}

/**
 * 웹 스텁 AdsPort.
 * debugAutoOk 기본값 = URL ?debug=1 (location 가드).
 * showRewarded는 절대 throw 하지 않는다.
 *
 * 결과 정책(이 스텁):
 * - window 없음(테스트/SSR) → 즉시 'ok' (결정론)
 * - debugAutoOk → 즉시 'ok'
 * - 그 외 브라우저 → 0ms tick 후 'ok' (네이티브 미배선. P2가 교체)
 */
export function createAdsPort(opts?: { debugAutoOk?: boolean }): AdsPort {
  const debugAutoOk = opts?.debugAutoOk ?? urlHasDebug1();

  return {
    ready(): boolean {
      return true;
    },

    async showRewarded(_kind: AdKind): Promise<AdResult> {
      try {
        if (typeof window === 'undefined') return 'ok';
        if (debugAutoOk) return 'ok';
        // P2: 네이티브 RewardedAd가 이 분기를 교체. 지금은 스텁이라 'ok'.
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
        return 'ok';
      } catch {
        return 'fail';
      }
    },
  };
}
