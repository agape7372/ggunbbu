import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { img } from '../src/render/assets';
import { floorSheetTile, refreshFloorSheetAssets } from '../src/render/floorSheetCache';

vi.mock('../src/render/assets', async importOriginal => ({
  ...await importOriginal<typeof import('../src/render/assets')>(),
  img: vi.fn(),
}));

const draw = vi.fn();
const source = (height: number) => ({ width: 270, height }) as HTMLCanvasElement;

beforeEach(() => {
  draw.mockReset();
  vi.mocked(img).mockReset();
  vi.stubGlobal('document', {
    createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: draw }) }),
  });
});
afterEach(() => vi.unstubAllGlobals());

it('keeps roof, entrance and glass/ice slices in their own rows', () => {
  const europe = source(340), special = source(476);
  vi.mocked(img).mockImplementation(key => key === 'floors-europe' ? europe : key === 'floors-special' ? special : null);
  refreshFloorSheetAssets();
  expect(draw.mock.calls.map(call => call[2])).toEqual([0,68,136,204,272,0,68,136,204,272,340,408]);
  for (const key of ['europe:weak','europe:roof','europe:entrance','glass','ice']) {
    expect(floorSheetTile(key)).toMatchObject({ width: 270, height: 68 });
  }
  expect(floorSheetTile('asia:weak')).toBeUndefined();
});

it('drops stale PNGs on refresh and rejects incorrectly sized sheets', () => {
  vi.mocked(img).mockImplementation(key => key === 'floors-europe' ? source(340) : null);
  refreshFloorSheetAssets();
  expect(floorSheetTile('europe:weak')).toBeDefined();
  draw.mockClear();
  vi.mocked(img).mockImplementation(key => key === 'floors-europe' ? source(339) : null);
  refreshFloorSheetAssets();
  expect(floorSheetTile('europe:weak')).toBeUndefined();
  expect(draw).not.toHaveBeenCalled();
});

it('does not publish a partially decoded sheet when drawing fails', () => {
  vi.mocked(img).mockImplementation(key => key === 'floors-europe' ? source(340) : null);
  draw.mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error('decode failed'); });
  expect(refreshFloorSheetAssets).not.toThrow();
  expect(floorSheetTile('europe:weak')).toBeUndefined();
  expect(floorSheetTile('europe:mid')).toBeUndefined();
});
