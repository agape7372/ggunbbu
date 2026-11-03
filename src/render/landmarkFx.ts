// 명물 보스 넷(종탑 · 바람탑 · 구층탑 · 타워크레인)의 그림 — 몸 · 장식 · 창 인장 · 종. 정본 = docs/STAGES_2026-10-31.md §6.
// ★GameState는 읽기만 한다(작업 지시서는 같은 입력이면 같은 판 — 불변 14). 여기 모듈 변수는 전부 그리기 보간용이고,
// 틱이 되감기거나 명물이 없어지면 비운다. 난수 없음 — 모양은 해시로 정해 매번 같다.
// 몸은 층이 본체라 기존 drawStack(재질 · 금 · 깨짐 단계)을 그대로 쓰고, 그 위에 장식만 얹는다.
// 몸 밑면 쪽(바닥)에 표식을 둔다: 평소엔 몸이 높이 떠서 윗부분이 화면 밖이라, 똑딱 · 깃발 · 띠는 보이는 밑동에 있어야 읽힌다.

import type { FallingStack, Floor, GameState, JuiceEvent, LandmarkId, LandmarkState, Theme } from '../core/types';
import { LANDMARK, PALETTE, STAGE, VIEW, WEAPON } from '../config';
import { lmAct, windBreathLeft } from '../core/landmark';
import { CLOCK_STEP, PAGODA_LOW_Y, blockProgress, craneBand } from '../audio/landmarkSfx';
import { drawStack, floorTile } from './sprites';
import { spawnBellShatter, spawnFloorShatter } from './effects';
import { hs, inkBlot, popScale } from './ink';

const TAU = Math.PI * 2;
const CX = VIEW.LANE_X[0];
const HALF = VIEW.LANE_W / 2;

const BODY_THEME: Readonly<Record<LandmarkId, Theme>> = { bell: 'europe', wind: 'asia', crane: 'modern', pagoda: 'eastasia' };
const BRONZE = { base: '#8A6F3E', dark: '#6B5530', light: '#A88A52', deep: '#3E3020' } as const; // sprites.ts 종 재질 색
const ROOF = '#5E5B57';
const CLOTH = PALETTE.INK; // 깃발 · 차양 천 — 먹 + 한지 줄. 주홍은 「노릴 곳」(인장 · 크레인 띠)에만 쓴다

// ── 순수 함수(시험) ─────────────────────────────────────────────

/** 창 인장의 먹 — 1(막 찍음) → 0(다 마름). 창이 끝나는 틱에 0 */
export function sealInk(t: number, diff: 0 | 1 | 2): number {
  return Math.max(0, Math.min(1, 1 - t / LANDMARK.SIT_TICKS[diff]));
}

/** 종탑 내려찍기 그림자 — 몸이 내려올수록(bodyY 큼 → 0) 커지고 진해진다. rx = 가로 반지름(px), a = 먹 농도 */
export function slamShadow(bodyY: number): { rx: number; a: number } {
  const t = Math.max(0, Math.min(1, 1 - bodyY / LANDMARK.BELL.HOVER_Y));
  return { rx: 40 + 100 * t, a: 0.22 + 0.43 * t };
}

/** 종탑 「절반」 문턱 칸 하나의 상태 — full = 꽂음 · miss = 빗나감(금) · open = 남음 · 공중 */
export type TallyCell = 'full' | 'miss' | 'open';

/** 이번 파 종 hours칸. got = 꽂은 수 · n = 던진 수 · inAir = 지금 날고 있는 종이 있나(그건 아직 결과가 아니다) */
export function bellTally(got: number, n: number, hours: number, inAir: boolean): TallyCell[] {
  const resolved = n - (inAir ? 1 : 0);
  return Array.from({ length: hours }, (_, i) => (i < got ? 'full' : i < resolved ? 'miss' : 'open'));
}

/** 급한 집 떨림 최대 진폭(px). 3px은 폰에서 안 보였다(페이블 마무리 검토) */
export const HASTY_SHAKE_PX = 6;

/** 급한 집 떨림 진폭(px) — 최하층 HP가 1일 때만, 쌓인 틱(hastyT)에 비례해 HASTY_TICKS에서 최대(급락 직전) */
export function hastyAmp(hastyT: number, bottomHp: number): number {
  return bottomHp === 1 ? HASTY_SHAKE_PX * Math.max(0, Math.min(1, hastyT / STAGE.HASTY_TICKS)) : 0;
}

/** 바람탑 가벼운 좌판의 팔랑임 진폭(px) */
export const WIND_FLUTTER_PX = 2.6;
/** 구층탑을 크게 띄웠을 때 탑이 흔들리는 길이(그린 프레임) · 최대 진폭(px) */
const LIFT_SHAKE_FRAMES = 16;
export const LIFT_SHAKE_PX = 5;

/** 가벼워진 좌판인가 — 띄운 횟수가 난이도별 문턱(WIND.LIGHT)에 닿았고 좌판이 떠 있다 */
export function windLight(s: GameState): boolean {
  const lm = s.lm;
  return lm?.id === 'wind' && s.stack !== null && lm.k >= LANDMARK.WIND.LIGHT[s.stage?.diff ?? 1];
}

/**
 * 지금 건물의 가로 떨림 변위(px). 급한 집 · 가벼운 좌판 · 띄운 구층탑이 이 하나를 같이 쓴다(렌더러가 이것만 부른다).
 * 위상은 s.tick(구층탑은 그린 프레임)이라 같은 판은 같은 떨림
 */
export function hastyShakeX(s: GameState): number {
  const f = s.stack?.floors[0];
  const hasty = s.stage?.hasty && f ? hastyAmp(s.stage.hastyT, f.segs[0].hp) * Math.sin(s.tick * 2.1) : 0;
  const flutter = windLight(s) ? WIND_FLUTTER_PX * Math.sin(s.tick * 0.9) : 0;
  const lift = liftT > 0 ? LIFT_SHAKE_PX * (liftT / LIFT_SHAKE_FRAMES) * Math.sin(liftT * 2.2) : 0;
  return hasty + flutter + lift;
}

/** 종탑 2막 정각 시계 분침 각(라디안, 12시 = 0). 한 바퀴를 다 돌면 정각 눈금에 닿아 종이 한 덩이로 떨어진다 */
export function minuteAngle(p: number): number {
  return Math.max(0, Math.min(1, p)) * TAU;
}

/** 구층탑 땅 그림자 — 높이 y(밑면)가 낮을수록 크고 진하다. 밑면이 PAGODA_LOW_Y 밑이면 한 단계 더 진하다 */
export function pagodaShadow(y: number): { rx: number; a: number } {
  const t = Math.max(0, Math.min(1, 1 - y / LANDMARK.PAGODA.START_Y));
  const near = Math.max(0, Math.min(1, 1 - y / PAGODA_LOW_Y));
  return { rx: 70 + 50 * t, a: 0.1 + 0.15 * t + 0.3 * near };
}

/** 바람탑 좌판 밑 그림자 — 낮을수록 크다. 맞바람(x > 0)이 남은 동안 진하고, 남은 틱이 많을수록 더 진하다 */
export function windShadow(y: number, x: number): { rx: number; a: number } {
  const t = Math.max(0, Math.min(1, 1 - y / LANDMARK.WIND.HOVER_Y));
  const gust = x > 0 ? 0.3 + 0.2 * Math.min(1, x / LANDMARK.WIND.RETURN_TICKS) : 0;
  return { rx: 34 + 80 * t, a: 0.08 + 0.1 * t + gust };
}

/** 땅 먼지 알갱이 수 — 땅의 더미 하나마다 셋 */
export function dustCount(piles: number): number {
  return Math.max(0, Math.min(3, piles)) * 3;
}

/** 크레인 줄이 해진 정도: 케이블 벤 수 0 · 1(가닥이 풀림) · 2(끊기기 직전, 점선) */
export function cableFray(got: number): 0 | 1 | 2 {
  return got >= 2 ? 2 : got >= 1 ? 1 : 0;
}

/** 크레인 반창 — 3막 첫 걸림에 팔이 반만 꺾여 추가 HALF_Y까지 내려오는 동안 */
export function craneHalf(lm: LandmarkState): boolean {
  return lm.id === 'crane' && lm.st === 'sit' && lm.cue === 2;
}

/** 인장 주홍 면의 너비(px) —먹이 오른쪽 끝에서부터 말라, 남은 시간만큼 왼쪽에 주홍이 남는다(막대). 알파는 쓰지 않는다 */
export function sealBar(ink: number, w: number): number {
  return Math.round(Math.max(0, Math.min(1, ink)) * w);
}

/** 시계 [시침, 초침] 각(라디안, 12시 = 0, 시계 방향 +). 초침은 CLOCK_STEP틱마다 한 칸(60도) 가고 cue 0에서 12시에 선다 */
export function clockAngles(hours: number, cue: number): [number, number] {
  return [(hours / 12) * TAU, -(Math.ceil(Math.max(0, cue) / CLOCK_STEP) % 6) * (TAU / 6)];
}

/** 깃발이 뻗는 방향(라디안, 0 = 오른쪽, +π/2 = 아래). u 0 들숨 = 탑 쪽(왼쪽 아래)으로 늘어짐 · 1 날숨 = 밖으로 펄럭 */
export function flagAngle(u: number): number {
  return 1.75 + (0.12 - 1.75) * u;
}

/** 숨이 바뀌기 TREMBLE틱 전부터 깃발이 떤다. 0(안 떪) ~ 1(바뀌기 직전) */
const TREMBLE = 14;
export function flagTremble(left: number): number {
  return left > 0 && left <= TREMBLE ? 1 - left / TREMBLE : 0;
}

/** 크레인 마스트 띠의 화면 위·아래 y — 지면 좌표 [k, k+두께]를 화면(지면선 g)으로 */
export function bandScreen(g: number, k: number, diff: 0 | 1 | 2): [number, number] {
  return [g - (k + LANDMARK.CRANE.BAND_H[diff]), g - k];
}

/** 풍경이 빛나는 정도 0..1 — 울림 창(cue)이 열린 동안 */
export function chimeGlow(lm: LandmarkState): number {
  return lm.id === 'pagoda' ? Math.max(0, Math.min(1, lm.cue / LANDMARK.PAGODA.CHIME_WINDOW)) : 0;
}

export function isBellStack(st: { floors: readonly Floor[] }): boolean {
  return st.floors[0]?.mat === 'bell';
}

const stackH = (floors: readonly Floor[]): number => floors.reduce((h, f) => h + f.h, 0);

// ── 그리기 보간 상태(렌더 전용) ─────────────────────────────────

let lastTick = -1;
/** 바람탑 깃발 0 늘어짐 · 1 펄럭 — 숨이 바뀌면 이 값이 따라간다 */
let flagU = 0;
let flagPh = 0;
/** 크레인 갈고리 높이(지면 기준). 짐이 달렸으면 짐 꼭대기, 놓으면 지브로 감겨 올라간다 */
let cableEnd = -1;
/** 마지막으로 그린 몸 — 층이 깨질 때 그 층 그림으로 조각을 낸다 */
let lastBody: { floors: Floor[]; y: number } | null = null;
/** 종탑 문턱 칸 튐 남은 틱(0 = 없음) · 직전 「이번 파는 안전」 여부 */
let tallyPop = 0;
let prevSafe = false;
const POP_TICKS = 8;
/** 땅에서 금 가는 종 */
let bellGhost: { t: number } | null = null;
const CRACK_TICKS = 6;
/** 구층탑 띄움 흔들림 남은 프레임(0 = 없음) · 직전 프레임의 띄움 판정 */
let liftT = 0;
let prevLift = false;
/** 직전 프레임의 막 · 종탑 내려찍기 판정(0 아직 · 1 지남 · 2 막음) — 바뀐 프레임에 먹 터짐을 찍는다 */
let prevAct = 0;
let prevSlamAir = 0;
/** 먹 터짐 — 막이 바뀐 몸 · 막은 내려찍기. t 프레임째(MARK_FRAMES에서 끝) */
interface InkMark { x: number; y: number; R: number; t: number; seed: number }
let marks: InkMark[] = [];
const MARK_FRAMES = 18;
/** 크레인 마스트 띠의 그린 높이(내리는 동안은 미끄러지는 값, 그 밖엔 목표로 다가간다) */
let bandShown = -1;
/** 갈고리가 짐을 쥐고 있었나 · 그때 짐 밑면 · 줄이 끊겨 늘어진 남은 프레임 */
let wasHeld = false;
let heldY = 0;
let dangle = 0;
const DANGLE_FRAMES = 40;
/** 렌더 프레임이 틱을 건너뛰어도 오판하지 않게 소리(8)보다 넉넉하다 */
const CABLE_CUT_SLACK = 20;

export function resetLandmarkFx(): void {
  lastTick = -1;
  flagU = 0;
  flagPh = 0;
  cableEnd = -1;
  lastBody = null;
  bellGhost = null;
  tallyPop = 0;
  prevSafe = false;
  liftT = 0;
  prevLift = false;
  prevAct = 0;
  prevSlamAir = 0;
  marks = [];
  bandShown = -1;
  wasHeld = false;
  heldY = 0;
  dangle = 0;
}

/** 종이 땅에 떨어져 깨졌다(floorCollapse + mat bell) — 금 가다 조각이 튄다 */
export function noteBellBreak(): void {
  bellGhost = { t: 0 };
}

/** 시험용 */
export function landmarkFxView(): { flagU: number; ghost: number; marks: number; lift: number; band: number; dangle: number } {
  return { flagU, ghost: bellGhost?.t ?? -1, marks: marks.length, lift: liftT, band: bandShown, dangle };
}

/**
 * 몸 최하층이 깨졌다 — 방금 그린 그 층 그림으로 조각을 낸다. 몸의 붕괴면 true(그 밖의 붕괴는 호출자가 처리).
 * 쓰러뜨리는 마지막 층도 같다(쓰러짐 연출 = 기존 층 붕괴).
 */
export function shatterBody(s: GameState, e: JuiceEvent): boolean {
  const lm = s.lm;
  if (!lm?.body || !e.mat || e.mat === 'bell' || (lm.st !== 'sit' && lm.st !== 'down')) return false;
  const f = lastBody?.floors[0];
  if (!f || !lastBody || typeof document === 'undefined') return true;
  const tile = floorTile(f.mat, BODY_THEME[lm.id], 0, lastBody.floors.length);
  spawnFloorShatter(tile, CX - HALF, VIEW.GROUND_Y - (e.y ?? lastBody.y) - f.h, VIEW.LANE_W, f.h, Math.min(1.4, WEAPON[s.weapon].shake));
  return true;
}

// ── 종 ─────────────────────────────────────────────────────────

/** 종 몸통 — 둥근 어깨에서 허리로 좁았다 아래로 벌어지는 입. 입 밑(bottom-16)에서 끝난다 */
function bellPath(ctx: CanvasRenderingContext2D, top: number, bottom: number): void {
  const lip = bottom - 16;
  ctx.beginPath();
  ctx.moveTo(CX - 50, lip);
  ctx.bezierCurveTo(CX - 42, lip - 8, CX - 33, lip - 22, CX - 31, top + 36);
  ctx.bezierCurveTo(CX - 30, top + 18, CX - 18, top + 10, CX, top + 10);
  ctx.bezierCurveTo(CX + 18, top + 10, CX + 30, top + 18, CX + 31, top + 36);
  ctx.bezierCurveTo(CX + 33, lip - 22, CX + 42, lip - 8, CX + 50, lip);
  ctx.closePath();
}

/** 던진 종 — 청동 종 실루엣. 층 블록 대신 이걸 그린다. flash > 0이면 맞은 순간 흰 번쩍(깡). 덩이(2막 정각)는 층마다 한 개씩 쌓는다 */
export function drawBell(ctx: CanvasRenderingContext2D, st: { y: number; floors: readonly Floor[] }, g: number, flash = 0): void {
  let bottom = g - st.y;
  const heights = st.floors.length > 0 ? st.floors.map((f) => f.h) : [VIEW.FLOOR_H];
  for (const h of heights) {
    drawOneBell(ctx, bottom, h, flash);
    bottom -= h;
  }
}

function drawOneBell(ctx: CanvasRenderingContext2D, bottom: number, h: number, flash: number): void {
  const top = bottom - h;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // 매다는 고리
  ctx.beginPath();
  ctx.arc(CX, top + 6, 6, 0, TAU);
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 5.5;
  ctx.stroke();
  ctx.strokeStyle = BRONZE.dark;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // 몸통
  bellPath(ctx, top, bottom);
  ctx.fillStyle = BRONZE.base;
  ctx.fill();
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // 왼쪽 빛 줄 · 오른쪽 그늘 줄
  ctx.beginPath();
  ctx.moveTo(CX - 20, top + 20);
  ctx.bezierCurveTo(CX - 25, top + 30, CX - 26, bottom - 36, CX - 36, bottom - 26);
  ctx.strokeStyle = BRONZE.light;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(CX + 21, top + 22);
  ctx.bezierCurveTo(CX + 26, top + 32, CX + 27, bottom - 36, CX + 37, bottom - 26);
  ctx.strokeStyle = BRONZE.dark;
  ctx.lineWidth = 4;
  ctx.stroke();
  // 허리 띠 한 줄
  ctx.fillStyle = BRONZE.deep;
  ctx.fillRect(CX - 33, top + 36, 66, 4);
  // 입(아랫단)
  ctx.fillStyle = BRONZE.dark;
  ctx.fillRect(CX - 54, bottom - 16, 108, 8);
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(CX - 54, bottom - 16, 108, 8);
  // 입 밑의 추
  ctx.beginPath();
  ctx.arc(CX, bottom - 3, 6, 0, TAU);
  ctx.fillStyle = BRONZE.deep;
  ctx.fill();
  ctx.stroke();
  if (flash > 0.02) {
    bellPath(ctx, top, bottom);
    ctx.globalAlpha = flash;
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
  }
  ctx.restore();
}

/** 땅에서 금 가는 종 — 반쪽씩 벌어지며 금이 번지고, 끝나면 조각이 튄다 */
function drawBellGhost(ctx: CanvasRenderingContext2D, g: number): void {
  const gh = bellGhost;
  if (!gh) return;
  const u = gh.t / CRACK_TICKS;
  const floors = [{ h: VIEW.FLOOR_H }] as Floor[];
  const top = g - VIEW.FLOOR_H;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(side < 0 ? 0 : CX, top - 20, side < 0 ? CX : VIEW.W - CX, VIEW.FLOOR_H + 40);
    ctx.clip();
    ctx.translate(side * gh.t * 1.3, 0);
    drawBell(ctx, { y: 0, floors }, g);
    ctx.restore();
  }
  // 갈라지는 금 — 위에서 아래로 번개 모양으로 자란다
  ctx.save();
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const n = Math.max(1, Math.round(6 * u));
  ctx.moveTo(CX, top + 6);
  for (let i = 1; i <= n; i++) ctx.lineTo(CX + (i % 2 === 0 ? -1 : 1) * 7, top + 6 + (i * (VIEW.FLOOR_H - 6)) / 6);
  ctx.stroke();
  ctx.restore();
  gh.t += 1;
  if (gh.t >= CRACK_TICKS) {
    spawnBellShatter(CX, g);
    bellGhost = null;
  }
}

// ── 몸 · 장식 ───────────────────────────────────────────────────

/** 시계 — 몸 최하층 가운데. 시침 = 그 파의 시각(3 · 6 · 9 · 12), 초침은 cue가 줄어드는 동안 똑딱 */
function drawClock(ctx: CanvasRenderingContext2D, lm: LandmarkState, y: number, block = -1): void {
  const R = 22; // 아랫단에 문턱 칸이 들어갈 자리를 남긴다
  ctx.save();
  ctx.translate(CX, y);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, R + 3, 0, TAU);
  ctx.fillStyle = BRONZE.dark;
  ctx.fill();
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, R - 1, 0, TAU);
  ctx.fillStyle = PALETTE.WHITE;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = PALETTE.INK;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const big = i % 3 === 0;
    ctx.lineWidth = big ? 2.4 : 1.2;
    ctx.beginPath();
    ctx.moveTo(Math.sin(a) * (R - 3), -Math.cos(a) * (R - 3));
    ctx.lineTo(Math.sin(a) * (R - (big ? 8 : 6)), -Math.cos(a) * (R - (big ? 8 : 6)));
    ctx.stroke();
  }
  const [hour, sec] = clockAngles(LANDMARK.BELL.HOURS[lm.wave % LANDMARK.BELL.HOURS.length], lm.cue);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.sin(hour) * 12, -Math.cos(hour) * 12);
  ctx.stroke();
  if (block >= 0) { // 2막 정각 — 12시 눈금에 먹 쐐기, 분침이 한 바퀴 돌아 거기 닿으면 남은 종이 한 덩이로 떨어진다
    const m = minuteAngle(block) + (block >= 0.9 ? 0.07 * Math.sin(block * 400) : 0);
    ctx.beginPath();
    ctx.moveTo(-4.5, -R - 8);
    ctx.lineTo(4.5, -R - 8);
    ctx.lineTo(0, -R + 1);
    ctx.closePath();
    ctx.fillStyle = PALETTE.INK;
    ctx.fill();
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.sin(m) * (R - 5), -Math.cos(m) * (R - 5));
    ctx.stroke();
  }
  ctx.strokeStyle = PALETTE.RED;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-Math.sin(sec) * 4, Math.cos(sec) * 4);
  ctx.lineTo(Math.sin(sec) * 18, -Math.cos(sec) * 18);
  ctx.stroke();
  ctx.fillStyle = PALETTE.INK;
  ctx.beginPath();
  ctx.arc(0, 0, 2.6, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** 종탑 지붕 — 몸 꼭대기 위(평소엔 화면 밖, 내려앉는 창에 드러난다) */
function drawBellRoof(ctx: CanvasRenderingContext2D, top: number): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(CX - HALF - 8, top);
  ctx.lineTo(CX, top - 52);
  ctx.lineTo(CX + HALF + 8, top);
  ctx.closePath();
  ctx.fillStyle = ROOF;
  ctx.fill();
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.lineWidth = 1.5;
  for (const f of [0.34, 0.68]) {
    ctx.beginPath();
    ctx.moveTo(CX - (HALF + 8) * (1 - f), top - 52 * f);
    ctx.lineTo(CX + (HALF + 8) * (1 - f), top - 52 * f);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(CX, top - 57, 5, 0, TAU);
  ctx.fillStyle = BRONZE.base;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/** 바람탑 시장 차양 — 몸 밑동에 매달린 줄무늬 천(가장자리 물결) */
function drawAwning(ctx: CanvasRenderingContext2D, base: number): void {
  const n = 9;
  const w = (VIEW.LANE_W + 16) / n;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2;
  ctx.strokeStyle = PALETTE.INK;
  for (let i = 0; i < n; i++) {
    const x0 = CX - HALF - 8 + i * w;
    ctx.beginPath();
    ctx.moveTo(x0, base - 4);
    ctx.lineTo(x0 + w, base - 4);
    ctx.lineTo(x0 + w, base + 8);
    ctx.arc(x0 + w / 2, base + 8, w / 2, 0, Math.PI);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? CLOTH : PALETTE.WHITE;
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** 바람탑 깃발 — 몸 오른쪽 옆 장대 끝. 들숨 = 탑 쪽으로 늘어짐 · 날숨 = 밖으로 펄럭 · 숨 바뀌기 직전 떤다 */
function drawFlag(ctx: CanvasRenderingContext2D, s: GameState, lm: LandmarkState, base: number): void {
  const px = CX + HALF + 12;
  const topY = base - 92;
  const target = lm.air === 1 ? 1 : 0;
  flagU += (target - flagU) * 0.25;
  flagPh += 0.12 + 0.28 * flagU;
  const tr = flagTremble(windBreathLeft(s));
  const jx = tr > 0 ? Math.sin(flagPh * 6) * 2.6 * tr : 0;
  // 장대
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(px, base - 2);
  ctx.lineTo(px, topY - 4);
  ctx.stroke();
  ctx.strokeStyle = BRONZE.base;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.fillStyle = BRONZE.base;
  ctx.beginPath();
  ctx.arc(px, topY - 6, 4, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = PALETTE.INK;
  ctx.stroke();
  // 천 — 척추를 따라 물결, 가장자리 두 줄이 폭(26)만큼 벌어진다
  const N = 8;
  const len = 54;
  const wid = 26;
  const phi = flagAngle(flagU);
  const dx = Math.cos(phi);
  const dy = Math.sin(phi);
  const nx = -Math.sin(phi);
  const ny = Math.cos(phi);
  const amp = 1.2 + 4.3 * flagU;
  const spine: Array<[number, number]> = [];
  for (let i = 0; i <= N; i++) {
    const r = i / N;
    const rip = amp * r * Math.sin(flagPh - i * 0.85);
    spine.push([px + jx + dx * len * r + nx * rip, topY + dy * len * r + ny * rip]);
  }
  ctx.beginPath();
  spine.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  for (let i = N; i >= 0; i--) ctx.lineTo(spine[i][0] + nx * wid, spine[i][1] + ny * wid);
  ctx.closePath();
  ctx.fillStyle = CLOTH;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.stroke();
  // 한지색 가운뎃줄
  ctx.beginPath();
  for (let i = 0; i <= N; i++) ctx.lineTo(spine[i][0] + nx * wid * 0.36, spine[i][1] + ny * wid * 0.36);
  for (let i = N; i >= 0; i--) ctx.lineTo(spine[i][0] + nx * wid * 0.64, spine[i][1] + ny * wid * 0.64);
  ctx.closePath();
  ctx.fillStyle = PALETTE.WHITE;
  ctx.fill();
  ctx.restore();
}

/** 크레인 마스트 — 몸 왼쪽 옆, 지면에서 지브까지. 격자 기둥 */
function drawMast(ctx: CanvasRenderingContext2D, g: number, base: number): void {
  const x0 = CX - HALF - 26;
  const w = 14;
  ctx.save();
  ctx.fillStyle = '#A4A6AA';
  ctx.fillRect(x0, base, w, g - base);
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let y = g; y - 22 > base; y -= 22) {
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + w, y - 22);
    ctx.moveTo(x0 + w, y);
    ctx.lineTo(x0, y - 22);
  }
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x0, base, w, g - base);
  ctx.fillStyle = '#545556';
  ctx.fillRect(x0 - 8, g - 6, w + 16, 6);
  ctx.strokeRect(x0 - 8, g - 6, w + 16, 6);
  ctx.restore();
}

/** 크레인 지브(팔) — 몸 밑면에 걸친 가로 격자. 가운데에 케이블이 매달리는 수레 */
function drawJib(ctx: CanvasRenderingContext2D, base: number, half = false): void {
  const x0 = CX - HALF - 30;
  const x1 = CX + HALF + 22;
  const strip = (xa: number, xb: number): void => {
    ctx.fillStyle = '#808184';
    ctx.fillRect(xa, base - 12, xb - xa, 12);
    ctx.strokeStyle = PALETTE.INK;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let x = xa; x + 14 < xb; x += 14) {
      ctx.moveTo(x, base);
      ctx.lineTo(x + 7, base - 12);
      ctx.lineTo(x + 14, base);
    }
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.strokeRect(xa, base - 12, xb - xa, 12);
  };
  const cart = (): void => {
    ctx.fillStyle = '#545556';
    ctx.fillRect(CX - 11, base - 14, 22, 18); // 수레
    ctx.strokeRect(CX - 11, base - 14, 22, 18);
  };
  ctx.save();
  if (!half) {
    strip(x0, x1);
    cart();
  } else { // 반창: 팔이 반만 꺾였다 — 마디 바깥쪽이 치켜들려 있고 마디에 검은 점이 보인다
    const hx = x0 + (x1 - x0) * HALF_JIB_AT;
    strip(x0, hx);
    ctx.save();
    ctx.translate(hx, base - 6);
    ctx.rotate(-HALF_JIB_ANGLE);
    ctx.translate(-hx, -(base - 6));
    strip(hx, x1);
    cart();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(hx, base - 6, 5, 0, TAU);
    ctx.fillStyle = PALETTE.INK;
    ctx.fill();
  }
  ctx.restore();
}
/** 반창 지브 마디 위치(팔 길이의 몫) · 치켜드는 각(라디안) */
const HALF_JIB_AT = 0.4;
const HALF_JIB_ANGLE = 0.3;

/** 케이블 + 갈고리 — 내리는 중엔 짐 꼭대기까지, 놓으면 지브로 감겨 올라간다 */
function drawCable(ctx: CanvasRenderingContext2D, s: GameState, lm: LandmarkState, g: number): void {
  const b = lm.body!;
  const load = s.stack && !isBellStack(s.stack) ? s.stack : null;
  const held = load !== null && lm.air === 0;
  if (cableEnd < 0) cableEnd = b.y;
  // 줄이 끊겼다 — 놓는 자리(LOWER_TO)보다 한참 높은 데서 짐이 쥔 손을 떠났다. 갈고리가 그 높이에 걸려 흔들린다
  if (wasHeld && !held && load !== null && heldY > LANDMARK.CRANE.LOWER_TO + CABLE_CUT_SLACK) dangle = DANGLE_FRAMES;
  wasHeld = held;
  if (held) {
    cableEnd = load.y + stackH(load.floors);
    heldY = load.y;
  } else if (dangle > 0) dangle -= 1;
  else cableEnd += (b.y - cableEnd) * 0.2;
  const len = b.y - cableEnd;
  if (len < 2) return;
  const y0 = g - b.y + 4;
  const y1 = g - cableEnd - 12;
  const sway = dangle > 0 ? 14 * (dangle / DANGLE_FRAMES) * Math.sin(dangle * 0.55) : 0;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 2.5;
  const fray = held ? cableFray(lm.got) : 0;
  if (fray === 2) ctx.setLineDash([10, 5]); // 한 타만 더 — 끊기기 직전
  ctx.beginPath();
  ctx.moveTo(CX, y0);
  if (dangle > 0) ctx.quadraticCurveTo(CX - sway * 0.8, (y0 + y1) / 2, CX + sway, y1);
  else ctx.lineTo(CX, y1);
  ctx.stroke();
  ctx.setLineDash([]);
  if (fray > 0) { // 풀린 가닥 — 줄 가운데 양옆으로 튀어나온 짧은 선 (타격 수만큼 늘어난다)
    const my = (y0 + y1) / 2;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < fray * 2; i++) {
      const sd = i % 2 === 0 ? -1 : 1;
      const yy = my + (i - fray) * 6;
      ctx.moveTo(CX, yy);
      ctx.lineTo(CX + sd * (6 + 2 * fray), yy - 5);
    }
    ctx.stroke();
  }
  if (dangle > 0) { // 끊긴 갈고리 — 줄 끝에서 흔들린다
    ctx.fillStyle = '#545556';
    ctx.fillRect(CX + sway - 10, y1, 20, 12);
    ctx.lineWidth = 2.2;
    ctx.strokeRect(CX + sway - 10, y1, 20, 12);
    ctx.restore();
    return;
  }
  if (held) { // 짐을 거는 줄 두 가닥
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(CX - 6, y1 + 12);
    ctx.lineTo(CX - 62, y1 + 12 + 14);
    ctx.moveTo(CX + 6, y1 + 12);
    ctx.lineTo(CX + 62, y1 + 12 + 14);
    ctx.stroke();
  }
  ctx.fillStyle = '#545556';
  ctx.fillRect(CX - 10, y1, 20, 12);
  ctx.lineWidth = 2.2;
  ctx.strokeRect(CX - 10, y1, 20, 12);
  ctx.restore();
}

/** 마스트 띠 — 짐 꼭대기가 멈춰야 할 높이. 마스트에 주홍 판, 거기서 몸 쪽 벽까지 눈금 두 줄 */
function drawBand(ctx: CanvasRenderingContext2D, s: GameState, lm: LandmarkState, g: number): void {
  // 내리는 동안엔 짐의 원래 띠에서 읽은 띠로 미끄러져 자리 잡고, 그 밖(외주가 짐 층마다 바꿀 때)엔 목표로 다가간다
  const target = craneBand(s);
  bandShown = lm.air === 0 || bandShown < 0 ? target : bandShown + (target - bandShown) * 0.3;
  const [yTop, yBot] = bandScreen(g, bandShown, s.stage?.diff ?? 1);
  const x0 = CX - HALF - 26;
  ctx.save();
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 1.6;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  for (const y of [yTop, yBot]) {
    ctx.moveTo(x0 + 21, y);
    ctx.lineTo(CX - HALF, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = PALETTE.RED;
  ctx.fillRect(x0 - 8, yTop, 30, yBot - yTop);
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x0 - 8, yTop, 30, yBot - yTop);
  // 안쪽 화살촉 — 몸 쪽(오른쪽)을 가리킨다
  ctx.fillStyle = PALETTE.WHITE;
  const mid = (yTop + yBot) / 2;
  const h = Math.min(8, (yBot - yTop) / 2 - 3);
  if (h > 1) {
    ctx.beginPath();
    ctx.moveTo(x0 + 1, mid - h);
    ctx.lineTo(x0 + 15, mid);
    ctx.lineTo(x0 + 1, mid + h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * 창 인장 — 몸 최하층에 찍힌 「철거」. 주홍 면이 오른쪽 끝에서부터 말라 남은 시간만큼만 왼쪽에 남는다(막대).
 * 마른 쪽은 한지 바탕에 먹 글자. 테두리와 글자는 끝까지 읽힌다. 자리는 타격 의성어(가운데 머리 위)를 비켜 왼쪽.
 */
const SEAL = { W: 112, H: 56, DX: -76 };
/** 종탑 3막 play 중 인장 — 시계 · 문턱 칸 옆에 맞게 줄이고 더 왼쪽으로 */
const SEAL_PLAY_SCALE = 0.7;
const SEAL_PLAY_DX = -92;
/** 몸 윗면에서 인장 가운데까지(px) — 시계(윗면 +26) 높이에 맞춘다 */
const SEAL_PLAY_Y = 26;
function drawSeal(ctx: CanvasRenderingContext2D, ink: number, y: number, scale = 1, dx: number = SEAL.DX): void {
  const { W: w, H: h } = SEAL;
  const red = sealBar(ink, w);
  ctx.save();
  ctx.translate(CX + dx, y);
  ctx.rotate(-0.05);
  ctx.scale(scale, scale);
  ctx.fillStyle = PALETTE.WHITE;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = PALETTE.RED;
  if (red > 0) ctx.fillRect(-w / 2, -h / 2, red, h);
  ctx.font = '38px "Black Han Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // 글자: 주홍 위는 한지색(먹 테), 마른 한지 위는 먹
  ctx.save();
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, red, h);
  ctx.clip();
  ctx.lineWidth = 5;
  ctx.strokeStyle = PALETTE.INK;
  ctx.strokeText('철거', 0, 2);
  ctx.fillStyle = PALETTE.WHITE;
  ctx.fillText('철거', 0, 2);
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(-w / 2 + red, -h / 2, w - red, h);
  ctx.clip();
  ctx.fillStyle = PALETTE.INK;
  ctx.fillText('철거', 0, 2);
  ctx.restore();
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}

/** 몸이 쓰러지는 동안 장식이 떨어진다 — 몇 틱 안에 땅에 닿아 사라진다. 장식을 그릴 수 있으면 변위(px), 아니면 null */
function fallOffset(lm: LandmarkState): number | null {
  if (lm.st !== 'down') return 0;
  return lm.t > 14 ? null : lm.t * lm.t * 0.4;
}

/** 내려찍는 몸의 그림자 — 지면에 먹색 타원. 몸이 내려올수록 커지고 진하다(플레이어 발밑을 덮어 「여기 떨어진다」) */
function drawSlamShadow(ctx: CanvasRenderingContext2D, bodyY: number, g: number): void {
  const { rx, a } = slamShadow(bodyY);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = PALETTE.INK;
  ctx.beginPath();
  ctx.ellipse(CX, g - 3, rx, rx * 0.2, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * 프레임마다 직전과 비교해 렌더 전용 연출을 세운다: 막이 바뀐 몸의 먹 터짐 · 종탑 내려찍기를 막은 순간의 먹 터짐 ·
 * 구층탑을 크게 띄웠을 때의 흔들림. 지금 막을 돌려준다
 */
function stepFx(s: GameState, lm: LandmarkState, g: number): 1 | 2 | 3 {
  const act = lmAct(s);
  if (prevAct > 0 && act > prevAct) {
    const y = lm.body ? g - lm.body.y - 12 : s.stack ? g - s.stack.y - 40 : g - 40;
    marks.push({ x: CX, y, R: 24, t: 0, seed: s.tick }); // 가시 끝이 R×2.15 ≈ 52라 3막 인장(왼쪽 53 밖)에 닿지 않는다
  }
  prevAct = act;
  if (lm.id === 'bell' && lm.air === 2 && prevSlamAir !== 2) marks.push({ x: CX, y: g - 26, R: 22, t: 0, seed: s.tick + 3 });
  prevSlamAir = lm.id === 'bell' ? lm.air : 0;
  const lift = lm.id === 'pagoda' && lm.flying && (s.stage?.diff ?? 1) !== 0;
  if (lift && !prevLift) liftT = LIFT_SHAKE_FRAMES;
  else if (liftT > 0) liftT -= 1;
  prevLift = lift;
  return act;
}

/** 땅에 깔리는 예고 — 구층탑 그림자 · 당김의 먼지, 바람탑 맞바람 그림자 */
function drawGroundSigns(ctx: CanvasRenderingContext2D, s: GameState, lm: LandmarkState, g: number, act: number): void {
  const st = s.stack;
  const pull = act >= 2 && (s.stage?.diff ?? 1) !== 0; // 당김 · 맞바람은 견습에 없다
  let sh: { rx: number; a: number } | null = null;
  if (lm.id === 'pagoda' && st && (lm.st === 'play' || lm.st === 'sit')) sh = pagodaShadow(st.y);
  else if (lm.id === 'wind' && st && pull) sh = windShadow(st.y, lm.x);
  if (sh) {
    ctx.save();
    ctx.globalAlpha = sh.a;
    ctx.fillStyle = PALETTE.INK;
    ctx.beginPath();
    ctx.ellipse(CX, g - 3, sh.rx, sh.rx * 0.2, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  if (lm.id === 'pagoda' && pull && lm.st === 'play') { // 당김 — 더미가 쌓인 만큼 땅에서 먼지가 인다
    const n = dustCount(s.groundRocks);
    if (n === 0) return;
    ctx.save();
    ctx.fillStyle = PALETTE.INK;
    for (let i = 0; i < n; i++) {
      const x = CX + (hs(i, 1) - 0.5) * (VIEW.LANE_W + 60);
      const r = 5 + hs(i, 2) * 5;
      const up = 2 + 5 * Math.abs(Math.sin(s.tick * 0.12 + i * 1.7));
      ctx.beginPath();
      ctx.arc(x, g - up, r, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

/** 먹 터짐을 그리고 한 프레임 나이를 먹인다. 앞 22%에 부풀었다 오그라든다(popScale) */
function drawMarks(ctx: CanvasRenderingContext2D): void {
  if (marks.length === 0) return;
  ctx.save();
  ctx.fillStyle = PALETTE.INK;
  for (const m of marks) {
    inkBlot(ctx, m.x, m.y, m.R * popScale(m.t / MARK_FRAMES), m.seed);
    m.t += 1;
  }
  ctx.restore();
  marks = marks.filter((m) => m.t < MARK_FRAMES);
}

/** 젖은 좌판(외주) — 번진 먹이 좌판 밑을 먹물로 적시고 가닥이 흘러내린다. 알파 없이 모양으로 */
function drawWet(ctx: CanvasRenderingContext2D, bottom: number, h: number): void {
  const soak = Math.min(h * 0.45, 56);
  const x0 = CX - HALF;
  const N = 9;
  const w = VIEW.LANE_W;
  ctx.save();
  ctx.fillStyle = PALETTE.INK;
  ctx.beginPath();
  ctx.moveTo(x0, bottom);
  ctx.lineTo(x0, bottom - soak * (0.7 + 0.3 * hs(1, 0)));
  for (let i = 1; i <= N; i++) ctx.lineTo(x0 + (w * i) / N, bottom - soak * (0.55 + 0.45 * hs(1, i)));
  ctx.lineTo(x0 + w, bottom);
  ctx.closePath();
  ctx.fill();
  for (let d = 0; d < 3; d++) { // 흘러내린 가닥
    const dx = x0 + w * (0.2 + 0.3 * d);
    const len = 12 + 14 * hs(2, d);
    ctx.beginPath();
    ctx.moveTo(dx - 4, bottom);
    ctx.lineTo(dx + 4, bottom);
    ctx.lineTo(dx + 1.5, bottom + len);
    ctx.lineTo(dx - 1.5, bottom + len);
    ctx.closePath();
    ctx.moveTo(dx + 3.4, bottom + len);
    ctx.arc(dx, bottom + len, 3.4, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** 가벼운 좌판 — 양옆으로 바람결 세 줄씩, 틱에 따라 위아래로 일렁인다(좌판 자체의 팔랑임은 hastyShakeX) */
function drawBreeze(ctx: CanvasRenderingContext2D, tick: number, bottom: number, h: number): void {
  const mid = bottom - h / 2;
  ctx.save();
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  for (const sd of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const x = CX + sd * (HALF + 12 + i * 8);
      const y = mid + (i - 1) * 20 + Math.sin(tick * 0.5 + i * 1.3) * 4;
      ctx.beginPath();
      ctx.arc(x, y, 7, sd > 0 ? -1.1 : Math.PI - 1.1, sd > 0 ? 1.1 : Math.PI + 1.1);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 「이번 파는 안전」(꽂은 수가 절반 이상)이 처음 참이 된 틱에 문턱 칸이 한 번 튄다 */
function stepTallyPop(lm: LandmarkState, act: number): void {
  const hours = LANDMARK.BELL.HOURS[lm.wave % LANDMARK.BELL.HOURS.length];
  const safe = lm.id === 'bell' && lm.st === 'play' && act !== 3 && lm.got * 2 >= hours; // 3막엔 「절반이면 앉는다」가 없다
  if (safe && !prevSafe) tallyPop = POP_TICKS;
  else if (tallyPop > 0) tallyPop -= 1;
  prevSafe = safe;
}

const CELL = 6;
const CELL_GAP = 3;

/**
 * 종탑 「절반」 문턱 칸 — 이번 파 종 수만큼 시계 밑에 작은 칸. 먹 칸 = 꽂음 · 금 간 빈칸 = 빗나감 · 테두리만 = 남음/공중.
 * 절반(올림) 칸 뒤에 짧은 세로 눈금 하나. 글자 없음, 먹 · 한지색만. play 중에만 그린다(파 끝에 core가 세는 값을 비운다).
 */
function drawTally(ctx: CanvasRenderingContext2D, s: GameState, lm: LandmarkState, base: number, act: number): void {
  const hours = LANDMARK.BELL.HOURS[lm.wave % LANDMARK.BELL.HOURS.length];
  const cells = bellTally(lm.got, lm.n, hours, s.stack !== null);
  const w = hours * CELL + (hours - 1) * CELL_GAP;
  const y = base - 12;
  const k = 1 + 0.4 * (tallyPop / POP_TICKS);
  ctx.save();
  ctx.translate(CX, y + CELL / 2);
  ctx.scale(k, k);
  ctx.translate(-CX, -(y + CELL / 2));
  ctx.lineJoin = 'miter';
  ctx.strokeStyle = PALETTE.INK;
  cells.forEach((c, i) => {
    const x = CX - w / 2 + i * (CELL + CELL_GAP);
    ctx.fillStyle = c === 'full' ? PALETTE.INK : PALETTE.WHITE;
    ctx.fillRect(x, y, CELL, CELL);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, CELL, CELL);
    if (c === 'miss') { // 금 — 대각선 한 줄
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + 1, y + CELL - 1);
      ctx.lineTo(x + CELL / 2, y + CELL / 2 + 0.5);
      ctx.lineTo(x + CELL - 1, y + 1);
      ctx.stroke();
    }
  });
  if (act !== 3) { // 절반 눈금 — 3막은 점수가 곧 대미지라 절반 규칙이 없다
    const th = Math.ceil(hours / 2);
    const tx = CX - w / 2 + th * (CELL + CELL_GAP) - CELL_GAP / 2;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tx, y - 3);
    ctx.lineTo(tx, y + CELL + 3);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 명물의 몸과 장식 — 던진 것(s.stack)보다 뒤에 그린다. 몸(층) · 마스트 · 차양 · 시계 · 깃발 · 지브 · 케이블 · 띠 · 인장.
 * flash = 맞은 층 흰 번쩍 세기(0이면 없음).
 */
export function drawLandmarkBack(ctx: CanvasRenderingContext2D, s: GameState, g: number, flash = 0): void {
  if (s.tick < lastTick) resetLandmarkFx();
  lastTick = s.tick;
  const lm = s.lm;
  if (!lm) { prevAct = 0; prevSlamAir = 0; prevLift = false; lastBody = null; return; }
  const act = stepFx(s, lm, g);
  drawGroundSigns(ctx, s, lm, g, act); // 구층탑은 몸이 없다 — 몸 처리보다 먼저
  const b = lm.body;
  if (!b) { lastBody = null; return; }
  stepTallyPop(lm, act);
  const base = g - b.y;
  const fall = fallOffset(lm);
  if (lm.id === 'bell' && lm.st === 'slam') drawSlamShadow(ctx, b.y, g);
  if (lm.id === 'crane' && fall !== null) drawMast(ctx, g, base + fall);
  if (b.floors.length > 0) {
    const body: FallingStack = {
      kind: 'stack', variant: 'building', theme: BODY_THEME[lm.id], floors: b.floors, y: b.y, vy: 0,
      specialImmune: true, resting: false, totalFloors: b.floors.length,
    };
    drawStack(ctx, body, g, 'none');
    if (flash > 0.02) {
      ctx.save();
      ctx.globalAlpha = flash;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(CX - HALF, base - b.floors[0].h, VIEW.LANE_W, b.floors[0].h);
      ctx.restore();
    }
  }
  if (fall !== null) {
    ctx.save();
    ctx.translate(0, fall);
    if (lm.id === 'bell') {
      if (b.floors.length > 0) {
        const hours = LANDMARK.BELL.HOURS[lm.wave % LANDMARK.BELL.HOURS.length];
        const timed = act === 2 && s.stage?.diff !== 0 && lm.st === 'play'; // 정각(견습 없음)
        drawClock(ctx, lm, base - b.floors[0].h + 26, timed ? blockProgress(hours, lm.k) : -1);
      }
      if (lm.st === 'play' && b.floors.length > 0) drawTally(ctx, s, lm, base, act);
      drawBellRoof(ctx, base - stackH(b.floors));
    } else if (lm.id === 'wind') {
      drawAwning(ctx, base);
      if (s.stage?.diff !== 2) drawFlag(ctx, s, lm, base); // 외주는 깃발 없이 귀로만(휘파람)
    } else if (lm.id === 'crane') {
      drawJib(ctx, base, craneHalf(lm));
      drawCable(ctx, s, lm, g);
      if (s.stack && lm.st === 'play' && lm.k > 0) drawBand(ctx, s, lm, g);
    }
    ctx.restore();
  }
  if (lm.st === 'sit' && b.floors.length > 0) {
    drawSeal(ctx, sealInk(lm.t, s.stage?.diff ?? 1), base - b.floors[0].h / 2);
  } else if (lm.id === 'bell' && lm.st === 'play' && act === 3 && b.floors.length > 0) {
    // 시보: 3막은 play 중에도 인장이 찍혀 있다(목표 = 탑). 먹은 마르지 않는다. 꽂힘 먹 터짐 · 엔소는 몸 밑면에 터지니
    // 인장은 몸 윗단 왼쪽(시계 옆)에 작게 둔다
    drawSeal(ctx, 1, base - b.floors[0].h + SEAL_PLAY_Y, SEAL_PLAY_SCALE, SEAL_PLAY_DX);
  }
  lastBody = { floors: b.floors.slice(), y: b.y };
}

// ── 구층탑 처마 · 풍경 ──────────────────────────────────────────

/** 처마 한 줄 — 층 윗면에 걸친 기와 띠, 끝이 올라간다. 끝에 풍경 하나씩(빛나면 놋쇠 노랑 + 울림 고리) */
function drawEave(ctx: CanvasRenderingContext2D, yTop: number, glow: number, i: number, tick: number): void {
  const xl = CX - HALF;
  const xr = CX + HALF;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(xl - 18, yTop - 6);
  ctx.lineTo(xl + 14, yTop + 3);
  ctx.lineTo(xr - 14, yTop + 3);
  ctx.lineTo(xr + 18, yTop - 6);
  ctx.lineTo(xr + 8, yTop + 8);
  ctx.lineTo(xl - 8, yTop + 8);
  ctx.closePath();
  ctx.fillStyle = ROOF;
  ctx.fill();
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  const swing = glow * Math.sin(tick * 0.8 + i) * 0.5;
  for (const x of [xl - 12, xr + 12]) {
    ctx.save();
    ctx.translate(x, yTop + 7);
    ctx.rotate(swing);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 4);
    ctx.strokeStyle = PALETTE.INK;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-2.5, 4);
    ctx.lineTo(2.5, 4);
    ctx.lineTo(4.5, 11);
    ctx.lineTo(-4.5, 11);
    ctx.closePath();
    ctx.fillStyle = glow > 0 ? PALETTE.YELLOW_DEEP : BRONZE.base;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (glow > 0.02) { // 울림 고리 — 먹 선이 퍼지며 가늘어진다
      ctx.beginPath();
      ctx.arc(x, yTop + 12, 6 + (1 - glow) * 12, 0, TAU);
      ctx.strokeStyle = PALETTE.INK;
      ctx.lineWidth = 2 * glow;
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 던진 것(s.stack) 위에 얹는 것 — 구층탑 처마 · 꼭대기 장식. 땅의 종 금 가기도 여기서 */
export function drawLandmarkFront(ctx: CanvasRenderingContext2D, s: GameState, g: number): void {
  drawBellGhost(ctx, g);
  const lm = s.lm;
  const st = s.stack;
  if (lm?.id === 'wind' && st) { // 바람탑 좌판: 젖음(외주) · 가벼움(문턱을 넘음)
    if (lm.k === -1) drawWet(ctx, g - st.y, stackH(st.floors));
    else if (windLight(s)) drawBreeze(ctx, s.tick, g - st.y, stackH(st.floors));
  }
  drawMarks(ctx);
  if (lm?.id !== 'pagoda' || !st) return;
  const glow = chimeGlow(lm);
  const bottom = g - st.y;
  let cum = 0;
  st.floors.forEach((f, i) => {
    drawEave(ctx, bottom - cum - f.h, glow, i, s.tick);
    cum += f.h;
  });
  const top = bottom - cum;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(CX - 6, top);
  ctx.lineTo(CX, top - 38);
  ctx.lineTo(CX + 6, top);
  ctx.closePath();
  ctx.fillStyle = BRONZE.base;
  ctx.fill();
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  for (const dy of [10, 18, 26]) {
    ctx.fillStyle = BRONZE.light;
    ctx.fillRect(CX - 8 + (dy - 10) / 8, top - dy, 16 - (dy - 10) / 4, 3);
    ctx.strokeRect(CX - 8 + (dy - 10) / 8, top - dy, 16 - (dy - 10) / 4, 3);
  }
  ctx.restore();
}
