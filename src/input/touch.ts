// Pointer Events 가상 버튼. 제스처(스와이프) 없음 — 홀드+연타+동시 입력 지연을 피한다.
// 버튼 DOM은 #touch-layer 안에 두고, 히트 영역은 CSS가 FIELD_H 아래로 클립한다.

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

const BUTTON_IDS: Record<TouchAction, string> = {
  jump: 'btn-jump',
  guard: 'btn-guard',
  attack: 'btn-attack',
  special: 'btn-special',
};

const BUTTON_LABELS: Record<TouchAction, string> = {
  jump: '점프',
  guard: '가드',
  attack: '공격',
  special: '필살',
};

const ACTIONS = Object.keys(BUTTON_IDS) as TouchAction[];
const BUTTON_PINNED_LABEL = '⬆탈출';

/** 같은 탭이 pointer + 호환 mouse로 두 번 들어오는 기기용 */
const GHOST_MOUSE_MS = 650;
const DUP_DOWN_MS = 32;

export function initTouchLayer(container: HTMLElement): TouchInput {
  const held: Record<TouchAction, boolean> = {
    jump: false, guard: false, attack: false, special: false,
  };
  const pressed: Record<TouchAction, boolean> = {
    jump: false, guard: false, attack: false, special: false,
  };

  const pointerMap = new Map<number, TouchAction>();
  const buttonElements = new Map<TouchAction, HTMLButtonElement>();
  const lastDownAt: Record<TouchAction, number> = {
    jump: 0, guard: 0, attack: 0, special: 0,
  };

  let firstGestureCallback: (() => void) | null = null;
  let firstGestureFired = false;
  let lastTouchStamp = 0;
  let pinned = false;

  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', '조작');

  for (const action of ACTIONS) {
    buttonElements.set(action, ensureButton(container, action));
  }

  const fireFirst = (): void => {
    if (firstGestureFired || !firstGestureCallback) return;
    firstGestureFired = true;
    firstGestureCallback();
  };

  const setActive = (action: TouchAction, on: boolean): void => {
    buttonElements.get(action)?.classList.toggle('active', on);
  };

  const releaseAction = (action: TouchAction): void => {
    held[action] = false;
    setActive(action, false);
  };

  const releaseAll = (): void => {
    for (const action of ACTIONS) releaseAction(action);
    pointerMap.clear();
  };

  const onPointerDown = (event: PointerEvent): void => {
    const btn = (event.target as HTMLElement | null)?.closest?.('.tbtn');
    if (!btn || !container.contains(btn)) return;

    const action = btn.getAttribute('data-action') as TouchAction | null;
    if (!action || !(action in BUTTON_IDS)) return;

    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const now = performance.now();
    if (event.pointerType === 'mouse' && now - lastTouchStamp < GHOST_MOUSE_MS) return;
    if (now - lastDownAt[action] < DUP_DOWN_MS) return;

    // 이미 다른 포인터가 홀드 중이면 무시 (두 엄지가 같은 버튼을 밟는 경우)
    if (held[action]) return;

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
    lastDownAt[action] = now;

    pointerMap.set(event.pointerId, action);
    held[action] = true;
    pressed[action] = true;
    setActive(action, true);
  };

  const onPointerEnd = (event: PointerEvent): void => {
    const action = pointerMap.get(event.pointerId);
    if (!action) return;
    pointerMap.delete(event.pointerId);
    releaseAction(action);
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
      const btn = buttonElements.get('guard');
      if (btn) btn.textContent = pinned ? BUTTON_PINNED_LABEL : BUTTON_LABELS.guard;
    },

    setLeftHanded(mirror: boolean) {
      container.classList.toggle('mirror', mirror);
    },

    onFirstGesture(cb: () => void) {
      firstGestureCallback = cb;
    },
  };
}

function ensureButton(container: HTMLElement, action: TouchAction): HTMLButtonElement {
  const id = BUTTON_IDS[action];
  const existing = container.querySelector<HTMLButtonElement>(`#${id}`);
  const btn = existing ?? document.createElement('button');
  btn.id = id;
  btn.type = 'button';
  btn.classList.add('tbtn');
  btn.tabIndex = -1;
  btn.setAttribute('data-action', action);
  btn.setAttribute('aria-label', BUTTON_LABELS[action]);
  if (!btn.textContent) btn.textContent = BUTTON_LABELS[action];
  if (btn.parentElement !== container) container.appendChild(btn);
  return btn;
}
