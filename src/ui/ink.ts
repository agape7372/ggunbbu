// 「먹 한 획」 UI 부품 — 붓 획 단추 · 조작 먹 덩어리 · 칼 열셋 · 참격 획 · 숫자 굴리기.
// 그림은 전부 손으로 찍은 점(시안 f1-ink 그대로). 색 뜻: 먹 = 그림·판정 · 주홍 = 지금 누를 것 하나 · 참격 노랑 = 베는 순간만.
// 섞기 0 — 그라데이션·blur·반투명 없음. 거친 가장자리는 index.html의 SVG 필터 #rough · #rough2.

import { SWORDS } from '../render/swordShapes';
const PAPER = '#F4F1E8';
const INK = '#1A1A20';
const INK3 = '#A9A7AE';
const SEAL = '#C4301E';

export const reduceMotion = (): boolean =>
  typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

export const fmt = (n: number): string => n.toLocaleString('ko-KR');

const dataURI = (svg: string): string => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

/* ── 붓 획 단추 — 굵게 들어가 가늘게 빠지는 채운 획 + 오른쪽 끝 갈필(한지색 쐐기) */
function strokeSVG(w: number, body: string, dry: readonly string[], fill: string): string {
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} 64' preserveAspectRatio='none'><path fill='${fill}' d='${body}'/>${dry.map((d) => `<path fill='${PAPER}' d='${d}'/>`).join('')}</svg>`;
}

const STROKES: Record<string, [number, string, string[]]> = {
  sA: [320, 'M4 20 Q0 3 16 3 L58 6 L112 3 L166 6 L218 3 L268 6 L297 3 L319 32 L298 59 L266 61 L214 58 L164 62 L110 59 L60 62 L18 60 Q2 61 4 42 Z', ['M319 31 L276 27 L317 35 Z', 'M311 43 L278 39 L305 48 Z', 'M306 21 L284 19 L303 25 Z']],
  sB: [260, 'M4 22 Q0 4 16 4 L50 6 L96 3 L140 6 L186 4 L224 6 L242 3 L259 33 L240 59 L220 61 L180 58 L138 62 L94 59 L52 62 L18 60 Q2 61 4 42 Z', ['M259 32 L222 28 L257 36 Z', 'M251 44 L224 41 L246 48 Z']],
  sC: [200, 'M4 22 Q0 4 16 4 L46 6 L84 3 L124 6 L160 4 L182 3 L199 33 L180 59 L158 61 L122 58 L86 62 L50 59 L18 60 Q2 61 4 42 Z', ['M199 32 L166 28 L197 36 Z', 'M192 44 L170 41 L188 48 Z']],
};

/* ── 조작 먹 덩어리(공격 일필 원 · 점프 솟는 획 · 가드 가로 획). 누르면 안쪽에 한지 선이 든다 */
function blob(w: number, h: number, body: string, dry: readonly string[], fill: string, down: boolean): string {
  const ring = down
    ? `<path fill='none' stroke='${PAPER}' stroke-width='4' transform='translate(${w / 2} ${h / 2}) scale(.84) translate(${-w / 2} ${-h / 2})' d='${body}'/>`
    : '';
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'><path fill='${fill}' d='${body}'/>${dry.map((d) => `<path fill='${PAPER}' d='${d}'/>`).join('')}${ring}</svg>`;
}

const PADS: Record<string, [number, number, string, string[]]> = {
  pA: [120, 120, 'M62 3 C94 0 120 26 118 60 C116 95 90 120 56 118 C22 116 0 90 2 56 C4 22 30 6 62 3 Z', ['M98 18 L112 36 L110 24 Z', 'M88 10 L104 20 L94 11 Z']],
  pJ: [84, 124, 'M4 118 Q-2 96 10 72 Q18 44 33 8 L41 2 L49 10 Q64 46 74 74 Q86 98 80 120 Q60 124 42 122 Q22 124 4 118 Z', ['M38 10 L36 42 L41 12 Z', 'M45 6 L46 36 L48 8 Z']],
  pG: [104, 66, 'M4 22 Q2 6 18 8 L58 4 L96 8 Q104 12 102 32 Q104 54 92 58 L52 62 L16 58 Q2 60 4 40 Z', ['M102 30 L72 27 L101 35 Z', 'M98 45 L74 42 L94 50 Z']],
};

let varsSet = false;
/** 붓 획·먹 덩어리 그림을 :root 변수로 한 번 깐다(--sA·--sA3(옅은 먹)·--pA·--pA2(누름)·--pGs(주홍 탈출)) */
export function installInkVars(): void {
  if (varsSet || typeof document === 'undefined') return;
  varsSet = true;
  const st = document.documentElement.style;
  for (const [k, [w, body, dry]] of Object.entries(STROKES)) {
    st.setProperty(`--${k}`, dataURI(strokeSVG(w, body, dry, INK)));
    st.setProperty(`--${k}3`, dataURI(strokeSVG(w, body, dry, INK3)));
  }
  for (const [k, [w, h, body, dry]] of Object.entries(PADS)) {
    st.setProperty(`--${k}`, dataURI(blob(w, h, body, dry, INK, false)));
    st.setProperty(`--${k}2`, dataURI(blob(w, h, body, dry, INK, true)));
  }
  const [gw, gh, gbody, gdry] = PADS.pG;
  st.setProperty('--pGs', dataURI(blob(gw, gh, gbody, gdry, SEAL, false)));
  st.setProperty('--pGs2', dataURI(blob(gw, gh, gbody, gdry, SEAL, true)));
}

/* ── 컷 틀 — 네 변 굵기가 다른 붓 획(왼쪽·아래 굵게, 위 가늘게), 모서리는 살짝 넘친다. 화면마다 굵기를 달리 준다 */
export function frameSvg(left = 9, top = 3.5, right = 5.5, bottom = 10): string {
  return `<svg class="frame" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">`
    + `<path stroke-width="${left}" d="M1.3 -.6 L1 99.4"/><path stroke-width="${top}" d="M-.4 1.2 L99.5 .8"/>`
    + `<path stroke-width="${right}" d="M98.9 -.3 L99.1 99.8"/><path stroke-width="${bottom}" d="M-.8 98.8 L99.8 99.3"/></svg>`;
}

/* ── 칼 열셋 + 마스크 — 그림 자료(SWORDS)는 render/swordShapes.ts. 판 속 졸라맨이 든 칼도 같은 자료를 그린다(sprites.ts) */

/** 칼 그림 한 장. cls 예: 'it-pic' · 's-big'. delays = 획마다 --d(80ms 차례) — 큰 칼을 획 순서대로 그릴 때 */
export function swordSvg(id: string, cls = '', delays = false): string {
  const body = SWORDS[id] ?? SWORDS.sword;
  return `<svg class="sw ${cls}" viewBox="0 0 120 300" aria-hidden="true">${delays ? withDelays(body) : body}</svg>`;
}

/** 획마다 style="--d:Ns" 를 단다(0.08초 간격) */
export function withDelays(svg: string): string {
  let i = 0;
  return svg.replace(/<(path|circle|rect)\b/g, (m) => `${m} style="--d:${(i++ * 0.08).toFixed(2)}s"`);
}

/** 참격 획 — 가운데 두껍고 양끝이 2px로 빠지는 채운 다각형(viewBox 0 0 100 100, 비율 무시). W·H = 그릴 상자 px, y0·y1 = 상자 높이 % */
export function lensPath(W: number, H: number, y0: number, y1: number, maxPx = 9): string {
  const ax = -6, bx = 106;
  const ang = Math.atan2(((y1 - y0) * H) / 100, ((bx - ax) * W) / 100);
  const N = 14;
  const up: string[] = [], dn: string[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = ax + (bx - ax) * t, y = y0 + (y1 - y0) * t;
    const half = 1 + (maxPx - 1) * Math.pow(Math.sin(Math.PI * t), 0.8);
    const dy = ((half / Math.cos(ang)) / H) * 100;
    up.push(`${x.toFixed(1)} ${(y - dy).toFixed(2)}`);
    dn.push(`${x.toFixed(1)} ${(y + dy).toFixed(2)}`);
  }
  return `M${up.join(' L')} L${dn.reverse().join(' L')} Z`;
}

/** 숫자를 from → to로 굴린다(ms, 끝으로 갈수록 느리게). 동작 줄이기면 바로 끝값 */
export function countTo(els: readonly HTMLElement[], from: number, to: number, ms: number, done?: () => void): void {
  if (reduceMotion() || ms <= 0) {
    for (const e of els) e.textContent = fmt(to);
    done?.();
    return;
  }
  const t0 = performance.now();
  const step = (now: number): void => {
    const p = Math.min(1, (now - t0) / ms);
    const v = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
    for (const e of els) e.textContent = fmt(v);
    if (p < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}

/** 같은 키프레임을 처음부터 다시 — 클래스를 뗐다 붙인다(한 번의 리플로우. 매 프레임 부르는 자리엔 쓰지 말 것) */
export function replay(el: Element | null, cls: string): void {
  if (!el) return;
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}

/** 손으로 그린 작은 글리프(index.html의 symbol) */
export const glyph = (id: 'dust' | 'orb' | 'life'): string =>
  `<svg class="gl" aria-hidden="true"><use href="#g-${id}"/></svg>`;

/* ── 등급 연출(상점) — 전설 큰 칼의 칼 기운(칼 둘레 짧은 먹 획 다섯)과 베는 섬광. 칼 그림과 같은 120×300 칸 ── */
const AURA = [
  'M106 30 Q100 70 106 110 Q111 70 106 30 Z',
  'M22 150 Q18 175 23 196 Q26 175 22 150 Z',
  'M100 130 Q96 160 101 188 Q105 160 100 130 Z',
  'M92 8 Q88 24 93 36 Q96 22 92 8 Z',
  'M114 90 Q110 120 115 150 Q118 120 114 90 Z',
].map((d) => `<path d="${d}"/>`).join('');

/** 칼 기운 — 먹 획 다섯 */
export const auraSvg = (cls: string): string => `<svg class="sw ${cls}" viewBox="0 0 120 300" aria-hidden="true">${AURA}</svg>`;

/** 섬광 — 가는 노랑 사선 한 획(칼날을 가로지른다). 보이는 건 CSS 키프레임이 정한다 */
export const flashSvg = (cls: string): string =>
  `<svg class="sw ${cls}" viewBox="0 0 120 300" aria-hidden="true"><path class="y" d="M8 164 Q58 100 112 50 Q64 114 8 164 Z"/></svg>`;
