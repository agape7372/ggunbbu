// 작업 지시서 힌트 — 막힌 흔적이 보일 때만 한 줄, 한 판에 한 번(순수 함수). 크레인 힌트가 기대는 stackDestroy가 정말 나는지도 본다.
import { describe, expect, it } from 'vitest';
import { advance, makeState } from '../src/core/sim';
import { stageSeed, startStage } from '../src/core/stage';
import { EMPTY_INPUT, type GameState } from '../src/core/types';
import { STAGE_MODE } from '../src/content/stages';
import { newHintMemo, nextHint, stageHint } from '../src/ui/stageLogic';

/** 힌트가 읽는 칸만 있는 가짜 상태 */
function fake(o: {
  bellCuts?: number; diff?: number; groundRocks?: number; stackFloors?: number; events?: string[];
  player?: { pose: string; y: number };
  /** hp = 몸 층마다 체력(층 수가 막을 정한다) · y = 몸 밑면 */
  lm?: { id: string; st?: string; n?: number; cue?: number; air?: number; hp?: number[]; y?: number };
}): GameState {
  const { hp, y, ...lm } = o.lm ?? { id: '' };
  return {
    stage: { diff: o.diff ?? 1, tally: { bellCuts: o.bellCuts ?? 0 } },
    lm: o.lm ? { st: 'play', n: 0, body: hp ? { floors: hp.map((h) => ({ segs: [{ hp: h }] })), y: y ?? 0 } : null, ...lm } : null,
    stack: o.stackFloors === undefined ? null : { floors: new Array(o.stackFloors).fill(0) },
    player: o.player ?? { pose: 'idle', y: 0 },
    groundRocks: o.groundRocks ?? 0,
    events: (o.events ?? []).map((kind) => ({ kind })),
  } as unknown as GameState;
}

describe('힌트 경계', () => {
  it('종: 깡 두 번은 조용, 세 번째에 말한다', () => {
    expect(stageHint(fake({ bellCuts: 2, lm: { id: 'bell' } }), newHintMemo())).toBe('');
    expect(stageHint(fake({ bellCuts: 3, lm: { id: 'bell' } }), newHintMemo())).toBe(STAGE_MODE.bellHint);
  });

  it('바람: 좌판 셋은 조용, 넷째가 나오도록 한 번도 못 앉혔을 때만 — 한 번이라도 앉았으면 영영 조용', () => {
    expect(stageHint(fake({ lm: { id: 'wind', n: 3 } }), newHintMemo())).toBe('');
    expect(stageHint(fake({ lm: { id: 'wind', n: 4 } }), newHintMemo())).toBe(STAGE_MODE.windHint);
    const memo = newHintMemo();
    expect(stageHint(fake({ lm: { id: 'wind', st: 'sit', n: 1 } }), memo)).toBe('');
    expect(memo.sat).toBe(true);
    expect(stageHint(fake({ lm: { id: 'wind', n: 6 } }), memo)).toBe('');
  });

  it('크레인: 부서진 짐 하나는 조용, 둘째에 말한다(틱마다 stackDestroy를 센다)', () => {
    const memo = newHintMemo();
    expect(stageHint(fake({ lm: { id: 'crane' }, events: ['stackDestroy'] }), memo)).toBe('');
    expect(memo.broke).toBe(1);
    expect(stageHint(fake({ lm: { id: 'crane' }, events: ['hit'] }), memo)).toBe('');
    expect(stageHint(fake({ lm: { id: 'crane' }, events: ['stackDestroy'] }), memo)).toBe(STAGE_MODE.craneHint);
  });

  it('다른 명물에서는 크레인 · 바람 말이 안 나온다', () => {
    expect(stageHint(fake({ lm: { id: 'pagoda', n: 9 }, events: ['stackDestroy', 'stackDestroy'] }), newHintMemo())).toBe('');
  });

  it('한 판에 한 번만', () => {
    const run = { memo: newHintMemo() };
    const s = fake({ bellCuts: 5, lm: { id: 'bell' } });
    expect(nextHint(s, run)).toBe(STAGE_MODE.bellHint);
    expect(nextHint(s, run)).toBe('');
  });
});

describe('2판 기믹 자막', () => {
  it('종탑: 3막(남은 층 1)의 내려찍기가 시작될 때 — 2막 · 다른 상태에선 조용', () => {
    expect(stageHint(fake({ lm: { id: 'bell', st: 'slam', hp: [9] } }), newHintMemo())).toBe(STAGE_MODE.bellAct3Hint);
    expect(stageHint(fake({ lm: { id: 'bell', st: 'play', hp: [9] } }), newHintMemo())).toBe('');
    expect(stageHint(fake({ lm: { id: 'bell', st: 'slam', hp: [9, 9] } }), newHintMemo())).toBe('');
  });

  it('바람탑: 3막 들숨에 몸이 높은데 땅에서 베기를 시작한 헛손질 둘 — 날숨 · 점프 베기 · 낮은 몸 · 2막은 안 센다', () => {
    const swing = (memo: ReturnType<typeof newHintMemo>, o: { air?: number; y?: number; py?: number; hp?: number[]; pose?: string } = {}) =>
      stageHint(fake({
        lm: { id: 'wind', st: 'sit', air: o.air ?? 0, y: o.y ?? 120, hp: o.hp ?? [5] },
        player: { pose: o.pose ?? 'attack', y: o.py ?? 0 },
      }), memo);
    const rest = (memo: ReturnType<typeof newHintMemo>) => swing(memo, { pose: 'idle' }); // 베기가 끝난 틱 — 다음 베기를 새로 센다
    const memo = newHintMemo();
    expect(swing(memo)).toBe('');
    expect(memo.whiff).toBe(1);
    expect(swing(memo)).toBe(''); // 같은 베기가 이어지는 틱은 또 세지 않는다
    expect(memo.whiff).toBe(1);
    rest(memo);
    expect(swing(memo)).toBe(STAGE_MODE.windAct3Hint);
    expect(memo.whiff).toBe(2);
    for (const o of [{ air: 1 }, { py: 80 }, { y: 60 }, { hp: [5, 5] }]) {
      const m = newHintMemo();
      for (let i = 0; i < 3; i++) { swing(m, o); rest(m); }
      expect(m.whiff, JSON.stringify(o)).toBe(0);
    }
  });

  it('구층탑: 정규 · 외주, 2막 이상, 땅 기와 둘부터 — 견습 · 1막 · 기와 하나는 조용', () => {
    const at = (o: { diff?: number; stackFloors?: number; groundRocks?: number }) =>
      stageHint(fake({ lm: { id: 'pagoda' }, diff: 1, stackFloors: 6, groundRocks: 2, ...o }), newHintMemo());
    expect(at({})).toBe(STAGE_MODE.pagodaPullHint);
    expect(at({ diff: 2, stackFloors: 3 })).toBe(STAGE_MODE.pagodaPullHint);
    expect(at({ groundRocks: 1 })).toBe('');
    expect(at({ stackFloors: 7 })).toBe('');
    expect(at({ diff: 0 })).toBe('');
  });

  it('크레인: 첫 걸림 반창(cue 2)이 처음 될 때', () => {
    expect(stageHint(fake({ lm: { id: 'crane', cue: 1 } }), newHintMemo())).toBe('');
    expect(stageHint(fake({ lm: { id: 'crane', cue: 2 } }), newHintMemo())).toBe(STAGE_MODE.craneDoubleHint);
  });

  it('자막마다 한 판에 한 번 — 종탑의 옛 자막을 이미 말했어도 3막 자막은 나온다', () => {
    const run = { memo: newHintMemo() };
    expect(nextHint(fake({ bellCuts: 3, lm: { id: 'bell', hp: [9, 9] } }), run)).toBe(STAGE_MODE.bellHint);
    const slam = fake({ bellCuts: 3, lm: { id: 'bell', st: 'slam', hp: [9] } });
    expect(nextHint(slam, run)).toBe(STAGE_MODE.bellAct3Hint);
    expect(nextHint(slam, run)).toBe('');
  });
});

describe('크레인 짐을 베면 stackDestroy가 난다', () => {
  it('4-B에서 짐을 베어 없애면 이벤트가 나고, 둘째 짐에서 힌트가 선다', () => {
    const s = makeState({ seed: stageSeed('4-B') });
    startStage(s, { id: '4-B', diff: 1, weapon: 'sword', waza: 'tenchi' });
    const run = { memo: newHintMemo() };
    let destroyed = 0;
    let hint = '';
    for (let t = 0; t < 3600 && !s.over; t++) {
      advance(s, { ...EMPTY_INPUT, attack: t % 6 === 0 });
      destroyed += s.events.filter((e) => e.kind === 'stackDestroy').length;
      hint ||= nextHint(s, run);
      s.events.length = 0;
    }
    expect(destroyed).toBeGreaterThanOrEqual(2);
    expect(hint).toBe(STAGE_MODE.craneHint);
  });
});
