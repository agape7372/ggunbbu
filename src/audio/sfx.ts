// 건뿌 SFX/BGM 레시피 — 신스 프리셋(osc+gain 엔벨로프)과 4마디(64스텝) BGM 패턴 데이터.
// 사이드이펙트 없음: 노이즈 버퍼도 모듈 내부에서 lazy 생성.

export type SfxName =
  | 'hitFlame' | 'hitFrost' | 'hitOnyx' | 'hitGold'
  | 'hit' | 'hitStrong' | 'whiff' | 'floorCollapse' | 'destroy' | 'gorogoro' | 'butterPop'
  | 'guardGround' | 'guardAir' | 'guardBreak' | 'gaugeWarn' | 'comboDrop'
  | 'jump' | 'land' | 'gaugeFull' | 'special'
  | 'pinned' | 'lifeLost' | 'boltCue' | 'boltStrike' | 'cancel'
  | 'rockWhistle' | 'rockLand' | 'bossTele' | 'bossPbTele'
  | 'zap' | 'zap2' | 'zap3'
  | 'bossHit' | 'bossRoar' | 'bossDefeat' | 'uiBlip' | 'uiDeny' | 'perfect'
  | 'hitHammer' | 'hitBar' | 'hitGrind' | 'supply' | 'hatBreak' | 'hatGet'
  | 'hitLow' | 'hitTick' | 'incoming' | 'specialCharge' | 'uiOk' | 'uiBack' | 'coin' | 'stamp' | 'milestone' | 'checkpoint' | 'runEnd'
  // 명물 보스(작업 지시서) — 똑딱 · 댕 · 깡 · 퉁 · 휘파람 · 풍경 · 끼릭 · 철컥
  | 'clockTick' | 'bellToss' | 'bellBody' | 'bellClang' | 'bellThud' | 'windIn' | 'windOut' | 'chime' | 'craneRatchet' | 'craneClunk'
  // 2판 기믹 예고 — 댕댕(공중 가드 2점) · 쾅(시보) · 맑은 종(13시) · 나무 소리(구층탑) · 탁(줄 끊김)
  | 'bellTwin' | 'bellBoom' | 'bellClear' | 'pagodaCreak' | 'craneSnap';

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
  q?: number;
  attack?: number;
  /** [지점(0..1), 그 지점의 세기 비율] — 꼬리가 긴 소리용 2단 감쇠 */
  knee?: [number, number];
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
  src.loop = true; // 1초보다 긴 꼬리도 같은 버퍼로
  const g = ctx.createGain();
  let node: AudioNode = src;
  if (opts?.filterType) {
    const filt = ctx.createBiquadFilter();
    filt.type = opts.filterType;
    if (opts.q !== undefined) filt.Q.value = opts.q;
    filt.frequency.setValueAtTime(Math.max(opts.freqStart ?? 1000, 10), t);
    if (opts.freqEnd !== undefined) {
      filt.frequency.exponentialRampToValueAtTime(Math.max(opts.freqEnd, 10), t + dur);
    }
    src.connect(filt);
    node = filt;
  }
  node.connect(g);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + (opts?.attack ?? 0.005));
  if (opts?.knee) {
    g.gain.exponentialRampToValueAtTime(Math.max(peak * opts.knee[1], 0.0001), t + dur * opts.knee[0]);
  }
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(dest);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

/** 소리 하나의 총량 손잡이 — 게인 노드 하나를 끼워 재생 때마다 같은 비율로 줄인다 */
function trim(ctx: AudioContext, dest: AudioNode, gain: number): AudioNode {
  const n = ctx.createGain();
  n.gain.value = gain;
  n.connect(dest);
  return n;
}

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
const jit = (x: number, pct = 0.1): number => x * (1 + (Math.random() * 2 - 1) * pct);

interface Grain { at: number; dur: number; peak: number; freq: number; pan?: number }

/**
 * 노이즈 그레인 묶음 — 소스·필터·게인(·패너) 노드만으로 그레인이 몇 개든 울린다.
 * 그레인은 시간순이고, 길이는 다음 그레인 직전에 잘린다. pan이 있으면 그레인마다 좌우를 옮긴다.
 */
function playGrains(
  ctx: AudioContext, dest: AudioNode, t: number, grains: Grain[],
  type: BiquadFilterType = 'bandpass', q = 1.2,
): void {
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  src.loop = true;
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.Q.value = q;
  const g = ctx.createGain();
  src.connect(filt);
  filt.connect(g);
  const pan = grains.some((x) => x.pan) ? ctx.createStereoPanner() : null;
  if (pan) { g.connect(pan); pan.connect(dest); } else g.connect(dest);
  g.gain.setValueAtTime(0.0001, t);
  let end = t;
  grains.forEach((x, i) => {
    const s = t + x.at;
    const next = i + 1 < grains.length ? t + grains[i + 1].at - 0.0005 : Infinity;
    const e = Math.min(s + x.dur, next);
    filt.frequency.setValueAtTime(Math.max(x.freq, 10), s);
    pan?.pan.setValueAtTime(x.pan ?? 0, s);
    g.gain.setValueAtTime(0.0001, s);
    g.gain.linearRampToValueAtTime(x.peak, s + Math.min(0.0008, (e - s) / 2));
    g.gain.exponentialRampToValueAtTime(0.0001, e);
    end = Math.max(end, e);
  });
  src.start(t, Math.random() * 0.5);
  src.stop(end + 0.02);
}

/** 잔해 흩뿌림 — from~to초 사이 n개, 시간·높이·좌우가 매번 다르다 */
function debris(n: number, from: number, to: number, peak: number, fLo: number, fHi: number, spread: number): Grain[] {
  const out: Grain[] = [];
  let prev = from - 0.006;
  const ts = Array.from({ length: n }, () => rnd(from, to)).sort((a, b) => a - b);
  ts.forEach((raw, i) => {
    const at = Math.max(raw, prev + 0.006);
    prev = at;
    out.push({ at, dur: rnd(0.02, 0.05), peak: peak * rnd(0.55, 1) * (1 - 0.45 * (i / n)), freq: rnd(fLo, fHi), pan: rnd(-spread, spread) });
  });
  return out;
}

interface OscSpec { type: OscillatorType; f0: number; f1: number; dur: number; peak: number }

/**
 * 겹층 타격 — ① 트랜지언트(클릭 그레인) ② 몸통(피치 하강 thump) ③ 으스러짐(밴드패스 그레인)
 * ④ 꼬리(로우패스 노이즈). 노드 11개 안팎, 전체 120~200ms.
 */
interface HitSpec {
  click: number; clickPeak: number;
  body: OscSpec; snap?: OscSpec;
  crunch: number[]; cPeak: number;
  tail?: { f0: number; f1: number; dur: number; peak: number };
}

function hitLayers(ctx: AudioContext, out: AudioNode, t: number, rate: number, h: HitSpec): void {
  const dest = trim(ctx, out, 0.6);
  const grains: Grain[] = [{ at: 0, dur: 0.004, peak: h.clickPeak, freq: jit(h.click) * rate }];
  let at = 0.004 + rnd(0, 0.002);
  for (const c of h.crunch) {
    grains.push({ at, dur: 0.03, peak: h.cPeak * rnd(0.8, 1), freq: jit(c) * rate });
    at += rnd(0.007, 0.012);
  }
  playGrains(ctx, dest, t, grains);
  for (const o of [h.body, h.snap]) {
    if (o) playOsc(ctx, dest, t, o.type, o.f0, o.dur, o.peak, rate, { freqEnd: o.f1, attack: 0.001 });
  }
  if (h.tail) {
    playNoise(ctx, dest, t + 0.006, h.tail.dur, h.tail.peak, { filterType: 'lowpass', freqStart: h.tail.f0 * rate, freqEnd: h.tail.f1 });
  }
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

/** dur = 부르는 쪽이 정한 길이(초). 길이가 뜻인 소리(바람탑 휘파람 음 길이)만 읽는다 */
type SfxPreset = (ctx: AudioContext, dest: AudioNode, t: number, rate: number, dur?: number) => void;

/** 청동 종 울림 — 안 맞는 배음(1 · 2 · 2.4 · 3 · 4.2)이 길이마다 다르게 가라앉는다 */
function bellRing(ctx: AudioContext, dest: AudioNode, t: number, rate: number, f: number, dur: number, peak: number): void {
  [[1, 1, 1], [2, 0.5, 0.7], [2.4, 0.32, 0.5], [3, 0.2, 0.35], [4.2, 0.12, 0.2]].forEach(([k, a, d]) => {
    playOsc(ctx, dest, t, 'sine', f * k, dur * d, peak * a, rate, { attack: 0.002 });
  });
}

/** 바람탑 휘파람 한 음 — 사인 + 숨소리. dir +1 들숨(오르는 음) · −1 날숨(내리는 음), dur = 노래 박 길이 */
function whistle(ctx: AudioContext, dest: AudioNode, t: number, rate: number, dur: number, dir: 1 | -1): void {
  const d = Math.min(3.6, Math.max(0.2, dur));
  const f0 = 660 * rate;
  const o = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lg = ctx.createGain();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(f0 * (dir > 0 ? 0.84 : 1.19), t);
  o.frequency.exponentialRampToValueAtTime(f0, t + Math.min(0.12, d * 0.4)); // 음 머리에서 제 음으로 올라붙는다
  lfo.frequency.setValueAtTime(5.5, t);
  lg.gain.setValueAtTime(f0 * 0.012, t);
  lfo.connect(lg);
  lg.connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.28, t + 0.04);
  g.gain.setValueAtTime(0.28, t + d * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  lfo.start(t);
  o.stop(t + d + 0.02);
  lfo.stop(t + d + 0.02);
  playNoise(ctx, dest, t, d, 0.05, { filterType: 'bandpass', freqStart: f0 * 2, freqEnd: f0 * 2, q: 4, attack: 0.04 });
}

export const SFX_PRESETS: Record<SfxName, SfxPreset> = {
  hit: (ctx, dest, t, rate) => {
    hitLayers(ctx, dest, t, rate, {
      click: 3500, clickPeak: 0.4,
      body: { type: 'sine', f0: 200, f1: 90, dur: 0.09, peak: 0.5 },
      snap: { type: 'square', f0: 220, f1: 140, dur: 0.04, peak: 0.14 },
      crunch: [1900, 1300], cPeak: 0.3,
      tail: { f0: 1400, f1: 300, dur: 0.1, peak: 0.1 },
    });
  },

  hitStrong: (ctx, dest, t, rate) => {
    hitLayers(ctx, dest, t, rate, {
      click: 4200, clickPeak: 0.55,
      body: { type: 'sine', f0: 150, f1: 62, dur: 0.12, peak: 0.55 },
      snap: { type: 'sawtooth', f0: 170, f1: 90, dur: 0.07, peak: 0.2 },
      crunch: [2400, 1700, 1100], cPeak: 0.38,
      tail: { f0: 1800, f1: 250, dur: 0.15, peak: 0.16 },
    });
  },

  // 망치 — hitStrong보다 저음·긴 '쿵'
  hitHammer: (ctx, dest, t, rate) => {
    hitLayers(ctx, dest, t, rate, {
      click: 1500, clickPeak: 0.35,
      body: { type: 'sine', f0: 110, f1: 42, dur: 0.2, peak: 0.6 },
      snap: { type: 'square', f0: 130, f1: 70, dur: 0.07, peak: 0.14 },
      crunch: [800, 520], cPeak: 0.32,
      tail: { f0: 800, f1: 150, dur: 0.18, peak: 0.2 },
    });
  },

  // 쇠막대 — 짧고 높은 금속성 '깡'
  hitBar: (ctx, dest, t, rate) => {
    hitLayers(ctx, dest, t, rate, {
      click: 5200, clickPeak: 0.4,
      body: { type: 'triangle', f0: 1500, f1: 1100, dur: 0.1, peak: 0.3 },
      snap: { type: 'square', f0: 2300, f1: 1800, dur: 0.05, peak: 0.1 },
      crunch: [3200], cPeak: 0.2,
    });
    playOsc(ctx, dest, t, 'sine', 180, 0.05, 0.17, rate, { freqEnd: 100, attack: 0.001 });
  },

  // 그라인더 — 밴드패스 노이즈 버즈 '지익'
  hitGrind: (ctx, out, t, rate) => {
    const dest = trim(ctx, out, 0.75);
    playGrains(ctx, dest, t, [
      { at: 0, dur: 0.004, peak: 0.4, freq: jit(3000) },
      { at: 0.005, dur: 0.02, peak: 0.25, freq: jit(2400) },
    ]);
    playNoise(ctx, dest, t + 0.004, 0.09, 0.5, { filterType: 'bandpass', freqStart: 3500, freqEnd: 2200 });
    playOsc(ctx, dest, t, 'sawtooth', 240, 0.08, 0.26, rate, { freqEnd: 200, attack: 0.002 });
    playOsc(ctx, dest, t, 'sine', 120, 0.06, 0.25, rate, { freqEnd: 70, attack: 0.001 });
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

  // 안전모가 머리에 씌워짐 — 플라스틱 '똑' + 금속 '팅' + 두 음 차임. 받기 연출이 머리에 닿는 박자에 늦춰 낸다(consume.ts)
  hatGet: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'square', 900, 0.03, 0.18, rate, { freqEnd: 500, attack: 0.001 });
    playOsc(ctx, dest, t + 0.01, 'triangle', 1568, 0.16, 0.3, rate, { freqEnd: 1480, attack: 0.001 });
    playOsc(ctx, dest, t + 0.08, 'sine', 1046.5, 0.1, 0.24, rate, { attack: 0.004 });
    playOsc(ctx, dest, t + 0.15, 'sine', 1567.98, 0.18, 0.26, rate, { attack: 0.004 });
  },

  // 헛스윙 — 타격보다 얇고 짧게 (slash 이벤트)
  whiff: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'square', 520, 0.045, 0.16, rate, { freqEnd: 240, attack: 0.001 });
  },

  // 콘크리트가 우지끈 — 으스러짐 그레인 + 낮은 울림 + 300ms 잔해 흩뿌림(좌우로 퍼짐)
  floorCollapse: (ctx, out, t, rate) => {
    const dest = trim(ctx, out, 0.85);
    const crunch: Grain[] = [{ at: 0, dur: 0.004, peak: 0.5, freq: jit(3000) * rate }];
    let at = 0.005;
    for (let i = 0; i < 5; i++) {
      crunch.push({ at, dur: rnd(0.02, 0.035), peak: 0.4 * rnd(0.7, 1), freq: jit(2400 - i * 320) * rate });
      at += rnd(0.012, 0.022);
    }
    playGrains(ctx, dest, t, crunch);
    playOsc(ctx, dest, t, 'sine', 95, 0.34, 0.55, rate, { freqEnd: 42, attack: 0.002 });
    playNoise(ctx, dest, t + 0.004, 0.22, 0.26, { filterType: 'lowpass', freqStart: 1100, freqEnd: 180, knee: [0.35, 0.5] });
    playGrains(ctx, dest, t, debris(3 + Math.floor(Math.random() * 4), 0.1, 0.42, 0.2, 1400, 4200, 0.8), 'bandpass', 2);
  },

  // 건물 한 채가 통째로 — 서브 하강 쾅 + 중역 깨짐 + 울림 꼬리 + 잔해(넓게)
  destroy: (ctx, out, t, rate) => {
    const dest = trim(ctx, out, 0.55);
    const crack: Grain[] = [
      { at: 0, dur: 0.005, peak: 0.6, freq: jit(3200) * rate },
      { at: 0.006, dur: 0.07, peak: 0.55, freq: jit(380) * rate },
    ];
    let at = 0.08;
    for (let i = 0; i < 3; i++) {
      crack.push({ at, dur: rnd(0.03, 0.05), peak: 0.38 * rnd(0.7, 1), freq: jit(2300 - i * 600) * rate });
      at += rnd(0.04, 0.06);
    }
    playGrains(ctx, dest, t, crack, 'bandpass', 1.4);
    const f = Math.pow(rate, 0.5); // 서브는 콤보 피치를 반만 따른다
    playOsc(ctx, dest, t, 'sine', 60 * f, 0.9, 0.75, 1, { freqEnd: 35 * f, attack: 0.004 });
    playNoise(ctx, dest, t + 0.004, 1.1, 0.45, { filterType: 'lowpass', freqStart: 2200, freqEnd: 90, knee: [0.22, 0.3], attack: 0.003 });
    playGrains(ctx, dest, t, debris(5 + Math.floor(Math.random() * 3), 0.18, 0.95, 0.24, 900, 3600, 0.9), 'bandpass', 1.6);
  },

  // 굴러 떨어지는 잔해 — destroy 꼬리 뒤(0.3초~)로 듬성듬성 웅웅, 저역은 로우패스 한 줄만
  gorogoro: (ctx, dest, t) => {
    const g: Grain[] = [];
    let at = 0.3;
    for (let i = 0; i < 7; i++) {
      g.push({ at, dur: rnd(0.1, 0.16), peak: 0.4 * (1 - i / 8), freq: rnd(300, 520) - i * 25, pan: rnd(-0.6, 0.6) });
      at += rnd(0.14, 0.24);
    }
    playGrains(ctx, dest, t, g, 'bandpass', 0.9);
    playNoise(ctx, dest, t + 0.3, 1.4, 0.2, { filterType: 'lowpass', freqStart: 320, freqEnd: 80, attack: 0.25 });
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

  // 휘익 → 폭발. 폭발만 울린다(consumeAudio가 히트스톱만큼 늦추고, 휘익은 specialCharge가 먼저 낸다)
  special: (ctx, out, t, rate) => {
    const dest = trim(ctx, out, 0.6);
    playGrains(ctx, dest, t, [
      { at: 0, dur: 0.005, peak: 0.6, freq: jit(3500) * rate },
      { at: 0.006, dur: 0.08, peak: 0.5, freq: jit(500) * rate },
      { at: 0.09, dur: 0.04, peak: 0.3, freq: jit(1800) * rate },
      { at: 0.13, dur: 0.05, peak: 0.25, freq: jit(1100) * rate },
    ], 'bandpass', 1.2);
    playOsc(ctx, dest, t, 'sine', 70, 0.55, 0.65, rate, { freqEnd: 30, attack: 0.003 });
    playNoise(ctx, dest, t + 0.004, 0.7, 0.4, { filterType: 'lowpass', freqStart: 6000, freqEnd: 150, knee: [0.3, 0.3] });
    playGrains(ctx, dest, t, debris(4, 0.2, 0.6, 0.16, 1200, 4000, 0.9), 'bandpass', 2);
  },

  // 필살을 모으는 휘익 — 오르는 노이즈·톤이 히트스톱 끝에서 끊긴다
  specialCharge: (ctx, dest, t, rate) => {
    playNoise(ctx, dest, t, 0.17, 0.3, { filterType: 'bandpass', freqStart: 400, freqEnd: 3800, q: 3, attack: 0.15 });
    playOsc(ctx, dest, t, 'sawtooth', 160, 0.17, 0.12, rate, { freqEnd: 900, attack: 0.15 });
  },

  // 다음 건물이 떨어지기 직전 — 작은 하강 휘파람
  incoming: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sine', 1150, 0.5, 0.13, rate, { freqEnd: 420, attack: 0.07 });
    playNoise(ctx, dest, t, 0.5, 0.05, { filterType: 'bandpass', freqStart: 2200, freqEnd: 700, q: 4, attack: 0.08 });
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
    hitLayers(ctx, dest, t, rate, {
      click: 2200, clickPeak: 0.3,
      body: { type: 'sine', f0: 120, f1: 55, dur: 0.1, peak: 0.55 },
      snap: { type: 'square', f0: 170, f1: 110, dur: 0.05, peak: 0.12 },
      crunch: [950, 640], cPeak: 0.28,
      tail: { f0: 700, f1: 200, dur: 0.12, peak: 0.14 },
    });
  },

  hitTick: (ctx, dest, t, rate) => {
    hitLayers(ctx, dest, t, rate, {
      click: 4800, clickPeak: 0.5,
      body: { type: 'sine', f0: 170, f1: 100, dur: 0.05, peak: 0.35 },
      snap: { type: 'square', f0: 260, f1: 170, dur: 0.045, peak: 0.2 },
      crunch: [3000, 2300], cPeak: 0.3,
      tail: { f0: 2000, f1: 500, dur: 0.07, peak: 0.07 },
    });
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

  // ── 대검 넷(1200부터)의 제 소리 — 타격마다, 층 깨기·완파엔 붕괴음 위에 얹는다 ──
  // 화염 — 낮은 퍽 + 위로 쓸리는 불길 + 타닥 불티 둘
  hitFlame: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sine', 140, 0.1, 0.35, rate, { freqEnd: 60, attack: 0.001 });
    playNoise(ctx, dest, t, 0.18, 0.3, { filterType: 'bandpass', freqStart: 700 * rate, freqEnd: 2800 * rate });
    playNoise(ctx, dest, t + 0.05, 0.03, 0.14, { filterType: 'highpass', freqStart: 4000 });
    playNoise(ctx, dest, t + 0.11, 0.025, 0.1, { filterType: 'highpass', freqStart: 5000 });
  },

  // 서리 — 짧은 쿵 + 얼음 깨지는 높은 배음 둘 + 반짝 쉬익
  hitFrost: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'square', 160, 0.05, 0.1, rate, { freqEnd: 90, attack: 0.001 });
    playOsc(ctx, dest, t, 'sine', 130, 0.08, 0.24, rate, { freqEnd: 70, attack: 0.001 });
    playOsc(ctx, dest, t, 'sine', 2637, 0.2, 0.1, rate, { attack: 0.001 });
    playOsc(ctx, dest, t + 0.012, 'sine', 3520, 0.15, 0.07, rate, { attack: 0.001 });
    playNoise(ctx, dest, t + 0.01, 0.14, 0.11, { filterType: 'highpass', freqStart: 5000 });
  },

  // 흑철 — 무거운 몸통 + 날카로운 크랙 + 전기 지직
  hitOnyx: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sine', 130, 0.14, 0.36, rate, { freqEnd: 48, attack: 0.001 });
    playOsc(ctx, dest, t + 0.004, 'triangle', 2600, 0.03, 0.15, rate, { freqEnd: 1500, attack: 0.001 });
    playNoise(ctx, dest, t, 0.06, 0.22, { filterType: 'highpass', freqStart: 3200 });
    playZap(ctx, dest, t + 0.01, rate, 190, 70, 320, 0.11, 0.16);
  },

  // 황금 — 묵직한 퉁 + 맑은 종소리 겹(콤보 사다리를 탄다)
  hitGold: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sine', 150, 0.08, 0.27, rate, { freqEnd: 75, attack: 0.001 });
    playOsc(ctx, dest, t, 'triangle', 1318.5, 0.26, 0.16, rate, { attack: 0.002 });
    playOsc(ctx, dest, t + 0.004, 'sine', 2637, 0.2, 0.07, rate, { attack: 0.002 });
    playOsc(ctx, dest, t + 0.05, 'sine', 1975.5, 0.18, 0.06, rate, { attack: 0.003 });
    playNoise(ctx, dest, t, 0.05, 0.08, { filterType: 'highpass', freqStart: 6500 });
  },

  // ── 명물 보스 ──
  // 종탑 시계 초침 — 마른 똑. 부르는 쪽이 피치를 2도 낮춰 번갈아 똑·딱
  clockTick: (ctx, dest, t, rate) => {
    playNoise(ctx, dest, t, 0.018, 0.3, { filterType: 'highpass', freqStart: 3200 * rate });
    playOsc(ctx, dest, t, 'square', 1900, 0.014, 0.12, rate, { attack: 0.001 });
    playOsc(ctx, dest, t, 'sine', 420, 0.03, 0.14, rate, { freqEnd: 260, attack: 0.001 });
  },

  // 댕 — 종이 탑에서 빠져 던져지는 순간. 맑게 한 번
  bellToss: (ctx, dest, t, rate) => {
    bellRing(ctx, dest, t, rate, 392, 0.9, 0.24);
  },

  // 되돌린 종이 몸을 칠 때 — 던질 때보다 낮고 크고 길다(탑이 같이 운다)
  bellBody: (ctx, dest, t, rate) => {
    bellRing(ctx, dest, t, rate, 262, 1.6, 0.34);
    playOsc(ctx, dest, t, 'sine', 110, 0.3, 0.5, rate, { freqEnd: 48, attack: 0.002 });
    playNoise(ctx, dest, t, 0.08, 0.3, { filterType: 'lowpass', freqStart: 2200, freqEnd: 300 });
  },

  // 깡 — 종을 벴을 때. 쇠가 튕기는 짧은 금속음
  bellClang: (ctx, dest, t, rate) => {
    [[1, 0.3], [2.76, 0.2], [5.4, 0.12]].forEach(([k, a]) => {
      playOsc(ctx, dest, t, 'triangle', 760 * k, 0.2, a, rate, { attack: 0.001 });
    });
    playNoise(ctx, dest, t, 0.03, 0.34, { filterType: 'highpass', freqStart: 4500 });
    playOsc(ctx, dest, t, 'sine', 170, 0.05, 0.25, rate, { freqEnd: 100, attack: 0.001 });
  },

  // 퉁 — 종이 땅에 떨어져 깨짐. 둔하고 짧다
  bellThud: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sine', 150, 0.12, 0.5, rate, { freqEnd: 60, attack: 0.002 });
    playNoise(ctx, dest, t, 0.06, 0.22, { filterType: 'lowpass', freqStart: 700, freqEnd: 200 });
  },

  windIn: (ctx, dest, t, rate, dur = 0.8) => whistle(ctx, dest, t, rate, dur, 1),
  windOut: (ctx, dest, t, rate, dur = 0.8) => whistle(ctx, dest, t, rate, dur, -1),

  // 구층탑 풍경 — 높고 작은 방울 셋이 어긋나 운다
  chime: (ctx, dest, t, rate) => {
    [[2093, 0], [2637, 0.07], [1976, 0.15]].forEach(([f, at]) => {
      playOsc(ctx, dest, t + at, 'sine', f, 0.55, 0.14, rate, { attack: 0.002 });
      playOsc(ctx, dest, t + at, 'sine', f * 2.76, 0.25, 0.05, rate, { attack: 0.002 });
    });
  },

  // 크레인 끼릭 — 톱니 한 칸. 부르는 쪽이 반복한다
  craneRatchet: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sawtooth', 520, 0.03, 0.16, rate, { freqEnd: 330, attack: 0.001 });
    playNoise(ctx, dest, t, 0.02, 0.18, { filterType: 'bandpass', freqStart: 2600, q: 2 });
  },

  // 철컥 — 갈고리가 짐을 놓는다
  craneClunk: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'square', 140, 0.08, 0.3, rate, { freqEnd: 70, attack: 0.001 });
    playNoise(ctx, dest, t, 0.05, 0.3, { filterType: 'bandpass', freqStart: 1800, q: 1.5 });
    playOsc(ctx, dest, t + 0.06, 'square', 200, 0.06, 0.22, rate, { freqEnd: 90, attack: 0.001 });
    playNoise(ctx, dest, t + 0.06, 0.05, 0.24, { filterType: 'bandpass', freqStart: 2400, q: 1.5 });
  },

  // 댕댕 — 공중 가드로 올린 종이 꽂혔다(2점). 몸 울림 위에 한 음 높은 둘째 울림이 겹친다
  bellTwin: (ctx, dest, t, rate) => {
    [[392, 0], [494, 0.11]].forEach(([f, at]) => {
      playOsc(ctx, dest, t + at, 'sine', f, 0.9, 0.2, rate, { attack: 0.002 });
      playOsc(ctx, dest, t + at, 'sine', f * 2.4, 0.4, 0.07, rate, { attack: 0.002 });
    });
  },

  // 쾅 — 3막 시보. 댕 대신 낮고 마른 한 방(종 울림은 꼬리에만)
  bellBoom: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sine', 95, 0.36, 0.6, rate, { freqEnd: 40, attack: 0.002 });
    playNoise(ctx, dest, t, 0.14, 0.34, { filterType: 'lowpass', freqStart: 1800, freqEnd: 180 });
    playOsc(ctx, dest, t + 0.02, 'sine', 196, 0.7, 0.16, rate, { attack: 0.004 });
  },

  // 맑은 종소리 — 13시 종을 받았다. 높고 길게 한 번
  bellClear: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sine', 880, 1.8, 0.22, rate, { attack: 0.003 });
    playOsc(ctx, dest, t, 'sine', 880 * 2.76, 0.7, 0.07, rate, { attack: 0.003 });
    playOsc(ctx, dest, t + 0.05, 'sine', 1320, 1.2, 0.1, rate, { attack: 0.003 });
  },

  // 구층탑 나무 소리 — 낮은 나무가 비틀리는 소리. 부르는 쪽이 피치를 내려 무게를 준다
  pagodaCreak: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'sawtooth', 140, 0.34, 0.1, rate, { freqEnd: 92, attack: 0.07 });
    playNoise(ctx, dest, t, 0.3, 0.1, { filterType: 'bandpass', freqStart: 420 * rate, freqEnd: 260 * rate, q: 6, attack: 0.06 });
    playOsc(ctx, dest, t + 0.16, 'square', 190, 0.1, 0.06, rate, { freqEnd: 120, attack: 0.01 });
  },

  // 탁 — 크레인 줄이 끊긴다. 짧은 채찍 + 튕기는 선 소리
  craneSnap: (ctx, dest, t, rate) => {
    playOsc(ctx, dest, t, 'square', 320, 0.04, 0.28, rate, { freqEnd: 120, attack: 0.001 });
    playNoise(ctx, dest, t, 0.04, 0.3, { filterType: 'highpass', freqStart: 3200 });
    playOsc(ctx, dest, t + 0.01, 'sine', 720, 0.16, 0.1, rate, { freqEnd: 300, attack: 0.001 });
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
