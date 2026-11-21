// 그림자 대검(어둠) 레시피 — 공통 초승달(crescent.ts) 위에 짓는다. bladeFx RECIPES가 이어 붙이기만 한다.
// 꼴(설계서 §6 · 사용자 영상 어둠): 몸을 두르는 초승달(꼬리 먹 → 남보라 → 앞날 밝은 짝, 앞날 달군 속) →
// 2~3프레임 뒤 같은 호가 너덜너덜한 먹 연기로 바뀐다(호 바깥으로 마른 붓 갈래가 꼬리 쪽으로 끌려 나간다) +
// 그 위를 따라 밝은 짝 꺾인 줄이 호를 타고 그어진다 → 속 빈 연기 소용돌이(밖에서 안으로 말리는 한 붓) →
// 먹 조각이 위로 흩어진다(셋에 둘은 먹 · 남보라, 하나는 밝은 짝).
// 흑철(친 자리 발묵 · 베기 방향 누름 획 · 둥근 방울이 거꾸로 오름)과 갈린다: 이쪽은 호를 타는 연기 갈래 · 꺾인 줄 · 말리는 소용돌이 · 찢긴 조각.
// 불새(위로 솟는 불 혀 · 떨어지는 불티)와도 갈린다: 갈래는 호 바깥으로 끌리고, 조각은 오른다.
// 문법(불변 13): 먹 + 포인트 색 하나 · 알파 지우기 금지(모양으로) · shadowBlur · 블룸 · 가운데 동그라미 별 · 원판 + 방사형 띠 · 아이콘 금지.
// ⚠ bladeFx와 순환 import — 최상위에서 bladeFx 값을 부르지 않는다. 시험에서 이 파일을 bladeFx보다 먼저 import하지 않는다.
import { PALETTE } from '../../config';
import { bent, later, line, n01, put, samplePath, sgn, type Recipe } from '../bladeFx';
import { MOON, follow, liteOf, moonAt, moonPoint, moonsFor, morph, paintMoon, pathLen, scatter, swingMoon, type Moon } from './crescent';

const TAU = Math.PI * 2;
const INK = PALETTE.INK;

/** 진행 방향 ang의 법선 중 위쪽(−y) */
const upOf = (ang: number): number => {
  const a = ang - Math.PI / 2;
  return Math.sin(a) > 0 ? a + Math.PI : a;
};

/** 연기 갈래 — 호 위 (x, y)에서 위쪽 곁으로 피어오르다 꼬리 쪽(진행 반대)으로 말려 끌리는 마른 붓 획. 호에 붙어 천천히 떠오른다(날아가면 먹 부스러기로 읽혔다).
 *  바깥 쪽이 아니라 늘 위쪽이다 — 완파 앞 달(아래로 볼록)에서 바깥으로 뻗으면 땅에 묻혔다. u = 앞날에 가까울수록 길다. 셋에 하나만 색 */
function wisp(x: number, y: number, ang: number, u: number, i: number, k: number, c: string): void {
  const back = ang + Math.PI;
  const out = upOf(ang);
  const a = out + Math.atan2(Math.sin(back - out), Math.cos(back - out)) * 0.5; // 바깥 → 꼬리 쪽으로 기운다
  const L = (14 + 24 * u) * k * (0.8 + 0.4 * n01());
  const s = Math.sin(back - out) >= 0 ? 1 : -1;
  line(x, y, x + Math.cos(a) * L, y + Math.sin(a) * L, (4.2 + 4 * u) * k, '', {
    body: i % 3 === 1 ? c : INK, pr: 1, bend: s * L * (0.25 + 0.3 * n01()), dry: 0.65, gr: 0.22,
    life: 0.32 + 0.1 * u + 0.06 * n01(), vx: Math.cos(a) * 8 * k, vy: -16 * k,
  });
}

/**
 * 연기 초승달 — 한 붓 달(먹 꼬리 → 남보라 → 밝은 짝) 위 꼬리 쪽 7할에 너덜너덜한 먹 두 획을 덧긋는다(몸 위 굵게 · 바깥 가장자리 가늘게, 마른 붓 갈래 많이).
 * 남보라는 앞날 3할에만 남고, 달군 속은 앞 3할에 좁게(공통 달군 앞날 45%를 그대로 쓰면 남보라 띠가 몸을 덮어 번개 대검 색으로 읽혔다). 조각 4
 */
function smokeMoon(m: Moon, w: number, c: string, life: number): void {
  paintMoon(m, w, c, life, false);
  const o = { life: life * 1.1, size: m.r, rot: m.a0, sw: m.sw * 0.72, a: m.f, c1: INK, pr: 3, gr: 0.12 };
  put('sweep', m.cx, m.cy, { ...o, v: w * 1.15, dry: 0.72 });
  put('sweep', m.cx, m.cy, { ...o, size: m.r + w * 0.55, rot: m.a0 + m.sw * 0.08, sw: m.sw * 0.6, v: w * 0.6, dry: 0.85, life: life * 1.25 });
  put('sweep', m.cx, m.cy, {
    life: life * 0.5, size: m.r, rot: m.a0 + m.sw * 0.7, sw: m.sw * 0.3, v: w * 0.7, a: m.f, c1: liteOf(c), c2: c, dry: 0.12, pr: 3, gr: 0.06, hold: 0.7,
  });
}

/** 꺾인 줄 — 꺾은선 pts(월드) 위쪽 곁을 lift만큼 띄워 따라가는 밝은 짝 꺾인 획. 마디 폭을 흩는다(번갈아 같은 폭이면 계단 무늬) */
function jag(pts: readonly number[], amp: number, w: number, c: string, life: number, lift = 0): void {
  const out: number[] = [];
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = Math.min(n - 1, i + 1);
    const h = Math.max(0, i - 1);
    const o = upOf(Math.atan2(pts[j * 2 + 1] - pts[h * 2 + 1], pts[j * 2] - pts[h * 2]));
    const off = lift + (i === 0 || i === n - 1 ? 0 : (i % 2 ? 1 : -1) * amp * (0.45 + 0.75 * n01()));
    const t = i === 0 || i === n - 1 ? 0 : sgn() * amp * 0.6; // 진행 쪽으로도 흩는다 — 법선으로만 꺾으면 네모 톱니(계단)로 읽혔다
    out.push(pts[i * 2] + Math.cos(o) * off - Math.sin(o) * t, pts[i * 2 + 1] + Math.sin(o) * off + Math.cos(o) * t);
  }
  bent(out, w, '', { body: liteOf(c), life, dry: 0.3, pr: 1, gr: 0.1 });
}

/** 달 위 u0 → u1 꺾은선(n점) */
function moonSeg(m: Moon, u0: number, u1: number, n: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = moonPoint(m, u0 + ((u1 - u0) * i) / (n - 1));
    pts.push(x, y);
  }
  return pts;
}

/** 속 빈 연기 소용돌이 — 밖에서 안으로 한 바퀴 반 말린다. 바깥 6할은 굵은 먹 연기, 안쪽 반은 가는 남보라 한 붓(먹 머리 → 색 꼬리). 가운데는 비어 있다. 천천히 떠오른다 */
function curl(x: number, y: number, R: number, d: number, k: number, c: string): void {
  const pts: number[] = [];
  const a0 = n01() * TAU;
  for (let i = 0; i < 20; i++) {
    const t = i / 19;
    const a = a0 + d * t * Math.PI * 2.9;
    const r = R * (1 - 0.6 * t);
    pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8);
  }
  bent(pts.slice(0, 26), 7 * k, '', { life: 0.42, dry: 0.7, pr: 1, gr: 0.25, vy: -22 * k });
  later(0.03, () => bent(pts.slice(18), 3.6 * k, '', { body: c, life: 0.4, dry: 0.4, pr: 1, gr: 0.3, vy: -22 * k }));
}

/** 먹 조각 — 찢긴 조각이 흔들리며 위로 흩어진다. 먹 · 시그니처 · 밝은 짝 번갈아(먹이 가장 많다) */
function flake(x: number, y: number, k: number, c: string, i: number): void {
  put('leaf', x + sgn() * 8 * k, y + sgn() * 4, {
    vx: sgn() * 60 * k, vy: (-70 - n01() * 70) * k, g: -30 * k, drag: 1.5,
    life: 0.65 + n01() * 0.3, size: (3.6 + n01() * 2.8) * k, rot: n01() * TAU, spin: sgn() * 5,
    c1: i % 3 === 2 ? liteOf(c) : i % 3 === 1 ? c : INK, st: 4,
  });
}

/** 한 사건 — 달을 긋고 → 2~3프레임 뒤 연기 갈래 + 꺾인 줄로 바뀌고 → (소용돌이) → 먹 조각이 오른다 */
function gloom(m: Moon, w: number, life: number, k: number, c: string, n: number, bits: number, withCurl: boolean, wk = 1): void {
  smokeMoon(m, w, c, life);
  morph(m, 0.04, n, (x, y, ang, u, i) => wisp(x, y, ang, 0.25 + 0.75 * u, i, k * wk, c), 0.03);
  later(0.05, () => jag(moonSeg(m, 0.12, 1, 7), 7 * k * wk, 2.6 * k * wk, c, life + 0.06, w * 0.45));
  if (withCurl) {
    later(0.1, () => {
      const [x, y] = moonPoint(m, 0.78);
      const R = Math.max(10, m.r * 0.4);
      curl(x, y - R, R, Math.sign(m.sw) || 1, k, c);
    });
  }
  scatter(0.12, bits, (i) => {
    const [x, y] = moonPoint(m, 0.2 + (0.75 * i) / Math.max(1, bits - 1));
    flake(x, y - 4, k, c, i);
  });
}

export const shade: Recipe = {
  trail: { w: 12, dry: 0.3 },
  own: true,
  // 칼길 — 몸을 두르는 굵은 초승달 → 앞쪽이 연기 갈래로 풀리고 꺾인 줄이 호를 탄다
  swing(fx, fy, w, life, c, turn, grow) {
    const m = swingMoon(fx, fy, turn, grow);
    const s = Math.max(0.8, w / 12);
    smokeMoon(m, w * 1.5, c, life * 0.8);
    morph(m, 0.04, 3, (x, y, ang, u, i) => wisp(x, y, ang, 0.4 + 0.6 * u, i, 0.75 * s, c), 0.03);
    later(0.05, () => jag(moonSeg(m, 0.3, 1, 6), 6 * s, 2.4 * s, c, life * 0.9, w * 0.6));
  },
  hit(x, y, k, c) {
    const [m] = moonsFor('hit', x, y, k);
    gloom(m, MOON.hit.w, MOON.hit.life, k * 0.8, c, 3, 3, false);
  },
  floor(x, y, k, c) {
    const [m] = moonsFor('floor', x, y, k);
    gloom(m, MOON.floor.w, MOON.floor.life, k, c, 5, 4, true);
  },
  // 완파 — 두 겹 달이 몸 앞뒤로(뒤 = 먹 한 획, 앞 = 어둠) → 앞 달이 연기 · 꺾인 줄 · 소용돌이 → 조각 많이. 뒤 달에도 꺾인 줄이 한 번
  destroy(x, y, k, c) {
    const [back, front] = moonsFor('destroy', x, y, k);
    paintMoon(back, MOON.destroy.w * 0.5, '', MOON.destroy.life);
    later(0.07, () => jag(moonSeg(back, 0, 0.85, 6), 6 * k, 2.2 * k, c, MOON.destroy.life));
    morph(back, 0.06, 4, (x, y, ang, u, i) => wisp(x, y, ang, 0.6 + 0.4 * u, i * 3, k * 1.6, c), 0.05); // 뒤 달 위로 먹 연기가 높이 피어오른다(i × 3 = 늘 먹)
    gloom(front, MOON.destroy.w, MOON.destroy.life, k, c, 6, 10, true, 1.4);
  },
  whiff(x, y, c) {
    const [m] = moonsFor('whiff', x, y, 1);
    paintMoon(m, MOON.whiff.w, c, MOON.whiff.life, false);
  },
  // 칼 기운 — 날에서 먹 연기 갈래가 풀려 나가고, 세 번에 한 번 먹 조각이 오른다
  aura(b, n, c) {
    const u = 0.3 + n01() * 0.7;
    const x = b[0] + (b[2] - b[0]) * u;
    const y = b[1] + (b[3] - b[1]) * u;
    const ang = Math.atan2(b[3] - b[1], b[2] - b[0]);
    wisp(x, y, ang, 0.45, n, 0.8, c);
    if (n % 3 === 0) flake(x, y, 0.8, c, n / 3);
  },
  every: 0.09,
  tint: true,
  waza: {
    // 필살 큰 획을 따라 — 뿌리 → 끝으로 연기 갈래가 풀리고 꺾인 줄이 마디마다 이어 그어지고, 다 번진 뒤 먹 조각이 오른다(k 1에서 즉시 + later ≤ 19)
    along(pts, k, c, dur) {
      const L = pathLen(pts);
      const n = Math.min(9, Math.max(3, Math.round(L / 45)));
      follow(pts, 0, dur, n, (x, y, ang, u, i) => wisp(x, y, ang, 0.5 + 0.5 * u, i, k, c));
      // 꺾인 줄 — 길이를 마디(≤ 4)로 나눠 차례로. 마디 안은 26px마다 크게 꺾는다(16px이면 고른 톱니 · 계단으로 읽혔다)
      const all = samplePath(pts, 26);
      const segs = Math.min(4, Math.max(1, Math.ceil(L / 140)));
      for (let s = 0; s < segs && all.length > 1; s++) {
        const a = Math.floor((s * (all.length - 1)) / segs);
        const b = Math.ceil(((s + 1) * (all.length - 1)) / segs);
        const sub = all.slice(a, b + 1).flatMap((p) => [p.x, p.y]);
        later((s / segs) * dur, () => jag(sub, 12 * k, 3 * k, c, 0.3, 6 * k));
      }
      follow(pts, dur + 0.05, 0.12, Math.min(6, n), (x, y, _a, _u, i) => flake(x, y, k, c, i));
    },
    // 마무리 — 친 방향으로 볼록한 달 하나가 연기 · 꺾인 줄 · 소용돌이 · 먹 조각으로
    bloom(x, y, ang, k, c) {
      const m = moonAt(x, y, MOON.floor.r * k, ang, MOON.floor.span, n01() < 0.5 ? 1 : -1);
      gloom(m, MOON.floor.w * k, MOON.floor.life, k, c, 6, 6, true);
    },
  },
};
