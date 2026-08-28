// 챕터/막별 배경. PNG가 없으면 단색만 남긴다(호출 전 renderer가 fill).

import type { Act2Phase, Mode } from '../core/types';
import { ACT1, VIEW } from '../config';
import { drawBackdrop } from './assets';

export interface BackdropInput {
  mode: Mode;
  chapter: number;
  act2Phase: Act2Phase | null;
}

export function backdropKey(s: BackdropInput): string {
  if (s.mode === 'bonus') return 'bg-bonus';
  if (s.mode === 'act2') return s.act2Phase === 'moon' ? 'bg-moon' : 'bg-act2';
  const theme = ACT1.CHAPTER_THEMES[((s.chapter % 4) + 4) % 4];
  return `bg-${theme}`;
}

/** 필드(지면 위)에 챕터 배경 PNG를 그린다. 실패 시 false — 단색 폴백이 그대로 보인다. */
export function drawChapterBackdrop(ctx: CanvasRenderingContext2D, s: BackdropInput): boolean {
  return drawBackdrop(ctx, backdropKey(s), 0, 0, VIEW.W, VIEW.FIELD_H);
}
