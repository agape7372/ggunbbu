import type { GimmickId, Material, Theme } from '../core/types';

export const FLOOR_ROWS = ['weak', 'mid', 'hard', 'roof', 'entrance'] as const;
export const SPECIAL_ROWS = ['butter', 'cathedral', 'lobby', 'office', 'penthouse', 'glass', 'ice'] as const;

export function floorMaterialKey(mat: Material, theme: Theme): string {
  return mat === 'weak' || mat === 'mid' || mat === 'hard' ? `${theme}:${mat}` : mat;
}

/** 기존 층의 그림만 선택한다. 층 개수·높이·HP는 시뮬의 값을 그대로 쓴다. */
export function floorImageKey(mat: Material, theme: Theme, index: number, count: number,
  gimmick: GimmickId = 'none'): string {
  if (mat !== 'weak' && mat !== 'mid' && mat !== 'hard') return mat;
  if (gimmick === 'glass' || gimmick === 'ice') return gimmick;
  if (count > 1 && index === count - 1) return `${theme}:roof`;
  if (count > 1 && index === 0) return `${theme}:entrance`;
  return floorMaterialKey(mat, theme);
}
