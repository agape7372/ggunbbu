// B1 소리 — 순수 부분만 시험한다(AudioContext는 node에 없다). 믹스·음량은 OfflineAudioContext 렌더로 따로 쟀다.
import { describe, it, expect } from 'vitest';
import { BGM_TRACKS, SFX_PRESETS, chordRootPc, type SfxName } from '../src/audio/sfx';
import { comboSemitones, comboMilestone, mapEvent } from '../src/audio/consume';
import { AUDIO } from '../src/config';
import { lateSkipSteps, comboLayerOf } from '../src/audio/audio';
import type { GameState, JuiceEvent } from '../src/core/types';

const pcOf = (hz: number): number => ((Math.round(12 * Math.log2(hz / 440)) + 9) % 12 + 12) % 12;
const state = (o: Partial<GameState> = {}): GameState => ({ mode: 'act1', act2Phase: null, weapon: 'sword', boss: null, player: { pose: 'idle' }, ...o }) as unknown as GameState;
const map = (e: JuiceEvent, s: GameState = state()) => mapEvent(e, s, new Set([e.kind]));

describe('BGM 7곡 — 4마디 A·A′·B 변주', () => {
  const names = Object.keys(BGM_TRACKS) as (keyof typeof BGM_TRACKS)[];

  it('7곡 모두 64스텝(4마디)이고 한 바퀴가 6초 이상', () => {
    expect(names).toHaveLength(7);
    for (const n of names) {
      const t = BGM_TRACKS[n];
      expect(t.steps.length, n).toBe(64);
      expect((t.steps.length * 60) / t.bpm / 4, n).toBeGreaterThanOrEqual(6);
    }
  });

  it('화성은 마디마다 하나씩 4칸, 서로 다른 화성이 2~4개', () => {
    for (const n of names) {
      const c = BGM_TRACKS[n].chords;
      expect(c, n).toHaveLength(4);
      const distinct = new Set(c).size;
      expect(distinct, n).toBeGreaterThanOrEqual(2);
      expect(distinct, n).toBeLessThanOrEqual(4);
    }
  });

  it('마디 첫 베이스는 그 마디 화성의 뿌리음', () => {
    for (const n of names) {
      const t = BGM_TRACKS[n];
      for (let bar = 0; bar < 4; bar++) {
        const first = t.steps[bar * 16].bass;
        expect(first, `${n} 마디${bar}`).not.toBeNull();
        expect(pcOf(first!), `${n} 마디${bar}`).toBe(chordRootPc(t.chords[bar]));
      }
    }
  });

  it('마디마다 멜로디가 같지 않다 — 최소 3가지 다른 마디', () => {
    for (const n of names) {
      const t = BGM_TRACKS[n];
      const bars = [0, 1, 2, 3].map((b) => JSON.stringify(t.steps.slice(b * 16, b * 16 + 16).map((s) => s.mel)));
      expect(new Set(bars).size, n).toBeGreaterThanOrEqual(3);
    }
  });

  it('번개 판정 곡(bolt)은 정확히 120BPM, 매 스텝 햇', () => {
    expect(BGM_TRACKS.bolt.bpm).toBe(120);
  });
});

describe('새 소리 프리셋', () => {
  it('coin·stamp·milestone·checkpoint·runEnd·uiOk·uiBack이 있다', () => {
    const need: SfxName[] = ['coin', 'stamp', 'milestone', 'checkpoint', 'runEnd', 'uiOk', 'uiBack'];
    for (const n of need) expect(typeof SFX_PRESETS[n], n).toBe('function');
  });
});

describe('콤보 피치 사다리 (snd-10)', () => {
  it('내려가지 않고 +7반음을 넘지 않는다', () => {
    let prev = 0;
    for (let c = 0; c <= 999; c++) {
      const s = comboSemitones(c);
      expect(s).toBeGreaterThanOrEqual(prev);
      expect(s).toBeLessThanOrEqual(7);
      prev = s;
    }
  });
  it('120콤보에서 급락하지 않는다(구 코드: 110대 +11 → 120 0)', () => {
    expect(comboSemitones(120)).toBeGreaterThanOrEqual(comboSemitones(119));
  });
  it('펜타토닉 음만 쓴다', () => {
    const allowed = new Set([0, 2, 4, 7, 9, 12]);
    for (let c = 0; c <= 200; c++) expect(allowed.has(comboSemitones(c))).toBe(true);
  });
});

describe('콤보 이정표 감지', () => {
  it('50·100·200·500·999 경계를 올라서는 틱에 그 값을 돌려준다', () => {
    for (const m of AUDIO.MILESTONES) {
      expect(comboMilestone(m - 1, m)).toBe(m);
      expect(comboMilestone(m, m + 1)).toBeNull();
    }
  });
  it('내려가는 틱·같은 값은 null', () => {
    expect(comboMilestone(120, 0)).toBeNull();
    expect(comboMilestone(60, 60)).toBeNull();
  });
  it('이어하기처럼 콤보가 한 번에 뛰면 울리지 않는다(체크포인트 168)', () => {
    expect(comboMilestone(0, 168)).toBeNull();
  });
});

describe('이벤트 → 소리 배선', () => {
  it('chapterUnlock·1막 버터바 끝은 게이지 만땅음을 재사용하지 않는다', () => {
    expect(map({ kind: 'chapterUnlock', n: 1 })).toEqual(['stamp']);
    expect(map({ kind: 'phaseClear', n: 1 }, state({ mode: 'act1' }))).toEqual(['stamp']);
  });
  it('2막 구역 도달은 checkpoint, 보스 티어는 포효', () => {
    expect(map({ kind: 'phaseClear', n: 2 }, state({ mode: 'act2' }))).toEqual(['checkpoint']);
    expect(map({ kind: 'phaseClear', n: 101 }, state({ mode: 'act2' }))).toEqual(['bossRoar']);
  });
  it('필살 게이지 만땅만 gaugeFull', () => {
    expect(map({ kind: 'gaugeFull' })).toEqual(['gaugeFull']);
  });
  it('기본 타격은 변형 3종을 돌아가며 쓴다', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) seen.add(map({ kind: 'hit', mat: 'soft' as never, combo: i })![0]);
    expect(seen.size).toBe(3);
  });
});

describe('스케줄러 — 밀리면 건너뛴다 (snd-08)', () => {
  const ss = 0.1;
  it('제시간·0.05초 이내 지연은 그대로 둔다', () => {
    expect(lateSkipSteps(1.0, 1.0, ss)).toBe(0);
    expect(lateSkipSteps(1.04, 1.0, ss)).toBe(0);
  });
  it('1초 밀리면 따라잡지 않고 격자 단위로 건너뛴다', () => {
    const skip = lateSkipSteps(2.0, 1.0, ss);
    expect(skip).toBe(10);
    const next = 1.0 + skip * ss;
    expect(next).toBeGreaterThanOrEqual(2.0 - AUDIO.LATE_SKIP_S - 1e-9); // 과거로 남지 않는다
    expect(next).toBeLessThan(2.0 + ss);
  });
});

describe('콤보 층 (snd-04)', () => {
  it('50 미만 0 · 50~149 햇 · 150 이상 아르페지오', () => {
    expect([0, 49, 50, 149, 150, 999].map(comboLayerOf)).toEqual([0, 0, 1, 1, 2, 2]);
  });
});
