// 건뿌 SFX/BGM 레시피 — 신스 프리셋(osc+gain 엔벨로프)과 16스텝 BGM 패턴 데이터.
// 사이드이펙트 없음: 노이즈 버퍼도 모듈 내부에서 lazy 생성.

export type SfxName =
  | 'hit' | 'hitStrong' | 'floorCollapse' | 'destroy' | 'gorogoro' | 'butterPop'
  | 'guardGround' | 'guardAir' | 'guardBreak' | 'gaugeWarn'
  | 'jump' | 'land' | 'gaugeFull' | 'special'
  | 'pinned' | 'lifeLost' | 'boltCue' | 'boltStrike' | 'cancel'
  | 'rockWhistle' | 'rockLand' | 'bossTele' | 'bossPbTele' | 'zap'
  | 'bossHit' | 'bossRoar' | 'bossDefeat' | 'uiBlip' | 'uiDeny' | 'perfect';

export type BgmTrack = 'title' | 'act1' | 'act2a' | 'butter' | 'bolt' | 'boss' | 'ending';

// ─── 신스 헬퍼 (linearRamp 어택 → exponentialRamp 릴리즈) ──────────

interface OscOpts {
  freqEnd?: number;
  attack?: number;
}

function playOsc(
  ctx: AudioContext,
  dest: AudioNode,
  t: number,
  type: OscillatorType,
  freq: number,
  dur: number,
  peak: number,
  rate: number,
  opts?: OscOpts,
): void {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(freq * rate, 1), t);
  if (opts?.freqEnd !== undefined) {
    o.frequency.exponentialRampToValueAtTime(Math.max(opts.freqEnd * rate, 1), t + dur);
  }
  const attack = opts?.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

// 1s 화이트노이즈 버퍼 — 모듈 내 lazy 싱글턴(재사용)
let noiseBuffer: AudioBuffer | null = null;
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    const len = Math.floor(ctx.sampleRate * 1);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

interface NoiseOpts {
  filterType?: BiquadFilterType;
  freqStart?: number;
  freqEnd?: number;
}

function playNoise(
  ctx: AudioContext,
  dest: AudioNode,
  t: number,
  dur: number,
  peak: number,
  opts?: NoiseOpts,
): void {
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  const g = ctx.createGain();
  let node: AudioNode = src;
  if (opts?.filterType) {
    const filt = ctx.createBiquadFilter();
    filt.type = opts.filterType;
    filt.frequency.setValueAtTime(Math.max(opts.freqStart ?? 1000, 10), t);
    if (opts.freqEnd !== undefined) {
      filt.frequency.exponentialRampToValueAtTime(Math.max(opts.freqEnd, 10), t + dur);
    }
    src.connect(filt);
    node = filt;
  }
  node.connect(g);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(dest);
  src.start(t);
  src.stop(t + dur + 0.02);
}

// ─── SFX 프리셋 테이블 ──────────────────────────────────────────

type SfxPreset = (ctx: AudioContext, dest: AudioNode, t: number, rate: number) => void;

export const SFX_PRESETS: Record<SfxName, SfxPreset> = {
  hit: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'square', 220, 0.04, 0.35, rate, { freqEnd: 140, attack: 0.002 });
    playOsc(ctx, dest, t + 0.04, 'square', 140, 0.048, 0.12, rate, { freqEnd: 90, attack: 0.001 });
  },

  hitStrong: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'square', 160, 0.06, 0.4, rate, { freqEnd: 90, attack: 0.002 });
    playNoise(ctx, dest, t, 0.05, 0.25, { filterType: 'highpass', freqStart: 800 });
  },

  floorCollapse: (ctx, dest, t, rate) => {
    playNoise(ctx, dest, t, 0.15, 0.32, { filterType: 'lowpass', freqStart: 4000, freqEnd: 500 });
    playOsc(ctx, dest, t, 'sawtooth', 80, 0.25, 0.4, rate, { freqEnd: 40 });
  },

  destroy: (ctx, dest, t, rate) => {
    const chain = [
      { freq: 260, freqEnd: 120, peak: 0.32, filterStart: 3200, filterEnd: 500 },
      { freq: 220, freqEnd: 100, peak: 0.27, filterStart: 2600, filterEnd: 400 },
      { freq: 180, freqEnd: 80, peak: 0.22, filterStart: 2000, filterEnd: 300 },
    ];
    chain.forEach((c, i) => {
      const d = t + i * 0.09;
      playNoise(ctx, dest, d, 0.12, c.peak, { filterType: 'lowpass', freqStart: c.filterStart, freqEnd: c.filterEnd });
      playOsc(ctx, dest, d, 'sawtooth', c.freq, 0.1, c.peak * 0.9, rate, { freqEnd: c.freqEnd });
    });
    playOsc(ctx, dest, t, 'sine', 50, 0.2, 0.5, rate, { freqEnd: 30 });
  },

  gorogoro: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sine', 42, 1.9, 0.18, rate, { freqEnd: 22, attack: 0.04 });
    for (let i = 0; i < 9; i++) {
      const d = t + i * 0.2;
      const peak = 0.12 * (1 - i / 9);
      playNoise(ctx, dest, d, 0.28, peak, { filterType: 'lowpass', freqStart: 900 - i * 70, freqEnd: 140 });
    }
  },

  butterPop: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sine', 500, 0.12, 0.4, rate, { freqEnd: 300, attack: 0.01 });
  },

  guardGround: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'triangle', 300, 0.08, 0.55, rate, { freqEnd: 600, attack: 0.005 });
  },

  guardAir: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'triangle', 700, 0.05, 0.4, rate, { freqEnd: 900, attack: 0.003 });
  },

  guardBreak: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sawtooth', 400, 0.2, 0.45, rate, { freqEnd: 100 });
    playNoise(ctx, dest, t, 0.15, 0.25, { filterType: 'highpass', freqStart: 600 });
  },

  gaugeWarn: (ctx, dest, t, rate) => {
    [0, 0.15].forEach((d) => {
      playOsc(ctx, dest, t + d, 'square', 300, 0.08, 0.3, rate, { attack: 0.003 });
    });
  },

  jump: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sine', 300, 0.18, 0.35, rate, { freqEnd: 700, attack: 0.01 });
  },

  land: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sine', 150, 0.1, 0.45, rate, { freqEnd: 60, attack: 0.002 });
    playNoise(ctx, dest, t, 0.05, 0.15, { filterType: 'lowpass', freqStart: 500 });
  },

  gaugeFull: (ctx, dest, t, rate) => {
    [523.25, 659.25, 987.77].forEach((f, i) => {
      playOsc(ctx, dest, t + i * 0.07, 'sine', f, 0.15, 0.3, rate, { attack: 0.005 });
    });
  },

  special: (ctx, dest, t, rate) => {
    const d = t + 0.03;
    playNoise(ctx, dest, d, 0.4, 0.45, { filterType: 'lowpass', freqStart: 5000, freqEnd: 200 });
    playOsc(ctx, dest, d, 'sawtooth', 90, 0.4, 0.4, rate, { freqEnd: 40 });
  },

  pinned: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sine', 40, 0.15, 0.5, rate, { freqEnd: 25 });
    playNoise(ctx, dest, t, 0.08, 0.3, { filterType: 'highpass', freqStart: 1200 });
  },

  lifeLost: (ctx, dest, t, rate) => {
    [440, 349.23, 261.63].forEach((f, i) => {
      playOsc(ctx, dest, t + i * 0.14, 'sine', f, 0.25, 0.35, rate, { attack: 0.005 });
    });
  },

  // 타 SFX와 주파수대 격리(880/1760Hz) — 게임플레이 판정 큐
  boltCue: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'square', 880, 0.06, 0.4, rate, { attack: 0.002 });
    playOsc(ctx, dest, t + 0.07, 'square', 1760, 0.06, 0.4, rate, { attack: 0.002 });
  },

  boltStrike: (ctx, dest, t, rate) => {
    playNoise(ctx, dest, t, 0.1, 0.5, { filterType: 'highpass', freqStart: 2000 });
    playOsc(ctx, dest, t, 'square', 3000, 0.05, 0.2, rate, { freqEnd: 1500 });
  },

  cancel: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sawtooth', 1200, 0.06, 0.35, rate, { freqEnd: 200, attack: 0.001 });
  },

  rockWhistle: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sine', 1800, 0.35, 0.4, rate, { freqEnd: 500, attack: 0.02 });
  },

  rockLand: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sine', 120, 0.12, 0.5, rate, { freqEnd: 50 });
    playNoise(ctx, dest, t, 0.08, 0.2, { filterType: 'lowpass', freqStart: 400 });
  },

  bossTele: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sawtooth', 80, 0.4, 0.4, rate, { freqEnd: 140, attack: 0.03 });
  },

  // 고음 3연 삑 — bossTele와 별도 전용 큐
  bossPbTele: (ctx, dest, t, rate) => {
    for (let i = 0; i < 3; i++) {
      playOsc(ctx, dest, t + i * 0.1, 'square', 1500, 0.06, 0.35, rate, { attack: 0.002 });
    }
  },

  zap: (ctx, dest, t, rate) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(500 * rate, t);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'square';
    lfo.frequency.setValueAtTime(40, t);
    lfoGain.gain.setValueAtTime(200 * rate, t);
    lfo.connect(lfoGain);
    lfoGain.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.2);
    lfo.stop(t + 0.2);
  },

  bossHit: (ctx, dest, t, rate) => {
    [
      [900, 0.35],
      [1300, 0.2],
      [2100, 0.12],
    ].forEach(([f, peak]) => {
      playOsc(ctx, dest, t, 'sine', f, 0.12, peak, rate, { freqEnd: f * 0.7, attack: 0.001 });
    });
  },

  bossRoar: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sawtooth', 90, 0.6, 0.5, rate, { freqEnd: 50, attack: 0.05 });
    playOsc(ctx, dest, t, 'sawtooth', 93, 0.55, 0.3, rate, { freqEnd: 48, attack: 0.05 });
  },

  bossDefeat: (ctx, dest, t, rate) => {
    playNoise(ctx, dest, t, 0.5, 0.5, { filterType: 'lowpass', freqStart: 4000, freqEnd: 100 });
    playOsc(ctx, dest, t, 'sawtooth', 150, 0.5, 0.45, rate, { freqEnd: 30 });
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      playOsc(ctx, dest, t + 0.35 + i * 0.09, 'sine', f, 0.35, 0.3, rate, { attack: 0.01 });
    });
  },

  uiBlip: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sine', 1000, 0.05, 0.25, rate, { freqEnd: 1400, attack: 0.002 });
  },

  uiDeny: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'square', 300, 0.12, 0.3, rate, { freqEnd: 150, attack: 0.002 });
  },

  perfect: (ctx, dest, t, rate) => {
    [784, 988, 1175, 1568].forEach((f, i) => {
      const d = t + i * 0.06;
      playOsc(ctx, dest, d, 'sine', f, 0.25, 0.35, rate, { attack: 0.005 });
      playOsc(ctx, dest, d + 0.02, 'sine', f * 2, 0.15, 0.1, rate, { attack: 0.002 });
    });
  },
};

// ─── BGM 패턴 데이터 (전부 오리지널 창작 루프) ──────────────────

export interface BgmPattern {
  bpm: number;
  /** 16스텝 × 트랙 — 각 스텝: 주파수 Hz 배열(동시발음) 또는 null. [멜로디, 베이스, 노이즈퍼커션(1=킥,2=햇)] */
  steps: Array<{ mel: number[] | null; bass: number | null; drum: 0 | 1 | 2 }>;
  loop: boolean;
}

// 평균율 음이름 표(A4=440) — 각 트랙 멜로디/베이스에서 재사용
const N = {
  D2: 73.42, Bb2: 116.54,
  C3: 130.81, D3: 146.83, Eb3: 155.56, E3: 164.81, F3: 174.61, G3: 196.0, Bb3: 233.08,
  A3: 220.0,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, Ab4: 415.3, A4: 440.0, Bb4: 466.16, B4: 493.88,
  C5: 523.25, Db5: 554.37, D5: 587.33, Eb5: 622.25, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0,
  C6: 1046.5,
} as const;

type Step = { mel: number[] | null; bass: number | null; drum: 0 | 1 | 2 };
function s(mel: number[] | null, bass: number | null, drum: 0 | 1 | 2): Step {
  return { mel, bass, drum };
}

export const BGM_TRACKS: Record<BgmTrack, BgmPattern> = {
  // 100BPM — 밝은 뿅뿅 (타이틀, 통통 튀는 장조 펜타토닉)
  title: {
    bpm: 100,
    loop: true,
    steps: [
      s([N.C5], N.C3, 1), s(null, null, 0), s([N.E5], null, 2), s(null, null, 0),
      s([N.G5], N.G3, 1), s(null, null, 0), s([N.E5], null, 2), s([N.D5], null, 0),
      s([N.C5], N.C3, 1), s(null, null, 0), s([N.D5], null, 2), s(null, null, 0),
      s([N.E5], N.G3, 1), s([N.G5], null, 0), s([N.A5], null, 2), s(null, null, 0),
    ],
  },

  // 128BPM — 경쾌 단조 (1막, 달리는 8분음 단조 라인)
  act1: {
    bpm: 128,
    loop: true,
    steps: [
      s([N.A4], N.A3, 1), s(null, null, 0), s([N.C5], null, 2), s([N.E5], null, 0),
      s(null, N.D3, 1), s([N.D5], null, 0), s([N.F5], null, 2), s([N.E5], null, 0),
      s([N.A4], N.A3, 1), s(null, null, 0), s([N.C5], null, 2), s([N.G5], null, 0),
      s(null, N.E3, 1), s([N.F5], null, 0), s([N.E5], null, 2), s([N.C5], null, 0),
    ],
  },

  // 96BPM — 저음 긴장 (2막, 드문드문 저역 배회 + 페달톤)
  act2a: {
    bpm: 96,
    loop: true,
    steps: [
      s([N.D3], N.D2, 1), s(null, null, 0), s([N.C3], null, 0), s(null, null, 0),
      s([N.Eb3], null, 0), s(null, null, 0), s([N.C3], null, 0), s(null, null, 0),
      s([N.D3], N.D2, 1), s(null, null, 0), s([N.F3], null, 0), s(null, null, 0),
      s([N.Eb3], null, 2), s(null, null, 0), s([N.D3], null, 0), s(null, null, 0),
    ],
  },

  // 136BPM — 밝은 징글 (버터바 타임, 쉼표 없는 통통 튀는 아르페지오)
  butter: {
    bpm: 136,
    loop: true,
    steps: [
      s([N.C5], N.C4, 1), s([N.E5], null, 2), s([N.G5], null, 0), s([N.E5], null, 2),
      s([N.D5], N.G3, 0), s([N.G5], null, 2), s([N.A5], null, 0), s([N.G5], null, 2),
      s([N.C5], N.C4, 1), s([N.E5], null, 2), s([N.G5], null, 0), s([N.C6], null, 2),
      s([N.A5], N.G3, 0), s([N.G5], null, 2), s([N.E5], null, 0), s([N.C5], null, 2),
    ],
  },

  // 120BPM (판정 클록 — 정확히 120) — 스타카토, 매 스텝 햇으로 정밀 펄스
  bolt: {
    bpm: 120,
    loop: true,
    steps: [
      s([N.E4], N.E3, 1), s(null, null, 2), s([N.G4], null, 2), s(null, null, 2),
      s([N.A4], null, 2), s(null, null, 2), s([N.G4], null, 2), s(null, null, 2),
      s([N.E4], N.E3, 1), s(null, null, 2), s([N.B4], null, 2), s(null, null, 2),
      s([N.A4], null, 2), s(null, null, 2), s([N.G4], null, 2), s(null, null, 2),
    ],
  },

  // 140BPM — 아르페지오 (보스, Dm → Bb 아르페지오 교차로 긴장 고조)
  boss: {
    bpm: 140,
    loop: true,
    steps: [
      s([N.D4], N.D2, 1), s([N.F4], null, 0), s([N.A4], null, 2), s([N.D5], null, 0),
      s([N.A4], null, 1), s([N.F4], null, 0), s([N.D4], null, 2), s([N.F4], null, 0),
      s([N.Bb3], N.Bb2, 1), s([N.D4], null, 0), s([N.F4], null, 2), s([N.Bb4], null, 0),
      s([N.F4], null, 1), s([N.D4], null, 0), s([N.Bb3], null, 2), s([N.D4], null, 0),
    ],
  },

  // 104BPM — 트로트 풍 (엔딩, 반음 상위 이웃음으로 '꺾기' 흉내)
  ending: {
    bpm: 104,
    loop: true,
    steps: [
      s([N.G4], N.G3, 1), s([N.C5], null, 0), s([N.B4], null, 2), s([N.Eb5], null, 0),
      s([N.D5], N.D3, 2), s([N.Db5], null, 0), s([N.C5], null, 2), s([N.C5], null, 0),
      s([N.B4], N.G3, 1), s([N.Bb4], null, 0), s([N.A4], null, 2), s([N.Ab4], null, 0),
      s([N.G4], N.D3, 2), s([N.Eb5], null, 0), s([N.D5], null, 2), s(null, null, 0),
    ],
  },
};
