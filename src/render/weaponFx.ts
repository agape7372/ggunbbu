// 연장 넷 · 필살 셋 · 그림 없던 순간 셋(게이지 참 · 콤보 끊김 · 깔림 탈출) · 마스크 도트 — 렌더 전용(core·히트스톱 무관).
// 풀·뿌리개·그리기 틀은 bladeFx를 빌린다: bladeReact가 이벤트마다 맨 먼저 weaponReact를 부르고,
// bladeFx 그리기가 모르는 Kind는 drawWeaponBit로 넘어온다. 좌표 계약도 같다(월드 좌표, 그릴 때 cam — BL-09).
// 값 위계 — 연장(0~400 먼지)은 대검(450~)보다 수수하다: 가는 자국과 알갱이 몇 개뿐, 잔상·칼 기운·물들임이 없다.
// 연타 한 줄(지난 타격에서 0.6초 안)은 1·2·3타로 돌며 자국이 내려베기 → 올려베기 → 가로로 바뀌고 3타째가 조금 크다.
// effects.ts의 연장 파편(weaponBurst)과 겹쳐 그려진다 — 거기 있는 모양은 다시 그리지 않는다.

import type { GameState, JuiceEvent, WazaId, WeaponId } from '../core/types';
import { CAMERA, PALETTE, TICK, VIEW } from '../config';
import {
  HOT, N, SPARK, cut, drawBladeFx, keepBits, n01, pool, put, resetBladeFx, ring, sgn, shardSpray, sparkFan, spikes, tierK, twinkle,
  updateBladeFx, vel, type Bit,
} from './bladeFx';

const GROUND = VIEW.GROUND_Y;
const TAU = Math.PI * 2;
const INK = PALETTE.INK;
const PAPER = '#FFFFFF';
const GRAY = PALETTE.RUBBLE;  // 허공 · 끊긴 콤보
const STEEL = '#B4BAC0';      // 못·나사 · 갈고리 속 · 철거칼 쇳조각
const IRON = '#948E82';       // 오함마 쇠머리 · 깔림 철판(sprites와 같은 색)
const DISC = '#E2DED3';       // 그라인더 원판(sprites와 같은 색)
const DULL = '#6E695F';       // 오함마 납작 고리 — 먼지 진한 색
const DENT = '#CFC6B0';       // 구겨진 별 — 바랜 황토
const DUST = '#B9B3A6';       // 깔림 탈출 먼지 조각
const SHIELD = '#BFD3E2';     // 철벽 방패 — 강철 하늘색
const SHADE = '#E4DCCB';      // 접힌 종이의 그늘 면
const CRACK_STEP = 22;        // 균열 마디(px)

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
/** 철벽 방패가 따라갈 판 — 공중에서 써도 떨어지는 몸 둘레에 머문다(리벳·판 조각은 월드에 남는다) */
let shieldOf: GameState | null = null;

/** 타격마다 한 번 — 시뮬 틱으로 잰다(히트스톱 동안에도 틱은 흐른다) */
function nextBeat(tick: number): Beat {
  if (tick === beatAt) return BEATS[beatI]; // 한 틱의 여러 타격(필살이 깬 층 여럿)은 한 박
  const d = tick - beatAt;
  beatI = d >= 0 && d <= BEAT_GAP ? (beatI + 1) % BEATS.length : 0;
  beatAt = tick;
  return BEATS[beatI];
}

/** 개수 흔들림 — n−1 · n · n+1 */
const jn = (n: number): number => Math.max(1, n + Math.round(sgn()));

// ── 낱개 뿌리개 ──────────────────────────────────────────────

/** 쇳덩이 — 울퉁불퉁한 오각 덩이가 dir 쪽으로 튀어 묵직하게 떨어진다 */
function chunks(x: number, y: number, n: number, dir: number, spd: number): void {
  for (let i = 0; i < n; i++) {
    put('chunk', x + sgn() * 8, y + sgn() * 4, {
      ...vel(dir + sgn() * 0.7, spd * (0.5 + n01() * 0.7)), g: 1500,
      life: 0.5 + n01() * 0.3, size: 3.6 + n01() * 2, rot: n01() * TAU, spin: sgn() * 9, c1: IRON, c2: INK, bounce: 1,
    });
  }
}

/** 못과 나사(다섯에 둘 꼴) — 돌며 튀어 오른다 */
function nails(x: number, y: number, n: number, spd: number): void {
  for (let i = 0; i < n; i++) {
    put('nail', x + sgn() * 10, y + sgn() * 4, {
      ...vel(-Math.PI / 2 + sgn() * 1.25, spd * (0.5 + n01() * 0.6)), g: 1300,
      life: 0.7 + n01() * 0.35, size: 6 + n01() * 3, rot: n01() * TAU, spin: sgn() * 16,
      c1: STEEL, c2: INK, a: n01() < 0.4 ? 1 : 0, bounce: 1,
    });
  }
}

/** 갈고리 베기 — side = 끝이 감기는 쪽(1 = 자국 기준 아래) */
function hook(x: number, y: number, ang: number, len: number, thick: number, side: number, life = 0.2, rim: string = INK, core = STEEL): void {
  put('hook', x, y, { life, size: len, v: thick, rot: ang, a: side, c1: rim, c2: core });
}

/** 도는 원판 잔상 */
function disc(x: number, y: number, r: number, life: number, dir = 1): void {
  put('disc', x, y, { life, size: r, rot: n01() * TAU, spin: 26 * dir, c1: DISC, c2: SPARK });
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
  // 철거칼 — 가는 잉크 베기 자국과 짧은 쇳불꽃. 기본 무기라 제일 담백하다
  sword: {
    hit(x, y, b, k) {
      const a = b.ang + sgn() * 0.08;
      cut(x + sgn() * 6, y, a, 40 * b.k, 3.4 * b.k, INK, PAPER, 0, 0.16);
      // 자국이 나아가는 끝에서 튄다
      sparkFan(x + Math.cos(a) * 16, y + Math.sin(a) * 16, jn(N(2, k)) + (b.n === 3 ? 1 : 0), a - 0.6, a + 0.6, 150, 260, SPARK, HOT, 700, 0.12, 3.5);
    },
    floor(x, y, b, k) {
      const a = b.ang + sgn() * 0.08;
      cut(x, y, a, 62 * b.k, 4.6, INK, PAPER, 0, 0.2);
      cut(x + sgn() * 6, y + 3, a - 1.15 + sgn() * 0.1, 40, 3.4, INK, PAPER, 0, 0.18); // 엇갈린 둘째 자국
      ring(x, y, 4, 26, 0.18, INK);
      sparkFan(x, y, jn(N(5, k)), -2.8, -0.35, 200, 360, SPARK, HOT, 800, 0.16, 4);
    },
    destroy(x, y, k) {
      cut(x, y, 0.16 + sgn() * 0.1, 160, 6, INK, PAPER, 0, 0.26);
      ring(x, y, 6, 70, 0.3, INK);
      sparkFan(x, y, N(9, k), -3, -0.15, 240, 460, SPARK, HOT, 850, 0.22, 5);
      shardSpray(x, y, N(4, k), 300, 4.5, STEEL, INK);
    },
    whiff(footX, footY) {
      cut(footX + 32, footY - 30, -0.95 + sgn() * 0.15, 26, 2.2, GRAY, PAPER, 0, 0.12); // 허공 — 옅은 회색 자국 하나
    },
  },
  // 오함마 — 둔탁하다: 층 밑면을 따라 번지는 납작 고리 · 가시 다섯의 구겨진 별 · 굵은 쇳덩이, 건물이 무너지면 땅이 운다.
  // 발밑 둥근 고리는 effects가 그린다 — 여기 고리는 납작하고 친 자리에 선다
  hammer: {
    hit(x, y, b, k) {
      ring(x, y, 5, 34 * b.k, 0.22, DULL, 0.28);
      spikes(x + sgn() * 4, y + 2, 10 * b.k, 0.13, DENT, INK, 5);
      chunks(x, y, jn(N(2, k)) + (b.n === 3 ? 1 : 0), -Math.PI / 2 + b.ang * 0.9, 230);
    },
    floor(x, y, b, k) {
      ring(x, y, 7, 60, 0.3, DULL, 0.26);
      ring(x, y, 4, 34, 0.2, IRON, 0.3);
      spikes(x, y + 2, 17, 0.18, DENT, INK, 5);
      chunks(x, y, jn(N(6, k)), -Math.PI / 2 + b.ang * 0.9, 300);
    },
    destroy(x, y, k) {
      ring(x, GROUND, 8, 110, 0.42, DULL, 0.2); // 땅울림
      ring(x, GROUND, 4, 70, 0.32, IRON, 0.24);
      spikes(x, y, 26, 0.26, DENT, INK, 5);
      chunks(x, y, N(10, k), -Math.PI / 2, 380);
    },
    whiff(footX, footY) {
      ring(footX + 33, footY - 22, 3, 14, 0.12, GRAY, 0.5); // 허공을 친 바람 — 작은 납작 고리
    },
  },
  // 빠루 — 비틀어 젖힌다: 끝이 감긴 갈고리 자국 · 튀는 못과 나사. 위로 긴 불꽃은 effects 몫
  crowbar: {
    hit(x, y, b, k) {
      hook(x + sgn() * 6, y, b.ang + sgn() * 0.08, 38 * b.k, 4 * b.k, n01() < 0.5 ? 1 : -1);
      nails(x, y, jn(N(2, k)) + (b.n === 3 ? 1 : 0), 260);
    },
    floor(x, y, b, k) {
      hook(x - 8, y, b.ang, 56 * b.k, 5.5, 1, 0.24);
      hook(x + 12, y + 4, b.ang + 2.9, 40, 4.2, -1, 0.22); // 맞은편으로 젖힌 둘째 갈고리
      nails(x, y, jn(N(6, k)), 340);
    },
    destroy(x, y, k) {
      hook(x - 30, y + 6, 0.2, 92, 7, 1, 0.3);
      hook(x + 34, y - 8, 2.9, 72, 6, -1, 0.28);
      nails(x, y, N(12, k), 420);
    },
    whiff(footX, footY) {
      hook(footX + 34, footY - 40, -1.2 + sgn() * 0.15, 22, 2.4, 1, 0.12, GRAY, PAPER);
    },
  },
  // 그라인더 — 도는 원판 잔상, 불꽃은 한쪽(뒤·아래)으로만 쏟아진다. 앞·위 부채꼴 불꽃은 effects 몫
  grinder: {
    hit(x, y, b, k) {
      disc(x + 4, y + 2, 11 * b.k, 0.16);
      const a = 2.5 + b.ang * 0.5 + sgn() * 0.06; // 줄기가 박자마다 조금 돈다
      sparkFan(x, y + 4, jn(N(3, k)) + (b.n === 3 ? 1 : 0), a - 0.16, a + 0.16, 320, 560, SPARK, HOT, 1300, 0.2, 4.5);
    },
    floor(x, y, b, k) {
      disc(x + 4, y + 2, 18, 0.24);
      const a = 2.5 + b.ang * 0.5;
      sparkFan(x, y + 4, jn(N(10, k)), a - 0.2, a + 0.2, 360, 640, SPARK, HOT, 1300, 0.26, 5);
    },
    destroy(x, y, k) {
      disc(x - 20, y, 26, 0.34);
      disc(x + 26, y + 8, 16, 0.3, -1);
      sparkFan(x, y + 4, N(14, k), 2.2, 2.9, 380, 700, SPARK, HOT, 1300, 0.3, 5.5);
    },
    whiff(footX, footY) {
      disc(footX + 29, footY - 20, 7, 0.12);
    },
  },
};

// ── 필살 셋 ──────────────────────────────────────────────────

/** (x, y) = 졸라맨 발. top·bottom = 화면 맨 위·바닥(월드 y), sc = 크기(판 1 · 상점 칸 0.3), follow = 방패가 판의 졸라맨을 따라간다 */
function wazaFx(w: WazaId, x: number, y: number, top: number, bottom: number, sc: number, follow = false): void {
  const cy = y - 31; // 몸 가운데
  switch (w) {
    case 'ageba': {
      // 올려베기 — 졸라맨에서 하늘로 솟는 베기 기둥(겹친 자국 다섯) + 위로 튀는 불꽃 + 발밑 납작 고리
      const gap = (y - 20 - top) / 5;
      for (let i = 0; i < 5; i++) {
        put('cut', x + sgn() * 4, y - 20 - (i + 0.5) * gap, {
          life: 0.3 + i * 0.04, size: gap * 1.4, v: Math.min(18 - i * 2, gap * 0.5), rot: -Math.PI / 2 + sgn() * 0.05,
          vy: -240 * sc, c1: INK, c2: PALETTE.YELLOW,
        });
      }
      sparkFan(x, y - 40, 12, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45, 500 * sc, 900 * sc, SPARK, HOT, 900, 0.32, 6);
      ring(x, y, 6, 70 * sc, 0.3, INK, 0.3);
      return;
    }
    case 'tetsu': {
      // 철벽 — 졸라맨 둘레에 육각 방패가 탁 서고, 꼭짓점 리벳에서 불꽃 · 방패 조각이 튄다
      const R = 38;
      const rot = n01() * 0.4;
      put('hex', x, cy, { life: 0.72, size: R, rot, spin: 0.5, c1: SHIELD, c2: INK, a: follow ? 1 : 0 });
      for (let i = 0; i < 6; i++) {
        const a = rot + (i * Math.PI) / 3;
        const rx = x + Math.cos(a) * R;
        const ry = cy + Math.sin(a) * R;
        put('coin', rx, ry, { ...vel(a, 120 * sc), g: 500, life: 0.42, size: 2.4, c1: '#5C574E', c2: '#EFECE3', a: 1 });
        sparkFan(rx, ry, 1, a - 0.25, a + 0.25, 220 * sc, 320 * sc, SPARK, HOT, 600, 0.16, 4);
      }
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.75 + sgn() * 0.2;
        put('plate', x + Math.cos(a) * R, cy + Math.sin(a) * R, {
          ...vel(a, (240 + n01() * 160) * sc), g: 1100, life: 0.55 + n01() * 0.25, size: 9 + n01() * 3, v: 0.55,
          rot: a + Math.PI / 2, spin: sgn() * 10, c1: SHIELD, c2: INK, a: 1, bounce: 1,
        });
      }
      return;
    }
    default: {
      // 천지개벽 — 화면을 세로로 내려긋는 잉크 균열(틈으로 빛이 새어 나온다, 가운데부터) + 접힌 종이 빛살 + 종이 조각
      for (let i = 0; i < 5; i++) {
        put('crack', x + (i - 2) * 66 * sc + sgn() * 8 * sc, top, {
          life: 0.66 + n01() * 0.1, size: bottom - top, v: 2.2 + n01() * 0.8, a: Math.abs(i - 2) * 0.035, c1: INK, c2: HOT,
        });
      }
      put('fold', x, cy, { life: 0.5, size: 140 * sc, v: 10, rot: n01() * TAU, spin: 0.8, c1: PAPER, c2: SHADE });
      shardSpray(x, cy, 6, 360 * sc, 5, PAPER, INK);
    }
  }
}

// ── 그림 없던 순간 셋 ─────────────────────────────────────────

/** 필살 게이지가 다 찬 순간 — 몸 둘레 반짝 별 넷 + 작은 노랑 고리 */
function gaugeFull(x: number, y: number): void {
  ring(x, y, 8, 22, 0.3, PALETTE.YELLOW);
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 4 + sgn() * 0.3;
    twinkle(x + Math.cos(a) * 24, y + Math.sin(a) * 26, 4 + n01() * 1.5, 0.36 + n01() * 0.1, PALETTE.YELLOW, -20);
  }
}

/** 콤보가 끊겼다 — 회색 고리가 넷으로 끊어져 흩어진다(번쩍 없음) */
function comboBreak(x: number, y: number): void {
  const r = 13;
  const rot = n01() * TAU;
  for (let i = 0; i < 4; i++) {
    const a = rot + (i * TAU) / 4;
    put('arc', x + Math.cos(a) * r, y + Math.sin(a) * r, {
      ...vel(a, 50 + n01() * 30), g: 240, drag: 1.4, life: 0.42 + n01() * 0.1, size: r, v: 2.2, rot: a, spin: sgn() * 2, c1: GRAY, a: 1.1,
    });
  }
}

/** 깔림 탈출 — 철판과 먼지 조각이 사방으로 */
function pinEscape(x: number, y: number): void {
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 2 + (i - 1.5) * 0.75 + sgn() * 0.2;
    put('plate', x + sgn() * 10, y - 18, {
      ...vel(a, 300 + n01() * 160), g: 1200, life: 0.6 + n01() * 0.25, size: 10 + n01() * 4, v: 0.5,
      rot: sgn() * 3, spin: sgn() * 12, c1: IRON, c2: INK, a: 1, bounce: 1,
    });
  }
  for (let i = 0; i < 6; i++) {
    put('chunk', x + sgn() * 12, y - 8, {
      ...vel((i * TAU) / 6 + sgn() * 0.4, 160 + n01() * 120), g: 700, drag: 1.2,
      life: 0.45 + n01() * 0.2, size: 2.4 + n01() * 2, rot: n01() * TAU, spin: sgn() * 8, c1: DUST, c2: INK,
    });
  }
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
      // 같은 틱에 따라오는 층 깨기·완파 조각이 풀을 넘겨도 필살 그림은 남는다
      keepBits(() => {
        wazaFx(s.waza, x, footY, VIEW.FIELD_TOP - CAMERA.MAX, GROUND, 1, true); // 균열은 카메라가 어디 있든 화면 맨 위부터
        pixels(x, footY - 31, 12, 420);
      });
      shieldOf = s;
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
  switch (e.kind) {
    case 'hit':
    case 'bossHit':
    case 'butterCollapse':
      t.hit(x, GROUND - (e.y ?? s.player.y), b, k);
      break;
    case 'floorCollapse':
      t.floor(x, GROUND - (e.y ?? s.player.y), b, k);
      break;
    case 'stackDestroy':
      t.destroy(x, footY - 70, k);
      break;
    case 'slash':
      t.whiff(footX, footY);
      break;
    default:
  }
  return b;
}

/**
 * 상점 필살 칸 — 이 필살이 터진 지 t초 지난 한 장면. (x, y) = 졸라맨 발, 그림은 발 위 90 · 좌우 40 안팎.
 * 상점은 로비 탭이라 판 풀을 잠깐 빌린다(앞뒤로 비움). 마스크 도트는 넣지 않는다 — 칸 그림은 장착과 무관하게 캐시된다
 */
export function drawWazaShot(ctx: CanvasRenderingContext2D, waza: WazaId, x: number, y: number, t = 0.16): void {
  resetBladeFx();
  wazaFx(waza, x, y, y - 92, y + 6, 0.3);
  for (let k = t; k > 1e-6; k -= TICK) updateBladeFx(Math.min(TICK, k));
  drawBladeFx(ctx, 0);
  resetBladeFx();
}

/** resetBladeFx가 부른다 — 연타 줄을 처음부터. 마스크 색은 장착이라 그대로 둔다 */
export function resetWeaponFx(): void {
  beatAt = -Infinity;
  beatI = 0;
  shieldOf = null;
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
      const s = p.size;
      ctx.globalAlpha = Math.min(1, t / 0.3);
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
    case 'hex': {
      // 육각 방패 — 툭 튀어 자리 잡고 끝 4할에 옅어진다. 비치는 면 · 두 겹 테 · 꼭짓점 리벳
      const R = p.size * (u < 0.12 ? 0.7 + (0.38 * u) / 0.12 : u < 0.24 ? 1.08 - (0.08 * (u - 0.12)) / 0.12 : 1);
      const A = u > 0.6 ? (1 - u) / 0.4 : 1;
      const y = p.a && shieldOf ? GROUND - shieldOf.player.y - 31 + (py - p.y) : py; // 따라가는 방패 = 지금 몸 가운데
      hexPath(ctx, p.x, y, R, p.rot);
      ctx.globalAlpha = A * 0.3;
      ctx.fillStyle = p.c1;
      ctx.fill();
      ctx.globalAlpha = A;
      ctx.strokeStyle = p.c2;
      ctx.lineWidth = 3.4;
      ctx.stroke();
      ctx.strokeStyle = p.c1;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      hexPath(ctx, p.x, y, R * 0.8, p.rot);
      ctx.strokeStyle = p.c2;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = p.rot + (i * Math.PI) / 3;
        const rx = p.x + Math.cos(a) * R;
        const ry = y + Math.sin(a) * R;
        ctx.moveTo(rx + 2.2, ry);
        ctx.arc(rx, ry, 2.2, 0, TAU);
      }
      ctx.fillStyle = p.c2;
      ctx.fill();
      return;
    }
    case 'crack': {
      // a초 늦게 시작해 0.14초에 바닥까지 내려그어진다. 굵은 잉크 속으로 빛(c2)이 새어 나온다
      const grow = Math.min(1, Math.max(0, (p.max - p.life - p.a) / 0.14));
      if (grow <= 0) return;
      const L = p.size * (1 - (1 - grow) * (1 - grow));
      ctx.globalAlpha = u > 0.7 ? (1 - u) / 0.3 : 1;
      ctx.beginPath();
      ctx.moveTo(p.x, py);
      for (let k = 1; k * CRACK_STEP < L + CRACK_STEP; k++) {
        const yy = py + Math.min(k * CRACK_STEP, L);
        const xx = p.x + (hash(p.seed, k) - 0.5) * 14;
        ctx.lineTo(xx, yy);
        if (k % 4 === 0 && k * CRACK_STEP < L) {
          // 잔가지 — 짧게 비껴 나갔다 줄기로 돌아온다
          ctx.lineTo(xx + (hash(p.seed, k + 50) < 0.5 ? -1 : 1) * (8 + 6 * hash(p.seed, k + 90)), yy + 9);
          ctx.moveTo(xx, yy);
        }
      }
      ctx.strokeStyle = p.c1;
      ctx.lineWidth = p.v;
      ctx.stroke();
      ctx.strokeStyle = p.c2;
      ctx.lineWidth = p.v * 0.35;
      ctx.stroke();
      return;
    }
    case 'fold': {
      // 접힌 종이 빛살 — 조각마다 밝은 면(c1)과 그늘 면(c2)으로 접혔다. 빨리 펴지고 끝 4할에 옅어진다
      const L = p.size * (0.3 + 0.7 * Math.min(1, u / 0.2));
      const n = p.v;
      const w = (TAU / n) * 0.42;
      const at = (a: number, r: number): [number, number] => [p.x + Math.cos(a) * r, py + Math.sin(a) * r];
      const len = (i: number): number => L * (i % 2 ? 0.64 : 1);
      ctx.globalAlpha = u > 0.6 ? (1 - u) / 0.4 : 1;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const a = p.rot + (i / n) * TAU;
          ctx.moveTo(...at(a, L * 0.2));
          ctx.lineTo(...at(a + side * w, L * 0.32));
          ctx.lineTo(...at(a, len(i)));
          ctx.closePath();
        }
        ctx.fillStyle = side < 0 ? p.c1 : p.c2;
        ctx.fill();
      }
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = p.rot + (i / n) * TAU;
        ctx.moveTo(...at(a, L * 0.2));
        ctx.lineTo(...at(a - w, L * 0.32));
        ctx.lineTo(...at(a, len(i)));
        ctx.lineTo(...at(a + w, L * 0.32));
        ctx.closePath();
        ctx.moveTo(...at(a, L * 0.2)); // 접힌 금
        ctx.lineTo(...at(a, len(i)));
      }
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.stroke();
      return;
    }
    case 'hook': {
      // 갈고리 베기 — cut과 같은 박자: 앞 15%에 다 뻗고 가늘어지며 사라진다
      const L = p.size * (0.55 + 0.45 * Math.min(1, u / 0.15));
      const T = p.v * (u < 0.15 ? 1 : 1 - (0.8 * (u - 0.15)) / 0.85);
      ctx.globalAlpha = u < 0.55 ? 1 : (1 - u) / 0.45;
      ctx.save();
      ctx.translate(p.x, py);
      ctx.rotate(p.rot);
      hookPath(ctx, L, T, p.a);
      ctx.fillStyle = p.c1;
      ctx.fill();
      hookPath(ctx, L * 0.9, T * 0.45, p.a);
      ctx.fillStyle = p.c2;
      ctx.fill();
      ctx.restore();
      return;
    }
    case 'nail': {
      // 못(납작 대가리) · 나사(a: 둥근 머리 + 홈 + 나사산 셋)
      const s = p.size;
      ctx.globalAlpha = Math.min(1, t / 0.25);
      ctx.save();
      ctx.translate(p.x, py);
      ctx.rotate(p.rot);
      ctx.beginPath();
      ctx.moveTo(-s / 2, 0);
      ctx.lineTo(s / 2, 0);
      if (!p.a) {
        ctx.moveTo(-s / 2, -s * 0.24);
        ctx.lineTo(-s / 2, s * 0.24);
      }
      ctx.strokeStyle = p.c2;
      ctx.lineWidth = 2.8;
      ctx.stroke();
      ctx.strokeStyle = p.c1;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      if (p.a) {
        ctx.beginPath();
        ctx.arc(-s / 2, 0, s * 0.22, 0, TAU);
        ctx.fillStyle = p.c1;
        ctx.fill();
        ctx.strokeStyle = p.c2;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-s / 2, -s * 0.13);
        ctx.lineTo(-s / 2, s * 0.13);
        for (let k = 1; k <= 3; k++) {
          const xx = -s / 2 + (s * k) / 4;
          ctx.moveTo(xx - 0.8, -1.5);
          ctx.lineTo(xx + 0.8, 1.5);
        }
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    case 'disc': {
      // 도는 원판 잔상 — 비치는 원판 위로 도는 불꽃 빛줄 셋, 가운데 축
      const R = p.size * (u < 0.15 ? 0.6 + (0.4 * u) / 0.15 : 1);
      const A = u > 0.5 ? (1 - u) / 0.5 : 1;
      ctx.beginPath();
      ctx.arc(p.x, py, R, 0, TAU);
      ctx.globalAlpha = A * 0.45;
      ctx.fillStyle = p.c1;
      ctx.fill();
      ctx.globalAlpha = A;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = p.rot + (i * TAU) / 3;
        ctx.moveTo(p.x + Math.cos(a) * R * 0.7, py + Math.sin(a) * R * 0.7);
        ctx.arc(p.x, py, R * 0.7, a, a + 1.1);
      }
      ctx.strokeStyle = p.c2;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, py, Math.max(1, R * 0.18), 0, TAU);
      ctx.fillStyle = INK;
      ctx.fill();
      return;
    }
    case 'chunk': {
      // 울퉁불퉁한 오각 덩이 — 꼭짓점마다 반지름이 다르다(조각마다 고정)
      ctx.globalAlpha = Math.min(1, t / 0.3);
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = p.rot + (k / 5) * TAU;
        const r = p.size * (0.7 + 0.3 * hash(p.seed, k));
        ctx.lineTo(p.x + Math.cos(a) * r, py + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fillStyle = p.c1;
      ctx.fill();
      ctx.strokeStyle = p.c2;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      return;
    }
    case 'arc': {
      // 끊어진 고리 한 토막 — 토막 가운데를 축으로 돈다(고리 중심은 rot 반대쪽 size 거리)
      ctx.globalAlpha = t;
      ctx.save();
      ctx.translate(p.x, py);
      ctx.rotate(p.rot);
      ctx.beginPath();
      ctx.arc(-p.size, 0, p.size, -p.a / 2, p.a / 2);
      ctx.strokeStyle = p.c1;
      ctx.lineWidth = p.v * (0.5 + 0.5 * t);
      ctx.stroke();
      ctx.restore();
      return;
    }
    default:
  }
}

function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = rot + (i * Math.PI) / 3;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

/** 갈고리 윤곽 — 곧게 나가다 끝이 side 쪽(1 = 아래)으로 감겨 젖힌다. 두께는 가운데가 굵은 붓 자국(최대 T) */
function hookPath(ctx: CanvasRenderingContext2D, L: number, T: number, side: number): void {
  const r = L * 0.2;
  const straight = L * 0.62;
  const total = straight + r * 2.3; // 곧은 몸 + 감긴 호(2.3 rad)
  const at = (s: number): [number, number] => {
    const d = Math.min(1, Math.max(0, s)) * total;
    if (d <= straight) return [-L / 2 + d, 0];
    const f = (d - straight) / r;
    return [-L / 2 + straight + Math.sin(f) * r, side * r * (1 - Math.cos(f))];
  };
  const n = 12;
  const back: [number, number][] = [];
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const [x, y] = at(s);
    const [x0, y0] = at(s - 0.02);
    const [x1, y1] = at(s + 0.02);
    const dl = Math.hypot(x1 - x0, y1 - y0) || 1;
    const w = (T / 2) * Math.max(0, Math.sin(Math.PI * s)) ** 0.7;
    const nx = (-(y1 - y0) / dl) * w;
    const ny = ((x1 - x0) / dl) * w;
    if (i === 0) ctx.moveTo(x + nx, y + ny);
    else ctx.lineTo(x + nx, y + ny);
    back.push([x - nx, y - ny]);
  }
  for (let i = back.length - 1; i >= 0; i--) ctx.lineTo(back[i][0], back[i][1]);
  ctx.closePath();
}

/** 0~1 고정 난수 — 같은 조각은 매 프레임 같은 모양 */
function hash(seed: number, k: number): number {
  const h = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return h - Math.floor(h);
}
