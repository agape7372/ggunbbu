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
  purchase(id: SkuId): Promise<IapResult>;
}

/**
 * 웹 스텁 IapPort.
 * purchase는 항상 'ok' (네이티브 미배선). 테스트는 포트를 모킹한다.
 * 절대 throw 하지 않는다. P2 네이티브가 이 구현을 교체한다.
 */
export function createIapPort(): IapPort {
  return {
    list(): readonly Sku[] {
      return SKUS;
    },

    async purchase(_id: SkuId): Promise<IapResult> {
      try {
        return 'ok';
      } catch {
        return 'fail';
      }
    },
  };
}
