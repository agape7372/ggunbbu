// 1막/토코톤 건물 생성 — 진행도 p 기반 층수·재질 분포, 챕터 테마.

import type { Floor, GameState, Material, Theme } from './types';
import { makeFloor, makeStack } from './building';
import { rand } from './rng';
import { ACT1, GIMMICK } from '../config';

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
  const floorCount = ACT1.FLOORS_MIN + Math.floor(ACT1.FLOORS_ADD * pc);
  const dist = matDist(pc);
  const theme = chapterTheme(s.chapter);
  const floors: Floor[] = [];
  for (let i = 0; i < floorCount; i++) {
    // 층 재질 추첨 후 30% 확률로 재추첨(±1 단계 변형) — 세그먼트 분할이 없어진 뒤의 층 단위 변형
    const base = pickMat(s, dist);
    const f = makeFloor(base);
    if (rand(s) < 0.3) {
      const alt = pickMat(s, dist);
      const hp = alt === 'weak' ? 1 : alt === 'mid' ? 2 : 3;
      f.segs[0] = { hp, maxHp: hp };
    }
    floors.push(f);
  }
  if (s.gimmick === 'glass') {
    for (let i = 0; i < floors.length; i += GIMMICK.GLASS_EVERY) {
      floors[i].mat = 'weak';
      floors[i].segs[0] = { hp: 1, maxHp: 1 };
    }
  }
  const fall = s.gimmick === 'orbit' ? GIMMICK.ORBIT_SPAWN_VY : GIMMICK.DEFAULT_SPAWN_VY;
  s.stack = makeStack({ variant: 'building', theme, floors, vy: fall });
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
