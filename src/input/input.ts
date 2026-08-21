// 키보드 + 터치 → InputFrame 통합. 엣지(눌림)/홀드(가드) 구분.
// 매핑 [정본]: ←→↑↓ + Z(공격) X(필살) / 병행 WASD + J/K, Space=점프, S/Shift=가드.

import type { InputFrame } from '../core/types';
import type { TouchInput } from '../ui/touchLayer';

const EDGE_KEYS: Record<string, keyof InputFrame> = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
  KeyZ: 'attack', KeyJ: 'attack',
  KeyX: 'special', KeyK: 'special',
};
const GUARD_KEYS = new Set(['ArrowDown', 'KeyS', 'ShiftLeft', 'ShiftRight']);

export interface InputSource {
  sample(): InputFrame;
  /** 이번 샘플에 아무 입력이든 있었는가 (타이틀 "탭하여 시작"용) */
  anyPressed(): boolean;
  onFirstGesture(cb: () => void): void;
}

export function createInput(touch: TouchInput | null): InputSource {
  const edges = new Set<keyof InputFrame>();
  const heldGuardKeys = new Set<string>();
  let any = false;
  let firstCb: (() => void) | null = null;
  let firstFired = false;

  const fireFirst = (): void => {
    if (!firstFired && firstCb) { firstFired = true; firstCb(); }
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    fireFirst();
    const act = EDGE_KEYS[e.code];
    if (act) { edges.add(act); any = true; e.preventDefault(); }
    if (GUARD_KEYS.has(e.code)) { heldGuardKeys.add(e.code); any = true; e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    heldGuardKeys.delete(e.code);
  });
  window.addEventListener('blur', () => heldGuardKeys.clear());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) heldGuardKeys.clear();
  });
  touch?.onFirstGesture(fireFirst);

  return {
    sample(): InputFrame {
      const t = touch;
      const f: InputFrame = {
        left: edges.has('left') || (t?.pressed.left ?? false),
        right: edges.has('right') || (t?.pressed.right ?? false),
        jump: edges.has('jump') || (t?.pressed.jump ?? false),
        attack: edges.has('attack') || (t?.pressed.attack ?? false),
        special: edges.has('special') || (t?.pressed.special ?? false),
        guard: heldGuardKeys.size > 0 || (t?.held.guard ?? false),
      };
      if (t) {
        any = any || Object.values(t.pressed).some(Boolean) || t.held.guard;
        t.clearPressed();
      }
      edges.clear();
      return f;
    },
    anyPressed(): boolean {
      const a = any;
      any = false;
      return a;
    },
    onFirstGesture(cb: () => void): void { firstCb = cb; },
  };
}
