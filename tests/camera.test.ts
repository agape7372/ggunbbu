import { describe, it, expect } from 'vitest';
import { cameraFollowY, holdSpawn, spawnTopY } from '../src/core/camera';
import { makeState } from '../src/core/sim';
import { CAMERA, PLAYER, STACK, VIEW } from '../src/config';

// ★11-22 계약 개정 (사용자: "점프, 카메라 따라가기가 너무 역동적이지 않음. 원작처럼 높게 올라가서 다다다다다").
// 08-30 4차 계약(발 381px부터 · 상한 150)은 실제 판에서 한 번도 안 움직였다 — 뛰면 그 전에 밑면에 막힌다.
// 새 계약:
//   ① 발이 FOLLOW_Y 아래면 cam=0 — 땅 연타 구간은 화면이 붙박이다
//   ② 그 위로는 발 높이를 1:1로 따라간다
//   ③ 높이 떠 있는 동안엔 다음 건물 대기를 예고 직전에 세워 둔다(내려온 뒤 화면 맨 위에서 들어온다)
// cam>0이면 지면선은 화면 아래로 밀린다(렌더 변환상 못 피한다) — renderer의 지면 인디케이터가 진다.
describe('카메라 (11-22: 발 추종)', () => {
  const apex = (PLAYER.JUMP_V0 * PLAYER.JUMP_V0) / (2 * PLAYER.GRAVITY);

  it('FOLLOW_Y 아래에서는 cam=0 — 땅 구간은 화면이 붙박이다', () => {
    const s = makeState();
    for (const y of [0, 60, CAMERA.FOLLOW_Y]) {
      s.player.y = y;
      expect(cameraFollowY(s)).toBe(0);
    }
  });

  it('그 위로는 발 높이를 1:1로 따라간다 — 빈 점프 정점에서 400px쯤', () => {
    const s = makeState();
    s.player.y = CAMERA.FOLLOW_Y + 40;
    expect(cameraFollowY(s)).toBeCloseTo(40, 6);
    s.player.y = apex;
    expect(cameraFollowY(s)).toBeGreaterThan(350);
  });

  it('공중 베기 상한까지 올라가도 카메라가 놓치지 않는다', () => {
    // 가장 높이 가는 길 = 밑면이 상한에 닿은 채 마지막 층을 깨고 솟는다
    const top = PLAYER.AIR_CUT_CEIL + VIEW.FLOOR_H + (PLAYER.AIR_CUT_RISE_V * PLAYER.AIR_CUT_RISE_V) / (2 * PLAYER.GRAVITY);
    expect(CAMERA.MAX).toBeGreaterThan(top - CAMERA.FOLLOW_Y);
  });

  it('높이 떠 있으면 다음 건물 대기가 예고 직전에 선다 — 내려오면 다시 센다', () => {
    const s = makeState();
    s.stackSpawnCd = STACK.RESPAWN_TICKS;
    s.player.y = 600;
    expect(holdSpawn(s)).toBe(true);
    expect(s.stackSpawnCd).toBe(STACK.RESPAWN_TICKS);
    s.stackSpawnCd = STACK.SPAWN_CUE_TICKS; // 지시서 대기(예고 길이와 같다)도 예고 앞에서 선다
    expect(holdSpawn(s)).toBe(true);
    expect(s.stackSpawnCd).toBe(STACK.SPAWN_CUE_TICKS + 1);
    s.player.y = CAMERA.FOLLOW_Y;
    expect(holdSpawn(s)).toBe(false);
  });

  it('예고가 시작됐거나 붙어 오기면 안 세운다 — 그땐 화면 맨 위(카메라) 위에서 생긴다', () => {
    const s = makeState();
    s.stackSpawnCd = STACK.SPAWN_CUE_TICKS - 1;
    s.player.y = 600;
    expect(holdSpawn(s)).toBe(false);
    expect(spawnTopY(s)).toBeGreaterThan(s.player.y + PLAYER.H + 300);
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
