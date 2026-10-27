// 화면 단위 연출 — 번쩍(다단) · 공사 테이프 · 필살 예비동작(링·유령) · 사망 틀 · 지면선 번쩍.
// 파티클(effects.ts)과 달리 "화면 전체나 한 줄"을 그리는 것들이다. core는 모른다. 상태는 이 모듈에만 있다.
// DOM 없음 — ctx만 받는다. 시간은 drawGame이 틱마다 부르는 stepScreenFx()가 한 칸씩 흘린다.

import { JUICE_SYS, PALETTE, VIEW } from '../config';
import { flashMul } from './feel';

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

// ── 필살 예비동작 — 링이 안으로 수축하고 노랑 선이 모인다 ─────────
/**
 * u = 0 → 1 (예비동작 진행). 월드 좌표(카메라 안쪽) (x, y)가 중심.
 * 링은 바깥에서 안으로 가속하며 좁아지고, 짧은 방사선이 같이 모여든다.
 */
export function drawPrelude(ctx: CanvasRenderingContext2D, u: number, x: number, y: number): void {
  const p = Math.max(0, Math.min(1, u));
  const r = 14 + JUICE_SYS.PRELUDE_RING_R * (1 - p) * (1 - p);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.35 + 0.6 * p;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = PALETTE.WHITE;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = PALETTE.YELLOW;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r + 3.5, 0, Math.PI * 2);
  ctx.stroke();
  // 모여드는 선 — 같은 각도로 바깥에서 중심으로
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    const r0 = r + 8 + 26 * (1 - p);
    const r1 = r + 8;
    ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
    ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
  }
  ctx.stroke();
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
}

/** 화면 위에 얹는 것들(흔들림 밖) — 테이프 · 사망 틀 · 번쩍 순서. */
export function drawScreenOverlay(ctx: CanvasRenderingContext2D): void {
  drawTape(ctx);
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
}
