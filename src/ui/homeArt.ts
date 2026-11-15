// 홈 현장 — 크레인에 매달린 일감 건물. 새로 그리지 않는다: 판의 층(core makeStack · makeFloor)을 판의 붓(render/sprites drawStack)으로
// DOM 캔버스에 줄여 그린다(선례 render/wazaShow.ts drawWazaShot · ui/heroArt.ts). 일감이 바뀔 때만 다시 그린다.

import { VIEW } from '../config';
import { makeFloor, makeStack } from '../core/building';
import { drawStack } from '../render/sprites';
import type { JobBuilding } from './homeLogic';

const INK = '#1A1A20';
const MAX_DPR = 3;

const PAPER = '#F4F1E8';

/**
 * cab = 캔버스 위 줄 · 고리 · 멜빵 높이(css px). 건물은 그 아래에 위를 맞춰 매단다.
 * faint = 이웃 일감 — 그린 위에 한지를 덮어 옅게(반투명 없이 불투명한 옅은 색이 된다)
 */
export function paintHang(cv: HTMLCanvasElement, b: JobBuilding, cab: number, faint = false, drop = false): void {
  const r = cv.getBoundingClientRect();
  const cssW = cv.clientWidth || r.width;
  const cssH = cv.clientHeight || r.height;
  if (cssW < 8 || cssH < 8) return;
  const dpr = Math.min(MAX_DPR, Math.max(1, (window.devicePixelRatio || 1) * (r.width / cssW || 1)));
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const st = makeStack({ variant: b.variant, theme: b.theme, floors: b.floors.map((m) => makeFloor(m)), y: 0 });
  const totalW = b.variant === 'butterbar' ? VIEW.BUTTER_W : VIEW.LANE_W;
  const totalH = st.floors.reduce((a, f) => a + f.h, 0);
  const k = Math.min((cssW - 4) / totalW, (cssH - cab - 2) / totalH);
  const bw = totalW * k;
  const cx = cssW / 2;
  // drop = 건물 바닥을 캔버스 바닥에 맞춘다 — 낮은 건물은 줄이 길어진다(아래 쪽지와의 간격이 일감마다 같다)
  if (drop) cab = cssH - 2 - totalH * k;

  // 줄 · 고리 · 멜빵 — 먹 선. 멜빵 높이는 줄이 길어져도 28까지
  const sl = Math.min(28, cab * 0.4);
  const hookR = Math.min(4.5, Math.max(3, cab * 0.08));
  const hookY = cab - sl - 2;
  ctx.strokeStyle = INK;
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, hookY - hookR * 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, hookY, hookR, -Math.PI * 0.5, Math.PI * 0.9);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cab - sl);
  ctx.lineTo(cx - bw * 0.42, cab);
  ctx.moveTo(cx, cab - sl);
  ctx.lineTo(cx + bw * 0.42, cab);
  ctx.stroke();

  ctx.save();
  ctx.translate(cx, cab);
  ctx.scale(k, k);
  ctx.translate(-VIEW.LANE_X[0], 0);
  drawStack(ctx, st, totalH, 'none');
  ctx.restore();
  if (faint) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
