// 11-14 스테이지 결함 고침의 회귀 가드(정본 = tmp/st1114/bug-verify.md · 문서 STAGES §5 · §6).
// C 종탑 「종을 안 벰」이 필살 타격을 센다 · B 바람탑 좌판 벤 수가 필살을 센다 · A 보고서 걸음 = 막대 걸음 ·
// E 히트스톱 중 누른 가드도 「가드 0」을 깬다 · G 본사 보스 연습과 본판의 집행기 난수가 같다
import { describe, it, expect } from 'vitest';
import { makeState, advance } from '../src/core/sim';
import { startStage, stageSeed, judgeStage } from '../src/core/stage';
import { rand, rngSkip } from '../src/core/rng';
import { EMPTY_INPUT, type GameState, type InputFrame, type StageDiff, type WazaId } from '../src/core/types';
import { stageBot, humanBot } from './stageBot';
import { endView, stageBar, stageSteps } from '../src/ui/stageLogic';
import { WAZA_GAUGE } from '../src/config';

const G: InputFrame = { ...EMPTY_INPUT, guard: true };
const A: InputFrame = { ...EMPTY_INPUT, attack: true };
const X: InputFrame = { ...EMPTY_INPUT, special: true };
const MAX = 60 * 60 * 6;

function start(id: string, diff: StageDiff = 1, waza: WazaId = 'tenchi', fromBoss = false): GameState {
  const s = makeState({ seed: stageSeed(id) });
  startStage(s, { id, diff, weapon: 'sword', waza, fromBoss });
  return s;
}
function step(s: GameState, f: InputFrame): void {
  advance(s, f);
  s.events.length = 0;
}

describe('11-14 스테이지 결함 고침', () => {
  // C — 숙련 플레이가 실제로 가는 길(공중 가드로 채운 게이지)과 같은 자리: 떨어지는 종에 필살
  for (const waza of ['nakgwan', 'tenchi'] as const) {
    it(`C 1-B: 종에 쓴 필살(${waza})은 종을 벤 것이다 — 「종을 안 벰」 도장이 안 찍힌다`, () => {
      const s = start('1-B', 1, waza);
      let used = false;
      while (!s.over && s.tick < MAX) {
        let f = stageBot(s);
        if (!used && s.lm?.st === 'play' && s.stack?.floors[0]?.mat === 'bell' && s.stack.vy < 0 && s.stack.y < 200) {
          s.wazaGauge = WAZA_GAUGE.MAX;
          f = X;
          used = true;
        }
        step(s, f);
      }
      expect(used).toBe(true);
      expect(s.stage!.tally.bellCuts).toBeGreaterThan(0);
      const r = judgeStage(s);
      expect(r.cleared).toBe(true);
      expect(r.stamps.secret).toBe(false);
    });
  }

  // C — 종이 판에 없을 때 쓴 용오름: 필살 틱엔 종이 없고, 뒤따른 회오리가 종을 친다(wazaHit 갈래만 센다)
  it('C 1-B: 종 오기 전에 쓴 용오름이 뒤에 온 종을 치면 종을 벤 것이다', () => {
    const s = start('1-B', 1, 'baram');
    let used = false;
    while (!s.over && s.tick < MAX) {
      let f = stageBot(s);
      if (!used && s.lm?.st === 'play' && !s.stack && s.lm.cue >= 1 && s.lm.cue <= 4) {
        s.wazaGauge = WAZA_GAUGE.MAX;
        f = X;
        used = true;
      }
      step(s, f);
    }
    expect(used).toBe(true);
    expect(s.stage!.tally.bellCuts).toBeGreaterThan(0);
    expect(judgeStage(s).stamps.secret).toBe(false);
  });

  it('B 2-B: 천지로 부순 좌판도 벤 것이다 — 장터가 안 열린다', () => {
    const s = start('2-B', 1, 'tenchi');
    let used = false;
    while (!s.over && s.tick < MAX) {
      let f = stageBot(s);
      if (!used && s.lm?.st === 'play' && s.stack && !s.stack.resting) { s.wazaGauge = WAZA_GAUGE.MAX; f = X; used = true; }
      step(s, f);
    }
    expect(used).toBe(true);
    expect(s.stage!.tally.stallCuts).toBeGreaterThan(0);
    const r = judgeStage(s);
    expect(r.cleared).toBe(true);
    expect(s.stage!.tally.market).toBe(false);
    expect(r.extra).toBe(false);
  });

  it('A 1-1: 못 깬 보고서 「N/M」은 판 위 막대와 같은 치운 걸음이다(떨어지는 중인 걸음은 안 셈)', () => {
    const s = start('1-1');
    while (!s.over && s.stage!.tally.splits.length < 3) step(s, stageBot(s));
    while (!s.over) step(s, EMPTY_INPUT);
    const st = s.stage!;
    expect(st.step).toBeGreaterThan(st.tally.splits.length); // 넷째 걸음이 나와 있었다
    const w = stageSteps(s);
    expect(w.done).toBe(3);
    const v = endView({
      kind: 'real', result: judgeStage(s), lifeLost: st.tally.lifeLost, finishSpecial: false,
      step: w.done, total: w.total, phase: st.phase, news: null, rec: null, nextId: null,
    });
    expect(v.time).toBe(`3/${w.total}`);
    expect(stageBar(s)!.label).toBe(`남은 ${w.total - 3}`);
  });

  it('E 1-1: 히트스톱 첫 틱에만 누른 가드로 깔림을 빠져나와도 가드 누름으로 센다', () => {
    const s = start('1-1');
    while (!s.over && s.player.pose !== 'pinned') step(s, EMPTY_INPUT);
    expect(s.hitstop).toBeGreaterThan(0);
    step(s, G); // 히트스톱 첫 틱에만 누른다
    let escaped = false;
    for (let i = 0; i < 12 && !escaped; i++) {
      advance(s, EMPTY_INPUT);
      escaped = s.events.some((e) => e.kind === 'pinEscape');
      s.events.length = 0;
    }
    expect(escaped).toBe(true);
    expect(s.stage!.tally.guardPress).toBe(1);
    while (!s.over && s.tick < MAX) step(s, A);
    expect(judgeStage(s).stamps.secret).toBe(false);
  });

  it('G rngSkip(상태, n) = n번 뽑은 뒤의 상태', () => {
    const r = { rngState: stageSeed('HQ') };
    for (let i = 0; i < 435; i++) rand(r);
    expect(rngSkip(stageSeed('HQ'), 435) >>> 0).toBe(r.rngState >>> 0);
  });

  // 패턴 순서는 넷째부터 플레이어 상태(본판에서 가져온 필살 게이지 · 목숨)로 갈릴 수 있다 — 난수 자리 + 앞 셋만 본다
  it('G HQ: 보스 연습 · 기본 봇 · 사람 대역이 같은 난수로 집행기를 시작하고 같은 패턴으로 연다', () => {
    const run = (policy: (s: GameState) => InputFrame, fromBoss: boolean): { rng: number; pats: string } => {
      const s = start('HQ', 1, 'tenchi', fromBoss);
      while (!s.over && s.tick < MAX && !s.boss) step(s, policy(s));
      const rng = s.rngState >>> 0;
      const out: string[] = [];
      let last: string | null = null;
      while (!s.over && s.tick < MAX && out.length < 3) {
        step(s, stageBot(s));
        const p = s.boss?.st === 'telegraph' ? s.boss.pattern : null;
        if (p && p !== last) out.push(p);
        last = p;
      }
      return { rng, pats: out.join(',') };
    };
    const prac = run(stageBot, true);
    const real = run(stageBot, false);
    const hum = run(humanBot(10, 10), false);
    expect(prac.rng).toBe(real.rng);
    expect(hum.rng).toBe(real.rng);
    expect(prac.pats).toBe(real.pats);
  });
});
