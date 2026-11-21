// 연장 넷 · 그림 없던 순간 셋(게이지 참 · 콤보 끊김 · 깔림 탈출) · 마스크 도트 — 렌더 전용(core·히트스톱 무관).
// 풀·뿌리개·그리기 틀은 bladeFx를 빌린다: bladeReact가 이벤트마다 맨 먼저 weaponReact를 부르고,
// bladeFx 그리기가 모르는 Kind는 drawWeaponBit로 넘어온다. 좌표 계약도 같다(월드 좌표, 그릴 때 cam — BL-09).
// 연장은 「먹 한 획」(docs/INK_FX_2026-11-01.md §4): 무기가 한 일이 붓 획으로 남는다. 포인트 색(WEAPON_INK)은 벤 순간의 획 속에만,
// 알파로 지우지 않고 꼬리부터 깎는다. 맞은 자리 먹 튐 · 방울은 effects(공통 사건) 몫이라 여기서 다시 그리지 않는다(오함마 발묵만 예외).
// 연타 한 줄(지난 타격에서 0.6초 안)은 1·2·3타로 돌며 획이 내려베기 → 올려베기 → 가로로 바뀌고 3타째가 조금 크다.
// 조각 Kind는 bladeFx 목록의 이름을 빌려 뜻만 바꿔 쓴다 — hook = 붓 획 · disc = 먹 튐 · chunk = 나는 먹 · nail = 불티 분수 · arc = 끊긴 붓 고리 ·
// tap = 잘게 떠는 획(착암기) · ring = 고리(파이프 단면 · 코어 드릴 구멍) · pix = 네모 토막(마스크 도트 · 빠진 원기둥 · 벽돌 조각 · a 4면 다이아 드릴 마름모). 연장 열둘은 저마다 다른 조각 묶음으로 터진다.

import type { GameState, JuiceEvent, WeaponId } from '../core/types';
import { JUICE_SYS, PALETTE, TICK, VIEW, WEAPON, WEAPON_FX, WEAPON_INK } from '../config';
import { playerBlade } from './sprites';
import {
  N, bent, drops, keepBits, later, line, n01, pool, put, scaled, sgn, sweep, tierK, vel, type Bit, type WazaArt,
} from './bladeFx';
import { PRESS, brushArc, brushLine, enso, hotCore, hs, inkDrop, inkSplat, popScale, spatter } from './ink';

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

/**
 * 다이아 드릴 붓 — 밑동 (x, y)에서 ang 쪽으로 len, 댄 데가 굵고 끝이 뾰족하게 빠지는 굵은 청록 붓 한 획 + 그 끝자리에 감겨 드는 붓 소용돌이 두 획
 * (바깥 R · 안 R/2, 끊기지 않고 이어 돈다 = 돌며 파고든 자리). 먹은 쓰지 않고 시그니처 청록 한 색 · 마른 붓 결.
 * 오독 기록(11-21 심사 여섯 번): 감긴 굵은 한 획 = 고래 · 고리 두른 획 = 오징어 · 띄엄띄엄 자국 = 용수철 · 사다리 · 맞붙은 자국 = 깃털 ·
 * 띠 자국으로 채운 고깔 = 평면 도형 · 가는 테두리와 홈 선 = 사다리 · 와이어프레임 · 고깔 붓 한 획 + 밝은 홈 = 아이스크림콘 · 나팔.
 * 지금 판(소용돌이)도 고사리 순 · 물결로 읽힐 때가 있다 — 사용자 판정 대기
 */
function drillCoil(x: number, y: number, ang: number, len: number, w: number, life = 0.24, R = w * 1.2): void {
  const c = WEAPON_INK.diadrill;
  const [tx, ty] = [x + Math.cos(ang) * len, y + Math.sin(ang) * len];
  line(x, y, tx, ty, w, '', { body: c, pr: 1, life, dry: 0.3, gr: 0.1 });
  const a0 = ang + Math.PI / 2;
  sweep(tx, ty, R, a0, Math.PI * 1.25, Math.max(2.4, w * 0.55), '', { body: c, pr: 1, life, dry: 0.35, gr: 0.12 });
  later(0.03, () => sweep(tx, ty, R * 0.5, a0 + Math.PI * 1.25, Math.PI * 1.1, Math.max(2, w * 0.4), '', { body: c, pr: 1, life: life * 0.9, dry: 0.35, gr: 0.12 }));
}

/** 연장 전설의 칼 기운 · 물들임 — 대검 RECIPES의 aura · every · tint와 같은 뜻(bladeFx.bladeAura가 읽는다) */
export const TOOL_RECIPES: Partial<Record<WeaponId, { aura?(b: readonly [number, number, number, number], n: number, c: string): void; every?: number; tint?: true; waza?: WazaArt }>> = {
  // 다이아 드릴 — 칼끝(비트)에서 짧게 내지르는 획과 작은 소용돌이가 이어 그어진다. 가끔 쇳밥(끊긴 붓 고리) 하나가 튄다
  diadrill: {
    aura(b, n) {
      const a = Math.atan2(b[3] - b[1], b[2] - b[0]);
      drillCoil(b[2] - Math.cos(a) * 16, b[3] - Math.sin(a) * 16, a, 20, 5, 0.2, 6);
      if (n % 6 === 0) curls(b[2], b[3], 1, 3, 0.2, WEAPON_INK.diadrill);
    },
    every: 0.1,
    tint: true, // 완파가 제 붓놀림의 둘째 박자 마무리 — 층 깨기 그림을 덧얹지 않는다
  },
};

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
  // 삽 — 퍼 올린다: 맞은 자리에서 뒤 위로 떠 올리는 튕김 획 하나(황토 속) + 흙 덩이 서너 개가 포물선으로 날아 땅에 떨어져 번진다
  shovel: {
    hit(x, y, b, k) {
      stroke(x - 4, y + 4, -Math.PI / 2 - 0.55 + b.ang * 0.3, 46 * b.k, 6.5 * b.k, FLICK, 0.32, WEAPON_INK.shovel);
      clods(x, y, jn(N(3, k)) + (b.n === 3 ? 1 : 0), 260, 400, 3.6);
    },
    floor(x, y, b, k) {
      stroke(x - 6, y + 4, -Math.PI / 2 - 0.6 + b.ang * 0.3, 72, 9, FLICK, 0.38, WEAPON_INK.shovel);
      clods(x, y, jn(N(4, k)), 300, 470, 4.4);
    },
    destroy(x, y, k) {
      stroke(x - 10, y + 6, -Math.PI / 2 - 0.7, 124, 12, FLICK, 0.44, WEAPON_INK.shovel);
      clods(x, y, N(6, k), 340, 540, 5);
    },
    whiff(footX, footY) {
      stroke(footX + 26, footY - 34, -2.2 + sgn() * 0.15, 28, 3, FLICK, 0.18, GRAY, GRAY); // 허공을 뜬 삽 — 옅은 회색 획 하나
    },
  },
  // 곡괭이 — 찍는다: 밑면에 박힌 쐐기 자국(꺾인 한 획, 청회 속) + 깨져 도는 돌 조각
  pickaxe: {
    hit(x, y, b, k) {
      wedge(x + sgn() * 4, y, 12 * b.k, 5.5 * b.k, 0.32, WEAPON_INK.pickaxe);
      flecks(x, y, 2 + (k >= 1.5 ? 1 : 0), -Math.PI / 2, 0.9, 320, 2, 9);
    },
    floor(x, y, _b, k) {
      wedge(x, y, 18, 7.5, 0.38, WEAPON_INK.pickaxe);
      flecks(x, y, jn(N(3, k)), -Math.PI / 2, 1.1, 380, 2, 11);
    },
    destroy(x, y, k) {
      wedge(x, y, 28, 10.5, 0.44, WEAPON_INK.pickaxe);
      flecks(x, y, N(5, k), -Math.PI / 2, 1.2, 440, 2, 13);
    },
    whiff(footX, footY) {
      wedge(footX + 30, footY - 44, 7, 2.8, 0.18, GRAY, GRAY);
    },
  },
  // 착암기 — 잘게 떤다: 짧은 세로 획 여럿이 차례로 박힌다(다다다, 청록 속). 층이 깨지면 금이 층 몸을 따라 아래로 간다
  jackhammer: {
    hit(x, y, b, k) {
      taps(x, y, jn(N(6, k)) + (b.n === 3 ? 2 : 0), 0.26, 22 * b.k, 4.6);
    },
    floor(x, y, _b, k) {
      taps(x, y, jn(N(8, k)), 0.3, 26, 5.2);
      crackDown(x + sgn() * 3, y, 46, 3.2, 0.36);
    },
    destroy(x, y, k) {
      taps(x, y, N(10, k), 0.34, 30, 6);
      crackDown(x, y, 76, 4.4, 0.42);
    },
    whiff(footX, footY) {
      taps(footX + 30, footY - 44, 3, 0.12, 9, 2.2, GRAY);
    },
  },
  // 다이아 드릴(전설) — 돌며 파고든다: 굵고 뾰족한 청록 붓 한 획이 맞은 것에 끝을 박고, 그 끝자리에 붓 소용돌이가 감겨 들고, 청록 쇳밥(끊긴 붓 고리)이 튄다.
  // 완파는 소용돌이 바깥으로 한 바퀴 더 크게 감긴다.
  // 먹 붓 화법 그대로 먹 색만 시그니처 청록. 타격 · 층 깨기는 머리 왼쪽 밑동에서 오른쪽 위로(/) 층 아래 모서리에, 완파는 머리 위에서 왼쪽 잔해로 내리꽂힌다.
  // 그림은 확대 1.6배로 놓이니 밑동은 맞은 높이 위 · 옆에 둔다(밑에 두면 땅까지 내려가 바닥에서 솟은 꼴이 된다)
  diadrill: {
    hit(x, y, b, k) {
      drillCoil(x - 36, y, -Math.PI / 2 + 0.8, 54 * b.k, 12, 0.26, 15 * b.k);
      curls(x - 2, y - 36, 2 + (k >= 1.5 ? 1 : 0), 5, 0.22, WEAPON_INK.diadrill);
    },
    floor(x, y, _b, k) {
      drillCoil(x - 46, y - 2, -Math.PI / 2 + 0.8, 68, 15, 0.3, 20);
      curls(x, y - 46, jn(N(4, k)), 6, 0.26, WEAPON_INK.diadrill);
    },
    destroy(x, y, k) {
      const ang = Math.PI / 2 + 0.9;
      const L = 84;
      const [bx, by] = [x + 4, y - 30];
      const [tx, ty] = [bx + Math.cos(ang) * L, by + Math.sin(ang) * L];
      drillCoil(bx, by, ang, L, 19, 0.4, 28);
      later(0.12, () => sweep(tx, ty, 42, ang - Math.PI / 2, Math.PI * 1.15, 13, '', { body: WEAPON_INK.diadrill, pr: 1, life: 0.3, dry: 0.4, gr: 0.12 }));
      curls(tx, ty, N(5, k), 7, 0.32, WEAPON_INK.diadrill);
      later(0.08, () => curls(tx, ty - 6, N(4, k), 7, 0.3, WEAPON_INK.diadrill));
    },
    whiff(footX, footY) {
      curls(footX + 26, footY - 50, 3, 4, 0.18, WEAPON_INK.diadrill);
    },
  },
  // 전동 드릴 — 파고든다: 맞은 자리에서 위로 파고든 짧은 한 획(풀빛 속) + 둘레로 튀는 곱슬 부스러기 몇 가닥. 누르면 빨라지는 무기라 수명이 짧다
  drill: {
    hit(x, y, b) {
      stroke(x + sgn() * 3, y - 6, -Math.PI / 2 + sgn() * 0.12, 26 * b.k, 4 * b.k, CUT, 0.2, WEAPON_INK.drill);
      curls(x, y, 3 + (b.n === 3 ? 1 : 0), 4, 0.2);
    },
    floor(x, y, b) {
      stroke(x, y - 10, -Math.PI / 2 + sgn() * 0.08, 40 * b.k, 5.5, CUT, 0.26, WEAPON_INK.drill);
      curls(x, y, 5, 5, 0.24);
    },
    destroy(x, y) {
      stroke(x, y - 16, -Math.PI / 2, 64, 7.5, CUT, 0.32, WEAPON_INK.drill);
      curls(x, y, 8, 6, 0.3);
    },
    whiff(footX, footY) {
      curls(footX + 22, footY - 50, 2, 3, 0.16, GRAY);
    },
  },
  // 코어 드릴 — 동그랗게 뚫는다: 맞은 자리에 구멍 자국(빈 원 한 획, 자주 속) + 그 가운데서 빠진 원기둥 조각 하나가 떨어진다
  coredrill: {
    hit(x, y, b) {
      ring(x, y + 1, 9 * b.k, 4.2 * b.k, 0.1, 1, 0.38, WEAPON_INK.coredrill);
      plug(x, y + 2, 6 * b.k);
    },
    floor(x, y) {
      ring(x, y + 1, 13, 5.5, 0.12, 1, 0.44, WEAPON_INK.coredrill);
      plug(x, y + 2, 8.5);
    },
    destroy(x, y) {
      ring(x - 18, y, 15, 6.5, 0.12, 1, 0.48, WEAPON_INK.coredrill);
      ring(x + 20, y + 6, 11, 5, 0.12, 1, 0.44, WEAPON_INK.coredrill);
      plug(x - 18, y + 2, 10);
      plug(x + 20, y + 8, 7.5);
    },
    whiff(footX, footY) {
      ring(footX + 30, footY - 50, 5, 2, 0.1, 1, 0.16, GRAY, GRAY);
    },
  },
  // 굴착 드릴 — 퍼 올린다: 맞은 자리에서 나선으로 감겨 올라가는 흙 띠 한 획(올리브 속) + 흙덩이. 깔림을 대신 받으면 발밑에서 나선이 위로 솟는다
  auger: {
    hit(x, y, b, k) {
      spiral(x, y + 4, 40 * b.k, 9 * b.k, 4.5 * b.k, 0.36);
      drops(x, y, jn(N(2, k)), -Math.PI / 2 - 0.9, -Math.PI / 2 + 0.9, 160, 260, 3, WEAPON_INK.auger, 900);
    },
    floor(x, y, _b, k) {
      spiral(x, y + 6, 62, 13, 6, 0.42);
      drops(x, y, jn(N(4, k)), -Math.PI / 2 - 1, -Math.PI / 2 + 1, 200, 320, 3.6, WEAPON_INK.auger, 900);
    },
    destroy(x, y, k) {
      spiral(x, y + 10, 96, 18, 8, 0.5);
      drops(x, y, N(6, k), -Math.PI / 2 - 1.1, -Math.PI / 2 + 1.1, 240, 380, 4.2, WEAPON_INK.auger, 900);
    },
    whiff(footX, footY) {
      spiral(footX + 26, footY - 40, 18, 5, 2.4, 0.18, GRAY);
    },
  },
  // 비계 파이프 — 길게 친다: 길고 곧은 한 획(은회 속) + 그 끝에 관 단면 빈 원 하나
  pipe: {
    hit(x, y, b) {
      pipeLine(x + sgn() * 4, y, b.ang * 0.35 + sgn() * 0.05, 70 * b.k, 5.5 * b.k, 7 * b.k, 0.34);
    },
    floor(x, y, b) {
      pipeLine(x, y, b.ang * 0.35 + sgn() * 0.04, 100 * b.k, 7.5, 9, 0.4);
    },
    destroy(x, y) {
      pipeLine(x, y, -0.3 + sgn() * 0.06, 150, 10.5, 12, 0.46); // 같은 틱 층 깨기 획과 엇갈린다
    },
    whiff(footX, footY) {
      stroke(footX + 30, footY - 44, -1.35 + sgn() * 0.1, 42, 2.8, CUT, 0.18, GRAY, GRAY);
    },
  },
};

/** 흙 덩이 — 뒤 위로 포물선을 그리며 날아 땅에 떨어져 번진다(처음엔 황토, 마르면 먹) */
function clods(x: number, y: number, n: number, s0: number, s1: number, r: number): void {
  drops(x, y, n, -Math.PI / 2 - 1.0, -Math.PI / 2 - 0.25, s0, s1, r, WEAPON_INK.shovel, 1000);
}

/** 쐐기 자국 — 친 자리를 꼭짓점으로 밑면에 박힌 꺾인 한 획(왼 아래 → 꼭짓점 → 오른 아래) */
function wedge(x: number, y: number, h: number, w: number, life: number, core: string, c1: string = INK): void {
  const half = h * 0.9;
  put('zig', x - half, y + h * 0.7, {
    life, size: 0, v: w, c1, c2: core, dry: 0.3, pr: 2, gr: 0.15,
    pts: [0, 0, half, -h, half * 2, 0],
  });
}

/** 잘게 떠는 획 — n개가 dur초에 걸쳐 차례로 박힌다(조각 하나) */
function taps(x: number, y: number, n: number, dur: number, len: number, w: number, core: string = WEAPON_INK.jackhammer): void {
  put('tap', x, y, { life: dur + 0.12, size: len, v: w, a: dur, st: n, c1: INK, c2: core });
}

/** 금이 아래로 — 층 몸 위쪽에서 친 자리를 지나 아래로 꺾여 내려가는 마른 획 */
function crackDown(x: number, y: number, len: number, w: number, life: number): void {
  const top = y - len * 0.75;
  const pts: number[] = [x, top];
  for (let i = 1; i <= 4; i++) pts.push(x + (i === 4 ? 0 : (i % 2 ? 1 : -1) * (3 + n01() * 3)), top + (len * i) / 4);
  bent(pts, w, '', { life, dry: 0.5, pr: 2, gr: 0.2 });
}

/** 곱슬 부스러기 — 짧게 말린 붓 고리 토막이 돌며 튄다(첫 가닥만 속 색) */
function curls(x: number, y: number, n: number, r: number, life: number, c: string = INK): void {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + sgn() * 1.3;
    put('arc', x + sgn() * 4, y + sgn() * 3, {
      ...vel(a, 120 + n01() * 110), g: 520, drag: 1.4, life: life + n01() * 0.06, size: r * (0.8 + n01() * 0.4), v: 2.2,
      rot: a, spin: sgn() * 14, c1: i === 0 && c === INK ? WEAPON_INK.drill : c, a: 3.4,
    });
  }
}

/** 빠진 원기둥 — 구멍에서 빠져 돌며 떨어져 땅에서 한 번 튄다(세로로 긴 먹 토막) */
function plug(x: number, y: number, w: number): void {
  put('pix', x, y, { ...vel(Math.PI / 2 + sgn() * 0.5, 60 + n01() * 40), g: 900, life: 0.7, size: w, v: 1.7, rot: sgn() * 0.3, spin: sgn() * 5, c1: INK, bounce: 1 });
}

/** 감겨 오르는 흙 띠 — (x, y)에서 h만큼 위로 나선 두 바퀴 반(옆에서 본 꼴: 좌우로 감기며 폭이 줄어든다) */
function spiral(x: number, y: number, h: number, amp: number, w: number, life: number, c: string = WEAPON_INK.auger): void {
  const pts: number[] = [];
  const n = 22;
  const ph = n01() * TAU;
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    pts.push(x + Math.sin(ph + f * TAU * 2.5) * amp * (1 - 0.55 * f), y - h * f);
  }
  bent(pts, w, c === GRAY || c === INK ? '' : c, { life, dry: 0.35, pr: 2, gr: 0.3 });
}

/** 퍼지는 고리 — r0에서 r0·(1 + grow)까지 퍼지며 가늘어진다. flat = 세로 배율(밑면에 누우면 납작) */
function ring(x: number, y: number, r0: number, w: number, grow: number, flat: number, life: number, core: string, c1: string = INK): void {
  put('ring', x, y, { life, size: r0, v: w, a: grow, sw: flat, rot: n01() * TAU, c1, c2: core });
}

/** 관 한 획 — 길고 곧은 획 + 그 끝(앞쪽)에 빈 원 단면 */
function pipeLine(x: number, y: number, ang: number, len: number, w: number, r: number, life: number): void {
  stroke(x, y, ang, len, w, CUT, life, WEAPON_INK.pipe);
  const d = len / 2 + r;
  ring(x + Math.cos(ang) * d, y + Math.sin(ang) * d, r, Math.max(2.2, w * 0.45), 0.12, 1, life, WEAPON_INK.pipe);
}

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
 * bladeReact가 이벤트마다 맨 먼저 부른다 — 연장 넷의 타격·층 깨기·완파·헛스윙,
 * 게이지 참·콤보 끊김·깔림 탈출, 필살 때 마스크 도트(필살 그림은 wazaShow). 돌려주는 박자는 대검 베기 자국·잔상도 쓴다(타격이 아니면 1타)
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
    case 'pinReady': // 굴착 드릴 구제가 다시 찼다 — pinSave 나선을 작게 한 번
      spiral(footX, footY, 48, 6, 3.5, 0.35);
      return b;
    case 'overheat': { // 드릴류 과열 — 무기 끝에서 먹 연기가 한 번 피어오른다(글자 「과열」은 렌더러 팝업)
      const [tx, ty] = heatTipAt ?? [footX + 22, footY - 58];
      for (let i = 0; i < 4; i++) {
        put('dust', tx + sgn() * 4, ty - 3 - i * 4, { life: 0.55 + 0.12 * i, size: 5 + i * 2.5, c1: INK, vx: sgn() * 18, vy: -45 - 22 * i, drag: 2.2, v: 9 });
      }
      return b;
    }
    case 'pinSave':
      spiral(footX, footY, 96, 12, 7, 0.5);
      spiral(footX + 4, footY - 20, 80, 8, 3.5, 0.44, INK);
      drops(footX, footY - 90, 5, -Math.PI / 2 - 1.1, -Math.PI / 2 + 1.1, 220, 360, 3.8, WEAPON_INK.auger, 900);
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
      if (e.kind === 'butterCollapse' && e.last && TOOL_RECIPES[s.weapon]?.tint) break; // 연장 전설 — 버터 마지막 겹도 완파 그림만
      scaled(x, y, WEAPON_FX.SIZE, () => t.hit(x, y, b, k));
      break;
    case 'floorCollapse':
      if ((e.last || e.waza) && TOOL_RECIPES[s.weapon]?.tint) break; // 연장 전설 — 마지막 층은 완파 그림만(같은 틱에 비트가 두 벌 선다) · 올려베기 층마다는 필살 그림이 맡는다
      scaled(x, y, WEAPON_FX.SIZE, () => t.floor(x, y, b, k));
      break;
    case 'stackDestroy':
      scaled(x, footY - 70, WEAPON_FX.SIZE, () => {
        t.destroy(x, footY - 70, k);
        // 연장 전설의 물들임은 완파(destroy) 안의 둘째 박자다 — 층 깨기 그림을 덧얹지 않는다
      });
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
  toolPiece(w, power, x, y, 1.5);
}

/** 연장 그림 하나 — 콤보 단 k · 줄 박자 b(기본 = 줄 끝 가로). weaponAlong · weaponBloom 기본 판도 이 길로 부른다 */
export function toolPiece(w: WeaponId, power: 'hit' | 'floor' | 'destroy', x: number, y: number, k: number, b: Beat = BEATS[2]): void {
  const t = TOOLS[w];
  if (!t) return;
  if (power === 'destroy') t.destroy(x, y, k);
  else t[power](x, y, b, k);
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
      const h = s * (p.v || 1); // v = 세로 배율(빠진 원기둥 · 벽돌 조각)
      ctx.beginPath();
      if (p.a === 4) {
        // 마름모(다이아 드릴 파편)
        ctx.moveTo(0, -h / 2);
        ctx.lineTo(s / 2, 0);
        ctx.lineTo(0, h / 2);
        ctx.lineTo(-s / 2, 0);
        ctx.closePath();
      } else ctx.rect(-s / 2, -h / 2, s, h);
      ctx.fill();
      ctx.strokeStyle = INK; // 흰 도트도 아이보리 위에서 보이게
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
      return;
    }
    case 'hook': {
      // 붓 획 — 앞 12%에 그어지고(머리가 나아간다) 35%부터 꼬리가 깎여 끝에 다 먹힌다. 벤 순간(앞 35%)엔 획 속이 포인트 색
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
          hotCore(ctx, u / 0.35, (k) => brushLine(ctx, x0, y0, xm, ym, p.v * 0.42 * k, Math.max(b0, 0.12), b1 * 0.9, 0, p.seed, 0, BODY));
        }
        return;
      }
      const x1 = p.x + (dx * L) / 2;
      const y1 = py + (dy * L) / 2;
      const pr = mode === GOUGE ? PRESS.line : mode === FLICK ? PRESS.flick : PRESS.cut;
      const dry = mode === GOUGE ? 0.85 : mode === FLICK ? 0.6 : 0.42; // 곧은 획도 꼬리는 붓털로 갈라진다
      const bend = mode === GOUGE ? 0 : (hs(p.seed, 1) - 0.5) * L * 0.16;
      ctx.fillStyle = p.c1;
      brushLine(ctx, x0, y0, x1, y1, p.v, s0, s1, dry, p.seed, bend, pr);
      if (core) {
        ctx.fillStyle = p.c2;
        brushLine(ctx, x0, y0, x1, y1, p.v * 0.42, Math.max(s0, 0.1), s1 * 0.8, 0, p.seed, bend, pr);
        hotCore(ctx, u / 0.35, (k) => brushLine(ctx, x0, y0, x1, y1, p.v * 0.42 * k, Math.max(s0, 0.1), s1 * 0.8, 0, p.seed, bend, pr));
      }
      return;
    }
    case 'nail': {
      // 불티 분수 — 줄기 i는 (i/n)·a초에 나와 0.12~0.24초 날며 꼬리를 끈다(머리가 굵은 튕김 획). 처음 절반은 불티 색, 식으면 먹
      const age0 = p.max - p.life;
      for (let i = 0; i < p.v; i++) {
        const h1 = hs(p.seed, i);
        const h2 = hs(p.seed, i + 40);
        const age = age0 - (p.a * i) / p.v - h1 * 0.02;
        const span = 0.12 + 0.12 * h2;
        if (age <= 0 || age >= span) continue;
        const ang = p.rot + (hs(p.seed, i + 80) - 0.5) * 0.7;
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
        hotCore(ctx, u / 0.15, (k) => spatter(ctx, 0, 0, R * 0.5 * k, p.rot, p.seed, 0));
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
    case 'tap': {
      // 잘게 떠는 획 — i번째는 (i/n)·a초에 박혀 0.1초 동안 가늘어지며 사라진다. 친 자리 둘레에 조금씩 비켜 박힌다. 막 박힌 획은 속이 포인트 색
      const age0 = p.max - p.life;
      const n = p.st;
      for (let i = 0; i < n; i++) {
        const age = age0 - (p.a * i) / n;
        const span = 0.12;
        if (age <= 0 || age >= span) continue;
        const f = 1 - age / span;
        const ox = (hs(p.seed, i) - 0.5) * p.size * 1.4;
        const L = p.size * (0.7 + 0.5 * hs(p.seed, i + 30));
        const y0 = py + p.size * 0.25;
        const tilt = (hs(p.seed, i + 60) - 0.5) * 0.3 * L;
        ctx.fillStyle = p.c1;
        brushLine(ctx, p.x + ox, y0, p.x + ox + tilt, y0 - L, p.v * (0.4 + 0.6 * f), 0, 1, 0.3, p.seed + i, 0, PRESS.flick);
        if (age < span * 0.45 && p.c2 !== p.c1) {
          ctx.fillStyle = p.c2;
          brushLine(ctx, p.x + ox, y0, p.x + ox + tilt * 0.8, y0 - L * 0.8, p.v * 0.42, 0, 1, 0, p.seed + i, 0, PRESS.flick);
        }
      }
      return;
    }
    case 'ring': {
      // 퍼지는 고리 — 앞 12%에 한 바퀴 그어지고 퍼지며 굵기가 줄어 지워진다(알파 없음). 막 그은 앞 30%엔 속이 포인트 색
      const s1 = Math.min(1, u / 0.12);
      const r = p.size * (1 + p.a * (1 - (1 - u) * (1 - u)));
      const w = p.v * t;
      if (w < 0.3) return;
      ctx.fillStyle = p.c1;
      enso(ctx, p.x, py, r, w, p.rot, 0, s1, 0.35, p.sw || 1, p.seed);
      if (u < 0.3 && p.c2 !== p.c1) {
        ctx.fillStyle = p.c2;
        enso(ctx, p.x, py, r, w * 0.42, p.rot, 0, s1, 0, p.sw || 1, p.seed);
        hotCore(ctx, u / 0.3, (k) => enso(ctx, p.x, py, r, w * 0.42 * k, p.rot, 0, s1, 0, p.sw || 1, p.seed));
      }
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

// ── 과열(드릴류 WeaponSpec.heat) ─────────────────────────────

/** 지난 프레임 무기 끝(월드 좌표) — 과열 먹 연기가 여기서 피어오른다 */
let heatTipAt: [number, number] | null = null;

/** 손에 든 무기 끝을 축으로 ang 쪽 len · 굵기 w 네모 하나(채우기는 부르는 쪽 색) */
function tipBar(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, w: number): void {
  const c = Math.cos(ang), s = Math.sin(ang);
  const nx = -s * w * 0.5, ny = c * w * 0.5;
  ctx.beginPath();
  ctx.moveTo(x + nx, y + ny);
  ctx.lineTo(x - c * len + nx, y - s * len + ny);
  ctx.lineTo(x - c * len - nx, y - s * len - ny);
  ctx.lineTo(x - nx, y - ny);
  ctx.closePath();
  ctx.fill();
}

/**
 * renderer가 졸라맨을 그린 바로 뒤(살아 있는 몸이 걸린 동안) 부른다. 열이 오를수록 무기 끝이 포인트 색으로 길게 달아오르고,
 * 반을 넘으면 그 속에 종이빛 줄(hotCore)이 선다. 4분의 3을 넘으면 끝에서 김 · 먹 연기 두 가닥이 오른다(커졌다 줄어 사라진다).
 * 멈춘 동안은 식은 먹 그대로다(달아오름 없음). HUD 막대는 없다 — 무기 끝이 곧 눈금이다
 */
export function drawHeatTip(ctx: CanvasRenderingContext2D, s: GameState, footX: number, footY: number): void {
  const h = WEAPON[s.weapon].heat;
  const b = h ? playerBlade(s.player.pose, s.player.poseTick) : null;
  if (!h || !b) { heatTipAt = null; return; }
  const tx = footX + b[2], ty = footY + b[3];
  heatTipAt = [tx, ty];
  const f = s.player.stall > 0 ? 0 : Math.min(1, s.player.heat / (h.max * h.cool));
  if (f <= 0.05) return;
  const ang = Math.atan2(b[3] - b[1], b[2] - b[0]);
  ctx.save();
  ctx.fillStyle = WEAPON_INK[s.weapon];
  tipBar(ctx, tx, ty, ang, 3 + 11 * f, 2.2 + 2.2 * f);
  if (f > 0.5) hotCore(ctx, (1 - (f - 0.5) * 2) * JUICE_SYS.HOT_U, (k) => tipBar(ctx, tx, ty, ang, 2 + 7 * f, k));
  if (f > 0.75) {
    ctx.fillStyle = GRAY;
    for (let i = 0; i < 2; i++) {
      const a = ((s.tick + i * 17) % 34) / 34;
      const r = (1 + 2.4 * a) * (a < 0.7 ? 1 : (1 - a) / 0.3);
      if (r < 0.4) continue;
      ctx.beginPath();
      ctx.ellipse(tx + Math.sin(a * 5 + i * 2) * 3, ty - 4 - a * 20, r * 1.3, r, -0.3, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}
