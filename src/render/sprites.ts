// 건뿌 — 프로시저럴 픽셀아트 스프라이트 모듈.
// 오프스크린 캔버스에 최초 1회 사전 렌더 후 drawImage로 복사(성능).
// 동적 요소(크랙 오버레이, 보스 렌즈 점멸)만 실시간 재계산.
// 원작(대불·달토끼·사무라이) 도상 금지 — 순수 창작 도안.

import type {
  PlayerPose, FallingStack, BossState, Entity, Theme, Material,
  FloorSeg, Bolt, Rock, Shot, Rabbit, Cannon,
} from '../core/types';
import { VIEW, PALETTE, PLAYER, BOSS, ACT2, STACK } from '../config';

// ── 공통 색상 ────────────────────────────────────────────────────
const OUTLINE = '#0A0A14';
const SKIN = '#3FA34D';
const SKIN_DK = '#2C7A38';
const HORN = '#B8BEC6';
const HELMET = PALETTE.WHITE;
const HELMET_DK = '#C9C6BC';
const WOOD = '#7A4B2A';
const WOOD_DK = '#4A2E18';
const SPIKE = '#241408';
const FOOT_DK = '#1A1A24';
const ROCK_BASE = '#5A5A5F';
const ROCK_CRACK = '#D9782E';

// ── 저수준 헬퍼 ──────────────────────────────────────────────────
function mkCanvas(w: number, h: number): { cv: HTMLCanvasElement; c: CanvasRenderingContext2D } {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  return { cv, c };
}

/** 다크 아웃라인 블록: 1px 어두운 테두리 + 채움 (블록 조합형 픽셀아트 기법) */
function block(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  c.fillStyle = OUTLINE;
  c.fillRect(x - 1, y - 1, w + 2, h + 2);
  c.fillStyle = color;
  c.fillRect(x, y, w, h);
}

/** 무표정 가로선 눈(기본) / special=true면 흰 원 뒤집힌 눈 — 브랜드 갭 개그 축, 항상 이 함수만 사용 */
function drawFace(c: CanvasRenderingContext2D, cx: number, eyeY: number, special: boolean): void {
  if (special) {
    block(c, cx - 7, eyeY - 2, 4, 4, PALETTE.WHITE);
    block(c, cx + 3, eyeY - 2, 4, 4, PALETTE.WHITE);
  } else {
    c.fillStyle = OUTLINE;
    c.fillRect(cx - 7, eyeY, 4, 1);
    c.fillRect(cx + 3, eyeY, 4, 1);
  }
}

/** 결정론적 의사난수 (시간 무관 — 같은 입력엔 항상 같은 크랙 패턴) */
function hashSeed(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// ── 피해 크랙 오버레이 (동적, hp/maxHp 3단) ─────────────────────
function drawCrackOverlay(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  hp: number, maxHp: number
): void {
  if (maxHp <= 0) return;
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  if (ratio > 0.99) return;
  const damage = 1 - ratio;
  const stage = damage < 0.34 ? 1 : damage < 0.67 ? 2 : 3;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = `rgba(10,10,20,${(0.1 * stage).toFixed(3)})`;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 1;
  const seed = x * 3.7 + y * 1.3 + w + h;
  for (let i = 0; i < stage; i++) {
    let px = x + hashSeed(seed + i * 5.1) * w;
    let py = y + hashSeed(seed + i * 5.1 + 1) * h;
    ctx.beginPath();
    ctx.moveTo(px, py);
    for (let seg = 0; seg < 2 + stage; seg++) {
      const ang = hashSeed(seed + i * 5.1 + seg * 2.3 + 2) * Math.PI * 2;
      px += Math.cos(ang) * 6;
      py += Math.sin(ang) * 6;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ══════════════════════════════════════════════════════════════
// 건물 층 타일 (Material × Theme)
// ══════════════════════════════════════════════════════════════
type Tier = 'weak' | 'mid' | 'hard';
interface TierColors { base: string; dark: string; light: string; accent: string; }

const THEMES: Theme[] = ['europe', 'asia', 'eastasia', 'modern'];
const TIERS: Tier[] = ['weak', 'mid', 'hard'];
const SPECIAL_MATS: Array<Exclude<Material, Tier>> = ['butter', 'cathedral', 'lobby', 'office', 'penthouse'];

// 색약 안전 3중 부호화: weak=어둡고 낡음(저채도) / mid=중간 / hard=밝고 단단(고채도) — 밝기 단계로 색+패턴 보완
const THEME_TIERS: Record<Theme, Record<Tier, TierColors>> = {
  europe: {
    weak: { base: '#8f8168', dark: '#6b6049', light: '#a89873', accent: '#5b4f3a' }, // 낡은 회반죽+덧창
    mid: { base: '#a3543a', dark: '#7a3c28', light: '#c07050', accent: '#e8dcc8' }, // 벽돌+아치창
    hard: { base: '#8a95a3', dark: '#5f6b78', light: '#c3ccd6', accent: '#3d4650' }, // 석조 성벽+총안
  },
  asia: {
    weak: { base: '#b89a5e', dark: '#8f7444', light: '#d4bb82', accent: '#6b5530' }, // 대나무 골조+발
    mid: { base: '#a3763f', dark: '#7a5730', light: '#c69a5c', accent: '#5c431f' }, // 흙벽+격자창
    hard: { base: '#d9c48f', dark: '#b09960', light: '#f0e0b8', accent: '#8a6f3a' }, // 사암 아치+돔 문양
  },
  eastasia: {
    weak: { base: '#8a6f4f', dark: '#5f4a33', light: '#a88a63', accent: '#403020' }, // 낡은 목조+한지창
    mid: { base: '#5c4632', dark: '#3d2e1f', light: '#7a604a', accent: '#a02e2e' }, // 기와+단청 띠
    hard: { base: '#94918a', dark: '#68655e', light: '#bcb8ae', accent: '#4a4842' }, // 석탑 기단
  },
  modern: {
    weak: { base: '#7d8188', dark: '#585c62', light: '#9ea2a8', accent: '#a04430' }, // 조립 패널+녹 줄눈
    mid: { base: '#4a6a7a', dark: '#324c58', light: '#7fa4b5', accent: '#cfe8f0' }, // 유리 커튼월 격자
    hard: { base: '#6b7580', dark: '#454d56', light: '#9aa5b0', accent: '#d0d5da' }, // 강철 리벳+대각 보강재
  },
};

const SPECIAL_COLORS: Record<Exclude<Material, Tier>, TierColors> = {
  butter: { base: PALETTE.YELLOW, dark: '#C79E00', light: '#FFF07A', accent: '#E8E8E8' },
  cathedral: { base: '#8a95a3', dark: '#5f6b78', light: '#c3ccd6', accent: '#c05050' },
  lobby: { base: '#6b6f75', dark: '#4a4d52', light: '#9a9ea3', accent: '#2a2c2f' },
  office: { base: '#7fa4b5', dark: '#5a7a88', light: '#cfe8f0', accent: '#2f3a3f' },
  penthouse: { base: '#8a95a3', dark: '#5f6b78', light: '#FFD200', accent: '#C79E00' },
};

function fillBase(c: CanvasRenderingContext2D, w: number, h: number, t: TierColors): void {
  c.fillStyle = t.dark;
  c.fillRect(0, 0, w, h);
  c.fillStyle = t.base;
  c.fillRect(1, 1, w - 2, h - 2);
  c.fillStyle = t.dark;
  c.fillRect(0, h - 2, w, 2);
}

function drawThemeDetail(c: CanvasRenderingContext2D, w: number, h: number, mat: Tier, theme: Theme, t: TierColors): void {
  const midX = w / 2;
  if (theme === 'europe') {
    if (mat === 'weak') {
      block(c, 14, 8, 12, 20, t.dark);
      block(c, w - 26, 8, 12, 20, t.dark);
      c.fillStyle = t.accent;
      c.fillRect(16, 10, 8, 16);
      c.fillRect(w - 24, 10, 8, 16);
    } else if (mat === 'mid') {
      c.fillStyle = t.dark;
      for (let ry = 3; ry < h - 3; ry += 5) c.fillRect(0, ry, w, 1);
      block(c, midX - 14, 6, 28, 24, t.accent);
      c.fillStyle = t.dark;
      c.beginPath();
      c.arc(midX, 6, 14, Math.PI, 0);
      c.fill();
    } else {
      for (let bx = 8; bx < w - 8; bx += 18) block(c, bx, 6, 5, h - 16, t.dark);
    }
  } else if (theme === 'asia') {
    if (mat === 'weak') {
      for (let bx = 6; bx < w - 4; bx += 8) block(c, bx, 4, 3, h - 10, t.dark);
      c.globalAlpha = 0.5;
      c.fillStyle = t.accent;
      c.fillRect(4, h - 14, w - 8, 8);
      c.globalAlpha = 1;
    } else if (mat === 'mid') {
      block(c, midX - 12, 8, 24, 20, t.accent);
      c.strokeStyle = t.dark;
      c.lineWidth = 1;
      c.strokeRect(midX - 12, 8, 24, 20);
      c.beginPath();
      c.moveTo(midX, 8);
      c.lineTo(midX, 28);
      c.moveTo(midX - 12, 18);
      c.lineTo(midX + 12, 18);
      c.stroke();
    } else {
      block(c, midX - 16, 4, 32, 26, t.accent);
      c.fillStyle = t.dark;
      c.beginPath();
      c.arc(midX, 4, 16, Math.PI, 0);
      c.fill();
      c.fillStyle = t.light;
      c.beginPath();
      c.arc(midX, 4, 5, 0, Math.PI * 2);
      c.fill();
    }
  } else if (theme === 'eastasia') {
    if (mat === 'weak') {
      for (let bx = 4; bx < w - 4; bx += 10) block(c, bx, 4, 2, h - 8, t.dark);
      c.fillStyle = t.accent;
      c.fillRect(6, 6, w - 12, h - 14);
    } else if (mat === 'mid') {
      c.fillStyle = t.dark;
      for (let rx = 0; rx < w; rx += 8) {
        c.beginPath();
        c.arc(rx + 4, 2, 4, 0, Math.PI);
        c.fill();
      }
      c.fillStyle = t.accent;
      c.fillRect(0, h / 2, w, 5);
    } else {
      c.fillStyle = t.dark;
      for (let ty = 4; ty < h - 6; ty += 8) c.fillRect(6, ty, w - 12, 1);
      block(c, 4, h - 10, w - 8, 6, t.light);
    }
  } else {
    if (mat === 'weak') {
      c.fillStyle = t.dark;
      for (let bx = 0; bx < w; bx += 20) c.fillRect(bx, 0, 1, h);
      c.fillStyle = t.accent;
      c.fillRect(0, h - 6, w, 2);
    } else if (mat === 'mid') {
      c.strokeStyle = t.dark;
      c.lineWidth = 1;
      for (let gx = 0; gx <= w; gx += 20) {
        c.beginPath();
        c.moveTo(gx, 0);
        c.lineTo(gx, h);
        c.stroke();
      }
      for (let gy = 0; gy <= h; gy += 10) {
        c.beginPath();
        c.moveTo(0, gy);
        c.lineTo(w, gy);
        c.stroke();
      }
      c.globalAlpha = 0.3;
      c.fillStyle = t.light;
      c.fillRect(0, 0, w, h);
      c.globalAlpha = 1;
    } else {
      c.strokeStyle = t.dark;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(0, h);
      c.lineTo(w, 0);
      c.stroke();
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(w, h);
      c.stroke();
      for (let bx = 6; bx < w; bx += 14) {
        c.fillStyle = t.light;
        c.beginPath();
        c.arc(bx, 6, 2, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
}

function drawSpecialDetail(c: CanvasRenderingContext2D, w: number, h: number, mat: Exclude<Material, Tier>, t: TierColors): void {
  const midX = w / 2;
  if (mat === 'butter') {
    c.fillStyle = t.light;
    c.fillRect(0, 2, w, 2); // 겹 경계 하이라이트 줄
    c.globalAlpha = 0.5;
    c.fillStyle = t.accent;
    c.fillRect(0, h - 10, w, 4); // 은박 띠
    c.globalAlpha = 1;
  } else if (mat === 'cathedral') {
    c.fillStyle = t.dark;
    c.beginPath();
    c.arc(midX, h / 2, 10, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = t.accent;
    c.beginPath();
    c.arc(midX, h / 2, 5, 0, Math.PI * 2);
    c.fill(); // 장미창
    c.strokeStyle = t.dark;
    c.lineWidth = 1;
    c.strokeRect(6, 4, w - 12, h - 8); // 종탑 아치 프레임
  } else if (mat === 'lobby') {
    block(c, midX - 10, h - 22, 20, 22, t.dark); // 화강암 문
    c.fillStyle = t.light;
    c.fillRect(midX - 2, h - 14, 4, 4); // 손잡이
  } else if (mat === 'office') {
    c.strokeStyle = t.dark;
    c.lineWidth = 1;
    for (let gy = 4; gy < h; gy += 8) {
      c.beginPath();
      c.moveTo(0, gy);
      c.lineTo(w, gy);
      c.stroke();
    }
  } else {
    c.fillStyle = t.light;
    c.fillRect(0, 2, w, 2);
    c.fillRect(0, h - 4, w, 2); // 금장 띠
  }
}

function renderMatTile(c: CanvasRenderingContext2D, w: number, h: number, mat: Material, theme: Theme): void {
  if (mat === 'weak' || mat === 'mid' || mat === 'hard') {
    const t = THEME_TIERS[theme][mat];
    fillBase(c, w, h, t);
    drawThemeDetail(c, w, h, mat, theme, t);
  } else {
    const t = SPECIAL_COLORS[mat];
    fillBase(c, w, h, t);
    drawSpecialDetail(c, w, h, mat, t);
  }
}

function tileKey(mat: Material, theme: Theme): string {
  return mat === 'weak' || mat === 'mid' || mat === 'hard' ? `${theme}:${mat}` : mat;
}

function drawTileInstance(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  mat: Material, theme: Theme, seg: FloorSeg
): void {
  const cv = tileCache!.get(tileKey(mat, theme));
  if (cv) ctx.drawImage(cv, x, y, w, h);
  drawCrackOverlay(ctx, x, y, w, h, seg.hp, seg.maxHp);
}

// ══════════════════════════════════════════════════════════════
// 플레이어 "뿌뿌" (32×48 발 기준 논리 규격, 실제 캔버스는 앵커 포함 여유폭)
// ══════════════════════════════════════════════════════════════
interface PFrame { cv: HTMLCanvasElement; ax: number; ay: number; }
type PlayerFrameKey =
  | 'idle' | 'jump' | 'attack0' | 'attack1' | 'attack2'
  | 'guardG' | 'guardA' | 'guardBreak' | 'special' | 'pinned' | 'dead';

const STAND_W = 44, STAND_H = 60;
const CX = 22;
const HELMET_Y = 10;
const TORSO_Y = 30;
const HIP_Y = 44;
const LEG_H = 12;
const FOOT_Y = HIP_Y + LEG_H + 4; // 60

const WIDE_W = 64, WIDE_H = 60;
const WCX = 22;

const FLAT_W = 48, FLAT_H = 28;

function legsBlock(c: CanvasRenderingContext2D, cx: number, hipY: number, legH: number, spread = 0): void {
  block(c, cx - 8 - spread, hipY, 6, legH, SKIN_DK);
  block(c, cx + 2 + spread, hipY, 6, legH, SKIN_DK);
  block(c, cx - 9 - spread, hipY + legH, 8, 4, FOOT_DK);
  block(c, cx + 1 + spread, hipY + legH, 8, 4, FOOT_DK);
}

function torsoBlock(c: CanvasRenderingContext2D, cx: number, y: number): void {
  block(c, cx - 9, y, 18, 14, SKIN_DK);
  block(c, cx - 7, y + 2, 14, 9, SKIN);
}

function armBlock(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  block(c, x, y, w, h, SKIN);
}

function headBlock(c: CanvasRenderingContext2D, cx: number, topY: number, special: boolean, tilt: number): void {
  block(c, cx - 10 + tilt, topY, 20, 6, HELMET); // 안전모
  block(c, cx - 11 + tilt, topY + 5, 22, 3, HELMET_DK); // 챙 (삐딱하게)
  block(c, cx + 6, topY - 5, 4, 5, HORN); // 외뿔
  block(c, cx - 8, topY + 8, 16, 10, SKIN); // 얼굴
  drawFace(c, cx, topY + 13, special);
}

function weaponHandle(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  block(c, x, y, w, h, WOOD);
}

function spikeDots(c: CanvasRenderingContext2D, x: number, y: number, h: number): void {
  c.fillStyle = SPIKE;
  for (let i = 0; i < 3; i++) c.fillRect(x + 2 + i * 3, y - 1, 1, 2);
  for (let i = 0; i < 3; i++) c.fillRect(x + 2 + i * 3, y + h - 1, 1, 2);
}

function weaponHead(c: CanvasRenderingContext2D, x: number, y: number): void {
  block(c, x, y, 10, 8, WOOD_DK);
  spikeDots(c, x, y, 8);
}

function buildIdle(): PFrame {
  const { cv, c } = mkCanvas(STAND_W, STAND_H);
  legsBlock(c, CX, HIP_Y, LEG_H);
  torsoBlock(c, CX, TORSO_Y);
  armBlock(c, CX - 13, TORSO_Y, 5, 12);
  armBlock(c, CX + 8, TORSO_Y - 2, 5, 10);
  weaponHandle(c, CX + 9, 2, 3, 26); // 자루 — 어깨에 걸침
  weaponHead(c, CX + 5, 0);
  headBlock(c, CX, HELMET_Y, false, 1);
  return { cv, ax: CX, ay: FOOT_Y };
}

function buildJump(): PFrame {
  const { cv, c } = mkCanvas(STAND_W, STAND_H);
  legsBlock(c, CX, HIP_Y + 4, LEG_H - 6, 2); // 다리 굽힘
  torsoBlock(c, CX, TORSO_Y - 2);
  armBlock(c, CX - 14, TORSO_Y, 5, 10);
  armBlock(c, CX + 9, TORSO_Y + 2, 5, 10);
  weaponHandle(c, CX + 10, TORSO_Y + 4, 3, 16); // 방망이 뒤로
  weaponHead(c, CX + 6, TORSO_Y + 16);
  headBlock(c, CX, HELMET_Y - 2, false, 0);
  return { cv, ax: CX, ay: FOOT_Y };
}

/** 공격 3단계: 0=풀스윙 준비, 1=타격 순간(최대 리치), 2=팔로우스루 */
function buildAttack(stage: 0 | 1 | 2): PFrame {
  const { cv, c } = mkCanvas(WIDE_W, WIDE_H);
  legsBlock(c, WCX, HIP_Y, LEG_H, stage === 1 ? 2 : 0);
  torsoBlock(c, WCX, TORSO_Y);
  armBlock(c, WCX - 13, TORSO_Y, 5, 12);
  if (stage === 0) {
    armBlock(c, WCX + 8, TORSO_Y - 8, 5, 10);
    weaponHandle(c, WCX + 9, 2, 3, 20);
    weaponHead(c, WCX + 4, 0);
  } else if (stage === 1) {
    armBlock(c, WCX + 10, TORSO_Y + 2, 5, 10);
    weaponHandle(c, WCX + 14, TORSO_Y + 4, 22, 4);
    weaponHead(c, WCX + 34, TORSO_Y);
  } else {
    armBlock(c, WCX + 9, TORSO_Y + 6, 5, 12);
    weaponHandle(c, WCX + 12, TORSO_Y + 10, 4, 20);
    weaponHead(c, WCX + 9, TORSO_Y + 28);
  }
  headBlock(c, WCX, HELMET_Y, false, stage === 1 ? 2 : 0);
  return { cv, ax: WCX, ay: FOOT_Y };
}

function buildGuard(air: boolean): PFrame {
  const { cv, c } = mkCanvas(STAND_W, STAND_H);
  legsBlock(c, CX, HIP_Y + (air ? 3 : 0), LEG_H - (air ? 4 : 0), air ? 3 : 0);
  torsoBlock(c, CX, TORSO_Y);
  armBlock(c, CX - 12, TORSO_Y - 6, 5, 10);
  armBlock(c, CX + 7, TORSO_Y - 6, 5, 10);
  weaponHandle(c, CX - 14, 4, 28, 3); // 방망이 머리 위 수평
  weaponHead(c, CX + 12, 0);
  headBlock(c, CX, HELMET_Y + 2, false, 0);
  return { cv, ax: CX, ay: FOOT_Y };
}

function buildGuardBreak(): PFrame {
  const { cv, c } = mkCanvas(STAND_W, STAND_H);
  legsBlock(c, CX, HIP_Y, LEG_H, 1);
  torsoBlock(c, CX, TORSO_Y + 2);
  armBlock(c, CX - 15, TORSO_Y + 6, 5, 10);
  armBlock(c, CX + 10, TORSO_Y + 8, 5, 10);
  weaponHandle(c, CX - 18, FOOT_Y - 6, 20, 3); // 방망이 떨어뜨림 (발밑에 눕힘)
  weaponHead(c, CX + 2, FOOT_Y - 9);
  headBlock(c, CX, HELMET_Y + 3, false, -3); // 비틀린 각도
  return { cv, ax: CX, ay: FOOT_Y };
}

function buildSpecial(): PFrame {
  const { cv, c } = mkCanvas(WIDE_W, WIDE_H);
  legsBlock(c, WCX, HIP_Y, LEG_H, 3);
  torsoBlock(c, WCX, TORSO_Y + 2);
  armBlock(c, WCX - 14, TORSO_Y + 4, 5, 12);
  armBlock(c, WCX + 9, TORSO_Y + 4, 5, 12);
  weaponHandle(c, WCX + 12, TORSO_Y + 12, 4, 24); // 방망이 지면 강타
  weaponHead(c, WCX + 6, FOOT_Y - 10);
  headBlock(c, WCX, HELMET_Y + 2, true, 0); // 눈 뒤집힘(흰 원)
  c.strokeStyle = PALETTE.YELLOW;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(WCX - 6, FOOT_Y);
  c.lineTo(WCX - 16, FOOT_Y - 4);
  c.moveTo(WCX + 20, FOOT_Y);
  c.lineTo(WCX + 32, FOOT_Y - 4);
  c.stroke(); // 강타 충격선
  return { cv, ax: WCX, ay: FOOT_Y };
}

function buildPinned(): PFrame {
  const { cv, c } = mkCanvas(FLAT_W, FLAT_H);
  const fy = FLAT_H - 4;
  block(c, 6, fy - 6, FLAT_W - 12, 8, SKIN_DK); // 납작 눌린 몸통
  block(c, 2, fy - 4, 10, 5, SKIN);
  block(c, FLAT_W - 12, fy - 4, 10, 5, SKIN); // 가로로 퍼진 팔
  block(c, 10, fy - 2, 8, 4, SKIN_DK);
  block(c, FLAT_W - 18, fy - 2, 8, 4, SKIN_DK); // 다리
  headBlock(c, FLAT_W / 2, 2, false, 0);
  return { cv, ax: FLAT_W / 2, ay: fy + 4 };
}

function buildDead(): PFrame {
  const { cv, c } = mkCanvas(FLAT_W, FLAT_H);
  const fy = FLAT_H - 6;
  block(c, 4, fy - 8, FLAT_W - 8, 8, SKIN_DK); // 뒤집혀 누움
  block(c, FLAT_W - 14, fy - 10, 10, 6, SKIN);
  headBlock(c, 10, fy - 16, false, 0);
  return { cv, ax: FLAT_W / 2, ay: fy + 4 };
}

let playerFrames: Record<PlayerFrameKey, PFrame> | null = null;

function pickPlayerFrame(pose: PlayerPose, animTick: number): PFrame {
  const f = playerFrames!;
  switch (pose) {
    case 'idle': return f.idle;
    case 'jump': return f.jump;
    case 'attack':
      if (animTick < PLAYER.ATTACK_PRE) return f.attack0;
      if (animTick < PLAYER.ATTACK_PRE + PLAYER.ATTACK_ACTIVE) return f.attack1;
      return f.attack2;
    case 'guardG': return f.guardG;
    case 'guardA': return f.guardA;
    case 'guardBreak': return f.guardBreak;
    case 'special': return f.special;
    case 'pinned': return f.pinned;
    case 'dead': return f.dead;
    default: return f.idle;
  }
}

// ══════════════════════════════════════════════════════════════
// 보스 "보름호" — 고장난 감시위성 (80×64)
// ══════════════════════════════════════════════════════════════
type BossFrameKind = 'idle' | 'charging' | 'stagger' | 'defeated';

function buildBossFrame(kind: BossFrameKind): HTMLCanvasElement {
  const { cv, c } = mkCanvas(BOSS.W, BOSS.H);
  const cx = BOSS.W / 2, cy = BOSS.H / 2;
  const lean = kind === 'charging' ? -8 : 0;
  const tilt = kind === 'stagger' ? 6 : 0;
  const dim = kind === 'defeated';
  const bodyColor = dim ? '#4a5158' : '#8a95a3';
  const bodyDark = dim ? '#33383d' : '#5f6b78';

  c.save();
  c.translate(cx + lean * 0.3, cy);
  c.rotate((tilt * Math.PI) / 180);
  block(c, -20, -18, 40, 36, bodyColor); // 원형 본체(사각 근사)
  block(c, -14, -24, 28, 8, bodyDark); // 상단 캡
  block(c, -38, -4, 16, 8, PALETTE.BLUE); // 태양광 패널 좌
  block(c, 22, -4, 16, 8, PALETTE.BLUE); // 태양광 패널 우
  block(c, -2, -30, 2, 8, bodyDark); // 안테나
  block(c, -8, -6, 16, 16, '#2a2e33'); // 렌즈 하우징
  c.fillStyle = dim ? '#5a2a2a' : '#c05050';
  c.beginPath();
  c.arc(0, 2, 6, 0, Math.PI * 2);
  c.fill(); // 금간 렌즈
  c.fillStyle = dim ? '#7a3a3a' : PALETTE.RED;
  c.fillRect(-2, 0, 4, 4); // 빨강 점광
  c.strokeStyle = '#1a1d20';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(-6, -4);
  c.lineTo(0, 2);
  c.lineTo(4, -2);
  c.stroke(); // 금 간 선
  c.restore();

  if (kind === 'charging') {
    c.fillStyle = PALETTE.YELLOW;
    c.fillRect(cx + 22, cy - 4, 10, 3);
    c.fillRect(cx + 26, cy + 2, 8, 3);
    c.fillStyle = PALETTE.RED;
    c.fillRect(cx + 30, cy - 1, 6, 2); // 추진 불꽃
  }
  if (kind === 'stagger') {
    c.strokeStyle = PALETTE.YELLOW;
    c.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      c.beginPath();
      c.moveTo(cx + Math.cos(a) * 22, cy + Math.sin(a) * 22);
      c.lineTo(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30);
      c.stroke(); // 스파크
    }
  }
  if (kind === 'defeated') {
    c.fillStyle = 'rgba(120,120,120,0.4)';
    c.beginPath();
    c.arc(cx - 10, cy - 26, 6, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(cx + 12, cy - 30, 8, 0, Math.PI * 2);
    c.fill(); // 연기
  }
  return cv;
}

function bossX(boss: BossState): number {
  if (boss.st === 'charging' || boss.st === 'descend' || boss.st === 'attacking') {
    return VIEW.LANE_X[boss.targetLane];
  }
  return VIEW.W / 2;
}

// ══════════════════════════════════════════════════════════════
// 엔티티 (bolt/rock/shot/rabbit/cannon)
// ══════════════════════════════════════════════════════════════
function buildBoltIcon(): HTMLCanvasElement {
  const { cv, c } = mkCanvas(12, 40);
  c.fillStyle = '#29E0E6';
  c.beginPath();
  c.moveTo(7, 0);
  c.lineTo(2, 18);
  c.lineTo(6, 18);
  c.lineTo(1, 40);
  c.lineTo(10, 16);
  c.lineTo(6, 16);
  c.lineTo(11, 0);
  c.closePath();
  c.fill();
  c.strokeStyle = OUTLINE;
  c.lineWidth = 1;
  c.stroke();
  return cv;
}

function buildBoltCueIcon(): HTMLCanvasElement {
  const { cv, c } = mkCanvas(12, 12);
  c.fillStyle = '#29E0E6';
  c.beginPath();
  c.moveTo(7, 0);
  c.lineTo(3, 7);
  c.lineTo(6, 7);
  c.lineTo(4, 12);
  c.lineTo(9, 5);
  c.lineTo(6, 5);
  c.lineTo(8, 0);
  c.closePath();
  c.fill();
  return cv;
}

function buildRockIcon(): HTMLCanvasElement {
  const { cv, c } = mkCanvas(24, 20);
  block(c, 2, 6, 20, 12, ROCK_BASE);
  block(c, 6, 2, 12, 6, ROCK_BASE);
  c.strokeStyle = ROCK_CRACK;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(8, 8);
  c.lineTo(14, 12);
  c.lineTo(10, 16);
  c.stroke();
  block(c, 7, 9, 3, 3, PALETTE.WHITE); // 눈 (코믹 암석)
  block(c, 14, 9, 3, 3, PALETTE.WHITE);
  c.fillStyle = OUTLINE;
  c.fillRect(8, 10, 1, 1);
  c.fillRect(15, 10, 1, 1);
  return cv;
}

function buildShotIcon(cancellable: boolean): HTMLCanvasElement {
  const { cv, c } = mkCanvas(16, 10);
  const col = cancellable ? '#29E0E6' : PALETTE.RED;
  c.fillStyle = col;
  c.beginPath();
  c.arc(11, 5, 4, 0, Math.PI * 2);
  c.fill();
  c.fillRect(0, 4, 8, 2); // 꼬리
  return cv;
}

function buildRabbitIcon(): HTMLCanvasElement {
  const { cv, c } = mkCanvas(28, 20);
  block(c, 6, 8, 16, 8, '#8a8f94'); // 정찰 드론 몸통
  c.strokeStyle = '#c7cbce';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(0, 9);
  c.lineTo(6, 9);
  c.stroke();
  c.beginPath();
  c.moveTo(22, 9);
  c.lineTo(28, 9);
  c.stroke(); // 프로펠러
  block(c, 12, 11, 4, 4, '#2a3a4a'); // 렌즈
  c.fillStyle = PALETTE.RED;
  c.fillRect(13, 12, 2, 2);
  return cv;
}

function buildCannonIcon(): HTMLCanvasElement {
  const { cv, c } = mkCanvas(24, 28);
  block(c, 4, 12, 16, 12, '#5a5f64'); // 거치대
  block(c, 8, 0, 8, 16, '#3a3f44'); // 포신
  return cv;
}

function drawBoltEntity(ctx: CanvasRenderingContext2D, e: Bolt, groundY: number): void {
  const x = VIEW.LANE_X[e.lane];
  if (e.cueTicks > 0) {
    ctx.drawImage(entityCache!.get('boltCue')!, x - 6, 20); // 예고: ⚡만 표시
    return;
  }
  const y = groundY - e.y;
  ctx.drawImage(entityCache!.get('bolt')!, x - 6, y - 20);
}

function drawRockEntity(ctx: CanvasRenderingContext2D, e: Rock, groundY: number): void {
  const x = VIEW.LANE_X[e.lane];
  const y = groundY - e.y;
  ctx.drawImage(entityCache!.get('rock')!, x - 12, y - 20, 24, 20);
}

function drawShotEntity(ctx: CanvasRenderingContext2D, e: Shot, groundY: number): void {
  const key = e.cancellable ? 'shotOk' : 'shotCancel';
  ctx.drawImage(entityCache!.get(key)!, e.x - 8, groundY - e.y - 5);
}

function drawRabbitEntity(ctx: CanvasRenderingContext2D, e: Rabbit, groundY: number): void {
  const cv = entityCache!.get('rabbit')!;
  const y = groundY - e.y - 10;
  ctx.save();
  if (e.side === -1) {
    ctx.translate(e.x, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(cv, -14, y);
  } else {
    ctx.drawImage(cv, e.x - 14, y);
  }
  ctx.restore();
}

function drawCannonEntity(ctx: CanvasRenderingContext2D, e: Cannon, _groundY: number): void {
  // 대포는 좌/중/우로 벌려 설치된다 — 레인이 아니라 e.x가 실제 위치(수직탄·스파크 발생점)
  ctx.drawImage(entityCache!.get('cannon')!, e.x - 12, 6); // 화면 상단 고정(지면 변환 무관)
}

// ══════════════════════════════════════════════════════════════
// 캐시 & 초기화
// ══════════════════════════════════════════════════════════════
let initialized = false;
let tileCache: Map<string, HTMLCanvasElement> | null = null;
let bossCache: Map<BossFrameKind, HTMLCanvasElement> | null = null;
let entityCache: Map<string, HTMLCanvasElement> | null = null;

export function initSprites(): void {
  if (initialized) return;
  initialized = true;

  tileCache = new Map();
  for (const theme of THEMES) {
    for (const tier of TIERS) {
      const { cv, c } = mkCanvas(VIEW.LANE_W, VIEW.FLOOR_H);
      renderMatTile(c, VIEW.LANE_W, VIEW.FLOOR_H, tier, theme);
      tileCache.set(`${theme}:${tier}`, cv);
    }
  }
  for (const mat of SPECIAL_MATS) {
    const { cv, c } = mkCanvas(VIEW.LANE_W, VIEW.FLOOR_H);
    renderMatTile(c, VIEW.LANE_W, VIEW.FLOOR_H, mat, 'europe'); // 특수 재질은 테마 무관
    tileCache.set(mat, cv);
  }

  playerFrames = {
    idle: buildIdle(),
    jump: buildJump(),
    attack0: buildAttack(0),
    attack1: buildAttack(1),
    attack2: buildAttack(2),
    guardG: buildGuard(false),
    guardA: buildGuard(true),
    guardBreak: buildGuardBreak(),
    special: buildSpecial(),
    pinned: buildPinned(),
    dead: buildDead(),
  };

  bossCache = new Map();
  (['idle', 'charging', 'stagger', 'defeated'] as const).forEach((kind) => {
    bossCache!.set(kind, buildBossFrame(kind));
  });

  entityCache = new Map();
  entityCache.set('bolt', buildBoltIcon());
  entityCache.set('boltCue', buildBoltCueIcon());
  entityCache.set('rock', buildRockIcon());
  entityCache.set('shotOk', buildShotIcon(true));
  entityCache.set('shotCancel', buildShotIcon(false));
  entityCache.set('rabbit', buildRabbitIcon());
  entityCache.set('cannon', buildCannonIcon());
}

// ══════════════════════════════════════════════════════════════
// 공개 draw* API
// ══════════════════════════════════════════════════════════════

/** x=레인 중심 캔버스 x, footCanvasY=발 위치 캔버스 y. animTick으로 2프레임 모션 */
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  pose: PlayerPose,
  animTick: number,
  x: number,
  footCanvasY: number,
  facing: 1 | -1 = 1
): void {
  initSprites();
  const frame = pickPlayerFrame(pose, animTick);
  const bob = pose === 'idle' && Math.floor(animTick / 20) % 2 === 1 ? -1 : 0; // 2f 숨쉬기
  const drawY = footCanvasY - frame.ay + bob;
  ctx.save();
  if (facing === -1) {
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(frame.cv, -frame.ax, drawY);
  } else {
    ctx.drawImage(frame.cv, x - frame.ax, drawY);
  }
  ctx.restore();
}

/** groundY = 캔버스상 지면 y. floors[0]=최하층이 stack.y(물리, 지면0·위+)에서 시작해 위로 쌓임.
 *  단일 레인이라 층은 세그먼트 1개 — 일반 variant는 건물 폭(LANE_W=270) 중앙 정렬,
 *  butterbar는 좁은 폭(BUTTER_W=90)으로 같은 자리에 그린다. */
export function drawStack(ctx: CanvasRenderingContext2D, stack: FallingStack, groundY: number): void {
  initSprites();
  const isButter = stack.variant === 'butterbar';
  const totalW = isButter ? VIEW.BUTTER_W : VIEW.LANE_W;
  const baseX = VIEW.LANE_X[0] - totalW / 2;
  const bottomY = groundY - stack.y;

  ctx.save();
  if (stack.resting) {
    const pivotX = baseX + totalW / 2;
    ctx.translate(pivotX, bottomY);
    ctx.rotate((3 * Math.PI) / 180); // 접지 후 살짝 기울임
    ctx.translate(-pivotX, -bottomY);
  }

  let cumH = 0;
  for (const floor of stack.floors) {
    const floorTopY = bottomY - cumH - floor.h;
    drawTileInstance(ctx, baseX, floorTopY, totalW, floor.h, floor.mat, stack.theme, floor.segs[0]);
    cumH += floor.h;
  }
  ctx.restore();
}

export function drawBoss(ctx: CanvasRenderingContext2D, boss: BossState, groundY: number): void {
  initSprites();
  const kind: BossFrameKind =
    boss.st === 'charging' ? 'charging' :
    boss.st === 'stagger' ? 'stagger' :
    boss.st === 'defeated' ? 'defeated' : 'idle';
  const cv = bossCache!.get(kind)!;
  const x = bossX(boss);
  const cy = groundY - boss.y; // boss.y = 표시 고도(본체 중심 기준)
  ctx.drawImage(cv, x - BOSS.W / 2, cy - BOSS.H / 2);
  if (boss.hittable) {
    const blinkOn = Math.floor(boss.stTick / 8) % 2 === 0;
    if (blinkOn) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = PALETTE.WHITE;
      ctx.beginPath();
      ctx.arc(x, cy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

export function drawEntity(ctx: CanvasRenderingContext2D, e: Entity, groundY: number): void {
  initSprites();
  switch (e.kind) {
    case 'stack': drawStack(ctx, e, groundY); return;
    case 'bolt': drawBoltEntity(ctx, e, groundY); return;
    case 'rock': drawRockEntity(ctx, e, groundY); return;
    case 'shot': drawShotEntity(ctx, e, groundY); return;
    case 'rabbit': drawRabbitEntity(ctx, e, groundY); return;
    case 'cannon': drawCannonEntity(ctx, e, groundY); return;
  }
}

export function drawGroundRocks(ctx: CanvasRenderingContext2D, rocks: number, groundY: number): void {
  initSprites();
  const cv = entityCache!.get('rock')!;
  const count = Math.min(rocks, ACT2.ROCK_STACK_MAX);
  const cx = VIEW.LANE_X[0];
  for (let i = 0; i < count; i++) {
    const w = 20, h = 16;
    const y = groundY - 4 - i * 12;
    ctx.drawImage(cv, cx - w / 2 + (i % 2 === 0 ? -4 : 4), y - h, w, h);
  }
}

/** 낙하 스택 그림자 — 지면 타원, 높이에 따라 크기/농도 변화(낙하 위치 예측 보조) */
export function drawStackShadow(ctx: CanvasRenderingContext2D, stack: FallingStack, groundY: number): void {
  initSprites();
  const isButter = stack.variant === 'butterbar';
  const w = isButter ? VIEW.BUTTER_W : VIEW.LANE_W;
  const cx = VIEW.LANE_X[0];
  const heightFrac = Math.max(0, Math.min(1, stack.y / STACK.SPAWN_Y));
  const scale = 1 - 0.4 * heightFrac;
  const alpha = 0.35 * (1 - 0.6 * heightFrac);
  const rw = Math.max(2, (w * 0.8 * scale) / 2);
  const rh = Math.max(1, 8 * scale);
  ctx.save();
  ctx.fillStyle = `rgba(10,10,20,${alpha.toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(cx, groundY - 2, rw, rh, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
