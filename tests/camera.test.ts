import { describe, it, expect } from 'vitest';
import { cameraFollowY } from '../src/render/camera';
import { makeState } from '../src/core/sim';
import { makeFloor, makeStack } from '../src/core/building';
import { CAMERA, PLAYER, VIEW } from '../src/config';

describe('카메라', () => {
  it('지면에서는 0', () => {
    const s = makeState();
    expect(cameraFollowY(s)).toBe(0);
  });

  it('높은 점프에서 지면이 필드 밖으로 나가게 따라간다', () => {
    const s = makeState();
    s.player.y = 720;
    const cam = cameraFollowY(s);
    expect(cam).toBe(720 - CAMERA.KEEP_PX);
    expect(VIEW.GROUND_Y + cam).toBeGreaterThan(VIEW.FIELD_H);
  });

  it('점프 정점 ≈ 10층', () => {
    const apex = (PLAYER.JUMP_V0 * PLAYER.JUMP_V0) / (2 * PLAYER.GRAVITY);
    expect(apex).toBeGreaterThan(650);
    expect(apex).toBeLessThan(800);
    expect(apex / VIEW.FLOOR_H).toBeGreaterThan(9);
  });

  it('스택이 있어도 플레이어를 따라간다', () => {
    const s = makeState();
    s.player.y = 400;
    s.stack = makeStack({
      variant: 'building',
      theme: 'europe',
      floors: [makeFloor('weak')],
      y: 80,
    });
    expect(cameraFollowY(s)).toBe(400 - CAMERA.KEEP_PX);
  });
});
