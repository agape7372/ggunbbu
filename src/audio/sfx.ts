// 건뿌 SFX/BGM 레시피 — 신스 프리셋(osc+gain 엔벨로프)과 4마디(64스텝) BGM 패턴 데이터.
// 사이드이펙트 없음: 노이즈 버퍼도 모듈 내부에서 lazy 생성.

export type SfxName =
  | 'hit' | 'hitStrong' | 'whiff' | 'floorCollapse' | 'destroy' | 'gorogoro' | 'butterPop'
  | 'guardGround' | 'guardAir' | 'guardBreak' | 'gaugeWarn' | 'comboDrop'
  | 'jump' | 'land' | 'gaugeFull' | 'special'
  | 'pinned' | 'lifeLost' | 'boltCue' | 'boltStrike' | 'cancel'
  | 'rockWhistle' | 'rockLand' | 'bossTele' | 'bossPbTele'
  | 'zap' | 'zap2' | 'zap3'
  | 'bossHit' | 'bossRoar' | 'bossDefeat' | 'uiBlip' | 'uiDeny' | 'perfect'
  | 'hitHammer' | 'hitBar' | 'hitGrind' | 'supply' | 'hatBreak'
  | 'hitLow' | 'hitTick' | 'uiOk' | 'uiBack' | 'coin' | 'stamp' | 'milestone' | 'checkpoint' | 'runEnd';

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

function playZap(
  ctx: AudioContext,
  dest: AudioNode,
  t: number,
  rate: number,
  freq: number,
  lfoHz: number,
  lfoDepth: number,
  dur: number,
  peak: number,
): void {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(freq * rate, t);
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.type = 'square';
  lfo.frequency.setValueAtTime(lfoHz, t);
  lfoGain.gain.setValueAtTime(lfoDepth * rate, t);
  lfo.connect(lfoGain);
  lfoGain.connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  lfo.start(t);
  o.stop(t + dur + 0.02);
  lfo.stop(t + dur + 0.02);
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

  // 망치 — hitStrong보다 저음·긴 '쿵'
  hitHammer: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sine', 110, 0.18, 0.3, rate, { freqEnd: 45, attack: 0.002 });
    playOsc(ctx, dest, t, 'square', 130, 0.07, 0.18, rate, { freqEnd: 70, attack: 0.002 });
    playNoise(ctx, dest, t, 0.06, 0.12, { filterType: 'lowpass', freqStart: 700, freqEnd: 200 });
  },

  // 쇠막대 — 짧고 높은 금속성 '깡'
  hitBar: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'triangle', 1500, 0.1, 0.35, rate, { freqEnd: 1100, attack: 0.001 });
    playOsc(ctx, dest, t, 'square', 2300, 0.05, 0.12, rate, { freqEnd: 1800, attack: 0.001 });
  },

  // 그라인더 — 밴드패스 노이즈 버즈 '지익'
  hitGrind: (ctx, dest, t, rate) => {
    playNoise(ctx, dest, t, 0.09, 0.7, { filterType: 'bandpass', freqStart: 3500, freqEnd: 2200 });
    playOsc(ctx, dest, t, 'sawtooth', 240, 0.08, 0.3, rate, { freqEnd: 200, attack: 0.002 });
  },

  // 보급 상자 — '통' + 두 음 상승 차임
  supply: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sine', 160, 0.08, 0.4, rate, { freqEnd: 90, attack: 0.002 });
    playOsc(ctx, dest, t + 0.09, 'sine', 659.25, 0.1, 0.28, rate, { attack: 0.004 });
    playOsc(ctx, dest, t + 0.16, 'sine', 987.77, 0.09, 0.28, rate, { attack: 0.004 });
  },

  // 안전모가 대신 맞음 — 금속 '깡!' + 깨짐 노이즈
  hatBreak: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'triangle', 1200, 0.14, 0.4, rate, { freqEnd: 800, attack: 0.001 });
    playOsc(ctx, dest, t, 'square', 1800, 0.06, 0.15, rate, { freqEnd: 1300, attack: 0.001 });
    playNoise(ctx, dest, t + 0.03, 0.12, 0.25, { filterType: 'highpass', freqStart: 2500 });
  },

  // 헛스윙 — 타격보다 얇고 짧게 (slash 이벤트)
  whiff: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'square', 520, 0.045, 0.16, rate, { freqEnd: 240, attack: 0.001 });
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

  comboDrop: (ctx, dest, t, rate) => {
    [392, 311.13, 246.94].forEach((f, i) => {
      playOsc(ctx, dest, t + i * 0.05, 'triangle', f, 0.1, 0.18, rate, { attack: 0.004 });
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
    playZap(ctx, dest, t, rate, 500, 40, 200, 0.18, 0.35);
  },

  // 대포 조준/발사 — 더 낮고 긴 zap
  zap2: (ctx, dest, t, rate) => {
    playZap(ctx, dest, t, rate, 220, 18, 140, 0.28, 0.4);
    playOsc(ctx, dest, t, 'sawtooth', 90, 0.22, 0.22, rate, { freqEnd: 160, attack: 0.02 });
  },

  // 지면 스파크 — 짧은 노이즈 크랙
  zap3: (ctx, dest, t, rate) => {
    playNoise(ctx, dest, t, 0.07, 0.4, { filterType: 'highpass', freqStart: 2500 });
    playOsc(ctx, dest, t, 'square', 2400, 0.04, 0.18, rate, { freqEnd: 900, attack: 0.001 });
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

  // 타격 변형 — hit(중음)과 번갈아 돌려 10회/초 반복 피로를 던다. 저음 비중 / 노이즈 비중.
  hitLow: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sine', 100, 0.07, 0.3, rate, { freqEnd: 60, attack: 0.002 });
    playOsc(ctx, dest, t, 'square', 170, 0.05, 0.16, rate, { freqEnd: 110, attack: 0.002 });
  },

  hitTick: (ctx, dest, t, rate) => {
    playNoise(ctx, dest, t, 0.035, 0.3, { filterType: 'bandpass', freqStart: 2500 });
    playOsc(ctx, dest, t, 'square', 260, 0.045, 0.3, rate, { freqEnd: 170, attack: 0.001 });
  },

  // 확정 — 낮은 쿵 + 짧은 틱
  uiOk: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sine', 140, 0.08, 0.4, rate, { freqEnd: 70, attack: 0.002 });
    playOsc(ctx, dest, t + 0.02, 'square', 1500, 0.025, 0.12, rate, { attack: 0.001 });
  },

  // 뒤로 — 하강 두 음
  uiBack: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sine', 900, 0.045, 0.3, rate, { attack: 0.002 });
    playOsc(ctx, dest, t + 0.05, 'sine', 600, 0.06, 0.3, rate, { attack: 0.002 });
  },

  // 구매·보상 — 상승 두 음 + 짤랑
  coin: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'square', 987.77, 0.06, 0.2, rate, { attack: 0.002 });
    playOsc(ctx, dest, t + 0.06, 'square', 1318.5, 0.16, 0.2, rate, { attack: 0.002 });
    playOsc(ctx, dest, t + 0.06, 'sine', 2637, 0.1, 0.1, rate, { attack: 0.002 });
    playNoise(ctx, dest, t + 0.06, 0.1, 0.1, { filterType: 'highpass', freqStart: 6000 });
  },

  // 도장 — 쿵 + 틱 (확정·장착·장 해금)
  stamp: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sine', 130, 0.14, 0.5, rate, { freqEnd: 55, attack: 0.002 });
    playNoise(ctx, dest, t, 0.05, 0.25, { filterType: 'lowpass', freqStart: 1800, freqEnd: 400 });
    playOsc(ctx, dest, t + 0.035, 'square', 1900, 0.02, 0.12, rate, { attack: 0.001 });
  },

  // 콤보 이정표 — 쿵 + 4음 상승 + 반짝
  milestone: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sine', 110, 0.14, 0.45, rate, { freqEnd: 55, attack: 0.002 });
    [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => {
      const d = t + i * 0.055;
      playOsc(ctx, dest, d, 'triangle', f, 0.2, 0.3, rate, { attack: 0.004 });
      playOsc(ctx, dest, d + 0.01, 'sine', f * 2, 0.12, 0.1, rate, { attack: 0.002 });
    });
    playNoise(ctx, dest, t + 0.17, 0.18, 0.12, { filterType: 'highpass', freqStart: 7000 });
  },

  // 2막 구역 도달 — 맑은 두 음 차임
  checkpoint: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sine', 880, 0.16, 0.3, rate, { attack: 0.004 });
    playOsc(ctx, dest, t + 0.09, 'sine', 1318.5, 0.24, 0.3, rate, { attack: 0.004 });
    playOsc(ctx, dest, t + 0.09, 'sine', 1760, 0.14, 0.1, rate, { attack: 0.002 });
  },

  // 판 종료 — 가라앉는 두 음 + 낮은 쿵 (목숨 소리 뒤에 얹는다)
  runEnd: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'triangle', 261.63, 0.2, 0.3, rate, { attack: 0.005 });
    playOsc(ctx, dest, t + 0.2, 'triangle', 196, 0.4, 0.3, rate, { attack: 0.005 });
    playOsc(ctx, dest, t + 0.2, 'sine', 65, 0.3, 0.4, rate, { freqEnd: 40, attack: 0.004 });
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
// 4마디(64스텝) = A · A′ · B · A″. 마디마다 화성 하나(뿌리음이 마디 첫 베이스), 곡마다 서로 다른 화성 2~4개.
// 신스는 그대로(square 멜로디 + triangle 베이스 + 킥/햇) — 두께만 audio.ts의 이중 발음이 더한다.

export interface BgmStep { mel: number[] | null; bass: number | null; drum: 0 | 1 | 2 }

export interface BgmPattern {
  bpm: number;
  /** 64스텝 = 4마디 × 16스텝. 각 스텝: 멜로디 Hz 배열(동시발음) · 베이스 Hz · 퍼커션(1=킥, 2=햇). */
  steps: BgmStep[];
  /** 마디별 화성 이름('Am' · 'Bb' · 'F#m') — 콤보 아르페지오 층이 쓴다. */
  chords: string[];
}

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'C#5' · 'Bb3' → Hz (평균율, A4=440) */
export function noteHz(name: string): number {
  const m = /^([A-G])([#b]?)(\d)$/.exec(name);
  if (!m) throw new Error(`음이름 오류: ${name}`);
  const midi = (Number(m[3]) + 1) * 12 + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function parseChord(chord: string): { pc: number; minor: boolean } {
  const m = /^([A-G])([#b]?)(m?)$/.exec(chord);
  if (!m) throw new Error(`화성 이름 오류: ${chord}`);
  return { pc: (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12, minor: m[3] === 'm' };
}

/** 화성 뿌리음의 음높이 클래스(C=0) */
export function chordRootPc(chord: string): number {
  return parseChord(chord).pc;
}

/** 화성의 아르페지오 음 4개(Hz) — 4옥타브 안에서 뿌리·3도·5도·옥타브 */
export function chordArp(chord: string): number[] {
  const { pc, minor } = parseChord(chord);
  const root = 261.6256 * Math.pow(2, pc / 12);
  return [0, minor ? 3 : 4, 7, 12].map((semi) => root * Math.pow(2, semi / 12));
}

/** 마디 하나: 멜로디 · 베이스(16토큰, '.'=쉼) · 퍼커션(16글자: k=킥 h=햇 .=없음) */
type Bar = readonly [mel: string, bass: string, drum: string];

function track(bpm: number, chords: string[], bars: Bar[]): BgmPattern {
  const steps: BgmStep[] = [];
  for (const [mel, bass, drum] of bars) {
    const m = mel.split(' ');
    const b = bass.split(' ');
    if (m.length !== 16 || b.length !== 16 || drum.length !== 16) throw new Error(`마디 길이 오류: ${mel}`);
    for (let i = 0; i < 16; i++) {
      steps.push({
        mel: m[i] === '.' ? null : [noteHz(m[i])],
        bass: b[i] === '.' ? null : noteHz(b[i]),
        drum: drum[i] === 'k' ? 1 : drum[i] === 'h' ? 2 : 0,
      });
    }
  }
  return { bpm, chords, steps };
}

export const BGM_TRACKS: Record<BgmTrack, BgmPattern> = {
  // 100BPM — 밝은 뿅뿅 (타이틀, 통통 튀는 장조 펜타토닉) · C – Am – F – G
  title: track(100, ['C', 'Am', 'F', 'G'], [
    ['C5 . E5 . G5 . E5 D5 C5 . D5 . E5 G5 A5 .', 'C3 . . . G3 . . . C3 . . . G3 . . .', 'k.h.k.h.k.h.k.h.'],
    ['A4 . C5 . E5 . C5 B4 A4 . B4 . C5 E5 G5 .', 'A2 . . . E3 . . . A2 . . . E3 . . .', 'k.h.k.h.k.h.k.h.'],
    ['F5 . A5 . G5 . F5 E5 F5 . A5 . C6 . A5 .', 'F2 . . . C3 . . . F2 . . . C3 . . .', 'k.h.k.h.k.h.k.h.'],
    ['G5 . D5 . B4 . D5 G5 A5 . G5 . E5 . D5 .', 'G2 . . . D3 . . . G2 . . . D3 . . .', 'k.h.k.h.k.hhk.hh'],
  ]),

  // 128BPM — 경쾌 단조 (1막, 달리는 8분음 단조 라인) · Am – F – C – G
  act1: track(128, ['Am', 'F', 'C', 'G'], [
    ['A4 . C5 E5 . D5 F5 E5 A4 . C5 G5 . F5 E5 C5', 'A3 . . . D3 . . . A3 . . . E3 . . .', 'k.h.k.h.k.h.k.h.'],
    ['F4 . A4 C5 . A4 C5 F5 E5 . C5 A4 . G4 A4 C5', 'F3 . . . C3 . . . F3 . . . C3 . . .', 'k.h.k.h.k.h.k.h.'],
    ['E5 . G5 E5 . C5 E5 G5 A5 . G5 E5 . D5 C5 E5', 'C3 . . . G3 . . . C3 . . . E3 . . .', 'k.h.k.h.k.h.k.h.'],
    ['D5 . B4 D5 . G5 F5 D5 E5 . D5 B4 . C5 B4 E5', 'G3 . . . D3 . . . G3 . . . E3 . . .', 'k.h.k.h.k.hhk.hh'],
  ]),

  // 96BPM — 저음 긴장 (2막, 드문드문 저역 배회 + 페달톤) · Dm – Eb – Gm – Am
  act2a: track(96, ['Dm', 'Eb', 'Gm', 'Am'], [
    ['D3 . C3 . Eb3 . C3 . D3 . F3 . Eb3 . D3 .', 'D2 . . . . . . . D2 . . . . . . .', 'k.......k...h...'],
    ['Eb3 . D3 . G3 . D3 . Eb3 . G3 . F3 . Eb3 .', 'Eb2 . . . . . . . Eb2 . . . . . . .', 'k.......k...h...'],
    ['G3 . F3 . Bb3 . F3 . G3 . Bb3 . A3 . G3 .', 'G2 . . . . . . . G2 . . . . . . .', 'k.......k...h...'],
    ['A3 . G3 . C4 . A3 . E3 . G3 . F3 . E3 .', 'A2 . . . . . . . E2 . . . . . . .', 'k.......k.h.k.h.'],
  ]),

  // 136BPM — 밝은 징글 (버터바 타임, 쉼표 없는 통통 튀는 아르페지오) · C – Am – F – G
  butter: track(136, ['C', 'Am', 'F', 'G'], [
    ['C5 E5 G5 E5 D5 G5 A5 G5 C5 E5 G5 C6 A5 G5 E5 C5', 'C4 . . . G3 . . . C4 . . . G3 . . .', 'kh.h.h.hkh.h.h.h'],
    ['A4 C5 E5 C5 B4 E5 G5 E5 A4 C5 E5 A5 G5 E5 C5 A4', 'A3 . . . E3 . . . A3 . . . E3 . . .', 'kh.h.h.hkh.h.h.h'],
    ['F5 A5 C6 A5 G5 E5 G5 C6 A5 F5 A5 C6 A5 G5 F5 E5', 'F3 . . . C4 . . . F3 . . . C4 . . .', 'kh.h.h.hkh.h.h.h'],
    ['D5 G5 B5 G5 F5 D5 B4 D5 G5 D5 B4 D5 G5 F5 E5 D5', 'G3 . . . D3 . . . G3 . . . D3 . . .', 'kh.h.h.hkh.h.hkh'],
  ]),

  // 120BPM (판정 클록 — 정확히 120) — 스타카토, 매 스텝 햇으로 정밀 펄스 · Em – C – D – Em
  bolt: track(120, ['Em', 'C', 'D', 'Em'], [
    ['E4 . G4 . A4 . G4 . E4 . B4 . A4 . G4 .', 'E3 . . . . . . . E3 . . . . . . .', 'khhhhhhhkhhhhhhh'],
    ['G4 . C5 . E5 . C5 . G4 . E5 . D5 . C5 .', 'C3 . . . . . . . C3 . . . . . . .', 'khhhhhhhkhhhhhhh'],
    ['A4 . D5 . F#5 . D5 . A4 . F#5 . E5 . D5 .', 'D3 . . . . . . . D3 . . . . . . .', 'khhhhhhhkhhhhhhh'],
    ['G4 . B4 . E5 . B4 . A4 . G4 . F#4 . G4 .', 'E3 . . . . . . . B2 . . . . . . .', 'khhhhhhhkhhhhhhh'],
  ]),

  // 140BPM — 아르페지오 (보스, Dm → Bb 아르페지오 교차로 긴장 고조) · Dm – Bb – Gm – A
  boss: track(140, ['Dm', 'Bb', 'Gm', 'A'], [
    ['D4 F4 A4 D5 A4 F4 D4 F4 Bb3 D4 F4 Bb4 F4 D4 Bb3 D4', 'D2 . . . . . . . Bb2 . . . . . . .', 'k.h.k.h.k.h.k.h.'],
    ['Bb3 D4 F4 Bb4 F4 D4 Bb3 D4 Bb3 D4 F4 D5 Bb4 F4 D4 Bb3', 'Bb2 . . . . . . . F2 . . . . . . .', 'k.h.k.h.k.h.k.h.'],
    ['G3 Bb3 D4 G4 D4 Bb3 G3 Bb3 G3 Bb3 D4 Bb4 G4 D4 Bb3 D4', 'G2 . . . . . . . D3 . . . . . . .', 'k.h.k.h.k.h.k.h.'],
    ['A3 C#4 E4 A4 E4 C#4 A3 C#4 A3 C#4 E4 G4 E4 C#4 A3 C#4', 'A2 . . . . . . . E3 . . . . . . .', 'k.h.k.h.k.hhk.hh'],
  ]),

  // 104BPM — 트로트 풍 (엔딩, 반음 상위 이웃음으로 '꺾기' 흉내) · G – Cm – D – G
  ending: track(104, ['G', 'Cm', 'D', 'G'], [
    ['G4 C5 B4 Eb5 D5 Db5 C5 C5 B4 Bb4 A4 Ab4 G4 Eb5 D5 .', 'G3 . . . D3 . . . G3 . . . D3 . . .', 'k.h.h.h.k.h.h.h.'],
    ['C5 Eb5 G5 F5 Eb5 D5 Eb5 C5 B4 C5 D5 Eb5 D5 C5 B4 .', 'C3 . . . G3 . . . C3 . . . G3 . . .', 'k.h.h.h.k.h.h.h.'],
    ['A4 D5 F#5 D5 A4 D5 Eb5 D5 C5 B4 A4 Ab4 A4 B4 C5 D5', 'D3 . . . A3 . . . D3 . . . A3 . . .', 'k.h.h.h.k.h.h.h.'],
    ['G4 B4 D5 G5 F#5 G5 D5 B4 G4 Ab4 A4 Bb4 B4 C5 D5 .', 'G3 . . . D3 . . . G3 . . . D3 . . .', 'k.h.h.h.k.h.h.hh'],
  ]),
};
