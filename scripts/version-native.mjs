// 네이티브 버전 올리기 — shell/android/app/build.gradle의 versionCode·versionName을 한 번에 바꾸고,
// 그 다음 발행해야 할 OTA 버전을 알려준다.
// 사용: npm run version:native -- <versionName> [versionCode]
// 예:   npm run version:native -- 1.1        (versionCode는 현재값+1)
//       npm run version:native -- 1.1 7
//
// 왜 스크립트인가: 버전이 세 군데(gradle 2개 + src/version.ts)에 흩어져 있고, 셋의 관계가
// **"OTA > versionName"** 이라는 부등식이라 손으로 맞추면 조용히 어긋난다. 어긋나면 새로 깐 APK가
// 백그라운드 복귀 때 옛 웹 자산으로 덮인다(다운그레이드 — RELEASE.md §1-1).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gradlePath = path.join(root, 'shell', 'android', 'app', 'build.gradle');

const args = process.argv.slice(2);
const versionName = args[0];
const versionCodeArg = args[1];

if (!versionName || !/^\d+\.\d+(\.\d+)?$/.test(versionName)) {
  console.error('사용: npm run version:native -- <versionName> [versionCode]   (예: 1.1 또는 1.1 7)');
  process.exit(1);
}
if (!existsSync(gradlePath)) {
  console.error(`build.gradle 없음: ${gradlePath}`);
  process.exit(1);
}

const src = readFileSync(gradlePath, 'utf8');
const codeMatch = src.match(/versionCode\s+(\d+)/);
const nameMatch = src.match(/versionName\s+"([^"]+)"/);
if (!codeMatch || !nameMatch) {
  console.error('build.gradle에서 versionCode·versionName을 못 찾았습니다 — 수동 확인 필요.');
  process.exit(1);
}

const curCode = Number(codeMatch[1]);
const curName = nameMatch[1];
const nextCode = versionCodeArg ? Number(versionCodeArg) : curCode + 1;
if (!Number.isInteger(nextCode) || nextCode <= 0) {
  console.error(`versionCode가 잘못됐습니다: ${versionCodeArg}`);
  process.exit(1);
}
if (nextCode <= curCode) {
  console.error(`versionCode는 올라가기만 해야 합니다 (현재 ${curCode} → 요청 ${nextCode}). Play가 거절합니다.`);
  process.exit(1);
}

// versionName도 내려가면 안 된다 — 내려가는 순간 매니페스트에 떠 있는 옛 OTA가 다시 "새 버전"이
// 되어 새 APK를 덮는다(RELEASE.md §1-1의 다운그레이드 경로가 그대로 재현된다).
function cmp(a, b) {
  const pa = a.split('.').map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}
if (cmp(versionName, curName) <= 0) {
  console.error(`versionName은 올라가야 합니다 (현재 "${curName}" → 요청 "${versionName}").`);
  console.error('내려가면 매니페스트의 옛 OTA 번들이 새 APK를 덮습니다 (RELEASE.md §1-1).');
  process.exit(1);
}

const out = src
  .replace(/versionCode\s+\d+/, `versionCode ${nextCode}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${versionName}"`);
writeFileSync(gradlePath, out);

console.log(`shell/android/app/build.gradle`);
console.log(`  versionCode ${curCode} → ${nextCode}`);
console.log(`  versionName "${curName}" → "${versionName}"`);
console.log('');
console.log('다음 순서:');
console.log('  1) cd shell && npm run web:build && npx cap sync android');
console.log('  2) cd shell/android && JAVA_HOME="D:/android-toolchain/jdk21" ./gradlew bundleRelease');
console.log(`  3) ★같은 코드로 OTA도 발행: npm run ota:release -- ${versionName}.1 이상`);
console.log('     (발행을 건너뛰면 매니페스트에 남은 옛 번들이 새 APK를 덮는다 — RELEASE.md §1-1)');
