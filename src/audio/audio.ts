// 건뿌 오디오 엔진 — AudioContext 싱글턴 + 마스터/SFX/BGM 3버스 + 룩어헤드 BGM 스케줄러.
// iOS 언락: 첫 제스처에서 initAudio() 1회 호출(무음 1샘플 관용구), 이후 suspended면
// resume().then 후 재생(playSfx 참조).
import { SFX_PRESETS, BGM_TRACKS } from './sfx';
import type { SfxName, BgmTrack } from './sfx';
import { JUICE_SYS } from '../config';

// ─── 상태 ────────────────────────────────────────────────────
let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let sfxBus: GainNode | null = null;
let bgmBus: GainNode | null = null;
let soundOn = true;

let currentTrack: BgmTrack | null = null;
/** startBgm이 요청한 트랙 — ctx 미생성·음소거여도 기억했다가 언락/ON 시 재생 */
let wantedTrack: BgmTrack | null = null;
let schedulerId: number | null = null;
let nextStepTime = 0;
let stepIndex = 0;
let unlockArmed = false;

const LOOKAHEAD_MS = 50;
const SCHEDULE_AHEAD_S = 0.1;

// ─── 초기화 / 언락 ──────────────────────────────────────────

/** 첫 사용자 제스처 핸들러 안에서 호출: AudioContext 생성 + resume + 무음 1샘플(iOS 관용구). */
export function initAudio(): void {
  if (ctx) return;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const c = new AC();
  ctx = c;

  masterGain = c.createGain();
  masterGain.gain.value = soundOn ? 1 : 0;
  masterGain.connect(c.destination);

  sfxBus = c.createGain();
  sfxBus.gain.value = 0.5;
  sfxBus.connect(masterGain);

  bgmBus = c.createGain();
  bgmBus.gain.value = 0.3;
  bgmBus.connect(masterGain);

  // iOS 무음 1샘플 재생 — 제스처 안에서 즉시 실행해 컨텍스트를 풀어준다.
  const silent = c.createBuffer(1, 1, 22050);
  const silentSrc = c.createBufferSource();
  silentSrc.buffer = silent;
  silentSrc.connect(c.destination);
  silentSrc.start(0);

  if (c.state === 'suspended') {
    c.resume().then(() => {
      snapSchedulerClock();
      beginScheduler();
    });
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

/** visibilitychange로 포그라운드 복귀 시 호출: suspended면 resume. */
export function resumeIfNeeded(): void {
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().then(snapSchedulerClock);
  } else {
    snapSchedulerClock();
  }
}

// ─── 온/오프 ────────────────────────────────────────────────

export function setSoundOn(on: boolean): void {
  soundOn = on;
  if (masterGain) masterGain.gain.value = on ? 1 : 0;
  if (!on) haltScheduler();
  else beginScheduler();
}

export function isSoundOn(): boolean {
  return soundOn;
}

// ─── SFX ───────────────────────────────────────────────────

export function playSfx(name: SfxName, opts?: { pitchSemitones?: number }): void {
  if (!ctx || !sfxBus || !soundOn) return;
  const c = ctx;
  const bus = sfxBus;
  const preset = SFX_PRESETS[name];

  const semis = opts?.pitchSemitones ?? 0;
  const jitter = (Math.random() * 2 - 1) * JUICE_SYS.PITCH_JITTER;
  const rate = Math.pow(2, semis / 12) * (1 + jitter);

  const fire = (): void => {
    preset(c, bus, c.currentTime, rate);
  };

  // 언락 관용구: suspended면 resume().then 후 재생.
  if (c.state === 'suspended') {
    c.resume().then(fire);
  } else {
    fire();
  }
}

// ─── BGM 룩어헤드 스케줄러 ───────────────────────────────────

let drumNoiseBuffer: AudioBuffer | null = null;
function getDrumNoiseBuffer(c: AudioContext): AudioBuffer {
  if (!drumNoiseBuffer) {
    const len = Math.floor(c.sampleRate * 0.2);
    drumNoiseBuffer = c.createBuffer(1, len, c.sampleRate);
    const data = drumNoiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return drumNoiseBuffer;
}

function scheduleStep(
  c: AudioContext,
  dest: AudioNode,
  step: { mel: number[] | null; bass: number | null; drum: 0 | 1 | 2 },
  t: number,
  stepSeconds: number,
): void {
  const noteDur = stepSeconds * 0.85;

  if (step.mel) {
    for (const freq of step.mel) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.22, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + noteDur);
      o.connect(g);
      g.connect(dest);
      o.start(t);
      o.stop(t + noteDur + 0.02);
    }
  }

  if (step.bass !== null) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(step.bass, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + noteDur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + noteDur + 0.02);
  }

  if (step.drum === 1) {
    // 킥
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.08);
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + 0.12);
  } else if (step.drum === 2) {
    // 햇
    const src = c.createBufferSource();
    src.buffer = getDrumNoiseBuffer(c);
    const filt = c.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.setValueAtTime(6000, t);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    src.connect(filt);
    filt.connect(g);
    g.connect(dest);
    src.start(t);
    src.stop(t + 0.05);
  }
}

function scheduler(): void {
  if (!ctx || !bgmBus || !currentTrack) return;
  const c = ctx;
  const bus = bgmBus;
  const pattern = BGM_TRACKS[currentTrack];
  const stepSeconds = 60 / pattern.bpm / 4;

  while (nextStepTime < c.currentTime + SCHEDULE_AHEAD_S) {
    scheduleStep(c, bus, pattern.steps[stepIndex], nextStepTime, stepSeconds);
    nextStepTime += stepSeconds;
    stepIndex++;
    if (stepIndex >= pattern.steps.length) {
      if (pattern.loop) {
        stepIndex = 0;
      } else {
        stopBgm();
        return;
      }
    }
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
  if (!ctx || !bgmBus || !soundOn || !wantedTrack) return;
  if (currentTrack === wantedTrack && schedulerId !== null) return;
  if (ctx.state === 'suspended') ctx.resume();
  haltScheduler();
  currentTrack = wantedTrack;
  stepIndex = 0;
  nextStepTime = ctx.currentTime;
  schedulerId = window.setInterval(scheduler, LOOKAHEAD_MS);
  scheduler();
}

/** 트랙 교체(같은 트랙이면 무시). ctx가 아직 없어도 언락 후 이어서 재생한다. */
export function startBgm(track: BgmTrack): void {
  if (wantedTrack === track && currentTrack === track && schedulerId !== null) return;
  wantedTrack = track;
  beginScheduler();
}

export function stopBgm(): void {
  wantedTrack = null;
  haltScheduler();
}

// ─── 시각 동기 ────────────────────────────────────────────────

/** ctx.currentTime — 번개 큐 등 시각 동기용. ctx 없으면 -1. */
export function getAudioTime(): number {
  return ctx ? ctx.currentTime : -1;
}
