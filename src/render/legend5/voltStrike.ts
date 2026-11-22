// 고압선 대검 타격 · 층 깨기 · 완파(11-22 박자 판). volt.ts 4판의 꼴 · 색 · 크기 · 자리 · 흰 속줄은 그대로, 박자만 다르다.
// 한 사건에 아크는 한 번 서고 한 번 사그라진다 — 밑동에서 끝으로 3칸 남짓에 빠르게 자라고(ge로 처음이 급하다) → 버티고 →
// 마지막 7칸 남짓에 밑동부터 깎이며 가늘어진다. 떠오름 0(옛 판은 위로 흘러 「연기 같다」).
// 꺼졌다 다시 켜지는 것(끊김 · 다시 붙기 · 늦은 튐)은 금지(CLAUDE.md 불변 13 「깜빡임 금지」). 흰 속줄 든 마디 · 갈래 · 조각 아크는 옛 판 수명 그대로.
// 필살 마무리(volt.ts bloom)는 옛 surge를 그대로 쓴다.
// ⚠ bladeFx와 순환 import — 최상위에서 bladeFx 값을 부르지 않는다.
import { PALETTE, VIEW } from '../../config';
import { bent, later, n01, put, sgn } from '../bladeFx';
import { liteOf } from './geom';

const INK = PALETTE.INK;
const PAPER = PALETTE.BG;
const GROUND = VIEW.GROUND_Y;
const UP = -Math.PI / 2;
const F = 1 / 60;
const P_FLICK = 1;
const P_LINE = 2;
const P_SWELL = 3;
/** 자람 곡선 — 1보다 작으면 처음이 급하고 끝에 닿을 때 느려진다 */
const GE = 0.6;
/** 사그라지는 프레임(키우기 전 · 그림은 1.2배 = 7칸 남짓) */
const FADE = 6;

/**
 * H · reach · sway · w · sky · bulge · fat = 지금 판 그대로. grow = 밑동 → 끝 자라는 프레임 · life = 줄마다 줄기 수명(프레임, 첫 줄이 가장 길다) ·
 * hop = 조각 사이 짧은 아크 수(자라는 동안 이어 붙는다)
 */
const SIZE = {
  hit: { H: [100, 90], reach: 16, sway: 15, w: 3, grow: 3, gap: 3, out: false, life: [14, 12], hop: 0, sky: [30, 70], bulge: 1, fat: 1.8 },
  floor: { H: [128, 98, 70], reach: 30, sway: 18, w: 2.2, grow: 3, gap: 4.5, out: false, life: [18, 14, 10], hop: 3, wide: 60, sky: [25, 95], bulge: 2, fat: 2.4 },
  destroy: { H: [176, 144, 110], reach: 46, sway: 24, w: 2.9, grow: 3.5, gap: 5, out: true, life: [24, 19, 14], hop: 5, sky: [30, 120], bulge: 3, fat: 2.4 },
} as const;
type Size = (typeof SIZE)[keyof typeof SIZE];

interface Arc { w: number; crawl: number; life: number; bulge: number; fork: number; dot: boolean; fat?: number }

/** 지금 판 arcPts 그대로 */
function arcPts(bx: number, by: number, tx: number, ty: number, sway: number): number[] {
  const [dx, dy] = [tx - bx, ty - by];
  const L = Math.hypot(dx, dy) || 1;
  const [nx, ny] = [-dy / L, dx / L];
  const n = Math.min(28, Math.max(10, Math.round(L / 6)));
  const hops = 1.3 + n01() * 1.6;
  const ph = n01() * Math.PI * 2;
  const fine = 5 + n01() * 4;
  const ph2 = n01() * Math.PI * 2;
  const bow = sgn() * sway * 0.5;
  const pts = [bx, by];
  for (let i = 1; i < n; i++) {
    const t = i / (n - 1);
    const env = Math.sin(Math.PI * t) ** 0.6;
    const jit = i < n - 1 ? sgn() * (0.5 + L * 0.008) : 0;
    const off = (sway * (0.45 + 0.9 * t) * Math.sin(Math.PI * hops * t + ph) + bow + sway * 0.22 * Math.sin(Math.PI * fine * t + ph2)) * env + jit;
    pts.push(bx + dx * t + nx * off, by + dy * t + ny * off);
  }
  return pts;
}

/** 꼭대기 두 갈래 — 꼴 그대로. 가는 것이라 줄기보다 먼저(줄기 수명의 0.4 · 0.2) 사그라진다 · 떠오르지 않는다 */
function fork(pts: readonly number[], len: number, w: number, life: number, c: string): void {
  const m = pts.length;
  const [x, y] = [pts[m - 2], pts[m - 1]];
  const a0 = Math.atan2(y - pts[m - 3], x - pts[m - 4]);
  const a = Math.sin(a0) > 0.2 ? -a0 : a0;
  const s = sgn() > 0 ? 1 : -1;
  const arms = [[0.2 + 0.3 * n01(), 1], [-(0.5 + 0.35 * n01()), 0.4 + 0.25 * n01()]] as const;
  arms.forEach(([da, f], i) => {
    const b = a + s * da;
    const l = len * f;
    const bend = sgn() * l * 0.2;
    const [ca, sa] = [Math.cos(b), Math.sin(b)];
    const q = [x, y, x + ca * l * 0.5 - sa * bend, y + sa * l * 0.5 + ca * bend, x + ca * l, y + sa * l];
    for (let j = 3; j < q.length; j += 2) q[j] = Math.min(GROUND - 4, q[j]);
    bent(q, w * (i ? 0.8 : 1.3), i ? '' : PAPER, { body: liteOf(c), life: life * (i ? 0.5 : 1), dry: 0.3, pr: P_FLICK, gr: 0.25, ge: GE, hold: 0.5 });
  });
}

/**
 * 아크 한 줄 — 지금 판 climb 그대로(먹 머리 아래 절반 → 노랑 위 절반 · 부푼 마디 · 꼭대기 갈래)에서 박자만:
 * crawl 3칸 남짓 · ge 급한 시작 · 실은 마지막 FADE 프레임에 밑동부터 깎인다 · 떠오름 0
 */
function climb(pts: number[], o: Arc, c: string): void {
  const n = pts.length / 2;
  if (o.dot) put('spat', pts[0], pts[1], { life: 0.08, size: o.w * 1.4, rot: UP, v: 2, c1: INK });
  const head = Math.max(2, Math.round((n - 1) * 0.5));
  const line = (from: number, to: number, body: string): void => {
    const t0 = (from / (n - 1)) * o.crawl;
    const life = o.life - t0;
    later(t0, () => bent(pts.slice(from * 2, to * 2 + 2), o.w, '', {
      body, life, dry: 0.12, pr: P_LINE, gr: Math.min(0.6, Math.max(0.05, (o.crawl * (to - from)) / (n - 1) / life)), ge: GE,
      fd: Math.max(0.4, 1 - (FADE * F) / life),
    }));
  };
  line(0, head, c);
  if (head < n - 1) line(head, n - 1, liteOf(c));
  // 부푼 마디 — 자리 · 굵기 지금 판 그대로. 실보다 먼저 사그라진다(제 자리 실이 깎이기 전에 · 허공에 뜬 노랑 조각 금지)
  for (let j = 0, at = 0.15 + 0.1 * n01(); j < o.bulge && at < 0.8; j++) {
    const i0 = Math.round(at * (n - 1));
    at += 0.22 + 0.16 * n01();
    const i1 = Math.min(n - 1, Math.round(at * (n - 1)));
    at += 0.05 + 0.1 * n01();
    if (i1 - i0 < 2) continue;
    const t0 = (i0 / (n - 1)) * o.crawl;
    // 흰 속줄이 든 마디는 지금 판처럼 줄기가 깎일 때까지 산다(11-22 사용자: 「아크 내부에 흰 스파크있는게 지금이 더 이쁜데」 — 넓이를 맞추려 0.25~0.45로 깎았던 것 되돌림)
    // 낮은 마디가 조금 먼저(0.7 → 위쪽 0.8) — 줄기보다 먼저 진다(완파 끝물 +24~+34에 마디 셋 이하 · legend5-volt 시험)
    const life = (o.life - t0) * (0.7 + (0.1 * i0) / (n - 1));
    later(t0, () => bent(pts.slice(i0 * 2, i1 * 2 + 2), o.w * ((o.fat ?? 2.4) + 0.8 * (j / Math.max(1, o.bulge - 1)) + 0.4 * n01()), PAPER, {
      body: c, life, dry: 0.15, pr: P_SWELL, hold: 0.7, ge: GE, fd: Math.max(0.4, 1 - (FADE * F) / life),
      gr: Math.min(0.4, Math.max(0.05, (o.crawl * (i1 - i0)) / (n - 1) / life)),
    }));
  }
  if (o.fork) later(o.crawl, () => fork(pts, o.fork, Math.max(1.2, o.w * 1.1), o.life * 0.55, c)); // 지금 판 0.55 — 흰 속줄 든 갈래(11-22 「지금이 더 이쁜데」)
}

/** 조각 사이 짧은 아크 — 꼴 그대로, 줄기보다 짧게 산다 · 떠오르지 않는다 */
function hop(x: number, y: number, a: number, len: number, w: number, c: string): void {
  const [ex, ey] = [x + Math.cos(a) * len, Math.min(GROUND - 4, y + Math.sin(a) * len)];
  bent(arcPts(x, y, ex, ey, len * 0.45), w * 1.4, PAPER, { body: liteOf(c), life: 0.16 + 0.08 * n01(), dry: 0.2, pr: P_LINE, gr: 0.3, ge: GE, hold: 0.6 });
}

/**
 * 한 사건 — 아크 여러 줄이 거의 같이(한두 칸 어긋나) 밑동에서 자라 버티다 사그라진다(첫 줄이 가장 오래).
 * 조각 사이 짧은 아크는 줄기가 자라는 동안 이어 붙어 줄기가 서 있을 때 끝난다. 다시 붙는 줄 · 늦은 튐 없음
 */
function surge(x: number, y: number, S: Size, k: number, c: string): void {
  const dir = sgn() > 0 ? 1 : -1;
  const kk = Math.min(k, 2);
  S.H.forEach((h0, i) => {
    const H = h0 * kk * (0.88 + 0.24 * n01());
    const side = i % 2 ? -dir : dir;
    const bx = x + side * S.reach * kk * (i === 0 ? 0.1 + 0.3 * n01() : 0.55 + 0.45 * n01() + (i > 1 ? 0.35 : 0));
    const by = y - n01() * 8 * kk;
    // 기울기 — 지금 판 범위(±0.34H). out이면 바깥 두 줄은 바깥쪽 절반에서: 줄이 하나씩 다시 붙어 위가 벌어지던 지금 판과 달리 세 줄뿐이라 안쪽으로 기울면 폭이 −26%였다(s7)
    const lean = (side * 0.14 + (S.out && i ? side * (0.1 + 0.1 * n01()) : sgn() * 0.2)) * H;
    const crawl = S.grow * F * (0.9 + 0.2 * n01());
    const life = S.life[i] * F * (0.95 + 0.1 * n01());
    // 줄마다 gap F씩 늦게 선다(짧은 줄이 늦게 서서 끝은 같이 모인다 · 첫 줄이 사그라질 때 끝 줄이 다 자란다).
    // 거의 같이(0.6~2.2F) 서면 세 줄이 통째로 겹쳐 정점이 지금 판의 1.4배였다(s3) · 층 깨기는 3F로도 1.3배(s6)
    const start = i === 0 ? 0 : (i * S.gap + n01()) * F;
    later(start, () => climb(arcPts(bx, by, bx + lean, by - H, S.sway * kk), {
      w: S.w * kk, crawl, life, bulge: Math.min(S.bulge, H > 140 ? 3 : H > 60 ? 2 : 1), fork: H * (0.12 + 0.06 * n01()), dot: true, fat: S.fat,
    }, c));
  });
  if (!S.hop) return;
  let [hx, hy] = [x + dir * S.reach * kk * 0.6, y - (S.sky[0] + n01() * (S.sky[1] - S.sky[0]) * 0.5) * kk];
  for (let i = 0; i < S.hop; i++) {
    const t = (S.grow + 1 + i * 3 + n01() * 2) * F; // 지금 판 간격(3F) — 1.5F로 몰면 다섯이 한꺼번에 서서 정점 넓이가 넘쳤다(s1)
    const a = UP + (i % 2 ? -dir : dir) * (0.5 + 0.8 * n01());
    const len = (22 + 16 * n01()) * kk;
    // 층 깨기만 — 아크 끝까지 x ± wide 안으로 당긴다. 시작 자리만 80에 묶으면 끝이 밀려 나가 상자 폭이 지금 판보다 13% 넓었다(s8 · s10)
    const ex = hx + Math.cos(a) * len;
    const sx = 'wide' in S ? hx - Math.max(0, ex - x - S.wide) + Math.max(0, x - S.wide - ex) : hx;
    const sy = hy;
    later(t, () => hop(sx, sy, a, len, S.w * kk * 1.2, c));
    hx = Math.min(x + 80, Math.max(x - 80, sx + Math.cos(a) * len + sgn() * 12 * kk));
    hy = Math.max(y - S.sky[1] * kk, Math.min(y - S.sky[0] * kk * 0.5, sy + Math.sin(a) * len - n01() * 10 * kk));
  }
}

/** 타격 · 층 깨기 · 완파 — volt.ts가 부른다(필살 마무리 bloom은 volt.ts의 옛 surge 그대로) */
export function strike(kind: keyof typeof SIZE, x: number, y: number, k: number, c: string): void {
  surge(x, y, SIZE[kind], kind === 'destroy' ? Math.min(k, 1.4) : k, c);
}
