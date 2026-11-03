// 버튼 배치 — 설정의 「바꾸기」가 여는 전체 화면 패널. 실제 조작 구역(필드 아래 170)을 그대로 보여 주고 키 넷을 손가락으로 끌어 옮긴다.
// 계산(가두기 · 겹침 · 좌우 뒤집기)은 input/layout.ts 가 정본. 저장은 씬이 받는다(onSave) — 전부 기본 자리면 null.
// 패널은 오버레이층 안에 스스로 붙는다. 좌표는 논리 무대(360×780) 그대로 — 넓은 기기의 좌우 띠(--ov-x)만큼 안쪽으로 앉힌다.

import { playSfx } from '../audio/audio';
import {
  KEY_ACTIONS, KEY_SIZE, ZONE, clampPos, findOverlap, resolveLayout, toStored,
  type ButtonLayout, type FullLayout,
} from '../input/layout';
import type { TouchAction } from '../input/touch';
import './layoutEditor.css';

export interface LayoutEditorHandlers {
  /** layout = 오른손 기준 저장값. null = 기본 배치 */
  onSave(layout: ButtonLayout | null): void;
  /** 저장 없이 닫힘(취소·뒤로) */
  onClose(): void;
}

const LABEL: Record<TouchAction, string> = { jump: '점프', guard: '가드', attack: '공격', special: '필살' };
/** 화살표 키로 옮기는 한 걸음(논리 px) */
const KEY_STEP = 8;
/** 닫은 뒤 탭을 삼키는 시간 — 두 번 톡톡 누른 둘째 탭이 밑 설정 단추에 닿지 않게 */
const SWALLOW_MS = 350;
const KEY_DIRS: Record<string, readonly [number, number]> = {
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
};
const DIAMOND = 'M44 3 L85 44 L44 85 L3 44 Z';

const HINT = '키를 끌어서 옮기세요.';
const NOTE_OVERLAP = '다른 키와 겹쳐 제자리로 돌렸어요.';
const NOTE_DEFAULT = '처음 자리예요. 저장해야 바뀌어요.';
const NOTE_LEFT = '왼손 조작이 켜져 있어 좌우가 뒤집혀 보여요.';

let panel: HTMLElement | null = null;
let closeHook: (() => void) | null = null;
let release: (() => void) | null = null;

/** 열려 있었으면 저장 없이 닫고 true — 뒤로가기가 먼저 부른다 */
export function closeLayoutEditor(): boolean {
  if (!panel) return false;
  const after = closeHook;
  teardown();
  after?.();
  return true;
}

function teardown(): void {
  release?.();
  release = null;
  const gone = panel;
  panel = null;
  closeHook = null;
  if (!gone) return;
  gone.replaceChildren();
  gone.setAttribute('aria-hidden', 'true');
  gone.classList.add('gone');
  window.setTimeout(() => gone.remove(), SWALLOW_MS);
}

function keyFace(a: TouchAction): string {
  if (a !== 'special') return `<span>${LABEL[a]}</span>`;
  return `<svg viewBox="0 0 88 88" aria-hidden="true"><path class="le-dia" d="${DIAMOND}"/>`
    + `<text class="le-lbl" x="44" y="52" text-anchor="middle">${LABEL.special}</text></svg>`;
}

export function openLayoutEditor(
  host: HTMLElement,
  start: { layout: ButtonLayout | undefined; leftHanded: boolean },
  h: LayoutEditorHandlers,
): void {
  if (panel) return;
  const { leftHanded } = start;
  const cur: FullLayout = resolveLayout(start.layout, leftHanded);

  const el = document.createElement('div');
  el.className = 'le-panel';
  el.tabIndex = -1;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'le-title');
  const keys = KEY_ACTIONS.map((a) =>
    `<button type="button" class="tbtn le-key k-${a}" data-le-key="${a}" aria-label="${LABEL[a]}"`
    + ` style="width:${KEY_SIZE[a].w}px;height:${KEY_SIZE[a].h}px">${keyFace(a)}</button>`).join('');
  el.innerHTML = `
    <div class="le-stage">
      <header class="le-head"><h2 id="le-title">버튼 배치</h2></header>
      <p class="le-hint">${HINT}<br>조작 구역 안에 서로 겹치지 않게 놓아요.</p>
      <p class="le-note" role="status" data-le-note>${leftHanded ? NOTE_LEFT : ''}</p>
      <div class="le-foot">
        <button type="button" class="inkseal" data-le="default">기본값</button>
        <button type="button" class="inkseal" data-le="cancel">취소</button>
        <button type="button" class="seal le-save" data-le="save"><b>저장</b></button>
      </div>
      <p class="le-zone-name" aria-hidden="true">조작 구역</p>
      <div class="le-zone" aria-hidden="true" style="top:${ZONE.y}px;height:${ZONE.h}px"></div>
      ${keys}
    </div>`;
  host.appendChild(el);
  panel = el;
  closeHook = h.onClose;
  const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const behind = Array.from(host.children).filter((c): c is HTMLElement =>
    c instanceof HTMLElement && c !== el && !c.inert && !c.classList.contains('ov-modal'));
  for (const c of behind) c.inert = true;

  const stage = el.querySelector<HTMLElement>('.le-stage')!;
  const note = el.querySelector<HTMLElement>('[data-le-note]')!;
  const btn = (a: TouchAction): HTMLElement => el.querySelector<HTMLElement>(`[data-le-key="${a}"]`)!;
  const place = (a: TouchAction): void => {
    const b = btn(a);
    b.style.left = `${cur[a].x}px`;
    b.style.top = `${cur[a].y}px`;
  };
  const say = (text: string): void => { note.textContent = text; };
  for (const a of KEY_ACTIONS) place(a);

  /* ── 끌기 ── */
  let drag: { a: TouchAction; id: number; sx: number; sy: number; ox: number; oy: number; k: number } | null = null;

  const endDrag = (commit: boolean): void => {
    if (!drag) return;
    const { a, ox, oy } = drag;
    const b = btn(a);
    drag = null;
    b.classList.remove('drag', 'bad');
    if (commit && findOverlap(a, cur[a], cur)) {
      cur[a] = { x: ox, y: oy };
      say(NOTE_OVERLAP);
      playSfx('uiDeny');
    } else if (!commit) {
      cur[a] = { x: ox, y: oy };
    } else {
      say(leftHanded ? NOTE_LEFT : '');
      playSfx('uiBlip');
    }
    place(a);
  };

  stage.addEventListener('pointerdown', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-le-key]');
    if (!b || drag) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const a = b.dataset.leKey as TouchAction;
    e.preventDefault();
    try { b.setPointerCapture(e.pointerId); } catch { /* 이미 떨어진 손가락 */ }
    const w = stage.getBoundingClientRect().width;
    drag = { a, id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: cur[a].x, oy: cur[a].y, k: w > 0 ? w / ZONE.w : 1 };
    b.classList.add('drag');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { a, sx, sy, ox, oy, k } = drag;
    cur[a] = clampPos(a, { x: ox + (e.clientX - sx) / k, y: oy + (e.clientY - sy) / k });
    place(a);
    btn(a).classList.toggle('bad', findOverlap(a, cur[a], cur) !== null);
  });
  stage.addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.id) endDrag(true); });
  stage.addEventListener('pointercancel', () => endDrag(false));
  stage.addEventListener('lostpointercapture', () => endDrag(false));

  /* 키보드 — 초점이 있는 키를 화살표로 한 걸음씩 */
  stage.addEventListener('keydown', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-le-key]');
    const dir = KEY_DIRS[e.key];
    if (!b || !dir || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const a = b.dataset.leKey as TouchAction;
    const next = clampPos(a, { x: cur[a].x + dir[0] * KEY_STEP, y: cur[a].y + dir[1] * KEY_STEP });
    if (findOverlap(a, next, cur)) { say(NOTE_OVERLAP); return; }
    cur[a] = next;
    say(leftHanded ? NOTE_LEFT : '');
    place(a);
  });

  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-le]');
    const act = b?.dataset.le;
    if (act === 'cancel') {
      closeLayoutEditor();
    } else if (act === 'save') {
      const out = toStored(cur, leftHanded);
      teardown();
      h.onSave(out);
    } else if (act === 'default') {
      Object.assign(cur, resolveLayout(undefined, leftHanded));
      for (const a of KEY_ACTIONS) place(a);
      say(NOTE_DEFAULT);
      playSfx('uiBlip');
    }
  });

  release = () => {
    drag = null;
    for (const c of behind) c.inert = false;
    if (back?.isConnected) back.focus({ preventScroll: true });
  };
  el.focus({ preventScroll: true });
}
