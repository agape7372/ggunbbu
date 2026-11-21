// 그림자 대검(어둠) 레시피 3판 — 설계서 DESIGN3 §2 「그림자 대검」 줄. bladeFx RECIPES가 이어 붙이기만 한다.
// 꼴: 낮게 퍼졌다 위로. 발 높이(몸 뒤 = 친 쪽의 반대 = 아래)에서 너덜한 먹 번짐 덩어리가 양옆으로 느리게(8프레임) 기어 나간다
// (한쪽이 길고 반대쪽은 짧다 · 가장자리 마른 붓 갈래) → 긴 쪽 끝 위로 속 빈 소용돌이 하나(한 붓) → 먹 조각이 천천히 위로 오른다.
// 획이 아니라 면 · 번짐이다. 남보라는 덩어리 가장자리 한두 군데뿐이고 먹이 8할이다. 꺾인 줄 · 지그재그 · 몸 두르는 고리는 없다.
// 다른 넷과 갈린다: 불새 = 친 자리 위 날개 V · 해일 = 땅에서 앞으로 말린 파도(세로로 선다) · 고압선 = 가로 직선 꺾임 ·
// 고드름 = 앞 공중 세모 다발 · 흑철 = 친 자리 사선 누름 획 + 둥근 방울. 이쪽만 발밑에 납작하게 깔린 먹 면이다.
// 몸 둘레(발 위 0~70 · 좌우 ±22, scaled 1.6배 뒤)엔 덩어리를 두지 않는다 — 키우기 전 좌우 14 밖에서 시작한다.
// 문법(불변 13): 먹 + 포인트 색 하나 · 알파 지우기 금지(모양으로) · shadowBlur · 블룸 · 가운데 동그라미 별 · 원판 + 방사형 띠 · 아이콘 금지.
// ⚠ bladeFx와 순환 import — 최상위에서 bladeFx 값을 부르지 않는다. 시험에서 이 파일을 bladeFx보다 먼저 import하지 않는다.
import { PALETTE } from '../../config';
import { bent, later, line, n01, put, sgn, type Recipe } from '../bladeFx';
import { follow, moonPts, pathLen, scatter, swingMoon } from './geom';

const TAU = Math.PI * 2;
const INK = PALETTE.INK;
const UP = -Math.PI / 2;
/** 번짐 박자 — 덩어리가 8프레임에 걸쳐 바깥으로 기어 나간다 */
const CREEP = 8 / 60;

/**
 * 크기(키우기 전 px · k = 콤보 단). R = 첫 덩이 반지름 · n / m = 긴 쪽 / 짧은 쪽 덩이 수 · gap = 몸 둘레 비움 ·
 * curl = 소용돌이 반지름(0 = 없음) · bits = 오르는 조각 수 · hue = 남보라 가장자리 수
 */
const SIZE = {
  whiff: { R: 3.4, n: 1, m: 0, gap: 0, life: 0.34, curl: 0, bits: 1, hue: 1 },
  hit: { R: 6, n: 3, m: 1, gap: 14, life: 0.5, curl: 8, bits: 2, hue: 1 },
  floor: { R: 7.5, n: 3, m: 2, gap: 14, life: 0.6, curl: 11, bits: 3, hue: 1 },
  destroy: { R: 9, n: 4, m: 3, gap: 14, life: 0.72, curl: 14, bits: 5, hue: 2 },
} as const;
type Size = (typeof SIZE)[keyof typeof SIZE];
/** 친 자리 → 발 높이(키우기 전 거리). scaled 1.6배면 서 있는 졸라맨 발 둘레가 된다. 땅 밑은 put이 땅선에서 자른다 */
const FOOT = { hit: 52, floor: 38, destroy: 44 } as const;

/** 속 빈 소용돌이 — 밖에서 안으로 한 바퀴 반 말리는 한 붓(바깥 굵은 먹 → 안쪽 가는 남보라 꼬리). 가운데는 비고 천천히 떠오른다 */
function curl(x: number, y: number, R: number, d: number, c: string, life: number): void {
  const pts: number[] = [];
  const a0 = n01() * TAU;
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const a = a0 + d * t * Math.PI * 2.7;
    const r = R * (1 - 0.6 * t);
    pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.85);
  }
  bent(pts.slice(0, 22), Math.max(2.4, R * 0.55), '', { life, dry: 0.7, pr: 1, gr: 0.3, vy: -20 });
  later(0.03, () => bent(pts.slice(18), Math.max(1.6, R * 0.28), '', { body: c, life: life * 0.9, dry: 0.4, pr: 1, gr: 0.3, vy: -20 }));
}

/** 먹 조각 — 찢긴 조각이 흔들리며 천천히 오른다(흑철 둥근 방울과 달리 네 귀 찢긴 면). 셋에 하나만 남보라 */
function flake(x: number, y: number, k: number, c: string, i: number): void {
  put('leaf', x + sgn() * 4 * k, y, {
    vx: sgn() * 18 * k, vy: (-32 - n01() * 30) * k, g: -12 * k, drag: 1.2,
    life: 0.8 + n01() * 0.3, size: (3 + n01() * 2.2) * k, rot: n01() * TAU, spin: sgn() * 3,
    c1: i % 3 === 2 ? c : INK, st: 4,
  });
}

/**
 * 그림자 한 벌 — 바탕 (bx, by)(발 높이)에서 ang(친 쪽 = 「위」) 반대편에 깔린다. 옆 = ang에 수직.
 * 덩어리(번지는 먹 면)가 몸 밖 gap부터 바깥으로 CREEP 동안 차례로 → 위 가장자리를 따라 마른 붓 갈래 → 긴 쪽 끝 위 소용돌이 → 조각이 오른다
 */
function gloom(bx: number, by: number, ang: number, S: Size, k: number, c: string): void {
  const [ux, uy] = [Math.cos(ang), Math.sin(ang)];
  const [sx, sy] = [-uy, ux];
  const at = (a: number, b: number): [number, number] => [bx + sx * a + ux * b, by + sy * a + uy * b];
  const R = S.R * k;
  const step = R;
  const dir = n01() < 0.5 ? 1 : -1;
  let hue: number = S.hue;
  let reach = S.gap + R;
  const drawn = Math.min(0.5, CREEP / (S.life * 1.2)); // 면이 다 그어지는 몫 = 8프레임
  for (const [s, n] of [[dir, S.n], [-dir, S.m]] as const) {
    if (!n) continue;
    const far = S.gap + R + step * (n - 1);
    if (s === dir) reach = far;
    const out = Math.atan2(sy * s, sx * s) - s * 0.15; // 바깥으로 · 살짝 위로 끌린다
    // 면 — 몸 밖에서 바깥으로 기어 나가는 넓고 납작한 먹 붓 한 획(가운데가 두껍다). 덩어리의 몸이다
    const [f0x, f0y] = at(s * S.gap, R * 0.85);
    const [f1x, f1y] = at(s * (far + R * 0.9), R * 0.7);
    line(f0x, f0y, f1x, f1y, R * 2.1, '', { pr: 3, dry: 0.28, gr: drawn, bend: -s * R * 0.3, life: S.life });
    // 번짐 — 면 아래 가장자리에 먹이 스며 나온다(바깥으로 갈수록 늦게 · 작게)
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : i / (n - 1);
      const r = R * 0.75 * (1 - 0.25 * t) * (0.85 + 0.3 * n01());
      const [px, py] = at(s * (S.gap + R + step * i + sgn() * 2), r * 0.3);
      later(t * CREEP, () => put('spat', px, py, { life: S.life * (1 - 0.12 * t), size: r, rot: out + 0.5 * s, v: 1, c1: INK, gr: 1, hold: 1 }));
    }
    // 마른 붓 갈래 — 면 위 가장자리를 바깥으로 쓸고 끝이 들린다. 긴 쪽 갈래는 면 끝에서 소용돌이 밑동까지 솟는다(낮게 퍼졌다 위로 = 한 줄기).
    // 남보라는 이 꼬리에만(먹 머리 → 남보라 → 밝은 짝). 긴 쪽은 아래에 가는 먹 갈래 하나 더
    const tint = hue-- > 0;
    const main = s === dir;
    later(CREEP * 0.4, () => {
      const [x0, y0] = at(s * (S.gap + R * 0.4), R * 1.5);
      const [x1, y1] = main ? at(s * (far + R * 1.6), R * 2.6 + S.curl * k) : at(s * (far + R * 2), R * 2.2);
      line(x0, y0, x1, y1, R * 0.6, '', { body: tint ? c : INK, pr: 3, dry: 0.6, gr: 0.5, bend: -s * R * (main ? 1.2 : 0.5), life: S.life * 0.9 });
      if (!main) return;
      const [x2, y2] = at(s * (S.gap + R), R * 0.1);
      const [x3, y3] = at(s * (far + R * 2.6), R * 0.7);
      line(x2, y2, x3, y3, R * 0.26, '', { pr: 1, dry: 0.75, gr: 0.6, life: S.life * 0.85 });
    });
  }
  if (S.curl) {
    later(CREEP + 0.02, () => {
      const cr = S.curl * k;
      const [x, y] = at(dir * (reach + R * 1.6 + cr * 0.6), R * 2.6 + cr * 1.9);
      curl(x, y, cr, dir, c, S.life * 0.85);
    });
  }
  scatter(CREEP + 0.04, S.bits, (i) => {
    const [x, y] = at(dir * (S.gap + R + n01() * (reach - S.gap)) * (i % 2 ? -0.6 : 1), R * 1.2);
    flake(x, y, k, c, i);
  });
}

export const shade: Recipe = {
  trail: { w: 12, dry: 0.3 },
  own: true,
  // 칼길 — 칼이 지나간 호를 너덜한 먹 문지름 넷으로(한 프레임씩 늦게 · 굵기 제각각). 칼끝 마디만 먹 → 남보라
  swing(fx, fy, w, life, c, turn, grow) {
    const p = moonPts(swingMoon(fx, fy, turn, grow), 5);
    for (let i = 0; i < 4; i++) {
      const last = i === 3;
      later(i / 60, () => line(p[i * 2] + sgn() * 2, p[i * 2 + 1] + sgn() * 2, p[i * 2 + 2], p[i * 2 + 3], w * (1.05 + 0.4 * n01()), '', {
        body: last ? c : INK, pr: 3, dry: 0.72, bend: sgn() * w * 0.6, life: life * (0.75 + 0.1 * i), gr: 0.3,
      }));
    }
  },
  hit(x, y, k, c) {
    gloom(x, y + FOOT.hit, UP, SIZE.hit, k, c);
  },
  floor(x, y, k, c) {
    gloom(x, y + FOOT.floor, UP, SIZE.floor, k, c);
  },
  destroy(x, y, k, c) {
    gloom(x, y + FOOT.destroy, UP, SIZE.destroy, k, c);
  },
  // 헛스윙 — 칼끝 자리에 작은 번짐 하나 + 갈래 + 조각 하나
  whiff(x, y, c) {
    gloom(x, y, UP, SIZE.whiff, 1, c);
  },
  // 칼 기운 — 날에서 마른 먹 문지름이 옆으로 풀려 천천히 오르고, 세 번에 한 번 조각
  aura(b, n, c) {
    const u = 0.3 + n01() * 0.7;
    const x = b[0] + (b[2] - b[0]) * u;
    const y = b[1] + (b[3] - b[1]) * u;
    const s = n % 2 ? 1 : -1;
    line(x, y, x + s * (8 + 6 * n01()), y - 3, 3.4, '', { body: n % 4 === 3 ? c : INK, pr: 3, dry: 0.75, life: 0.4, vx: s * 10, vy: -16 });
    if (n % 3 === 0) flake(x, y, 0.8, c, n / 3);
  },
  every: 0.09,
  tint: true,
  waza: {
    // 필살 큰 획을 따라 — 획 아래로 먹 번짐이 처지며 차례로 번지고(끝 덩이만 남보라) → 끝 위 소용돌이 → 조각이 오른다(k 1에서 즉시 + later ≤ 19)
    along(pts, k, c, dur) {
      const n = Math.min(5, Math.max(2, Math.round(pathLen(pts) / 80)));
      const R = 6 * k;
      follow(pts, 0, dur, n, (x, y, ang, _u, i) => {
        const [ca, sa] = [Math.cos(ang), Math.sin(ang)];
        put('spat', x, y + R * 0.7, { life: 0.5, size: R * (0.85 + 0.3 * n01()), rot: ang + (ca >= 0 ? 0.3 : -0.3), v: 1, c1: i === n - 1 ? c : INK, gr: 1, hold: 1 });
        line(x - ca * R * 1.6, y + R * 1.2, x + ca * R * 2.2, y + sa * R * 2.2 + R * 0.3, R * 0.36, '', { pr: 3, dry: 0.8, gr: 0.5, life: 0.42 });
      });
      later(dur + 0.04, () => {
        const [x, y] = [pts[pts.length - 2], pts[pts.length - 1]];
        curl(x, y - 14 * k, 9 * k, sgn() > 0 ? 1 : -1, c, 0.45);
      });
      follow(pts, dur + 0.06, 0.12, Math.min(5, n + 1), (x, y, _a, _u, i) => flake(x, y, k, c, i));
    },
    // 마무리 — 완파 꼴을 친 방향 ang에 맞춰(친 쪽 반대편에 깔리고 옆으로 기어 나간다)
    bloom(x, y, ang, k, c) {
      gloom(x - Math.cos(ang) * FOOT.destroy, y - Math.sin(ang) * FOOT.destroy, ang, SIZE.destroy, k, c);
    },
  },
};
