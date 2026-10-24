// 드로우 오케스트레이션 + 이벤트 소비(셰이크/플래시/진동/의성어).
// core는 events만 발행 — 오디오는 src/audio/consume.ts, 클리어는 씬.

import type { GameState } from '../core/types';
import { CAMERA, COSMETIC_COLORS, JUICE, JUICE_SYS, HAPTIC, PALETTE, PLAYER, STACK, VIEW } from '../config';
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
/**
 * 카메라 보간 상태 (08-30 4차). cameraFollowY는 순수 목표값만 내고, 프레임간 추격은 여기서 한다 —
 * 목표값을 그대로 쓰면 데드존 진입 순간 화면이 툭 튄다. drawGame이 매 프레임 한 번 전진시킨다.
 */
let smoothCam = 0;
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
  smoothCam = 0;
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
  // 이펙트 좌표는 drawGame과 같은 카메라를 봐야 한다 — 목표값이 아니라 보간된 현재값.
  const cam = smoothCam;
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

  const camTarget = cameraFollowY(s);
  smoothCam += (camTarget - smoothCam) * CAMERA.LERP;
  if (Math.abs(camTarget - smoothCam) < 0.5) smoothCam = camTarget;
  const cam = smoothCam;
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
  // 배경은 얕게만 따라온다 — 하늘이 통째로 딸려 오르면 카메라가 움직인 게 아니라
  // 화면이 흔들린 것처럼 읽힌다(깊이 단서 상실).
  ctx.save();
  ctx.translate(0, cam * CAMERA.BG_PARALLAX);
  drawChapterBackdrop(ctx, s);
  ctx.restore();
  ctx.translate(0, cam);
  ctx.fillStyle = '#DDD8CC';
  ctx.fillRect(-16, VIEW.GROUND_Y, VIEW.W + 32, VIEW.H - VIEW.GROUND_Y);

  const g = VIEW.GROUND_Y;
  if (s.stack) { drawStackShadow(ctx, s.stack, g); drawStack(ctx, s.stack, g, s.gimmick); }
  drawDebris(ctx, s, g);
  drawGroundRocks(ctx, s.groundRocks, g);
  for (const e of s.entities) {
    if (e.kind === 'stack') continue;
    // 예고 마커(대포·번개 큐)는 대응 신호 — 카메라와 무관하게 화면 고정으로 아래 별도 패스 (08-30, P0-4)
    if (e.kind === 'cannon' || (e.kind === 'bolt' && e.cueTicks > 0)) continue;
    drawEntity(ctx, e, g);
  }
  if (s.boss) drawBoss(ctx, s.boss, g);

  // ★08-30 계약 개정: 관통 시각화(반투명·스침 획·착지 위험 표시)는 전부 제거했다.
  // 밑면이 막고 누르는 세계에서는 "통과 중"이라는 상태 자체가 없다 — 없는 것을 그리면 거짓말이다.
  // 접촉 피드백은 core가 발행하는 headBonk 이벤트(먼지·소리·진동)가 진다.
  // 피격 직후(≤HIT_IFRAMES)만 점멸 — 디버그 상시 무적은 통짜로 그린다 (08-30, D-2)
  const shortInvuln = s.player.invulnTicks > 0 && s.player.invulnTicks <= PLAYER.HIT_IFRAMES;
  if (!shortInvuln || s.player.invulnTicks % 6 < 4 || s.player.pose === 'special') {
    drawPlayer(ctx, s.player.pose, s.player.poseTick, VIEW.LANE_X[s.player.lane], g - s.player.y);
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
  drawSpawnCue(ctx, s);
  drawEffects(ctx);
  drawNumPopups(ctx);
  drawPopups(ctx);
  ctx.restore();
  ctx.restore();

  // 필드 상단 규칙선 — 건물이 클립 경계에서 '툭' 나타나는 걸 프레임 안으로 들어오는 것으로
  // 읽히게 한다. 조작 존 상단(#touch-layer::after)과 같은 굵기·같은 농도로 맞춘 액자 두 변.
  ctx.fillStyle = 'rgba(26, 26, 32, 0.16)';
  ctx.fillRect(0, VIEW.FIELD_TOP, VIEW.W, 1);

  // 지면 인디케이터 (08-30 4차) — 카메라가 올라가 지면선이 화면 아래로 빠진 동안에만 뜬다.
  // 추종 카메라를 폐기했던 근거가 "지면이 화면 밖"이었다. 카메라는 되살리되 그 정보만은
  // 화면에 붙박아 둔다: 바닥변의 지면선 + 플레이어 레인의 착지 눈금.
  if (cam > 0.5) {
    const a = Math.min(1, cam / CAMERA.MAX);
    ctx.save();
    ctx.globalAlpha = 0.14 + 0.30 * a;
    ctx.fillStyle = PALETTE.INK;
    ctx.fillRect(0, VIEW.FIELD_H - 2, VIEW.W, 2);
    const px = VIEW.LANE_X[s.player.lane];
    ctx.fillRect(px - 15, VIEW.FIELD_H - 8, 30, 2);
    ctx.restore();
  }

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
    // ★08-30 7차: 구 채움 '#3A3A42' 는 캐릭터 잉크(#1A1A20)와 명도가 붙어 있었다 —
    // 졸라맨은 선만 있는 형상이라 잔해 더미 위에 올라서면 통째로 삼켜졌다. PALETTE 명도 위계 참조.
    ctx.fillStyle = PALETTE.RUBBLE;
    ctx.fillRect(d.x - d.w / 2, groundY - d.y - d.h, d.w, d.h);
    ctx.strokeStyle = PALETTE.INK;
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

/**
 * 다음 건물 예고. 완파 후 스폰까지의 공백이 아무 신호 없는 빈 화면이었다(08-30 7차).
 * 번개·대포 큐와 같은 규칙을 따른다 — 카메라 변환 **밖**, 필드 상단 고정, 잉크 실루엣.
 * 렌더 전용이라 시뮬은 안 건드린다: 읽는 값은 `stackSpawnCd` 하나뿐이다.
 */
function drawSpawnCue(ctx: CanvasRenderingContext2D, s: GameState): void {
  if (s.stack || s.over) return;
  const cd = s.stackSpawnCd;
  if (cd <= 0 || cd > STACK.SPAWN_CUE_TICKS) return;

  const x = VIEW.LANE_X[s.player.lane] ?? VIEW.LANE_X[0];
  const y = VIEW.FIELD_TOP + 16;
  const t = 1 - cd / STACK.SPAWN_CUE_TICKS;   // 0 → 1 로 다가온다
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.45 * t;
  // 낙하 경로 안내선 — 어디로 떨어지는지가 정보다
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.moveTo(x, y + 12);
  ctx.lineTo(x, y + 12 + 26 * t);
  ctx.stroke();
  ctx.setLineDash([]);
  // ▼ 마커 — 아이보리 헤일로 위에 잉크 삼각형(밝은 배경·어두운 배경 양쪽에서 산다)
  const r = 9 + 2 * Math.sin(t * Math.PI * 4);
  ctx.beginPath();
  ctx.moveTo(x - r, y - r * 0.7);
  ctx.lineTo(x + r, y - r * 0.7);
  ctx.lineTo(x, y + r * 0.8);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = PALETTE.WHITE;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = PALETTE.INK;
  ctx.fill();
  ctx.restore();
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
    ctx.font = `${Math.round(13 * p.scale * pop)}px "Black Han Sans", sans-serif`;
    ctx.textAlign = 'center';
    // ★08-30 7차 이중 외곽선: 아이보리 헤일로 하나만 두면 **배경색과 같은 색**이라
    // 밝은 건물 면 위에서 통째로 사라진다(사용자 영상 판정). 잉크 링을 바깥에 하나 더 둘러
    // 밝은 곳/어두운 곳 양쪽에서 최소 한 겹은 살아남게 한다.
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = PALETTE.INK;
    ctx.strokeText(String(p.n), 0, 0);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = PALETTE.WHITE;
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
    ctx.font = `${Math.round(14 * p.scale)}px "Black Han Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = PALETTE.INK;      // 노랑 채움은 아이보리 배경에서 제일 약하다 — 잉크 링 필수
    ctx.strokeText(p.text, 0, 0);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = PALETTE.WHITE;
    ctx.strokeText(p.text, 0, 0);
    ctx.fillStyle = PALETTE.YELLOW;
    ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }
}
