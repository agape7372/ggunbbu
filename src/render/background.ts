// 챕터/막별 배경. PNG가 없으면 단색만 남긴다(호출 전 renderer가 fill).

import type { Act2Phase, GimmickId, Mode } from '../core/types';
import { ACT1, VIEW } from '../config';
import { drawBackdropCached } from './assets';

export interface BackdropInput {
  mode: Mode;
  chapter: number;
  act2Phase: Act2Phase | null;
  /** 구역작전 기믹 — night면 스카이라인 창을 잉크로 채운 배경을 쓴다. 생략 = none */
  gimmick?: GimmickId;
}

export function backdropKey(s: BackdropInput): string {
  if (s.mode === 'bonus') return 'bg-bonus';
  if (s.mode === 'act2') return s.act2Phase === 'moon' ? 'bg-executor' : 'bg-act2';
  const theme = ACT1.CHAPTER_THEMES[((s.chapter % 4) + 4) % 4];
  return `bg-${theme}`;
}

/**
 * 필드(지면 위)에 챕터 배경 PNG를 그린다. 실패 시 false — 단색 폴백이 그대로 보인다.
 * 배경은 정적이라 오프스크린 1장에 구워 두고 재사용한다(테마·막이 바뀔 때만 다시 굽는다).
 */
export function drawChapterBackdrop(ctx: CanvasRenderingContext2D, s: BackdropInput): boolean {
  return drawBackdropCached(ctx, backdropKey(s), 0, VIEW.FIELD_TOP, VIEW.W, VIEW.FIELD_H - VIEW.FIELD_TOP, s.gimmick === 'night');
}
