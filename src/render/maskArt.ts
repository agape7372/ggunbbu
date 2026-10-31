// 마스크 그리기 — 16×16 도트를 잉크 테두리 한 칸 두른 캔버스로 한 번 굽고(그림 문자열마다 캐시), 머리 자리에 찍는다.
// 칸 수·팔레트·인코딩은 meta/mask.ts가 정본.

import { MASK_N, cellHex, maskCells } from '../meta/mask';
import { PALETTE } from '../config';

const OUT = MASK_N + 2;
const cache = new Map<string, HTMLCanvasElement>();

/** 그림 → 캔버스(OUT×OUT, 칸 하나 = 1px). 빈 그림·캔버스 없는 환경(테스트)은 null */
export function bakeMask(art: string): HTMLCanvasElement | null {
  const hit = cache.get(art);
  if (hit) return hit;
  if (typeof document === 'undefined') return null;
  const cells = maskCells(art);
  if (!cells.some((v) => v > 0)) return null;
  const cv = document.createElement('canvas');
  cv.width = OUT;
  cv.height = OUT;
  const c = cv.getContext('2d');
  if (!c) return null;
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= MASK_N || y >= MASK_N ? 0 : cells[y * MASK_N + x];
  // 테두리 — 빈칸인데 위아래좌우에 칠한 칸이 있으면 잉크. 어떤 배경 위에서도 마스크 윤곽이 산다
  c.fillStyle = PALETTE.INK;
  for (let y = -1; y <= MASK_N; y++) {
    for (let x = -1; x <= MASK_N; x++) {
      if (at(x, y)) continue;
      if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) c.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i]) continue;
    c.fillStyle = cellHex(cells[i]);
    c.fillRect((i % MASK_N) + 1, Math.floor(i / MASK_N) + 1, 1, 1);
  }
  if (cache.size > 8) cache.clear(); // 도트판에서 고칠 때마다 새 그림 — 오래된 것부터 버릴 것 없이 통째로
  cache.set(art, cv);
  return cv;
}

/**
 * (cx, cy) = 머리 중심, size = 16칸이 차지할 폭(논리 px). 테두리 한 칸이 사방으로 더 나간다.
 * 계단이 살게 매끈하게 늘리지 않는다.
 */
export function drawMaskAt(ctx: CanvasRenderingContext2D, art: string, cx: number, cy: number, size: number, squash = 1): void {
  const cv = bakeMask(art);
  if (!cv) return;
  const px = size / MASK_N;
  const w = OUT * px;
  const h = OUT * px * squash;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cv, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
}
