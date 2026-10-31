// 구역 작전 화면. 아케이드 4구역 + 특별작전 4 = 만화 컷 2×2 둘. overlay가 onPick으로 입장.
// 컷 자체가 누르는 단추라 주홍은 쓰지 않는다. 구역 컷 = 층 그림 + 붓글씨 이름, 특별작전 컷 = 목표 · 도장 문턱 · 최고 도장.

import './meta.css';
import { OPERATIONS, regionOf, type OperationCopy } from '../content/world';
import { SCREENS } from '../content/screens';
import { isOpId, type OpGrade, type OpId } from '../meta/ops';
import { escapeHtml } from './html';
import { frameSvg } from './ink';

export interface OpsOpts {
  unlockedChapters: number;
  allOpen: boolean;
  act2Cleared: boolean;
  /** 특별작전 최고 도장 */
  grades: Readonly<Partial<Record<OpId, OpGrade>>>;
}

/** 컷마다 붓 획 굵기를 달리한다(왼 · 위 · 오른 · 아래) */
const FRAMES: readonly [number, number, number, number][] = [
  [9, 3.5, 5.5, 10],
  [5, 6, 9, 4.5],
  [8, 3, 4, 9],
  [4.5, 7, 8, 5.5],
];

export function paintOps(
  root: HTMLElement,
  opts: OpsOpts,
  onPick: (id: string) => void,
): void {
  let n = 0;
  const cut = (op: OperationCopy): string => {
    const i = n++;
    const open = isOpOpen(op, opts);
    const special = isOpId(op.id);
    const name = escapeHtml(op.name);
    // 잠김이면 여는 조건을 적는다 — "잠김"만으로는 무엇을 해야 할지 모른다
    const why = open ? '' : `<small class="op-why">${op.gimmick !== 'none' ? '2막을 깨면 열림' : `${op.themeIndex + 1}구역에 닿으면 열림`}</small>`;
    let body: string;
    if (special) {
      const grade = opts.grades[op.id as OpId];
      const stamp = open && grade
        ? `<i class="seal ink op-grade" aria-label="${SCREENS.ops.bestStamp} ${grade}">${grade}</i>`
        : '';
      const goal = open
        ? `<small>${escapeHtml(SCREENS.ops.goal(op.id as OpId))}</small><small class="op-ladder">${escapeHtml(SCREENS.ops.ladder(op.id as OpId))}</small>`
        : '';
      body = `${stamp}<b class="op-name">${name}</b>${goal}`;
    } else {
      const pic = open
        ? `<img src="./img/floors/${regionOf(op.themeIndex).theme}.png" alt="" loading="lazy" decoding="async" draggable="false">`
        : '';
      body = `<span class="op-pic">${pic}</span><b class="op-name">${name}</b>`;
    }
    return `<button type="button" class="op-cut" data-op="${escapeHtml(op.id)}" style="--i:${i}"${open ? '' : ' disabled'}>
      ${frameSvg(...FRAMES[i % FRAMES.length])}${body}${why}
    </button>`;
  };
  const base = OPERATIONS.filter((o) => o.gimmick === 'none').map(cut).join('');
  const special = OPERATIONS.filter((o) => o.gimmick !== 'none').map(cut).join('');
  root.innerHTML = `
    <h2 class="meta-title">구역 작전</h2>
    <p class="meta-lead">구역을 골라 바로 시작한다. 작전 판은 최고 기록에 안 들어간다.</p>
    <h3 class="op-h" style="--i:0">구역</h3>
    <div class="op-grid">${base}</div>
    <h3 class="op-h" style="--i:4">특별작전 <small>도장 B · A · S</small></h3>
    <div class="op-grid">${special}</div>`;
  root.onclick = (e) => {
    const t = (e.target as HTMLElement).closest('[data-op]') as HTMLButtonElement | null;
    if (!t || t.disabled) return;
    const id = t.getAttribute('data-op');
    const op = OPERATIONS.find((o) => o.id === id);
    if (!op || !isOpOpen(op, opts)) return;
    e.preventDefault();
    onPick(op.id);
  };
}

function isOpOpen(op: OperationCopy, opts: OpsOpts): boolean {
  if (opts.allOpen) return true;
  if (op.gimmick !== 'none') return opts.act2Cleared;
  return op.themeIndex <= opts.unlockedChapters;
}
