// OTA 릴리스 패키저 — dist/를 빌드·zip으로 묶어 ota/bundles·manifest.json·history.json에 배치.
// 사용: npm run ota:release -- <version> [--dry-run] [--min-native=X.Y]
// 예:   npm run ota:release -- 1.0.1
// 배포(vercel)는 이 스크립트가 하지 않는다 — 마지막에 안내만 출력, 실행은 사람 몫.
//
// levain(scripts/ota-release.mjs) 정본 이식 + 건뿌 보강 3가지:
//   ① src/version.ts를 스크립트가 직접 갱신한다 — levain은 수동이라 번들 안 버전과
//      매니페스트 버전이 어긋날 수 있었다(그 파일 주석이 "⚠ 수동 갱신"이라 경고할 정도).
//   ② 셸 versionName(shell/android/app/build.gradle)과 비교해 **죽은 발행**을 막는다.
//      OTA는 네이티브보다 높은 버전만 적용된다 — 같거나 낮으면 아무 일도 안 일어난다.
//   ③ 워킹트리가 더러우면 경고한다(zip은 워킹트리를 싣는다 — 옆 세션 작업 동승 사고 방지).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { collectFiles, makeZip } from './lib/zip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_BASE = 'https://gunbbu-ota.vercel.app';
const KEEP = 4; // ota/bundles/에 남길 최근 번들 수

function usage() {
  console.error('사용: npm run ota:release -- <version> [--dry-run] [--min-native=X.Y]');
  console.error('예:   npm run ota:release -- 1.0.1');
}

function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

const args = process.argv.slice(2);
const version = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const minNativeArg = args.find((a) => a.startsWith('--min-native='));
const minNative = minNativeArg ? minNativeArg.slice('--min-native='.length) : '1.0';

if (!version) {
  usage();
  process.exit(1);
}
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`버전 형식이 잘못됐습니다: "${version}" (semver 예: 1.0.1)`);
  process.exit(1);
}

// ── ② 네이티브 versionName과 비교 — 같거나 낮으면 적용되지 않는 죽은 발행이다 ──
const gradlePath = path.join(root, 'shell', 'android', 'app', 'build.gradle');
if (existsSync(gradlePath)) {
  const m = readFileSync(gradlePath, 'utf8').match(/versionName\s+"([^"]+)"/);
  if (m) {
    const nativeVersion = m[1];
    if (compareSemver(version, nativeVersion) <= 0) {
      console.error(`발행 중단: OTA 버전 ${version} ≤ 셸 versionName ${nativeVersion}.`);
      console.error('OTA는 네이티브보다 높은 버전만 적용된다 — 이대로 올리면 아무 일도 일어나지 않는다.');
      console.error(`${nativeVersion}보다 높은 버전을 쓰거나, 셸 versionName을 먼저 정리하세요.`);
      process.exit(1);
    }
    console.log(`네이티브 versionName ${nativeVersion} < OTA ${version} — 적용 조건 충족.`);
  }
}

// ── ③ 워킹트리 상태 — zip은 지금 작업 중인 파일을 그대로 싣는다 ──
const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
if (dirty.status === 0) {
  const lines = (dirty.stdout || '').split('\n').filter((l) => l.trim() && !l.includes('ota/bundles/'));
  if (lines.length > 0) {
    console.log('');
    console.log(`⚠ 워킹트리에 커밋 안 된 변경 ${lines.length}건 — zip은 이 상태를 그대로 싣는다.`);
    console.log(lines.slice(0, 8).map((l) => `   ${l}`).join('\n'));
    if (lines.length > 8) console.log(`   … 외 ${lines.length - 8}건`);
    console.log('');
  }
}

// ── ① 번들 안 버전을 매니페스트 버전과 일치시킨다 ──
const versionFile = path.join(root, 'src', 'version.ts');
const versionSrc = `/**
 * 웹 번들 버전 — 타이틀·설정 표시와 OTA 매니페스트가 같은 값을 쓴다.
 * ★수동 편집 금지: \`npm run ota:release -- <version>\`이 이 파일을 갱신한다(scripts/ota-release.mjs).
 */
export const APP_VERSION = '${version}';
`;
const prevVersionSrc = existsSync(versionFile) ? readFileSync(versionFile, 'utf8') : null;
if (!dryRun) {
  writeFileSync(versionFile, versionSrc);
  console.log(`src/version.ts → APP_VERSION = '${version}'`);
}

// ★dist/를 먼저 비운다 — 빌드가 스스로 비우지 않는다(levain 실측: 누적분 440개 42.6MB가
// 번들에 실려 나간 사고). ★디렉터리째 지우지 않는다 — 이 환경에서 recursive rm/cpSync는
// 에러 없이 실패한다(docs/DEVLOG.md 08-30 cpSync 무음 크래시와 같은 계열). 파일 단위로 비우고
// 마지막에 잔존 수를 센다.
function emptyDir(dir) {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      n += emptyDir(p);
      try {
        rmSync(p, { recursive: true, force: true });
      } catch {
        /* 디렉터리 제거는 막힐 수 있다 — 내용만 비면 충분하다 */
      }
    } else {
      unlinkSync(p);
      n++;
    }
  }
  return n;
}

const distPath = path.join(root, 'dist');
console.log(`dist/ 정리: 파일 ${emptyDir(distPath)}개 삭제`);
const leftover = existsSync(distPath) ? collectFiles(distPath).length : 0;
if (leftover > 0) {
  console.error(`dist/ 에 ${leftover}개가 남았습니다 — 지난 빌드 산출물이 번들에 섞입니다.`);
  console.error('열려 있는 dev 서버(npm run dev)나 파일 잠금을 확인하고 다시 실행하세요.');
  process.exit(1);
}

console.log('빌드: npm run build');
const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true });
if (build.status !== 0) {
  if (!dryRun && prevVersionSrc !== null) writeFileSync(versionFile, prevVersionSrc); // 버전 갱신 되돌림
  console.error('빌드 실패 — 릴리스를 중단합니다.');
  process.exit(1);
}

const distDir = path.join(root, 'dist');
const files = existsSync(distDir) ? collectFiles(distDir) : [];
if (files.length === 0) {
  console.error('dist/ 가 비어 있습니다 — 빌드가 산출물을 만들지 않았습니다.');
  process.exit(1);
}
if (!files.some((f) => f.name === 'index.html')) {
  console.error('zip 루트에 index.html이 없습니다 — dist/ 구조를 확인하세요.');
  process.exit(1);
}

const zipBuf = makeZip(files);
const checksum = createHash('sha256').update(zipBuf).digest('hex');
const size = zipBuf.length;

console.log(`zip 완료: 파일 ${files.length}개, ${size.toLocaleString('en-US')}bytes`);
console.log(`sha256: ${checksum}`);

if (dryRun) {
  console.log('--dry-run: 파일 쓰기는 생략합니다 (src/version.ts도 건드리지 않았습니다).');
  process.exit(0);
}

const base = process.env.GUNBBU_OTA_BASE || DEFAULT_BASE;
const manifest = {
  version,
  url: `${base}/bundles/${version}.zip`,
  checksum,
  size,
  releasedAt: new Date().toISOString(),
  minNative,
};

const otaDir = path.join(root, 'ota');
const bundlesDir = path.join(otaDir, 'bundles');
mkdirSync(bundlesDir, { recursive: true });

const bundlePath = path.join(bundlesDir, `${version}.zip`);
writeFileSync(bundlePath, zipBuf);
console.log(`저장: ${path.relative(root, bundlePath)}`);

writeFileSync(path.join(otaDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('저장: ota/manifest.json');

const historyPath = path.join(otaDir, 'history.json');
let history = [];
if (existsSync(historyPath)) {
  try {
    const parsed = JSON.parse(readFileSync(historyPath, 'utf8'));
    if (Array.isArray(parsed)) history = parsed;
    else console.error('ota/history.json이 배열이 아닙니다 — 새로 시작합니다.');
  } catch {
    console.error('ota/history.json 파싱 실패 — 새로 시작합니다.');
  }
}
history.push(manifest);
writeFileSync(historyPath, JSON.stringify(history, null, 2) + '\n');
console.log('저장: ota/history.json');

// 오래된 번들 정리 — 파일명 버전(semver) 정렬 기준으로 최신 KEEP개만 남긴다.
const zips = readdirSync(bundlesDir).filter((f) => f.endsWith('.zip'));
if (zips.length > KEEP) {
  const sorted = zips.sort((a, b) => compareSemver(a.replace(/\.zip$/, ''), b.replace(/\.zip$/, '')));
  const toDelete = sorted.slice(0, sorted.length - KEEP);
  for (const f of toDelete) unlinkSync(path.join(bundlesDir, f));
  console.log(`정리: ${toDelete.join(', ')} 삭제`);
}

console.log('');
console.log('다음: cd ota && npx vercel --prod');
console.log('     확인: curl -s https://gunbbu-ota.vercel.app/manifest.json');
console.log('     ★src/version.ts 변경분을 커밋할 것 — 다음 세션이 버전 출처를 잃지 않게.');
