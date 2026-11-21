// 해일 대검(물) 레시피 — 4판(11-21 방향표 「해일」 절). bladeFx RECIPES(surf)가 이어 붙이기만 한다.
// 꼴: 왼쪽 땅에서 솟아 오른쪽 위로 크게 말리는 호쿠사이 마루 한 덩이(자료 S1 S2 S4). 등은 밑동(먹)에서 가파르게 솟아 마루를 넘고,
// 말림은 가는 붓 두 가닥(입술 · 속 말림)이 먹 머리 → 파랑 꼬리로 앞 → 아래 → 안으로 감긴다. 마루 앞끝은 길이 · 간격 · 휨이 제각각인 갈퀴 손가락으로 갈라진다(손가락마다 제 갈고리).
// 몸 안쪽엔 마른 붓 결 줄이 겉선을 따라 겹으로 감기고, 가장 안쪽 줄은 더 감겨 작은 마루가 된다. 갈퀴 끝에서 물방울 덩이
// (큰 것 · 중간 · 가루 3단)가 끊겨 포물선으로 떨어진다. 완파는 앞에 작은 마루가 먼저 일어난다(예비).
// 칼길 · 필살 번짐 = 히노카미 물 띠(자료 S5 S6 S10 S12): 굵기가 머리 → 꼬리로 바뀌는 띠 두셋이 서로 다른 주기 ·
// 다른 속도로 꼬이며 칼길을 감고, 띠 바깥으로 물방울 덩이가 튄다.
// 칼 기운 = 칼을 감아 오르는 띠 둘이 날 바깥 · 하늘 쪽으로 서는 작은 갈퀴 마루로 말려 무너졌다 다시 솟는다.
// 박자: 솟음 4프레임 → 말림 4 → 갈퀴가 앞 · 아래로 처지며 물방울 덩이가 떨어지고 몸은 밑동부터 깎인다(무너짐).
// 자리: 주인공 몸 상자(발 위 0~60 · 좌우 ±18)와 오른쪽 아래 「콤보」 도장 자리를 비운다 — 땅 파도는 왼쪽 땅에서 솟고
// 말림은 주인공 머리 위 높이에서 끝난다(3판은 파도가 도장에 닿았다).
// 다른 넷과 갈림(흑백): 불새 = 위로 큰 면 · 해일 = 옆으로 말린 큰 면 · 고압선 = 공중 가는 선 · 고드름 = 각진 덩이 · 그림자 = 땅에서 솟은 가는 선 다발.
// 문법(불변 13): 먹 머리 → 시그니처 색 꼬리 · 알파 지우기 금지(모양으로) · shadowBlur · 블룸 · 별 · 원판 + 방사형 띠 · 아이콘 금지.
// ⚠ bladeFx와 순환 import — 최상위에서 bladeFx 값을 부르지 않는다. 시험에서 이 파일을 bladeFx보다 먼저 import하지 않는다.
import { PALETTE, VIEW, WEAPON_FX } from '../../config';
import { bent, drops, later, n01, samplePath, sgn, type Recipe } from '../bladeFx';
import { follow, liteOf, moonPoint, pathLen, swingMoon } from './geom';

type V = readonly [number, number];
const PI = Math.PI;
const TAU = PI * 2;
const FOAM = PALETTE.BG; // 거품 = 밝은 짝 획 속에 남는 종이빛
const F60 = 1 / 60;
/** 솟음 · 말림 프레임(키운 그림은 later · 삶이 1.2배라 실제로는 4 · 4) */
const RISE = 3.5 * F60;
const CURL = 3.5 * F60;
const RIGHT: V = [1, 0];
const UP: V = [0, -1];

/** 위(U)를 세운 파도의 앞 — U를 90° 돌린 둘 중 want 쪽에 가까운 것 */
const fwdOf = (U: V, want: V): V => (-U[1] * want[0] + U[0] * want[1] >= 0 ? [-U[1], U[0]] : [U[1], -U[0]]);
/** 월드 x → scaled(친 자리, WEAPON_FX.SIZE) 안에서 부를 x */
const inX = (x: number, wx: number): number => x + (wx - x) / WEAPON_FX.SIZE;
/** 땅 높이 — 키운 뒤 땅에 닿을 자리를 미리 줄여 넣는다(put은 획 머리만 땅 위로 잘라 올린다) */
const groundIn = (y: number): number => y + (VIEW.GROUND_Y - 2 - y) / WEAPON_FX.SIZE;

/**
 * 마루 한 덩이 — 밑동 (ox, oy) · 앞 F · 위 U · 높이 H(px). 로컬 (a, b) = 앞으로 a·H, 위로 b·H·sy(sy = 세로 배율, 없으면 1).
 * ca = 마루 꼭대기의 앞 거리 · ra / rb = 말림 가로 · 세로 반지름(높이 1 기준)
 */
interface Crest { ox: number; oy: number; F: V; U: V; H: number; ca: number; ra: number; rb: number; sy?: number }

const toW = (cr: Crest, a: number, b: number): [number, number] => {
  const bb = b * (cr.sy ?? 1);
  return [cr.ox + (cr.F[0] * a + cr.U[0] * bb) * cr.H, cr.oy + (cr.F[1] * a + cr.U[1] * bb) * cr.H];
};

/** 등 위 t(0 = 밑동 → 1 = 마루 꼭대기) — 밑동에서 가파르게 솟아 꼭대기에서 눕는다. d = 몸 안쪽(앞 · 아래)으로 */
function backAt(cr: Crest, t: number, d = 0): [number, number] {
  const ta = cr.ca;
  const tb = 2.1 * (1 - t) ** 1.1;
  const l = Math.hypot(ta, tb);
  return [cr.ca * t + (tb / l) * d, 1 - (1 - t) ** 2.1 - (ta / l) * d];
}

/** 말림 위 th(0 = 마루 꼭대기 → π/2 = 앞끝 → π = 말림 밑 → 더 돌면 안으로) — 돌수록 반지름이 준다(나선). d = 안쪽으로(음수면 바깥) */
function curlAt(cr: Crest, th: number, d = 0): [number, number] {
  const q = (1 - (0.34 * th) / PI) * (1 - d / cr.rb);
  return [cr.ca + cr.ra * q * Math.sin(th), 1 - cr.rb + cr.rb * q * Math.cos(th)];
}

/** 등 꺾은선(월드) t0 → 1 → 말림 0 → th1. d = 안쪽 */
function ridge(cr: Crest, t0: number, th1: number, d = 0, nb = 7, nc = 10): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= nb; i++) pts.push(...toW(cr, ...backAt(cr, t0 + ((1 - t0) * i) / nb, d)));
  for (let i = 1; i <= nc; i++) pts.push(...toW(cr, ...curlAt(cr, (th1 * i) / nc, d)));
  return pts;
}
/** 말림만 th0 → th1(월드) */
function curlPts(cr: Crest, th0: number, th1: number, n = 12, d = 0): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) pts.push(...toW(cr, ...curlAt(cr, th0 + ((th1 - th0) * i) / n, d)));
  return pts;
}

/** 물방울 덩이 — (x, y)에서 ang 쪽으로 큰 것 · 중간 · 가루 3단이 한 덩이로 끊겨 날아 포물선으로 떨어진다(n = 3~8) */
function clump(x: number, y: number, ang: number, spd: number, n: number, k: number, c: string): void {
  const nb = n >= 6 ? 2 : 1;
  const nm = Math.ceil((n - nb) / 2);
  const nf = n - nb - nm;
  drops(x, y, nb, ang - 0.05, ang + 0.05, spd * 0.85, spd, 3.1 * k, c, 900, true);
  drops(x, y, nm, ang - 0.15, ang + 0.15, spd * 0.7, spd * 1.05, 2 * k, c, 900, true);
  if (nf > 0) drops(x, y, nf, ang - 0.26, ang + 0.26, spd * 0.55, spd * 1.15, 1.2 * k, liteOf(c), 900, true);
}

/** 갈퀴 손가락 꺾은선(월드) — 말림 바깥 테(out = 몸 반폭, 로컬) th 자리에서 바깥 · 위로 뻗다가 끝으로 갈수록 bend만큼 앞 · 아래로 감긴다 */
function fingerPts(cr: Crest, th: number, out: number, len: number, bend: number): number[] {
  let [a, b] = curlAt(cr, th, -out);
  let phi = Math.atan2(Math.cos(th), Math.sin(th)) + 0.45; // 바깥(말림 중심에서) 쪽을 조금 위로
  const pts = [...toW(cr, a, b)];
  for (let i = 1; i <= 6; i++) {
    phi -= (bend * (i ** 1.6 - (i - 1) ** 1.6)) / 6 ** 1.6; // 끝으로 갈수록 세게 감긴다
    a += (Math.cos(phi) * len) / 6;
    b += (Math.sin(phi) * len) / 6;
    pts.push(...toW(cr, a, b));
  }
  return pts;
}

/**
 * 결 줄 꺾은선(월드) — 몸 안쪽 d만큼 들어가 등을 따라 t0 → t1로 가다가 끝에서 제 작은 마루로 감긴다(반지름 r · 로컬).
 * 큰 마루 안에 작은 마루가 겹으로 서는 꼴(자료 S1)
 */
function grainPts(cr: Crest, t0: number, t1: number, d: number, r: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= 5; i++) pts.push(...toW(cr, ...backAt(cr, t0 + ((t1 - t0) * i) / 5, d)));
  const [a, b] = backAt(cr, t1, d);
  const [a0, b0] = backAt(cr, t1 - 0.02, d);
  const g = Math.atan2(b - b0, a - a0); // 등을 따라 가던 쪽
  const [cx, cy] = [a + Math.cos(g - PI / 2) * r, b + Math.sin(g - PI / 2) * r]; // 오른쪽(안쪽)에 작은 말림 중심
  for (let i = 1; i <= 6; i++) {
    const th = g + PI / 2 - (i / 6) * PI * 1.25;
    const rr = r * (1 - 0.35 * (i / 6));
    pts.push(...toW(cr, cx + Math.cos(th) * rr, cy + Math.sin(th) * rr));
  }
  return pts;
}

/** 끝 자리와 끝이 가는 쪽(월드 각) */
const tipOf = (pts: number[]): [number, number, number] => {
  const n = pts.length;
  return [pts[n - 2], pts[n - 1], Math.atan2(pts[n - 1] - pts[n - 3], pts[n - 2] - pts[n - 4])];
};

/**
 * 한 판의 꼴 — w = 몸 굵기(px) · life · nf = 갈퀴 손가락 수 · ng = 결 줄 수 · nd = 물방울 덩이를 떨굴 손가락 수 ·
 * t0 = 등이 시작하는 자리(0 = 땅) · fan = 손가락이 나는 말림 범위 [th0, th1] · len = 손가락 길이(로컬) · k = 방울 크기
 */
interface Look { w: number; life: number; nf: number; ng: number; nd: number; t0: number; fan: readonly [number, number]; len: number; k: number }

/**
 * 마루 한 판 — 등(먹 밑동 → 마루 → 앞끝, 솟음) → 말림 통(마루 앞 위 먹 → 앞 · 아래 · 안으로, 말림) · 결 줄 →
 * 갈퀴 손가락(말림이 닿을 때 차례로) → 갈퀴 끝 물방울 덩이(무너짐). 다 선 뒤 몸은 앞으로, 갈퀴는 앞 · 아래로 처진다
 */
function surge(cr: Crest, L: Look, c: string): void {
  const drift = 14 * Math.min(L.k, 1.1); // 단이 높아도 표류는 묶는다(오른쪽 아래 「콤보」 도장 쪽으로 흘러가지 않게)
  const [vx, vy] = [cr.F[0] * drift, cr.F[1] * drift];
  const half = L.w / 2 / cr.H; // 몸 반폭(로컬)
  bent(ridge(cr, L.t0, PI * 0.5, 0, 8, 5), L.w, '', { body: c, pr: 3, dry: 0.14, gr: Math.min(0.6, (RISE * 1.3) / L.life), life: L.life, vx, vy });
  // 말림 — 붓 두 가닥. r6까지는 굵은 통 한 획(몸 굵기 9할 · 1.44π 감김)이라 머리(꼭대기 뒤)와 꼬리(말림 밑)가 위아래로 붙어
  // 먹 → 파랑이 윗변을 통째로 먹으로 칠했다(윗면 납작한 검은 네모로 읽힘 · 11-22 검수). 가닥마다 머리와 꼬리를 떼어 길을 따라 색이 바뀌게.
  // 입술 = 꼭대기 뒤에서 가늘게 대(누름 cut — 머리가 뭉툭하게 잘리지 않는다) 앞 · 아래로 둥글게 넘긴다
  later(RISE * 0.3, () => bent(curlPts(cr, -PI * 0.14, PI * 0.8, 10), L.w * 0.44, '', {
    body: c, pr: 0, dry: 0.36, gr: Math.min(0.6, (CURL * 0.9) / L.life), life: L.life * 0.92, vx, vy,
  }));
  // 속 말림 = 앞끝에서 안으로 감기는 더 가는 가닥(마른 붓 결) — 결 줄이 있는 판만(작은 예비 마루 · 헛스윙은 입술만, 조각 상한)
  if (L.ng) later(RISE * 0.3 + CURL * 0.45, () => bent(curlPts(cr, PI * 0.5, PI * 1.42, 10, half * 0.4), L.w * 0.28, '', {
    body: c, pr: 0, dry: 0.45, gr: Math.min(0.6, CURL / L.life), life: L.life * 0.85, vx, vy,
  }));
  // 결 줄 — 몸 획 안쪽에서 등을 따라 가다 끝에서 제 작은 마루로 감긴다. 줄마다 깊이 · 시작 · 끝 높이가 엇갈린다(겹 · 평행 금지)
  for (let j = 0; j < L.ng; j++) {
    const d = half * 1.6 + [0.05, 0.2, 0.11][j % 3] + 0.03 * n01();
    const t0 = Math.max(L.t0 + 0.06, [0.14, 0.42, 0.06][j % 3] + 0.06 * n01());
    const t1 = [0.84, 0.74, 0.5][j % 3] - 0.05 * n01();
    later((1.5 + 1.2 * j + n01()) * F60, () => bent(grainPts(cr, t0, t1, d, 0.07 + 0.025 * n01()), L.w * (0.4 - 0.07 * j), '', {
      body: c, pr: 0, dry: 0.45, gr: Math.min(0.6, (5 * F60) / L.life), life: L.life * (0.82 + 0.1 * n01()), vx, vy,
    }));
  }
  // 갈퀴 손가락 — 입술이 그어지는 동안 뒤에서 앞으로 차례로(간격 · 길이 · 감김이 제각각). 셋에 하나는 먹 뿌리 손가락.
  // r6은 말림이 다 감긴 뒤에 나서 완파 +10~16에야 보였다 — 말리는 +4~6에 이미 서 있게 당기고 빨리 긋는다
  const ths: number[] = [];
  for (let i = 0; i < L.nf; i++) ths.push(L.fan[0] + (L.fan[1] - L.fan[0]) * ((i + 0.5 + 0.5 * sgn()) / L.nf));
  ths.sort((p, q) => p - q);
  const tips: [number, number, number, number][] = [];
  const sag = 20 * Math.min(L.k, 1.1) * (cr.H / 100); // 갈퀴는 몸보다 앞 · 아래(−U)로 처진다
  ths.forEach((th, i) => {
    // 입술 아래로 갈수록 짧다(자료 S1 — 긴 갈퀴는 마루 위 앞). 맨 아래 갈퀴가 길게 처지면 「콤보」 도장까지 내려왔다
    const low = (th - L.fan[0]) / (L.fan[1] - L.fan[0] || 1);
    const len = L.len * (0.65 + 0.5 * n01()) * (i === 1 || i === L.nf - 2 ? 1.2 : 1) * (1 - 0.35 * low);
    const pts = fingerPts(cr, th, half * 0.7, len, 1.9 + 1.3 * n01());
    const dark = i % 3 === 1;
    const at = RISE * 0.5 + CURL * 0.4 * low + 0.5 * sgn() * F60;
    tips.push([...tipOf(pts), at]);
    later(at, () => bent(pts, L.w * (0.42 + 0.22 * n01()), dark ? '' : FOAM, {
      body: dark ? c : liteOf(c), pr: 1, dry: 0.3, gr: 0.11, hold: 0.7, life: L.life * (0.72 + 0.25 * n01()),
      vx: vx * 1.3 - cr.U[0] * sag, vy: vy * 1.3 - cr.U[1] * sag,
    }));
  });
  // 끊긴 물방울 덩이 — 긴 손가락 끝에서, 끝이 가는 쪽을 조금 들어 앞으로
  tips.sort((p, q) => Math.hypot(q[0] - cr.ox, q[1] - cr.oy) - Math.hypot(p[0] - cr.ox, p[1] - cr.oy));
  tips.slice(0, L.nd).forEach(([x, y, ang, at], i) => {
    later(at + (4 + 2.5 * i + 2 * n01()) * F60, () => clump(x, y, ang - 0.6 + 0.3 * sgn(), (150 + 70 * n01()) * L.k, 4 + (i % 3), L.k, c));
  });
}

/** 땅 파도 틀 — 월드 밑동 x(wx) · 높이 Hw(월드 px)를 scaled 안 좌표로 */
function groundCrest(x: number, y: number, wx: number, Hw: number, ca: number, ra: number, rb: number): Crest {
  return { ox: inX(x, wx), oy: groundIn(y), F: RIGHT, U: UP, H: Hw / WEAPON_FX.SIZE, ca, ra, rb };
}
/** 꼴을 조금씩 흔든다 — 같은 파도가 두 번 나오지 않게 */
const jit = (v: number, r: number): number => v * (1 + r * sgn());

/** 칼 기운 마루 — 한 주기에 부르는 횟수(고르지 않게) · 그 주기 마루 높이(px) */
const AURA_CYC = [9, 7, 11, 8, 10] as const;
const AURA_SUM = AURA_CYC.reduce((a, v) => a + v, 0);
const AURA_H = [54, 45, 60, 49, 57] as const;
/** 칼 기운 갈퀴 손가락 — 말림 위 자리(× π) · 길이(마루 높이 1 기준) · 끝 감김. 간격 · 길이 · 감김이 다 다르다 */
const AURA_FING = [[0.02, 0.5, 1.6], [0.17, 0.3, 2.4], [0.3, 0.6, 2.0], [0.44, 0.26, 2.8]] as const;

/** 히노카미 물 띠 셋 — 굵기 · 시작 자리 · 꼬임 주기 · 그어지는 빠르기가 다 다르다(같은 간격 반복 금지) */
const BANDS = [
  { u0: 0, u1: 1.07, amp: 0.14, cyc: 1.15, ph: 0.4, w: 1, gr: 0.14, pr: 3, life: 1 },
  { u0: 0.16, u1: 1.13, amp: 0.26, cyc: 1.75, ph: 2.6, w: 0.55, gr: 0.24, pr: 0, life: 0.9 },
  { u0: 0.38, u1: 1.02, amp: 0.2, cyc: 2.4, ph: 4.4, w: 0.35, gr: 0.34, pr: 1, life: 0.8 },
] as const;

export const tide: Recipe = {
  trail: { w: 12, dry: 0.3 },
  own: true,
  // 칼길 — 칼이 지나간 호를 물 띠 셋이 서로 꼬이며 감고(굵은 띠는 칼끝 쪽이 굵다), 칼끝 너머로 풀린 꼬리 바깥으로 물방울 덩이
  swing(fx, fy, w, life, c, turn, grow) {
    const m = swingMoon(fx, fy, turn, grow);
    const ph = n01() * TAU;
    BANDS.forEach((b, j) => {
      const pts: number[] = [];
      for (let i = 0; i <= 14; i++) {
        const u = b.u0 + ((b.u1 - b.u0) * i) / 14;
        const [x, y, , out] = moonPoint(m, u);
        const env = Math.min(1, (u - b.u0) / 0.2 + 0.15);
        const off = m.r * b.amp * Math.sin(PI * b.cyc * (u - b.u0) + b.ph + ph) * env;
        pts.push(x + Math.cos(out) * off, y + Math.sin(out) * off);
      }
      later(j * 1.5 * F60, () => bent(pts, w * b.w, j ? '' : FOAM, { body: c, pr: b.pr, dry: 0.3 + 0.1 * j, gr: b.gr, hold: 0.5, life: life * b.life }));
    });
    const [tx, ty, , out] = moonPoint(m, 1.05);
    later(0.06, () => clump(tx, ty, out - 0.3 * sgn(), 150 * Math.max(0.8, w / 12), 3, Math.max(0.7, w / 14), c));
  },
  // 타격 — 납작한 갈퀴 하나가 맞은 자리 위에서 친 쪽(앞)으로 말려 처지고, 손가락 끝에서 물방울 덩이가 떨어진다(폭 ~110)
  hit(x, y, k, c) {
    const K = Math.min(k, 1.5);
    const H = 60 * Math.min(K, 1.2); // 키우기 전 — 1.6배면 폭 ~110. 콤보 고비(flare)도 K 1.5로 부르니 꼴은 1.2에서 묶고 단은 굵기 · 방울로만
    const cr: Crest = { ox: x - 0.68 * H, oy: y - 24 + 0.5 * H, F: RIGHT, U: UP, H, ca: jit(0.55, 0.08), ra: jit(0.42, 0.06), rb: jit(0.3, 0.06), sy: 0.72 };
    surge(cr, { w: 7 * K, life: 0.42, nf: 3, ng: 1, nd: 2, t0: 0.12, fan: [0.04 * PI, 0.45 * PI], len: 0.34, k: 0.8 * K }, c);
  },
  // 층 깨기 — 왼쪽 땅에서 중간 마루가 솟아 주인공 머리 위로 말린다(완파의 6할) · 갈퀴 넷 · 결 줄 둘
  floor(x, y, k, c) {
    const K = Math.min(k, 1.5);
    const cr = groundCrest(x, y, x - 174, 112, jit(0.86, 0.05), jit(0.38, 0.06), jit(0.22, 0.05));
    surge(cr, { w: 11 * K, life: 0.48, nf: 4, ng: 2, nd: 2, t0: 0, fan: [0.02 * PI, 0.45 * PI], len: 0.32, k: K }, c);
  },
  // 완파 — 앞에 작은 마루가 먼저 일고(예비) → 왼쪽 땅에서 큰 마루가 솟아 화면 위쪽으로 크게 말린다(폭 ~250 · 높이 ~190) →
  // 갈퀴 손가락 여섯이 앞 · 아래로 처지며 끝에서 물방울 덩이가 끊기고, 마루 꼭대기 뒤로도 물보라 덩이
  destroy(x, y, k, c) {
    const K = Math.min(k, 1.5);
    const small = groundCrest(x, y, x - 124, 58, jit(0.7, 0.08), 0.42, 0.3);
    surge(small, { w: 8, life: 0.4, nf: 2, ng: 0, nd: 1, t0: 0.05, fan: [0.1 * PI, 0.45 * PI], len: 0.42, k: 0.8 }, c);
    // 높이 · 폭은 콤보 단과 상관없이 묶는다(화면 폭 9할 · 콤보가 클수록 도장도 커진다) — 단은 굵기 · 방울로만.
    // 밑동은 화면 안(x 20). r6은 x −24 화면 밖에서 솟았다 — 오른쪽 끝을 그대로 두려고 마루를 가파르게(ca 0.92 → 0.8),
    // 말림을 덜 납작하게(가로 0.42 → 0.34 · 세로 0.25 → 0.26) 줄였다
    const cr = groundCrest(x, y, x - 160, 190, jit(0.8, 0.04), jit(0.34, 0.05), jit(0.26, 0.05));
    later(0.5 * F60, () => {
      surge(cr, { w: 17 * Math.min(K, 1.35), life: 0.56, nf: 6, ng: 3, nd: 3, t0: 0, fan: [0, 0.44 * PI], len: 0.35, k: K }, c);
      const [px, py] = toW(cr, cr.ca - 0.05, 1.02);
      later(RISE + CURL, () => clump(px, py, -PI * 0.72 + 0.15 * sgn(), 170 * K, 5, K, c)); // 꼭대기 뒤 물보라
    });
  },
  // 헛스윙 — 칼끝에서 작은 갈퀴 하나 + 방울 덩이 하나
  whiff(x, y, c) {
    const H = 26;
    const cr: Crest = { ox: x - 0.55 * H, oy: y + 0.4 * H, F: RIGHT, U: UP, H, ca: jit(0.5, 0.1), ra: 0.45, rb: 0.3, sy: 0.8 };
    surge(cr, { w: 3.8, life: 0.28, nf: 1, ng: 0, nd: 1, t0: 0.3, fan: [0.15 * PI, 0.35 * PI], len: 0.45, k: 0.6 }, c);
  },
  // 칼 기운 — 물을 두른 칼. 굵기 · 빠르기가 다른 띠 둘이 손잡이에서 칼을 감아 가다 날 가운데 ~ 칼끝 쪽에서 떨어져 나와
  // 몸 바깥 · 하늘 쪽으로 서는 작은 마루(높이 40~60px)로 말려 오르고, 마루 앞끝은 길이 제각각인 갈퀴 손가락 3~4로 갈라진다.
  // 한 주기(부르는 횟수 7~11, 고르지 않게) = 솟음 → 말림 → 무너짐: 무너질 때 마루가 앞으로 눕고 손가락이 처지며 긴 손가락 끝에서
  // 물방울 덩이(큰 것 · 중간 · 가루)가 포물선으로 떨어진 뒤 다시 솟는다. 마루 등은 먹 · 입술은 먹 → 파랑 · 손가락 끝은 밝은 짝.
  // 흑백에서 위로 곧게 선 불 혀와 갈리게 — 감아 오르다 옆으로 말리는 띠. 마루 밑동은 날 바깥(위쪽 옆)이라 몸 상자를 덮지 않는다
  aura(b, n, c) {
    const [hx, hy, tx, ty] = b;
    const L = Math.hypot(tx - hx, ty - hy) || 1;
    const [ux, uy] = [(tx - hx) / L, (ty - hy) / L];
    const out = tx >= hx ? 1 : -1; // 몸 바깥 쪽
    const [nx, ny] = ux >= 0 ? [uy, -ux] : [-uy, ux]; // 날의 위쪽 옆
    // 서 있을 때 칼끝은 땅선 아래에 묻힌다 — 띠는 땅 4px 위에서 끊는다
    const uEnd = uy > 0 ? Math.min(1, Math.max(0.5, (VIEW.GROUND_Y - 4 - hy) / (uy * L))) : 1;
    /** 칼을 감는 띠(월드) — 손잡이 → u1. 날 위쪽 옆으로는 amp만큼 크게, 몸 쪽으로는 inn만큼 작게(다리를 덮지 않게) */
    const wind = (u1: number, f: number, ph: number, amp: number, inn: number): number[] => {
      const pts: number[] = [];
      for (let i = 0; i <= 9; i++) {
        const u = (u1 * i) / 9;
        const s = Math.sin(TAU * f * u + ph) * Math.min(1, u / 0.2 + 0.4);
        const off = s * (s > 0 ? amp : inn);
        pts.push(hx + ux * u * L + nx * off, hy + uy * u * L + ny * off);
      }
      return pts;
    };
    // 주기 안 자리 p(0 → 1)
    let r = n % AURA_SUM;
    let i = 0;
    while (r >= AURA_CYC[i]) r -= AURA_CYC[i++];
    const p = r / AURA_CYC[i];
    const rise = Math.min(1, p / 0.35);
    const curl = Math.min(1, Math.max(0, (p - 0.35) / 0.35));
    const fall = Math.max(0, (p - 0.7) / 0.3);
    const tilt = 0.55 * fall; // 무너질 때 앞으로 눕는다
    const ub = Math.min(0.72, uEnd - 0.1);
    const cr: Crest = {
      ox: hx + ux * ub * L + nx * 1.5, oy: hy + uy * ub * L + ny * 1.5,
      F: [out * Math.cos(tilt), Math.sin(tilt)], U: [out * Math.sin(tilt), -Math.cos(tilt)],
      H: AURA_H[i] * (0.55 + 0.45 * rise - 0.4 * fall), ca: 0.3, ra: 0.5, rb: 0.26,
    };
    // 말림은 앞 · 아래까지만(닫힌 고리는 글자로 읽혔다)
    const th1 = PI * (0.45 + 0.4 * rise + 0.15 * curl);
    const [vx, vy] = [out * 8, fall ? 26 * fall : -8];
    // 띠 둘 — 칼만 감는다(먹 손잡이 → 파랑 → 밝은 짝 칼끝). 마루까지 한 획으로 이으면 칼 위가 통째로 먹이 됐다.
    // 굵은 띠는 천천히 칼끝 가까이까지, 가는 띠는 거꾸로 더 빨리 감아 날 가운데 너머에서 마루 밑동 쪽으로 빠진다
    bent(wind(uEnd - 0.04, 1.15, n * 0.3, 6.5 + 1.5 * Math.sin(n * 0.37), 2.2), 4.2, '', { body: c, pr: 5, dry: 0.16, gr: 0.42, life: 0.34, vx, vy });
    const thin = wind(0.62, 1.9, 1.3 - n * 0.62, 5, 1.8);
    thin.push(...toW(cr, ...backAt(cr, 0.12, 0.08)), ...toW(cr, ...backAt(cr, 0.4, 0.12)));
    bent(thin, 2.4, '', { body: c, pr: 1, dry: 0.28, gr: 0.2, life: 0.26, vx, vy });
    // 마루 — 칼 바깥 밑동에서 한 붓으로 등을 타고 솟아 꼭대기를 넘어 앞 · 아래로 말린다(먹 밑동 → 파랑 등 → 밝은 짝 입술).
    // 등과 입술을 따로 그으면 꼭대기만 떠서 칼과 떨어진 새 꼴로 읽혔다. 누름은 붓머리를 눌러 대 밑동이 칼에 붙는다
    // (밑동이 가는 누름은 마루가 실에 매달려 떴고, 꼭대기에 먹 획을 얹으면 새 눈으로 읽혔다). 솟을수록 굵어진다
    bent(ridge(cr, 0, th1, 0, 6, 6), 5 + 1.8 * rise - 1.2 * fall, '', { body: c, pr: 5, dry: 0.24, gr: 0.36, life: 0.34, vx, vy });
    // 갈퀴 손가락 3~4 — 솟는 동안 자라고, 무너질 때 더 감겨 처진다. 밝은 짝 손가락과 파랑 손가락이 엇갈린다
    const tips: [number, number, number][] = [];
    AURA_FING.slice(0, i % 2 ? 3 : 4).forEach(([th, len, bend], j) => {
      const pts = fingerPts(cr, PI * (th + 0.03 * sgn()), 0.05, len * (0.4 + 0.6 * rise) * (0.85 + 0.3 * n01()), bend + 1.2 * fall);
      tips.push(tipOf(pts));
      later(0.05 + 0.015 * j, () => bent(pts, 3 + 4 * len, '', { body: j % 2 ? c : liteOf(c), pr: 1, dry: 0.26, gr: 0.3, life: 0.28 + 0.08 * n01(), vx: vx * 1.3, vy: vy + 14 * fall }));
    });
    // 무너지기 시작할 때 긴 손가락 둘 끝에서 물방울 덩이가 끊겨 앞으로 포물선을 그리며 떨어진다
    if (r === Math.round(AURA_CYC[i] * 0.72)) {
      [tips[2], tips[0]].forEach(([x, y], j) => clump(x, y, (out > 0 ? -0.45 : PI + 0.45) + 0.3 * sgn(), 95 + 30 * n01(), 4 - j, 0.95, c));
    }
  },
  every: 0.1,
  tint: true,
  waza: {
    // 필살 큰 획을 따라 — 물 띠 셋이 서로 다른 주기로 꼬이며 획 머리에서 끝까지 감겨 가고(획과 같은 빠르기),
    // 획을 따라 띠 바깥으로 물방울 덩이가 차례로 튄다. k 1에서 띠 3 + 덩이 ≤ 4 × 3 = 15
    along(pts, k, c, dur) {
      const all = samplePath(pts, 7);
      if (all.length < 2) return;
      const len = pathLen(pts);
      const life = dur + 0.34;
      const ph = n01() * TAU;
      BANDS.forEach((b, j) => {
        const out: number[] = [];
        for (const s of all) {
          const u = s.u * (1 - b.u0 * 0.4) + b.u0 * 0.4;
          const env = Math.min(1, s.u / 0.06 + 0.2, (1 - s.u) / 0.08 + 0.25);
          const off = 48 * k * b.amp * Math.sin((u * len * b.cyc) / 95 + b.ph + ph) * env;
          out.push(s.x - Math.sin(s.ang) * off, s.y + Math.cos(s.ang) * off);
        }
        later(j * 2 * F60, () => bent(out, 6.5 * k * b.w, j ? '' : FOAM, { body: c, pr: b.pr, dry: 0.3 + 0.1 * j, gr: Math.min(0.85, dur / life), hold: 0.5, life: life * b.life }));
      });
      const n = Math.min(4, Math.max(2, Math.round(len / 140)));
      follow(pts, dur * 0.3, dur, n, (x, y, ang, _u, i) => {
        const side = i % 2 ? 1 : -1;
        clump(x, y, ang + side * (PI / 2) * 0.8, 170 * k, 3, Math.min(1.3, k), c);
      });
    },
    // 마무리 — 완파 꼴(큰 마루 하나)을 친 방향 ang으로 세운다: ang 쪽으로 솟아 앞으로 말린다. 틀이 땅 밑으로 가면 땅 위로 올린다
    bloom(x, y, ang, k, c) {
      const U: V = [Math.cos(ang), Math.sin(ang)];
      const side = Math.abs(U[0]) > 0.9;
      const F = fwdOf(U, side ? [0, 1] : RIGHT); // 가로로 치면 땅 쪽으로 말린다
      const H = jit(105, 0.12) * k; // 낙관 도장 양옆 둘이 거울처럼 같지 않게
      const cr: Crest = { ox: 0, oy: 0, F, U, H, ca: jit(0.9, 0.04), ra: jit(0.42, 0.05), rb: jit(0.29, 0.05) };
      // 틀 가운데(로컬 0.65, 0.55)를 (x, y)에. 가로로 치면 밑동(로컬 위 0)을 (x, y)에 둬 ang 쪽으로만 솟는다 —
      // 가운데에 두면 등 밑동이 0.55H 뒤로 물러나 낙관 「끝」 도장 위에서 양옆 마루가 엇갈렸다
      const bu = side ? 0 : 0.55;
      [cr.ox, cr.oy] = [x - (F[0] * 0.65 + U[0] * bu) * H, y - (F[1] * 0.65 + U[1] * bu) * H];
      const low = Math.max(...ridge(cr, 0, PI * 1.3).filter((_, i) => i % 2));
      if (low > VIEW.GROUND_Y - 2) cr.oy -= low - (VIEW.GROUND_Y - 2);
      const big = k >= 1;
      surge(cr, { w: 12 * k, life: 0.52, nf: big ? 6 : 3, ng: big ? 3 : 1, nd: big ? 3 : 1, t0: 0, fan: [0.02 * PI, 0.6 * PI], len: 0.32, k: Math.min(1.5, k) }, c);
    },
  },
};
