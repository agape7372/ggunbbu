import { describe, it, expect } from 'vitest';
import { cameraFollowY } from '../src/render/camera';
import { makeState } from '../src/core/sim';
import { CAMERA, PLAYER, VIEW } from '../src/config';

// ★08-30 4차 계약 개정 (사용자 실플레이 영상 판정: "카메라가 고정되어있잖아").
// 이 파일이 그 전까지 가드하던 계약은 "정점에서도 ≤30px" = 사실상 고정 카메라였고,
// 그게 지적받은 화면이다. 새 계약은 셋이다:
//   ① 데드존 아래에서는 cam=0 — 지상 구간은 지면·낙하물·예고 마커가 붙박이로 보인다
//   ② 높이 뛰면 카메라가 실제로 따라 올라간다
//   ③ 올라가는 거리에는 상한이 있다(CAMERA.MAX) — 지면이 무한정 멀어지지 않는다
// ⚠ cam>0이면 지면선은 화면 아래로 밀려난다. 그건 렌더 변환상 못 피한다(config CAMERA 주석).
// "지면 소실 0%"는 더 이상 계약이 아니다 — 대신 거리 상한 + renderer의 지면 인디케이터가 진다.
describe('카메라 (08-30 4차: 데드존 추종 + 거리 상한)', () => {
  const apex = (PLAYER.JUMP_V0 * PLAYER.JUMP_V0) / (2 * PLAYER.GRAVITY);
  /** cam이 0을 벗어나기 시작하는 발 높이 */
  const onset = VIEW.FIELD_H - CAMERA.DEADZONE - PLAYER.H - CAMERA.HEADROOM;

  it('데드존 아래에서는 cam=0 — 지상 구간은 화면이 붙박이다', () => {
    const s = makeState();
    for (const y of [0, 60, 140, 250, Math.floor(onset)]) {
      s.player.y = y;
      expect(cameraFollowY(s)).toBe(0);
    }
  });

  it('정점에서는 카메라가 실제로 올라간다 (구 계약 24px → 최소 150px)', () => {
    const s = makeState();
    s.player.y = apex;
    expect(cameraFollowY(s)).toBeGreaterThanOrEqual(150);
  });

  it('데드존을 넘으면 발 높이를 1:1로 따라간다 (상한 전까지)', () => {
    const s = makeState();
    const y = onset + 40;
    s.player.y = y;
    expect(cameraFollowY(s)).toBeCloseTo(40, 6);
  });

  it('cam은 CAMERA.MAX를 절대 넘지 않는다 — 지면이 무한정 멀어지지 않는다', () => {
    const s = makeState();
    for (const y of [apex, apex * 2, 5000]) {
      s.player.y = y;
      expect(cameraFollowY(s)).toBeLessThanOrEqual(CAMERA.MAX);
    }
  });

  it('폐기된 1:1 추종(정점에서 415px)보다 한참 짧다', () => {
    // 08-30 1차가 폐기한 규칙 = max(0, y − 140). 그 정점 값의 절반 미만으로 묶는다.
    expect(CAMERA.MAX).toBeLessThan((apex - 140) * 0.5);
  });

  it('점프 정점 ≈ 8.2층 [원작 이식] (원작 980px/120px층 = 8.17층과 층 단위 일치)', () => {
    expect(apex / VIEW.FLOOR_H).toBeGreaterThan(7.5);
    expect(apex / VIEW.FLOOR_H).toBeLessThan(8.5);
  });

  it('상승 ≈ 0.80s [튜닝] — 시간축은 5차에 압축됐다 (체공 계약은 jump.test가 가드)', () => {
    const rise = PLAYER.JUMP_V0 / PLAYER.GRAVITY;
    expect(rise).toBeGreaterThan(0.67);
    expect(rise).toBeLessThan(0.93);
  });
});
