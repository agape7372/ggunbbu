// 해일 대검(물) 레시피 — 공통 초승달(crescent.ts) 위에 짓는다. bladeFx RECIPES가 이어 붙이기만 한다.
// 꼴(설계서 §6 · 사용자 영상 물): 몸을 두르는 초승달(꼬리 먹 → 파랑 → 앞날 밝은 짝) + 앞날 흰 거품(밝은 짝 획 속 종이빛) →
// 2~3프레임 뒤 같은 호에서 파도 마루가 선다(앞으로 말려 꺾이는 갈퀴 획, 앞날 쪽일수록 높고 맨 끝은 말려 넘어가는 물마루) →
// S자 물줄기가 앞으로 풀려 나가고 → 물방울이 호를 그리며 흩날려 떨어진다(셋에 하나 꼴로 먹물) · 땅엔 낮고 넓은 물 튐.
// 불새(위로 솟는 불 혀 날개 · 떨어지는 불티) · 서리(곧게 솟는 얼음 가시 · 얼음 금)와 갈린다: 이쪽은 낮고 넓게 앞으로 말리는 갈퀴 · 거품 · 둥근 방울.
// 문법(불변 13): 먹 + 포인트 색 하나 · 알파 지우기 금지(모양으로) · shadowBlur · 블룸 · 가운데 동그라미 별 · 원판 + 방사형 띠 · 아이콘 금지.
// ⚠ bladeFx와 순환 import — 최상위에서 bladeFx 값을 부르지 않는다. 시험에서 이 파일을 bladeFx보다 먼저 import하지 않는다.
import { PALETTE, VIEW } from '../../config';
import { bent, drops, later, n01, sgn, sweep, type Recipe } from '../bladeFx';
import { MOON, follow, liteOf, moonAt, moonPoint, moonsFor, paintMoon, pathLen, scatter, swingMoon, type Moon } from './crescent';

const FOAM = PALETTE.BG; // 거품 = 밝은 짝 획 속에 남는 종이빛(속 색)

/** 진행 방향 ang의 법선 중 위쪽 */
const upOf = (ang: number): number => {
  const a = ang - Math.PI / 2;
  return Math.sin(a) > 0 ? a + Math.PI : a;
};

/**
 * 파도 갈퀴 — 호 위 (x, y)에서 위로 서다가 진행 쪽으로 꺾여 내리꽂히는 갈고리 한 붓(밑동이 굵고 끝이 날카롭다).
 * u = 앞날에 가까울수록 높다. 셋에 둘은 시그니처 몸(먹 밑동 → 파랑 → 밝은 짝), 하나는 밝은 짝 몸. 둘 다 종이빛 거품 속
 * (밝은 짝 몸만이면 한지 위에서 옅어 털 · 가시로 읽혔다)
 */
function claw(x: number, y: number, ang: number, u: number, i: number, k: number, c: string): void {
  const n = upOf(ang);
  const [nx, ny, fx, fy] = [Math.cos(n), Math.sin(n), Math.cos(ang), Math.sin(ang)];
  const L = (9 + 20 * u ** 1.2) * k * (0.85 + 0.3 * n01());
  const px = x + nx * L + fx * L * 0.3;
  const py = y + ny * L + fy * L * 0.3;
  const body = i % 3 === 2 ? liteOf(c) : c;
  bent([x, y, px, py, px + fx * L * 0.55 - nx * L * 0.38, py + fy * L * 0.55 - ny * L * 0.38], (3.4 + 3.4 * u) * k, FOAM, {
    body, pr: 1, dry: 0.3, gr: 0.2, hold: 0.6, life: 0.26 + 0.08 * u + 0.06 * n01(), vx: fx * 30 * k, vy: fy * 30 * k - 10 * k,
  });
}

/**
 * 파도 마루 — 달 위 u0 → 앞날을 따라 물결이 서는 한 붓. 물결마다 완만한 등 → 마루 → 앞으로 넘어가 말린 끝 → 가파르게 떨어지는 앞면
 * (곧은 톱니는 번개 지그재그로 읽혔다 — 마디를 잘게 나눠 굽게 한다). 앞날 쪽일수록 높고 높이를 흩는다.
 * 시그니처 몸(꼬리 먹 → 파랑 → 앞날 밝은 짝) + 종이빛 거품 속. gr로 꼬리 → 앞날 차례로 그어진다
 */
const WAVE = [[0.3, 0.38], [0.55, 0.72], [0.76, 1], [0.95, 0.94], [1.1, 0.62]] as const;
function crest(m: Moon, k: number, c: string, teeth: number, h: number, w: number, life: number, u0 = 0.3): void {
  const pts: number[] = [];
  const du = (1 - u0) / teeth;
  const lift = (u: number, d: number): [number, number] => {
    const [x, y, ang] = moonPoint(m, u);
    const n = upOf(ang);
    return [x + Math.cos(n) * d, y + Math.sin(n) * d];
  };
  for (let j = 0; j < teeth; j++) {
    const u = u0 + j * du;
    const H = h * k * (0.45 + 0.55 * ((j + 1) / teeth) ** 1.3) * (0.7 + 0.6 * n01());
    pts.push(...lift(u, w * 0.3));
    for (const [a, b] of WAVE) pts.push(...lift(u + du * a, Math.max(w * 0.3, H * b)));
  }
  pts.push(...lift(1, w * 0.3));
  bent(pts, (3 + w * 0.25) * k, FOAM, { body: c, pr: 2, dry: 0.3, gr: 0.32, hold: 0.75, life });
}

/** 물마루 말림 — 달 앞날에서 위로 일어 앞으로 말려 넘어가는 굵은 고리(다 닫지 않는다). 시그니처 몸 + 안쪽 거품 한 획 */
function lip(m: Moon, k: number, c: string): void {
  const [x, y, ang] = moonPoint(m, 1);
  const n = upOf(ang);
  const R = Math.max(8, m.r * 0.32) * Math.min(1.4, k);
  const cx = x + Math.cos(n) * R;
  const cy = y + Math.sin(n) * R;
  const a0 = n + Math.PI; // 중심에서 본 앞날
  const s = -Math.sin(a0) * Math.cos(ang) + Math.cos(a0) * Math.sin(ang) >= 0 ? 1 : -1; // 앞으로 감기는 쪽
  sweep(cx, cy, R, a0, s * Math.PI * 1.35, 5.2 * k, '', { body: c, pr: 1, dry: 0.35, gr: 0.22, life: 0.32, vx: Math.cos(ang) * 40 * k });
  sweep(cx, cy, R * 0.62, a0 + s * 0.5, s * Math.PI * 0.95, 2.6 * k, FOAM, { body: liteOf(c), pr: 1, dry: 0.2, gr: 0.25, hold: 0.7, life: 0.28, vx: Math.cos(ang) * 40 * k });
}

/** 앞날 흰 거품 — 달 앞 45%를 바깥으로 살짝 띄워 밝은 짝 획(속 종이빛)이 한 번 더 지나간다. 달군 속이 식은 뒤에도 거품으로 남는다 */
function foam(m: Moon, w: number, life: number, c: string): void {
  const out = 1 + (w * 0.35) / Math.max(1, m.r);
  sweep(m.cx, m.cy, m.r * out, m.a0 + m.sw * 0.55, m.sw * 0.45, w * 0.55, FOAM, {
    body: liteOf(c), dry: 0.45, pr: 1, gr: 0.12, hold: 0.85, life: life * 1.1,
  });
}

/** S자 물줄기 — (x, y)에서 ang 쪽으로 len, 위아래로 한 번씩 굽이치며 풀려 나간다(먹 머리 → 파랑 → 밝은 짝 한 붓 + 거품 곁 획) */
function stream(x: number, y: number, ang0: number, len: number, k: number, c: string): void {
  const ang = Math.cos(ang0) >= 0 ? -0.18 : Math.PI + 0.18; // 가로로 풀린다(달 끝 기울기를 따르면 세로로 솟아 불길로 읽혔다)
  const n = upOf(ang);
  const [nx, ny, fx, fy] = [Math.cos(n), Math.sin(n), Math.cos(ang), Math.sin(ang)];
  const A = len * 0.16;
  const pts: number[] = [];
  const side: number[] = [];
  for (let j = 0; j <= 6; j++) {
    const t = j / 6;
    const o = A * Math.sin(t * Math.PI * 2) * (1 - 0.35 * t) + A * 0.5 * t * t; // 끝은 위로 들린다
    pts.push(x + fx * len * t + nx * o, y + fy * len * t + ny * o);
    side.push(x + fx * len * (0.15 + t * 0.8) + nx * (o + 4 * k), y + fy * len * (0.15 + t * 0.8) + ny * (o + 4 * k));
  }
  const o = { pr: 1, dry: 0.3, gr: 0.25, vx: fx * 50 * k, vy: fy * 50 * k };
  bent(pts, 5 * k, '', { ...o, body: c, life: 0.34 });
  bent(side.slice(4), 2.4 * k, FOAM, { ...o, body: liteOf(c), hold: 0.7, life: 0.3 });
}

/** 물방울 — (x, y)에서 ang 쪽(위로 조금 들어)으로 부채로 튀어 호를 그리며 떨어진다. 시그니처 · 밝은 짝 반반(시그니처는 셋에 하나 꼴로 먹물) */
function spray(x: number, y: number, ang: number, n: number, k: number, c: string, spd = 260): void {
  const a = ang - Math.cos(ang) * 0.5; // 앞으로 가면 위로 든다
  const half = Math.ceil(n / 2);
  drops(x, y, half, a - 0.55, a + 0.35, spd * 0.5 * k, spd * k, 2.6 * k, c, 900, true);
  if (n - half > 0) drops(x, y, n - half, a - 0.35, a + 0.55, spd * 0.45 * k, spd * 0.9 * k, 2.1 * k, liteOf(c), 900, true);
}

/** 땅 물 튐 — 발밑에서 낮고 넓게 양옆으로 퍼지는 물 혀 둘(밝은 짝 + 거품 속) + 낮게 깔리는 방울 */
function splash(x: number, k: number, c: string, n = 4): void {
  const y = VIEW.GROUND_Y - 2;
  for (const d of [-1, 1]) {
    const L = (26 + 10 * n01()) * k;
    bent([x + d * 6 * k, y, x + d * L * 0.6, y - L * 0.32, x + d * L, y - L * 0.18], 3.4 * k, FOAM, {
      body: liteOf(c), pr: 1, dry: 0.3, gr: 0.2, hold: 0.6, life: 0.3, vx: d * 40 * k,
    });
    drops(x + d * 8 * k, y - 3, Math.ceil(n / 2), d > 0 ? -0.75 : Math.PI + 0.35, d > 0 ? -0.35 : Math.PI + 0.75, 140 * k, 240 * k, 2.2 * k, c, 900, true);
  }
}

/** 한 사건 — 달을 긋고(앞날 거품) → 2~3프레임 뒤 파도 갈퀴로 바뀌고 → 물마루가 말리고 → 물방울로 흩어진다 */
function surge(m: Moon, w: number, life: number, k: number, c: string, teeth: number, h: number, sprays: number, withLip: boolean): void {
  paintMoon(m, w, c, life);
  foam(m, w, life, c);
  later(0.04, () => crest(m, k, c, teeth, h, w, life * 1.25));
  if (withLip) later(0.07, () => lip(m, k, c));
  scatter(0.12, sprays, (i) => {
    const [x, y, ang] = moonPoint(m, 0.45 + (0.55 * i) / Math.max(1, sprays - 1));
    spray(x, y, ang, 2, k, c);
  });
}

export const tide: Recipe = {
  trail: { w: 12, dry: 0.3 },
  own: true,
  // 칼길 — 몸을 두르는 굵은 초승달(참격 호 그대로) + 앞날 거품 → 앞쪽 셋이 파도 갈퀴로 → 칼끝에서 물방울이 앞으로 흩날린다
  swing(fx, fy, w, life, c, turn, grow) {
    const m = swingMoon(fx, fy, turn, grow);
    const s = Math.max(0.8, w / 12);
    paintMoon(m, w * 1.5, c, life * 0.8);
    foam(m, w * 1.5, life * 0.8, c);
    later(0.04, () => crest(m, s, c, 3, 15, w, life * 1.1, 0.4));
    later(0.09, () => {
      const [x, y, ang] = moonPoint(m, 1);
      spray(x, y, ang, 3, 0.8 * s, c);
    });
  },
  hit(x, y, k, c) {
    const [m] = moonsFor('hit', x, y, k);
    surge(m, MOON.hit.w, MOON.hit.life, k * 0.8, c, 3, 17, 2, false);
  },
  // 층 깨기 — 큰 달이 파도 · 물마루로 → 물방울 · 땅 쪽으로 물이 쏟아져 발밑에 낮게 튄다
  floor(x, y, k, c) {
    const [m] = moonsFor('floor', x, y, k);
    surge(m, MOON.floor.w, MOON.floor.life, k, c, 4, 22, 3, true);
    later(0.14, () => splash(x, k * 0.8, c, 2));
  },
  // 완파 — 두 겹 달이 몸 앞뒤로(뒤 = 먹 한 획, 앞 = 물) → 앞 달이 파도 · 물마루 → S자 물줄기가 앞으로 풀리고 → 방울 많이 · 땅에 넓게 튐
  destroy(x, y, k, c) {
    const [back, front] = moonsFor('destroy', x, y, k);
    paintMoon(back, MOON.destroy.w * 0.5, '', MOON.destroy.life);
    surge(front, MOON.destroy.w, MOON.destroy.life, k, c, 6, 30, 4, true);
    later(0.09, () => {
      const [sx, sy, ang] = moonPoint(front, 1);
      stream(sx, sy, ang, 70 * k, k, c);
    });
    later(0.12, () => splash(x, k, c, 6));
  },
  // 헛스윙 — 작은 달 + 칼끝에서 떨어지는 방울 둘
  whiff(x, y, c) {
    const [m] = moonsFor('whiff', x, y, 1);
    paintMoon(m, MOON.whiff.w, c, MOON.whiff.life, false);
    later(0.06, () => {
      const [sx, sy, ang] = moonPoint(m, 1);
      spray(sx, sy, ang, 2, 0.7, c, 180);
    });
  },
  // 칼 기운 — 젖은 날: 날을 따라 방울이 떨어지고, 세 번에 한 번 작은 거품 갈퀴가 날 끝 쪽에 선다
  aura(b, n, c) {
    const u = 0.35 + n01() * 0.65;
    const x = b[0] + (b[2] - b[0]) * u;
    const y = b[1] + (b[3] - b[1]) * u;
    const ang = Math.atan2(b[3] - b[1], b[2] - b[0]);
    drops(x, y, 1, ang - 0.3, ang + 0.3, 30, 80, n % 2 ? 2.2 : 1.7, n % 2 ? liteOf(c) : c, 900, true);
    if (n % 3 === 0) claw(x, y, ang, 0.35, 1, 0.7, c); // i 1 = 밝은 짝 거품 몸(먹 밑동이 날에 붙으면 털로 읽힌다)
  },
  every: 0.1,
  tint: true,
  waza: {
    // 필살 큰 획을 따라 — 뿌리 → 끝으로 파도 갈퀴가 서고, 끝에서 물방울이 흩날린다(k 1에서 즉시 + later ≤ 9 + 3 + 6 = 18)
    along(pts, k, c, dur) {
      const n = Math.min(9, Math.max(3, Math.round(pathLen(pts) / 45)));
      follow(pts, 0, dur, n, (x, y, ang, u, i) => claw(x, y, ang, 0.4 + 0.6 * u, i, k, c));
      follow(pts, dur * 0.5 + 0.04, dur * 0.5, 3, (x, y, ang) => spray(x, y, ang, 2, k, c));
    },
    // 마무리 — 친 방향으로 볼록한 달 하나가 파도 · 물마루 · S자 물줄기 · 방울로
    bloom(x, y, ang, k, c) {
      const m = moonAt(x, y, MOON.floor.r * k, ang, MOON.floor.span, sgn() < 0 ? 1 : -1);
      surge(m, MOON.floor.w * k, MOON.floor.life, k, c, 5, 24, 4, true);
      later(0.09, () => {
        const [sx, sy, a] = moonPoint(m, 1);
        stream(sx, sy, a, 60 * k, k, c);
      });
    },
  },
};
