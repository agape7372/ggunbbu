// 건뿌 — PNG 스프라이트 그리기와 프로시저럴 폴백.
// 오프스크린 캔버스에 최초 1회 사전 렌더 후 drawImage로 복사(성능).
// 동적 요소(크랙 오버레이, 보스 렌즈 점멸)만 실시간 재계산.
// 원작(대불·달토끼·사무라이) 도상 금지 — 순수 창작 도안.

import type {
  PlayerPose, FallingStack, BossState, Entity, Theme, Material, GimmickId,
  FloorSeg, Bolt, Rock, Shot, Rabbit, Cannon, WeaponId,
} from '../core/types';
import { VIEW, PALETTE, PLAYER, ACT2, STACK } from '../config';
import { drawAsset, hasAsset } from './assets';
import { drawExecutor } from './executor';
import { floorImageKey, floorMaterialKey } from './floorSheets';
import { floorSheetTile } from './floorSheetCache';
import { entityAssetKey, playerSheetFrame } from './frames';

// ── 공통 색상 ────────────────────────────────────────────────────
const OUTLINE = '#0A0A14';
// ★08-30 7차 — 건물 층 외곽선. ART_DIRECTION §B 가 "outlined in thin black line" 을 명시하는데
// 렌더는 색 차이로만 경계를 흉내 내고 있었다(fillBase). 다만 캐릭터 잉크(#1A1A20)보다 **밝게** 잡는다
// — 순수 검정으로 두르면 층 경계가 화면에서 제일 어두워져 졸라맨이 다시 묻힌다(PALETTE 명도 위계).
const TILE_EDGE = '#4A4740';
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
// 먼지톤 전환 [2026-08 아이보리 배경 대응]: base는 지정값 그대로, dark/light/accent는
// base 대비 밝기 배율(dark×0.84 / light×1.08 / accent×0.55)로 기계적 도출.
// accent = 창문·창틀용(가장 어두움) — 밝은 배경에서 창문이 뚫린 구멍이 아니라 창으로 읽히려면
// 반드시 base보다 확연히 어두워야 한다.
const THEME_TIERS: Record<Theme, Record<Tier, TierColors>> = {
  europe: {
    weak: { base: '#C9C2B4', dark: '#a9a397', light: '#d9d2c2', accent: '#6f6b63' }, // 낡은 회반죽+덧창
    mid: { base: '#BCAA9C', dark: '#9e8f83', light: '#cbb8a8', accent: '#675e56' }, // 벽돌+아치창
    hard: { base: '#ABA69E', dark: '#908b85', light: '#b9b3ab', accent: '#5e5b57' }, // 석조 성벽+총안
  },
  asia: {
    weak: { base: '#C6BCA8', dark: '#a69e8d', light: '#d6cbb5', accent: '#6d675c' }, // 대나무 골조+발
    mid: { base: '#B7A68F', dark: '#9a8b78', light: '#c6b39a', accent: '#655b4f' }, // 흙벽+격자창
    hard: { base: '#A29B8E', dark: '#888277', light: '#afa799', accent: '#59554e' }, // 사암 아치+돔 문양
  },
  eastasia: {
    weak: { base: '#CAC4B6', dark: '#aaa599', light: '#dad4c5', accent: '#6f6c64' }, // 낡은 목조+한지창
    mid: { base: '#AFA292', dark: '#93887b', light: '#bdaf9e', accent: '#605950' }, // 기와+단청 띠
    hard: { base: '#98928A', dark: '#807b74', light: '#a49e95', accent: '#54504c' }, // 석탑 기단
  },
  modern: {
    weak: { base: '#C0BEB8', dark: '#a1a09b', light: '#cfcdc7', accent: '#6a6965' }, // 조립 패널+녹 줄눈
    mid: { base: '#AEB0B2', dark: '#929496', light: '#bcbec0', accent: '#606162' }, // 유리 커튼월 격자
    hard: { base: '#989A9D', dark: '#808184', light: '#a4a6aa', accent: '#545556' }, // 강철 리벳+대각 보강재
  },
};

// office/cathedral/lobby/penthouse는 modern 계열 먼지톤(약→중→강)에 각각 맞춰 동일 배율로 도출.
// butter만 원래대로 유지(게임 내 유일한 채도 높은 색 — 사용자 지시).
// penthouse는 톤 다운하되 최상층 표식인 금색 포인트(light/accent)는 원래 값 유지.
const SPECIAL_COLORS: Record<Exclude<Material, Tier>, TierColors> = {
  butter: { base: PALETTE.YELLOW, dark: '#C79E00', light: '#FFF07A', accent: '#E8E8E8' },
  cathedral: { base: '#AEB0B2', dark: '#929496', light: '#bcbec0', accent: '#606162' },
  lobby: { base: '#989A9D', dark: '#808184', light: '#a4a6aa', accent: '#545556' },
  office: { base: '#C0BEB8', dark: '#a1a09b', light: '#cfcdc7', accent: '#6a6965' },
  penthouse: { base: '#989A9D', dark: '#808184', light: '#1A1A20', accent: '#545556' },
};

function fillBase(c: CanvasRenderingContext2D, w: number, h: number, t: TierColors): void {
  c.fillStyle = t.base;
  c.fillRect(0, 0, w, h);
  c.fillStyle = t.dark;
  c.fillRect(0, h - 3, w, 3);          // 바닥 그림자 — 층이 쌓인 깊이 단서
  // 얇은 외곽선 1px. stroke 대신 fillRect 4변 — 타일은 오프스크린 캔버스라 반픽셀 번짐을 피한다.
  c.fillStyle = TILE_EDGE;
  c.fillRect(0, 0, w, 1);
  c.fillRect(0, h - 1, w, 1);
  c.fillRect(0, 0, 1, h);
  c.fillRect(w - 1, 0, 1, h);
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
      c.fillStyle = t.accent; // 유리 커튼월 — 밝은 배경에서 창문으로 읽히려면 어두워야 함
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
    c.fillRect(0, h - 4, w, 2); // 잉크 트림선
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

function drawTileInstance(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  mat: Material, theme: Theme, seg: FloorSeg, imageKey = floorMaterialKey(mat, theme)
): void {
  const materialKey = floorMaterialKey(mat, theme);
  const cv = floorSheetTile(imageKey) ?? floorSheetTile(materialKey) ?? tileCache!.get(materialKey);
  if (cv) {
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(cv, x, y, w, h);
    ctx.imageSmoothingEnabled = smooth;
  }
  drawCrackOverlay(ctx, x, y, w, h, seg.hp, seg.maxHp);
}

// ══════════════════════════════════════════════════════════════
// 플레이어 "뿌뿌" — 졸라맨 라인아트. 얼굴 없음(빈 원 머리), 선+원 조합만 사용.
// 원작(대불·사무라이) 도상 금지 — 순수 창작 도안.
// ══════════════════════════════════════════════════════════════
/** ax/ay = 캔버스 안 발 기준점(논리 px), hx/hy = 기준점에서 본 머리 중심(안전모 자리). */
interface PFrame { cv: HTMLCanvasElement; ax: number; ay: number; hx: number; hy: number; }

// 졸라맨 프레임만 2배로 굽고 절반으로 찍는다 — 칼 아닌 무기는 늘 프로시저럴이라 계단이 보인다.
const SS = 2;
// 쇠머리·갈고리·원판·참격 호가 캔버스 끝에서 잘리지 않게 사방 여백(논리 px).
const PAD = 6;

function mkFrame(w: number, h: number): { cv: HTMLCanvasElement; c: CanvasRenderingContext2D } {
  const r = mkCanvas((w + PAD * 2) * SS, (h + PAD * 2) * SS);
  r.c.scale(SS, SS);
  r.c.translate(PAD, PAD);
  return r;
}

function pframe(cv: HTMLCanvasElement, ax: number, ay: number, headX: number, headY: number): PFrame {
  return { cv, ax: ax + PAD, ay: ay + PAD, hx: headX - ax, hy: headY - ay };
}
type PlayerFrameKey =
  | 'idle' | 'jump' | 'attack0' | 'attack1' | 'attack2'
  | 'guardG' | 'guardA' | 'guardBreak' | 'special' | 'pinned' | 'dead';

const STAND_W = 44, STAND_H = 60;
const CX = 22;

const WIDE_W = 64, WIDE_H = 60;
const WCX = 22;

const FLAT_W = 48, FLAT_H = 28;

// 신체 랜드마크 (STAND/WIDE 공통, CX=WCX=22 기준)
const HEAD_R = 6;
const HEAD_Y = 12;       // 머리 중심
const SHOULDER_Y = 23;   // 팔이 갈라지는 지점
const HIP_Y = 38;        // 다리가 갈라지는 지점
const FOOT_Y = 60;       // 바닥선 (= STAND_H = WIDE_H, 기존 프레임 발 높이와 동일)

// 08-30(P1-3): 코스메틱 실구현 — 상점이 파는 body(선 색)·blade(참격 색)가 실제 렌더를 바꾼다.
let LINE = '#1A1A20';   // body 코스메틱
const LINE_W = 2;
let ARC = '#FFD200';    // blade 코스메틱 (참격 궤적)

const DEFAULT_LINE = '#1A1A20';
const DEFAULT_ARC = '#FFD200';
/** 비기본 코스메틱 장착 여부 — true면 PNG 시트 대신 프로시저럴을 그린다(아래 drawPlayer) */
let cosmeticsActive = false;

/** 장착 코스메틱 적용 — 스틱맨 프레임 캐시를 무효화해 다음 드로우에 재빌드 */
export function setPlayerCosmetics(bodyColor: string, bladeColor: string): void {
  if (LINE === bodyColor && ARC === bladeColor) return;
  LINE = bodyColor;
  ARC = bladeColor;
  cosmeticsActive = bodyColor !== DEFAULT_LINE || bladeColor !== DEFAULT_ARC;
  playerFrames = null;
}

let playerWeapon: WeaponId = 'sword';
const IRON = '#948E82';      // 오함마 쇠머리
const DISC = '#E2DED3';      // 그라인더 원판
const HAT_WHITE = '#FFFFFF'; // 안전모 — 아이보리보다 밝게

/** 장착 무기 — 렌더러가 매 프레임 s.weapon을 넘긴다. 바뀔 때만 프레임을 다시 굽는다. */
export function setPlayerWeapon(w: WeaponId): void {
  if (playerWeapon === w) return;
  playerWeapon = w;
  playerFrames = null;
}

/** PNG 시트 키. 'player'는 기본 룩 + 철거칼 전용, 다른 무기는 'player-<무기>'(없으면 프로시저럴). */
function playerPngKey(): string | null {
  if (cosmeticsActive) return null;
  const key = playerWeapon === 'sword' ? 'player' : `player-${playerWeapon}`;
  return hasAsset(key) ? key : null;
}

function playerBob(pose: PlayerPose, animTick: number): number {
  return pose === 'idle' && Math.floor(animTick / 20) % 2 === 1 ? -1 : 0; // 2f 숨쉬기
}

// player.png 머리 중심 — 발 기준점(셀 가로 중앙·바닥) 대비 [dx, dy]. PLAYER_SHEET 순서.
// 10-25 알파 실측(46×60 셀). pinned·dead는 눕거나 납작해 안전모를 그리지 않는다(null).
const SHEET_HEAD: ReadonlyArray<readonly [number, number] | null> = [
  [-1, -35], [13, -34.5], [-11.5, -30], [-2.5, -20.5], [0, -21.5],
  [4, -33.5], [-3, -31.5], [-3, -32], [4, -22], null, null,
];
const SHEET_HEAD_R = 5;

function hardHat(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const R = r + 1;
  const base = cy - r * 0.2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, base, R, Math.PI, 0);          // 반구 돔
  ctx.lineTo(cx + R + 3.5, base + 0.5);      // 앞챙
  ctx.lineTo(cx + R + 3.5, base + 2);
  ctx.lineTo(cx - R - 0.5, base + 2);
  ctx.closePath();
  ctx.fillStyle = HAT_WHITE;
  ctx.fill();
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

/** 안전모 — 렌더러가 s.hat일 때 drawPlayer 직후 같은 인자로 부른다. 머리 위치는 drawPlayer와 같은 프레임에서 읽는다. */
export function drawHat(
  ctx: CanvasRenderingContext2D,
  pose: PlayerPose,
  animTick: number,
  x: number,
  footCanvasY: number,
): void {
  if (pose === 'pinned' || pose === 'dead') return;
  initSprites();
  const footY = footCanvasY + playerBob(pose, animTick);
  if (playerPngKey()) {
    const h = SHEET_HEAD[playerSheetFrame(pose, animTick)];
    if (h) hardHat(ctx, x + h[0], footY + h[1], SHEET_HEAD_R);
    return;
  }
  const f = pickPlayerFrame(pose, animTick);
  hardHat(ctx, x + f.hx, footY + f.hy, HEAD_R);
}

/** pts를 순서대로 잇는 폴리라인 획. 관절 굽힘은 점 3개 이상으로 표현. */
function stroke(c: CanvasRenderingContext2D, pts: [number, number][]): void {
  if (pts.length < 2) return;
  c.strokeStyle = LINE;
  c.lineWidth = LINE_W;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.stroke();
}

/** 윤곽선 원. fill이 주어지면 채우고 나서 윤곽선을 그린다. */
function circle(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill?: string): void {
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  c.strokeStyle = LINE;
  c.lineWidth = LINE_W;
  c.stroke();
}

/** 무기: 손(hx,hy)과 방향(→tx,ty)은 포즈 그대로, 길이·머리 모양만 장착 무기별로 바꾼다. */
function weapon(c: CanvasRenderingContext2D, hx: number, hy: number, tx: number, ty: number): void {
  const L = Math.hypot(tx - hx, ty - hy) || 1;
  const ux = (tx - hx) / L, uy = (ty - hy) / L;
  const nx = -uy, ny = ux;
  const at = (k: number, side = 0): [number, number] => [hx + ux * L * k + nx * side, hy + uy * L * k + ny * side];
  switch (playerWeapon) {
    case 'hammer': {
      // 오함마: 자루 끝에 가로로 긴 쇠머리(T자). 뭉툭한 네모는 가방으로 읽힌다(10-25 캡처).
      const [ex, ey] = at(1);
      stroke(c, [[hx, hy], [ex, ey]]);
      c.save();
      c.translate(ex, ey);
      c.rotate(Math.atan2(uy, ux));
      c.fillStyle = IRON;
      c.fillRect(-2.5, -7.5, 6, 15);
      c.strokeStyle = LINE;
      c.lineWidth = LINE_W;
      c.lineJoin = 'round';
      c.strokeRect(-2.5, -7.5, 6, 15);
      c.restore();
      break;
    }
    case 'crowbar': {
      // 빠루: 칼의 1.28배 막대(손 뒤로 조금 남김) + 앞끝 갈고리
      const [bx, by] = at(-0.14);
      const [fx, fy] = at(1.14);
      stroke(c, [[bx, by], [fx, fy]]);
      c.beginPath();
      c.moveTo(fx, fy);
      c.quadraticCurveTo(fx + ux * 4, fy + uy * 4, fx + ux * 2 + nx * 5, fy + uy * 2 + ny * 5);
      c.stroke();
      circle(c, hx, hy, 1.5);
      break;
    }
    case 'grinder': {
      // 그라인더: 굵은 짧은 몸통 + 옆 손잡이 + 끝 원판
      const [ex, ey] = at(0.5);
      stroke(c, [at(0.18), at(0.18, -5)]);
      c.lineWidth = 4.5;
      c.beginPath();
      c.moveTo(hx, hy);
      c.lineTo(ex, ey);
      c.stroke();
      circle(c, ex + ux * 2, ey + uy * 2, 4.5, DISC);
      c.fillStyle = LINE;
      c.beginPath();
      c.arc(ex + ux * 2, ey + uy * 2, 1.2, 0, Math.PI * 2);
      c.fill();
      break;
    }
    default:
      stroke(c, [[hx, hy], [tx, ty]]);
      circle(c, hx, hy, 1.5);
  }
}

/** attack 타격 프레임의 참격 호 — 무기별 모양, 호는 하나. */
function slashArc(c: CanvasRenderingContext2D): void {
  c.strokeStyle = ARC;
  c.lineCap = 'round';
  c.beginPath();
  switch (playerWeapon) {
    case 'hammer':   // 짧고 굵게
      c.lineWidth = 5.5;
      c.moveTo(WCX + 31, 50);
      c.quadraticCurveTo(WCX + 36, 38, WCX + 28, 28);
      break;
    case 'crowbar':  // 위로 더 길게
      c.lineWidth = 3;
      c.moveTo(WCX + 31, 52);
      c.quadraticCurveTo(WCX + 42, 20, WCX + 14, -4);
      break;
    case 'grinder':  // 원판에서 시작
      c.lineWidth = 3;
      c.moveTo(WCX + 29, 40);
      c.quadraticCurveTo(WCX + 34, 22, WCX + 18, 10);
      break;
    default:         // 칼끝에서 시작해 위로 휘어지는 호
      c.lineWidth = 3;
      c.moveTo(WCX + 30, 50);
      c.quadraticCurveTo(WCX + 34, 26, WCX + 18, 10);
  }
  c.stroke();
  if (playerWeapon === 'grinder') {
    // 원판에서 튀는 불꽃 틱 3개
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(WCX + 31, 46); c.lineTo(WCX + 35, 48);
    c.moveTo(WCX + 31, 43); c.lineTo(WCX + 36, 42);
    c.moveTo(WCX + 29, 49); c.lineTo(WCX + 32, 52);
    c.stroke();
  }
}

function buildIdle(): PFrame {
  const { cv, c } = mkFrame(STAND_W, STAND_H);
  circle(c, CX, HEAD_Y, HEAD_R);
  stroke(c, [[CX, HEAD_Y + HEAD_R], [CX, HIP_Y]]);              // 목~골반
  stroke(c, [[CX, HIP_Y], [CX - 7, FOOT_Y]]);                   // 왼다리
  stroke(c, [[CX, HIP_Y], [CX + 7, FOOT_Y]]);                   // 오른다리(살짝 벌림)
  stroke(c, [[CX, SHOULDER_Y], [CX - 9, 34]]);                  // 왼팔 — 자연스럽게 늘어짐
  stroke(c, [[CX, SHOULDER_Y], [CX + 9, 30]]);                  // 오른팔 — 칼을 다리 바깥쪽으로
  weapon(c, CX + 9, 30, CX + 13, 55);
  return pframe(cv, CX, FOOT_Y, CX, HEAD_Y);
}

function buildJump(): PFrame {
  const { cv, c } = mkFrame(STAND_W, STAND_H);
  circle(c, CX, HEAD_Y - 1, HEAD_R);
  stroke(c, [[CX, HEAD_Y - 1 + HEAD_R], [CX, HIP_Y - 2]]);
  stroke(c, [[CX, HIP_Y - 2], [CX - 9, HIP_Y + 2], [CX - 7, 50]]); // 무릎을 몸쪽으로 접음
  stroke(c, [[CX, HIP_Y - 2], [CX + 8, HIP_Y + 4], [CX + 10, 52]]);
  stroke(c, [[CX, SHOULDER_Y - 1], [CX - 10, 30]]);
  stroke(c, [[CX, SHOULDER_Y - 1], [CX + 9, 30]]);
  weapon(c, CX + 9, 30, CX + 16, 44);                              // 칼은 뒤로 흘림
  return pframe(cv, CX, FOOT_Y, CX, HEAD_Y - 1);
}

function buildAttack(stage: 0 | 1 | 2): PFrame {
  const { cv, c } = mkFrame(WIDE_W, WIDE_H);
  let head: [number, number]; // 안전모 자리 — 각 분기 circle()과 같은 값
  if (stage === 0) {
    // 예열 — 몸을 뒤로 살짝 젖히고 칼을 머리 위로. 궤적 없음.
    circle(c, WCX - 3, HEAD_Y - 3, HEAD_R);
    stroke(c, [[WCX - 3, HEAD_Y - 3 + HEAD_R], [WCX, HIP_Y]]);
    stroke(c, [[WCX, HIP_Y], [WCX - 7, FOOT_Y]]);
    stroke(c, [[WCX, HIP_Y], [WCX + 7, FOOT_Y]]);
    stroke(c, [[WCX, SHOULDER_Y], [WCX - 9, 32]]);
    stroke(c, [[WCX, SHOULDER_Y], [WCX + 7, 9]]);
    weapon(c, WCX + 7, 9, WCX + 11, 1);
    head = [WCX - 3, HEAD_Y - 3];
  } else if (stage === 1) {
    // 타격 — 깊은 런지, 앞무릎 굽힘·뒷다리 뻗음, 칼이 아래로. 여기에만 참격 궤적.
    circle(c, WCX + 14, HEAD_Y + 1, HEAD_R);
    stroke(c, [[WCX + 14, HEAD_Y + 1 + HEAD_R], [WCX + 6, HIP_Y]]);
    stroke(c, [[WCX + 6, HIP_Y], [WCX + 16, 48], [WCX + 20, FOOT_Y]]); // 앞다리(굽힘)
    stroke(c, [[WCX + 6, HIP_Y], [WCX - 4, 50], [WCX - 14, 58]]);      // 뒷다리(뻗음)
    stroke(c, [[WCX + 10, SHOULDER_Y], [WCX - 2, 18]]);                // 반대팔(균형)
    stroke(c, [[WCX + 10, SHOULDER_Y], [WCX + 22, 34]]);               // 칼 든 팔
    weapon(c, WCX + 22, 34, WCX + 30, 50);
    slashArc(c);
    head = [WCX + 14, HEAD_Y + 1];
  } else {
    // 여운 — 런지 유지, 칼이 끝까지 내려간 상태. 궤적 없음.
    circle(c, WCX + 14, HEAD_Y + 3, HEAD_R);
    stroke(c, [[WCX + 14, HEAD_Y + 3 + HEAD_R], [WCX + 6, HIP_Y]]);
    stroke(c, [[WCX + 6, HIP_Y], [WCX + 16, 48], [WCX + 20, FOOT_Y]]);
    stroke(c, [[WCX + 6, HIP_Y], [WCX - 4, 50], [WCX - 14, 58]]);
    stroke(c, [[WCX + 10, SHOULDER_Y], [WCX - 4, 20]]);
    stroke(c, [[WCX + 10, SHOULDER_Y], [WCX + 16, 44]]);
    weapon(c, WCX + 16, 44, WCX + 10, 58);
    head = [WCX + 14, HEAD_Y + 3];
  }
  return pframe(cv, WCX, FOOT_Y, head[0], head[1]);
}

function buildGuard(air: boolean): PFrame {
  const { cv, c } = mkFrame(STAND_W, STAND_H);
  const hip = air ? HIP_Y - 4 : HIP_Y - 2;
  const legEndY = air ? 48 : FOOT_Y;                 // 공중가드는 발이 지면에서 떨어짐
  const spreadIn = air ? 6 : 9, spreadOut = air ? 11 : 9; // 공중가드는 무릎이 더 접혀 실루엣이 다름
  circle(c, CX, HEAD_Y, HEAD_R);
  stroke(c, [[CX, HEAD_Y + HEAD_R], [CX, hip]]);
  stroke(c, [[CX, hip], [CX - spreadIn, legEndY]]);  // 다리 — 반드시 선 2개로만(면 채우기 금지)
  stroke(c, [[CX, hip], [CX + spreadOut, legEndY]]);
  if (air) {
    stroke(c, [[CX, SHOULDER_Y - 1], [CX - 10, HEAD_Y + 2]]);
    stroke(c, [[CX, SHOULDER_Y - 1], [CX + 10, HEAD_Y + 2]]);
    stroke(c, [[CX - 14, HEAD_Y - 2], [CX, HEAD_Y - 2]]);
    weapon(c, CX, HEAD_Y - 2, CX + 14, HEAD_Y - 2);
  } else {
    // 지면가드: 팔이 머리 원을 관통하지 않게 바깥으로 벌리고 칼은 머리 위
    stroke(c, [[CX, SHOULDER_Y - 1], [CX - 16, HEAD_Y + 2], [CX - 14, 4]]);
    stroke(c, [[CX, SHOULDER_Y - 1], [CX + 16, HEAD_Y + 2], [CX + 14, 4]]);
    weapon(c, CX - 10, 3, CX + 16, 3);
  }
  return pframe(cv, CX, FOOT_Y, CX, HEAD_Y);
}

function buildGuardBreak(): PFrame {
  const { cv, c } = mkFrame(STAND_W, STAND_H);
  circle(c, CX - 6, HEAD_Y + 3, HEAD_R);                     // 뒤로 젖혀진 머리
  stroke(c, [[CX - 6, HEAD_Y + 3 + HEAD_R], [CX, HIP_Y]]);   // 몸이 뒤로 기울어짐
  stroke(c, [[CX, HIP_Y], [CX - 10, FOOT_Y - 2]]);
  stroke(c, [[CX, HIP_Y], [CX + 6, FOOT_Y]]);
  stroke(c, [[CX, SHOULDER_Y], [CX - 16, 18]]);              // 팔이 벌어짐
  stroke(c, [[CX, SHOULDER_Y], [CX + 14, 28]]);
  weapon(c, CX + 14, 28, CX + 22, 42);                       // 칼을 놓칠 듯 뒤로 젖혀짐
  return pframe(cv, CX, FOOT_Y, CX - 6, HEAD_Y + 3);
}

function buildSpecial(): PFrame {
  const { cv, c } = mkFrame(WIDE_W, WIDE_H);
  // 화면을 가르는 대각 참격 — 양손 칼, 깊은 런지 팔로우스루
  circle(c, WCX + 10, HEAD_Y + 5, HEAD_R);
  stroke(c, [[WCX + 10, HEAD_Y + 5 + HEAD_R], [WCX + 2, HIP_Y + 4]]);
  stroke(c, [[WCX + 2, HIP_Y + 4], [WCX + 14, 52], [WCX + 18, FOOT_Y]]); // 앞다리(굽힘)
  stroke(c, [[WCX + 2, HIP_Y + 4], [WCX - 8, 50], [WCX - 18, FOOT_Y - 4]]); // 뒷다리(뻗음)
  stroke(c, [[WCX + 6, SHOULDER_Y + 4], [WCX + 16, 38]]);               // 양손 칼자루
  stroke(c, [[WCX + 6, SHOULDER_Y + 4], [WCX + 20, 42]]);
  weapon(c, WCX + 20, 42, 58, 55);
  c.strokeStyle = ARC;
  c.lineWidth = 4;
  c.lineCap = 'round';
  c.globalAlpha = 0.35;
  c.beginPath();
  c.moveTo(6, 2);
  c.quadraticCurveTo(42, 8, 60, 48);
  c.stroke();
  c.globalAlpha = 1;
  c.beginPath();
  c.moveTo(2, 8);
  c.quadraticCurveTo(36, 18, 58, 55);
  c.stroke();
  return pframe(cv, WCX, FOOT_Y, WCX + 10, HEAD_Y + 5);
}

function buildPinned(): PFrame {
  const { cv, c } = mkFrame(FLAT_W, FLAT_H);
  const fy = FLAT_H - 4;
  circle(c, FLAT_W / 2, 8, 6);
  stroke(c, [[10, fy - 4], [FLAT_W - 10, fy - 4]]);          // 납작해진 몸통
  stroke(c, [[18, fy - 4], [4, fy - 10]]);                   // 팔다리가 좌우로 쫙 펴짐
  stroke(c, [[18, fy - 4], [6, fy]]);
  stroke(c, [[FLAT_W - 18, fy - 4], [FLAT_W - 4, fy - 10]]);
  stroke(c, [[FLAT_W - 18, fy - 4], [FLAT_W - 6, fy]]);
  return pframe(cv, FLAT_W / 2, fy + 4, FLAT_W / 2, 8);
}

function buildDead(): PFrame {
  const { cv, c } = mkFrame(FLAT_W, FLAT_H);
  const fy = FLAT_H - 6;
  circle(c, 10, fy - 6, 6);                                  // 머리가 한쪽으로 기울어짐
  stroke(c, [[14, fy - 4], [FLAT_W - 8, fy - 10]]);          // 등을 대고 벌렁 누움(대각) — pinned와 실루엣 차별화
  stroke(c, [[20, fy - 3], [16, fy + 2]]);                   // 팔다리가 힘없이 늘어짐(비대칭)
  stroke(c, [[FLAT_W - 12, fy - 8], [FLAT_W - 6, fy - 1]]);
  stroke(c, [[FLAT_W - 20, fy - 9], [FLAT_W - 22, fy - 18]]);
  return pframe(cv, FLAT_W / 2, fy + 4, 10, fy - 6);
}

let playerFrames: Record<PlayerFrameKey, PFrame> | null = null;

function rebuildPlayerFrames(): void {
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
}

function pickPlayerFrame(pose: PlayerPose, animTick: number): PFrame {
  if (!playerFrames) rebuildPlayerFrames(); // 코스메틱 변경 시 지연 재빌드
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
  c.strokeStyle = OUTLINE;
  c.lineWidth = 1;
  c.stroke();
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
  block(c, 7, 9, 3, 3, '#FFFFFF'); // 눈 (코믹 암석)
  block(c, 14, 9, 3, 3, '#FFFFFF');
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
  c.strokeStyle = OUTLINE;
  c.lineWidth = 1;
  c.stroke();
  c.fillRect(0, 4, 8, 2); // 꼬리
  return cv;
}

function buildRabbitIcon(): HTMLCanvasElement {
  const { cv, c } = mkCanvas(28, 20);
  block(c, 6, 8, 16, 8, '#8a8f94'); // 정찰 드론 몸통
  c.strokeStyle = '#5a5f64';
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
    if (!drawAsset(ctx, entityAssetKey('boltCue'), x, 26)) {
      ctx.drawImage(entityCache!.get('boltCue')!, x - 6, 20); // 예고: ⚡만 표시
    }
    return;
  }
  const y = groundY - e.y;
  if (!drawAsset(ctx, entityAssetKey('bolt'), x, y)) {
    ctx.drawImage(entityCache!.get('bolt')!, x - 6, y - 20);
  }
}

function drawRockEntity(ctx: CanvasRenderingContext2D, e: Rock, groundY: number): void {
  const x = VIEW.LANE_X[e.lane];
  const y = groundY - e.y;
  if (!drawAsset(ctx, entityAssetKey('rock'), x, y - 10)) {
    ctx.drawImage(entityCache!.get('rock')!, x - 12, y - 20, 24, 20);
  }
}

function drawShotEntity(ctx: CanvasRenderingContext2D, e: Shot, groundY: number): void {
  const y = groundY - e.y;
  const pngKey = entityAssetKey(e.cancellable ? 'shotOk' : 'shotNo');
  if (!drawAsset(ctx, pngKey, e.x, y)) {
    const key = e.cancellable ? 'shotOk' : 'shotCancel';
    ctx.drawImage(entityCache!.get(key)!, e.x - 8, y - 5);
  }
}

function drawRabbitEntity(ctx: CanvasRenderingContext2D, e: Rabbit, groundY: number): void {
  const cv = entityCache!.get('rabbit')!;
  const y = groundY - e.y - 10;
  const cy = y + 10;
  ctx.save();
  if (e.side === -1) {
    ctx.translate(e.x, 0);
    ctx.scale(-1, 1);
    if (!drawAsset(ctx, entityAssetKey('rabbit'), 0, cy)) ctx.drawImage(cv, -14, y);
  } else if (!drawAsset(ctx, entityAssetKey('rabbit'), e.x, cy)) {
    ctx.drawImage(cv, e.x - 14, y);
  }
  ctx.restore();
}

function drawCannonEntity(ctx: CanvasRenderingContext2D, e: Cannon, _groundY: number): void {
  // 대포는 좌/중/우로 벌려 설치된다 — 레인이 아니라 e.x가 실제 위치(수직탄·스파크 발생점)
  if (!drawAsset(ctx, entityAssetKey('cannon'), e.x, 20)) {
    ctx.drawImage(entityCache!.get('cannon')!, e.x - 12, 6); // 화면 상단 고정(지면 변환 무관)
  }
}

// ══════════════════════════════════════════════════════════════
// 캐시 & 초기화
// ══════════════════════════════════════════════════════════════
let initialized = false;
let tileCache: Map<string, HTMLCanvasElement> | null = null;
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

  rebuildPlayerFrames();

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
  const footY = footCanvasY + playerBob(pose, animTick);
  // ★코스메틱 방침(08-30 검증 P1): PNG 시트는 기본 룩 전용 — 비기본 body/blade 장착 시
  // 프로시저럴이 이긴다. 안 그러면 Wave 3 PNG 투입 순간 팔리는 코스메틱이 무음 사망.
  // (PNG 틴트 패스·색상별 시트는 ROADMAP Wave 3 후속 검토.)
  // 무기: 'player' 시트는 칼 든 그림이라 철거칼일 때만. 다른 무기는 'player-<무기>' 시트가 있으면 그것.
  const key = playerPngKey();
  ctx.save();
  if (facing === -1) {
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    x = 0;
  }
  if (!key || !drawAsset(ctx, key, x, footY, playerSheetFrame(pose, animTick))) {
    const frame = pickPlayerFrame(pose, animTick);
    ctx.imageSmoothingEnabled = true; // 2배 프레임을 절반으로 — 이 save 안에서만
    ctx.drawImage(frame.cv, x - frame.ax, footY - frame.ay, frame.cv.width / SS, frame.cv.height / SS);
  }
  ctx.restore();
}

/** groundY = 캔버스상 지면 y. floors[0]=최하층이 stack.y(물리, 지면0·위+)에서 시작해 위로 쌓임.
 *  단일 레인이라 층은 세그먼트 1개 — 일반 variant는 건물 폭(LANE_W=270) 중앙 정렬,
 *  butterbar는 좁은 폭(BUTTER_W=90)으로 같은 자리에 그린다. */
export function drawStack(ctx: CanvasRenderingContext2D, stack: FallingStack, groundY: number,
  gimmick: GimmickId = 'none'): void {
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
  for (const [index, floor] of stack.floors.entries()) {
    const floorTopY = bottomY - cumH - floor.h;
    const key = floorImageKey(floor.mat, stack.theme, index, stack.floors.length, gimmick);
    drawTileInstance(ctx, baseX, floorTopY, totalW, floor.h, floor.mat, stack.theme, floor.segs[0], key);
    // 지붕/입구/기믹도 인접한 원래 층의 내구도를 짧은 잉크 눈금으로 보여준다.
    if (key !== floorMaterialKey(floor.mat, stack.theme)) {
      ctx.fillStyle = PALETTE.INK;
      for (let hp = 0; hp < Math.min(3, floor.segs[0].hp); hp++)
        ctx.fillRect(baseX + 8 + hp * 5, floorTopY + floor.h - 6, 2, 3);
    }
    cumH += floor.h;
  }
  ctx.restore();
}

export function drawBoss(ctx: CanvasRenderingContext2D, boss: BossState, groundY: number): void {
  drawExecutor(ctx, boss, groundY);
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
    const ox = cx + (i % 2 === 0 ? -4 : 4);
    if (!drawAsset(ctx, entityAssetKey('rock'), ox, y - h / 2)) {
      ctx.drawImage(cv, ox - w / 2, y - h, w, h);
    }
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
