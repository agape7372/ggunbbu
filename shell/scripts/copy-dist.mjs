// 루트 웹 빌드(dist)를 셸 webDir(www)로 복사.
// ★이 환경 실측 함정 2종(levain 계보):
//   1) rmSync(recursive)가 에러 없이 실패한다 → 파일 단위 unlink + 잔존 검사
//   2) cpSync(recursive)가 무음 크래시한다(exit 127, 메시지 0) → 수동 재귀 복사
// 되돌리지 말 것 — 표준 API로 "단순화"하는 순간 조용히 빈 www가 앱에 실린다.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmdirSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', '..', 'dist');
const www = join(here, '..', 'www');

function emptyDir(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { emptyDir(p); rmdirSync(p); }
    else unlinkSync(p);
  }
}

function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  let n = 0;
  for (const name of readdirSync(from)) {
    const a = join(from, name);
    const b = join(to, name);
    if (statSync(a).isDirectory()) n += copyDir(a, b);
    else { copyFileSync(a, b); n += 1; }
  }
  return n;
}

if (!existsSync(dist)) throw new Error('dist 없음 — 루트에서 npm run build 먼저');
emptyDir(www);
const n = copyDir(dist, www);
if (n < 5) throw new Error(`복사 파일 ${n}개 — 비정상적으로 적음`);
console.log(`dist → shell/www 복사 완료 (${n}개 파일)`);
