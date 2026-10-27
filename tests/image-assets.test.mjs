import { expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

// 해상도 규칙(docs/IMAGE_PROMPTS.md §2): 캐릭터·엔티티·층 시트는 매니페스트 논리 크기의 2배 픽셀,
// 배경은 1배. 집행기 아틀라스는 원본 1536x1024를 0.35배로 줄인 부품 시트(prepare-image-assets.mjs ATLAS_SCALE).
const pixelScale = src => (src.startsWith('char/') || src.startsWith('floors/') ? 2 : 1);

it('all runtime PNGs match the manifest and their frame/crop contracts', () => {
  const manifest = JSON.parse(readFileSync(new URL('../src/assets/manifest.json', import.meta.url), 'utf8'));
  for (const [key, entry] of Object.entries(manifest.images)) {
    const png = readFileSync(new URL(`../public/img/${entry.src}`, import.meta.url));
    expect(png.subarray(0,8).toString('hex'), key).toBe('89504e470d0a1a0a');
    const k = pixelScale(entry.src);
    const expected = key === 'boss' ? [Math.round(1536*0.35), Math.round(1024*0.35)] : [entry.w*(entry.frames??1)*k, entry.h*k];
    expect([png.readUInt32BE(16),png.readUInt32BE(20)], key).toEqual(expected);
  }
});

it('player-<weapon>.png and crate.png files have a manifest key of the same name', () => {
  // check-budget.mjs의 역방향 검사와 같은 규칙 — 파일만 넣고 매니페스트를 빼먹으면 조용히 폴백으로 남는다.
  const manifest = JSON.parse(readFileSync(new URL('../src/assets/manifest.json', import.meta.url), 'utf8'));
  const files = readdirSync(new URL('../public/img/char/', import.meta.url)).filter(f => /^(player(-.+)?|crate)\.png$/.test(f));
  expect(files).toContain('player.png');
  for (const f of files) expect(manifest.images[f.replace(/\.png$/, '')], f).toBeDefined();
});
