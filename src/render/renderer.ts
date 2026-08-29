// 드로우 오케스트레이션 + 이벤트 소비(셰이크/플래시/진동/의성어).
// core는 events만 발행 — 오디오는 src/audio/consume.ts, 클리어는 씬.

import type { GameState } from '../core/types';
import { JUICE, JUICE_SYS, HAPTIC, PALETTE, VIEW } from '../config';
import { onomatoFor, CAPTIONS } from '../content';
import {
  initSprites, drawPlayer, drawStack, drawBoss, drawEntity,
  drawGroundRocks, drawStackShadow,
} from './sprites';
import { drawChapterBackdrop } from './background';
import { cameraFollowY } from './camera';
import { drawEffects, resetEffects, setFxCamY, spawnFromEvent, tickEffects } from './effects';

let trauma = 0;
let flashTicks = 0;
let flashColor = '#1A1A20';
let shakeSeed = 0;
let hitHapticCount = 0;
let shakeLevel: 0 | 1 | 2 = 2;
let vibrationOn = true;

interface Popup { text: string; x: number; y: number; ticks: number; scale: number }
const popups: Popup[] = [];

/** 콤보 숫자 팝업 — 원작은 타격마다 하나씩 생겨 여러 개가 동시에 흩뿌려진다. */
interface NumPopup { n: number; x: number; y: number; vx: number; vy: number; ticks: number; scale: number; color: string }
const numPopups: NumPopup[] = [];
let popupSeed = 0;

/** 결정적 흩뿌림 — rngState는 core 전용이라 여기선 카운터 해시를 쓴다. */
function scatter(): number {
  popupSeed = (Math.imul(popupSeed, 1103515245) + 12345) & 0x7fffffff;
  return ((popupSeed >>> 8) / 0x7fffff) * 2 - 1; // −1..1
}

function comboColor(n: number): string {
  if (n >= 500) return PALETTE.RED;
  if (n >= 100) return PALETTE.YELLOW;
  if (n >= 50) return PALETTE.BLUE;
  return PALETTE.INK;
}

export function setFeedbackOptions(o: { shakeLevel?: 0 | 1 | 2; vibration?: boolean }): void {
  if (o.shakeLevel !== undefined) shakeLevel = o.shakeLevel;
  if (o.vibration !== undefined) vibrationOn = o.vibration;
}

export function initRenderer(): void {
  initSprites();
  resetEffects();
}

/** 이벤트 소비: 셰이크/플래시/의성어/진동. 사운드는 audio/consume. 소비 후 clear는 호출자가. */
export function consumeEvents(s: GameState): void {
  const cam = cameraFollowY(s);
  setFxCamY(cam);
  for (const e of s.events) {
    const spec = JUICE[e.kind];
    if (spec) {
      trauma = Math.min(1, Math.max(trauma, spec.shake / JUICE_SYS.SHAKE_MAX_AMP));
      if (spec.flash > 0 && e.kind !== 'hit') { flashTicks = spec.flash; flashColor = e.kind === 'hurt' ? '#E5302E' : '#1A1A20'; }
      // 히트스톱은 core(sim advance 말미)가 주입한다 — 렌더러는 상태를 쓰지 않는다 (08-30, P0-5)
    }
    spawnFromEvent(s, e);
    // 콤보 숫자 팝업 (타격마다 1개, 상한까지 누적)
    if (e.kind === 'hit' || e.kind === 'bossHit') {
      const n = e.combo ?? s.combo;
      if (n > 0) {
        if (numPopups.length >= JUICE_SYS.COMBO_POPUP_MAX) numPopups.shift();
        numPopups.push({
          n,
          x: VIEW.LANE_X[0] + scatter() * 22,
          y: VIEW.GROUND_Y - (e.y ?? 100) - 12 + scatter() * 10 + cam,
          vx: scatter() * 0.9,
          vy: -1.4 - Math.abs(scatter()) * 0.8,
          ticks: JUICE_SYS.COMBO_POPUP_LIFE_F,
          scale: 1 + Math.min(n / 400, 1.1),
          color: comboColor(n),
        });
      }
    }
    // 의성어 (동시 3개 상한)
    const combo = e.combo ?? s.combo;
    let word = onomatoFor(e.kind, combo);
    if (e.kind === 'special') {
      word = onomatoFor(s.waza === 'ageba' ? 'specialAgeba' : s.waza === 'tetsu' ? 'specialTetsu' : 'special', combo);
    }
    if (word && combo >= 999) word = CAPTIONS.combo999;
    if (word) {
      if (popups.length >= JUICE_SYS.ONOMATOPOEIA_MAX) popups.shift();
      popups.push({
        text: word,
        x: VIEW.LANE_X[0] + ((combo * 13) % 30) - 15,
        y: VIEW.GROUND_Y - (e.y ?? 100) - 30 + cam,
        ticks: e.kind === 'special' ? 40 : 24,
        scale: e.kind === 'special' || e.kind === 'bossDefeat' ? 2.4 : 1 + Math.min(combo / 500, 0.8),
      });
    }
    // 진동 (연타 스로틀)
    if (vibrationOn && 'vibrate' in navigator) {
      const pat = (HAPTIC as unknown as Record<string, number | readonly number[] | undefined>)[e.kind];
      if (pat !== undefined) {
        if (e.kind === 'hit') {
          hitHapticCount += 1;
          if (hitHapticCount % HAPTIC.HIT_THROTTLE !== 0) continue;
        }
        try { navigator.vibrate(pat as number | number[]); } catch { /* 미지원 무시 */ }
      }
    }
  }
}

function shakeOffset(): [number, number] {
  if (trauma <= 0 || shakeLevel === 0) return [0, 0];
  const amp = trauma * trauma * JUICE_SYS.SHAKE_MAX_AMP * (shakeLevel === 1 ? 0.5 : 1);
  shakeSeed += 1;
  return [Math.sin(shakeSeed * 1.3) * amp, Math.cos(shakeSeed * 1.7) * amp * 0.7];
}

export function drawGame(ctx: CanvasRenderingContext2D, s: GameState): void {
  trauma = Math.max(0, trauma - 0.693 / JUICE_SYS.SHAKE_HALF_LIFE_F * trauma);
  if (flashTicks > 0) flashTicks -= 1;
  tickEffects();

  const cam = cameraFollowY(s);
  setFxCamY(cam);
  const [sx, sy] = shakeOffset();
  ctx.save();
  ctx.translate(sx, sy);

  ctx.fillStyle = bgColor(s);
  ctx.fillRect(-16, -16, VIEW.W + 32, VIEW.H + 32);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, VIEW.W, VIEW.FIELD_H);
  ctx.clip();
  ctx.translate(0, cam);
  drawChapterBackdrop(ctx, s);
  ctx.fillStyle = '#DDD8CC';
  ctx.fillRect(-16, VIEW.GROUND_Y, VIEW.W + 32, VIEW.H - VIEW.GROUND_Y);

  const g = VIEW.GROUND_Y;
  if (s.stack) { drawStackShadow(ctx, s.stack, g); drawStack(ctx, s.stack, g); }
  drawDebris(ctx, s, g);
  drawGroundRocks(ctx, s.groundRocks, g);
  for (const e of s.entities) {
    if (e.kind === 'stack') continue;
    // 예고 마커(대포·번개 큐)는 대응 신호 — 카메라와 무관하게 화면 고정으로 아래 별도 패스 (08-30, P0-4)
    if (e.kind === 'cannon' || (e.kind === 'bolt' && e.cueTicks > 0)) continue;
    drawEntity(ctx, e, g);
  }
  if (s.boss) drawBoss(ctx, s.boss, g);

  if (s.player.invulnTicks % 6 < 4 || s.player.pose === 'special') {
    drawPlayer(ctx, s.player.pose, s.player.poseTick, VIEW.LANE_X[s.player.lane], g - s.player.y);
  }
  ctx.restore();

  // 화면 고정 예고 마커 — 필드 상단, 카메라 변환 밖 (공중에서도 절대 안 사라진다)
  for (const e of s.entities) {
    if (e.kind === 'cannon' || (e.kind === 'bolt' && e.cueTicks > 0)) drawEntity(ctx, e, g);
  }

  drawEffects(ctx);
  drawNumPopups(ctx);
  drawPopups(ctx);
  ctx.restore();

  if (flashTicks > 0) {
    ctx.globalAlpha = 0.35 * (flashTicks / 4);
    ctx.fillStyle = flashColor;
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);
    ctx.globalAlpha = 1;
  }
}

function drawDebris(ctx: CanvasRenderingContext2D, s: GameState, groundY: number): void {
  for (const d of s.debris) {
    const a = Math.min(1, d.life / 18);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#3A3A42';
    ctx.fillRect(d.x - d.w / 2, groundY - d.y - d.h, d.w, d.h);
    ctx.strokeStyle = '#1A1A20';
    ctx.lineWidth = 2;
    ctx.strokeRect(d.x - d.w / 2, groundY - d.y - d.h, d.w, d.h);
    ctx.restore();
  }
}

function bgColor(s: GameState): string {
  if (s.mode === 'bonus') return '#FFF8DC';
  if (s.act2Phase === 'moon') return '#E4E0D6';
  if (s.mode === 'act2') return '#EAE6DA';
  const by = ['#F4F1E8', '#F0EEE4', '#F2EDE2', '#EFEDE6'];
  return by[s.chapter % 4];
}

function drawNumPopups(ctx: CanvasRenderingContext2D): void {
  for (let i = numPopups.length - 1; i >= 0; i--) {
    const p = numPopups[i];
    p.ticks -= 1;
    if (p.ticks <= 0) { numPopups.splice(i, 1); continue; }
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.09;            // 살짝 떨어지며 사라짐
    const t = p.ticks / JUICE_SYS.COMBO_POPUP_LIFE_F;
    const pop = p.ticks > JUICE_SYS.COMBO_POPUP_LIFE_F - 3 ? 1.35 : 1; // 등장 순간 튐
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 2.2);
    ctx.translate(p.x, p.y);
    ctx.font = `bold ${Math.round(13 * p.scale * pop)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#F4F1E8';
    ctx.strokeText(String(p.n), 0, 0);
    ctx.fillStyle = p.color;
    ctx.fillText(String(p.n), 0, 0);
    ctx.restore();
  }
}

function drawPopups(ctx: CanvasRenderingContext2D): void {
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.ticks -= 1;
    if (p.ticks <= 0) { popups.splice(i, 1); continue; }
    const a = Math.min(1, p.ticks / 8);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(p.x, p.y - (24 - p.ticks) * 0.8);
    ctx.rotate(-0.08);
    ctx.font = `bold ${Math.round(14 * p.scale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#F4F1E8';
    ctx.strokeText(p.text, 0, 0);
    ctx.fillStyle = PALETTE.YELLOW;
    ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }
}
