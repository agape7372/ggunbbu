// 베어 넘기기 — 화면을 바꿀 때 지금 화면을 두 장 복제해 사선으로 자르고, 베인 면에 먹 띠 6px를 붙여 두 조각이 떨어진다.
// 아래(새 화면)는 이미 살아 있다 — 조각 층은 누르기를 막지 않는다(style.css #cut-layer pointer-events: none).
// 판(캔버스)에서 넘어갈 땐 판 그림을 찍어서 자른다.

import { lensPath, reduceMotion } from './ink';

/** [y0, y1, sx] — 베는 선의 왼쪽·오른쪽 높이(%) · 조각이 떨어지는 쪽(1 = 오른쪽 위에서 왼쪽 아래로) */
export type CutDir = readonly [number, number, 1 | -1];

export const CUT = {
  /** 판으로 · 앞으로 */
  UP: [72, 18, 1],
  /** 홈 → 미션·상점·설정 */
  META: [74, 22, 1],
  /** 판 → 결과 · 결과 → 홈 */
  DOWN: [20, 76, -1],
  /** 미션·상점·설정 → 홈 */
  HOME: [18, 76, -1],
} as const satisfies Record<string, CutDir>;

const STAGE_H = 780;
const CUT_MS = 900;
let busy = false;

function cutLayer(): HTMLElement | null {
  const stage = document.getElementById('stage');
  if (!stage) return null;
  let el = document.getElementById('cut-layer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cut-layer';
    el.setAttribute('aria-hidden', 'true');
    stage.appendChild(el);
  }
  return el;
}

/** 캔버스는 복제해도 그림이 안 따라온다 — 같은 자리의 캔버스끼리 그대로 옮겨 그린다 */
function copyCanvas(from: HTMLCanvasElement, to: HTMLCanvasElement): void {
  to.width = from.width;
  to.height = from.height;
  to.getContext('2d')?.drawImage(from, 0, 0);
}

/**
 * from = 지금 보이는 화면(복제한다) 또는 판 캔버스(찍는다).
 * 베는 중이거나 동작 줄이기면 false — 화면은 그냥 바뀐다.
 */
export function cutFrom(from: HTMLElement | null, dir: CutDir): boolean {
  if (!from || busy || reduceMotion()) return false;
  const layer = cutLayer();
  if (!layer) return false;
  busy = true;
  layer.textContent = '';
  const [y0, y1, sx] = dir;
  const ox = parseFloat(getComputedStyle(layer.parentElement!).getPropertyValue('--ov-x')) || 0;
  const t = (6 / STAGE_H) * 100;
  for (const k of ['a', 'b'] as const) {
    const piece = document.createElement('div');
    piece.className = `cut-piece ${k}`;
    piece.style.setProperty('--y0', `${y0}%`);
    piece.style.setProperty('--y1', `${y1}%`);
    piece.style.setProperty('--sx', String(sx));
    if (from instanceof HTMLCanvasElement) {
      const c = document.createElement('canvas');
      copyCanvas(from, c);
      piece.appendChild(c);
    } else {
      const c = from.cloneNode(true) as HTMLElement;
      c.removeAttribute('data-screen');
      c.classList.remove('anim', 'anim2', 'shake');
      c.hidden = false;
      c.inert = true;
      piece.appendChild(c);
      const src = from.querySelectorAll('canvas');
      c.querySelectorAll('canvas').forEach((cv, i) => { if (src[i]) copyCanvas(src[i], cv); });
    }
    const s = k === 'a' ? -t : t;
    piece.insertAdjacentHTML('beforeend', `<svg class="cut-edge" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="0,${y0} 100,${y1} 100,${y1 + s} 0,${y0 + s}"/></svg>`);
    layer.appendChild(piece);
    // 스크롤한 목록은 그 자리 그대로 떨어진다(붙인 뒤에야 scrollTop이 먹는다)
    if (!(from instanceof HTMLCanvasElement)) {
      const src = from.querySelectorAll<HTMLElement>('.ov-body');
      piece.querySelectorAll<HTMLElement>('.ov-body').forEach((b, i) => { b.scrollTop = src[i]?.scrollTop ?? 0; });
    }
  }
  layer.insertAdjacentHTML('beforeend', `<svg class="cut-slash" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${lensPath(360 + 2 * ox, STAGE_H, y0, y1, 9)}"/></svg>`);
  window.setTimeout(() => { layer.textContent = ''; busy = false; }, CUT_MS);
  return true;
}
