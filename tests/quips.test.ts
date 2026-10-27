// 게임오버 만담 표(C10) — 조건이 구체적인 항목부터, 직전 줄 반복 금지, 연속 사망 사다리는 첫 칸으로 안 돌아간다.
import { describe, it, expect } from 'vitest';
import {
  GAMEOVER_QUIPS, QUIP_LADDER, QUIP_RULES, pickQuip, type QuipCtx,
} from '../src/content/screens';
import { QUIP_STREAK_FROM } from '../src/config';

const base: QuipCtx = {
  score: 120_000, hatBroke: false, chapter: 0, mode: 'act1', boss: false, streak: 1, seed: 7,
};
const ctx = (o: Partial<QuipCtx> = {}): QuipCtx => ({ ...base, ...o });
const linesOf = (id: string): readonly string[] => QUIP_RULES.find((r) => r.id === id)!.lines;

describe('조건 표', () => {
  it('0점이면 0점 줄', () => {
    for (let seed = 0; seed < 12; seed++) {
      expect(linesOf('zero')).toContain(pickQuip(ctx({ score: 0, seed }), ''));
    }
  });

  it('안전모가 깨진 판 · 야근 · 보스 앞 · 구역3 이상 · 2막 각자 줄을 가진다', () => {
    expect(linesOf('hat')).toContain(pickQuip(ctx({ hatBroke: true }), ''));
    expect(linesOf('tokoton')).toContain(pickQuip(ctx({ mode: 'tokoton' }), ''));
    expect(linesOf('boss')).toContain(pickQuip(ctx({ mode: 'act2', boss: true }), ''));
    expect(linesOf('deep')).toContain(pickQuip(ctx({ chapter: 2 }), ''));
    expect(linesOf('deep')).toContain(pickQuip(ctx({ chapter: 3 }), ''));
    expect(linesOf('act2')).toContain(pickQuip(ctx({ mode: 'act2' }), ''));
  });

  it('보통 판은 기본 줄 중에서 나온다', () => {
    for (let seed = 0; seed < 30; seed++) {
      expect(GAMEOVER_QUIPS).toContain(pickQuip(ctx({ seed }), ''));
    }
  });

  it('구체적인 조건이 앞선다: 보스 > 0점 > 안전모 > 야근', () => {
    expect(linesOf('boss')).toContain(pickQuip(ctx({ boss: true, mode: 'act2', score: 0, hatBroke: true }), ''));
    expect(linesOf('zero')).toContain(pickQuip(ctx({ score: 0, hatBroke: true, mode: 'tokoton' }), ''));
    expect(linesOf('hat')).toContain(pickQuip(ctx({ hatBroke: true, mode: 'tokoton' }), ''));
  });

  it('줄은 비지 않고 카드 폭을 안 넘는다', () => {
    const all = [...GAMEOVER_QUIPS, ...QUIP_LADDER, ...QUIP_RULES.flatMap((r) => r.lines)];
    for (const l of all) {
      expect(l.trim()).not.toBe('');
      expect(l.length).toBeLessThanOrEqual(24);
    }
    for (const r of QUIP_RULES) expect(r.lines.length).toBeGreaterThanOrEqual(2);
  });
});

describe('직전 줄 반복 금지', () => {
  it('어떤 조건이든 직전 줄과 같은 줄은 안 나온다', () => {
    const cases: Partial<QuipCtx>[] = [
      {}, { score: 0 }, { hatBroke: true }, { mode: 'tokoton' }, { chapter: 2 }, { mode: 'act2' },
      { mode: 'act2', boss: true }, { streak: 3 }, { streak: 4 }, { streak: 12 },
    ];
    for (const c of cases) {
      for (let seed = 0; seed < 40; seed++) {
        const first = pickQuip(ctx({ ...c, seed }), '');
        const second = pickQuip(ctx({ ...c, seed }), first);
        expect(second).not.toBe(first);
        expect(second.length).toBeGreaterThan(0);
      }
    }
  });

  it('같은 입력이면 같은 줄 — 결정적', () => {
    expect(pickQuip(ctx({ seed: 5 }), 'x')).toBe(pickQuip(ctx({ seed: 5 }), 'x'));
  });
});

describe('같은 세션 연속 사망 사다리', () => {
  it(`${QUIP_STREAK_FROM}번째부터 칸이 오르고, 앞 두 번은 사다리가 아니다`, () => {
    for (let streak = 0; streak < QUIP_STREAK_FROM; streak++) {
      expect(QUIP_LADDER).not.toContain(pickQuip(ctx({ streak }), ''));
    }
    expect(pickQuip(ctx({ streak: QUIP_STREAK_FROM }), '')).toBe(QUIP_LADDER[0]);
    expect(pickQuip(ctx({ streak: QUIP_STREAK_FROM + 1 }), '')).toBe(QUIP_LADDER[1]);
  });

  it('사다리는 3~5칸이고 뒤 칸일수록 짧다', () => {
    expect(QUIP_LADDER.length).toBeGreaterThanOrEqual(3);
    expect(QUIP_LADDER.length).toBeLessThanOrEqual(5);
    const last = QUIP_LADDER[QUIP_LADDER.length - 1];
    expect(last.length).toBeLessThanOrEqual(QUIP_LADDER[0].length);
  });

  it('끝 칸에서 닫힌다 — 첫 칸으로 돌아가지 않는다', () => {
    const end = QUIP_STREAK_FROM + QUIP_LADDER.length - 1;
    for (let streak = end; streak < end + 20; streak++) {
      const line = pickQuip(ctx({ streak }), '');
      expect(line).toBe(QUIP_LADDER[QUIP_LADDER.length - 1]);
      expect(line).not.toBe(QUIP_LADDER[0]);
    }
  });

  it('끝 칸을 방금 봤으면 같은 줄을 또 안 보이고 다른 규칙으로 내려간다', () => {
    const end = QUIP_STREAK_FROM + QUIP_LADDER.length - 1;
    const closing = QUIP_LADDER[QUIP_LADDER.length - 1];
    const next = pickQuip(ctx({ streak: end + 1 }), closing);
    expect(next).not.toBe(closing);
    expect(QUIP_LADDER).not.toContain(next);
  });
});
