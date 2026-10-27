// 디버그 APK 빌드 — 윈도우(gradlew.bat)·맥/리눅스(./gradlew) 어디서나 같은 명령으로 돈다.
// 사용: npm run apk            (JAVA_HOME은 환경에 있어야 한다 — docs/RELEASE.md §2)
//       npm run apk -- --info  (뒤 인자는 gradle로 그대로 넘어간다)
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const androidDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'android');
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const r = spawnSync(gradlew, ['assembleDebug', ...process.argv.slice(2)], { cwd: androidDir, stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
