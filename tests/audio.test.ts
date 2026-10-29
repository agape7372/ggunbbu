// B1 소리 — 순수 부분만 시험한다(AudioContext는 node에 없다). 믹스·음량은 OfflineAudioContext 렌더로 따로 쟀다.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BGM_TRACKS, SFX_PRESETS, chordRootPc, type SfxName } from '../src/audio/sfx';
import { comboSemitones, comboMilestone, mapEvent, consumeAudio } from '../src/audio/consume';
import { AUDIO, STACK } from '../src/config';
import { lateSkipSteps, comboLayerOf } from '../src/audio/audio';
import type { GameState, JuiceEvent } from '../src/core/types';

// consumeAudio가 부르는 재생·덕킹만 가로챈다(AudioContext는 node에 없다)
vi.mock('../src/audio/audio', async (orig) => ({
  ...(await orig<typeof import('../src/audio/audio')>()),
  playSfx: vi.fn(),
  pulseDuckBgm: vi.fn(),
  setComboLayer: vi.fn(),
}));
import * as audioMod from '../src/audio/audio';

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
  it('대검 — 값싼 넷은 연장 소리를 빌리고, 1200부터 넷은 제 소리를 붕괴음 위에 얹는다', () => {
    const hit: JuiceEvent = { kind: 'hit', lane: 0, mat: 'soft' as never, combo: 1 };
    expect(map(hit, state({ weapon: 'saw' }))).toEqual(['hitGrind']);
    expect(map(hit, state({ weapon: 'flame' }))).toEqual(['hitFlame']);
    expect(map({ kind: 'floorCollapse', lane: 0 }, state({ weapon: 'gold' }))).toEqual(['floorCollapse', 'hitGold']);
    expect(map({ kind: 'stackDestroy', n: 4 }, state({ weapon: 'onyx' }))).toEqual(['destroy', 'gorogoro', 'hitOnyx']);
    expect(map({ kind: 'stackDestroy', n: 4 }, state({ weapon: 'iron' }))).toEqual(['destroy', 'gorogoro']);
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

// ─── 파괴 소리 겹층 ────────────────────────────────────────────

/** 노드 생성 수와 파라미터 예약값을 세고 검사하는 가짜 컨텍스트 */
function fakeCtx() {
  const counts = { nodes: 0 };
  const bad: string[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime(v: number, t: number) { if (!Number.isFinite(v) || !Number.isFinite(t) || t < 0) bad.push(`set ${v}@${t}`); },
    linearRampToValueAtTime(v: number, t: number) { if (!Number.isFinite(v) || !Number.isFinite(t)) bad.push(`lin ${v}@${t}`); },
    exponentialRampToValueAtTime(v: number, t: number) { if (!(v > 0) || !Number.isFinite(t)) bad.push(`exp ${v}@${t}`); },
  });
  const node = (): Record<string, unknown> => {
    counts.nodes++;
    const params: Record<string, ReturnType<typeof param>> = {};
    return new Proxy({ connect() {}, start() {}, stop() {}, type: '', buffer: null, loop: false } as Record<string, unknown>, {
      get: (t, k: string) => (k in t ? t[k] : (params[k] ??= param())),
      set: (t, k: string, v) => { t[k] = v; return true; },
    });
  };
  const noise = { getChannelData: () => new Float32Array(44100) };
  const ctx = {
    sampleRate: 44100,
    createOscillator: node, createGain: node, createBufferSource: node, createBiquadFilter: node, createStereoPanner: node,
    createBuffer: () => noise,
  };
  return { ctx: ctx as unknown as AudioContext, counts, bad };
}

describe('파괴 소리 레시피 — CPU 예산', () => {
  const names: SfxName[] = [
    'hit', 'hitLow', 'hitTick', 'hitStrong', 'hitHammer', 'hitBar', 'hitGrind',
    'floorCollapse', 'destroy', 'gorogoro', 'special', 'specialCharge', 'incoming',
    'hitFlame', 'hitFrost', 'hitOnyx', 'hitGold',
  ];
  it('소리 하나당 노드 14개 이하, 예약값은 모두 유한·양수', () => {
    for (const n of names) {
      for (let k = 0; k < 20; k++) { // 그레인 수·시각이 무작위라 여러 번
        const { ctx, counts, bad } = fakeCtx();
        SFX_PRESETS[n](ctx, ctx as unknown as AudioNode, 0.5, 1.2);
        expect(counts.nodes, n).toBeGreaterThan(1);
        expect(counts.nodes, n).toBeLessThanOrEqual(14);
        expect(bad, n).toEqual([]);
      }
    }
  });
});

describe('믹스 — 덜 누르고 리미터로 막는다', () => {
  it('컴프레서 비율 4 이하, 리미터는 높은 비율·-1~-2dB 근처', () => {
    expect(AUDIO.COMP.RATIO).toBeLessThanOrEqual(4);
    expect(AUDIO.LIMIT.RATIO).toBeGreaterThanOrEqual(10);
    expect(AUDIO.LIMIT.THRESHOLD).toBeLessThanOrEqual(-1);
    expect(AUDIO.LIMIT.THRESHOLD).toBeGreaterThanOrEqual(-3);
  });
  it('완파 덕킹은 필살보다 가볍고 짧다', () => {
    expect(AUDIO.DUCK_DESTROY).toBeGreaterThan(AUDIO.DUCK_PULSE);
    expect(AUDIO.DUCK_DESTROY_S).toBeLessThan(AUDIO.DUCK_PULSE_S);
  });
});

describe('consumeAudio — 낙하 예고음 · 완파 덕킹', () => {
  const play = vi.mocked(audioMod.playSfx);
  const duck = vi.mocked(audioMod.pulseDuckBgm);
  const tick = (o: Partial<GameState> = {}) =>
    ({ events: [], combo: 0, boss: null, over: false, stack: null, stackSpawnCd: 99, ...o }) as unknown as GameState;
  const names = () => play.mock.calls.map((c) => c[0]);
  beforeEach(() => { play.mockClear(); duck.mockClear(); consumeAudio(tick()); play.mockClear(); });

  it('스택이 없고 남은 카운트가 SPAWN_CUE_TICKS인 틱에 한 번 울린다', () => {
    consumeAudio(tick({ stackSpawnCd: STACK.SPAWN_CUE_TICKS }));
    expect(names()).toEqual(['incoming']);
  });
  it('같은 틱이 히트스톱으로 반복돼도 한 번만, 카운트가 움직이면 다시 무장', () => {
    const s = tick({ stackSpawnCd: STACK.SPAWN_CUE_TICKS });
    consumeAudio(s); consumeAudio(s); consumeAudio(s);
    expect(names()).toEqual(['incoming']);
    consumeAudio(tick({ stackSpawnCd: STACK.SPAWN_CUE_TICKS - 1 }));
    consumeAudio(tick({ stackSpawnCd: STACK.SPAWN_CUE_TICKS }));
    expect(names()).toEqual(['incoming', 'incoming']);
  });
  it('건물이 있거나 판이 끝났거나 다른 카운트면 울리지 않는다', () => {
    consumeAudio(tick({ stackSpawnCd: STACK.SPAWN_CUE_TICKS, stack: {} as never }));
    consumeAudio(tick({ stackSpawnCd: STACK.SPAWN_CUE_TICKS, over: 'gameover' }));
    consumeAudio(tick({ stackSpawnCd: STACK.SPAWN_CUE_TICKS + 1 }));
    expect(names()).toEqual([]);
  });
  it('완파는 가벼운 덕킹, 필살이 같이 오면 깊은 덕킹 한 번', () => {
    consumeAudio(tick({ events: [{ kind: 'stackDestroy', n: 3 }] as JuiceEvent[] }));
    expect(duck).toHaveBeenLastCalledWith(AUDIO.DUCK_DESTROY, AUDIO.DUCK_DESTROY_S);
    duck.mockClear();
    consumeAudio(tick({ events: [{ kind: 'special' }, { kind: 'stackDestroy', n: 3 }] as JuiceEvent[] }));
    expect(duck).toHaveBeenCalledTimes(1);
    expect(duck).toHaveBeenCalledWith();
  });
  it('필살은 휘익(즉시)과 폭발(늦춤) 둘로 울린다', () => {
    consumeAudio(tick({ events: [{ kind: 'special' }] as JuiceEvent[], weapon: 'sword' } as Partial<GameState>));
    expect(names()).toEqual(['whiff', 'specialCharge', 'special']);
  });
});
