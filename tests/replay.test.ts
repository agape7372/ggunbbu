// 판 기록 코드 — 입력열 ↔ 사건 ↔ 문자열이 손실 없이 돌아오고, 틀린 코드는 거른다.
import { describe, it, expect } from 'vitest';
import {
  createPlayback, createRecorder, decodeReplay, encodeReplay, fromBase64Url, toBase64Url, type Replay,
} from '../src/core/replay';
import { makeState, advance } from '../src/core/sim';
import type { InputFrame } from '../src/core/types';

/** 시드 고정 무작위 입력열 — 연타 · 홀드 가드 · 같은 틱 겹침을 다 섞는다 */
function frames(n: number, seed = 7): InputFrame[] {
  let x = seed;
  const r = (): number => { x = (Math.imul(x, 1103515245) + 12345) >>> 0; return x / 4294967296; };
  const out: InputFrame[] = [];
  let guard = false;
  for (let i = 0; i < n; i++) {
    if (r() < 0.04) guard = !guard;
    out.push({ jump: r() < 0.03, guard, attack: r() < 0.2, special: r() < 0.01 });
  }
  return out;
}

function sample(events: number[], ticks: number): Replay {
  return {
    head: { sim: 3, stage: '2-B', diff: 2, seed: 0xdeadbeef, weapon: 'hazard', waza: 'ageba' },
    end: { ticks, score: 1234567, cleared: true },
    events,
  };
}

describe('기록 코드', () => {
  it('입력열 → 사건 → 입력열이 틱마다 같다', () => {
    const src = frames(5000);
    const rec = createRecorder();
    for (const f of src) rec.push(f);
    expect(rec.ticks).toBe(5000);
    const pb = createPlayback(rec.events);
    for (let i = 0; i < src.length; i++) expect(pb.next()).toEqual(src[i]);
  });

  it('문자열로 갔다 와도 머리 · 끝 · 사건이 같다', () => {
    const rec = createRecorder();
    for (const f of frames(3000, 99)) rec.push(f);
    const r = sample([...rec.events], rec.ticks);
    const code = encodeReplay(r);
    expect(code.startsWith('GB1.')).toBe(true);
    expect(code).toMatch(/^GB1\.[A-Za-z0-9_-]+$/);
    expect(decodeReplay(code)).toEqual(r);
    // 메신저가 붙인 줄바꿈 · 공백은 무시
    expect(decodeReplay(`  ${code.slice(0, 40)}\n${code.slice(40)} \n`)).toEqual(r);
  });

  it('한 글자만 틀려도 · 잘려도 · 다른 형식이면 null', () => {
    const rec = createRecorder();
    for (const f of frames(800, 3)) rec.push(f);
    const code = encodeReplay(sample([...rec.events], rec.ticks));
    const i = 20;
    const flip = code.slice(0, i) + (code[i] === 'A' ? 'B' : 'A') + code.slice(i + 1);
    expect(decodeReplay(flip)).toBeNull();
    expect(decodeReplay(code.slice(0, -3))).toBeNull();
    expect(decodeReplay(code.replace('GB1.', 'GB2.'))).toBeNull();
    expect(decodeReplay('')).toBeNull();
    expect(decodeReplay('GB1.!!!!')).toBeNull();
  });

  it('base64url은 바이트 0~255를 그대로 돌려준다(길이 나머지 0 · 1 · 2)', () => {
    for (const len of [0, 1, 2, 3, 4, 5, 255, 256, 257]) {
      const bytes = Array.from({ length: len }, (_, k) => (k * 37 + len) & 0xff);
      expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    }
  });

  it('같은 시드 · 같은 입력이면 시뮬이 같은 끝에 닿는다 — 재생의 전제', () => {
    const src = frames(4000, 21);
    const run = (fs: InputFrame[]): string => {
      const s = makeState({ seed: 4242 });
      for (const f of fs) advance(s, f);
      return JSON.stringify({ t: s.tick, sc: s.score, l: s.lives, r: s.rngState, o: s.over, pc: s.peakCombo });
    };
    const rec = createRecorder();
    for (const f of src) rec.push(f);
    const pb = createPlayback(rec.events);
    const replayed = Array.from({ length: src.length }, () => pb.next());
    expect(run(replayed)).toBe(run(src));
  });

  it('2분 연타 판의 코드 길이 — 메신저에 붙일 만하다', () => {
    const rec = createRecorder();
    for (let i = 0; i < 7200; i++) rec.push({ jump: i % 97 === 0, guard: (i % 600) < 40, attack: i % 7 === 0, special: false });
    const code = encodeReplay(sample([...rec.events], rec.ticks));
    expect(code.length).toBeLessThan(2400);
  });
});
