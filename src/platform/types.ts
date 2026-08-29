// 건뿌 플랫폼 공통 타입.
// DOM·canvas·네이티브 SDK import 금지. 웹 코어는 런타임 의존성 0.
// Capacitor/AdMob/Billing 구현체는 셸이 핸들러로 주입한다(이 파일은 계약만).

/** 보상형 광고 슬롯. 플레이 중 전면광고는 두지 않는다. */
export type AdKind = 'revive' | 'missionBoost' | 'orbitPack';

/** ok=보상 지급, fail=로드/표시 실패, skip=웹 스텁·시청 거부. */
export type AdResult = 'ok' | 'fail' | 'skip';

export type AdsHandler = (kind: AdKind) => Promise<AdResult>;

/**
 * 인앱 상품 id.
 * 구독·₩2,200대·부활광고 제거 SKU는 두지 않는다(F2P 루프 보호, 전 SKU ≤ 1900).
 */
export type SkuId =
  | 'orbit_s'
  | 'orbit_m'
  | 'orbit_l'
  | 'skin_blade'
  | 'skin_body'
  | 'skin_letters'
  | 'waza_unlock';

export interface Sku {
  id: SkuId;
  /** 원화 표시가. 부가세 포함 표기, 전부 ≤ 1900. */
  krw: number;
  title: string;
  blurb: string;
}

export type PurchaseResult = 'ok' | 'cancel' | 'fail';

export type PurchaseHandler = (id: SkuId) => Promise<PurchaseResult>;

/** 디버그 전해금 플래그 키. 값은 `'1'`. 비밀 아님. */
export const DEV_UNLOCK_KEY = 'gunbbu.devUnlock';
