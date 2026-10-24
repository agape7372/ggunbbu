// innerHTML 템플릿에 넣는 문자열 이스케이프 — UI 화면들이 같이 쓴다.

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}
