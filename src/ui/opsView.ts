// 구역 작전 화면. 아케이드 4구역 + 특별작전 4. overlay가 onPick으로 입장.

import { OPERATIONS, type OperationCopy } from '../content/world';
import { ICON } from './icons';
import { escapeHtml } from './html';

export function paintOps(
  root: HTMLElement,
  opts: { unlockedChapters: number; allOpen: boolean; act2Cleared: boolean },
  onPick: (id: string) => void,
): void {
  const card = (op: OperationCopy): string => {
    const open = isOpOpen(op, opts);
    // 잠김이면 여는 조건을 적는다 — "잠김"만으로는 무엇을 해야 할지 모른다
    const why = op.gimmick !== 'none' ? '2막을 깨면 열림' : `${op.themeIndex + 1}구역에 닿으면 열림`;
    return `<button type="button" class="op" data-op="${escapeHtml(op.id)}"${open ? '' : ' disabled'}>
      <b>${escapeHtml(op.name)}</b>
      <small>${open ? escapeHtml(op.blurb) : `${ICON.lock}${why}`}</small>
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
    <p class="sec-h">특별작전</p>
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

function isOpOpen(
  op: OperationCopy,
  opts: { unlockedChapters: number; allOpen: boolean; act2Cleared: boolean },
): boolean {
  if (opts.allOpen) return true;
  if (op.gimmick !== 'none') return opts.act2Cleared;
  return op.themeIndex <= opts.unlockedChapters;
}

