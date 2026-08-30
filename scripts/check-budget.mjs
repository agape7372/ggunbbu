// 에셋 예산 게이트 — 빌드 뒤 dist/와 원본 public/img/를 재보고 상한을 넘으면 빌드를 깬다.
// (levain scripts/check-budget.mjs 개념 이식. ROADMAP Wave 3.)
//
// 왜 필요한가: 이 게임은 오프라인 PWA + OTA 번들로 통째 내려간다 — 에셋이 커지면
// 첫 로딩과 무선 갱신 다운로드가 같이 무거워진다. 그림 한 장 늘 때마다 사람이 눈치채기 어려워
// 숫자로 막는다. 상한을 올려야 할 이유가 생기면 이 파일의 상수를 고치고 이유를 주석에 남길 것.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const LIMITS = {
  // dist 전체 — 2026-08-30 실측 2.2MB(배경 7장 + JS 145KB). Wave 3 캐릭터·이펙트 시트가
  // 들어올 자리를 넉넉히 두되, 무심코 원본 해상도를 넣는 사고는 잡히게.
  distTotalMB: 12,
  // 이미지 한 장 — 현재 최대는 bg/act2.png 1.1MB.
  singleImageMB: 1.5,
  // 원본 이미지 폴더 합계
  imgTotalMB: 8,
};

const MB = 1024 * 1024;

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push({ path: p, size: statSync(p).size });
  }
  return out;
}

const problems = [];
const notes = [];

// ── 1. dist 총량 ──
const dist = walk(path.join(root, 'dist'));
if (dist.length === 0) {
  notes.push('dist/ 없음 — 빌드 산출물 검사는 건너뜀 (vite build 뒤에 실행할 것)');
} else {
  const total = dist.reduce((a, f) => a + f.size, 0);
  notes.push(`dist: 파일 ${dist.length}개, ${(total / MB).toFixed(2)}MB (상한 ${LIMITS.distTotalMB}MB)`);
  if (total > LIMITS.distTotalMB * MB) {
    problems.push(`dist 총량 ${(total / MB).toFixed(2)}MB > 상한 ${LIMITS.distTotalMB}MB`);
  }
}

// ── 2. 원본 이미지: 총량·한 장 상한·바이트 동일 중복 ──
const imgDir = path.join(root, 'public', 'img');
const images = walk(imgDir).filter((f) => /\.(png|jpg|jpeg|webp|gif)$/i.test(f.path));
const imgTotal = images.reduce((a, f) => a + f.size, 0);
notes.push(`public/img: ${images.length}장, ${(imgTotal / MB).toFixed(2)}MB (상한 ${LIMITS.imgTotalMB}MB)`);
if (imgTotal > LIMITS.imgTotalMB * MB) {
  problems.push(`이미지 총량 ${(imgTotal / MB).toFixed(2)}MB > 상한 ${LIMITS.imgTotalMB}MB`);
}
for (const f of images) {
  if (f.size > LIMITS.singleImageMB * MB) {
    problems.push(`${path.relative(root, f.path)} ${(f.size / MB).toFixed(2)}MB > 한 장 상한 ${LIMITS.singleImageMB}MB`);
  }
}

const byHash = new Map();
for (const f of images) {
  const h = createHash('sha1').update(readFileSync(f.path)).digest('hex');
  const list = byHash.get(h) ?? [];
  list.push(path.relative(root, f.path).split(path.sep).join('/'));
  byHash.set(h, list);
}
for (const list of byHash.values()) {
  if (list.length > 1) {
    problems.push(`바이트 동일 중복: ${list.join(' == ')} — 매니페스트에서 한쪽 src를 다른 쪽으로 가리키고 파일을 지울 것`);
  }
}

// ── 3. 매니페스트 슬롯 충족률 (정보용 — 아트는 Wave 3에서 채운다) ──
const manifestPath = path.join(root, 'src', 'assets', 'manifest.json');
if (existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const keys = Object.entries(manifest.images ?? {});
    const missing = keys.filter(([, e]) => !existsSync(path.join(imgDir, e.src)));
    notes.push(`매니페스트 슬롯 ${keys.length}개 중 ${keys.length - missing.length}개 충족, ${missing.length}개 미충족`);
    if (missing.length > 0) {
      notes.push(`  미충족: ${missing.map(([k]) => k).join(', ')}`);
    }

    // 소비자 없는 슬롯 — 키 문자열이 src/ 어디에도 안 나오면 그림을 넣어도 아무도 안 그린다.
    // (2026-08-30 실측: fx-hit·fx-slash가 그 상태였다. 아트 발주 전에 잡으라고 여기서 센다.)
    const srcFiles = walk(path.join(root, 'src')).filter((f) => /\.(ts|js|json)$/.test(f.path));
    const codeText = srcFiles
      .filter((f) => !f.path.endsWith(path.join('assets', 'manifest.json')))
      .map((f) => readFileSync(f.path, 'utf8'))
      .join('\n');
    // 키가 템플릿으로 조립되는 경우도 있다(`bg-${theme}`·`ent-${kind}`) — 그 접두사는 소비된 것으로 본다.
    const dynamicPrefixes = new Set(
      [...codeText.matchAll(/`([a-z0-9]+)-\$\{/g)].map((m) => `${m[1]}-`),
    );
    const orphans = keys.filter(([k]) =>
      !codeText.includes(`'${k}'`) &&
      !codeText.includes(`"${k}"`) &&
      ![...dynamicPrefixes].some((p) => k.startsWith(p)));
    if (orphans.length > 0) {
      notes.push(`  ★소비자 없음(코드가 안 그림): ${orphans.map(([k]) => k).join(', ')}`);
    }
  } catch {
    problems.push('src/assets/manifest.json 파싱 실패');
  }
}

for (const n of notes) console.log(`  ${n}`);

if (problems.length > 0) {
  console.error('');
  console.error('에셋 예산 초과:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error('');
  console.error('상한은 scripts/check-budget.mjs 상단 LIMITS. 올릴 거면 이유를 주석에 남길 것.');
  process.exit(1);
}
console.log('  에셋 예산 OK');
