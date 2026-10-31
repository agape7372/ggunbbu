// 건뿌 앱 아이콘 굽기: assets/brand/src/gunbbu-icon.svg 하나 → 웹(PWA) · 스토어 · 안드로이드 껍데기 자원 전부. 재실행 가능(전부 덮어쓴다).
// node scripts/gen-native-icons.mjs --playwright-module <playwright 패키지 폴더>
//   예: --playwright-module C:\Users\agape\Desktop\코딩\motion-studio\node_modules\playwright
// 배치 배율(그림 반지름 215 기준, 512 판):
//   any 1      : 웹 192·512 · assets/brand 192·512(CI가 npm run icons로 복사) · 스토어 512 · 옛 기기 네모(ic_launcher) · 옛 기기 원(ic_launcher_round, 한지 원 위)
//   maskable .95: 가운데 80% 원(반지름 204.8) 안에 전부
//   fg .727    : 적응형 전경 108dp 판의 안전 원 66dp(반지름 156.4) 안에 전부, 배경 투명 · 한지색 칸은 구멍(#holes 마스크)
//               스플래시 아이콘(Android 12+, 288dp 판의 192dp 원)도 같은 그림(styles.xml 주석)
// 어댑티브 배경은 PNG가 아니라 단색 리소스(values/ic_launcher_background.xml = #F4F1E8)라 여기서 굽지 않는다.
// 굽고 나서 안전 영역을 화소로 잰다. 넘치면 실패로 끝난다.
import { readFileSync } from 'node:fs';
import { optionalPackage, projectPath } from './lib/workspace.mjs';

// playwright는 레포 의존성이 아니다(런타임 의존성 0 규칙)
const { chromium } = optionalPackage('playwright', '--playwright-module');
const ROOT = projectPath('.').replace(/\\/g, '/');
const RES = `${ROOT}/shell/android/app/src/main/res`;
const svg = readFileSync(`${ROOT}/assets/brand/src/gunbbu-icon.svg`, 'utf8');

const SCALE = { any: 1, maskable: 0.95, fg: 0.727 };
const DPI = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const T = [
  { out: 'public/icons/icon-512.png', size: 512, bg: 'square', scale: SCALE.any },
  { out: 'public/icons/icon-192.png', size: 192, bg: 'square', scale: SCALE.any },
  { out: 'assets/brand/icon-512.png', size: 512, bg: 'square', scale: SCALE.any },
  { out: 'assets/brand/icon-192.png', size: 192, bg: 'square', scale: SCALE.any },
  { out: 'assets/store/icon-512.png', size: 512, bg: 'square', scale: SCALE.any },
  { out: 'public/icons/icon-maskable-512.png', size: 512, bg: 'square', scale: SCALE.maskable, safe: 0.4 },
  { out: `${RES}/drawable-nodpi/splash_icon.png`, size: 1024, bg: 'none', scale: SCALE.fg, key: true, safe: 33 / 108 },
];
for (const [d, k] of Object.entries(DPI)) {
  T.push({ out: `${RES}/mipmap-${d}/ic_launcher.png`, size: 48 * k, bg: 'square', scale: SCALE.any });
  T.push({ out: `${RES}/mipmap-${d}/ic_launcher_round.png`, size: 48 * k, bg: 'circle', scale: SCALE.any });
  T.push({ out: `${RES}/mipmap-${d}/ic_launcher_foreground.png`, size: 108 * k, bg: 'none', scale: SCALE.fg, key: true, safe: 33 / 108 });
}

const b = await chromium.launch({ headless: true });
const page = await b.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
await page.setContent(`<!doctype html><body style="margin:0;background:transparent">${svg}</body>`);
const fails = [];
for (const t of T) {
  const out = t.out.startsWith(ROOT) ? t.out : `${ROOT}/${t.out}`;
  await page.setViewportSize({ width: t.size, height: t.size });
  // 안전 영역 재기: 그림 밖(바탕 · 투명)이 아닌 화소 중 중심에서 가장 먼 것 ÷ 한 변
  const reach = await page.evaluate(async ({ size, bg, scale, key }) => {
    const s = document.querySelector('svg');
    s.setAttribute('width', size); s.setAttribute('height', size);
    document.getElementById('bg-square').setAttribute('display', bg === 'square' ? 'inline' : 'none');
    document.getElementById('bg-circle').setAttribute('display', bg === 'circle' ? 'inline' : 'none');
    document.getElementById('place').setAttribute('transform', `translate(256 256) scale(${scale}) translate(-256 -256)`);
    const k = document.getElementById('keyed');
    key ? k.setAttribute('mask', 'url(#holes)') : k.removeAttribute('mask');
    // 그림만 따로 래스터해 잰다(바탕을 끈 같은 배치)
    const bare = s.cloneNode(true);
    bare.querySelector('#bg-square').setAttribute('display', 'none');
    bare.querySelector('#bg-circle').setAttribute('display', 'none');
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(bare));
    await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = size;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, size, size);
    const d = x.getImageData(0, 0, size, size).data;
    let far = 0;
    for (let y = 0; y < size; y++) for (let i = 0; i < size; i++)
      if (d[(y * size + i) * 4 + 3] > 24) far = Math.max(far, Math.hypot(i + 0.5 - size / 2, y + 0.5 - size / 2));
    return far / size;
  }, t);
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: t.size, height: t.size } });
  const ok = !t.safe || reach <= t.safe;
  if (!ok) fails.push(t.out);
  console.log(`${ok ? 'ok  ' : 'OVER'} ${String(t.size).padStart(4)}  reach ${reach.toFixed(3)}${t.safe ? ` / safe ${t.safe.toFixed(3)}` : ''}  ${out.replace(ROOT + '/', '')}`);
}

// 구형 splash.png(android:background, 사실상 안 보인다) = 한지 + 가운데 any 그림 28%. 크기는 기존 그대로(세로 w×h, 가로는 뒤집는다)
const SPLASH = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
async function splash(file, w, h) {
  const s = Math.round(Math.min(w, h) * 0.28);
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><body style="margin:0;background:#F4F1E8"><div style="position:fixed;left:${Math.round((w - s) / 2)}px;top:${Math.round((h - s) / 2)}px">${svg.replace(' width="512" height="512"', ` width="${s}" height="${s}" style="display:block"`)}</div></body>`);
  await page.screenshot({ path: `${RES}/${file}`, clip: { x: 0, y: 0, width: w, height: h } });
  console.log(`ok   ${w}x${h}  ${file}`);
}
for (const [d, [w, h]] of Object.entries(SPLASH)) {
  await splash(`drawable-port-${d}/splash.png`, w, h);
  await splash(`drawable-land-${d}/splash.png`, h, w);
}
await splash('drawable/splash.png', 480, 320);
await b.close();
if (fails.length) { console.error('안전 영역 넘침:', fails.join(', ')); process.exit(1); }
