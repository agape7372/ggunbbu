// 타격감 파티클 풀 — JUICE.*.particles 를 소비해 프로시저럴 점/선/먼지를 뿌린다.
// 고정 풀 JUICE_SYS.PARTICLE_POOL(256). 초과 시 링 커서로 오래된 슬롯 재활용.
// core rngState와 무관한 렌더 LCG. DOM import 없음 — 에셋은 보급 상자 그림('crate') 하나만 시도한다.
// 히트스톱 중에도 updateEffects는 호출되어야 한다(정지감 속 운동감).
//
// ★좌표 계약(BL-09): 파티클·상자는 **월드 좌표**(지면 y = VIEW.GROUND_Y 기준 화면 좌표, 카메라 미적용)로 저장하고
// drawEffects(ctx, cam)가 그릴 때 한 번 cam을 더한다. 스폰 시점 카메라를 구워 넣으면 점프 정점에서 터진 파편이
// 월드에 안 붙고 화면에 붙어 따라온다. 필살 중앙 폭발처럼 화면에 붙어야 하는 것만 `fixed`(화면 좌표).

import type { FallingStack, GameState, ItemId, JuiceEvent, WeaponId } from '../core/types';
import { DEBRIS, JUICE, JUICE_SYS, PALETTE, TICK, VIEW } from '../config';
import { drawAsset } from './assets';
import { stackScale } from './feel';

/** chip = 잉크 외곽선 두른 파편(안전모 조각) */
type Style = 'spark' | 'shard' | 'chip' | 'dust' | 'cream' | 'ring' | 'pollen';

interface Particle {
  alive: boolean;
  style: Style;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  maxLife: number;
  size: number;
  rot: number;
  spin: number;
  color: string;
  bounce: number;
  /** true면 화면 좌표(카메라를 안 탄다) */
  fixed: boolean;
}

const POOL = JUICE_SYS.PARTICLE_POOL;
const DUST = ['#B9B3A6', '#948E82', '#6E695F'] as const;
const HAT_WHITE = '#FFFFFF'; // 안전모 — sprites.ts hardHat과 같은 흰색

function blank(): Particle {
  return {
    alive: false,
    style: 'spark',
    x: 0, y: 0, vx: 0, vy: 0, g: 0,
    life: 0, maxLife: 1,
    size: 1, rot: 0, spin: 0,
    color: PALETTE.INK,
    bounce: 0,
    fixed: false,
  };
}

const pool: Particle[] = Array.from({ length: POOL }, blank);
let allocAt = 0;
let live = 0;
let fxSeed = 1;
/** 지금 뿌리는 파티클이 화면 고정인가 — fill()이 읽는다. spawnScreen이 잠깐 켠다. */
let spawnFixed = false;

// 08-30(P1-3): blade 코스메틱 — 참격 스파크 색
let slashColor: string = PALETTE.YELLOW;
export function setSlashColor(c: string): void {
  slashColor = c;
}

function n01(): number {
  fxSeed = (Math.imul(fxSeed, 1103515245) + 12345) & 0x7fffffff;
  return (fxSeed >>> 8) / 0x7fffff;
}

function signed(): number {
  return n01() * 2 - 1;
}

function take(): Particle {
  for (let k = 0; k < POOL; k++) {
    const i = (allocAt + k) % POOL;
    if (!pool[i].alive) {
      allocAt = (i + 1) % POOL;
      pool[i].alive = true;
      live += 1;
      return pool[i];
    }
  }
  const p = pool[allocAt];
  allocAt = (allocAt + 1) % POOL;
  return p;
}

function matDust(mat?: string): string {
  if (mat === 'butter') return PALETTE.YELLOW;
  if (mat === 'hard' || mat === 'cathedral' || mat === 'penthouse') return DUST[2];
  if (mat === 'mid' || mat === 'lobby' || mat === 'office') return DUST[1];
  return DUST[n01() * 3 | 0];
}

function fill(
  style: Style,
  x: number, y: number,
  vx: number, vy: number, g: number,
  life: number, size: number,
  color: string,
  extra?: { rot?: number; spin?: number; bounce?: number },
): void {
  const p = take();
  p.style = style;
  p.x = x;
  p.y = y;
  p.vx = vx;
  p.vy = vy;
  p.g = g;
  p.life = life;
  p.maxLife = life;
  p.size = size;
  p.rot = extra?.rot ?? 0;
  p.spin = extra?.spin ?? 0;
  p.color = color;
  p.bounce = extra?.bounce ?? 0;
  p.fixed = spawnFixed;
}

function sparks(x: number, y: number, n: number, color: string, spread: number, up: number): void {
  for (let i = 0; i < n; i++) {
    fill(
      'spark',
      x + signed() * 8, y + signed() * 6,
      signed() * spread, -up - n01() * up,
      40,
      0.10 + n01() * 0.12,
      3 + n01() * 5,
      i % 3 === 0 ? PALETTE.YELLOW : color,
    );
  }
}

function shards(
  x: number, y: number, n: number, mat: string | undefined, amp: number,
  color?: string, style: Style = 'shard',
): void {
  for (let i = 0; i < n; i++) {
    fill(
      style,
      x + signed() * 14 * amp, y + signed() * 8,
      signed() * 160 * amp, -70 - n01() * 200 * amp,
      980,
      0.35 + n01() * 0.40,
      2.5 + n01() * 4 * amp,
      color ?? matDust(mat),
      { rot: signed() * Math.PI, spin: signed() * 10 },
    );
  }
}

/** 빠루: 위로 길게 튀는 가는 줄 불꽃 (size ≤16 → 가는 선) */
function longSparks(x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    fill(
      'spark',
      x + signed() * 6, y,
      signed() * 50, -380 - n01() * 220,
      700,
      0.20 + n01() * 0.10,
      10 + n01() * 5,
      i % 3 === 0 ? PALETTE.YELLOW : PALETTE.INK,
    );
  }
}

/** 그라인더: 앞쪽 위로 부채꼴 작은 불꽃 다발 — 참격의 연장이라 참격 색 */
function fanSparks(x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const u = n <= 1 ? 0.5 : i / (n - 1);
    const ang = -0.15 * Math.PI - u * 0.7 * Math.PI + signed() * 0.06;
    const spd = 220 + n01() * 180;
    fill(
      'spark',
      x + 6, y,
      Math.cos(ang) * spd, Math.sin(ang) * spd,
      650,
      0.16 + n01() * 0.14,
      2 + n01() * 3,
      i % 3 === 2 ? PALETTE.INK : slashColor,
    );
  }
}

/** 무기별 타격 파편. 개수는 JUICE particles(n)의 ±50% 안. */
function weaponBurst(w: WeaponId, kind: 'hit' | 'floorCollapse', x: number, y: number, footY: number, n: number, mat?: string): void {
  const collapse = kind === 'floorCollapse';
  switch (w) {
    case 'hammer': {
      // 먼지 많고 덩어리 파편 + 발밑 링, 불꽃 1
      const t = Math.floor(n * 1.5);
      const chunks = Math.ceil(t * 0.4);
      fill('ring', x, footY, 0, 0, 34, 0.26, 8, DUST[2]);
      shards(x, y, chunks, mat, collapse ? 1.6 : 1.3);
      sparks(x, y, 1, PALETTE.INK, 120, 100);
      dust(x, y, Math.max(1, t - chunks - 2));
      return;
    }
    case 'crowbar':
      if (collapse) shards(x, y, Math.round(n * 0.5), mat, 1);
      longSparks(x, y, 3);
      return;
    case 'grinder':
      if (collapse) shards(x, y, Math.round(n * 0.5), mat, 1);
      fanSparks(x, y, collapse ? Math.round(n * 0.8) : Math.round(n * 1.5));
      return;
    default:
      burst(kind, x, y, n, mat);
  }
}

// ── 보급 상자 연출 — 파티클 풀과 별개(동시 2개). 좌표는 월드(그릴 때 cam). ──
interface Crate { item: ItemId; x: number; y0: number; y: number; vy: number; t: number; bounced: boolean; opened: boolean }
const crates: Crate[] = [];
const CRATE_MAX = 2;
const CRATE_LIFE = 0.85;
const CRATE_G = 1500;
const CRATE_OPEN_AT = 0.38;
const CRATE_W = 20;
const CRATE_H = 15;
const ITEM_SCALE = 1.4; // 졸라맨 선 굵기(2)에 맞춘다 — drawItem 선 1.5 × 1.4

function updateCrates(step: number): void {
  for (let i = crates.length - 1; i >= 0; i--) {
    const k = crates[i];
    k.t += step;
    if (k.t >= CRATE_LIFE) { crates.splice(i, 1); continue; }
    if (k.vy !== 0 || k.y < k.y0) {
      k.vy += CRATE_G * step;
      k.y += k.vy * step;
      if (k.y >= k.y0) {
        k.y = k.y0;
        k.vy = k.bounced ? 0 : -k.vy * 0.4; // 한 번만 통
        k.bounced = true;
      }
    }
    if (!k.opened && k.t >= CRATE_OPEN_AT) {
      k.opened = true;
      dust(k.x, k.y0 - CRATE_H, 4);
    }
  }
}

function drawItem(ctx: CanvasRenderingContext2D, item: ItemId, cx: number, cy: number): void {
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  switch (item) {
    case 'hat': { // 흰 안전모
      const R = 7, base = cy + 2;
      ctx.arc(cx, base, R, Math.PI, 0);
      ctx.lineTo(cx + R + 4, base + 0.5);
      ctx.lineTo(cx + R + 4, base + 2.5);
      ctx.lineTo(cx - R - 1, base + 2.5);
      ctx.closePath();
      ctx.fillStyle = HAT_WHITE;
      ctx.fill();
      ctx.stroke();
      return;
    }
    case 'coffee': { // 막대 커피 봉지 — 길쭉한 사각형 + 대각선
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.35);
      ctx.rect(-3, -9, 6, 18);
      ctx.fillStyle = PALETTE.YELLOW; // 믹스커피 막대는 노랑이라야 읽힌다
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-3, -4);
      ctx.lineTo(3, -7);
      ctx.stroke();
      ctx.restore();
      return;
    }
    case 'gloves': { // 목장갑 실루엣 — 손바닥 + 손가락 넷 + 엄지
      ctx.moveTo(cx - 5, cy + 8);
      ctx.lineTo(cx - 5, cy - 4);
      for (let f = 0; f < 4; f++) {
        const fx = cx - 5 + f * 2.75;
        ctx.lineTo(fx, cy - 8 + (f === 0 || f === 3 ? 1.5 : 0));
        ctx.lineTo(fx + 2.75, cy - 8 + (f === 0 || f === 3 ? 1.5 : 0));
        ctx.lineTo(fx + 2.75, cy - 4);
      }
      ctx.lineTo(cx + 6, cy + 1);
      ctx.lineTo(cx + 9, cy - 2);
      ctx.lineTo(cx + 10, cy);
      ctx.lineTo(cx + 6, cy + 5);
      ctx.lineTo(cx + 6, cy + 8);
      ctx.closePath();
      ctx.fillStyle = '#E8E4DA';
      ctx.fill();
      ctx.stroke();
      return;
    }
    default: { // 먼지 자루 — 둥근 몸통 + 묶은 목 + 벌어진 주둥이
      ctx.moveTo(cx - 2, cy - 4);
      ctx.quadraticCurveTo(cx - 9, cy + 1, cx - 7, cy + 7);
      ctx.lineTo(cx + 7, cy + 7);
      ctx.quadraticCurveTo(cx + 9, cy + 1, cx + 2, cy - 4);
      ctx.lineTo(cx + 5, cy - 9);
      ctx.lineTo(cx - 5, cy - 9);
      ctx.closePath();
      ctx.fillStyle = DUST[1];
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 3, cy - 4);
      ctx.lineTo(cx + 3, cy - 4);
      ctx.stroke();
    }
  }
}

function drawCrates(ctx: CanvasRenderingContext2D): void {
  for (const k of crates) {
    const fade = Math.min(1, (CRATE_LIFE - k.t) / 0.2);
    const W = CRATE_W, H = CRATE_H;
    const top = k.y - H;
    ctx.save();
    ctx.globalAlpha = fade;
    // 내용물 — 열린 뒤 위로 솟는다(상자 뒤에서 먼저 그려 상자가 아랫부분을 가린다)
    if (k.opened) {
      const u = Math.min(1, (k.t - CRATE_OPEN_AT) / 0.25);
      const rise = 1 - (1 - u) * (1 - u);
      ctx.globalAlpha = fade * Math.min(1, u * 2);
      ctx.save();
      ctx.translate(k.x, top - 3 - rise * 18);
      ctx.scale(ITEM_SCALE, ITEM_SCALE);
      drawItem(ctx, k.item, 0, 0);
      ctx.restore();
      ctx.globalAlpha = fade;
    }
    if (!drawAsset(ctx, 'crate', k.x, k.y - H / 2)) {
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = PALETTE.INK;
      ctx.fillStyle = DUST[0];
      ctx.fillRect(k.x - W / 2, top, W, H);
      ctx.strokeRect(k.x - W / 2, top, W, H);
      ctx.lineWidth = 1;
      ctx.beginPath();                     // 띠 십자
      ctx.moveTo(k.x, top);
      ctx.lineTo(k.x, k.y);
      ctx.moveTo(k.x - W / 2, top + H / 2);
      ctx.lineTo(k.x + W / 2, top + H / 2);
      ctx.stroke();
      // 뚜껑 — 왼쪽 경첩을 축으로 젖혀진다
      const open = k.opened ? Math.min(1, (k.t - CRATE_OPEN_AT) / 0.1) : 0;
      ctx.save();
      ctx.translate(k.x - W / 2 - 1, top);
      ctx.rotate(-open * 1.9);
      ctx.lineWidth = 1.5;
      ctx.fillStyle = DUST[0];
      ctx.fillRect(0, -4, W + 2, 4);
      ctx.strokeRect(0, -4, W + 2, 4);
      ctx.restore();
    }
    ctx.restore();
  }
}

function dust(x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    fill(
      'dust',
      x + signed() * 16, y + signed() * 10,
      signed() * 55, -15 + n01() * 50,
      120,
      0.40 + n01() * 0.25,
      4 + n01() * 5,
      DUST[i % 3],
    );
  }
}

function cream(x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    fill(
      'cream',
      x + signed() * 12, y - n01() * 6,
      signed() * 90, -160 - n01() * 180,
      1400,
      0.70 + n01() * 0.40,
      2.5 + n01() * 2.5,
      i % 2 === 0 ? PALETTE.YELLOW : '#FFF07A',
      { bounce: 2 },
    );
  }
}

function radial(x: number, y: number, n: number, color: string): void {
  for (let i = 0; i < n; i++) {
    const ang = (i / Math.max(n, 1)) * Math.PI * 2 + signed() * 0.18;
    const spd = 160 + n01() * 240;
    fill(
      i % 2 === 0 ? 'spark' : 'shard',
      x, y,
      Math.cos(ang) * spd, Math.sin(ang) * spd,
      220,
      0.22 + n01() * 0.18,
      3 + n01() * 4,
      i % 3 === 0 ? PALETTE.YELLOW : color,
      { rot: ang, spin: signed() * 6 },
    );
  }
}

function pollen(x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    fill(
      'pollen',
      x + signed() * 28, y + signed() * 18,
      signed() * 36, -24 - n01() * 50,
      -18,
      1.0 + n01() * 0.8,
      1.2 + n01() * 1.4,
      n01() > 0.45 ? PALETTE.YELLOW : DUST[0],
    );
  }
}

function burst(kind: string, x: number, y: number, count: number, mat?: string): void {
  switch (kind) {
    case 'hit':
    case 'bossHit':
      sparks(x, y, count, PALETTE.INK, 170, 140);
      return;
    case 'floorCollapse':
      shards(x, y, count, mat, 1);
      return;
    case 'stackDestroy':
      shards(x, y, count, mat, 1.65);
      return;
    case 'butterCollapse':
      cream(x, y, count);
      return;
    case 'special': {
      fill('ring', x, y, 0, 0, 90, 0.28, 36, PALETTE.YELLOW);
      fill('ring', x, y, 0, 0, 160, 0.40, 72, PALETTE.YELLOW);
      fill('ring', x, y, 0, 0, 240, 0.55, 110, PALETTE.YELLOW);
      radial(x, y, count, PALETTE.INK);
      sparks(x, y, Math.max(12, count >> 1), PALETTE.YELLOW, 280, 240);
      const slashN = 8 + Math.min(4, (count / 12) | 0);
      for (let i = 0; i < slashN; i++) {
        const u = slashN <= 1 ? 0.5 : i / (slashN - 1);
        fill(
          'spark',
          x - 40 + u * 90, y + 80 + u * -200,
          720 + n01() * 80, -1600 - n01() * 120,
          0,
          0.16 + n01() * 0.10,
          20 + n01() * 8,
          PALETTE.YELLOW,
        );
      }
      shards(x, y, 8 + (count / 8 | 0), mat, 1.9);
      return;
    }
    case 'hurt':
      dust(x, y, count);
      return;
    // 밑면에 머리를 부딪힘 — 위로 튀는 먼지 몇 알. 가드 바운스와 같은 톤(먼지색)이되 더 작게.
    case 'headBonk':
      sparks(x, y, Math.max(3, count >> 1), '#6E695F', 60, 120);
      return;
    case 'guardBounce':
      sparks(x, y, count, '#6E695F', 70, 180);
      return;
    case 'guardAirBounce':
      sparks(x, y, count, '#6E695F', 90, 220);
      return;
    case 'bossDefeat': {
      // 링은 defeatRings가 셋을 따로 깐다
      const seeds = Math.floor(count * 0.55);
      shards(x, y, count - seeds, undefined, 2.1);
      pollen(x, y, seeds);
      return;
    }
    default:
      sparks(x, y, count, PALETTE.INK, 120, 100);
  }
}

/** 씬 전환·새 런 시작 시 풀을 비운다. */
export function resetEffects(): void {
  for (let i = 0; i < POOL; i++) pool[i].alive = false;
  allocAt = 0;
  live = 0;
  fxSeed = 1;
  crates.length = 0;
}

/**
 * 히트/가드/붕괴 파티클 스폰.
 * `count` 생략 시 `JUICE[kind].particles`. 0 또는 미등록 키는 무동작.
 * `x`,`y`는 캔버스 픽셀 — renderer는 `VIEW.LANE_X[lane]`, `VIEW.GROUND_Y - (e.y ?? player.y)` 를 넘긴다.
 */
export function spawnHitParticles(
  kind: string,
  x: number,
  y: number,
  count?: number,
  mat?: string,
): void {
  const n = count ?? JUICE[kind]?.particles ?? 0;
  if (n <= 0) return;
  burst(kind, x, y, n, mat);
}

/**
 * 파티클 적분. `dt`는 초(drawGame에서 `TICK`).
 * 히트스톱 중에도 호출 — sim은 멈춰도 파편은 움직인다.
 */
export function updateEffects(dt: number): void {
  const step = dt > 0 ? Math.min(dt, 0.05) : TICK;
  if (crates.length) updateCrates(step);
  if (live <= 0) return;
  const ground = VIEW.GROUND_Y;
  for (let i = 0; i < POOL; i++) {
    const p = pool[i];
    if (!p.alive) continue;
    p.life -= step;
    if (p.life <= 0) {
      p.alive = false;
      live -= 1;
      continue;
    }
    if (p.style === 'ring') continue;
    p.vy += p.g * step;
    p.x += p.vx * step;
    p.y += p.vy * step;
    p.rot += p.spin * step;
    if (p.bounce > 0 && p.y > ground - p.size) {
      p.y = ground - p.size;
      p.vy *= DEBRIS.BOUNCE_VY;
      p.vx *= DEBRIS.BOUNCE_VX;
      p.bounce -= 1;
      if (Math.abs(p.vy) < 24) p.bounce = 0;
    }
  }
}

/**
 * consumeEvents 루프용. 캔버스 좌표로 변환한 뒤 spawnHitParticles에 위임.
 * 병렬 renderer가 이 이름을 이미 import하므로 유지한다.
 */
export function spawnFromEvent(s: GameState, e: JuiceEvent): void {
  const x = VIEW.LANE_X[e.lane ?? s.player.lane];
  const y = VIEW.GROUND_Y - (e.y ?? s.player.y); // 월드 좌표 — 카메라는 그릴 때 한 번(BL-09)
  if (e.kind === 'land') {
    // 플레이어 착지만(레인 없음) — 화산탄 착지(lane 있음)는 더미가 대신 보여 준다
    if (e.lane === undefined) dust(x, y - 2, JUICE_SYS.LAND_DUST);
    return;
  }
  if (e.kind === 'boltStrike') {
    boltStrikeBurst(x, VIEW.GROUND_Y, JUICE.boltStrike.particles);
    return;
  }
  if (e.kind === 'stackDestroy') {
    stackBurst(x, y, e.n);
    return;
  }
  if (e.kind === 'bossDefeat') {
    const by = s.boss ? VIEW.GROUND_Y - s.boss.y : y;
    spawnHitParticles('bossDefeat', VIEW.W / 2, by, JUICE.bossDefeat.particles);
    defeatRings(VIEW.W / 2, by);
    return;
  }
  if (e.kind === 'slash') {
    switch (s.weapon) {
      case 'hammer': // 짧고 굵게 (size>16 → 굵은 획)
        fill('spark', x + 8, y - 24, 50, -20, 0, 0.12, 17, slashColor);
        fill('spark', x + 6, y - 16, 30, -30, 0, 0.10, 17, slashColor);
        return;
      case 'crowbar': // 높게
        fill('spark', x + 8, y - 40, 60, -160, 0, 0.16, 18, slashColor);
        fill('spark', x + 4, y - 24, 30, -120, 0, 0.13, 12, slashColor);
        return;
      case 'grinder': { // 둥글게 — 원을 따라 도는 짧은 획 다섯
        for (let k = 0; k < 5; k++) {
          const a = -0.9 * Math.PI + k * 0.45 * Math.PI;
          fill('spark', x + 12 + Math.cos(a) * 10, y - 26 + Math.sin(a) * 10,
            -Math.sin(a) * 90, Math.cos(a) * 90, 0, 0.14, 9, slashColor);
        }
        return;
      }
      default:
        fill('spark', x + 10, y - 28, 90, -50, 0, 0.14, 16, slashColor);
        fill('spark', x + 4, y - 18, 40, -80, 0, 0.12, 12, slashColor);
        return;
    }
  }
  if (e.kind === 'hit' || e.kind === 'floorCollapse') {
    const footY = VIEW.GROUND_Y - s.player.y;
    weaponBurst(s.weapon, e.kind, x, y, footY, JUICE[e.kind]?.particles ?? 0, e.mat);
    if (s.gimmick === 'glass') glassBurst(x, y, e.kind === 'floorCollapse' ? JUICE_SYS.GLASS_CHIPS : JUICE_SYS.GLASS_CHIPS_HIT);
    return;
  }
  if (e.kind === 'supply') {
    if (crates.length >= CRATE_MAX) crates.shift();
    crates.push({ item: e.item ?? 'hat', x, y0: y, y, vy: -200, t: 0, bounced: false, opened: false });
    dust(x, y, (JUICE.supply?.particles ?? 8) >> 1);
    return;
  }
  if (e.kind === 'hatBreak') {
    // 흰 파편(잉크 외곽선) 5개 + 남은 수만큼 먼지
    const n = JUICE.hatBreak?.particles ?? 10;
    shards(x, y, 5, undefined, 1.1, HAT_WHITE, 'chip');
    dust(x, y, Math.max(0, n - 5));
    return;
  }
  if (e.kind === 'special') {
    const n = JUICE.special?.particles ?? 0;
    spawnHitParticles('special', x, y, n, e.mat);
    spawnFixed = true; // 화면 중앙 폭발은 카메라를 안 탄다
    spawnHitParticles('special', VIEW.W / 2, VIEW.FIELD_H / 2, n, e.mat);
    spawnFixed = false;
    return;
  }
  if (e.kind === 'guardBounce' && s.gimmick === 'ice') iceSparks(x, y, JUICE_SYS.ICE_SPARKS);
  spawnHitParticles(e.kind, x, y, JUICE[e.kind]?.particles ?? 0, e.mat);
}

/** glass 구역: 잉크 외곽선 두른 아이보리 유리 조각 + 파란 가는 반짝. PALETTE만 — 노랑 0. */
function glassBurst(x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    if (i % 3 === 2) {
      fill('spark', x + signed() * 10, y + signed() * 6, signed() * 140, -90 - n01() * 160, 600,
        0.22 + n01() * 0.16, 10 + n01() * 6, PALETTE.BLUE);
    } else {
      fill('chip', x + signed() * 14, y + signed() * 8, signed() * 150, -80 - n01() * 190, 980,
        0.45 + n01() * 0.35, 7 + n01() * 7, PALETTE.WHITE, { rot: signed() * Math.PI, spin: signed() * 10 });
    }
  }
}

/** ice 구역: 지면 가드 때 땅을 따라 번지는 차가운(파랑) 스파크 + 작은 링. 노랑 0. */
function iceSparks(x: number, y: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    fill('spark', x + dir * (6 + n01() * 20), y, dir * (90 + n01() * 140), -30 - n01() * 120, 500,
      0.22 + n01() * 0.14, 9 + n01() * 7, i % 3 === 0 ? PALETTE.INK : PALETTE.BLUE);
  }
  fill('ring', x, y, 0, 0, 70, 0.3, 12, PALETTE.BLUE);
}

/** 완파 — 층수(n)가 클수록 파편·링이 커진다. 층수 3 이상이면 노랑 링 한 줄이 더 붙는다. */
function stackBurst(x: number, y: number, n?: number): void {
  const k = stackScale(n);
  const count = Math.min(48, Math.round(JUICE.stackDestroy.particles * k));
  shards(x, y, count, undefined, 1.45 + 0.2 * k);
  fill('ring', x, y, 0, 0, 60 * k, 0.30, 14 * k, PALETTE.INK);
  if ((n ?? 0) >= JUICE_SYS.STACK_RING_FLOORS) fill('ring', x, y, 0, 0, 110 * k, 0.42, 26 * k, PALETTE.YELLOW);
}

/** 번개 착탄 — 땅에서 솟는 세로 불꽃(노랑·잉크) + 먼지 + 작은 링. */
function boltStrikeBurst(x: number, groundY: number, n: number): void {
  for (let i = 0; i < n; i++) {
    fill(
      'spark',
      x + signed() * 10, groundY - 2,
      signed() * 45, -420 - n01() * 320,
      900,
      0.18 + n01() * 0.14,
      14 + n01() * 8,
      i % 2 === 0 ? PALETTE.YELLOW : PALETTE.INK,
    );
  }
  dust(x, groundY - 4, 6);
  fill('ring', x, groundY - 2, 0, 0, 44, 0.25, 8, PALETTE.INK);
}

/** 보스 격파 — 한가운데서 번지는 링 셋(잉크·노랑·잉크, 크기·수명이 달라 겹겹이 읽힌다). */
function defeatRings(x: number, y: number): void {
  fill('ring', x, y, 0, 0, 90, 0.45, 24, PALETTE.INK);
  fill('ring', x, y, 0, 0, 150, 0.62, 44, PALETTE.YELLOW);
  fill('ring', x, y, 0, 0, 230, 0.85, 70, PALETTE.INK);
}

/** 보스 입장 — 물고 온 층이 부서지는 틱: 파편 + 먼지. y는 월드(화면) 좌표. */
export function spawnBossBreak(x: number, y: number): void {
  // 층이 세 조각으로 갈라지니 조각마다 한 덩이씩(좌·중·우)
  const per = Math.ceil(JUICE.bossBreak.particles / 3);
  for (const dx of [-90, 0, 90]) {
    shards(x + dx, y, per, 'mid', 1.5);
    dust(x + dx, y, 3);
  }
}

/**
 * 필살로 사라진 건물을 층 단위로 흩뿌린다 — 예비동작이 끝나는 프레임의 해체.
 * 층마다 파편 셋, 여운으로 오래 남는 먼지 덩이 여덟. (높은 탑은 층을 솎아 상한을 지킨다)
 */
export function spawnStackShatter(stack: FallingStack): void {
  const cx = VIEW.LANE_X[0];
  const stepF = Math.max(1, Math.ceil(stack.floors.length / 12));
  let cum = 0;
  let total = 0;
  for (const f of stack.floors) total += f.h;
  stack.floors.forEach((f, i) => {
    const mid = VIEW.GROUND_Y - stack.y - cum - f.h / 2;
    cum += f.h;
    if (i % stepF !== 0) return;
    for (let j = 0; j < 3; j++) {
      fill(
        'shard',
        cx + signed() * VIEW.LANE_W * 0.4, mid + signed() * f.h * 0.3,
        signed() * 230, -120 - n01() * 260,
        980,
        0.5 + n01() * 0.5,
        4 + n01() * 5,
        matDust(f.mat),
        { rot: signed() * Math.PI, spin: signed() * 10 },
      );
    }
  });
  // 여운 — 건물이 서 있던 자리에 먼지가 20틱 넘게 남는다
  const top = VIEW.GROUND_Y - stack.y - total;
  for (let i = 0; i < 8; i++) {
    fill(
      'dust',
      cx + signed() * VIEW.LANE_W * 0.42, top + n01() * total,
      signed() * 30, -20 - n01() * 30,
      0,
      0.85 + n01() * 0.4,
      8 + n01() * 7,
      DUST[i % 3],
    );
  }
}

/**
 * drawGame용 스텝. 히트스톱과 무관하게 매 드로우 호출할 것.
 * ★08-30(P1-5): rAF마다 고정 TICK을 적분하면 120Hz 기기에서 파티클이 2배속,
 * 프레임 드랍 시 슬로우가 된다 — 실경과 시간으로 적분한다.
 * slow = 배속(1 = 실시간). 보스 격파·사망 직후 파티클만 느리게 흘릴 때 쓴다(core 틱은 그대로).
 */
let fxLastNow = -1;
export function tickEffects(slow = 1): void {
  const now = typeof performance !== 'undefined' ? performance.now() : -1;
  if (now < 0 || fxLastNow < 0) {
    fxLastNow = now;
    updateEffects(TICK * slow);
    return;
  }
  const dt = Math.min((now - fxLastNow) / 1000, 0.05);
  fxLastNow = now;
  updateEffects((dt > 0 ? dt : TICK) * slow);
}

/** shake transform이 적용된 ctx에 그린다. cam = 렌더 카메라(월드 좌표 → 화면). 월드(플레이어 다음) ~ HUD 전. */
export function drawEffects(ctx: CanvasRenderingContext2D, cam = 0): void {
  if (crates.length) {
    ctx.save();
    ctx.translate(0, cam);
    drawCrates(ctx);
    ctx.restore();
  }
  if (live <= 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < POOL; i++) {
    const p = pool[i];
    if (!p.alive) continue;
    const t = Math.max(0, p.life / p.maxLife);
    const py = p.y + (p.fixed ? 0 : cam);
    ctx.globalAlpha = t;
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;
    switch (p.style) {
      case 'spark': {
        const ang = Math.atan2(p.vy, p.vx);
        const slash = p.size > 16;
        const len = p.size + Math.hypot(p.vx, p.vy) * (slash ? 0.06 : 0.018);
        ctx.lineWidth = slash ? 2.6 : 1.4;
        ctx.beginPath();
        ctx.moveTo(p.x, py);
        ctx.lineTo(p.x - Math.cos(ang) * len, py - Math.sin(ang) * len);
        ctx.stroke();
        break;
      }
      case 'shard': {
        ctx.save();
        ctx.translate(p.x, py);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size * 0.5, -p.size * 0.28, p.size, p.size * 0.56);
        ctx.restore();
        break;
      }
      case 'chip': {
        ctx.save();
        ctx.translate(p.x, py);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size * 0.5, -p.size * 0.35, p.size, p.size * 0.7);
        ctx.strokeStyle = PALETTE.INK;
        ctx.lineWidth = 1;
        ctx.strokeRect(-p.size * 0.5, -p.size * 0.35, p.size, p.size * 0.7);
        ctx.restore();
        break;
      }
      case 'dust': {
        ctx.globalAlpha = t * 0.5;
        ctx.beginPath();
        ctx.arc(p.x, py, p.size * (1.35 - 0.35 * t), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'cream': {
        ctx.beginPath();
        ctx.arc(p.x, py, p.size, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'ring': {
        const k = 1 - t;
        ctx.globalAlpha = t;
        ctx.lineWidth = 2.4 * t;
        ctx.beginPath();
        ctx.arc(p.x, py, p.size + k * (p.g > 0 ? p.g : 52), 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      default: {
        ctx.beginPath();
        ctx.arc(p.x, py, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}
