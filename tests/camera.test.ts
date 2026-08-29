import { describe, it, expect } from 'vitest';
import { cameraFollowY } from '../src/render/camera';
import { makeState } from '../src/core/sim';
import { CAMERA, PLAYER, VIEW } from '../src/config';

// ★08-30 재설계 가드: "발 1:1 추종"은 체공의 76% 동안 지면·예고 마커를 화면 밖으로
// 보냈다(QA 실측). 새 불변식 — 정상 점프 전 구간에서 cam=0(지면 상시 가시).
describe('카메라 (08-30: 지면 상시 가시)', () => {
  const apex = (PLAYER.JUMP_V0 * PLAYER.JUMP_V0) / (2 * PLAYER.GRAVITY);

  it('점프 정점이 필드 안에 들어온다 (정점+키+여유 ≤ FIELD_H)', () => {
    expect(apex + PLAYER.H + CAMERA.HEADROOM).toBeLessThanOrEqual(VIEW.FIELD_H);
  });

  it('정상 점프 전 구간에서 cam=0 — 지면·예고 마커가 화면을 떠나지 않는다', () => {
    const s = makeState();
    for (const y of [0, 60, 140, 250, 340, apex]) {
      s.player.y = y;
      expect(cameraFollowY(s)).toBe(0);
    }
  });

  it('필드 상단을 뚫을 때만 최소로 딸려 올라간다', () => {
    const s = makeState();
    s.player.y = 600;
    expect(cameraFollowY(s)).toBe(600 + PLAYER.H + CAMERA.HEADROOM - VIEW.FIELD_H);
  });

  it('점프 정점 ≈ 5층대 (1600 시절 10.6층 회귀 방지)', () => {
    expect(apex / VIEW.FLOOR_H).toBeGreaterThan(4.5);
    expect(apex / VIEW.FLOOR_H).toBeLessThan(6.5);
  });
});
