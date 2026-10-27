import { expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { offlineAppShell, runtimeImagePaths, buildVersion, fillSwTemplate, imageFingerprint } from '../scripts/lib/offline-shell.mjs';
import { readProjectJson } from '../scripts/lib/workspace.mjs';

it('derives image URLs from the manifest base path and deduplicates aliases', () => {
  expect(runtimeImagePaths({basePath:'./art/',images:{
    original:{src:'modern.png'},alias:{src:'modern.png'},newAsset:{src:'new.png'},
  }})).toEqual(['./art/modern.png','./art/new.png']);
});

it('emits an executable service worker with all images and hashed entry chunks', () => {
  let output;
  offlineAppShell().generateBundle.call({emitFile: file => { output=file; }}, {}, {
    'assets/entry-123.js': {}, 'assets/game-456.js': {}, 'assets/style-789.css': {}, 'index.html': {},
  });
  expect(output.fileName).toBe('sw.js');
  const sandbox={self:{addEventListener() {}}};
  runInNewContext(output.source+'\nglobalThis.shell = APP_SHELL; globalThis.ver = CACHE_NAME;', sandbox);
  expect(output.source).not.toContain('__BUILD__');
  expect(sandbox.ver).toMatch(/^gunbbu-b[0-9a-f]{10}$/);
  const images=runtimeImagePaths(readProjectJson('src/assets/manifest.json'));
  expect(images).toHaveLength(19);
  for(const file of [...images,'./assets/entry-123.js','./assets/game-456.js','./assets/style-789.css']) {
    expect(sandbox.shell.filter(path=>path===file)).toHaveLength(1);
  }
});

it('stamps a cache version that changes with bundle names or image sizes, and throws when a marker is missing', () => {
  const template = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  const vals = { BUILD_ASSETS: ['./a.js'], IMAGE_ASSETS: ['./i.png'] };
  const base = buildVersion(['./a.js'], ['bg/x.png:100']);
  expect(buildVersion(['./a.js'], ['bg/x.png:100'])).toBe(base);                 // 같은 입력 = 같은 표지
  expect(buildVersion(['./b.js'], ['bg/x.png:100'])).not.toBe(base);             // 번들 이름이 바뀌면 달라진다
  expect(buildVersion(['./a.js'], ['bg/x.png:101'])).not.toBe(base);             // 같은 이름 PNG의 크기가 바뀌면 달라진다
  expect(fillSwTemplate(template, { ...vals, CACHE_VERSION: base })).toContain(`const CACHE_VERSION = "${base}";`);
  expect(() => fillSwTemplate(template.replace('__BUILD__', 'v9'), { ...vals, CACHE_VERSION: base })).toThrow(/CACHE_VERSION/);
  expect(() => fillSwTemplate('', { ...vals, CACHE_VERSION: base })).toThrow(/missing/);
});

it('fingerprints the real public/img tree (relative path + size, sorted)', () => {
  const fp = imageFingerprint(fileURLToPath(new URL('../public/img', import.meta.url)));
  expect(fp.length).toBeGreaterThan(10);
  expect(fp.every(line => /^[\w./-]+:\d+$/.test(line))).toBe(true);
  expect([...fp].sort()).toEqual(fp);
});
