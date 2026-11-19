// 결과 화면 키: 배정 · 얼굴 · 잠금 뒤 새 누름만(광고 부활이 연타로 새지 않게)
// 원칙: 옅은 키는 안 눌리고 켜진 키는 눌린다 — 얼굴(resultFaces)과 판정(gateStep)이 같은 값(gate.shut)을 읽는다
import { describe, it, expect } from 'vitest';
import {
  KEY_QUIET_MS, REVIVE_HOLD_MS, REVIVE_QUIET_MS, gateStep, newGate, resultActs, resultFaces, reviveKey,
  type ResultCtx, type ResultGate,
} from '../src/ui/resultLogic';
import type { TouchAction } from '../src/input/touch';

const go = (o: Partial<Extract<ResultCtx, { kind: 'gameover' }>> = {}): ResultCtx => ({
  kind: 'gameover', canRevive: false, canContinue: false, adRevive: false, reviveLeft: 0, ...o,
});
const none = { jump: false, attack: false, special: false, guard: false };
const tap = (...k: TouchAction[]) => ({ ...none, ...Object.fromEntries(k.map((x) => [x, true])) });
const SHUT = { jump: true, attack: true, special: true, guard: true };
const OPENED = { jump: false, attack: false, special: false, guard: false };
const DT = 16; // 표본 간격
const OPEN = 400; // 잠금이 풀린 첫 표본(GAMEOVER_LOCK 24틱)

const AD = go({ canRevive: true, adRevive: true, reviveLeft: 3 });
const FREE = go({ canRevive: true, reviveLeft: 3 });

/** 판이 끝나고 잠금(0 ~ OPEN 전) 뒤 until 전까지 아무것도 안 누른 표본. t = 다음 표본 시각 */
function run(c: ResultCtx | null, until: number): { g: ResultGate; t: number } {
  const g = newGate(false, 0);
  const slow = c ? reviveKey(c) : null;
  let t = 0;
  for (; t < until; t += DT) gateStep(g, none, t, t < OPEN, slow);
  return { g, t };
}

describe('키 배정', () => {
  it('철거 실패: 일어나기 · 이어하기 · 한 판 더 = 공격 · 점프 · 필살, 가드 = 홈', () => {
    expect(resultActs(go({ canRevive: true, canContinue: true }))).toEqual({ attack: 'revive', jump: 'continue', special: 'retry', guard: 'home' });
  });
  it('일어나기만 되면 점프 = 한 판 더 · 필살 쉼', () => {
    expect(resultActs(go({ canRevive: true }))).toEqual({ attack: 'revive', jump: 'retry', special: null, guard: 'home' });
  });
  it('이어하기만 되면 공격 = 이어하기', () => {
    expect(resultActs(go({ canContinue: true }))).toEqual({ attack: 'continue', jump: 'retry', special: null, guard: 'home' });
  });
  it('한 판 더만', () => {
    expect(resultActs(go())).toEqual({ attack: 'retry', jump: null, special: null, guard: 'home' });
  });
  it('작전 결과: 한 판 더 · 목록 · 홈', () => {
    expect(resultActs({ kind: 'opsend' })).toEqual({ attack: 'retry', jump: 'list', special: null, guard: 'home' });
  });
  it('엔딩: 한 판 더 · 홈', () => {
    expect(resultActs({ kind: 'ending' })).toEqual({ attack: 'retry', jump: null, special: null, guard: 'home' });
  });
  it('철거 보고서: 다음 지시서가 있으면 공격 = 다음 · 점프 = 한 판 더, 없으면 공격 = 한 판 더', () => {
    expect(resultActs({ kind: 'stageend', next: true })).toEqual({ attack: 'next', jump: 'retry', special: null, guard: 'back' });
    expect(resultActs({ kind: 'stageend', next: false })).toEqual({ attack: 'retry', jump: null, special: null, guard: 'back' });
  });
});

describe('키 얼굴', () => {
  it('주홍은 공격 하나, 빈 키는 쉰다', () => {
    const f = resultFaces(go({ canRevive: true, canContinue: true }), OPENED);
    expect(Object.values(f).filter((x) => x.tone === 'seal')).toHaveLength(1);
    expect(f.attack.tone).toBe('seal');
    expect(resultFaces(go(), OPENED).jump.tone).toBe('rest');
    expect(resultFaces(go(), OPENED).special.tone).toBe('rest');
  });
  it('일어나기 보조 글 = 광고면 「광고」 / 「n번 남음」 두 줄, 아니면 「n번 남음」 · 이어하기 = 넘긴 곳부터', () => {
    expect(resultFaces(AD, OPENED).attack).toEqual({ label: '일어나기', tone: 'seal', sub: '광고\n3번 남음' });
    expect(resultFaces(go({ canRevive: true, reviveLeft: 2 }), OPENED).attack.sub).toBe('2번 남음');
    expect(resultFaces(go({ canRevive: true, canContinue: true }), OPENED).jump).toEqual({ label: '이어하기', tone: 'ink', sub: '넘긴 곳부터' });
  });
  it('닫힌(shut) 키만 옅고, 동작 없는 키는 닫혀도 쉰다', () => {
    const f = resultFaces({ kind: 'ending' }, { ...OPENED, guard: true, jump: true });
    expect(f.attack.tone).toBe('seal');
    expect(f.guard.tone).toBe('faint');
    expect(f.jump.tone).toBe('rest');
    const all = resultFaces({ kind: 'ending' }, SHUT);
    expect([all.attack.tone, all.guard.tone, all.jump.tone]).toEqual(['faint', 'faint', 'rest']);
  });
  it('이름표', () => {
    const f = resultFaces({ kind: 'stageend', next: true }, OPENED);
    expect([f.attack.label, f.jump.label, f.guard.label]).toEqual(['다음 지시서', '한 판 더', '뒤로']);
    expect(resultFaces({ kind: 'opsend' }, OPENED).jump.label).toBe('목록');
    expect(resultFaces({ kind: 'opsend' }, OPENED).guard.label).toBe('홈');
  });
});

describe('잠금 뒤 새 누름만', () => {
  it('새 게이트는 넷 다 닫혀 있다', () => {
    expect(newGate(false, 0).shut).toEqual(SHUT);
  });
  it('잠긴 동안의 누름은 버리고 쌓아 두지 않는다', () => {
    const g = newGate(false, 0);
    expect(gateStep(g, tap('attack'), 0, true)).toBeNull();
    expect(gateStep(g, none, 1000, false)).toBeNull();
  });
  it('잠금이 풀린 첫 표본의 누름은 안 받는다(지난 표본에 닫혀 있었다)', () => {
    const { g, t } = run(null, OPEN);
    expect(t).toBe(OPEN);
    expect(gateStep(g, tap('jump'), t, false)).toBeNull();
  });
  it('보통 키: 닫힌 키를 눌러 버려진 뒤 250ms 넘게 조용했다가 누르면 받는다', () => {
    const { g, t: t0 } = run(null, OPEN);
    expect(gateStep(g, tap('jump'), t0, false)).toBeNull(); // 버려진 누름
    let t = t0 + DT;
    for (; t - t0 < KEY_QUIET_MS; t += DT) {
      gateStep(g, none, t, false);
      expect(g.shut.jump).toBe(true); // 아직 옅다
    }
    gateStep(g, none, t, false); // 250ms 조용 — 이 표본에 열린다
    expect(g.shut.jump).toBe(false);
    expect(gateStep(g, tap('jump'), t + DT, false)).toBe('jump');
  });
  it('보통 키: 150ms 간격 연타는 몇 번을 눌러도 안 받고 그동안 옅다', () => {
    const { g, t: t0 } = run({ kind: 'ending' }, OPEN);
    for (let i = 0; i < 200; i += 1) {
      const t = t0 + i * DT;
      const f = i % 9 === 0 ? tap('attack') : none; // 144ms마다
      expect(gateStep(g, f, t, false)).toBeNull();
      expect(g.shut.attack).toBe(true);
      expect(resultFaces({ kind: 'ending' }, g.shut).attack.tone).toBe('faint');
    }
  });
  it('가드: 쥔 채로는 새 누름이 아니다. 뗐다가 250ms 뒤에 누르면 받는다', () => {
    const g = newGate(true, 0);
    for (let t = 0; t <= 1200; t += DT) expect(gateStep(g, tap('guard'), t, t < OPEN)).toBeNull();
    const off = 1200 + DT;
    expect(gateStep(g, none, off, false)).toBeNull();
    expect(gateStep(g, tap('guard'), off + 80, false)).toBeNull(); // 뗀 지 80 — 아직 옅다
    let t = off + 80 + DT;
    for (; t < off + 80 + KEY_QUIET_MS + DT; t += DT) gateStep(g, none, t, false);
    expect(g.shut.guard).toBe(false);
    expect(gateStep(g, tap('guard'), t, false)).toBe('guard');
  });
  it('가드 쥐기는 한 번만 — 계속 쥐어도 다시 안 먹는다', () => {
    const { g, t } = run(null, 1000);
    expect(gateStep(g, tap('guard'), t, false)).toBe('guard');
    for (let i = 1; i < 60; i += 1) expect(gateStep(g, tap('guard'), t + i * DT, false)).toBeNull();
  });
  it('키마다 따로 — 공격 연타 중이어도 점프 첫 누름은 먹는다', () => {
    const { g, t } = run(null, 1000);
    gateStep(g, tap('attack'), t, false);
    expect(gateStep(g, tap('jump'), t + 3 * DT, false)).toBe('jump');
  });
  it('받은 누름은 한 표본에 하나 — 공격 · 점프 · 필살 · 가드 순서', () => {
    expect(gateStep(run(null, 1000).g, tap('attack', 'jump', 'special', 'guard'), 1008, false)).toBe('attack');
    expect(gateStep(run(null, 1000).g, tap('jump', 'special', 'guard'), 1008, false)).toBe('jump');
    expect(gateStep(run(null, 1000).g, tap('special', 'guard'), 1008, false)).toBe('special');
  });
});

describe('일어나기 키는 늦게 열린다', () => {
  it('일어나기 키 = 그 자리(공격) — 광고든 무료든. 일어나기가 없으면 없다', () => {
    expect(reviveKey(AD)).toBe('attack');
    expect(reviveKey(FREE)).toBe('attack');
    expect(reviveKey(go({ canContinue: true }))).toBeNull();
    expect(reviveKey({ kind: 'opsend' })).toBeNull();
  });
  it('풀린 뒤 350ms 동안은 일어나기만 옅다 · 점프(한 판 더)는 받는다', () => {
    const { g, t } = run(AD, OPEN + 32);
    expect(g.shut.attack).toBe(true);
    expect(resultFaces(AD, g.shut).attack.tone).toBe('faint');
    expect(resultFaces(AD, g.shut).jump.tone).toBe('ink');
    expect(gateStep(g, tap('jump'), t, false, 'attack')).toBe('jump');
  });
  it('조용히 기다리면 풀린 지 350ms에 열린다(키는 주홍)', () => {
    const { g, t } = run(AD, OPEN + REVIVE_HOLD_MS + DT);
    expect(g.shut.attack).toBe(false);
    expect(resultFaces(AD, g.shut).attack.tone).toBe('seal');
    expect(gateStep(g, tap('attack'), t, false, 'attack')).toBe('attack');
  });
  for (const [name, c] of [['광고', AD], ['무료', FREE]] as const) {
    it(`${name} 일어나기: 죽는 순간부터 400ms 간격으로 계속 치면 안 받는다. 600ms 조용하면 열리고 그다음 누름을 받는다`, () => {
      const slow = reviveKey(c);
      const g = newGate(false, 0);
      let t = 0;
      let last = 0;
      for (; t < 5000; t += DT) {
        const press = t % 400 === 0;
        if (press) last = t;
        expect(gateStep(g, press ? tap('attack') : none, t, t < OPEN, slow)).toBeNull();
        expect(g.shut.attack).toBe(true);
      }
      for (; t - last < REVIVE_QUIET_MS; t += DT) {
        gateStep(g, none, t, false, slow);
        expect(g.shut.attack).toBe(true); // 600 전엔 옅다
      }
      gateStep(g, none, t, false, slow);
      expect(g.shut.attack).toBe(false);
      expect(gateStep(g, tap('attack'), t + DT, false, slow)).toBe('attack');
    });
  }
  it('얼굴과 판정이 같다 — 제 색이면 받고, 옅으면 버린다', () => {
    for (let at = OPEN; at < OPEN + 800; at += DT) {
      const { g, t } = run(AD, at);
      const tone = resultFaces(AD, g.shut).attack.tone;
      const got = gateStep(g, tap('attack'), t, false, 'attack');
      expect([at, tone, got]).toEqual([at, got ? 'seal' : 'faint', got]);
    }
  });
  it('창이 덮은 길 — 잠긴 표본 하나에 넷 다 닫히고, 다시 풀린 첫 누름은 안 받으며, 일어나기는 350ms 더 닫힌다', () => {
    const { g, t: t0 } = run(AD, 3000);
    expect(g.shut).toEqual(OPENED);
    gateStep(g, none, t0, true, 'attack'); // 창이 덮었다
    expect(g.shut).toEqual(SHUT);
    const back = t0 + DT;
    expect(gateStep(g, tap('jump'), back, false, 'attack')).toBeNull(); // 풀린 첫 표본
    let t = back + DT;
    for (; t - back < REVIVE_HOLD_MS; t += DT) {
      gateStep(g, none, t, false, 'attack');
      expect(g.shut.attack).toBe(true);
    }
    gateStep(g, none, t, false, 'attack');
    expect(g.shut.attack).toBe(false);
    expect(gateStep(g, tap('attack'), t + DT, false, 'attack')).toBe('attack');
  });
  it('광고가 바로 실패한 길 — 받은 뒤 잠긴 표본 없이 300ms 뒤에 또 누르면 안 받는다', () => {
    const { g, t: t0 } = run(AD, 2000);
    expect(gateStep(g, tap('attack'), t0, false, 'attack')).toBe('attack');
    let t = t0 + DT;
    for (; t < t0 + 300; t += DT) gateStep(g, none, t, false, 'attack');
    expect(g.shut.attack).toBe(true);
    expect(gateStep(g, tap('attack'), t, false, 'attack')).toBeNull();
  });
});

describe('결과 숫자가 쌓인다(rollAt)', () => {
  it('0에서 시작해 점수 → 먼지 순서로 끝 값에 닿는다 · 건너뛰면 바로 끝 값', async () => {
    const { ROLL, rollAt } = await import('../src/ui/resultLogic');
    expect(rollAt(0, 12345, 0, 30)).toEqual({ score: 0, dust: 0, mark: false, done: false });
    const mid = rollAt(ROLL.SCORE_MS / 2, 12345, 0, 30);
    expect(mid.score).toBeGreaterThan(0);
    expect(mid.score).toBeLessThan(12345);
    expect(mid.dust).toBe(0); // 먼지는 점수가 다 오른 뒤
    const scoreEnd = rollAt(ROLL.SCORE_MS, 12345, 0, 30);
    expect([scoreEnd.score, scoreEnd.dust, scoreEnd.done]).toEqual([12345, 0, false]);
    expect(rollAt(ROLL.SCORE_MS + ROLL.DUST_GAP + ROLL.DUST_MS, 12345, 0, 30)).toEqual({ score: 12345, dust: 30, mark: true, done: true });
    expect(rollAt(Infinity, 12345, 0, 30)).toEqual({ score: 12345, dust: 30, mark: true, done: true });
    // 먼지가 없으면 점수가 다 오르면 끝
    expect(rollAt(ROLL.SCORE_MS, 500, 0, 0).done).toBe(true);
  });

  it('인장은 판 전 최고를 넘는 그 순간부터 — 못 넘으면 끝까지 안 찍힌다', async () => {
    const { ROLL, rollAt } = await import('../src/ui/resultLogic');
    let first = -1;
    for (let e = 0; e <= ROLL.SCORE_MS; e += 10) if (first < 0 && rollAt(e, 1000, 800, 0).mark) first = e;
    expect(first).toBeGreaterThan(0);
    expect(rollAt(first, 1000, 800, 0).score).toBeGreaterThan(800);
    expect(rollAt(first - 10, 1000, 800, 0).score).toBeLessThanOrEqual(800);
    expect(rollAt(Infinity, 700, 800, 0).mark).toBe(false);
  });
});
