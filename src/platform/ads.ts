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
 * ★08-30(P0-2): 웹에선 광고가 없다 — ready()=false, showRewarded='skip'.
 * 공개 Pages 빌드가 "광고 없이 항상 성공"을 싣고 있어 경제 전체가 무료였던 것을 봉인.
 * 호출부는 ready()로 미리 걸러 광고 문구 없는 UX를 보여준다(부활="일어나기").
 * debugAutoOk(?debug=1)만 성공 경로를 시뮬레이션. showRewarded는 절대 throw 하지 않는다.
 * 네이티브(Wave 4)는 window.Capacitor.Plugins 런타임 조회 구현이 이 스텁을 교체한다.
 */
export function createAdsPort(opts?: { debugAutoOk?: boolean }): AdsPort {
  const debugAutoOk = opts?.debugAutoOk ?? urlHasDebug1();

  return {
    ready(): boolean {
      if (typeof window === 'undefined') return true; // 헤드리스 테스트 결정론
      return debugAutoOk;
    },

    async showRewarded(_kind: AdKind): Promise<AdResult> {
      try {
        if (typeof window === 'undefined') return 'ok';
        if (debugAutoOk) return 'ok';
        return 'skip'; // 웹: 광고 미배선 — 성공을 위장하지 않는다
      } catch {
        return 'fail';
      }
    },
  };
}
