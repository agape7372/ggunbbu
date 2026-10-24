// 브랜드 표식 SVG → 안드로이드 런처·스플래시 / PWA / 스토어 PNG 일괄 굽기. 재실행 가능(전부 덮어쓴다).
// 정본: assets/brand/src/mark.svg (아이보리 배경 포함 1024) · mark-fg.svg (투명 배경, 0.62배 — 어댑티브 안전 영역 66dp 안)
// node scripts/gen-native-icons.mjs --playwright-module <playwright 패키지 폴더>
//   예: --playwright-module C:\Users\agape\Desktop\코딩\motion-studio\node_modules\playwright
// 어댑티브 배경은 PNG가 아니라 단색 리소스(values/ic_launcher_background.xml = #F4F1E8)라 여기서 굽지 않는다.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { optionalPackage, projectPath } from './lib/workspace.mjs';

const { chromium } = optionalPackage('playwright', '--playwright-module');
const IVORY = '#F4F1E8';
const RES = 'shell/android/app/src/main/res';
const mark = readFileSync(projectPath('assets/brand/src/mark.svg'), 'utf8');
const markFg = readFileSync(projectPath('assets/brand/src/mark-fg.svg'), 'utf8');

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
// 기존 splash.png와 같은 크기(세로 기준 w×h, 가로는 뒤집는다). drawable/splash.png는 480×320 하나.
const SPLASH = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };

const svgAt = (svg, w, h = w) => svg.replace('<svg ', `<svg width="${w}" height="${h}" style="display:block" `);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ deviceScaleFactor: 1 });
const out = [];

async function shot(file, w, h, body, { transparent = true } = {}) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:${transparent ? 'transparent' : IVORY}">${body}</body></html>`);
  const buf = await page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
  const target = projectPath(file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, buf);
  out.push(`${file} ${w}x${h}`);
}

try {
  // 1) 안드로이드 런처: 레거시 사각·원형(mark.svg) + 어댑티브 전경 108dp(mark-fg.svg)
  for (const [d, scale] of Object.entries(DENSITIES)) {
    const px = 48 * scale;
    await shot(`${RES}/mipmap-${d}/ic_launcher.png`, px, px, svgAt(mark, px));
    await shot(`${RES}/mipmap-${d}/ic_launcher_round.png`, px, px,
      `<div style="width:${px}px;height:${px}px;border-radius:50%;overflow:hidden">${svgAt(mark, px)}</div>`);
    const fg = 108 * scale;
    await shot(`${RES}/mipmap-${d}/ic_launcher_foreground.png`, fg, fg, svgAt(markFg, fg));
  }

  // 2) 스플래시: 시스템(Android 12+·androidx 호환) 아이콘 = 전경 그림 고해상도(288dp 슬롯, 1024px) / 레거시 splash.png = 아이보리 + 중앙 표식 28%
  await shot(`${RES}/drawable-nodpi/splash_icon.png`, 1024, 1024, svgAt(markFg, 1024));
  const splash = (file, w, h) => {
    const s = Math.round(Math.min(w, h) * 0.28);
    return shot(file, w, h,
      `<div style="position:fixed;left:${Math.round((w - s) / 2)}px;top:${Math.round((h - s) / 2)}px">${svgAt(mark, s)}</div>`,
      { transparent: false });
  };
  for (const [d, [w, h]] of Object.entries(SPLASH)) {
    await splash(`${RES}/drawable-port-${d}/splash.png`, w, h);
    await splash(`${RES}/drawable-land-${d}/splash.png`, h, w);
  }
  await splash(`${RES}/drawable/splash.png`, 480, 320);

  // 3) 웹·스토어: 192/512 불투명 + PWA maskable(전경 그림을 아이보리 위에, 80% 안전 원 안)
  for (const size of [192, 512]) {
    for (const f of [`public/icons/icon-${size}.png`, `assets/brand/icon-${size}.png`]) await shot(f, size, size, svgAt(mark, size));
  }
  await shot('assets/store/icon-512.png', 512, 512, svgAt(mark, 512));
  await shot('public/icons/icon-maskable-512.png', 512, 512, svgAt(markFg, 512), { transparent: false });
} finally {
  await browser.close();
}
console.log(out.join('\n') + `\n${out.length}개 PNG 생성`);
