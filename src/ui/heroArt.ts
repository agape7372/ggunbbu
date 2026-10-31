// 홈 뿌뿌 — 판 속 졸라맨을 장착한 그대로(무기 · 몸 색 · 칼빛 · 마스크) 크게 그린다.
// 캔버스에 바로 그린다(PNG로 굽지 않는다). 크기와 발 자리는 서 있는 자세의 잉크 테두리로 한 번 재고,
// 자세를 바꿔도 그 틀을 쓴다 — 누를 때마다 그림 크기가 튀지 않게.

import { PLAYER } from '../config';
import type { PlayerPose } from '../core/types';
import type { Loadout } from '../meta/types';
import { wornMask } from '../meta/mask';
import { drawMask, drawPlayer } from '../render/sprites';
import { restoreLook } from './shopArt';

const PROBE_W = 240;
const PROBE_H = 200;
const PROBE_FX = 120;
const PROBE_FY = 180;
/** 서 있는 자세의 잉크 높이 = 그림 칸 높이의 이만큼(나머지는 칼을 휘두를 자리) */
const FILL_H = 0.74;
const FILL_W = 0.62;
/** 그림 칸이 아직 안 깔렸을 때(숨긴 화면) 쓰는 크기 */
const FALLBACK_W = 600;
const FALLBACK_H = 500;
const MAX_SIDE = 1400;

export interface HeroLook {
  loadout: Loadout;
  maskArt: string;
}

interface Fit { key: string; k: number; fx: number; fy: number }
let fit: Fit | null = null;

const lookKey = (l: HeroLook, w: number, h: number): string =>
  `${l.loadout.weapon}|${l.loadout.body}|${l.loadout.blade}|${l.loadout.mask}|${w}x${h}`;

function draw(ctx: CanvasRenderingContext2D, l: HeroLook, pose: PlayerPose): void {
  const t = pose === 'attack' ? PLAYER.ATTACK_PRE : 0; // 공격은 참격 호가 있는 칸
  drawPlayer(ctx, pose, t, 0, 0);
  if (l.loadout.mask === 'mask') drawMask(ctx, pose, t, 0, 0, wornMask(l.maskArt));
}

/** 서 있는 자세를 1배로 한 번 그려 잉크가 차지한 상자를 잰다 — 무기마다 칼 길이가 달라 고정 배율이면 잘린다 */
function measure(l: HeroLook, w: number, h: number): Fit {
  const key = lookKey(l, w, h);
  if (fit?.key === key) return fit;
  let x0 = PROBE_W, x1 = -1, y0 = PROBE_H;
  const cv = document.createElement('canvas');
  cv.width = PROBE_W;
  cv.height = PROBE_H;
  const ctx = cv.getContext('2d');
  if (ctx) {
    ctx.translate(PROBE_FX, PROBE_FY);
    draw(ctx, l, 'idle');
    const d = ctx.getImageData(0, 0, PROBE_W, PROBE_H).data;
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] <= 20) continue;
      const p = (i - 3) / 4;
      const x = p % PROBE_W;
      const y = (p - x) / PROBE_W;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
    }
  }
  // 잉크가 없으면(그림이 아직 안 왔다) 졸라맨 한 칸(72×76) 기준
  const inkW = x1 < 0 ? 40 : x1 - x0 + 1;
  const inkH = x1 < 0 ? 60 : PROBE_FY - y0;
  const mid = x1 < 0 ? 0 : (x0 + x1) / 2 - PROBE_FX;
  const k = Math.min((h * FILL_H) / inkH, (w * FILL_W) / inkW);
  fit = { key, k, fx: w * 0.5 - mid * k, fy: h * 0.985 };
  return fit;
}

/** 캔버스 하나에 뿌뿌를 그린다. 캔버스의 화면 크기(배율 · 기기 픽셀 포함)에 맞춰 판을 다시 잡는다 */
export function paintHero(cv: HTMLCanvasElement, l: HeroLook, pose: PlayerPose): void {
  const r = cv.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  let w = Math.round(r.width * dpr);
  let h = Math.round(r.height * dpr);
  if (w < 8 || h < 8) { w = FALLBACK_W; h = FALLBACK_H; }
  const s = Math.min(1, MAX_SIDE / Math.max(w, h));
  w = Math.round(w * s);
  h = Math.round(h * s);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  restoreLook(l.loadout); // 졸라맨 전역 상태(무기 · 색)를 장착 그대로 — 상점 그림이 바꿔 놨을 수 있다
  const f = measure(l, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(f.k, 0, 0, f.k, f.fx, f.fy);
  draw(ctx, l, pose);
}
