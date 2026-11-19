// Pointer Events 가상 버튼. 제스처(스와이프) 없음 — 홀드+연타+동시 입력 지연을 피한다.
// 버튼 DOM은 #touch-layer 안에 두고, 히트 영역은 CSS가 FIELD_H 아래로 클립한다.
// 왼쪽 점프, 오른쪽 공격/가드/필살. 왼손잡이는 .mirror 로 좌우 스왑.
// 버튼 = 먹 덩어리 + 붓글씨 이름표(style.css). 필살은 마름모 — 게이지만큼 먹이 아래에서 차오른다.
// 가드 키는 방어 게이지가 빈 만큼 위에서부터 옅은 먹이 된다(HUD 옆 게이지 대신).

import { ZONE, resolveLayout, spreadSide, type ButtonLayout } from './layout';

export type TouchAction = 'jump' | 'guard' | 'attack' | 'special';

/** 메뉴 키 얼굴 — 먹(보통) · 주홍(인장, 화면에 하나) · 옅음(잠김) · 쉬는 키(점선 테두리만, 눌리지 않는다) */
export type KeyTone = 'ink' | 'seal' | 'faint' | 'rest';
export interface KeyFace { label: string; tone: KeyTone; sub?: string }
export type KeyFaces = Record<TouchAction, KeyFace>;

export interface TouchInput {
  /** 현재 홀드 중인 버튼들 (레벨) */
  held: Record<TouchAction, boolean>;
  /** 마지막 clearPressed 이후 눌림 엣지 발생한 버튼들 */
  pressed: Record<TouchAction, boolean>;
  /** pressed 플래그 초기화 (sim 루프가 매 프레임 호출) */
  clearPressed(): void;
  /** 깔림 상태 → 가드 버튼이 '탈출' 버튼으로 바뀐다 */
  setPinned(pinned: boolean): void;
  /** 가드 가르치기 — 가드 키가 맥동한다(첫 목숨 손실 때 한 번) */
  setGuardHint(on: boolean): void;
  /**
   * 플레이 얼굴의 진한 키(수습 교육판 걸음) — 여기 든 키만 그대로, 나머지는 옅은 먹(f-faint 바탕). 옅어도 눌린다.
   * null = 모두 그대로. 메뉴 얼굴이 떠 있는 동안은 값만 받아 둔다
   */
  setFocus(keys: readonly TouchAction[] | null): void;
  /** 필살 게이지 충전 완료 → 마름모 테두리가 굵어지고 글씨가 뒤집힌다 */
  setSpecialReady(ready: boolean): void;
  /** 필살 게이지(0~100) — 마름모 안 먹 높이. 정수가 바뀔 때만 쓴다 */
  setSpecialFill(p: number): void;
  /** 방어 게이지(0~100) — 가드 키 안 먹. 빈 만큼 위에서부터 옅은 먹. 정수가 바뀔 때만 쓴다 */
  setGuardFill(p: number): void;
  /** 왼손잡이 모드 → #touch-layer.mirror 토글(사용자 배치가 있으면 그 배치를 좌우로 뒤집는다) */
  setLeftHanded(mirror: boolean): void;
  /** 사용자 배치(오른손 기준 무대 좌표) — 키 자리만 바꾼다. null = style.css 기본 배치 */
  setLayout(layout: ButtonLayout | null): void;
  /** 첫 pointerdown 1회 콜백 (오디오 언락용) */
  onFirstGesture(cb: () => void): void;
  /**
   * 메뉴 얼굴(현장 화면). 얼굴이 있는 동안 플레이 상태(필살 채움 · 숨 · 가드 먹 · 맥동 · 탈출)는 감추고 값만 받아 둔다.
   * null = 플레이 얼굴로 되돌린다(받아 둔 상태 그대로). 같은 얼굴이면 아무것도 안 한다.
   */
  setFaces(faces: KeyFaces | null): void;
  /** 메뉴 얼굴이 켜져 있나(setFaces에 얼굴을 받았다) */
  menu(): boolean;
}

interface ButtonSpec {
  id: string;
  action: TouchAction;
}

// 문서 순서 = Tab 순서(메뉴 얼굴일 때만 Tab이 닿는다) — 화면 왼쪽부터: 점프 · 가드 · 공격 · 필살
const BUTTON_SPECS: ButtonSpec[] = [
  { id: 'btn-jump', action: 'jump' },
  { id: 'btn-guard', action: 'guard' },
  { id: 'btn-attack', action: 'attack' },
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
const BUTTON_PINNED_LABEL = '탈출';

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
  let specialReady = false;
  let specialFill = -1;
  let guardFill = -1;
  let layout: ButtonLayout | null = null;
  let leftHanded = false;
  let guardHint = false;
  let focus: readonly TouchAction[] | null = null;
  let focusKey = '';
  let faces: KeyFaces | null = null;
  let facesKey = '';
  /** 키보드 · 보조기기 「누름」(click detail 0)으로 든 가드 — 한 표본만 쥐고 놓는다 */
  let tapGuard = false;

  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', '조작');
  for (const spec of BUTTON_SPECS) {
    const btn = ensureButton(container, spec.id, spec.action);
    buttonsByAction[spec.action].push(btn);
  }

  // 사용자 배치가 있으면 키마다 left/top 을 직접 준다(인라인이 CSS 기본·.mirror 보다 이긴다). 없으면 인라인을 걷어 CSS 로 돌아간다.
  // 넓은 화면 옆 띠로 미는 방향(--sx)은 배치가 없어도 같은 식으로 정한다(style.css .tbtn translate).
  const applyLayout = (): void => {
    const at = resolveLayout(layout, leftHanded);
    for (const action of ACTIONS) {
      for (const btn of buttonsByAction[action]) {
        if (layout) {
          btn.style.left = `${at[action].x - ZONE.x}px`;
          btn.style.top = `${at[action].y - ZONE.y}px`;
        } else {
          btn.style.removeProperty('left');
          btn.style.removeProperty('top');
        }
        btn.style.setProperty('--sx', String(spreadSide(action, at[action].x)));
      }
    }
  };

  const paintSpecialFill = (): void => {
    const v = Math.max(0, specialFill);
    // 마름모(88칸) 아래에서부터 v%만큼 — 채움 쪽만 필터 없는 svg라 다시 그려도 싸다
    const h = (88 * v) / 100;
    for (const btn of buttonsByAction.special) {
      const r = btn.querySelector('.sp-clip');
      r?.setAttribute('y', (88 - h).toFixed(1));
      r?.setAttribute('height', (h + 4).toFixed(1));
      btn.setAttribute('aria-label', `${BUTTON_LABELS.special} ${v}%`);
    }
  };

  /** 플레이 얼굴 — 받아 둔 상태 그대로 다시 입힌다 */
  const paintPlay = (): void => {
    container.classList.remove('menu');
    for (const action of ACTIONS) {
      for (const btn of buttonsByAction[action]) {
        btn.classList.remove('f-ink', 'f-seal', 'f-faint', 'f-rest', 'long');
        btn.removeAttribute('aria-hidden');
        btn.tabIndex = -1;
        const label = action === 'guard' && pinned ? BUTTON_PINNED_LABEL : BUTTON_LABELS[action];
        btn.innerHTML = action === 'special' ? SPECIAL_FACE : `<span>${label}</span>`;
        btn.setAttribute('aria-label', label);
      }
    }
    for (const btn of buttonsByAction.guard) {
      btn.classList.toggle('pinned', pinned);
      btn.classList.toggle('teach', guardHint);
    }
    for (const btn of buttonsByAction.special) btn.classList.toggle('ready', specialReady);
    paintSpecialFill();
    paintFocus();
  };

  /** 수습 교육판 — 이 걸음에 안 쓰는 키는 옅게 */
  const paintFocus = (): void => {
    for (const action of ACTIONS) {
      for (const btn of buttonsByAction[action]) btn.classList.toggle('dim', !!focus && !focus.includes(action));
    }
  };

  const paintFaces = (f: KeyFaces): void => {
    container.classList.add('menu');
    for (const action of ACTIONS) {
      const face = f[action];
      const rest = face.tone === 'rest';
      for (const btn of buttonsByAction[action]) {
        btn.classList.remove('f-ink', 'f-seal', 'f-faint', 'f-rest', 'ready', 'teach', 'pinned', 'dim');
        btn.classList.add(`f-${face.tone}`);
        btn.classList.toggle('long', face.label.length > 3); // 「일어나기 · 한 판 더 · 다음 지시서」 — 글씨를 줄인다(style.css)
        const sub = face.sub ? `<i>${face.sub}</i>` : '';
        const text = face.label ? `<span>${face.label}${sub}</span>` : '';
        btn.innerHTML = action === 'special' ? `${MENU_DIAMOND}${text}` : text;
        btn.tabIndex = rest ? -1 : 0;
        if (rest) {
          btn.setAttribute('aria-hidden', 'true');
          btn.removeAttribute('aria-label');
        } else {
          btn.removeAttribute('aria-hidden');
          btn.setAttribute('aria-label', face.sub ? `${face.label} ${face.sub.replace(/\n/g, ' ')}` : face.label);
        }
      }
    }
  };

  applyLayout();

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
    // 메뉴 얼굴의 가드(다음)는 한 표본 안에 눌렀다 뗀 짧은 탭도 놓치지 않게 다음 표본까지 쥐고 있는다(clearPressed가 놓는다)
    held[bind.action] = actionPointers[bind.action].size > 0 || (bind.action === 'guard' && tapGuard);
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
    if (btn.classList.contains('f-rest')) return; // 쉬는 키는 눌림을 만들지 않는다

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
    if (faces && touchAction === 'guard') tapGuard = true;
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

  // 키보드 · 보조기기 「누름」(click detail 0) = 메뉴 얼굴일 때만 같은 동작. 손가락 · 마우스는 pointerdown 이 맡는다
  const onClick = (event: MouseEvent): void => {
    if (!faces || event.detail !== 0) return;
    const btn = (event.target as HTMLElement | null)?.closest?.('.tbtn');
    const action = btn?.getAttribute('data-action');
    if (!btn || !action || !ACTION_SET.has(action) || btn.classList.contains('f-rest')) return;
    fireFirst();
    pressed[action as TouchAction] = true;
    if (action === 'guard') { held.guard = true; tapGuard = true; }
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
  container.addEventListener('click', onClick);
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
      if (tapGuard) {
        tapGuard = false;
        held.guard = actionPointers.guard.size > 0;
      }
    },

    // 얼굴이 있는 동안은 값만 받아 두고, 플레이 얼굴로 돌아갈 때 paintPlay 가 입힌다
    setPinned(next: boolean) {
      if (pinned === next) return;
      pinned = next;
      if (faces) return;
      const label = pinned ? BUTTON_PINNED_LABEL : BUTTON_LABELS.guard;
      for (const btn of buttonsByAction.guard) {
        btn.innerHTML = `<span>${label}</span>`;
        btn.setAttribute('aria-label', label);
        btn.classList.toggle('pinned', pinned);
      }
    },

    setFocus(keys: readonly TouchAction[] | null) {
      const key = keys ? keys.join() || '-' : '';
      if (key === focusKey) return;
      focusKey = key;
      focus = keys;
      if (!faces) paintFocus();
    },

    setGuardHint(on: boolean) {
      guardHint = on;
      if (faces) return;
      for (const btn of buttonsByAction.guard) btn.classList.toggle('teach', on);
    },

    setSpecialReady(next: boolean) {
      if (specialReady === next) return;
      specialReady = next;
      if (faces) return;
      for (const btn of buttonsByAction.special) btn.classList.toggle('ready', next);
    },

    setSpecialFill(p: number) {
      const v = Math.max(0, Math.min(100, Math.round(p)));
      if (v === specialFill) return;
      specialFill = v;
      if (!faces) paintSpecialFill();
    },

    // --g 는 얼굴과 상관없이 써 둔다 — 메뉴 얼굴에선 CSS(#touch-layer.menu)가 가드 먹을 감춘다
    setGuardFill(p: number) {
      const v = Math.max(0, Math.min(100, Math.round(p)));
      if (v === guardFill) return;
      guardFill = v;
      for (const btn of buttonsByAction.guard) btn.style.setProperty('--g', String(v));
    },

    setLeftHanded(mirror: boolean) {
      leftHanded = mirror;
      container.classList.toggle('mirror', mirror);
      applyLayout();
    },

    setLayout(next: ButtonLayout | null) {
      layout = next;
      applyLayout();
    },

    onFirstGesture(cb: () => void) {
      firstGestureCallback = cb;
    },

    setFaces(next: KeyFaces | null) {
      const key = next ? JSON.stringify(next) : '';
      if (key === facesKey) return;
      facesKey = key;
      faces = next;
      releaseAll();
      if (next) paintFaces(next);
      else paintPlay();
    },

    menu: () => faces !== null,
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
  btn.innerHTML = action === 'special' ? SPECIAL_FACE : `<span>${BUTTON_LABELS[action]}</span>`;
  if (btn.parentElement !== container) container.appendChild(btn);
  return btn;
}

const DIAMOND = 'M44 3 L85 44 L44 85 L3 44 Z';
/** 필살 = 채움 svg(필터 없음 · 게이지마다 바뀜) 위에 테두리·이름표 svg(거친 붓 필터 · 거의 안 바뀜) */
const SPECIAL_FACE = `<svg class="sp-f" viewBox="0 0 88 88" aria-hidden="true">`
  + `<defs><clipPath id="sp-clip"><rect class="sp-clip" x="-4" y="88" width="96" height="4"/></clipPath></defs>`
  + `<path class="sp-ring" d="${DIAMOND}"/>`
  + `<path class="sp-fill" clip-path="url(#sp-clip)" d="${DIAMOND}"/></svg>`
  + `<svg class="sp-o" viewBox="0 0 88 88" aria-hidden="true"><path class="sp-shape" d="${DIAMOND}"/>`
  + `<text class="sp-lbl" x="44" y="52" text-anchor="middle">${BUTTON_LABELS.special}</text></svg>`;
/** 메뉴 얼굴의 마름모 — 테두리만(쉬는 키는 CSS 가 점선으로) */
const MENU_DIAMOND = `<svg class="sp-o" viewBox="0 0 88 88" aria-hidden="true"><path class="sp-shape" d="${DIAMOND}"/></svg>`;
