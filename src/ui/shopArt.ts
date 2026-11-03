// 상점 품목 그림 — 판 안에서 그리는 것을 그대로 찍는다(상점용으로 지어낸 그림 없음).
// 졸라맨 = render/sprites의 drawPlayer, 글자 = 렌더러 콤보 숫자·의성어와 같은 획(잉크 링 + 아이보리 링 + 채움).
// drawPlayer는 sprites의 전역 상태(무기·몸 색·칼빛)를 쓰므로, 찍고 나면 restoreLook으로 장착 상태로 되돌린다.

import { COSMETIC_COLORS, PALETTE, PLAYER } from '../config';
import type { PlayerPose, WazaId } from '../core/types';
import type { Loadout, WeaponId } from '../meta/types';
import { hs, inkBlot } from '../render/ink';
import { drawWazaShot } from '../render/wazaShow';
import { MASK_DRAW } from '../config';
import { drawGreatsword, drawMask, drawPlayer, playerHead, setPlayerCosmetics, setPlayerWeapon } from '../render/sprites';
import { BLUE, GOLD, INK, PAPER, SEAL, brush, orb, paintGoods, paintPaths, patch, ring, type P } from './goodsArt';

export interface Look {
  weapon: WeaponId;
  body: string;
  blade: string;
  pose: PlayerPose;
}

// 그림판 논리 크기. 가로는 잉크 가운데에 맞추고(inkMidX), 세로는 발을 같은 줄에 세운다.
// 위로 가장 높은 건 대검 타격 호(발에서 −71, 후광 포함), 아래는 모두 +4 안
const ART_W = 80;
const ART_H = 79;
const FOOT_Y = 74;
/** 필살 칸 — 필살 연출이 머리 위로 솟는다(낙뢰 · 쳐올림). 그만큼 위로 길다 */
const WAZA_H = 96;
/** 마스크 칸 — 윗몸을 2배로. 마스크 가운데가 그림 가로 가운데·위에서 BUST_Y(배율 전) */
const BUST_K = 2;
const BUST_Y = 15;
const SCALE = 4; // 상점은 1.5배까지 키워 보인다 — 고밀도 화면에서 선이 뭉개지지 않게 4배로 찍는다
const DISPLAY = '"Black Han Sans", sans-serif';

const cache = new Map<string, string>();

function colorOf(kind: 'body' | 'blade' | 'letters', id: string): string {
  const table = COSMETIC_COLORS[kind];
  return table[id] ?? Object.values(table)[0];
}

/** 찍어서 data URL. 캔버스가 없는 곳(테스트 환경 등)에선 빈 문자열. 글꼴이 아직 안 왔으면 찍되 캐시하지 않는다
 *  (usesFont = true면 콤보 글꼴, 문자열이면 그 글꼴) */
function snap(key: string, h: number, draw: (ctx: CanvasRenderingContext2D) => void, usesFont: boolean | string = false, w = ART_W, scale = SCALE): string {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const cv = typeof document === 'undefined' ? null : document.createElement('canvas');
  const ctx = cv?.getContext('2d');
  if (!cv || !ctx) return '';
  cv.width = w * scale;
  cv.height = h * scale;
  ctx.scale(scale, scale);
  draw(ctx);
  const url = cv.toDataURL('image/png');
  const font = usesFont === true ? DISPLAY : usesFont;
  if (!font || document.fonts?.check(`16px ${font}`) !== false) cache.set(key, url);
  return url;
}

function drawLook(ctx: CanvasRenderingContext2D, look: Look, footX: number, footY: number): void {
  setPlayerWeapon(look.weapon);
  setPlayerCosmetics(colorOf('body', look.body), colorOf('blade', look.blade));
  // 공격은 타격 프레임(참격 호가 있는 칸) — 준비 틱을 막 지난 시점
  drawPlayer(ctx, look.pose, look.pose === 'attack' ? PLAYER.ATTACK_PRE : 0, footX, footY);
}

/** 잉크(후광 포함) 가로 가운데 — 발에서 잰 거리. 1배로 한 번 그려 알파를 훑는다.
 *  칼 길이가 무기·자세마다 달라(대검 칼끝은 발에서 +56) 발 위치를 고정하면 잘리거나 한쪽으로 쏠린다 */
function inkMidX(look: Look): number {
  const W = 200, H = 120, fx = 100;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  if (!ctx) return 0;
  drawLook(ctx, look, fx, 100);
  const d = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, x1 = -1;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] <= 20) continue;
    const x = ((i - 3) / 4) % W;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
  }
  return x1 < 0 ? 0 : (x0 + x1) / 2 - fx;
}

function player(ctx: CanvasRenderingContext2D, look: Look, footY: number): void {
  drawLook(ctx, look, ART_W / 2 - inkMidX(look), footY);
}

/** 렌더러의 판 속 글자 획 — 콤보 숫자(잉크 4.5)·의성어(잉크 5, 기울기 −0.08) */
function popText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, fill: string, ink: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.font = `${px}px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.lineWidth = ink;
  ctx.strokeStyle = PALETTE.INK;
  ctx.strokeText(text, 0, 0);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = PALETTE.WHITE;
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** 졸라맨 그림 — 무기·몸 색·칼빛 */
export function playerArt(look: Look): string {
  return snap(`p|${look.weapon}|${look.body}|${look.blade}|${look.pose}`, ART_H, (ctx) => player(ctx, look, FOOT_Y));
}

/** 효과글자 그림 — 이 코스메틱이 바꾸는 건 콤보 숫자(50 미만) 색 하나라, 그 숫자가 차오르는 모습 */
export function lettersArt(id: string): string {
  const color = colorOf('letters', id);
  return snap(`l|${id}`, ART_H, (ctx) => {
    popText(ctx, '9', 12, 67, 19, color, 4.5, 0);
    popText(ctx, '18', 35, 49, 23, color, 4.5, 0);
    popText(ctx, '27', 58, 30, 28, color, 4.5, 0);
  }, true);
}

/** 필살 그림 — 판 화면을 줄인 한 장면: 건물 · 필살 자세 졸라맨(장착한 칼 · 색) · 그 필살의 먹 연출(여섯이 다 다르다). 글자 딱지 없음(11-01) */
export function wazaArt(id: string, look: Omit<Look, 'pose'>): string {
  return snap(`w|${id}|${look.weapon}|${look.body}|${look.blade}`, WAZA_H, (ctx) => {
    setPlayerWeapon(look.weapon);
    setPlayerCosmetics(colorOf('body', look.body), colorOf('blade', look.blade));
    drawWazaShot(ctx, id as WazaId, ART_W / 2, WAZA_H - 4, 0.24, look.weapon);
  });
}

/** 마스크 그림 — 마스크 쓴 졸라맨(서 있는 자세)의 윗몸을 크게. 그림 문자열이 캐시 키에 들어 다시 그리면 새 그림이 찍힌다 */
export function maskedArt(look: Omit<Look, 'pose'>, art: string): string {
  return snap(`m|${look.weapon}|${look.body}|${look.blade}|${art}`, ART_H, (ctx) => {
    setPlayerWeapon(look.weapon);
    setPlayerCosmetics(colorOf('body', look.body), colorOf('blade', look.blade));
    const [hx, hy] = playerHead('idle', 0) ?? [0, 0]; // 시트·프로시저럴마다 머리 자리가 조금 다르다 — 무기·색을 정한 뒤 읽는다
    const fx = ART_W / 2 / BUST_K - hx;
    const fy = BUST_Y - hy + MASK_DRAW.LIFT;
    ctx.scale(BUST_K, BUST_K);
    drawPlayer(ctx, 'idle', 0, fx, fy);
    drawMask(ctx, 'idle', 0, fx, fy, art);
  });
}

/** 찍기가 바꾼 졸라맨 전역 상태를 장착 상태로 되돌린다 */
export function restoreLook(loadout: Loadout): void {
  setPlayerWeapon(loadout.weapon);
  setPlayerCosmetics(colorOf('body', loadout.body), colorOf('blade', loadout.blade));
}

/* ── 꾸러미 장면 — 목판화 반전. 먹 바탕 + 한지색 큰 달 하나(포인트 색이 뒤로 살짝 어긋나 삐져나옴) + 달 앞 주인공.
 * 주인공은 달 안에서 먹, 달 밖에서 한지색 + 먹 테(dual). 그라데이션 · 흐림 없음.
 * 가장자리는 붓 획(goodsArt brush)과 손으로 자른 면(patch). 상품은 goodsArt 그림을 그대로 찍는다.
 * 논리 칸 360×124 — 왼쪽 위 = 제목, 왼쪽 아래 = 도화선, 오른쪽 위 = 효율 인장이라 주인공은 x 160~262에 둔다.
 * 표지 360×150. 찍고 나면 부르는 쪽이 restoreLook. */
const SC_W = 360;
const SC_H = 124;
/** 먼 건물 · 집중선 — 먹보다 한 톤 밝은 납작한 판 */
const FAR = '#2B2B36';
const SC_SCALE = 3;
const TAU = Math.PI * 2;
const BRUSH_FONT = '"East Sea Dokdo"';

type Ctx = CanvasRenderingContext2D;
interface Moon { x: number; y: number; r: number; seed: number }
/** 한 번 그리는 묶음 — c = 칠할 색, h = 먹 테를 두를지 */
type Fg = (c: string, h: boolean) => void;

/** 채운 path 하나 — h면 먹 테를 먼저 두른다 */
function put(ctx: Ctx, c: string, h: boolean, d: string, hw = 3.4): void {
  const p = new Path2D(d);
  if (h) {
    ctx.lineWidth = hw;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.stroke(p);
  }
  ctx.fillStyle = c;
  ctx.fill(p);
}
const ln = (ctx: Ctx, c: string, h: boolean, pts: readonly P[], w0: number, w1: number, seed: number, dry = false): void => put(ctx, c, h, brush(pts, w0, w1, seed, dry));
const face = (ctx: Ctx, c: string, h: boolean, pts: readonly P[], seed: number, amp = 1.3): void => put(ctx, c, h, patch(pts, seed, amp));
const blob = (ctx: Ctx, c: string, h: boolean, x: number, y: number, r: number, seed: number): void => face(ctx, c, h, ring(x, y, r, 18).slice(0, 18), seed, Math.max(0.5, r * 0.06));
/** 아래(0)에서 시계 방향으로 a만큼 돈 쪽으로 L — 팔다리용 */
const along = (p: P, a: number, L: number): P => [p[0] + Math.sin(a) * L, p[1] + Math.cos(a) * L];
/** 위(0)에서 시계 방향으로 a만큼 돈 쪽으로 L — 솟는 물건용 */
const rise = (p: P, a: number, L: number): P => [p[0] + Math.sin(a) * L, p[1] - Math.cos(a) * L];
const rect = (x0: number, y0: number, x1: number, y1: number): P[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

const moonD = (m: Moon): string => patch(ring(m.x, m.y, m.r, 26).slice(0, 26), m.seed, 0.9);

/** 달 — 포인트 색 판이 한지 달 뒤에서 위·오른쪽으로 삐져나오고, 나뭇결 같은 마른 먹 획이 셋 지난다 */
function moon(ctx: Ctx, m: Moon, accent: string): void {
  put(ctx, accent, false, patch(ring(m.x + m.r * 0.09, m.y - m.r * 0.07, m.r, 26).slice(0, 26), m.seed + 1, 0.9));
  put(ctx, PAPER, false, moonD(m));
  for (let i = 0; i < 3; i++) {
    const dy = (i - 1) * m.r * 0.5 + (hs(m.seed, i) - 0.5) * 6;
    const half = Math.sqrt(Math.max(0, m.r * m.r - dy * dy)) * 0.8;
    const x0 = m.x - half + hs(m.seed, i + 5) * half * 0.5;
    ln(ctx, INK, false, [[x0, m.y + dy], [x0 + half * 1.1, m.y + dy - 2]], 2.2, 0.7, m.seed + i, true);
  }
}

/** 한지 달 앞의 것은 두 번 그린다 — 전체를 한지색 + 먹 테로, 그 위에 달 안만 먹으로 */
function dual(ctx: Ctx, m: Moon | null, fg: Fg): void {
  fg(PAPER, true);
  if (!m) return;
  ctx.save();
  ctx.clip(new Path2D(moonD(m)));
  fg(INK, false);
  ctx.restore();
}

/** 기존 그림(대검 등)을 한 색 실루엣으로 — 먹 테를 두른다 */
function silhouette(ctx: Ctx, draw: (c: Ctx) => void, color = PAPER): void {
  const cv = ctx.canvas;
  const k = ctx.getTransform().a;
  const base = document.createElement('canvas');
  base.width = cv.width;
  base.height = cv.height;
  const bc = base.getContext('2d');
  if (!bc) return;
  bc.setTransform(ctx.getTransform());
  draw(bc);
  const tint = (color: string): HTMLCanvasElement => {
    const t = document.createElement('canvas');
    t.width = cv.width;
    t.height = cv.height;
    const tc = t.getContext('2d');
    if (tc) {
      tc.drawImage(base, 0, 0);
      tc.globalCompositeOperation = 'source-in';
      tc.fillStyle = color;
      tc.fillRect(0, 0, t.width, t.height);
    }
    return t;
  };
  const ink = tint(INK);
  const body = tint(color);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < 8; i++) ctx.drawImage(ink, Math.cos((i * TAU) / 8) * 1.8 * k, Math.sin((i * TAU) / 8) * 1.8 * k);
  ctx.drawImage(body, 0, 0);
  ctx.restore();
}

interface Pose {
  /** 윗몸 기울기(위에서 시계 방향) */
  lean?: number;
  /** 오른팔 [위, 아래] · 왼팔 [위, 아래] — 아래(0)에서 시계 방향 각 */
  arm: readonly [number, number, number, number];
  leg: readonly [number, number, number, number];
  hat?: string;
}

/** 붓 졸라맨 — (x, y) = 허리. 키 약 61×s. 두 손 자리를 돌려준다 */
function man(ctx: Ctx, c: string, h: boolean, x: number, y: number, s: number, o: Pose): readonly [P, P] {
  const lean = o.lean ?? 0;
  const sn = Math.sin(lean), cs = Math.cos(lean);
  const hip: P = [x, y];
  const neck: P = [x + sn * 22 * s, y - cs * 22 * s];
  const sh: P = [x + sn * 19 * s, y - cs * 19 * s];
  const head: P = [x + sn * 29 * s, y - cs * 29 * s];
  const w = 4.2 * s;
  for (let k = 0; k < 2; k++) {
    const knee = along(hip, o.leg[k * 2], 13 * s);
    ln(ctx, c, h, [hip, knee, along(knee, o.leg[k * 2 + 1], 13 * s)], w, w * 0.65, 10 + k);
  }
  ln(ctx, c, h, [hip, neck], w * 1.15, w * 0.95, 12);
  const hands: P[] = [];
  for (let k = 0; k < 2; k++) {
    const elbow = along(sh, o.arm[k * 2], 11.5 * s);
    const hand = along(elbow, o.arm[k * 2 + 1], 11.5 * s);
    ln(ctx, c, h, [sh, elbow, hand], w * 0.9, w * 0.6, 13 + k);
    hands.push(hand);
  }
  blob(ctx, c, h, head[0], head[1], 6.3 * s, 15);
  if (o.hat) {
    const r = 6.9 * s, hy = head[1] - 1.2 * s;
    put(ctx, o.hat, h, patch([...ring(head[0], hy, r, 10, 0.5, Math.PI), [head[0] + r + 3.5 * s, hy + 1.6 * s], [head[0] - r - 0.5 * s, hy + 1.6 * s]], 16, 0.5));
  }
  return [hands[0], hands[1]];
}

/** 널빤지 · 쇠막대처럼 짧은 굵은 획 하나 — 가운데 (x, y), 길이 len, 각 a */
function bar(ctx: Ctx, c: string, h: boolean, x: number, y: number, len: number, w: number, a: number, seed: number): void {
  const dx = (Math.cos(a) * len) / 2, dy = (Math.sin(a) * len) / 2;
  ln(ctx, c, h, [[x - dx, y - dy], [x + dx, y + dy]], w, w * 0.8, seed);
}

/** 조각 더미 — n개가 봉우리 모양(가운데가 높다)으로 쌓인다. 아래가 나중에 그려져 앞에 선다 */
function heap(ctx: Ctx, cx: number, by: number, n: number, wd: number, ht: number, s: number, seed: number): void {
  const list = Array.from({ length: n }, (_, i) => {
    const dx = (((i * 0.618034 + 0.13) % 1) * 2 - 1) * wd + (hs(seed, i + 160) - 0.5) * 6; // 황금비 수열로 고르게 퍼뜨린다
    const top = ht * Math.pow(1 - Math.abs(dx) / wd, 1.1);
    return { x: cx + dx, y: by - hs(seed, i + 40) * top, r: hs(seed, i + 80) * TAU };
  }).sort((a, b) => a.y - b.y);
  list.forEach((p, i) => paintPaths(ctx, orb(p.x, p.y, s * (0.9 + 0.25 * hs(seed, i + 120)), seed + i, p.r)));
}

/** 격자 트러스 — a에서 b로 가는 두 줄 + 오가는 빗줄. depth = 두 줄 사이, n = 빗줄 수 */
function lattice(ctx: Ctx, c: string, h: boolean, a: P, b: P, depth: number, n: number, seed: number): void {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = (-(b[1] - a[1]) / L) * (depth / 2), ny = ((b[0] - a[0]) / L) * (depth / 2);
  const at = (t: number, k: 1 | -1): P => [a[0] + (b[0] - a[0]) * t + nx * k, a[1] + (b[1] - a[1]) * t + ny * k];
  ln(ctx, c, h, [at(0, 1), at(1, 1)], 3.2, 2.6, seed);
  ln(ctx, c, h, [at(0, -1), at(1, -1)], 3.2, 2.6, seed + 1);
  for (let i = 0; i < n; i++) ln(ctx, c, h, [at(i / n, i % 2 ? -1 : 1), at((i + 1) / n, i % 2 ? 1 : -1)], 1.9, 1.5, seed + 2 + i);
}

/* ── 상품 장면 — 먼 건물 판 · 집중선 · 달 위에 상품 그림(goodsArt)이 주인공, 왼쪽에 졸라맨 ── */

/** 먼 건물 — 먹 바탕보다 한 톤 밝은 납작한 판. 창은 먹으로 판다 */
function skyline(ctx: Ctx, seed: number): void {
  for (let i = 0, x = -6; x < SC_W; i++) {
    const w = 28 + 30 * hs(seed, i), h = 28 + 52 * hs(seed, i + 20);
    face(ctx, FAR, false, rect(x, SC_H - h, x + w, SC_H + 4), seed + i, 0.7);
    for (let r = 0; r * 13 + 16 < h; r++) for (let j = 0; j * 11 + 12 < w; j++) {
      if (hs(seed + i, r * 7 + j) > 0.62) face(ctx, INK, false, rect(x + 6 + j * 11, SC_H - h + 8 + r * 13, x + 11 + j * 11, SC_H - h + 14 + r * 13), seed + i * 9 + r + j, 0.2);
    }
    x += w + 5 * hs(seed, i + 40);
  }
}

/** 집중선 — (x, y)에서 밖으로 뻗는 납작한 획 */
function rays(ctx: Ctx, x: number, y: number, r0: number, r1: number, n: number, seed: number): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + hs(seed, i) * 0.2, R = r0 + (r1 - r0) * (0.7 + 0.3 * hs(seed, i + n));
    ln(ctx, FAR, false, [[x + Math.cos(a) * r0, y + Math.sin(a) * r0], [x + Math.cos(a) * R, y + Math.sin(a) * R]], 5, 0.6, seed + i);
  }
}

/** 땅 — 한지 획 한 줄(달 안에선 먹) */
const ground = (ctx: Ctx, c: string, h: boolean): void => ln(ctx, c, h, [[-4, SC_H - 5], [SC_W + 4, SC_H - 6]], 4.6, 3.8, 90);

/** 신입 꾸러미: 터진 상자에서 널빤지 · 조각 · 장비가 튀고 졸라맨이 뛰어오른다 (주홍). 특가 패널은 왼쪽이 제목 · 도화선 자리라 졸라맨을 뺀다 */
function rookie(ctx: Ctx, worker = true): void {
  const m: Moon = { x: 216, y: 60, r: 54, seed: 3 };
  skyline(ctx, 61);
  rays(ctx, m.x, m.y, 60, 190, 18, 62);
  moon(ctx, m, SEAL);
  dual(ctx, m, (c, h) => {
    ground(ctx, c, h);
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI * (0.1 + 0.8 * (i / 5)) + (hs(5, i) - 0.5) * 0.16, d = 46 + 14 * hs(6, i);
      bar(ctx, c, h, 216 + Math.cos(a) * d, 80 + Math.sin(a) * d * 0.9, 15 + 8 * hs(7, i), 6, a + 0.5, 20 + i);
    }
    if (worker) man(ctx, c, h, 116, 80, 1, { arm: [2.35, 2.8, -2.35, -2.8], leg: [-0.5, -0.2, 0.55, 0.25] });
  });
  paintGoods(ctx, 'gift', 216, 76, 90);
  paintGoods(ctx, 'coverall', 296, 96, 44, 0.16);
  paintGoods(ctx, 'life', 164, 102, 30, -0.24);
  paintPaths(ctx, orb(172, 24, 1.5, 30, -0.4) + orb(262, 26, 1.3, 40, 0.5) + orb(268, 72, 1.1, 50, 0.2));
}

/** 도구함: 열린 공구함 옆에 안전모 쓴 졸라맨 (금). 특가 패널은 졸라맨을 뺀다 */
function toolbox(ctx: Ctx, worker = true): void {
  const m: Moon = { x: 214, y: 58, r: 54, seed: 5 };
  skyline(ctx, 71);
  rays(ctx, m.x, m.y, 60, 190, 18, 72);
  moon(ctx, m, GOLD);
  dual(ctx, m, (c, h) => {
    ground(ctx, c, h);
    if (worker) man(ctx, c, h, 120, 92, 1, { hat: SEAL, lean: 0.08, arm: [1.5, 1.3, 0.3, 0.1], leg: [0.2, 0.05, -0.2, -0.05] });
  });
  paintGoods(ctx, 'toolbox', 214, 70, 106);
  paintGoods(ctx, 'dust2x', 296, 98, 40, 0.1);
}

/** 월급 봉투: 봉투에서 조각이 쏟아져 오른쪽 아래에 쌓인다 (금) */
function salary(ctx: Ctx): void {
  const m: Moon = { x: 206, y: 56, r: 52, seed: 7 };
  skyline(ctx, 81);
  rays(ctx, m.x, m.y, 58, 190, 18, 82);
  moon(ctx, m, GOLD);
  dual(ctx, m, (c, h) => {
    ground(ctx, c, h);
    man(ctx, c, h, 112, 92, 1, { lean: -0.06, arm: [2.4, 2.9, -2.4, -2.9], leg: [0.3, 0.1, -0.3, -0.1] });
  });
  heap(ctx, 296, 118, 16, 46, 34, 1.5, 7);
  paintGoods(ctx, 'envelope', 204, 60, 104, -0.1);
  paintPaths(ctx, orb(262, 58, 1.2, 84, 0.3) + orb(254, 84, 1.5, 85, -0.5) + orb(276, 80, 1.1, 86, 0.8));
}

/** 특근 수당: 달 앞 노란 크레인, 안전모 쓴 졸라맨 (주홍) */
function pass(ctx: Ctx): void {
  const m: Moon = { x: 206, y: 62, r: 54, seed: 9 };
  skyline(ctx, 91);
  moon(ctx, m, SEAL);
  dual(ctx, m, (c, h) => {
    ground(ctx, c, h);
    man(ctx, c, h, 118, 92, 1, { hat: SEAL, arm: [2.2, 2.6, -0.25, -0.1], leg: [0.14, 0.05, -0.14, -0.05] });
  });
  paintGoods(ctx, 'pass', 212, 62, 122);
}

/** 크레인 장면 — 야간 철거. 먹 크레인이 달 위를 가로지른다(달 밖에선 한지색). 주홍 = 달 어긋남 · 경고등 · 안전모 */
function crane(ctx: Ctx, W: number, H: number, m: Moon, mx: number, wx: number, ws: number): void {
  moon(ctx, m, SEAL);
  const gy = H - 7, top = H * 0.16, jy = top + 15, hx = mx - W * 0.27, tip = mx - W * 0.52, back = mx + W * 0.2;
  dual(ctx, m, (c, h) => {
    ln(ctx, c, h, [[-300, gy + 2], [W + 300, gy]], 8, 7, 90);
    lattice(ctx, c, h, [mx, gy], [mx, jy - 8], 9, 11, 100);
    lattice(ctx, c, h, [back, jy], [tip, jy + 1], 8, 18, 120);
    face(ctx, c, h, rect(mx - 9, jy - 14, mx + 9, jy - 2), 140, 1);
    face(ctx, c, h, rect(back - 13, jy + 5, back + 2, jy + 18), 141, 1);
    ln(ctx, c, h, [[mx - 4, jy - 14], [mx, top - 8], [mx + 4, jy - 14]], 3, 2, 142);
    ln(ctx, c, h, [[mx, top - 8], [tip, jy - 2]], 1.5, 1.1, 143);
    ln(ctx, c, h, [[mx, top - 8], [back, jy - 1]], 1.5, 1.1, 144);
    // 걸린 줄 · 갈고리 · 매단 철근
    ln(ctx, c, h, [[hx, jy + 5], [hx, gy - 58]], 1.9, 1.7, 145);
    ln(ctx, c, h, [[hx - 12, gy - 53], [hx, gy - 58], [hx + 12, gy - 53]], 1.9, 1.7, 146);
    ln(ctx, c, h, [[hx - 17, gy - 51], [hx + 17, gy - 51]], 6, 5.4, 147);
    man(ctx, c, h, wx, gy - 3 - 26 * ws, ws, { hat: SEAL, arm: [2.2, 2.6, -0.25, -0.1], leg: [0.14, 0.05, -0.14, -0.05] });
  });
  blob(ctx, SEAL, true, mx, top - 9, 3.4, 150);
  blob(ctx, SEAL, true, tip, jy + 1, 3, 151);
}

/** 기사 세트: 달 앞에서 칼을 치켜든 졸라맨, 노랑 칼빛 호 한 획이 달을 가로지른다(잔선 없음) */
function knight(ctx: Ctx): void {
  skyline(ctx, 101);
  ctx.translate(72, -8);
  ctx.scale(0.82, 0.82);
  const m: Moon = { x: 168, y: 92, r: 62, seed: 11 };
  moon(ctx, m, PALETTE.YELLOW);
  const C: P = [152, 126];
  const sweep = [-0.2, -0.7, -1.2, -1.75, -2.3, -2.85].map((a) => [C[0] + Math.cos(a) * 66, C[1] + Math.sin(a) * 66] as P);
  ln(ctx, PALETTE.YELLOW, true, sweep, 17, 1.6, 11);
  dual(ctx, m, (c, h) => {
    const [hand] = man(ctx, c, h, 150, 124, 1.3, { lean: 0.12, arm: [2.45, 2.8, 2.2, 2.65], leg: [-0.6, -0.1, 0.7, 0.2] });
    const guard = rise(hand, 0.55, 8);
    ln(ctx, c, h, [guard, rise(hand, 0.55, 62)], 7, 1, 12);
    ln(ctx, c, h, [rise(guard, 0.55 - 1.57, 8), rise(guard, 0.55 + 1.57, 8)], 4.4, 4, 13);
  });
}

/** 철거왕 세트: 금 대검을 세우고 위에 왕관, 뒤로 무기가 부채처럼 펴진다 (금) */
function king(ctx: Ctx): void {
  const m: Moon = { x: 214, y: 64, r: 54, seed: 13 };
  skyline(ctx, 111);
  rays(ctx, m.x, m.y, 60, 190, 18, 112);
  moon(ctx, m, GOLD);
  // 부채꼴 무기 — 붓 획 칼 넷(굵기 · 길이가 달라 같은 칼이 아니다)
  dual(ctx, m, (c, h) => {
    const base: P = [214, 130];
    ([[-1.05, 6, 84], [-0.58, 9, 92], [0.58, 8, 92], [1.05, 5, 82]] as const).forEach(([a, w, len], i) => {
      const guard = rise(base, a, 18);
      ln(ctx, c, h, [guard, rise(base, a, len)], w, 1, 90 + i);
      ln(ctx, c, h, [rise(guard, a - 1.57, 9), rise(guard, a + 1.57, 9)], 4.4, 4, 94 + i);
      ln(ctx, c, h, [base, guard], 4.8, 4.2, 98 + i);
    });
  });
  // 가운데 금 대검 — 판의 대검 그림을 금 실루엣으로
  silhouette(ctx, (c) => {
    c.translate(214, 130);
    c.scale(2.8, 1.9);
    drawGreatsword(c, 'gold', 0, 0, 0, -42);
  }, GOLD);
  paintGoods(ctx, 'crown', 214, 30, 62);
}

/** 광고 없는 현장: 졸라맨이 「광고」 표지판을 벤다 (주홍) */
function noAds(ctx: Ctx): void {
  void document.fonts?.load(`60px ${BRUSH_FONT}`);
  skyline(ctx, 121);
  ctx.translate(58, -12);
  ctx.scale(0.8, 0.8);
  const m: Moon = { x: 196, y: 94, r: 58, seed: 17 };
  moon(ctx, m, SEAL);
  const C: P = [198, 78];
  let hd: P = [0, 0];
  dual(ctx, m, (c, h) => {
    hd = man(ctx, c, h, 96, 124, 1.5, { lean: 0.3, arm: [2.1, 2.05, 1.7, 1.95], leg: [-0.5, -0.3, 0.75, 0.1] })[0];
  });
  const L = Math.hypot(C[0] - hd[0], C[1] - hd[1]);
  const d: P = [(C[0] - hd[0]) / L, (C[1] - hd[1]) / L];
  const n: P = [-d[1], d[0]];
  const sign = (): void => {
    ln(ctx, PAPER, true, [[198, 112], [198, 172]], 8, 7, 18);
    face(ctx, PAPER, true, rect(138, 44, 258, 112), 19, 1.5);
    face(ctx, INK, false, rect(146, 52, 250, 104), 20, 1.1);
    ctx.fillStyle = PAPER;
    ctx.font = `62px ${BRUSH_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('광고', 198, 78);
  };
  // 벤 줄을 따라 두 쪽으로 — 아래·오른쪽은 조금 내려앉고 위·왼쪽은 밀려난다
  for (const side of [1, -1]) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(C[0] - d[0] * 400, C[1] - d[1] * 400);
    ctx.lineTo(C[0] + d[0] * 400, C[1] + d[1] * 400);
    ctx.lineTo(C[0] + d[0] * 400 + n[0] * 400 * side, C[1] + d[1] * 400 + n[1] * 400 * side);
    ctx.lineTo(C[0] - d[0] * 400 + n[0] * 400 * side, C[1] - d[1] * 400 + n[1] * 400 * side);
    ctx.closePath();
    ctx.clip();
    ctx.translate(n[0] * 5 * side, n[1] * 5 * side);
    sign();
    ctx.restore();
  }
  // 칼빛 — 손에서 표지판 너머까지 한 획
  ln(ctx, SEAL, true, [[hd[0] + d[0] * 6, hd[1] + d[1] * 6], [C[0] + d[0] * 40, C[1] + d[1] * 40], [C[0] + d[0] * 104, C[1] + d[1] * 104]], 14, 1.6, 21);
}

/** 재화 판 띠: 달 앞에 궤도조각 자루와 먼지 트럭 (파랑) */
function coins(ctx: Ctx): void {
  const m: Moon = { x: 246, y: 62, r: 48, seed: 23 };
  skyline(ctx, 131);
  rays(ctx, m.x, m.y, 54, 170, 16, 132);
  moon(ctx, m, BLUE);
  paintGoods(ctx, 'dustTruck', 296, 74, 84);
  paintGoods(ctx, 'orbSack', 206, 66, 88);
}

const SCENES: Record<string, (ctx: Ctx) => void> = {
  rookie_pack: rookie, rookie_sale: (ctx) => rookie(ctx, false),
  toolbox, toolbox_sale: (ctx) => toolbox(ctx, false),
  salary,
  season_pass: pass,
  knight_set: knight,
  king_set: king,
  no_ads: noAds,
  coins,
};

/** 먹 바탕을 깔고 장면을 그린다 */
const stage = (draw: (ctx: Ctx) => void, w: number, h: number) => (ctx: Ctx): void => {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);
  draw(ctx);
};

const sceneImg = (url: string): string => (url ? `<img src="${url}" alt="" draggable="false" style="display:block;width:100%;height:100%;object-fit:cover;object-position:50% 50%">` : '');

/** 꾸러미 패널 큰 장면 — `.pk-scene` 안에 들어갈 `<img>`. 칸에 꽉 차게(넘치면 위아래·양옆이 같이 잘려 가운데가 남는다). 캔버스가 없으면 빈 문자열 */
export function packScene(id: string): string {
  const draw = SCENES[id];
  if (!draw) return '';
  return sceneImg(snap(`pk2|${id}`, SC_H, stage(draw, SC_W, SC_H), id === 'no_ads' ? BRUSH_FONT : false, SC_W, SC_SCALE));
}

/** 이달의 현장 표지(논리 360×150) — 야간 철거 · 폭파 해체 · 고공 철거. 모르는 테마는 야간 */
export function seasonCover(themeId: string): string {
  const id = themeId in COVERS ? themeId : 'night';
  return sceneImg(snap(`cv|${id}`, CV_H, stage(COVERS[id], CV_W, CV_H), false, CV_W, SC_SCALE));
}

const CV_W = 360;
const CV_H = 150;

/** 폭파: 건물이 주저앉고 먹 구름이 번진다. 오른쪽 앞엔 도화선이 타들어 간다 (주홍) */
function blast(ctx: Ctx): void {
  const m: Moon = { x: 236, y: 64, r: 50, seed: 41 };
  const gy = CV_H - 8;
  moon(ctx, m, SEAL);
  dual(ctx, m, (c, h) => {
    const o = c === PAPER ? INK : PAPER;
    ln(ctx, c, h, [[-4, gy + 2], [CV_W + 4, gy]], 8, 7, 200);
    face(ctx, c, h, rect(66, 84, 152, gy), 201, 1.4);
    for (let r = 0; r < 3; r++) for (let j = 0; j < 4; j++) face(ctx, o, false, rect(74 + j * 19, 94 + r * 17, 84 + j * 19, 104 + r * 17), 210 + r * 4 + j, 0.4);
    // 윗덩이 — 기울며 떨어진다
    ctx.save();
    ctx.translate(152, 84);
    ctx.rotate(0.42);
    face(ctx, c, h, rect(-70, -40, 6, 0), 202, 1.4);
    for (let j = 0; j < 3; j++) face(ctx, o, false, rect(-62 + j * 22, -30, -52 + j * 22, -18), 230 + j, 0.4);
    ctx.restore();
    for (let i = 0; i < 6; i++) bar(ctx, c, h, 160 + i * 9 + (hs(41, i) - 0.5) * 14, 62 + i * 9 + hs(41, i + 6) * 10, 9 + 7 * hs(41, i + 12), 5, hs(41, i + 18) * TAU, 240 + i);
  });
  // 먹 구름 — 한지 테 + 먹 속
  const puffs: [number, number, number][] = [[70, gy - 8, 16], [96, gy - 18, 22], [126, gy - 10, 19], [152, gy - 22, 24], [180, gy - 10, 17], [112, gy - 36, 18], [146, gy - 46, 14]];
  for (const [x, y, r] of puffs) blob(ctx, PAPER, false, x, y, r + 2.6, x);
  for (const [x, y, r] of puffs) blob(ctx, INK, false, x, y, r, x + 1);
  // 도화선 — 끝에 주홍 불꽃
  ln(ctx, PAPER, true, [[CV_W + 6, gy - 2], [336, gy - 14], [312, gy - 6], [298, gy - 22], [280, gy - 20]], 3.4, 2.6, 250);
  inkBlot(ctx, 276, gy - 21, 8, 6, SEAL);
}

/** 고공: 철골 보 위의 졸라맨, 안전줄이 위 보로 이어진다. 아래는 까마득한 도시 (금) */
function high(ctx: Ctx): void {
  const m: Moon = { x: 70, y: 46, r: 32, seed: 51 };
  moon(ctx, m, GOLD);
  const by = 88;
  dual(ctx, m, (c, h) => {
    const o = c === PAPER ? INK : PAPER;
    // 까마득한 아래 — 먼 건물과 창
    for (let i = 0; i < 14; i++) {
      const x = 4 + i * 27 + (hs(51, i) - 0.5) * 8, w = 14 + 10 * hs(51, i + 9), ht = 8 + 22 * hs(51, i + 18);
      face(ctx, c, false, rect(x, CV_H - ht, x + w, CV_H + 3), 400 + i, 0.8);
      face(ctx, o, false, rect(x + 3, CV_H - ht + 4, x + 6, CV_H - ht + 7), 420 + i, 0.2);
    }
    // 사람이 선 큰 보 · 받치는 기둥 · 위에 매달린 보
    lattice(ctx, c, h, [-6, by + 11], [CV_W + 6, by + 11], 16, 26, 260);
    ln(ctx, c, h, [[-6, by], [CV_W + 6, by - 1]], 8, 7, 290);
    lattice(ctx, c, h, [314, by + 18], [314, CV_H - 6], 14, 8, 300);
    lattice(ctx, c, h, [236, 26], [CV_W + 6, 26], 10, 12, 320);
    const [hand] = man(ctx, c, h, 186, by - 4 - 31, 1.2, { lean: -0.1, hat: GOLD, arm: [-0.5, -2.9, 0.5, 0.35], leg: [-0.55, -0.1, 0.45, 0.05] });
    ln(ctx, c, h, [[hand[0] + 30, hand[1] + 12], [hand[0] - 22, hand[1] - 8], [hand[0] - 28, hand[1] - 3]], 4.6, 3.6, 332);
  });
  // 안전줄 — 허리에서 늘어졌다가 위 보 갈고리로
  ln(ctx, GOLD, true, [[190, 32], [206, 46], [228, 46], [246, 31]], 3.2, 2.2, 330);
  blob(ctx, GOLD, true, 246, 31, 4, 331);
}

const COVERS: Record<string, (ctx: Ctx) => void> = {
  night: (ctx) => crane(ctx, CV_W, CV_H, { x: 116, y: 76, r: 50, seed: 9 }, 236, 300, 1.1),
  blast,
  high,
};
