// imagegen으로 제작하고 축소한 정본을 PWA에 배치한다. 새 아트는 prepare-image-assets.mjs로 처리.
// 별도 라이브러리 없이 npm run icons로 승인된 192/512 변형을 복원할 수 있다.
import { copyFileSync, mkdirSync } from 'node:fs';
import { projectPath } from './lib/workspace.mjs';
mkdirSync(projectPath('public/icons'), {recursive:true});
for (const size of [192,512]) {
  copyFileSync(projectPath(`assets/brand/icon-${size}.png`), projectPath(`public/icons/icon-${size}.png`));
  console.log(`Installed imagegen icon ${size}x${size}`);
}
