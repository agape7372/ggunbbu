// 필살 여섯의 연출(2026-11-01 (5) 「타격감」 판) — 발동부터 끝까지 프레임마다 그린다. 무엇을 언제 부수는지는
// config WAZA_RUN · sim triggerSpecial이 정본이고, 여기선 그 박자(special · wazaSwing · wazaBurst)에 그림 · 반전 · 흔들림 · 무기 이펙트를 맞춘다.
// 층 셋: drawWazaMid(건물 위 · 졸라맨 아래 — 갈라진 건물 · 월하난무의 밤 · 달) · drawWazaWorld(졸라맨 위 — 획 · 피 · 무음일섬 암전) · drawWazaTitle(이름).
// 문법은 docs/INK_FX_2026-11-01.md §2 · §5 · §8: 획은 움직임에서 · 먹 + 무기 포인트 색(벤 순간 획 속) + 인주(SEAL_INK — 피 · 도장) ·
// 획은 알파로 지우지 않는다(꼬리부터 깎기 · 줄이기). 박자마다 반전(screenfx.inkFrame) · 흔들림(takeWazaJolt) · 무기 이펙트(bladeFx.weaponBurst)가 함께 친다.
// 박자: stepWazaShow는 consumeEvents(시뮬 advance 한 번)마다 한 칸 — 히트스톱 동안에도 흐른다.

import type { FallingStack, GameState, JuiceEvent, WazaId, WeaponId } from '../core/types';
import { JUICE, PALETTE, PLAYER, SEAL_INK, VIEW, WAZA_RUN } from '../config';
import { WAZA_COPY } from '../content';
import { brushArc, brushLine, brushPath, enso, hotCore, inkBlot, inkDrop, inkDust, PRESS, spatter } from './ink';
import { drawPlayer, drawStack, floorTile, greatLook, liveBlade, setLiveBody } from './sprites';
import { makeFloor, makeStack } from '../core/building';
import { pointInk, spawnStackShatter } from './effects';
import { bloodSpray, weaponBurst } from './bladeFx';
import { flashK, inkFrame } from './screenfx';
import { MUKJUL_STAR, wazaBodyAt, type WazaShowView } from './wazaBody';

/** 예비동작 길이 — 이 프레임에 renderer가 쥐었던 묶음을 푼다(천지개벽 · 올려베기가 실제로 부서지는 순간) */
const P = JUICE.special.hitstop;
const INK = PALETTE.INK;
const PAPER = PALETTE.BG;
/** 담묵 — 구름 · 바람 결 · 먼지. 포인트 색이 아니라 먹의 농담 */
const WASH = '#8C877D';
/** 암전 하늘 — 먹보다 한 끗 밝아 먹 획과 붙지 않는다 */
const NIGHT = '#2A2930';
/** 밤 위 빛번짐 — 무음일섬 흰 줄 둘레 농담 두 겹(바깥 · 안쪽). 앞 암전(검은 화면) 위에만 그린다. 알파를 안 쓰고 띠 너비를 줄여 지운다 */
const GLOW = ['#4E4C55', '#86838C', '#C4C1C8'] as const;
/** 무음일섬 번쩍 길이(틱) — 이 동안 화면 전체가 검고 흰 띠가 줄어 선이 된다(참철도 영상 30fps: 하얗게 날아간 1프레임 + 검은 화면 6프레임) */
const FLASH = 14;
/** 피 방울 중력(px/틱²) · 공기 저항(틱마다 줄어드는 속도 비율) — 확 튀어 나갔다가 감속해 떠 있고 천천히 떨어진다(참철도 영상의 물보라) */
const BLOOD_G = 0.2;
const BLOOD_DRAG = 0.15;
const TAU = Math.PI * 2;
/** 끝을 모르는 연출(터짐 · 마지막 검풍을 기다린다)의 안전 상한 */
const CAP = 200;
/** 천지개벽 마지막 쌍벼락 프레임 */
const TENCHI_LAST = P + 26;
/** 월하난무 — 졸라맨을 감싸는 밤의 구(땅에 앉는다) · 그 뒤에 뜨는 보름달(아래 끝이 땅에 잘린다) 반지름 */
const DOME_R = 66;
const MOON_R = 168;
const MOON_SEA = '#E8E2D4';

/** 자른 선 — 선 위 한 점 + 단위 방향. slide = 윗동이 선을 따라 미끄러진다 · part = 양쪽으로 벌어진다 */
interface Cut { x: number; y: number; dx: number; dy: number; mode: 'slide' | 'part' }

interface Show {
  id: WazaId; f: number; seed: number;
  /** 발동 순간 졸라맨 발(월드 px) */
  x: number; foot: number;
  /** 벤 건물 밑면 · 보이는 높이(없으면 머리 위 빈 자리) */
  bottom: number; h: number;
  /** 한 타 — 휘두른 프레임 · 그때 노린 건물 밑면(월드 px) */
  hits: { f: number; y: number }[];
  /** 터진 프레임(−1 = 아직) */
  burst: number;
  end: number;
  /** 든 무기 · 그 포인트 색 — 필살 획 속과 박자마다 터지는 무기 이펙트 */
  weapon: WeaponId; ink: string;
  /** 필살 자세가 풀린 뒤 졸라맨이 딴 동작을 했다 — 몸 연기(wazaBody)를 거둔다 */
  free: boolean;
}

let show: Show | null = null;
/** 터지며 갈라진 건물 — 반쪽씩 미끄러지다가 조각난다. 다음 필살과 따로 논다 */
let split: { st: FallingStack; t: number; cut: Cut; gimmick: GameState['gimmick'] } | null = null;
let seedN = 1;
/** 이번 소비에서 박자가 쌓은 흔들림 · 킥 — renderer가 takeWazaJolt로 가져간다 */
let jolt = 0;
let kick = 0;
/** 필살 이름 붓글씨 세로줄의 x(화면) · 이번 프레임 암전이 그 줄을 덮은 구간들 [위, 아래](화면 y, 월하난무 밤 · 무음일섬 암전이 적는다) */
const TITLE_X = 30;
const titleNight: [number, number][] = [];

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** f0부터 d프레임 동안 0 → 1 — 빨리 대서 감속(긋기) */
const grow = (f: number, f0: number, d: number): number => 1 - (1 - clamp01((f - f0) / d)) ** 2;
/** f0부터 d프레임 동안 0 → 1 — 천천히 시작해 빨라진다(꼬리 깎기 · 줄이기) */
const eat = (f: number, f0: number, d: number): number => clamp01((f - f0) / d) ** 1.6;
function hz(seed: number, k: number): number {
  const v = Math.sin(seed * 91.3458 + k * 47.853) * 24634.6345;
  return v - Math.floor(v);
}

/**
 * 먹 획 + 벤 순간의 속(core). age = 그은 뒤 프레임 — 속은 앞 5프레임 동안 가늘어지며 먹으로 마른다(음수면 아직 안 벴다).
 * 포인트 색 속엔 달군 속(ink.hotCore)이 먼저 식는다. 인주 속엔 없다
 */
function cutLine(
  ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number,
  w: number, s0: number, s1: number, dry: number, seed: number, age: number, core: string, bend = 0, pr = PRESS.cut,
): void {
  ctx.fillStyle = INK;
  brushLine(ctx, x0, y0, x1, y1, w, s0, s1, dry, seed, bend, pr);
  const k = age < 0 ? 0 : 1 - age / 5;
  if (k <= 0) return;
  ctx.fillStyle = core;
  brushLine(ctx, x0, y0, x1, y1, w * 0.42 * k, s0, s1, 0, seed, bend, pr);
  if (core !== SEAL_INK) hotCore(ctx, age / 5, (h) => brushLine(ctx, x0, y0, x1, y1, w * 0.42 * k * h, s0, s1, 0, seed, bend, pr));
}

function cutPath(
  ctx: CanvasRenderingContext2D, pts: readonly number[], w: number, s0: number, s1: number,
  dry: number, seed: number, age: number, core: string, pr = PRESS.flick,
): void {
  ctx.fillStyle = INK;
  brushPath(ctx, pts, w, s0, s1, dry, seed, pr);
  const k = age < 0 ? 0 : 1 - age / 5;
  if (k <= 0) return;
  ctx.fillStyle = core;
  brushPath(ctx, pts, w * 0.4 * k, s0, s1, 0, seed, pr);
  if (core !== SEAL_INK) hotCore(ctx, age / 5, (h) => brushPath(ctx, pts, w * 0.4 * k * h, s0, s1, 0, seed, pr));
}

/**
 * 칼날 한 줄 — 높이 y의 정가로 직선, x0 → x1 가운데 s0 ~ s1만 칠한다(모양으로 지우기). 양 끝은 tip px에 걸쳐 칼끝처럼 뾰족하고
 * 가장자리 떨림 · 비백이 없다. 붓 획(brushLine)과 달리 자로 그은 듯 깔끔해야 하는 무음일섬 줄 전용
 */
function blade(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, w: number, s0: number, s1: number, tip: number): void {
  ctx.beginPath();
  bladePath(ctx, x0, x1, y, w, s0, s1, tip);
  ctx.fill();
}

/** blade의 길만 지금 경로에 덧붙인다 */
function bladePath(ctx: CanvasRenderingContext2D, x0: number, x1: number, y: number, w: number, s0: number, s1: number, tip: number): void {
  const a = x0 + (x1 - x0) * s0;
  const b = x0 + (x1 - x0) * s1;
  if (b - a < 1 || w < 0.3) return;
  const t = Math.min(tip, (b - a) / 2);
  ctx.moveTo(a, y);
  ctx.lineTo(a + t, y - w / 2);
  ctx.lineTo(b - t, y - w / 2);
  ctx.lineTo(b, y);
  ctx.lineTo(b - t, y + w / 2);
  ctx.lineTo(a + t, y + w / 2);
  ctx.closePath();
}

/**
 * 비스듬한 칼날 — (x, y)에서 ang 쪽으로 길이 L(blade를 돌린 것, 가운데가 가장 굵고 양 끝 뾰족). 지금 경로에 덧붙이기만 한다
 * (여럿을 한 경로로 한 번에 칠한다)
 */
function needle(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, L: number, w: number, s0: number, s1: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  bladePath(ctx, 0, L, 0, w, s0, s1, L * 0.5);
  ctx.restore();
}

/**
 * 피 한 줄기 — 틈 (x, y)에서 dur 틱 동안 반 틱마다 방울을 쏜다. 방울은 저마다 확 튀어 나갔다가 공기 저항으로 감속해 떠 있고
 * 천천히 떨어져서, 줄기는 휘어진 구슬 줄로 보인다(앞 방울이 가장 굵고, 빠를 땐 꼬리가 길다). 쏘기를 멈추면 끊겨 떠다니다
 * 오그라든다. 칼줄을 나중에 그려 나오는 자리를 덮는다.
 * t = 쏘기 시작한 뒤 틱 · v = 첫 속도(px/틱, 쏠수록 힘이 빠진다) · r = 방울 반지름 · dur 0 = 방울 하나
 */
function squirt(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, ang: number, v: number, dur: number, r: number, life: number): void {
  const fall = BLOOD_G / BLOOD_DRAG; // 끝 속도
  for (let e = 0; e <= Math.min(t, dur); e += 0.5) {
    const age = t - e;
    if (age >= life) continue;
    const s = v * (1 - (0.35 * e) / Math.max(dur, 1));
    const q = Math.exp(-BLOOD_DRAG * age);
    const go = (s * (1 - q)) / BLOOD_DRAG; // 저항을 받으며 간 거리
    const bx = x + Math.cos(ang) * go;
    const by = y + Math.sin(ang) * go + fall * (age - (1 - q) / BLOOD_DRAG);
    const vx = Math.cos(ang) * s * q;
    const vy = Math.sin(ang) * s * q + fall * (1 - q);
    inkDrop(ctx, bx, by, r * (e === 0 ? 1.3 : 1) * (1 - age / life), Math.atan2(vy, vx), Math.min(8, Math.hypot(vx, vy) * 1.1));
  }
}

/** 잘잘 — 줄이 그어진 뒤 터지기 전까지, 틈 여기저기(cx ± 80)서 작은 피줄기가 두 프레임마다 번갈아 뿜는다. t = 줄 그은 뒤 프레임 */
function trickle(ctx: CanvasRenderingContext2D, cx: number, y: number, t: number, seed: number): void {
  ctx.fillStyle = SEAL_INK;
  const last = Math.floor((t - 1) / 2);
  for (let j = Math.max(0, last - 10); j <= last; j++) {
    const st = 1 + j * 2 + hz(seed, j) * 1.5;
    const ang = -Math.PI / 2 + 0.15 + (hz(seed, j + 100) - 0.5) * 1.0;
    squirt(ctx, cx + (hz(seed, j + 200) - 0.5) * 160, y - 1, t - st, ang, 2.5 + 3 * hz(seed, j + 300), 1.5 + 2 * hz(seed, j + 400), 1.2 + 0.8 * hz(seed, j + 500), 16);
  }
}

/**
 * 터짐 — 벤 자리(cx ± 70)에서 피가 사방으로 물보라 친다(영상: 대상 둘레로 붉은 폭발 · 줄기가 바퀴살처럼 뻗는다). 굵은 줄기 열넷은
 * 위쪽 부채꼴, 잔방울 여든은 사방(아래로 친 것은 짧다). 가운데부터 양옆으로 두 틱에 걸쳐 열리고, 떨어지며 오그라들어 끝난다
 */
function gush(ctx: CanvasRenderingContext2D, cx: number, y: number, t: number, seed: number): void {
  ctx.fillStyle = SEAL_INK;
  for (let i = 0; i < 14; i++) {
    const q = (i + hz(seed, i)) / 14; // 틈 위 자리 0 → 1
    const ang = -Math.PI / 2 + (q - 0.5) * 2.2 + (hz(seed, i + 20) - 0.5) * 0.3;
    squirt(ctx, cx + (q - 0.5) * 140, y - 2, t - 4 * Math.abs(q - 0.5), ang, 7 + 5 * hz(seed, i + 40), 3 + 2 * hz(seed, i + 60), 1.6 + 0.8 * hz(seed, i + 80), 22);
  }
  for (let i = 0; i < 80; i++) {
    const q = hz(seed, i + 100);
    const ang = -Math.PI / 2 + (hz(seed, i + 130) - 0.5) * 2 * Math.PI * 0.95;
    const v = (4 + 8 * hz(seed, i + 160)) * (Math.sin(ang) > 0 ? 0.5 : 1);
    squirt(ctx, cx + (q - 0.5) * 140, y - 2, t - 4 * Math.abs(q - 0.5), ang, v, 0, 0.9 + 1.3 * hz(seed, i + 190), 20);
  }
}

/** 첫 피 — 뽑는 순간 벤 자리(cx ± 40)에서 붉은 물보라가 위로 확 친다(검은 화면 위 붉은 덩어리 — 가는 줄기 열둘 + 잔방울 여든을 몰아서) */
function spray(ctx: CanvasRenderingContext2D, cx: number, y: number, t: number, seed: number): void {
  if (t < 0 || t > 32) return;
  ctx.fillStyle = SEAL_INK;
  for (let i = 0; i < 12; i++) {
    const ang = -Math.PI / 2 + 0.1 + (hz(seed, i + 20) - 0.5) * 1.6;
    squirt(ctx, cx + (hz(seed, i) - 0.5) * 70, y - 1, t - 2 * hz(seed, i + 10), ang, 6 + 5 * hz(seed, i + 30), 3 + hz(seed, i + 50), 1.5 + 0.7 * hz(seed, i + 60), 24);
  }
  for (let i = 0; i < 80; i++) {
    const ang = -Math.PI / 2 + (hz(seed, i + 140) - 0.5) * 2.6;
    squirt(ctx, cx + (hz(seed, i + 40) - 0.5) * 80, y - 1, t - 4 * hz(seed, i + 90), ang, 3 + 8 * hz(seed, i + 190), 0, 0.9 + 1.5 * hz(seed, i + 240), 26);
  }
}

/** 먹 연기 — 피가 친 자리(cx)에서 피어올라 퍼지며 흐려진다. R = 퍼지는 너비 */
function smoke(ctx: CanvasRenderingContext2D, cx: number, y: number, t: number, life: number, R: number, seed: number): void {
  if (t < 0 || t >= life) return;
  const u = t / life;
  ctx.fillStyle = GLOW[0];
  for (let i = 0; i < 3; i++) {
    inkDust(ctx, cx + (hz(seed, i + 70) - 0.5) * R, y - (8 + 34 * u + 12 * i), R * (0.25 + 0.4 * u), (1 - u) * 1.5, seed + i * 5, 22);
  }
}

/** 별빛 — (x, y)에서 바늘 n개가 사방으로 번쩍(먹 테 · 종이빛 몸), 길고 짧은 것이 번갈아. 먹 테를 다 칠한 뒤 몸을 칠해 가운데에 먹 줄이 엇갈리지 않는다 */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, L: number, n: number, rot: number): void {
  if (L < 2) return;
  const rays = (w: number, k: number): void => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) needle(ctx, x, y, rot + (i * TAU) / n, (i % 2 ? L * 0.55 : L) * k, w, 0, 1);
    ctx.fill();
  };
  ctx.fillStyle = INK;
  rays(5, 1);
  ctx.fillStyle = PAPER;
  rays(2.4, 0.9);
}

/** 땅(g)에서 하늘(top)로 솟는 번개 — 마디 8, 땅 쪽이 굵다(PRESS.flick). 좌우로 jit만큼 꺾인다 */
function boltUp(x: number, g: number, top: number, jit: number, seed: number): number[] {
  const pts = [x, g];
  for (let i = 1; i < 8; i++) {
    const side = i % 2 ? 1 : -1;
    pts.push(x + side * jit * (0.35 + 0.65 * hz(seed, i)), g - ((g - top) * i) / 8 + (hz(seed, i + 9) - 0.5) * 16);
  }
  pts.push(x + (hz(seed, 0) - 0.5) * jit * 2, top);
  return pts;
}

/** 시간차 필살이면 터지기까지 기다리는 프레임(core 틱 t = 연출 P − 1 + t, 11-02 실측 · 한 타 히트스톱은 빼고) — 0 = 시간차가 아니다 */
function expectedBurst(id: WazaId): number {
  const r = (WAZA_RUN as Record<string, { burst: number }>)[id];
  return r && r.burst > 0 ? P - 1 + r.burst : 0;
}

/** 박자 하나 — 흔들림 · 킥은 이번 소비에서 가장 큰 것, inv > 0이면 반전 프레임 */
function beat(shake: number, k: number, inv = 0): void {
  jolt = Math.max(jolt, shake);
  kick = Math.max(kick, k);
  if (inv > 0) inkFrame(inv);
}

/** renderer.consumeEvents가 매번 가져간다(가져가면 비운다) */
export function takeWazaJolt(): { shake: number; kick: number } {
  const out = { shake: jolt, kick };
  jolt = 0;
  kick = 0;
  return out;
}

// ── 자리 ─────────────────────────────────────────────────────

/** 터질 때 건물을 가르는 선 — 무음일섬은 정가로로(윗동이 미끄러진다, 11-01 (5) 「참철도는 일자로」) · 월하난무는 세로로(양쪽으로 벌어진다) · 십이연참은 가르지 않는다 */
function cutOf(sh: Show): Cut | null {
  const cy = sh.bottom - sh.h * 0.5;
  if (sh.id === 'mukjul') return { x: sh.x, y: cy, dx: 1, dy: 0, mode: 'slide' };
  if (sh.id === 'dalmuri') return { x: sh.x, y: cy, dx: 0, dy: 1, mode: 'part' };
  return null;
}

/** 보름달 — 졸라맨 뒤, 아래 끝이 땅에 잘려 무릎으로 앉은 실루엣이 달 아래 끝에 앉는다(월영즉식 암전 컷) */
function moonAt(sh: Show): { x: number; y: number } {
  return { x: sh.x, y: sh.foot - 96 };
}

/** 몸 연기 · 렌더러가 읽는 박자 */
function viewOf(sh: Show): WazaShowView {
  return { id: sh.id, f: sh.f, burst: sh.burst, hitF: sh.hits.map((h) => h.f), free: sh.free };
}

/** 세로 칼날 — x에서 y0 → y1(blade를 세운 것) */
function vblade(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, w: number, s0: number, s1: number, tip: number): void {
  ctx.save();
  ctx.translate(x, 0);
  ctx.rotate(Math.PI / 2);
  blade(ctx, y0, y1, 0, w, s0, s1, tip);
  ctx.restore();
}

/** 십이연참 i번째 획 — 가운데 · 각 · 휘는 쪽 */
function slashAt(sh: Show, i: number): { cx: number; cy: number; a: number; sg: number } {
  const span = Math.min(sh.h, 220);
  const sg = i % 2 ? 1 : -1;
  return {
    cx: sh.x + (hz(sh.seed, i + 20) - 0.5) * 110,
    cy: sh.bottom - 26 - hz(sh.seed, i + 40) * span * 0.75,
    a: sg * (0.22 + 0.95 * hz(sh.seed, i)),
    sg,
  };
}

const sealY = (sh: Show): number => sh.bottom - Math.min(sh.h, 220) * 0.45;

// ── 들머리 ───────────────────────────────────────────────────

/** 필살 발동 프레임 — renderer.beginPrelude가 부른다. st = 방금 그린 건물(천지개벽이면 곧 유령이 된다) */
export function startWazaShow(s: GameState, st: FallingStack | null): void {
  const g = VIEW.GROUND_Y;
  const foot = g - s.player.y;
  let bottom = foot - PLAYER.H - 40;
  let h = 160;
  if (st && st.floors.length) {
    bottom = g - st.y;
    h = Math.min(300, st.floors.reduce((a, f) => a + f.h, 0));
  }
  seedN = (seedN * 7919 + 17) % 9973;
  const fixed: Partial<Record<WazaId, number>> = { tenchi: P + 46, ageba: P + 28 };
  show = {
    id: s.waza, f: 0, seed: seedN, x: VIEW.LANE_X[s.player.lane], foot, bottom, h, hits: [], burst: -1,
    end: fixed[s.waza] ?? CAP, weapon: s.weapon, ink: pointInk(s.weapon), free: false,
  };
}

/** 한 타 · 터짐 — renderer.react가 부른다. st = 방금 그린 건물(터지는 틱엔 core가 이미 지운 그 건물) */
export function wazaShowEvent(s: GameState, e: JuiceEvent, st: FallingStack | null): void {
  const sh = show;
  if (!sh) return;
  // 휘두른 박자 — 맞든 안 맞든 core가 낸다(벤 건물이 먼저 다 무너져도 획은 끝까지 긋는다)
  if (e.kind === 'wazaSwing') {
    const tgt = s.stack;
    const y = tgt ? VIEW.GROUND_Y - tgt.y : sh.bottom;
    sh.hits.push({ f: sh.f, y });
    swingBeat(sh, s, sh.hits.length - 1, y);
    if (sh.id === 'baram' && sh.hits.length === WAZA_RUN.baram.hits.length) sh.end = sh.f + 26;
  }
  if (e.kind !== 'wazaBurst') return;
  sh.burst = sh.f;
  sh.end = sh.f + (sh.id === 'nakgwan' ? 36 : sh.id === 'dalmuri' ? 40 : 30); // 몸 연기가 서기로 돌아올 때까지
  burstBeat(sh);
  if (!st || !(e.n ?? 0) || typeof document === 'undefined') return;
  const tile = (i: number): HTMLCanvasElement | undefined => floorTile(st.floors[i].mat, st.theme, i, st.floors.length, s.gimmick);
  const cut = cutOf(sh);
  if (!cut) { spawnStackShatter(st, tile); return; }
  split = { st, t: 0, cut, gimmick: s.gimmick };
}

/** 정해진 프레임의 박자 — 천지개벽 벼락 · 올려베기 · 무음일섬 휘두르기 · 월하난무 팔 벌리기 */
function fixedBeats(sh: Show): void {
  const f = sh.f;
  const cy = sh.bottom - sh.h * 0.5;
  const w = sh.weapon;
  switch (sh.id) {
    case 'tenchi':
      if (f === P) {
        beat(20, 10, 3);
        weaponBurst(w, sh.x, cy, 'destroy');
        weaponBurst(w, sh.x, sh.foot - 6, 'floor');
      } else if (f === P + 3 || f === P + 6) {
        beat(9, 5);
        weaponBurst(w, sh.x + (f === P + 3 ? -92 : 88), sh.foot - 40, 'hit');
      } else if (f === TENCHI_LAST) {
        beat(14, 8, 2);
        weaponBurst(w, sh.x, cy - 30, 'floor');
      } else if (f >= P + 8 && f <= P + 22 && (f - P) % 2 === 0) beat(3, 1);
      return;
    case 'ageba': {
      if (f === P) beat(14, 9, 2);
      const k = [P, P + 2, P + 4].indexOf(f);
      if (k < 0) return;
      const u = [0.35, 0.68, 1][k];
      const yTop = sh.foot - PLAYER.H - VIEW.FLOOR_H * 5;
      weaponBurst(w, sh.x - 8 + 22 * u, sh.foot - 10 + (yTop - sh.foot + 10) * u, k === 2 ? 'destroy' : 'floor');
      return;
    }
    case 'mukjul':
      // 무기 그림을 줄 위에 겹치지 않는다 — 한 줄만 남기는 게 이 필살이다(포인트 색은 줄 속으로).
      // 휘두르는 순간은 반전하지 않는다 — 검은 화면에 흰 줄(레퍼런스)이 뒤집히면 밝은 화면에 검은 줄이 된다
      if (f === P) beat(10, 6);
      return;
    case 'dalmuri':
      // 두 팔을 벌리는 순간 — 월영즉식의 흰 섬광(반전 둘). 첫 칼의 달은 반전하지 않는다(검은 화면에 흰 달이어야 한다)
      if (f === 4) beat(8, 4, 2);
      return;
    default:
  }
}

/** 휘두른 박자 — 십이연참 획 · 월하난무 칼 · 용오름 검풍 */
function swingBeat(sh: Show, s: GameState, i: number, y: number): void {
  const w = sh.weapon;
  switch (sh.id) {
    case 'nakgwan': {
      const { cx, cy } = slashAt(sh, i);
      beat(5, 3); // 전화면 반전은 도장(터짐)에만 — 열두 타마다 뒤집으면 초당 3번을 넘는다
      weaponBurst(w, cx, cy, 'hit');
      return;
    }
    case 'dalmuri':
      // 세로선 번쩍임(그리기)과 흔들림만 — 무기 그림은 터질 때 한 번(첫 칼에 치면 보름달 · 붉은 선 위를 가린다. 영상엔 선 하나뿐)
      if (i === 0) beat(14, 7);
      else beat(6, 3);
      return;
    case 'baram': {
      const foot = VIEW.GROUND_Y - s.player.y;
      beat(7 + 3 * i, 5, i === WAZA_RUN.baram.hits.length - 1 ? 2 : 0);
      weaponBurst(w, VIEW.LANE_X[s.player.lane], Math.min(foot - 130, y - 8), 'floor');
      return;
    }
    default:
  }
}

/** 터지는 박자 — 가장 큰 반전 · 흔들림 · 무기 완파 그림 · 피 */
function burstBeat(sh: Show): void {
  const w = sh.weapon;
  switch (sh.id) {
    case 'mukjul': {
      // 피는 그리는 피줄기(trickle · gush)만 — 판 풀 피 방울은 마르면 먹 덩이 · 검은 낙수로 남아 줄을 더럽힌다
      beat(22, 12, 4);
      return;
    }
    case 'dalmuri': {
      // 보름달 + 반전 넷(검은 원판) — 건물이 세로로 갈라지며 가운데서 피가 양옆 위로
      const c = cutOf(sh)!;
      beat(24, 12, 4);
      weaponBurst(w, c.x, c.y, 'destroy');
      for (const d of [-1, 1]) bloodSpray(c.x + d * 8, c.y, -Math.PI / 2 + d * 0.9, 0.7, 14, 540);
      return;
    }
    case 'nakgwan':
      beat(18, 10, 3);
      weaponBurst(w, sh.x, sealY(sh), 'destroy');
      return;
    default:
  }
}

export function stepWazaShow(s: GameState): void {
  if (split) {
    split.t += 1;
    if (split.t >= 10) {
      const sp = split;
      split = null;
      if (typeof document !== 'undefined') {
        spawnStackShatter(sp.st, (i) => floorTile(sp.st.floors[i].mat, sp.st.theme, i, sp.st.floors.length, sp.gimmick));
      }
    }
  }
  if (!show) return;
  show.f += 1;
  if (s.player.pose !== 'special' && s.player.pose !== 'idle') show.free = true;
  fixedBeats(show);
  // 시간차 필살이 터짐 없이 끝났으면(디버그로 지움 등) 거둔다 — 터지는 틱엔 wazaRun이 먼저 비고 이벤트는 이 뒤에 오니 그 틱은 빼고
  const lost = expectedBurst(show.id) > 0 && show.burst < 0 && show.f > P + 1 && !s.wazaRun
    && !s.events.some((e) => e.kind === 'wazaBurst');
  if (show.f > show.end || lost) show = null;
}

export function resetWazaShow(): void {
  show = null;
  split = null;
  jolt = 0;
  kick = 0;
}

/** 지금 연출의 박자 — 몸 연기(wazaBody) · 렌더러 점멸 · 시험이 읽는다 */
export function wazaShowState(): WazaShowView | null {
  return show && viewOf(show);
}

// ── 건물 위 · 졸라맨 아래(월드 좌표) — 갈라진 건물 · 월하난무의 밤과 달 ─────────

export function drawWazaMid(ctx: CanvasRenderingContext2D, cam: number): void {
  titleNight.length = 0;
  if (split) drawSplit(ctx, VIEW.GROUND_Y);
  const sh = show;
  if (sh?.id === 'dalmuri') dalNight(ctx, sh, VIEW.FIELD_TOP - cam);
}

// ── 그리기 — 월드 좌표(renderer가 카메라를 건 안쪽, 졸라맨 위) ──────────

export function drawWazaWorld(ctx: CanvasRenderingContext2D, s: GameState, cam: number): void {
  const sh = show;
  if (!sh) return;
  drawShow(ctx, sh, s, VIEW.FIELD_TOP - cam, VIEW.GROUND_Y);
}

function drawShow(ctx: CanvasRenderingContext2D, sh: Show, s: GameState, top: number, g: number): void {
  ctx.save();
  switch (sh.id) {
    case 'tenchi': tenchi(ctx, sh, top, g); break;
    case 'ageba': ageba(ctx, sh, top); break;
    case 'mukjul': mukjul(ctx, sh, s, top); break;
    case 'nakgwan': nakgwan(ctx, sh); break;
    case 'baram': baram(ctx, sh, s); break;
    default: // 월하난무는 모두 졸라맨 뒤(drawWazaMid)
  }
  ctx.restore();
}

/**
 * 상점 필살 칸 — 판에서 그리는 그 연출의 한 장면을 k배로(상점용으로 지어낸 그림 없음). (x, y) = 졸라맨 발.
 * 판의 연출 상태는 건드리지 않는다(장면마다 가짜 Show 하나 · 박자 · 무기 이펙트 없음). 암전 하늘은 칸 밖으로 번져서 뺀다.
 */
export function drawWazaShot(ctx: CanvasRenderingContext2D, id: WazaId, x: number, y: number, k = 0.25, weapon: WeaponId = 'sword'): void {
  const g = VIEW.GROUND_Y;
  const B = expectedBurst(id) || P;
  const h1 = P - 1 + WAZA_RUN.dalmuri.hits[0];
  // [그릴 프레임, 한 타 프레임들, 터진 프레임] — 그 필살이 가장 그 필살다운 순간(월하난무 = 첫 칼에 뜬 보름달 앞 실루엣)
  const pick: Record<WazaId, [number, number[], number]> = {
    tenchi: [P + 1, [], -1], ageba: [P + 2, [], -1],
    mukjul: [B + 3, [], B], dalmuri: [h1 + 4, [h1], -1],
    nakgwan: [B + 3, [B - 9, B - 6, B - 3], B], baram: [36, [24, 34], -1],
  };
  const [f, hits, burst] = pick[id];
  // 판 화면을 그대로 줄인다 — 떨어지던 4층 건물 · 필살 자세 졸라맨 · 그 연출(무음일섬은 갈라진 건물)
  const st = makeStack({ variant: 'building', theme: 'europe', floors: (['mid', 'weak', 'mid', 'mid'] as const).map((m) => makeFloor(m)), y: 130 });
  const bottom = g - st.y;
  const h = st.floors.reduce((a, fl) => a + fl.h, 0);
  const sh: Show = {
    id, f, seed: 5, x: VIEW.LANE_X[0], foot: g, bottom, h, hits: hits.map((t) => ({ f: t, y: bottom })), burst, end: CAP,
    weapon, ink: pointInk(weapon), free: false, // 상점 칸도 장착한 무기의 포인트 색(판과 같은 모습)
  };
  const s = { player: { lane: 0, y: 0 } } as unknown as GameState;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.translate(-VIEW.LANE_X[0], -g);
  if (typeof document !== 'undefined') { // 건물 · 졸라맨 그림은 캔버스가 있어야 굽는다(시험 환경은 연출만)
    const cut = burst >= 0 ? cutOf(sh) : null;
    if (cut) drawHalves(ctx, st, cut, f - burst + 4, 'none', g);
    else drawStack(ctx, st, g, 'none');
  }
  if (id === 'dalmuri') dalNight(ctx, sh, g - y / k, false);
  if (typeof document !== 'undefined') {
    // 졸라맨도 그 프레임의 몸 연기 자세(판과 같은 시간표)
    setLiveBody(wazaBodyAt(viewOf(sh), !!greatLook(weapon)));
    drawPlayer(ctx, 'special', 0, VIEW.LANE_X[0], g);
    setLiveBody(null);
  }
  drawShow(ctx, sh, s, g - y / k, g);
  ctx.restore();
}

function drawSplit(ctx: CanvasRenderingContext2D, g: number): void {
  const sp = split!;
  drawHalves(ctx, sp.st, sp.cut, sp.t, sp.gimmick, g);
}

/** 갈라진 건물 — 반쪽씩 자른 선 바깥을 잘라 내고 미끄러뜨린다. t = 터진 뒤 프레임 */
function drawHalves(ctx: CanvasRenderingContext2D, st: FallingStack, c: Cut, t: number, gimmick: GameState['gimmick'], g: number): void {
  const u = grow(t, 0, 9);
  const D = (c.mode === 'part' ? 26 : 34) * u;
  for (const side of [1, -1] as const) {
    const nx = -c.dy * side;
    const ny = c.dx * side;
    // slide: 법선이 아래를 보는 쪽(side 1)이 아랫동 — 윗동만 선을 따라 미끄러진다 · part: 양쪽이 법선 방향으로
    const ox = c.mode === 'part' ? nx * D : side === -1 ? c.dx * D * 1.3 : -c.dx * D * 0.25;
    const oy = c.mode === 'part' ? ny * D : side === -1 ? c.dy * D * 1.3 - u * 6 : -c.dy * D * 0.25;
    const L = 2400;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(c.x - c.dx * L, c.y - c.dy * L);
    ctx.lineTo(c.x + c.dx * L, c.y + c.dy * L);
    ctx.lineTo(c.x + c.dx * L + nx * L, c.y + c.dy * L + ny * L);
    ctx.lineTo(c.x - c.dx * L + nx * L, c.y - c.dy * L + ny * L);
    ctx.closePath();
    ctx.clip();
    ctx.translate(ox, oy);
    drawStack(ctx, st, g, gimmick);
    ctx.restore();
  }
}

/**
 * 천지개벽 — 땅이 먼저 갈라지고(예고) 거기서 하늘로 번개가 솟는다. 박자는 윌라드 2차를 뒤집어 땅에서 위로:
 * 예비동작 동안 발밑에서 뿌리 셋으로 먹 금이 번지고 뿌리마다 먹이 고이고 → 풀리는 순간 가운데 큰 벼락이 땅에서 하늘까지 솟고(반전 · 큰 흔들림) →
 * 양옆 벼락 둘 → 잔 벼락 여덟이 두 프레임마다 투두두두 → 마지막 쌍벼락. 획은 땅 쪽부터 깎여 하늘로 빠져나간다.
 */
function tenchi(ctx: CanvasRenderingContext2D, sh: Show, top: number, g: number): void {
  const f = sh.f;
  const X = [sh.x + 4, sh.x - 92, sh.x + 88];
  // 땅 금 · 고인 먹 — 벼락이 솟을 자리 예고
  if (f < P + 10) {
    const gone = eat(f, P + 2, 8);
    ctx.fillStyle = INK;
    for (let i = 0; i < 3; i++) {
      if (i > 0) {
        const pts = [sh.x, g - 1];
        for (let k = 1; k <= 4; k++) pts.push(sh.x + ((X[i] - sh.x) * k) / 4, g - 1 - (k < 4 ? hz(sh.seed, k + i * 7) * 6 : 0));
        brushPath(ctx, pts, 3.4, gone, grow(f, i, 6), 0.5, sh.seed + i, PRESS.flick);
      }
      const r = 9 * grow(f, 2 + i, 5) * (1 - gone);
      if (r > 0.6) inkBlot(ctx, X[i], g - 1, r, sh.seed + i * 3);
      // 솟기 직전 지지직 — 뿌리에서 짧게 튀는 잔 획
      if (f >= P - 6 && f < P) {
        brushLine(ctx, X[i], g - 2, X[i] + (hz(sh.seed, f + i) - 0.5) * 14, g - 14 - 14 * hz(sh.seed, f + i + 5), 1.8, 0, 1, 0, sh.seed + f + i, 0, PRESS.flick);
      }
    }
  }
  // 벼락 셋 — 가운데는 두 프레임 먼저 솟기 시작해 풀리는 순간(건물이 터지는 틱) 하늘에 닿는다
  const at = [P - 2, P + 3, P + 6];
  const W = [32, 16, 15];
  for (let i = 0; i < 3; i++) {
    if (f < at[i]) continue;
    const age = f - at[i];
    const pts = boltUp(X[i], g, top, i === 0 ? 26 : 16, sh.seed + i * 13);
    const s0 = eat(f, at[i] + (i === 0 ? 10 : 6), i === 0 ? 14 : 10);
    const s1 = grow(f, at[i], 2);
    cutPath(ctx, pts, W[i], s0, s1, 0.25, sh.seed + i * 13, age, sh.ink);
    // 가지 — 마디에서 위로 갈라져 뻗는다
    for (let b = 0; b < 2; b++) {
      const j = 2 + b * 3;
      const jx = pts[j * 2];
      const jy = pts[j * 2 + 1];
      const side = (b + i) % 2 ? 1 : -1;
      ctx.fillStyle = INK;
      brushPath(ctx, [jx, jy, jx + side * 22, jy - 38, jx + side * 42, jy - 86], W[i] * 0.36, s0, grow(f, at[i] + 1, 2), 0.3, sh.seed + i * 5 + b, PRESS.flick);
    }
    // 뿌리 — 땅이 터져 먹이 위로 솟는다
    ctx.fillStyle = INK;
    spatter(ctx, X[i], g - 3, (i === 0 ? 32 : 17) * (1 - eat(f, at[i] + 4, 14)), -Math.PI / 2, sh.seed + i * 5, i === 0 ? 11 : 6);
  }
  // 잔 벼락 여덟 — 두 프레임마다 하나씩 땅에서 짧게 솟는다(투두두두)
  for (let j = 0; j < 8; j++) {
    const f0 = P + 8 + j * 2;
    if (f < f0) break;
    if (f > f0 + 10) continue;
    const x = sh.x - 140 + hz(sh.seed, j + 30) * 280;
    const pts = boltUp(x, g, top + 40 + hz(sh.seed, j + 50) * 160, 10, sh.seed + 40 + j);
    ctx.fillStyle = INK;
    brushPath(ctx, pts, 6, eat(f, f0 + 3, 6), grow(f, f0, 2), 0.3, sh.seed + j, PRESS.flick);
    spatter(ctx, x, g - 2, 8 * (1 - eat(f, f0 + 2, 8)), -Math.PI / 2, sh.seed + j * 3, 3);
  }
  // 마지막 쌍벼락
  if (f >= TENCHI_LAST) {
    for (let i = 0; i < 2; i++) {
      const x = sh.x + (i ? 50 : -46);
      const pts = boltUp(x, g, top, 18, sh.seed + 90 + i);
      cutPath(ctx, pts, 24, eat(f, TENCHI_LAST + 8, 12), grow(f, TENCHI_LAST, 2), 0.25, sh.seed + 90 + i, f - TENCHI_LAST, sh.ink);
      ctx.fillStyle = INK;
      spatter(ctx, x, g - 3, 20 * (1 - eat(f, TENCHI_LAST + 4, 12)), -Math.PI / 2, sh.seed + 70 + i, 8);
    }
  }
  // 불티 — 땅에서 오르는 마른 먹 가루
  if (f >= P + 4) {
    ctx.fillStyle = WASH;
    inkDust(ctx, X[0], g - 24 - (f - P) * 2.2, 60, 1 - eat(f, P + 8, 30), sh.seed + 77, 18);
  }
}

/** 올려베기 — 붓을 땅에 눕혀 대고(예비동작) 풀리는 순간 하늘로 크게 쳐올린다. 메아리 획 하나가 뒤따르고 끝에서 먹이 위로 튄다 */
function ageba(ctx: CanvasRenderingContext2D, sh: Show, top: number): void {
  const f = sh.f;
  const x = sh.x;
  ctx.fillStyle = INK;
  brushLine(ctx, x - 34, sh.foot - 1, x + 30, sh.foot - 3, 7, eat(f, P, 10), grow(f, 0, P), 0.5, sh.seed, 0, PRESS.enso);
  if (f < P) {
    ctx.fillStyle = WASH;
    inkDust(ctx, x, sh.foot - 10, 50 * (1 - grow(f, 0, P)), 1, sh.seed + 3, 12); // 모여드는 먼지
    return;
  }
  const yTop = Math.max(top + 6, sh.foot - PLAYER.H - VIEW.FLOOR_H * 5);
  cutLine(ctx, x - 8, sh.foot - 10, x + 14, yTop, 36, eat(f, P + 7, 14), grow(f, P, 2), 0.3, sh.seed + 3, f - P, sh.ink, 26, PRESS.flick);
  if (f >= P + 2) cutLine(ctx, x + 24, sh.foot - 30, x + 40, yTop + 40, 11, eat(f, P + 8, 12), grow(f, P + 2, 3), 0.5, sh.seed + 4, f - P - 2, sh.ink, 20, PRESS.flick);
  if (f >= P + 2) {
    ctx.fillStyle = INK;
    spatter(ctx, x + 14, yTop, 22 * (1 - eat(f, P + 6, 14)), -Math.PI / 2, sh.seed + 5, 9);
  }
}

/**
 * 무음일섬(참철도 영상 — 틱 = 1/60초, docs/INK_FX_2026-11-01.md §9) — 낮게 웅크려 칼을 뒤로 감추고(예비동작: 몸을 감는 반달 획 ·
 * 피어오르는 담묵 결) 풀리기 두 프레임 전 화면을 가로지르는 큰 호를 긋는다. 풀리는 순간 FLASH 틱 동안 화면 전체(졸라맨까지)가 검고
 * 화면 끝에서 끝까지 정가로 빛 띠가 줄어 선이 된다(빛살 바늘 셋, 다음 틱 붉은 물보라). 화면이 돌아오면 졸라맨은 칼을 수평으로 뻗은
 * 돌진 자세로 멈춰 있고 줄은 남는다 — 먹 연기 · 틈에서 잘잘 뿜는 피. 머리 위로 휘두른 칼끝에서 별빛이 번쩍이고(MUKJUL_STAR)
 * 가드로 기다리면 줄이 화면 너비 칼날로 터지며 별빛 · 붉은 폭발 · 먹 연기로 끝난다(반전 넷 · 윗동이 미끄러진다).
 * 피는 흘러내리지 않는다 — 터지고 흩어져 떨어지며 오그라든다.
 */
function mukjul(ctx: CanvasRenderingContext2D, sh: Show, s: GameState, top: number): void {
  const f = sh.f;
  const y = cutOf(sh)!.y;
  const xa = -24;
  const xb = VIEW.W + 24;
  const px = VIEW.LANE_X[s.player.lane];
  const foot = VIEW.GROUND_Y - s.player.y;
  if (f < P) {
    // 웅크림 — 칼을 뒤로 감추며 몸을 감는 반달 획, 몸 둘레로 가는 담묵 결이 피어오른다(참철도의 흰 기운)
    ctx.fillStyle = INK;
    brushArc(ctx, px - 2, foot - 18, 25, -0.8, 3.5, 5, eat(f, 4, 6), grow(f, 0, 4), 0.45, sh.seed + 9, 1, PRESS.flick);
    ctx.fillStyle = WASH;
    for (let j = 0; j < 4; j++) {
      if (f < j * 2) continue;
      const x = px + (j - 1.5) * 13 + (hz(sh.seed, j) - 0.5) * 6;
      const y0 = foot - 6 - (f - j * 2) * 3.4;
      brushLine(ctx, x, y0, x + 1, y0 - 16, 1.8, eat(f, j * 2 + 4, 5), grow(f, j * 2, 3), 0.3, sh.seed + j, 0, PRESS.line);
    }
    // 휘두른 칼의 길 — 풀리기 세 프레임 전부터(몸이 휘두르는 두 프레임), 화면을 가로지르는 큰 호가 벨 줄 높이에서 위로 휜다(먹 + 속 포인트 색)
    if (f >= P - 3) {
      const R = 640;
      const s1 = grow(f, P - 3, 2);
      ctx.fillStyle = INK;
      brushArc(ctx, sh.x, y + R, R, -Math.PI / 2 - 0.36, 0.72, 18, 0, s1, 0.3, sh.seed + 2, 1, PRESS.cut);
      ctx.fillStyle = sh.ink;
      brushArc(ctx, sh.x, y + R, R, -Math.PI / 2 - 0.36, 0.72, 7, 0, s1, 0, sh.seed + 2, 1, PRESS.cut);
    }
    return;
  }
  const B = sh.burst;
  if (B < 0) {
    const t = f - P;
    // 번쩍 — FLASH 프레임 동안 화면 전체가 검다(그 사이 졸라맨이 칼을 뻗은 자세로 바뀐다). 번쩍임을 끄면 졸라맨 머리 위 하늘만.
    // 화면 반을 덮는 빛번짐(농담 띠 셋)과 굵은 종이빛 몸이 처음 빨리 · 끝에 천천히 줄어 떨림 없는 머리카락 선이 된다
    // (영상: 띠가 6프레임에 선이 된다). 번지는 동안엔 먹 테를 두르지 않는다(빛 속에 검은 테가 끼면 빛으로 안 읽힌다)
    const k = (1 - grow(f, P, FLASH)) ** 2;
    const low = flashK() > 0 ? VIEW.H + 48 : Math.max(foot - PLAYER.H - 56, y + 34);
    if (t < FLASH) {
      ctx.fillStyle = NIGHT;
      ctx.fillRect(-48, top - 48, VIEW.W + 96, low - top + 48);
      titleNight.push([VIEW.FIELD_TOP - 48, low + VIEW.FIELD_TOP - top]);
    }
    // 첫 피 — 휘두른 다음 틱에 물보라가 친다(검은 화면 위 붉은 덩어리). 화면이 돌아오면 먹 연기가 피어오르고, 틈에서 작은 피줄기가
    // 잘잘 뿜는다(나오는 자리는 뒤에 그리는 빛번짐 · 줄이 덮는다)
    spray(ctx, sh.x, y, t - 1, sh.seed);
    smoke(ctx, sh.x, y, t - FLASH, 50, 56, sh.seed + 7);
    trickle(ctx, sh.x, y, t - FLASH, sh.seed);
    if (t < FLASH) {
      for (let i = 0; i < GLOW.length; i++) {
        ctx.fillStyle = GLOW[i];
        blade(ctx, xa, xb, y, Math.min([320, 180, 90][i] * k, 2 * (low - y)), 0, 1, [60, 50, 40][i]);
      }
    } else {
      ctx.fillStyle = INK;
      blade(ctx, xa, xb, y, 2.4 + 3, 0, 1, 70);
    }
    // 종이빛 몸
    ctx.fillStyle = PAPER;
    blade(ctx, xa, xb, y, 2.4 + 30 * k, 0, 1, 70);
    if (t < 4) {
      ctx.fillStyle = sh.ink;
      blade(ctx, xa, xb, y, 4 * k, 0, 1, 70);
      // 빛살 — 벤 자리에서 오른쪽 위로 뻗는 바늘 셋, 밑동부터 깎인다
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) needle(ctx, sh.x - 6 + 14 * i, y - 3, -0.42 - 0.2 * i, 150 + 50 * hz(sh.seed, i + 30), 2.6, eat(f, P + 1, 2), 1);
      ctx.fill();
    }
    // 칼끝 별빛 — 머리 위로 휘둘러 치켜든 칼끝이 번쩍(참철도: 터지기 0.6초 전), 몸 연기의 칼끝을 따라간다
    const st = expectedBurst('mukjul') - MUKJUL_STAR;
    if (f >= st && f < st + 8) {
      const great = !!greatLook(sh.weapon);
      const [, , tx, ty] = liveBlade(wazaBodyAt(viewOf(sh), great), great);
      star(ctx, px + tx, foot + ty, 26 * (1 - grow(f, st, 8)), 4, 0.4);
    }
    return;
  }
  // 터짐 — 줄이 한 프레임에 화면 너비 칼날로 부푼다 → 속 포인트 색이 다섯 프레임에 마르고(가운데 종이빛 날은 남는다)
  // → 가늘어지며 왼쪽부터 깎여 사라진다. 무기 그림을 겹치지 않는다
  const t = f - B;
  const s0 = eat(f, B + 10, 12);
  const W = (t < 1 ? 30 : 24) * (1 - 0.8 * eat(f, B + 3, 14));
  // 터짐 — 칼날보다 먼저 그려 나오는 자리를 칼날이 덮는다. 굵은 줄기가 가운데부터 양 끝으로 세 프레임에 걸쳐 뿜고
  // 먹 연기가 1초 남는다(영상: 터진 뒤 연기가 1초 걸려 흩어진다)
  smoke(ctx, sh.x, y, t - 2, 60, 90, sh.seed + 13);
  gush(ctx, sh.x, y, t, sh.seed + 3);
  ctx.fillStyle = INK;
  blade(ctx, xa, xb, y, W, s0, 1, 110);
  ctx.fillStyle = PAPER;
  blade(ctx, xa, xb, y, Math.max(1.4, W * 0.1), s0, 1, 110);
  const k = 1 - t / 5;
  if (k > 0) {
    ctx.fillStyle = sh.ink;
    blade(ctx, xa, xb, y, W * 0.42 * k, s0, 1, 110);
    // 별빛 — 터지는 순간 벤 자리가 번쩍인다
    star(ctx, sh.x, y, 70 * k, 8, 0.2);
  }
}

/**
 * 월하난무(월영즉식 영상 — docs/INK_FX_2026-11-01.md §9). 두 팔을 벌리는 순간 반전 한 번(fixedBeats) → 칼을 머리 위로 세우는 동안
 * 밤의 구가 졸라맨을 감싸며 땅에 앉는다(한지색 유리 테 · 밖으로 번지는 먹 고리) → 첫 칼에 화면 전체가 밤, 졸라맨 뒤로 거대한 보름달
 * (아래 끝이 땅에 잘려 무릎으로 앉은 실루엣이 달 아래 끝에 앉는다) · 붉은 세로선이 위에서부터 달을 가른다 → 달이 가려지면 구의 테와 가는
 * 세로선만 남아 칼마다 번쩍이고 붉은 방울이 튄다 → 마지막 칼에 초승달이 나와 차오르고, 터지는 순간 보름달(반전 넷 = 검은 원판) →
 * 달과 밤이 세로선을 따라 반으로 갈라져 벌어지며 걷힌다. 선은 건물 위에 남아 위부터 깎인다. night = false(상점 칸)면 밤을 빼고 달에 먹 테를 두른다.
 */
function dalNight(ctx: CanvasRenderingContext2D, sh: Show, top: number, night = true): void {
  const f = sh.f;
  const B = sh.burst;
  const hit = sh.hits.map((h) => h.f);
  const h1 = hit[0] ?? P - 1 + WAZA_RUN.dalmuri.hits[0]; // 첫 칼은 앞에 히트스톱이 없어 미리 안다
  const x = sh.x;
  // 밤의 구 — 첫 칼 전. 졸라맨 몸 가운데서 커지며 땅에 앉는다
  if (f < h1) {
    if (f < 3) return;
    const r = 8 + (DOME_R - 8) * grow(f, 3, h1 - 3);
    const cy = sh.foot - r;
    if (night) {
      ctx.fillStyle = NIGHT;
      ctx.beginPath();
      ctx.arc(x, cy, r, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = PAPER;
    brushArc(ctx, x, cy, r - 4, -Math.PI * 0.92, Math.PI * 0.5, 2.2, 0, 1, 0.2, sh.seed + 4, 1, PRESS.line);
    ctx.fillStyle = INK;
    enso(ctx, x, cy, r + 4 + 30 * grow(f, 4, 24), 3, -Math.PI / 2, eat(f, 12, 18), grow(f, 4, 8), 0.5, 1, sh.seed);
    return;
  }
  // 밤 — 첫 칼부터 화면 전체. 터지고 네 틱 뒤 세로선을 따라 반으로 갈라져 양옆으로 벌어진다
  const open = B < 0 ? 0 : eat(f, B + 4, 16);
  const D = (VIEW.W / 2 + 60) * open;
  if (night && open < 1) {
    ctx.fillStyle = NIGHT;
    ctx.fillRect(-48, top - 48, x - D + 48, VIEW.H + 96);
    ctx.fillRect(x + D, top - 48, VIEW.W + 48 - x - D, VIEW.H + 96);
    if (x - D > TITLE_X) titleNight.push([-1e4, 1e4]);
  }
  // 달 — 가림 원판(밤)이 왼쪽에서 와 덮었다가(첫 칼 9틱 뒤) 마지막 칼에 왼쪽으로 물러나 초승달 → 보름달. 터지면 반쪽씩 밤을 타고 벌어지며 오그라든다
  const h5 = hit[WAZA_RUN.dalmuri.hits.length - 1];
  const cover = B >= 0 || !night ? -2.2 : h5 !== undefined ? -2.2 * grow(f, h5, 10) : -2.2 + 2.2 * grow(f, h1 + 9, 5);
  const k = B < 0 ? 1 : 1 - eat(f, B + 8, 14);
  const m = moonAt(sh);
  if (cover > -0.02) {
    // 다 가려진 동안 — 구의 테만 한지색으로 남는다
    ctx.fillStyle = PAPER;
    brushArc(ctx, x, sh.foot - DOME_R, DOME_R, -Math.PI * 0.95, Math.PI * 0.9, 1.6, 0, 1, 0.3, sh.seed + 6, 1, PRESS.line);
  } else if (k > 0.03) {
    for (const side of [-1, 1] as const) {
      ctx.save();
      ctx.translate(m.x + side * D, m.y);
      ctx.scale(k, k);
      ctx.beginPath();
      ctx.rect(side === 1 ? 0 : -MOON_R - 2, -MOON_R - 2, MOON_R + 2, 2 * MOON_R + 4);
      ctx.clip();
      ctx.fillStyle = PAPER;
      ctx.beginPath();
      ctx.arc(0, 0, MOON_R, 0, TAU);
      ctx.fill();
      // 바다 — 테 없는 옅은 원 셋(먹 테를 두르면 얼룩으로 읽힌다)
      ctx.fillStyle = MOON_SEA;
      for (let j = 0; j < 3; j++) {
        ctx.beginPath();
        ctx.arc((hz(sh.seed, j + 60) - 0.5) * MOON_R, (hz(sh.seed, j + 70) - 0.65) * MOON_R * 0.9, MOON_R * (0.1 + 0.09 * hz(sh.seed, j + 80)), 0, TAU);
        ctx.fill();
      }
      if (cover > -2.1) {
        ctx.fillStyle = NIGHT;
        ctx.beginPath();
        ctx.arc(cover * MOON_R, 0, MOON_R * 1.03, 0, TAU);
        ctx.fill();
      }
      if (!night) {
        ctx.fillStyle = INK;
        enso(ctx, 0, 0, MOON_R, 6, -Math.PI / 2, 0, 1, 0.4, 1, sh.seed);
      }
      ctx.restore();
    }
  }
  // 세로선 — 첫 칼에 위에서부터 자라 달을 가른다(붉은 띠 · 벤 순간 속은 무기 포인트 색, 그 뒤 한지색). 달이 가려지면 가는 한지색 선만
  // 남아 칼마다 붉게 번쩍이고, 달이 차오르면 다시 붉다. 밤이 걷히면 종이 위라 먹 테를 두르고 위부터 깎인다
  const y0 = top - 10;
  const y1 = sh.foot;
  const s0 = B < 0 ? 0 : eat(f, B + 12, 16);
  if (s0 >= 1) return;
  const s1 = grow(f, h1, 3);
  const last = B >= 0 ? B : hit[hit.length - 1];
  const flare = f - last < (last === h1 ? 4 : 2);
  const red = flare || cover < -0.6 && (B < 0 || open < 0.5);
  if (open > 0.3 || !night) {
    ctx.fillStyle = INK;
    vblade(ctx, x, y0, y1, red ? 9 : 4, s0, s1, 40);
  }
  if (red) {
    ctx.fillStyle = SEAL_INK;
    vblade(ctx, x, y0, y1, flare ? 10 : 7, s0, s1, 40);
  }
  // 속 줄 — 종이빛(번쩍이는 순간엔 포인트 색)
  ctx.fillStyle = flare ? sh.ink : PAPER;
  vblade(ctx, x, y0, y1, red ? 2.8 : 1.8, s0, s1, 40);
  // 칼 넷 — 세로선 한 곳에서 붉은 방울이 옆으로 튄다
  ctx.fillStyle = SEAL_INK;
  for (let i = 1; i < hit.length; i++) {
    if (f - hit[i] > 10) continue;
    const yy = y0 + 70 + (y1 - y0 - 160) * hz(sh.seed, i + 90);
    spatter(ctx, x, yy, 7 * (1 - eat(f, hit[i] + 2, 8)), i % 2 ? 0 : Math.PI, sh.seed + i * 3, 4);
  }
}

/** 십이연참 — 열두 번 휘갈긴 획이 하나씩 긋혔다 깎이고, 터지는 순간 열두 획이 한꺼번에 인주 속으로 다시 열린 뒤 도장 「끝」이 크게 내리찍힌다 */
function nakgwan(ctx: CanvasRenderingContext2D, sh: Show): void {
  const f = sh.f;
  const B = sh.burst;
  const L = 120;
  const open = B >= 0 && f - B < 6;
  sh.hits.forEach(({ f: h0 }, i) => {
    const { cx, cy, a, sg } = slashAt(sh, i);
    const dx = Math.cos(a) * L * sg;
    const dy = Math.sin(a) * L * sg;
    if (open) cutLine(ctx, cx - dx, cy - dy, cx + dx, cy + dy, 9, 0, 1, 0.2, sh.seed + i * 7, f - B, SEAL_INK, sg * 8);
    else if (f <= h0 + 16) cutLine(ctx, cx - dx, cy - dy, cx + dx, cy + dy, 11, eat(f, h0 + 6, 9), grow(f, h0, 2), 0.35, sh.seed + i * 7, f - h0, sh.ink, sg * 8);
  });
  if (B < 0) return;
  const t = f - B;
  if (t < 1) return;
  const y = sealY(sh);
  const k = (1 + 0.7 * (1 - grow(t, 1, 4))) * (1 - eat(f, B + 26, 9));
  if (k <= 0.05) return;
  seal(ctx, sh.x, y, 86 * k, -0.08, sh.seed);
  if (t < 16) {
    ctx.fillStyle = SEAL_INK;
    for (let j = 0; j < 4; j++) {
      const a = -Math.PI * 0.85 + j * 0.56;
      spatter(ctx, sh.x + Math.cos(a) * 52, y + Math.sin(a) * 52, 8 * (1 - eat(f, B + 4, 12)), a, sh.seed + j * 11, 3);
    }
  }
}

/**
 * 용오름 — 발밑에 마른 바람 고리가 모였다가, 검풍마다 발에서 건물 밑면까지 먹 고리 여덟이 아래부터 감아 오르는 회오리(위로 갈수록 넓다).
 * 고리는 돌며 흔들리고 아래부터 깎인다. 꼭대기에선 밑면을 치받는 먹 튐, 둘레엔 담묵 가루. 뒤 검풍일수록 크다.
 */
function baram(ctx: CanvasRenderingContext2D, sh: Show, s: GameState): void {
  const f = sh.f;
  const x = VIEW.LANE_X[s.player.lane];
  const foot = VIEW.GROUND_Y - s.player.y;
  ctx.fillStyle = WASH;
  enso(ctx, x, foot - 4, 34, 5, 0, eat(f, P, 8), grow(f, 0, P), 0.8, 0.32, sh.seed);
  sh.hits.forEach(({ f: h0, y: by }, i) => {
    const age = f - h0;
    if (age > 26) return;
    const yTop = Math.min(foot - 130, by - 8);
    const H = foot - 8 - yTop;
    for (let j = 0; j < 8; j++) {
      const born = j * 0.7;
      if (age < born) break;
      const s0 = eat(f, h0 + 9 + j, 8);
      if (s0 >= 1) continue;
      const v = j / 7;
      const r = 14 + v * (40 + 12 * i);
      const sway = Math.sin(j * 0.9 + f * 0.35) * (4 + 6 * v);
      const a0 = f * 0.6 + j * 1.1 + sh.seed;
      const w = 4 + 3 * v + i;
      const s1 = grow(age, born, 3);
      ctx.fillStyle = INK;
      brushArc(ctx, x + sway, foot - 8 - H * v, r, a0, 4.4, w, s0, s1, 0.65, sh.seed + j * 5 + i, 0.3, PRESS.cut);
      if (j === 4 && age < 6) {
        ctx.fillStyle = sh.ink;
        brushArc(ctx, x + sway, foot - 8 - H * v, r, a0, 4.4, w * 0.45, s0, s1, 0, sh.seed + j * 5 + i, 0.3, PRESS.cut);
      }
    }
    if (age >= 4) {
      ctx.fillStyle = INK;
      spatter(ctx, x, yTop - 4, 17 * (1 - eat(f, h0 + 8, 12)), -Math.PI / 2, sh.seed + i * 7, 7);
    }
    ctx.fillStyle = WASH;
    inkDust(ctx, x, yTop + 30 - age * 2, 64, 1 - eat(f, h0 + 4, 18), sh.seed + i * 5, 16);
  });
}

/** 인주 도장 — 가장자리가 고르지 않은 네모(돌에 새겨 찍은 결) + 종이색으로 남은 글자 */
function seal(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rot: number, seed: number): void {
  const h = size / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  const n = 5;
  const corner = [[-h, -h], [h, -h], [h, h], [-h, h]];
  for (let e = 0; e < 4; e++) {
    const [x0, y0] = corner[e];
    const [x1, y1] = corner[(e + 1) % 4];
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const j = (hz(seed, e * 10 + i) - 0.5) * size * 0.06;
      const px = x0 + (x1 - x0) * u + (y1 - y0 === 0 ? 0 : j);
      const py = y0 + (y1 - y0) * u + (x1 - x0 === 0 ? 0 : j);
      if (e === 0 && i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  }
  ctx.closePath();
  ctx.fillStyle = SEAL_INK;
  ctx.fill();
  ctx.fillStyle = PALETTE.BG;
  ctx.font = `${Math.round(size * 0.78)}px "East Sea Dokdo", "Gowun Batang", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('끝', 0, size * 0.04);
  ctx.restore();
}

// ── 이름 — 화면 왼쪽 여백에 세로 붓글씨, 크게 찍혀 들어와 자리 잡는다 + 인주 낙관(판 · 테 없음) ─────

export function drawWazaTitle(ctx: CanvasRenderingContext2D): void {
  const sh = show;
  if (!sh) return;
  const name = WAZA_COPY[sh.id].name;
  const px = 40;
  const step = px * 1.02;
  const x = TITLE_X;
  const y0 = VIEW.FIELD_TOP + 64;
  const H = name.length * step;
  const last = Math.min(sh.end, P + 64);
  const gone = eat(sh.f, last - 8, 8); // 위에서부터 걷힌다 — 옅어지지 않는다
  if (gone >= 1) return;
  const slam = 1 + 0.6 * (1 - grow(sh.f, 0, 5));
  const mid = y0 + H / 2;
  ctx.save();
  ctx.beginPath();
  const half = (H / 2 + 30) * slam; // 쾅 커진 만큼 클립도 넓힌다(첫 글자가 잘리지 않게)
  ctx.rect(x - px, y0 + H / 2 - half + 2 * half * gone, px * 2, 2 * half * (1 - gone));
  ctx.clip();
  ctx.translate(x, y0 + H / 2);
  ctx.scale(slam, slam);
  ctx.translate(-x, -(y0 + H / 2));
  ctx.font = `${px}px "East Sea Dokdo", "Gowun Batang", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  // 밤 위의 글자만 종이색(같은 붓글씨, 색만 뒤집는다) — 이번 프레임 밤 · 암전이 덮은 높이(titleNight)로 글자마다 고른다
  for (let i = 0; i < name.length; i++) {
    const gy = mid + (y0 + i * step + px / 2 - mid) * slam;
    ctx.fillStyle = titleNight.some(([a, b]) => gy > a && gy < b) ? PAPER : INK;
    ctx.fillText(name[i], x, y0 + i * step);
  }
  ctx.fillStyle = SEAL_INK;
  ctx.fillRect(x - 8, y0 + H + 6, 16, 16);
  ctx.restore();
}
