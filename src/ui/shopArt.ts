// 상점 품목 그림 — 판 안에서 그리는 것을 그대로 찍는다(상점용으로 지어낸 그림 없음).
// 졸라맨 = render/sprites의 drawPlayer, 글자 = 렌더러 콤보 숫자·의성어와 같은 획(잉크 링 + 아이보리 링 + 채움).
// drawPlayer는 sprites의 전역 상태(무기·몸 색·칼빛)를 쓰므로, 찍고 나면 restoreLook으로 장착 상태로 되돌린다.

import { COSMETIC_COLORS, PALETTE, PLAYER } from '../config';
import { ONOMATO } from '../content/juice';
import type { PlayerPose, WazaId } from '../core/types';
import type { Loadout, WeaponId } from '../meta/types';
import { drawBladeShot } from '../render/bladeFx';
import { drawWazaShot } from '../render/weaponFx';
import { MASK_DRAW } from '../config';
import { drawGreatsword, drawMask, drawPlayer, playerHead, setPlayerCosmetics, setPlayerWeapon } from '../render/sprites';

export interface Look {
  weapon: WeaponId;
  body: string;
  blade: string;
  pose: PlayerPose;
}

// 그림판 논리 크기. 가로는 잉크 가운데에 맞추고(inkMidX), 세로는 발을 같은 줄에 세운다.
// 위로 가장 높은 건 대검 타격 호(발에서 −71, 후광 포함), 아래는 모두 +4 안
const ART_W = 80;
const ART_H = 79;
const FOOT_Y = 74;
/** 필살 칸 — 판에서처럼 의성어가 머리 위에 뜬다. 그 한 줄(약 24)만큼 위로 길다 */
const WAZA_H = 96;
/** 대검 칸 — 칼만 눕혀 그려 가로로 길다 */
const SWORD_H = 60;
/** 칼 뒤 층 깨기 장면 — 칼날 가운데쯤, 판보다 조금 작게 */
const SHOT_X = 32;
const SHOT_Y = 21;
const SHOT_K = 0.7;
/** 마스크 칸 — 윗몸을 2배로. 마스크 가운데가 그림 가로 가운데·위에서 BUST_Y(배율 전) */
const BUST_K = 2;
const BUST_Y = 15;
const SCALE = 4; // 상점은 1.5배까지 키워 보인다 — 고밀도 화면에서 선이 뭉개지지 않게 4배로 찍는다
const DISPLAY = '"Black Han Sans", sans-serif';

const cache = new Map<string, string>();

function colorOf(kind: 'body' | 'blade' | 'letters', id: string): string {
  const table = COSMETIC_COLORS[kind];
  return table[id] ?? Object.values(table)[0];
}

/** 찍어서 data URL. 캔버스가 없는 곳(테스트 환경 등)에선 빈 문자열. 글꼴이 아직 안 왔으면 찍되 캐시하지 않는다 */
function snap(key: string, h: number, draw: (ctx: CanvasRenderingContext2D) => void, usesFont = false): string {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const cv = typeof document === 'undefined' ? null : document.createElement('canvas');
  const ctx = cv?.getContext('2d');
  if (!cv || !ctx) return '';
  cv.width = ART_W * SCALE;
  cv.height = h * SCALE;
  ctx.scale(SCALE, SCALE);
  draw(ctx);
  const url = cv.toDataURL('image/png');
  if (!usesFont || document.fonts?.check(`16px ${DISPLAY}`) !== false) cache.set(key, url);
  return url;
}

function drawLook(ctx: CanvasRenderingContext2D, look: Look, footX: number, footY: number): void {
  setPlayerWeapon(look.weapon);
  setPlayerCosmetics(colorOf('body', look.body), colorOf('blade', look.blade));
  // 공격은 타격 프레임(참격 호가 있는 칸) — 준비 틱을 막 지난 시점
  drawPlayer(ctx, look.pose, look.pose === 'attack' ? PLAYER.ATTACK_PRE : 0, footX, footY);
}

/** 잉크(후광 포함) 가로 가운데 — 발에서 잰 거리. 1배로 한 번 그려 알파를 훑는다.
 *  칼 길이가 무기·자세마다 달라(대검 칼끝은 발에서 +56) 발 위치를 고정하면 잘리거나 한쪽으로 쏠린다 */
function inkMidX(look: Look): number {
  const W = 200, H = 120, fx = 100;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  if (!ctx) return 0;
  drawLook(ctx, look, fx, 100);
  const d = ctx.getImageData(0, 0, W, H).data;
  let x0 = W, x1 = -1;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] <= 20) continue;
    const x = ((i - 3) / 4) % W;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
  }
  return x1 < 0 ? 0 : (x0 + x1) / 2 - fx;
}

function player(ctx: CanvasRenderingContext2D, look: Look, footY: number): void {
  drawLook(ctx, look, ART_W / 2 - inkMidX(look), footY);
}

/** 렌더러의 판 속 글자 획 — 콤보 숫자(잉크 4.5)·의성어(잉크 5, 기울기 −0.08) */
function popText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, fill: string, ink: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.font = `${px}px ${DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.lineWidth = ink;
  ctx.strokeStyle = PALETTE.INK;
  ctx.strokeText(text, 0, 0);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = PALETTE.WHITE;
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = fill;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/** 졸라맨 그림 — 무기·몸 색·칼빛 */
export function playerArt(look: Look): string {
  return snap(`p|${look.weapon}|${look.body}|${look.blade}|${look.pose}`, ART_H, (ctx) => player(ctx, look, FOOT_Y));
}

/** 대검 그림 — 칼만 비스듬히, 판 속의 두 배. 졸라맨을 세우면 칼빛 호가 그림을 덮어 여덟 칸이 같아 보인다.
 *  칼 뒤엔 그 칼의 층 깨기 한 장면 — 사기 전에 무엇이 터지는지 보인다 */
export function swordArt(id: WeaponId): string {
  return snap(`s|${id}`, SWORD_H, (ctx) => {
    ctx.save();
    ctx.translate(SHOT_X, SHOT_Y);
    ctx.scale(SHOT_K, SHOT_K);
    drawBladeShot(ctx, id, 0, 0);
    // 가장자리로 갈수록 옅게 — 그림이 칸보다 좁아 장면 끝이 칸 안에서 직선으로 잘려 보이지 않게(칼은 이 뒤에 그려 그대로)
    ctx.setTransform(SCALE, 0, 0, SCALE * 0.75, (ART_W / 2) * SCALE, (SWORD_H / 2) * SCALE);
    const fade = ctx.createRadialGradient(0, 0, 33, 0, 0, 40);
    fade.addColorStop(0, '#000');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = fade;
    ctx.fillRect(-40, -40, 80, 80);
    ctx.restore();
    ctx.scale(2, 2);
    drawGreatsword(ctx, id, 9, 24, 37, 4);
  });
}

/** 효과글자 그림 — 이 코스메틱이 바꾸는 건 콤보 숫자(50 미만) 색 하나라, 그 숫자가 차오르는 모습 */
export function lettersArt(id: string): string {
  const color = colorOf('letters', id);
  return snap(`l|${id}`, ART_H, (ctx) => {
    popText(ctx, '9', 12, 67, 19, color, 4.5, 0);
    popText(ctx, '18', 35, 49, 23, color, 4.5, 0);
    popText(ctx, '27', 58, 30, 28, color, 4.5, 0);
  }, true);
}

/** 필살 그림 — 필살 포즈 + 졸라맨 뒤에 그 필살이 터진 한 장면(셋이 다 다르다) + 머리 위 그 말 */
export function wazaArt(id: string, look: Omit<Look, 'pose'>): string {
  const word = id === 'tetsu' ? ONOMATO.specialTetsu : id === 'ageba' ? ONOMATO.specialAgeba : ONOMATO.special;
  return snap(`w|${id}|${look.weapon}|${look.body}|${look.blade}`, WAZA_H, (ctx) => {
    const footY = WAZA_H - (ART_H - FOOT_Y);
    drawWazaShot(ctx, id as WazaId, ART_W / 2, footY);
    player(ctx, { ...look, pose: 'special' }, footY);
    popText(ctx, word, ART_W / 2, 19, 16, PALETTE.YELLOW, 5, -0.08);
  }, true);
}

/** 마스크 그림 — 마스크 쓴 졸라맨(서 있는 자세)의 윗몸을 크게. 그림 문자열이 캐시 키에 들어 다시 그리면 새 그림이 찍힌다 */
export function maskedArt(look: Omit<Look, 'pose'>, art: string): string {
  return snap(`m|${look.weapon}|${look.body}|${look.blade}|${art}`, ART_H, (ctx) => {
    setPlayerWeapon(look.weapon);
    setPlayerCosmetics(colorOf('body', look.body), colorOf('blade', look.blade));
    const [hx, hy] = playerHead('idle', 0) ?? [0, 0]; // 시트·프로시저럴마다 머리 자리가 조금 다르다 — 무기·색을 정한 뒤 읽는다
    const fx = ART_W / 2 / BUST_K - hx;
    const fy = BUST_Y - hy + MASK_DRAW.LIFT;
    ctx.scale(BUST_K, BUST_K);
    drawPlayer(ctx, 'idle', 0, fx, fy);
    drawMask(ctx, 'idle', 0, fx, fy, art);
  });
}

/** 찍기가 바꾼 졸라맨 전역 상태를 장착 상태로 되돌린다 */
export function restoreLook(loadout: Loadout): void {
  setPlayerWeapon(loadout.weapon);
  setPlayerCosmetics(colorOf('body', loadout.body), colorOf('blade', loadout.blade));
}
