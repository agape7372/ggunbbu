import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { img } from '../src/render/assets';
import { floorSheetTile, refreshFloorSheetAssets } from '../src/render/floorSheetCache';

vi.mock('../src/render/assets', async importOriginal => ({
  ...await importOriginal<typeof import('../src/render/assets')>(),
  img: vi.fn(),
  releaseAsset: vi.fn(),
}));

const draw = vi.fn();
const sheet = (width: number, height: number) => ({ width, height }) as HTMLCanvasElement;

beforeEach(() => {
  draw.mockReset();
  vi.mocked(img).mockReset();
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: draw }) }),
  });
});
afterEach(() => vi.unstubAllGlobals());

it('slices a 2x sheet with doubled source rows and keeps 2x tiles', () => {
  vi.mocked(img).mockImplementation(key => key === 'floors-europe' ? sheet(540, 680) : null);
  refreshFloorSheetAssets();
  // 소스 y는 행 * 68 * 2, 소스 크기는 540x136, 타일 캔버스도 2배
  expect(draw.mock.calls.map(c => c.slice(1, 5))).toEqual(
    [0, 136, 272, 408, 544].map(y => [0, y, 540, 136]));
  expect(floorSheetTile('europe:roof')).toMatchObject({ width: 540, height: 136 });
});

it('rejects a sheet whose scale is not a whole number or whose height disagrees', () => {
  vi.mocked(img).mockImplementation(key => key === 'floors-europe' ? sheet(400, 504) : null);
  refreshFloorSheetAssets();
  expect(floorSheetTile('europe:weak')).toBeUndefined();
  vi.mocked(img).mockImplementation(key => key === 'floors-europe' ? sheet(540, 679) : null);
  refreshFloorSheetAssets();
  expect(floorSheetTile('europe:weak')).toBeUndefined();
  expect(draw).not.toHaveBeenCalled();
});

it('releases the decoded sheet once all of its rows are cached', async () => {
  const { releaseAsset } = await import('../src/render/assets');
  vi.mocked(releaseAsset).mockClear();
  vi.mocked(img).mockImplementation(key => key === 'floors-europe' ? sheet(540, 680) : null);
  refreshFloorSheetAssets();
  expect(releaseAsset).toHaveBeenCalledWith('floors-europe');
  expect(releaseAsset).toHaveBeenCalledTimes(1);
  vi.mocked(releaseAsset).mockClear();
  vi.mocked(img).mockImplementation(key => key === 'floors-europe' ? sheet(540, 679) : null);
  refreshFloorSheetAssets();
  expect(releaseAsset).not.toHaveBeenCalled(); // 실패한 시트는 놓지 않는다
});
