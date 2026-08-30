// 드로우 오케스트레이션 + 이벤트 소비(셰이크/플래시/진동/의성어).
// core는 events만 발행 — 오디오는 src/audio/consume.ts, 클리어는 씬.

import type { GameState } from '../core/types';
import { COSMETIC_COLORS, JUICE, JUICE_SYS, HAPTIC, PALETTE, PLAYER, VIEW } from '../config';
import { onomatoFor, CAPTIONS } from '../content';
import {
  initSprites, drawPlayer, drawStack, drawBoss, drawEntity,
  drawGroundRocks, drawStackShadow, setPlayerCosmetics,
} from './sprites';
import { drawChapterBackdrop } from './background';
import { cameraFollowY } from './camera';
import { vibrate } from '../platform/native';
import { drawEffects, resetEffects, setFxCamY, setSlashColor, spawnFromEvent, tickEffects } from './effects';

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

// 08-30(P1-3): letters 코스메틱 — 저콤보(<50) 팝업 기본색. 에스컬레이션 색은 공통.
let lettersColor: string = PALETTE.INK;

function comboColor(n: number): string {
  if (n >= 500) return PALETTE.RED;
  if (n >= 100) return PALETTE.YELLOW;
  if (n >= 50) return PALETTE.BLUE;
  return lettersColor;
}

export function setFeedbackOptions(o: { shakeLevel?: 0 | 1 | 2; vibration?: boolean }): void {
  if (o.shakeLevel !== undefined) shakeLevel = o.shakeLevel;
  if (o.vibration !== undefined) vibrationOn = o.vibration;
}

export function initRenderer(): void {
  initSprites();
  resetEffects();
}

/** 장착 코스메틱 일괄 적용 — 씬이 런 시작·장착 변경 시 호출 (08-30, P1-3) */
export function applyCosmetics(loadout: { body: string; blade: string; letters: string }): void {
  const body = COSMETIC_COLORS.body[loadout.body] ?? COSMETIC_COLORS.body.ink;
  const blade = COSMETIC_COLORS.blade[loadout.blade] ?? COSMETIC_COLORS.blade.wire;
  lettersColor = COSMETIC_COLORS.letters[loadout.letters] ?? COSMETIC_COLORS.letters.flyer;
  setPlayerCosmetics(body, blade);
  setSlashColor(blade);
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
    if (vibrationOn) {
      const pat = (HAPTIC as unknown as Record<string, number | readonly number[] | undefined>)[e.kind];
      if (pat !== undefined) {
        if (e.kind === 'hit') {
          hitHapticCount += 1;
          if (hitHapticCount % HAPTIC.HIT_THROTTLE !== 0) continue;
        }
        vibrate(pat as number | readonly number[]); // 네이티브=Haptics, 웹=navigator.vibrate (throw 없음)
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
  ctx.rect(0, VIEW.FIELD_TOP, VIEW.W, VIEW.FIELD_H - VIEW.FIELD_TOP);
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

  // ★08-30(A안, 사용자 확정): 점프 관통은 [정본]이다(sim.ts "점프 무적의 이면 = 착지 시 깔림").
  // 규칙을 바꾸지 않고 **화면에 드러낸다** — 관통이 버그로 보이던 건 "지금 무적"이 안 보여서였다.
  //   ① 공중 = 반투명 실루엣(통과 중이라는 신호)
  //   ② 지면에 스택이 놓여 있는데 공중이면 = 착지 예정 지점에 위험 표시(무적의 이면을 예고)
  const airborne = s.player.y > 0;
  const landingDanger = airborne && !!s.stack?.resting
    && s.player.pose !== 'dead' && s.player.pose !== 'pinned' && s.mode !== 'bonus';
  if (landingDanger) drawLandingDanger(ctx, g, s.player.invulnTicks);

  // ③ 관통하는 순간 = 스침. 몸을 지나가는 층의 위아래 모서리에 짧은 획을 그어
  //    "맞은 게 아니라 통과했다"를 눈으로 말한다. 상태 없음 — 겹치는 프레임에만 그린다.
  if (airborne && s.stack && !s.stack.resting) {
    const stackTop = s.stack.y + s.stack.floors.reduce((a2, f) => a2 + f.h, 0);
    const pTop = s.player.y + PLAYER.H;
    if (pTop > s.stack.y && s.player.y < stackTop) {
      drawGraze(ctx, g - s.player.y - PLAYER.H / 2);
    }
  }

  // 피격 직후(≤HIT_IFRAMES)만 점멸 — 디버그 상시 무적은 통짜로 그린다 (08-30, D-2)
  const shortInvuln = s.player.invulnTicks > 0 && s.player.invulnTicks <= PLAYER.HIT_IFRAMES;
  if (!shortInvuln || s.player.invulnTicks % 6 < 4 || s.player.pose === 'special') {
    const ghost = airborne && s.player.pose !== 'special';
    if (ghost) ctx.globalAlpha = 0.62;
    drawPlayer(ctx, s.player.pose, s.player.poseTick, VIEW.LANE_X[s.player.lane], g - s.player.y);
    if (ghost) ctx.globalAlpha = 1;
  }
  ctx.restore();

  // 필드 클립 재적용 — 파티클·팝업·마커가 조작 존(하단 170px)을 침범하지 않게 (08-30, P1-5)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, VIEW.FIELD_TOP, VIEW.W, VIEW.FIELD_H - VIEW.FIELD_TOP);
  ctx.clip();
  // 화면 고정 예고 마커 — 카메라 변환 밖 (공중에서도 절대 안 사라진다)
  for (const e of s.entities) {
    if (e.kind === 'cannon' || (e.kind === 'bolt' && e.cueTicks > 0)) drawEntity(ctx, e, g);
  }
  drawEffects(ctx);
  drawNumPopups(ctx);
  drawPopups(ctx);
  ctx.restore();
  ctx.restore();

  // 필드 상단 규칙선 — 건물이 클립 경계에서 '툭' 나타나는 걸 프레임 안으로 들어오는 것으로
  // 읽히게 한다. 조작 존 상단(#touch-layer::after)과 같은 굵기·같은 농도로 맞춘 액자 두 변.
  ctx.fillStyle = 'rgba(26, 26, 32, 0.16)';
  ctx.fillRect(0, VIEW.FIELD_TOP, VIEW.W, 1);

  if (flashTicks > 0) {
    ctx.globalAlpha = 0.35 * (flashTicks / 4);
    ctx.fillStyle = flashColor;
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);
    ctx.globalAlpha = 1;
  }
}

/** 관통 스침 — 캐릭터 양옆으로 짧은 먼지 획 2개. 획이 얇아 필드 판독성을 안 먹는다. */
function drawGraze(ctx: CanvasRenderingContext2D, cy: number): void {
  const cx = VIEW.LANE_X[0];
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = '#6E695F';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 30, cy - 6);
  ctx.lineTo(cx - 16, cy - 2);
  ctx.moveTo(cx + 16, cy + 2);
  ctx.lineTo(cx + 30, cy + 6);
  ctx.stroke();
  ctx.restore();
}

/**
 * 착지 예정 지점 위험 표시 — 지면에 스택이 놓인 채 공중에 있으면 내려오는 순간 깔린다([정본]).
 * 점선 사각 + 화살표 하나. 필드를 덜 먹게 지면 바로 위에만 그린다.
 */
function drawLandingDanger(ctx: CanvasRenderingContext2D, groundY: number, invulnTicks: number): void {
  const w = 44;
  const x = VIEW.LANE_X[0] - w / 2;
  const y = groundY - 14;
  const blink = Math.floor(invulnTicks / 6) % 2 === 0 ? 1 : 0.55;
  ctx.save();
  ctx.globalAlpha = 0.85 * blink;
  ctx.strokeStyle = PALETTE.RED;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(x, y, w, 12);
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(VIEW.LANE_X[0], y - 12);
  ctx.lineTo(VIEW.LANE_X[0], y - 3);
  ctx.moveTo(VIEW.LANE_X[0] - 4, y - 7);
  ctx.lineTo(VIEW.LANE_X[0], y - 3);
  ctx.lineTo(VIEW.LANE_X[0] + 4, y - 7);
  ctx.stroke();
  ctx.restore();
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
