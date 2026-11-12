import { expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { offlineAppShell, runtimeImagePaths, buildVersion, fillSwTemplate, fileFingerprint } from '../scripts/lib/offline-shell.mjs';
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

it('index.html이 preload하는 글꼴은 전부 APP_SHELL에 있다 — 첫 방문 뒤 오프라인에서도 붓 · 바탕 글꼴이 나온다', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const fonts = [...html.matchAll(/href="([^"]+)" as="font"/g)].map((m) => m[1]);
  expect(fonts.length).toBeGreaterThanOrEqual(4);
  const sandbox = { self: { addEventListener() {} } };
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8') + '\nglobalThis.shell = APP_SHELL;', sandbox);
  for (const f of fonts) expect(sandbox.shell).toContain(f);
});

it('글꼴 요청은 Vary를 무시하고 캐시에서 찾는다 — crossorigin 요청의 Origin이 프리캐시 항목과 어긋나지 않게', async () => {
  const handlers = {};
  const asked = [];
  const sandbox = {
    URL,
    self: { location: { href: 'https://x.test/app/', origin: 'https://x.test' }, addEventListener(type, fn) { handlers[type] = fn; } },
    caches: { match: async (req, opts) => { asked.push([req.url, opts?.ignoreVary]); return 'hit'; } },
  };
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), sandbox);
  const fetchOf = async (url) => {
    let out;
    handlers.fetch({ request: { url, method: 'GET', mode: 'cors' }, respondWith: (p) => { out = p; } });
    return out;
  };
  expect(await fetchOf('https://x.test/app/fonts/brush.woff2')).toBe('hit');
  await fetchOf('https://x.test/app/img/a.png');
  expect(asked).toEqual([['https://x.test/app/fonts/brush.woff2', true], ['https://x.test/app/img/a.png', false]]);
});

it('stamps a cache version that changes with bundle names or public file contents, and throws when a marker is missing', () => {
  const template = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  const vals = { BUILD_ASSETS: ['./a.js'], IMAGE_ASSETS: ['./i.png'] };
  const base = buildVersion(['./a.js'], ['img/x.png:aaaaaaaaaaaa']);
  expect(buildVersion(['./a.js'], ['img/x.png:aaaaaaaaaaaa'])).toBe(base);        // 같은 입력 = 같은 표지
  expect(buildVersion(['./b.js'], ['img/x.png:aaaaaaaaaaaa'])).not.toBe(base);    // 번들 이름이 바뀌면 달라진다
  expect(buildVersion(['./a.js'], ['img/x.png:bbbbbbbbbbbb'])).not.toBe(base);    // 같은 이름 파일의 내용이 바뀌면 달라진다
  expect(fillSwTemplate(template, { ...vals, CACHE_VERSION: base })).toContain(`const CACHE_VERSION = "${base}";`);
  expect(() => fillSwTemplate(template.replace('__BUILD__', 'v9'), { ...vals, CACHE_VERSION: base })).toThrow(/CACHE_VERSION/);
  expect(() => fillSwTemplate('', { ...vals, CACHE_VERSION: base })).toThrow(/missing/);
});

it('fingerprints the real public tree (relative path + content hash, sorted) — icons·fonts·privacy too', () => {
  const fp = fileFingerprint(fileURLToPath(new URL('../public', import.meta.url)));
  expect(fp.length).toBeGreaterThan(10);
  expect(fp.every(line => /^[\w./-]+:[0-9a-f]{12}$/.test(line))).toBe(true);
  expect([...fp].sort()).toEqual(fp);
  for (const dir of ['img/', 'icons/', 'fonts/', 'privacy.html', 'manifest.webmanifest']) {
    expect(fp.some(line => line.startsWith(dir))).toBe(true);
  }
});

it('same name and same size but different bytes → different fingerprint; dot files are ignored', () => {
  const a = mkdtempSync(join(tmpdir(), 'fp-a-'));
  const b = mkdtempSync(join(tmpdir(), 'fp-b-'));
  try {
    for (const [root, body] of [[a, 'AAAA'], [b, 'BBBB']]) {
      mkdirSync(join(root, 'img'));
      writeFileSync(join(root, 'img', 'x.png'), body);
    }
    writeFileSync(join(b, '.DS_Store'), 'junk');
    const fa = fileFingerprint(a);
    const fb = fileFingerprint(b);
    expect(fa).toHaveLength(1);
    expect(fb).toHaveLength(1);
    expect(fa[0]).not.toBe(fb[0]);
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
});
