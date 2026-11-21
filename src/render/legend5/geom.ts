// 원소 다섯(불새 · 해일 · 고압선 · 고드름 · 그림자) 기하 도우미 — 꼴은 담지 않는다.
// 11-21 2판은 여기에 공통 초승달(moonsFor · paintMoon — 완파 = 몸 앞뒤 납작 가로 두 겹 고리, 나머지 = 같은 달 하나)을 두고
// 다섯이 그 위에 색만 바꿔 얹었다가 사용자에게 반려됐다(빨간 선으로 그 고리를 따라 그려 보냄 · 「생각을안해?」).
// 3판부터 꼴은 각 무기 파일이 제 실루엣(방향 · 외곽 · 자리 · 박자, DEVLOG 11-21 표)으로 짓는다. 이 파일에 공통 모양을 다시 두지 마라.
// 남은 것: 칼이 실제로 지나간 참격 호(swingMoon) · 호 위 자리 · 꺾은선 따라 부르기 · 흩어짐 박자 · 밝은 짝 색.
// ⚠ bladeFx와 순환 import — 이 파일 맨 위(최상위)에서 bladeFx 값을 부르지 않는다. 함수 몸 안에서만.
import { WEAPON_INK, WEAPON_LITE } from '../../config';
import { later, samplePath } from '../bladeFx';
import { greatArcPoint } from '../sprites';

const TAU = Math.PI * 2;

/** 호 — 중심 (cx, cy) · 반지름 r · 세로 배율 f. a0 = 시작 각, a0 + sw = 끝 각. sw 부호 = 도는 쪽 */
export interface Moon { cx: number; cy: number; r: number; f: number; a0: number; sw: number }

/** 꺾은선 위 한 자리에서 부르는 함수. ang = 진행 방향(라디안), u = 0(처음) → 1(끝), i = 몇 번째 */
export type Elem = (x: number, y: number, ang: number, u: number, i: number) => void;

/** 칼길 호 — 대검 참격 호(greatArcPoint 세 점을 지나는 원)를 그대로. fx, fy = 발. 시작 = 꼬리, 칼끝 = 앞날 */
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

/** 호 위 u(0 → 1) 자리 — [x, y, 진행 방향 각, 바깥 쪽 각] */
export function moonPoint(m: Moon, u: number): [number, number, number, number] {
  const th = m.a0 + m.sw * u;
  const x = m.cx + Math.cos(th) * m.r;
  const y = m.cy + Math.sin(th) * m.r * m.f;
  const s = Math.sign(m.sw) || 1;
  return [x, y, Math.atan2(Math.cos(th) * m.f * s, -Math.sin(th) * s), Math.atan2(Math.sin(th), Math.cos(th) * m.f)];
}

/** 호를 꺾은선으로(n점, 처음 → 끝) */
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

/** 꺾은선 pts(월드)를 따라 — t0초 뒤부터 dur초에 걸쳐 앞 → 뒤로 n자리(필살 큰 획 · weaponAlong). 표본은 길이 비례 */
export function follow(pts: readonly number[], t0: number, dur: number, n: number, f: Elem): void {
  const all = samplePath(pts, 4);
  if (!all.length) return;
  for (let i = 0; i < n; i++) {
    const s = all[n === 1 ? all.length - 1 : Math.round((i * (all.length - 1)) / (n - 1))];
    later(t0 + s.u * dur, () => f(s.x, s.y, s.ang, s.u, i));
  }
}

/** 꺾은선 길이(px) — 개수를 길이에 맞출 때 */
export function pathLen(pts: readonly number[]): number {
  let L = 0;
  for (let i = 2; i + 1 < pts.length; i += 2) L += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return L;
}

/** 흩어짐 박자 — t0초부터 frames프레임(기본 7, 60fps)에 걸쳐 n번 f(i)를 부른다 */
export function scatter(t0: number, n: number, f: (i: number) => void, frames = 7): void {
  for (let i = 0; i < n; i++) later(t0 + (n === 1 ? 0 : (i / (n - 1)) * (frames / 60)), () => f(i));
}
