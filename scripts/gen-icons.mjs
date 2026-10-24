// PWA 192/512 배치(오프라인): assets/brand의 저장된 PNG를 public/icons로 복사한다.
// 아이콘 정본은 assets/brand/src/mark*.svg — 그림을 바꿨으면 전체 재생성(런처·스플래시·스토어·maskable 포함):
//   node scripts/gen-native-icons.mjs --playwright-module <playwright 패키지 폴더>
import { copyFileSync, mkdirSync } from 'node:fs';
import { projectPath } from './lib/workspace.mjs';
mkdirSync(projectPath('public/icons'), {recursive:true});
for (const size of [192,512]) {
  copyFileSync(projectPath(`assets/brand/icon-${size}.png`), projectPath(`public/icons/icon-${size}.png`));
  console.log(`Installed icon ${size}x${size}`);
}
