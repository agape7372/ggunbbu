// 결과 화면 넷(철거 실패 · 작전 결과 · 엔딩 · 철거 보고서)의 키 — 순수 계산(DOM 없음).
// 키 얼굴(touch.setFaces) · 손가락 · 키보드가 모두 resultActs 하나를 읽는다(scenes syncFaces · update).
// 앞으로 가는 동작을 차례로 공격 · 점프 · 필살에, 가드는 나가기. 주홍은 공격 키 하나.

import type { KeyFace, KeyFaces, TouchAction } from '../input/touch';
import { SCREENS } from '../content';
import { STAGE_MODE } from '../content/stages';

export type ResultAct = 'revive' | 'continue' | 'retry' | 'next' | 'list' | 'home' | 'back';

export type ResultCtx =
  | { kind: 'gameover'; canRevive: boolean; canContinue: boolean; adRevive: boolean; reviveLeft: number }
  | { kind: 'opsend' }
  | { kind: 'ending' }
  /** next = 다음 지시서가 있고 열렸다 */
  | { kind: 'stageend'; next: boolean };

export type ResultKeys = Record<TouchAction, ResultAct | null>;

export function resultActs(c: ResultCtx): ResultKeys {
  switch (c.kind) {
    case 'gameover': {
      const go: ResultAct[] = [];
      if (c.canRevive) go.push('revive');
      if (c.canContinue) go.push('continue');
      go.push('retry');
      return { attack: go[0], jump: go[1] ?? null, special: go[2] ?? null, guard: 'home' };
    }
    case 'opsend': return { attack: 'retry', jump: 'list', special: null, guard: 'home' };
    case 'ending': return { attack: 'retry', jump: null, special: null, guard: 'home' };
    case 'stageend': return c.next
      ? { attack: 'next', jump: 'retry', special: null, guard: 'back' }
      : { attack: 'retry', jump: null, special: null, guard: 'back' };
  }
}

const LABEL: Record<ResultAct, string> = {
  revive: SCREENS.gameover.reviveFree,
  continue: SCREENS.gameover.continue,
  retry: SCREENS.ops.retry,
  next: STAGE_MODE.next,
  list: SCREENS.ops.list,
  home: STAGE_MODE.home,
  back: STAGE_MODE.mapBack,
};

/** 일어나기 키 — 다른 키보다 늦게 열린다(gateStep slow). 광고든 무료든 같다: 한 판에 몇 번뿐인 소비라서. 없으면 null */
export function reviveKey(c: ResultCtx): TouchAction | null {
  if (c.kind !== 'gameover') return null;
  const acts = resultActs(c);
  return ORDER.find((k) => acts[k] === 'revive') ?? null;
}

/** 키 얼굴. shut = 지금 닫힌 키(ResultGate.shut — 판정이 읽는 값과 같다). 동작이 있는 닫힌 키는 옅게 */
export function resultFaces(c: ResultCtx, shut: Readonly<Record<TouchAction, boolean>>): KeyFaces {
  const acts = resultActs(c);
  const face = (k: TouchAction): KeyFace => {
    const a = acts[k];
    if (!a) return { label: '', tone: 'rest' };
    const tone: KeyFace['tone'] = shut[k] ? 'faint' : k === 'attack' ? 'seal' : 'ink';
    const f: KeyFace = { label: LABEL[a], tone };
    if (a === 'revive' && c.kind === 'gameover') {
      const left = SCREENS.gameover.reviveLeft(c.reviveLeft);
      f.sub = c.adRevive ? `광고\n${left}` : left; // 광고 / n번 남음 — 뜻 단위 두 줄(pre-line)
    }
    if (a === 'continue') f.sub = '넘긴 곳부터';
    return f;
  };
  return { jump: face('jump'), guard: face('guard'), attack: face('attack'), special: face('special') };
}

/* ── 옅은 키는 안 눌리고 켜진 키는 눌린다 ─────────────────────────
   얼굴(resultFaces)과 판정이 같은 값(ResultGate.shut)을 읽는다. 받는 누름 = 지난 표본에 열려 있던 키의 새 누름뿐이다.
   잠긴 동안(카드가 막 떴다 · 광고를 보는 중 · 창 · 보상이 덮었다)은 넷 다 닫히고 그 누름은 버린다(쌓아 두지 않는다).
   그래서 풀린 첫 표본의 누름도 안 받는다. 풀린 뒤엔 키마다 「마지막 누름 뒤 KEY_QUIET_MS 조용」해야 열린다 —
   버려진 누름도 시각을 남기니 연타 중인 키는 계속 옅다. 가드는 쥐는 동안이 신호라 한 번 떼야 새 누름이 된다.
   일어나기 키(slow)는 더 늦다: 마지막 누름 뒤 REVIVE_QUIET_MS 조용하고, 잠금이 풀린 첫 표본부터 REVIVE_HOLD_MS가 지나야 열린다.
   판 내내 두드리던 공격 자리라 느린 박자로 치던 손이 일어나기(광고)로 새지 않게. 받은 누름도 시각을 남기니
   광고가 틱 하나 안에 실패해 잠긴 표본 없이 돌아와도 그 키는 마지막 누름 뒤 REVIVE_QUIET_MS 동안 닫혀 있다. */
export const KEY_QUIET_MS = 250;
export const REVIVE_QUIET_MS = 600;
export const REVIVE_HOLD_MS = 350;

export interface ResultGate {
  /** 키마다 마지막으로 눌려(쥐어) 있던 시각 */
  last: Record<TouchAction, number>;
  guardWas: boolean;
  /** 잠금이 풀린 첫 표본 시각(잠긴 동안 null) */
  openAt: number | null;
  /** 키마다 닫힘 — 얼굴(resultFaces)이 옅게 그리고, 다음 표본의 판정이 그 키의 누름을 버린다 */
  shut: Record<TouchAction, boolean>;
}

/** guardHeld = 지금 가드를 쥐고 있나(쥔 채 끝난 판은 떼기 전까지 가드가 새 누름이 아니다). 넷 다 닫힌 채 시작한다 */
export function newGate(guardHeld: boolean, now: number): ResultGate {
  const t = Number.NEGATIVE_INFINITY;
  return {
    last: { jump: t, attack: t, special: t, guard: guardHeld ? now : t },
    guardWas: guardHeld,
    openAt: null,
    shut: { jump: true, attack: true, special: true, guard: true },
  };
}

const ORDER: readonly TouchAction[] = ['attack', 'jump', 'special', 'guard'];

/** 한 표본. 받은 키(없으면 null). gate를 고친다. slow = 늦게 여는 키(reviveKey) */
export function gateStep(
  g: ResultGate,
  f: Readonly<Record<TouchAction, boolean>>,
  now: number,
  locked: boolean,
  slow: TouchAction | null = null,
): TouchAction | null {
  if (locked) g.openAt = null;
  else if (g.openAt === null) g.openAt = now;
  const edge: Record<TouchAction, boolean> = { jump: f.jump, attack: f.attack, special: f.special, guard: f.guard && !g.guardWas };
  g.guardWas = f.guard;
  let hit: TouchAction | null = null;
  for (const k of ORDER) {
    // 지난 표본에 얼굴이 켜져 있던 키의 새 누름만 받는다
    if (!hit && !locked && !g.shut[k] && edge[k]) hit = k;
    if (f[k]) g.last[k] = now;
  }
  for (const k of ORDER) {
    const quiet = now - g.last[k] >= (k === slow ? REVIVE_QUIET_MS : KEY_QUIET_MS);
    const hold = k === slow && (g.openAt === null || now - g.openAt < REVIVE_HOLD_MS);
    g.shut[k] = locked || !quiet || hold;
  }
  return hit;
}
