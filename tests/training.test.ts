// 튜토리얼(core/training.ts) — 걸음 순서 · 목숨 불변 · 결정성 · 박자(그 키로만 풀림 · 버퍼 비움) · 가드 · 깔렸을 때 · 실전 연습.
import { describe, expect, it } from 'vitest';
import { advance, makeState } from '../src/core/sim';
import { LESSONS, startTraining, trainingGuide, trainingKeys, trainingLesson, type LessonId } from '../src/core/training';
import { STAGES } from '../src/core/stages';
import type { GameState, InputFrame } from '../src/core/types';
import { EMPTY_INPUT } from '../src/core/types';
import { PLAYER, TRAINING } from '../src/config';

const fresh = (): GameState => {
  const s = makeState({ seed: 7, mode: 'training' });
  startTraining(s);
  return s;
};

/** 안내판 · 키 얼굴대로만 누르는 신입 손 — 판이 서면 그 키, 아니면 걸음의 키 */
function rookie(s: GameState): InputFrame {
  const g = trainingGuide(s);
  if (!g) return EMPTY_INPUT;
  if (g.waiting && g.need) return { ...EMPTY_INPUT, [g.need === 'any' ? 'jump' : g.need]: true };
  const odd = s.tick % 2 === 0;
  const st = s.stack;
  switch (g.lesson) {
    case 'slash': case 'combo': case 'solo': return { ...EMPTY_INPUT, attack: odd };
    case 'special': return { ...EMPTY_INPUT, special: odd };
    case 'guard': return { ...EMPTY_INPUT, guard: !!st && st.vy < 0 && st.y < 70 };
    default: return EMPTY_INPUT; // 뛰어 베기 · 깔렸을 때는 판이 설 때만 누른다(공중 「닿음」 박자가 안 서면 못 끝낸다)
  }
}

/** 걸음 id(그 걸음의 rep번째 건물)까지 신입 손으로 */
function reach(s: GameState, id: LessonId, rep = 0): void {
  for (let i = 0; i < 60 * 60 && !(trainingLesson(s) === id && s.training!.rep === rep && !s.training!.ok); i++) {
    advance(s, rookie(s));
    s.events.length = 0;
  }
  expect(trainingLesson(s)).toBe(id);
}

/** n틱 같은 손 — 이벤트 이름을 모은다 */
function idle(s: GameState, n: number, input: InputFrame = EMPTY_INPUT): string[] {
  const ev: string[] = [];
  for (let i = 0; i < n; i++) { advance(s, input); ev.push(...s.events.map((e) => e.kind)); s.events.length = 0; }
  return ev;
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

describe('튜토리얼', () => {
  it('키 얼굴대로 누르면 여덟 걸음을 차례로 지나 끝난다 — 목숨은 그대로', () => {
    const { s, seen, minLives } = play(rookie);
    expect(LESSONS.length).toBe(8);
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

  it('타이밍 박자(가드 존)에서만 「지금!」', () => {
    const s = fresh();
    reach(s, 'guard');
    expect(trainingGuide(s)!.now).toBe(false);
    for (let i = 0; i < 60 * 10 && s.training!.hold === 0; i++) idle(s, 1);
    expect(trainingGuide(s)!.now).toBe(true);
  });

  it('지시서 목록(STAGES)에 안 든다', () => {
    expect(STAGES.some((d) => (d.id as string) === 'training')).toBe(false);
  });

  it('인사: 건물 없이 판이 서고, 아무 키 하나로 바로 베기 걸음(눌린 키는 안 쓴다)', () => {
    for (const k of ['jump', 'attack', 'guard', 'special'] as const) {
      const s = fresh();
      idle(s, 30);
      expect(trainingGuide(s)).toMatchObject({ lesson: 'hello', waiting: true, need: 'any', ok: false });
      expect(s.stack).toBeNull();
      const ev = idle(s, 1, { ...EMPTY_INPUT, [k]: true });
      expect(trainingLesson(s)).toBe('slash');
      expect(ev).not.toContain('jump'); // 점프로 넘겨도 뛰지 않는다
      expect(trainingGuide(s)!.ok).toBe(false); // 통과 · 쉼 없이
      idle(s, 2);
      expect(trainingGuide(s)).toMatchObject({ lesson: 'slash', waiting: true, need: 'attack' });
    }
  });

  it('해낸 뒤 쉼은 OK_TICKS — 그동안 「통과」(반응 대사 읽을 시간)', () => {
    const s = fresh();
    reach(s, 'slash');
    let rest = -1; // 판이 빈 틱에 잡힌 쉼
    for (let i = 0; i < 60 * 20 && trainingLesson(s) === 'slash'; i++) {
      advance(s, rookie(s));
      if (rest < 0 && s.training!.ok && !s.stack) rest = s.training!.wait;
      s.events.length = 0;
    }
    expect(rest + 1).toBe(TRAINING.OK_TICKS); // 판이 빈 틱이 쉼 첫 틱 · 히트스톱 틱은 쉼을 안 깎는다
    expect(trainingLesson(s)).toBe('combo');
  });

  it('선 판은 그 키로만 풀린다 — 베기에서 점프를 눌러 둬도 공격으로 풀면 뛰지 않고 벤다', () => {
    const s = fresh();
    idle(s, 2);
    idle(s, 1, { ...EMPTY_INPUT, attack: true }); // 인사
    idle(s, 2);
    expect(trainingGuide(s)).toMatchObject({ lesson: 'slash', waiting: true, need: 'attack' });
    const y = s.stack!.y;
    idle(s, 20, { ...EMPTY_INPUT, jump: true }); // 다른 키 — 안 풀린다
    idle(s, 20, { ...EMPTY_INPUT, guard: true, special: true });
    expect(trainingGuide(s)!.waiting).toBe(true);
    expect(s.stack!.y).toBe(y);
    expect(s.player.y).toBe(0);
    const ev = idle(s, 1, { ...EMPTY_INPUT, attack: true });
    expect(trainingGuide(s)!.waiting).toBe(false);
    expect(s.player.pose).toBe('attack');
    ev.push(...idle(s, 20));
    expect(ev).not.toContain('jump');
    expect(ev).toContain('floorCollapse'); // 약층은 한 칼에 무너진다
    expect(s.combo).toBe(1);
    expect(s.player.y).toBe(0);
  });

  it('가드 걸음: 가드 존에서 판이 서고, 안 누르면 계속 기다린다 · 누르면 튕겨 오른다', () => {
    const s = fresh();
    reach(s, 'guard');
    expect(trainingKeys(s)).toEqual(['guard']);
    for (let i = 0; i < 60 * 10 && s.training!.hold === 0; i++) idle(s, 1);
    expect(trainingGuide(s)).toMatchObject({ waiting: true, need: 'guard' });
    expect(s.training!.hold).toBe(-1);
    const y = s.stack!.y;
    idle(s, 300);
    expect(s.stack!.y).toBe(y); // 서 있다
    const ev = idle(s, 20, { ...EMPTY_INPUT, guard: true });
    expect(ev).toContain('guardBounce');
    expect(s.training!.rep).toBe(1);
    expect(trainingGuide(s)!.ok).toBe(true);
    expect(s.stack!.vy).toBeGreaterThan(0);
  });

  it('둘째 가드는 짧게 서고, 놓쳐서 깔려도 목숨은 그대로 · 같은 걸음을 다시 낸다', () => {
    const s = fresh();
    reach(s, 'guard', 1);
    let held = 0;
    let crushed = false;
    for (let i = 0; i < 60 * 20 && !crushed; i++) {
      advance(s, EMPTY_INPUT);
      if (s.training!.hold !== 0) held += 1;
      crushed = s.events.some((e) => e.kind === 'hurt');
      s.events.length = 0;
    }
    expect(held).toBe(TRAINING.GUARD_HOLD2);
    expect(crushed).toBe(true);
    expect(s.lives).toBe(PLAYER.LIVES);
    expect(trainingLesson(s)).toBe('guard');
    expect(s.training!.rep).toBe(1);
    expect(s.stack).toBeNull();
    expect(s.player.pose).toBe('idle');
  });

  it('깔렸을 때: 건물이 바로 깔고 판이 선다 · 가드(탈출)로만 풀린다 · 목숨은 그대로', () => {
    const s = fresh();
    reach(s, 'escape');
    expect(trainingKeys(s)).toEqual([]);
    const ev = idle(s, TRAINING.GAP + 3);
    expect(ev).not.toContain('guardBounce'); // 떨어지며 튕길 틈이 없다
    expect(s.player.pose).toBe('pinned');
    expect(trainingGuide(s)).toMatchObject({ waiting: true, need: 'guard' });
    expect(trainingKeys(s)).toEqual(['guard']);
    idle(s, 200, { ...EMPTY_INPUT, attack: true });
    expect(s.player.pose).toBe('pinned');
    expect(s.lives).toBe(PLAYER.LIVES);
    expect(idle(s, 1, { ...EMPTY_INPUT, guard: true })).toContain('pinEscape');
    expect(s.training!.rep).toBe(1);
    expect(s.over).toBeNull();
  });

  it('실전 연습은 판을 세우지 않는다 — 깔려도 목숨 그대로 같은 걸음', () => {
    const s = fresh();
    reach(s, 'solo');
    let stood = false;
    let crushed = false;
    for (let i = 0; i < 60 * 20 && !crushed; i++) {
      advance(s, EMPTY_INPUT);
      if (s.training!.hold !== 0) stood = true;
      crushed = s.events.some((e) => e.kind === 'hurt');
      s.events.length = 0;
    }
    expect(stood).toBe(false);
    expect(crushed).toBe(true);
    expect(trainingLesson(s)).toBe('solo');
    expect(s.lives).toBe(PLAYER.LIVES);
  });
});
