// 수습 교육판(core/training.ts) — 걸음 순서 · 목숨 불변 · 결정성 · 가드 멈춤 · 깔리면 다시.
import { describe, expect, it } from 'vitest';
import { advance, makeState } from '../src/core/sim';
import { LESSONS, startTraining, trainingKeys, trainingLesson, type LessonId } from '../src/core/training';
import { STAGES } from '../src/core/stages';
import type { GameState, InputFrame } from '../src/core/types';
import { EMPTY_INPUT } from '../src/core/types';
import { PLAYER } from '../src/config';

const fresh = (): GameState => {
  const s = makeState({ seed: 7, mode: 'training' });
  startTraining(s);
  return s;
};

/** 키가 진하게 보이는 대로만 누르는 신입 손 */
function rookie(s: GameState): InputFrame {
  const id = trainingLesson(s);
  const odd = s.tick % 2 === 0;
  const st = s.stack;
  const p = s.player;
  switch (id) {
    case 'slash': case 'combo': return { ...EMPTY_INPUT, attack: odd };
    case 'special': return { ...EMPTY_INPUT, special: odd };
    case 'guard': return { ...EMPTY_INPUT, guard: (s.training!.hold !== 0) || (!!st && st.vy < 0 && st.y < 70) };
    case 'jumpSlash': return p.y <= 0 ? { ...EMPTY_INPUT, jump: !!st && st.vy === 0 && odd } : { ...EMPTY_INPUT, attack: odd };
    case 'escape': return { ...EMPTY_INPUT, guard: p.pose === 'pinned' && odd };
    default: return EMPTY_INPUT;
  }
}

function play(bot: (s: GameState) => InputFrame, max = 60 * 90): { s: GameState; seen: LessonId[]; minLives: number } {
  const s = fresh();
  const seen: LessonId[] = [];
  let minLives = s.lives;
  for (let i = 0; i < max && !s.over; i++) {
    advance(s, bot(s));
    const id = trainingLesson(s);
    if (id && seen[seen.length - 1] !== id) seen.push(id);
    minLives = Math.min(minLives, s.lives);
    s.events.length = 0;
  }
  return { s, seen, minLives };
}

describe('수습 교육판', () => {
  it('키 얼굴대로 누르면 여섯 걸음을 차례로 지나 끝난다 — 목숨은 그대로', () => {
    const { s, seen, minLives } = play(rookie);
    expect(s.over).toBe('cleared');
    expect(seen).toEqual(LESSONS.map((l) => l.id));
    expect(minLives).toBe(PLAYER.LIVES);
    expect(s.lives).toBe(PLAYER.LIVES);
    expect(s.tick).toBeLessThan(60 * 60); // 1분 안
  });

  it('결정적이다 — 같은 손이면 같은 틱 · 같은 점수', () => {
    const a = play(rookie).s;
    const b = play(rookie).s;
    expect([a.tick, a.score, a.peakCombo]).toEqual([b.tick, b.score, b.peakCombo]);
  });

  it('지시서 목록(STAGES)에 안 든다', () => {
    expect(STAGES.some((d) => (d.id as string) === 'training')).toBe(false);
  });

  it('가드 걸음: 가드 존에서 판이 멈추고, 안 누르면 계속 기다린다 · 누르면 튕겨 오른다', () => {
    const s = fresh();
    // 가드 걸음까지 신입 손으로
    for (let i = 0; i < 60 * 60 && trainingLesson(s) !== 'guard'; i++) { advance(s, rookie(s)); s.events.length = 0; }
    expect(trainingLesson(s)).toBe('guard');
    expect(trainingKeys(s)).toEqual(['guard']);
    for (let i = 0; i < 60 * 10 && s.training!.hold === 0; i++) { advance(s, EMPTY_INPUT); s.events.length = 0; }
    expect(s.training!.hold).toBe(-1);
    const y = s.stack!.y;
    for (let i = 0; i < 300; i++) advance(s, EMPTY_INPUT);
    expect(s.stack!.y).toBe(y); // 멈춰 있다
    expect(s.training!.hold).toBe(-1);
    const ev: string[] = [];
    for (let i = 0; i < 20; i++) { advance(s, { ...EMPTY_INPUT, guard: true }); ev.push(...s.events.map((e) => e.kind)); s.events.length = 0; }
    expect(ev).toContain('guardBounce');
    expect(s.training!.rep).toBe(1);
    expect(s.stack!.vy).toBeGreaterThan(0);
  });

  it('둘째 가드는 짧게 멈추고, 놓쳐서 깔려도 목숨은 그대로 · 같은 걸음을 다시 낸다', () => {
    const s = fresh();
    for (let i = 0; i < 60 * 60 && !(trainingLesson(s) === 'guard' && s.training!.rep === 1); i++) { advance(s, rookie(s)); s.events.length = 0; }
    expect(s.training!.rep).toBe(1);
    let crushed = false;
    for (let i = 0; i < 60 * 20 && !crushed; i++) {
      advance(s, EMPTY_INPUT);
      crushed = s.events.some((e) => e.kind === 'hurt');
      s.events.length = 0;
    }
    expect(crushed).toBe(true);
    expect(s.lives).toBe(PLAYER.LIVES);
    expect(trainingLesson(s)).toBe('guard');
    expect(s.training!.rep).toBe(1);
    expect(s.stack).toBeNull();
    expect(s.player.pose).toBe('idle');
  });

  it('빠져나오기: 깔린 동안만 가운데 키가 진하다 · 오래 깔려도 목숨은 그대로', () => {
    const s = fresh();
    for (let i = 0; i < 60 * 60 && trainingLesson(s) !== 'escape'; i++) { advance(s, rookie(s)); s.events.length = 0; }
    expect(trainingKeys(s)).toEqual([]);
    for (let i = 0; i < 60 * 8; i++) { advance(s, EMPTY_INPUT); s.events.length = 0; }
    expect(s.player.pose).toBe('pinned');
    expect(trainingKeys(s)).toEqual(['guard']);
    expect(s.lives).toBe(PLAYER.LIVES);
    expect(s.over).toBeNull();
  });

  it('낮게 멈춘 건물은 안 깔린다 — 손을 놓아도 베기 걸음이 그대로 남는다', () => {
    const s = fresh();
    for (let i = 0; i < 60 * 20; i++) { advance(s, EMPTY_INPUT); s.events.length = 0; }
    expect(trainingLesson(s)).toBe('slash');
    expect(s.stack!.resting).toBe(false);
    expect(s.player.pose).toBe('idle');
    expect(s.lives).toBe(PLAYER.LIVES);
  });
});
