// 고드름 대검(얼음) 레시피 — 3판(설계서 §2 고드름 줄). 공통 달(moonsFor · paintMoon)은 쓰지 않는다. bladeFx RECIPES가 이어 붙이기만 한다.
// 꼴: 친 자리 앞 공중에 뾰족한 얼음 가시 다발이 한쪽으로 비스듬히 꽂힌다(수직에서 49° · 부채 각 ≤ 92° · 길이 제각각 · 가운데 원판 없음).
// 박자: 툭 꽂힘(1프레임에 다 그어짐) → 10프레임 그대로 선다(움직임 0) → 쩍 갈라짐(다발을 가로지르는 먹 금) → 세모 조각이 돌며 아래로 떨어진다(셋에 하나 먹).
// 사건마다 같은 다발을 크기만 달리한다: whiff < hit < floor < destroy · 필살 마무리 = destroy 꼴을 친 방향에 맞춰 · 필살 큰 획 = 작은 다발이 줄지어.
// 서리 대검(땅에서 수직으로 솟는 가시 줄)과 갈린다: 이쪽은 땅에서 떨어진 공중 · 한쪽으로만 기운 다발 · 멈춰 버티는 박자.
// 문법(불변 13): 먹 + 포인트 색 하나 · 알파 지우기 금지(모양으로) · shadowBlur · 블룸 · 가운데 동그라미 별 · 원판 + 방사형 띠 · 아이콘 금지.
// ⚠ bladeFx와 순환 import — 최상위에서 bladeFx 값을 부르지 않는다. 시험에서 이 파일을 bladeFx보다 먼저 import하지 않는다.
import { PALETTE } from '../../config';
import { bent, later, line, n01, put, scaled, sgn, vel, type Recipe } from '../bladeFx';
import { follow, liteOf, moonPoint, moonPts, pathLen, swingMoon } from './geom';

const TAU = Math.PI * 2;
const UP = -Math.PI / 2;
/** 다발이 기우는 각 — 수직(서리)에서 이만큼 한쪽으로 */
const TILT = 0.85;
/** 가시가 사는 초 — 앞 4%에 다 그어지고 40%까지 그대로 선다(= 10프레임), 그 뒤 밑동부터 깎인다 */
const LIFE = 0.46;
/** 쩍 갈라지는 때 = 그대로 서 있다 끝나는 때 */
const SPLIT = LIFE * 0.4;

/** 크기 — n = 가시 수 · L = 가장 긴 가시 · w = 굵기 · fan = 부채 반각 · ns = 조각 수 */
const SIZE = {
  whiff: { n: 3, L: 16, w: 3.6, fan: 0.3, ns: 1 },
  hit: { n: 5, L: 38, w: 7.4, fan: 0.4, ns: 4 },
  floor: { n: 6, L: 50, w: 9.4, fan: 0.45, ns: 6 },
  destroy: { n: 8, L: 64, w: 11.5, fan: 0.5, ns: 9 },
} as const;
type Kind = keyof typeof SIZE;

/** 기우는 쪽 — ±1 */
const side = (): number => (n01() < 0.5 ? 1 : -1);

/** 가시 길이 몫 — 고르지 않게(고른 부채는 깃 · 날개로 읽혔다). 가장 긴 한 대(1)만 밝은 짝 몸 */
const LEN = [0.55, 0.82, 1, 0.6, 0.9, 0.42, 0.74, 0.5];

/**
 * 다발 — 밑동 (x, y)에서 dir 쪽으로 n대가 1프레임에 꽂힌다(부채 반각 fan · 좁게, 거의 나란히 한쪽으로).
 * 밑동은 dir에 수직인 줄 위로 넓게 흩고 앞뒤로도 엇갈린다(한 점에서 사방이면 별로 읽힌다).
 * 먹 밑동 → 시그니처 끝, 굵기는 길이 따라. 움직임 0(vx · vy 없음). 깨질 자리(가시 6할 자리)를 돌려준다
 */
function cluster(x: number, y: number, dir: number, n: number, L: number, w: number, fan: number, c: string, life = LIFE): number[] {
  const tips: number[] = [];
  const [ca, sa] = [Math.cos(dir), Math.sin(dir)];
  for (let i = 0; i < n; i++) {
    const v = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // −1 → 1
    const f = LEN[(i + (n > 4 ? 0 : 1)) % LEN.length];
    const a = dir + v * fan + sgn() * 0.06;
    const len = L * f * (0.92 + 0.16 * n01());
    const off = v * w * (n > 6 ? 1.9 : 1.5) + sgn() * 2;
    const back = (1 - f) * L * 0.25 + sgn() * w * 0.3;
    const bx = x - sa * off + ca * back;
    const by = y + ca * off + sa * back;
    const tx = bx + Math.cos(a) * len;
    const ty = by + Math.sin(a) * len;
    line(bx, by, tx, ty, w * (0.45 + 0.55 * f), '', { body: f === 1 ? liteOf(c) : c, pr: 1, dry: 0.1, gr: 0.04, life });
    tips.push(bx + (tx - bx) * 0.6, by + (ty - by) * 0.6);
  }
  return tips;
}

/** 세모 조각 — 돌며 아래로 떨어진다. 시그니처 · 밝은 짝 · 먹(셋에 하나) 번갈아 */
function shard(x: number, y: number, dir: number, k: number, c: string, i: number): void {
  put('leaf', x, y, {
    ...vel(dir + sgn() * 0.6, (50 + n01() * 70) * k), g: 820, drag: 0.6,
    life: 0.55 + n01() * 0.2, size: (4 + n01() * 3) * k, rot: n01() * TAU, spin: (n01() < 0.5 ? -1 : 1) * (9 + n01() * 6),
    c1: i % 3 === 2 ? PALETTE.INK : i % 3 === 1 ? liteOf(c) : c, st: 3,
  });
}

/** 쩍 — 다발 3할 자리를 가로지르는 각진 먹 금 한 줄 + tips 중 ns곳에서 세모 조각 */
function split(x: number, y: number, dir: number, tips: number[], L: number, w: number, ns: number, k: number, c: string, crack = true): void {
  if (crack) {
    const cx = x + Math.cos(dir) * L * 0.3;
    const cy = y + Math.sin(dir) * L * 0.3;
    const px = -Math.sin(dir);
    const py = Math.cos(dir);
    const half = L * 0.3 + w * 1.6;
    const pts: number[] = [];
    for (let j = 0; j < 4; j++) {
      const s = (j / 3) * 2 - 1;
      const jog = (j % 2 ? 1 : -1) * L * 0.07;
      pts.push(cx + px * s * half + Math.cos(dir) * jog, cy + py * s * half + Math.sin(dir) * jog);
    }
    bent(pts, Math.max(2, w * 0.45), '', { life: 0.24, dry: 0.2, pr: 2, gr: 0.06 });
  }
  const m = tips.length / 2;
  for (let i = 0; i < ns && m; i++) {
    const j = Math.floor(((i + 0.5) / ns) * m) * 2;
    shard(tips[j] + sgn() * 3, tips[j + 1] + sgn() * 3, dir, k, c, i);
  }
}

/** 한 사건 — 밑동 (x, y)에 dir 쪽 다발이 꽂히고 → 버티고 → 쩍 갈라져 조각이 떨어진다 */
function freeze(x: number, y: number, kind: Kind, k: number, c: string, dir: number): void {
  const S = SIZE[kind];
  const tips = cluster(x, y, dir, S.n, S.L * k, S.w * k, S.fan, c);
  later(SPLIT, () => split(x, y, dir, tips, S.L * k, S.w * k, S.ns, k, c, kind !== 'whiff'));
}

/** 친 방향 ang을 한쪽으로 기울인다 — 위쪽으로 더 가는 쪽을 고른다(땅으로 꽂히지 않게). ang이 하늘이면 무작위 쪽 */
function lean(ang: number): number {
  const [a, b] = [ang + TILT, ang - TILT];
  if (Math.abs(Math.sin(a) - Math.sin(b)) < 0.05) return ang + side() * TILT;
  return Math.sin(a) < Math.sin(b) ? a : b;
}

export const icicle: Recipe = {
  trail: { w: 12, dry: 0.3 },
  own: true,
  // 칼길 — 칼이 지나간 호를 곧은 마디 다섯(다각형)으로 얼린 줄 + 칼끝 쪽 꼭짓점 둘에 바깥 · 앞으로 기운 작은 가시
  swing(fx, fy, w, life, c, turn, grow) {
    const m = swingMoon(fx, fy, turn, grow);
    bent(moonPts(m, 6), w * 0.7, '', { body: c, life, dry: 0.12, pr: 3, gr: 0.1 });
    const s = Math.max(0.7, w / 12);
    for (const u of [0.6, 1]) {
      const [x, y, ang, out] = moonPoint(m, u);
      const a = Math.atan2(Math.sin(out) + 0.9 * Math.sin(ang), Math.cos(out) + 0.9 * Math.cos(ang));
      line(x, y, x + Math.cos(a) * 16 * s, y + Math.sin(a) * 16 * s, 4.2 * s, '', { body: u === 1 ? liteOf(c) : c, pr: 1, dry: 0.1, gr: 0.04, life: life * 0.9 });
    }
  },
  hit(x, y, k, c) {
    const s = side();
    freeze(x - s * 8, y - 4, 'hit', k, c, UP + s * TILT);
  },
  floor(x, y, k, c) {
    const s = side();
    freeze(x - s * 16, y - 20, 'floor', k, c, UP + s * (TILT + 0.1));
  },
  // 완파 — 가장 큰 다발. 밑동은 머리 위 40 · 친 쪽으로 띄운다(11-21 폰 1배: y − 6 · 반대쪽 20이면 밑동 먹 덩이가 주인공 몸통을 덮었다)
  destroy(x, y, k, c) {
    const s = side();
    freeze(x + s * 6, y - 40, 'destroy', k, c, UP + s * (TILT + 0.05));
  },
  whiff(x, y, c) {
    const s = side();
    freeze(x, y, 'whiff', 1, c, UP + s * TILT);
  },
  // 칼 기운 — 날 위쪽 면에 작은 다발(칼끝 쪽으로 기운다)이 꽂혀 서 있다 · 세 번에 한 번 쩍 조각 하나
  aura(b, n, c) {
    const u = 0.3 + n01() * 0.7;
    const x = b[0] + (b[2] - b[0]) * u;
    const y = b[1] + (b[3] - b[1]) * u;
    const a = Math.atan2(b[3] - b[1], b[2] - b[0]);
    const nrm = Math.sin(a - Math.PI / 2) < 0 ? a - Math.PI / 2 : a + Math.PI / 2; // 날의 법선 중 위쪽
    const dir = Math.atan2(Math.sin(nrm) + 0.8 * Math.sin(a), Math.cos(nrm) + 0.8 * Math.cos(a));
    const tips = cluster(x, y, dir, 3, 18, 3.4, 0.4, c, 0.34);
    if (n % 3 === 0) later(0.34 * 0.4, () => split(x, y, dir, tips, 18, 3.4, 1, 0.8, c, false));
  },
  every: 0.12,
  tint: true,
  waza: {
    // 필살 큰 획을 따라 — 작은 다발(가시 셋)이 뿌리 → 끝으로 차례로 꽂히고(모두 같은 쪽으로 기운다), 저마다 서 있다 쩍 조각 둘 · 하나 번갈아(k 1에서 ≤ 24)
    along(pts, k, c, dur) {
      const n = Math.min(5, Math.max(3, Math.round(pathLen(pts) / 70)));
      const s = Math.sign(pts[pts.length - 2] - pts[0]) || side(); // 획이 나아가는 쪽으로
      const dir = UP + s * TILT;
      follow(pts, 0, dur, n, (x, y, _a, u, i) => {
        const L = (34 + 16 * Math.sin(Math.PI * u)) * k;
        const tips = cluster(x, y, dir, 3, L, 7 * k, 0.35, c);
        later(SPLIT, () => split(x, y, dir, tips, L, 7 * k, i % 2 ? 1 : 2, k * 0.9, c, false));
      });
    },
    // 마무리 — 완파 다발을 친 방향 ang에서 한쪽으로 기울여
    bloom(x, y, ang, k, c) {
      scaled(x, y, k, () => freeze(x, y, 'destroy', 1, c, lean(ang)));
    },
  },
};
