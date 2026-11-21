// 불새 대검(불) 레시피 — 공통 초승달(crescent.ts) 위에 짓는 본보기. bladeFx RECIPES가 이어 붙이기만 한다.
// 꼴(설계서 §6 · 사용자 영상 불): 몸을 두르는 초승달(꼬리 먹 → 주황 → 앞날 밝은 노랑, 앞날 달군 속) →
// 2~3프레임 뒤 같은 호에서 불 혀 날개가 솟는다(앞날 쪽일수록 길고, 맨 끝 혀가 가장 높이 말려 오른다) →
// 속 빈 C자 불길 고리 → 불티 조각이 흔들리며 천천히 떨어진다(셋에 하나는 재 = 먹).
// 화염 대검(친 자리에서 솟는 혀 · 밑동 빨강 → 끝 먹 · 오르는 불티)과 갈린다: 이쪽은 호를 타는 날개 · 먹 밑동 → 노랑 끝 · 떨어지는 불티.
// 문법(불변 13): 먹 + 포인트 색 하나 · 알파 지우기 금지(모양으로) · shadowBlur · 블룸 · 가운데 동그라미 별 · 원판 + 방사형 띠 · 아이콘 금지.
// ⚠ bladeFx와 순환 import — 최상위에서 bladeFx 값을 부르지 않는다. 시험에서 이 파일을 bladeFx보다 먼저 import하지 않는다.
import { PALETTE } from '../../config';
import { later, line, n01, put, sgn, sweep, type Recipe } from '../bladeFx';
import { MOON, follow, liteOf, moonAt, moonPoint, moonsFor, morph, paintMoon, pathLen, scatter, swingMoon, type Moon } from './crescent';

const TAU = Math.PI * 2;

/** 불 혀 날개 — 호 위 (x, y)에서 위로 솟으며 진행 쪽으로 휘는 붓 혀. u = 앞날에 가까울수록 길다(맨 끝은 더 높이 말린다) */
function wing(x: number, y: number, ang: number, u: number, i: number, k: number, c: string): void {
  let a = ang - Math.PI / 2;
  if (Math.sin(a) > 0) a += Math.PI; // 진행 방향의 법선 중 위쪽
  const dx = Math.cos(a) + Math.cos(ang) * 0.35;
  const dy = Math.sin(a) - 0.9;
  const d = Math.hypot(dx, dy) || 1;
  const top = u > 0.97;
  const L = (10 + 26 * u ** 1.4) * k * (top ? 1.35 : 1);
  const s = Math.cos(ang) >= 0 ? 1 : -1;
  line(x, y, x + (dx / d) * L, y + (dy / d) * L, (3.2 + 4.4 * u) * k, '', {
    body: i % 3 === 0 ? c : liteOf(c), pr: 1, bend: -s * L * (top ? 0.5 : 0.3), dry: 0.3, gr: 0.22,
    life: 0.28 + 0.08 * u + 0.08 * n01(), vx: s * 22 * k, vy: -45 * k,
  });
}

/** 속 빈 C자 불길 고리 — 달 앞날 곁에서 말려 닫히다 만 고리(바깥 시그니처 · 안 밝은 짝 두 획). 위로 조금 떠오른다 */
function ring(m: Moon, k: number, c: string): void {
  const [x, y] = moonPoint(m, 0.82);
  const R = Math.max(9, m.r * 0.42);
  const cx = x;
  const cy = y - R * 0.9; // 늘 호 위에 — 아래로 두면 땅에 묻힌다
  const d = Math.sign(m.sw) || 1;
  const out = Math.PI / 2;
  sweep(cx, cy, R, out + d * Math.PI * 0.5, d * Math.PI * 1.55, 4.6 * k, '', { body: c, pr: 1, dry: 0.45, gr: 0.3, life: 0.34, vy: -30 * k });
  sweep(cx, cy, R * 0.6, out + d * Math.PI * 0.9, d * Math.PI * 1.1, 2.4 * k, '', { body: liteOf(c), pr: 1, dry: 0.35, gr: 0.3, life: 0.28, vy: -30 * k });
}

/** 불티 — 찢긴 네 귀 조각이 흔들리며 천천히 떨어진다. 시그니처 · 밝은 짝 · 재(먹) 번갈아 */
function ember(x: number, y: number, k: number, c: string, i: number): void {
  put('leaf', x + sgn() * 6 * k, y + sgn() * 3, {
    vx: sgn() * 40 * k, vy: (-30 - n01() * 50) * k, g: 200 * k, drag: 1.6,
    life: 0.7 + n01() * 0.3, size: (3 + n01() * 2) * k, rot: n01() * TAU, spin: sgn() * 6,
    c1: i % 3 === 0 ? PALETTE.INK : i % 3 === 1 ? liteOf(c) : c, st: 4,
  });
}

/** 한 사건 — 달을 긋고 → 2~3프레임 뒤 불 날개로 바뀌고 → (고리) → 불티로 흩어진다 */
function blaze(m: Moon, w: number, life: number, k: number, c: string, n: number, sparks: number, withRing: boolean, wk = 1): void {
  paintMoon(m, w, c, life);
  morph(m, 0.04, n, (x, y, ang, u, i) => wing(x, y, ang, 0.2 + 0.8 * u, i, k * wk, c), 0.03);
  if (withRing) later(0.1, () => ring(m, k, c));
  scatter(0.13, sparks, (i) => {
    const [x, y] = moonPoint(m, 0.25 + (0.7 * i) / Math.max(1, sparks - 1));
    ember(x, y - 6, k, c, i);
  });
}

export const phoenix: Recipe = {
  trail: { w: 12, dry: 0.3 },
  own: true,
  // 칼길 — 몸을 두르는 굵은 초승달(참격 호 그대로) → 앞쪽 셋이 불 날개로
  swing(fx, fy, w, life, c, turn, grow) {
    const m = swingMoon(fx, fy, turn, grow);
    const s = Math.max(0.8, w / 12);
    paintMoon(m, w * 1.5, c, life * 0.8);
    morph(m, 0.04, 3, (x, y, ang, u, i) => wing(x, y, ang, 0.4 + 0.6 * u, i, 0.7 * s, c), 0.03);
  },
  hit(x, y, k, c) {
    const [m] = moonsFor('hit', x, y, k);
    blaze(m, MOON.hit.w, MOON.hit.life, k * 0.8, c, 4, 3, false);
  },
  floor(x, y, k, c) {
    const [m] = moonsFor('floor', x, y, k);
    blaze(m, MOON.floor.w, MOON.floor.life, k, c, 5, 4, true);
  },
  // 완파 — 두 겹 달이 몸 앞뒤로(뒤 = 먹 한 획, 앞 = 불) → 앞 달이 불 날개 · 고리 → 불티 많이
  destroy(x, y, k, c) {
    const [back, front] = moonsFor('destroy', x, y, k);
    paintMoon(back, MOON.destroy.w * 0.5, '', MOON.destroy.life);
    blaze(front, MOON.destroy.w, MOON.destroy.life, k, c, 7, 6, true, 1.5);
  },
  whiff(x, y, c) {
    const [m] = moonsFor('whiff', x, y, 1);
    paintMoon(m, MOON.whiff.w, c, MOON.whiff.life, false);
  },
  // 칼 기운 — 날을 따라 작은 불 날개(날 방향으로 휜다) · 세 번에 한 번 불티가 떨어진다
  aura(b, n, c) {
    const u = 0.3 + n01() * 0.7;
    const x = b[0] + (b[2] - b[0]) * u;
    const y = b[1] + (b[3] - b[1]) * u;
    wing(x, y, Math.atan2(b[3] - b[1], b[2] - b[0]), 0.5, 1, 0.85, c); // i 1 = 늘 밝은 짝 몸(먹 밑동이 날에 붙으면 털로 읽힌다)
    if (n % 3 === 0) ember(x, y, 0.8, c, n / 3);
  },
  every: 0.09,
  tint: true,
  waza: {
    // 필살 큰 획을 따라 — 뿌리 → 끝으로 불 날개가 솟고, 다 솟은 뒤 불티가 떨어진다(k 1에서 즉시 + later ≤ 15)
    along(pts, k, c, dur) {
      const n = Math.min(9, Math.max(3, Math.round(pathLen(pts) / 45)));
      follow(pts, 0, dur, n, (x, y, ang, u, i) => wing(x, y, ang, 0.35 + 0.65 * u, i, k, c));
      follow(pts, dur + 0.06, 0.12, Math.min(6, n), (x, y, _a, _u, i) => ember(x, y, k, c, i));
    },
    // 마무리 — 친 방향으로 볼록한 달 하나가 불 날개 · 고리 · 불티로
    bloom(x, y, ang, k, c) {
      const m = moonAt(x, y, MOON.floor.r * k, ang, MOON.floor.span, n01() < 0.5 ? 1 : -1);
      blaze(m, MOON.floor.w * k, MOON.floor.life, k, c, 6, 6, true);
    },
  },
};
