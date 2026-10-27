import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BOSS } from '../src/config';
import { initBoss } from '../src/core/boss';
import { img } from '../src/render/assets';
import { drawExecutor } from '../src/render/executor';

vi.mock('../src/render/assets', async importOriginal => ({
  ...await importOriginal<typeof import('../src/render/assets')>(),
  img: vi.fn(),
}));

const crops: number[][] = [];
let made = 0;
const atlas = { width: 538, height: 358 } as HTMLCanvasElement; // 원본 1536x1024의 0.35배

function stubDocument(): void {
  vi.stubGlobal('document', {
    createElement: () => {
      made++;
      return { width: 0, height: 0, getContext: () => ({ drawImage: (_i: unknown, ...a: number[]) => crops.push(a) }) };
    },
  });
}
const ctx = new Proxy({}, { get: (_t, k) => k === 'drawImage' ? vi.fn() : vi.fn() }) as unknown as CanvasRenderingContext2D;

beforeEach(() => { crops.length = 0; made = 0; vi.mocked(img).mockReset(); stubDocument(); });
afterEach(() => vi.unstubAllGlobals());

it('cuts each executor part once at 2x of its drawn size, scaled to the shrunk atlas', () => {
  vi.mocked(img).mockImplementation(key => key === 'boss' ? atlas : null);
  const boss = initBoss();
  drawExecutor(ctx, boss, 600);
  const first = made;
  expect(first).toBe(3); // 본체 · 왼 집게 · 오른 집게
  // 본체: 원본 [46,149,1444,180] x 0.35 -> 목적 250x44의 2배(500x88)로 한 번
  const body = crops.find(c => c[6] === BOSS.BODY_W * 2)!;
  expect(body.slice(0, 4).map(Math.round)).toEqual([16, 52, 506, 63]);
  expect(body.slice(4)).toEqual([0, 0, BOSS.BODY_W * 2, BOSS.BODY_H * 2]);
  drawExecutor(ctx, boss, 600);
  drawExecutor(ctx, boss, 600);
  expect(made).toBe(first); // 프레임이 지나도 다시 자르지 않는다
});

it('rebuilds the cache when the atlas image is reloaded', () => {
  vi.mocked(img).mockImplementation(key => key === 'boss' ? atlas : null);
  drawExecutor(ctx, initBoss(), 600);
  const first = made;
  const reloaded = { width: 538, height: 358 } as HTMLCanvasElement;
  vi.mocked(img).mockImplementation(key => key === 'boss' ? reloaded : null);
  drawExecutor(ctx, initBoss(), 600);
  expect(made).toBe(first + 3);
});
