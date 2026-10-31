// 기록 코드 다시 돌리기 — 받는 쪽이 같은 판을 처음부터 돌려 시간 · 점수를 직접 낸다(코드 안의 숫자는 미리보기).
// stage.ts와 따로 둔다: sim.ts → stage.ts 방향만 있게(여기는 sim을 부른다).

import type { GameState, InputFrame, WazaId } from './types';
import { makeState, advance } from './sim';
import { STAGE_SIM_VERSION, judgeStage, stageSeed, startStage, type StageResult } from './stage';
import { STAGES } from './stages';
import { REPLAY_MAX_TICKS, createPlayback, type Replay } from './replay';
import { WEAPON } from '../config';

const WAZA: readonly WazaId[] = ['tenchi', 'ageba', 'tetsu'];

/** sim = 시뮬 판이 다르다(구판) · stage = 모르는 판 · gear = 모르는 무기 · 필살 · seed = 시드가 판과 다르다 */
export type ReplayError = 'sim' | 'stage' | 'gear' | 'seed';

/** 코드를 상태 하나로 세운다 — 화면 재생(한 틱씩)과 검증(끝까지)이 같은 두 줄로 시작한다 */
export function startReplay(r: Replay): { s: GameState; next: () => InputFrame } | { error: ReplayError } {
  if (r.head.sim !== STAGE_SIM_VERSION) return { error: 'sim' };
  if (!STAGES.some((d) => d.id === r.head.stage)) return { error: 'stage' };
  if (!(r.head.weapon in WEAPON) || !(WAZA as readonly string[]).includes(r.head.waza)) return { error: 'gear' };
  if ((r.head.seed >>> 0) !== stageSeed(r.head.stage)) return { error: 'seed' };
  const s = makeState({ seed: r.head.seed });
  startStage(s, {
    id: r.head.stage, diff: Math.min(2, Math.max(0, r.head.diff)) as 0 | 1 | 2,
    weapon: r.head.weapon as GameState['weapon'], waza: r.head.waza as WazaId,
  });
  const pb = createPlayback(r.events);
  return { s, next: () => pb.next() };
}

/** 끝까지 돌려 판정한다. match = 코드에 적힌 끝(시간 · 점수 · 깼나)과 다시 돌린 값이 같은가 */
export function verifyReplay(r: Replay, maxTicks = REPLAY_MAX_TICKS):{ result: StageResult; match: boolean } | { error: ReplayError } {
  const run = startReplay(r);
  if ('error' in run) return run;
  const { s, next } = run;
  while (!s.over && s.tick < maxTicks) {
    advance(s, next());
    s.events.length = 0;
  }
  const result = judgeStage(s);
  const match = result.cleared === r.end.cleared && result.ticks === r.end.ticks && result.score === r.end.score;
  return { result, match };
}
