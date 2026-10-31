// 건뿌 — PNG 스프라이트 그리기와 프로시저럴 폴백.
// 오프스크린 캔버스에 최초 1회 사전 렌더 후 drawImage로 복사(성능).
// 동적 요소(크랙 오버레이, 보스 렌즈 점멸)만 실시간 재계산.
// 원작(대불·달토끼·사무라이) 도상 금지 — 순수 창작 도안.

import type {
  PlayerPose, FallingStack, BossState, Entity, Theme, Material, GimmickId,
  FloorSeg, Bolt, Rock, Shot, Rabbit, Cannon, WeaponId, GreatswordId,
} from '../core/types';
import { VIEW, PALETTE, PLAYER, ACT2, STACK, BOSS, MASK_DRAW } from '../config';
import { drawAsset, drawAssetHalo, hasAsset } from './assets';
import { drawHalo, haloFor } from './halo';
import { drawExecutor } from './executor';
import { floorImageKey, floorMaterialKey } from './floorSheets';
import { floorSheetTile } from './floorSheetCache';
import { entityAssetKey, playerSheetFrame } from './frames';
import { drawMaskAt } from './maskArt';
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
interface PFrame { cv: HTMLCanvasElement; ax: number; ay: number; hx: number; hy: number; blade: Seg | null }
type Seg = readonly [number, number, number, number];
/** 지금 굽는 프레임에 그린 대검 — weapon()이 적고 pframe()이 가져간다 */
let bakedBlade: Seg | null = null;

// 졸라맨 프레임만 2배로 굽고 절반으로 찍는다 — 칼 아닌 무기는 늘 프로시저럴이라 계단이 보인다.
const SS = 2;
// 쇠머리·갈고리·원판·참격 호가 캔버스 끝에서 잘리지 않게 사방 여백(논리 px).
// 대검 참격 호가 가장 멀리 나간다 — 서리 얼음 조각이 넓은 프레임 오른쪽 +17, 위는 호 끝 −6
const PAD = 20;

function mkFrame(w: number, h: number): { cv: HTMLCanvasElement; c: CanvasRenderingContext2D } {
  const r = mkCanvas((w + PAD * 2) * SS, (h + PAD * 2) * SS);
  r.c.scale(SS, SS);
  r.c.translate(PAD, PAD);
  bakedBlade = null;
  return r;
}

function pframe(cv: HTMLCanvasElement, ax: number, ay: number, headX: number, headY: number): PFrame {
  const b = bakedBlade;
  const blade: Seg | null = b && [b[0] - ax, b[1] - ay, b[2] - ax, b[3] - ay];
  return { cv, ax: ax + PAD, ay: ay + PAD, hx: headX - ax, hy: headY - ay, blade };
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

function hardHat(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
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

/** 안전모 — 렌더러가 s.hat일 때 drawPlayer 직후 같은 인자로 부른다. 머리 위치는 drawPlayer와 같은 프레임에서 읽는다.
 *  마스크를 쓰면 마스크 위에 — 마스크 폭만큼 키워 윗단만 덮는다 */
export function drawHat(
  ctx: CanvasRenderingContext2D,
  pose: PlayerPose,
  animTick: number,
  x: number,
  footCanvasY: number,
): void {
  if (pose === 'pinned' || pose === 'dead') return;
  const h = playerHead(pose, animTick);
  if (!h) return;
  const cx = x + h[0];
  const cy = footCanvasY + playerBob(pose, animTick) + h[1];
  if (playerMask) hardHat(ctx, cx, cy - MASK_DRAW.LIFT - MASK_DRAW.HAT_UP, MASK_DRAW.SIZE / 2 + 1);
  else hardHat(ctx, cx, cy, playerPngKey() ? SHEET_HEAD_R : HEAD_R);
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
  glow?: string;  // 칼날 뒤로 번지는 기운
  edge?: string;  // 붉은 날 선(흑철) · 보석(황금)
}
const GREAT_LOOK: Record<GreatswordId, GreatLook> = {
  iron: { shape: 'plain', blade: '#B9B4A8', hi: '#EFECE3', guard: '#5C574E', w: 2.7 },
  saw: { shape: 'saw', blade: '#98A3AB', hi: '#E3E9ED', guard: '#3E4549', w: 2.6 },
  hazard: { shape: 'stripe', blade: PALETTE.YELLOW, hi: '#FFF0A0', guard: PALETTE.INK, w: 3 },
  beam: { shape: 'beam', blade: '#C2552D', hi: '#EA9068', guard: '#5A2A18', w: 3.3 },
  flame: { shape: 'wave', blade: '#E0401E', hi: '#FFB46B', guard: '#3A1A12', w: 2.8, glow: '#FF8A1F' },
  frost: { shape: 'crystal', blade: '#BDE6F6', hi: '#FFFFFF', guard: '#3D6E8C', w: 2.9, glow: '#7FD3FF' },
  onyx: { shape: 'jag', blade: '#2E2D34', hi: '#625F6D', guard: PALETTE.INK, w: 3, edge: '#D2332C' },
  gold: { shape: 'royal', blade: '#E2B43A', hi: '#FFF1B8', guard: '#8A5A12', w: 3.2, edge: PALETTE.RED },
};

/** 대검이면 그 모양·색 — 베기 파편(effects)도 같은 색을 쓴다 */
export function greatLook(w: WeaponId): GreatLook | undefined {
  return (GREAT_LOOK as Partial<Record<WeaponId, GreatLook>>)[w];
}

function seg(c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, w: number): void {
  c.strokeStyle = color;
  c.lineWidth = w;
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
}

/** 잉크 테두리 점 — 자루 끝·보석 */
function knob(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  c.strokeStyle = PALETTE.INK;
  c.lineWidth = 1;
  c.stroke();
}

/** 칼날 윤곽 — 손 쪽 b에서 칼끝 L까지, 반폭 h. 눕힌 좌표(칼끝 = +x, 등 = −y) */
function bladePath(c: CanvasRenderingContext2D, shape: GreatShape, b: number, L: number, h: number): void {
  const t = L - h * 2.4; // 칼끝 비탈이 시작되는 곳
  c.beginPath();
  switch (shape) {
    case 'saw': // 등이 톱니
      c.moveTo(b, h);
      c.lineTo(t, h);
      c.lineTo(L, 0);
      for (let x = t; x > b + 2; x -= 3) {
        c.lineTo(x, -h);
        c.lineTo(x - 1.4, -h - 1.8);
      }
      c.lineTo(b, -h);
      break;
    case 'stripe': // 공사 차단봉처럼 비스듬히 자른 끝
      c.moveTo(b, -h);
      c.lineTo(L - h * 1.6, -h);
      c.lineTo(L, h);
      c.lineTo(b, h);
      break;
    case 'beam': // H빔 토막 — 끝이 뭉툭
      c.rect(b, -h, L - b, h * 2);
      break;
    case 'wave': // 물결날
      c.moveTo(b, -h);
      for (let x = b; x <= t; x += 1) c.lineTo(x, -h - 0.9 * Math.sin((x - b) / 2.2));
      c.lineTo(L, 0);
      for (let x = t; x >= b; x -= 1) c.lineTo(x, h + 0.9 * Math.sin((x - b) / 2.2));
      break;
    case 'crystal': { // 깎은 얼음
      const s = (L - b) / 6;
      c.moveTo(b, -h * 0.8);
      c.lineTo(b + s, -h * 1.15);
      c.lineTo(b + s * 2, -h * 0.75);
      c.lineTo(b + s * 3, -h * 1.2);
      c.lineTo(b + s * 4.4, -h * 0.8);
      c.lineTo(L, 0);
      c.lineTo(b + s * 4.6, h * 0.95);
      c.lineTo(b + s * 3.4, h * 0.7);
      c.lineTo(b + s * 2.2, h * 1.15);
      c.lineTo(b + s, h * 0.75);
      c.lineTo(b, h * 0.9);
      break;
    }
    case 'jag': { // 아래 날에 미늘 셋
      const s = (L - b) / 4;
      c.moveTo(b, -h);
      c.lineTo(L - h * 2.6, -h);
      c.lineTo(L, -h * 0.3);
      c.lineTo(L - h * 1.4, h * 0.7);
      for (let k = 3; k >= 1; k--) {
        const x = b + s * k;
        c.lineTo(x, h);
        c.lineTo(x - s * 0.3, h * 1.9);
        c.lineTo(x - s * 0.5, h);
      }
      c.lineTo(b, h);
      break;
    }
    case 'royal': // 넓은 날 + 긴 칼끝
      c.moveTo(b, -h);
      c.lineTo(t - h, -h * 1.05);
      c.lineTo(L, 0);
      c.lineTo(t - h, h * 1.05);
      c.lineTo(b, h);
      break;
    default: // 곧은 양날
      c.moveTo(b, -h);
      c.lineTo(t, -h);
      c.lineTo(L, 0);
      c.lineTo(t, h);
      c.lineTo(b, h);
  }
  c.closePath();
}

/** 칼날 위 무늬 — 채움 뒤, 테두리 앞 */
function bladeMarks(c: CanvasRenderingContext2D, g: GreatLook, b: number, L: number, h: number): void {
  switch (g.shape) {
    case 'stripe': // 검정 사선 띠 — 칼날 안에서만
      c.save();
      bladePath(c, 'stripe', b, L, h);
      c.clip();
      c.strokeStyle = PALETTE.INK;
      c.lineWidth = 2.2;
      c.beginPath();
      for (let x = b - h * 2; x < L; x += 5.5) {
        c.moveTo(x, h + 1);
        c.lineTo(x + h * 2 + 2, -h - 1);
      }
      c.stroke();
      c.restore();
      return;
    case 'beam': { // 위아래 날개 금 + 볼트 줄, 위 날개에 빛줄
      seg(c, b, -h * 0.42, L, -h * 0.42, g.guard, 0.8);
      seg(c, b, h * 0.42, L, h * 0.42, g.guard, 0.8);
      seg(c, b + 1, -h + 0.8, L - 1, -h + 0.8, g.hi, 0.8);
      c.fillStyle = g.guard;
      for (let x = b + 4; x < L - 2; x += 6) {
        c.beginPath();
        c.arc(x, 0, 0.75, 0, Math.PI * 2);
        c.fill();
      }
      return;
    }
    case 'crystal': { // 깎인 면 — 흰 금
      const s = (L - b) / 6;
      c.strokeStyle = g.hi;
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(b + s, -h * 1.15);
      c.lineTo(b + s * 1.7, h * 0.3);
      c.moveTo(b + s * 3, -h * 1.2);
      c.lineTo(b + s * 3.6, h * 0.35);
      c.moveTo(b + 1, -0.2);
      c.lineTo(L - 3, -0.4);
      c.stroke();
      return;
    }
    case 'jag': { // 붉은 날 선 + 어두운 빛줄
      const red = g.edge ?? PALETTE.RED;
      seg(c, b + 1, -h + 0.75, L - h * 2.6, -h + 0.75, red, 1);
      seg(c, L - h * 2.6, -h + 0.75, L - 1.2, -h * 0.3, red, 1);
      seg(c, b + 2, h * 0.2, L - h * 3, h * 0.2, g.hi, 0.8);
      return;
    }
    case 'royal': // 가운데 등줄 + 빛줄
      seg(c, b + 1, 0, L - h * 1.5, 0, g.guard, 0.8);
      seg(c, b + 2, -h * 0.5, L - h * 3, -h * 0.5, g.hi, 1);
      return;
    default: // 빛줄 하나 — 손 쪽에서 칼끝 비탈 앞까지
      seg(c, b + 2, -h * 0.4, L - h * 2.8, -h * 0.4, g.hi, 1);
  }
}

/** 코등이 — 칼날 바로 앞 가로대. 황금은 끝이 벌어지고 가운데 보석, 흑철은 가시 */
function crossGuard(c: CanvasRenderingContext2D, g: GreatLook, h: number): void {
  const e = h + 3; // 반길이
  c.beginPath();
  if (g.shape === 'royal') {
    c.moveTo(-0.6, -e - 1.4);
    c.lineTo(2.8, -e + 0.6);
    c.lineTo(2.8, e - 0.6);
    c.lineTo(-0.6, e + 1.4);
    c.lineTo(0.8, 0);
  } else if (g.shape === 'jag') {
    c.moveTo(-1, -e - 1.6);
    c.lineTo(2.6, -h);
    c.lineTo(2.6, h);
    c.lineTo(-1, e + 1.6);
    c.lineTo(0.6, 0);
  } else {
    c.rect(0, -e, 2.4, e * 2);
  }
  c.closePath();
  c.fillStyle = g.guard;
  c.fill();
  c.strokeStyle = PALETTE.INK;
  c.lineWidth = 1;
  c.stroke();
  if (g.shape === 'royal') knob(c, 1.3, 0, 1.3, g.edge ?? PALETTE.RED);
}

/** 대검 — 손(hx,hy)에서 칼끝(tx,ty)까지가 칼날, 자루는 손 뒤로. 눕힌 좌표로 그린다 */
function greatsword(c: CanvasRenderingContext2D, g: GreatLook, hx: number, hy: number, tx: number, ty: number): void {
  const L = Math.hypot(tx - hx, ty - hy);
  const h = g.w;
  const b = 2.4; // 칼날은 코등이 바로 앞에서
  c.save();
  c.translate(hx, hy);
  c.rotate(Math.atan2(ty - hy, tx - hx));
  c.lineJoin = 'round';
  c.lineCap = 'round';
  seg(c, -6, 0, 0, 0, PALETTE.INK, 2.2); // 자루
  knob(c, -7, 0, 1.5, g.shape === 'royal' ? g.edge ?? PALETTE.RED : g.guard);
  if (g.glow) { // 칼날 뒤로 번지는 기운
    c.globalAlpha = 0.35;
    seg(c, b + 2, 0, L - 2, 0, g.glow, h * 2 + 5);
    c.globalAlpha = 1;
  }
  bladePath(c, g.shape, b, L, h);
  c.fillStyle = g.blade;
  c.fill();
  bladeMarks(c, g, b, L, h);
  bladePath(c, g.shape, b, L, h);
  c.strokeStyle = PALETTE.INK;
  c.lineWidth = LINE_W;
  c.stroke();
  crossGuard(c, g, h);
  c.restore();
}

/** 대검 하나만 — 상점 그림. 판 속 칼과 같은 그리기에 손·칼끝만 받는다. 대검이 아니면 false */
export function drawGreatsword(c: CanvasRenderingContext2D, w: WeaponId, hx: number, hy: number, tx: number, ty: number): boolean {
  const g = greatLook(w);
  if (g) greatsword(c, g, hx, hy, tx, ty);
  return g !== undefined;
}

/** 무기: 손(hx,hy)과 방향(→tx,ty)은 포즈 그대로, 길이·머리 모양만 장착 무기별로 바꾼다.
 *  great = 대검일 때의 [손x, 손y, 칼끝x, 칼끝y] — 칼이 길어 바닥·머리를 뚫지 않게 포즈마다 따로 잡는다 */
function weapon(
  c: CanvasRenderingContext2D, hx: number, hy: number, tx: number, ty: number,
  great?: readonly [number, number, number, number],
): void {
  const g = greatLook(playerWeapon);
  if (g) {
    const [gx, gy, gtx, gty] = great ?? [hx, hy, tx, ty];
    greatsword(c, g, gx, gy, gtx, gty);
    bakedBlade = [gx, gy, gtx, gty];
    return;
  }
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
      c.fillRect(-2, -5, 5, 10); // 머리 길이 = 자루의 약 40%
      c.strokeStyle = LINE;
      c.lineWidth = LINE_W;
      c.lineJoin = 'round';
      c.strokeRect(-2, -5, 5, 10);
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
      c.lineWidth = LINE_W * 1.7; // 몸통은 졸라맨 선의 2배를 넘지 않는다
      c.beginPath();
      c.moveTo(hx, hy);
      c.lineTo(ex, ey);
      c.stroke();
      circle(c, ex + ux * 2, ey + uy * 2, 3.6, DISC);
      c.fillStyle = LINE;
      c.beginPath();
      c.arc(ex + ux * 2, ey + uy * 2, 1, 0, Math.PI * 2);
      c.fill();
      break;
    }
    default:
      stroke(c, [[hx, hy], [tx, ty]]);
      circle(c, hx, hy, 1.5);
  }
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

/** 네 갈래 반짝 별 — 황금 호·베기 파편. 잉크 테두리라 밝은 바탕에서도 보인다 */
export function twinkleStar(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  c.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 - Math.PI / 2;
    const rr = k % 2 ? r * 0.32 : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  c.strokeStyle = PALETTE.INK;
  c.lineWidth = 0.7;
  c.stroke();
}

/** 대검 참격 호 — 칼마다 모양·덧칠이 다르고 몸통은 칼빛 */
function greatArc(c: CanvasRenderingContext2D, g: GreatLook): void {
  const crescent = (T: number): void => arcBand(c, (t) => T * 0.3 * smear(t), (t) => T * 0.7 * smear(t));
  const base = c.globalAlpha; // 잔상(drawGreatArc)은 옅게 그린다 — 덧칠 알파는 그 위에 곱한다
  const paint = (color: string, a = 1): void => {
    c.globalAlpha = base * a;
    c.fillStyle = color;
    c.fill();
    c.globalAlpha = base;
  };
  const line = (color: string, w: number): void => {
    c.strokeStyle = color;
    c.lineWidth = w;
    c.stroke();
  };
  c.save();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  switch (g.shape) {
    case 'saw': // 바깥 날이 톱니
      arcBand(c, (t, i) => (i % 2 ? 4.8 : 2.2) * smear(t), (t) => 5 * smear(t));
      paint(ARC);
      line(PALETTE.INK, 0.8);
      break;
    case 'stripe': // 차단봉 빗금 띠
      crescent(9);
      paint(ARC);
      c.save();
      c.clip();
      c.beginPath();
      for (let k = -70; k < 90; k += 6.5) {
        c.moveTo(k, -20);
        c.lineTo(k + 80, 60);
      }
      line(PALETTE.INK, 2.4);
      c.restore();
      crescent(9);
      line(PALETTE.INK, 0.8);
      break;
    case 'beam': // 뭉툭하고 굵은 철골 토막 + 리벳 — 짧게 끊는다
      arcBand(c, () => 7.5, () => 7.5, 16, 0, 0.8);
      paint(ARC, 0.22);
      arcBand(c, () => 4.5, () => 4.5, 16, 0.03, 0.7);
      paint(ARC);
      line(PALETTE.INK, 1);
      c.fillStyle = PALETTE.INK;
      for (const t of [0.13, 0.28, 0.43, 0.58]) {
        const [x, y] = arcAt(t, 0);
        c.beginPath();
        c.arc(x, y, 1.1, 0, Math.PI * 2);
        c.fill();
      }
      break;
    case 'wave': // 바깥으로 날름이는 불혀(뾰족한 끝 = 1 − |sin|), 속은 칼빛
      arcBand(c, (t) => (2.5 + 3.5 * (1 - Math.abs(Math.sin(t * 16)))) * smear(t), (t) => 6 * smear(t), 40);
      paint(g.glow ?? g.blade, 0.9);
      arcBand(c, (t) => 1.2 * smear(t), (t) => 4.4 * smear(t));
      paint(ARC);
      break;
    case 'crystal': { // 각진 얼음 + 흰 결 + 떨어져 나간 조각 셋
      const out = (t: number): number => 3 * smear(t);
      const inn = (t: number): number => 5.5 * smear(t);
      arcBand(c, out, inn, 7);
      paint(ARC);
      c.beginPath();
      for (let i = 1; i < 7; i++) {
        const [ax, ay] = arcAt(i / 7, out(i / 7));
        const [bx, by] = arcAt((i + 1) / 7, -inn((i + 1) / 7));
        c.moveTo(ax, ay);
        c.lineTo(bx, by);
      }
      line(g.hi, 0.8);
      arcBand(c, out, inn, 7);
      line(PALETTE.INK, 0.8);
      for (const [t, r] of [[0.18, 2.6], [0.4, 2.2], [0.62, 1.8]] as const) {
        const [x, y] = arcAt(t, out(t) + 3.5 + r);
        c.beginPath();
        c.moveTo(x, y - r);
        c.lineTo(x + r * 0.9, y + r * 0.7);
        c.lineTo(x - r * 0.8, y + r * 0.5);
        c.closePath();
        paint(g.blade);
        line(PALETTE.INK, 0.7);
      }
      break;
    }
    case 'jag': // 검은 기운에 싸인 초승달 — 바깥은 붉은 날, 몸 쪽으로 미늘
      arcBand(c, (t) => 4.5 * smear(t), (t) => 8.5 * smear(t));
      paint(PALETTE.INK, 0.9);
      c.beginPath();
      for (const t of [0.22, 0.42, 0.62]) {
        const s = smear(t);
        const [ax, ay] = arcAt(t - 0.05, -8 * s);
        const [bx, by] = arcAt(t + 0.01, -11.5 * s);
        const [cx, cy] = arcAt(t + 0.06, -8 * s);
        c.moveTo(ax, ay);
        c.lineTo(bx, by);
        c.lineTo(cx, cy);
      }
      paint(PALETTE.INK, 0.9);
      crescent(7);
      paint(ARC);
      c.beginPath();
      arcPath(c, (t) => 4.5 * smear(t));
      line(g.edge ?? PALETTE.RED, 1.4);
      break;
    case 'royal': // 금테 두른 초승달 + 반짝 별 셋
      crescent(9);
      paint(ARC);
      c.beginPath();
      arcPath(c, (t) => 2.7 * smear(t));
      line(g.blade, 1.8);
      crescent(9);
      line(PALETTE.INK, 0.6);
      for (const [t, r] of [[0.12, 4.2], [0.5, 3.2], [0.85, 2.4]] as const) {
        const [x, y] = arcAt(t, 2.7 * smear(t));
        twinkleStar(c, x, y, r, g.hi);
      }
      break;
    default: // 무쇠 — 군더더기 없는 두꺼운 초승달 + 옅은 잔상, 바깥 날만 잉크
      crescent(15);
      paint(ARC, 0.25);
      crescent(8);
      paint(ARC);
      c.beginPath();
      arcPath(c, (t) => 2.4 * smear(t));
      line(PALETTE.INK, 0.9);
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

  rebuildPlayerFrames();

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
    const frame = pickPlayerFrame(pose, animTick);
    ctx.imageSmoothingEnabled = true; // 2배 프레임을 절반으로 — 이 save 안에서만
    const dw = frame.cv.width / SS;
    const dh = frame.cv.height / SS;
    const halo = haloFor(frame.cv, 'p', 0, 0, frame.cv.width, frame.cv.height, dw, dh);
    if (halo) drawHalo(ctx, halo, x - frame.ax, footY - frame.ay);
    ctx.drawImage(frame.cv, x - frame.ax, footY - frame.ay, dw, dh);
  }
  ctx.restore();
}

/** 대검 참격 호 위의 점(발 기준) — t 0 칼끝 쪽 · 1 휘두르기 시작한 쪽, off = 바깥으로 */
export function greatArcPoint(t: number, off = 0): [number, number] {
  const [x, y] = arcAt(t, off);
  return [x - WCX, y - FOOT_Y];
}

/** 지금 프레임의 대검 칼날 — 발 기준 [손x, 손y, 칼끝x, 칼끝y](숨쉬기 포함). 대검이 아니거나 칼이 없는 포즈면 null */
export function playerBlade(pose: PlayerPose, animTick: number): Seg | null {
  if (!greatLook(playerWeapon)) return null;
  const b = pickPlayerFrame(pose, animTick).blade;
  const bob = playerBob(pose, animTick);
  return b && [b[0], b[1] + bob, b[2], b[3] + bob];
}

/** 대검 참격 호를 발 자리에 다시 그린다(잔상) — 어깨를 축으로 turn만큼 더 돌고 grow배로 커진다 */
export function drawGreatArc(
  ctx: CanvasRenderingContext2D, w: WeaponId, footX: number, footY: number, alpha: number, turn = 0, grow = 1,
): void {
  const g = greatLook(w);
  if (!g || alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(footX + 10, footY - (FOOT_Y - SHOULDER_Y));
  ctx.rotate(turn);
  ctx.scale(grow, grow);
  ctx.translate(-(WCX + 10), -SHOULDER_Y);
  greatArc(ctx, g);
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
