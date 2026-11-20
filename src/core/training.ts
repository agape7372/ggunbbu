// 튜토리얼 — 첫 실행에 담당자 무전(말풍선: 대사 · 행동 유도 · 해내면 반응 대사)과 「그 키를 누를 때까지 판이 선다」로 가르친다.
// 걸음마다 박자(beat) 몇 개. 박자가 서면 판이 멈추고 need 키로만 풀린다. 글은 content/screens.ts SCREENS.training.
// 작업 지시서가 아니다 — STAGES에 안 들고 지도 · 기록 · 기한 · 도장이 없다. 건물 층은 지시서 대본 글자(core/script.ts)로 적는다.
// 목숨이 줄지 않는다(sim.ts loseLife). 깔리면 그 건물을 걷고 같은 걸음을 다시 낸다 — 깔렸을 때 걸음만 깔리는 게 일이다.
// 난수를 안 쓴다. 같은 입력이면 같은 판이다.
//
// | 걸음      | 건물                          | 박자                     |
// | 인사      | 없음                          | 시작 → 아무 키           |
// | 베기      | 약 3층 · 높이 58에 바로       | 자리 → 공격              |
// | 콤보      | 약 5층 · 높이 58에 바로       | 자리 → 공격              |
// | 뛰어 베기 | 약 2층 · 높이 190에 바로      | 자리 → 점프, 닿음 → 공격 |
// | 가드 ×2   | 강 2층 · 280에서 떨어짐       | 가드 존 → 가드(둘째는 짧게) |
// | 깔렸을 때 | 강 2층 · 바로 깔림            | 깔림 → 가드(탈출)        |
// | 필살      | 중 5층 · 높이 58에 바로 · 게이지 100 | 자리 → 필살       |
// | 실전 연습 | 약 4층 · 보통 낙하            | 없음(안 선다)            |

import type { FallingStack, GameState, InputFrame, Material } from './types';
import { ACT1, STACK, TRAINING, WAZA_GAUGE } from '../config';
import { parseScript } from './script';
import { makeFloor, makeStack } from './building';
import { guardActive } from './player';
import { reachOf } from './perks';

/** 조작 키 이름 — input/touch.ts TouchAction과 같은 글자(core는 입력 층을 import하지 않는다) */
export type Verb = 'jump' | 'guard' | 'attack' | 'special';
export type LessonId = 'hello' | 'slash' | 'combo' | 'jumpSlash' | 'guard' | 'escape' | 'special' | 'solo';

/** 판이 서는 순간 — ready 건물이 자리 잡음 · guardZone 가드 존 · reach 공중에서 칼이 닿음 · pinned 깔림 */
export interface Beat { key: Verb | 'any'; when: 'start' | 'ready' | 'guardZone' | 'reach' | 'pinned' }

interface Lesson {
  id: LessonId;
  /** 진하게 보일 키 */
  keys: readonly Verb[];
  /** 해낸 것 하나 = 완파 · 가드 튕김 · 깔림 탈출 · (인사) 아무 키 */
  goal: 'destroy' | 'guard' | 'escape' | 'start';
  reps: number;
  floors: readonly Material[];
  /** 나오는 높이. 0 = 땅에 놓인 채(바로 깔린다) */
  spawnY: number;
  /** 이 높이에서 멈춘다(안 떨어진다) */
  hover?: number;
  beats: readonly Beat[];
}

/** 대본 글자 한 덩이 → 층 재질 */
const floorsOf = (tok: string): Material[] => {
  const it = parseScript(tok)[0].items[0];
  if (it.k !== 'build') throw new Error(`튜토리얼: 건물 글자가 아니다 「${tok}」`);
  return it.floors;
};

const ALL: readonly Verb[] = ['jump', 'guard', 'attack', 'special'];
const { HOVER_LOW: LOW, HOVER_HIGH: HIGH } = TRAINING;

export const LESSONS: readonly Lesson[] = [
  { id: 'hello', keys: ALL, goal: 'start', reps: 1, floors: [], spawnY: 0, beats: [{ key: 'any', when: 'start' }] },
  { id: 'slash', keys: ['attack'], goal: 'destroy', reps: 1, floors: floorsOf('www'), spawnY: LOW, hover: LOW, beats: [{ key: 'attack', when: 'ready' }] },
  { id: 'combo', keys: ['attack'], goal: 'destroy', reps: 1, floors: floorsOf('wwwww'), spawnY: LOW, hover: LOW, beats: [{ key: 'attack', when: 'ready' }] },
  { id: 'jumpSlash', keys: ['jump', 'attack'], goal: 'destroy', reps: 1, floors: floorsOf('ww'), spawnY: HIGH, hover: HIGH,
    beats: [{ key: 'jump', when: 'ready' }, { key: 'attack', when: 'reach' }] },
  { id: 'guard', keys: ['guard'], goal: 'guard', reps: 2, floors: floorsOf('hh'), spawnY: TRAINING.GUARD_SPAWN_Y, beats: [{ key: 'guard', when: 'guardZone' }] },
  { id: 'escape', keys: ['guard'], goal: 'escape', reps: 1, floors: floorsOf('hh'), spawnY: 0, beats: [{ key: 'guard', when: 'pinned' }] },
  { id: 'special', keys: ['special'], goal: 'destroy', reps: 1, floors: floorsOf('mmmmm'), spawnY: LOW, hover: LOW, beats: [{ key: 'special', when: 'ready' }] },
  { id: 'solo', keys: ALL, goal: 'destroy', reps: 1, floors: floorsOf('wwww'), spawnY: STACK.SPAWN_Y, beats: [] },
];

/** makeState({ mode: 'training' })로 갓 만든 상태에 건다 */
export function startTraining(s: GameState): void {
  s.mode = 'training';
  s.stackSpawnCd = 0;
  s.training = { lesson: 0, rep: 0, spawned: false, wait: 0, hold: 0, beat: 0, need: null, ok: false, launch: false };
}

/** 지금 걸음 — 다 했으면 null */
export function trainingLesson(s: GameState): LessonId | null {
  const t = s.training;
  return t ? LESSONS[t.lesson]?.id ?? null : null;
}

/** 진하게 보일 키. 깔렸을 때 걸음은 깔린 동안만 가운데 키(탈출) */
export function trainingKeys(s: GameState): readonly Verb[] {
  const t = s.training;
  const l = t ? LESSONS[t.lesson] : undefined;
  if (!t || !l || t.launch) return [];
  if (l.goal === 'escape' && s.player.pose !== 'pinned') return [];
  if (t.hold !== 0 && t.need && t.need !== 'any') return [t.need]; // 판이 기다리는 키 하나만
  return l.keys;
}

export interface TrainingGuide {
  lesson: LessonId;
  /** 지금 할 일 자리(beats 자리) */
  beat: number;
  /** 판이 need 키를 기다리며 서 있나 */
  waiting: boolean;
  need: Verb | 'any' | null;
  /** 타이밍 박자(가드 존 · 공중에서 닿음)로 서 있나 — 화면이 「지금!」을 찍는다 */
  now: boolean;
  /** 걸음을 막 해내고 쉼 중인가 */
  ok: boolean;
  rep: number;
}

/** 화면(안내판 · 키 맥동)이 읽을 것 */
export function trainingGuide(s: GameState): TrainingGuide | null {
  const t = s.training;
  const l = t ? LESSONS[t.lesson] : undefined;
  if (!t || !l) return null;
  const waiting = t.hold !== 0 && t.need !== null;
  const when = waiting ? l.beats[t.beat]?.when : undefined;
  return { lesson: l.id, beat: t.beat, waiting, need: t.need, now: when === 'guardZone' || when === 'reach', ok: t.ok, rep: t.rep };
}

/**
 * 판이 서 있나 — sim.advance가 히트스톱 뒤에 부른다. need 키를 누르면 그 틱부터 다시 돈다.
 * 풀 때 need가 아닌 버퍼를 비운다 — 선 동안 쌓인 다른 키가 풀리는 틱에 터지지 않게(점프가 공격보다 먼저라 베기에서 뛰어 버린다)
 */
export function holdTraining(s: GameState, input: InputFrame): boolean {
  const t = s.training;
  if (!t || t.hold === 0) return false;
  const need = t.need;
  const pressed = need === 'any' ? input.jump || input.attack || input.guard || input.special : !!need && input[need];
  if (pressed) t.hold = 0;
  else if (t.hold > 0) t.hold -= 1;
  if (t.hold !== 0) return true;
  // 풀렸다(눌렀거나 둘째 가드의 짧은 멈춤이 끝났다). 인사(any)는 누른 키를 쓰지 않는다 — 버퍼를 다 비운다
  const p = s.player;
  if (need !== 'jump') p.bufJump = 0;
  if (need !== 'attack') { p.bufAttack = 0; p.holdTick = 0; } // 쥐고 있던 공격(착암기)도 새로 눌러야 다시 돈다
  if (need !== 'special') p.bufSpecial = 0;
  if (need !== 'guard') p.bufGuard = 0;
  t.need = null;
  t.beat += 1;
  return false;
}

/** 멈춤 높이 — sim.advance가 건물 물리 바로 뒤(밑면 붙어 내려가기 앞)에 부른다. 멈춘 건물은 속도 0이라 머리를 끌고 내려가지 않는다 */
export function hoverStack(s: GameState, st: FallingStack): void {
  const t = s.training;
  const h = t && !t.launch ? LESSONS[t.lesson]?.hover : undefined;
  if (h !== undefined && st.vy < 0 && st.y < h) { st.y = h; st.vy = 0; }
}

/** 한 틱 — 해냈나 · 깔렸나 · 다음 건물 · 박자. sim.advance 모드 진행 자리 */
export function stepTraining(s: GameState, evStart: number): void {
  const t = s.training;
  const l = t ? LESSONS[t.lesson] : undefined;
  if (!t || !l) return;
  const p = s.player;

  // 인사 — 건물 없이 판을 세우고 아무 키나 누르면 바로 다음 걸음(통과 · 쉼 없음)
  if (l.goal === 'start') {
    if (t.beat === 0) {
      if (t.hold === 0) { t.hold = -1; t.need = 'any'; }
      return;
    }
    t.lesson += 1;
    t.beat = 0;
    t.wait = 0;
    return;
  }

  if (!t.launch && s.stack) {
    for (let i = evStart; i < s.events.length; i++) {
      const k = s.events[i].kind;
      const hit = l.goal === 'guard' ? k === 'guardBounce' || k === 'guardAirBounce'
        : l.goal === 'escape' ? k === 'pinEscape' : false;
      if (!hit) continue;
      // 해냈다 — 그 건물은 화면 위로 날려 보낸다(가드의 튕김을 크게 보여 주고, 다시 떨어져 깔지 않게)
      t.rep += 1;
      t.ok = true;
      t.launch = true;
      s.stack.vy = TRAINING.LAUNCH_V;
      s.stack.resting = false;
      s.stack.y = Math.max(s.stack.y, 0.001);
      break;
    }
  }
  if (t.launch && s.stack && s.stack.y >= STACK.SPAWN_Y) s.stack = null;

  // 깔렸다 — 깔렸을 때 걸음이 아니면 그 건물을 걷고 같은 걸음을 다시(목숨은 그대로)
  if (l.goal !== 'escape' && p.pose === 'pinned') {
    s.stack = null;
    p.pose = 'idle';
    p.poseTick = 0;
    p.invulnTicks = TRAINING.GAP;
    t.spawned = false;
    t.launch = false;
    t.hold = 0;
    t.need = null;
    t.beat = 0;
    t.wait = TRAINING.GAP;
    return;
  }

  // 판이 비었다 — 한 번 해냈으면 센다(걸음은 쉼이 끝나야 넘어간다 · 쉬는 동안 「통과」)
  if (t.spawned && !s.stack && !s.wazaRun) {
    if (l.goal === 'destroy') { t.rep += 1; t.ok = true; }
    t.spawned = false;
    t.launch = false;
    t.wait = t.ok ? TRAINING.OK_TICKS : TRAINING.GAP; // 해냈으면 반응 대사를 읽을 만큼 쉰다
  }

  if (!t.spawned && !s.stack) {
    if (t.wait > 0) { t.wait -= 1; return; }
    if (t.ok) {
      t.ok = false;
      if (t.rep >= l.reps) {
        t.lesson += 1;
        t.rep = 0;
        if (t.lesson >= LESSONS.length) { s.over = 'cleared'; return; }
      }
    }
    spawn(s, LESSONS[t.lesson]);
  }

  const cur = LESSONS[t.lesson];
  // 필살 걸음 — 게이지를 채워 둔다(한 번 헛써도 다시 누를 수 있게)
  if (cur.id === 'special' && s.stack && !s.wazaRun && s.wazaGauge < WAZA_GAUGE.MAX) s.wazaGauge = WAZA_GAUGE.MAX;

  // 박자 — 서야 할 순간이면 판을 세운다(둘째 가드는 짧게, 나머지는 need 키를 누를 때까지)
  // 뛰어 베기 — 한 번 뛰어 다 못 벴으면(층이 남았다) 내려온 뒤 박자를 처음부터(다시 점프 → 닿으면 공격)
  if (cur.id === 'jumpSlash' && t.beat >= cur.beats.length && p.y <= 0) t.beat = 0;
  const b = cur.beats[t.beat];
  const st = s.stack;
  if (!b || !st || t.launch || t.hold !== 0) return;
  if (!beatDue(s, b, st)) return;
  if (b.when === 'reach' && p.pose === 'attack') { t.beat += 1; return; } // 이미 베는 중 — 세우지 않는다
  t.hold = cur.id === 'guard' && t.rep > 0 ? TRAINING.GUARD_HOLD2 : -1;
  t.need = b.key;
}

function beatDue(s: GameState, b: Beat, st: FallingStack): boolean {
  const p = s.player;
  switch (b.when) {
    case 'start': return false;
    case 'ready': return p.y <= 0;
    case 'guardZone': return st.vy < 0 && st.y <= STACK.GUARD_ZONE_GROUND && p.y <= 0 && !guardActive(p);
    case 'reach': return p.y > 0 && st.y <= p.y + reachOf(s);
    case 'pinned': return p.pose === 'pinned';
  }
}

function spawn(s: GameState, l: Lesson): void {
  const t = s.training!;
  const st = makeStack({
    variant: 'building',
    theme: ACT1.CHAPTER_THEMES[s.chapter] ?? ACT1.CHAPTER_THEMES[0],
    floors: l.floors.map(makeFloor),
    y: l.spawnY,
  });
  // 깔렸을 때 걸음 — 땅에 놓인 채로 낸다. 다음 틱 sim의 착지 검사가 바로 깔게 한다(떨어지며 가드로 튕길 틈이 없다)
  if (l.spawnY === 0) { st.resting = true; s.player.invulnTicks = 0; }
  s.stack = st;
  t.spawned = true;
  t.beat = 0;
  t.need = null;
  if (l.id === 'special' && s.wazaGauge < WAZA_GAUGE.MAX) {
    s.wazaGauge = WAZA_GAUGE.MAX;
    s.events.push({ kind: 'gaugeFull' });
  }
}
