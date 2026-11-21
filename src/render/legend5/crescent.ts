// 원소 다섯(불새 · 해일 · 고압선 · 고드름 · 그림자) 공통 초승달 — 설계서 §6 공통 정체성.
// 몸을 두르는 큰 초승달 베기 → 2~3프레임 뒤 같은 호를 따라 원소로 바뀜 → 6~8프레임에 걸쳐 원소 조각으로 흩어짐.
// 쓰는 법(본보기 = phoenix.ts):
//   swing   : paintMoon(swingMoon(fx, fy, turn, grow), w * 1.5, c, life) → morph(같은 달, …, 원소 함수)
//   hit 등  : moonsFor('hit', x, y, k).forEach((m) => { paintMoon(m, …); morph(m, …) }) → scatter(…)
//   waza    : follow(pts, 0, dur, n, 원소 함수) — 필살 큰 획 꺾은선도 같은 원소 함수로 바뀐다
// 원소 함수 꼴 = (x, y, ang, u, i) → void. ang = 그 자리 진행 방향(라디안), u = 0(꼬리) → 1(앞날), i = 몇 번째.
// 칠하기: 몸 색 c(전설 시그니처)로 그으면 legendTone이 꼬리 먹 → 짙은 색 → 순색 → 앞날 밝은 짝으로 칠한다.
// 앞날 달군 속 = 밝은 짝 몸 + 시그니처 속(hotCore) 짧은 획이 앞 45%에 겹친다(벤 첫 프레임에 종이빛이 굵게 버티다 식음).
// ⚠ bladeFx와 순환 import — 이 파일 맨 위(최상위)에서 bladeFx 값을 부르지 않는다. 함수 몸 안에서만.
import { PALETTE, WEAPON_INK, WEAPON_LITE } from '../../config';
import { later, n01, put, samplePath } from '../bladeFx';
import { greatArcPoint } from '../sprites';

const TAU = Math.PI * 2;
export const UP = -Math.PI / 2;

/** 초승달 호 — 중심 (cx, cy) · 반지름 r · 세로 배율 f. a0 = 꼬리(먹) 각, a0 + sw = 앞날(밝은 짝) 각. sw 부호 = 도는 쪽 */
export interface Moon { cx: number; cy: number; r: number; f: number; a0: number; sw: number }

/** 원소 함수 — 호(꺾은선) 위 한 자리. ang = 진행 방향, u = 0 꼬리 → 1 앞날, i = 몇 번째 */
export type Elem = (x: number, y: number, ang: number, u: number, i: number) => void;

/** 크기 · 방향 규칙(scaled 안이라 k = 콤보 단만). r = 반지름 · w = 굵기 · span = 호 각 · life = 살 초 */
export const MOON = {
  hit: { r: 26, w: 7, span: 2.3, life: 0.22 },
  floor: { r: 40, w: 10, span: 2.7, life: 0.28 },
  destroy: { r: 54, w: 12, span: 3.2, life: 0.34 },
  whiff: { r: 15, w: 3.6, span: 2.1, life: 0.16 },
} as const;
export type MoonKind = keyof typeof MOON;

/** 친 자리 (x, y)가 호 한가운데이고 ang 쪽으로 볼록한 달. dir = 도는 쪽(±1), f = 세로 배율 */
export function moonAt(x: number, y: number, r: number, ang: number, span: number, dir = 1, f = 1): Moon {
  return { cx: x - Math.cos(ang) * r, cy: y - Math.sin(ang) * r * f, r, f, a0: ang - (dir * span) / 2, sw: dir * span };
}

/**
 * 크기 · 방향 규칙 — hit = 친 쪽(위)으로 작은 달 하나(기울기 · 도는 쪽 무작위) · floor = 큰 달(낮고 넓게) · whiff = 작은 달 ·
 * destroy = 두 겹 달이 몸 앞뒤로 감긴다: [0] 뒤 = 위쪽 반 타원(먹으로만 긋는다) · [1] 앞 = 아래쪽 반 타원(원소, 더 굵게)
 */
export function moonsFor(kind: MoonKind, x: number, y: number, k: number): Moon[] {
  const s = MOON[kind];
  const dir = n01() < 0.5 ? 1 : -1;
  if (kind === 'destroy') {
    return [
      moonAt(x, y - 10, s.r * k * 1.15, UP, s.span, -dir, 0.42),
      moonAt(x, y + 14, s.r * k, -UP, s.span, dir, 0.42),
    ];
  }
  const tilt = kind === 'floor' ? 0.15 : 0.35;
  return [moonAt(x, y, s.r * k, UP + dir * tilt * (0.4 + 0.6 * n01()), s.span, dir, kind === 'floor' ? 0.7 : 1)];
}

/** 칼길 달 — 대검 참격 호(greatArcPoint 세 점을 지나는 원)를 그대로. fx, fy = 발. 시작 = 꼬리, 칼끝 = 앞날 */
export function swingMoon(fx: number, fy: number, turn = 0, grow = 1): Moon {
  const [ax, ay] = greatArcPoint(1, 0, turn, grow);
  const [bx, by] = greatArcPoint(0.5, 0, turn, grow);
  const [cx, cy] = greatArcPoint(0, 0, turn, grow);
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)) || 1e-6;
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
  const a0 = Math.atan2(ay - uy, ax - ux);
  const toMid = wrap(Math.atan2(by - uy, bx - ux) - a0);
  let sw = wrap(Math.atan2(cy - uy, cx - ux) - a0);
  if (Math.sign(toMid) !== Math.sign(sw) || Math.abs(toMid) > Math.abs(sw)) sw -= Math.sign(sw) * TAU;
  return { cx: fx + ux, cy: fy + uy, r: Math.hypot(ax - ux, ay - uy), f: 1, a0, sw };
}

/** 달 위 u(0 꼬리 → 1 앞날) 자리 — [x, y, 진행 방향 각, 바깥 쪽 각] */
export function moonPoint(m: Moon, u: number): [number, number, number, number] {
  const th = m.a0 + m.sw * u;
  const x = m.cx + Math.cos(th) * m.r;
  const y = m.cy + Math.sin(th) * m.r * m.f;
  const s = Math.sign(m.sw) || 1;
  return [x, y, Math.atan2(Math.cos(th) * m.f * s, -Math.sin(th) * s), Math.atan2(Math.sin(th), Math.cos(th) * m.f)];
}

/** 달을 꺾은선으로(n점, 꼬리 → 앞날) — 원소 함수 · weaponAlong에 그대로 넘긴다 */
export function moonPts(m: Moon, n = 12): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = moonPoint(m, i / (n - 1));
    pts.push(x, y);
  }
  return pts;
}

/** 시그니처 색 → 그 밝은 짝(WEAPON_LITE). 전설 색이 아니면 그대로 */
export const liteOf = (c: string): string => {
  const w = (Object.keys(WEAPON_LITE) as (keyof typeof WEAPON_LITE)[]).find((k) => WEAPON_INK[k] === c);
  return w ? WEAPON_LITE[w] : c;
};

/**
 * 초승달 한 획 — 꼬리에서 가늘게 들어가 앞날 쪽이 굵다(TRAIL 누름). c = 몸 색('' = 먹만 · 뒤 겹 달),
 * hot = 앞 45%에 밝은 짝 몸 + 시그니처 속 + 종이빛 달군 속(hotCore)이 굵게 버티다 식는 짧은 획을 겹친다. 조각 1~2
 */
export function paintMoon(m: Moon, w: number, c: string, life: number, hot = true): void {
  put('sweep', m.cx, m.cy, {
    life, size: m.r, rot: m.a0, sw: m.sw, v: w, a: m.f, c1: c || PALETTE.INK, c2: '', dry: c ? 0.3 : 0.55, pr: 3, gr: 0.1,
  });
  if (!hot || !c) return;
  const lite = liteOf(c);
  put('sweep', m.cx, m.cy, {
    life: life * 0.55, size: m.r, rot: m.a0 + m.sw * 0.55, sw: m.sw * 0.45, v: w * 0.9, a: m.f, c1: lite, c2: c, dry: 0.12, pr: 3, gr: 0.06, hold: 0.7,
  });
}

/**
 * 바꾸는 갈고리 — dt초 뒤(2~3프레임 = 0.035~0.05) 같은 호를 따라 n자리에서 원소 함수를 부른다.
 * spread > 0이면 꼬리 → 앞날 차례로 그만큼 늦게 번진다
 */
export function morph(m: Moon, dt: number, n: number, f: Elem, spread = 0): void {
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 1 : i / (n - 1);
    later(dt + u * spread, () => {
      const [x, y, ang] = moonPoint(m, u);
      f(x, y, ang, u, i);
    });
  }
}

/** 꺾은선 pts(월드)를 따라 — t0초 뒤부터 dur초에 걸쳐 앞 → 뒤로 n자리(필살 큰 획 · weaponAlong). 표본은 길이 비례 */
export function follow(pts: readonly number[], t0: number, dur: number, n: number, f: Elem): void {
  const all = samplePath(pts, 4);
  if (!all.length) return;
  for (let i = 0; i < n; i++) {
    const s = all[n === 1 ? all.length - 1 : Math.round((i * (all.length - 1)) / (n - 1))];
    later(t0 + s.u * dur, () => f(s.x, s.y, s.ang, s.u, i));
  }
}

/** 꺾은선 길이(px) — 원소 함수 개수를 길이에 맞출 때 */
export function pathLen(pts: readonly number[]): number {
  let L = 0;
  for (let i = 2; i + 1 < pts.length; i += 2) L += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return L;
}

/** 흩어짐 박자 — t0초부터 frames프레임(기본 7, 60fps)에 걸쳐 n번 f(i)를 부른다 */
export function scatter(t0: number, n: number, f: (i: number) => void, frames = 7): void {
  for (let i = 0; i < n; i++) later(t0 + (n === 1 ? 0 : (i / (n - 1)) * (frames / 60)), () => f(i));
}
