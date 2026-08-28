// 타격감 파티클 풀 — JUICE.*.particles 를 소비해 프로시저럴 점/선/먼지를 뿌린다.
// 고정 풀 JUICE_SYS.PARTICLE_POOL(256). 초과 시 링 커서로 오래된 슬롯 재활용.
// core rngState와 무관한 렌더 LCG. DOM/에셋 import 없음 (canvas 2d만).
// 히트스톱 중에도 updateEffects는 호출되어야 한다(정지감 속 운동감).

import type { GameState, JuiceEvent } from '../core/types';
import { DEBRIS, JUICE, JUICE_SYS, PALETTE, TICK, VIEW } from '../config';

type Style = 'spark' | 'shard' | 'dust' | 'cream' | 'ring' | 'pollen';

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
}

const POOL = JUICE_SYS.PARTICLE_POOL;
const DUST = ['#B9B3A6', '#948E82', '#6E695F'] as const;

function blank(): Particle {
  return {
    alive: false,
    style: 'spark',
    x: 0, y: 0, vx: 0, vy: 0, g: 0,
    life: 0, maxLife: 1,
    size: 1, rot: 0, spin: 0,
    color: PALETTE.INK,
    bounce: 0,
  };
}

const pool: Particle[] = Array.from({ length: POOL }, blank);
let allocAt = 0;
let live = 0;
let fxSeed = 1;

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

function shards(x: number, y: number, n: number, mat: string | undefined, amp: number): void {
  for (let i = 0; i < n; i++) {
    fill(
      'shard',
      x + signed() * 14 * amp, y + signed() * 8,
      signed() * 160 * amp, -70 - n01() * 200 * amp,
      980,
      0.35 + n01() * 0.40,
      2.5 + n01() * 4 * amp,
      matDust(mat),
      { rot: signed() * Math.PI, spin: signed() * 10 },
    );
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
    case 'special':
      fill('ring', x, y, 0, 0, 0, 0.28, 14, PALETTE.YELLOW);
      radial(x, y, Math.max(0, count - 1), PALETTE.INK);
      return;
    case 'hurt':
      dust(x, y, count);
      return;
    case 'guardBounce':
      sparks(x, y, count, '#6E695F', 70, 180);
      return;
    case 'guardAirBounce':
      sparks(x, y, count, '#6E695F', 90, 220);
      return;
    case 'bossDefeat': {
      const rings = count >= 8 ? 1 : 0;
      const seeds = Math.floor(count * 0.55);
      const bits = Math.max(0, count - rings - seeds);
      if (rings) fill('ring', x, y, 0, 0, 0, 0.45, 22, PALETTE.YELLOW);
      shards(x, y, bits, undefined, 2.1);
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
  if (live <= 0) return;
  const step = dt > 0 ? Math.min(dt, 0.05) : TICK;
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
  const y = VIEW.GROUND_Y - (e.y ?? s.player.y);
  if (e.kind === 'slash') {
    fill('spark', x + 10, y - 28, 90, -50, 0, 0.14, 16, PALETTE.YELLOW);
    fill('spark', x + 4, y - 18, 40, -80, 0, 0.12, 12, PALETTE.YELLOW);
    return;
  }
  spawnHitParticles(e.kind, x, y, JUICE[e.kind]?.particles ?? 0, e.mat);
}

/** drawGame용 1프레임 스텝. 히트스톱과 무관하게 매 드로우 호출할 것. */
export function tickEffects(): void {
  updateEffects(TICK);
}

/** shake transform이 적용된 ctx에 그린다. 월드(플레이어 다음) ~ HUD 전. */
export function drawEffects(ctx: CanvasRenderingContext2D): void {
  if (live <= 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < POOL; i++) {
    const p = pool[i];
    if (!p.alive) continue;
    const t = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = t;
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;
    switch (p.style) {
      case 'spark': {
        const ang = Math.atan2(p.vy, p.vx);
        const len = p.size + Math.hypot(p.vx, p.vy) * 0.018;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - Math.cos(ang) * len, p.y - Math.sin(ang) * len);
        ctx.stroke();
        break;
      }
      case 'shard': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size * 0.5, -p.size * 0.28, p.size, p.size * 0.56);
        ctx.restore();
        break;
      }
      case 'dust': {
        ctx.globalAlpha = t * 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.35 - 0.35 * t), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'cream': {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'ring': {
        const k = 1 - t;
        ctx.globalAlpha = t;
        ctx.lineWidth = 2.4 * t;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + k * 52, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      default: {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}
