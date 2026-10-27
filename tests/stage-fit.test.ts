// 안전영역 맞춤(UI-01·T4): 인셋 없는 웹은 예전 계산 그대로, 인셋이 있으면 남은 상자 안에 앉는다.
import { describe, it, expect } from 'vitest';
import { fitStageBox } from '../src/render/stageFit';
import { VIEW } from '../src/config';

const none = { top: 0, right: 0, bottom: 0, left: 0 };

describe('무대 맞춤', () => {
  it('인셋 0이면 예전 레터박스 계산(창 전체 기준)과 같다', () => {
    const f = fitStageBox(375, 812, none);
    expect(f.scale).toBe(Math.min(375 / VIEW.W, 812 / VIEW.H));
    expect(f.dx).toBe(0);
    expect(f.dy).toBe(0);
  });

  it('상단 32·하단 24(제스처 바)를 빼면 세로가 줄어 배율이 작아지고 상자 중심으로 내려앉는다', () => {
    const f = fitStageBox(412, 915, { ...none, top: 32, bottom: 24 });
    expect(f.scale).toBeCloseTo((915 - 32 - 24) / VIEW.H, 6); // 세로가 먼저 닿는다
    expect(f.dy).toBe(4);                                    // (32-24)/2: 안전 상자 중심은 창 중심보다 4px 아래
    expect(f.dx).toBe(0);
    // 무대 위·아래 끝이 각 인셋 바깥으로 안 나간다
    const half = (VIEW.H * f.scale) / 2;
    expect(915 / 2 + f.dy - half).toBeGreaterThanOrEqual(32 - 1e-9);
    expect(915 / 2 + f.dy + half).toBeLessThanOrEqual(915 - 24 + 1e-9);
  });

  it('3버튼 내비(하단 48)도 같은 식으로 처리한다', () => {
    const f = fitStageBox(412, 915, { ...none, top: 32, bottom: 48 });
    const half = (VIEW.H * f.scale) / 2;
    expect(915 / 2 + f.dy + half).toBeLessThanOrEqual(915 - 48 + 1e-9);
  });

  it('가로 인셋(노치·가로 모드)은 폭과 좌우 이동에 반영된다', () => {
    const f = fitStageBox(800, 360, { ...none, left: 40, right: 20 });
    expect(f.dx).toBe(10);
    expect(f.scale).toBeCloseTo(Math.min((800 - 60) / VIEW.W, 360 / VIEW.H), 6);
  });

  it('이상한 인셋(NaN·음수·화면 대부분)에도 무대가 사라지지 않는다', () => {
    const f = fitStageBox(400, 800, { top: Number.NaN, bottom: -30, left: 9999, right: 9999 });
    expect(f.scale).toBeGreaterThan(0);
    expect(Number.isFinite(f.dx) && Number.isFinite(f.dy)).toBe(true);
  });
});
