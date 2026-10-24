// UI 아이콘 — 24 격자 선 아이콘. 크기는 CSS(.ic), 색은 currentColor를 따른다.
// 글자 옆 장식이라 전부 aria-hidden — 뜻은 옆 라벨이 말한다.

const svg = (body: string): string =>
  `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true">${body}</svg>`;

/** 8각 별 — 필살. 꼭짓점은 반지름 10 / 4.5 교대 */
const BURST = '12,2 13.72,7.84 19.07,4.93 16.16,10.28 22,12 16.16,13.72 19.07,19.07 13.72,16.16 12,22 10.28,16.16 4.93,19.07 7.84,13.72 2,12 7.84,10.28 4.93,4.93 10.28,7.84';

export const ICON = {
  // 탭
  play: svg('<path d="M4 20V10h6v10M10 20V5h9v15M2.5 20h19M13 9h3M13 13h3"/>'),
  missions: svg('<path d="M5 4h14v17H5z"/><path d="M9 4V2.5h6V4"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>'),
  custom: svg('<circle cx="12" cy="6" r="3"/><path d="M12 9v7l-4 5M12 16l4 5M6.5 12h11"/>'),
  shop: svg('<circle cx="12" cy="12" r="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-25 12 12)"/>'),
  settings: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
  // 조작 버튼
  jump: svg('<path d="m6 12 6-6 6 6M6 19l6-6 6 6"/>'),
  attack: svg('<path d="M4 20 20 4M3 13l7-7M11 21l7-7"/>'),
  guard: svg('<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/>'),
  special: svg(`<polygon points="${BURST}"/>`),
  escape: svg('<path d="M4 21h16M12 17V4M7 9l5-5 5 5"/>'),
  // 보조
  pause: svg('<path d="M8.5 5v14M15.5 5v14" stroke-width="3"/>'),
  ad: svg('<path d="M3 5h18v13H3z"/><path d="m10 9 5 2.5-5 2.5z" fill="currentColor"/>'),
  lock: svg('<path d="M5 11h14v10H5z"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  dust: svg('<circle cx="7" cy="15" r="2.5"/><circle cx="15.5" cy="16" r="3"/><circle cx="12" cy="7.5" r="2"/>'),
  orbit: svg('<circle cx="12" cy="12" r="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-25 12 12)"/>'),
  close: svg('<path d="m6 6 12 12M18 6 6 18"/>'),
  next: svg('<path d="m9 6 6 6-6 6"/>'),
} as const;

export type IconName = keyof typeof ICON;
