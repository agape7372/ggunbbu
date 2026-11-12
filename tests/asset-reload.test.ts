import { afterEach, expect, it, vi } from 'vitest';
import { hasAsset, onLateAsset, preloadAssets } from '../src/render/assets';

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

it('타임아웃 뒤에 온 그림은 버리지 않고 쓰며 늦은 도착을 한 번 알린다', async () => {
  vi.useFakeTimers();
  const pending: { onload: (() => void) | null }[] = [];
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) { pending.push(this); } // 응답이 멈춘 서버: onload가 안 온다
  });
  const late = vi.fn();
  onLateAsset(late);
  const boot = preloadAssets();
  await vi.advanceTimersByTimeAsync(8000);
  await boot; // 부팅은 타임아웃으로 풀린다
  expect(hasAsset('player')).toBe(false);
  pending.forEach((p) => p.onload?.()); // 이제 도착
  expect(hasAsset('player')).toBe(true);
  expect(late).toHaveBeenCalledTimes(pending.length);
  expect(late).toHaveBeenCalledWith('player');
  onLateAsset(null);
  vi.useRealTimers();
});
