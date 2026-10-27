// 종이 오려내기 후광 — 캐시는 캔버스 DPR과 무관하게 고정 2배, 같은 그림·프레임은 한 번만 굽는다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JUICE_SYS, PALETTE } from '../src/config';
import { drawHalo, haloFor, makeHalo } from '../src/render/halo';

interface FakeCanvas { width: number; height: number; ops: string[]; getContext: () => unknown }
let made: FakeCanvas[] = [];

function stubDocument(): void {
  made = [];
  vi.stubGlobal('document', {
    createElement: () => {
      const cv: FakeCanvas = {
        width: 0, height: 0, ops: [],
        getContext: () => new Proxy({}, {
          get: (_t, k: string) => (...a: unknown[]) => { cv.ops.push(`${k}:${a.length}`); },
          set: (_t, k: string, v) => { cv.ops.push(`${k}=${String(v)}`); return true; },
        }),
      };
      made.push(cv);
      return cv;
    },
  });
}

beforeEach(stubDocument);
afterEach(() => vi.unstubAllGlobals());

describe('후광 캐시', () => {
  const SS = JUICE_SYS.HALO_SS;

  it('논리 크기의 고정 2배(+여백)로 굽는다 — 화면 DPR은 입력이 아니다', () => {
    const halo = makeHalo({} as CanvasImageSource, 0, 0, 144, 152, 72, 76)!;
    expect(halo).not.toBeNull();
    expect(halo.cv.width).toBeGreaterThanOrEqual(72 * SS);
    expect(halo.cv.height).toBeGreaterThanOrEqual(76 * SS);
    expect(halo.cv.width).toBeLessThan(72 * SS + 16);   // 여백은 몇 px뿐
    expect(halo.pad).toBeGreaterThan(JUICE_SYS.HALO_PX * 0.9); // 번짐 반경(논리 px)은 담긴다
    expect(made).toHaveLength(2); // 실루엣 · 후광
  });

  it('후광은 아이보리 한 색으로 채운다(source-in) — 그림자·그라데이션 없음', () => {
    makeHalo({} as CanvasImageSource, 0, 0, 10, 10, 10, 10);
    const ops = made[1].ops;
    expect(ops).toContain('globalCompositeOperation=source-in');
    expect(ops).toContain(`fillStyle=${PALETTE.BG}`);
    expect(ops.filter((o) => o.startsWith('drawImage')).length).toBeGreaterThanOrEqual(16); // 16방향 + 본체
  });

  it('같은 그림·같은 id는 한 번만 굽는다', () => {
    const src = {} as CanvasImageSource & object;
    const a = haloFor(src, '0', 0, 0, 10, 10, 10, 10);
    const n = made.length;
    const b = haloFor(src, '0', 0, 0, 10, 10, 10, 10);
    expect(b).toBe(a);
    expect(made).toHaveLength(n);
    haloFor(src, '1', 10, 0, 10, 10, 10, 10); // 다른 프레임은 새로
    expect(made.length).toBeGreaterThan(n);
  });

  it('그림이 다시 로드되면(새 객체) 새로 굽는다', () => {
    const a = haloFor({} as CanvasImageSource & object, '0', 0, 0, 10, 10, 10, 10);
    const b = haloFor({} as CanvasImageSource & object, '0', 0, 0, 10, 10, 10, 10);
    expect(b).not.toBe(a);
  });

  it('DOM이 없으면 null — 후광은 없어도 게임은 그대로', () => {
    vi.unstubAllGlobals();
    expect(makeHalo({} as CanvasImageSource, 0, 0, 10, 10, 10, 10)).toBeNull();
  });

  it('그릴 때는 여백만큼 바깥으로 나가 논리 크기로 줄여 그린다', () => {
    const halo = makeHalo({} as CanvasImageSource, 0, 0, 20, 20, 10, 10)!;
    const calls: number[][] = [];
    const ctx = {
      imageSmoothingEnabled: false,
      drawImage: (_i: unknown, ...a: number[]) => calls.push(a),
    } as unknown as CanvasRenderingContext2D;
    drawHalo(ctx, halo, 100, 200);
    expect(calls).toHaveLength(1);
    const [dx, dy, dw, dh] = calls[0];
    expect(dx).toBeCloseTo(100 - halo.pad);
    expect(dy).toBeCloseTo(200 - halo.pad);
    expect(dw).toBeCloseTo(halo.cv.width / SS);
    expect(dh).toBeCloseTo(halo.cv.height / SS);
    expect(ctx.imageSmoothingEnabled).toBe(false); // 원래 설정 복구
  });
});
