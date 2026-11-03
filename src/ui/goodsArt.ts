// 상품 그림 — 먹 테 + 납작한 색 한 판으로 그린 인라인 SVG. 96 격자.
// 명암 없음: 빛 · 그늘 판 · 반짝임 · 광택 점을 두지 않는다(2026-11-02 사용자 「명암이 부담스러워 아이콘처럼 단순한 2D」).
// 물건마다 재질 색 하나씩, 면은 먹 테로만 가른다. 테는 고른 굵기 붓 획(채운 path)이고 모서리를 살짝 지나친다.
// id · defs · 그라데이션 · 필터 · 글자 없음(한 화면에 여러 장이 들어가도 겹치지 않는다).
import type { SkuId } from '../meta/catalog';
import { MASK_N, SAMPLE_MASK, cellHex, maskCells } from '../meta/mask';
import { PUFF_FILL } from '../render/effects';
import { hs } from '../render/ink';

export type GoodsId =
  | 'gift' | 'toolbox' | 'envelope' | 'orb1' | 'orb3' | 'orbSack' | 'noads' | 'coverall' | 'look' | 'swords' | 'crown'
  | 'mask1' | 'mask3' | 'mask10' | 'life' | 'waza' | 'dust2x' | 'calendar' | 'dust' | 'dustShovel' | 'dustCart' | 'dustTruck'
  | 'orb' | 'pass' | 'coffee';

export type P = readonly [number, number];

export const INK = '#1A1A20';
export const SEAL = '#C4301E';
export const GOLD = '#E3A82B';
export const PAPER = '#F4F1E8';
/** 궤도조각 — 어디서나 이 파랑 하나 */
export const BLUE = '#3D86E6';
/** 봉투 · 자루 · 나무 */
const KRAFT = '#CB9E62';
/** 잔해 · 돌 */
const ASH = '#B0A897';
/** 쇠 */
const STEEL = '#A9B4C0';
/** 작업복 */
const MOSS = '#3C7D5C';
/** 종이 · 천 — 한지 달 위에서 묻히지 않게 한지보다 한 톤 */
const SHEET = '#DDD7C7';
/** 먼지 — 판에서 건물이 무너질 때 이는 만화 먼지 구름 면과 같은 색 */
const PUFF = PUFF_FILL;
const TAU = Math.PI * 2;

const n1 = (v: number) => +v.toFixed(1);
const pt = (p: P) => `${n1(p[0])} ${n1(p[1])}`;

const catmull = (p0: P, p1: P, p2: P, p3: P, t: number): P => {
  const t2 = t * t, t3 = t2 * t;
  const c = (k: 0 | 1) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
  return [c(0), c(1)];
};

/** 닫힌 곡선의 점들 */
function loopPts(pts: readonly P[], per = 5): P[] {
  const n = pts.length, out: P[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < per; j++) out.push(catmull(pts[(i + n - 1) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n], j / per));
  return out;
}
const loopD = (pts: readonly P[]): string => `M${loopPts(pts).map(pt).join('L')}Z`;

/** 꼭짓점 사이를 둥글게 잇는다(Catmull-Rom). 2점이면 직선 */
function smooth(pts: readonly P[], per = 6): P[] {
  const out: P[] = [];
  if (pts.length < 3) {
    const [a, b] = pts;
    for (let i = 0; i <= per * 2; i++) {
      const t = i / (per * 2);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return out;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < per; j++) out.push(catmull(p0, p1, p2, p3, j / per));
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * 붓 획 — pts를 따라 w0(들어갈 때)에서 w1(빠질 때)로 가늘어지는 채운 path.
 * 앞 12%는 붓을 누르며 굵어지고, dry면 마지막 30%가 세 갈래로 갈라져 제각각 끊긴다(갈필).
 */
export function brush(pts: readonly P[], w0: number, w1: number, seed: number, dry = true): string {
  const c = smooth(pts);
  const N = c.length - 1;
  const half = (i: number): number => {
    const t = i / N;
    const press = 0.6 + 0.4 * Math.min(1, t / 0.1);
    return 0.5 * (w0 + (w1 - w0) * Math.pow(t, 1.3)) * press * (1 + 0.16 * Math.sin(seed + t * 11));
  };
  const norm = (i: number): P => {
    const a = c[Math.max(0, i - 1)], b = c[Math.min(N, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L = Math.hypot(dx, dy) || 1;
    return [-dy / L, dx / L];
  };
  // 한 갈래 — off = 가운데서 벗어난 정도(반폭 배수) · k = 갈래 굵기(반폭 배수)
  const lane = (i0: number, i1: number, off: number, k: number): string => {
    const up: string[] = [], dn: string[] = [];
    for (let i = i0; i <= i1; i++) {
      const [nx, ny] = norm(i);
      const h = half(i);
      const cx = c[i][0] + nx * off * h, cy = c[i][1] + ny * off * h;
      up.push(pt([cx + nx * h * k, cy + ny * h * k]));
      dn.push(pt([cx - nx * h * k, cy - ny * h * k]));
    }
    return `M${up.join('L')}L${dn.reverse().join('L')}Z`;
  };
  if (!dry) return lane(0, N, 0, 1);
  const cut = Math.round(N * 0.7);
  return lane(0, cut, 0, 1)
    + lane(cut - 1, N, 0, 0.36)
    + lane(cut - 1, Math.round(N * (0.78 + 0.14 * hs(seed, 1))), -0.68, 0.28)
    + lane(cut - 1, Math.round(N * (0.8 + 0.16 * hs(seed, 2))), 0.68, 0.28);
}

/** 손으로 자른 면 — 변을 셋으로 나눠 조금씩 흔든 다각형 */
export function patch(pts: readonly P[], seed: number, amp = 1.2): string {
  const out: string[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    for (let j = 0; j < 3; j++) {
      const t = j / 3, k = i * 3 + j;
      out.push(pt([a[0] + (b[0] - a[0]) * t + (hs(seed, k) - 0.5) * amp * 2, a[1] + (b[1] - a[1]) * t + (hs(seed, k + 50) - 0.5) * amp * 2]));
    }
  }
  return `M${out.join('L')}Z`;
}

/** 원 둘레 점들 — span = 한 바퀴 비율, a0 = 시작 각 */
export function ring(cx: number, cy: number, r: number, n: number, span = 1, a0 = 0, seed = 0): P[] {
  const out: P[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (i / n) * TAU * span;
    const rr = r * (1 + 0.05 * Math.sin(seed + i * 1.7));
    out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return out;
}

const ink = (d: string) => `<path fill="${INK}" d="${d}"/>`;
const fill = (c: string, d: string) => `<path fill="${c}" d="${d}"/>`;
/** 손으로 자른 면 하나 */
const face = (c: string, pts: readonly P[], seed: number, amp = 0.5) => fill(c, patch(pts, seed, amp));
/** 둥근 면 하나 */
const soft = (c: string, pts: readonly P[]) => fill(c, loopD(pts));
const line = (pts: readonly P[], w0: number, w1: number, seed: number, dry = false) => ink(brush(pts, w0, w1, seed, dry));
/** 색 붓 획 */
const paint = (c: string, pts: readonly P[], w0: number, w1: number, seed: number, dry = false) => fill(c, brush(pts, w0, w1, seed, dry));
const dot = (x: number, y: number, r: number, seed: number) => ink(patch(ring(x, y, r, 8, 1, 0, seed).slice(0, 8), seed, r * 0.25));
const spot = (c: string, x: number, y: number, r: number, seed: number) => fill(c, patch(ring(x, y, r, 8, 1, 0, seed).slice(0, 8), seed, r * 0.2));
/** 타원 둘레 점들 */
const oval = (cx: number, cy: number, rx: number, ry: number, n = 12, a0 = 0): P[] =>
  Array.from({ length: n }, (_, i) => { const a = a0 + (i / n) * TAU; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as P; });

/** 각진 윤곽 — 변마다 한 획, 모서리는 살짝 지나친다. 굵기는 고르다 */
function edges(pts: readonly P[], w: number, seed: number): string {
  return pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const ux = (q[0] - p[0]) / L, uy = (q[1] - p[1]) / L, o = w * 0.3;
    return line([[p[0] - ux * o, p[1] - uy * o], [q[0] + ux * o, q[1] + uy * o]], w, w * 0.84, seed + i);
  }).join('');
}

/** 둥근 윤곽 — 둘레 한 바퀴. 굵기는 고르고 결만 조금 일렁인다 */
function contour(pts: readonly P[], w: number, seed: number): string {
  const c = loopPts(pts);
  const n = c.length;
  const out: string[] = [], inn: string[] = [];
  c.forEach((p, i) => {
    const a = c[(i + n - 1) % n], b = c[(i + 1) % n];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = (b[1] - a[1]) / L, ny = -(b[0] - a[0]) / L;
    const h = 0.5 * w * (1 + 0.1 * Math.sin(seed + i * 0.8));
    out.push(pt([p[0] + nx * h, p[1] + ny * h]));
    inn.push(pt([p[0] - nx * h, p[1] - ny * h]));
  });
  return ink(`M${out.join('L')}ZM${inn.reverse().join('L')}Z`);
}

/** 각진 면 — 한 색 + 먹 테 */
const plate = (c: string, pts: readonly P[], w: number, seed: number, amp = 0.5) => face(c, pts, seed, amp) + edges(pts, w, seed + 1);
/** 둥근 면 — 한 색 + 먹 테 */
const blob = (c: string, pts: readonly P[], w: number, seed: number) => soft(c, pts) + contour(pts, w, seed);
/** 동그라미 — 한 색 + 먹 테 */
const disc = (c: string, x: number, y: number, r: number, w: number, seed: number) => blob(c, ring(x, y, r, 12, 1, 0, seed).slice(0, 12), w, seed);

/** 막대 — a에서 b까지 굵기 w. 한 색 + 먹 테(ow) */
function stick(c: string, a: P, b: P, w: number, ow: number, seed: number): string {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = (-(b[1] - a[1]) / L) * (w / 2), ny = ((b[0] - a[0]) / L) * (w / 2);
  return plate(c, [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], ow, seed, 0.15);
}

/** 고른 굵기 고리 */
function ringD(x: number, y: number, r: number, w: number): string {
  return `M${oval(x, y, r + w / 2, r + w / 2, 40).map(pt).join('L')}ZM${oval(x, y, r - w / 2, r - w / 2, 40).reverse().map(pt).join('L')}Z`;
}

/** 먹 터짐 — render/ink.ts inkBlot과 같은 모양(가운데 덩이 + 혹 여섯 + 가시 다섯). 전부 같은 감김이라 겹친 데가 비지 않는다 */
function burst(x: number, y: number, R: number, seed: number, c: string = INK): string {
  const poly = (ps: readonly P[]) => `M${ps.map(pt).join('L')}Z`;
  let d = poly(ring(x, y, R, 22).slice(0, 22));
  for (let i = 0; i < 6; i++) {
    const a = seed + i * (TAU / 6) + (hs(seed, i) - 0.5) * 0.7;
    const dist = R * (0.72 + 0.28 * hs(seed, i + 6));
    const rr = R * (0.32 + 0.22 * hs(seed, i + 12));
    d += poly(ring(x + Math.cos(a) * dist, y + Math.sin(a) * dist, rr, 12).slice(0, 12));
  }
  for (let i = 0; i < 5; i++) {
    const a = seed * 1.7 + i * (TAU / 5) + (hs(seed, i + 20) - 0.5) * 0.9;
    const L = R * (1.45 + 0.7 * hs(seed, i + 26));
    const hw = 0.17;
    d += poly([
      [x + Math.cos(a - hw) * R * 0.8, y + Math.sin(a - hw) * R * 0.8],
      [x + Math.cos(a) * L, y + Math.sin(a) * L],
      [x + Math.cos(a + hw) * R * 0.8, y + Math.sin(a + hw) * R * 0.8],
    ]);
  }
  return fill(c, d);
}

/** 게임의 도트 마스크(견본) 틀 — 판의 bakeMask와 같은 규칙(칸 밖 테두리 한 칸 먹). 파는 건 새로 그릴 빈 장이라
 *  색은 먹(테두리 · 눈 · 입) + 주홍(볼)만 두고 나머지 칸은 한지. 색마다 가로 띠 하나씩 path 셋 */
function dotMask(x: number, y: number, size: number): string {
  const cells = maskCells(SAMPLE_MASK);
  const px = size / MASK_N;
  const at = (cx: number, cy: number): number => (cx < 0 || cy < 0 || cx >= MASK_N || cy >= MASK_N ? 0 : cells[cy * MASK_N + cx]);
  const tone = (v: number): string => { const h = cellHex(v); return h === '#1a1a20' ? INK : h === '#f07aa0' ? SEAL : PAPER; };
  const runs = new Map<string, string[]>();
  for (let cy = -1; cy <= MASK_N; cy++) {
    let cur = '', x0 = 0;
    for (let cx = -1; cx <= MASK_N + 1; cx++) {
      const v = at(cx, cy);
      const c = v ? tone(v) : cx <= MASK_N && (at(cx - 1, cy) || at(cx + 1, cy) || at(cx, cy - 1) || at(cx, cy + 1)) ? INK : '';
      if (c === cur) continue;
      if (cur) (runs.get(cur) ?? runs.set(cur, []).get(cur)!).push(`M${n1(x + x0 * px)} ${n1(y + cy * px)}h${n1((cx - x0) * px)}v${n1(px)}h${n1(-(cx - x0) * px)}z`);
      cur = c;
      x0 = cx;
    }
  }
  return [...runs].map(([c, d]) => `<path fill="${c}" d="${d.join('')}"/>`).join('');
}

/** 마스크 한 장 — 도트 틀 + 양옆 끈(먹 획). (x, y) = 얼굴 가운데 */
function maskAt(x: number, y: number, size: number, seed: number): string {
  const h = size / 2;
  return line([[x - h + 2, y], [x - h - 6, y - 4], [x - h - 10, y - 14]], 2.6, 1.2, seed)
    + line([[x + h - 2, y], [x + h + 6, y - 4], [x + h + 10, y - 14]], 2.6, 1.2, seed + 1)
    + dotMask(x - h, y - h, size);
}

/** 궤도조각 — 게임 안 glyph와 같은 오각 조각. 파랑 한 판에 먹으로 깎은 금만 긋는다 */
export function orb(x: number, y: number, s: number, seed: number, rot = 0): string {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const q = (px: number, py: number): P => {
    const dx = (px - 9) * s, dy = (py - 9) * s;
    return [x + dx * cs - dy * sn, y + dx * sn + dy * cs];
  };
  const V = [q(9, 1.5), q(15.5, 6.5), q(12.5, 16), q(5, 14.5), q(2.5, 6.5)];
  const T = [q(8.6, 5.4), q(12, 7.8), q(10.4, 11.8), q(6.8, 11), q(5.8, 7.6)];
  return face(BLUE, V, seed, 0.08 * s)
    + edges(T, 0.22 * s, seed + 10)
    + T.map((t, i) => line([t, V[i]], 0.2 * s, 0.16 * s, seed + 20 + i)).join('')
    + edges(V, 0.62 * s, seed + 1);
}

/** 묶은 포대 — 흰 마대에 주홍 띠 둘, 묶은 끈 위로 입이 벌어진다 */
function bag(x: number, y: number, s: number, seed: number): string {
  const q = (px: number, py: number): P => [x + px * s, y + py * s];
  const body = [q(-13, -28), q(-27, -10), q(-33, 12), q(-25, 31), q(0, 37), q(25, 31), q(33, 12), q(27, -10), q(13, -28)];
  return blob(SHEET, [q(-11, -28), q(-17, -42), q(-7, -38), q(0, -45), q(7, -38), q(17, -42), q(11, -28)], 3.2 * s, seed + 5)
    + soft(SHEET, body)
    + paint(SEAL, [q(-31, 4), q(0, 11), q(31, 4)], 6 * s, 6 * s, seed + 6)
    + paint(SEAL, [q(-31, 15), q(0, 22), q(31, 15)], 3.4 * s, 3.4 * s, seed + 7)
    + contour(body, 4.4 * s, seed)
    + paint(KRAFT, [q(-12, -28), q(0, -25), q(12, -28)], 4.4 * s, 4.4 * s, seed + 9)
    + line([q(-13, -30), q(0, -27), q(13, -30)], 1.6 * s, 1.2 * s, seed + 10)
    + line([q(-13, -26), q(0, -23), q(13, -26)], 1.6 * s, 1.2 * s, seed + 11);
}

/** 돌 한 덩이 */
function rock(x: number, y: number, r: number, seed: number): string {
  const V: P[] = [[x - r, y + r * 0.4], [x - r * 0.5, y - r * 0.7], [x + r * 0.5, y - r * 0.8], [x + r, y + r * 0.2], [x + r * 0.6, y + r * 0.8], [x - r * 0.6, y + r * 0.8]];
  return plate(ASH, V, Math.max(1.6, r * 0.34), seed, 0.1 * r);
}

/** 벽돌 조각 */
function brick(x: number, y: number, w: number, a: number, seed: number): string {
  const c = Math.cos(a), s = Math.sin(a), h = w * 0.52;
  const q = (u: number, v: number): P => [x + u * c - v * s, y + u * s + v * c];
  return plate(SEAL, [q(-w / 2, -h / 2), q(w / 2, -h / 2), q(w / 2, h / 2), q(-w / 2, h / 2)], Math.max(1.5, w * 0.16), seed, 0.3);
}

/** 먼지 구름 덩이 [x, y, 반지름] */
type Lobe = readonly [number, number, number];

/** 먼지 구름 — 덩이 여럿을 먹 테 하나로 두른다. 먹 원(r + w)을 먼저 깔고 면(r)을 위에 칠해 바깥 테두리만 남긴다(판의 drawPuff와 같은 만드는 법) */
function cloud(lobes: readonly Lobe[], w: number, seed: number): string {
  const d = (dr: number) => lobes.map(([x, y, r], i) => loopD(ring(x, y, r + dr, 12, 1, 0, seed + i).slice(0, 12))).join('');
  return ink(d(w)) + fill(PUFF, d(0));
}

/** 바퀴 — 먹 타이어에 쇠 축 */
const wheel = (x: number, y: number, r: number, seed: number): string =>
  soft(INK, ring(x, y, r + 1, 16).slice(0, 16)) + soft(STEEL, ring(x, y, r * 0.48, 10).slice(0, 10)) + spot(INK, x, y, r * 0.12, seed);

const ART: Record<GoodsId, () => string> = {
  // 포장한 상자 — 앞에서 본 상자 + 주홍 끈 + 큰 매듭
  gift: () =>
    blob(SEAL, [[48, 38], [38, 23], [22, 16], [17, 29], [30, 38]], 3.4, 21)
    + blob(SEAL, [[48, 38], [58, 23], [74, 16], [79, 29], [66, 38]], 3.4, 22)
    + plate(KRAFT, [[16, 52], [80, 52], [80, 90], [16, 90]], 4.2, 1)
    + plate(KRAFT, [[10, 38], [86, 38], [86, 53], [10, 53]], 4.2, 5)
    + plate(SEAL, [[41, 53], [55, 53], [55, 90], [41, 90]], 2.6, 9, 0.3)
    + plate(SEAL, [[40, 38], [56, 38], [56, 53], [40, 53]], 2.6, 13, 0.3)
    + disc(SEAL, 48, 37, 6.6, 3, 24),

  // 공구함 — 주홍 함 위로 망치 · 스패너가 솟는다
  toolbox: () =>
    stick(KRAFT, [31, 50], [23, 15], 7, 2.6, 31)
    + plate(STEEL, [[6.8, 11], [36, 4.4], [38.4, 15.2], [9.2, 21.8]], 3, 34, 0.4)
    + stick(STEEL, [60, 50], [67, 22], 8, 2.6, 41)
    + blob(STEEL, [[60, 8], [56, 18], [62, 27], [72, 25], [76, 15], [72, 12], [68, 19], [63, 16]], 3, 43)
    + plate(SEAL, [[10, 52], [86, 52], [86, 88], [10, 88]], 4.2, 46)
    + plate(SEAL, [[7, 44], [89, 44], [89, 55], [7, 55]], 3.6, 50, 0.4)
    + plate(STEEL, [[40, 53], [56, 53], [56, 65], [40, 65]], 2.6, 56, 0.3)
    + dot(48, 59, 1.8, 72),

  // 누런 월급 봉투 — 뚜껑이 열리고 궤도조각이 비어져 나온다. 주홍 인 하나
  envelope: () =>
    plate(KRAFT, [[8, 42], [47, 8], [86, 36]], 3.4, 81)
    + orb(34, 36, 2.4, 83, -0.3) + orb(62, 31, 2.7, 84, 0.3) + orb(48, 25, 2.3, 85, 0.05)
    + plate(KRAFT, [[8, 42], [86, 36], [90, 84], [12, 90]], 4.4, 87)
    + line([[9, 43], [50, 63], [85, 37]], 3.4, 2.6, 95)
    + line([[13, 89], [46, 65]], 2.4, 1.4, 96) + line([[89, 83], [55, 64]], 2.4, 1.4, 97)
    + disc(SEAL, 50, 66, 8.2, 2.6, 98),

  orb: () => orb(47.5, 49, 5.1, 131),

  orb1: () => orb(48, 50, 5, 31, -0.08),

  orb3: () => orb(29, 38, 3.1, 32, -0.34) + orb(67, 36, 3.2, 33, 0.3) + orb(48, 63, 3.8, 34, 0.04),

  // 입 벌린 자루에 조각이 그득
  orbSack: () =>
    soft(INK, oval(48, 36, 19, 6.5))
    + orb(33, 29, 2.2, 142, -0.5) + orb(63, 28, 2.3, 143, 0.4) + orb(48, 20, 2.3, 144, 0.1) + orb(48, 33, 2.4, 145, 0)
    + blob(KRAFT, [[36, 38], [23, 53], [16, 72], [23, 89], [48, 95], [73, 89], [80, 72], [73, 53], [60, 38]], 4.2, 141)
    + line([[41, 47], [37, 63]], 2.2, 0.8, 146) + line([[56, 47], [59, 61]], 2, 0.8, 147)
    + plate(KRAFT, [[28, 34], [68, 34], [66, 44], [30, 44]], 3, 148, 0.4),

  // 먼지 한 삽 — 비스듬한 삽 날에 먼지 구름이 수북하고 벽돌 한 조각. u = 날 끝 쪽(왼쪽 아래), v = 오른쪽 아래
  dustShovel: () => {
    const q = (u: number, v: number): P => [37 + (v - u) * Math.SQRT1_2, 59 + (u + v) * Math.SQRT1_2];
    return stick(KRAFT, q(-38, 0), q(-62, 0), 8, 2.8, 151)
      + stick(KRAFT, q(-64, -11), q(-64, 11), 8, 2.6, 155)
      + plate(STEEL, [q(-42, -6), q(-42, 6), q(-23, 11), q(-23, -11)], 3, 158, 0.3)
      + blob(STEEL, [q(-25, -21), q(-4, -27), q(15, -21), q(32, -3), q(34, 0), q(32, 3), q(15, 21), q(-4, 27), q(-25, 21)], 4.4, 166)
      + brick(46, 46, 12, -0.6, 172)
      + cloud([[36, 57, 12], [25, 65, 10], [47, 64, 10], [30, 73, 9], [43, 73, 8]], 3.8, 171);
  },

  // 먼지 한 수레 — 외발 수레에 먼지 구름이 산더미, 벽돌 · 돌이 튄다
  dustCart: () =>
    line([[34, 74], [28, 90]], 4.4, 3.4, 181) + line([[28, 90], [20, 90]], 3.4, 2.8, 182)
    + brick(65, 17, 15, 0.45, 186) + rock(29, 22, 6, 187)
    + cloud([[47, 30, 16], [30, 37, 12], [64, 36, 13], [17, 42, 8], [78, 42, 8]], 4.4, 183)
    + wheel(74, 79, 12, 184)
    + stick(STEEL, [74, 79], [6, 56], 5, 2, 185)
    + paint(INK, [[10, 57.4], [0, 54]], 8, 7, 188)
    + plate(SEAL, [[8, 42], [86, 42], [70, 72], [28, 72]], 4.4, 189, 0.4)
    + line([[12, 47.5], [83, 47.5]], 2.2, 1.8, 193),

  // 먼지 한 트럭 — 덤프트럭 적재함에 먼지 구름이 산더미
  dustTruck: () =>
    brick(47, 18, 13, 0.5, 202) + rock(14, 24, 5, 204)
    + cloud([[31, 30, 14], [16, 36, 10], [46, 35, 11], [6, 41, 6], [56, 41, 6]], 4.2, 201)
    + plate(GOLD, [[2, 42], [60, 42], [60, 68], [8, 68]], 4.2, 203, 0.4)
    + line([[17, 48], [17.6, 62]], 2.2, 1.6, 206) + line([[31, 48], [31, 62]], 2.2, 1.6, 207) + line([[45, 48], [45, 62]], 2.2, 1.6, 208)
    + plate(STEEL, [[8, 68], [92, 68], [92, 76], [8, 76]], 3, 214, 0.3)
    + plate(GOLD, [[62, 36], [82, 36], [92, 54], [92, 68], [62, 68]], 4.2, 215, 0.4)
    + plate(SHEET, [[67, 41], [80, 41], [86, 53], [67, 53]], 2.4, 218, 0.3)
    + wheel(24, 79, 12, 236) + wheel(74, 79, 12, 237),

  // 영상 광고 화면에 주홍 금지 표
  noads: () =>
    line([[48, 67], [48, 75]], 5, 4.4, 241) + line([[35, 76], [61, 75]], 4.4, 3.4, 242)
    + plate(SHEET, [[24, 28], [72, 26], [73, 64], [25, 66]], 3.8, 243)
    + face(INK, [[41, 37], [58, 46.5], [41, 56]], 251, 0.4)
    + fill(INK, ringD(48, 48, 40, 13.4)) + fill(SEAL, ringD(48, 48, 40, 8.6))
    + line([[17, 19], [79, 77]], 13.4, 12.6, 258) + paint(SEAL, [[18, 20], [78, 76]], 8.6, 8.6, 259),

  // 작업복 — 옷걸이에 걸린 초록 멜빵 작업복
  coverall: () =>
    line([[50, 22], [50, 10]], 3, 2.4, 261) + line([[50, 10], [56, 6], [58, 11], [53, 14]], 2.6, 2, 262)
    + line([[22, 22], [50, 13], [78, 22]], 3.6, 3, 263)
    + plate(MOSS, [[24, 20], [36, 16], [46, 22], [56, 22], [66, 16], [78, 20], [92, 42], [80, 50], [72, 40], [73, 58], [76, 92], [54, 92], [51, 66], [47, 66], [44, 92], [22, 92], [25, 58], [26, 40], [18, 50], [6, 42]], 3.8, 264, 0.3)
    + line([[50, 26], [50, 54]], 2.6, 2, 290, true)
    + plate(GOLD, [[28, 56], [72, 56], [72, 62], [28, 62]], 2.4, 291, 0.3)
    + plate(GOLD, [[43, 54], [57, 54], [57, 64], [43, 64]], 2.2, 296, 0.2)
    + edges([[33, 30], [44, 30], [44, 42], [33, 42]], 2, 301) + edges([[56, 30], [67, 30], [67, 42], [56, 42]], 2, 305),

  // 꾸미기 — 칠통과 붓 한 자루
  look: () =>
    line([[12, 46], [22, 26], [54, 26], [64, 46]], 2.6, 2, 321)
    + plate(STEEL, [[14, 46], [62, 46], [58, 90], [18, 90]], 4.2, 311)
    + plate(SEAL, [[15.1, 58], [60.9, 58], [59.3, 76], [16.7, 76]], 2.4, 313, 0.3)
    + blob(SEAL, oval(38, 46, 24, 6.5), 3.4, 320)
    + stick(KRAFT, [72, 38], [90, 6], 6.4, 2.4, 323)
    + plate(STEEL, [[64, 34], [74, 39], [71, 45], [61, 40]], 2.4, 326, 0.2)
    + blob(SEAL, [[61, 40], [71, 45], [66, 56], [60, 62], [57, 52]], 2.8, 331),

  // 무기 전부 — 대검 둘이 엇갈린다
  swords: () => {
    const blade = (flip: number, seed: number): string => {
      const q = (x: number, y: number): P => [flip < 0 ? 96 - x : x, y];
      return plate(STEEL, [q(82, 6), q(90, 6), q(90, 14), q(30, 72), q(22, 64)], 3.4, seed, 0.3)
        + stick(KRAFT, q(24, 70), q(11, 83), 7, 2.4, seed + 4)
        + disc(GOLD, flip < 0 ? 90 : 6, 88, 5, 2.4, seed + 8)
        + stick(GOLD, q(10, 52), q(42, 84), 8, 2.4, seed + 12);
    };
    return blade(-1, 341) + blade(1, 361);
  },

  // 왕관 — 금 한 판에 주홍 보석
  crown: () =>
    plate(GOLD, [[14, 80], [8, 34], [29, 54], [48, 18], [67, 54], [88, 34], [82, 80]], 4.4, 381)
    + line([[14, 68], [82, 67]], 2.6, 2.2, 394)
    + disc(SEAL, 48, 74, 4.2, 2, 395) + disc(SEAL, 30, 74, 3, 1.8, 396) + disc(SEAL, 66, 74, 3, 1.8, 397)
    + disc(SEAL, 8, 31, 5, 2.2, 398) + disc(SEAL, 88, 31, 5, 2.2, 399) + disc(SEAL, 48, 15, 5.6, 2.4, 400),

  // 빈 마스크 한 장 + 그릴 붓 한 자루(끝에 주홍)
  mask1: () =>
    maskAt(42, 44, 58, 71)
    + stick(KRAFT, [92, 30], [78, 58], 6, 2, 411)
    + plate(STEEL, [[74, 56], [82, 60], [80, 65], [72, 61]], 2.2, 414, 0.2)
    + blob(SEAL, [[72, 61], [80, 65], [74, 78], [66, 90], [66, 74]], 2.6, 416),

  mask3: () => maskAt(30, 34, 40, 72) + maskAt(66, 34, 40, 73) + maskAt(48, 66, 42, 74),

  // 겹쳐 쌓인 장 — 뒤에서부터 비스듬히 찍어 가장자리만 보인다
  mask10: () =>
    [0, 1, 2, 3].map((i) => dotMask(10 + i * 6, 44 - i * 7, 42)).join('')
    + maskAt(55, 36, 42, 85),

  // 목숨 — 통통한 하트에 반창고
  life: () =>
    blob(SEAL, [[48, 30], [36, 15], [17, 16], [8, 33], [15, 54], [48, 89], [81, 54], [88, 33], [79, 16], [60, 15]], 5.4, 422)
    + plate(KRAFT, [[46, 56], [76, 36], [84, 48], [54, 68]], 2.8, 423, 0.3)
    + edges([[60, 47], [69, 41], [76, 53], [67, 59]], 1.6, 426)
    + dot(64, 49, 1.1, 430) + dot(68, 47, 1.1, 431) + dot(67, 53, 1.1, 432) + dot(71, 51, 1.1, 433),

  // 필살 — 먹 터짐 안에 주홍 · 금 불꽃
  waza: () => burst(48, 49, 27, 3) + burst(48, 49, 18, 5.2, SEAL) + burst(48, 49, 9, 2.6, GOLD),

  // 먼지 자루 — 뒤 포대 + 앞 포대. 두 배라 둘이다
  dust2x: () => bag(66, 52, 0.66, 451) + bag(34, 58, 0.82, 461),

  // 출근부 — 묶음 달력에 주홍 동그라미
  calendar: () => {
    const P0: P[] = [[10, 22], [86, 18], [86, 88], [12, 90]];
    return face(SHEET, P0, 472)
      + face(SEAL, [[10, 22], [86, 18], [86, 38], [10, 41]], 474, 0.4)
      + edges(P0, 4.4, 477) + line([[10, 40], [86, 37]], 2.8, 2.2, 482)
      + [24, 48, 72].map((x, i) => plate(STEEL, [[x - 3, 12], [x + 3, 12], [x + 3, 28], [x - 3, 28]], 2.2, 483 + i * 4, 0.2)).join('')
      + [0, 1, 2].map((j) => [0, 1, 2, 3].map((i) => dot(24 + i * 16, 52 + j * 14, 2.3, 500 + j * 4 + i)).join('')).join('')
      + fill(SEAL, brush(ring(56, 66, 10.5, 16, 0.96, -2, 520), 4.4, 1.6, 520));
  },

  // 먼지 — 재화 표. 판의 먼지 구름 하나, 뒤로 벽돌 · 돌 조각이 튄다(구름만이면 날씨로 읽힌다)
  dust: () =>
    brick(74, 26, 26, -0.42, 751) + rock(21, 29, 10, 755)
    + cloud([[48, 50, 20], [30, 60, 15], [66, 59, 16], [40, 70, 15], [58, 71, 14], [17, 70, 9], [80, 70, 9]], 4.6, 721),

  // 특근 — 노란 타워 크레인
  pass: () => {
    const mast = (a: P, b: P, n: number, w: number, seed: number): string => {
      const nx = -(b[1] - a[1]), ny = b[0] - a[0], L = Math.hypot(nx, ny) || 1;
      const at = (t: number, k: number): P => [a[0] + (b[0] - a[0]) * t + (nx / L) * k * w, a[1] + (b[1] - a[1]) * t + (ny / L) * k * w];
      let s = '';
      for (let i = 0; i < n; i++) s += line([at(i / n, i % 2 ? 1 : -1), at((i + 1) / n, i % 2 ? -1 : 1)], 2.6, 2.2, seed + i);
      return s + stick(GOLD, at(0, -1), at(1, -1), 4.6, 2.2, seed + 20) + stick(GOLD, at(0, 1), at(1, 1), 4.6, 2.2, seed + 22);
    };
    return mast([58, 90], [58, 30], 6, 7, 541)
      + mast([2, 27], [62, 25], 7, 4.6, 571)
      + stick(GOLD, [62, 25], [90, 26], 6, 2.2, 601)
      + plate(STEEL, [[76, 29], [92, 29], [92, 46], [76, 46]], 3, 604, 0.4)
      + plate(GOLD, [[48, 12], [68, 12], [68, 26], [48, 26]], 3, 610, 0.4)
      + plate(SHEET, [[52, 15], [64, 15], [64, 21], [52, 21]], 1.8, 612, 0.2)
      + line([[54, 12], [58, 3], [62, 12]], 2.4, 1.8, 616) + line([[58, 4], [4, 25]], 1.5, 1.2, 617) + line([[58, 4], [88, 24]], 1.5, 1.2, 618)
      + line([[16, 30], [16, 56]], 2.4, 2, 619)
      + ink(brush(ring(16, 63, 7, 12, 0.8, 1.2, 621), 3.2, 1.6, 621))
      + plate(STEEL, [[42, 84], [74, 84], [78, 92], [38, 92]], 3, 623, 0.4);
  },

  // 믹스커피 — 종이컵에 금 띠, 위로 김 두 줄, 막대 하나
  coffee: () =>
    line([[42, 31], [36, 23], [44, 14], [38, 6]], 2.8, 1, 631, true)
    + line([[56, 31], [62, 24], [54, 16]], 2.6, 1, 632, true)
    + line([[60, 40], [84, 10]], 3.8, 2.4, 633)
    + plate(SHEET, [[20, 38], [76, 38], [66, 90], [30, 90]], 4.2, 634)
    + plate(GOLD, [[23.5, 56], [72.5, 56], [69.5, 72], [26.5, 72]], 2.2, 636, 0.3)
    + blob(SHEET, oval(48, 38, 28, 6.5), 3.2, 643)
    + soft(KRAFT, oval(48, 38.4, 22, 3.8)),
};

const SKU_ART: Record<SkuId, GoodsId> = {
  orbit_s: 'orb1', orbit_m: 'orb3', orbit_l: 'orbSack',
  dust_s: 'dustShovel', dust_m: 'dustCart', dust_l: 'dustTruck',
  toolbox: 'toolbox', toolbox_sale: 'toolbox',
  rookie_pack: 'gift', rookie_sale: 'gift',
  no_ads: 'noads', salary: 'envelope', knight_set: 'swords', king_set: 'crown', season_pass: 'pass',
  mask_1: 'mask1', mask_3: 'mask3', mask_10: 'mask10',
};

const svgs = new Map<GoodsId, string>();

/** 그림 한 장의 속(path들) — 한 번 지어 두고 다시 쓴다 */
function artOf(id: GoodsId): string {
  return svgs.get(id) ?? (svgs.set(id, ART[id]()).get(id) as string);
}

export function goods(id: GoodsId): string {
  return `<svg class="gd" viewBox="0 0 96 96" aria-hidden="true">${artOf(id)}</svg>`;
}

/** 재화 칸 뒤 달 — 손으로 자른 한지 달 한 장 */
export function moonArt(seed: number): string {
  return `<svg class="gd" viewBox="0 0 96 96" aria-hidden="true">${fill(PAPER, patch(ring(48, 48, 41, 26).slice(0, 26), seed, 1))}</svg>`;
}

/** 꾸러미 장면이 쓴다 — 같은 그림을 캔버스에. (x, y) = 가운데, size = 한 변 */
export function paintGoods(ctx: CanvasRenderingContext2D, id: GoodsId, x: number, y: number, size: number, rot = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(size / 96, size / 96);
  ctx.translate(-48, -48);
  paintPaths(ctx, artOf(id));
  ctx.restore();
}

/** path 문자열을 캔버스에 그대로 찍는다 — 장면 안 작은 조각용 */
export function paintPaths(ctx: CanvasRenderingContext2D, svg: string): void {
  for (const m of svg.matchAll(/<path fill="([^"]+)"(?: transform="translate\(([-\d.]+) ([-\d.]+)\)")? d="([^"]+)"\/>/g)) {
    const dx = +(m[2] ?? 0), dy = +(m[3] ?? 0);
    if (dx || dy) ctx.translate(dx, dy);
    ctx.fillStyle = m[1];
    ctx.fill(new Path2D(m[4]));
    if (dx || dy) ctx.translate(-dx, -dy);
  }
}

export function skuGoods(id: SkuId): GoodsId {
  return SKU_ART[id];
}
