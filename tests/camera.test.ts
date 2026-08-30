import { describe, it, expect } from 'vitest';
import { cameraFollowY } from '../src/render/camera';
import { makeState } from '../src/core/sim';
import { CAMERA, PLAYER, VIEW } from '../src/config';

// ★08-30 재설계 가드 + 원작 물리 도입(같은 날 오후, 사용자 확정):
// "발 1:1 추종"은 체공의 76% 동안 지면·예고 마커를 화면 밖으로 보냈다(QA 실측) — 그 폐기는 유지.
// 원작 물리(정점 8.2층)를 넣으면서 정점 부근에서만 카메라가 최소로 딸려 올라간다(≤30px).
// 지면·예고 마커는 여전히 전 구간 화면 안이다.
describe('카메라 (08-30: 지면 상시 가시 + 원작 물리)', () => {
  const apex = (PLAYER.JUMP_V0 * PLAYER.JUMP_V0) / (2 * PLAYER.GRAVITY);

  it('정점에서의 카메라 상승이 30px 이하 — 지면이 화면을 떠나지 않는다', () => {
    const overshoot = apex + PLAYER.H + CAMERA.HEADROOM - VIEW.FIELD_H;
    expect(overshoot).toBeLessThanOrEqual(30);
  });

  it('체공 대부분 구간에서 cam=0', () => {
    const s = makeState();
    for (const y of [0, 60, 140, 250, 340, 450]) {
      s.player.y = y;
      expect(cameraFollowY(s)).toBe(0);
    }
  });

  it('필드 상단을 뚫을 때만 최소로 딸려 올라간다', () => {
    const s = makeState();
    s.player.y = 600;
    expect(cameraFollowY(s)).toBe(600 + PLAYER.H + CAMERA.HEADROOM - VIEW.FIELD_H);
  });

  it('점프 정점 ≈ 8.2층 [원작 이식] (원작 980px/120px층 = 8.17층과 층 단위 일치)', () => {
    expect(apex / VIEW.FLOOR_H).toBeGreaterThan(7.5);
    expect(apex / VIEW.FLOOR_H).toBeLessThan(8.5);
  });

  it('체공 ≈ 4.67s [원작 이식] (시간축은 스케일 불변)', () => {
    const airtime = (2 * PLAYER.JUMP_V0) / PLAYER.GRAVITY;
    expect(airtime).toBeGreaterThan(4.4);
    expect(airtime).toBeLessThan(4.9);
  });
});
