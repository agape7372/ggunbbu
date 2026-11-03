// UI 아이콘 — 24 격자 선 아이콘. 크기는 CSS(.ic), 색은 currentColor를 따른다.
// 글자 옆 장식이라 전부 aria-hidden — 뜻은 옆 라벨이 말한다.

const svg = (body: string): string =>
  `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true">${body}</svg>`;

export const ICON = {
  // 보급 상자
  hat: svg('<path d="M4 16a8 8 0 0 1 16 0z"/><path d="M2 20h20M12 8v4"/>'),
  coffee: svg('<path d="M8 2h8v20H8z"/><path d="M8 6h8M8 18h8M12 10v4"/>'),
  gloves: svg('<path d="M6 21v-7l-2-4 2-1 2 3V5h2v6V4h2v7V5h2v7V7h2v8l-2 6zM7 17h9"/>'),
  sack: svg('<path d="M9 3h6l1 5c3 2 4 5 4 8 0 3-2 5-5 5H9c-3 0-5-2-5-5 0-3 1-6 4-8z"/><path d="M8 8h8"/>'),
  // 단추
  next: svg('<path d="m9 6 6 6-6 6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  // 도트판 도구 — 단추엔 아이콘만, 이름은 단추의 aria-label
  pen: svg('<path d="M4 20l1-5L15.5 4.5l4 4L9 19z"/><path d="m13 7 4 4"/>'),
  eraser: svg('<path d="m14 3 7 7-10 10-7-7z"/><path d="m8 9 7 7"/><path d="M11 21h9"/>'),
  bucket: svg('<path d="m3 11 7-7 8 8-7 7z"/><path d="M3 11h14l1 1-7 7z" fill="currentColor"/><path d="M20 14.5c-1.3 2-2 3.1-2 4a2 2 0 0 0 4 0c0-.9-.7-2-2-4z" fill="currentColor"/>'),
  mirror: svg('<path d="M12 3v2M12 8v2M12 13v2M12 18v2" stroke-linecap="butt"/><path d="M9 6v12H3z" fill="currentColor"/><path d="M15 6v12h6z"/>'),
  undo: svg('<path d="M9 5 4 10l5 5"/><path d="M4 10h11a5 5 0 0 1 0 10h-4"/>'),
  trash: svg('<path d="M4 7h16M9 7V4h6v3"/><path d="m6 7 1 13h10l1-13"/><path d="M10 11v5M14 11v5"/>'),
} as const;
