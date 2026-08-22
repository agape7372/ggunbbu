// 드로우 오케스트레이션 + 이벤트 소비(셰이크/플래시/사운드/진동/의성어).
// core는 events만 발행 — 여기서 프레임마다 소비 후 클리어.

import type { GameState } from '../core/types';
import { JUICE, JUICE_SYS, HAPTIC, PALETTE, VIEW } from '../config';
import {
  initSprites, drawPlayer, drawStack, drawBoss, drawEntity,
  drawGroundRocks, drawStackShadow,
} from './sprites';
import { playSfx, type SfxNameOf } from '../audio/bridge';

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
}

function onomatopoeia(kind: string, combo: number): string | null {
  switch (kind) {
    case 'hit':
      return combo >= 500 ? '빠샤아아!!!' : combo >= 100 ? '콰지지직!!' : combo >= 50 ? '콰지직!' : '콰직';
    case 'floorCollapse': return '우르르';
    case 'stackDestroy': return '쾅!!';
    case 'butterCollapse': return '팟!';
    case 'special': return '천지개벽!!!';
    case 'bossDefeat': return '작전성공';
    case 'guardAirBounce': return '탁!';
    default: return null;
  }
}

const SFX_MAP: Record<string, SfxNameOf> = {
  slash: 'hit', hit: 'hit', floorCollapse: 'floorCollapse', stackDestroy: 'destroy',
  butterCollapse: 'butterPop', special: 'special', hurt: 'pinned',
  guardBounce: 'guardGround', guardAirBounce: 'guardAir', bossHit: 'bossHit', bossDefeat: 'bossDefeat',
  boltCue: 'boltCue', boltStrike: 'boltStrike', gaugeFull: 'gaugeFull',
  comboBreak: 'guardBreak', jump: 'jump', land: 'land',
  guardDenied: 'gaugeWarn', lifeLost: 'lifeLost', bonusEnter: 'perfect',
  bonusPerfect: 'perfect', phaseClear: 'gaugeFull', chapterUnlock: 'gaugeFull',
};

/** 이벤트 소비: 셰이크/플래시/의성어/사운드/진동. 소비 후 clear는 호출자가. */
export function consumeEvents(s: GameState): void {
  for (const e of s.events) {
    const spec = JUICE[e.kind];
    if (spec) {
      trauma = Math.min(1, Math.max(trauma, spec.shake / JUICE_SYS.SHAKE_MAX_AMP));
      if (spec.flash > 0 && e.kind !== 'hit') { flashTicks = spec.flash; flashColor = e.kind === 'hurt' ? '#E5302E' : '#1A1A20'; }
      if (s.hitstop < spec.hitstop) s.hitstop = spec.hitstop;
    }
    // 콤보 숫자 팝업 (타격마다 1개, 상한까지 누적)
    if (e.kind === 'hit' || e.kind === 'bossHit') {
      const n = e.combo ?? s.combo;
      if (n > 0) {
        if (numPopups.length >= JUICE_SYS.COMBO_POPUP_MAX) numPopups.shift();
        numPopups.push({
          n,
          x: VIEW.LANE_X[0] + scatter() * 22,
          y: VIEW.GROUND_Y - (e.y ?? 100) - 12 + scatter() * 10,
          vx: scatter() * 0.9,
          vy: -1.4 - Math.abs(scatter()) * 0.8,
          ticks: JUICE_SYS.COMBO_POPUP_LIFE_F,
          scale: 1 + Math.min(n / 400, 1.1),
          color: comboColor(n),
        });
      }
    }
    // 의성어 (동시 3개 상한)
    const word = onomatopoeia(e.kind, e.combo ?? s.combo);
    if (word) {
      if (popups.length >= JUICE_SYS.ONOMATOPOEIA_MAX) popups.shift();
      const esc = e.combo ?? s.combo;
      popups.push({
        text: word,
        x: VIEW.LANE_X[0] + ((esc * 13) % 30) - 15,
        y: VIEW.GROUND_Y - (e.y ?? 100) - 30,
        ticks: 24,
        scale: e.kind === 'special' || e.kind === 'bossDefeat' ? 2 : 1 + Math.min(esc / 500, 0.8),
      });
    }
    // 사운드 (콤보 10단위 반음 상승)
    const sfx = SFX_MAP[e.kind];
    if (sfx) {
      const semis = e.kind === 'hit' ? Math.floor(((e.combo ?? 0) / 10) % 12) : 0;
      playSfx(sfx, semis);
      if (e.kind === 'stackDestroy') playSfx('gorogoro');
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
  // 감쇠
  trauma = Math.max(0, trauma - 0.693 / JUICE_SYS.SHAKE_HALF_LIFE_F * trauma);
  if (flashTicks > 0) flashTicks -= 1;

  const [sx, sy] = shakeOffset();
  ctx.save();
  ctx.translate(sx, sy);

  // 배경 (챕터/페이즈별 색 — 배경 아트는 위임 산출물로 교체 예정)
  ctx.fillStyle = bgColor(s);
  ctx.fillRect(-16, -16, VIEW.W + 32, VIEW.H + 32);
  // 지면
  ctx.fillStyle = '#DDD8CC';
  ctx.fillRect(-16, VIEW.GROUND_Y, VIEW.W + 32, VIEW.H - VIEW.GROUND_Y);

  const g = VIEW.GROUND_Y;
  if (s.stack) { drawStackShadow(ctx, s.stack, g); drawStack(ctx, s.stack, g); }
  drawDebris(ctx, s, g);
  drawGroundRocks(ctx, s.groundRocks, g);
  for (const e of s.entities) if (e.kind !== 'stack') drawEntity(ctx, e, g);
  if (s.boss) drawBoss(ctx, s.boss, g);

  // 플레이어 (피격 무적 점멸)
  if (s.player.invulnTicks % 6 < 4 || s.player.pose === 'special') {
    drawPlayer(ctx, s.player.pose, s.player.poseTick, VIEW.LANE_X[s.player.lane], g - s.player.y);
  }

  drawHud(ctx, s);
  drawNumPopups(ctx);
  drawPopups(ctx);
  ctx.restore();

  // 전화면 플래시
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

function drawHud(ctx: CanvasRenderingContext2D, s: GameState): void {
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'left';
  // 점수 (8자리)
  ctx.fillStyle = PALETTE.INK;
  ctx.fillText(String(s.score).padStart(8, '0'), 8, 20);
  // 라이프
  for (let i = 0; i < s.lives; i++) {
    ctx.fillStyle = PALETTE.RED;
    ctx.fillRect(8 + i * 14, 28, 10, 10);
  }
  // 콤보
  if (s.combo > 0) {
    const big = 16 + Math.min(s.combo / 50, 10);
    ctx.font = `bold ${Math.round(big)}px monospace`;
    ctx.fillStyle = s.combo >= 999 ? PALETTE.RED : PALETTE.YELLOW;
    ctx.textAlign = 'right';
    ctx.fillText(`${s.combo} COMBO`, VIEW.W - 8, 24);
  }
  // 게이지 2종 [원작] — 방어(핑크, 길다) / 기술(황색, 짧다)
  const gw = 120;
  ctx.fillStyle = '#D5D0C4';
  ctx.fillRect(VIEW.W - gw - 8, 30, gw, 7);
  ctx.fillStyle = '#FF6FA8';
  ctx.fillRect(VIEW.W - gw - 8, 30, gw * (s.guardGauge / 100), 7);
  const ww = 72;
  ctx.fillStyle = '#D5D0C4';
  ctx.fillRect(VIEW.W - ww - 8, 40, ww, 5);
  ctx.fillStyle = s.wazaGauge >= 100 ? PALETTE.RED : PALETTE.YELLOW;
  ctx.fillRect(VIEW.W - ww - 8, 40, ww * (s.wazaGauge / 100), 5);
  // 보스 HP
  if (s.boss && s.act2Phase === 'moon') {
    ctx.fillStyle = '#D5D0C4';
    ctx.fillRect(40, 48, VIEW.W - 80, 6);
    ctx.fillStyle = PALETTE.RED;
    ctx.fillRect(40, 48, (VIEW.W - 80) * (s.boss.hp / 230), 6);
  }
  // 보너스 타이머
  if (s.mode === 'bonus' && s.bonus) {
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.YELLOW;
    ctx.fillText(`버터바 타임! ${Math.ceil(s.bonus.ticksLeft / 60)}s`, VIEW.W / 2, 70);
  }
}
