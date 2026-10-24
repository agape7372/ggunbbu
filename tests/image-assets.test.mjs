import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

it('all runtime PNGs match the manifest and their frame/crop contracts', () => {
  const manifest = JSON.parse(readFileSync(new URL('../src/assets/manifest.json', import.meta.url), 'utf8'));
  for (const [key, entry] of Object.entries(manifest.images)) {
    const png = readFileSync(new URL(`../public/img/${entry.src}`, import.meta.url));
    expect(png.subarray(0,8).toString('hex'), key).toBe('89504e470d0a1a0a');
    // 집행기는 논리 크기와 별개인 부품 아틀라스이며 executor.ts의 크롭 좌표와 맞아야 한다.
    const expected = key === 'boss' ? [1536,1024] : [entry.w*(entry.frames??1),entry.h];
    expect([png.readUInt32BE(16),png.readUInt32BE(20)], key).toEqual(expected);
  }
});
