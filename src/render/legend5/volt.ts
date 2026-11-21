// 고압선 대검(전기) 레시피 — 공통 초승달(crescent.ts) 위에 짓는다. bladeFx RECIPES가 이어 붙이기만 한다.
// 꼴(설계서 §6 · 사용자 영상 번개): 몸을 두르는 초승달(꼬리 먹 → 노랑 → 앞날 밝은 짝, 앞날 달군 속) →
// 2~3프레임 뒤 같은 호가 나란한 꺾인 획 둘로 바뀐다(바깥 = 먹 한 줄 · 안 = 노랑 몸에 종이빛 달군 속, 같은 꺾임으로 나란히) →
// 짧은 꺾인 노란 조각이 사방으로 곧게 날아간다(전기 불꽃) — 「딱」 셋의 박자로 세 번 끊어 튄다. 필살 큰 획 위에선 잔 전류가 획을 따라 긴다.
// 번개 대검(하늘에서 내리꽂는 보라 한 획 · 땅을 기는 잔 번개)과 갈린다: 이쪽은 몸을 두르는 노란 쌍줄 호 · 곧게 날아가는 불꽃 조각.
// 문법(불변 13): 먹 + 포인트 색 하나 · 알파 지우기 금지(모양으로) · shadowBlur · 블룸 · 가운데 동그라미 별 · 원판 + 방사형 띠 · 아이콘 금지.
// ⚠ bladeFx와 순환 import — 최상위에서 bladeFx 값을 부르지 않는다. 시험에서 이 파일을 bladeFx보다 먼저 import하지 않는다.
import { VIEW } from '../../config';
import { bent, later, n01, samplePath, sgn, type Recipe } from '../bladeFx';
import { MOON, follow, liteOf, moonAt, moonPoint, moonsFor, paintMoon, pathLen, swingMoon, type Moon } from './crescent';

const GROUND = VIEW.GROUND_Y;

/** 바탕 자리 하나 — [x, y, 바깥(법선) 각] */
type Base = readonly [number, number, number];

/**
 * 나란한 꺾인 획 둘 — base(꼬리 → 앞날)를 따라 같은 꺾임으로 지그재그, 바깥 줄 = 먹 · 안 줄 = 시그니처 몸 + 밝은 짝 속(종이빛 달군 속).
 * amp = 꺾임 폭, w = 굵기, gap = 두 줄 사이. 꺾임 자리는 고르지 않게(같은 폭이면 계단 무늬). 조각 2
 */
function pair(base: readonly Base[], amp: number, w: number, life: number, c: string, gap = w * 0.75): void {
  const ink: number[] = [];
  const col: number[] = [];
  base.forEach(([x, y, o], i) => {
    const end = i === 0 || i === base.length - 1;
    const off = end ? 0 : (i % 2 ? 1 : -1) * amp * (0.45 + 0.55 * n01());
    const [nx, ny] = [Math.cos(o), Math.sin(o)];
    ink.push(x + nx * (off + gap), y + ny * (off + gap));
    col.push(x + nx * (off - gap * 0.2), y + ny * (off - gap * 0.2));
  });
  // 가늘고 날 서게 — 굵으면 노란 리본 · 진흙 덩이로 읽혔다(1차 캡처)
  bent(ink, w * 0.34, '', { life, dry: 0.2, pr: 3, gr: 0.1 });
  bent(col, w * 0.5, liteOf(c), { body: c, life: life * 1.1, dry: 0.18, pr: 3, gr: 0.08, hold: 0.55 });
}

/** 달 위 n자리 — 간격을 흩는다(양 끝 고정) */
function moonBase(m: Moon, n: number): Base[] {
  const out: Base[] = [];
  for (let i = 0, u = 0; i < n; i++) {
    const [x, y, , o] = moonPoint(m, u);
    out.push([x, y, o]);
    u = i === n - 2 ? 1 : Math.min(0.97, u + (1 / (n - 1)) * (0.6 + 0.8 * n01()));
  }
  return out;
}

/** 달 → 쌍줄 — 길이에 맞춰 마디 수 · 꺾임 폭을 고른다 */
function wire(m: Moon, w: number, life: number): (c: string) => void {
  const L = m.r * Math.abs(m.sw) * (0.5 + 0.5 * m.f);
  const n = Math.min(11, Math.max(5, Math.round(L / 16)));
  const amp = Math.min(16, Math.max(5, m.r * 0.2 + w * 0.3));
  return (c) => pair(moonBase(m, n), amp, w, life, c);
}

/**
 * 전기 불꽃 — (x, y)에서 ang 쪽으로 곧게 날아가는 짧은 꺾인 조각(Z 한 번 · 길고 가늘게). 셋에 둘은 시그니처(먹 뿌리 → 노랑), 하나는 밝은 짝
 * (한지 위에서 밝은 짝만이면 안 보인다).
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

/** 불꽃 한 무더기 — 달 앞쪽 자리들에서 바깥으로 부채(사방으로 흩는다) */
function burst(m: Moon, n: number, k: number, c: string, seed: number): void {
  for (let i = 0; i < n; i++) {
    const [x, y, , o] = moonPoint(m, 0.3 + 0.7 * n01());
    spark(x, y, o + sgn() * 1.3, k, c, i + seed);
  }
}

/** 한 사건 — 달을 긋고 → 2~3프레임 뒤 쌍줄로 바뀌고 → 「딱」 박자 beats번에 걸쳐 불꽃이 튄다 */
function arc(m: Moon, w: number, life: number, k: number, c: string, sparks: number, beats: number): void {
  paintMoon(m, w, c, life * 0.7);
  const toWire = wire(m, w, life);
  later(0.04, () => toWire(c));
  const per = Math.max(1, Math.round(sparks / beats));
  for (let b = 0; b < beats; b++) later(0.07 + b * 0.09, () => burst(m, per, k, c, b));
}

/** 잔 전류 — (x, y)에서 ang 쪽으로 len, 가는 꺾인 한 줄(시그니처 몸 · 밝은 짝 속). 필살 큰 획 · 칼 기운에서 */
function creep(x: number, y: number, ang: number, len: number, w: number, c: string, life = 0.2): void {
  const [ca, sa] = [Math.cos(ang), Math.sin(ang)];
  const pts = [x, y];
  for (let i = 1, f = 0; i <= 4; i++) {
    f = i === 4 ? 1 : Math.min(0.9, f + 0.25 * (0.6 + 0.8 * n01()));
    const off = i === 4 ? 0 : (i % 2 ? 1 : -1) * len * 0.16 * (0.5 + 0.5 * n01());
    pts.push(x + ca * len * f - sa * off, y + sa * len * f + ca * off);
  }
  bent(pts, w, liteOf(c), { body: c, life, dry: 0.25, pr: 1, gr: 0.1 });
}

export const volt: Recipe = {
  trail: { w: 12, dry: 0.3 },
  own: true,
  // 칼길 — 몸을 두르는 굵은 초승달 → 쌍줄 → 앞날에서 불꽃 셋
  swing(fx, fy, w, life, c, turn, grow) {
    const m = swingMoon(fx, fy, turn, grow);
    const s = Math.max(0.8, w / 12);
    paintMoon(m, w * 1.5, c, life * 0.6);
    const toWire = wire(m, w * 1.1, life * 0.9);
    later(0.04, () => toWire(c));
    later(0.08, () => {
      for (let i = 0; i < 3; i++) {
        const [x, y, ang] = moonPoint(m, 0.75 + 0.25 * n01());
        spark(x, y, ang + sgn() * 0.9, 0.8 * s, c, i);
      }
    });
  },
  hit(x, y, k, c) {
    const [m] = moonsFor('hit', x, y, k);
    arc(m, MOON.hit.w, MOON.hit.life, k * 0.9, c, 6, 2);
  },
  // 층 깨기 — 큰 달 + 불꽃 「딱」 셋 + 달 양 끝에서 땅 쪽으로 잔 전류가 옆으로 긴다
  floor(x, y, k, c) {
    const [m] = moonsFor('floor', x, y, k);
    arc(m, MOON.floor.w, MOON.floor.life, k, c, 9, 3);
    later(0.06, () => {
      for (const u of [0, 1]) {
        const [px, py] = moonPoint(m, u);
        creep(px, py, u ? 0 : Math.PI, 30 * k, 3, c, 0.24);
      }
    });
  },
  // 완파 — 두 겹 달(뒤 = 먹 한 획, 앞 = 전기) → 앞 달이 쌍줄 → 「딱」 셋에 불꽃 많이 · 뒤 달에도 마지막 박자에 쌍줄이 한 번
  destroy(x, y, k, c) {
    const [back, front] = moonsFor('destroy', x, y, k);
    paintMoon(back, MOON.destroy.w * 0.5, '', MOON.destroy.life);
    arc(front, MOON.destroy.w, MOON.destroy.life, k * 1.2, c, 15, 3);
    const toWire = wire(back, MOON.destroy.w * 0.6, MOON.destroy.life * 0.8);
    later(0.2, () => toWire(c));
  },
  whiff(x, y, c) {
    const [m] = moonsFor('whiff', x, y, 1);
    paintMoon(m, MOON.whiff.w, c, MOON.whiff.life, false);
  },
  // 칼 기운 — 날을 따라 잔 전류가 기고(날 곁 번갈아), 두 번에 한 번 날에서 불꽃 하나가 곧게 튄다
  aura(b, n, c) {
    const u = 0.3 + n01() * 0.6;
    const x = b[0] + (b[2] - b[0]) * u;
    const y = b[1] + (b[3] - b[1]) * u;
    const ang = Math.atan2(b[3] - b[1], b[2] - b[0]);
    const side = n % 2 ? 1 : -1;
    const o = ang + (side * Math.PI) / 2;
    creep(x + Math.cos(o) * 6, y + Math.sin(o) * 6, ang, 22 + n01() * 10, 3.4, c, 0.2);
    if (n % 2 === 0) spark(x, y, o + sgn() * 0.4, 0.8, c, n >> 1);
  },
  every: 0.1,
  tint: true,
  waza: {
    // 필살 큰 획을 따라 — 뿌리 → 끝으로 잔 전류가 기고 곁으로 불꽃이 튀며, 다 번진 뒤 큰 획 전체가 쌍줄로 한 번 바뀐다(k 1에서 즉시 + later ≤ 18)
    along(pts, k, c, dur) {
      const n = Math.min(8, Math.max(3, Math.round(pathLen(pts) / 50)));
      follow(pts, 0, dur, n, (x, y, ang, _u, i) => {
        creep(x, y, ang + sgn() * 0.3, 30 * k, 3 * k, c, 0.22);
        const o = ang + ((i % 2 ? 1 : -1) * Math.PI) / 2;
        spark(x, y, o + sgn() * 0.5, k, c, i);
      });
      const all = samplePath(pts, 16);
      if (all.length < 3) return;
      const step = Math.max(1, Math.round(all.length / 12));
      const base: Base[] = all.filter((_, i) => i % step === 0 || i === all.length - 1).map((s) => [s.x, s.y, s.ang - Math.PI / 2] as const);
      later(dur * 0.9, () => pair(base, 7 * k, 7 * k, 0.3, c));
    },
    // 마무리 — 친 방향으로 볼록한 달 하나가 쌍줄 → 「딱」 셋에 불꽃
    bloom(x, y, ang, k, c) {
      const m = moonAt(x, y, MOON.floor.r * k, ang, MOON.floor.span, n01() < 0.5 ? 1 : -1);
      arc(m, MOON.floor.w * k, MOON.floor.life, k, c, 9, 3);
    },
  },
};
