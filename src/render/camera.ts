import type { GameState } from '../core/types';
import { CAMERA, PLAYER, VIEW } from '../config';

/**
 * 세로 추종 카메라 — **데드존 + 상한**.
 *
 * 플레이어 머리가 필드 상단에서 `DEADZONE`만큼 아래에 오면 그때부터 따라 올라간다.
 * 지상 근처에서는 0이라 지면·낙하물·예고 마커가 붙박이로 보이고, 높이 뛸수록 화면이 따라간다.
 *
 * ★08-30 4차 개정 — 그 전 규칙("필드 상단을 뚫으려 할 때만")은 정점에서 겨우 24px만 올려
 * 사실상 고정 카메라였다(사용자 실플레이 판정 "카메라가 고정되어있잖아"). 지금은 정점에서 150px(상한).
 *
 * ★08-30 1차가 1:1 추종을 폐기한 근거(체공 76% 지면 소실)는 없앤 게 아니라 **한도를 씌웠다**.
 * `translate(0, cam)` 구조상 cam>0이면 지면선은 화면 아래로 밀려난다 — 그건 못 피한다.
 * 대신 `CAMERA.MAX`(150)로 거리를 폐기된 1:1 추종(정점 415px)의 36%로 묶고, cam>0 구간에는
 * renderer가 필드 바닥변에 지면선을 고정 표시한다.
 * ★09-05 정정: 여기 있던 "가변 점프가 짧은 탭을 cam=0으로 남기고"는 낡았다 — 가변 점프는
 * 08-30 5차에 철거됐다(점프 = 단발 엣지, CLAUDE.md 불변 규칙 7). cam=0 구간을 지키는 건
 * 데드존(150)과 짧아진 체공(1.60초)이다.
 * 되돌리려면 config.ts CAMERA 주석의 개정 사유부터 뒤집을 것.
 *
 * 순수 목표값만 반환한다. 프레임간 보간(`CAMERA.LERP`)은 renderer가 쥔다 — 여기에 상태를 두면
 * 테스트가 시뮬 상태만으로 카메라를 단언할 수 없게 된다.
 */
export function cameraFollowY(s: GameState): number {
  const want = s.player.y + PLAYER.H + CAMERA.HEADROOM - (VIEW.FIELD_H - CAMERA.DEADZONE);
  return Math.max(0, Math.min(CAMERA.MAX, want));
}
