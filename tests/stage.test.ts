// 작업 지시서 — 대본 문법 · 진행 · 판정. 봇은 tests/stageBot.ts.
import { describe, it, expect } from 'vitest';
import { parseScript, scriptStats } from '../src/core/script';
import { STAGES } from '../src/core/stages';
import { stageDef, stageScript, stageSeed, startStage } from '../src/core/stage';
import { makeState, advance } from '../src/core/sim';
import { EMPTY_INPUT } from '../src/core/types';
import { HAT, MAT_HP, STAGE } from '../src/config';
import { addCombo, hurtPlayer } from '../src/core/combat';
import { runStage, fmtTicks, stageBot, expertBot } from './stageBot';

describe('대본 문법', () => {
  it('토큰마다 뜻대로 읽는다', () => {
    const steps = parseScript('wmh hh!  mhm~ >ww Z3 R4 .. wm+R2');
    expect(steps.map((x) => x.items[0].k)).toEqual(['build', 'build', 'build', 'build', 'bolt', 'rock', 'rest', 'build']);
    expect(steps[0].items[0]).toEqual({ k: 'build', floors: ['weak', 'mid', 'hard'], fast: false, hasty: false });
    expect(steps[1].items[0]).toMatchObject({ fast: true, hasty: false });
    expect(steps[2].items[0]).toMatchObject({ fast: false, hasty: true });
    expect(steps[3].joined).toBe(true);
    expect(steps[4].items[0]).toEqual({ k: 'bolt', n: 3 });
    expect(steps[6].items[0]).toEqual({ k: 'rest', beats: 2 });
    expect(steps[7].items).toHaveLength(2);
  });

  it('틀린 대본은 던진다', () => {
    for (const bad of ['wx', 'Z0', 'R13', 'ww+mm', '.+w', '>..', 'w!!', 'www~!', 'wwwwwwwwwwwww']) {
      expect(() => parseScript(bad), bad).toThrow();
    }
  });

  it('판 데이터의 대본은 전부 읽히고, 보스판이 아니면 비어 있지 않다', () => {
    const ids = new Set<string>();
    for (const d of STAGES) {
      expect(ids.has(d.id), d.id).toBe(false);
      ids.add(d.id);
      const steps = parseScript(d.script);
      if (!d.boss || d.boss === 'executor') expect(steps.length, d.id).toBeGreaterThan(0);
      const stat = scriptStats(steps, MAT_HP);
      expect(stat.buildings + stat.hazards > 0 || !!d.boss, d.id).toBe(true);
    }
  });
});

describe('진행', () => {
  it('첫 걸음은 FIRST_WAIT 뒤, 건물 걸음은 ▼ 예고(stackSpawnCd)로 센다', () => {
    const s = makeState({ seed: stageSeed('1-1') });
    startStage(s, { id: '1-1', diff: 1, weapon: 'sword', waza: 'tenchi' });
    // 1막 trySpawn과 같은 셈: 건 틱에 하나 줄고, 0이 된 다음 틱에 나온다
    advance(s, EMPTY_INPUT);
    expect(s.stackSpawnCd).toBe(STAGE.FIRST_WAIT - 1);
    while (!s.stack && s.tick < 500) advance(s, EMPTY_INPUT);
    expect(s.tick).toBe(STAGE.FIRST_WAIT + 1);
  });

  it('성급한 건물은 최하층이 HP1로 남으면 HASTY_TICKS 뒤 급락한다', () => {
    const s = makeState({ seed: 1 });
    startStage(s, { id: '1-2', diff: 1, weapon: 'sword', waza: 'tenchi' });
    // 마지막 걸음(hhm~)으로 바로 간다
    s.stage!.step = stageScript('1-2').length - 1;
    while (!s.stack) advance(s, EMPTY_INPUT);
    expect(s.stage!.hasty).toBe(true);
    const g0 = s.stage!.fallG;
    s.stack!.floors[0].segs[0].hp = 1;
    for (let i = 0; i < STAGE.HASTY_TICKS; i++) advance(s, EMPTY_INPUT);
    expect(s.stage!.fallG).toBeCloseTo(g0 * STAGE.HASTY_FALL);
    expect(s.stage!.tally.hastyDrops).toBe(1); // 2-2 특기 사항(급락 0회)이 이 셈을 읽는다
  });

  it('2-2 특기 사항 = 급락 0회', () => {
    expect(stageDef('2-2').secret).toBe('noHasty');
    const r = runStage('2-2', 1);
    expect(r.result.stamps.secret).toBe(r.s.stage!.tally.hastyDrops === 0);
    console.log(`[stage] 2-2 기본 봇 급락 ${r.s.stage!.tally.hastyDrops}회`);
  });

  it('보스 없는 판은 마지막 걸음을 치운 틱에 깨진다(over = cleared)', () => {
    const r = runStage('1-1', 1);
    expect(r.result.cleared).toBe(true);
    expect(r.s.over).toBe('cleared');
    expect(r.result.ticks).toBe(r.s.stage!.clearTick);
    // 「N채」 비교용 걸음 기록: 쉼을 뺀 걸음 수만큼
    const steps = stageScript('1-1').filter((x) => x.items[0].k !== 'rest').length;
    expect(r.result.splits).toHaveLength(steps);
  });
});

describe('판 깨기 — 봇이 모든 지시서를 깬다(견습 · 정규 · 외주)', () => {
  const plain = STAGES.filter((d) => !d.boss);
  for (const d of plain) {
    it(`${d.id}`, () => {
      const rows: string[] = [];
      for (const diff of [0, 1, 2] as const) {
        const r = runStage(d.id, diff);
        rows.push(`${['견습', '정규', '외주'][diff]} ${r.result.cleared ? fmtTicks(r.result.ticks) : '실패'} 목숨${r.s.lives}`);
        expect(r.result.cleared, `${d.id} ${diff}`).toBe(true);
      }
      console.log(`[stage] ${d.id}: ${rows.join(' · ')}`);
    });
  }
});

describe('기한 · 전임자는 봇이 잰 값과 맞다(대본을 고치면 다시 잰다)', () => {
  for (const d of STAGES) {
    it(d.id, () => {
      const bot = runStage(d.id, 1);
      const pro = runStage(d.id, 1, { policy: expertBot });
      const best = Math.min(...[bot, pro].filter((r) => r.result.cleared).map((r) => r.result.ticks));
      // 기한 도장은 기본 봇이 넉넉히 받는다. 전임자는 둘 중 빠른 봇이 겨우 받는다(0.5초 안)
      expect(bot.result.stamps.inTime, `${d.id} 기한 ${d.par} · 봇 ${bot.result.ticks}`).toBe(true);
      expect(best <= d.master && best > d.master - 30, `${d.id} 전임자 ${d.master} · 봇 ${best}`).toBe(true);
    });
  }
});

describe('판정', () => {
  it('도장: 접수 · 이상 없음은 시뮬 한 정의 — 목숨을 잃으면 이상 없음이 빠진다', () => {
    const ok = runStage('1-1', 1);
    expect(ok.result.stamps.done).toBe(true);
    expect(ok.result.stamps.safe).toBe(ok.s.stage!.tally.lifeLost === 0 && ok.s.stage!.tally.hatBreak === 0);
    // 아무것도 안 누르면 깔려 죽는다 — 접수 없음
    const idle = runStage('1-1', 1, { policy: () => EMPTY_INPUT });
    expect(idle.result.cleared).toBe(false);
    expect(Object.values(idle.result.stamps).some(Boolean)).toBe(false);
  });

  it('특기 사항은 판 데이터의 조건을 따른다 — 1-1 「가드 0회」', () => {
    expect(stageDef('1-1').secret).toBe('noGuard');
    const r = runStage('1-1', 1);
    expect(r.result.stamps.secret).toBe(r.s.stage!.tally.guardPress === 0);
  });

  it('외주는 안전모가 없다', () => {
    for (const diff of [0, 1, 2] as const) {
      const s = makeState({ seed: 3 });
      startStage(s, { id: '1-1', diff, weapon: 'sword', waza: 'tenchi' });
      s.combo = HAT.COMBO_AT[0] - 1;
      addCombo(s);
      expect(s.hat, `난이도 ${diff}`).toBe(diff !== 2);
    }
  });

  it('깬 뒤(보스 쓰러짐 연출)엔 안 다친다 — 아케이드는 그대로', () => {
    const s = makeState({ seed: 3 });
    startStage(s, { id: 'HQ', diff: 1, weapon: 'sword', waza: 'tenchi' });
    s.stage!.phase = 'done';
    expect(hurtPlayer(s)).toBe(false);
    expect(s.lives).toBe(makeState({ seed: 3 }).lives);
    const a = makeState({ seed: 3 });
    expect(hurtPlayer(a)).toBe(true);
  });

  it('화산탄 격파를 센다 — 공격은 판 진행보다 먼저 돈다', () => {
    let seen = 0;
    runStage('3-1', 1, { policy: (s) => { seen = Math.max(seen, s.stage!.tally.rockKills.length); return stageBot(s); } });
    expect(seen).toBeGreaterThan(0);
  });
});
