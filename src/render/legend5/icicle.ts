// 고드름 대검(얼음) 레시피 — 공통 초승달(crescent.ts) 위에 짓는다. bladeFx RECIPES가 이어 붙이기만 한다.
// 꼴(설계서 §6 · 사용자 영상 얼음): 몸을 두르는 초승달(꼬리 먹 → 하늘색 → 앞날 밝은 짝, 앞날 달군 속) →
// 2~3프레임 뒤 같은 호가 얼어붙는다: 앞쪽 끝은 친 쪽으로 날카로운 가시 다발이 부채로 터지고(길이 제각각, 가운데 밝은 짝 · 가장자리 시그니처),
// 호 몸 밑으로는 고드름이 매달린다(늘 땅 쪽으로, 앞날 쪽일수록 길다) → 한 박자 뒤 세모 조각으로 깨져 떨어진다(셋에 하나 먹). 반짝임 별은 없다.
// 서리 대검(친 자리에서 위로 솟는 가시 셋 + 얼음 금)과 갈린다: 이쪽은 호를 따라 아래로 매달린 고드름 + 앞날의 부채 다발.
// 문법(불변 13): 먹 + 포인트 색 하나 · 알파 지우기 금지(모양으로) · shadowBlur · 블룸 · 가운데 동그라미 별 · 원판 + 방사형 띠 · 아이콘 금지.
// ⚠ bladeFx와 순환 import — 최상위에서 bladeFx 값을 부르지 않는다. 시험에서 이 파일을 bladeFx보다 먼저 import하지 않는다.
import { PALETTE } from '../../config';
import { later, line, n01, put, sgn, vel, type Recipe } from '../bladeFx';
import { MOON, follow, liteOf, moonAt, moonPoint, moonsFor, morph, paintMoon, pathLen, swingMoon, type Moon } from './crescent';

const TAU = Math.PI * 2;
const DOWN = Math.PI / 2;

/** 세모 얼음 조각 — 돌며 떨어진다. 시그니처 · 밝은 짝 · 먹(셋에 하나) 번갈아 */
function shard(x: number, y: number, k: number, c: string, i: number, a = -DOWN, spd = 140): void {
  put('leaf', x, y, {
    ...vel(a + sgn() * 0.9, spd * (0.4 + n01() * 0.7) * k), g: 820 * k, drag: 0.7,
    life: 0.5 + n01() * 0.2, size: (4.2 + n01() * 3.2) * k, rot: n01() * TAU, spin: sgn() * 10,
    c1: i % 3 === 2 ? PALETTE.INK : i % 3 === 1 ? liteOf(c) : c, st: 3,
  });
}

/** 얼음 가시 한 대 — 밑동을 눌러 대고 칼끝처럼 뾰족하게 빠지는 곧은 마른 획. 끝 자리를 tips에 담는다(깨질 자리) */
function spike(x: number, y: number, a: number, L: number, w: number, body: string, life: number, tips: number[]): void {
  const tx = x + Math.cos(a) * L;
  const ty = y + Math.sin(a) * L;
  line(x, y, tx, ty, w, '', { body, pr: 1, dry: 0.14, gr: 0.1, life });
  tips.push(tx, ty);
}

/**
 * 가시 다발 — (x, y) 앞날에서 ang 쪽으로 n대가 부채로 터진다(폭 ±0.75 · 길이 제각각 · 가운데가 길고 밝은 짝, 가장자리 시그니처).
 * 밑동을 조금씩 흩는다 — 한 점에서 사방이면 별 · 원판 + 방사형 띠로 읽힌다
 */
function burst(x: number, y: number, ang: number, n: number, L: number, w: number, c: string, life: number, tips: number[]): void {
  for (let i = 0; i < n; i++) {
    const v = n === 1 ? 0 : (i / (n - 1)) * 2 - 1; // −1 → 1
    const mid = 1 - Math.abs(v);
    const len = L * (0.45 + 0.4 * mid + 0.3 * n01());
    const bx = x - Math.cos(ang) * 5 * mid + sgn() * 3;
    const by = y - Math.sin(ang) * 5 * mid + sgn() * 3;
    spike(bx, by, ang + v * 0.75 + sgn() * 0.08, len, w * (0.6 + 0.4 * mid), mid > 0.5 ? liteOf(c) : c, life + 0.04 * mid, tips);
  }
}

/** 고드름 — 호 위 (x, y)에 매달려 땅 쪽으로 자란다(조금씩 기운다). 셋에 둘은 밝은 짝 몸(먹 밑동 고드름만이면 잔 먹 털로 읽혔다), 하나는 밑동 먹 → 끝 색 */
function hang(x: number, y: number, L: number, w: number, c: string, i: number, life: number, tips: number[]): void {
  spike(x, y - 1, DOWN + sgn() * 0.18, L, w, i % 3 === 0 ? c : liteOf(c), life, tips);
}

/** 앞날 방향 — 진행 방향(ang)을 바깥(out) · 위로 꺾는다. 다발이 칼 지나간 쪽으로 뻗되 땅(졸라맨)으로 꽂히지 않는다 */
const fore = (ang: number, out: number): number => Math.atan2(Math.sin(ang) + 0.8 * Math.sin(out) - 1.1, Math.cos(ang) + 0.8 * Math.cos(out));

/** 깨짐 — t0초 뒤 tips(끝 자리들) 중 n곳에서 세모 조각이 6프레임에 걸쳐 떨어진다 */
function shatter(tips: number[], t0: number, n: number, k: number, c: string): void {
  later(t0, () => {
    const m = tips.length / 2;
    for (let i = 0; i < n && m; i++) {
      const j = Math.floor(((i + 0.5) / n) * m) * 2;
      later((i / Math.max(1, n - 1)) * 0.1, () => shard(tips[j], tips[j + 1], k, c, i));
    }
  });
}

/**
 * 한 사건 — 달을 긋고 → 2~3프레임 뒤 호 몸에 고드름이 꼬리 → 앞날 차례로 매달리고 앞날에서 가시 다발이 터진다 → 깨져 떨어진다.
 * nh = 고드름 수 · nb = 다발 가시 수 · ns = 조각 수 · s = 가시 크기 배율
 */
function freeze(m: Moon, w: number, life: number, k: number, c: string, nh: number, nb: number, ns: number, s = 1, host = m, at = 1): void {
  paintMoon(m, w, c, life);
  const tips: number[] = [];
  const keep = 0.36 + life * 0.4;
  later(0.05, () => {
    const [x, y, ang, out] = moonPoint(m, at);
    burst(x, y, fore(ang, out), nb, 46 * s, 7.4 * s, c, keep, tips);
  });
  morph(host, 0.035, nh, (x, y, _a, u, i) => hang(x, y, (10 + 26 * u ** 1.3) * s, (3.4 + 3 * u) * s, c, i, keep, tips), 0.04);
  shatter(tips, 0.05 + keep * 0.62, ns, k, c);
}

export const icicle: Recipe = {
  trail: { w: 12, dry: 0.3 },
  own: true,
  // 칼길 — 몸을 두르는 굵은 초승달(참격 호 그대로) → 몸에 고드름 셋 · 앞날에 작은 가시 다발
  swing(fx, fy, w, life, c, turn, grow) {
    const m = swingMoon(fx, fy, turn, grow);
    const s = Math.max(0.7, w / 12) * 0.75;
    paintMoon(m, w * 1.5, c, life * 0.8);
    const tips: number[] = [];
    morph(m, 0.04, 3, (x, y, _a, u, i) => hang(x, y, (8 + 14 * u) * s, 3.4 * s, c, i, 0.3, tips), 0.03);
    later(0.05, () => {
      const [x, y, ang, out] = moonPoint(m, 1);
      burst(x, y, fore(ang, out), 3, 30 * s, 6 * s, c, 0.3, tips);
    });
  },
  hit(x, y, k, c) {
    const [m] = moonsFor('hit', x, y, k);
    freeze(m, MOON.hit.w, MOON.hit.life, k * 0.8, c, 3, 5, 4, 0.9);
  },
  floor(x, y, k, c) {
    const [m] = moonsFor('floor', x, y, k);
    freeze(m, MOON.floor.w, MOON.floor.life, k, c, 5, 6, 6, 1.15);
  },
  // 완파 — 두 겹 달이 몸 앞뒤로(뒤 = 먹 한 획, 앞 = 얼음) → 뒤 달(위)에 고드름이 줄지어 매달리고 앞 달 끝에서 다발이 크게 → 조각 많이.
  // 앞 달은 땅에 붙어 고드름을 달면 땅에 묻힌다 — 매다는 자리는 위쪽 뒤 달
  destroy(x, y, k, c) {
    const [back, front] = moonsFor('destroy', x, y, k);
    paintMoon(back, MOON.destroy.w * 0.5, '', MOON.destroy.life);
    freeze(front, MOON.destroy.w, MOON.destroy.life, k, c, 5, 8, 9, 1.3, back, 0.76); // 끝 그대로면 다발이 폰 화면 밖으로 나간다
    later(0.08, () => {
      const [bx, by, ang, out] = moonPoint(front, 0.24); // 달의 뒤 끝도 한 박자 늦게 작은 다발
      burst(bx, by, fore(ang + Math.PI, out), 4, 34, 6, c, 0.4, []);
    });
  },
  whiff(x, y, c) {
    const [m] = moonsFor('whiff', x, y, 1);
    paintMoon(m, MOON.whiff.w, c, MOON.whiff.life, false);
  },
  // 칼 기운 — 날 옆(위쪽 면)에 작은 가시 셋이 자란다 · 세 번에 한 번 그 끝에서 조각 하나가 떨어진다.
  // 고드름을 날 밑에 달면 내린 칼날과 겹쳐 안 보였다
  aura(b, n, c) {
    const u = 0.3 + n01() * 0.7;
    const x = b[0] + (b[2] - b[0]) * u;
    const y = b[1] + (b[3] - b[1]) * u;
    const a = Math.atan2(b[3] - b[1], b[2] - b[0]);
    const nrm = Math.sin(a - DOWN) < 0 ? a - DOWN : a + DOWN; // 날의 법선 중 위쪽
    const tips: number[] = [];
    burst(x, y, nrm, 3, 18, 3.4, liteOf(c), 0.3, tips); // 밝은 짝 몸 — 먹 밑동이 날에 붙으면 털로 읽힌다
    if (n % 3 === 0) later(0.2, () => shard(tips[0], tips[1], 0.8, c, n / 3, DOWN, 40));
  },
  every: 0.12,
  tint: true,
  waza: {
    // 필살 큰 획을 따라 — 뿌리 → 끝으로 고드름이 매달리고, 끝에서 가시 다발이 터진 뒤 깨져 떨어진다(k 1에서 즉시 + later ≤ 19)
    along(pts, k, c, dur) {
      const n = Math.min(9, Math.max(3, Math.round(pathLen(pts) / 45)));
      const tips: number[] = [];
      follow(pts, 0, dur, n, (x, y, _a, u, i) => hang(x, y, (10 + 18 * u) * k, (3 + 2.4 * u) * k, c, i, 0.42, tips));
      follow(pts, dur, 0, 1, (x, y, ang) => burst(x, y, ang, 4, 30 * k, 5.6 * k, c, 0.4, tips));
      shatter(tips, dur + 0.26, Math.min(6, n), k, c);
    },
    // 마무리 — 친 방향으로 볼록한 달 하나가 고드름 · 가시 다발 · 조각으로
    bloom(x, y, ang, k, c) {
      const m = moonAt(x, y, MOON.floor.r * k, ang, MOON.floor.span, n01() < 0.5 ? 1 : -1);
      freeze(m, MOON.floor.w * k, MOON.floor.life, k, c, 5, 7, 7, 1.2 * k);
    },
  },
};
