import type { GameState } from '../core/types';
import { CAMERA, PLAYER, VIEW } from '../config';

/**
 * 플레이어가 필드 상단을 뚫으려 할 때만 최소로 올라간다. 정상 점프(정점+키+여유 < 필드)에선
 * 항상 0 — 지면·낙하물·예고 마커가 화면을 떠나지 않는다.
 * ★08-30: "발 1:1 추종"을 실측(체공 76% 지면 소실) 근거로 폐기 — config.CAMERA 주석 참조.
 */
export function cameraFollowY(s: GameState): number {
  return Math.max(0, s.player.y + PLAYER.H + CAMERA.HEADROOM - VIEW.FIELD_H);
}
