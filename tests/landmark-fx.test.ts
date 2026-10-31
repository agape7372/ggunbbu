// 명물 보스 넷의 그림 · 소리 — 순수 판정(인장 먹 · 시계 · 깃발 · 띠)과, 실제 판을 돌려 소리가 나는지.
// 그림은 기록용 가짜 ctx로 부른다(스프라이트 층 그림만 막는다) — 모양 검수는 마지막 캡처가 맡는다.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_INPUT } from '../src/core/types';
import type { Floor, GameState, LandmarkState } from '../src/core/types';
import { LANDMARK, PALETTE, STAGE, TPS } from '../src/config';
import { advance, makeState } from '../src/core/sim';
import { stageSeed, startStage } from '../src/core/stage';
import { backdropKey } from '../src/render/background';
import { SFX_PRESETS, type SfxName } from '../src/audio/sfx';
import {
  CLOCK_STEP, PAGODA_LOW_Y, RATCHET_STEP, WIND_NOTES, bandEase, bandSemis, blockProgress, blockTickEvery, craneBand, creakEvery,
  landmarkSounds, snapOf, type LmSnap,
} from '../src/audio/landmarkSfx';
import { stageBot } from './stageBot';

vi.mock('../src/audio/audio', async (orig) => ({
  ...(await orig<typeof import('../src/audio/audio')>()),
  playSfx: vi.fn(),
  pulseDuckBgm: vi.fn(),
  setComboLayer: vi.fn(),
}));
// 층 그림(캔버스 타일)은 node에 없다 — 몸 층 그리기만 가린다
vi.mock('../src/render/sprites', () => ({ drawStack: vi.fn(), floorTile: vi.fn(() => undefined) }));

const audioMod = await import('../src/audio/audio');
const { consumeAudio, mapEvent } = await import('../src/audio/consume');
const fxMod = await import('../src/render/landmarkFx');
const {
  drawBell, drawLandmarkBack, drawLandmarkFront, sealInk, sealBar, slamShadow, bellTally, hastyAmp, hastyShakeX, HASTY_SHAKE_PX, clockAngles,
  flagAngle, flagTremble, bandScreen, chimeGlow, isBellStack, noteBellBreak, resetLandmarkFx, landmarkFxView,
  minuteAngle, pagodaShadow, windShadow, dustCount, cableFray, craneHalf, windLight, WIND_FLUTTER_PX, LIFT_SHAKE_PX,
} = fxMod;

function bossStage(id: string, diff: 0 | 1 | 2 = 1): GameState {
  const s = makeState({ seed: stageSeed(id) });
  startStage(s, { id, diff, weapon: 'sword', waza: 'tenchi' });
  advance(s, EMPTY_INPUT); // 대본이 비면 첫 틱에 명물이 선다(s.lm)
  s.events.length = 0;
  return s;
}

type Heard = Array<{ tick: number; name: SfxName; opts?: { pitchSemitones?: number; dur?: number } }>;

/** 틱마다 소리를 소비하며 판을 돌린다 — 씬 루프와 같은 순서(advance → consumeAudio → events 비우기). bot = false면 가만히 둔다 */
function playTicks(s: GameState, n: number, bot = true): Heard {
  const heard: Heard = [];
  vi.mocked(audioMod.playSfx).mockClear();
  for (let i = 0; i < n && !s.over; i++) {
    advance(s, bot ? stageBot(s) : EMPTY_INPUT);
    vi.mocked(audioMod.playSfx).mockClear();
    consumeAudio(s);
    for (const c of vi.mocked(audioMod.playSfx).mock.calls) heard.push({ tick: s.tick, name: c[0], opts: c[1] });
    s.events.length = 0;
  }
  return heard;
}

/** 호출을 적어 두는 가짜 ctx — 속성은 값을 쥐고, 메서드는 이름과 그때의 fillStyle을 적는다 */
function recorder() {
  const log: Array<{ m: string; fill: unknown; args: unknown[] }> = [];
  const props: Record<string, unknown> = { fillStyle: '' };
  const ctx = new Proxy({}, {
    get: (_t, k: string) => {
      if (k in props) return props[k];
      return (...args: unknown[]) => {
        log.push({ m: k, fill: props.fillStyle, args });
        return k === 'measureText' ? { width: 10 } : undefined;
      };
    },
    set: (_t, k: string, v) => { props[k] = v; return true; },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, log, texts: () => log.filter((c) => c.m === 'fillText').map((c) => c.args[0]) };
}

beforeEach(() => {
  resetLandmarkFx();
});

describe('창 인장 먹', () => {
  it('찍을 때 1, 창이 끝날 때 0 — 난이도별 창 길이를 따른다', () => {
    for (const d of [0, 1, 2] as const) {
      const n = LANDMARK.SIT_TICKS[d];
      expect(sealInk(0, d)).toBe(1);
      expect(sealInk(n / 2, d)).toBeCloseTo(0.5, 5);
      expect(sealInk(n, d)).toBe(0);
      expect(sealInk(n * 2, d)).toBe(0);
    }
  });

  it('주홍 면은 먹이 줄수록 오른쪽 끝에서부터 좁아진다 — 늘지 않고, 처음엔 전폭 · 끝엔 0', () => {
    expect(sealBar(1, 120)).toBe(120);
    expect(sealBar(0, 120)).toBe(0);
    expect(sealBar(0.5, 120)).toBe(60);
    let prev = 120;
    for (let k = 20; k >= 0; k--) {
      const w = sealBar(k / 20, 120);
      expect(w).toBeLessThanOrEqual(prev);
      prev = w;
    }
  });
});

describe('종탑 시계', () => {
  it('시침은 그 파의 시각, 초침은 CLOCK_STEP틱마다 한 칸 가서 cue 0에 12시에 선다', () => {
    expect(clockAngles(3, 0)[0]).toBeCloseTo(Math.PI / 2, 5);
    expect(clockAngles(6, 0)[0]).toBeCloseTo(Math.PI, 5);
    expect(clockAngles(12, 0)[0]).toBeCloseTo(Math.PI * 2, 5);
    expect(clockAngles(3, 0)[1]).toBe(-0);
    const a = clockAngles(3, 3 * CLOCK_STEP)[1];
    expect(clockAngles(3, 3 * CLOCK_STEP - 1)[1]).toBe(a); // 한 칸 안에서는 가만히
    expect(clockAngles(3, 2 * CLOCK_STEP)[1]).not.toBe(a);
  });
});

describe('깃발 · 띠 · 풍경', () => {
  it('들숨 깃발은 탑 쪽(아래·왼쪽)으로 늘어지고 날숨은 밖(오른쪽)으로 뻗는다', () => {
    const inh = flagAngle(0);
    const exh = flagAngle(1);
    expect(Math.cos(inh)).toBeLessThan(0);
    expect(Math.sin(inh)).toBeGreaterThan(0.9);
    expect(Math.cos(exh)).toBeGreaterThan(0.9);
    expect(flagAngle(0.5)).toBeGreaterThan(exh);
    expect(flagAngle(0.5)).toBeLessThan(inh);
  });

  it('숨이 바뀌기 직전에만 깃발이 떤다', () => {
    expect(flagTremble(0)).toBe(0);
    expect(flagTremble(60)).toBe(0);
    expect(flagTremble(10)).toBeGreaterThan(0);
    expect(flagTremble(1)).toBeGreaterThan(flagTremble(10));
  });

  it('띠는 지면 좌표 [k, k+두께]를 화면으로 — 위가 작은 y', () => {
    const [top, bot] = bandScreen(610, 336, 1);
    expect(bot).toBe(610 - 336);
    expect(top).toBe(610 - 336 - LANDMARK.CRANE.BAND_H[1]);
    expect(bandScreen(610, 336, 2)[0]).toBeGreaterThan(top); // 외주는 띠가 얇다
  });

  it('풍경은 울림 창이 열린 동안만 빛난다(구층탑만)', () => {
    const s = bossStage('3-B');
    const lm = s.lm!;
    expect(chimeGlow(lm)).toBe(0);
    lm.cue = LANDMARK.PAGODA.CHIME_WINDOW;
    expect(chimeGlow(lm)).toBe(1);
    lm.cue = 15;
    expect(chimeGlow(lm)).toBeCloseTo(0.5, 5);
    const bell = bossStage('1-B').lm!;
    bell.cue = 20;
    expect(chimeGlow(bell)).toBe(0);
  });
});

describe('본사 집행기 국면 배경', () => {
  it('HQ 판에서 보스가 나오면 달 국면과 같은 집행기 배경, 그 전엔 챕터 배경', () => {
    const base = { mode: 'act1' as const, chapter: 0, act2Phase: null };
    expect(backdropKey({ ...base, stage: { id: 'HQ' }, boss: null })).not.toBe('bg-executor');
    expect(backdropKey({ ...base, stage: { id: 'HQ' }, boss: {} })).toBe('bg-executor');
    expect(backdropKey({ ...base, stage: { id: '1-B' }, boss: {} })).not.toBe('bg-executor');
    expect(backdropKey({ mode: 'act2', chapter: 0, act2Phase: 'moon' })).toBe('bg-executor');
  });
});

describe('이벤트로 나는 소리 — 깡 · 퉁 · 몸을 친 댕', () => {
  const lmState = (id: 'bell' | 'wind', st: string) => ({ weapon: 'sword', boss: null, player: { pose: 'idle' }, lm: { id, st } }) as unknown as GameState;
  const map = (e: Parameters<typeof mapEvent>[0], s: GameState) => mapEvent(e, s, new Set([e.kind]));

  it('종을 벤 hit은 깡, 땅에 떨어진 floorCollapse는 퉁', () => {
    const s = lmState('bell', 'play');
    expect(map({ kind: 'hit', mat: 'bell', y: 100 }, s)).toEqual(['bellClang']);
    expect(map({ kind: 'floorCollapse', mat: 'bell', y: 0 }, s)).toEqual(['bellThud']);
    expect(map({ kind: 'hit', mat: 'hard', y: 100 }, s)).not.toEqual(['bellClang']);
  });

  it('되돌린 종이 몸을 치는 순간(play 중 bossHit)만 몸 울림, 창 중 필살 타격은 그대로', () => {
    expect(map({ kind: 'bossHit', y: 400 }, lmState('bell', 'play'))).toEqual(['bellBody']);
    expect(map({ kind: 'bossHit', y: 400 }, lmState('bell', 'sit'))).toEqual(['bossHit']);
    expect(map({ kind: 'bossHit', y: 400 }, lmState('wind', 'play'))).toEqual(['bossHit']);
  });

  it('종탑 · 크레인의 boltCue는 비운다(댕 · 철컥은 차이로 낸다) — 구층탑 기와 비는 그대로', () => {
    expect(map({ kind: 'boltCue', lane: 0 }, { ...lmState('bell', 'play'), lm: { id: 'bell' } } as unknown as GameState)).toBeNull();
    expect(map({ kind: 'boltCue', lane: 0 }, { ...lmState('bell', 'play'), lm: { id: 'crane' } } as unknown as GameState)).toBeNull();
    expect(map({ kind: 'boltCue', lane: 0 }, { ...lmState('bell', 'play'), lm: { id: 'pagoda' } } as unknown as GameState)).toEqual(['boltCue']);
  });

  it('새 프리셋이 모두 있다', () => {
    for (const n of ['clockTick', 'bellToss', 'bellBody', 'bellClang', 'bellThud', 'windIn', 'windOut', 'chime', 'craneRatchet', 'craneClunk'] as const) {
      expect(typeof SFX_PRESETS[n], n).toBe('function');
    }
  });
});

describe('차이로 나는 소리 — 실제 판을 돌려', () => {
  it('종탑: 똑딱이 초침 칸마다, 댕이 종 하나마다. 똑딱 사이는 CLOCK_STEP의 배수', () => {
    const s = bossStage('1-B');
    const heard = playTicks(s, 500);
    const ticks = heard.filter((h) => h.name === 'clockTick');
    const tosses = heard.filter((h) => h.name === 'bellToss');
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(tosses.length).toBeGreaterThanOrEqual(2);
    // 똑 · 딱은 번갈아 피치가 다르다
    expect(new Set(ticks.map((h) => h.opts?.pitchSemitones)).size).toBe(2);
    // 댕 직전엔 똑딱이 있다(예고) — 첫 댕 앞에 똑딱 하나는 나온다
    expect(ticks[0].tick).toBeLessThan(tosses[0].tick);
    // 댕은 한 틱에 하나뿐(종 하나에 한 번)
    expect(new Set(tosses.map((h) => h.tick)).size).toBe(tosses.length);
    expect(s.lm!.st).not.toBe('enter');
  });

  it('바람탑: 숨이 바뀔 때마다 한 음 — 들숨은 windIn, 날숨은 windOut, 길이는 노래 박', () => {
    const s = bossStage('2-B');
    const heard = playTicks(s, 700);
    const notes = heard.filter((h) => h.name === 'windIn' || h.name === 'windOut');
    expect(notes.length).toBeGreaterThanOrEqual(4);
    const song = LANDMARK.WIND.SONG;
    // 노래 순서 그대로 — 들숨(0)/날숨(1)이 번갈아 나온다
    notes.forEach((n, i) => {
      expect(n.name, `음 ${i}`).toBe(song[i % song.length][0] === 0 ? 'windIn' : 'windOut');
      expect(n.opts?.dur).toBeCloseTo((song[i % song.length][1] * STAGE.BEAT) / TPS, 5);
      expect(n.opts?.pitchSemitones).toBe(WIND_NOTES[i % WIND_NOTES.length]);
    });
  });

  it('구층탑: 풍경은 300틱마다 한 번, 외주엔 없다', () => {
    // 가만히 둔다 — 봇이 베면 탑이 먼저 무너진다(탑은 90초에 걸쳐 내려온다)
    const heard = playTicks(bossStage('3-B'), 120 + LANDMARK.PAGODA.CHIME_EVERY * 2 + 40, false);
    expect(heard.filter((h) => h.name === 'chime').length).toBe(2);
    const out = playTicks(bossStage('3-B', 2), 120 + LANDMARK.PAGODA.CHIME_EVERY * 2 + 40, false);
    expect(out.filter((h) => h.name === 'chime').length).toBe(0);
  });

  it('크레인: 내리는 동안 끼릭 반복, 놓는 순간 철컥 한 번', () => {
    const s = bossStage('4-B');
    const heard = playTicks(s, 600);
    const ratchets = heard.filter((h) => h.name === 'craneRatchet');
    const clunks = heard.filter((h) => h.name === 'craneClunk');
    expect(ratchets.length).toBeGreaterThanOrEqual(10);
    expect(clunks.length).toBeGreaterThanOrEqual(1);
    // 끼릭은 철컥 전에, 철컥 뒤로는 그 짐에 대한 끼릭이 없다
    expect(ratchets[0].tick).toBeLessThan(clunks[0].tick);
    expect(ratchets.filter((r) => r.tick > clunks[0].tick && r.tick < clunks[0].tick + 20).length).toBe(0);
  });

  it('판이 바뀌거나 틱이 되감기면 직전 장면을 잊는다 — 첫 틱엔 소리가 없다', () => {
    const a = bossStage('1-B');
    playTicks(a, 300);
    // 새 state
    const b = bossStage('1-B');
    advance(b, EMPTY_INPUT);
    vi.mocked(audioMod.playSfx).mockClear();
    consumeAudio(b);
    expect(vi.mocked(audioMod.playSfx)).not.toHaveBeenCalled();
    // 같은 state의 틱 되감기 — 되감은 뒤 판이 다시 흐르면 소리가 다시 난다(잊지 않으면 옛 틱 500에 막혀 영원히 조용하다)
    const lm = b.lm!;
    lm.st = 'play';
    lm.cue = 40;
    b.tick = 500;
    consumeAudio(b);
    b.tick = 100;
    lm.cue = 33;
    vi.mocked(audioMod.playSfx).mockClear();
    consumeAudio(b);
    expect(vi.mocked(audioMod.playSfx)).not.toHaveBeenCalled();
    b.tick = 101;
    lm.cue = 32; // 초침 한 칸
    consumeAudio(b);
    expect(vi.mocked(audioMod.playSfx).mock.calls.map((c) => c[0])).toEqual(['clockTick']);
  });

  it('차이 판정은 순수하다 — 같은 틱이거나 명물이 다르면 비어 있다', () => {
    const s = bossStage('1-B');
    const snap = snapOf(s)!;
    expect(landmarkSounds(snap, snap)).toEqual([]);
    expect(landmarkSounds(null, snap)).toEqual([]);
    const other = { ...snap, id: 'crane' as const, tick: snap.tick + 1 };
    expect(landmarkSounds(snap, other)).toEqual([]);
    expect(snapOf({ lm: null } as unknown as GameState)).toBeNull();
  });
});

describe('그리기 — 가짜 ctx', () => {
  /** 창까지 판을 돌린다 */
  function toSit(id: string): GameState {
    const s = bossStage(id);
    for (let i = 0; i < 6000 && s.lm!.st !== 'sit'; i++) { advance(s, stageBot(s)); s.events.length = 0; }
    expect(s.lm!.st).toBe('sit');
    return s;
  }

  it('종탑 창: 시계가 몸 밑동에 뜨고 주홍 「철거」 인장이 찍힌다', () => {
    const s = toSit('1-B');
    const r = recorder();
    drawLandmarkBack(r.ctx, s, 610);
    expect(r.texts()).toContain('철거');
    expect(r.log.some((c) => c.m === 'arc')).toBe(true); // 시계판
    expect(r.log.some((c) => c.m === 'fillRect' && c.fill === PALETTE.RED)).toBe(true);
  });

  it('창이 끝나 갈수록 주홍 면 너비가 준다 — 글자는 끝까지 그려지고, 자리는 가운데(의성어)를 비킨다', () => {
    const s = toSit('1-B');
    const bar = (): { w: number; texts: unknown[]; x: number } => {
      const r = recorder();
      drawLandmarkBack(r.ctx, s, 610);
      const red = r.log.filter((c) => c.m === 'fillRect' && c.fill === PALETTE.RED);
      const seat = r.log.find((c) => c.m === 'translate' && c.args[0] !== 0 && c.args[0] !== 180);
      return { w: red.length ? (red[0].args[2] as number) : 0, texts: r.texts(), x: seat?.args[0] as number };
    };
    s.lm!.t = 0;
    const full = bar();
    s.lm!.t = Math.floor(LANDMARK.SIT_TICKS[1] * 0.8);
    const late = bar();
    s.lm!.t = LANDMARK.SIT_TICKS[1];
    const dry = bar();
    expect(late.w).toBeLessThan(full.w);
    expect(dry.w).toBe(0);
    expect(dry.texts).toContain('철거'); // 마른 뒤에도 먹 글자로 읽힌다
    expect(full.x).toBeLessThan(180 - 50); // 가운데(타격 자리)에서 왼쪽으로 비킨다
    expect(full.x).toBeGreaterThan(180 - 135);
  });

  it('인장은 창(sit)에만 — play 중엔 없다', () => {
    const s = bossStage('2-B');
    for (let i = 0; i < LANDMARK.ENTER_TICKS + 5; i++) advance(s, EMPTY_INPUT);
    const r = recorder();
    drawLandmarkBack(r.ctx, s, 610);
    expect(r.texts()).not.toContain('철거');
  });

  it('바람탑: 차양과 깃발을 그리고, 날숨이면 깃발이 밖으로 자란다', () => {
    const s = bossStage('2-B');
    for (let i = 0; i < LANDMARK.ENTER_TICKS + 5; i++) advance(s, EMPTY_INPUT);
    const r = recorder();
    s.lm!.air = 0;
    for (let i = 0; i < 40; i++) drawLandmarkBack(r.ctx, s, 610);
    expect(landmarkFxView().flagU).toBeLessThan(0.05);
    s.lm!.air = 1;
    for (let i = 0; i < 40; i++) drawLandmarkBack(r.ctx, s, 610);
    expect(landmarkFxView().flagU).toBeGreaterThan(0.95);
  });

  it('바람탑 외주: 깃발이 없다(천 · 장대) — 차양은 그대로', () => {
    const run = (diff: 0 | 1 | 2) => {
      const s = bossStage('2-B', diff);
      for (let i = 0; i < LANDMARK.ENTER_TICKS + 5; i++) advance(s, EMPTY_INPUT);
      const r = recorder();
      drawLandmarkBack(r.ctx, s, 610);
      return r.log.filter((c) => c.m === 'fill' && c.fill === PALETTE.INK).length;
    };
    expect(run(1)).toBeGreaterThan(run(2)); // 차양 천은 둘 다, 깃발 천은 정규에만
    expect(run(2)).toBeGreaterThan(0);
  });

  it('크레인: 짐이 달려 내려오면 띠(주홍 판)가 서고, 케이블이 짐 꼭대기까지 간다', () => {
    const s = bossStage('4-B');
    for (let i = 0; i < 2000 && !(s.stack && s.lm!.air === 0); i++) advance(s, EMPTY_INPUT);
    expect(s.lm!.air).toBe(0);
    for (let i = 0; i < 40; i++) advance(s, EMPTY_INPUT); // 케이블이 눈에 보일 만큼 내려온다
    expect(s.lm!.air).toBe(0);
    const r = recorder();
    drawLandmarkBack(r.ctx, s, 610);
    expect(r.log.some((c) => c.m === 'fillRect' && c.fill === PALETTE.RED)).toBe(true);
    const cable = r.log.find((c) => c.m === 'lineTo' && c.args[0] === 180);
    expect(cable, '케이블 선').toBeDefined();
  });

  it('크레인: 띠는 짐이 없으면(k 0) 서지 않는다', () => {
    const s = bossStage('4-B');
    for (let i = 0; i < LANDMARK.ENTER_TICKS + 5; i++) advance(s, EMPTY_INPUT);
    expect(s.stack).toBeNull();
    const r = recorder();
    drawLandmarkBack(r.ctx, s, 610);
    expect(r.log.some((c) => c.m === 'fillRect' && c.fill === PALETTE.RED)).toBe(false);
  });

  it('구층탑: 층마다 처마가 걸리고 울림 창이 열리면 풍경이 노랑으로 빛난다', () => {
    const s = bossStage('3-B');
    for (let i = 0; i < LANDMARK.ENTER_TICKS + 5; i++) advance(s, EMPTY_INPUT);
    const lit = (cue: number): number => {
      s.lm!.cue = cue;
      const r = recorder();
      drawLandmarkFront(r.ctx, s, 610);
      return r.log.filter((c) => c.m === 'fill' && c.fill === PALETTE.YELLOW_DEEP).length;
    };
    expect(lit(0)).toBe(0);
    expect(lit(LANDMARK.PAGODA.CHIME_WINDOW)).toBe(s.stack!.floors.length * 2);
  });

  it('던진 종은 종 모양 path로 그린다 — 맞은 순간엔 흰 번쩍이 한 겹 더', () => {
    const s = bossStage('1-B');
    for (let i = 0; i < 400 && !s.stack; i++) advance(s, EMPTY_INPUT);
    expect(s.stack).not.toBeNull();
    expect(isBellStack(s.stack!)).toBe(true);
    const plain = recorder();
    drawBell(plain.ctx, s.stack!, 610);
    const flashed = recorder();
    drawBell(flashed.ctx, s.stack!, 610, 0.7);
    expect(plain.log.some((c) => c.m === 'bezierCurveTo')).toBe(true);
    expect(flashed.log.filter((c) => c.m === 'fill').length).toBe(plain.log.filter((c) => c.m === 'fill').length + 1);
  });

  it('땅에서 깨진 종: 금 가는 동안 보이다가 끝나면 사라진다', () => {
    const s = bossStage('1-B');
    noteBellBreak();
    expect(landmarkFxView().ghost).toBe(0);
    const r = recorder();
    for (let i = 0; i < 20; i++) drawLandmarkFront(r.ctx, s, 610);
    expect(landmarkFxView().ghost).toBe(-1);
  });

  it('쓰러지면(down) 장식이 몇 틱 안에 사라진다', () => {
    const s = toSit('1-B');
    s.lm!.body!.floors.length = 0;
    s.lm!.st = 'down';
    s.lm!.t = 1;
    const early = recorder();
    drawLandmarkBack(early.ctx, s, 610);
    expect(early.log.length).toBeGreaterThan(0);
    s.lm!.t = 40;
    const late = recorder();
    drawLandmarkBack(late.ctx, s, 610);
    expect(late.log.length).toBe(0);
  });

  it('몸 층 붕괴만 몸 조각으로 받는다 — 종 · 재질 없는 붕괴 · 창 밖은 아니다', () => {
    const s = toSit('1-B');
    const hard = { kind: 'floorCollapse' as const, mat: 'hard' as const, y: s.lm!.body!.y };
    expect(fxMod.shatterBody(s, hard)).toBe(true);
    expect(fxMod.shatterBody(s, { kind: 'floorCollapse', y: 0 })).toBe(false);
    expect(fxMod.shatterBody(s, { kind: 'floorCollapse', mat: 'bell', y: 0 })).toBe(false);
    s.lm!.st = 'play';
    expect(fxMod.shatterBody(s, hard)).toBe(false);
  });

  it('상태를 건드리지 않는다 — 그린 앞뒤 GameState가 같다', () => {
    const s = toSit('2-B');
    const before = JSON.stringify(s);
    const r = recorder();
    drawLandmarkBack(r.ctx, s, 610, 0.5);
    drawLandmarkFront(r.ctx, s, 610);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('종탑 내려찍기 예고', () => {
  it('그림자는 몸이 내려올수록 단조로 커지고 진해진다', () => {
    let prev = slamShadow(LANDMARK.BELL.HOVER_Y);
    for (let y = LANDMARK.BELL.HOVER_Y - 20; y >= 0; y -= 20) {
      const sh = slamShadow(y);
      expect(sh.rx).toBeGreaterThan(prev.rx);
      expect(sh.a).toBeGreaterThan(prev.a);
      prev = sh;
    }
    expect(slamShadow(0).rx).toBeGreaterThan(100); // 플레이어 발밑을 덮는다
    expect(slamShadow(-50).rx).toBe(slamShadow(0).rx);
  });

  const idle = (s: GameState) => (s.player.pose === 'pinned' ? { ...EMPTY_INPUT, guard: true } : EMPTY_INPUT);

  it('내려찍기가 시작하는 틱에 예고음 한 번 — 다음 틱엔 안 난다', () => {
    const s = bossStage('1-B');
    const slamTicks: number[] = [];
    const teles: number[] = [];
    let was = false;
    for (let i = 0; i < 3000; i++) {
      advance(s, idle(s));
      vi.mocked(audioMod.playSfx).mockClear();
      consumeAudio(s);
      if (vi.mocked(audioMod.playSfx).mock.calls.some((c) => c[0] === 'bossTele')) teles.push(s.tick);
      const now = s.lm!.st === 'slam';
      if (now) slamTicks.push(s.tick);
      if (was && !now) break;
      was = now;
      s.events.length = 0;
    }
    expect(slamTicks.length).toBeGreaterThan(5);
    expect(teles).toEqual([slamTicks[0]]);
  });

  it('slam 동안만 땅에 그림자 타원, 그 밖엔 없다', () => {
    const s = bossStage('1-B');
    for (let i = 0; i < 3000 && s.lm!.st !== 'slam'; i++) { advance(s, idle(s)); s.events.length = 0; }
    expect(s.lm!.st).toBe('slam');
    const r = recorder();
    drawLandmarkBack(r.ctx, s, 610);
    const el = r.log.find((c) => c.m === 'ellipse');
    expect(el, '그림자').toBeDefined();
    expect(el!.args[0]).toBe(180);
    expect(el!.args[2]).toBeCloseTo(slamShadow(s.lm!.body!.y).rx, 5);
    const calm = bossStage('1-B');
    for (let i = 0; i < LANDMARK.ENTER_TICKS + 5; i++) advance(calm, EMPTY_INPUT);
    const r2 = recorder();
    drawLandmarkBack(r2.ctx, calm, 610);
    expect(r2.log.some((c) => c.m === 'ellipse')).toBe(false);
  });
});

describe('종탑 절반 문턱 칸', () => {
  it('칸 상태: 꽂은 칸 → 빗나간 칸 → 남은 칸, 날고 있는 종은 아직 결과가 아니다', () => {
    expect(bellTally(0, 0, 3, false)).toEqual(['open', 'open', 'open']);
    expect(bellTally(1, 1, 3, false)).toEqual(['full', 'open', 'open']);
    expect(bellTally(1, 2, 3, true)).toEqual(['full', 'open', 'open']); // 둘째는 공중
    expect(bellTally(1, 2, 3, false)).toEqual(['full', 'miss', 'open']);
    expect(bellTally(2, 3, 6, true)).toEqual(['full', 'full', 'open', 'open', 'open', 'open']);
    expect(bellTally(2, 5, 6, false)).toEqual(['full', 'full', 'miss', 'miss', 'miss', 'open']);
    expect(bellTally(0, 12, 12, false).every((c) => c === 'miss')).toBe(true);
    for (const h of LANDMARK.BELL.HOURS) expect(bellTally(0, 0, h, false)).toHaveLength(h);
  });

  it('play 중엔 이번 파 종 수만큼 칸을 그리고, 창 · 내려찍기에선 숨긴다', () => {
    const s = bossStage('1-B');
    for (let i = 0; i < LANDMARK.ENTER_TICKS + 5; i++) advance(s, EMPTY_INPUT);
    expect(s.lm!.st).toBe('play');
    const cells = (): number => {
      const r = recorder();
      drawLandmarkBack(r.ctx, s, 610);
      return r.log.filter((c) => c.m === 'strokeRect' && c.args[2] === 6).length;
    };
    expect(cells()).toBe(LANDMARK.BELL.HOURS[s.lm!.wave]);
    s.lm!.st = 'sit';
    expect(cells()).toBe(0);
    s.lm!.st = 'slam';
    expect(cells()).toBe(0);
  });

  it('차이 판정: 꽂은 수가 절반에 처음 닿은 틱에만 한 번 — 그 뒤 더 꽂아도 · 파가 바뀌어도 아니다', () => {
    const s = bossStage('1-B');
    const base: LmSnap = { ...snapOf(s)!, st: 'play', wave: 0, tick: 10, got: 0 }; // 3시: 절반 = 2
    const names = (a: typeof base, b: typeof base): string[] => landmarkSounds(a, b).map((x) => x.name);
    expect(names(base, { ...base, tick: 11, got: 1 })).not.toContain('uiOk');
    expect(names({ ...base, got: 1 }, { ...base, tick: 11, got: 2 })).toEqual(['uiOk']);
    expect(names({ ...base, got: 2 }, { ...base, tick: 11, got: 3 })).not.toContain('uiOk');
    // 파가 끝나 값이 비워지면(sit · 다음 시각) 다시 센다
    expect(names({ ...base, got: 3 }, { ...base, tick: 11, st: 'sit', wave: 1, got: 0 })).not.toContain('uiOk');
  });

  it('실제 판: 꽂아서 창이 열린 파마다 문턱 소리가 한 번씩', () => {
    const s = bossStage('1-B');
    let sits = 0;
    let oks = 0;
    let was: string = 'enter';
    for (let i = 0; i < 2600 && !s.over; i++) {
      advance(s, stageBot(s));
      vi.mocked(audioMod.playSfx).mockClear();
      consumeAudio(s);
      oks += vi.mocked(audioMod.playSfx).mock.calls.filter((c) => c[0] === 'uiOk').length;
      if (was === 'play' && s.lm!.st === 'sit') sits += 1;
      was = s.lm!.st;
      s.events.length = 0;
    }
    expect(sits).toBeGreaterThanOrEqual(2);
    expect(oks).toBeGreaterThanOrEqual(sits);
    expect(oks - sits).toBeLessThanOrEqual(1); // 진행 중인 파의 문턱만 더 나올 수 있다
  });
});

describe('급한 집 떨림', () => {
  it('진폭: 쌓인 틱이 0이면 0px, HASTY_TICKS면 최대(6px), 최하층 HP가 1이 아니면 0', () => {
    expect(hastyAmp(0, 1)).toBe(0);
    expect(hastyAmp(STAGE.HASTY_TICKS / 2, 1)).toBeCloseTo(HASTY_SHAKE_PX / 2, 5);
    expect(hastyAmp(STAGE.HASTY_TICKS, 1)).toBe(HASTY_SHAKE_PX);
    expect(hastyAmp(STAGE.HASTY_TICKS * 3, 1)).toBe(HASTY_SHAKE_PX); // 급락 뒤에도 최대를 넘지 않는다
    expect(hastyAmp(STAGE.HASTY_TICKS, 2)).toBe(0);
    expect(hastyAmp(STAGE.HASTY_TICKS, 0)).toBe(0);
  });

  it('변위는 s.tick만의 함수(무작위 없음) — 진폭 안에서 흔들리고, 급한 집이 아니면 0', () => {
    const s = bossStage('1-B');
    expect(hastyShakeX(s)).toBe(0);
    s.stage!.hasty = true;
    s.stage!.hastyT = STAGE.HASTY_TICKS;
    s.stack = { kind: 'stack', variant: 'building', theme: 'modern', floors: [{ segs: [{ hp: 1, maxHp: 3 }], mat: 'hard', h: 68 }], y: 200, vy: 0, specialImmune: false, resting: false, totalFloors: 1 };
    const xs: number[] = [];
    for (let k = 0; k < 40; k++) { s.tick = 100 + k; xs.push(hastyShakeX(s)); }
    expect(Math.max(...xs)).toBeLessThanOrEqual(HASTY_SHAKE_PX);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-HASTY_SHAKE_PX);
    expect(Math.max(...xs)).toBeGreaterThan((HASTY_SHAKE_PX * 2) / 3);
    expect(Math.min(...xs)).toBeLessThan((-HASTY_SHAKE_PX * 2) / 3);
    s.tick = 123;
    expect(hastyShakeX(s)).toBe(hastyShakeX(s));
    s.stack.floors[0].segs[0].hp = 2;
    expect(hastyShakeX(s)).toBe(0);
    s.stack.floors[0].segs[0].hp = 1;
    s.stage!.hasty = false;
    expect(hastyShakeX(s)).toBe(0);
  });
});

// ── 2판 기믹 예고 (docs/STAGES_2026-10-31.md §6 「예고(눈 / 귀)」) ──────────────────────────
// core가 규칙을 넣었든 아니든 상태를 손으로 만들어 돌린다(core 동작에 기대지 않는다).

/** 틱 10에 선 첫 장면 — 필요한 칸만 덮어 쓴다 */
function snapAt(id: string, over: Partial<LmSnap> = {}): LmSnap {
  return { ...snapOf(bossStage(id))!, tick: 10, ...over };
}
const sndNames = (a: LmSnap, b: LmSnap): string[] => landmarkSounds(a, b).map((x) => x.name);

describe('2판 소리 — 종탑', () => {
  it('공중 가드로 올린 종이 꽂히면 댕댕이 한 겹 더 — 지면 가드 · 쓰러진 뒤엔 아니다', () => {
    const prev = snapAt('1-B', { st: 'play', flying: true, stack: true });
    const cur = { ...prev, tick: 11, stack: false, hit: true };
    expect(sndNames(prev, cur)).toContain('bellTwin');
    expect(sndNames({ ...prev, flying: false }, cur)).not.toContain('bellTwin');
    expect(sndNames(prev, { ...cur, hit: false })).not.toContain('bellTwin');
    expect(sndNames(prev, { ...cur, st: 'down' })).not.toContain('bellTwin');
    // 점수가 종 수에 닿아 파가 바로 끝나(sit, got 0) 값이 비워져도 꽂힘은 들린다
    expect(sndNames(prev, { ...cur, st: 'sit', got: 0, wave: 1 })).toContain('bellTwin');
  });

  it('3막(시보)은 던질 때 댕 대신 쾅, 쓰러진 뒤(13시)는 소리 없이 떨어진다', () => {
    const prev = snapAt('1-B', { st: 'play', stack: false, act: 3 });
    const cur = { ...prev, tick: 11, stack: true };
    expect(sndNames(prev, cur)).toEqual(['bellBoom']);
    expect(sndNames({ ...prev, act: 1 }, { ...cur, act: 1 })).toEqual(['bellToss']);
    expect(sndNames({ ...prev, st: 'down' }, { ...cur, st: 'down' })).toEqual([]);
  });

  it('꽂힘 소리: 3막은 쾅, 그 밖엔 몸 울림. 파가 바로 끝난 틱(sit t 0)의 꽂힘도 울림 — 창 중 필살은 그대로', () => {
    const st = (act: number, stN: string, t = 5) => ({
      weapon: 'sword', boss: null, player: { pose: 'idle' }, stack: null,
      lm: { id: 'bell', st: stN, t, body: { floors: new Array(act === 3 ? 1 : 4).fill({}) } },
    }) as unknown as GameState;
    const hit = { kind: 'bossHit' as const, y: 400 };
    const map = (s: GameState) => mapEvent(hit, s, new Set(['bossHit']));
    expect(map(st(1, 'play'))).toEqual(['bellBody']);
    expect(map(st(3, 'play'))).toEqual(['bellBoom']);
    expect(map(st(1, 'sit', 0))).toEqual(['bellBody']);
    expect(map(st(1, 'sit', 5))).toEqual(['bossHit']);
  });

  it('정각: 마감이 가까울수록 똑딱이 잦다 — 2막 정규 · 외주 play에서만, 견습 · 1막 · 3막은 조용', () => {
    expect(blockTickEvery(0)).toBe(0);
    expect(blockTickEvery(0.49)).toBe(0);
    expect(blockTickEvery(1)).toBe(0); // 덩이가 떨어진 뒤
    let prev = Infinity;
    for (const p of [0.5, 0.75, 0.9]) { // 단조로 짧아진다
      const e = blockTickEvery(p);
      expect(e).toBeGreaterThan(0);
      expect(e).toBeLessThan(prev);
      prev = e;
    }
    const hours = LANDMARK.BELL.HOURS[1]; // 6시
    const k = Math.round(hours * LANDMARK.BELL.BLOCK_PACE * 0.92);
    const every = blockTickEvery(blockProgress(hours, k));
    const kk = k + (every - (k % every)); // 다음 배수
    const base = snapAt('1-B', { st: 'play', wave: 1, act: 2, diff: 1, stack: true, cue: 0, k: kk - 1 });
    const cur = { ...base, tick: 11, k: kk };
    expect(sndNames(base, cur)).toEqual(['clockTick']);
    expect(landmarkSounds(base, cur)[0].semis).toBe(9); // 초침 똑딱(0 · −4)과 구별되는 높은 똑딱
    expect(sndNames({ ...base, diff: 0 }, { ...cur, diff: 0 })).toEqual([]);
    expect(sndNames({ ...base, act: 1 }, { ...cur, act: 1 })).toEqual([]);
    expect(sndNames({ ...base, act: 3 }, { ...cur, act: 3 })).toEqual([]);
    expect(sndNames(base, { ...cur, k: kk + 1 })).toEqual([]); // 배수가 아니면 조용
  });

  it('막이 바뀌는 틱에 도장 소리 하나 — 같은 막이면 없다', () => {
    const prev = snapAt('1-B', { st: 'play', act: 1 });
    expect(sndNames(prev, { ...prev, tick: 11, act: 2 })).toEqual(['stamp']);
    expect(sndNames(prev, { ...prev, tick: 11, act: 1 })).toEqual([]);
    for (const id of ['2-B', '3-B', '4-B']) {
      const p = snapAt(id, { act: 2 });
      expect(sndNames(p, { ...p, tick: 11, act: 3 })).toContain('stamp');
    }
  });

  it('13시: 떨어지는 종(x 2)을 가드로 받은 틱에만 맑은 종소리', () => {
    const prev = snapAt('1-B', { st: 'down', x: 2, stack: true });
    expect(sndNames(prev, { ...prev, tick: 11, guard: true })).toEqual(['bellClear']);
    expect(sndNames(prev, { ...prev, tick: 11 })).toEqual([]);
    expect(sndNames({ ...prev, x: 1, stack: false }, { ...prev, tick: 11, guard: true })).toEqual([]);
  });
});

describe('2판 소리 — 바람탑 · 구층탑 · 크레인', () => {
  it('바람탑: 좌판이 문턱(LIGHT)에 처음 닿는 틱에 딸깍 한 번 — 난이도별 문턱', () => {
    for (const d of [0, 1, 2] as const) {
      const L = LANDMARK.WIND.LIGHT[d];
      const prev = snapAt('2-B', { st: 'play', diff: d, k: L - 1 });
      expect(sndNames(prev, { ...prev, tick: 11, k: L })).toEqual(['uiOk']);
      expect(sndNames({ ...prev, k: L }, { ...prev, tick: 11, k: L + 1 })).toEqual([]);
      expect(sndNames({ ...prev, k: L + 2 }, { ...prev, tick: 11, k: 0 })).toEqual([]); // 새 좌판
    }
  });

  it('바람탑: 맞바람이 켜지는 틱(x가 오른다)에 퉁 — 줄어드는 동안은 조용', () => {
    const prev = snapAt('2-B', { st: 'play', x: 0 });
    expect(sndNames(prev, { ...prev, tick: 11, x: LANDMARK.WIND.RETURN_TICKS })).toEqual(['bellThud']);
    expect(sndNames({ ...prev, x: 50 }, { ...prev, tick: 11, x: 49 })).toEqual([]);
  });

  it('구층탑 삐걱: 더미가 늘수록 · 땅이 가까울수록 잦다. 당김이 없으면 땅 가까운 끝에서만', () => {
    const e = (p: number, low: boolean, pull = true) => creakEvery(p, low, pull);
    expect(e(0, false)).toBe(0);
    expect(e(1, false)).toBeGreaterThan(e(2, false));
    expect(e(2, false)).toBeGreaterThan(e(3, false));
    expect(e(9, false)).toBe(e(3, false)); // 더미 상한
    for (const p of [1, 2, 3]) expect(e(p, true)).toBeLessThan(e(p, false));
    expect(e(0, true)).toBeGreaterThan(0); // 더미 0이어도 땅이 가까우면 삐걱
    expect(e(3, false, false)).toBe(0); // 견습 · 1막: 당김 없음
    expect(e(0, true, false)).toBeGreaterThan(0); // 그래도 끝 예고는 있다
    const k = e(2, false);
    const prev = snapAt('3-B', { st: 'play', act: 2, diff: 1, piles: 2, sy: 300, tick: k - 1 });
    expect(sndNames(prev, { ...prev, tick: k })).toEqual(['pagodaCreak']);
    expect(sndNames(prev, { ...prev, tick: k + 1 })).toEqual([]);
    // 밑면이 PAGODA_LOW_Y 밑이면 더 낮은 음 · 더 잦다
    const lowEvery = e(2, true);
    const lowSnd = landmarkSounds({ ...prev, tick: lowEvery - 1 }, { ...prev, tick: lowEvery, sy: PAGODA_LOW_Y - 1 });
    expect(lowSnd[0].semis!).toBeLessThan(landmarkSounds(prev, { ...prev, tick: k })[0].semis!);
  });

  it('구층탑: 탑을 크게 띄우기 시작한 틱에 삐걱(견습은 기와가 없어 조용)', () => {
    const prev = snapAt('3-B', { st: 'play', flying: false, diff: 1, tick: 11 });
    expect(sndNames(prev, { ...prev, tick: 12, flying: true })).toEqual(['pagodaCreak']);
    expect(sndNames({ ...prev, diff: 0 }, { ...prev, tick: 12, flying: true, diff: 0 })).toEqual([]);
    expect(sndNames({ ...prev, flying: true }, { ...prev, tick: 12, flying: true })).toEqual([]);
  });

  it('크레인 띠: 내려오는 동안 원래 띠에서 읽은 띠로 미끄러져 자리 잡고, 끼릭 음높이가 따라간다', () => {
    const C = LANDMARK.CRANE;
    expect(bandEase(0)).toBe(0);
    expect(bandEase(0.8)).toBe(1);
    expect(bandEase(1)).toBe(1);
    expect(bandEase(0.4)).toBeCloseTo(0.5, 5);
    const s = bossStage('4-B');
    for (let i = 0; i < 2000 && !(s.stack && s.lm!.air === 0); i++) advance(s, EMPTY_INPUT);
    const lm = s.lm!;
    const stk = s.stack!;
    const from = C.CARGO[(lm.wave - 1) % C.CARGO.length][1];
    lm.k = from === C.BAND_LO ? C.BAND_HI : C.BAND_LO; // 읽는 띠가 다른 띠를 골랐다
    const h = stk.floors.reduce((a, f) => a + f.h, 0);
    const bands: number[] = [];
    for (let y = C.LOWER_TOP - h; y >= C.LOWER_TO; y -= 10) { stk.y = y; bands.push(craneBand(s)); }
    expect(bands[0]).toBe(from); // 내리기 시작 = 원래 띠
    stk.y = C.LOWER_TO;
    expect(craneBand(s)).toBe(lm.k); // 놓을 때 = 읽은 띠
    const dir = Math.sign(lm.k - from);
    bands.forEach((b, i) => { if (i) expect((b - bands[i - 1]) * dir).toBeGreaterThanOrEqual(0); }); // 한 방향으로만
    lm.air = 1;
    expect(craneBand(s)).toBe(lm.k); // 내린 뒤엔 lm.k 그대로
    // 높은 띠일수록 높은 끼릭
    expect(bandSemis(C.BAND_LO)).toBe(0);
    expect(bandSemis(C.BAND_HI)).toBeGreaterThan(bandSemis(C.BAND_LO));
    const rat = (band: number) => landmarkSounds(
      snapAt('4-B', { st: 'play', air: 0, stack: true, tick: 11, band }),
      snapAt('4-B', { st: 'play', air: 0, stack: true, tick: RATCHET_STEP * 4, band }),
    )[0];
    expect(rat(C.BAND_HI).name).toBe('craneRatchet');
    expect(rat(C.BAND_HI).semis!).toBeGreaterThan(rat(C.BAND_LO).semis!);
  });

  it('크레인 반창: cue가 2가 되는 틱에 끼릭 두 번(두 번째는 조금 늦게 · 높게), 이미 2면 조용', () => {
    const prev = snapAt('4-B', { st: 'sit', cue: 1 });
    const out = landmarkSounds(prev, { ...prev, tick: 11, cue: 2 });
    expect(out.map((o) => o.name)).toEqual(['craneRatchet', 'craneRatchet']);
    expect(out[1].delay!).toBeGreaterThan(0);
    expect(out[1].semis!).toBeGreaterThan(out[0].semis!);
    expect(sndNames({ ...prev, cue: 2 }, { ...prev, tick: 11, cue: 2 })).toEqual([]);
    // 다른 명물의 cue 2는 반창이 아니다
    const bell = snapAt('1-B', { st: 'play', cue: 1 });
    expect(sndNames(bell, { ...bell, tick: 11, cue: 2 })).not.toContain('craneRatchet');
  });

  it('크레인 줄: 놓는 자리보다 한참 높은 데서 놓으면(끊김) 철컥 대신 탁', () => {
    const prev = snapAt('4-B', { st: 'play', air: 0, stack: true });
    expect(sndNames(prev, { ...prev, tick: 11, air: 1, sy: LANDMARK.CRANE.LOWER_TO })).toEqual(['craneClunk']);
    expect(sndNames(prev, { ...prev, tick: 11, air: 1, sy: LANDMARK.CRANE.LOWER_TO - 2 })).toEqual(['craneClunk']);
    expect(sndNames(prev, { ...prev, tick: 11, air: 1, sy: LANDMARK.CRANE.LOWER_TO + 120 })).toEqual(['craneSnap']);
  });

  it('새 프리셋이 모두 있다', () => {
    for (const n of ['bellTwin', 'bellBoom', 'bellClear', 'pagodaCreak', 'craneSnap'] as const) {
      expect(typeof SFX_PRESETS[n], n).toBe('function');
    }
  });
});

describe('2판 그림 — 종탑', () => {
  /** 이번 파 점수가 2씩 뛰어도 · 조기 종료로 got이 종 수를 넘어도 칸이 맞게 그려진다 */
  it('칸: 점수 칸은 시각을 넘지 않고, 한 번에 2점이 차도 한 줄로 이어진다', () => {
    expect(bellTally(2, 1, 3, false)).toEqual(['full', 'full', 'open']); // 공중 가드 2점 하나
    expect(bellTally(4, 2, 6, true)).toEqual(['full', 'full', 'full', 'full', 'open', 'open']);
    expect(bellTally(5, 3, 3, false)).toEqual(['full', 'full', 'full']); // 조기 종료: 칸보다 점수가 크다
    expect(bellTally(3, 2, 3, false)).toHaveLength(3);
    for (const h of LANDMARK.BELL.HOURS) expect(bellTally(h + 1, 1, h, false).every((c) => c === 'full')).toBe(true);
  });

  it('3막: 점수가 종 수(12)를 넘어도 칸은 12개로 깨지지 않고, 절반 눈금과 「이번 파는 안전」 신호는 없다', () => {
    expect(bellTally(15, 9, 12, false)).toHaveLength(12);
    expect(bellTally(15, 9, 12, false).every((c) => c === 'full')).toBe(true);
    const snap = (act: 1 | 3) => snapAt('1-B', { st: 'play', act, wave: 3, got: 5 });
    expect(sndNames(snap(1), { ...snap(1), tick: 11, got: 6 })).toEqual(['uiOk']); // 12시 1막: 절반(6)에 닿는다
    expect(sndNames(snap(3), { ...snap(3), tick: 11, got: 6 })).toEqual([]);
    // 눈금: 시각 칸 뒤의 짧은 세로선(길이 칸+6)이 3막에만 없다
    const ticks = (floors: number): number => {
      const s = bossStage('1-B');
      for (let i = 0; i < LANDMARK.ENTER_TICKS + 5; i++) advance(s, EMPTY_INPUT);
      s.lm!.body!.floors.length = floors;
      s.stack = null;
      const r = recorder();
      drawLandmarkBack(r.ctx, s, 610);
      let n = 0;
      r.log.forEach((c, i) => {
        const nx = r.log[i + 1];
        if (c.m === 'moveTo' && nx?.m === 'lineTo' && nx.args[0] === c.args[0] && (nx.args[1] as number) - (c.args[1] as number) === 12) n += 1;
      });
      return n;
    };
    expect(ticks(4)).toBe(1);
    expect(ticks(1)).toBe(0);
  });

  it('덩이(종 여러 층 한 스택)는 층마다 종을 그린다 — 입 띠가 층 수만큼', () => {
    const bellFloor = (): Floor => ({ segs: [{ hp: 999, maxHp: 999 }], mat: 'bell', h: 68 });
    const mouths = (n: number): number => {
      const r = recorder();
      drawBell(r.ctx, { y: 200, floors: Array.from({ length: n }, bellFloor) }, 610);
      return r.log.filter((c) => c.m === 'fillRect' && c.args[2] === 108).length;
    };
    expect(mouths(1)).toBe(1);
    expect(mouths(3)).toBe(3);
    // 층마다 한 층 높이씩 위로 쌓인다
    const r = recorder();
    drawBell(r.ctx, { y: 200, floors: [bellFloor(), bellFloor()] }, 610);
    const ys = r.log.filter((c) => c.m === 'fillRect' && c.args[2] === 108).map((c) => c.args[1] as number);
    expect(ys[0] - ys[1]).toBe(68);
  });

  /** 막을 손으로 만든다: 몸 층 4 · 2 · 1개 = 1 · 2 · 3막 */
  function bellAct(act: 1 | 2 | 3, diff: 0 | 1 | 2 = 1): GameState {
    const s = bossStage('1-B', diff);
    for (let i = 0; i < LANDMARK.ENTER_TICKS + 5; i++) advance(s, EMPTY_INPUT);
    expect(s.lm!.st).toBe('play');
    s.lm!.body!.floors.length = act === 1 ? 4 : act === 2 ? 2 : 1;
    s.stack = null;
    return s;
  }

  it('정각 분침: 2막 정규 · 외주 play에서만 12시 쐐기와 분침이 그려지고, 한 바퀴 끝에 12시를 가리킨다', () => {
    expect(minuteAngle(0)).toBe(0);
    expect(minuteAngle(0.5)).toBeCloseTo(Math.PI, 5);
    expect(minuteAngle(1)).toBeCloseTo(Math.PI * 2, 5);
    expect(minuteAngle(7)).toBeCloseTo(Math.PI * 2, 5);
    const wedge = (s: GameState): boolean => {
      const r = recorder();
      drawLandmarkBack(r.ctx, s, 610);
      return r.log.some((c) => c.m === 'moveTo' && c.args[0] === -4.5); // 정각 쐐기
    };
    expect(wedge(bellAct(2))).toBe(true);
    expect(wedge(bellAct(2, 2))).toBe(true);
    expect(wedge(bellAct(2, 0))).toBe(false);
    expect(wedge(bellAct(1))).toBe(false);
    expect(wedge(bellAct(3))).toBe(false);
    const s = bellAct(2);
    s.lm!.st = 'sit';
    expect(wedge(s)).toBe(false);
  });

  it('3막 시보: play 중에도 「철거」 인장이 탑 몸에 찍혀 있다 — 1 · 2막 play엔 없다, 주홍 면은 가득', () => {
    const draw = (s: GameState) => { const r = recorder(); drawLandmarkBack(r.ctx, s, 610); return r; };
    const r3 = draw(bellAct(3));
    expect(r3.texts()).toContain('철거');
    const red = r3.log.filter((c) => c.m === 'fillRect' && c.fill === PALETTE.RED);
    expect(red.length).toBe(1);
    expect(red[0].args[2]).toBe(112); // 먹이 마르지 않는다(전폭)
    expect(draw(bellAct(1)).texts()).not.toContain('철거');
    expect(draw(bellAct(2)).texts()).not.toContain('철거');
    // 문턱 칸과 겹치지 않게 작게 · 왼쪽으로
    expect(r3.log.find((c) => c.m === 'translate' && c.args[0] === 180 - 92)).toBeDefined();
    expect(r3.log.find((c) => c.m === 'scale' && c.args[0] === 0.7)).toBeDefined();
  });

  it('막이 바뀌는 프레임에 몸에 먹 터짐 하나, 그 뒤 일정 프레임이면 사라진다 — 같은 막에선 안 찍힌다', () => {
    const s = bellAct(1);
    const r = recorder();
    drawLandmarkBack(r.ctx, s, 610);
    expect(landmarkFxView().marks).toBe(0);
    s.lm!.body!.floors.length = 2; // 4 → 2: 2막
    drawLandmarkBack(r.ctx, s, 610);
    expect(landmarkFxView().marks).toBe(1);
    drawLandmarkBack(r.ctx, s, 610);
    expect(landmarkFxView().marks).toBe(1); // 한 번만
    for (let i = 0; i < 30; i++) drawLandmarkFront(r.ctx, s, 610);
    expect(landmarkFxView().marks).toBe(0);
    s.lm!.body!.floors.length = 1; // 3막
    drawLandmarkBack(r.ctx, s, 610);
    expect(landmarkFxView().marks).toBe(1);
  });

  it('내려찍기를 막는 순간(air 2) 땅에 먹 터짐 하나 — 막지 못한 판정(air 1)엔 없다', () => {
    const s = bellAct(1);
    const r = recorder();
    drawLandmarkBack(r.ctx, s, 610);
    s.lm!.air = 1;
    drawLandmarkBack(r.ctx, s, 610);
    expect(landmarkFxView().marks).toBe(0);
    s.lm!.air = 2;
    drawLandmarkBack(r.ctx, s, 610);
    expect(landmarkFxView().marks).toBe(1);
    drawLandmarkBack(r.ctx, s, 610);
    expect(landmarkFxView().marks).toBe(1);
  });
});

describe('2판 그림 — 바람탑', () => {
  const stall = (): NonNullable<GameState['stack']> => ({
    kind: 'stack', variant: 'building', theme: 'asia', floors: [{ segs: [{ hp: 1, maxHp: 1 }], mat: 'mid', h: 68 }],
    y: 200, vy: 0, specialImmune: false, resting: false, totalFloors: 1,
  });
  function windState(diff: 0 | 1 | 2 = 1): GameState {
    const s = bossStage('2-B', diff);
    for (let i = 0; i < LANDMARK.ENTER_TICKS + 5; i++) advance(s, EMPTY_INPUT);
    s.stack = stall();
    return s;
  }

  it('가벼운 좌판: 띄운 횟수가 문턱에 닿으면 좌판이 팔랑이고(가로 흔들림) 닿기 전엔 가만히', () => {
    const s = windState();
    const L = LANDMARK.WIND.LIGHT[1];
    s.lm!.k = L - 1;
    expect(windLight(s)).toBe(false);
    expect(hastyShakeX(s)).toBe(0);
    s.lm!.k = L;
    expect(windLight(s)).toBe(true);
    const xs: number[] = [];
    for (let t = 0; t < 40; t++) { s.tick = 100 + t; xs.push(hastyShakeX(s)); }
    expect(Math.max(...xs)).toBeGreaterThan(WIND_FLUTTER_PX * 0.8);
    expect(Math.max(...xs)).toBeLessThanOrEqual(WIND_FLUTTER_PX);
    expect(Math.min(...xs)).toBeLessThan(-WIND_FLUTTER_PX * 0.8);
    s.stack = null;
    expect(hastyShakeX(s)).toBe(0); // 좌판이 없으면 흔들 것도 없다
    const d0 = windState(0);
    d0.lm!.k = LANDMARK.WIND.LIGHT[0] - 1;
    expect(windLight(d0)).toBe(false); // 견습은 문턱이 더 낮다 — 그 직전은 아직
    d0.lm!.k = LANDMARK.WIND.LIGHT[0];
    expect(windLight(d0)).toBe(true);
  });

  it('가벼운 좌판에는 양옆 바람결 여섯 줄이 그려지고, 문턱 전엔 없다', () => {
    const s = windState();
    const strokes = (): number => {
      const r = recorder();
      drawLandmarkFront(r.ctx, s, 610);
      return r.log.filter((c) => c.m === 'arc' && c.args[2] === 7).length;
    };
    s.lm!.k = LANDMARK.WIND.LIGHT[1] - 1;
    expect(strokes()).toBe(0);
    s.lm!.k = LANDMARK.WIND.LIGHT[1];
    expect(strokes()).toBe(6);
  });

  it('맞바람: 좌판 밑 그림자는 x가 남은 동안 진하고, 많이 남을수록 더 진하다 · 낮을수록 크다', () => {
    const calm = windShadow(200, 0);
    const gust = windShadow(200, 30);
    const gustMore = windShadow(200, LANDMARK.WIND.RETURN_TICKS);
    expect(gust.a).toBeGreaterThan(calm.a + 0.25);
    expect(gustMore.a).toBeGreaterThan(gust.a);
    expect(windShadow(100, 0).rx).toBeGreaterThan(windShadow(300, 0).rx);
    expect(windShadow(0, LANDMARK.WIND.RETURN_TICKS).a).toBeLessThanOrEqual(1);
  });

  it('맞바람 그림자는 2막 이상 정규 · 외주에서만 땅에 그려지고, x가 남으면 알파가 오른다', () => {
    const alphaOf = (s: GameState): number | null => {
      const r = recorder();
      const alphas: number[] = [];
      const ctx = new Proxy(r.ctx as object, {
        set: (t, k, v) => { if (k === 'globalAlpha') alphas.push(v as number); return Reflect.set(t, k, v); },
      }) as unknown as CanvasRenderingContext2D;
      drawLandmarkBack(ctx, s, 610);
      return r.log.some((c) => c.m === 'ellipse') ? alphas[0] ?? null : null;
    };
    const s2 = windState();
    s2.lm!.body!.floors.length = 3; // 2막
    const calm = alphaOf(s2);
    s2.lm!.x = LANDMARK.WIND.RETURN_TICKS;
    const gust = alphaOf(s2);
    expect(calm).not.toBeNull();
    expect(gust!).toBeGreaterThan(calm! + 0.25);
    expect(alphaOf(windState())).toBeNull(); // 1막
    const s0 = windState(0);
    s0.lm!.body!.floors.length = 3;
    expect(alphaOf(s0)).toBeNull(); // 견습
  });

  it('외주 젖은 좌판(k −1): 먹이 번진 면과 흘러내린 가닥이 그려지고, 마른 좌판엔 없다', () => {
    const inkFills = (s: GameState): number => {
      const r = recorder();
      drawLandmarkFront(r.ctx, s, 610);
      return r.log.filter((c) => c.m === 'fill' && c.fill === PALETTE.INK).length;
    };
    const s = windState(2);
    s.lm!.k = 0;
    expect(inkFills(s)).toBe(0);
    s.lm!.k = -1;
    expect(inkFills(s)).toBeGreaterThanOrEqual(4); // 번진 면 하나 + 가닥 셋
  });
});

describe('2판 그림 — 구층탑', () => {
  function pagodaState(floors: number, diff: 0 | 1 | 2 = 1): GameState {
    const s = bossStage('3-B', diff);
    for (let i = 0; i < LANDMARK.ENTER_TICKS + 5; i++) advance(s, EMPTY_INPUT);
    s.stack!.floors.length = floors;
    return s;
  }

  it('땅 그림자: 낮을수록 크고 진하다. 밑면이 120 밑이면 한 단계 더 진하다(끊김 없이 이어서)', () => {
    let prev = pagodaShadow(LANDMARK.PAGODA.START_Y);
    for (let y = LANDMARK.PAGODA.START_Y - 10; y >= 0; y -= 10) {
      const sh = pagodaShadow(y);
      expect(sh.a).toBeGreaterThan(prev.a);
      expect(sh.rx).toBeGreaterThanOrEqual(prev.rx);
      prev = sh;
    }
    const at = (y: number) => pagodaShadow(y).a;
    expect(at(PAGODA_LOW_Y - 40) - at(PAGODA_LOW_Y)).toBeGreaterThan(at(PAGODA_LOW_Y) - at(PAGODA_LOW_Y + 40)); // 120 밑에서 기울기가 가팔라진다
    expect(pagodaShadow(0).a).toBeLessThanOrEqual(1);
  });

  it('당김: 더미 하나마다 먼지 알갱이 셋, 2막 이상 정규 · 외주에서만. 더미가 없으면 없다', () => {
    expect([0, 1, 2, 3, 9].map(dustCount)).toEqual([0, 3, 6, 9, 9]);
    const motes = (s: GameState): number => {
      const r = recorder();
      drawLandmarkBack(r.ctx, s, 610);
      return r.log.filter((c) => c.m === 'arc').length;
    };
    const s = pagodaState(6);
    s.groundRocks = 0;
    expect(motes(s)).toBe(0);
    s.groundRocks = 2;
    expect(motes(s)).toBe(6);
    s.groundRocks = 3;
    expect(motes(s)).toBe(9);
    expect(motes(Object.assign(pagodaState(9), { groundRocks: 3 }))).toBe(0); // 1막
    expect(motes(Object.assign(pagodaState(6, 0), { groundRocks: 3 }))).toBe(0); // 견습
    expect(motes(Object.assign(pagodaState(6, 2), { groundRocks: 1 }))).toBe(3);
  });

  it('구층탑 그림자 타원은 play 동안 항상 땅에 깔린다(몸이 없어도)', () => {
    const r = recorder();
    drawLandmarkBack(r.ctx, pagodaState(9), 610);
    expect(r.log.some((c) => c.m === 'ellipse')).toBe(true);
  });

  it('크게 띄우면 탑이 짧게 흔들린다 — 흔들림은 점점 줄어 사라지고, 견습은 안 흔들린다', () => {
    const s = pagodaState(6);
    const r = recorder();
    drawLandmarkBack(r.ctx, s, 610);
    expect(hastyShakeX(s)).toBe(0);
    s.lm!.flying = true;
    drawLandmarkBack(r.ctx, s, 610); // 띄움 판정이 처음 선 프레임
    expect(landmarkFxView().lift).toBeGreaterThan(0);
    const amps: number[] = [];
    for (let i = 0; i < 40; i++) {
      amps.push(Math.abs(hastyShakeX(s)));
      drawLandmarkBack(r.ctx, s, 610);
    }
    expect(Math.max(...amps)).toBeGreaterThan(LIFT_SHAKE_PX * 0.3);
    expect(Math.max(...amps)).toBeLessThanOrEqual(LIFT_SHAKE_PX);
    expect(landmarkFxView().lift).toBe(0); // 계속 떠올라도 한 번만, 짧게
    expect(hastyShakeX(s)).toBe(0);
    const d0 = pagodaState(6, 0);
    drawLandmarkBack(r.ctx, d0, 610);
    d0.lm!.flying = true;
    drawLandmarkBack(r.ctx, d0, 610);
    expect(landmarkFxView().lift).toBe(0);
  });

  it('막이 바뀌면(층 7 → 6) 탑 몸에 먹 터짐', () => {
    const s = pagodaState(7);
    const r = recorder();
    drawLandmarkBack(r.ctx, s, 610);
    expect(landmarkFxView().marks).toBe(0);
    s.stack!.floors.length = 6;
    drawLandmarkBack(r.ctx, s, 610);
    expect(landmarkFxView().marks).toBe(1);
  });
});

describe('2판 그림 — 크레인', () => {
  /** 짐이 달려 내려오는 중 */
  function craneLowering(): GameState {
    const s = bossStage('4-B');
    for (let i = 0; i < 2000 && !(s.stack && s.lm!.air === 0); i++) advance(s, EMPTY_INPUT);
    for (let i = 0; i < 40; i++) advance(s, EMPTY_INPUT);
    expect(s.lm!.air).toBe(0);
    return s;
  }

  it('줄이 해진 정도: 케이블 벤 수 0 · 1 · 2 → 가닥이 늘고, 2타엔 점선(끊기기 직전)', () => {
    expect([0, 1, 2, 5].map(cableFray)).toEqual([0, 1, 2, 2]);
    const draw = (got: number) => {
      resetLandmarkFx();
      const s = craneLowering();
      s.lm!.got = got;
      const r = recorder();
      drawLandmarkBack(r.ctx, s, 610);
      return { moves: r.log.filter((c) => c.m === 'moveTo').length, dash: r.log.some((c) => c.m === 'setLineDash' && (c.args[0] as number[])[0] === 10) };
    };
    const a = draw(0);
    const b = draw(1);
    const c = draw(2);
    expect(b.moves).toBeGreaterThan(a.moves);
    expect(c.moves).toBeGreaterThan(b.moves);
    expect(a.dash).toBe(false);
    expect(b.dash).toBe(false);
    expect(c.dash).toBe(true);
  });

  it('줄이 끊기면(높은 데서 놓음) 갈고리가 그 높이에 걸려 흔들리다 올라간다 — 정상 놓기엔 없다', () => {
    const cut = craneLowering();
    const r = recorder();
    drawLandmarkBack(r.ctx, cut, 610); // 쥐고 있는 프레임: 높은 짐
    expect(landmarkFxView().dangle).toBe(0);
    cut.lm!.air = 1; // 높은 채로 놓였다
    drawLandmarkBack(r.ctx, cut, 610);
    expect(landmarkFxView().dangle).toBeGreaterThan(30);
    for (let i = 0; i < 60; i++) drawLandmarkBack(r.ctx, cut, 610);
    expect(landmarkFxView().dangle).toBe(0);
    // 정상: 놓는 자리까지 내려와서 놓는다
    resetLandmarkFx();
    const ok = craneLowering();
    ok.stack!.y = LANDMARK.CRANE.LOWER_TO;
    drawLandmarkBack(r.ctx, ok, 610);
    ok.lm!.air = 1;
    drawLandmarkBack(r.ctx, ok, 610);
    expect(landmarkFxView().dangle).toBe(0);
  });

  it('띠 표시는 마스트 쪽 가장자리에만 — 내려오는 짐(몸 폭)과 가로로 겹치지 않는다', () => {
    const s = craneLowering();
    const r = recorder();
    drawLandmarkBack(r.ctx, s, 610);
    const red = r.log.filter((c) => c.m === 'fillRect' && c.fill === PALETTE.RED);
    expect(red.length).toBeGreaterThan(0);
    for (const c of red) expect((c.args[0] as number) + (c.args[2] as number)).toBeLessThanOrEqual(180 - 270 / 2);
  });

  it('읽는 띠: 내리는 동안 그린 띠가 원래 띠에서 lm.k로 미끄러진다', () => {
    const C = LANDMARK.CRANE;
    const s = craneLowering();
    const lm = s.lm!;
    const from = C.CARGO[(lm.wave - 1) % C.CARGO.length][1];
    lm.k = from === C.BAND_LO ? C.BAND_HI : C.BAND_LO;
    const h = s.stack!.floors.reduce((a, f) => a + f.h, 0);
    const r = recorder();
    s.stack!.y = C.LOWER_TOP - h;
    drawLandmarkBack(r.ctx, s, 610);
    expect(landmarkFxView().band).toBe(from);
    s.stack!.y = (C.LOWER_TOP - h + C.LOWER_TO) / 2;
    drawLandmarkBack(r.ctx, s, 610);
    const mid = landmarkFxView().band;
    expect(Math.abs(mid - lm.k)).toBeLessThan(Math.abs(from - lm.k));
    expect(Math.abs(mid - from)).toBeGreaterThan(0);
    s.stack!.y = C.LOWER_TO;
    drawLandmarkBack(r.ctx, s, 610);
    expect(landmarkFxView().band).toBe(lm.k);
  });

  it('반창: 팔이 반만 꺾여 마디 바깥쪽이 치켜들린다(회전 한 번), 평소 · 창이 아닌 cue 2엔 없다', () => {
    expect(craneHalf({ id: 'crane', st: 'sit', cue: 2 } as LandmarkState)).toBe(true);
    expect(craneHalf({ id: 'crane', st: 'sit', cue: 1 } as LandmarkState)).toBe(false);
    expect(craneHalf({ id: 'crane', st: 'play', cue: 2 } as LandmarkState)).toBe(false);
    expect(craneHalf({ id: 'bell', st: 'sit', cue: 2 } as LandmarkState)).toBe(false);
    const rotated = (cue: number): boolean => {
      const s = bossStage('4-B');
      for (let i = 0; i < LANDMARK.ENTER_TICKS + 5; i++) advance(s, EMPTY_INPUT);
      s.lm!.st = 'sit';
      s.lm!.cue = cue;
      const r = recorder();
      drawLandmarkBack(r.ctx, s, 610);
      return r.log.some((c) => c.m === 'rotate' && (c.args[0] as number) < -0.2);
    };
    expect(rotated(2)).toBe(true);
    expect(rotated(0)).toBe(false);
    expect(rotated(1)).toBe(false);
  });
});

describe('2판 그림은 상태를 건드리지 않는다', () => {
  it('막 바뀜 · 반창 · 젖음 · 당김을 그린 앞뒤 GameState가 같다', () => {
    const cases: GameState[] = [];
    const a = bossStage('1-B');
    for (let i = 0; i < LANDMARK.ENTER_TICKS + 5; i++) advance(a, EMPTY_INPUT);
    a.lm!.body!.floors.length = 1;
    a.lm!.air = 2;
    cases.push(a);
    const b = bossStage('4-B');
    for (let i = 0; i < LANDMARK.ENTER_TICKS + 5; i++) advance(b, EMPTY_INPUT);
    b.lm!.st = 'sit';
    b.lm!.cue = 2;
    cases.push(b);
    const c = bossStage('3-B', 2);
    for (let i = 0; i < LANDMARK.ENTER_TICKS + 5; i++) advance(c, EMPTY_INPUT);
    c.stack!.floors.length = 6;
    c.groundRocks = 3;
    c.lm!.flying = true;
    cases.push(c);
    for (const s of cases) {
      const before = JSON.stringify(s);
      const r = recorder();
      for (let i = 0; i < 3; i++) { drawLandmarkBack(r.ctx, s, 610, 0.4); drawLandmarkFront(r.ctx, s, 610); hastyShakeX(s); }
      expect(JSON.stringify(s)).toBe(before);
    }
  });
});
