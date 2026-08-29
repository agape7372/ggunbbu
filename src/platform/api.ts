// 건뿌 백엔드 계약(타입·주석만). fetch 호출 없음.
//
// 충돌 정책:
//   P2 — 로컬(저장소)이 정본. 서버는 아직 없고, 클라 상태가 진실이다.
//   P3 — 서버가 정본. 충돌 시 서버 값이 이긴다(클라 덮어씀).

export interface GuestSession {
  guestId: string;
  token: string;
}

export type ApiPath =
  | 'POST /v1/guest'
  | 'GET /v1/profile'
  | 'GET /v1/missions'
  | 'POST /v1/missions/:id/claim'
  | 'POST /v1/ads/ssv'
  | 'POST /v1/iap/verify'
  | 'GET /v1/inventory'
  | 'PUT /v1/loadout';

/** path별 요청 바디 스케치. 구현·검증은 P3. */
export const API_CONTRACT: readonly { path: ApiPath; body: string }[] = [
  { path: 'POST /v1/guest', body: '없음 → GuestSession' },
  { path: 'GET /v1/profile', body: '없음. Authorization: Bearer token' },
  { path: 'GET /v1/missions', body: '없음. 일일·업적 목록' },
  { path: 'POST /v1/missions/:id/claim', body: '{ adBoost?: boolean }' },
  { path: 'POST /v1/ads/ssv', body: '{ kind, impressionId, signature }' },
  { path: 'POST /v1/iap/verify', body: '{ sku, receipt }' },
  { path: 'GET /v1/inventory', body: '없음. 스킨·필살·궤도' },
  { path: 'PUT /v1/loadout', body: '{ waza, body, blade, letters }' },
];
