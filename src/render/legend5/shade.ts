// 그림자 대검(어둠) 레시피 3판 — 설계서 DESIGN3 §2 「그림자 대검」 줄. bladeFx RECIPES가 이어 붙이기만 한다.
// 꼴: 낮게 퍼졌다 위로. 발 높이에서 넓은 젖은 먹 면(이어진 면 세 장 + 가장자리 번짐)이 몸 바로 바깥부터 양옆으로 8프레임에 걸쳐 기어 나가고
// (한쪽이 길고 반대쪽은 짧다) → 면 위 가장자리에서 마른 붓 갈래가 위로 피어오르고(바깥 몇 가닥 끝만 남보라) → 머리 위쪽 뒤에 속 빈 소용돌이 하나(한 붓)
// → 찢긴 먹 조각이 천천히 위로 오른다. 획이 아니라 면 · 번짐이다. 먹이 8할이다. 꺾인 줄 · 지그재그 · 몸 두르는 고리는 없다.
// 다른 넷과 갈린다: 불새 = 친 자리 위 날개 V · 해일 = 땅에서 앞으로 말린 파도(세로로 선다) · 고압선 = 가로 직선 꺾임 ·
// 고드름 = 앞 공중 세모 다발 · 흑철 = 친 자리 사선 누름 획 + 둥근 방울. 이쪽만 발밑에 납작하게 깔린 먹 면이다.
// 11-21 1차는 면이 금방 말라(획의 dry는 삶에 따라 오른다) 점 몇 개로 부서졌고, 땅선에 붙어 반쯤 잘렸고, 소용돌이가 화면 끝에 걸렸다 —
// 면은 젖은 채(dry 0) 오래 살고 땅선 위에 얹히며, 소용돌이는 주인공 자리 기준 · 화면 폭 안으로 묶는다.
// 문법(불변 13): 먹 + 포인트 색 하나 · 알파 지우기 금지(모양으로) · shadowBlur · 블룸 · 가운데 동그라미 별 · 원판 + 방사형 띠 · 아이콘 금지.
// ⚠ bladeFx와 순환 import — 최상위에서 bladeFx 값을 부르지 않는다. 시험에서 이 파일을 bladeFx보다 먼저 import하지 않는다.
import { PALETTE, VIEW } from '../../config';
import { bent, later, line, n01, put, sgn, type Recipe } from '../bladeFx';
import { follow, moonPts, pathLen, scatter, swingMoon } from './geom';

const TAU = Math.PI * 2;
const INK = PALETTE.INK;
const UP = -Math.PI / 2;
/** 번짐 박자 — 면이 8프레임에 걸쳐 바깥으로 기어 나간다 */
const CREEP = 8 / 60;
/** 소용돌이가 서는 박자(키운 그림은 later가 1.2배 늘인다 → 완파 7프레임에 서서 3프레임에 다 그어진다) */
const CURL_AT = 6 / 60;
/** 삶 L초인 획이 f프레임 만에 다 그어지는 몫(키운 그림은 삶이 1.2배라 그만큼 나눈다) */
const grIn = (f: number, L: number): number => Math.min(0.4, f / 60 / (L * 1.2));

/**
 * 크기(키우기 전 px · k = 콤보 단 · 사건 그림은 scaled 1.6배, 완파는 k 1.25라 2배).
 * gap = 몸 둘레 비움 · reach = 긴 쪽 면 끝 · th = 면 두께 · up = 갈래 높이 [작게, 크게] · wisp = 갈래 수 · hue = 남보라 갈래 수 ·
 * curl = 소용돌이 반지름(0 = 없음) · lift / back = 소용돌이 자리(발에서 위 · 뒤) · bits = 오르는 조각 수 · life = 면이 사는 초
 */
const SIZE = {
  whiff: { gap: 3, reach: 16, th: 4.5, up: [9, 14], wisp: 2, hue: 1, curl: 0, lift: 0, back: 0, bits: 1, life: 0.42 },
  hit: { gap: 9, reach: 25, th: 7, up: [16, 26], wisp: 4, hue: 1, curl: 8, lift: 42, back: 16, bits: 2, life: 0.7 },
  floor: { gap: 11, reach: 40, th: 9, up: [22, 36], wisp: 5, hue: 2, curl: 10, lift: 48, back: 22, bits: 3, life: 0.85 },
  destroy: { gap: 11, reach: 50, th: 12, up: [25, 45], wisp: 6, hue: 3, curl: 12, lift: 50, back: 28, bits: 5, life: 1 },
} as const;
type Size = (typeof SIZE)[keyof typeof SIZE];
/** 친 자리 → 발 높이(키우기 전 거리). scaled 1.6배면 서 있는 졸라맨 발 둘레가 된다 */
const FOOT = { hit: 52, floor: 38, destroy: 44 } as const;
/** 소용돌이가 들어갈 화면 가로 범위(월드 x) */
const SAFE = [60, VIEW.W - 60] as const;

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
  bent(pts.slice(0, 22), Math.max(2.4, R * 0.62), '', { life, dry: 0.45, pr: 1, gr: grIn(3, life), vy: -20 });
  later(0.03, () => bent(pts.slice(18), Math.max(1.6, R * 0.34), '', { body: c, life: life * 0.9, dry: 0.3, pr: 1, gr: grIn(3, life * 0.9), vy: -20 }));
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
 * 그림자 한 벌 — 바탕 (bx, by)(발 높이)에 깔린다. ang = 「위」(친 쪽), 옆 = ang에 수직.
 * 면 세 장(몸 밖 gap부터 바깥으로 CREEP 동안 그어진다) + 가장자리 번짐 → 위 가장자리에서 마른 붓 갈래가 피어오름 → 머리 위쪽 뒤 소용돌이 → 조각이 오른다
 */
function gloom(bx: number, by: number, ang: number, S: Size, k: number, c: string): void {
  const [ux, uy] = [Math.cos(ang), Math.sin(ang)];
  const [sx, sy] = [-uy, ux];
  const at = (a: number, b: number): [number, number] => [bx + sx * a + ux * b, by + sy * a + uy * b];
  const [gap, th, L] = [S.gap * k, S.th * k, S.life];
  const dir = n01() < 0.5 ? 1 : -1;
  const gr = grIn(8, L); // 면이 다 그어지는 몫 = 8프레임
  const wet = { dry: 0, gr, life: L, pr: 2 } as const; // 젖은 면 — 마르지 않은 채 끝이 살짝 뭉툭하게 빠진다
  const far = (s: number): number => S.reach * k * (s === dir ? 1 : 0.75);
  for (const s of [dir, -dir]) {
    const reach = far(s);
    const out = s > 0 ? 0 : Math.PI;
    // 면 세 장 — 몸 바로 바깥의 두꺼운 머리(즉시) · 가운데 몸(바깥 끝까지) · 그 아래로 더 멀리 스미는 얇은 밑장. 위 가장자리는 살짝 부푼다
    line(...at(s * gap, th * 0.8), ...at(s * (gap + (reach - gap) * 0.5), th * 0.7), th * 1.15, '', { ...wet, pr: 5, gr: grIn(3, L), bend: -s * th * 0.2 });
    line(...at(s * (gap + th * 0.3), th * 0.55), ...at(s * reach, th * 0.45), th * 1.25, '', { ...wet, pr: 5, bend: -s * th * 0.3 }); // 몸 쪽이 두껍고 바깥 끝은 가늘게 스민다
    later(2 / 60, () => line(...at(s * (gap + th * 0.6), th * 0.2), ...at(s * reach * 1.1, th * 0.15), th * 0.6, '', { ...wet, dry: 0.12, life: L * 0.95 }));
    // 번짐 — 몸 쪽 밑 가장자리는 곧바로, 바깥 끝은 면이 닿을 때 먹이 스며 커진다
    put('spat', ...at(s * (gap + th * 0.9), th * 0.3), { life: L * 0.9, size: th * 0.55, rot: out, v: 2, c1: INK, gr: 1, hold: 1 });
    later(CREEP * 0.8, () => put('spat', ...at(s * reach * 1.02, th * 0.35), { life: L * 0.8, size: th * 0.6, rot: out, v: 3, c1: INK, gr: 1, hold: 1 }));
  }
  // 마른 붓 갈래 — 면 위 가장자리에서 바깥 위로 피어오른다(몸 쪽부터 차례로). 남보라는 바깥 몇 가닥의 꼬리에만(먹 머리 → 남보라 → 밝은 짝)
  const pairs = Math.ceil(S.wisp / 2);
  for (let i = 0; i < S.wisp; i++) {
    const s = i % 2 ? -dir : dir;
    const f = (Math.floor(i / 2) + 0.5) / pairs;
    const a = s * (gap + (far(s) - gap) * (0.15 + 0.75 * f));
    const h = (S.up[0] + (S.up[1] - S.up[0]) * (1 - f * 0.6) * (0.8 + 0.2 * n01())) * k;
    const tint = i >= S.wisp - S.hue;
    later(2 / 60 + f * CREEP * 0.7, () => line(...at(a, th * 0.9), ...at(a + s * h * 0.35, th + h), th * 0.42, '', {
      body: tint ? c : INK, pr: 5, dry: 0.5, gr: grIn(4, L * 0.8), bend: s * h * 0.12, life: L * 0.8, vy: -10,
    }));
  }
  // 속 빈 소용돌이 — 주인공 머리 위쪽 뒤(발에서 lift 위 · back 옆). 화면 가로 SAFE 안으로 묶는다
  if (S.curl) {
    later(CURL_AT, () => {
      const cr = S.curl * k;
      const [x, y] = at(-dir * S.back * k, S.lift * k);
      // ponytail: 묶음은 키우기 전 좌표 기준이다 — scaled는 lane 자리(180 하나)를 축으로 넓히니 back · curl 크기가 범위를 지킨다. lane이 늘면 put 뒤 좌표로 묶을 것
      curl(Math.min(SAFE[1] - cr, Math.max(SAFE[0] + cr, x)), y, cr, dir, c, L * 0.85);
    });
  }
  scatter(CREEP + 0.04, S.bits, (i) => {
    const s = i % 2 ? -dir : dir;
    flake(...at(s * (gap + n01() * (far(s) - gap)), th * 1.4), k, c, i);
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
  // 헛스윙 — 칼끝 자리에 작은 면 한 쌍 + 갈래 둘 + 조각 하나(소용돌이 없음)
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
    // 필살 큰 획을 따라 — 획 밑에 젖은 먹 면이 차례로 깔리고 그 위로 갈래가 피어오른다(둘에 하나 남보라) → 끝 위 소용돌이 → 조각이 오른다(k 1에서 즉시 + later ≤ 18)
    along(pts, k, c, dur) {
      const n = Math.min(5, Math.max(2, Math.round(pathLen(pts) / 80)));
      const th = 6 * k;
      follow(pts, 0, dur, n, (x, y, ang, _u, i) => {
        const [ca, sa] = [Math.cos(ang), Math.sin(ang)];
        const s = ca >= 0 ? 1 : -1;
        line(x - ca * th * 2, y + th * 0.6 - sa * th * 2, x + ca * th * 2, y + th * 0.6 + sa * th * 2, th, '', { dry: 0, pr: 2, gr: 0.3, life: 0.55, bend: -s * th * 0.3 });
        line(x, y, x + s * th * 0.8, y - th * 2.6, th * 0.4, '', { body: i % 2 ? c : INK, pr: 5, dry: 0.5, gr: 0.35, life: 0.45, vy: -10 });
      });
      later(dur + 0.04, () => {
        const [x, y] = [pts[pts.length - 2], pts[pts.length - 1]];
        curl(Math.min(SAFE[1] - 9 * k, Math.max(SAFE[0] + 9 * k, x)), y - 14 * k, 9 * k, sgn() > 0 ? 1 : -1, c, 0.45);
      });
      follow(pts, dur + 0.06, 0.12, Math.min(5, n + 1), (x, y, _a, _u, i) => flake(x, y, k, c, i));
    },
    // 마무리 — 완파 꼴을 친 방향 ang에 맞춰(친 쪽 반대편에 깔리고 옆으로 기어 나간다)
    bloom(x, y, ang, k, c) {
      gloom(x - Math.cos(ang) * FOOT.destroy, y - Math.sin(ang) * FOOT.destroy, ang, SIZE.destroy, k, c);
    },
  },
};
