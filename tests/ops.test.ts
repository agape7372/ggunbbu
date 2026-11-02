// 특별작전(C3): 목표 한 줄 · B/A/S 도장 · 시작 p. 등급 산술 + 가드 봇 실측 계약.
// 봇 계약(결정 9): 가드 봇 5시드 중 B 4 이상, S 1 이하 — 수치를 만지면 이 표가 먼저 깨진다.
import { describe, it, expect } from 'vitest';
import { advance, makeState } from '../src/core/sim';
import { chapterOf } from '../src/core/spawner';
import { EMPTY_INPUT, type GameState, type InputFrame } from '../src/core/types';
import { ACT1, GIMMICK, TPS } from '../src/config';
import { OPERATIONS } from '../src/content/world';
import { SCREENS } from '../src/content/screens';
import {
  OP_IDS, betterGrade, isOpId, opGrade, opLimitTicks, opNeed, opShort, opValue, type OpGrade, type OpId,
} from '../src/meta/ops';

/** audit/content/curve.cjs 와 같은 가드 봇: 깔리면 탈출, 건물이 내려앉는 순간에 지면 가드, 나머지는 연타 */
function guardBot(s: GameState): InputFrame {
  const i = { ...EMPTY_INPUT };
  const p = s.player;
  if (p.pose === 'pinned') { i.guard = true; return i; }
  const st = s.stack;
  if (!st) { i.attack = true; return i; }
  if (p.y <= 0 && st.vy < 0 && st.y <= 56 && s.guardGauge >= 25) i.guard = true;
  else i.attack = true;
  return i;
}

/** startOp 와 같은 초기화로 작전 한 판을 돌려 (건물 수, 버틴 틱, 챕터 전환 여부)를 돌려준다 */
function runBot(id: OpId, seed: number): { buildings: number; ticks: number; unlocked: boolean } {
  const op = OPERATIONS.find((o) => o.id === id)!;
  const s = makeState({ seed });
  s.gimmick = id;
  s.chapter = op.themeIndex;
  s.score = Math.floor(ACT1.UNLOCK_SCORE * GIMMICK.START_P[id]);
  s.guardGauge = 50;
  let buildings = 0;
  let unlocked = false;
  const limit = opLimitTicks(id);
  while (s.tick < limit && !s.over) {
    advance(s, guardBot(s));
    for (const e of s.events) {
      if (e.kind === 'stackDestroy') buildings += 1;
      if (e.kind === 'chapterUnlock') unlocked = true;
    }
    s.events.length = 0;
  }
  return { buildings, ticks: s.tick, unlocked };
}

const SEEDS = [0xc0ffee, 1, 2, 3, 4];

describe('작전 등급 산술', () => {
  it('작전은 넷, 목록의 기믹 작전과 같다', () => {
    expect([...OP_IDS].sort()).toEqual(OPERATIONS.filter((o) => o.gimmick !== 'none').map((o) => o.id).sort());
    expect(isOpId('glass')).toBe(true);
    expect(isOpId('west')).toBe(false);
    expect(isOpId(7)).toBe(false);
  });

  it('경계: B 미만은 도장 없음, 문턱 값 그대로 그 등급', () => {
    for (const id of OP_IDS) {
      const [b, a, s] = [opNeed(id, 'B'), opNeed(id, 'A'), opNeed(id, 'S')];
      expect(b).toBeLessThan(a);
      expect(a).toBeLessThan(s);
      expect(opGrade(id, b - 1)).toBeNull();
      expect(opGrade(id, b)).toBe('B');
      expect(opGrade(id, a - 1)).toBe('B');
      expect(opGrade(id, a)).toBe('A');
      expect(opGrade(id, s - 1)).toBe('A');
      expect(opGrade(id, s)).toBe('S');
      expect(opGrade(id, s + 99)).toBe('S');
    }
  });

  it('더 높은 도장만 남긴다', () => {
    const order: (OpGrade | undefined)[] = [undefined, 'B', 'A', 'S'];
    for (let i = 0; i < order.length; i++) {
      for (let j = 0; j < order.length; j++) {
        expect(betterGrade(order[i], order[j])).toBe(order[Math.max(i, j)]);
      }
    }
  });

  it('값: 건물 작전은 부순 채 수, 버티기 작전은 흐른 초', () => {
    expect(opValue('glass', { buildings: 12, ticks: 5000 })).toBe(12);
    expect(opValue('orbit', { buildings: 3, ticks: TPS * 41 + 30 })).toBe(41);
  });

  it('시간 한도: 유리 골목 90초 · 궤도 직하 60초', () => {
    expect(opLimitTicks('glass')).toBe(90 * TPS);
    expect(opLimitTicks('orbit')).toBe(60 * TPS);
  });
});

describe('시작 p (GIMMICK.START_P)', () => {
  it('작전의 배경 챕터 안에 있다 — 시작하자마자 버터바로 새지 않는다', () => {
    for (const op of OPERATIONS.filter((o) => o.gimmick !== 'none')) {
      expect(chapterOf(GIMMICK.START_P[op.gimmick as OpId])).toBe(op.themeIndex);
    }
  });

  it('작전이 어려울수록 p가 높다 (유리 < 빙결 < 야간 < 궤도)', () => {
    const p = OP_IDS.map((id) => GIMMICK.START_P[id]).sort((x, y) => x - y);
    expect(GIMMICK.START_P.glass).toBe(p[0]);
    expect(GIMMICK.START_P.orbit).toBe(p[3]);
    expect(GIMMICK.START_P.ice).toBeLessThan(GIMMICK.START_P.night);
  });
});

describe('가드 봇 실측 계약 (5시드)', () => {
  for (const id of OP_IDS) {
    it(`${id}: B 4 이상 · S 1 이하, 챕터가 안 넘어간다`, () => {
      const rows = SEEDS.map((seed) => runBot(id, seed));
      const grades = rows.map((r) => opGrade(id, opValue(id, r)));
      const atLeast = (g: OpGrade): number => grades.filter((x) => x !== null && betterGrade(x, g) === x).length;
      expect(atLeast('B'), JSON.stringify(rows)).toBeGreaterThanOrEqual(4);
      expect(atLeast('S'), JSON.stringify(rows)).toBeLessThanOrEqual(1);
      expect(rows.some((r) => r.unlocked)).toBe(false);
    });
  }
});

describe('작전 문구 · 다음 도장', () => {
  it('다음 도장까지 모자란 값', () => {
    expect(opShort('glass', 0)).toEqual({ next: 'B', short: 10 });
    expect(opShort('glass', 10)).toEqual({ next: 'A', short: 3 });
    expect(opShort('glass', 13)).toEqual({ next: 'S', short: 4 });
    expect(opShort('glass', 40)).toBeNull();
  });

  it('목표 한 줄은 B 기준, 도장 문턱은 한 줄', () => {
    expect(SCREENS.ops.goal('glass')).toBe('90초 안에 건물 10채');
    expect(SCREENS.ops.goal('orbit')).toBe('20초 버티기');
    expect(SCREENS.ops.ladder('glass')).toBe('B 10 · A 13 · S 17');
    expect(SCREENS.ops.ladder('orbit')).toBe('B 20 · A 35 · S 60');
  });

  it('판 도중 한 줄: 건물 작전은 남은 시간 · 다음 도장, 버티기 작전은 버틴 초', () => {
    expect(SCREENS.ops.hud('glass', 63, 7)).toBe('63초 · 7/10채 B');
    expect(SCREENS.ops.hud('glass', 10, 25)).toBe('10초 · 25채 S');
    expect(SCREENS.ops.hud('orbit', 30, 22)).toBe('22/35초 A');
  });

  it('결과 카드의 진행 줄', () => {
    expect(SCREENS.ops.progress('night', 9)).toBe('B 도장까지 2채');
    expect(SCREENS.ops.progress('night', 99)).toBe('');
  });
});
