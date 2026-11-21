// 고압선 대검(전기) 레시피 4판 — 방향표 「고압선」 절(11-21). bladeFx RECIPES가 이어 붙이기만 한다.
// 꼴: 아래서 위로 기어오르는 아크. 매끈하게 휘는 S자 곡선(꺾은선 아님)에 작은 떨림. 실은 가늘고(밑동이 가장 가늘다)
// 마디마다 굵기가 다르다: 가운데 · 위쪽 마디가 3~4배로 부풀고 그 속에 종이색 가는 속줄. 먹 머리 → 노랑 꼬리.
// 꼭대기에서 두 갈래로 갈라지고 짧은 쪽이 먼저 끊긴다. 자료: 야곱의 사다리(strike 15 16 17 · motion B E) · 귀멸 2 · aura 6 7 8.
// 박자: 점화(먹 점) → 기어오름 → 끊김(밑동부터 깎여 위로 떨어져 나간다) → 13~21프레임 뒤 같은 밑동에서 다시 붙음.
// 자리: 친 자리(건물 몸)에서 위로. 완파는 무너지는 건물 높이만큼 큰 아크 셋 + 조각 사이로 튀는 짧은 아크(전류가 번진다).
// 갈림: 번개 대검 = 하늘에서 내리꽂는 곧은 보라 꺾은 줄기 / 이쪽 = 아래서 기어오르는 휜 노랑 아크.
// 그림자 = 땅에서 솟는 촉수(뿌리 굵고 끝 바늘) / 이쪽 = 공중 · 건물 위, 굵기가 마디마다 들쭉날쭉, 깜빡이며 끊긴다.
// 3판(가로 직선 꺾임 쌍줄 · 땅을 미끄러지는 지그재그 띠)은 사용자 반려 「전기는진짜 별로야」로 모두 걷었다.
// 문법(불변 13): 먹 + 포인트 색 하나 · 알파 지우기 금지(모양으로) · shadowBlur · 블룸 · 가운데 동그라미 별 · 원판 + 방사형 띠 · 아이콘 금지.
// ⚠ bladeFx와 순환 import — 최상위에서 bladeFx 값을 부르지 않는다. 시험에서 이 파일을 bladeFx보다 먼저 import하지 않는다.
import { PALETTE, VIEW } from '../../config';
import { bent, later, n01, put, samplePath, scaled, sgn, type Recipe } from '../bladeFx';
import { liteOf, moonPoint, pathLen, swingMoon } from './geom';

const INK = PALETTE.INK;
const PAPER = PALETTE.BG;
const GROUND = VIEW.GROUND_Y;
const UP = -Math.PI / 2;
const F = 1 / 60;
/** 누름 곡선 번호(bladeFx PRESSES) — 0 베기(가운데가 굵다) · 1 튕김(뿌리가 굵다) · 2 먹줄(고르다) · 3 잔상(가늘게 들어가 뒤 3분의 2에서 가장 굵다) */
const P_CUT = 0;
const P_FLICK = 1;
const P_LINE = 2;
const P_SWELL = 3;

/**
 * 사건마다 크기(키우기 전 px · 사건 그림은 scaled 1.6배, 완파는 k 1.25 이상이라 2배 남짓).
 * H = 아크 높이들(줄 수 = 길이) · reach = 밑동이 옆으로 퍼지는 폭 · sway = S자 흔들림 폭 · w = 실 굵기(부푼 마디는 3~4배) ·
 * crawl = 다 오르는 프레임 · re = 다시 붙는 줄 수 · hop = 조각 사이 짧은 아크 수 · sky = 짧은 아크가 튀는 높이 [아래, 위]
 */
const SIZE = {
  hit: { H: [88, 60], reach: 16, sway: 14, w: 1.9, crawl: 7, re: 1, hop: 1, sky: [30, 70] },
  floor: { H: [128, 98, 70], reach: 30, sway: 18, w: 2.2, crawl: 8, re: 1, hop: 3, sky: [25, 95] },
  destroy: { H: [176, 144, 110], reach: 46, sway: 24, w: 2.9, crawl: 9, re: 2, hop: 5, sky: [30, 120] },
} as const;
type Size = (typeof SIZE)[keyof typeof SIZE];

/**
 * 한 줄 아크의 박자 · 굵기 — crawl · life는 초. bulge = 부푼 마디 수(0~3) · fork = 꼭대기 갈래 길이(0 = 없음) · dot = 점화 먹 점 ·
 * lite = 실을 먹 머리 없이 노랑 몸으로(칼 기운 — 먹은 점화 점이 맡는다)
 */
interface Arc { w: number; crawl: number; life: number; vy: number; bulge: number; fork: number; dot: boolean; lite?: boolean }

/**
 * 밑동 (bx, by) → 꼭대기 (tx, ty) S자 아크 점열. sway = 옆 흔들림 폭(위로 갈수록 커진다) · 한쪽으로 휜 몸 ·
 * 그 위에 잘게 떠는 물결(반 물결 5~9번, 폭은 S의 5분의 1 안팎) · 마디마다 작은 떨림. 매끈한 S 하나뿐이면 풀 · 리본으로 읽혔다(4판 1회차)
 */
function arcPts(bx: number, by: number, tx: number, ty: number, sway: number): number[] {
  const [dx, dy] = [tx - bx, ty - by];
  const L = Math.hypot(dx, dy) || 1;
  const [nx, ny] = [-dy / L, dx / L];
  const n = Math.min(28, Math.max(10, Math.round(L / 6)));
  const hops = 1.3 + n01() * 1.6; // S 한 번 ~ 세 번
  const ph = n01() * Math.PI * 2;
  const fine = 5 + n01() * 4;
  const ph2 = n01() * Math.PI * 2;
  const bow = sgn() * sway * 0.5;
  const pts = [bx, by];
  for (let i = 1; i < n; i++) {
    const t = i / (n - 1);
    const env = Math.sin(Math.PI * t) ** 0.6; // 두 끝은 제자리
    const jit = i < n - 1 ? sgn() * (0.5 + L * 0.008) : 0;
    const off = (sway * (0.45 + 0.9 * t) * Math.sin(Math.PI * hops * t + ph) + bow + sway * 0.22 * Math.sin(Math.PI * fine * t + ph2)) * env + jit;
    pts.push(bx + dx * t + nx * off, by + dy * t + ny * off);
  }
  return pts;
}

/** 꼭대기 두 갈래 — 끝 방향에서 양쪽으로 어긋나게 벌어지고(길이 · 각 제각각) 짧은 쪽이 먼저 끊긴다. 땅 밑으로는 안 간다 */
function fork(pts: readonly number[], len: number, w: number, life: number, c: string, vy: number): void {
  const m = pts.length;
  const [x, y] = [pts[m - 2], pts[m - 1]];
  const a0 = Math.atan2(y - pts[m - 3], x - pts[m - 4]);
  const a = Math.sin(a0) > 0.2 ? -a0 : a0; // 아래로 가던 끝(칼 기운 · 칼끝)도 갈래는 위로 튄다
  const s = sgn() > 0 ? 1 : -1;
  const arms = [[0.2 + 0.3 * n01(), 1], [-(0.5 + 0.35 * n01()), 0.4 + 0.25 * n01()]] as const;
  arms.forEach(([da, f], i) => {
    const b = a + s * da;
    const l = len * f;
    const bend = sgn() * l * 0.2;
    const [ca, sa] = [Math.cos(b), Math.sin(b)];
    const q = [x, y, x + ca * l * 0.5 - sa * bend, y + sa * l * 0.5 + ca * bend, x + ca * l, y + sa * l];
    for (let j = 3; j < q.length; j += 2) q[j] = Math.min(GROUND - 4, q[j]);
    bent(q, w * (i ? 0.8 : 1.3), i ? '' : PAPER, { body: liteOf(c), life: life * (i ? 0.5 : 1), dry: 0.3, pr: P_FLICK, gr: 0.25, hold: 0.5, vy });
  });
}

/**
 * 아크 한 줄 — 밑동 먹 점(점화) → 실이 crawl초에 걸쳐 밑동에서 꼭대기로 그어지고(먹 머리 → 노랑 꼬리) →
 * 머리가 지나가는 자리마다 마디가 부풀고(노랑 몸에 종이색 속줄) → 꼭대기에서 두 갈래 → 밑동부터 깎여 끊긴다
 */
function climb(pts: number[], o: Arc, c: string): void {
  const n = pts.length / 2;
  if (o.dot) put('spat', pts[0], pts[1], { life: 0.08, size: o.w * 1.4, rot: UP, v: 2, c1: INK });
  // 실 — 고른 가는 선(밑동부터 보인다). 오름 누름(밑이 0)은 밑동이 사라져 떠 있는 조각으로 읽혔다(1회차).
  // 아래 절반 = 먹 머리 → 노랑 · 위 절반 = 노랑 → 밝은 짝. 한 획으로 그으면 아래 절반이 먹이라 검은 벌레로 읽혔고(그림자 촉수와 가까워진다),
  // 3할만 먹이면 흑백에서 너무 옅었다(4회차 시안 셋)
  const head = o.lite ? 0 : Math.max(2, Math.round((n - 1) * 0.5));
  const line = (from: number, to: number, body: string): void => {
    const t0 = (from / (n - 1)) * o.crawl;
    const life = o.life - t0;
    later(t0, () => bent(pts.slice(from * 2, to * 2 + 2), o.w, '', {
      body, life, dry: 0.12, pr: P_LINE, gr: Math.min(0.6, Math.max(0.05, (o.crawl * (to - from)) / (n - 1) / life)), vy: o.vy,
    }));
  };
  if (head) line(0, head, c);
  if (head < n - 1) line(head, n - 1, liteOf(c));
  // 부푼 마디 — 밑동 틈(1.5할)을 비우고 그 위로 길게(실의 2~4할씩) o.bulge곳, 사이는 가는 목. 위로 갈수록 굵다. 노랑 몸 속에 종이색 줄.
  // 짧은 마디는 끝이 뾰족한 렌즈라 속줄과 겹쳐 덩굴에 달린 풀 조각으로 읽혔다(6회차) — 길게 늘여 S를 따라 휘는 관으로.
  // 밝은 짝 몸은 종이 위에서 옅었다(8회차 · 흑백에서 거의 사라짐) — 시그니처 색 붓으로: 가는 먹 목 → 짙은 올리브 → 굵은 노랑(속 종이색) → 밝은 끝.
  // 잔상 누름이라 먹은 바늘처럼 가는 들머리에만 묻는다(굵은 데 먹이 앉으면 올챙이)
  for (let j = 0, at = 0.15 + 0.1 * n01(); j < o.bulge && at < 0.8; j++) {
    const i0 = Math.round(at * (n - 1));
    at += 0.22 + 0.16 * n01();
    const i1 = Math.min(n - 1, Math.round(at * (n - 1)));
    at += 0.05 + 0.1 * n01();
    if (i1 - i0 < 2) continue;
    const t0 = (i0 / (n - 1)) * o.crawl;
    const life = Math.max(0.1, (o.life - t0) * 0.92);
    later(t0, () => bent(pts.slice(i0 * 2, i1 * 2 + 2), o.w * (2.4 + 0.8 * (j / Math.max(1, o.bulge - 1)) + 0.4 * n01()), PAPER, {
      body: c, life, dry: 0.15, pr: P_SWELL, hold: 0.7, vy: o.vy,
      gr: Math.min(0.4, Math.max(0.05, (o.crawl * (i1 - i0)) / (n - 1) / life)),
    }));
  }
  if (o.fork) later(o.crawl, () => fork(pts, o.fork, Math.max(1.2, o.w * 1.1), o.life * 0.55, c, o.vy));
}

/**
 * 조각 사이로 튀는 짧은 아크 — 한 점에서 옆 조각으로 잘게 떨며 휘어 건너뛴다(고른 가는 노랑 실 하나).
 * 먹 머리를 주면 짧은 획이 거의 먹 덩이라 올챙이로 읽혔고(4회차), 베기 누름으로 굵게 그으면 짧은 렌즈라 풀 조각으로 읽혔다(7회차) —
 * 밝은 짝 획(먹 없이 노랑 → 밝은 짝) · 고른 누름으로. 가는 실 하나는 종이 위에서 옅어(8회차) 조금 굵히고 종이색 속줄을 넣는다
 */
function hop(x: number, y: number, a: number, len: number, w: number, c: string, vy = -14): void {
  const [ex, ey] = [x + Math.cos(a) * len, Math.min(GROUND - 4, y + Math.sin(a) * len)];
  bent(arcPts(x, y, ex, ey, len * 0.45), w * 1.4, PAPER, { body: liteOf(c), life: 0.16 + 0.08 * n01(), dry: 0.2, pr: P_LINE, gr: 0.3, hold: 0.6, vy });
}

/**
 * 한 사건 — 아크 여러 줄이 어긋난 박자로 오르고(빠른 줄 · 느린 줄, 밑동은 친 자리 둘레 좌우 엇갈림) →
 * 앞 몇 줄은 13~21프레임 뒤 같은 밑동에서 다시 붙고 → 위쪽 공중에서 짧은 아크가 조각에서 조각으로 이어 튄다
 */
function surge(x: number, y: number, S: Size, k: number, c: string): void {
  const dir = sgn() > 0 ? 1 : -1;
  const kk = Math.min(k, 2);
  S.H.forEach((h0, i) => {
    const H = h0 * kk * (0.88 + 0.24 * n01());
    const side = i % 2 ? -dir : dir;
    // 첫 줄은 친 자리 가까이, 다음 줄은 반대쪽, 셋째는 첫 줄 쪽 멀리 — 좌우 대칭이 안 되게
    const bx = x + side * S.reach * kk * (i === 0 ? 0.1 + 0.3 * n01() : 0.55 + 0.45 * n01() + (i > 1 ? 0.35 : 0));
    const by = y - n01() * 8 * kk;
    const lean = (side * 0.14 + sgn() * 0.2) * H;
    const crawl = S.crawl * F * (i === 0 ? 0.75 : 0.95 + 0.5 * n01());
    const start = i === 0 ? 0 : (i + n01() * 2) * F; // 거의 같이 선다 — 한 줄씩 차례로 서면 한 순간엔 한 줄뿐이라 성겼다(2회차)
    const one = (h: number, dx: number, dot: boolean): void => climb(arcPts(bx + dx, by, bx + dx + lean * (h / H), by - h, S.sway * kk), {
      w: S.w * kk, crawl, life: crawl * (2.3 + 0.4 * n01()), vy: -18, bulge: h > 140 ? 3 : h > 60 ? 2 : 1, fork: h * (0.12 + 0.06 * n01()), dot,
    }, c);
    later(start, () => one(H, 0, true));
    if (i < S.re) later(start + (13 + n01() * 8) * F, () => one(H * (0.65 + 0.3 * n01()), sgn() * 5 * kk, true));
  });
  // 조각 사이 — 위쪽 공중에서 시작해 이어 튄다(앞 아크 끝에서 조금 떨어진 자리에서 다음 아크가 붙는다)
  if (!S.hop) return;
  let [hx, hy] = [x + dir * S.reach * kk * 0.6, y - (S.sky[0] + n01() * (S.sky[1] - S.sky[0]) * 0.5) * kk];
  for (let i = 0; i < S.hop; i++) {
    const t = (S.crawl + 2 + i * 3 + n01() * 2) * F;
    const [sx, sy] = [hx, hy];
    const a = UP + (i % 2 ? -dir : dir) * (0.5 + 0.8 * n01());
    const len = (22 + 16 * n01()) * kk;
    later(t, () => hop(sx, sy, a, len, S.w * kk * 1.2, c));
    // 다음 자리 — 이 아크 끝에서 옆으로 12 안팎 비켜서. 화면 밖(키운 뒤 폭 360)으로 나가지 않게 가로를 묶는다
    hx = Math.min(x + 80, Math.max(x - 80, sx + Math.cos(a) * len + sgn() * 12 * kk));
    hy = Math.max(y - S.sky[1] * kk, Math.min(y - S.sky[0] * kk * 0.5, sy + Math.sin(a) * len - n01() * 10 * kk));
  }
}

export const volt: Recipe = {
  trail: { w: 10, dry: 0.3 },
  own: true,
  // 칼길 — 칼이 지나간 호를 따라 아크 한 줄이 꼬리에서 칼끝으로 기어간다(호 둘레로 S자 흔들림 · 마디가 부푼다) → 칼끝에서 두 갈래
  swing(fx, fy, w, life, c, turn, grow) {
    const m = swingMoon(fx, fy, turn, grow);
    const hops = 1.6 + 1.4 * n01();
    const ph = n01() * Math.PI * 2;
    const amp = w * 0.55;
    const pts: number[] = [];
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      const [x, y, , o] = moonPoint(m, 0.1 + 0.9 * t);
      const off = amp * (0.35 + 0.65 * t) * Math.sin(Math.PI * hops * t + ph) + (i && i < 13 ? sgn() * 0.8 : 0);
      pts.push(x + Math.cos(o) * off, y + Math.sin(o) * off);
    }
    climb(pts, { w: Math.max(1.4, w * 0.2), crawl: life * 0.3, life, vy: 0, bulge: 2, fork: w * 1.3, dot: true }, c);
  },
  hit(x, y, k, c) {
    surge(x, y, SIZE.hit, k, c);
  },
  floor(x, y, k, c) {
    surge(x, y, SIZE.floor, k, c);
  },
  destroy(x, y, k, c) {
    surge(x, y, SIZE.destroy, Math.min(k, 1.4), c);
  },
  // 헛스윙 — 칼끝 자리에서 작은 아크 하나가 위로 기어올라 두 갈래로 끊긴다
  whiff(x, y, c) {
    const H = 26 + 8 * n01();
    climb(arcPts(x, y, x + sgn() * 8, y - H, 6), { w: 1.6, crawl: 5 * F, life: 0.2, vy: -20, bulge: 1, fork: 7, dot: true }, c);
  },
  // 칼 기운 — 칼날을 막대 삼아 고리 아크가 손잡이 쪽에서 칼끝으로 건너뛰며 기어간다(자료 aura 8 막대 위 반고리 · 귀멸 aura 6 칼 몸 둘레).
  // 고리마다 날에서 떠나 10~16px 바깥으로 휘었다 조금 앞 날로 돌아온다(가운데가 굵고 두 끝은 날에 붙어 가늘다). 거의 위쪽 한편으로 쏠리고
  // 가끔 하나만 아래로 감는다. 고리는 시그니처 색 붓이라 먹 머리가 검은 날 위에서 떠나 짙은 올리브 → 노랑으로 종이에 나온다.
  // 마지막 고리 끝(칼끝)에서 두 갈래로 끊긴다. 부르는 틈 0.24초 + 0~5프레임 · 사는 0.3초 남짓이라 고리가 늘 두셋 떠 있다.
  // 8회차 = 날 위쪽 가는 실 하나(칼끝 노랑 몇 가닥으로만 보였다) · 9회차 = 날을 넘나드는 굵은 실 + 부푼 마디(짧은 날 위에서 노랑 얼룩으로 읽혔다)
  aura(b, _n, c) {
    const [hx, hy, tx, ty] = b;
    const L = Math.hypot(tx - hx, ty - hy) || 1;
    const [ux, uy] = [(tx - hx) / L, (ty - hy) / L];
    const [nx, ny] = ux > 0 ? [uy, -ux] : [-uy, ux]; // 칼날의 위쪽 법선
    const on = (u: number): [number, number] => [hx + ux * L * u, hy + uy * L * u];
    const t0 = n01() * 5 * F;
    put('spat', hx + ux * L * 0.08, hy + uy * L * 0.08, { life: 0.07, size: 2.6, rot: Math.atan2(ny, nx), v: 2, c1: INK }); // 점화
    // 날 위 실 — 검은 날 위를 손잡이에서 칼끝으로 기는 가는 노랑(날이 전기를 머금었다). 종이 위 노랑보다 검은 날 위 노랑이 또렷하다
    const run: number[] = [];
    for (let i = 0; i < 8; i++) {
      const [x, y] = on(0.1 + 0.85 * (i / 7));
      const o = i && i < 7 ? sgn() * 1.6 : 0;
      run.push(x + nx * o, y + ny * o);
    }
    later(t0, () => bent(run, 1.5, '', { body: liteOf(c), life: 0.26, dry: 0.1, pr: P_LINE, gr: 0.5 }));
    const flip = Math.floor(n01() * 4); // 0~2 = 그 고리 하나만 아래로 감는다 · 3 = 모두 위
    let u0 = 0.04 + 0.08 * n01();
    for (let j = 0; j < 3; j++) {
      const u1 = Math.min(1.06, u0 + 0.28 + 0.16 * n01());
      const R = (15 + 8 * n01()) * (j === flip ? -0.7 : 1);
      const lean = (0.1 + 0.25 * n01()) * L; // 고리 꼭대기가 칼끝 쪽으로 쏠린다
      const [ax, ay] = on(u0);
      const [bx, by] = on(u1);
      const pts: number[] = [];
      // 매끈한 반달이면 리본 · 초승달로 읽혔다(9회차) — 마디마다 1.5px 남짓 떨린다
      for (let i = 0; i < 12; i++) {
        const t = i / 11;
        const h = R * Math.sin(Math.PI * t) ** 0.8 + (i && i < 11 ? sgn() * 1.6 : 0);
        const f = lean * Math.sin(Math.PI * t) * 0.4 + (i && i < 11 ? sgn() * 1.2 : 0);
        pts.push(ax + (bx - ax) * t + nx * h + ux * f, Math.min(GROUND - 4, ay + (by - ay) * t + ny * h + uy * f));
      }
      const last = j === 2;
      later(t0 + (j * 3 + n01() * 2) * F, () => {
        bent(pts, 3.4 + 1.1 * n01(), PAPER, { body: c, life: 0.26 + 0.08 * n01(), dry: 0.15, pr: P_CUT, gr: 0.3, hold: 0.55, vy: -8 });
        if (last) later(4 * F, () => fork(pts, 18 + 8 * n01(), 2.4, 0.22, c, -8));
      });
      u0 = u1 - 0.04 - 0.06 * n01(); // 다음 고리는 이 고리 발 조금 뒤에서 붙는다
    }
  },
  every: 0.24,
  tint: true,
  waza: {
    // 필살 큰 획을 따라 — 획 옆(위쪽)에 붙어 아크가 마디마다 건너뛰며 기어간다(둘에 하나 마디가 부푼다) → 끝에서 두 갈래 → 끝 두 마디가 한 번 더 붙는다(k 1에서 20 안)
    along(pts, k, c, dur) {
      const all = samplePath(pts, 4);
      if (all.length < 2) return;
      const n = Math.min(6, Math.max(3, Math.round(pathLen(pts) / 70)));
      const at = (i: number): (typeof all)[number] => all[Math.round((i * (all.length - 1)) / n)];
      const side = (a: number): [number, number] => {
        const [nx, ny] = [Math.sin(a), -Math.cos(a)];
        return ny > 0 ? [-nx, -ny] : [nx, ny];
      };
      const legs: number[][] = [];
      for (let i = 0; i < n; i++) {
        const [p, q] = [at(i), at(i + 1)];
        const [nx, ny] = side(p.ang);
        const [o0, o1] = [(5 + 6 * n01()) * k, (5 + 6 * n01()) * k];
        const leg = arcPts(p.x + nx * o0, p.y + ny * o0, q.x + nx * o1, q.y + ny * o1, Math.hypot(q.x - p.x, q.y - p.y) * 0.3);
        legs.push(leg);
        const crawl = dur / n;
        later(p.u * dur, () => climb(leg, {
          w: 1.8 * k, crawl, life: crawl * 2.4 + 0.08, vy: -10 * k, bulge: i % 2, fork: i === n - 1 ? 14 * k : 0, dot: i === 0,
        }, c));
      }
      later(dur + 0.14, () => legs.slice(-2).forEach((leg) => climb(leg, { w: 1.5 * k, crawl: 0.06, life: 0.18, vy: -10 * k, bulge: 0, fork: 0, dot: false }, c)));
    },
    // 마무리 — 완파 꼴(큰 아크 셋 + 조각 사이 짧은 아크)을 친 쪽으로 조금 밀어 둔다. 아크는 늘 아래서 위로 오른다
    bloom(x, y, ang, k, c) {
      scaled(x, y, k, () => surge(x + Math.cos(ang) * 12, y + Math.sin(ang) * 12, SIZE.destroy, 1, c));
    },
  },
};
