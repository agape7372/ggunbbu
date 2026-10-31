// 먹 한 획 — 붓과 먹으로 그린 모양들(그리기만, 상태 없음). effects.ts 파티클과 screenfx 필살 예비동작이 같이 쓴다.
// 이 모양들은 옅어지며 사라지지 않는다: 먹 방울은 줄고, 땅에 떨어지면 번졌다 오그라들고,
// 엔소(붓으로 그은 원)는 시작점부터 말라 세 갈래(비백)로 갈라지며 끊긴다.
// 색은 부르는 쪽이 fillStyle로 정한다 — 여기선 모양만.

import { PALETTE } from '../config';

const TAU = Math.PI * 2;
/** 엔소 한 바퀴 — 다 닫지 않는다(붓을 뗀 틈) */
const SPAN = TAU * 0.93;

/** 결정적 흔들림 0..1 — 그릴 때마다 같은 모양이어야 해서 난수를 안 쓴다 */
function hs(seed: number, k: number): number {
  const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** 먹 방울 — 둥근 머리가 ang 쪽으로 날고 꼬리가 반대쪽으로 뾰족하다. tail = 꼬리 길이(빠를수록 길다) */
export function inkDrop(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ang: number, tail: number): void {
  if (r < 0.3) return;
  ctx.beginPath();
  ctx.arc(x, y, r, ang - Math.PI / 2, ang + Math.PI / 2);
  ctx.lineTo(x - Math.cos(ang) * (r + tail), y - Math.sin(ang) * (r + tail));
  ctx.closePath();
  ctx.fill();
}

/** 땅에 번진 먹 — 납작한 자국 + 양옆 곁방울. k = 1(막 떨어짐) → 0(다 오그라듦) */
export function inkSplat(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k: number, seed: number): void {
  if (k <= 0.03) return;
  ctx.beginPath();
  ctx.ellipse(x, y, r * (0.45 + 0.55 * k), r * 0.32 * k + 0.4, 0, 0, TAU);
  for (let i = 0; i < 2; i++) {
    const rr = r * (0.16 + 0.1 * hs(seed, i)) * k;
    if (rr < 0.35) continue;
    const dx = (i === 0 ? -1 : 1) * r * (1.1 + 0.6 * hs(seed, i + 2));
    ctx.moveTo(x + dx + rr * 1.6, y);
    ctx.ellipse(x + dx, y, rr * 1.6, rr * 0.55, 0, 0, TAU);
  }
  ctx.fill();
}

/** 먹 터짐 크기 — 앞 22%에 부풀어 살짝 넘쳤다가(1.12) 끝까지 오그라든다. u = 0 → 1 */
export function popScale(u: number): number {
  return u < 0.22 ? 0.5 + 0.62 * Math.sin((u / 0.22) * Math.PI / 2) : 1.12 * Math.pow(1 - (u - 0.22) / 0.78, 0.8);
}

/**
 * 먹 터짐 — 가운데 덩이 + 둘레 혹 여섯 + 바깥으로 뻗는 가시 다섯(한 경로, 모두 같은 감김이라 겹친 데가 비지 않는다).
 * face = 면 색. 먹이 아닌 면(종이 「팡」)은 먹 테를 먼저 굵게 긋고 면을 위에 칠한다 — 겹친 안쪽 선은 면이 덮는다.
 */
export function inkBlot(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, seed: number, face: string = PALETTE.INK): void {
  if (R < 0.6) return;
  ctx.beginPath();
  ctx.moveTo(x + R, y);
  ctx.arc(x, y, R, 0, TAU);
  for (let i = 0; i < 6; i++) {
    const a = seed + i * (TAU / 6) + (hs(seed, i) - 0.5) * 0.7;
    const d = R * (0.72 + 0.28 * hs(seed, i + 6));
    const rr = R * (0.32 + 0.22 * hs(seed, i + 12));
    const bx = x + Math.cos(a) * d;
    const by = y + Math.sin(a) * d;
    ctx.moveTo(bx + rr, by);
    ctx.arc(bx, by, rr, 0, TAU);
  }
  for (let i = 0; i < 5; i++) {
    const a = seed * 1.7 + i * (TAU / 5) + (hs(seed, i + 20) - 0.5) * 0.9;
    const L = R * (1.45 + 0.7 * hs(seed, i + 26));
    const hw = 0.17;
    ctx.moveTo(x + Math.cos(a - hw) * R * 0.8, y + Math.sin(a - hw) * R * 0.8);
    ctx.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L);
    ctx.lineTo(x + Math.cos(a + hw) * R * 0.8, y + Math.sin(a + hw) * R * 0.8);
    ctx.closePath();
  }
  if (face !== PALETTE.INK) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = PALETTE.INK;
    ctx.stroke();
  }
  ctx.fillStyle = face;
  ctx.fill();
}

/** 붓 누름 — 들어갈 때 눌러 굵어지고(앞 7%) 끝으로 갈수록 가늘게 빠진다. s = 획 위 자리 0 → 1 */
const press = (s: number): number => (0.5 + 0.5 * Math.min(1, s / 0.07)) * (1 - 0.78 * Math.pow(s, 1.4));

/**
 * 엔소 — 붓으로 한 번에 그은 원. 획 위 자리 s0(꼬리) ~ s1(머리)만 그린다(0 = 붓을 댄 곳 · 1 = 뗀 곳, 한 바퀴의 93%).
 * w = 가장 굵은 데 굵기 · a0 = 붓을 댄 각 · dry = 마른 정도(0 = 한 줄, 커질수록 세 갈래로 갈라져 벌어지고 갈래마다 다른 데서 끊긴다)
 * · flat = 세로 배율(1 = 원 · 0.3 = 땅에 누운 고리) · seed = 손떨림 모양.
 */
export function enso(
  ctx: CanvasRenderingContext2D, x: number, y: number, r: number, w: number,
  a0: number, s0: number, s1: number, dry: number, flat: number, seed: number,
): void {
  if (s1 - s0 < 0.01 || w < 0.3 || r < 1) return;
  const bands = dry > 0.04 ? 3 : 1;
  for (let b = 0; b < bands; b++) {
    const lane = bands === 1 ? 0 : b - 1;
    const bw = bands === 1 ? 1 : 0.46 - 0.12 * dry;
    const off = lane * w * (0.3 + 0.2 * dry);
    // 비백 — 가운데 갈래가 가장 길고 바깥 둘은 먼저 끊긴다
    const cut = bands === 1 ? 0 : dry * (lane === 0 ? 0.06 : 0.16 + 0.22 * hs(seed, b));
    const e = s1 - (s1 - s0) * cut;
    if (e - s0 < 0.01) continue;
    const n = Math.max(6, Math.ceil((e - s0) * 44));
    ctx.beginPath();
    for (let side = 1; side >= -1; side -= 2) {
      for (let j = 0; j <= n; j++) {
        const i = side === 1 ? j : n - j; // 바깥 가장자리는 꼬리 → 머리, 안쪽은 되돌아온다
        const s = s0 + (e - s0) * (i / n);
        const th = a0 + s * SPAN;
        const rad = r * (1 + 0.035 * Math.sin(seed + s * 9)) + off + side * 0.5 * w * bw * press(s);
        const px = x + Math.cos(th) * rad;
        const py = y + Math.sin(th) * rad * flat;
        if (j === 0 && side === 1) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.fill();
  }
}
