// 고압선 대검(전기) 레시피 — 3판(11-21 설계서 DESIGN3 §2 「고압선」 줄). bladeFx RECIPES가 이어 붙이기만 한다.
// 꼴: 친 자리를 **가로질러 좌우로 길게** 뻗는 **직선 꺾임 두 줄**(먹 한 줄 + 노랑 한 줄, 같은 꺾임으로 나란히). 곡선 0.
// 박자: 번쩍(머리가 1프레임 안에 끝까지 펼쳐진다) → 바로 끊김 → 3프레임 뒤 같은 길로 한 번 더 짧게 깜빡.
// 흩어짐: 짧은 꺾인 잔 번개 조각이 사방으로 곧게(떨어지지 않는다) 날아간다.
// 사건마다 꼴은 같고 길이만 다르다: whiff < hit < floor < destroy · 필살 bloom = destroy 꼴(친 쪽으로 밀어 둔다) ·
// 필살 along = 큰 획을 따라 가로 쌍줄이 사다리 가로대처럼 차례로 번쩍.
// 갈림: 번개 대검 = 하늘에서 내리꽂는 보라 세로 지그재그 / 이쪽 = 수평 · 노랑. 몸을 두르는 고리 · 타원 · 달은 짓지 않는다.
// 문법(불변 13): 먹 + 포인트 색 하나 · 알파 지우기 금지(모양으로) · shadowBlur · 블룸 · 가운데 동그라미 별 · 원판 + 방사형 띠 · 아이콘 금지.
// ⚠ bladeFx와 순환 import — 최상위에서 bladeFx 값을 부르지 않는다. 시험에서 이 파일을 bladeFx보다 먼저 import하지 않는다.
import { VIEW } from '../../config';
import { bent, later, n01, sgn, type Recipe } from '../bladeFx';
import { follow, liteOf, moonPoint, pathLen, swingMoon } from './crescent';

const GROUND = VIEW.GROUND_Y;

/** 사건마다 크기 — half = 가로 반 길이 · amp = 꺾임 높이 · w = 굵기 · sparks = 조각 수 · slow = 박자 배율(큰 사건일수록 오래). scaled 안이라 k = 콤보 단만 */
const BOLT = {
  whiff: { half: 22, amp: 6, w: 5, sparks: 1, slow: 1 },
  hit: { half: 46, amp: 10, w: 8, sparks: 5, slow: 1 },
  floor: { half: 72, amp: 12, w: 10, sparks: 8, slow: 1.3 },
  destroy: { half: 112, amp: 15, w: 12, sparks: 12, slow: 1.6 },
} as const;
/** 박자(초) — 번쩍 살 때 · 깜빡 나오는 때 · 깜빡 살 때 */
const FLASH = 0.12;
const BLINK_AT = 0.16;
const BLINK = 0.07;

/**
 * 가로 꺾은선 — (x, y)를 지나 좌우로 half씩. 마디 길이 · 꺾임 높이를 흩는다(고르면 톱니 무늬).
 * dir = 긋는 쪽(머리 = 먹 쪽). 같은 길을 두 번(번쩍 · 깜빡) 쓰려고 점만 돌려준다
 */
function boltPath(x: number, y: number, half: number, amp: number, dir: number): number[] {
  const n = Math.min(9, Math.max(3, Math.round(half / 14)));
  const pts = [x - dir * half, y + sgn() * amp * 0.3];
  for (let i = 1, f = 0; i <= n; i++) {
    f = i === n ? 1 : Math.min(0.97, f + (1 / n) * (0.55 + 0.9 * n01()));
    const off = i === n ? sgn() * amp * 0.3 : (i % 2 ? 1 : -1) * amp * (0.45 + 0.55 * n01());
    pts.push(x - dir * half + dir * 2 * half * f, y + off);
  }
  return pts;
}

/** 점열을 (dx, dy)만큼 옮긴다 */
const shift = (pts: readonly number[], dx: number, dy: number): number[] => pts.map((q, i) => q + (i % 2 ? dy : dx));

/**
 * 나란한 꺾인 획 둘 — 같은 꺾임으로 위 = 먹 한 줄 · 아래 = 시그니처 몸 + 밝은 짝 속(종이빛 달군 속).
 * gr 작게 = 머리가 1프레임 안에 끝까지 펼쳐진다(번쩍). 조각 2
 */
function pair(pts: readonly number[], w: number, life: number, c: string): void {
  const gap = w * 0.6;
  // 고른 선 누름(pr 2) — 붓 잔상 누름(3)은 끝이 가늘어 잎사귀 · 띠로 읽혔다(3판 1차 캡처)
  bent(shift(pts, 0, -gap), w * 0.36, '', { life, dry: 0.2, pr: 2, gr: 0.03 });
  bent(shift(pts, 0, gap * 0.25), w * 0.5, liteOf(c), { body: c, life: life * 1.1, dry: 0.18, pr: 2, gr: 0.03, hold: 0.55 });
}

/**
 * 잔 번개 조각 — (x, y)에서 ang 쪽으로 곧게 날아가는 짧은 Z(꺾임 한 번). 셋에 둘은 시그니처(먹 뿌리 → 노랑), 하나는 밝은 짝.
 * 땅 밑으로 가는 쪽은 위로 꺾는다. 조각 1
 */
function spark(x: number, y: number, ang: number, k: number, c: string, i: number): void {
  if (y > GROUND - 8 && Math.sin(ang) > 0) ang = -ang;
  const L = (18 + 12 * n01()) * k;
  const [ca, sa] = [Math.cos(ang), Math.sin(ang)];
  const j = (4 + 3 * n01()) * k * (i % 2 ? 1 : -1);
  const pts = [x, y, x + ca * L * 0.45 - sa * j, y + sa * L * 0.45 + ca * j, x + ca * L * 0.6 + sa * j, y + sa * L * 0.6 - ca * j, x + ca * L, y + sa * L];
  const v = (260 + 220 * n01()) * k;
  bent(pts, (3 + n01()) * k, '', {
    body: i % 3 === 2 ? liteOf(c) : c, life: 0.2 + 0.1 * n01(), dry: 0.2, pr: 1, gr: 0.06, vx: ca * v, vy: sa * v,
  });
}

/** 조각 n개 — 짝수 번째는 양 끝에서 가로로 이어 뻗고(수평 결), 홀수 번째는 줄 위 아무 데서 사방으로 */
function sparks(pts: readonly number[], n: number, k: number, c: string, seed: number): void {
  const last = pts.length - 2;
  for (let i = 0; i < n; i++) {
    if (i % 2 === 0) {
      const head = (i >> 1) % 2 === 0;
      const [x, y] = head ? [pts[0], pts[1]] : [pts[last], pts[last + 1]];
      const out = Math.atan2(0, (head ? pts[0] - pts[last] : pts[last] - pts[0]) || 1);
      spark(x, y, out + sgn() * 0.6, k, c, i + seed);
    } else {
      const j = 2 * Math.floor(n01() * (pts.length / 2));
      spark(pts[j], pts[j + 1], n01() * Math.PI * 2, k, c, i + seed);
    }
  }
}

/** 한 사건 — 가로 쌍줄 번쩍 + 조각 → 끊김 → 같은 길로 깜빡(노랑 줄만 굵게 · 먹 줄 가늘게) + 조각 몇 */
function strike(x: number, y: number, s: (typeof BOLT)[keyof typeof BOLT], k: number, c: string): void {
  const pts = boltPath(x, y, s.half * k, s.amp * k, n01() < 0.5 ? 1 : -1);
  const w = s.w * k;
  pair(pts, w, FLASH * s.slow, c);
  const first = Math.ceil(s.sparks * 0.6);
  sparks(pts, first, k, c, 0);
  later(BLINK_AT * s.slow, () => {
    pair(pts, w * 0.8, BLINK * s.slow, c);
    sparks(pts, s.sparks - first, k, c, first);
  });
}

export const volt: Recipe = {
  trail: { w: 12, dry: 0.3 },
  own: true,
  // 칼길 — 칼이 지나간 호를 곧은 꺾은선 쌍줄로(매끈한 호 몸 없음) → 칼끝에서 조각 둘
  swing(fx, fy, w, life, c, turn, grow) {
    const m = swingMoon(fx, fy, turn, grow);
    const L = m.r * Math.abs(m.sw);
    // 마디는 길게 · 꺾임은 크게 — 잘게 흔들면 매끈한 호(달)로 읽혔다(3판 2차 캡처 헛스윙)
    const n = Math.min(6, Math.max(4, Math.round(L / 40)));
    const amp = Math.min(14, Math.max(9, w * 0.7));
    const pts: number[] = [];
    for (let i = 0, u = 0; i < n; i++) {
      const [x, y, , o] = moonPoint(m, u);
      const off = i === 0 || i === n - 1 ? 0 : (i % 2 ? 1 : -1) * amp * (0.45 + 0.55 * n01());
      pts.push(x + Math.cos(o) * off, y + Math.sin(o) * off);
      u = i === n - 2 ? 1 : Math.min(0.97, u + (1 / (n - 1)) * (0.6 + 0.8 * n01()));
    }
    pair(pts, w * 0.7, life * 0.6, c); // 가늘게 — 굵으면 친 자리 가로 줄과 엉킨다
    later(0.05, () => {
      const [x, y, ang] = moonPoint(m, 1);
      for (let i = 0; i < 2; i++) spark(x, y, ang + sgn() * 0.9, Math.max(0.8, w / 12) * 0.8, c, i);
    });
  },
  hit(x, y, k, c) {
    strike(x, y, BOLT.hit, k * 0.9, c);
  },
  floor(x, y, k, c) {
    strike(x, y, BOLT.floor, k, c);
  },
  // 완파 — 가장 긴 가로 쌍줄. 머리 위(주인공 몸 밖)로 올려 긋는다
  destroy(x, y, k, c) {
    strike(x, y - 16, BOLT.destroy, Math.min(k, 1.4), c);
  },
  whiff(x, y, c) {
    pair(boltPath(x, y, BOLT.whiff.half, BOLT.whiff.amp, n01() < 0.5 ? 1 : -1), BOLT.whiff.w, FLASH, c);
  },
  // 칼 기운 — 날 위 한 자리에서 옆으로 뻗는 먹 테 두른 노랑 꺾인 획(같은 길에 먹을 굵게 깔고 노랑을 얹는다), 셋에 한 번 조각
  aura(b, n, c) {
    const u = 0.3 + n01() * 0.6;
    const x = b[0] + (b[2] - b[0]) * u;
    const y = b[1] + (b[3] - b[1]) * u;
    const side = n % 2 ? 1 : -1;
    const half = 22 + n01() * 10;
    const pts = boltPath(x + side * half, y, half, 10, side);
    bent(pts, 7.5, '', { life: 0.22, dry: 0.2, pr: 2, gr: 0.05 });
    bent(pts, 4, liteOf(c), { body: c, life: 0.2, dry: 0.15, pr: 2, gr: 0.05, hold: 0.5 });
    if (n % 3 === 0) spark(pts[pts.length - 2], pts[pts.length - 1], (side > 0 ? 0 : Math.PI) + sgn() * 0.7, 0.8, c, n);
  },
  every: 0.1,
  tint: true,
  waza: {
    // 필살 큰 획을 따라 — 뿌리 → 끝 차례로 가로 쌍줄이 사다리 가로대처럼 번쩍(조각 하나씩), 다 번진 뒤 끝 셋이 한 번 더 깜빡(k 1에서 ≤ 21)
    along(pts, k, c, dur) {
      const n = Math.min(6, Math.max(3, Math.round(pathLen(pts) / 70)));
      const rungs: number[][] = [];
      const w = 7 * k;
      follow(pts, 0, dur, n, (x, y, _ang, _u, i) => {
        const p = boltPath(x, y, 42 * k, 8 * k, i % 2 ? 1 : -1); // 짧으면 큰 획 굵기에 묻혔다(3판 천지개벽 캡처)
        rungs.push(p);
        pair(p, w, FLASH * 1.5, c);
        sparks(p, 1, k, c, i);
      });
      later(dur + BLINK_AT, () => rungs.slice(-3).forEach((p) => bent(shift(p, 0, w * 0.15), w * 0.45, liteOf(c), { body: c, life: BLINK, dry: 0.18, pr: 2, gr: 0.03 })));
    },
    // 마무리 — 완파 꼴(가장 긴 가로 쌍줄)을 친 쪽으로 밀어 둔다. 줄은 늘 가로(세로로 세우면 번개 대검과 겹친다)
    bloom(x, y, ang, k, c) {
      strike(x + Math.cos(ang) * 20 * k, y + Math.sin(ang) * 20 * k, BOLT.destroy, k, c);
    },
  },
};
