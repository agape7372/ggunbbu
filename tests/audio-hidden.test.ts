// 앱이 숨은 동안 소리가 깨어나지 않는다(감사 feel-02) — node엔 AudioContext가 없어 상태만 흉내 내는 가짜를 쓴다.
import { describe, expect, it, vi } from 'vitest';

class FakeParam {
  value = 0;
  cancelScheduledValues(): void {}
  setTargetAtTime(): void {}
  setValueAtTime(): void {}
  linearRampToValueAtTime(): void {}
  exponentialRampToValueAtTime(): void {}
}
class FakeNode {
  gain = new FakeParam();
  pan = new FakeParam();
  frequency = new FakeParam();
  detune = new FakeParam();
  Q = new FakeParam();
  type = '';
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
  buffer: unknown = null;
  connect(): void {}
  disconnect(): void {}
  start(): void {}
  stop(): void {}
}
class FakeCtx {
  state: 'running' | 'suspended' = 'running';
  currentTime = 0;
  destination = new FakeNode();
  resumes = 0;
  resume(): Promise<void> { this.resumes += 1; this.state = 'running'; return Promise.resolve(); }
  suspend(): Promise<void> { this.state = 'suspended'; return Promise.resolve(); }
  createDynamicsCompressor(): FakeNode { return new FakeNode(); }
  createGain(): FakeNode { return new FakeNode(); }
  createStereoPanner(): FakeNode { return new FakeNode(); }
  sampleRate = 8000;
  createBuffer(_ch: number, len: number): object { return { getChannelData: () => new Float32Array(len) }; }
  createOscillator(): FakeNode { return new FakeNode(); }
  createBiquadFilter(): FakeNode { return new FakeNode(); }
  createBufferSource(): FakeNode { return new FakeNode(); }
}

describe('숨은 동안 소리', () => {
  it('suspendAudio 뒤 효과음 · 배경음 시작이 컨텍스트를 다시 깨우지 않고, 복귀 때만 깨운다', async () => {
    let made: FakeCtx | null = null;
    vi.stubGlobal('window', {
      AudioContext: class extends FakeCtx { constructor() { super(); made = this; } },
      setInterval: () => 1,
      clearInterval: () => undefined,
      setTimeout: () => 1,
    });
    const audio = await import('../src/audio/audio');
    audio.initAudio();
    const c = made as unknown as FakeCtx;
    audio.suspendAudio();
    expect(c.state).toBe('suspended');
    audio.playSfx('coin');
    audio.startBgm('title');
    await Promise.resolve();
    expect(c.state).toBe('suspended');
    expect(c.resumes).toBe(0);
    audio.resumeIfNeeded();
    expect(c.state).toBe('running');
    vi.unstubAllGlobals();
  });
});
