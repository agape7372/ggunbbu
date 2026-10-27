// 정적 챕터 배경 — 오프스크린 1장에 한 번 굽고 매 프레임 그 한 장만 복사한다(T6 ②).
// 테마(키)가 바뀌거나 이미지가 다시 로드될 때만 다시 굽는다.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { drawBackdropCached, preloadAssets } from '../src/render/assets';
import { drawChapterBackdrop } from '../src/render/background';
import { VIEW } from '../src/config';

let canvases = 0;
beforeEach(() => {
  canvases = 0;
  vi.stubGlobal('Image', class {
    naturalWidth = 720;
    naturalHeight = 1280;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_v: string) { this.onload?.(); }
  });
  vi.stubGlobal('document', {
    createElement: () => {
      canvases++;
      return { width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => undefined, set: () => true }) };
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

function fakeCtx(): { ctx: CanvasRenderingContext2D; draws: unknown[][] } {
  const draws: unknown[][] = [];
  const ctx = {
    drawImage: (...a: unknown[]) => { draws.push(a); },
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, scale() {},
  } as unknown as CanvasRenderingContext2D;
  return { ctx, draws };
}

const FIELD_H = VIEW.FIELD_H - VIEW.FIELD_TOP;

it('같은 배경은 한 번만 굽고 프레임마다 한 장만 복사한다', async () => {
  await preloadAssets();
  const { ctx, draws } = fakeCtx();
  expect(drawBackdropCached(ctx, 'bg-europe', 0, VIEW.FIELD_TOP, VIEW.W, FIELD_H)).toBe(true);
  const baked = canvases;
  expect(baked).toBe(1);
  for (let i = 0; i < 5; i++) drawBackdropCached(ctx, 'bg-europe', 0, VIEW.FIELD_TOP, VIEW.W, FIELD_H);
  expect(canvases).toBe(baked);        // 다시 안 구웠다
  expect(draws).toHaveLength(6);       // 프레임마다 복사 한 번
  const [, dx, dy, dw, dh] = draws[0];
  expect([dx, dy, dw, dh]).toEqual([0, VIEW.FIELD_TOP, VIEW.W, FIELD_H]);
});

it('테마가 바뀌면 그때만 다시 굽는다', async () => {
  await preloadAssets();
  const { ctx } = fakeCtx();
  drawBackdropCached(ctx, 'bg-europe', 0, VIEW.FIELD_TOP, VIEW.W, FIELD_H);
  drawBackdropCached(ctx, 'bg-asia', 0, VIEW.FIELD_TOP, VIEW.W, FIELD_H);
  expect(canvases).toBe(2);
  drawBackdropCached(ctx, 'bg-asia', 0, VIEW.FIELD_TOP, VIEW.W, FIELD_H);
  expect(canvases).toBe(2);
});

it('이미지를 다시 로드하면(새 객체) 새로 굽는다', async () => {
  await preloadAssets();
  const { ctx } = fakeCtx();
  drawBackdropCached(ctx, 'bg-europe', 0, VIEW.FIELD_TOP, VIEW.W, FIELD_H);
  await preloadAssets();
  drawBackdropCached(ctx, 'bg-europe', 0, VIEW.FIELD_TOP, VIEW.W, FIELD_H);
  expect(canvases).toBe(2);
});

it('없는 배경은 false — 단색 폴백이 그대로 보인다', async () => {
  await preloadAssets();
  expect(drawBackdropCached(fakeCtx().ctx, 'bg-missing', 0, 0, 10, 10)).toBe(false);
  expect(canvases).toBe(0);
});

it('drawChapterBackdrop은 챕터 배경을 캐시 경로로 그린다', async () => {
  await preloadAssets();
  const { ctx, draws } = fakeCtx();
  expect(drawChapterBackdrop(ctx, { mode: 'act1', chapter: 0, act2Phase: null })).toBe(true);
  expect(draws).toHaveLength(1);
});
