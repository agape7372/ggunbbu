// 구역 작전 탭. 아케이드 4구역 + 기믹 4. overlay가 onPick으로 입장.

import { OPERATIONS, type OperationCopy } from '../content/world';

export function opsHtml(): string {
  const stamps = OPERATIONS.map((op) =>
    `<button type="button" class="flyer-btn ov-stamp open" data-op="${escapeHtml(op.id)}" style="min-height:44px;font-size:12px;padding:6px 6px">${escapeHtml(op.name)}</button>`,
  ).join('');
  return `<div class="ov-ops" style="max-height:460px;overflow-y:auto">
    <h2>구역 작전</h2>
    <p class="ov-manual-lead">하늘이 던진 구역을 고른다. 기믹은 클리어 후.</p>
    <div data-el="ops" style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${stamps}</div>
  </div>`;
}

export function paintOps(
  root: HTMLElement,
  opts: { unlockedChapters: number; allOpen: boolean; act2Cleared: boolean },
  onPick: (id: string) => void,
): void {
  root.innerHTML = opsHtml();
  root.querySelectorAll<HTMLButtonElement>('[data-op]').forEach((btn) => {
    const id = btn.getAttribute('data-op') ?? '';
    const op = OPERATIONS.find((o) => o.id === id);
    const open = op ? isOpOpen(op, opts) : false;
    btn.disabled = !open;
    btn.classList.toggle('locked', !open);
    btn.classList.toggle('open', open);
    if (op) btn.textContent = open ? op.name : `${op.name} — 잠김`;
  });
  root.onclick = (e) => {
    const t = (e.target as HTMLElement).closest('[data-op]') as HTMLButtonElement | null;
    if (!t || t.disabled) return;
    const id = t.getAttribute('data-op');
    if (!id) return;
    const op = OPERATIONS.find((o) => o.id === id);
    if (!op || !isOpOpen(op, opts)) return;
    e.preventDefault();
    onPick(id);
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}
