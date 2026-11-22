import type { GameState } from './types';
import { CAMERA, STACK, STAGE, VIEW } from '../config';

/**
 * 세로 추종 카메라 — **발 추종**(11-22 개정: 발이 CAMERA.FOLLOW_Y를 넘으면 1:1. 정본 = config CAMERA 주석 끝 문단).
 * 아래 08-30 기록(데드존 150 · 상한 150)은 그때까지의 경위다 — 그 규칙은 실제 판에서 한 번도 안 움직였다.
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
 * core에 둔 이유: stage.ts가 건물 생김 높이(화면 맨 위 + STAGE.SPAWN_ABOVE)를 이 값으로 낸다.
 * 순수 값만 반환한다. 앞 프레임 카메라는 renderer가 쥔다(cameraClamp) — 여기에 상태를 두면
 * 테스트가 시뮬 상태만으로 카메라를 단언할 수 없게 된다.
 */
export function cameraFollowY(s: GameState): number {
  // ★11-22: 발이 FOLLOW_Y를 넘으면 1:1 추종(config CAMERA 주석). 위 08-30 기록의 「상한 150」은 낡았다
  return Math.max(0, Math.min(CAMERA.MAX, s.player.y - CAMERA.FOLLOW_Y));
}

/**
 * 높이 떠 있는 동안엔 다음 건물 대기를 예고 직전에 세워 둔다(11-22) — 내려온 뒤 화면 맨 위에서 예고부터 들어온다.
 * 안 세우면 생김 높이가 카메라를 따라 올라가 높이 부술수록 다음 건물을 오래 기다린다(숙련 봇 1-1 실측 34초 → 42초).
 * 예고가 이미 시작됐거나 붙어 오기(대기가 예고 길이보다 짧다)는 그대로 센다. true면 이번 틱은 세지 않는다.
 * 1막 · 토코톤(sim.trySpawn)과 지시서(stage.ts)가 같이 쓴다.
 */
export function holdSpawn(s: GameState): boolean {
  if (s.stackSpawnCd < STACK.SPAWN_CUE_TICKS || cameraFollowY(s) <= 0) return false;
  s.stackSpawnCd = Math.max(s.stackSpawnCd, STACK.SPAWN_CUE_TICKS + 1);
  return true;
}

/**
 * 화면 카메라 한 프레임(11-22 2차 · 원작 영상 실측): 오를 땐 발을 화면 바닥에서 FOLLOW_Y에 묶고,
 * 떨어질 땐 땅 자리(화면 바닥)에 묶는다. 그 사이 띠에선 안 움직인다. 보간은 없다.
 * 앞 프레임 값은 부르는 쪽(renderer · 검수 도구)이 쥔다.
 */
export function cameraClamp(cam: number, y: number): number {
  return Math.max(0, y - CAMERA.FOLLOW_Y, Math.min(cam, y));
}

/**
 * 건물이 생기는 높이 = 화면 맨 위 + STAGE.SPAWN_ABOVE. 지시서(stage.ts)와 아케이드 1막 · 토코톤(spawner.ts)이 같이 쓴다.
 * 화면 카메라는 발 높이까지 올라가 있을 수 있다(cameraClamp 위쪽 끝) — 그 끝으로 잡아야 화면 안에서 안 생긴다.
 */
export function spawnTopY(s: GameState): number {
  return VIEW.GROUND_Y - VIEW.FIELD_TOP + Math.min(CAMERA.MAX, s.player.y) + STAGE.SPAWN_ABOVE;
}
