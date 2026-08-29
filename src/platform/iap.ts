// 건뿌 인앱 결제 포트.
// 웹 스텁만. Play Billing / 원스토어 / Capacitor SDK import 금지(미설치).
// P2에서 네이티브 구현이 이 스텁을 교체한다. 구독·부활광고 제거 SKU 없음.
// 영수증 검증은 P3 POST /v1/iap/verify. 전 SKU krw는 정수이며 ≤ 1900.

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
  /** 원화 정수. 전부 ≤ 1900. */
  krw: number;
  /** 상점 표기명. */
  title: string;
  /** 궤도 지급량. 스킨·필살 해금은 없음. */
  orbit?: number;
}

export const SKUS: readonly Sku[] = [
  { id: 'orbit_s', krw: 1000, title: '궤도조각 · 소', orbit: 40 },
  { id: 'orbit_m', krw: 1500, title: '궤도조각 · 중', orbit: 80 },
  { id: 'orbit_l', krw: 1900, title: '궤도조각 · 대', orbit: 160 },
  { id: 'skin_blade', krw: 1200, title: '칼날 잉크' },
  { id: 'skin_body', krw: 1200, title: '몸통 잉크' },
  { id: 'skin_letters', krw: 1000, title: '효과글자' },
  { id: 'waza_unlock', krw: 1900, title: '필살 해금권' },
];

export type IapResult = 'ok' | 'cancel' | 'fail';

export interface IapPort {
  list(): readonly Sku[];
  /** 결제 경로가 실재하는가 — 웹은 false(상점 IAP 섹션 숨김), ?debug=1만 시뮬레이션 */
  available(): boolean;
  purchase(id: SkuId): Promise<IapResult>;
}

function urlHasDebug1(): boolean {
  try {
    if (typeof location === 'undefined') return false;
    return new URLSearchParams(location.search).get('debug') === '1';
  } catch {
    return false;
  }
}

/**
 * 웹 스텁 IapPort.
 * ★08-30(P0-2): purchase 항상 'ok'(전 SKU 무료 지급)를 봉인 — 웹은 available()=false,
 * purchase='fail'. ?debug=1만 성공 시뮬레이션. 절대 throw 하지 않는다.
 * 네이티브(Wave 4+ — v1은 IAP 미출시, ROADMAP 참조)가 이 구현을 교체한다.
 */
export function createIapPort(): IapPort {
  const debugAutoOk = urlHasDebug1();
  return {
    list(): readonly Sku[] {
      return SKUS;
    },

    available(): boolean {
      if (typeof window === 'undefined') return true; // 헤드리스 테스트 결정론
      return debugAutoOk;
    },

    async purchase(_id: SkuId): Promise<IapResult> {
      try {
        if (typeof window === 'undefined') return 'ok';
        return debugAutoOk ? 'ok' : 'fail';
      } catch {
        return 'fail';
      }
    },
  };
}
