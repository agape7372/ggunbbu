// 그림자 대검(어둠) 레시피 4판 — 바닥 촉수 무리(자료 1 2 3 4 · 8 · 12 · 띠 A, DIRECTIONS 4판). bladeFx RECIPES가 이어 붙이기만 한다.
// 꼴: 땅에 낮게 번지는 먹 웅덩이(왼쪽으로 길고 오른쪽은 짧다 — 오른쪽 아래 콤보 도장 자리) → 웅덩이에서 가늘고 긴 먹 촉수가
// 키 · 기울기 제각각으로 솟아 한쪽으로 쏠려 휜다. 뿌리가 굵고 끝은 바늘, 끝 둘레에서 2~3갈래로 갈라진다. 뒤 굵게 · 앞 가늘게 겹.
// 완파엔 한 가닥이 바닥을 가로로 길게 쓸고 지나간다(순수한 그릇). 둘레에 크기 제각각 먹 점 · 찢긴 먹 조각이 늦게 천천히 위로.
// 박자: 앞 가닥부터 어긋나게 4프레임에 솟고 → 뿌리부터 풀려 위로 흩어진다(굵은 뒤 가닥이 길게 남는다).
// 보라는 갈래 끝 몇 곳 · 점 몇 개에만. 먹이 9할이다.
// 다른 넷과 갈린다: 불새 = 위로 큰 면 · 해일 = 옆으로 말린 큰 면 · 고압선 = 공중 가는 선 · 고드름 = 각진 덩이.
// 이쪽만 땅에서 솟은 휜 가는 선 다발이다. 서리(곧은 가시 줄) · 번개(하늘에서 꺾인 줄기)와도 — 촉수는 휘고 갈라지며 한쪽으로 쏠린다.
// 문법(불변 13): 먹 + 포인트 색 하나 · 알파 지우기 금지(모양으로) · shadowBlur · 블룸 · 가운데 동그라미 별 · 원판 + 방사형 띠 · 아이콘 금지.
// ⚠ bladeFx와 순환 import — 최상위에서 bladeFx 값을 부르지 않는다. 시험에서 이 파일을 bladeFx보다 먼저 import하지 않는다.
import { PALETTE, VIEW, WEAPON_FX } from '../../config';
import { bent, later, line, n01, put, sgn, type Recipe } from '../bladeFx';
import { follow, moonPoint, moonPts, pathLen, scatter, swingMoon } from './geom';

const TAU = Math.PI * 2;
const INK = PALETTE.INK;
const UP = -Math.PI / 2;
/** 삶 L초인 획이 f프레임 만에 다 그어지는 몫(키운 그림은 삶이 1.2배라 그만큼 나눈다) */
const grIn = (f: number, L: number): number => Math.min(0.5, f / 60 / (L * WEAPON_FX.LIFE));

/**
 * 크기(키우기 전 px — 사건 그림은 scaled 1.6배). 화면 px로 완파 웅덩이 왼쪽 165 · 오른쪽 58, 촉수 키 150까지.
 * L / R = 웅덩이가 쏠린 쪽 · 반대쪽 끝 · th = 웅덩이 두께 · h = 가장 큰 촉수 키 · n = 촉수 수(쏠린 쪽 nl개) ·
 * back = 굵은 뒤 가닥 굵기 · front = 가는 앞 가닥 굵기 · hue = 보라 갈래 수 · dots = 먹 점 · bits = 오르는 조각 ·
 * sweep = 바닥 쓸기 가닥 길이(0 = 없음) · over = 도장 위로 넘어가는 반대쪽 큰 가닥 · life = 촉수가 사는 초
 */
const SIZE = {
  hit: { L: 53, R: 26, th: 8, h: 54, n: 4, nl: 3, back: 3.2, front: 1.8, hue: 1, dots: 3, bits: 1, sweep: 0, over: false, life: 0.62 },
  floor: { L: 70, R: 30, th: 10, h: 72, n: 6, nl: 4, back: 3.6, front: 1.9, hue: 2, dots: 5, bits: 2, sweep: 0, over: false, life: 0.75 },
  destroy: { L: 103, R: 36, th: 12, h: 100, n: 9, nl: 6, back: 4.2, front: 2, hue: 3, dots: 7, bits: 3, sweep: 100, over: true, life: 0.9 },
} as const;
type Size = (typeof SIZE)[keyof typeof SIZE];
/** 친 자리 → 발 높이(키우기 전 거리). scaled 1.6배면 서 있는 졸라맨 발이 된다 */
const FOOT = { hit: 52, floor: 38, destroy: 44 } as const;
/** 몸 둘레 비움(키우기 전) — 촉수 뿌리는 몸 상자(좌우 ±18) 밖 */
const GAP = 14;

/**
 * 촉수 꼴 — (x, y) 뿌리에서 a0 쪽으로 길이 h. turn = 끝으로 갈수록 몰려 휘는 각, wob = S자로 흔들리는 각, ph = 흔들림 자리.
 * 점 n개(뿌리 → 끝). 각은 뿌리에선 a0 그대로이고 끝에 가까울수록 많이 돈다(끝이 늦게 따라와 휜다)
 */
function reed(x: number, y: number, a0: number, h: number, turn: number, wob: number, ph: number, n = 9, hook = 0): number[] {
  const pts = [x, y];
  const st = h / (n - 1);
  for (let i = 1; i < n; i++) {
    const t = (i - 0.5) / (n - 1);
    const a = a0 + turn * t ** 2.6 + hook * t ** 7 + wob * t * Math.sin(ph + t * 5.2);
    x += Math.cos(a) * st;
    y += Math.sin(a) * st;
    pts.push(x, y);
  }
  return pts;
}

/** 촉수 하나 — 뿌리 굵게(누름 flick) 솟아 끝은 바늘. 굵은 뒤 가닥은 뿌리부터 천천히 풀리고, 가는 앞 가닥은 가운데가 불룩(cut) */
function tendril(pts: number[], w: number, body: string, life: number, grow: number, thick: boolean, drift: number): void {
  bent(pts, w, '', { body, pr: thick ? 1 : 0, dry: thick ? 0.18 : 0.32, gr: grIn(grow, life), life, vx: drift, vy: -14 - 10 * n01() });
}

/** 끝 갈래 — 촉수 pts의 f 자리에서 옆으로 갈라져 나가는 가는 가닥(본 가닥이 그 자리를 지난 뒤) */
function fork(pts: number[], f: number, side: number, h: number, w: number, body: string, life: number, drift: number): void {
  const j = Math.max(1, Math.min(pts.length / 2 - 2, Math.round((pts.length / 2 - 1) * f)));
  const [x, y] = [pts[j * 2], pts[j * 2 + 1]];
  const a = Math.atan2(pts[j * 2 + 3] - y, pts[j * 2 + 2] - x) + side * (0.35 + 0.3 * n01());
  bent(reed(x, y, a, h, -side * (0.3 + 0.5 * n01()), 0.2, n01() * TAU, 5), w, '', {
    body, pr: 1, dry: 0.3, gr: grIn(3, life), life, vx: drift, vy: -18,
  });
}

/** 먹 점 — 크기 제각각, 본 가닥보다 늦게 튀어 천천히 오른다. hold면 보라가 마르지 않는다 */
function dot(x: number, y: number, r: number, c: string, vx = sgn() * 16): void {
  put('drop', x, y, {
    vx, vy: -22 - n01() * 34, g: -26, drag: 1.4, life: 0.6 + n01() * 0.45, size: r, c1: c, hold: c === INK ? 0 : 1,
  });
}

/** 먹 조각 — 찢긴 조각이 흔들리며 천천히 오른다(네 귀). 셋에 하나만 보라 */
function flake(x: number, y: number, z: number, c: string, i: number): void {
  put('leaf', x + sgn() * 4 * z, y, {
    vx: sgn() * 14 * z, vy: (-26 - n01() * 26) * z, g: -10 * z, drag: 1.2,
    life: 0.8 + n01() * 0.35, size: (2.4 + n01() * 2.6) * z, rot: n01() * TAU, spin: sgn() * 3,
    c1: i % 3 === 2 ? c : INK, st: 4,
  });
}

/**
 * 촉수 무리 한 벌 — 바탕 (bx, by)(발 높이)에서 ang 쪽(「위」)으로 솟는다. 옆 = ang에 수직, lean = 쏠리는 옆(1 = 옆 +, −1 = 옆 −).
 * z = 크기 배율(사건 그림은 1 — scaled가 키운다), hk = 키 배율. 웅덩이(쏠린 쪽 S.L · 반대쪽 S.R) → 촉수 S.n(앞 가닥부터 어긋나게 4프레임) →
 * 끝 갈래(S.hue개만 보라) → 바닥 쓸기 · 도장 위로 넘는 큰 가닥(완파) → 먹 점 · 조각이 늦게 오른다.
 * ground = false(필살 마무리가 공중) — 웅덩이 · 바닥 쓸기 · 큰 가닥 없이 먹 한 덩이에서 모여 솟는다(공중에 가로 먹 띠가 걸렸다)
 */
function forest(bx: number, by: number, ang: number, S: Size, z: number, hk: number, lean: number, c: string, ground = true): void {
  const [ux, uy] = [Math.cos(ang), Math.sin(ang)];
  const [sx, sy] = [-uy, ux];
  const P = (a: number, b: number): [number, number] => [bx + (sx * a + ux * b) * z, by + (sy * a + uy * b) * z];
  const L = S.life;
  const gap = ground ? GAP : 4;
  const wide = ground ? 1 : 0.45;
  if (ground) {
    // 웅덩이 — 몸 밑 가운데부터 바깥으로 번진다. 쏠린 쪽은 두꺼운 몸 + 더 멀리 스미는 마른 밑장, 반대쪽은 짧게
    const wet = { dry: 0, pr: 4, life: L * 1.15, gr: grIn(5, L * 1.15) } as const;
    line(...P(lean * 4, -S.th * 0.15), ...P(lean * S.L * 0.82, -S.th * 0.1), S.th * z, '', { ...wet, bend: -lean * S.th * 0.35 * z });
    later(2 / 60, () => line(...P(lean * S.L * 0.45, -S.th * 0.05), ...P(lean * S.L, 0), S.th * 0.55 * z, '', { ...wet, dry: 0.35, life: L, gr: grIn(5, L) }));
    line(...P(-lean * 3, -S.th * 0.1), ...P(-lean * S.R, 0), S.th * 0.75 * z, '', { ...wet, bend: lean * S.th * 0.25 * z, gr: grIn(4, L * 1.15) });
    put('spat', ...P(lean * S.L * (0.3 + 0.2 * n01()), 0), { life: L, size: S.th * 0.75 * z, rot: ang, v: 3, c1: INK, gr: 1, hold: 1 });
    later(4 / 60, () => put('spat', ...P(lean * S.L * 0.92, 0), { life: L * 0.85, size: S.th * 0.55 * z, rot: ang + lean * 0.9, v: 4, c1: INK, gr: 1, hold: 1 }));
  } else {
    put('spat', bx, by, { life: L * 0.8, size: S.th * 0.8 * z, rot: ang, v: 4, c1: INK, gr: 1, hold: 1 });
  }
  // 촉수 — 쏠린 쪽 nl개는 넓게 흩어 키가 크고, 반대쪽은 몸 가까이 낮게(도장 자리를 비운다)
  const tips: [number, number][] = [];
  // 솟는 차례 · 보라 갈래를 받을 가닥 — 섞은 차례(앞 hue개가 보라)
  const order = Array.from({ length: S.n }, (_, i) => i);
  for (let i = S.n - 1; i > 0; i--) {
    const j = Math.floor(n01() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const hues = new Set(order.filter((i) => i < S.nl).slice(0, S.hue));
  for (let i = 0; i < S.n; i++) {
    const far = i < S.nl;
    const s = far ? lean : -lean;
    const span = (far ? S.L * 0.9 - GAP : S.R * 0.45) * wide;
    const u = far ? (i + 0.15 + 0.7 * n01()) / S.nl : (i - S.nl + 0.2 + 0.6 * n01()) / Math.max(1, S.n - S.nl);
    const d = gap + (far ? 0 : 4) + span * u;
    const thick = far ? i % 2 === 0 : false;
    // 키 — 안쪽이 크고 바깥은 작게 + 제각각. 반대쪽은 절반 아래
    const h = S.h * hk * (far ? Math.min(1.05, Math.max(0.28, 1.05 - 0.6 * u + 0.3 * sgn())) : 0.3 + 0.2 * n01());
    // 처음엔 바깥으로 살짝 기울었다가 끝으로 갈수록 쏠린 쪽으로 휜다(반대쪽 가닥도 위에서 되돌아 쏠린다).
    // 쏠린 쪽 가장 바깥 둘은 거꾸로 안쪽으로 휘어 안 가닥과 엇갈린다(풀처럼 나란히 눕지 않게). 둘에 하나는 끝이 갈고리로 말린다
    const cross = far && i >= S.nl - 2 && i % 2 === 1;
    // 몸 가까운 반대쪽 가닥은 거의 곧게 — 처음부터 쏠린 쪽으로 아주 살짝, 갈고리 없음. 뿌리보다 바깥(도장 쪽)으로 나가지 않는다
    const a0 = ang + (cross ? s * (0.35 + 0.3 * n01()) : far ? s * (0.08 + 0.22 * n01()) : lean * (0.02 + 0.06 * n01()));
    const turn = cross ? -lean * (0.9 + 0.5 * n01()) : lean * (far ? 0.2 + 1.5 * n01() : 0.1 + 0.2 * n01());
    const hook = far && n01() < 0.55 ? (sgn() > -0.3 ? 1 : -1) * Math.sign(turn) * (1.4 + 1.2 * n01()) : 0;
    const [rx, ry] = P(s * d, 0);
    const pts = reed(rx, ry, a0, h * z, turn, far ? (thick ? 0.35 : 0.6) + 0.45 * n01() : 0.12, n01() * TAU, 12, hook);
    const life = L * (thick ? 1.1 + 0.15 * n01() : 0.78 + 0.12 * n01());
    const w = (thick ? S.back : S.front) * (0.85 + 0.3 * n01()) * z;
    const t0 = ((order.indexOf(i) / S.n) * 0.5 + 0.5 * n01()) * (4 / 60);
    const grow = 3 + n01() * 1.5;
    const drift = far ? s * (3 + 5 * n01()) * z : 0; // 풀리며 바깥으로만 미끄러진다(몸 상자 · 도장 쪽으로 가지 않게)
    later(t0, () => tendril(pts, w, INK, life, grow, thick, drift));
    // 끝 갈래 — 쏠린 쪽 가닥에만 한두 개(가닥마다 자리 · 쪽이 다르다). 보라는 hue개 가닥의 갈래에만.
    // 반대쪽 낮은 가닥은 몸과 도장 사이 좁은 틈이라 갈래를 내지 않는다(어느 쪽으로 갈라도 몸 · 도장에 닿았다)
    const nf = !far ? 0 : Math.max(hues.has(i) ? 1 : 0, h > S.h * 0.45 ? 1 + (n01() < 0.4 ? 1 : 0) : n01() < 0.5 ? 1 : 0);
    for (let f = 0; f < nf; f++) {
      const sd = f ? -1 : sgn() > 0 ? 1 : -1;
      later(t0 + (grow * 0.75 + 1 + f) / 60, () => fork(pts, 0.6 + 0.15 * n01(), sd, h * z * (0.25 + 0.15 * n01()), w * 0.45, hues.has(i) && f === 0 ? c : INK, life * 0.75, drift));
    }
    if (far) tips.push([pts[pts.length - 2], pts[pts.length - 1]]); // 점 · 조각은 쏠린 쪽 끝에서만(몸 가까운 낮은 가닥 끝은 몸 상자 · 도장 곁이다)
  }
  // 도장 위로 넘는 큰 가닥(완파) — 반대쪽 몸 가까이에서 곧게 솟아 도장 높이를 넘은 뒤에야 바깥으로 휜다
  if (S.over && ground) {
    const [rx, ry] = P(-lean * (GAP + 6), 0);
    const h = S.h * hk * (0.9 + 0.1 * n01());
    const pts = reed(rx, ry, ang + lean * 0.04, h * z, -lean * 1.25, 0.15, n01() * TAU, 10);
    later(1 / 60, () => tendril(pts, S.back * z, INK, L * 1.2, 5, true, lean * 4 * z));
    later(7 / 60, () => fork(pts, 0.78, lean, h * z * 0.3, S.back * 0.4 * z, c, L * 0.9, lean * 4 * z));
    tips.push([pts[pts.length - 2], pts[pts.length - 1]]);
  }
  // 바닥 쓸기(완파) — 한 가닥이 웅덩이 위로 낮게 떠 쏠린 쪽으로 길게 쓸고 가다 끝이 말려 들린다(웅덩이에 묻히지 않게 조금 띄운다)
  if (S.sweep && ground) {
    const [rx, ry] = P(lean * (GAP + 2), 3);
    const pts = reed(rx, ry, ang + lean * (Math.PI / 2 - 0.08), S.sweep * z, -lean * 0.2, 0.18, n01() * TAU, 12, -lean * 1.8);
    later(2 / 60, () => bent(pts, S.front * 1.6 * z, '', { pr: 1, dry: 0.25, gr: grIn(7, L), life: L, vy: -6 }));
    later(9 / 60, () => fork(pts, 0.85, -lean, S.sweep * z * 0.16, S.front * 0.6 * z, INK, L * 0.7, 0));
  }
  // 먹 점 — 반은 촉수 끝 둘레(늦게), 반은 무리 둘레에 흩어진다. 보라는 셋에 하나
  scatter(4 / 60, S.dots, (i) => {
    const near = i % 2 === 0 && tips.length;
    const [tx, ty] = near ? tips[Math.floor(n01() * tips.length)] : P(lean * (gap + 6 + n01() * (S.L - GAP - 6) * wide), S.h * hk * (0.25 + 0.7 * n01()));
    let x = tx + sgn() * 8 * z;
    const out = Math.sign(x - bx) || lean;
    // 땅 무리면 몸 상자(키우기 전 ±11 · 발 위 38) 둘레에 든 점은 몸 밖으로 밀어 낸다. 옆으로는 바깥으로만 난다
    if (ground && Math.abs(x - bx) < 16 * z && by - ty < 44 * z) x = bx + out * 16 * z;
    dot(x, ty + sgn() * 8 * z, (1 + n01() * n01() * 3) * z, i % 3 === 1 ? c : INK, out * (4 + 12 * n01()));
  }, 8);
  scatter(8 / 60, S.bits, (i) => {
    const [tx, ty] = tips[Math.floor(n01() * tips.length)];
    flake(tx, ty, z, c, i);
  });
}

/** 사건 그림 키 배율 — 콤보 단이 오르면 키만 조금 자란다(폭은 화면 · 도장 자리 때문에 그대로) */
const tall = (k: number): number => Math.min(1.35, 0.8 + 0.2 * k);

export const shade: Recipe = {
  trail: { w: 12, dry: 0.3 },
  own: true,
  // 칼길 — 칼이 지나간 호를 한 번에 문지른 마른 먹(칼끝 쪽이 굵다) + 꼬리 쪽에서 바깥으로 벗겨져 나가는 가는 촉수 둘(하나만 끝이 보라)
  swing(fx, fy, w, life, c, turn, grow) {
    const m = swingMoon(fx, fy, turn, grow);
    const p = moonPts(m, 7).map((q) => q + sgn() * 1.5);
    bent(p, w * 1.05, '', { pr: 3, dry: 0.55, gr: 0.3, life });
    for (let i = 0; i < 2; i++) {
      const [x, y, dir, out] = moonPoint(m, 0.18 + 0.3 * i + 0.1 * n01());
      const h = w * (2 + 1.2 * n01());
      const side = Math.sign(Math.sin(out - dir)) || 1;
      later((1 + i) / 60, () => bent(reed(x, y, out - side * 0.3, h, side * 1.1, 0.3, n01() * TAU, 6), w * 0.36, '', {
        body: i ? c : INK, pr: 1, dry: 0.35, gr: 0.3, life: life * 1.1, vy: -16,
      }));
    }
  },
  hit(x, y, k, c) {
    forest(x, y + FOOT.hit, UP, SIZE.hit, 1, tall(k), -1, c);
  },
  floor(x, y, k, c) {
    forest(x, y + FOOT.floor, UP, SIZE.floor, 1, tall(k), -1, c);
  },
  destroy(x, y, k, c) {
    forest(x, y + FOOT.destroy, UP, SIZE.destroy, 1, tall(k), -1, c);
  },
  // 헛스윙 — 칼끝 자리에서 가는 촉수 둘이 서로 다른 쪽으로 말려 오르고 점 둘(웅덩이 없음)
  whiff(x, y, c) {
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1;
      const h = 14 + 8 * n01();
      later(i / 60, () => bent(reed(x + s * 3, y, UP + s * (0.3 + 0.3 * n01()), h, s * 1.2, 0.3, n01() * TAU, 6), 2.4, '', {
        body: i ? c : INK, pr: 1, dry: 0.3, gr: 0.25, life: 0.38, vy: -18,
      }));
    }
    later(3 / 60, () => dot(x + sgn() * 6, y - 8, 1.4, INK));
  },
  // 칼 기운 — 손잡이에서 가는 먹 촉수가 칼날을 감으며 칼끝 쪽으로 오르다 풀린다(둘에 하나). 사이사이 먹 점이 천천히 위로
  aura(b, n, c) {
    const [hx, hy, tx, ty] = b;
    const len = Math.hypot(tx - hx, ty - hy) || 1;
    const [ex, ey] = [(tx - hx) / len, (ty - hy) / len];
    if (n % 2 === 0) {
      const v1 = 0.55 + 0.4 * n01();
      const turns = 1.1 + 0.6 * n01();
      const amp = 5 + 3 * n01();
      const ph = n01() * TAU;
      const pts: number[] = [];
      for (let i = 0; i < 8; i++) {
        const v = (i / 7) * v1;
        const o = amp * Math.sin(ph + v * turns * TAU) * (1 - 0.35 * v);
        pts.push(hx + ex * len * v - ey * o, hy + ey * len * v + ex * o);
      }
      const out = Math.sin(ph) >= 0 ? 1 : -1;
      bent(pts, 3, '', { body: n % 6 === 4 ? c : INK, pr: 0, dry: 0.4, gr: 0.35, life: 0.45, vx: -ey * out * 12, vy: -14 });
    } else {
      const u = 0.2 + 0.7 * n01();
      dot(hx + ex * len * u + sgn() * 4, hy + ey * len * u + sgn() * 3, 1 + n01() * 1.3, n % 6 === 3 ? c : INK);
    }
  },
  every: 0.09,
  tint: true,
  waza: {
    // 필살 큰 획을 따라 — 획 아래쪽에서 촉수가 차례로 솟아 획을 넘어 휜다(둘에 하나 갈래) → 끝에 먹 점이 늦게 오른다. k 1에서 즉시 + later ≤ 24
    along(pts, k, c, dur) {
      const n = Math.min(6, Math.max(2, Math.round(pathLen(pts) / 80)));
      const lean = sgn() > 0 ? 1 : -1;
      follow(pts, 0, dur, n, (x, y, ang, _u, i) => {
        // 획의 법선 중 위쪽(세로 획이면 쏠린 쪽)
        let up = ang - Math.PI / 2;
        if (Math.sin(up) > 0 || (Math.abs(Math.sin(up)) < 0.3 && Math.cos(up) * lean < 0)) up += Math.PI;
        const [ox, oy] = [Math.cos(up), Math.sin(up)];
        const h = (26 + 16 * n01()) * k;
        const rp = reed(x - ox * 9 * k, y - oy * 9 * k, up + lean * (0.1 + 0.2 * n01()), h, lean * (0.6 + 0.6 * n01()), 0.3, n01() * TAU, 7);
        tendril(rp, (2.6 + 1.6 * n01()) * k, INK, 0.5, 4, i % 2 === 0, -lean * 5);
        if (i % 2) later(4 / 60, () => fork(rp, 0.7, lean, h * 0.32, 1.3 * k, i % 4 === 1 ? c : INK, 0.4, 0));
      });
      follow(pts, dur * 0.5 + 0.08, dur * 0.5, Math.min(5, n), (x, y, _a, _u, i) => dot(x + sgn() * 10 * k, y - 12 * k, (0.9 + 1.4 * n01()) * k, i % 3 === 1 ? c : INK));
    },
    // 마무리 — 완파 꼴을 친 방향 ang 쪽으로(그 자리가 바탕 — 땅이면 웅덩이, 옆이면 옆으로 솟는 무리)
    bloom(x, y, ang, k, c) {
      const ground = Math.sin(ang) < -0.7 && y > VIEW.GROUND_Y - 40; // 땅에서 위로 칠 때만 웅덩이
      forest(x, y, ang, SIZE.destroy, k * (ground ? 1.15 : 0.8), 1, sgn() > 0 ? 1 : -1, c, ground);
    },
  },
};
