// 건뿌 터치 입력 레이어 — Pointer Events 기반 버튼 관리
// 포인터별 상태 추적, 슬라이드 감지, 라이프사이클 관리 (visibilitychange/blur)

export type TouchAction = 'left' | 'right' | 'jump' | 'guard' | 'attack' | 'special';

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

const BUTTON_IDS = {
  left: 'btn-left',
  right: 'btn-right',
  jump: 'btn-jump',
  guard: 'btn-guard',
  attack: 'btn-attack',
  special: 'btn-special',
} as const;

const BUTTON_LABELS = {
  left: '◀',
  right: '▶',
  jump: '점프',
  guard: '가드',
  attack: '공격',
  special: '필살',
} as const;

const BUTTON_PINNED_LABEL = '⬆탈출';

export function initTouchLayer(container: HTMLElement): TouchInput {
  // 상태 초기화
  const held: Record<TouchAction, boolean> = {
    left: false, right: false, jump: false,
    guard: false, attack: false, special: false,
  };
  const pressed: Record<TouchAction, boolean> = {
    left: false, right: false, jump: false,
    guard: false, attack: false, special: false,
  };

  // Pointer 추적: Map<pointerId, action>
  const pointerMap = new Map<number, TouchAction>();

  // 버튼 DOM 요소 생성
  const buttonElements = new Map<TouchAction, HTMLButtonElement>();
  (Object.entries(BUTTON_IDS) as Array<[TouchAction, string]>).forEach(
    ([action, id]) => {
      const btn = document.createElement('button');
      btn.id = id;
      btn.className = 'tbtn';
      btn.textContent = BUTTON_LABELS[action];
      btn.setAttribute('data-action', action);
      container.appendChild(btn);
      buttonElements.set(action, btn);
    }
  );

  // 상태 플래그
  let firstGestureCallback: (() => void) | null = null;
  let firstGestureFired = false;

  // 모든 입력 강제 해제 (고스트 홀드 방지)
  const releaseAll = () => {
    pointerMap.forEach((action) => {
      held[action] = false;
      const btn = buttonElements.get(action);
      if (btn) btn.classList.remove('active');
    });
    pointerMap.clear();
  };

  // Pointer 이벤트 핸들러
  const onPointerDown = (event: PointerEvent) => {
    const btn = (event.target as HTMLElement).closest('.tbtn');
    if (!btn) return;

    const action = btn.getAttribute('data-action') as TouchAction;
    if (!action) return;

    // 첫 제스처 콜백 1회
    if (!firstGestureFired && firstGestureCallback) {
      firstGestureFired = true;
      firstGestureCallback();
    }

    // 이미 다른 포인터로 홀드 중이면 무시
    if (held[action]) return;

    event.preventDefault();
    pointerMap.set(event.pointerId, action);
    held[action] = true;
    pressed[action] = true;
    btn.classList.add('active');
  };

  const onPointerMove = (event: PointerEvent) => {
    const btn = (event.target as HTMLElement).closest('.tbtn');
    const action = pointerMap.get(event.pointerId);

    if (!action) return;

    // 슬라이드 감지: 이동 버튼(left/right)끼리만 경계 통과 시 재발동
    if ((action === 'left' || action === 'right') && btn) {
      const newAction = btn.getAttribute('data-action') as TouchAction;
      if (newAction && (newAction === 'left' || newAction === 'right') && newAction !== action) {
        // 이전 버튼 해제
        const oldBtn = buttonElements.get(action);
        if (oldBtn) oldBtn.classList.remove('active');
        held[action] = false;

        // 새 버튼 활성화
        held[newAction] = true;
        pressed[newAction] = true;
        pointerMap.set(event.pointerId, newAction);
        btn.classList.add('active');
        event.preventDefault();
      }
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    const action = pointerMap.get(event.pointerId);
    if (!action) return;

    pointerMap.delete(event.pointerId);
    held[action] = false;
    const btn = buttonElements.get(action);
    if (btn) btn.classList.remove('active');
    event.preventDefault();
  };

  const onPointerCancel = (event: PointerEvent) => {
    const action = pointerMap.get(event.pointerId);
    if (!action) return;

    pointerMap.delete(event.pointerId);
    held[action] = false;
    const btn = buttonElements.get(action);
    if (btn) btn.classList.remove('active');
    event.preventDefault();
  };

  // 컨테이너에 Pointer 리스너 등록 (캡처)
  container.addEventListener('pointerdown', onPointerDown, true);
  container.addEventListener('pointermove', onPointerMove, true);
  container.addEventListener('pointerup', onPointerUp, true);
  container.addEventListener('pointercancel', onPointerCancel, true);

  // touchmove 차단 (non-passive)
  const onTouchMove = (event: TouchEvent) => {
    if (event.target === container || container.contains(event.target as Node)) {
      event.preventDefault();
    }
  };
  container.addEventListener('touchmove', onTouchMove, { passive: false });

  // Visibility & Blur 핸들러 (라이프사이클)
  const onVisibilityChange = () => {
    if (document.hidden) {
      releaseAll();
    }
  };

  const onWindowBlur = () => {
    releaseAll();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('blur', onWindowBlur);

  // Public API
  return {
    held,
    pressed,

    clearPressed() {
      (Object.keys(pressed) as TouchAction[]).forEach((action) => {
        pressed[action] = false;
      });
    },

    setPinned(pinned: boolean) {
      const btn = buttonElements.get('guard');
      if (btn) {
        btn.textContent = pinned ? BUTTON_PINNED_LABEL : BUTTON_LABELS.guard;
      }
    },

    setLeftHanded(mirror: boolean) {
      if (mirror) {
        container.classList.add('mirror');
      } else {
        container.classList.remove('mirror');
      }
    },

    onFirstGesture(cb: () => void) {
      firstGestureCallback = cb;
    },
  };
}
