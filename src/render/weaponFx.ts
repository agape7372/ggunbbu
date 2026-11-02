// 연장 넷 · 그림 없던 순간 셋(게이지 참 · 콤보 끊김 · 깔림 탈출) · 마스크 도트 — 렌더 전용(core·히트스톱 무관).
// 풀·뿌리개·그리기 틀은 bladeFx를 빌린다: bladeReact가 이벤트마다 맨 먼저 weaponReact를 부르고,
// bladeFx 그리기가 모르는 Kind는 drawWeaponBit로 넘어온다. 좌표 계약도 같다(월드 좌표, 그릴 때 cam — BL-09).
// 연장은 「먹 한 획」(docs/INK_FX_2026-11-01.md §4): 무기가 한 일이 붓 획으로 남는다. 포인트 색(WEAPON_INK)은 벤 순간의 획 속에만,
// 알파로 지우지 않고 꼬리부터 깎는다. 맞은 자리 먹 튐 · 방울은 effects(공통 사건) 몫이라 여기서 다시 그리지 않는다(오함마 발묵만 예외).
// 연타 한 줄(지난 타격에서 0.6초 안)은 1·2·3타로 돌며 획이 내려베기 → 올려베기 → 가로로 바뀌고 3타째가 조금 크다.
// 조각 Kind는 bladeFx 목록의 이름을 빌려 뜻만 바꿔 쓴다 — hook = 붓 획 · disc = 먹 튐 · chunk = 나는 먹 · nail = 불티 분수 · arc = 끊긴 붓 고리.

import type { GameState, JuiceEvent, WeaponId } from '../core/types';
import { PALETTE, TICK, VIEW, WEAPON_FX, WEAPON_INK } from '../config';
import {
  N, keepBits, n01, pool, put, scaled, sgn, tierK, vel, type Bit,
} from './bladeFx';
import { PRESS, brushArc, brushLine, inkDrop, inkSplat, popScale, spatter } from './ink';

const GROUND = VIEW.GROUND_Y;
const TAU = Math.PI * 2;
const INK = PALETTE.INK;
const GRAY = PALETTE.RUBBLE;  // 허공 · 끊긴 콤보 · 깔림 먼지

// ── 연타 줄 ──────────────────────────────────────────────────

/** 연타 줄의 한 박 — 몇 번째 타격 · 자국 각(라디안, 0 = 앞, −는 위) · 크기 배율 · 대검 잔상 기울기 */
export interface Beat { n: 1 | 2 | 3; ang: number; k: number; turn: number }
const BEATS: readonly Beat[] = [
  { n: 1, ang: 0.34, k: 1, turn: 0 },       // 내려베기
  { n: 2, ang: -0.46, k: 1, turn: -0.28 },  // 올려베기
  { n: 3, ang: 0.02, k: 1.25, turn: 0.12 }, // 가로 — 줄 끝이라 조금 크게
];
/** 지난 타격에서 이 틱 안에 다시 치면 같은 줄 — 0.6초 */
const BEAT_GAP = Math.round(0.6 / TICK);
let beatAt = -Infinity;
let beatI = 0;

/** 타격마다 한 번 — 시뮬 틱으로 잰다(히트스톱 동안에도 틱은 흐른다) */
function nextBeat(tick: number): Beat {
  if (tick === beatAt) return BEATS[beatI]; // 한 틱의 여러 타격(필살이 깬 층 여럿)은 한 박
  const d = tick - beatAt;
  beatI = d >= 0 && d <= BEAT_GAP ? (beatI + 1) % BEATS.length : 0;
  beatAt = tick;
  return BEATS[beatI];
}

// ── 먹 뿌리개 ────────────────────────────────────────────────

/** 붓 획 모양 — 베기(칼끝처럼 빠진다) · 감기(±1, 끝이 그쪽으로 갈고리처럼 감긴다) · 홈(고른 마른 획) · 튕김(댄 데가 굵다) */
const CUT = 0;
const GOUGE = 2;
const FLICK = 3;
/** 감기 획의 몸 누름 — 들어가며 굵어지고 끝까지 굵다(끝은 감긴 호가 튕김으로 받는다) */
const BODY = (s: number): number => Math.min(1, 0.35 + s / 0.12);
/** 불티 줄기가 떨어지는 무게(px/s²) */
const SPARK_G = 900;

/** 칼빛 설정이 고른 철거칼 획 속 색 — effects.setSlashColor가 먹 쪽 색으로 바꿔 넘긴다 */
let swordInk: string = WEAPON_INK.sword;
export function setSwordInk(c: string): void {
  swordInk = c;
}

/** 붓 획 하나 — (x, y) = 획 가운데, ang = 긋는 쪽, len · w = 길이 · 굵기, core = 벤 순간 획 속 색(c1과 같으면 속 없음) */
function stroke(x: number, y: number, ang: number, len: number, w: number, mode: number, life: number, core: string = INK, c1: string = INK): void {
  put('hook', x, y, { life, size: len, v: w, rot: ang, a: mode, c1, c2: core });
}

/** 튕김 획 — (x, y)에 붓을 대고 ang 쪽으로 len만큼 쳐낸다(금 · 가드가 쳐낸 획 — effects도 쓴다) */
export function inkFlick(x: number, y: number, ang: number, len: number, w: number, life: number): void {
  stroke(x + (Math.cos(ang) * len) / 2, y + (Math.sin(ang) * len) / 2, ang, len, w, FLICK, life);
}

/** 먹 튐 하나 — 친 쪽(ang)으로 길쭉하다. flat = 세로 배율(1 = 그대로 · 0.4 = 납작 눌림), core = 터진 순간 가운데 색 */
function splash(x: number, y: number, R: number, ang: number, life: number, core: string, flat = 1, drops = 5): void {
  put('disc', x, y, { life, size: R, rot: ang, v: flat, a: drops, c1: INK, c2: core });
}

/** 나는 먹 — kind 0 방울(머리가 나는 쪽) · 1 가루(마른 점) · 2 나뭇결 조각(가는 튕김 획이 돌며 난다) */
function flecks(x: number, y: number, n: number, dir: number, spread: number, spd: number, kind: 0 | 1 | 2, size: number, c1: string = INK, g = 900): void {
  for (let i = 0; i < n; i++) {
    const a = dir + sgn() * spread;
    put('chunk', x + sgn() * 5, y + sgn() * 3, {
      ...vel(a, spd * (0.55 + n01() * 0.6)), g, drag: kind === 1 ? 2.4 : 0.4,
      life: 0.3 + n01() * 0.18, size: size * (0.7 + n01() * 0.5), rot: a, spin: kind === 2 ? sgn() * 14 : 0, a: kind, c1,
    });
  }
}

/** 불티 분수 — 조각 하나가 dur초 동안 dir 쪽(±0.35)으로 n줄기를 차례로 뿜는다. 줄기는 0.12~0.24초 날고 처음 절반만 불티 색 */
function sparks(x: number, y: number, dir: number, n: number, dur: number, spd: number): void {
  put('nail', x, y, { life: dur + 0.26, size: spd, v: n, a: dur, rot: dir, c1: WEAPON_INK.grinder });
}

/** 개수 흔들림 — n−1 · n · n+1 */
const jn = (n: number): number => Math.max(1, n + Math.round(sgn()));

/** 오함마 금 — 맞은 자리에서 밑면을 따라 좌우로 갈라지는 마른 튕김 획. 층 몸 쪽(위)으로 조금씩 기운다 */
function cracks(x: number, y: number, n: number, len: number, life: number): void {
  for (let i = 0; i < n; i++) {
    const right = i % 2 === 0;
    const tilt = (i < 2 ? 0.06 : 0.18 + 0.12 * (i >> 1)) + n01() * 0.1;
    inkFlick(x + (right ? 3 : -3), y, right ? -tilt : Math.PI + tilt, len * (0.55 + 0.5 * n01()) * (i < 2 ? 1 : 0.7), 3.6, life + n01() * 0.06);
  }
}

// ── 연장 넷 ──────────────────────────────────────────────────

/** (x, y) = 친 자리, b = 연타 줄 박자, k = 콤보 단(tierK). 헛스윙은 발 자리에서 그 무기 끝을 잡는다 */
interface Tool {
  hit(x: number, y: number, b: Beat, k: number): void;
  floor(x: number, y: number, b: Beat, k: number): void;
  destroy(x: number, y: number, k: number): void;
  whiff(footX: number, footY: number): void;
}

const TOOLS: Partial<Record<WeaponId, Tool>> = {
  // 철거칼 — 가장 맑은 한 획. 벤 순간 획 속이 황(칼빛 설정 색)으로 비쳤다 먹으로 마른다. 덧붙이는 것 없음
  sword: {
    hit(x, y, b, k) {
      const a = b.ang + sgn() * 0.08;
      stroke(x + sgn() * 6, y, a, 72 * b.k, 6 * b.k, CUT, 0.28, swordInk);
      if (k >= 1.5) stroke(x + sgn() * 4, y + 4, a - 0.8, 36, 3, CUT, 0.22); // 100콤보부터 겹베기 — 가는 둘째 획
    },
    floor(x, y, b) {
      stroke(x, y, b.ang + sgn() * 0.06, 104 * b.k, 9, CUT, 0.34, swordInk);
    },
    destroy(x, y) {
      stroke(x, y, -0.55 + sgn() * 0.08, 170, 12, CUT, 0.42, swordInk); // 같은 틱 층 깨기 획과 엇갈려 X로 — 한 덩이로 뭉치지 않게
    },
    whiff(footX, footY) {
      stroke(footX + 32, footY - 30, -0.95 + sgn() * 0.15, 30, 3, CUT, 0.16, GRAY, GRAY); // 허공 — 옅은 회색 획 하나
    },
  },
  // 오함마 — 베지 않고 누른다: 맞은 자리에 납작하게 눌린 큰 먹(발묵) · 밑면을 따라 갈라지는 마른 금 · 콘크리트 가루
  hammer: {
    hit(x, y, b, k) {
      splash(x, y + 3, 10 * b.k, sgn() < 0 ? Math.PI : 0, 0.3, WEAPON_INK.hammer, 0.42);
      cracks(x, y + 2, 3 + (b.n === 3 ? 1 : 0), 24 * b.k, 0.32);
      flecks(x, y + 2, jn(N(3, k)), -Math.PI / 2, 1.2, 120, 1, 1.8, WEAPON_INK.hammer, 300);
    },
    floor(x, y, b, k) {
      splash(x, y + 4, 16, b.n === 2 ? 0 : Math.PI, 0.36, WEAPON_INK.hammer, 0.38, 6);
      cracks(x, y + 2, 5, 44, 0.38);
      flecks(x, y + 2, jn(N(5, k)), -Math.PI / 2, 1.3, 150, 1, 2, WEAPON_INK.hammer, 300);
    },
    destroy(x, _y, k) {
      // 건물이 통째로 무너지면 땅이 운다 — 땅에 눌린 먹 · 땅을 따라 가는 금
      splash(x, GROUND - 2, 22, sgn() < 0 ? Math.PI : 0, 0.42, WEAPON_INK.hammer, 0.3, 7);
      cracks(x, GROUND - 1, 5, 70, 0.44);
      flecks(x, GROUND - 4, N(7, k), -Math.PI / 2, 1.2, 170, 1, 2.2, WEAPON_INK.hammer, 300);
    },
    whiff(footX, footY) {
      flecks(footX + 33, footY - 22, 3, -Math.PI / 2, 1.4, 60, 1, 1.4, GRAY, 200); // 허공을 친 바람 — 마른 가루 몇 점
    },
  },
  // 빠루 — 비틀어 젖힌다: 끝이 갈고리로 감기는 획(쪽빛 속) · 뜯겨 튀는 나뭇결 조각
  crowbar: {
    hit(x, y, b, k) {
      const a = b.ang + sgn() * 0.08;
      stroke(x + sgn() * 6, y, a, 64 * b.k, 6 * b.k, n01() < 0.5 ? 1 : -1, 0.3, WEAPON_INK.crowbar);
      flecks(x, y, jn(N(2, k)) + (b.n === 3 ? 1 : 0), -Math.PI / 2 + b.ang, 0.9, 300, 2, 10);
      if (k >= 1.5) stroke(x + sgn() * 4, y + 4, a - 0.8, 34, 3, CUT, 0.22);
    },
    floor(x, y, b, k) {
      stroke(x - 6, y, b.ang + sgn() * 0.06, 90 * b.k, 8.5, 1, 0.34, WEAPON_INK.crowbar);
      flecks(x, y, jn(N(5, k)), -Math.PI / 2, 1, 360, 2, 12);
    },
    destroy(x, y, k) {
      stroke(x - 10, y, -0.55 + sgn() * 0.08, 120, 11, 1, 0.42, WEAPON_INK.crowbar); // 층 깨기 획과 엇갈린다
      flecks(x, y, N(6, k), -Math.PI / 2, 1.2, 420, 2, 13);
    },
    whiff(footX, footY) {
      stroke(footX + 34, footY - 40, -1.2 + sgn() * 0.15, 26, 3, 1, 0.16, GRAY, GRAY);
    },
  },
  // 그라인더 — 갈린다: 맞은 자리에서 원판이 도는 쪽 뒤(아래 · 뒤)로 불티가 0.15초 동안 계속 뿜어지고,
  // 밑면엔 긁힌 홈(마른 가로 획)이 남았다 깎이고, 쇳가루가 떨어진다. 원판 그림은 없다(손에 든 원판이 돈다)
  grinder: {
    hit(x, y, b, k) {
      stroke(x + 12, y + 1, sgn() * 0.04, 38 * b.k, 5, GOUGE, 0.42, WEAPON_INK.grinder);
      sparks(x, y + 3, 2.5 + b.ang * 0.5 + sgn() * 0.06, jn(N(10, k)) + (b.n === 3 ? 3 : 0), 0.16, 480);
      flecks(x, y + 3, 2, 2.3, 0.5, 120, 1, 1.5);
    },
    floor(x, y, b, k) {
      stroke(x + 16, y + 1, sgn() * 0.03, 62, 6.5, GOUGE, 0.5, WEAPON_INK.grinder);
      sparks(x, y + 3, 2.5 + b.ang * 0.5, N(16, k), 0.22, 500);
      flecks(x, y + 3, 4, 2.3, 0.6, 150, 1, 1.7);
    },
    destroy(x, y, k) {
      stroke(x + 6, y, 0.06, 104, 8, GOUGE, 0.56, WEAPON_INK.grinder);
      sparks(x, y + 3, 2.45, N(22, k), 0.28, 560);
      flecks(x, y + 3, 6, 2.3, 0.7, 170, 1, 1.8);
    },
    whiff(footX, footY) {
      sparks(footX + 29, footY - 20, 2.6, 4, 0.08, 260); // 헛돈 원판 — 불티 몇 줄기
    },
  },
};

// ── 그림 없던 순간 셋 ─────────────────────────────────────────

/** 필살 게이지가 다 찬 순간 — 몸 양옆에서 먹 방울 넷이 천천히 피어오른다(몸을 감는 먹 엔소는 effects — 필살 예비동작이 긋는 원의 예고) */
function gaugeFull(x: number, y: number): void {
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1;
    put('chunk', x + side * (15 + n01() * 8), y + 12 - i * 7, {
      vx: side * (8 + n01() * 8), vy: -80 - n01() * 40, g: -60, drag: 1.6,
      life: 0.4 + n01() * 0.1, size: 2 + n01() * 0.8, rot: -Math.PI / 2, a: 0, c1: INK,
    });
  }
}

/** 콤보가 끊겼다 — 회색 붓 고리가 셋으로 끊어져 흩어진다(번쩍 없음). 토막은 가늘어지며 꼬리부터 깎인다 */
function comboBreak(x: number, y: number): void {
  const r = 13;
  const rot = n01() * TAU;
  for (let i = 0; i < 3; i++) {
    const a = rot + (i * TAU) / 3;
    put('arc', x + Math.cos(a) * r, y + Math.sin(a) * r, {
      ...vel(a, 50 + n01() * 30), g: 240, drag: 1.4, life: 0.42 + n01() * 0.1, size: r, v: 3.4, rot: a, spin: sgn() * 2, c1: GRAY, a: 1.6,
    });
  }
}

/** 깔림 탈출 — 발밑에서 위로 튀는 먹 하나 · 마른 먼지 · 방울 몇 */
function pinEscape(x: number, y: number): void {
  splash(x, y - 4, 12, -Math.PI / 2, 0.34, INK, 0.55, 6);
  flecks(x, y - 10, 6, -Math.PI / 2, 1.3, 240, 1, 2, GRAY, 600);
  flecks(x, y - 10, 3, -Math.PI / 2, 0.8, 320, 0, 2.4);
}

// ── 마스크 도트 ──────────────────────────────────────────────

let maskInk: readonly string[] = [];

/** 쓰고 있는 마스크의 색 — 필살·완파 때 그 색 네모 도트가 흩어진다. null·빈 목록이면 안 흩어진다 */
export function setFxMask(colors: readonly string[] | null): void {
  maskInk = colors ?? [];
}

/** 네모 도트 — 돌며 튀어 올랐다 떨어져 두 번 튄다 */
function pixels(x: number, y: number, n: number, spd: number): void {
  if (!maskInk.length) return;
  for (let i = 0; i < n; i++) {
    put('pix', x + sgn() * 14, y + sgn() * 10, {
      ...vel(-Math.PI / 2 + sgn() * 1.4, spd * (0.5 + n01() * 0.7)), g: 1200,
      life: 0.8 + n01() * 0.4, size: 3.5 + n01() * 2.5, rot: n01() * TAU, spin: sgn() * 9,
      c1: maskInk[i % maskInk.length], bounce: 2,
    });
  }
}

// ── 들머리 ───────────────────────────────────────────────────

/**
 * bladeReact가 이벤트마다 맨 먼저 부른다 — 연장 넷의 타격·층 깨기·완파·헛스윙, 필살 셋(예비동작 뒤 풀린 시점의 졸라맨 자리),
 * 게이지 참·콤보 끊김·깔림 탈출, 마스크 도트. 돌려주는 박자는 대검 베기 자국·잔상도 쓴다(타격이 아니면 1타)
 */
export function weaponReact(s: GameState, e: JuiceEvent): Beat {
  const strike = e.kind === 'hit' || e.kind === 'bossHit' || e.kind === 'butterCollapse' || e.kind === 'floorCollapse';
  const b = strike ? nextBeat(s.tick) : BEATS[0];
  const footX = VIEW.LANE_X[s.player.lane];
  const footY = GROUND - s.player.y;
  const x = VIEW.LANE_X[e.lane ?? s.player.lane];
  switch (e.kind) {
    case 'special':
      // 필살 그림은 wazaShow가 맡는다 — 여기선 마스크 도트만. 같은 틱 층 깨기·완파 조각이 풀을 넘겨도 남는다
      keepBits(() => pixels(x, footY - 31, 12, 420));
      return b;
    case 'gaugeFull':
      gaugeFull(footX, footY - 31);
      return b;
    case 'comboBreak':
      comboBreak(footX, footY - 31);
      return b;
    case 'pinEscape':
      pinEscape(footX, footY);
      return b;
    case 'stackDestroy':
      pixels(x, footY - 70, 8, 380); // 대검도 — 마지막 층이 있던 머리 위
      break;
    default:
  }
  const t = TOOLS[s.weapon];
  if (!t) return b;
  const k = tierK(e.combo ?? s.combo);
  const y = GROUND - (e.y ?? s.player.y);
  switch (e.kind) {
    case 'hit':
    case 'bossHit':
    case 'butterCollapse':
      scaled(x, y, WEAPON_FX.SIZE, () => t.hit(x, y, b, k));
      break;
    case 'floorCollapse':
      scaled(x, y, WEAPON_FX.SIZE, () => t.floor(x, y, b, k));
      break;
    case 'stackDestroy':
      scaled(x, footY - 70, WEAPON_FX.SIZE, () => t.destroy(x, footY - 70, k));
      break;
    case 'slash':
      t.whiff(footX, footY);
      break;
    default:
  }
  return b;
}

/** 필살 박자 — 그 연장의 타격 · 층 깨기 · 완파 그림 하나(줄 끝 가로 박자 · 콤보 단 1.5). 키우기 · 지키기는 bladeFx.weaponBurst가 */
export function toolBurst(w: WeaponId, x: number, y: number, power: 'hit' | 'floor' | 'destroy'): void {
  const t = TOOLS[w];
  if (!t) return;
  if (power === 'destroy') t.destroy(x, y, 1.5);
  else t[power](x, y, BEATS[2], 1.5);
}

/** resetBladeFx가 부른다 — 연타 줄을 처음부터. 마스크 색은 장착이라 그대로 둔다 */
export function resetWeaponFx(): void {
  beatAt = -Infinity;
  beatI = 0;
}

/** 시험용 — 지금 살아 있는 조각 */
export function liveBits(): Bit[] {
  return pool.filter((p) => p.alive);
}

// ── 그리기 ───────────────────────────────────────────────────

/** bladeFx 그리기(drawBit)가 모르는 Kind — py = 카메라를 더한 화면 y */
export function drawWeaponBit(ctx: CanvasRenderingContext2D, p: Bit, py: number): void {
  const t = Math.max(0, p.life / p.max); // 1 → 0
  const u = 1 - t;                         // 0 → 1
  switch (p.k) {
    case 'pix': {
      const s = p.size * Math.min(1, t / 0.3); // 끝 3할에 오그라든다
      ctx.save();
      ctx.translate(p.x, py);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c1;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.strokeStyle = INK; // 흰 도트도 아이보리 위에서 보이게
      ctx.lineWidth = 0.8;
      ctx.strokeRect(-s / 2, -s / 2, s, s);
      ctx.restore();
      return;
    }
    case 'hook': {
      // 붓 획 — 앞 12%에 그어지고(머리가 나아간다) 35%부터 꼬리가 깎여 끝에 다 먹힌다. 벤 순간(앞 15%)엔 획 속이 포인트 색
      const s1 = Math.min(1, u / 0.12);
      const s0 = u < 0.35 ? 0 : Math.min(0.99, (u - 0.35) / 0.65);
      const mode = p.a;
      const L = p.size;
      const dx = Math.cos(p.rot);
      const dy = Math.sin(p.rot);
      const x0 = p.x - (dx * L) / 2;
      const y0 = py - (dy * L) / 2;
      const core = u < 0.35 && p.c2 !== p.c1;
      if (mode === 1 || mode === -1) {
        // 감기 — 곧은 몸(앞 72%) 끝에서 mode 쪽으로 작은 호가 감겨 튕겨 나간다. 몸 굵기 그대로 호로 이어진다
        const B = 0.72;
        const xm = x0 + dx * L * 0.78;
        const ym = y0 + dy * L * 0.78;
        const r = L * 0.2;
        const nx = Math.cos(p.rot + (mode * Math.PI) / 2);
        const ny = Math.sin(p.rot + (mode * Math.PI) / 2);
        const b0 = s0 / B;
        const b1 = Math.min(1, s1 / B);
        ctx.fillStyle = p.c1;
        if (b0 < 1) brushLine(ctx, x0, y0, xm, ym, p.v, b0, b1, 0.3, p.seed, 0, BODY);
        if (s1 > B) brushArc(ctx, xm + nx * r, ym + ny * r, r, p.rot - (mode * Math.PI) / 2, mode * 2.4, p.v, Math.max(0, (s0 - B) / (1 - B)), (s1 - B) / (1 - B), 0.45, p.seed, 1, PRESS.flick);
        if (core && b0 < 0.6) {
          ctx.fillStyle = p.c2;
          brushLine(ctx, x0, y0, xm, ym, p.v * 0.42, Math.max(b0, 0.12), b1 * 0.9, 0, p.seed, 0, BODY);
        }
        return;
      }
      const x1 = p.x + (dx * L) / 2;
      const y1 = py + (dy * L) / 2;
      const pr = mode === GOUGE ? PRESS.line : mode === FLICK ? PRESS.flick : PRESS.cut;
      const dry = mode === GOUGE ? 0.85 : mode === FLICK ? 0.6 : 0.42; // 곧은 획도 꼬리는 붓털로 갈라진다
      const bend = mode === GOUGE ? 0 : (hash(p.seed, 1) - 0.5) * L * 0.16;
      ctx.fillStyle = p.c1;
      brushLine(ctx, x0, y0, x1, y1, p.v, s0, s1, dry, p.seed, bend, pr);
      if (core) {
        ctx.fillStyle = p.c2;
        brushLine(ctx, x0, y0, x1, y1, p.v * 0.42, Math.max(s0, 0.1), s1 * 0.8, 0, p.seed, bend, pr);
      }
      return;
    }
    case 'nail': {
      // 불티 분수 — 줄기 i는 (i/n)·a초에 나와 0.12~0.24초 날며 꼬리를 끈다(머리가 굵은 튕김 획). 처음 절반은 불티 색, 식으면 먹
      const age0 = p.max - p.life;
      for (let i = 0; i < p.v; i++) {
        const h1 = hash(p.seed, i);
        const h2 = hash(p.seed, i + 40);
        const age = age0 - (p.a * i) / p.v - h1 * 0.02;
        const span = 0.12 + 0.12 * h2;
        if (age <= 0 || age >= span) continue;
        const ang = p.rot + (hash(p.seed, i + 80) - 0.5) * 0.7;
        const sp = p.size * (0.6 + 0.6 * h2);
        const vx = Math.cos(ang) * sp;
        const vy = Math.sin(ang) * sp + SPARK_G * age;
        const hx = p.x + vx * age;
        const hy = py + Math.sin(ang) * sp * age + 0.5 * SPARK_G * age * age;
        const f = 1 - age / span;
        const len = (8 + sp * 0.035) * (0.4 + 0.6 * f);
        const v = Math.hypot(vx, vy) || 1;
        ctx.fillStyle = age < span * 0.5 ? p.c1 : INK;
        brushLine(ctx, hx, hy, hx - (vx / v) * len, hy - (vy / v) * len, 1 + 1.6 * f, 0, 1, 0, p.seed + i, 0, PRESS.flick);
      }
      return;
    }
    case 'disc': {
      // 먹 튐 — 친 쪽으로 튄 덩이가 부풀었다 오그라든다(popScale). 터진 순간(앞 15%)엔 가운데가 포인트 색. v = 세로 배율
      const R = p.size * popScale(u);
      ctx.save();
      ctx.translate(p.x, py);
      ctx.scale(1, p.v || 1);
      ctx.fillStyle = p.c1;
      spatter(ctx, 0, 0, R, p.rot, p.seed, p.a);
      if (u < 0.15 && p.c2 !== p.c1) {
        ctx.fillStyle = p.c2;
        spatter(ctx, 0, 0, R * 0.5, p.rot, p.seed, 0);
      }
      ctx.restore();
      return;
    }
    case 'chunk': {
      // 나는 먹 — 끝 35%에 오그라든다. 땅에 닿은 방울은 납작하게 번졌다 오그라든다
      const k = Math.min(1, t / 0.35);
      ctx.fillStyle = p.c1;
      if (p.a === 2) {
        // 나뭇결 조각 — 도는 가는 튕김 획
        const dx = (Math.cos(p.rot) * p.size) / 2;
        const dy = (Math.sin(p.rot) * p.size) / 2;
        brushLine(ctx, p.x - dx, py - dy, p.x + dx, py + dy, 2.6 * k, 0, 1, 0, p.seed, p.size * 0.12, PRESS.flick);
        return;
      }
      if (p.a === 0 && p.vy === 0 && p.y >= GROUND - 0.5) {
        inkSplat(ctx, p.x, py, p.size * 1.6, p.life / 0.12, p.seed);
        return;
      }
      const sp = Math.hypot(p.vx, p.vy);
      inkDrop(ctx, p.x, py, p.size * k * (p.a === 1 ? 0.6 : 1), Math.atan2(p.vy, p.vx), p.a === 1 ? 0 : Math.min(9, sp * 0.02) * k);
      return;
    }
    case 'arc': {
      // 끊어진 붓 고리 한 토막 — 토막 가운데를 축으로 돈다(고리 중심은 rot 반대쪽 size 거리). 가늘어지며 꼬리부터 깎인다
      ctx.save();
      ctx.translate(p.x, py);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c1;
      brushArc(ctx, -p.size, 0, p.size, -p.a / 2, p.a, p.v * (0.45 + 0.55 * t), u < 0.4 ? 0 : ((u - 0.4) / 0.6) * 0.95, 1, 0.35, p.seed);
      ctx.restore();
      return;
    }
    default:
  }
}

/** 0~1 고정 난수 — 같은 조각은 매 프레임 같은 모양 */
function hash(seed: number, k: number): number {
  const h = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return h - Math.floor(h);
}
