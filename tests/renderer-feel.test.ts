// 렌더러의 이벤트 소비 — 진동 고르기·스로틀, 필살 예비동작(미루기), 보스 상태 읽기.
// 캔버스는 쓰지 않는다(consumeEvents만) — 그리기 검증은 헤드리스 브라우저 캡처가 맡는다.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BOSS, HAPTIC, JUICE } from '../src/config';
import { CAPTIONS } from '../src/content';
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
const { consumeEvents, setFeedbackOptions } = await import('../src/render/renderer');

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

describe('콤보 고비 자막', () => {
  it('100을 넘는 틱에 한 번', () => {
    const s = state();
    s.combo = 99;
    tick(s);
    s.combo = 100;
    tick(s);
    expect(screen.startCaption).toHaveBeenCalledTimes(1);
    expect(screen.startCaption).toHaveBeenCalledWith(CAPTIONS.combo100, '100 콤보');
  });

  it('이어하기처럼 한 번에 뛴 콤보(0 → 148)는 친 게 아니다 — 자막 없음', () => {
    const s = state();
    tick(s);
    s.combo = 148;
    tick(s);
    expect(screen.startCaption).not.toHaveBeenCalled();
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
