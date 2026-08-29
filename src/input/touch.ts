// Pointer Events 가상 버튼. 제스처(스와이프) 없음 — 홀드+연타+동시 입력 지연을 피한다.
// 버튼 DOM은 #touch-layer 안에 두고, 히트 영역은 CSS가 FIELD_H 아래로 클립한다.
// 왼쪽 점프, 오른쪽 공격/가드/필살. 왼손잡이는 .mirror 로 좌우 스왑.

export type TouchAction = 'jump' | 'guard' | 'attack' | 'special';

export interface TouchInput {
  /** 현재 홀드 중인 버튼들 (레벨) */
  held: Record<TouchAction, boolean>;
  /** 마지막 clearPressed 이후 눌림 엣지 발생한 버튼들 */
  pressed: Record<TouchAction, boolean>;
  /** pressed 플래그 초기화 (sim 루프가 매 프레임 호출) */
  clearPressed(): void;
  /** 가드 상태 → 라벨 '가드' ↔ '⬆탈출' 스왑 */
  setPinned(pinned: boolean): void;
  /** 왼손잡이 모드 → #touch-layer.mirror 토글 */
  setLeftHanded(mirror: boolean): void;
  /** 첫 pointerdown 1회 콜백 (오디오 언락용) */
  onFirstGesture(cb: () => void): void;
}

interface ButtonSpec {
  id: string;
  action: TouchAction;
}

const BUTTON_SPECS: ButtonSpec[] = [
  { id: 'btn-jump', action: 'jump' },
  { id: 'btn-attack', action: 'attack' },
  { id: 'btn-guard', action: 'guard' },
  { id: 'btn-special', action: 'special' },
];

const BUTTON_LABELS: Record<TouchAction, string> = {
  jump: '점프',
  guard: '가드',
  attack: '공격',
  special: '필살',
};

const ACTIONS = Object.keys(BUTTON_LABELS) as TouchAction[];
const ACTION_SET = new Set<string>(ACTIONS);
const BUTTON_PINNED_LABEL = '⬆탈출';

/** 같은 탭이 pointer + 호환 mouse로 두 번 들어오는 기기용 */
const GHOST_MOUSE_MS = 650;
const DUP_DOWN_MS = 32;

interface PointerBind {
  action: TouchAction;
  btn: HTMLElement;
}

export function initTouchLayer(container: HTMLElement): TouchInput {
  const held: Record<TouchAction, boolean> = {
    jump: false, guard: false, attack: false, special: false,
  };
  const pressed: Record<TouchAction, boolean> = {
    jump: false, guard: false, attack: false, special: false,
  };

  const pointerMap = new Map<number, PointerBind>();
  const actionPointers: Record<TouchAction, Set<number>> = {
    jump: new Set(),
    guard: new Set(),
    attack: new Set(),
    special: new Set(),
  };
  const buttonsByAction: Record<TouchAction, HTMLButtonElement[]> = {
    jump: [], guard: [], attack: [], special: [],
  };
  const lastDownAt = new Map<string, number>();

  let firstGestureCallback: (() => void) | null = null;
  let firstGestureFired = false;
  let lastTouchStamp = 0;
  let pinned = false;

  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', '조작');
  for (const spec of BUTTON_SPECS) {
    const btn = ensureButton(container, spec.id, spec.action);
    buttonsByAction[spec.action].push(btn);
  }

  const fireFirst = (): void => {
    if (firstGestureFired || !firstGestureCallback) return;
    firstGestureFired = true;
    firstGestureCallback();
  };

  const setBtnActive = (btn: HTMLElement, on: boolean): void => {
    btn.classList.toggle('active', on);
  };

  const btnStillHeld = (btn: HTMLElement): boolean => {
    for (const bind of pointerMap.values()) {
      if (bind.btn === btn) return true;
    }
    return false;
  };

  const releasePointer = (pointerId: number): void => {
    const bind = pointerMap.get(pointerId);
    if (!bind) return;
    pointerMap.delete(pointerId);
    actionPointers[bind.action].delete(pointerId);
    if (!btnStillHeld(bind.btn)) setBtnActive(bind.btn, false);
    held[bind.action] = actionPointers[bind.action].size > 0;
  };

  const releaseAll = (): void => {
    for (const action of ACTIONS) {
      actionPointers[action].clear();
      held[action] = false;
      for (const btn of buttonsByAction[action]) setBtnActive(btn, false);
    }
    pointerMap.clear();
  };

  const onPointerDown = (event: PointerEvent): void => {
    const btn = (event.target as HTMLElement | null)?.closest?.('.tbtn');
    if (!btn || !container.contains(btn)) return;

    const action = btn.getAttribute('data-action');
    if (!action || !ACTION_SET.has(action)) return;
    const touchAction = action as TouchAction;

    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const now = performance.now();
    if (event.pointerType === 'mouse' && now - lastTouchStamp < GHOST_MOUSE_MS) return;

    const downKey = btn.id || touchAction;
    const prevDown = lastDownAt.get(downKey) ?? 0;
    if (now - prevDown < DUP_DOWN_MS) return;

    if (pointerMap.has(event.pointerId)) return;

    fireFirst();
    event.preventDefault();

    try {
      (btn as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      /* 캡처 불가도 pointerId 추적으로 해제한다 */
    }

    if (event.pointerType === 'touch' || event.pointerType === 'pen') {
      lastTouchStamp = now;
    }
    lastDownAt.set(downKey, now);

    pointerMap.set(event.pointerId, { action: touchAction, btn: btn as HTMLElement });
    actionPointers[touchAction].add(event.pointerId);
    held[touchAction] = true;
    pressed[touchAction] = true;
    setBtnActive(btn as HTMLElement, true);
  };

  const onPointerEnd = (event: PointerEvent): void => {
    if (!pointerMap.has(event.pointerId)) return;
    releasePointer(event.pointerId);
    event.preventDefault();
  };

  const onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  const onTouchMove = (event: TouchEvent): void => {
    if (event.target === container || container.contains(event.target as Node)) {
      event.preventDefault();
    }
  };

  container.addEventListener('pointerdown', onPointerDown, true);
  container.addEventListener('pointerup', onPointerEnd, true);
  container.addEventListener('pointercancel', onPointerEnd, true);
  container.addEventListener('lostpointercapture', onPointerEnd, true);
  container.addEventListener('contextmenu', onContextMenu, true);
  container.addEventListener('touchmove', onTouchMove, { passive: false });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAll();
  });
  window.addEventListener('blur', releaseAll);
  window.addEventListener('pagehide', releaseAll);

  return {
    held,
    pressed,

    clearPressed() {
      for (const action of ACTIONS) pressed[action] = false;
    },

    setPinned(next: boolean) {
      if (pinned === next) return;
      pinned = next;
      const label = pinned ? BUTTON_PINNED_LABEL : BUTTON_LABELS.guard;
      for (const btn of buttonsByAction.guard) {
        btn.textContent = label;
        btn.setAttribute('aria-label', label);
      }
    },

    setLeftHanded(mirror: boolean) {
      container.classList.toggle('mirror', mirror);
    },

    onFirstGesture(cb: () => void) {
      firstGestureCallback = cb;
    },
  };
}

function ensureButton(container: HTMLElement, id: string, action: TouchAction): HTMLButtonElement {
  const existing = container.querySelector<HTMLButtonElement>(`#${id}`);
  const btn = existing ?? document.createElement('button');
  btn.id = id;
  btn.type = 'button';
  btn.className = 'tbtn';
  btn.tabIndex = -1;
  btn.setAttribute('data-action', action);
  btn.setAttribute('aria-label', BUTTON_LABELS[action]);
  btn.textContent = BUTTON_LABELS[action];
  if (btn.parentElement !== container) container.appendChild(btn);
  return btn;
}
