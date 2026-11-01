// 타격 의성어·밈 자막 — 정본 카피. 11-01 먹 개편부터 판 위 글자는 보스 격파 「작전성공」과 완파 「N층」(붓글씨)만 쓴다.
// 나머지 의성어는 글자 딱지라 그리지 않는다(불변 13) — 다시 쓸 때를 위해 카피만 둔다.

export const ONOMATO = {
  hit: (combo: number): string =>
    combo >= 500 ? '빠샤아아!!!' : combo >= 100 ? '콰지지직!!' : combo >= 50 ? '콰지직!' : '콰직',
  floorCollapse: '우르르',
  stackDestroy: '쾅!!',
  butterCollapse: '팟!',
  special: '천지개벽!!!',
  specialAgeba: '올려베기!!',
  bossDefeat: '작전성공',
  guardAirBounce: '탁!',
  hatBreak: '깡!',
} as const;

/** HUD 밈. 렌더가 아직 안 붙인 자막. */
export const CAPTIONS = {
  pinned: '아이고',
  combo100: '실화냐',
  combo500: '그만하면 됩니다',
  combo999: '기계가 더 못 셉니다',
  scoreCap: '기계가 더 못 셉니다',
  record: '기록 돌파',
} as const;

/** 완파 붓글씨 — 몇 층을 무너뜨렸는지가 정보다(판 없는 먹 붓글씨, 11-01). */
export const destroyedCaption = (floors: number): string => `${floors}층 철거!`;

export function onomatoFor(kind: string, combo: number): string | null {
  switch (kind) {
    case 'hit': return ONOMATO.hit(combo);
    case 'floorCollapse': return ONOMATO.floorCollapse;
    case 'stackDestroy': return ONOMATO.stackDestroy;
    case 'butterCollapse': return ONOMATO.butterCollapse;
    case 'special': return ONOMATO.special;
    case 'specialAgeba': return ONOMATO.specialAgeba;
    case 'bossDefeat': return ONOMATO.bossDefeat;
    case 'guardAirBounce': return ONOMATO.guardAirBounce;
    case 'hatBreak': return ONOMATO.hatBreak;
    default: return null;
  }
}
