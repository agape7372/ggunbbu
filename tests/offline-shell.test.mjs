import { expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import { offlineAppShell, runtimeImagePaths } from '../scripts/lib/offline-shell.mjs';
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
  runInNewContext(output.source+'\nglobalThis.shell = APP_SHELL;', sandbox);
  const images=runtimeImagePaths(readProjectJson('src/assets/manifest.json'));
  expect(images).toHaveLength(19);
  for(const file of [...images,'./assets/entry-123.js','./assets/game-456.js','./assets/style-789.css']) {
    expect(sandbox.shell.filter(path=>path===file)).toHaveLength(1);
  }
});
