// 그림자 대검(어둠) 레시피 5판 — 바닥 촉수 무리(자료 1 2 할로우 나이트 순수한 그릇 촉수 · 3 급강하 어둠 가시 · 8, DIRECTIONS 그림자 절).
// bladeFx RECIPES가 이어 붙이기만 한다.
// 꼴: 땅에 낮게 번지는 먹 웅덩이(화면 폭 9할 남짓 — 오른쪽 아래 콤보 도장 밑으로는 가는 마른 획만 지난다) → 웅덩이에서
// 휘고 꼬인 촉수가 솟는다. 가닥마다 S자로 두 번 굽고 끝이 갈고리로 말리며, 기울기가 양쪽으로 제각각이라 몇은 서로 엇갈린다.
// 뿌리는 굵게 눌러 대고(4판의 두 배) 끝은 바늘. 키 큰 가닥 몇은 끝 둘레에서 한 갈래 더 갈라진다.
// 완파엔 한 가닥이 바닥 위를 가로로 길게 쓸고 가다 끝이 말려 들린다(순수한 그릇). 둘레에 크기 제각각 먹 점 · 찢긴 먹 조각이 늦게 천천히 위로.
// 색: 다른 전설과 같은 규칙 — 가닥마다 먹 뿌리 → 짙은 보라 → 보라 꼬리 → 밝은 짝 끝(legendTone). 웅덩이는 먹. 갈래 · 점 몇 곳만 밝은 짝.
// 박자: 앞 가닥부터 어긋나게 4프레임에 솟고 → 뿌리부터 풀려 위로 흩어진다(굵은 가닥이 길게 남는다).
// 다른 넷과 갈린다: 불새 = 위로 큰 면 · 해일 = 옆으로 말린 큰 면 · 고압선 = 공중 가는 선 · 고드름 = 각진 덩이.
// 이쪽만 땅에서 솟은 휜 선 다발이다. 서리(곧은 가시 줄) · 번개(하늘에서 꺾인 줄기)와도 — 촉수는 S자로 굽고 끝이 말린다.
// 문법(불변 13): 알파 지우기 금지(모양으로) · shadowBlur · 블룸 · 가운데 동그라미 별 · 원판 + 방사형 띠 · 아이콘 금지.
// ⚠ bladeFx와 순환 import — 최상위에서 bladeFx 값을 부르지 않는다. 시험에서 이 파일을 bladeFx보다 먼저 import하지 않는다.
import { PALETTE, VIEW, WEAPON_FX } from '../../config';
import { bent, later, line, n01, put, sgn, type Recipe } from '../bladeFx';
import { follow, liteOf, moonPoint, moonPts, pathLen, scatter, swingMoon } from './geom';

const TAU = Math.PI * 2;
const INK = PALETTE.INK;
const UP = -Math.PI / 2;
/** 삶 L초인 획이 f프레임 만에 다 그어지는 몫(키운 그림은 삶이 1.2배라 그만큼 나눈다) */
const grIn = (f: number, L: number): number => Math.min(0.5, f / 60 / (L * WEAPON_FX.LIFE));

/** 촉수 자리 — [옆 자리(키우기 전, − = 왼쪽), 키 몫, 기울기(+ = 오른쪽), 굵기(1 굵은 · 0 가는), 갈고리 쪽(+1 시계 · −1 반시계 · 0 아무 쪽)] */
type Slot = readonly [number, number, number, number, number];
// 간격 · 키 · 기울기를 다 다르게 — 옆 가닥끼리 서로 쪽으로 기울어 엇갈린다(왼쪽 둘째 · 셋째, 넷째 · 다섯째).
// 오른쪽 몸 곁 가닥은 곧게 솟아 도장 높이를 넘은 뒤 오른쪽으로 말리고, 도장 너머 맨 오른쪽 가닥은 곧게 솟다 왼쪽으로 말린다
const HIT: readonly Slot[] = [[-19, 1, 0.1, 1, 0], [-44, 0.64, -0.36, 1, 0], [19, 0.86, 0.02, 1, 0], [-64, 0.44, 0.34, 0, 0]];
const FLOOR: readonly Slot[] = [[-19, 0.95, 0.1, 1, 0], [-37, 0.56, -0.4, 0, 0], [-55, 0.84, 0.3, 1, 0], [-71, 0.42, -0.18, 0, 0], [19, 0.9, 0, 1, 0], [30, 0.36, -0.1, 0, 0]];
const DESTROY: readonly Slot[] = [
  [-19, 1, 0.06, 1, 0], [-33, 0.6, -0.42, 0, 0], [-52, 0.88, 0.32, 1, 0], [-66, 0.46, -0.16, 0, 0],
  [-91, 0.74, 0.4, 1, 0], [-105, 0.34, -0.3, 0, 0], [19, 0.94, 0.02, 1, 1], [31, 0.5, -0.14, 0, -1], [106, 0.8, -0.05, 0, -1],
];

/**
 * 크기(키우기 전 px — 사건 그림은 scaled 1.6배). 화면 px로 완파 웅덩이 양쪽 173 · 촉수 키 170까지.
 * L / R = 웅덩이 왼쪽 · 오른쪽 끝 · th = 웅덩이 두께 · h = 가장 큰 촉수 키 · back / front = 굵은 · 가는 가닥 뿌리 굵기 ·
 * dots = 먹 점 · bits = 오르는 조각 · sweep = 바닥 쓸기 가닥 길이(0 = 없음) · life = 촉수가 사는 초 · slots = 촉수 자리
 */
const SIZE = {
  hit: { L: 50, R: 28, th: 8, h: 62, back: 7.6, front: 5.2, dots: 4, bits: 1, sweep: 0, life: 0.66, slots: HIT },
  floor: { L: 76, R: 44, th: 10, h: 78, back: 8.2, front: 4.6, dots: 6, bits: 2, sweep: 0, life: 0.8, slots: FLOOR },
  destroy: { L: 108, R: 108, th: 12, h: 104, back: 8.6, front: 4.6, dots: 6, bits: 2, sweep: 92, life: 0.95, slots: DESTROY },
} as const;
type Size = (typeof SIZE)[keyof typeof SIZE];
/** 친 자리 → 발 높이(키우기 전 거리). scaled 1.6배면 서 있는 졸라맨 발이 된다 */
const FOOT = { hit: 52, floor: 38, destroy: 44 } as const;

/**
 * 비울 자리(키우기 전 · 발 (bx, by) 기준, 위가 −) — [x0, y0, x1, y1]. 몸 상자(좌우 ±18 · 발 위 6~60)와 오른쪽 아래 콤보 도장(발 오른쪽 68~150 · 발 위 6~100).
 * 사건 그림은 1.6배로 키워지니 화면 px를 그만큼 나눈다
 */
const HOLE = [[-18, -60, 18, -6], [68, -100, 150, -6]].map((r) => r.map((v) => v / WEAPON_FX.SIZE));
const inHole = (dx: number, dy: number, m: number): boolean => HOLE.some(([x0, y0, x1, y1]) => dx > x0 - m && dx < x1 + m && dy > y0 - m && dy < y1);
/** 꺾은선이 비울 자리를 피하나(m = 획 반폭 남짓) */
const free = (pts: readonly number[], bx: number, by: number, m: number): boolean => {
  for (let i = 0; i < pts.length; i += 2) if (inHole(pts[i] - bx, pts[i + 1] - by, m)) return false;
  return true;
};

/**
 * 촉수 꼴 — 뿌리 (x, y)에서 a0 쪽으로 길이 h, 점 n개(뿌리 → 끝). 각이 S자로 두 번 굽고(bend · 자리 ph — 뿌리는 덜, 위로 갈수록 크게)
 * 끝 3할에서 hook만큼 말린다(+ 시계 · − 반시계 — 순수한 그릇 촉수의 갈고리 끝)
 */
function coil(x: number, y: number, a0: number, h: number, bend: number, ph: number, hook: number, n = 14): number[] {
  const pts = [x, y];
  const st = h / (n - 1);
  for (let i = 1; i < n; i++) {
    const t = (i - 0.5) / (n - 1);
    const a = a0 + bend * Math.sin(ph + t * 5.8) * (0.3 + 0.7 * t) + hook * Math.max(0, (t - 0.66) / 0.34) ** 1.6;
    x += Math.cos(a) * st;
    y += Math.sin(a) * st;
    pts.push(x, y);
  }
  return pts;
}

/**
 * 촉수 하나를 두 붓으로 — 아래 8할은 먹(튕김 누름: 뿌리 굵게 → 가늘게), 위 5할 남짓은 먹 머리 → 보라 꼬리 → 밝은 짝 끝(legendTone)이
 * 같은 굵기 곡선으로 이어 덮는다. 한 붓에 색을 다 머금으면 보라가 가닥 6할을 덮어 「어둠」이 안 읽혔다(5판 1회차) — 보라는 위 3~4할에만.
 * 위 붓은 아래 붓이 그 자리에 닿을 때 긋기 시작하고, 둘 다 뿌리부터 풀린다
 */
function tendril(pts: number[], w: number, c: string, life: number, grow: number, thick: boolean, vx: number, vy: number): void {
  const k = pts.length / 2 - 1;
  const a = Math.round(k * 0.4);
  const b = Math.round(k * 0.8);
  const dry = thick ? 0.18 : 0.3;
  bent(pts.slice(0, (b + 1) * 2), w, '', { pr: 1, dry, gr: grIn(grow * (b / k), life), life, vx, vy });
  // 위 붓은 붓 누름(BRUSH) — 이은 자리에서 한 번 불룩하고(자료 1: 가닥 가운데 한 번 부푼다) 보라 꼬리가 바늘 끝까지 굵기를 지닌다.
  // 튕김 누름이면 보라 자리가 2px 남짓으로 가늘어 폰 1배에서 점으로만 보였다(5판 2회차)
  const hi = pts.slice(a * 2);
  later((grow * a) / k / 60, () => bent(hi, w * 0.56, '', { body: c, pr: 5, dry, gr: grIn(grow * (1 - a / k), life), life: life * 1.05, vx, vy }));
}

/** 끝 갈래 — 촉수 pts의 f 자리에서 side 쪽으로 갈라져 나가는 짧은 가닥(보라 → 밝은 짝). 본 가닥이 그 자리를 지난 뒤에 */
function forkPts(pts: readonly number[], f: number, side: number, h: number): number[] {
  const j = Math.max(1, Math.min(pts.length / 2 - 2, Math.round((pts.length / 2 - 1) * f)));
  const [x, y] = [pts[j * 2], pts[j * 2 + 1]];
  const a = Math.atan2(pts[j * 2 + 3] - y, pts[j * 2 + 2] - x) + side * (0.45 + 0.3 * n01());
  return coil(x, y, a, h, 0.35, n01() * TAU, side * (1.2 + 0.8 * n01()), 6);
}

/** 먹 점 — 크기 제각각, 본 가닥보다 늦게 튀어 천천히 오른다. 색 점은 마르지 않는다 */
function dot(x: number, y: number, r: number, c: string, vx = sgn() * 16): void {
  put('drop', x, y, {
    vx, vy: -22 - n01() * 34, g: -26, drag: 1.4, life: 0.6 + n01() * 0.45, size: r, c1: c, hold: c === INK ? 0 : 1,
  });
}

/** 먹 조각 — 찢긴 조각이 흔들리며 천천히 오른다(네 귀). 셋에 하나만 보라 */
function flake(x: number, y: number, z: number, c: string, i: number, vx: number): void {
  put('leaf', x, y, {
    vx, vy: (-26 - n01() * 26) * z, g: -10 * z, drag: 1.2,
    life: 0.8 + n01() * 0.35, size: (2.4 + n01() * 2.6) * z, rot: n01() * TAU, spin: sgn() * 3,
    c1: i % 3 === 2 ? c : INK, st: 4,
  });
}

/**
 * 촉수 무리 한 벌 — 발 (bx, by)에서 ang 쪽(「위」)으로 솟는다. 옆 = ang에 수직, m = 거울(1 그대로 · −1 좌우 뒤집기).
 * z = 크기 배율(사건 그림은 1 — scaled가 키운다), hk = 키 배율. 웅덩이 → 촉수(앞 가닥부터 어긋나게 4프레임) → 끝 갈래(키 큰 굵은 가닥) →
 * 바닥 쓸기(완파) → 먹 점 · 조각이 늦게 오른다.
 * ground = false(필살 마무리가 공중) — 웅덩이 · 바닥 쓸기 없이 먹 한 덩이에서 모여 솟는다. clear = 몸 상자 · 콤보 도장을 피한다(사건 그림)
 */
function forest(bx: number, by: number, ang: number, S: Size, z: number, hk: number, m: number, c: string, ground = true, clear = false): void {
  const [ux, uy] = [Math.cos(ang), Math.sin(ang)];
  const [sx, sy] = [-uy, ux];
  const P = (a: number, b: number): [number, number] => [bx + (sx * a + ux * b) * z, by + (sy * a + uy * b) * z];
  const L = S.life;
  const lite = liteOf(c);
  const ok = (pts: readonly number[], m0: number): boolean => !clear || free(pts, bx, by, m0);
  const wide = ground ? 1 : 0.45;
  if (ground) {
    // 웅덩이 — 몸 밑 가운데부터 양쪽으로 번진다. 왼쪽은 두꺼운 몸 + 더 멀리 스미는 마른 밑장.
    // 오른쪽은 도장 앞(화면 x 246)까지만 두껍고, 그 너머는 도장 밑을 가는 마른 획으로 지나 화면 끝 덩이에 닿는다
    const wet = { dry: 0, pr: 4, life: L * 1.15, gr: grIn(5, L * 1.15) } as const;
    const rIn = Math.min(S.R, 41);
    line(...P(m * 3, -S.th * 0.15), ...P(-m * S.L * 0.8, -S.th * 0.1), S.th * z, '', { ...wet, bend: m * S.th * 0.35 * z });
    later(2 / 60, () => line(...P(-m * S.L * 0.45, -S.th * 0.05), ...P(-m * S.L, 0), S.th * 0.55 * z, '', { ...wet, dry: 0.35, life: L, gr: grIn(5, L) }));
    line(...P(-m * 3, -S.th * 0.1), ...P(m * rIn, 0), S.th * 0.8 * z, '', { ...wet, bend: -m * S.th * 0.25 * z, gr: grIn(4, L * 1.15) });
    put('spat', ...P(-m * S.L * (0.3 + 0.2 * n01()), 0), { life: L, size: S.th * 0.75 * z, rot: ang, v: 3, c1: INK, gr: 1, hold: 1 });
    if (S.R > rIn) {
      later(3 / 60, () => line(...P(m * rIn * 0.8, 0), ...P(m * S.R, 0), S.th * 0.3 * z, '', { ...wet, dry: 0.45, life: L, gr: grIn(5, L) }));
      later(5 / 60, () => put('spat', ...P(m * S.R * 0.95, 0), { life: L * 0.85, size: S.th * 0.5 * z, rot: ang - m * 0.9, v: 4, c1: INK, gr: 1, hold: 1 }));
    }
  } else {
    put('spat', bx, by, { life: L * 0.8, size: S.th * 0.8 * z, rot: ang, v: 4, c1: INK, gr: 1, hold: 1 });
  }
  const tips: [number, number][] = [];
  const n = S.slots.length;
  S.slots.forEach(([dx, hf, tilt, thick, hd], i) => {
    const w = (thick ? S.back : S.front) * (0.9 + 0.2 * n01());
    const h = S.h * hk * hf * (0.88 + 0.24 * n01());
    const [rx, ry] = P(m * (dx + sgn() * 3) * wide, 0);
    // 굽이 · 갈고리 · 기울기를 뽑아 비울 자리에 닿으면 다시 뽑는다(여섯 번 다 닿으면 그 가닥은 쉰다)
    let pts: number[] | null = null;
    for (let t = 0; t < 6 && !pts; t++) {
      const hook = (hd || (n01() < 0.5 ? 1 : -1)) * m * (1.7 + 1.2 * n01());
      const q = coil(rx, ry, ang + m * (tilt + sgn() * 0.12), h * z, 0.55 + 0.4 * n01(), n01() * TAU, hook);
      if (ok(q, w * 0.4 + 1)) pts = q;
    }
    if (!pts) return;
    const p = pts;
    const life = L * (thick ? 1.1 + 0.15 * n01() : 0.8 + 0.12 * n01());
    const t0 = ((i / n) * 2 + n01() * 0.8) / 60; // 앞 가닥부터 어긋나게 — 마지막 가닥도 4칸 남짓에 다 솟는다
    const grow = 2.2 + n01() * 0.9;
    const vx = m * dx < 0 ? -(2 + 3 * n01()) * z : 0; // 왼쪽 가닥만 바깥으로 미끄러진다(몸 상자 · 도장 쪽으로 가지 않게)
    const vy = -(5 + 5 * n01()) * z;
    later(t0, () => tendril(p, w * z, c, life, grow, thick === 1, vx, vy));
    tips.push([p[p.length - 2], p[p.length - 1]]);
    // 끝 갈래 — 키 큰 굵은 가닥에 하나(갈고리 반대쪽으로)
    if (thick && hf >= 0.8) {
      const side = -Math.sign(p[p.length - 2] - p[p.length - 4]) || 1;
      for (let t = 0; t < 3; t++) {
        const f = forkPts(p, 0.6 + 0.15 * n01(), side, h * z * (0.22 + 0.1 * n01()));
        if (!ok(f, 2)) continue;
        later(t0 + (grow * 0.7 + 1) / 60, () => bent(f, w * 0.42 * z, '', { body: lite, pr: 1, dry: 0.3, gr: grIn(3, life), life: life * 0.75, vx, vy }));
        break;
      }
    }
  });
  // 바닥 쓸기(완파) — 한 가닥이 몸 곁 웅덩이 위에서 왼쪽으로 낮게 길게 쓸고 가다 끝이 말려 들린다(순수한 그릇)
  if (S.sweep && ground) {
    const [rx, ry] = P(-m * 15, 9);
    const p = coil(rx, ry, ang - m * (Math.PI / 2 - 0.1), S.sweep * z, 0.16, n01() * TAU, m * (2 + 0.5 * n01()), 14);
    if (ok(p, 3)) {
      later(2 / 60, () => tendril(p, S.front * 1.5 * z, c, L, 7, false, 0, -4 * z));
      tips.push([p[p.length - 2], p[p.length - 1]]);
    }
  }
  if (!tips.length) return;
  // 먹 점 — 반은 촉수 끝 둘레(늦게), 반은 무리 둘레에 흩어진다. 넷에 하나 보라 · 셋째는 밝은 짝
  scatter(5 / 60, S.dots, (i) => {
    const near = i % 2 === 0;
    let [x, y] = near ? tips[Math.floor(n01() * tips.length)] : P(m * (-S.L + n01() * (S.L + S.R * 0.3)) * wide, S.h * hk * (0.25 + 0.7 * n01()));
    x += sgn() * 8 * z;
    y += sgn() * 8 * z;
    if (clear && inHole(x - bx, y - by, 4)) y = by + HOLE[x > bx ? 1 : 0][1] - 5;
    const col = i === 3 ? lite : i % 4 === 1 ? c : INK;
    dot(x, y, (1 + n01() * n01() * 3) * z, col, x < bx ? -(4 + 12 * n01()) : 0);
  }, 8);
  scatter(8 / 60, S.bits, (i) => {
    const [tx, ty] = tips[Math.floor(n01() * tips.length)];
    flake(tx, ty, z, c, i, tx < bx ? -14 * n01() * z : 0);
  });
}

/** 사건 그림 키 배율 — 콤보 단이 오르면 키만 조금 자란다(폭은 화면 · 도장 자리 때문에 그대로) */
const tall = (k: number): number => Math.min(1.35, 0.8 + 0.2 * k);

export const shade: Recipe = {
  trail: { w: 12, dry: 0.3 },
  own: true,
  // 칼길 — 칼이 지나간 호를 한 번에 문지른 마른 먹(칼끝 쪽이 굵다) + 바깥으로 벗겨져 나가며 말리는 촉수 둘(먹 → 보라)
  swing(fx, fy, w, life, c, turn, grow) {
    const m = swingMoon(fx, fy, turn, grow);
    const p = moonPts(m, 7).map((q) => q + sgn() * 1.5);
    bent(p, w * 1.05, '', { pr: 3, dry: 0.55, gr: 0.3, life });
    for (let i = 0; i < 2; i++) {
      const [x, y, dir, out] = moonPoint(m, 0.18 + 0.3 * i + 0.1 * n01());
      const h = w * (2.4 + 1.2 * n01());
      const side = Math.sign(Math.sin(out - dir)) || 1;
      later((1 + i) / 60, () => bent(coil(x, y, out - side * 0.3, h, 0.5, n01() * TAU, side * 1.8, 8), w * 0.5, '', {
        body: c, pr: 1, dry: 0.3, gr: 0.3, life: life * 1.15, vy: -16,
      }));
    }
  },
  hit(x, y, k, c) {
    forest(x, y + FOOT.hit, UP, SIZE.hit, 1, tall(k), 1, c, true, true);
  },
  floor(x, y, k, c) {
    forest(x, y + FOOT.floor, UP, SIZE.floor, 1, tall(k), 1, c, true, true);
  },
  destroy(x, y, k, c) {
    forest(x, y + FOOT.destroy, UP, SIZE.destroy, 1, tall(k), 1, c, true, true);
  },
  // 헛스윙 — 칼끝 자리에서 작은 촉수 둘이 서로 다른 쪽으로 S자로 말려 오르고 먹 점 하나(웅덩이 없음)
  whiff(x, y, c) {
    for (let i = 0; i < 2; i++) {
      const s = i ? -1 : 1;
      const h = 15 + 8 * n01();
      later(i / 60, () => bent(coil(x + s * 3, y, UP + s * (0.25 + 0.3 * n01()), h, 0.5, n01() * TAU, s * 1.7, 7), 3.2 - i, '', {
        body: c, pr: 1, dry: 0.3, gr: 0.25, life: 0.38, vy: -18,
      }));
    }
    later(3 / 60, () => dot(x + sgn() * 6, y - 8, 1.4, INK));
  },
  // 칼 기운 — 손잡이에서 먹 촉수가 칼날을 한 바퀴 남짓 감으며(바깥으로 크게 · 다리 쪽은 작게) 칼끝까지 가고,
  // 칼끝(땅에 묻히면 땅 5px 위)을 돌아 바깥 위로 칼 길이 남짓 말려 오른다(먹 → 보라 → 밝은 짝 끝). 둘에 하나 · 한 번에 둘 셋이 살아 있다.
  // 사이사이 먹 점이 칼 바깥에서 천천히 위로(여섯에 하나 보라 · 열에 하나 밝은 짝)
  aura(b, n, c) {
    const [hx, hy, tx, ty] = b;
    const L = Math.hypot(tx - hx, ty - hy) || 1;
    const [ux, uy] = [(tx - hx) / L, (ty - hy) / L];
    const o = ux >= 0 ? 1 : -1;
    const [ox, oy] = [uy * o, -ux * o]; // 칼 바깥(몸 반대쪽)
    if (n % 2) {
      const v = 0.2 + 0.8 * n01();
      const d = 3 + 6 * n01();
      dot(hx + ux * L * v + ox * d, hy + uy * L * v + oy * d, 1 + n01() * 1.4, n % 6 === 3 ? c : n % 10 === 5 ? liteOf(c) : INK, o * (2 + 6 * n01()));
      return;
    }
    const vEnd = uy > 0 ? Math.min(1, Math.max(0.5, (VIEW.GROUND_Y - 5 - hy) / (uy * L))) : 1;
    const turns = 1.1 + 0.5 * n01();
    const ph = n01() * TAU;
    const amp = 8.5 + 3 * n01(); // 바깥 굽이 — 칼날(보라) 밖으로 먹 고리가 드러나게(6이면 칼에 묻혔다)
    const pts: number[] = [];
    for (let i = 0; i <= 9; i++) {
      const v = (vEnd * i) / 9;
      const s = Math.sin(ph + TAU * turns * v) * Math.min(1, 0.3 + v * 2);
      const off = s * (s > 0 ? amp : 2);
      pts.push(hx + ux * L * v + ox * off, hy + uy * L * v + oy * off);
    }
    // 칼끝 너머 — 바깥 위로 틀어 솟다가(앞 반은 살짝 거꾸로 휘어 S자) 끝 반에서 갈고리로 말린다. 칼 길이의 1.4~1.8배. 칼끝 두 점부터 겹쳐 긋는다
    const E = L * (1.4 + 0.4 * n01());
    const spin = -o * (2.3 + 0.6 * n01());
    let a = Math.atan2(uy, ux) - o * 1.75;
    let [x, y] = [pts[pts.length - 2], pts[pts.length - 1]];
    const curl = pts.slice(-4);
    for (let j = 1; j <= 9; j++) {
      x += (Math.cos(a) * E) / 9;
      y += (Math.sin(a) * E) / 9;
      curl.push(x, y);
      a += j < 4 ? o * 0.12 : (spin * (j - 3)) / 15; // j 4~8의 (j − 3) 합 = 15
    }
    const life = 0.5 + 0.12 * n01();
    bent(pts, 4.6, '', { pr: 5, dry: 0.22, gr: 0.3, life, vx: o * 3, vy: -8 });
    later(0.1, () => bent(curl, 3.8, '', { body: c, pr: 5, dry: 0.2, gr: 0.3, life: life * 0.9, vx: o * 3, vy: -8 }));
  },
  every: 0.09,
  tint: true,
  waza: {
    // 필살 큰 획 아래에서 — 획을 따라 차례로, 획 점 아래(땅에 가까우면 땅)에서 촉수가 솟아 획을 넘어 말린다.
    // 뿌리는 좌우로 번갈아 조금씩 더 멀리(세로 획이면 밑동에서 양쪽으로 번진다). 둘에 하나 끝 갈래 → 늦게 먹 점. k 1에서 즉시 + later ≤ 24
    along(pts, k, c, dur) {
      const n = Math.min(6, Math.max(2, Math.round(pathLen(pts) / 80)));
      const lite = liteOf(c);
      follow(pts, 0, dur, n, (x, y, _a, _u, i) => {
        const s = i % 2 ? 1 : -1;
        const rx = x + s * (3 + 5 * i) * k * (0.7 + 0.6 * n01());
        // 땅에서 330 안의 획 점이면 그 아래 땅에 뿌리(키는 획을 넘거나 상한까지), 더 높은 점은 획 바로 아래 먹 한 점에서
        const low = y > VIEW.GROUND_Y - 330;
        const ry = low ? VIEW.GROUND_Y - 1 : y + 22 * k;
        const h = low ? Math.min(ry - y + 14 * k, (40 + 22 * n01()) * k) : ry - y + (14 + 12 * n01()) * k;
        const rp = coil(rx, ry, UP + s * (0.08 + 0.25 * n01()), h, 0.5 + 0.25 * n01(), n01() * TAU, -s * (1.5 + n01()), 12);
        const w = (3 + n01()) * k;
        tendril(rp, w, c, 0.55, 4, i % 2 === 0, 0, -6 * k);
        if (i % 2 === 0 && low) put('spat', rx, ry, { life: 0.5, size: w * 0.9, rot: UP, v: 3, c1: INK, gr: 1, hold: 1 });
        if (i % 2) later(4 / 60, () => bent(forkPts(rp, 0.68, s, h * 0.28), w * 0.4, '', { body: lite, pr: 1, dry: 0.3, gr: 0.3, life: 0.42 }));
      });
      follow(pts, dur * 0.5 + 0.08, dur * 0.5, Math.min(4, n), (x, y, _a, _u, i) => dot(x + sgn() * 10 * k, y - 12 * k, (0.9 + 1.4 * n01()) * k, i === 2 ? lite : i % 3 === 1 ? c : INK));
    },
    // 마무리 — 완파 꼴을 친 방향 ang 쪽으로(그 자리가 바탕 — 땅이면 웅덩이, 옆이면 옆으로 솟는 무리). 좌우는 아무 쪽
    bloom(x, y, ang, k, c) {
      const ground = Math.sin(ang) < -0.7 && y > VIEW.GROUND_Y - 40; // 땅에서 위로 칠 때만 웅덩이
      forest(x, y, ang, SIZE.destroy, k * (ground ? 1.15 : 0.8), 1, sgn() > 0 ? 1 : -1, c, ground);
    },
  },
};
