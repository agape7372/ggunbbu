// 빌드 전에 dist를 비운다. vite의 emptyOutDir는 이 환경에서 rmSync가 오류 없이 실패해
// 옛 해시 번들이 쌓인다(9월 빌드까지 남아 APK에 실렸다, 2026-10-25 실측).
// shell/scripts/copy-dist.mjs와 같은 함정 → 파일 단위 unlink + 잔존 검사. 표준 API로 되돌리지 말 것.
import { existsSync, readdirSync, rmdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));

function emptyDir(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { emptyDir(p); rmdirSync(p); }
    else unlinkSync(p);
  }
}

if (existsSync(dist)) {
  emptyDir(dist);
  const left = readdirSync(dist).length;
  if (left) throw new Error(`dist 비우기 실패 — ${left}개 남음`);
}
