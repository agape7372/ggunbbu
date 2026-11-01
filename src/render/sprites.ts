// 건뿌 — PNG 스프라이트 그리기와 프로시저럴 폴백.
// 오프스크린 캔버스에 최초 1회 사전 렌더 후 drawImage로 복사(성능).
// 동적 요소(크랙 오버레이, 보스 렌즈 점멸)만 실시간 재계산.
// 원작(대불·달토끼·사무라이) 도상 금지 — 순수 창작 도안.

import type {
  PlayerPose, FallingStack, BossState, Entity, Theme, Material, GimmickId,
  FloorSeg, Bolt, Rock, Shot, Rabbit, Cannon, WeaponId, GreatswordId,
} from '../core/types';
import { VIEW, PALETTE, PLAYER, ACT2, STACK, BOSS, MASK_DRAW, SLASH_INK, WEAPON_INK } from '../config';
import { PRESS, brushPath } from './ink';
import { drawAsset, drawAssetHalo, hasAsset } from './assets';
import { drawHalo, haloFor } from './halo';
import { drawExecutor } from './executor';
import { floorImageKey, floorMaterialKey } from './floorSheets';
import { floorSheetTile } from './floorSheetCache';
import { entityAssetKey, playerSheetFrame } from './frames';
import { drawMaskAt } from './maskArt';
import { SWORD_HOLD, parseShape } from './swordShapes';
import { isMaskArt, maskIsBlank } from '../meta/mask';

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
  // 작업 지시서 종탑의 종 — 청동 먹색. 안 베이는 쇠라는 걸 색이 먼저 말한다
  bell: { base: '#8A6F3E', dark: '#6B5530', light: '#A88A52', accent: '#3E3020' },
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

/** 층 그림 캔버스(PNG 조각 → 프로시저럴 폴백). 부서진 층의 조각이 그 층 무늬를 그대로 들고 날아가게 한다. */
export function floorTile(mat: Material, theme: Theme, index: number, count: number,
  gimmick: GimmickId = 'none'): HTMLCanvasElement | undefined {
  initSprites();
  const materialKey = floorMaterialKey(mat, theme);
  return floorSheetTile(floorImageKey(mat, theme, index, count, gimmick)) ?? floorSheetTile(materialKey)
    ?? tileCache!.get(materialKey);
}

// ══════════════════════════════════════════════════════════════
// 플레이어 "뿌뿌" — 졸라맨 라인아트. 얼굴 없음(빈 원 머리), 선+원 조합만 사용.
// 원작(대불·사무라이) 도상 금지 — 순수 창작 도안.
// ══════════════════════════════════════════════════════════════
/** ax/ay = 캔버스 안 발 기준점(논리 px), hx/hy = 기준점에서 본 머리 중심(안전모 자리). */
/** blade = 대검의 손 → 칼끝(발 기준). 칼 기운(bladeFx)이 칼날을 따라 피어난다 */
interface PFrame { cv: HTMLCanvasElement; ax: number; ay: number; hx: number; hy: number; blade: Seg | null; ss: number }
type Seg = readonly [number, number, number, number];
/** 지금 굽는 프레임에 그린 대검 — weapon()이 적고 pframe()이 가져간다 */
let bakedBlade: Seg | null = null;

// 졸라맨 프레임은 그리는 자리의 배율에 맞춰 굽는다. 판 캔버스는 기기 배율을 2로 묶어 늘 2배다.
// 홈 뿌뿌는 기기 배율 3 × 큰 그림이라 2배로 구운 걸 6배 넘게 늘려 흐렸다(10-31 사용자 캡처) → 최대 SS_MAX배로 따로 굽는다.
const SS_MIN = 2;
const SS_MAX = 6;
/** 지금 굽는 프레임의 배율 — pickPlayerFrame이 정하고 mkFrame · pframe이 읽는다 */
let bakeSS = SS_MIN;
/** 배율별 프레임 캐시 — 최근 두 배율만(판 2배 · 홈 큰 그림). 무기 · 색을 바꾸면 비운다 */
const frameCache = new Map<number, Partial<Record<PlayerFrameKey, PFrame>>>();
// 쇠머리·갈고리·원판·참격 호가 캔버스 끝에서 잘리지 않게 사방 여백(논리 px).
// 대검 참격 호가 가장 멀리 나간다 — 서리 얼음 조각이 넓은 프레임 오른쪽 +17, 위는 호 끝 −6
const PAD = 20;

function mkFrame(w: number, h: number): { cv: HTMLCanvasElement; c: CanvasRenderingContext2D } {
  const r = mkCanvas((w + PAD * 2) * bakeSS, (h + PAD * 2) * bakeSS);
  r.c.scale(bakeSS, bakeSS);
  r.c.translate(PAD, PAD);
  bakedBlade = null;
  return r;
}

function pframe(cv: HTMLCanvasElement, ax: number, ay: number, headX: number, headY: number): PFrame {
  const b = bakedBlade;
  const blade: Seg | null = b && [b[0] - ax, b[1] - ay, b[2] - ax, b[3] - ay];
  return { cv, ax: ax + PAD, ay: ay + PAD, hx: headX - ax, hy: headY - ay, blade, ss: bakeSS };
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
const HEAD_R = 5;         // PNG 머리와 같은 크기
const HEAD_Y = 12;       // 머리 중심
const SHOULDER_Y = 23;   // 팔이 갈라지는 지점
const HIP_Y = 38;        // 다리가 갈라지는 지점
const FOOT_Y = 60;       // 바닥선 (= STAND_H = WIDE_H, 기존 프레임 발 높이와 동일)

// 08-30(P1-3): 코스메틱 실구현 — 상점이 파는 body(선 색)·blade(참격 색)가 실제 렌더를 바꾼다.
let LINE = '#1A1A20';   // body 코스메틱
const LINE_W = 1.4;      // PNG 졸라맨 선(약 1.2px)에 맞춤 — 무기를 바꿔도 선 굵기가 같아야 한다
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
  frameCache.clear();
}

let playerWeapon: WeaponId = 'sword';
const HAT_WHITE = '#FFFFFF'; // 안전모 — 아이보리보다 밝게

/** 장착 무기 — 렌더러가 매 프레임 s.weapon을 넘긴다. 바뀔 때만 프레임을 다시 굽는다. */
export function setPlayerWeapon(w: WeaponId): void {
  if (playerWeapon === w) return;
  playerWeapon = w;
  frameCache.clear();
}

/** PNG 시트 키. 열두 무기 모두 상점과 같은 칼 그림(swordBody)으로 그려야 해서, 칼이 구워진 시트는 쓰지 않는다(SWORD_HOLD에 없는 무기만 시트가 이긴다). */
function playerPngKey(): string | null {
  if (cosmeticsActive || SWORD_HOLD[playerWeapon]) return null;
  const key = playerWeapon === 'sword' ? 'player' : `player-${playerWeapon}`;
  return hasAsset(key) ? key : null;
}

function playerBob(pose: PlayerPose, animTick: number): number {
  return pose === 'idle' && Math.floor(animTick / 20) % 2 === 1 ? -1 : 0; // 2f 숨쉬기
}

// player.png 머리 중심 — 발 기준점(셀 가로 중앙·바닥) 대비 [dx, dy]. PLAYER_SHEET 순서.
// 2배 시트(칸 72×76 논리 px)의 머리 고리를 알파에서 찾아 실측. pinned·dead는 눕거나 납작해 안전모를 그리지 않는다(null).
export const SHEET_HEAD: ReadonlyArray<readonly [number, number] | null> = [
  [-0.5, -50.3], [19, -47.8], [-6, -43.5], [-2.5, -29.3], [0, -29.3],
  [-2.5, -47.8], [-2.5, -45], [-4, -45.5], [6.5, -30.8], null, null,
];
export const SHEET_HEAD_R = 5; // 실측 머리 반지름 4.8~5.3
/** 납작한 칸(pinned 9·dead 10) 머리 중심 — 안전모는 안 씌우지만 마스크는 눌린 채 붙는다. SHEET_HEAD와 같은 방법으로 실측 */
const SHEET_FLAT_HEAD: Readonly<Record<number, readonly [number, number]>> = { 9: [3, -12], 10: [-19, -25.5] };

/** 쓰고 있는 마스크 그림 — applyCosmetics가 정한다. null = 없음 */
let playerMask: string | null = null;

/** 장착 마스크. 빈 그림·깨진 값은 안 쓴 것으로 친다 */
export function setPlayerMask(art: string | null): void {
  playerMask = art && isMaskArt(art) && !maskIsBlank(art) ? art : null;
}

/** 머리 중심(발 기준, 숨쉬기 전) — 안전모·마스크가 drawPlayer와 같은 프레임에서 읽는다. 시트에 머리 자리가 없으면 null */
export function playerHead(pose: PlayerPose, animTick: number): readonly [number, number] | null {
  initSprites();
  if (playerPngKey()) {
    const i = playerSheetFrame(pose, animTick);
    return SHEET_HEAD[i] ?? SHEET_FLAT_HEAD[i] ?? null;
  }
  const f = pickPlayerFrame(pose, animTick);
  return [f.hx, f.hy];
}

/** 흰 안전모 한 개 — 머리 위(drawHat)와 받기 연출(렌더러 hatFx)이 같은 그림을 쓴다. r = 머리 반지름 */
export function hardHat(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const R = r + 0.8;
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
  ctx.lineWidth = 1.2; // PNG 졸라맨 선과 같다
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

/** 안전모가 앉는 자리 [cx, cy, r] — drawHat과 받기 연출이 같이 쓴다. 깔림 · 사망은 null.
 *  마스크를 쓰면 마스크 위에 — 마스크 폭만큼 키워 윗단만 덮는다 */
export function hatSpot(pose: PlayerPose, animTick: number, x: number, footCanvasY: number): [number, number, number] | null {
  if (pose === 'pinned' || pose === 'dead') return null;
  const h = playerHead(pose, animTick);
  if (!h) return null;
  const cx = x + h[0];
  const cy = footCanvasY + playerBob(pose, animTick) + h[1];
  return playerMask
    ? [cx, cy - MASK_DRAW.LIFT - MASK_DRAW.HAT_UP, MASK_DRAW.SIZE / 2 + 1]
    : [cx, cy, playerPngKey() ? SHEET_HEAD_R : HEAD_R];
}

/** 안전모 — 렌더러가 s.hat일 때 drawPlayer 직후 같은 인자로 부른다. 머리 위치는 drawPlayer와 같은 프레임에서 읽는다 */
export function drawHat(
  ctx: CanvasRenderingContext2D,
  pose: PlayerPose,
  animTick: number,
  x: number,
  footCanvasY: number,
): void {
  const at = hatSpot(pose, animTick, x, footCanvasY);
  if (at) hardHat(ctx, at[0], at[1], at[2]);
}

/** 마스크 — 렌더러가 drawPlayer 직후·drawHat 직전에 같은 인자로 부른다. art를 넘기면 그 그림(상점·도트판 미리보기).
 *  깔림·사망은 납작한 프레임의 머리 자리에 세로로 눌러 붙인다 — 모자처럼 사라지면 벗겨진 것처럼 보인다 */
export function drawMask(
  ctx: CanvasRenderingContext2D,
  pose: PlayerPose,
  animTick: number,
  x: number,
  footCanvasY: number,
  art: string | null = playerMask,
): void {
  if (!art) return;
  const h = playerHead(pose, animTick);
  if (!h) return;
  const flat = pose === 'pinned' || pose === 'dead';
  const cy = footCanvasY + playerBob(pose, animTick) + h[1] - (flat ? 0 : MASK_DRAW.LIFT);
  drawMaskAt(ctx, art, x + h[0], cy, MASK_DRAW.SIZE, flat ? MASK_DRAW.FLAT_SQUASH : 1);
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

// ── 대검 ─────────────────────────────────────────────────────
// 종마다 칼날 모양·색만 다르고 쥐는 자세는 하나(포즈마다 weapon()의 great 좌표). 칼은 졸라맨 키의 절반을 넘는다 —
// 가는 선 졸라맨이 굵은 칼날을 든 대비가 대검의 맛. 테두리는 몸 색(LINE)이 아니라 잉크: 칼은 따로 선 물건이다.
type GreatShape = 'plain' | 'saw' | 'stripe' | 'beam' | 'wave' | 'crystal' | 'jag' | 'royal';
export interface GreatLook {
  shape: GreatShape;
  blade: string;  // 칼날
  hi: string;     // 날 위 빛줄
  guard: string;  // 코등이·자루 끝
  w: number;      // 칼날 반폭(논리 px)
  edge?: string;  // 붉은 날 선(흑철) · 보석(황금)
}
const GREAT_LOOK: Record<GreatswordId, GreatLook> = {
  iron: { shape: 'plain', blade: '#B9B4A8', hi: '#EFECE3', guard: '#5C574E', w: 2.7 },
  saw: { shape: 'saw', blade: '#98A3AB', hi: '#E3E9ED', guard: '#3E4549', w: 2.6 },
  hazard: { shape: 'stripe', blade: PALETTE.YELLOW, hi: '#FFF0A0', guard: PALETTE.INK, w: 3 },
  beam: { shape: 'beam', blade: '#C2552D', hi: '#EA9068', guard: '#5A2A18', w: 3.3 },
  flame: { shape: 'wave', blade: '#E0401E', hi: '#FFB46B', guard: '#3A1A12', w: 2.8 },
  frost: { shape: 'crystal', blade: '#BDE6F6', hi: '#FFFFFF', guard: '#3D6E8C', w: 2.9 },
  onyx: { shape: 'jag', blade: '#2E2D34', hi: '#625F6D', guard: PALETTE.INK, w: 3, edge: '#D2332C' },
  gold: { shape: 'royal', blade: '#E2B43A', hi: '#FFF1B8', guard: '#8A5A12', w: 3.2, edge: PALETTE.RED },
};

/** 대검이면 그 모양·색 — 베기 파편(effects)도 같은 색을 쓴다 */
export function greatLook(w: WeaponId): GreatLook | undefined {
  return (GREAT_LOOK as Partial<Record<WeaponId, GreatLook>>)[w];
}

/** 칼 몸 그림 한 조각 — 상점 실루엣(swordShapes)의 path를 Path2D로 풀어 둔 것 */
interface InkPart { path: Path2D; cls: string }
const swordParts = new Map<string, InkPart[]>();

/** 칼마다 한 번만 푼다(매 프레임 문자열 처리 없음). Path2D가 있는 브라우저에서만 부른다 */
function inkParts(id: string): InkPart[] {
  let p = swordParts.get(id);
  if (!p) {
    p = parseShape(id).map(({ cls, d }) => ({ cls, path: new Path2D(d) }));
    swordParts.set(id, p);
  }
  return p;
}

/** 칼 몸 — 상점 칼 그림(120×300 칸)을 손(hx,hy) → 칼끝(tx,ty)에 맞춰 돌리고 줄여 그린다.
 *  색은 상점과 같다: 먹 몸통 · 한지색 무늬 · 참격 노랑(= 칼빛 ARC). 칼은 따로 선 물건이라 몸 색(LINE)이 아니라 잉크 */
function swordBody(c: CanvasRenderingContext2D, id: string, hx: number, hy: number, tx: number, ty: number): void {
  const hold = SWORD_HOLD[id] ?? SWORD_HOLD.sword;
  const s = (Math.hypot(tx - hx, ty - hy) * hold.k) / (hold.handY - hold.tipY);
  c.save();
  c.translate(hx, hy);
  c.rotate(Math.atan2(ty - hy, tx - hx) + Math.PI / 2); // 칸의 위쪽(칼끝)이 손 → 칼끝 방향을 본다
  c.scale(s, s);
  c.translate(-60, -hold.handY);
  c.lineWidth = 3; // 한지색 고리(pr)의 테 굵기 — 상점 CSS와 같다
  for (const { path, cls } of inkParts(id)) {
    if (cls === 'pr') {
      c.strokeStyle = PALETTE.BG;
      c.stroke(path);
    } else {
      c.fillStyle = cls === 'p' ? PALETTE.BG : cls === 'y' ? ARC : PALETTE.INK;
      c.fill(path);
    }
  }
  c.restore();
}

/** 대검 하나만 — 상점 그림. 판 속 칼과 같은 그리기에 손·칼끝만 받는다. 대검이 아니면 false(반투명 기운은 11-01 먹 2판에서 뺐다 — 칼 기운은 bladeAura가 먹 획으로) */
export function drawGreatsword(c: CanvasRenderingContext2D, w: WeaponId, hx: number, hy: number, tx: number, ty: number): boolean {
  const g = greatLook(w);
  if (g) swordBody(c, w, hx, hy, tx, ty);
  return g !== undefined;
}

/** 무기: 손(hx,hy)과 방향(→tx,ty)은 포즈 그대로. 열두 무기 모두 상점과 같은 칼 그림(swordBody)을 길이에 맞춰 줄여 쥔다.
 *  great = 대검일 때의 [손x, 손y, 칼끝x, 칼끝y] — 칼이 길어 바닥·머리를 뚫지 않게 포즈마다 따로 잡는다 */
function weapon(
  c: CanvasRenderingContext2D, hx: number, hy: number, tx: number, ty: number,
  great?: readonly [number, number, number, number],
): void {
  const g = greatLook(playerWeapon);
  if (g) {
    const [gx, gy, gtx, gty] = great ?? [hx, hy, tx, ty];
    swordBody(c, playerWeapon, gx, gy, gtx, gty);
    bakedBlade = [gx, gy, gtx, gty];
    return;
  }
  swordBody(c, playerWeapon, hx, hy, tx, ty);
}

// ── 대검 참격 호 ─────────────────────────────────────────────
// 칼끝(발 +46,−4)에서 머리 위 뒤(+20,−66)까지 한 곡선 위에 칼마다 다른 띠를 그린다. t = 0이 칼끝 쪽(지금 칼이 있는 곳),
// 1이 휘두르기 시작한 쪽 — 칼끝 쪽이 두껍고 꼬리로 가늘어진다. 띠 몸통은 칼빛(ARC)이라 상점 칼빛이 대검에서도 산다.
const GA = [WCX + 46, 56, WCX + 62, 18, WCX + 20, -6] as const;

/** 호 위의 점 — 볼록한 바깥 쪽 법선으로 off만큼(음수면 몸 쪽) */
function arcAt(t: number, off: number): [number, number] {
  const [x0, y0, x1, y1, x2, y2] = GA;
  const u = 1 - t;
  const dx = u * (x1 - x0) + t * (x2 - x1);
  const dy = u * (y1 - y0) + t * (y2 - y1);
  const d = Math.hypot(dx, dy) || 1;
  return [u * u * x0 + 2 * u * t * x1 + t * t * x2 - (dy / d) * off, u * u * y0 + 2 * u * t * y1 + t * t * y2 + (dx / d) * off];
}

/** 참격 두께 0 → 1 → 0, 고점은 칼끝 쪽(t ≈ 0.33) */
const smear = (t: number): number => Math.sin(Math.PI * t ** 0.65);

/** 호를 따라 가는 선 — t0 → t1을 n칸으로 끊는다(cont = 앞 선에 이어 그림) */
function arcPath(c: CanvasRenderingContext2D, off: (t: number, i: number) => number, n = 24, t0 = 0, t1 = 1, cont = false): void {
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    const [x, y] = arcAt(t, off(t, i));
    if (i === 0 && !cont) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
}

/** 호를 따라 띠 — 바깥 두께 out, 몸 쪽 두께 inn. 칸이 적으면 각진다(서리) */
function arcBand(
  c: CanvasRenderingContext2D, out: (t: number, i: number) => number, inn: (t: number) => number, n = 24, t0 = 0, t1 = 1,
): void {
  c.beginPath();
  arcPath(c, out, n, t0, t1);
  arcPath(c, (t) => -inn(t), n, t1, t0, true);
  c.closePath();
}

/**
 * 대검 참격 호 — 먹 띠 + 그 칼의 포인트 색 속(config WEAPON_INK, 「먹 한 획」 2판 11-01).
 * 칼끝 쪽(t 0)이 두껍고, 휘두르기 시작한 꼬리(t → 1)는 붓털이 갈라진 비백으로 빠진다. 칼마다 붓 결만 다르다 —
 * 톱날은 갈래가 많은 거친 꼬리, 철골은 각진 띠, 서리는 일곱 마디로 꺾인 띠, 공사중은 노랑 속을 먹 빗금이 가른다.
 */
function greatArc(c: CanvasRenderingContext2D, g: GreatLook): void {
  const core = WEAPON_INK[playerWeapon as keyof typeof WEAPON_INK] ?? ARC;
  const band = (T: number, color: string, n = 24, t0 = 0, t1 = 0.86): void => {
    arcBand(c, (t) => T * 0.36 * smear(t), (t) => T * 0.64 * smear(t), n, t0, t1);
    c.fillStyle = color;
    c.fill();
  };
  /** 비백 꼬리 — 가는 갈래 k개가 t0부터 벌어지며 끝으로 뾰족해진다 */
  const bristles = (k: number, T: number, t0: number): void => {
    c.fillStyle = PALETTE.INK;
    for (let j = 0; j < k; j++) {
      const o = (j - (k - 1) / 2) * T * 0.34;
      const h = T * (0.16 + 0.06 * ((j * 7) % 3));
      const t1 = 1 - 0.04 * ((j * 5) % 4);
      const taper = (t: number): number => h * Math.max(0, 1 - (t - t0) / (t1 - t0)) ** 0.7;
      const spread = (t: number): number => o * (0.4 + 0.6 * (t - t0) / (1 - t0));
      arcBand(c, (t) => spread(t) + taper(t), (t) => taper(t) - spread(t), 12, t0, t1);
      c.fill();
    }
  };
  c.save();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  switch (g.shape) {
    case 'saw': // 거친 붓 — 갈래가 많고 일찍 갈라진다(톱질 자국)
      band(8, PALETTE.INK, 24, 0, 0.6);
      bristles(5, 8, 0.38);
      band(3, core, 24, 0.04, 0.4);
      break;
    case 'stripe': // 노랑 속을 먹 빗금이 가른다
      band(10, PALETTE.INK);
      bristles(3, 9, 0.62);
      band(5, core, 24, 0.04, 0.62);
      c.save();
      c.clip();
      c.fillStyle = PALETTE.INK;
      for (let k = -70; k < 90; k += 7) {
        c.beginPath();
        c.moveTo(k, -20);
        c.lineTo(k + 2.4, -20);
        c.lineTo(k + 82.4, 60);
        c.lineTo(k + 80, 60);
        c.closePath();
        c.fill();
      }
      c.restore();
      break;
    case 'beam': // 각진 띠 — 세 마디, 짧게 끊는다
      arcBand(c, () => 4.2, () => 4.2, 3, 0, 0.78);
      c.fillStyle = PALETTE.INK;
      c.fill();
      arcBand(c, () => 1.4, () => 1.4, 3, 0.04, 0.62);
      c.fillStyle = core;
      c.fill();
      break;
    case 'crystal': // 일곱 마디로 꺾인 띠
      band(8, PALETTE.INK, 7);
      bristles(3, 7, 0.66);
      band(3, core, 7, 0.04, 0.6);
      break;
    case 'jag': // 가장 짙고 넓은 먹, 바깥 날에만 자주 한 줄
      band(12, PALETTE.INK);
      bristles(4, 10, 0.6);
      c.beginPath();
      arcPath(c, (t) => 4 * smear(t), 24, 0.04, 0.6);
      c.strokeStyle = core;
      c.lineWidth = 1.5;
      c.stroke();
      break;
    case 'wave': // 먹 띠 + 바깥으로 말려 오르는 불 혀 셋
      band(8, PALETTE.INK);
      bristles(3, 7, 0.64);
      band(3, core, 24, 0.04, 0.55);
      c.fillStyle = PALETTE.INK;
      for (const t of [0.2, 0.38, 0.56]) {
        const s = smear(t);
        const [ax, ay] = arcAt(t - 0.04, 2.6 * s);
        const [bx, by] = arcAt(t + 0.07, 9 * s);
        const [cx, cy] = arcAt(t + 0.04, 2.6 * s);
        c.beginPath();
        c.moveTo(ax, ay);
        c.quadraticCurveTo(bx - 3, by + 3, bx, by);
        c.quadraticCurveTo(bx - 1, by + 4, cx, cy);
        c.closePath();
        c.fill();
      }
      break;
    case 'royal': // 금 속 + 먹 띠에 박힌 금박 셋(띠 밖에 떠 있으면 스티커로 읽힌다)
      band(9, PALETTE.INK);
      bristles(3, 8, 0.62);
      band(4, core, 24, 0.04, 0.6);
      for (const [t, r] of [[0.14, 2.6], [0.36, 2.1], [0.58, 1.7]] as const) {
        const [x, y] = arcAt(t, 4.5 * smear(t));
        c.beginPath();
        c.moveTo(x - r, y - r * 0.5);
        c.lineTo(x + r * 0.7, y - r);
        c.lineTo(x + r, y + r * 0.6);
        c.lineTo(x - r * 0.6, y + r * 0.8);
        c.closePath();
        c.fillStyle = core;
        c.fill();
      }
      break;
    default: // 무쇠 — 가장 넓은 붓, 군더더기 없음
      band(13, PALETTE.INK);
      bristles(4, 11, 0.6);
      band(4, core, 24, 0.04, 0.55);
  }
  c.restore();
}

/** attack 타격 프레임의 참격 호 — 무기별 모양, 호는 하나. */
function slashArc(c: CanvasRenderingContext2D): void {
  const g = greatLook(playerWeapon);
  if (g) {
    greatArc(c, g);
    return;
  }
  // 연장 — 휘두른 자리에서 댄 데가 굵고 끝이 빠지는 먹 한 획 + 앞쪽 획 속만 그 연장 포인트 색(먹 한 획 2판)
  const [x0, y0, qx, qy, x1, y1, w] = TOOL_ARC[playerWeapon as keyof typeof TOOL_ARC] ?? TOOL_ARC.sword;
  const pts: number[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const u = 1 - t;
    pts.push(WCX + u * u * x0 + 2 * u * t * qx + t * t * x1, u * u * y0 + 2 * u * t * qy + t * t * y1);
  }
  c.fillStyle = PALETTE.INK;
  brushPath(c, pts, w, 0, 1, 0.45, 7, PRESS.flick);
  c.fillStyle = playerWeapon === 'sword' ? SLASH_INK[ARC.toUpperCase()] ?? ARC : WEAPON_INK[playerWeapon as keyof typeof WEAPON_INK];
  brushPath(c, pts, w * 0.36, 0.04, 0.55, 0, 7, PRESS.flick);
}

/** 연장 참격 호 — [시작 x, y, 굽이 x, y, 끝 x, y](x는 WCX 기준) + 붓 굵기. 오함마 짧고 굵게 · 빠루 위로 길게 · 그라인더 원판에서 */
const TOOL_ARC = {
  sword: [30, 50, 34, 26, 18, 10, 5.5],
  hammer: [31, 50, 36, 38, 28, 28, 8],
  crowbar: [31, 52, 42, 20, 14, -4, 5],
  grinder: [29, 40, 34, 22, 18, 10, 5],
} as const;

function buildIdle(): PFrame {
  const { cv, c } = mkFrame(STAND_W, STAND_H);
  circle(c, CX, HEAD_Y, HEAD_R);
  stroke(c, [[CX, HEAD_Y + HEAD_R], [CX, HIP_Y]]);              // 목~골반
  stroke(c, [[CX, HIP_Y], [CX - 7, FOOT_Y]]);                   // 왼다리
  stroke(c, [[CX, HIP_Y], [CX + 7, FOOT_Y]]);                   // 오른다리(살짝 벌림)
  stroke(c, [[CX, SHOULDER_Y], [CX - 9, 34]]);                  // 왼팔 — 자연스럽게 늘어짐
  stroke(c, [[CX, SHOULDER_Y], [CX + 9, 30]]);                  // 오른팔 — 칼을 다리 바깥쪽으로
  weapon(c, CX + 9, 30, CX + 13, 55, [CX + 9, 30, CX + 25, 59]); // 대검은 칼끝을 앞 바닥에 댄다
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
  weapon(c, CX + 9, 30, CX + 16, 44, [CX + 9, 30, CX + 24, 58]);    // 칼은 뒤로 흘림
  return pframe(cv, CX, FOOT_Y, CX, HEAD_Y - 1);
}

function buildAttack(stage: 0 | 1 | 2): PFrame {
  const { cv, c } = mkFrame(WIDE_W, WIDE_H);
  let head: [number, number]; // 안전모 자리 — 각 분기 circle()과 같은 값
  if (stage === 0) {
    // 예열 — 몸을 뒤로 살짝 젖히고 칼을 머리 위로. 궤적 없음.
    // 칼을 몸보다 먼저 그린다 — 대검은 머리 뒤로 넘겨 멘다
    weapon(c, WCX + 7, 9, WCX + 11, 1, [WCX + 7, 9, WCX - 18, -8]);
    circle(c, WCX - 3, HEAD_Y - 3, HEAD_R);
    stroke(c, [[WCX - 3, HEAD_Y - 3 + HEAD_R], [WCX, HIP_Y]]);
    stroke(c, [[WCX, HIP_Y], [WCX - 7, FOOT_Y]]);
    stroke(c, [[WCX, HIP_Y], [WCX + 7, FOOT_Y]]);
    stroke(c, [[WCX, SHOULDER_Y], [WCX - 9, 32]]);
    stroke(c, [[WCX, SHOULDER_Y], [WCX + 7, 9]]);
    head = [WCX - 3, HEAD_Y - 3];
  } else if (stage === 1) {
    // 타격 — 깊은 런지, 앞무릎 굽힘·뒷다리 뻗음, 칼이 아래로. 여기에만 참격 궤적.
    circle(c, WCX + 14, HEAD_Y + 1, HEAD_R);
    stroke(c, [[WCX + 14, HEAD_Y + 1 + HEAD_R], [WCX + 6, HIP_Y]]);
    stroke(c, [[WCX + 6, HIP_Y], [WCX + 16, 48], [WCX + 20, FOOT_Y]]); // 앞다리(굽힘)
    stroke(c, [[WCX + 6, HIP_Y], [WCX - 4, 50], [WCX - 14, 58]]);      // 뒷다리(뻗음)
    stroke(c, [[WCX + 10, SHOULDER_Y], [WCX - 2, 18]]);                // 반대팔(균형)
    stroke(c, [[WCX + 10, SHOULDER_Y], [WCX + 22, 34]]);               // 칼 든 팔
    weapon(c, WCX + 22, 34, WCX + 30, 50, [WCX + 22, 34, WCX + 48, 54]);
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
    weapon(c, WCX + 16, 44, WCX + 10, 58, [WCX + 16, 44, WCX + 44, 58]); // 대검은 앞 바닥까지 내려온다
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
    if (!greatLook(playerWeapon)) stroke(c, [[CX - 14, HEAD_Y - 2], [CX, HEAD_Y - 2]]);
    weapon(c, CX, HEAD_Y - 2, CX + 14, HEAD_Y - 2, [CX - 12, HEAD_Y - 2, CX + 24, HEAD_Y - 2]);
  } else {
    // 지면가드: 팔이 머리 원을 관통하지 않게 바깥으로 벌리고 칼은 머리 위
    stroke(c, [[CX, SHOULDER_Y - 1], [CX - 16, HEAD_Y + 2], [CX - 14, 4]]);
    stroke(c, [[CX, SHOULDER_Y - 1], [CX + 16, HEAD_Y + 2], [CX + 14, 4]]);
    weapon(c, CX - 10, 3, CX + 16, 3, [CX - 12, 3, CX + 24, 3]);
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
  weapon(c, CX + 14, 28, CX + 22, 42, [CX + 14, 28, CX + 32, 54]); // 칼을 놓칠 듯 뒤로 젖혀짐
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
  weapon(c, WCX + 20, 42, 58, 55, [WCX + 20, 42, 74, 56]);
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

const BUILD: Readonly<Record<PlayerFrameKey, () => PFrame>> = {
  idle: buildIdle,
  jump: buildJump,
  attack0: () => buildAttack(0),
  attack1: () => buildAttack(1),
  attack2: () => buildAttack(2),
  guardG: () => buildGuard(false),
  guardA: () => buildGuard(true),
  guardBreak: buildGuardBreak,
  special: buildSpecial,
  pinned: buildPinned,
  dead: buildDead,
};

function frameKey(pose: PlayerPose, animTick: number): PlayerFrameKey {
  switch (pose) {
    case 'attack':
      if (animTick < PLAYER.ATTACK_PRE) return 'attack0';
      if (animTick < PLAYER.ATTACK_PRE + PLAYER.ATTACK_ACTIVE) return 'attack1';
      return 'attack2';
    case 'jump': case 'guardG': case 'guardA': case 'guardBreak': case 'special': case 'pinned': case 'dead':
      return pose;
    default: return 'idle';
  }
}

/** ss배로 구운 프레임 — 처음 쓰는 자세만 그때 굽는다(코스메틱 · 무기를 바꾸면 캐시가 비어 다시 굽는다) */
function pickPlayerFrame(pose: PlayerPose, animTick: number, ss = SS_MIN): PFrame {
  let m = frameCache.get(ss);
  if (!m) {
    if (frameCache.size >= 2) frameCache.delete(frameCache.keys().next().value!);
    m = {};
    frameCache.set(ss, m);
  }
  const k = frameKey(pose, animTick);
  let f = m[k];
  if (!f) {
    bakeSS = ss;
    f = m[k] = BUILD[k]();
  }
  return f;
}

/** 지금 변환이 논리 1px을 몇 기기 px로 찍나 → 구울 배율. 판(2 이하)은 늘 2배라 판 도중엔 다시 굽지 않는다 */
function frameSS(ctx: CanvasRenderingContext2D): number {
  const m = ctx.getTransform();
  const sc = Math.hypot(m.a, m.b);
  return sc <= SS_MIN + 0.5 ? SS_MIN : Math.min(SS_MAX, Math.ceil(sc - 0.25));
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

/** 번개 예고 표지(공사 표지판) 위치 — 필드 클립 안. 예전 y=20~26은 FIELD_TOP(50) 위라 통째로 잘려 안 보였다. */
const BOLT_CUE_Y = VIEW.FIELD_TOP + 36;

/** 번쩍이는 벼락 글리프 — 단위 좌표(−1~1). */
const BOLT_GLYPH: ReadonlyArray<readonly [number, number]> = [
  [0.35, -1], [-0.6, 0.15], [-0.05, 0.15], [-0.4, 1], [0.6, -0.2], [0.05, -0.2], [0.45, -1],
];

/**
 * 번개 낙하 예고 — **화면 고정 패스**(필드 클립 안, 카메라 밖)에서 부른다.
 * 표지판이 점점 커지며 깜빡이고, 마커에서 지면까지 낙하 경로 점선이 흘러내린다(어디로 떨어지는가가 정보다).
 */
function drawBoltCue(ctx: CanvasRenderingContext2D, x: number, cueTicks: number): void {
  const p = 1 - Math.min(1, cueTicks / ACT2.BOLT_CUE_TICKS); // 0 → 1
  const blink = cueTicks <= 12 && cueTicks % 4 < 2 ? 0.35 : 1;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // 낙하 경로 — 점선이 아래로 흐른다
  ctx.globalAlpha = (0.30 + 0.55 * p) * blink;
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 8]);
  ctx.lineDashOffset = cueTicks * 2;
  ctx.beginPath();
  ctx.moveTo(x, BOLT_CUE_Y + 20);
  ctx.lineTo(x, VIEW.FIELD_H);
  ctx.stroke();
  ctx.setLineDash([]);
  // 표지판 — 아이보리 삼각 + 잉크 외곽 + 벼락
  const r = 14 + 8 * p;
  ctx.globalAlpha = blink;
  ctx.beginPath();
  ctx.moveTo(x, BOLT_CUE_Y - r);
  ctx.lineTo(x + r * 1.05, BOLT_CUE_Y + r * 0.8);
  ctx.lineTo(x - r * 1.05, BOLT_CUE_Y + r * 0.8);
  ctx.closePath();
  ctx.fillStyle = PALETTE.WHITE;
  ctx.fill();
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.beginPath();
  BOLT_GLYPH.forEach(([gx, gy], i) => {
    const px = x + gx * r * 0.5;
    const py = BOLT_CUE_Y + 2 + gy * r * 0.5;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fillStyle = PALETTE.INK;
  ctx.fill();
  ctx.restore();
}

/** 낙하 중 번개 — 잉크로 굵게 그은 지그재그 꼬리(머리는 PNG). 가는 회색 헤어라인이 배경 지붕선에 묻혔다. */
/** 번개 꼬리의 꺾임 — 정해진 순서(매 프레임 같은 모양)라 떨지 않는다. 마디 길이·좌우 폭이 불규칙해야 번개로 읽힌다. */
const BOLT_ZIG: ReadonlyArray<readonly [number, number]> = [
  [14, 7], [20, -6], [12, 8], [22, -5], [15, 6], [18, -8], [13, 5], [21, -6], [16, 7], [19, -5], [14, 6], [17, -7],
];
function drawBoltTrail(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'miter';
  // 머리에서 꼬리로 갈수록 가늘어진다(굵은 잉크 선 + 아이보리 밑줄)
  for (const [grow, color] of [[3, PALETTE.WHITE], [0, PALETTE.INK]] as const) {
    let px = x, py = y;
    BOLT_ZIG.forEach(([dy, dx], i) => {
      const nx = x + dx, ny = py - dy;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1.4, 4 - i * 0.22) + grow;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      px = nx; py = ny;
    });
  }
  ctx.restore();
}

function drawBoltEntity(ctx: CanvasRenderingContext2D, e: Bolt, groundY: number): void {
  const x = VIEW.LANE_X[e.lane];
  if (e.cueTicks > 0) {
    drawBoltCue(ctx, x, e.cueTicks);
    return;
  }
  const y = groundY - e.y;
  drawBoltTrail(ctx, x, y);
  drawAssetHalo(ctx, entityAssetKey('bolt'), x, y);
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
  const sp = Math.hypot(e.vx, e.vy);
  if (sp > 1) {
    // 꼬리 — 속도 반대 방향 잉크 획. 어디서 어디로 얼마나 빨리 오는지가 읽힌다(화면 y는 물리 y의 반대)
    const len = Math.min(26, 8 + sp * 0.025);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = PALETTE.INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(e.x, y);
    ctx.lineTo(e.x - (e.vx / sp) * len, y + (e.vy / sp) * len);
    ctx.stroke();
    ctx.restore();
  }
  const pngKey = entityAssetKey(e.cancellable ? 'shotOk' : 'shotNo');
  drawAssetHalo(ctx, pngKey, e.x, y);
  if (!drawAsset(ctx, pngKey, e.x, y)) {
    const key = e.cancellable ? 'shotOk' : 'shotCancel';
    ctx.drawImage(entityCache!.get(key)!, e.x - 8, y - 5);
  }
  if (!e.cancellable) {
    // 벨 수 없는 탄 — 잉크 가위표 한 획(아이보리 밑줄로 어두운 배경에서도 산다). 고리 탄과 실루엣부터 다르다
    ctx.save();
    ctx.lineCap = 'round';
    for (const [w, color] of [[3.6, PALETTE.WHITE], [1.5, PALETTE.INK]] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(e.x - 6, y - 6);
      ctx.lineTo(e.x + 6, y + 6);
      ctx.moveTo(e.x + 6, y - 6);
      ctx.lineTo(e.x - 6, y + 6);
      ctx.stroke();
    }
    ctx.restore();
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
    drawAssetHalo(ctx, entityAssetKey('rabbit'), 0, cy);
    if (!drawAsset(ctx, entityAssetKey('rabbit'), 0, cy)) ctx.drawImage(cv, -14, y);
  } else {
    drawAssetHalo(ctx, entityAssetKey('rabbit'), e.x, cy);
    if (!drawAsset(ctx, entityAssetKey('rabbit'), e.x, cy)) ctx.drawImage(cv, e.x - 14, y);
  }
  ctx.restore();
}

/**
 * 대포 — **월드 패스**에서 그린다. 포구 높이 = 전기탄이 생기는 높이(BOSS.CANNON.MUZZLE_Y)라
 * 탄이 대포에서 나와 떨어지는 것으로 읽힌다. 예전엔 y=20(화면 위 클립 밖)이라 대포가 통째로 안 보였다.
 * 조준 점선: 평소엔 흐리게, 발사 AIM_TELE틱 전부터 진하게 깜빡인다.
 */
function drawCannonEntity(ctx: CanvasRenderingContext2D, e: Cannon, groundY: number): void {
  const y = groundY - BOSS.CANNON.MUZZLE_Y;
  const tele = e.fireTicks > 0 && e.fireTicks <= BOSS.CANNON.AIM_TELE;
  if (e.fireTicks > 0) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.globalAlpha = tele ? (e.fireTicks % 6 < 3 ? 0.95 : 0.5) : 0.28;
    ctx.strokeStyle = PALETTE.INK;
    ctx.lineWidth = tele ? 2 : 1.2;
    ctx.setLineDash([4, 7]);
    ctx.lineDashOffset = e.fireTicks * 2;
    ctx.beginPath();
    ctx.moveTo(e.x, y + 16);
    ctx.lineTo(e.x, groundY);
    ctx.stroke();
    ctx.restore();
  }
  // 대포는 좌/중/우로 벌려 설치된다 — 레인이 아니라 e.x가 실제 위치(수직탄·스파크 발생점)
  if (!drawAsset(ctx, entityAssetKey('cannon'), e.x, y)) {
    ctx.drawImage(entityCache!.get('cannon')!, e.x - 12, y - 14);
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
  // 졸라맨 프레임은 처음 그릴 때 그 배율로 굽는다(pickPlayerFrame)

  entityCache = new Map();
  entityCache.set('bolt', buildBoltIcon());
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
  const sheetFrame = playerSheetFrame(pose, animTick);
  if (key) drawAssetHalo(ctx, key, x, footY, sheetFrame); // 종이 오려내기 후광 — 기와 배경에서도 졸라맨이 산다
  if (!key || !drawAsset(ctx, key, x, footY, sheetFrame)) {
    const frame = pickPlayerFrame(pose, animTick, frameSS(ctx));
    ctx.imageSmoothingEnabled = true; // ss배 프레임을 논리 크기로 — 이 save 안에서만
    const dw = frame.cv.width / frame.ss;
    const dh = frame.cv.height / frame.ss;
    const halo = haloFor(frame.cv, 'p', 0, 0, frame.cv.width, frame.cv.height, dw, dh, frame.ss); // 후광도 프레임 배율로
    if (halo) drawHalo(ctx, halo, x - frame.ax, footY - frame.ay);
    ctx.drawImage(frame.cv, x - frame.ax, footY - frame.ay, dw, dh);
  }
  ctx.restore();
}

/**
 * 대검 참격 호 위의 점(발 기준) — t 0 칼끝 쪽 · 1 휘두르기 시작한 쪽, off = 바깥으로.
 * turn · grow = 어깨를 축으로 더 돌고 커진 호(연타 줄 박자의 붓 잔상 — bladeFx trail)
 */
export function greatArcPoint(t: number, off = 0, turn = 0, grow = 1): [number, number] {
  const [x, y] = arcAt(t, off);
  if (turn === 0 && grow === 1) return [x - WCX, y - FOOT_Y];
  const dx = (x - WCX - 10) * grow;
  const dy = (y - SHOULDER_Y) * grow;
  const c = Math.cos(turn);
  const sn = Math.sin(turn);
  return [10 + dx * c - dy * sn, SHOULDER_Y - FOOT_Y + dx * sn + dy * c];
}

/** 지금 프레임의 대검 칼날 — 발 기준 [손x, 손y, 칼끝x, 칼끝y](숨쉬기 포함). 대검이 아니거나 칼이 없는 포즈면 null */
export function playerBlade(pose: PlayerPose, animTick: number): Seg | null {
  if (!greatLook(playerWeapon)) return null;
  const b = pickPlayerFrame(pose, animTick).blade;
  const bob = playerBob(pose, animTick);
  return b && [b[0], b[1] + bob, b[2], b[3] + bob];
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

/**
 * 바닥에 쌓인 화산탄 더미. 한 단의 높이 = 판정 높이(ACT2.ROCK_PILE_H) — 그림과 판정이 같은 크기다.
 * (예전엔 12px 간격 소형이라 3단이 40px로 보이는데 판정은 120px까지 먹혔다.) 돌 그림 비율은 24:20 그대로.
 */
export function drawGroundRocks(ctx: CanvasRenderingContext2D, rocks: number, groundY: number): void {
  initSprites();
  const cv = entityCache!.get('rock')!;
  const count = Math.min(rocks, ACT2.ROCK_STACK_MAX);
  const cx = VIEW.LANE_X[0];
  const h = ACT2.ROCK_PILE_H;
  for (let i = 0; i < count; i++) {
    const ox = cx + (i % 2 === 0 ? -5 : 5);
    const cy = groundY - i * h - h / 2;
    ctx.save();
    ctx.translate(ox, cy);
    ctx.scale(h / 20, h / 20); // 돌 그림(24×20)을 단 높이에 맞춘다
    if (!drawAsset(ctx, entityAssetKey('rock'), 0, 0)) ctx.drawImage(cv, -12, -10, 24, 20);
    ctx.restore();
  }
}

/** 낙하 예고 — 건물이 내려앉을 폭의 양 끝에 잉크 대시 두 개. 가까울수록 진하고 안쪽으로 모인다(낙하 위치 예측 보조). 그림자 대신 획. */
export function drawStackShadow(ctx: CanvasRenderingContext2D, stack: FallingStack, groundY: number): void {
  initSprites();
  const isButter = stack.variant === 'butterbar';
  const w = isButter ? VIEW.BUTTER_W : VIEW.LANE_W;
  const cx = VIEW.LANE_X[0];
  const heightFrac = Math.max(0, Math.min(1, stack.y / STACK.SPAWN_Y));
  const half = Math.max(4, (w * 0.8 * (1 - 0.4 * heightFrac)) / 2);
  const len = Math.min(18, half * 0.6);
  const y = groundY - 2;
  ctx.save();
  ctx.globalAlpha = 0.9 - 0.55 * heightFrac;
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const side of [-1, 1]) { ctx.moveTo(cx + side * half, y); ctx.lineTo(cx + side * (half - len), y); }
  ctx.stroke();
  ctx.restore();
}
