// 렌더러의 이벤트 소비 — 진동 고르기·스로틀, 필살 예비동작(미루기), 보스 상태 읽기.
// 캔버스는 쓰지 않는다(consumeEvents만) — 그리기 검증은 헤드리스 브라우저 캡처가 맡는다.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BOSS, COMBO_MARK, HAPTIC, JUICE } from '../src/config';
import { initBoss } from '../src/core/boss';
import { makeState } from '../src/core/sim';
import type { GameState, JuiceEvent } from '../src/core/types';

vi.mock('../src/platform/native', async (orig) => ({
  ...await orig<typeof import('../src/platform/native')>(),
  vibrate: vi.fn(),
}));
vi.mock('../src/render/effects', async (orig) => ({
  ...await orig<typeof import('../src/render/effects')>(),
  spawnBossBreak: vi.fn(),
  spawnStackShatter: vi.fn(),
}));
vi.mock('../src/render/screenfx', async (orig) => ({
  ...await orig<typeof import('../src/render/screenfx')>(),
  startCaption: vi.fn(),
}));

const { vibrate } = await import('../src/platform/native');
const fx = await import('../src/render/effects');
const screen = await import('../src/render/screenfx');
const { comboMarkView, consumeEvents, setFeedbackOptions } = await import('../src/render/renderer');

function state(events: JuiceEvent[] = []): GameState {
  const s = makeState();
  s.stack = null;
  s.events = events;
  return s;
}

/** 틱 하나: 이벤트를 넣고 소비하고 비운다(씬이 하는 일) */
function tick(s: GameState, events: JuiceEvent[] = []): void {
  s.events = events;
  consumeEvents(s);
  s.events.length = 0;
}

beforeEach(() => {
  vi.mocked(vibrate).mockClear();
  vi.mocked(fx.spawnBossBreak).mockClear();
  vi.mocked(fx.spawnStackShatter).mockClear();
  setFeedbackOptions({ vibration: true });
  // 앞 시험이 남긴 예비동작·보스 표식을 흘려 보낸다
  const s = state();
  for (let i = 0; i < 12; i++) tick(s);
  vi.mocked(vibrate).mockClear();
  vi.mocked(screen.startCaption).mockClear();
});

/** 연출 상태를 비운다 — 틱이 되감기면 새 런으로 본다 */
function rewind(): void {
  const s = state();
  s.tick = 1;
  tick(s);
  s.tick = 0;
  tick(s);
}

/** 타격 하나 — 시뮬처럼 s.combo를 올리고 같은 수를 이벤트에 싣는다 */
function hitTo(s: GameState, n: number, kind: JuiceEvent['kind'] = 'hit'): void {
  s.combo = n;
  tick(s, [{ kind, y: 100, combo: n }]);
}

describe('콤보 도장 — 판 위 타격 자리', () => {
  beforeEach(rewind);

  it('타격마다 그 콤보를 찍고, 고비(10 · 30)를 넘는 타격에 그 칸 연출을 켠다', () => {
    const s = state();
    for (let n = 1; n <= 9; n++) hitTo(s, n);
    expect(comboMarkView()).toMatchObject({ n: 9, shown: true, step: -1 });
    hitTo(s, 10);
    expect(comboMarkView()).toMatchObject({ n: 10, step: 0 });
    for (let n = 11; n <= 30; n++) hitTo(s, n, n % 2 ? 'hit' : 'floorCollapse');
    expect(comboMarkView()).toMatchObject({ n: 30, step: 1 });
  });

  it('필살이 부순 층(콤보가 안 실린 층 붕괴)은 도장에 안 찍힌다', () => {
    const s = state();
    hitTo(s, 5);
    tick(s, [{ kind: 'floorCollapse', y: 100 }]);
    expect(comboMarkView().n).toBe(5);
  });

  it('이어하기처럼 한 번에 뛴 콤보(0 → 149)는 친 게 아니다 — 고비 연출 없음', () => {
    const s = state();
    hitTo(s, 149);
    expect(comboMarkView()).toMatchObject({ n: 149, step: -1 });
  });

  it('999에서 멈춘다 — 카운터스톱 뒤 타격(1000)도 999', () => {
    const s = state();
    hitTo(s, 998);
    hitTo(s, 999);
    expect(comboMarkView()).toMatchObject({ n: 999, step: COMBO_MARK.STEPS.length - 1 });
    tick(s, [{ kind: 'hit', y: 100, combo: 1000 }]);
    expect(comboMarkView().n).toBe(999);
  });

  it('끊기면 10 이상은 두 동강 난 조각이 남고, 9 이하는 그냥 사라진다', () => {
    const s = state();
    for (let n = 1; n <= 12; n++) hitTo(s, n);
    s.combo = 0;
    tick(s, [{ kind: 'comboBreak', combo: 12 }]);
    expect(comboMarkView()).toMatchObject({ n: 0, shown: false, broken: 12 });
    rewind();
    for (let n = 1; n <= 9; n++) hitTo(s, n);
    s.combo = 0;
    tick(s, [{ kind: 'comboBreak', combo: 9 }]);
    expect(comboMarkView()).toMatchObject({ n: 0, shown: false, broken: 0 });
  });

  it('보스 입장처럼 끊김 없이 0이 되면 조용히 거둔다', () => {
    const s = state();
    for (let n = 1; n <= 30; n++) hitTo(s, n);
    s.combo = 0;
    tick(s);
    expect(comboMarkView()).toMatchObject({ n: 0, shown: false, broken: 0 });
  });

  it('안전모 받기 이벤트에 받기 연출을 켠다', () => {
    const s = state();
    tick(s, [{ kind: 'hatGet', combo: 50, y: 60 }]);
    expect(comboMarkView().hat).toBe(0);
  });
});

describe('진동 — 타격 스로틀과 겹침 규칙', () => {
  it('타격 세 번에 한 번만 14ms', () => {
    const s = state();
    for (let i = 0; i < 6; i++) tick(s, [{ kind: 'hit', y: 100, combo: i + 1 }]);
    expect(vibrate).toHaveBeenCalledTimes(2);
    expect(vibrate).toHaveBeenCalledWith(HAPTIC.hit);
  });

  it('사망 틱: 피격(60) + 라이프 손실([60,40,90]) 중 긴 하나만', () => {
    const s = state();
    tick(s, [{ kind: 'lifeLost', n: 0 }, { kind: 'hurt', y: 0 }]);
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(HAPTIC.lifeLost);
  });

  it('설정에서 진동을 끄면 아무것도 쏘지 않는다', () => {
    setFeedbackOptions({ vibration: false });
    const s = state();
    tick(s, [{ kind: 'bossDefeat' }, { kind: 'hurt' }]);
    expect(vibrate).not.toHaveBeenCalled();
  });
});

describe('필살 예비동작 — 히트스톱 동안 미루고 끝나는 틱에 푼다', () => {
  const total = JUICE.special.hitstop;

  it('입력 틱엔 진동·흔들림이 안 나가고, 히트스톱이 끝나는 틱에 필살 진동 하나', () => {
    const s = state();
    tick(s, [{ kind: 'special', lane: 0 }, { kind: 'stackDestroy', n: 4 }]);
    expect(vibrate).not.toHaveBeenCalled();
    for (let i = 1; i < total; i++) {
      tick(s);
      expect(vibrate).not.toHaveBeenCalled();
    }
    tick(s); // total번째 뒤 틱
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(HAPTIC.special);
  });

  it('한 번 풀리고 나면 다음 필살은 다시 예비동작을 탄다', () => {
    const s = state();
    tick(s, [{ kind: 'special', lane: 0 }]);
    for (let i = 0; i < total; i++) tick(s);
    expect(vibrate).toHaveBeenCalledTimes(1);
    vi.mocked(vibrate).mockClear();
    tick(s, [{ kind: 'special', lane: 0 }]);
    expect(vibrate).not.toHaveBeenCalled();
    for (let i = 0; i < total; i++) tick(s);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('예비동작 중 새 런이 시작되면(틱 되감김) 미룬 연출을 버린다 — 다음 판 첫 틱에 터지지 않는다', () => {
    const old = state();
    old.tick = 900;
    tick(old, [{ kind: 'special', lane: 0 }]);
    const fresh = state(); // 새 런: tick 0부터
    for (let i = 0; i < total + 3; i++) { fresh.tick = i; tick(fresh); }
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('건물이 통째로 사라진 필살만 유령을 해체한다 — 건물이 서 있으면(올려베기) 해체 없음', () => {
    const s = state();
    tick(s, [{ kind: 'special', lane: 0 }]); // stackDestroy 없음 → 유령 없음
    for (let i = 0; i < total; i++) tick(s);
    expect(fx.spawnStackShatter).not.toHaveBeenCalled();
  });
});

describe('보스 상태 읽기', () => {
  it('입장 BREAK 틱에 한 번만 — 히트스톱으로 같은 틱이 반복돼도 중복 없음', () => {
    const s = state();
    s.boss = initBoss();
    s.boss.st = 'enter';
    s.boss.stTick = BOSS.INTRO.BREAK - 1;
    tick(s);
    expect(fx.spawnBossBreak).not.toHaveBeenCalled();
    s.boss.stTick = BOSS.INTRO.BREAK;
    tick(s);
    tick(s); // 같은 표식 — 히트스톱
    tick(s);
    expect(fx.spawnBossBreak).toHaveBeenCalledTimes(1);
    s.boss.stTick = BOSS.INTRO.BREAK + 1;
    tick(s);
    expect(fx.spawnBossBreak).toHaveBeenCalledTimes(1);
  });
});
