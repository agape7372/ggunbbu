// 먹 한 획 — 붓과 먹으로 그린 모양들(그리기만, 상태 없음). 판 이펙트 · 필살 연출 · 명물 · 상점 그림이 같이 쓴다.
// 이 모양들은 옅어지며 사라지지 않는다: 먹 방울은 줄고, 땅에 떨어지면 번졌다 오그라들고,
// 엔소(붓으로 그은 원)는 시작점부터 말라 세 갈래(비백)로 갈라지며 끊긴다.
// 색은 부르는 쪽이 fillStyle로 정한다 — 여기선 모양만.

import { JUICE_SYS, PALETTE } from '../config';

const TAU = Math.PI * 2;
/**
 * 달군 속 — 막 벤 포인트 색 속 한가운데에 종이빛 줄을 한 번 더 칠한다. 벤 순간 하얗게 달았다가 포인트 색으로 식는다.
 * 빛을 번지게 깔지 않고 모양으로만 낸다. f = 포인트 색이 보이는 동안 중 지난 몫(0 → 1). 줄은 HOT_U 몫 안에 사라진다.
 * 굵게 버티다 끝에 빨리 준다(제곱근) — 가는 줄이 오래 남으면 광택처럼 읽힌다. draw(k)는 속 굵기에 k를 곱해 칠한다.
 */
export function hotCore(ctx: CanvasRenderingContext2D, f: number, draw: (k: number) => void): void {
  const heat = 1 - f / JUICE_SYS.HOT_U;
  if (heat <= 0) return;
  const was = ctx.fillStyle;
  ctx.fillStyle = PALETTE.BG;
  draw(JUICE_SYS.HOT_W * Math.sqrt(Math.min(1, heat)));
  ctx.fillStyle = was;
}
/** 엔소 한 바퀴 — 다 닫지 않는다(붓을 뗀 틈) */
const SPAN = TAU * 0.93;

/** 결정적 흔들림 0..1 — 그릴 때마다 같은 모양이어야 해서 난수를 안 쓴다 */
export function hs(seed: number, k: number): number {
  const v = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/** 주기 없는 잡음 −0.5..0.5 — 정수 칸마다 hs 값을 부드럽게 잇는다 */
function vnoise(seed: number, t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return hs(seed, i) + (hs(seed, i + 1) - hs(seed, i)) * u - 0.5;
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

/** 누름 곡선 셋 — s = 획 위 자리 0(댄 곳) → 1(뗀 곳), 값 = 굵기 배율 */
export const PRESS = {
  /** 엔소 — 대며 눌렀다가 끝으로 빠진다 */
  enso: press,
  /** 베기 — 가늘게 들어가 앞 3분의 1에서 가장 굵고 칼끝처럼 뾰족하게 빠진다 */
  cut: (s: number): number => Math.sin(Math.PI * Math.pow(Math.min(1, Math.max(0, s)), 0.7)),
  /** 튕김 — 대는 데가 가장 굵고 한 번에 빠진다(갈고리 끝 · 쳐낸 획) */
  flick: (s: number): number => Math.pow(1 - Math.min(1, s), 1.15),
  /** 먹줄 — 처음부터 끝까지 고르다(양 끝만 살짝) */
  line: (s: number): number => Math.min(1, s / 0.04, (1 - s) / 0.04 + 0.35),
  /** 한 일(一) — 붓머리를 눌러 대고, 몸은 조금 가늘게, 끝에서 다시 눌렀다 뗀다(돈필) */
  yi: (s: number): number => Math.min(1, s / 0.02, (1 - s) / 0.03)
    * (0.8 + 0.32 * Math.exp(-(((s - 0.07) / 0.06) ** 2)) + 0.3 * Math.exp(-(((s - 0.92) / 0.05) ** 2))),
} as const;

/**
 * 붓 획 한 줄기 — at(s, out)이 획 위 자리 s의 점을 out에 쓴다. len = 대략 길이(점 개수만 정한다).
 * s0 ~ s1만 그린다(모양으로 지우기 — 꼬리부터 깎으려면 s0을 올린다). dry = 비백.
 * 비백(11-01 레퍼런스: 실제 마른 붓 · 잉크 슬래시 VFX) — 붓털은 머리에선 먹을 머금어 한 덩이고, 꼬리로 가며
 * 가닥(6~16)으로 풀린다. 가닥마다 굵기 · 끝나는 자리가 달라 틈이 저절로 생기고, 바깥 가닥이 먼저 끊긴다.
 */
function strokeAlong(
  ctx: CanvasRenderingContext2D, at: (s: number, out: number[]) => void, len: number,
  w: number, s0: number, s1: number, dry: number, seed: number, pr: (s: number) => number,
): void {
  if (s1 - s0 < 0.01 || w < 0.3) return;
  const P = [0, 0];
  const A = [0, 0];
  const B = [0, 0];
  const eaten = s0 > 0.001; // 꼬리를 깎은 획 — 깎인 끝도 뾰족하게
  const span = s1 - s0;
  /** 한 줄기를 채운다 — lane = 가로 자리(-1..1, 0 = 가운데) · hw(s) = 반폭 배율 · e = 끝나는 자리 */
  const band = (lane: number, hw: (s: number) => number, e: number, k: number): void => {
    if (e - s0 < 0.01) return;
    const n = Math.max(6, Math.ceil(((e - s0) * len) / 5));
    ctx.beginPath();
    for (let side = 1; side >= -1; side -= 2) {
      for (let j = 0; j <= n; j++) {
        const i = side === 1 ? j : n - j;
        const s = s0 + (e - s0) * (i / n);
        at(s, P);
        at(Math.max(0, s - 0.004), A);
        at(Math.min(1, s + 0.004), B);
        const tx = B[0] - A[0];
        const ty = B[1] - A[1];
        const tl = Math.hypot(tx, ty) || 1;
        const split = s < 0.2 ? 0 : Math.min(1, (s - 0.2) / 0.6);
        const tip = eaten ? Math.min(1, (s - s0) / 0.12) : 1;
        // 끝으로 갈수록 가늘게 — 가닥이 끊기는 자리에서 뾰족하게 빠진다
        const end = Math.min(1, (e - s) / Math.max(0.04, (e - s0) * 0.18));
        const body = 0.5 * w * pr(s) * tip;
        const off = lane * body * (1 + 0.35 * dry * split);
        // 가장자리 떨림 — 주기 없는 잡음(물결 리본이 되지 않게). 머리는 작게, 꼬리는 두 배, 한쪽(side 1)이 더 거칠다
        const rough = (0.5 + 0.5 * split) * (side === 1 ? 1 : 0.55) * Math.min(1, w * 0.07) * vnoise(seed + k * 7 + (side === 1 ? 0 : 50), s * len * 0.16);
        const rad = off + side * body * hw(s) * end + w * 0.05 * Math.sin(seed + s * 11) + rough;
        const px = P[0] - (ty / tl) * rad;
        const py = P[1] + (tx / tl) * rad;
        if (j === 0 && side === 1) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.fill();
  };
  if (dry <= 0.04) {
    band(0, () => 1, s1, 0);
    return;
  }
  // 몸통 — 머리에서 먹을 머금은 한 덩이. 마를수록 일찍 끝나고 끝에서 가늘게 가닥 속으로 사라진다
  band(0, () => 1, s0 + span * (1 - 0.62 * Math.min(1, dry)), 0);
  // 가닥 — 너비 전체를 나눠 덮고(겹쳐서 머리 쪽엔 틈이 없다) 꼬리에서 가늘어지며 제각각 끊긴다
  const K = 5 + Math.round(7 * Math.min(1, dry));
  for (let k = 0; k < K; k++) {
    const lane = -1 + (2 * (k + 0.5)) / K + (hs(seed, k + 70) - 0.5) * (1.2 / K);
    const outer = Math.abs(lane);
    const cut = dry * (0.02 + 0.42 * hs(seed, k + 90) * (0.4 + 0.6 * outer));
    // 굵은 다발과 실 같은 털이 섞인다 — 제곱으로 몇 가닥만 굵게
    const thick = (0.7 + 2.1 * hs(seed, k + 110) ** 2) / K;
    band(lane, (s) => thick * (1 - 0.45 * dry * Math.max(0, (s - 0.3) / 0.7)), s1 - span * cut, k + 1);
  }
}

/** 곧은(bend로 살짝 휜) 붓 획 — (x0,y0) = 댄 곳 · (x1,y1) = 뗀 곳. bend = 가운데가 진행 방향 왼쪽으로 부푸는 px */
export function brushLine(
  ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number,
  w: number, s0: number, s1: number, dry: number, seed: number, bend = 0, pr: (s: number) => number = PRESS.cut,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  strokeAlong(ctx, (s, o) => {
    const k = bend * Math.sin(Math.PI * s);
    o[0] = x0 + dx * s + nx * k;
    o[1] = y0 + dy * s + ny * k;
  }, L, w, s0, s1, dry, seed, pr);
}

/** 꺾인 붓 획 — pts = [x0,y0, x1,y1, …] 꺾은선을 길이 비례로 따라간다(낙뢰 · 지그재그 · 철골 꺾임) */
export function brushPath(
  ctx: CanvasRenderingContext2D, pts: readonly number[], w: number, s0: number, s1: number,
  dry: number, seed: number, pr: (s: number) => number = PRESS.cut,
): void {
  const n = pts.length / 2 - 1;
  if (n < 1) return;
  const cum = [0];
  for (let i = 0; i < n; i++) cum.push(cum[i] + Math.hypot(pts[i * 2 + 2] - pts[i * 2], pts[i * 2 + 3] - pts[i * 2 + 1]));
  const L = cum[n] || 1;
  strokeAlong(ctx, (s, o) => {
    const d = s * L;
    let i = 0;
    while (i < n - 1 && cum[i + 1] < d) i++;
    const f = (d - cum[i]) / (cum[i + 1] - cum[i] || 1);
    o[0] = pts[i * 2] + (pts[i * 2 + 2] - pts[i * 2]) * f;
    o[1] = pts[i * 2 + 1] + (pts[i * 2 + 3] - pts[i * 2 + 1]) * f;
  }, L, w, s0, s1, dry, seed, pr);
}

/** 호 붓 획 — 중심 (cx,cy) 반지름 r, a0에서 sweep(라디안, 음수면 반대로)만큼. flat = 세로 배율 */
export function brushArc(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, a0: number, sweep: number,
  w: number, s0: number, s1: number, dry: number, seed: number, flat = 1, pr: (s: number) => number = PRESS.cut,
): void {
  strokeAlong(ctx, (s, o) => {
    const th = a0 + sweep * s;
    o[0] = cx + Math.cos(th) * r;
    o[1] = cy + Math.sin(th) * r * flat;
  }, Math.abs(sweep) * r, w, s0, s1, dry, seed, pr);
}

/**
 * 방향 있는 먹 튐 — 친 쪽(ang)으로 길쭉한 덩이 + 앞쪽 혹 셋 + 같은 쪽 부채로 튄 방울 n(가까운 것은 가는 줄로 이어진다).
 * 크기는 부르는 쪽이 R로(popScale 등), 지우기도 R을 줄여서.
 */
export function spatter(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, ang: number, seed: number, n = 7): void {
  if (R < 0.6) return;
  ctx.beginPath();
  // 덩이 — 둘레를 흔든 열여섯 점을 가운데점 곡선으로 잇는다. 친 쪽으로 늘어나고 그쪽에 뾰족한 혀가 한두 개 나온다.
  const N = 16;
  const px: number[] = [];
  const py: number[] = [];
  for (let k = 0; k < N; k++) {
    const th = (k / N) * TAU;
    const rel = Math.cos(th - ang);
    let r = R * (0.8 + 0.22 * hs(seed, k)) * (1 + 0.4 * Math.max(0, rel));
    // 친 쪽으로 뻗은 혀 — 하나만, 짧게(여럿이면 벌레 다리로 읽힌다)
    if (k === Math.round(((ang / TAU) % 1 + 1) % 1 * N + (hs(seed, 40) - 0.5) * 2) % N) r *= 1.3 + 0.2 * hs(seed, 50);
    px.push(x + Math.cos(th) * r);
    py.push(y + Math.sin(th) * r);
  }
  ctx.moveTo((px[N - 1] + px[0]) / 2, (py[N - 1] + py[0]) / 2);
  for (let k = 0; k < N; k++) {
    const q = (k + 1) % N;
    ctx.quadraticCurveTo(px[k], py[k], (px[k] + px[q]) / 2, (py[k] + py[q]) / 2);
  }
  ctx.closePath();
  // 튄 방울 — 친 쪽 부채. 멀수록 작고, 머리는 바깥 · 꼬리는 덩이 쪽(날아간 방향이 보인다)
  for (let i = 0; i < n; i++) {
    const a = ang + (hs(seed, i + 10) - 0.5) * 1.5;
    const f = hs(seed, i + 20);
    const d = R * (1.6 + 2.3 * f);
    const rr = R * (0.27 - 0.15 * f);
    if (rr < 0.35) continue;
    const bx = x + Math.cos(a) * d;
    const by = y + Math.sin(a) * d;
    ctx.moveTo(bx + Math.cos(a - Math.PI / 2) * rr, by + Math.sin(a - Math.PI / 2) * rr);
    ctx.arc(bx, by, rr, a - Math.PI / 2, a + Math.PI / 2);
    ctx.lineTo(bx - Math.cos(a) * rr * (1.6 + 1.6 * (1 - f)), by - Math.sin(a) * rr * (1.6 + 1.6 * (1 - f)));
    ctx.closePath();
  }
  // 잔 점 — 위성 방울보다 멀리, 크기 편차가 크다(레퍼런스 §2-7 셋째 단)
  for (let i = 0; i < n + 3; i++) {
    const a = ang + (hs(seed, i + 120) - 0.5) * 2.2;
    const d = R * (2.4 + 2.6 * hs(seed, i + 140));
    const rr = Math.max(0.5, R * 0.07 * (0.4 + hs(seed, i + 160) * 1.4));
    if (rr > R * 0.3) continue;
    const bx = x + Math.cos(a) * d;
    const by = y + Math.sin(a) * d;
    ctx.moveTo(bx + rr, by);
    ctx.arc(bx, by, rr, 0, TAU);
  }
  // 속 빈 고리 방울 하나 — 먹이 마르며 가장자리만 남았다(안쪽 원을 거꾸로 감아 구멍)
  if (n >= 4 && R >= 6) {
    const a = ang + (hs(seed, 180) - 0.5) * 1.1;
    const d = R * (1.9 + 0.8 * hs(seed, 181));
    const rr = R * 0.2;
    const bx = x + Math.cos(a) * d;
    const by = y + Math.sin(a) * d;
    ctx.moveTo(bx + rr, by);
    ctx.arc(bx, by, rr, 0, TAU, false);
    ctx.moveTo(bx + rr * 0.55, by);
    ctx.arc(bx, by, rr * 0.55, 0, TAU, true);
  }
  ctx.fill();
}

/** 마른 먹 가루 — 붓을 털 때 튄 잔 점 무리(먼지 · 쇳가루). k = 1 → 0 점이 작아진다 */
export function inkDust(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, k: number, seed: number, n = 9): void {
  if (k <= 0.05) return;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = hs(seed, i) * TAU;
    const d = R * Math.sqrt(hs(seed, i + 30));
    const rr = (0.7 + 1.5 * hs(seed, i + 60)) * k;
    if (rr < 0.3) continue;
    const bx = x + Math.cos(a) * d;
    const by = y + Math.sin(a) * d * 0.7;
    ctx.moveTo(bx + rr, by);
    ctx.arc(bx, by, rr, 0, TAU);
  }
  ctx.fill();
}

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
  // 둘레 흔들림은 반지름에, 비백은 strokeAlong이(꼬리로 갈수록 갈래가 벌어진다)
  strokeAlong(ctx, (s, o) => {
    const th = a0 + s * SPAN;
    const rad = r * (1 + 0.035 * Math.sin(seed + s * 9));
    o[0] = x + Math.cos(th) * rad;
    o[1] = y + Math.sin(th) * rad * flat;
  }, SPAN * r, w, s0, s1, dry, seed, press);
}
