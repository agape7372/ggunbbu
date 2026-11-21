// 이펙트 검수 하네스 — 명령 하나로 시트 · 띠(모션 계측) · 영상.
// 개발 서버: `serve`로 띄워 둔 서버(tmp/fx/.server)가 살아 있으면 그걸 쓰고, 없으면 제 서버를 띄웠다 닫는다(포트 5300부터 빈 곳).
// 페이지 안 쪽 = scripts/fx/page.ts(가짜 시계 · 틱 루프 · 장면 사전 · 크롭 · 시트 · 계측).
// 사용법 = 인자 없이 부르면 나온다(아래 USAGE). 초안 쓰는 법 · 계측 읽는 법 = docs/FX_HARNESS.md
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createServer } from 'vite';
import { cliOption, optionalPackage, projectPath } from '../lib/workspace.mjs';

const USAGE = `이펙트 검수 하네스
  node scripts/fx/fx.mjs <serve|sheet|strip|movie> [인자]
명령
  serve   개발 서버를 띄워 둔다 — 켜져 있으면 다른 명령이 그걸 써서 기동이 빠르다(Ctrl+C로 끔)
  sheet   장면마다 PNG 한 장 — 줄 = 무기, 칸 = 사건 뒤 틱 (--scale 1 = 폰 1배)
  strip   연속 프레임 띠 + 계측(무기 조각 넓이 · 태어난 조각) → strip-<장면>.png · motion.json
          (--frames N · --every K · --from N 사건 뒤 N틱부터 · --cols N 접기, 기본 8 · 한 장 폭 2400 안으로 줄어든다)
  movie   무기마다 서 있기 → 타격 → 층 깨기 → 완파 → 헛스윙(+필살) → <무기>.mp4 · <무기>-slow.mp4 (--keep)
인자
  --weapons a,b   --scenes hit,floor,destroy,whiff,aura,special   --out <폴더, 기본 tmp/fx/out>
  --draft <파일>[,<파일>…]   --gray   --waza <필살 id>   --playwright-module <폴더>(또는 PLAYWRIGHT_MODULE)
예
  node scripts/fx/fx.mjs serve
  node scripts/fx/fx.mjs strip --weapons phoenix --scenes destroy --frames 30 --cols 6
  node scripts/fx/fx.mjs movie --weapons phoenix --draft tmp/fx/drafts/a.ts --waza tenchi`;

const args = process.argv.slice(2);
const cmd = args[0];
if (!['serve', 'sheet', 'strip', 'movie'].includes(cmd)) {
  console.log(USAGE);
  process.exit(cmd ? 1 : 0);
}
const SERVER_FILE = projectPath('tmp/fx/.server');
// hmr만 끈다 — 파일 감시(server.watch)는 켜져 있어 고친 파일의 변환 캐시가 무효가 된다(띄워 둔 서버도 고친 그림을 낸다)
const startServer = async () => {
  const s = await createServer({
    configFile: false,
    root: projectPath('.'),
    cacheDir: projectPath('tmp/fx/.vite'),
    logLevel: 'error',
    server: { port: 5300, strictPort: false, hmr: false, warmup: { clientFiles: ['./src/main.ts', './scripts/fx/page.ts'] } },
    optimizeDeps: { noDiscovery: true },
  });
  await s.listen();
  return s;
};
if (cmd === 'serve') {
  const s = await startServer();
  const url = s.resolvedUrls.local[0];
  mkdirSync(path.dirname(SERVER_FILE), { recursive: true });
  writeFileSync(SERVER_FILE, url);
  process.on('exit', () => rmSync(SERVER_FILE, { force: true }));
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { s.close().finally(() => process.exit(0)); });
  console.log(`서버 ${url} — 켜 둔 동안 sheet · strip · movie가 이걸 쓴다. 끄려면 Ctrl+C`);
  await new Promise(() => {}); // 서버가 이벤트 루프를 붙잡고 있다
}
/** 띄워 둔 서버가 살아 있으면 그 주소 — 이 레포의 page.ts를 내주는지로 확인한다 */
const liveServer = async () => {
  try {
    const url = readFileSync(SERVER_FILE, 'utf8').trim();
    const r = await fetch(new URL('scripts/fx/page.ts', url), { signal: AbortSignal.timeout(15000) });
    return r.ok ? url : null;
  } catch { return null; }
};
const list = (name, fallback) => cliOption(name, fallback, args).split(',').filter(Boolean);
const num = (name) => { const v = cliOption(name, '', args); return v ? Number(v) : undefined; };
const weapons = list('--weapons', 'phoenix,tide,volt,icicle,shade');
const scenes = list('--scenes', 'aura,hit,floor,destroy,whiff');
const out = projectPath(cliOption('--out', 'tmp/fx/out', args));
const drafts = list('--draft', '').map((f) => {
  const rel = path.relative(projectPath('.'), projectPath(f)).replaceAll('\\', '/');
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`초안은 레포 아래에 둔다: ${f}`);
  if (!existsSync(projectPath(rel))) throw new Error(`초안 파일이 없다: ${f}`);
  return rel;
});
const opts = { scale: num('--scale'), gray: args.includes('--gray'), waza: cliOption('--waza', '', args) || undefined, frames: num('--frames'), every: num('--every'), cols: num('--cols'), from: num('--from') };
const { chromium } = optionalPackage(process.env.PLAYWRIGHT_MODULE ?? 'playwright', '--playwright-module');
mkdirSync(out, { recursive: true });
const png = (file, data) => writeFileSync(path.join(out, file), Buffer.from(data.split(',')[1], 'base64'));
const ms = (t0) => `${((Date.now() - t0) / 1000).toFixed(1)}초`;

const t0 = Date.now();
let server, browser;
const errs = [];
try {
  const reused = await liveServer();
  if (!reused) server = await startServer();
  const url = reused ?? server.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.addInitScript(() => {
    localStorage.setItem('gunbbu.v1', JSON.stringify({ v: 1, howtoSeen: true, guardTaught: true }));
    // 게임 루프를 세운다 — main.ts는 글꼴 · 그림(preloadAssets)을 다 기다린 뒤 첫 rAF를 건다. 그걸 부팅 끝 신호로 쓰고
    // 루프는 돌리지 않는다(캡처 사이에 게임이 전역 풀 · 난수를 움직이지 않게)
    window.requestAnimationFrame = () => { window.__fxBooted = true; return 0; };
  });
  page.setDefaultTimeout(120000); // 개발 서버가 새로 떠 모듈 수백 개를 처음 변환한다 — 바쁜 PC에선 30초를 넘는다
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__fxBooted, null, { polling: 50 }); // rAF를 세웠으니 시간 간격으로 본다
  await page.evaluate(async () => {
    await Promise.all([...document.fonts].map((f) => f.load().catch(() => {}))); // 캔버스에만 쓰는 글꼴(콤보 도장 · 붓글씨)도 다 싣는다
    await document.fonts.ready;
    window.__fx = await import('/scripts/fx/page.ts');
  });
  const names = drafts.length ? await page.evaluate((d) => window.__fx.loadDrafts(d), drafts) : [];
  console.log(`준비 ${ms(t0)} · ${url}${reused ? '(띄워 둔 서버)' : ''}${names.length ? ` · 초안 ${names.join(', ')}` : ''}`);

  if (cmd === 'sheet') {
    for (const sc of scenes) {
      const t1 = Date.now();
      png(`${sc}.png`, await page.evaluate((a) => window.__fx.sheetPng(...a), [weapons, sc, names, opts]));
      console.log(`sheet ${sc}.png ${ms(t1)}`);
    }
  } else if (cmd === 'strip') {
    const motion = [];
    for (const sc of scenes) {
      const t1 = Date.now();
      const r = await page.evaluate((a) => window.__fx.stripPng(...a), [weapons, sc, names, opts]);
      png(`strip-${sc}.png`, r.png);
      motion.push(...r.motion);
      for (const m of r.motion) {
        const notes = [];
        if (m.summary?.cut) notes.push(' ← 창 안에서 안 끝남(peakFrac은 창 안 값, --frames를 늘려 끝까지)');
        if (m.summary?.relit && ['hit', 'floor', 'destroy'].includes(sc)) notes.push(` ← 깜빡임 ${m.summary.relit}번: 꺼졌다 다시 켜진다(금지 — 눈이 아프다)`);
        console.log(`strip ${sc} ${m.row} ${JSON.stringify(m.summary)}${notes.join('')}`);
      }
      console.log(`strip-${sc}.png ${ms(t1)}`);
    }
    writeFileSync(path.join(out, 'motion.json'), JSON.stringify(motion.length === 1 ? motion[0] : motion, null, 1) + '\n');
  } else {
    const ff = (a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a]);
    for (const w of names.length ? weapons.slice(0, 1) : weapons) {
      const t1 = Date.now();
      const rows = await page.evaluate((a) => window.__fx.movieFrames(...a), [[w], names, opts]);
      const dirs = rows.map((r, i) => {
        const dir = path.join(out, `${w}-frames`, String(i));
        mkdirSync(dir, { recursive: true });
        r.frames.forEach((f, j) => writeFileSync(path.join(dir, `${String(j + 1).padStart(4, '0')}.jpg`), Buffer.from(f.split(',')[1], 'base64')));
        return dir;
      });
      // 초안이 있으면 지금 | 초안 … 가로로 나란히(이름표는 프레임 위에 찍혀 있다)
      const ins = dirs.flatMap((d) => ['-framerate', '60', '-i', path.join(d, '%04d.jpg')]);
      const stack = dirs.length > 1 ? `hstack=inputs=${dirs.length},` : '';
      const enc = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '60'];
      ff([...ins, '-filter_complex', `${stack}null`, ...enc, path.join(out, `${w}.mp4`)]);
      ff([...ins, '-filter_complex', `${stack}setpts=PTS/0.3`, ...enc, path.join(out, `${w}-slow.mp4`)]);
      if (!args.includes('--keep')) rmSync(path.join(out, `${w}-frames`), { recursive: true, force: true });
      console.log(`movie ${w}.mp4 · ${w}-slow.mp4 — ${rows[0].frames.length}프레임 × ${rows.length}줄 ${ms(t1)}`);
    }
  }
  console.log(`RECIPES 원래대로: ${await page.evaluate(() => window.__fx.recipesIntact())}`);
} finally {
  await browser?.close();
  await server?.close();
}
console.log(`errs ${JSON.stringify(errs)} · 모두 ${ms(t0)} → ${path.relative(projectPath('.'), out).replaceAll('\\', '/')}`);
if (errs.length) process.exitCode = 1;
