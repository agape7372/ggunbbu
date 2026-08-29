// 08-30 스윕: platform/types.ts(iap·ads와 중복 정의 사문)를 삭제하며 키를 이관
const DEV_UNLOCK_KEY = 'gunbbu.devUnlock';

/** ?debug=1 또는 디버그 메뉴 전해금. 플레이어 빌드에서는 둘 다 없음. */
export function isDevUnlocked(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if (new URLSearchParams(window.location.search).get('debug') === '1') return true;
    return window.localStorage.getItem(DEV_UNLOCK_KEY) === '1';
  } catch {
    return false;
  }
}
