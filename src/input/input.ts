// 키보드 + 터치 → InputFrame. 엣지(점프/공격/필살)와 홀드(가드)를 구분한다.
// 원작에 좌우 이동이 없어 ←→(A/D) 매핑은 폐기. ↑/W/Space 점프, ↓/S/Shift 가드, Z/J 공격, X/K 필살.

import type { InputFrame } from '../core/types';
import type { TouchInput } from './touch';

const EDGE_KEYS: Record<string, keyof Pick<InputFrame, 'jump' | 'attack' | 'special'>> = {
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
  KeyZ: 'attack', KeyJ: 'attack',
  KeyX: 'special', KeyK: 'special',
};
const GUARD_KEYS = new Set(['ArrowDown', 'KeyS', 'ShiftLeft', 'ShiftRight']);

/** 필살기 오탭 억제. 공격 연타 주기(~100ms)보다 길다. 공격/점프에는 쓰지 않는다. */
export const SPECIAL_DEBOUNCE_MS = 180;

export interface InputSource {
  sample(): InputFrame;
  /** 이번 샘플에 아무 입력이든 있었는가 (타이틀 "탭하여 시작"용) */
  anyPressed(): boolean;
  onFirstGesture(cb: () => void): void;
}

export function mergeFrame(
  kb: InputFrame,
  touch: InputFrame | null,
): InputFrame {
  if (!touch) return { ...kb };
  return {
    jump: kb.jump || touch.jump,
    attack: kb.attack || touch.attack,
    special: kb.special || touch.special,
    guard: kb.guard || touch.guard,
  };
}

/** special 엣지가 디바운스 창을 통과하면 fire. lastAt은 마지막 통과 시각. */
export function debounceSpecial(
  special: boolean,
  now: number,
  lastAt: number,
  windowMs: number = SPECIAL_DEBOUNCE_MS,
): { fire: boolean; nextLast: number } {
  if (!special) return { fire: false, nextLast: lastAt };
  if (now - lastAt < windowMs) return { fire: false, nextLast: lastAt };
  return { fire: true, nextLast: now };
}

export function createInput(touch: TouchInput | null): InputSource {
  const edges = new Set<'jump' | 'attack' | 'special'>();
  const heldGuardKeys = new Set<string>();
  let any = false;
  let firstCb: (() => void) | null = null;
  let firstFired = false;
  let lastSpecialAt = Number.NEGATIVE_INFINITY;

  const fireFirst = (): void => {
    if (!firstFired && firstCb) {
      firstFired = true;
      firstCb();
    }
  };

  const isTypingTarget = (t: EventTarget | null): boolean => {
    if (!(t instanceof HTMLElement)) return false;
    const tag = t.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable;
  };

  window.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) return;
    const act = EDGE_KEYS[e.code];
    const isGuard = GUARD_KEYS.has(e.code);
    if (!act && !isGuard) return;
    e.preventDefault();
    fireFirst();
    if (e.repeat) return;
    if (act) { edges.add(act); any = true; }
    if (isGuard) { heldGuardKeys.add(e.code); any = true; }
  });
  window.addEventListener('keyup', (e) => {
    heldGuardKeys.delete(e.code);
  });
  const clearHeld = (): void => { heldGuardKeys.clear(); };
  window.addEventListener('blur', clearHeld);
  window.addEventListener('pagehide', clearHeld);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearHeld();
  });

  // 캔버스(필드) 첫 탭도 오디오 언락. 버튼 탭은 touch.onFirstGesture와 공유 플래그.
  window.addEventListener('pointerdown', fireFirst, { capture: true });
  touch?.onFirstGesture(fireFirst);

  return {
    sample(): InputFrame {
      const t = touch;
      const kb: InputFrame = {
        jump: edges.has('jump'),
        attack: edges.has('attack'),
        special: edges.has('special'),
        guard: heldGuardKeys.size > 0,
      };
      const fromTouch: InputFrame | null = t
        ? {
          jump: t.pressed.jump,
          attack: t.pressed.attack,
          special: t.pressed.special,
          guard: t.held.guard,
        }
        : null;
      const merged = mergeFrame(kb, fromTouch);
      const spec = debounceSpecial(merged.special, performance.now(), lastSpecialAt);
      lastSpecialAt = spec.nextLast;
      merged.special = spec.fire;

      if (t) {
        any = any || t.pressed.jump || t.pressed.attack || t.pressed.special || t.held.guard;
        t.clearPressed();
      }
      edges.clear();
      return merged;
    },
    anyPressed(): boolean {
      const a = any;
      any = false;
      return a;
    },
    onFirstGesture(cb: () => void): void { firstCb = cb; },
  };
}
