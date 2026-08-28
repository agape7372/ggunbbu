// PNG 스프라이트 시트 프레임 인덱스 — manifest `frames` 가로 등분 순서와 1:1.
// 파일이 아직 없어도 인덱스는 고정. Codex가 public/img/char/*.png 를 넣으면 바로 붙는다.

import type { BossSt, PlayerPose } from '../core/types';
import { PLAYER } from '../config';

/** player.png 가로 11칸. 셀 기준점은 발(anchor:foot). */
export const PLAYER_SHEET = [
  'idle',
  'jump',
  'attack0',
  'attack1',
  'attack2',
  'guardG',
  'guardA',
  'guardBreak',
  'special',
  'pinned',
  'dead',
] as const;

/** boss.png 가로 4칸. 셀 중심 = 본체 중심(anchor:center). */
export const BOSS_SHEET = ['idle', 'charging', 'stagger', 'defeated'] as const;

export function playerSheetFrame(pose: PlayerPose, animTick: number): number {
  let key: (typeof PLAYER_SHEET)[number] = 'idle';
  switch (pose) {
    case 'jump': key = 'jump'; break;
    case 'attack':
      if (animTick < PLAYER.ATTACK_PRE) key = 'attack0';
      else if (animTick < PLAYER.ATTACK_PRE + PLAYER.ATTACK_ACTIVE) key = 'attack1';
      else key = 'attack2';
      break;
    case 'guardG': key = 'guardG'; break;
    case 'guardA': key = 'guardA'; break;
    case 'guardBreak': key = 'guardBreak'; break;
    case 'special': key = 'special'; break;
    case 'pinned': key = 'pinned'; break;
    case 'dead': key = 'dead'; break;
    default: key = 'idle'; break;
  }
  return PLAYER_SHEET.indexOf(key);
}

export function bossSheetFrame(st: BossSt): number {
  const kind =
    st === 'charging' || st === 'descend' || st === 'attacking' ? 'charging' :
    st === 'stagger' ? 'stagger' :
    st === 'defeated' ? 'defeated' : 'idle';
  return BOSS_SHEET.indexOf(kind);
}

export function entityAssetKey(kind: 'bolt' | 'boltCue' | 'rock' | 'shotOk' | 'shotNo' | 'rabbit' | 'cannon'): string {
  return `ent-${kind}`;
}
