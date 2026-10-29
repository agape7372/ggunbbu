import { describe, it, expect } from 'vitest';
import { makeState, advance } from '../src/core/sim';
import { EMPTY_INPUT, type InputFrame } from '../src/core/types';
import { CAMERA, PLAYER, VIEW } from '../src/config';

// ★08-30 5차 — 점프는 **단발 엣지**다. 한 번 누르면 끝까지 솟는다.
//
// 4차에 나는 원작 수치(GRAVITY 204 / JUMP_V0 476)를 지키려고 가변 점프(홀드 컷)를 넣었다.
// 수치는 지켰지만 조작 문법을 바꿔버렸고, 사용자가 그걸 되돌렸다 —
//   "점프가 한번 누르면 슝 솟아야하는데 왜 누르고있게만들었어?"
// 그래서 홀드 계열(jumpHold·JUMP_CUT·FALL_MUL)을 전부 철거하고 **시간축만** 압축했다:
// 정점(8.2층)은 원작 그대로, 체공만 4.67초 → 1.60초. 이 파일이 그 계약을 가드한다.
function inp(o: Partial<InputFrame> = {}): InputFrame {
  return { ...EMPTY_INPUT, ...o };
}

/** 점프 키를 **한 프레임만** 누르고 끝까지 방치한다. 홀드가 필요 없다는 것 자체가 계약이다. */
function tapJump(): { apex: number; airTicks: number; riseTicks: number } {
  const s = makeState();
  s.stackSpawnCd = 100000; // 낙하 건물에 막히지 않는 순수 궤적
  advance(s, inp({ jump: true }));
  let apex = 0;
  let riseTicks = 0;
  let airTicks = 0;
  let rising = true;
  for (let i = 0; i < 600; i++) {
    advance(s, inp()); // ← 이후 입력 없음
    airTicks += 1;
    if (s.player.y > apex) apex = s.player.y;
    if (rising && s.player.vy <= 0) rising = false;
    if (rising) riseTicks += 1;
    if (s.player.y <= 0) break;
  }
  return { apex, airTicks, riseTicks };
}

describe('점프 — 단발 엣지 (08-30 5차)', () => {
  it('한 번 누르면 끝까지 솟는다 — 계속 누르고 있을 필요가 없다', () => {
    const { apex } = tapJump();
    const theoretical = (PLAYER.JUMP_V0 * PLAYER.JUMP_V0) / (2 * PLAYER.GRAVITY);
    expect(apex).toBeGreaterThan(theoretical * 0.97);
  });

  it('정점 ≈ 8.2층 [원작 이식] — 시간축을 압축해도 "몇 층까지 닿는가"는 안 변한다', () => {
    const { apex } = tapJump();
    expect(apex / VIEW.FLOOR_H).toBeGreaterThan(7.5);
    expect(apex / VIEW.FLOOR_H).toBeLessThan(8.5);
  });

  it('체공 ≈ 1.60초 [튜닝] — 원작 이론값 4.67초의 1/2.9', () => {
    const { airTicks } = tapJump();
    expect(airTicks).toBeGreaterThan(80);  // 1.33s
    expect(airTicks).toBeLessThan(112);    // 1.87s
  });

  it('상승 ≈ 0.80초 — "슝" 의 근거', () => {
    const { riseTicks } = tapJump();
    expect(riseTicks).toBeGreaterThan(40); // 0.67s
    expect(riseTicks).toBeLessThan(56);    // 0.93s
  });

  it('상승과 하강이 대칭이다 — FALL_MUL(하강 가속)은 철거됐다', () => {
    const { riseTicks, airTicks } = tapJump();
    const fallTicks = airTicks - riseTicks;
    expect(Math.abs(fallTicks - riseTicks)).toBeLessThan(riseTicks * 0.15);
  });

  // ★10-28 검수: 공격 버퍼가 점프를 이기고, 점프 버퍼가 공격 6틱 안에서 사라져 연타 중 점프가 0%였다.
  it('공격 연타 중에 누른 점프도 나간다 — 주기 안 어느 틱이든', () => {
    for (const period of [6, 7]) {
      for (let k = 0; k < period; k++) {
        const s = makeState();
        s.stackSpawnCd = 100000;
        let jumped = false;
        for (let t = 0; t < 60 && !jumped; t++) {
          const before = s.events.length;
          advance(s, inp({ attack: t % period === 0, jump: t === period * 4 + k }));
          jumped = s.events.slice(before).some((e) => e.kind === 'jump');
        }
        expect(jumped, `주기 ${period} · ${k}틱`).toBe(true);
      }
    }
  });

  it('공격과 점프를 같이 누르면 뛰고, 이어서 공중 공격이 나간다', () => {
    const s = makeState();
    s.stackSpawnCd = 100000;
    advance(s, inp({ attack: true, jump: true }));
    expect(s.player.pose).toBe('jump');
    advance(s, inp());
    expect(s.player.pose).toBe('attack');
    expect(s.player.attackFromAir).toBe(true);
  });

  it('정점이 필드를 살짝 넘는다 — 그래서 데드존 카메라가 필요하다 (설계 전제)', () => {
    const apex = (PLAYER.JUMP_V0 * PLAYER.JUMP_V0) / (2 * PLAYER.GRAVITY);
    // 머리 끝(apex + 키)이 필드 하단선을 넘어선다 = 고정 카메라로는 못 담는다.
    expect(apex + PLAYER.H).toBeGreaterThan(VIEW.FIELD_H);
    // 그래도 카메라 상한 안에서 전부 담긴다.
    expect(apex + PLAYER.H + CAMERA.HEADROOM).toBeLessThan(VIEW.FIELD_H + CAMERA.MAX);
  });
});
