// 08-30 스윕: platform/types.ts(iap·ads와 중복 정의 사문)를 삭제하며 키를 이관
const DEV_UNLOCK_KEY = 'gunbbu.devUnlock';

/**
 * 디버그 도구(로고 7연타 · 가드+필살 메뉴 · 전해금)를 싣는 빌드 = 개발 빌드, 또는 VITE_TESTER=1로 구운 시험판.
 * 시험판은 사용자가 폰으로 쓰는 미리보기 주소라 거기서 테스트 해금이 돼야 한다(10-31). 릴리스에 실리면 check-release가 막는다.
 */
export const DEV_TOOLS: boolean = import.meta.env.DEV || import.meta.env.VITE_TESTER === '1';

/** ?debug=1 또는 디버그 메뉴 전해금. 플레이어 빌드에서는 둘 다 없음. */
export function isDevUnlocked(): boolean {
  if (!DEV_TOOLS) return false; // 디버그 경로는 개발 빌드 · 시험판에서만
  try {
    if (typeof window === 'undefined') return false;
    if (new URLSearchParams(window.location.search).get('debug') === '1') return true;
    return window.localStorage.getItem(DEV_UNLOCK_KEY) === '1';
  } catch {
    return false;
  }
}
