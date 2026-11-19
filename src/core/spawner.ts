// 1막/토코톤 건물 생성 — 진행도 p 기반 층수·재질 분포, 챕터 테마.

import type { Floor, GameState, Material, StackVary, Theme } from './types';
import { makeFloor, makeStack } from './building';
import { rand } from './rng';
import { spawnTopY } from './camera';
import { extraFloors } from './perks';
import { ACT1, ARCADE_VARY, GIMMICK, STAGE } from '../config';

/** p 구간 선형 보간으로 재질 분포 [weak, mid, hard] */
export function matDist(p: number): [number, number, number] {
  const t = Math.min(Math.max(p, 0), 1);
  const rows = ACT1.MAT_DIST;
  for (let i = 1; i < rows.length; i++) {
    if (t <= rows[i][0]) {
      const [p0, w0, m0, h0] = rows[i - 1];
      const [p1, w1, m1, h1] = rows[i];
      const k = p1 === p0 ? 0 : (t - p0) / (p1 - p0);
      return [w0 + (w1 - w0) * k, m0 + (m1 - m0) * k, h0 + (h1 - h0) * k];
    }
  }
  const last = rows[rows.length - 1];
  return [last[1], last[2], last[3]];
}

/** 현재 p의 챕터 index (0~3) */
export function chapterOf(p: number): number {
  let c = 0;
  for (const b of ACT1.CHAPTER_BOUNDS) if (p >= b) c += 1;
  return Math.min(c, ACT1.CHAPTER_THEMES.length - 1);
}

export function chapterTheme(chapter: number): Theme {
  return ACT1.CHAPTER_THEMES[Math.min(chapter, ACT1.CHAPTER_THEMES.length - 1)];
}

const MATS: readonly Material[] = ['weak', 'mid', 'hard'];

/** 1막 일반 건물 스폰 (세그별 독립 재질 추첨 — 레인 선택이 최적화 요소가 되도록) */
export function spawnAct1Building(s: GameState): void {
  const pc = Math.min(s.p, 1);
  const floorCount = ACT1.FLOORS_MIN + Math.floor(ACT1.FLOORS_ADD * pc) + extraFloors(s); // 현장 조건 「야근」 +1층
  const dist = matDist(pc);
  const theme = chapterTheme(s.chapter);
  const floors: Floor[] = [];
  for (let i = 0; i < floorCount; i++) {
    // 층 재질 추첨 후 30% 확률로 재추첨(±1 단계 변형) — 세그먼트 분할이 없어진 뒤의 층 단위 변형
    // ★09-05 정합: 재추첨이 segs[0].hp만 갈아끼우고 f.mat은 base로 남겨 뒀다. 렌더는 mat으로
    // 타일을 고르므로(render/sprites.ts drawThemeDetail) 1막 층의 약 20%가 **보이는 등급 ≠ 실제 HP**
    // 였다 — 약해 보이는 층이 3대를 먹는다. makeFloor로 통째로 교체해 등급과 HP를 한 출처
    // (config MAT_HP)에서 함께 세운다. rand 호출 순서·횟수는 그대로라 시뮬 산술은 불변이다.
    const base = pickMat(s, dist);
    let f = makeFloor(base);
    if (rand(s) < 0.3) f = makeFloor(pickMat(s, dist));
    floors.push(f);
  }
  if (s.gimmick === 'glass') {
    for (let i = 0; i < floors.length; i += GIMMICK.GLASS_EVERY) {
      floors[i].mat = 'weak';
      floors[i].segs[0] = { hp: 1, maxHp: 1 };
    }
  }
  // 아케이드(기믹 없음)만: 변종 추첨은 층 재질 추첨 뒤(앞 난수 순서 그대로) · 생김 높이는 지시서처럼 화면 맨 위 바로 위.
  // 특별작전은 생김 높이 · 초속 그대로(STACK.SPAWN_Y · 궤도 직하 초속)
  const arcade = s.gimmick === 'none';
  const vary = arcade && s.drops >= ARCADE_VARY.CALM ? rollVary(s, pc) : undefined;
  // 성급한 건물은 「최하층을 HP1로 남겨 두면」 급락한다 — 맨 아래가 약재면 생기자마자 세기 시작하니 중재로 올린다(대본 「~」 건물도 맨 아래가 중 · 강이다)
  if (vary?.hasty && floors[0].mat === 'weak') floors[0] = makeFloor('mid');
  const fall = s.gimmick === 'orbit' ? GIMMICK.ORBIT_SPAWN_VY : vary?.fast ? STAGE.FAST_SPAWN_VY : GIMMICK.DEFAULT_SPAWN_VY;
  s.stack = makeStack({ variant: 'building', theme, floors, vy: fall, y: arcade ? spawnTopY(s) : undefined });
  if (vary) s.stack.vary = vary;
}

/** 변종 추첨 — 난수 셋(빠름 · 성급 · 붙어 옴)을 늘 같은 수만큼 뽑는다. 확률은 구역 표 [들머리, 끝]을 구역 안 p로 잇는다 */
export function rollVary(s: GameState, pc: number): StackVary | undefined {
  const ch = chapterOf(pc);
  const lo = ch === 0 ? 0 : ACT1.CHAPTER_BOUNDS[ch - 1];
  const hi = ch < ACT1.CHAPTER_BOUNDS.length ? ACT1.CHAPTER_BOUNDS[ch] : 1;
  const k = Math.min(1, Math.max(0, (pc - lo) / (hi - lo)));
  const r = ARCADE_VARY.RATE[ch];
  const at = (x: readonly [number, number]) => x[0] + (x[1] - x[0]) * k;
  const fast = rand(s) < at(r.fast);
  const hasty = rand(s) < at(r.hasty);
  const joined = rand(s) < at(r.joined);
  return fast || hasty || joined ? { fast, hasty, hastyT: 0, joined, fall: 1 } : undefined;
}

function pickMat(s: GameState, dist: [number, number, number]): Material {
  const x = rand(s);
  if (x < dist[0]) return MATS[0];
  if (x < dist[0] + dist[1]) return MATS[1];
  return MATS[2];
}

/** 버터바 스폰 (이벤트 스테이지) — layers 겹 */
export function spawnButterbar(s: GameState, layers: number): void {
  const floors: Floor[] = [];
  for (let i = 0; i < layers; i++) floors.push(makeFloor('butter'));
  s.stack = makeStack({ variant: 'butterbar', theme: chapterTheme(s.chapter), floors });
}
