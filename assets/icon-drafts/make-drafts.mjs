// 건뿌 앱 아이콘 리디자인 시안 A · B · C 굽기 + 비교 시트(2026-11-24). 앱 자원(res · mipmap)은 건드리지 않는다.
// node assets/icon-drafts/make-drafts.mjs --playwright-module <playwright 패키지 폴더>
//   예: --playwright-module C:\Users\agape\Desktop\코딩\motion-studio\node_modules\playwright
// 낳는 것: assets/icon-drafts/<A|B|C>/{fg.svg, bg.svg, fg-432.png, bg-432.png, store-512.png} · assets/icon-drafts/compare.png
// 좌표 = 적응형 108dp 판을 432로(1dp = 4). 안전 원 66dp = 가운데 반지름 132. 보이는 판 72dp = 72..360 사각.
// 색 = 레포 「먹 한 획」 넷만(한지 · 먹 · 주홍 · 노랑). 그라데이션 · 흐림 · 반투명 · 글자 없음.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { optionalPackage, projectPath } from '../../scripts/lib/workspace.mjs';

const { chromium } = optionalPackage('playwright', '--playwright-module');
const HANJI = '#F4F1E8', INK = '#1A1A20', SEAL = '#C4301E', YEL = '#FFD200';
const C = 216, SAFE = 132;
const f = n => +n.toFixed(1);

// 붓 획: 이차 곡선 p0 → c → p2를 따라 머리는 굵고 꼬리는 뾰족하게 깎은 면
function brush(p0, c, p2, W, tail = 0.4) {
  const L = [], R = [], N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    const x = u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0];
    const y = u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1];
    const dx = 2 * u * (c[0] - p0[0]) + 2 * t * (p2[0] - c[0]);
    const dy = 2 * u * (c[1] - p0[1]) + 2 * t * (p2[1] - c[1]);
    const d = Math.hypot(dx, dy) || 1;
    const w = W / 2 * Math.pow(Math.sin(Math.PI * t), 0.55) * (1 - tail * t);
    L.push([x - dy / d * w, y + dx / d * w]); R.push([x + dy / d * w, y - dx / d * w]);
  }
  return 'M' + [...L, ...R.reverse()].map(([x, y]) => `${f(x)} ${f(y)}`).join('L') + 'Z';
}
// 직선 위 반평면(위쪽 = 화면 위) 클립 다각형. 선은 (x0,y0)을 지나고 기울기 각 a(도, 오른쪽으로 오르면 음수)
function half(x0, y0, a, upper) {
  const r = a * Math.PI / 180, dx = Math.cos(r), dy = Math.sin(r);
  let nx = -dy, ny = dx;
  if (upper ? ny > 0 : ny < 0) { nx = -nx; ny = -ny; } // 윗쪽이면 화면 위(ny<0)를 향하게
  const A = [x0 - dx * 2000, y0 - dy * 2000], B = [x0 + dx * 2000, y0 + dy * 2000];
  return `M${f(A[0])} ${f(A[1])}L${f(B[0])} ${f(B[1])}L${f(B[0] + nx * 4000)} ${f(B[1] + ny * 4000)}L${f(A[0] + nx * 4000)} ${f(A[1] + ny * 4000)}Z`;
}
const rough = `<filter id="rough" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="4" xChannelSelector="R" yChannelSelector="G"/></filter>`;
const svg = (body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 432 432" width="432" height="432"><defs>${rough}${defs}</defs>${body}</svg>`;
const solid = col => svg(`<rect width="432" height="432" fill="${col}"/>`);

// A 「두 동강」: 한지 위 먹 빌딩 한 덩이를 사선 한 획이 갈라 윗덩이가 밀려난다. 틈에만 노랑. 지금 아이콘에서 낙관 · 잔 창을 덜어 낸 판.
function draftA() {
  const bx = 151, by = 136, bw = 130, bh = 188, cy = 236, a = -28;
  const bld = `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="${INK}"/><rect x="${bx + 16}" y="${by - 18}" width="34" height="20" fill="${INK}"/>`
    + [0, 1, 2].map(r => [0, 1].map(k => `<rect x="${bx + 22 + k * 52}" y="${by + 26 + r * 54}" width="34" height="32" fill="${HANJI}"/>`).join('')).join('');
  const dx = 14, dy = -26; // 윗덩이 밀림(틈 + 미끄러짐)
  const t = Math.tan(-a * Math.PI / 180), yAt = x => cy - (x - C) * t;
  const slash = brush([112, yAt(112) + dy / 2], [C + dx / 2, cy + dy / 2], [324, yAt(324) + dy / 2], 24, 0.3);
  const defs = `<clipPath id="lo"><path d="${half(C, cy, a, false)}"/></clipPath><clipPath id="up"><path d="${half(C, cy, a, true)}"/></clipPath>`;
  return {
    concept: '두 동강 — 먹 빌딩 한 덩이를 사선 한 획이 갈라 윗덩이가 밀려나고 틈에만 노랑(지금 아이콘에서 낙관 · 잔 창을 덜어 냄)',
    bg: solid(HANJI),
    fg: svg(`<g filter="url(#rough)"><g clip-path="url(#lo)">${bld}</g><g transform="translate(${dx} ${dy})"><g clip-path="url(#up)">${bld}</g></g><path d="${slash}" fill="${YEL}"/></g>`, defs),
  };
}

// B 「주홍 낙관」: 바탕 전체가 인주. 한지로 판 좁은 탑이 먹 한 획에 베여 윗동이 왼쪽으로 넘어간다. 홈 화면에서 색 하나로 찾는 판.
function draftB() {
  const bx = 178, by = 112, bw = 78, bh = 212, cy = 230, a = -18;
  const tower = `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="${HANJI}"/>`
    + [0, 1, 2, 3, 4].map(r => [0, 1].map(k => `<rect x="${bx + 14 + k * 30}" y="${by + 18 + r * 40}" width="20" height="24" fill="${SEAL}"/>`).join('')).join('');
  const t = Math.tan(-a * Math.PI / 180), yAt = x => cy - (x - C) * t;
  const defs = `<clipPath id="lo"><path d="${half(C, cy, a, false)}"/></clipPath><clipPath id="up"><path d="${half(C, cy, a, true)}"/></clipPath>`;
  const pivot = [bx, yAt(bx)];
  const slash = brush([104, yAt(104) + 4], [C, cy - 2], [330, yAt(330) - 6], 20, 0.35);
  return {
    concept: '주홍 낙관 — 바탕 전체가 인주, 한지로 판 좁은 탑이 먹 한 획에 베여 윗동이 넘어간다(홈 화면에서 색 하나로 찾는 판)',
    bg: solid(SEAL),
    fg: svg(`<g filter="url(#rough)"><g clip-path="url(#lo)">${tower}</g><g transform="translate(-6 -10) rotate(-9 ${f(pivot[0])} ${f(pivot[1])})"><g clip-path="url(#up)">${tower}</g></g><path d="${slash}" fill="${INK}"/></g>`, defs),
  };
}

// C 「뛰어 베기」: 먹 바탕에 한지 졸라맨이 뛰어올라 머리 위로 칼을 휘두른다. 칼길 = 노랑 초승달 한 획, 위에서 벤 벽돌 둘이 튄다.
function draftC() {
  const ln = (pts, w) => `<path d="M${pts.map(p => p.join(' ')).join('L')}" fill="none" stroke="${HANJI}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const arc = brush([118, 214], [196, 52], [318, 196], 26, 0.55);
  const man = `<circle cx="196" cy="196" r="23" fill="${HANJI}"/>`
    + ln([[194, 222], [188, 288]], 22)                         // 몸
    + ln([[188, 288], [230, 304], [214, 340]], 20)             // 앞다리
    + ln([[188, 288], [152, 312], [168, 340]], 20)             // 뒷다리
    + ln([[192, 238], [228, 228], [240, 178]], 18)             // 팔(팔꿈치 꺾고 쳐든 손)
    + ln([[229, 160], [252, 177]], 11)                         // 코등이(칼이 팔과 따로 읽히게)
    + `<path d="${brush([236, 176], [262, 142], [286, 110], 24, 0.1)}" fill="${HANJI}"/>`; // 칼
  const brick = (x, y, r) => `<rect x="${x - 15}" y="${y - 10}" width="30" height="20" fill="${HANJI}" transform="rotate(${r} ${x} ${y})"/>`;
  return {
    concept: '뛰어 베기 — 먹 바탕 위 한지 졸라맨이 뛰어올라 머리 위로 칼을 휘두르고, 칼길 노랑 초승달 한 획에 벽돌이 튄다(인물이 주인공)',
    bg: solid(INK),
    fg: svg(`<g filter="url(#rough)"><g transform="translate(216 222) scale(0.86) translate(-216 -222)"><path d="${arc}" fill="${YEL}"/>${man}${brick(156, 128, -22)}${brick(296, 154, 18)}</g></g>`),
  };
}

const ROOT = projectPath('.');
const OUT = `${ROOT}/assets/icon-drafts`;
const drafts = { A: draftA(), B: draftB(), C: draftC() };
const b64 = p => 'data:image/png;base64,' + readFileSync(p).toString('base64');
const svgUrl = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);

const b = await chromium.launch({ headless: true });
const page = await b.newPage({ viewport: { width: 600, height: 600 } });
await page.setContent('<!doctype html><body style="margin:0">');
// svg → png(같은 크기 또는 잘라 키우기) · 안전 원 밖 화소 거리 재기
const raster = (src, size, crop) => page.evaluate(async ({ src, size, crop }) => {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
  if (crop) x.drawImage(img, crop[0], crop[0], crop[1], crop[1], 0, 0, size, size); else x.drawImage(img, 0, 0, size, size);
  return c.toDataURL('image/png');
}, { src, size, crop });
const reach = src => page.evaluate(async src => {
  const img = new Image(); img.src = src; await img.decode();
  const c = document.createElement('canvas'); c.width = c.height = 432;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, 432, 432).data;
  let far = 0;
  for (let y = 0; y < 432; y++) for (let i = 0; i < 432; i++) if (d[(y * 432 + i) * 4 + 3] > 24) far = Math.max(far, Math.hypot(i + 0.5 - 216, y + 0.5 - 216));
  return far;
}, src);
const save = (file, url) => writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));

const cols = [{ name: '지금', fg: b64(`${ROOT}/shell/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png`), bg: HANJI, store: b64(`${ROOT}/assets/store/icon-512.png`) }];
let over = [];
for (const [k, d] of Object.entries(drafts)) {
  const dir = `${OUT}/${k}`; mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/fg.svg`, d.fg + '\n'); writeFileSync(`${dir}/bg.svg`, d.bg + '\n');
  const fg = await raster(svgUrl(d.fg), 432), bg = await raster(svgUrl(d.bg), 432);
  save(`${dir}/fg-432.png`, fg); save(`${dir}/bg-432.png`, bg);
  // 스토어 512 = 배경 + 전경을 보이는 72dp 판(72..360)만 잘라 키운 것(Play가 둥근 모서리를 씌운다)
  const both = svg(`<image href="${bg}" width="432" height="432"/><image href="${fg}" width="432" height="432"/>`);
  const store = await raster(svgUrl(both), 512, [72, 288]); save(`${dir}/store-512.png`, store);
  const r = await reach(fg);
  console.log(`${r <= SAFE ? 'ok  ' : 'OVER'} ${k}  reach ${r.toFixed(1)} / safe ${SAFE}  ${d.concept}`);
  if (r > SAFE) over.push(k);
  cols.push({ name: k, fg, bg: d.bg.match(/fill="(#\w+)"/)[1], store });
}
console.log(`지금  reach ${(await reach(cols[0].fg)).toFixed(1)} / safe ${SAFE}`);

// 비교 시트: 열 = 지금 | A | B | C, 행 = 레이어+안전 영역 · 512 스토어 · 96 · 48 · 48 확대
const LIGHT = '#DCE2EA', DARK = '#17191E';
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#9aa0a8;font:600 22px/1.3 "Malgun Gothic",sans-serif;color:#111}
table{border-collapse:collapse}td{padding:14px;vertical-align:middle;text-align:center}
td.h{text-align:left;width:150px;font-size:19px;color:#111}th{font-size:34px;padding:12px}
.strip{display:flex;gap:0}.pan{display:flex;gap:14px;align-items:center;justify-content:center;padding:14px 16px}
canvas{display:block}.pix{image-rendering:pixelated}
</style><table id="t"></table><script>
const cols=${JSON.stringify(cols)}, LIGHT='${LIGHT}', DARK='${DARK}';
const load=s=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=s});
function icon(fg,bg,size,mask){const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');x.imageSmoothingQuality='high';
  x.beginPath();if(mask==='circle')x.arc(size/2,size/2,size/2,0,7);else x.roundRect(0,0,size,size,size*.22);x.clip();
  x.fillStyle=bg;x.fillRect(0,0,size,size);x.drawImage(fg,-size*.25,-size*.25,size*1.5,size*1.5);return c}
function layer(fg,bg,size){const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');
  x.fillStyle=bg;x.fillRect(0,0,size,size);x.drawImage(fg,0,0,size,size);const k=size/108;
  x.setLineDash([10,7]);x.lineWidth=3;x.strokeStyle='#00B4FF';x.strokeRect(18*k,18*k,72*k,72*k);
  x.strokeStyle='#FF2BD6';x.beginPath();x.arc(size/2,size/2,33*k,0,7);x.stroke();return c}
function pan(fg,bg,size,wall){const d=document.createElement('div');d.className='pan';d.style.background=wall;d.append(icon(fg,bg,size,'circle'),icon(fg,bg,size,'square'));return d}
(async()=>{const t=document.getElementById('t');const imgs=await Promise.all(cols.map(c=>load(c.fg)));const st=await Promise.all(cols.map(c=>load(c.store)));
 const row=(h,f)=>{const tr=t.insertRow();const th=tr.insertCell();th.className='h';th.innerHTML=h;cols.forEach((c,i)=>tr.insertCell().append(f(c,i)))};
 const hr=t.insertRow();hr.insertCell();cols.forEach(c=>{const th=document.createElement('th');th.textContent=c.name;hr.append(th)});
 row('적응형 108dp 판<br><span style="color:#c0109a">분홍 = 안전 원 66dp</span><br><span style="color:#0070b0">파랑 = 보이는 72dp</span>',(c,i)=>layer(imgs[i],c.bg,432));
 row('512 스토어<br>(둥근 사각)',(c,i)=>{const k=document.createElement('canvas');k.width=k.height=432;const x=k.getContext('2d');x.beginPath();x.roundRect(0,0,432,432,432*.2);x.clip();x.drawImage(st[i],0,0,432,432);return k});
 row('96 · 홈 밝음<br>원 | 둥근 사각',(c,i)=>pan(imgs[i],c.bg,96,LIGHT));
 row('96 · 홈 어두움',(c,i)=>pan(imgs[i],c.bg,96,DARK));
 row('48 · 홈 밝음',(c,i)=>pan(imgs[i],c.bg,48,LIGHT));
 row('48 · 홈 어두움',(c,i)=>pan(imgs[i],c.bg,48,DARK));
 row('48 실화소 ×4<br>(밝음 · 원)',(c,i)=>{const s=icon(imgs[i],c.bg,48,'circle');const w=document.createElement('div');w.className='pan';w.style.background=LIGHT;const big=document.createElement('canvas');big.width=big.height=48;big.getContext('2d').drawImage(s,0,0);big.className='pix';big.style.width=big.style.height='192px';w.append(big);return w});
 document.body.dataset.done=1})();
</script>`;
await page.setContent(html);
await page.waitForSelector('body[data-done]');
const box = await page.locator('#t').boundingBox();
await page.setViewportSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) });
await page.screenshot({ path: `${OUT}/compare.png`, clip: { x: 0, y: 0, width: Math.ceil(box.width), height: Math.ceil(box.height) } });
console.log(`ok   compare.png ${Math.ceil(box.width)}x${Math.ceil(box.height)}`);
await b.close();
if (over.length) { console.error('안전 원 넘침:', over.join(', ')); process.exit(1); }
