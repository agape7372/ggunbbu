import type { GameState } from '../core/types';
import { CAMERA } from '../config';

/** 플레이어 발을 따라간다. 스택 클램프는 고점프를 화면 밖으로 밀어서 쓰지 않는다. */
export function cameraFollowY(s: GameState): number {
  return Math.max(0, s.player.y - CAMERA.KEEP_PX);
}
