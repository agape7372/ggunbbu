// 화면 단위 연출 — 번쩍(다단: 다침 · 사망 · 궤도 낙하만 건다) · 공사 테이프 · 필살 예비동작(엔소·유령) · 사망 틀 · 지면선 번쩍
// · 완파 붓글씨 「N층」 · 콤보 속도선. 집중선 · 색 반전 · 기울어진 먹 판 자막은 11-01 먹 개편으로 걷었다(화면 전체를 칠하지 않는다).
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

/** 필드만 그린다 — 조작 존을 침범하지 않게 */
function clipField(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.rect(0, VIEW.FIELD_TOP, VIEW.W, VIEW.FIELD_H - VIEW.FIELD_TOP);
  ctx.clip();
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

// ── 완파 붓글씨 — 판 · 테 · 그림자 없이 먹 붓글씨 「N층」과 작은 점수. 크기로 들고 난다(옅어지지 않는다) ──
interface Caption { main: string; sub: string; t: number }
let caption: Caption | null = null;

/** 자막을 건다 — 하나만(새 자막이 앞 것을 밀어낸다). sub = 아래 작은 점수 */
export function startCaption(main: string, sub = ''): void {
  caption = { main, sub, t: 0 };
}

function drawCaption(ctx: CanvasRenderingContext2D): void {
  const c = caption;
  if (!c) return;
  const L = JUICE_SYS.CAPTION_TICKS;
  // 앞 6틱에 부풀었다(넘침 1.12) 앉고, 끝 7틱에 오그라든다
  const grow = c.t < 6 ? 0.5 + 0.62 * Math.sin((c.t / 6) * (Math.PI / 2)) : 1 + 0.12 * Math.max(0, 1 - (c.t - 6) / 4);
  const sc = grow * Math.min(1, (L - c.t) / 7) ** 0.8;
  if (sc < 0.02) return;
  ctx.save();
  clipField(ctx);
  ctx.translate(VIEW.W / 2, VIEW.FIELD_TOP + 92);
  ctx.scale(sc, sc);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.INK;
  ctx.font = brushFont(64);
  ctx.fillText(c.main, 0, 0);
  if (c.sub) {
    // 숫자 글꼴 — 제목 글꼴의 쉼표는 마침표처럼 보였다
    ctx.font = '700 15px "Gunbbu Mono", "Gunbbu Sans", monospace';
    ctx.fillText(c.sub, 0, 40);
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
  heatT += 1;
  if (caption && ++caption.t >= JUICE_SYS.CAPTION_TICKS) caption = null;
}

/** 화면 위에 얹는 것들(흔들림 밖) — 테이프 · 붓글씨 · 사망 틀 · 번쩍 순서. */
export function drawScreenOverlay(ctx: CanvasRenderingContext2D): void {
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
  caption = null;
}
