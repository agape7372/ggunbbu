// 화면 단위 연출 — 번쩍(다단: 다침 · 사망 · 궤도 낙하만 건다) · 공사 테이프 · 필살 예비동작(엔소·유령) · 사망 틀 · 지면선 번쩍
// · 집중선 · 색 반전(큰 한 방) · 완파 자막 판 「N층 철거!」 · 콤보 속도선. 11-01 (3)에 걷었던 집중선 · 반전 · 자막 판은
// 11-01 (5)에 옛 판(0c8ae64)으로 되돌렸다(「건물파괴 스타일은 옛날이 낫고」). 필살은 inkFrame으로 반전 프레임을 따로 건다.
// 파티클(effects.ts)과 달리 "화면 전체나 한 줄"을 그리는 것들이다. core는 모른다. 상태는 이 모듈에만 있다.
// DOM 없음 — ctx만 받는다. 시간은 drawGame이 틱마다 부르는 stepScreenFx()가 한 칸씩 흘린다.

import { JUICE_SYS, PALETTE, VIEW } from '../config';
import { flashMul } from './feel';
import { enso, inkDrop } from './ink';

/** 먹 붓글씨(동해독도) — 25px 이상에만. 캔버스는 DOM이 아직 안 쓴 글꼴을 대체 글꼴로 그리니 불러올 때 한 번 당겨 둔다 */
export const brushFont = (px: number): string => `${Math.round(px)}px "East Sea Dokdo", "Black Han Sans", serif`;
if (typeof document !== 'undefined') void document.fonts?.load(brushFont(40)).catch(() => {});

// ── 번쩍 ────────────────────────────────────────────────────────
export interface FlashStage { color: string; a: number; ticks: number }
let stages: FlashStage[] = [];
let stageT = 0;
let flashLevel = 2;

export function setFlashLevel(level: number): void {
  flashLevel = level;
}

/** 번쩍임 설정 배율(0·0.5·1) — 화면 전체 번쩍 밖의 번쩍(보스 본체 아이보리)도 같은 설정을 탄다 */
export function flashK(): number {
  return flashMul(flashLevel);
}

function stageAlpha(): number {
  const st = stages[0];
  return st ? st.a * (1 - stageT / st.ticks) : 0;
}

/**
 * 번쩍을 건다. 단이 여럿이면 앞에서부터 차례로(아이보리 → 잉크 같은 2단).
 * 지금 번쩍이 더 센 동안엔 약한 새 번쩍이 덮어쓰지 못한다 — 연타가 큰 번쩍을 잘게 끊지 않게.
 */
export function flash(...next: FlashStage[]): void {
  if (!next.length) return;
  if (stages.length && next[0].a < stageAlpha()) return;
  stages = next;
  stageT = 0;
}

/** 번쩍 한 겹 — 가장 마지막(조작 존까지 덮는 전체 화면)에 그린다. 강도 설정 0이면 안 그린다. */
function drawFlash(ctx: CanvasRenderingContext2D): void {
  const st = stages[0];
  if (!st) return;
  const a = stageAlpha() * flashMul(flashLevel);
  if (a < 0.01) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, a);
  ctx.fillStyle = st.color;
  ctx.fillRect(0, 0, VIEW.W, VIEW.H);
  ctx.restore();
}

// ── 공사 테이프 2줄(보스 포효) ─────────────────────────────────
let tapeT = 0;
export function startTape(): void {
  tapeT = JUICE_SYS.TAPE_TICKS;
}

const ease = (n: number): number => { const t = Math.max(0, Math.min(1, n)); return 1 - (1 - t) * (1 - t); };

function drawTapeBand(ctx: CanvasRenderingContext2D, y: number, dir: 1 | -1, u: number, alpha: number): void {
  const h = 13;
  const slide = ease(u / 0.35);                 // 처음 35%에 가장자리에서 들어온다
  const x = dir * (1 - slide) * VIEW.W * 1.1;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.rect(0, 0, VIEW.W, h);
  ctx.clip();
  ctx.fillStyle = PALETTE.YELLOW;
  ctx.fillRect(0, 0, VIEW.W, h);
  ctx.fillStyle = PALETTE.INK;                  // 대각 줄무늬 — 공사 테이프
  for (let sx = -h; sx < VIEW.W + h; sx += 22) {
    ctx.beginPath();
    ctx.moveTo(sx, h);
    ctx.lineTo(sx + 9, h);
    ctx.lineTo(sx + 9 + h, 0);
    ctx.lineTo(sx + h, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillRect(0, 0, VIEW.W, 1.5);
  ctx.fillRect(0, h - 1.5, VIEW.W, 1.5);
  ctx.restore();
}

function drawTape(ctx: CanvasRenderingContext2D): void {
  if (tapeT <= 0) return;
  const u = 1 - tapeT / JUICE_SYS.TAPE_TICKS;
  const alpha = Math.min(1, tapeT / 5);          // 끝 5틱에 걷힌다
  const span = VIEW.FIELD_H - VIEW.FIELD_TOP;
  drawTapeBand(ctx, VIEW.FIELD_TOP + span * 0.30, 1, u, alpha);
  drawTapeBand(ctx, VIEW.FIELD_TOP + span * 0.66, -1, u, alpha);
}

// ── 사망 틀 — 필드 가장자리에 붉은 이중 획이 번쩍 들어왔다 빠진다 ──
let deathT = 0;
export function startDeath(): void {
  deathT = JUICE_SYS.DEATH_FRAME_TICKS;
}
/** 사망 직후 파티클을 느리게 흘리는 동안 1 미만 */
let deathSlowT = 0;
export function deathSlow(): number {
  return deathSlowT > 0 ? JUICE_SYS.DEATH_SLOW : 1;
}
export function markDeathSlow(): void {
  deathSlowT = JUICE_SYS.DEATH_SLOW_TICKS;
}

function drawDeathFrame(ctx: CanvasRenderingContext2D): void {
  if (deathT <= 0) return;
  const u = deathT / JUICE_SYS.DEATH_FRAME_TICKS;
  const top = VIEW.FIELD_TOP + 2;
  const h = VIEW.FIELD_H - top - 2;
  ctx.save();
  ctx.globalAlpha = Math.min(1, u * 1.4) * flashMul(flashLevel);
  ctx.strokeStyle = PALETTE.RED;
  ctx.lineWidth = 4;
  ctx.strokeRect(3, top + 2, VIEW.W - 6, h - 4);
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(9, top + 8, VIEW.W - 18, h - 16);
  ctx.restore();
}

// ── 지면선 번쩍(가드 성공 1틱) ─────────────────────────────────
let lineT = 0;
export function startGroundLine(): void {
  lineT = 1;
}
/** 월드 좌표(카메라 안쪽)에서 그린다. */
export function drawGroundLine(ctx: CanvasRenderingContext2D): void {
  if (lineT <= 0) return;
  ctx.save();
  ctx.fillStyle = PALETTE.INK;
  ctx.fillRect(-16, VIEW.GROUND_Y - 1.5, VIEW.W + 32, 3);
  ctx.restore();
}

// ── 필살 예비동작 — 붓이 졸라맨 둘레에 엔소를 긋는다 ─────────────
/**
 * u = 0 → 1 (예비동작 진행). 월드 좌표(카메라 안쪽) (x, y)가 중심.
 * 원은 바깥에서 안으로 좁아지며 붓이 한 바퀴를 그어 가고(먹을 머금어 굵어진다), 먹 방울이 사방에서 빨려 든다.
 * 다 그은 원은 풀리는 틱에 노랑으로 터져 나간다(effects 필살 엔소) — 여기엔 노랑이 없다(노랑 = 베는 순간).
 */
export function drawPrelude(ctx: CanvasRenderingContext2D, u: number, x: number, y: number): void {
  const p = Math.max(0, Math.min(1, u));
  const r = 40 + (JUICE_SYS.PRELUDE_RING_R - 30) * (1 - p) * (1 - p);
  const drawn = 0.12 + 0.88 * (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p)); // 붓질 — 천천히 대서 빨라졌다 감속
  const w = 3 + 9 * p;
  ctx.save();
  ctx.fillStyle = PALETTE.WHITE; // 종이 테 — 건물·밤 위에서도 먹 획이 읽히게
  enso(ctx, x, y, r, w + 5, -Math.PI / 2, 0, drawn, 0, 1, 7);
  ctx.fillStyle = PALETTE.INK;
  enso(ctx, x, y, r, w, -Math.PI / 2, 0, drawn, 0, 1, 7);
  // 빨려 드는 먹 방울 — 바깥에서 원으로, 다가올수록 작아진다
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3 + (i % 2) * 0.12;
    const d = r + 10 + (34 + (i % 3) * 14) * (1 - p);
    inkDrop(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, 1.4 + 1.6 * (1 - p), a + Math.PI, 3 + 9 * (1 - p));
  }
  ctx.restore();
}

// ── 큰 한 방 — 잉크 집중선 + 색 반전 두 프레임 ─────────────────
let impactT = 0;
let impactX = 0;
let impactY = 0;
let impactSeed = 1;
let invertT = 0;
let invertCd = 0;
let inkGap = 0; // 필살 반전 사이 남은 틱(inkFrame)

/** 필드만 그린다 — 조작 존을 침범하지 않게 */
function clipField(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.rect(0, VIEW.FIELD_TOP, VIEW.W, VIEW.FIELD_H - VIEW.FIELD_TOP);
  ctx.clip();
}

/**
 * (x, y)(화면 좌표)로 모이는 집중선을 건다. invert면 색 반전 두 프레임도 —
 * 번쩍임 설정이 기본(2)일 때만, INVERT_COOLDOWN 틱에 한 번만(연달아 터지면 눈이 아프다).
 */
export function startImpact(x: number, y: number, invert: boolean): void {
  impactT = JUICE_SYS.IMPACT_TICKS;
  impactX = x;
  impactY = y;
  impactSeed = (impactSeed * 7919 + 13) % 100003;
  if (invert && flashLevel >= 2 && invertCd <= 0) {
    invertT = JUICE_SYS.INVERT_TICKS;
    invertCd = JUICE_SYS.INVERT_COOLDOWN;
    // 반전이 번쩍을 대신한다 — 같은 틱에 건 번쩍(필살 아이보리→잉크 · 격파 아이보리)이 화면 전체를 회색으로 덮지 않게.
    // 빨강(피격·사망)은 정보라 남긴다
    if (stages[0]?.color !== PALETTE.RED) {
      stages = [];
      stageT = 0;
    }
  }
}

/** 집중선 — 가운데는 비워 두고 화면 끝에서 안으로 꽂히는 잉크 가시. 옅어지며 바깥으로 물러난다. */
function drawFocusLines(ctx: CanvasRenderingContext2D): void {
  if (impactT <= 0) return;
  const u = impactT / JUICE_SYS.IMPACT_TICKS; // 1 → 0
  let seed = impactSeed;
  const rnd = (): number => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const n = 40;
  const R = 560;
  ctx.save();
  clipField(ctx);
  ctx.globalAlpha = Math.min(1, u * u * 1.4);
  ctx.fillStyle = PALETTE.INK;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.1;
    const r0 = 120 + rnd() * 80 + (1 - u) * 90;
    const half = 0.005 + rnd() * 0.014;
    ctx.moveTo(impactX + Math.cos(a) * r0, impactY + Math.sin(a) * r0);
    ctx.lineTo(impactX + Math.cos(a - half) * R, impactY + Math.sin(a - half) * R);
    ctx.lineTo(impactX + Math.cos(a + half) * R, impactY + Math.sin(a + half) * R);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

/** 색 반전 — 필드만. 차이(흰색)로 뒤집고 채도(회색)로 색을 뺀다 — 집중선은 흰 선으로 남는다. */
function drawInvert(ctx: CanvasRenderingContext2D): void {
  if (invertT <= 0) return;
  ctx.save();
  clipField(ctx);
  ctx.globalCompositeOperation = 'difference';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, VIEW.W, VIEW.H);
  ctx.globalCompositeOperation = 'saturation';
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, VIEW.W, VIEW.H);
  ctx.restore();
}

/**
 * 필살 반전 프레임 — 완파 쿨다운은 무시하고 바로 ticks 프레임 뒤집는다(필살 첫 칼 · 터짐). 번쩍임 설정이 기본(2)일 때만.
 * 단 필살 반전끼리는 INK_GAP 틱을 띄운다(전화면 번쩍 초당 3번 이하 — 연달아 오면 뒤의 것을 건너뛴다).
 * 다침 붉은 번쩍은 정보라 남기고, 같은 틱 아이보리 · 잉크 번쩍은 반전이 대신한다
 */
export function inkFrame(ticks: number): void {
  if (flashLevel < 2 || inkGap > 0) return;
  inkGap = JUICE_SYS.INK_GAP;
  invertT = Math.max(invertT, ticks);
  invertCd = JUICE_SYS.INVERT_COOLDOWN;
  if (stages[0]?.color !== PALETTE.RED) {
    stages = [];
    stageT = 0;
  }
}

// ── 콤보 열기 — 콤보가 오를수록 필드 양옆에 아래로 흐르는 속도선 ──
let heatT = 0;

/** 필드 양옆 속도선 — HEAT_COMBO 단계마다 선이 늘고 진해지고 빨라진다. 화면 고정. */
export function drawHeatEdges(ctx: CanvasRenderingContext2D, combo: number): void {
  let tier = 0;
  for (const c of JUICE_SYS.HEAT_COMBO) if (combo >= c) tier += 1;
  if (tier === 0) return;
  const span = VIEW.FIELD_H - VIEW.FIELD_TOP;
  ctx.save();
  ctx.globalAlpha = 0.12 + 0.06 * tier;
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < tier * 4; i++) {
    const left = i % 2 === 0;
    const inset = 3 + ((i * 7) % 5) * 5;
    const len = 26 + ((i * 37) % 48);
    const y = VIEW.FIELD_TOP - len + ((heatT * (5 + tier * 2) + i * 131) % (span + len));
    const x = left ? inset : VIEW.W - inset;
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + len);
  }
  ctx.stroke();
  ctx.restore();
}

// ── 예능 자막 — 잉크 판 위 노랑 글자. 왼쪽에서 박혀 들어와 버티다 오른쪽으로 빠진다 ──
interface Caption { main: string; sub: string; t: number }
let caption: Caption | null = null;

/** 자막을 건다 — 하나만(새 자막이 앞 것을 밀어낸다). sub = 아래 붉은 꼬리표(점수 등). */
export function startCaption(main: string, sub = ''): void {
  caption = { main, sub, t: 0 };
}

const backOut = (n: number): number => { const k = n - 1; return 1 + 2.70158 * k * k * k + 1.70158 * k * k; };

function drawCaption(ctx: CanvasRenderingContext2D): void {
  const c = caption;
  if (!c) return;
  const L = JUICE_SYS.CAPTION_TICKS;
  const inU = Math.min(1, c.t / 6);
  const outU = Math.max(0, (c.t - (L - 7)) / 7);
  const cx = VIEW.W / 2 - (1 - backOut(inU)) * VIEW.W + outU * outU * VIEW.W * 1.2;
  const cy = VIEW.FIELD_TOP + 92;
  ctx.save();
  clipField(ctx);
  ctx.translate(cx, cy);
  ctx.rotate(-0.06);
  ctx.font = '30px "Black Han Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(c.main).width + 34;
  const h = 46;
  ctx.fillStyle = PALETTE.INK;                  // 판 그림자 — 화면에 붙인 스티커처럼 한 겹 아래
  ctx.fillRect(-w / 2 + 4, -h / 2 + 5, w, h);
  ctx.fillStyle = '#26252B';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = PALETTE.YELLOW;
  ctx.fillText(c.main, 0, 2);
  if (c.sub) {
    ctx.rotate(0.1);
    // 숫자 글꼴 — 제목 글꼴의 쉼표는 마침표처럼 보였다. 숫자 글꼴엔 한글이 없어(「100 콤보」) 본문 글꼴로 잇는다
    ctx.font = '700 16px "Gunbbu Mono", "Gunbbu Sans", monospace';
    const sw = ctx.measureText(c.sub).width + 18;
    const sx = w / 2 - sw / 2 - 6;
    const sy = h / 2 + 10;
    ctx.fillStyle = PALETTE.INK;
    ctx.fillRect(sx - sw / 2 + 3, sy - 13 + 3, sw, 26);
    ctx.fillStyle = PALETTE.RED;
    ctx.fillRect(sx - sw / 2, sy - 13, sw, 26);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(c.sub, sx, sy + 1);
  }
  ctx.restore();
}

// ── 흐름 ────────────────────────────────────────────────────────
/** drawGame이 틱마다 한 번 — 모든 타이머를 한 칸 흘린다. */
export function stepScreenFx(): void {
  if (stages.length) {
    stageT += 1;
    if (stageT >= stages[0].ticks) { stages.shift(); stageT = 0; }
  }
  if (tapeT > 0) tapeT -= 1;
  if (deathT > 0) deathT -= 1;
  if (deathSlowT > 0) deathSlowT -= 1;
  if (lineT > 0) lineT -= 1;
  if (impactT > 0) impactT -= 1;
  if (invertT > 0) invertT -= 1;
  if (invertCd > 0) invertCd -= 1;
  if (inkGap > 0) inkGap -= 1;
  heatT += 1;
  if (caption && ++caption.t >= JUICE_SYS.CAPTION_TICKS) caption = null;
}

/** 화면 위에 얹는 것들(흔들림 밖) — 집중선 · 반전 · 테이프 · 자막 · 사망 틀 · 번쩍 순서. */
export function drawScreenOverlay(ctx: CanvasRenderingContext2D): void {
  drawFocusLines(ctx);
  drawInvert(ctx);
  drawTape(ctx);
  drawCaption(ctx);
  drawDeathFrame(ctx);
  drawFlash(ctx);
}

export function resetScreenFx(): void {
  stages = [];
  stageT = 0;
  tapeT = 0;
  deathT = 0;
  deathSlowT = 0;
  lineT = 0;
  impactT = 0;
  invertT = 0;
  invertCd = 0;
  inkGap = 0;
  caption = null;
}
