// 타격 의성어·밈 자막. 렌더는 아직 하드코딩 — 여기가 정본 카피.
// renderer.ts 는 이 모듈을 수정하지 말 것(다른 에이전트). import 만 제안.

export const ONOMATO = {
  hit: (combo: number): string =>
    combo >= 500 ? '빠샤아아!!!' : combo >= 100 ? '콰지지직!!' : combo >= 50 ? '콰지직!' : '콰직',
  floorCollapse: '우르르',
  stackDestroy: '쾅!!',
  butterCollapse: '팟!',
  special: '천지개벽!!!',
  bossDefeat: '작전성공',
  guardAirBounce: '탁!',
} as const;

/** HUD 밈. 렌더가 아직 안 붙인 자막. */
export const CAPTIONS = {
  pinned: '아이고',
  combo100: '실화냐',
  combo500: '그만하면 됩니다',
  combo999: '기계가 더 못 셉니다',
  scoreCap: '기계가 더 못 셉니다',
  gaugeFull: '눌러.',
  specialReady: '눌러.',
} as const;

export function onomatoFor(kind: string, combo: number): string | null {
  switch (kind) {
    case 'hit': return ONOMATO.hit(combo);
    case 'floorCollapse': return ONOMATO.floorCollapse;
    case 'stackDestroy': return ONOMATO.stackDestroy;
    case 'butterCollapse': return ONOMATO.butterCollapse;
    case 'special': return ONOMATO.special;
    case 'bossDefeat': return ONOMATO.bossDefeat;
    case 'guardAirBounce': return ONOMATO.guardAirBounce;
    default: return null;
  }
}
