// 타이틀 구역 도감 — 네 칸. 해금 데이터 = save.unlockedChapters (0~3).

import { REGIONS, SCREENS } from '../content';
import { escapeHtml } from './html';

export interface GalleryStamp {
  index: 0 | 1 | 2 | 3;
  name: string;
  blurb: string;
  open: boolean;
  label: string;
}

/** unlockedChapters = 해금된 최대 챕터 인덱스. 0이면 1구역만 열림. */
export function galleryStamps(unlockedChapters: number): readonly GalleryStamp[] {
  const cap = Math.max(-1, Math.min(3, unlockedChapters | 0));
  return REGIONS.map((r) => {
    const open = r.index <= cap;
    return {
      index: r.index,
      name: r.name,
      blurb: open ? r.blurb : r.locked,
      open,
      label: open ? r.name : SCREENS.title.galleryLocked,
    };
  });
}

export function galleryStampsHtml(unlockedChapters: number): string {
  return galleryStamps(unlockedChapters).map((s) =>
    `<span class="zone${s.open ? ' open' : ''}"><b>0${s.index + 1}</b>${escapeHtml(s.label)}</span>`,
  ).join('');
}

/** `.zones` 노드에 칸을 채운다. overlay paintTitle 연결용. */
export function fillGallery(el: HTMLElement, unlockedChapters: number): void {
  el.innerHTML = galleryStampsHtml(unlockedChapters);
}

