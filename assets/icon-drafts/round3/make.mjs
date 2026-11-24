// 건뿌 아이콘 3차 시안 G · H · I · J — 지금 아이콘(assets/brand/src/gunbbu-icon.svg)과 같은 화법, 내용만 다르게(2026-11-24).
// node assets/icon-drafts/round3/make.mjs --playwright-module <playwright 패키지 폴더>
// 화법은 원본에서 그대로 가져온다: #rough 필터(원본 defs 그대로) · 색 넷(한지 · 먹 · 주홍 · 노랑) · 「뿌」 낙관 묶음(원본 그대로 옮겨 찍음).
// 좌표 = 원본과 같은 512 판, 그림은 중심 반지름 215 안. 배치 배율도 원본 굽기(gen-native-icons)와 같다: 스토어 1 · 적응형 전경 0.727.
// 낳는 것: round3/<K>/{icon.svg(원본 꼴 512), fg.svg, bg.svg, fg-432.png, bg-432.png, store-512.png} · round3/compare.png
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { optionalPackage, projectPath } from '../../../scripts/lib/workspace.mjs';

const { chromium } = optionalPackage('playwright', '--playwright-module');
const ROOT = projectPath('.');
const SRC = readFileSync(`${ROOT}/assets/brand/src/gunbbu-icon.svg`, 'utf8');
const ROUGH = SRC.match(/<filter id="rough"[\s\S]*?<\/filter>/)[0];
const SEAL = SRC.match(/<g transform="rotate\(-5 378 368\)">[\s\S]*?<\/g>/)[0];   // 원본 낙관(중심 378,368 · 54 칸)
const HANJI = '#F4F1E8', INK = '#1A1A20', RED = '#C4301E', YEL = '#FFD200';
const f = n => +n.toFixed(1);

// 원본 칼 획과 같은 꼴: 양끝 뾰족한 렌즈(이차 곡선을 따라 sin 폭)
function lens(p0, c, p2, W) {
  const L = [], R = [], N = 30;
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    const x = u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0], y = u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1];
    const dx = 2 * u * (c[0] - p0[0]) + 2 * t * (p2[0] - c[0]), dy = 2 * u * (c[1] - p0[1]) + 2 * t * (p2[1] - c[1]);
    const d = Math.hypot(dx, dy) || 1, w = W / 2 * Math.sin(Math.PI * t);
    L.push([x - dy / d * w, y + dx / d * w]); R.push([x + dy / d * w, y - dx / d * w]);
  }
  return 'M' + [...L, ...R.reverse()].map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + 'Z';
}
const rect = (x, y, w, h, c, extra = '') => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${c}"${extra}/>`;
const line = (pts, w, c = INK) => `<path d="M${pts.map(p => p.join(' ')).join('L')}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const seal = (x, y, k = 1) => `<g transform="translate(${x} ${y}) scale(${k}) translate(-378 -368)">${SEAL}</g>`;
// 원본 빌딩 꼴: 먹 판 + 한지 창(34 × 38 · 칸 56 / 60)
function building(x, y, w, h, cols, rows, opt = {}) {
  const ww = opt.ww ?? 34, wh = opt.wh ?? 38, gx = (w - cols * ww) / (cols + 1), gy = opt.gy ?? 22;
  let s = rect(x, y, w, h, INK) + (opt.tank ? rect(x + opt.tank, y - 30, 50, 34, INK) : '');
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) s += rect(x + gx + c * (ww + gx), y + gy + r * (wh + gy), ww, wh, HANJI);
  return s;
}

// ---------- G 「머리 위의 빌딩」: 떨어지는 빌딩 밑면을 작은 졸라맨이 올려 벤다(게임의 기본 한 수) ----------
function G() {
  const bld = building(156, 74, 200, 176, 3, 3, { tank: 22, gy: 18, wh: 34 });
  // 11-24 48px 손질: 구도 그대로, 선을 굵히고 머리 · 칼을 키움(48px에서 사람 + 칼이 읽히게)
  const man = `<circle cx="226" cy="354" r="25" fill="${INK}"/>`
    + line([[228, 376], [222, 424]], 22) + line([[222, 424], [200, 450], [190, 468]], 20) + line([[222, 424], [248, 444], [256, 468]], 20)
    + line([[228, 390], [254, 374], [268, 344]], 19) + line([[226, 394], [204, 408]], 17)
    + `<path d="${lens([258, 360], [284, 316], [308, 270], 26)}" fill="${INK}"/>`
    + line([[250, 352], [284, 366]], 11);                                                          // 위로 치켜든 칼 + 코등이
  const slash = `<path d="${lens([120, 300], [250, 228], [392, 258], 22)}" fill="${YEL}"/>`;       // 밑면을 긋는 칼빛
  const chips = rect(150, 262, 24, 16, INK, ' transform="rotate(-24 162 270)"') + rect(338, 270, 20, 14, INK, ' transform="rotate(18 348 277)"');
  return { concept: '머리 위의 빌딩 — 떨어지는 먹 빌딩의 밑면을 작은 졸라맨이 칼을 치켜들어 긋고, 노랑 칼빛 아래로 벽돌 조각이 튄다',
    art: bld + slash + chips + man + seal(372, 420, 0.9) };
}

// ---------- H 「층층이 베인 탑」: 연속 베기 세 번에 탑이 네 토막으로 어긋난다 ----------
function H() {
  const x = 200, w = 112, top = 64, bot = 452, cuts = [160, 256, 352], slope = -0.16;
  const tower = building(x, top, w, bot - top, 2, 6, { tank: 14, ww: 30, wh: 36, gy: 26 });
  const yAt = (c, xx) => c + (xx - 256) * slope;
  const band = (y0, y1) => `M-50 ${f(yAt(y0, -50))}L600 ${f(yAt(y0, 600))}L600 ${f(yAt(y1, 600))}L-50 ${f(yAt(y1, -50))}Z`;
  const edges = [-200, ...cuts, 900], shift = [-34, 22, -14, 0];
  let defs = '', body = '';
  for (let i = 0; i < 4; i++) {
    defs += `<clipPath id="h${i}"><path d="${band(edges[i], edges[i + 1])}"/></clipPath>`;
    body += `<g transform="translate(${shift[i]} ${(i - 3) * 8})"><g clip-path="url(#h${i})">${tower}</g></g>`;
  }
  const slashes = cuts.map((c, i) => `<path d="${lens([150 - i * 6, yAt(c, 150) - 4 - (3 - i) * 4], [256, yAt(c, 256) - 6 - (3 - i) * 4], [366 + i * 6, yAt(c, 366) - 6 - (3 - i) * 4], 13)}" fill="${YEL}"/>`).join('');
  return { concept: '층층이 베인 탑 — 연속 베기 세 획에 먹 탑이 네 토막으로 갈려 좌우로 어긋나고, 갈린 틈마다 노랑 칼빛',
    defs, art: body + slashes + seal(380, 424, 0.85) };
}

// ---------- I 「종 보스」: 범종 한 채가 칼빛 한 획에 두 동강 나 윗동이 미끄러진다(1-1 보스 · bell) ----------
function I() {
  const bell = `<path d="M256 112C190 112 160 140 156 196L150 356C148 380 138 396 118 404L394 404C374 396 364 380 362 356L356 196C352 140 322 112 256 112Z" fill="${INK}"/>`
    + `<path d="M232 116C232 86 280 86 280 116" fill="none" stroke="${INK}" stroke-width="14"/>`               // 용뉴 고리
    + rect(162, 168, 188, 10, HANJI) + rect(152, 352, 208, 10, HANJI)                                       // 상대 · 하대 띠
    + `<circle cx="256" cy="292" r="30" fill="none" stroke="${HANJI}" stroke-width="9"/><circle cx="256" cy="292" r="9" fill="${HANJI}"/>` // 당좌
    + [176, 304].map(xx => rect(xx, 192, 32, 32, HANJI) + rect(xx + 8, 200, 16, 16, INK)).join('');             // 유곽
  const beam = rect(96, 62, 320, 20, INK) + rect(250, 80, 12, 14, INK);                                       // 매단 들보 · 고리쇠
  const cy = 262, a = -0.38;
  const half = up => `M-100 ${f(cy + (-356) * a)}L620 ${f(cy + 364 * a)}L620 ${up ? -400 : 900}L-100 ${up ? -400 : 900}Z`;
  const defs = `<clipPath id="ilo"><path d="${half(false)}"/></clipPath><clipPath id="iup"><path d="${half(true)}"/></clipPath>`;
  const slash = `<path d="${lens([108, cy + (108 - 256) * a - 10], [262, cy - 14], [412, cy + (412 - 256) * a - 18], 24)}" fill="${YEL}"/>`;
  return { concept: '종 보스 — 들보에 매달린 범종(당좌 · 유곽 · 띠)이 노랑 칼빛 한 획에 두 동강 나 아랫동이 떨어져 나간다',
    defs, art: beam + `<g clip-path="url(#iup)">${bell}</g><g transform="translate(24 22) rotate(6 256 262)"><g clip-path="url(#ilo)">${bell}</g></g>` + slash + seal(392, 128, 0.8) };
}

// ---------- J 「칼 꽂힌 잔해」: 다 무너뜨린 터, 먹 잔해 더미 꼭대기에 칼 한 자루가 꽂혀 있다(완파 뒤) ----------
function J() {
  const mound = `<path d="M118 418L150 372L176 380L204 330L236 338L258 296L286 322L312 316L336 356L362 350L394 418Z" fill="${INK}"/>`
    + rect(170, 392, 34, 14, HANJI, ' transform="rotate(-8 187 399)"') + rect(250, 360, 30, 12, HANJI, ' transform="rotate(10 265 366)"')
    + rect(316, 388, 30, 12, HANJI, ' transform="rotate(-14 331 394)"') + rect(214, 368, 22, 10, HANJI)
    + rect(140, 404, 30, 16, INK, ' transform="rotate(16 155 412)"') + rect(352, 398, 32, 16, INK, ' transform="rotate(-12 368 406)"');
  const sword = `<path d="M246 318L242 150L256 116L270 150L266 318Z" fill="${INK}"/>`                 // 비스듬히 꽂힌 날
    + `<path d="${lens([257, 314], [262, 220], [258, 124], 9)}" fill="${YEL}"/>`                        // 날의 칼빛
    + rect(214, 100, 84, 16, INK) + rect(246, 52, 20, 52, RED) + `<circle cx="256" cy="50" r="13" fill="${INK}"/>`;   // 코등이 · 주홍 자루 · 머리
  const swordG = `<g transform="rotate(8 256 320)">${sword}</g>`;
  return { concept: '칼 꽂힌 잔해 — 다 무너뜨린 터의 먹 잔해 더미 꼭대기에 칼 한 자루가 꽂혀 있고 날에 노랑 칼빛',
    art: mound + swordG + seal(372, 250, 0.85) };
}

const DRAFTS = { G: G(), H: H(), I: I(), J: J() };
const icon = (d, scale, bg, fit = 1) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><defs>${ROUGH}${d.defs ?? ''}</defs>`
  + (bg ? `<rect width="512" height="512" fill="${HANJI}"/>` : '')
  + `<g transform="translate(256 256) scale(${scale * fit}) translate(-256 -256)"><g filter="url(#rough)">${d.art}</g></g></svg>`;

const OUT = `${ROOT}/assets/icon-drafts/round3`;
const b64 = p => 'data:image/png;base64,' + readFileSync(p).toString('base64');
const svgUrl = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
const save = (file, url) => writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
const SAFE = 132;   // 432 판 안전 원(66dp)

const b = await chromium.launch({ headless: true });
const page = await b.newPage({ viewport: { width: 600, height: 600 } });
await page.setContent('<!doctype html><body style="margin:0">');
const raster = (src, size) => page.evaluate(async ({ src, size }) => {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, size, size); return c.toDataURL('image/png');
}, { src, size });
const reach = src => page.evaluate(async src => {
  const img = new Image(); img.src = src; await img.decode();
  const n = img.width, c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, n, n).data;
  let far = 0;
  for (let y = 0; y < n; y++) for (let i = 0; i < n; i++) if (d[(y * n + i) * 4 + 3] > 24) far = Math.max(far, Math.hypot(i + 0.5 - n / 2, y + 0.5 - n / 2));
  return far * 432 / n;
}, src);

const cols = [{ name: '지금', fg: b64(`${ROOT}/shell/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png`), bg: HANJI }];
const over = [];
for (const [k, d] of Object.entries(DRAFTS)) {
  const dir = `${OUT}/${k}`; mkdirSync(dir, { recursive: true });
  // 크기 맞춤: 원본처럼 전경이 안전 원에 닿기 직전(128)까지. 1보다 키우지는 않는다
  const r0 = await reach(await raster(svgUrl(icon(d, 0.727, false)), 432)), fit = Math.min(1, 128 / r0);
  const fgSvg = icon(d, 0.727, false, fit), anySvg = icon(d, 1, true, fit), bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><rect width="512" height="512" fill="${HANJI}"/></svg>`;
  writeFileSync(`${dir}/icon.svg`, anySvg + '\n'); writeFileSync(`${dir}/fg.svg`, fgSvg + '\n'); writeFileSync(`${dir}/bg.svg`, bgSvg + '\n');
  const fg = await raster(svgUrl(fgSvg), 432);
  save(`${dir}/fg-432.png`, fg); save(`${dir}/bg-432.png`, await raster(svgUrl(bgSvg), 432)); save(`${dir}/store-512.png`, await raster(svgUrl(anySvg), 512));
  const r = await reach(fg);
  console.log(`${r <= SAFE ? 'ok  ' : 'OVER'} ${k}  fit ${fit.toFixed(2)} · reach ${r.toFixed(1)} / safe ${SAFE}  ${d.concept}`);
  if (r > SAFE) over.push(k);
  cols.push({ name: k, fg, bg: HANJI });
}

// 비교 시트(1차와 같은 꼴)
const LIGHT = '#DCE2EA', DARK = '#17191E';
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#9aa0a8;font:600 22px/1.3 "Malgun Gothic",sans-serif;color:#111}
table{border-collapse:collapse}td{padding:12px;vertical-align:middle;text-align:center}
td.h{text-align:left;width:150px;font-size:19px}th{font-size:34px;padding:12px}
.pan{display:flex;gap:14px;align-items:center;justify-content:center;padding:14px 16px}canvas{display:block}.pix{image-rendering:pixelated}
</style><table id="t"></table><script>
const cols=${JSON.stringify(cols)}, LIGHT='${LIGHT}', DARK='${DARK}';
const load=s=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=s});
function icon(fg,bg,size,mask){const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');x.imageSmoothingQuality='high';
  x.beginPath();if(mask==='circle')x.arc(size/2,size/2,size/2,0,7);else x.roundRect(0,0,size,size,size*.22);x.clip();
  x.fillStyle=bg;x.fillRect(0,0,size,size);x.drawImage(fg,-size*.25,-size*.25,size*1.5,size*1.5);return c}
function layer(fg,bg,size){const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');x.imageSmoothingQuality='high';
  x.fillStyle=bg;x.fillRect(0,0,size,size);x.drawImage(fg,0,0,size,size);const k=size/108;
  x.setLineDash([10,7]);x.lineWidth=3;x.strokeStyle='#00B4FF';x.strokeRect(18*k,18*k,72*k,72*k);
  x.strokeStyle='#FF2BD6';x.beginPath();x.arc(size/2,size/2,33*k,0,7);x.stroke();return c}
function pan(fg,bg,size,wall){const d=document.createElement('div');d.className='pan';d.style.background=wall;d.append(icon(fg,bg,size,'circle'),icon(fg,bg,size,'square'));return d}
(async()=>{const t=document.getElementById('t');const F=await Promise.all(cols.map(c=>load(c.fg)));
 const row=(h,fn)=>{const tr=t.insertRow();const th=tr.insertCell();th.className='h';th.innerHTML=h;cols.forEach((c,i)=>tr.insertCell().append(fn(c,i)))};
 const hr=t.insertRow();hr.insertCell();cols.forEach(c=>{const th=document.createElement('th');th.textContent=c.name;hr.append(th)});
 row('적응형 108dp 판<br><span style="color:#c0109a">분홍 = 안전 원 66dp</span><br><span style="color:#0070b0">파랑 = 보이는 72dp</span>',(c,i)=>layer(F[i],c.bg,360));
 row('512 스토어<br>(둥근 사각)',(c,i)=>icon(F[i],c.bg,360,'square'));
 row('96 · 홈 밝음<br>원 | 둥근 사각',(c,i)=>pan(F[i],c.bg,96,LIGHT));
 row('96 · 홈 어두움',(c,i)=>pan(F[i],c.bg,96,DARK));
 row('48 · 홈 밝음',(c,i)=>pan(F[i],c.bg,48,LIGHT));
 row('48 · 홈 어두움',(c,i)=>pan(F[i],c.bg,48,DARK));
 row('48 실화소 ×4<br>(밝음 · 원)',(c,i)=>{const s=icon(F[i],c.bg,48,'circle');const w=document.createElement('div');w.className='pan';w.style.background=LIGHT;const big=document.createElement('canvas');big.width=big.height=48;big.getContext('2d').drawImage(s,0,0);big.className='pix';big.style.width=big.style.height='192px';w.append(big);return w});
 document.body.dataset.done=1})();
</script>`;
await page.setContent(html);
await page.waitForSelector('body[data-done]');
const box = await page.locator('#t').boundingBox();
const W = Math.ceil(box.width), H2 = Math.ceil(box.height);
await page.setViewportSize({ width: W, height: H2 });
await page.screenshot({ path: `${OUT}/compare.png`, clip: { x: 0, y: 0, width: W, height: H2 } });
console.log(`ok   compare.png ${W}x${H2}`);
await b.close();
if (over.length) { console.error('안전 원 넘침:', over.join(', ')); process.exit(1); }
