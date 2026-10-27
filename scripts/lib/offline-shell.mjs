import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 별칭이 같은 이미지를 가리켜도 오프라인 파일은 한 번만 저장한다. */
export function runtimeImagePaths(manifest) {
  return [...new Set(Object.values(manifest.images).map(entry => manifest.basePath + entry.src))];
}

/**
 * 폴더 아래 모든 파일의 「상대경로:내용 해시」 목록(정렬). 같은 이름·같은 크기로 바꿔도 잡는다.
 * mtime은 체크아웃마다 달라 넣지 않고, 점 파일(.DS_Store 등)은 PC마다 달라 뺀다.
 */
export function fileFingerprint(root) {
  const out = [];
  const walk = (dir) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith('.')) continue;
      const full = join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else out.push(`${relative(root, full).replaceAll('\\', '/')}:${createHash('sha1').update(readFileSync(full)).digest('hex').slice(0, 12)}`);
    }
  };
  walk(root);
  return out.sort();
}

/** 번들 파일명(Vite가 내용 해시를 붙임) + public 파일 지문 → 짧은 빌드 표지. 둘 중 하나만 바뀌어도 달라진다. */
export function buildVersion(bundleFiles, imageFingerprints) {
  const h = createHash('sha1');
  h.update([...bundleFiles].sort().join('\n')).update('\0').update(imageFingerprints.join('\n'));
  return `b${h.digest('hex').slice(0, 10)}`;
}

/** sw.js 원본의 자리표시를 채운다. 자리표시가 하나라도 없으면 던진다(조용히 옛 캐시 이름이 남는 것을 막는다). */
export function fillSwTemplate(source, { BUILD_ASSETS, IMAGE_ASSETS, CACHE_VERSION }) {
  for (const [name, marker, value] of [
    ['BUILD_ASSETS', 'const BUILD_ASSETS = [];', `const BUILD_ASSETS = ${JSON.stringify(BUILD_ASSETS)};`],
    ['IMAGE_ASSETS', 'const IMAGE_ASSETS = [];', `const IMAGE_ASSETS = ${JSON.stringify(IMAGE_ASSETS)};`],
    ['CACHE_VERSION', "const CACHE_VERSION = '__BUILD__';", `const CACHE_VERSION = ${JSON.stringify(CACHE_VERSION)};`],
  ]) {
    if (!source.includes(marker)) throw new Error(`SW template missing ${name}`);
    source = source.replace(marker, () => value);
  }
  return source;
}

export function offlineAppShell() {
  return {
    name: 'offline-app-shell',
    apply: 'build',
    generateBundle(_options, bundle) {
      const manifest = JSON.parse(readFileSync(new URL('../../src/assets/manifest.json', import.meta.url), 'utf8'));
      const files = Object.keys(bundle).filter(name => /\.(js|css)$/.test(name)).map(name => `./${name}`);
      const template = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
      const source = fillSwTemplate(template, {
        BUILD_ASSETS: files,
        IMAGE_ASSETS: runtimeImagePaths(manifest),
        // 캐시 우선으로 내주는 img·icons·fonts와 manifest·privacy·sw 원본까지 public 전체를 본다
        CACHE_VERSION: buildVersion(files, fileFingerprint(fileURLToPath(new URL('../../public', import.meta.url)))),
      });
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
