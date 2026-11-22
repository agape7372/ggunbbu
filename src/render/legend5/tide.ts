// 해일 대검(물) 레시피 — 4판(11-21 방향표 「해일」 절). bladeFx RECIPES(surf)가 이어 붙이기만 한다.
// 꼴: 왼쪽 땅에서 솟아 오른쪽 위로 크게 말리는 갈퀴 마루 한 덩이. 등은 밑동(먹)에서 가파르게 솟아 마루를 넘고,
// 말림은 가는 붓 두 가닥(입술 · 속 말림)이 먹 머리 → 파랑 꼬리로 앞 → 아래 → 안으로 감긴다. 마루 앞끝은 길이 · 간격 · 휨이 제각각인 갈퀴 손가락으로 갈라진다(손가락마다 제 갈고리).
// 몸 안쪽엔 마른 붓 결 줄이 겉선을 따라 겹으로 감기고, 가장 안쪽 줄은 더 감겨 작은 마루가 된다. 갈퀴 끝에서 물방울 덩이
// (큰 것 · 중간 · 가루 3단)가 끊겨 포물선으로 떨어진다. 완파는 앞에 작은 마루가 먼저 일어난다(예비).
// 칼길 · 칼 기운 · 필살 번짐 = 물 띠: 굵기가 머리 → 꼬리로 바뀌는 띠 두셋이 서로 다른 주기 ·
// 다른 속도로 꼬이며 칼길을 감고, 띠 바깥으로 물방울 덩이가 튄다.
// 박자: 솟음 4프레임 → 말림 4 → 갈퀴가 앞 · 아래로 처지며 물방울 덩이가 떨어지고 몸은 밑동부터 깎인다(무너짐).
// 자리: 주인공 몸 상자(발 위 0~60 · 좌우 ±18)와 오른쪽 아래 「콤보」 도장 자리를 비운다 — 땅 파도는 왼쪽 땅에서 솟고
// 말림은 주인공 머리 위 높이에서 끝난다(3판은 파도가 도장에 닿았다).
// 다른 넷과 갈림(흑백): 불새 = 위로 큰 면 · 해일 = 옆으로 말린 큰 면 · 고압선 = 공중 가는 선 · 고드름 = 각진 덩이 · 그림자 = 땅에서 솟은 가는 선 다발.
// 문법(불변 13): 먹 머리 → 시그니처 색 꼬리 · 알파 지우기 금지(모양으로) · shadowBlur · 블룸 · 별 · 원판 + 방사형 띠 · 아이콘 금지.
// ⚠ bladeFx와 순환 import — 최상위에서 bladeFx 값을 부르지 않는다. 시험에서 이 파일을 bladeFx보다 먼저 import하지 않는다.
import { PALETTE, VIEW, WEAPON_FX } from '../../config';
import { bent, drops, later, n01, put, samplePath, sgn, type Recipe } from '../bladeFx';
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
 * 큰 마루 안에 작은 마루가 겹으로 서는 꼴
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
interface Look {
  w: number; life: number; nf: number; ng: number; nd: number; t0: number; fan: readonly [number, number]; len: number; k: number;
  /** 쏟아지는 세기(타격은 작게) */
  fall?: number;
  /** 키운 축 = 주인공 발 x · 사건 y. 주면 쏟아지는 획이 주인공 몸 상자 · 「콤보」 도장 · 땅 밑으로 들어가지 않게 깊이를 멈춘다 */
  at?: readonly [number, number];
}

/** 꺾은 획 + 중력 — 엔진 bent와 같고 g(px/s², 화면 아래)만 더 넘긴다(bent는 g를 안 받는다 · put으로 직접) */
type SO = NonNullable<Parameters<typeof bent>[3]> & { g?: number; rest?: readonly [number, number]; safe?: readonly [number, number] };

/**
 * 쏟아짐을 어디까지 줄까(0 = 표류 rest만 · 1 = 다) — 키운 뒤 월드 자리를 사는 내내 짚어 획 점(반폭 포함)이
 * 주인공 몸 상자(발 위 0~60 · 좌우 ±18) · 「콤보」 도장(세 자리 콤보의 넓은 자리) · 땅 밑 · 화면 밖에 들면 줄인다.
 * 층 깨기는 마루가 머리 바로 위에서 일어나 조금만 떨어져도 상자에 닿았다 — 머리 위 획만 덜 내려앉고 나머지는 그대로 쏟아진다.
 * ponytail: 주인공이 사건 x에 서 있다고 본다(bladeFx가 레인 x로 부른다). 다른 자리에서 부르면 safe를 넘기지 않는다
 */
function fallRoom(pts: readonly number[], w: number, o: SO): number {
  const [cx, cy] = o.safe ?? [0, 0];
  const K = WEAPON_FX.SIZE;
  const T = (o.life ?? 0.26) * WEAPON_FX.LIFE;
  const r = (w * K) / 2;
  const G = VIEW.GROUND_Y;
  const [rx, ry] = o.rest ?? [0, 0];
  const hits = (m: number): boolean => {
    const vx = rx + m * ((o.vx ?? 0) - rx);
    const vy = ry + m * ((o.vy ?? 0) - ry);
    const g = m * (o.g ?? 0);
    // 엔진 updateBladeFx와 같은 셈(속도에 중력을 먼저 더하고 자리를 옮긴다 · 1/60초씩) — 식 하나로 풀면 끝에서 1~2px 모자랐다
    let [dx, dy, uy] = [0, 0, K * vy];
    for (let t = 0; t <= T + F60; t += F60) {
      if (t > 0) {
        uy += K * g * F60;
        dx += K * vx * F60;
        dy += uy * F60;
      }
      for (let i = 0; i + 1 < pts.length; i += 2) {
        const x = cx + K * (pts[i] - cx) + dx;
        const y = cy + K * (pts[i + 1] - cy) + dy;
        if (Math.abs(x - cx) < 18 + r && y > G - 60 - r) return true;
        if (x > cx + 42 - r && y > G - 98 - r) return true;
        if (y > G + 1 || x < -40 || x > VIEW.W + 20) return true;
      }
    }
    return false;
  };
  if (!hits(1)) return 1;
  let [lo, hi] = [0, 1];
  for (let j = 0; j < 6; j++) {
    const m = (lo + hi) / 2;
    if (hits(m)) hi = m;
    else lo = m;
  }
  return lo;
}

function bentG(pts: number[], w: number, core: string, o: SO): void {
  const [x, y] = pts;
  const m = o.safe && o.g ? fallRoom(pts, w, o) : 1;
  const [rx, ry] = o.rest ?? [0, 0];
  put('zig', x, y, {
    life: o.life ?? 0.26, size: 0, v: w, c1: o.body ?? PALETTE.INK, c2: core, dry: o.dry ?? 0.3, pr: o.pr ?? 2, gr: o.gr ?? 0.15, hold: o.hold,
    vx: rx + m * ((o.vx ?? 0) - rx), vy: ry + m * ((o.vy ?? 0) - ry), g: m * (o.g ?? 0), fd: o.fd, fe: o.fe, ge: o.ge,
    pts: pts.map((q, i) => q - (i % 2 ? y : x)),
  });
}
/** 등 꺾은선(월드) t0 → t1만 */
function backPts(cr: Crest, t0: number, t1: number, n: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) pts.push(...toW(cr, ...backAt(cr, t0 + ((t1 - t0) * i) / n)));
  return pts;
}

/**
 * 마루 한 판 — 11-22 박자 판: 예비(밑동 그루터기가 느리게 부푼다) → 솟음(마루 · 앞끝이 급하게 넘어간다) → 정점에서 2~3칸 버티기 →
 * 무너짐(꼭대기부터: 마루 · 입술 · 갈퀴가 앞 · 아래로 쏟아지고 가닥마다 처지는 때가 다르다 → 결 줄 → 밑동 그루터기) →
 * 끝(물방울 덩이가 늦게 끊겨 땅에 닿으며 끝난다).
 * 몸 한 획을 밑동 그루터기 + 위 몸(등 중턱 → 마루 → 앞끝) 두 획으로 갈랐다 — 획은 머리(댄 곳)부터만 깎이니 한 획이면 밑동부터 사라진다.
 * 쏟아짐 = 중력(g)과 위로 살짝 든 첫 속도 — 정점에서 버티다 점점 빨리 떨어진다. 주인공 · 도장 위로는 fallRoom이 깊이를 멈춘다
 */
function surge(cr: Crest, L: Look, c: string): void {
  const drift = 14 * Math.min(L.k, 1.1); // 단이 높아도 표류는 묶는다(오른쪽 아래 「콤보」 도장 쪽으로 흘러가지 않게)
  const [vx, vy] = [cr.F[0] * drift, cr.F[1] * drift];
  const half = L.w / 2 / cr.H; // 몸 반폭(로컬)
  const gr = Math.min(0.6, (RISE * 1.3) / L.life);
  const fall = L.fall ?? 1;
  const S = { safe: L.at, rest: [vx, vy] as const }; // 쏟아지는 획마다 — 자리를 밟으면 표류 쪽으로 줄인다
  // 위 몸 — 먼저 넣어 그루터기 밑에 깔린다(머리 먹이 그루터기에 덮인다). ge 2 = 처음엔 거의 안 나가다 마루를 급하게 넘는다.
  // 몸을 한 획(밑동부터)으로 두고 중력을 주면 밑동이 땅 밑으로 내려가 엔진이 획을 0.12초로 잘라 +14에 몸이 통째로 사라졌다(11-22 시안)
  bentG(ridge(cr, L.t0 + 0.14, PI * 0.5, 0, 7, 5), L.w, '', {
    body: c, pr: 3, dry: 0.14, gr, ge: 2, life: L.life * 0.8, fd: 0.42, fe: 1.3,
    vx: vx * 1.6, vy: -50 * fall, g: 420 * fall, ...S, // 700은 마루가 주인공 몸 상자까지 내려앉았다
  });
  // 밑동 그루터기 — 예비: 느리게(ge 1.6) 먼저 부푼다. 지금 판 밑동처럼 몸이 무너지기 시작할 때 같이 깎인다 —
  // 수명 0.82는 위 몸이 떠난 뒤 왼쪽 아래에 진한 먹 덩이로 홀로 남았다(11-22 검수)
  bentG(backPts(cr, L.t0, L.t0 + 0.34, 4), L.w, '', { body: c, pr: 0, dry: 0.14, gr: gr * 1.1, ge: 1.6, life: L.life * 0.5, fd: 0.55, fe: 1.2, vx, vy });
  // 입술 — 꼭대기 뒤에서 앞 · 아래로 넘긴다. 위 몸보다 조금 늦게 · 세게 쏟아진다
  later(RISE * 0.3, () => bentG(curlPts(cr, -PI * 0.14, PI * 0.8, 10), L.w * 0.44, '', {
    body: c, pr: 0, dry: 0.36, gr: Math.min(0.6, (CURL * 0.9) / L.life), life: L.life * 0.8, fd: 0.4, fe: 1.3,
    vx: vx * 2, vy: -45 * fall, g: 500 * fall, ...S,
  }));
  // 속 말림
  if (L.ng) later(RISE * 0.3 + CURL * 0.45, () => bentG(curlPts(cr, PI * 0.5, PI * 1.42, 10, half * 0.4), L.w * 0.28, '', {
    body: c, pr: 0, dry: 0.45, gr: Math.min(0.6, CURL / L.life), life: L.life * 0.78, fd: 0.42, fe: 1.3,
    vx: vx * 1.8, vy: -35 * fall, g: 400 * fall, ...S,
  }));
  // 결 줄 — 위 몸을 따라 조금 늦게 처진다
  for (let j = 0; j < L.ng; j++) {
    const d = half * 1.6 + [0.05, 0.2, 0.11][j % 3] + 0.03 * n01();
    const t0 = Math.max(L.t0 + 0.06, [0.14, 0.42, 0.06][j % 3] + 0.06 * n01());
    const t1 = [0.84, 0.74, 0.5][j % 3] - 0.05 * n01();
    later((1.5 + 1.2 * j + n01()) * F60, () => bentG(grainPts(cr, t0, t1, d, 0.07 + 0.025 * n01()), L.w * (0.4 - 0.07 * j), '', {
      body: c, pr: 0, dry: 0.45, gr: Math.min(0.6, (5 * F60) / L.life), life: L.life * (0.8 + 0.1 * n01()), fd: 0.5, fe: 1.3,
      vx: vx * 1.4, vy: -40 * fall, g: (260 + 60 * j) * fall, ...S,
    }));
  }
  // 갈퀴 손가락 — 서는 때는 지금 판 그대로. 쏟아짐은 가닥마다 다르게: 위로 드는 첫 속도 · 중력 · 깎이는 때를 엇갈린다(한꺼번에 X)
  const ths: number[] = [];
  for (let i = 0; i < L.nf; i++) ths.push(L.fan[0] + (L.fan[1] - L.fan[0]) * ((i + 0.5 + 0.5 * sgn()) / L.nf));
  ths.sort((p, q) => p - q);
  const tips: [number, number, number, number, number, number, number][] = [];
  const GS = [1.15, 0.8, 1.35, 0.95, 1.25, 0.7] as const;
  ths.forEach((th, i) => {
    const low = (th - L.fan[0]) / (L.fan[1] - L.fan[0] || 1);
    const len = L.len * (0.65 + 0.5 * n01()) * (i === 1 || i === L.nf - 2 ? 1.2 : 1) * (1 - 0.35 * low);
    const pts = fingerPts(cr, th, half * 0.7, len, 1.9 + 1.3 * n01());
    const dark = i % 3 === 1;
    const at = RISE * 0.5 + CURL * 0.4 * low + 0.5 * sgn() * F60;
    const fx = vx * 1.5;
    const fy = -(40 + 35 * ((i * 2) % 3)) * fall; // 위로 드는 첫 속도 — 정점에서 버티는 때가 가닥마다 다르다
    const fg = 600 * GS[i % 6] * fall; // 900은 갈퀴가 「콤보」 도장 · 주인공 자리까지 떨어졌다
    tips.push([...tipOf(pts), at, fx, fy, fg]);
    later(at, () => bentG(pts, L.w * (0.42 + 0.22 * n01()), dark ? '' : FOAM, {
      body: dark ? c : liteOf(c), pr: 1, dry: 0.3, gr: 0.11, hold: 0.7, life: L.life * (0.72 + 0.25 * n01()),
      fd: 0.32 + 0.07 * ((i * 3) % 4), fe: 1.2, vx: fx, vy: fy, g: fg, ...S,
    }));
  });
  // 끊긴 물방울 덩이 — 쏟아지는 갈퀴 끝에서 늦게 끊긴다(끝 자리는 그때까지 처진 높이만 옮긴다 — 앞으로도 옮기면 덩이가 「콤보」 도장 위에 떨어졌다 · 11-22 시안)
  tips.sort((p, q) => Math.hypot(q[0] - cr.ox, q[1] - cr.oy) - Math.hypot(p[0] - cr.ox, p[1] - cr.oy));
  // 가장 긴 갈퀴 끝(화면 오른쪽 끝)에서 앞으로 던지면 +30~+40에 「콤보」 도장 옆에 몰렸다(11-22 검수) →
  // 무너지는 등 안쪽(마루 아래 · 주인공 왼쪽)에서 끊겨 거의 곧게 · 조금 뒤로 떨어진다. +36 안에 땅에 닿게 일찍 끊는다
  tips.slice(0, L.nd).forEach(([, , , at], i) => {
    const dt = (7 + 2 * i + n01()) * F60 * (L.life / 0.56) ** 2;
    const s = (at + dt - RISE * 0.3) * WEAPON_FX.LIFE; // 입술이 난 뒤 흐른 초(키운 그림은 later가 1.2배 늦다)
    const [x, y] = toW(cr, ...backAt(cr, 0.5 + 0.1 * i, half * 2)); // 말림 밑(주인공 바로 위)에서 끊겨 주인공 위로 쏟아졌다 → 등 안쪽(주인공 왼쪽)
    later(at + dt, () => clump(x + vx * 2 * s, y + (-45 * s + 250 * s * s) * fall, PI / 2 + 0.45 + 0.2 * sgn(), (60 + 40 * n01()) * L.k, 4 + (i % 3), L.k, c));
  });
}

/** 땅 파도 틀 — 월드 밑동 x(wx) · 높이 Hw(월드 px)를 scaled 안 좌표로 */
function groundCrest(x: number, y: number, wx: number, Hw: number, ca: number, ra: number, rb: number): Crest {
  return { ox: inX(x, wx), oy: groundIn(y), F: RIGHT, U: UP, H: Hw / WEAPON_FX.SIZE, ca, ra, rb };
}
/** 꼴을 조금씩 흔든다 — 같은 파도가 두 번 나오지 않게 */
const jit = (v: number, r: number): number => v * (1 + r * sgn());

/** 물 띠 셋 — 굵기 · 시작 자리 · 꼬임 주기 · 그어지는 빠르기가 다 다르다(같은 간격 반복 금지) */
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
    surge(cr, { w: 7 * K, life: 0.42, nf: 3, ng: 1, nd: 2, t0: 0.12, fan: [0.04 * PI, 0.45 * PI], len: 0.34, k: 0.8 * K, fall: 0.55, at: [x, y] }, c);
  },
  // 층 깨기 — 왼쪽 땅에서 중간 마루가 솟아 주인공 머리 위로 말린다(완파의 6할) · 갈퀴 넷 · 결 줄 둘
  floor(x, y, k, c) {
    const K = Math.min(k, 1.5);
    const cr = groundCrest(x, y, x - 174, 112, jit(0.86, 0.05), jit(0.38, 0.06), jit(0.22, 0.05));
    surge(cr, { w: 11 * K, life: 0.48, nf: 4, ng: 2, nd: 2, t0: 0, fan: [0.02 * PI, 0.45 * PI], len: 0.32, k: K, fall: 0.8, at: [x, y] }, c);
  },
  // 완파 — 앞에 작은 마루가 먼저 일고(예비) → 왼쪽 땅에서 큰 마루가 솟아 화면 위쪽으로 크게 말린다(폭 ~250 · 높이 ~190) →
  // 갈퀴 손가락 여섯이 앞 · 아래로 처지며 끝에서 물방울 덩이가 끊기고, 마루 꼭대기 뒤로도 물보라 덩이
  destroy(x, y, k, c) {
    const K = Math.min(k, 1.5);
    const small = groundCrest(x, y, x - 124, 58, jit(0.7, 0.08), 0.42, 0.3);
    surge(small, { w: 8, life: 0.4, nf: 2, ng: 0, nd: 1, t0: 0.05, fan: [0.1 * PI, 0.45 * PI], len: 0.42, k: 0.8, at: [x, y] }, c);
    // 높이 · 폭은 콤보 단과 상관없이 묶는다(화면 폭 9할 · 콤보가 클수록 도장도 커진다) — 단은 굵기 · 방울로만.
    // 밑동은 화면 안(x 20). r6은 x −24 화면 밖에서 솟았다 — 오른쪽 끝을 그대로 두려고 마루를 가파르게(ca 0.92 → 0.8),
    // 말림을 덜 납작하게(가로 0.42 → 0.34 · 세로 0.25 → 0.26) 줄였다
    const cr = groundCrest(x, y, x - 160, 190, jit(0.8, 0.04), jit(0.34, 0.05), jit(0.26, 0.05));
    later(0.5 * F60, () => {
      surge(cr, { w: 17 * Math.min(K, 1.35), life: 0.56, nf: 6, ng: 3, nd: 3, t0: 0, fan: [0, 0.44 * PI], len: 0.35, k: K, at: [x, y] }, c);
      const [px, py] = toW(cr, cr.ca - 0.05, 1.02);
      later(RISE + CURL * 0.4, () => clump(px, py, -PI * 0.72 + 0.15 * sgn(), 90 * K, 4, K, c)); // 꼭대기 뒤 물보라(넷 — 다섯이면 한 사건 조각이 41까지 갔다) — 170은 높이 떠 먹 방울이 +28~+40 공중에 머물렀다(11-22 검수) → 일찍 · 낮게
    });
  },
  // 헛스윙 — 칼끝에서 작은 갈퀴 하나 + 방울 덩이 하나
  whiff(x, y, c) {
    const H = 26;
    const cr: Crest = { ox: x - 0.55 * H, oy: y + 0.4 * H, F: RIGHT, U: UP, H, ca: jit(0.5, 0.1), ra: 0.45, rb: 0.3, sy: 0.8 };
    surge(cr, { w: 3.8, life: 0.28, nf: 1, ng: 0, nd: 1, t0: 0.3, fan: [0.15 * PI, 0.35 * PI], len: 0.45, k: 0.6 }, c);
  },
  // 칼 기운 — 칼을 감는 물 띠 한 줄: 손잡이에서 칼끝까지 한 번 남짓 꼬여 흐르다 칼끝 너머 10~14px로 흘러내리고
  // (부를 때마다 꼬임이 조금씩 돈다), 칼끝에서 물방울 덩이(큰 것 · 중간 · 가루)가 떨어진다. 굵기는 머리 3px → 꼬리 1px(누름 BRUSH).
  // r6은 칼 길이의 3할만 감고 굵기가 고르게 가늘어 폰 1배에서 파란 점 몇 개로만 보였다(11-22 검수).
  // 검은 칼날 위라 먹 머리 없이 시그니처 색 → 밝은 짝(곁 획)
  aura(b, n, c) {
    const [hx, hy, tx, ty] = b;
    const L = Math.hypot(tx - hx, ty - hy) || 1;
    const [ux, uy] = [(tx - hx) / L, (ty - hy) / L];
    const [nx, ny] = [-uy, ux];
    const ph = n * 0.32;
    // 감는 굽이 — 몸 반대쪽(바깥)은 크게(6~9px), 다리 쪽은 작게(다리를 덮지 않게). 바깥 = 칼 방향을 위로 돌린 쪽
    const sw = ux >= 0 ? -1 : 1; // 위로 도는 쪽
    const outA = 7.5 + 1.5 * Math.sin(n * 0.37);
    // 서 있을 때 칼끝은 땅선 아래에 묻힌다 — 곧은 띠는 땅 4px 위에서 끊고 거기서 갈고리를 올린다(안 그러면 칼끝 너머가 땅 띠에 잘렸다)
    const uEnd = uy > 0 ? Math.min(1, Math.max(0.5, (VIEW.GROUND_Y - 4 - hy) / (uy * L))) : 1;
    const pts: number[] = [];
    for (let i = 0; i <= 12; i++) {
      const u = (uEnd * i) / 12;
      const s = Math.sin(TAU * 1.2 * u + ph) * Math.min(1, u / 0.2 + 0.4);
      const off = s * (s * sw > 0 ? outA : 2.5);
      pts.push(hx + ux * u * L + nx * off, hy + uy * u * L + ny * off);
    }
    // 칼끝 너머 — 칼끝(또는 땅에 닿는 자리)을 돌아 바깥 위로 갈고리처럼 감겨 오른다(칼 밖 10~14px)
    const E = 15 + 5 * Math.abs(Math.sin(n * 0.71));
    let [ex, ey] = [pts[pts.length - 2], pts[pts.length - 1]];
    for (let j = 1; j <= 5; j++) {
      const a = sw * 2.1 * (j / 5) ** 0.8;
      ex += ((ux * Math.cos(a) - uy * Math.sin(a)) * E) / 5;
      ey += ((ux * Math.sin(a) + uy * Math.cos(a)) * E) / 5;
      pts.push(ex, ey);
    }
    bent(pts, 2.6, '', { body: liteOf(c), pr: 5, dry: 0.06, gr: 0.28, life: 0.3 });
    // 갈고리 끝에서 떨어져 나가는 물방울 덩이 — 바깥 위로 튀어 포물선으로
    if (n % 3 === 0) clump(ex, ey, Math.atan2(ey - pts[pts.length - 3], ex - pts[pts.length - 4]) + 0.3 * sgn(), 70, 3, 1, c);
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
