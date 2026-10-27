// 구역 작전 화면. 아케이드 4구역 + 특별작전 4. overlay가 onPick으로 입장.
// 특별작전 카드에는 목표 한 줄 · 도장 문턱 · 지금까지의 최고 도장이 붙는다.

import { OPERATIONS, type OperationCopy } from '../content/world';
import { SCREENS } from '../content/screens';
import { isOpId, type OpGrade, type OpId } from '../meta/ops';
import { ICON } from './icons';
import { escapeHtml } from './html';

export interface OpsOpts {
  unlockedChapters: number;
  allOpen: boolean;
  act2Cleared: boolean;
  /** 특별작전 최고 도장 */
  grades: Readonly<Partial<Record<OpId, OpGrade>>>;
}

export function paintOps(
  root: HTMLElement,
  opts: OpsOpts,
  onPick: (id: string) => void,
): void {
  const card = (op: OperationCopy): string => {
    const open = isOpOpen(op, opts);
    // 잠김이면 여는 조건을 적는다 — "잠김"만으로는 무엇을 해야 할지 모른다
    const why = op.gimmick !== 'none' ? '2막을 깨면 열림' : `${op.themeIndex + 1}구역에 닿으면 열림`;
    const isSpecial = isOpId(op.id);
    const grade = isSpecial ? opts.grades[op.id as OpId] : undefined;
    const goal = open && isSpecial
      ? `<small class="op-goal">${escapeHtml(SCREENS.ops.goal(op.id as OpId))}</small>`
        + `<small class="op-ladder">${escapeHtml(SCREENS.ops.ladder(op.id as OpId))}</small>`
      : '';
    const stamp = open && grade
      ? `<i class="op-grade" data-g="${grade}" aria-label="${SCREENS.ops.bestStamp} ${grade}">${grade}</i>`
      : '';
    return `<button type="button" class="op" data-op="${escapeHtml(op.id)}"${open ? '' : ' disabled'}>
      ${stamp}<b>${escapeHtml(op.name)}</b>
      <small>${open ? escapeHtml(op.blurb) : `${ICON.lock}${why}`}</small>${goal}
    </button>`;
  };
  const base = OPERATIONS.filter((o) => o.gimmick === 'none').map(card).join('');
  const special = OPERATIONS.filter((o) => o.gimmick !== 'none').map(card).join('');
  root.innerHTML = `
    <header class="sheet-head">
      <h2>구역 작전</h2>
      <p class="sheet-lead">구역을 골라 바로 시작한다. 작전 판은 최고 기록에 안 들어간다.</p>
    </header>
    <p class="sec-h">구역</p>
    <div class="op-grid">${base}</div>
    <p class="sec-h">특별작전 <small>도장 B · A · S</small></p>
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
