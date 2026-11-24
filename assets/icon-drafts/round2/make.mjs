// 건뿌 아이콘 2차 시안 D · E · F: 배경(SVG 방사 그라데이션) 굽기 · 전경(Blender 렌더) 합성 · 안전 원 재기 · 비교 시트.
// 1) 전경: 각 시안마다 blender -b --factory-startup -P build.py -- <K> assets/icon-drafts/round2/<K>/fg-1024.png
// 2) node assets/icon-drafts/round2/make.mjs --playwright-module <playwright 패키지 폴더>
// 낳는 것: round2/<K>/{bg.svg, bg-432.png, fg-432.png, store-512.png} · round2/compare.png
// 좌표 = 적응형 108dp 판 = 432(1dp = 4). 안전 원 66dp = 반지름 132. 보이는 판 72dp = 72..360.
import { readFileSync, writeFileSync } from 'node:fs';
import { optionalPackage, projectPath } from '../../../scripts/lib/workspace.mjs';

const { chromium } = optionalPackage('playwright', '--playwright-module');
const SAFE = 132;
const radial = (stops, glow = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 432 432" width="432" height="432"><defs>`
  + `<radialGradient id="g" cx="0.42" cy="0.36" r="0.78">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</radialGradient>`
  + (glow ? `<radialGradient id="h" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${glow}" stop-opacity="0.55"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>` : '')
  + `</defs><rect width="432" height="432" fill="url(#g)"/>${glow ? '<circle cx="230" cy="200" r="150" fill="url(#h)"/>' : ''}</svg>`;

const DRAFTS = {
  D: { concept: '베인 먹 빌딩 — 옻칠한 먹 빌딩(창 = 한지빛)이 사선으로 베여 윗동이 미끄러지고 벤 면이 칼빛으로 달아오른다',
       bg: radial([[0, '#FFF7E6'], [0.55, '#EEDDB8'], [1, '#B4864A']], '#FFD27A') },
  E: { concept: '졸라맨 일격 — 옻칠 먹으로 빚은 졸라맨이 뛰어올라 철거칼을 젖히고 칼끝이 노랑 칼빛 호를 긋는다',
       bg: radial([[0, '#F25A3C'], [0.5, '#C4301E'], [1, '#5E0F08']]) },
  F: { concept: '철거칼 한 자루 — 먹 칼등 · 강철 날 몸 · 칼빛 날끝 · 주홍 끈 자루의 넓은 칼이 사선으로 선다',
       bg: radial([[0, '#41445C'], [0.5, '#1E1F2A'], [1, '#07070A']], '#FFC23A') },
};

const ROOT = projectPath('.');
const OUT = `${ROOT}/assets/icon-drafts/round2`;
const b64 = p => 'data:image/png;base64,' + readFileSync(p).toString('base64');
const svgUrl = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
const save = (file, url) => writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));

const b = await chromium.launch({ headless: true });
const page = await b.newPage({ viewport: { width: 600, height: 600 } });
await page.setContent('<!doctype html><body style="margin:0">');
// 층들을 겹쳐 size로(crop = [시작, 폭] 432 좌표) · 알파 화소의 중심 거리 최대(432 좌표)
const comp = (srcs, size, crop) => page.evaluate(async ({ srcs, size, crop }) => {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
  for (const s of srcs) {
    const img = new Image(); img.src = s; await img.decode();
    const k = img.width / 432;
    if (crop) x.drawImage(img, crop[0] * k, crop[0] * k, crop[1] * k, crop[1] * k, 0, 0, size, size); else x.drawImage(img, 0, 0, size, size);
  }
  return c.toDataURL('image/png');
}, { srcs, size, crop });
const reach = (src, th = 24) => page.evaluate(async ({ src, th }) => {
  const img = new Image(); img.src = src; await img.decode();
  const n = img.width, c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, n, n).data;
  let far = 0;
  for (let y = 0; y < n; y++) for (let i = 0; i < n; i++) if (d[(y * n + i) * 4 + 3] > th) far = Math.max(far, Math.hypot(i + 0.5 - n / 2, y + 0.5 - n / 2));
  return far * 432 / n;
}, { src, th });

const cols = [{ name: '지금', fg: b64(`${ROOT}/shell/android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png`),
  bg: svgUrl(radial([[0, '#F4F1E8'], [1, '#F4F1E8']])), store: b64(`${ROOT}/assets/store/icon-512.png`) }];
const over = [];
for (const [k, d] of Object.entries(DRAFTS)) {
  const dir = `${OUT}/${k}`;
  writeFileSync(`${dir}/bg.svg`, d.bg + '\n');
  const fgBig = b64(`${dir}/fg-1024.png`), bg = await comp([svgUrl(d.bg)], 432), fg = await comp([fgBig], 432);
  save(`${dir}/bg-432.png`, bg); save(`${dir}/fg-432.png`, fg);
  const store = await comp([svgUrl(d.bg), fgBig], 512, [72, 288]); save(`${dir}/store-512.png`, store);
  // 핵심 = 불투명(알파 > 200) 화소 · 그림자 = 옅은 알파(> 24, 그림자 받이). 판정은 핵심으로 한다
  const r = await reach(fgBig, 200), rs = await reach(fgBig, 24);
  console.log(`${r <= SAFE ? 'ok  ' : 'OVER'} ${k}  핵심 ${r.toFixed(1)} · 그림자 ${rs.toFixed(1)} / safe ${SAFE}  ${d.concept}`);
  if (r > SAFE) over.push(k);
  cols.push({ name: k, fg: fgBig, bg: svgUrl(d.bg), store });
}

// 비교 시트(1차와 같은 꼴): 적응형 판 + 안전 원 · 512 스토어 · 96 · 48(원 | 둥근 사각, 밝은 · 어두운 홈) · 48 실화소 ×4
const LIGHT = '#DCE2EA', DARK = '#17191E';
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#9aa0a8;font:600 22px/1.3 "Malgun Gothic",sans-serif;color:#111}
table{border-collapse:collapse}td{padding:14px;vertical-align:middle;text-align:center}
td.h{text-align:left;width:150px;font-size:19px}th{font-size:34px;padding:12px}
.pan{display:flex;gap:14px;align-items:center;justify-content:center;padding:14px 16px}canvas{display:block}.pix{image-rendering:pixelated}
</style><table id="t"></table><script>
const cols=${JSON.stringify(cols)}, LIGHT='${LIGHT}', DARK='${DARK}';
const load=s=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=s});
function icon(fg,bg,size,mask){const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');x.imageSmoothingQuality='high';
  x.beginPath();if(mask==='circle')x.arc(size/2,size/2,size/2,0,7);else x.roundRect(0,0,size,size,size*.22);x.clip();
  x.drawImage(bg,-size*.25,-size*.25,size*1.5,size*1.5);x.drawImage(fg,-size*.25,-size*.25,size*1.5,size*1.5);return c}
function layer(fg,bg,size){const c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');x.imageSmoothingQuality='high';
  x.drawImage(bg,0,0,size,size);x.drawImage(fg,0,0,size,size);const k=size/108;
  x.setLineDash([10,7]);x.lineWidth=3;x.strokeStyle='#00B4FF';x.strokeRect(18*k,18*k,72*k,72*k);
  x.strokeStyle='#FF2BD6';x.beginPath();x.arc(size/2,size/2,33*k,0,7);x.stroke();return c}
function pan(fg,bg,size,wall){const d=document.createElement('div');d.className='pan';d.style.background=wall;d.append(icon(fg,bg,size,'circle'),icon(fg,bg,size,'square'));return d}
(async()=>{const t=document.getElementById('t');const F=await Promise.all(cols.map(c=>load(c.fg)));const B=await Promise.all(cols.map(c=>load(c.bg)));const S=await Promise.all(cols.map(c=>load(c.store)));
 const row=(h,f)=>{const tr=t.insertRow();const th=tr.insertCell();th.className='h';th.innerHTML=h;cols.forEach((c,i)=>tr.insertCell().append(f(i)))};
 const hr=t.insertRow();hr.insertCell();cols.forEach(c=>{const th=document.createElement('th');th.textContent=c.name;hr.append(th)});
 row('적응형 108dp 판<br><span style="color:#c0109a">분홍 = 안전 원 66dp</span><br><span style="color:#0070b0">파랑 = 보이는 72dp</span>',i=>layer(F[i],B[i],432));
 row('512 스토어<br>(둥근 사각)',i=>{const k=document.createElement('canvas');k.width=k.height=432;const x=k.getContext('2d');x.imageSmoothingQuality='high';x.beginPath();x.roundRect(0,0,432,432,432*.2);x.clip();x.drawImage(S[i],0,0,432,432);return k});
 row('96 · 홈 밝음<br>원 | 둥근 사각',i=>pan(F[i],B[i],96,LIGHT));
 row('96 · 홈 어두움',i=>pan(F[i],B[i],96,DARK));
 row('48 · 홈 밝음',i=>pan(F[i],B[i],48,LIGHT));
 row('48 · 홈 어두움',i=>pan(F[i],B[i],48,DARK));
 row('48 실화소 ×4<br>(밝음 · 원)',i=>{const s=icon(F[i],B[i],48,'circle');const w=document.createElement('div');w.className='pan';w.style.background=LIGHT;const big=document.createElement('canvas');big.width=big.height=48;big.getContext('2d').drawImage(s,0,0);big.className='pix';big.style.width=big.style.height='192px';w.append(big);return w});
 document.body.dataset.done=1})();
</script>`;
await page.setContent(html);
await page.waitForSelector('body[data-done]');
const box = await page.locator('#t').boundingBox();
const W = Math.ceil(box.width), H = Math.ceil(box.height);
await page.setViewportSize({ width: W, height: H });
await page.screenshot({ path: `${OUT}/compare.png`, clip: { x: 0, y: 0, width: W, height: H } });
console.log(`ok   compare.png ${W}x${H}`);
await b.close();
if (over.length) { console.error('안전 원 넘침:', over.join(', ')); process.exit(1); }
