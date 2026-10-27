// 건뿌 오디오 엔진 — AudioContext 싱글턴 + 마스터(컴프레서)/SFX/BGM 버스 + 룩어헤드 BGM 스케줄러.
// iOS 언락: 첫 제스처에서 initAudio() 1회 호출(무음 1샘플 관용구), 이후 running이 아니면
// resume().then 후 재생(playSfx 참조).
//
// 그래프:  sfx ─────────────┐
//          bgm → bgmEnv ────┴→ master → compressor → destination
// bgm 버스 = 켬/끔·메뉴 덕킹, bgmEnv = 정지 페이드·필살/격파 순간 덕킹 (둘이 서로 덮어쓰지 않게 직렬로 둔다).
import { SFX_PRESETS, BGM_TRACKS, chordArp } from './sfx';
import type { SfxName, BgmTrack, BgmPattern } from './sfx';
import { AUDIO, JUICE_SYS } from '../config';

export interface MixGraph {
  master: GainNode;
  sfx: GainNode;
  bgm: GainNode;
  bgmEnv: GainNode;
}

/** 믹스 그래프 생성. 오프라인 렌더(음량 측정)도 이걸 그대로 쓴다. */
export function createMix(c: BaseAudioContext): MixGraph {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = AUDIO.COMP.THRESHOLD;
  comp.knee.value = AUDIO.COMP.KNEE;
  comp.ratio.value = AUDIO.COMP.RATIO;
  comp.attack.value = AUDIO.COMP.ATTACK;
  comp.release.value = AUDIO.COMP.RELEASE;
  comp.connect(c.destination);

  const master = c.createGain();
  master.connect(comp);
  const sfx = c.createGain();
  sfx.gain.value = AUDIO.SFX_BUS;
  sfx.connect(master);
  const bgmEnv = c.createGain();
  bgmEnv.connect(master);
  const bgm = c.createGain();
  bgm.gain.value = AUDIO.BGM_BUS;
  bgm.connect(bgmEnv);
  return { master, sfx, bgm, bgmEnv };
}

// ─── 상태 ────────────────────────────────────────────────────
let ctx: AudioContext | null = null;
let mix: MixGraph | null = null;
let soundOn = true; // 전체 음소거(설정 「소리」)
let bgmOn = true;
let sfxOn = true;
/** 메뉴(일시정지·설정)·광고 대기처럼 음악을 낮춰야 하는 이유들 — 하나라도 있으면 낮춘다 */
const duckReasons = new Set<string>();

let currentTrack: BgmTrack | null = null;
/** startBgm이 요청한 트랙 — ctx 미생성·음소거여도 기억했다가 언락/ON 시 재생 */
let wantedTrack: BgmTrack | null = null;
let schedulerId: number | null = null;
let nextStepTime = 0;
let stepIndex = 0;
let unlockArmed = false;
/** 콤보 층(0 없음 · 1 햇 8분 · 2 +아르페지오). 마디 경계에서만 target → level로 바뀐다. */
let layerLevel = 0;
let layerTarget = 0;
/** resume 대기 중 쌓인 효과음은 최신 1건만 남긴다 */
let pendingSfx: (() => void) | null = null;

function ramp(p: AudioParam, v: number, tc: number, at: number): void {
  p.cancelScheduledValues(at);
  p.setTargetAtTime(v, at, tc);
}

/** 켬/끔·덕킹 상태를 버스 gain에 반영한다(페이드 — 클릭 팝 없게). immediate면 즉시값. */
function applyLevels(immediate = false): void {
  if (!ctx || !mix) return;
  const now = ctx.currentTime;
  const master = soundOn ? 1 : 0;
  const sfx = sfxOn ? AUDIO.SFX_BUS : 0;
  const bgm = bgmOn ? AUDIO.BGM_BUS * (duckReasons.size > 0 ? AUDIO.DUCK_MENU : 1) : 0;
  if (immediate) {
    mix.master.gain.value = master;
    mix.sfx.gain.value = sfx;
    mix.bgm.gain.value = bgm;
    return;
  }
  ramp(mix.master.gain, master, AUDIO.FADE_TC, now);
  ramp(mix.sfx.gain, sfx, AUDIO.FADE_TC, now);
  ramp(mix.bgm.gain, bgm, AUDIO.DUCK_TC, now);
}

// ─── 초기화 / 언락 ──────────────────────────────────────────

/** 첫 사용자 제스처 핸들러 안에서 호출: AudioContext 생성 + resume + 무음 1샘플(iOS 관용구). */
export function initAudio(): void {
  if (ctx) return;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const c = new AC();
  ctx = c;
  mix = createMix(c);
  applyLevels(true);

  // iOS 무음 1샘플 재생 — 제스처 안에서 즉시 실행해 컨텍스트를 풀어준다.
  const silent = c.createBuffer(1, 1, 22050);
  const silentSrc = c.createBufferSource();
  silentSrc.buffer = silent;
  silentSrc.connect(c.destination);
  silentSrc.start(0);

  if (c.state !== 'running') {
    c.resume().then(() => {
      snapSchedulerClock();
      beginScheduler();
    }, () => undefined);
  } else {
    beginScheduler();
  }
}

/**
 * 모바일/iOS: 첫 pointer/touch/keydown에서 AudioContext 생성.
 * 버튼 외 캔버스 탭도 언락되도록 window 캡처로 건다 (input 로직과 독립).
 */
export function armAudioUnlock(): void {
  if (unlockArmed) return;
  unlockArmed = true;
  const go = (): void => {
    initAudio();
    window.removeEventListener('pointerdown', go, true);
    window.removeEventListener('touchstart', go, true);
    window.removeEventListener('keydown', go, true);
  };
  window.addEventListener('pointerdown', go, { capture: true });
  window.addEventListener('touchstart', go, { capture: true, passive: true });
  window.addEventListener('keydown', go, { capture: true });
}

function snapSchedulerClock(): void {
  if (ctx) nextStepTime = ctx.currentTime;
}

/** 포그라운드 복귀 시 호출: running이 아니면(suspended · iOS interrupted) resume. */
export function resumeIfNeeded(): void {
  if (!ctx) return;
  if (ctx.state !== 'running') {
    ctx.resume().then(snapSchedulerClock, () => undefined);
  } else {
    snapSchedulerClock();
  }
}

/** 백그라운드 진입 시 호출: 소리를 멈춘다. 복귀는 resumeIfNeeded가 한다. */
export function suspendAudio(): void {
  if (ctx?.state === 'running') ctx.suspend().catch(() => undefined);
}

// ─── 온/오프 · 덕킹 ─────────────────────────────────────────

/** 전체 음소거(설정 「소리」). 끄면 스케줄러도 멈춘다. */
export function setSoundOn(on: boolean): void {
  soundOn = on;
  applyLevels();
  if (!on) haltScheduler();
  else beginScheduler();
}

export function setBgmOn(on: boolean): void {
  bgmOn = on;
  applyLevels();
  if (!on) haltScheduler();
  else beginScheduler();
}

export function setSfxOn(on: boolean): void {
  sfxOn = on;
  applyLevels();
}

/** 메뉴·광고 대기 때 음악을 낮춘다. 이유별로 켜고 끈다(이유가 하나라도 남으면 낮은 채). */
export function duckBgm(reason: string, on: boolean): void {
  if (on === duckReasons.has(reason)) return;
  if (on) duckReasons.add(reason);
  else duckReasons.delete(reason);
  applyLevels();
}

/** 필살·보스 격파의 순간 덕킹 — 0.3초 낮췄다 돌아온다. 음악이 멈춰 있으면 건드리지 않는다. */
export function pulseDuckBgm(): void {
  if (!ctx || !mix || currentTrack === null) return;
  const now = ctx.currentTime;
  ramp(mix.bgmEnv.gain, AUDIO.DUCK_PULSE, AUDIO.DUCK_TC, now);
  mix.bgmEnv.gain.setTargetAtTime(1, now + AUDIO.DUCK_PULSE_S, AUDIO.DUCK_TC * 2);
}

// ─── SFX ───────────────────────────────────────────────────

export function playSfx(name: SfxName, opts?: { pitchSemitones?: number; delay?: number }): void {
  if (!ctx || !mix || !soundOn || !sfxOn) return;
  const c = ctx;
  const bus = mix.sfx;
  const preset = SFX_PRESETS[name];

  const semis = opts?.pitchSemitones ?? 0;
  const delay = opts?.delay ?? 0;
  const jitter = (Math.random() * 2 - 1) * JUICE_SYS.PITCH_JITTER;
  const rate = Math.pow(2, semis / 12) * (1 + jitter);

  const fire = (): void => {
    preset(c, bus, c.currentTime + delay, rate);
  };

  // 언락 관용구: running이 아니면 resume().then 후 재생. 대기 중 쌓인 호출은 최신 1건만 남는다.
  if (c.state !== 'running') {
    pendingSfx = fire;
    c.resume().then(flushPendingSfx, () => undefined);
  } else {
    fire();
  }
}

function flushPendingSfx(): void {
  const f = pendingSfx;
  pendingSfx = null;
  f?.();
}

// ─── BGM 룩어헤드 스케줄러 ───────────────────────────────────

let drumNoiseBuffer: AudioBuffer | null = null;
function getDrumNoiseBuffer(c: BaseAudioContext): AudioBuffer {
  if (!drumNoiseBuffer) {
    const len = Math.floor(c.sampleRate * 0.2);
    drumNoiseBuffer = c.createBuffer(1, len, c.sampleRate);
    const data = drumNoiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return drumNoiseBuffer;
}

function tone(
  c: BaseAudioContext, dest: AudioNode, t: number, type: OscillatorType, freq: number,
  peak: number, dur: number, detune = 0,
): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (detune !== 0) o.detune.setValueAtTime(detune, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function hat(c: BaseAudioContext, dest: AudioNode, t: number, peak: number): void {
  const src = c.createBufferSource();
  src.buffer = getDrumNoiseBuffer(c);
  const filt = c.createBiquadFilter();
  filt.type = 'highpass';
  filt.frequency.setValueAtTime(6000, t);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
  src.connect(filt);
  filt.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(t + 0.05);
}

/**
 * 패턴의 index번째 스텝 하나를 t에 예약한다. layer = 콤보 층(0/1/2).
 * 멜로디는 ±detune 이중 발음, 킥 스텝에선 멜로디를 낮춰 피크를 누른다.
 */
export function scheduleBgmStep(
  c: BaseAudioContext,
  dest: AudioNode,
  pattern: BgmPattern,
  index: number,
  t: number,
  stepSeconds: number,
  layer: number,
): void {
  const step = pattern.steps[index];
  const noteDur = stepSeconds * 0.85;
  const L = AUDIO.LEVEL;

  if (step.mel) {
    const peak = L.MEL * (step.drum === 1 ? L.KICK_MEL_MUL : 1);
    for (const freq of step.mel) {
      tone(c, dest, t, 'square', freq, peak, noteDur, AUDIO.DETUNE_CENTS);
      tone(c, dest, t, 'square', freq, peak, noteDur, -AUDIO.DETUNE_CENTS);
    }
  }

  if (step.bass !== null) tone(c, dest, t, 'triangle', step.bass, L.BASS, noteDur);

  if (step.drum === 1) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.08);
    g.gain.setValueAtTime(L.KICK, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + 0.12);
  } else if (step.drum === 2) {
    hat(c, dest, t, L.HAT);
  } else if (layer >= 1 && index % 2 === 0) {
    hat(c, dest, t, L.LAYER_HAT); // 콤보 층 1: 비어 있는 8분 자리에 햇
  }

  if (layer >= 2 && index % 2 === 1) {
    // 콤보 층 2: 마디 화성의 뿌리-3도-5도-옥타브를 8분 뒷박에 오른다
    const arp = chordArp(pattern.chords[Math.floor(index / 16)]);
    tone(c, dest, t, 'triangle', arp[(index >> 1) % 4], L.LAYER_ARP, noteDur);
  }
}

/** 콤보 → 콤보 층(0 없음 · 1 햇 8분 · 2 +아르페지오) */
export function comboLayerOf(combo: number): number {
  if (combo >= AUDIO.COMBO_ARP) return 2;
  return combo >= AUDIO.COMBO_HAT ? 1 : 0;
}

/** 콤보 층 목표를 정한다. 실제 전환은 다음 마디 경계에서. */
export function setComboLayer(combo: number): void {
  layerTarget = comboLayerOf(combo);
}

/** 예약 시각이 지난 만큼(LATE_SKIP_S 초과분) 건너뛸 스텝 수. 제시간이면 0. */
export function lateSkipSteps(now: number, nextStepTime: number, stepSeconds: number): number {
  const late = now - AUDIO.LATE_SKIP_S - nextStepTime;
  return late > 0 ? Math.ceil(late / stepSeconds) : 0;
}

function scheduler(): void {
  if (!ctx || !mix || !currentTrack) return;
  const c = ctx;
  const pattern = BGM_TRACKS[currentTrack];
  const stepSeconds = 60 / pattern.bpm / 4;
  const len = pattern.steps.length;

  // 메인스레드가 밀려 예약 시각이 지났으면 따라잡아 한꺼번에 울리지 말고 건너뛴다(박자 격자는 유지)
  const skip = lateSkipSteps(c.currentTime, nextStepTime, stepSeconds);
  nextStepTime += skip * stepSeconds;
  stepIndex = (stepIndex + skip) % len;

  while (nextStepTime < c.currentTime + AUDIO.SCHEDULE_AHEAD_S) {
    if (stepIndex % 16 === 0) layerLevel = layerTarget;
    scheduleBgmStep(c, mix.bgm, pattern, stepIndex, nextStepTime, stepSeconds, layerLevel);
    nextStepTime += stepSeconds;
    stepIndex = (stepIndex + 1) % len;
  }
}

function haltScheduler(): void {
  if (schedulerId !== null) {
    window.clearInterval(schedulerId);
    schedulerId = null;
  }
  currentTrack = null;
}

function beginScheduler(): void {
  if (!ctx || !mix || !soundOn || !bgmOn || !wantedTrack) return;
  if (currentTrack === wantedTrack && schedulerId !== null) return;
  if (ctx.state !== 'running') ctx.resume().catch(() => undefined);
  haltScheduler();
  currentTrack = wantedTrack;
  stepIndex = 0;
  layerLevel = 0;
  layerTarget = 0;
  nextStepTime = ctx.currentTime;
  schedulerId = window.setInterval(scheduler, AUDIO.LOOKAHEAD_MS);
  scheduler();
}

/** 트랙 교체(같은 트랙이면 무시). ctx가 아직 없어도 언락 후 이어서 재생한다. */
export function startBgm(track: BgmTrack): void {
  if (wantedTrack === track && currentTrack === track && schedulerId !== null) return;
  wantedTrack = track;
  if (ctx && mix) ramp(mix.bgmEnv.gain, 1, AUDIO.DUCK_TC, ctx.currentTime); // 정지 페이드에서 복귀
  beginScheduler();
}

/** 음악 정지 — 짧게 페이드한 뒤 스케줄러를 끊는다(하드컷 방지). */
export function stopBgm(): void {
  wantedTrack = null;
  if (!ctx || !mix || schedulerId === null) {
    haltScheduler();
    return;
  }
  ramp(mix.bgmEnv.gain, 0, AUDIO.STOP_FADE_S / 4, ctx.currentTime);
  window.setTimeout(() => {
    if (wantedTrack === null) haltScheduler();
  }, AUDIO.STOP_FADE_S * 1000 + 30);
}
