// 작업 지시서 지도의 터 그림 — 시안(mock vb.html)의 건물 기호를 인라인 SVG로. 면 색은 CSS 변수 --bf(판의 건물 색, render/sprites THEME_TIERS),
// 선은 먹. 클래스: w = 창(바탕 한지가 비친다) · k = 먹 채움 · l = 선만. 굵기 · 색은 stage.css(.mp-art)가 정한다.

import type { StageDef } from '../core/stages';

const ART = {
  b1: ['0 0 60 70', '<path d="M2 24 L30 4 L58 24 Z"/><path d="M7 24 H53 V70 H7 Z"/><path class="w" d="M14 32h8v8h-8z M38 32h8v8h-8z M14 48h8v8h-8z M38 48h8v8h-8z M26 70 V55 H34 V70 Z"/>'],
  b2: ['0 0 56 66', '<path d="M4 8 H52 V66 H4 Z"/><path d="M2 3 H54 V9 H2 Z"/><path class="w" d="M10 16h8v9h-8z M24 16h8v9h-8z M38 16h8v9h-8z M10 32h8v9h-8z M24 32h8v9h-8z M38 32h8v9h-8z M10 48h8v9h-8z M38 48h8v9h-8z M24 52 h8 v14 h-8z"/>'],
  bell: ['0 0 50 110', '<path d="M25 0 L33 20 H17 Z"/><path d="M14 20 H36 V24 H14 Z"/><path d="M15 24 H35 V44 H15 Z"/><path class="w" d="M20 44 V32 Q25 26 30 32 V44 Z"/><path class="k" d="M22.4 41 Q22.4 33.5 25 33.5 Q27.6 33.5 27.6 41 Z"/><path d="M12 44 H38 V48 H12 Z"/><path d="M13 48 H37 V110 H13 Z"/><circle class="w" cx="25" cy="60" r="7"/><path class="l" d="M25 60 V55.5 M25 60 H28.5"/><path class="w" d="M19 74h4v8h-4z M27 74h4v8h-4z M19 89h4v8h-4z M27 89h4v8h-4z M21 110 V103 Q25 99 29 103 V110 Z"/>'],
  wind: ['0 0 50 110', '<path d="M17 110 L20 34 H30 L33 110 Z"/><path d="M16 34 H34 L25 26 Z"/><path d="M25 26 L23 3 L28 4 Z M25 26 L48 24 L47 29 Z M25 26 L27 49 L22 48 Z M25 26 L2 28 L3 23 Z"/><circle cx="25" cy="26" r="3"/><path class="w" d="M22.5 58h5v7h-5z M22 80h6v7h-6z M21.5 100 h7 v10 h-7z"/>'],
  pag: ['0 0 50 110', '<path d="M24 14.4 V3 H26 V14.4 Z"/><path d="M9.0 108.0V101.0H41.0V108.0ZM4.0 101.0H46.0L42.0 97.6H8.0ZM10.8 97.6V90.6H39.2V97.6ZM5.8 90.6H44.2L40.2 87.2H9.8ZM12.5 87.2V80.2H37.5V87.2ZM7.5 80.2H42.5L38.5 76.8H11.5ZM14.2 76.8V69.8H35.8V76.8ZM9.2 69.8H40.8L36.8 66.4H13.2ZM16.0 66.4V59.4H34.0V66.4ZM11.0 59.4H39.0L35.0 56.0H15.0ZM17.8 56.0V49.0H32.2V56.0ZM12.8 49.0H37.2L33.2 45.6H16.8ZM19.5 45.6V38.6H30.5V45.6ZM14.5 38.6H35.5L31.5 35.2H18.5ZM21.2 35.2V28.2H28.8V35.2ZM16.2 28.2H33.8L29.8 24.8H20.2ZM23.0 24.8V17.8H27.0V24.8ZM18.0 17.8H32.0L28.0 14.4H22.0Z"/><path d="M6 108 H44 V110 H6 Z"/>'],
  crane: ['0 0 80 110', '<path d="M34 22 H42 V110 H34 Z"/><path class="l" d="M34 30 L42 40 L34 50 L42 60 L34 70 L42 80 L34 90 L42 100 L34 110"/><path d="M34 18 L38 5 L42 18 Z"/><path d="M4 18 H78 V23 H4 Z"/><path d="M4 23 H15 V32 H4 Z"/><path d="M42 23 H52 V31 H42 Z"/><path class="l" d="M38 5 L76 18 M38 5 L6 18 M70 23 V46"/><path d="M67 46 h6 v5 h-6z"/>'],
  hq: ['0 0 90 60', '<path d="M30 2 H60 V12 H30 Z"/><path d="M6 12 H84 V60 H6 Z"/><path class="w" d="M13 20h9v8h-9z M28 20h9v8h-9z M53 20h9v8h-9z M68 20h9v8h-9z M13 36h9v8h-9z M28 36h9v8h-9z M53 36h9v8h-9z M68 36h9v8h-9z M40 42 h10 v18 h-10z"/>'],
  rub: ['0 0 64 22', '<path d="M1 22 L5 14 L12 15 L16 7 L24 10 L30 2 L38 8 L44 6 L50 13 L58 14 L63 22 Z"/><path class="l" d="M14 22 L19 15 M32 22 L36 13 M46 22 L50 16"/>'],
} as const satisfies Record<string, readonly [string, string]>;

export type ArtId = keyof typeof ART;

/** 판 → 그림. 보스 판은 명물(StageDef.boss), 나머지는 집 · 건물을 번갈아(지역마다 시작이 다르다) */
export function artOf(d: StageDef, indexInRegion: number): ArtId {
  switch (d.boss) {
    case 'bell': return 'bell';
    case 'wind': return 'wind';
    case 'pagoda': return 'pag';
    case 'crane': return 'crane';
    case 'executor': return 'hq';
    default: return (d.region + indexInRegion) % 2 ? 'b2' : 'b1';
  }
}

/** 인라인 SVG 한 장(읽는 글 없음) */
export function artSvg(id: ArtId, cls = 'mp-art'): string {
  const [box, body] = ART[id];
  return `<svg class="${cls}" viewBox="${box}" aria-hidden="true">${body}</svg>`;
}
