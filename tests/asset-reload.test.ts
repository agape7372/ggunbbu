import { afterEach, expect, it, vi } from 'vitest';
import { hasAsset, preloadAssets } from '../src/render/assets';

afterEach(() => vi.unstubAllGlobals());

it('a failed reload returns to fallback instead of keeping an earlier PNG', async () => {
  let fail = false;
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) { if (fail) this.onerror?.(); else this.onload?.(); }
  });
  await preloadAssets();
  expect(hasAsset('player')).toBe(true);
  expect(hasAsset('floors-europe')).toBe(true);
  fail = true;
  await preloadAssets();
  expect(hasAsset('player')).toBe(false);
  expect(hasAsset('floors-europe')).toBe(false);
});
