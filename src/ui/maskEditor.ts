// 도트판 — 상점 가면 「그리기」 · 「새 가면」이 여는 전체 화면 패널. 머리에 이름 칸(최대 10자), 아래에 저장 · (있던 가면이면) 삭제. 16×16 칸을 손가락이나 십자 단추로 찍는다.
// 칸·기본 색·채우기·선·색 값은 meta/mask.ts, 머리에 씌우는 그림은 render/sprites(drawMask)가 정본. 저장은 씬이 받는다(onSave).
// 오버레이층 안 탭 바 위·확인 창 아래에 스스로 붙는다. 판 입력은 이 캔버스와 십자 단추(화살표 키)만 받는다 — 게임판 조작 키는 플레이 중에만 보인다.

import { playSfx } from '../audio/audio';
import { MASK_DRAW, PALETTE } from '../config';
import {
  MASK_CELLS, MASK_N, MASK_NAME_MAX, MASK_SWATCHES, cellHex, cellLine, edgeCell, encodeMask, floodFill, hexCell, hexHsl, hslHex, maskCells,
  maskColors, wornMask,
} from '../meta/mask';
import { SHEET_HEAD_R, drawMask, drawPlayer, playerHead } from '../render/sprites';
import { escapeHtml } from './html';
import { ICON } from './icons';
import './maskEditor.css';

type Tool = 'pen' | 'erase' | 'fill';

/** 여는 가면 — name = 지금 이름(새 가면은 빈칸), fallback = 이름을 비워 두면 붙는 「마스크 N」, isNew면 삭제 단추가 없다 */
export interface MaskEditorInit {
  name: string;
  fallback: string;
  art: string;
  isNew: boolean;
}

export interface MaskEditorHandlers {
  /** 이름은 쳐 넣은 그대로 — 정리(공백 · 길이 · 빈 이름)는 받는 쪽(meta/mask.ts cleanMaskName) */
  onSave(name: string, art: string): void;
  /** 확인 팝업에서 지우기를 누름 */
  onDelete(): void;
  /** 저장 없이 닫힘(닫기·취소·뒤로) */
  onClose(): void;
}

/** 되돌리기 — 획 하나가 한 단계 */
const UNDO_MAX = 20;
/** 닫은 뒤 탭을 삼키는 시간 — 두 번 톡톡 누른 둘째 탭이 밑의 「사기」·탭 바에 닿지 않게 */
const SWALLOW_MS = 350;
/** 십자 단추를 누르고 있으면 — 첫 칸 뒤 이만큼 쉬었다가 이 간격으로 계속 간다(ms) */
const HOLD_WAIT = 320;
const HOLD_EVERY = 85;
/** 십자 단추·화살표 키 → 한 칸 */
const DIRS: Record<string, readonly [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const KEY_DIRS: Record<string, string> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
/** 가운데 단추 이름 = 지금 도구가 그 칸에 하는 일 */
const INK_NAME: Record<Tool, string> = { pen: '찍기', erase: '지우기', fill: '채우기' };
/** 도구 단추 — 아이콘만 보이고 이름은 낭독·마우스 올림용 */
const TOOLS: readonly (readonly [attr: string, icon: string, name: string])[] = [
  ['data-mk-tool="pen"', ICON.pen, '펜'],
  ['data-mk-tool="erase"', ICON.eraser, '지우개'],
  ['data-mk-tool="fill"', ICON.bucket, '채우기'],
  ['data-mk="mirror"', ICON.mirror, '대칭'],
  ['data-mk="undo"', ICON.undo, '되돌리기'],
  ['data-mk="clear"', ICON.trash, '비우기'],
];
/** 「내 색」 칸 수 — 기본 색 아래 한 줄 */
const MINE_N = 6;
const PRESET = new Set(MASK_SWATCHES.map(([hex]) => hex));
/** 처음 고른 색 = 잉크 */
const FIRST_COLOR = '#1a1a20';
/** 빈칸 격자 무늬 — 아이보리 두 톤. 칠한 칸과 구별되게 옅게 */
const CHECK = [PALETTE.BG, '#ECE8DC'];
const GRID = 'rgba(26, 26, 32, 0.12)';
const GUIDE = 'rgba(26, 26, 32, 0.45)';
/** 미리보기(논리 px) — 실제 크기는 서 있는 졸라맨 통째, 3배는 마스크 둘레. maskY = 마스크 가운데 높이 */
const VIEW_1 = { w: 40, h: 78, foot: 72 };
const VIEW_3 = { w: 32, h: 26, zoom: 3, maskY: 11 };

let panel: HTMLElement | null = null;
let closeHook: (() => void) | null = null;
/** 열 때 바꾼 것(창 크기 듣기 · 뒤 화면 inert · 초점)을 되돌린다 */
let release: (() => void) | null = null;
/** 뒤로가기가 도트판보다 먼저 닫을 것(색 만들기 창). 닫았으면 true */
let backHook: (() => boolean) | null = null;

/** 열려 있었으면 저장 없이 닫고 true — 뒤로가기가 먼저 부른다. 색 만들기 창이 떠 있으면 그 창만 닫는다 */
export function closeMaskEditor(): boolean {
  if (!panel) return false;
  if (backHook?.()) return true;
  const after = closeHook;
  teardown();
  after?.();
  return true;
}

function teardown(): void {
  release?.();
  release = null;
  backHook = null;
  const gone = panel;
  panel = null;
  closeHook = null;
  if (!gone) return;
  // 바로 걷으면 둘째 탭이 밑으로 샌다 — 빈 투명 판으로 잠깐 남아 탭을 받아 낸다(inert는 탭을 통과시킨다)
  gone.replaceChildren();
  gone.setAttribute('aria-hidden', 'true');
  gone.classList.add('gone');
  window.setTimeout(() => gone.remove(), SWALLOW_MS);
}

/** 캔버스 CSS px 하나에 든 화면 픽셀 — 무대 배율 × dpr. 아직 배치 전이면 dpr */
function pxPerCss(cv: HTMLCanvasElement, cssW: number): number {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.getBoundingClientRect().width;
  return w > 0 && cssW > 0 ? (w / cssW) * dpr : dpr;
}

export function openMaskEditor(host: HTMLElement, init: MaskEditorInit, h: MaskEditorHandlers): void {
  if (panel) return;
  const art = init.art;
  let cells = maskCells(art);
  let tool: Tool = 'pen';
  let color = FIRST_COLOR;
  let mirror = false;
  const undo: Uint32Array[] = [];
  // 「내 색」 — 그림에 쓴 기본 밖 색(처음 나온 순서)으로 시작하고, 새로 만든 색이 맨 앞에 붙는다
  const mine = maskColors(art).filter((c) => !PRESET.has(c)).slice(0, MINE_N);
  // 지금 긋는 획. before = 획 시작 전 판 — 되돌리기 한 단계이자, 둘째 손가락이 닿으면 돌아갈 자리
  let stroke: { id: number; before: Uint32Array; last: [number, number] | null } | null = null;
  let fingers = 0;
  let blocked = false; // 둘째 손가락으로 획을 버렸다 — 손가락이 다 떨어질 때까지 안 찍는다
  // 십자 단추 칸. inking = 「찍기」를 켠 동안 켜기 전 판(되돌리기 한 단계) — 켜 두면 옮겨 간 칸마다 칠한다
  let cursor: [number, number] = [MASK_N / 2, MASK_N / 2];
  let inking: Uint32Array | null = null;
  // 색 만들기 창 — 떠 있는 동안 판·조작은 쉰다. keep = 연 자리의 미끄럼 값(그 자리 그대로면 지금 색 그대로)
  let picking = false;
  let keep: string | null = null;

  const el = document.createElement('div');
  el.className = 'mk-panel';
  el.tabIndex = -1;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', '도트판');
  const tools = TOOLS.map(([attr, icon, name]) => `<button type="button" ${attr} aria-label="${name}" title="${name}">${icon}</button>`).join('');
  const swatches = MASK_SWATCHES.map(([hex, name]) =>
    `<button type="button" class="mk-sw" data-mk-color="${hex}" style="--c:${hex}" aria-label="${name}"></button>`,
  ).join('');
  const mineSlots = Array.from({ length: MINE_N }, (_, i) => `<button type="button" class="mk-sw mk-mine" data-mk-mine="${i}">${ICON.plus}</button>`).join('');
  const arrow = (dir: string, name: string): string => `<button type="button" data-mk-move="${dir}" aria-label="${name}">${ICON.next}</button>`;
  const slider = (key: string, name: string, max: number): string =>
    `<label class="mk-slide"><span>${name}</span><input type="range" min="0" max="${max}" step="1" data-pick="${key}"></label>`;
  el.innerHTML = `
    <div class="mk-col">
      <header class="mk-head">
        <input class="mk-name uname" type="text" maxlength="${MASK_NAME_MAX}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" aria-label="마스크 이름" placeholder="${escapeHtml(init.fallback)}">
        <button type="button" class="inkseal" data-mk="close">닫기</button>
      </header>
      <div class="mk-views" aria-hidden="true">
        <figure class="mk-view"><canvas data-mk-view="1"></canvas><figcaption>실제 크기</figcaption></figure>
        <figure class="mk-view"><canvas data-mk-view="3"></canvas><figcaption>3배</figcaption></figure>
      </div>
      <div class="mk-board"><canvas data-mk-board width="16" height="16" role="img" aria-label="16칸 도트판"></canvas></div>
      <div class="mk-ctrl">
        <div class="mk-tools" role="toolbar" aria-label="도구">${tools}</div>
        <div class="mk-under">
          <div class="mk-palette" role="group" aria-label="색">${swatches}${mineSlots}</div>
          <div class="mk-side">
            <button type="button" class="mk-make" data-mk="make"><span class="mk-now" aria-hidden="true"></span>색 만들기</button>
            <div class="mk-pad" role="group" aria-label="십자 단추">
              ${arrow('up', '위')}${arrow('left', '왼쪽')}<button type="button" data-mk="ink" aria-pressed="false">찍기</button>${arrow('right', '오른쪽')}${arrow('down', '아래')}
            </div>
          </div>
        </div>
        <div class="mk-foot">
          <button type="button" class="inkseal" data-mk="close">취소</button>
          ${init.isNew ? '' : '<button type="button" class="inkseal" data-mk="del">삭제</button>'}
          <button type="button" class="seal mk-save" data-mk="save"><b>저장</b></button>
        </div>
        <div class="mk-picker" role="group" aria-labelledby="mk-pick-title" hidden>
          <div class="mk-pick-head">
            <h3 id="mk-pick-title">색 만들기</h3>
            <span class="mk-pick-sw" aria-hidden="true"><i data-pick-old></i><i data-pick-new></i></span>
          </div>
          ${slider('h', '색상', 360)}${slider('s', '채도', 100)}${slider('l', '밝기', 100)}
          <div class="mk-foot">
            <button type="button" class="inkseal" data-mk="pick-cancel">취소</button>
            <button type="button" class="seal mk-save" data-mk="pick-ok"><b>이 색으로</b></button>
          </div>
        </div>
      </div>
    </div>`;
  host.appendChild(el);
  panel = el;
  closeHook = h.onClose;
  // 뒤 화면(상점·탭 바)엔 키보드 초점이 못 가게 막고, 닫으면 연 자리로 돌려준다. 확인 창(ov-modal)은 도트판 위에 뜬다
  const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const behind = Array.from(host.children).filter((c): c is HTMLElement =>
    c instanceof HTMLElement && c !== el && !c.inert && !c.classList.contains('ov-modal'));
  for (const c of behind) c.inert = true;

  const q = <T extends Element>(sel: string): T => el.querySelector(sel) as T;
  // 이름 칸 — 글자를 치는 동안 게임 키 · 십자 단추 화살표가 끼지 않게 키를 여기서 끊는다
  const nameEl = q<HTMLInputElement>('.mk-name');
  nameEl.value = init.name;
  nameEl.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') nameEl.blur();
  });
  nameEl.addEventListener('keyup', (e) => e.stopPropagation());
  const board = q<HTMLCanvasElement>('[data-mk-board]');
  const view1 = q<HTMLCanvasElement>('[data-mk-view="1"]');
  const view3 = q<HTMLCanvasElement>('[data-mk-view="3"]');
  const ctrl = q<HTMLElement>('.mk-ctrl');
  const picker = q<HTMLElement>('.mk-picker');
  const slide = {
    h: q<HTMLInputElement>('[data-pick="h"]'),
    s: q<HTMLInputElement>('[data-pick="s"]'),
    l: q<HTMLInputElement>('[data-pick="l"]'),
  };
  let k1 = 1;
  let k3 = 1;
  let bu = 1; // 판 CSS px 하나에 든 비트맵 px

  /** CSS 크기를 정하고 화면 픽셀만큼 비트맵을 잡는다 — 무대가 줄거나 커져도 칸 경계가 번지지 않게 */
  const fit = (cv: HTMLCanvasElement, w: number, hgt: number): number => {
    cv.style.width = `${w}px`;
    cv.style.height = `${hgt}px`;
    const k = pxPerCss(cv, w);
    cv.width = Math.round(w * k);
    cv.height = Math.round(hgt * k);
    return k;
  };

  const layout = (): void => {
    k1 = fit(view1, VIEW_1.w, VIEW_1.h);
    k3 = fit(view3, VIEW_3.w * VIEW_3.zoom, VIEW_3.h * VIEW_3.zoom);
    const css = board.offsetWidth;
    bu = pxPerCss(board, css);
    const px = Math.max(MASK_N, Math.round(css * bu));
    board.width = px;
    board.height = px;
    paint();
  };

  const paintBoard = (): void => {
    const c = board.getContext('2d');
    if (!c) return;
    const W = board.width;
    const at = (i: number): number => Math.round((i * W) / MASK_N);
    const line = Math.max(1, Math.round(bu));
    for (let y = 0; y < MASK_N; y++) {
      for (let x = 0; x < MASK_N; x++) {
        const v = cells[y * MASK_N + x];
        c.fillStyle = v ? cellHex(v) : CHECK[(x + y) % 2];
        c.fillRect(at(x), at(y), at(x + 1) - at(x), at(y + 1) - at(y));
      }
    }
    c.fillStyle = GRID;
    for (let i = 1; i < MASK_N; i++) {
      c.fillRect(at(i), 0, line, W);
      c.fillRect(0, at(i), W, line);
    }
    // 가운데 세로선 — 대칭을 켜면 진하게(접는 자리)
    const mw = mirror ? line * 2 : line;
    c.fillStyle = mirror ? PALETTE.INK : GUIDE;
    c.fillRect(at(MASK_N / 2) - Math.floor(mw / 2), 0, mw, W);
    // 머리 크기 안내 — 판 속 머리(지름 10)가 이 판에서 앉는 자리. 마스크는 머리보다 LIFT만큼 위에 씌운다
    const cell = W / MASK_N;
    const perPx = MASK_N / MASK_DRAW.SIZE;
    c.save();
    c.strokeStyle = GUIDE;
    c.lineWidth = line * 1.5;
    c.setLineDash([line * 4, line * 3]);
    c.beginPath();
    c.arc(W / 2, (MASK_N / 2 + MASK_DRAW.LIFT * perPx) * cell, SHEET_HEAD_R * perPx * cell, 0, Math.PI * 2);
    c.stroke();
    c.restore();
    // 십자 단추 칸 — 잉크 테 + 아이보리 안쪽 테(진한 칸 위에서도 보이게)
    const x0 = at(cursor[0]);
    const y0 = at(cursor[1]);
    const cw = at(cursor[0] + 1) - x0;
    const ch = at(cursor[1] + 1) - y0;
    c.lineWidth = line * 2;
    c.strokeStyle = PALETTE.INK;
    c.strokeRect(x0 + line, y0 + line, cw - line * 2, ch - line * 2);
    c.lineWidth = line;
    c.strokeStyle = PALETTE.BG;
    c.strokeRect(x0 + line * 2.5, y0 + line * 2.5, cw - line * 5, ch - line * 5);
  };

  /** 미리보기 한 칸 — 졸라맨 전역 상태(무기·몸 색)는 건드리지 않는다. 마스크만 그림을 넘겨 그린다 */
  const view = (cv: HTMLCanvasElement, k: number, zoom: number, draw: (c: CanvasRenderingContext2D) => void): void => {
    const c = cv.getContext('2d');
    if (!c) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, cv.width, cv.height);
    c.setTransform(k * zoom, 0, 0, k * zoom, 0, 0);
    draw(c);
  };

  const paintViews = (): void => {
    const now = wornMask(encodeMask(cells)); // 빈 판이면 저장 뒤 머리처럼 견본
    view(view1, k1, 1, (c) => {
      drawPlayer(c, 'idle', 0, VIEW_1.w / 2, VIEW_1.foot);
      drawMask(c, 'idle', 0, VIEW_1.w / 2, VIEW_1.foot, now);
    });
    const [hx, hy] = playerHead('idle', 0) ?? [0, 0];
    const fx = VIEW_3.w / 2 - hx;
    const fy = VIEW_3.maskY - hy + MASK_DRAW.LIFT;
    view(view3, k3, VIEW_3.zoom, (c) => {
      drawPlayer(c, 'idle', 0, fx, fy);
      drawMask(c, 'idle', 0, fx, fy, now);
    });
  };

  const paint = (): void => {
    paintBoard();
    paintViews();
  };

  const sync = (): void => {
    el.querySelectorAll<HTMLElement>('[data-mk-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mkTool === tool)));
    el.querySelectorAll<HTMLElement>('[data-mk-color]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mkColor === color)));
    el.querySelectorAll<HTMLElement>('[data-mk-mine]').forEach((b) => {
      const i = Number(b.dataset.mkMine);
      const c = mine[i];
      b.classList.toggle('empty', !c);
      b.style.setProperty('--c', c ?? 'transparent');
      b.setAttribute('aria-label', c ? `내 색 ${i + 1}` : '색 만들기');
      if (c) b.setAttribute('aria-pressed', String(c === color));
      else b.removeAttribute('aria-pressed'); // 빈 칸은 켜고 끄는 단추가 아니라 색 만들기
    });
    q<HTMLElement>('.mk-now').style.background = color;
    q<HTMLElement>('[data-mk="mirror"]').setAttribute('aria-pressed', String(mirror));
    q<HTMLButtonElement>('[data-mk="undo"]').disabled = undo.length === 0 && !inking; // 찍는 중이면 그 획을 되돌린다
    const inkBtn = q<HTMLElement>('[data-mk="ink"]');
    inkBtn.textContent = INK_NAME[tool];
    inkBtn.setAttribute('aria-pressed', String(inking !== null));
    q<HTMLButtonElement>('[data-mk="clear"]').disabled = !cells.some((v) => v > 0);
  };

  const pushUndo = (before: Uint32Array): void => {
    undo.push(before);
    if (undo.length > UNDO_MAX) undo.shift();
  };

  /** 손가락 자리의 칸 — 판 밖이어도 그쪽 칸 번호 그대로(가장자리까지 잇기에 쓴다) */
  const cellAt = (e: PointerEvent): [number, number] => {
    const r = board.getBoundingClientRect();
    return [Math.floor(((e.clientX - r.left) / r.width) * MASK_N), Math.floor(((e.clientY - r.top) / r.height) * MASK_N)];
  };
  const inBoard = ([x, y]: readonly [number, number]): boolean => x >= 0 && y >= 0 && x < MASK_N && y < MASK_N;

  const put = (x: number, y: number): void => {
    const v = tool === 'erase' ? 0 : hexCell(color);
    cells[y * MASK_N + x] = v;
    if (mirror) cells[y * MASK_N + MASK_N - 1 - x] = v;
  };

  const same = (a: Uint32Array, b: Uint32Array): boolean => a.every((v, i) => v === b[i]);

  /** 「찍기」를 끈다 — 켠 동안 칠한 것이 되돌리기 한 단계 */
  const penUp = (): void => {
    if (inking && !same(inking, cells)) pushUndo(inking);
    inking = null;
  };

  /** 십자 단추 한 칸 — 판 끝에서 멈춘다. 「찍기」가 켜져 있으면 옮겨 간 칸을 칠한다 */
  const step = (dir: string): void => {
    const [dx, dy] = DIRS[dir];
    cursor = [Math.min(MASK_N - 1, Math.max(0, cursor[0] + dx)), Math.min(MASK_N - 1, Math.max(0, cursor[1] + dy))];
    if (inking) put(...cursor);
    paint();
    sync();
  };

  /** 가운데 단추 — 펜·지우개는 「찍기」를 켜고 끈다(켜면 그 칸부터). 채우기는 그 칸에서 한 번 */
  const stamp = (): void => {
    if (tool === 'fill') {
      const before = cells;
      cells = floodFill(cells, cursor[0], cursor[1], hexCell(color));
      if (mirror) cells = floodFill(cells, MASK_N - 1 - cursor[0], cursor[1], hexCell(color));
      if (!same(before, cells)) pushUndo(before);
    } else if (inking) penUp();
    else {
      inking = cells.slice();
      put(...cursor);
    }
  };

  /** 색 고르기 — 지우개였으면 펜으로(그 색으로 찍으려는 것) */
  const choose = (hex: string): void => {
    color = hex;
    if (tool === 'erase') tool = 'pen';
  };

  const slideKey = (): string => `${slide.h.value},${slide.s.value},${slide.l.value}`;
  /** 새 색 — 미끄럼이 연 자리 그대로면 지금 색. 정수 HSL은 왕복하면 색이 살짝 바뀐다(잉크 #1a1a20 → #19191f) */
  const pickHex = (): string =>
    slideKey() === keep ? color : hslHex(Number(slide.h.value), Number(slide.s.value), Number(slide.l.value));

  /** 미끄럼 길 바탕 — 채도·밝기 길은 다른 두 값을 따라 바뀐다(색상 길은 CSS 무지개 고정) */
  const tintPicker = (): void => {
    const [hh, ss, ll] = [slide.h.value, slide.s.value, slide.l.value];
    slide.s.style.setProperty('--track', `linear-gradient(to right, hsl(${hh}, 0%, ${ll}%), hsl(${hh}, 100%, ${ll}%))`);
    slide.l.style.setProperty('--track', `linear-gradient(to right, #000, hsl(${hh}, ${ss}%, 50%), #fff)`);
    q<HTMLElement>('[data-pick-new]').style.background = pickHex();
  };

  /** 색 만들기 창이 판 아래 조작 묶음 자리를 차지한다 — 밑의 단추는 숨긴다(초점·탭·낭독 다 빠지고, 가장자리도 안 비친다).
   *  창 단추가 밑 단추와 같은 자리라 바꾼 직후 잠깐은 묶음이 탭을 안 받는다 — 두 번 톡톡의 둘째 탭이 새 화면을 누르지 않게 */
  let settle = 0;
  const cover = (on: boolean): void => {
    picking = on;
    picker.hidden = !on;
    ctrl.classList.toggle('picking', on);
    ctrl.classList.add('settling');
    window.clearTimeout(settle);
    settle = window.setTimeout(() => ctrl.classList.remove('settling'), SWALLOW_MS);
  };

  const openPicker = (): void => {
    stopHold(); // 마우스로 십자 단추를 누른 채 Enter로 열어도 창 뒤에서 더 가지 않게 — 긋던 획도 여기서 끝
    endStroke();
    sync();
    const [hh, ss, ll] = hexHsl(color);
    // 잉크·흰·회색은 빛깔 폭(채도 × (1 − |2 × 밝기 − 1|))이 10% 밑이라 색상 길을 밀어도 안 바뀐다 → 그 색상의 또렷한 색에서 연다
    const dull = ss * (100 - Math.abs(2 * ll - 100)) < 1000;
    slide.h.value = String(hh);
    slide.s.value = String(dull ? 75 : ss);
    slide.l.value = String(dull ? 50 : ll);
    keep = dull ? null : slideKey();
    q<HTMLElement>('[data-pick-old]').style.background = color;
    cover(true);
    tintPicker();
    slide.h.focus({ preventScroll: true });
  };

  /** 지우기 확인 — 가운데 작은 팝업. 도트판은 그동안 inert */
  let confirmEl: HTMLElement | null = null;
  const closeConfirm = (): boolean => {
    if (!confirmEl) return false;
    confirmEl.remove();
    confirmEl = null;
    el.inert = false;
    q<HTMLElement>('[data-mk="del"]').focus({ preventScroll: true });
    return true;
  };
  const openConfirm = (): void => {
    stopHold();
    endStroke();
    const c = document.createElement('div');
    c.className = 'mk-confirm';
    c.setAttribute('role', 'alertdialog');
    c.setAttribute('aria-modal', 'true');
    c.setAttribute('aria-labelledby', 'mk-del-title');
    c.innerHTML = `<div class="m-card" tabindex="-1">
      <div class="m-band"><div class="m-hd"><h2 class="m-title" id="mk-del-title">지울까요?</h2></div></div>
      <div class="m-body"><p class="uname mk-del-name">${escapeHtml(init.name || init.fallback)}</p><p>마스크 1개가 없어져요.<br>되돌릴 수 없어요.</p></div>
      <div class="m-actions">
        <button type="button" class="btn" data-mk="del-no">취소</button>
        <button type="button" class="btn cta" data-mk="del-yes">지우기</button>
      </div></div>`;
    host.appendChild(c);
    confirmEl = c;
    el.inert = true;
    c.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest('button')?.dataset.mk;
      if (act === 'del-no') { closeConfirm(); playSfx('uiBack'); }
      else if (act === 'del-yes') {
        c.remove();
        confirmEl = null;
        el.inert = false;
        teardown();
        h.onDelete();
      }
    });
    c.querySelector<HTMLElement>('[data-mk="del-no"]')?.focus({ preventScroll: true });
    playSfx('uiBlip');
  };

  const closePicker = (): boolean => {
    if (!picking) return false;
    cover(false);
    q<HTMLElement>('[data-mk="make"]').focus({ preventScroll: true });
    return true;
  };
  backHook = () => closeConfirm() || closePicker();
  picker.addEventListener('input', tintPicker);

  const touch = (e: PointerEvent): void => {
    if (!stroke) return;
    const p = cellAt(e);
    const from = stroke.last ?? p;
    stroke.last = p; // 판 밖 표본도 남긴다 — 밖에서 돌아오면 들어온 가장자리 칸부터 잇는다
    if (inBoard(p)) cursor = p; // 십자 단추는 손가락이 마지막에 짚은 칸에서 잇는다
    if (tool === 'fill') {
      if (!inBoard(p)) return;
      cells = floodFill(cells, p[0], p[1], hexCell(color));
      if (mirror) cells = floodFill(cells, MASK_N - 1 - p[0], p[1], hexCell(color));
    } else if (inBoard(p)) {
      const [x0, y0] = inBoard(from) ? from : edgeCell(p, from);
      for (const [x, y] of cellLine(x0, y0, p[0], p[1])) put(x, y);
    } else if (inBoard(from)) {
      const [x1, y1] = edgeCell(from, p); // 판 밖으로 나가면 나간 가장자리 칸까지
      for (const [x, y] of cellLine(from[0], from[1], x1, y1)) put(x, y);
    } else return; // 밖에서 밖으로 — 칠할 칸이 없다
    paint();
  };

  board.addEventListener('pointerdown', (e) => {
    if (picking) return; // 색 만들기 창이 떠 있으면 판은 쉰다
    e.preventDefault();
    fingers += 1;
    try { board.setPointerCapture(e.pointerId); } catch { /* 이미 떨어진 손가락 */ }
    if (stroke || blocked) {
      // 둘째 손가락 — 이번 획을 시작 전으로 되돌리고, 다 떨어질 때까지 찍지 않는다
      if (stroke) { cells = stroke.before; stroke = null; paint(); sync(); }
      blocked = true;
      return;
    }
    if (inking) { penUp(); sync(); } // 판을 짚으면 「찍기」는 꺼진다 — 손가락 획이 따로 한 단계
    stroke = { id: e.pointerId, before: cells.slice(), last: null };
    playSfx('uiBlip');
    touch(e);
  });
  board.addEventListener('pointermove', (e) => {
    if (!stroke || e.pointerId !== stroke.id || tool === 'fill') return;
    e.preventDefault();
    touch(e);
  });
  /** 긋던 획을 끝낸다 — 바뀐 게 있으면 되돌리기 한 단계 */
  const endStroke = (): void => {
    if (stroke && !same(stroke.before, cells)) pushUndo(stroke.before);
    stroke = null;
  };
  const lift = (e: PointerEvent): void => {
    fingers = Math.max(0, fingers - 1);
    if (fingers === 0) blocked = false;
    if (!stroke || e.pointerId !== stroke.id) return;
    endStroke();
    sync();
  };
  board.addEventListener('pointerup', lift);
  board.addEventListener('pointercancel', lift);

  // 십자 단추 — 누르면 한 칸, 누르고 있으면 계속 간다. 눌러서 옮긴 칸은 click에서 다시 세지 않는다(click은 키보드 Enter만)
  const pad = q<HTMLElement>('.mk-pad');
  let hold = 0;
  const stopHold = (): void => {
    window.clearTimeout(hold);
    hold = 0;
  };
  pad.addEventListener('pointerdown', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-mk-move]');
    const dir = b?.dataset.mkMove;
    if (!b || !dir) return;
    e.preventDefault();
    try { b.setPointerCapture(e.pointerId); } catch { /* 이미 떨어진 손가락 */ }
    stopHold();
    playSfx('uiBlip');
    step(dir);
    const again = (wait: number): void => {
      hold = window.setTimeout(() => { step(dir); again(HOLD_EVERY); }, wait);
    };
    again(HOLD_WAIT);
  });
  pad.addEventListener('pointerup', stopHold);
  pad.addEventListener('pointercancel', stopHold);
  pad.addEventListener('lostpointercapture', stopHold);
  el.addEventListener('keydown', (e) => {
    const dir = KEY_DIRS[e.key];
    if (picking || !dir || e.altKey || e.ctrlKey || e.metaKey) return; // 색 만들기 중 화살표는 미끄럼이 받는다
    e.preventDefault();
    step(dir);
  });

  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b || b.disabled) return;
    const t = b.dataset.mkTool as Tool | undefined;
    const col = b.dataset.mkColor;
    const slot = b.dataset.mkMine;
    const act = b.dataset.mk;
    if (b.dataset.mkMove) {
      if (e.detail === 0) step(b.dataset.mkMove); // 키보드 Enter — 손가락·마우스는 pointerdown이 이미 옮겼다
      return;
    }
    if (act === 'close') {
      cover(false); // 색 만들기 창째 닫는다
      closeMaskEditor();
      return;
    }
    if (act === 'del') { openConfirm(); return; }
    if (act === 'save') {
      const out = encodeMask(cells);
      const name = nameEl.value;
      teardown();
      h.onSave(name, out);
      return;
    }
    if (act === 'make' || (slot !== undefined && !mine[Number(slot)])) {
      openPicker(); // 빈 「내 색」 칸도 색 만들기
      playSfx('uiBlip');
      return;
    }
    if (act === 'pick-cancel') {
      closePicker();
      playSfx('uiBlip');
      return;
    }
    if (act === 'pick-ok') {
      const hex = pickHex();
      choose(hex);
      if (!PRESET.has(hex)) {
        // 내 색 맨 앞으로 — 이미 있으면 자리만 옮긴다. 넘치면 그림에 안 쓴 색 중 오래된 것이 빠진다(다 쓰고 있으면 가장 오래된 것)
        const at = mine.indexOf(hex);
        if (at >= 0) mine.splice(at, 1);
        mine.unshift(hex);
        if (mine.length > MINE_N) {
          const used = new Set(cells);
          let drop = MINE_N;
          for (let i = MINE_N; i > 0; i--) if (!used.has(hexCell(mine[i]))) { drop = i; break; }
          mine.splice(drop, 1);
        }
      }
      closePicker();
    } else if (act === 'ink') stamp();
    else if (t) {
      if (t === 'fill') penUp(); // 채우기는 한 번씩 — 켜 둔 「찍기」를 끈다
      tool = t;
    } else if (col) choose(col);
    else if (slot !== undefined) choose(mine[Number(slot)]);
    else if (act === 'mirror') mirror = !mirror;
    else if (act === 'undo') { penUp(); cells = undo.pop() ?? cells; } // 찍는 중이면 그 획부터 되돌린다
    else if (act === 'clear') { penUp(); pushUndo(cells); cells = new Uint32Array(MASK_CELLS); } // 되돌리기로 살아나니 확인 창 없음
    else return;
    playSfx('uiBlip');
    paint();
    sync();
  });

  const onResize = (): void => layout();
  window.addEventListener('resize', onResize);
  release = () => {
    stopHold();
    confirmEl?.remove();
    confirmEl = null;
    window.removeEventListener('resize', onResize);
    for (const c of behind) c.inert = false;
    if (back?.isConnected) back.focus({ preventScroll: true });
  };
  layout();
  sync();
  el.focus({ preventScroll: true });
}
