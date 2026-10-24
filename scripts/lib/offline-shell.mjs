import { readFileSync } from 'node:fs';

/** 별칭이 같은 이미지를 가리켜도 오프라인 파일은 한 번만 저장한다. */
export function runtimeImagePaths(manifest) {
  return [...new Set(Object.values(manifest.images).map(entry => manifest.basePath + entry.src))];
}

export function offlineAppShell() {
  return {
    name: 'offline-app-shell',
    apply: 'build',
    generateBundle(_options, bundle) {
      const manifest = JSON.parse(readFileSync(new URL('../../src/assets/manifest.json', import.meta.url), 'utf8'));
      const files = Object.keys(bundle).filter(name => /\.(js|css)$/.test(name)).map(name => `./${name}`);
      let source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
      for (const [name, values] of [['BUILD_ASSETS', files], ['IMAGE_ASSETS', runtimeImagePaths(manifest)]]) {
        const marker = `const ${name} = [];`;
        if (!source.includes(marker)) throw new Error(`SW template missing ${name}`);
        source = source.replace(marker, `const ${name} = ${JSON.stringify(values)};`);
      }
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
