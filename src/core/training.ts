// 수습 교육판 — 첫 실행에 글 창 대신 손으로 배우는 판. 걸음마다 동사 하나, 해내면 다음 걸음(gs-level-design: 읽을 필요 없는 설명서).
// 작업 지시서가 아니다 — STAGES에 안 들고 지도 · 기록 · 기한 · 도장이 없다. 건물 층은 지시서 대본 글자(core/script.ts)로 적는다.
// 목숨이 줄지 않는다(sim.ts loseLife). 깔리면 그 건물을 걷고 같은 걸음을 다시 낸다 — 빠져나오기만 깔리는 게 일이다.
// 난수를 안 쓴다. 같은 입력이면 같은 판이다(가드 · 사용자 대역 테스트가 같은 판을 본다).
//
// | 걸음       | 키         | 건물                                   | 놓치면        |
// | 베기       | 공격       | 약 3층 · 머리 위에 멈춤                 | 없음          |
// | 이어 베기  | 공격       | 약 5층 · 머리 위에 멈춤(콤보 도장)      | 없음          |
// | 가드       | 가드       | 강 2층이 떨어진다 · 가드 존에서 판이 멈춤 ×2(둘째는 짧게) | 깔림 → 다시 |
// | 뛰어 베기  | 점프 · 공격 | 약 2층 · 땅에서 안 닿는 높이에 멈춤     | 없음          |
// | 빠져나오기 | 가드(탈출) | 강 2층이 머리 위에서 내려앉는다         | 깔리는 게 일  |
// | 필살       | 필살       | 중 5층 · 머리 위에 멈춤 · 게이지를 채워 준다 | 없음     |

import type { FallingStack, GameState, InputFrame, Material } from './types';
import { ACT1, STACK, TRAINING, WAZA_GAUGE } from '../config';
import { parseScript } from './script';
import { makeFloor, makeStack } from './building';
import { guardActive } from './player';

/** 조작 키 이름 — input/touch.ts TouchAction과 같은 글자(core는 입력 층을 import하지 않는다) */
export type Verb = 'jump' | 'guard' | 'attack' | 'special';
export type LessonId = 'slash' | 'combo' | 'guard' | 'jumpSlash' | 'escape' | 'special';

interface Lesson {
  id: LessonId;
  /** 진하게 보일 키 */
  keys: readonly Verb[];
  /** 해낸 것 하나 = 완파 · 가드 튕김 · 깔림 탈출 */
  goal: 'destroy' | 'guard' | 'escape';
  reps: number;
  floors: readonly Material[];
  spawnY: number;
  /** 이 높이에서 멈춘다(안 떨어진다) */
  hover?: number;
}

/** 대본 글자 한 덩이 → 층 재질 */
const floorsOf = (tok: string): Material[] => {
  const it = parseScript(tok)[0].items[0];
  if (it.k !== 'build') throw new Error(`교육판: 건물 글자가 아니다 「${tok}」`);
  return it.floors;
};

export const LESSONS: readonly Lesson[] = [
  { id: 'slash', keys: ['attack'], goal: 'destroy', reps: 1, floors: floorsOf('www'), spawnY: TRAINING.SPAWN_Y, hover: TRAINING.HOVER_LOW },
  { id: 'combo', keys: ['attack'], goal: 'destroy', reps: 1, floors: floorsOf('wwwww'), spawnY: TRAINING.SPAWN_Y, hover: TRAINING.HOVER_LOW },
  { id: 'guard', keys: ['guard'], goal: 'guard', reps: 2, floors: floorsOf('hh'), spawnY: TRAINING.SPAWN_Y },
  { id: 'jumpSlash', keys: ['jump', 'attack'], goal: 'destroy', reps: 1, floors: floorsOf('ww'), spawnY: TRAINING.SPAWN_Y, hover: TRAINING.HOVER_HIGH },
  { id: 'escape', keys: ['guard'], goal: 'escape', reps: 1, floors: floorsOf('hh'), spawnY: TRAINING.ESCAPE_SPAWN_Y },
  { id: 'special', keys: ['special'], goal: 'destroy', reps: 1, floors: floorsOf('mmmmm'), spawnY: TRAINING.SPAWN_Y, hover: TRAINING.HOVER_LOW },
];

/** makeState({ mode: 'training' })로 갓 만든 상태에 건다 */
export function startTraining(s: GameState): void {
  s.mode = 'training';
  s.stackSpawnCd = 0;
  s.training = { lesson: 0, rep: 0, spawned: false, wait: TRAINING.GAP, hold: 0, held: false, launch: false };
}

/** 지금 걸음 — 다 했으면 null */
export function trainingLesson(s: GameState): LessonId | null {
  const t = s.training;
  return t ? LESSONS[t.lesson]?.id ?? null : null;
}

/** 진하게 보일 키. 빠져나오기는 깔린 동안만 가운데 키(탈출) */
export function trainingKeys(s: GameState): readonly Verb[] {
  const t = s.training;
  const l = t ? LESSONS[t.lesson] : undefined;
  if (!t || !l || t.launch) return [];
  if (l.goal === 'escape' && s.player.pose !== 'pinned') return [];
  return l.keys;
}

/** 판이 멈춰 있나 — sim.advance가 히트스톱 뒤에 부른다. 가드를 누르면 그 틱부터 다시 돈다 */
export function holdTraining(s: GameState, input: InputFrame): boolean {
  const t = s.training;
  if (!t || t.hold === 0) return false;
  if (input.guard) { t.hold = 0; return false; }
  if (t.hold > 0) t.hold -= 1;
  return t.hold !== 0;
}

/** 멈춤 높이 — sim.advance가 건물 물리 바로 뒤(밑면 붙어 내려가기 앞)에 부른다. 멈춘 건물은 속도 0이라 머리를 끌고 내려가지 않는다 */
export function hoverStack(s: GameState, st: FallingStack): void {
  const t = s.training;
  const h = t && !t.launch ? LESSONS[t.lesson]?.hover : undefined;
  if (h !== undefined && st.vy < 0 && st.y < h) { st.y = h; st.vy = 0; }
}

/** 한 틱 — 해냈나 · 깔렸나 · 다음 건물. sim.advance 모드 진행 자리 */
export function stepTraining(s: GameState, evStart: number): void {
  const t = s.training;
  const l = t ? LESSONS[t.lesson] : undefined;
  if (!t || !l) return;
  const p = s.player;

  if (!t.launch && s.stack) {
    for (let i = evStart; i < s.events.length; i++) {
      const k = s.events[i].kind;
      const hit = l.goal === 'guard' ? k === 'guardBounce' || k === 'guardAirBounce'
        : l.goal === 'escape' ? k === 'pinEscape' : false;
      if (!hit) continue;
      // 해냈다 — 그 건물은 화면 위로 날려 보낸다(가드의 튕김을 크게 보여 주고, 다시 떨어져 깔지 않게)
      t.rep += 1;
      t.launch = true;
      s.stack.vy = TRAINING.LAUNCH_V;
      s.stack.resting = false;
      s.stack.y = Math.max(s.stack.y, 0.001);
      break;
    }
  }
  if (t.launch && s.stack && s.stack.y >= STACK.SPAWN_Y) s.stack = null;

  // 깔렸다 — 빠져나오기 걸음이 아니면 그 건물을 걷고 같은 걸음을 다시(목숨은 그대로)
  if (l.goal !== 'escape' && p.pose === 'pinned') {
    s.stack = null;
    p.pose = 'idle';
    p.poseTick = 0;
    p.invulnTicks = TRAINING.GAP;
    t.spawned = false;
    t.launch = false;
    t.held = false;
    t.wait = TRAINING.GAP;
    return;
  }

  // 판이 비었다 — 한 번 해냈으면 세고, 다 했으면 다음 걸음
  if (t.spawned && !s.stack && !s.wazaRun) {
    if (l.goal === 'destroy') t.rep += 1;
    t.spawned = false;
    t.launch = false;
    t.held = false;
    t.wait = TRAINING.GAP;
    if (t.rep >= l.reps) {
      t.lesson += 1;
      t.rep = 0;
      if (t.lesson >= LESSONS.length) { s.over = 'cleared'; return; }
    }
  }

  if (!t.spawned && !s.stack) {
    if (t.wait > 0) { t.wait -= 1; return; }
    spawn(s, LESSONS[t.lesson]);
    return;
  }

  const cur = LESSONS[t.lesson];
  // 필살 걸음 — 게이지를 채워 둔다(한 번 헛써도 다시 누를 수 있게)
  if (cur.id === 'special' && s.stack && !s.wazaRun && s.wazaGauge < WAZA_GAUGE.MAX) s.wazaGauge = WAZA_GAUGE.MAX;
  // 가드 걸음 — 건물이 가드 존에 든 순간 판을 세운다(첫째는 누를 때까지, 둘째는 짧게)
  const st = s.stack;
  if (cur.goal === 'guard' && st && !t.held && !t.launch && st.vy < 0 && st.y <= STACK.GUARD_ZONE_GROUND
    && p.y <= 0 && !guardActive(p)) {
    t.held = true;
    t.hold = t.rep === 0 ? -1 : TRAINING.GUARD_HOLD2;
  }
}

function spawn(s: GameState, l: Lesson): void {
  const t = s.training!;
  s.stack = makeStack({
    variant: 'building',
    theme: ACT1.CHAPTER_THEMES[s.chapter] ?? ACT1.CHAPTER_THEMES[0],
    floors: l.floors.map(makeFloor),
    y: l.spawnY,
  });
  t.spawned = true;
  t.held = false;
  if (l.id === 'special' && s.wazaGauge < WAZA_GAUGE.MAX) {
    s.wazaGauge = WAZA_GAUGE.MAX;
    s.events.push({ kind: 'gaugeFull' });
  }
}
