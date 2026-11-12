// innerHTML 템플릿에 넣는 문자열 이스케이프 — UI 화면들이 같이 쓴다.

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

/** 붓글씨 제목 속 숫자 덩어리만 --black으로 감싼다(.bn — 붓글씨 2는 Z로 읽힌다). 나머지는 escapeHtml과 같다 */
export function brushNum(s: string): string {
  return escapeHtml(s).replace(/\d[\d,.:]*/g, (m) => `<span class="bn">${m}</span>`);
}

/** 구석 안내 단추 — 눌러야 펼쳐지는 구입 안내. 네이티브 details라 키보드 · 낭독이 그대로 된다 */
export function infoHtml(lines: readonly string[]): string {
  return '<details class="info"><summary aria-label="구입 안내"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 11v7"/><circle class="d" cx="12" cy="7" r="1.6"/></svg></summary>'
    + `<div class="info-b">${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}</div></details>`;
}
