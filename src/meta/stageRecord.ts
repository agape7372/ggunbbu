// 작업 지시서 기록 — 순수 산술. 판정은 core/stage.ts(judgeStage), 글은 content/stages.ts, 저장 키는 storage.ts stages.
// 기록하는 숫자는 정규 하나다(docs/STAGES_2026-10-31.md §4). 견습 · 외주는 램프 한 칸만 남긴다.

import { STAGES } from '../core/stages';
import type { StageResult, StageStamps } from '../core/stage';
import type { StageDiff } from '../core/types';

/** 램프 — 깬 난이도 최고. 0 없음 · 1 견습 · 2 정규 · 3 외주 */
export type Lamp = 0 | 1 | 2 | 3;

export interface StageRecord {
  lamp: Lamp;
  /** 정규 도장 비트(STAMP_KEYS 순서). 한 번 찍힌 도장은 남는다 */
  stamps: number;
  /** 정규 최고 시간(틱). 0 = 정규로 깬 적 없음 */
  best: number;
  /** 정규 최고 점수 · 최고 콤보 */
  score: number;
  combo: number;
  /** 시작 · 깬 횟수(모든 난이도) */
  tries: number;
  clears: number;
  /** 처음 깬 날 'YYYY-MM-DD'(KST). '' = 아직 */
  first: string;
}

export const STAMP_KEYS = ['done', 'safe', 'inTime', 'secret', 'master'] as const satisfies readonly (keyof StageStamps)[];

export function emptyRecord(): StageRecord {
  return { lamp: 0, stamps: 0, best: 0, score: 0, combo: 0, tries: 0, clears: 0, first: '' };
}

export function stampBits(st: StageStamps): number {
  let b = 0;
  STAMP_KEYS.forEach((k, i) => { if (st[k]) b |= 1 << i; });
  return b;
}

export function hasStamp(bits: number, k: (typeof STAMP_KEYS)[number]): boolean {
  return (bits & (1 << STAMP_KEYS.indexOf(k))) !== 0;
}

/** 무엇이 새로 생겼나 — 보고서가 「쿵」을 어디에 찍을지 */
export interface RecordNews {
  firstClear: boolean;
  lampUp: boolean;
  /** 이번에 처음 찍힌 정규 도장 비트 */
  newStamps: number;
  newBest: boolean;
  /** 고치기 전 정규 최고(틱, 0 = 없음) — 「전 기록」 줄 */
  prevBest: number;
}

/** 판 하나 끝 → 새 기록. rec은 바꾸지 않는다 */
export function mergeResult(rec: StageRecord, r: StageResult, today: string): { rec: StageRecord; news: RecordNews } {
  const next: StageRecord = { ...rec };
  const news: RecordNews = { firstClear: false, lampUp: false, newStamps: 0, newBest: false, prevBest: rec.best };
  if (!r.cleared) return { rec: next, news };
  next.clears += 1;
  if (!next.first) { next.first = today; news.firstClear = true; }
  const lamp = (r.diff + 1) as Lamp;
  if (lamp > next.lamp) { next.lamp = lamp; news.lampUp = true; }
  if (r.diff !== 1) return { rec: next, news };
  const bits = stampBits(r.stamps);
  news.newStamps = bits & ~rec.stamps;
  next.stamps |= bits;
  if (!rec.best || r.ticks < rec.best) {
    next.best = r.ticks;
    news.newBest = true;
  }
  next.score = Math.max(next.score, r.score);
  next.combo = Math.max(next.combo, r.peakCombo);
  return { rec: next, news };
}

export function recordOf(recs: Readonly<Record<string, StageRecord>>, id: string): StageRecord {
  return recs[id] ?? emptyRecord();
}

/** 열림 — 지역 안은 차례로, 다음 지역은 앞 지역 명물을 깨면(난이도 무관). 본사 = 4지역 명물 */
export function stageUnlocked(recs: Readonly<Record<string, StageRecord>>, id: string): boolean {
  const i = STAGES.findIndex((d) => d.id === id);
  if (i <= 0) return i === 0;
  return recordOf(recs, STAGES[i - 1].id).lamp > 0;
}

/** 외주는 그 판 정규를 깨면 열린다 */
export function diffUnlocked(rec: StageRecord, diff: StageDiff): boolean {
  return diff < 2 || rec.lamp >= 2;
}

/** 전임자가 끝냈을 때 남아 있던 걸음 수 — 「건물 N채」. 보스판(걸음 하나)은 0 */
export function chaeBehind(splits: readonly number[], master: number): number {
  if (splits.length <= 1) return 0;
  return splits.filter((t) => t > master).length;
}

/** 'YYYY-MM-DD'(KST) — 첫 철거 날짜 */
export function kstDate(ms: number): string {
  return new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 저장 원문 검증 — 알려진 판 id만, 칸마다 clamp. 깨진 칸은 빈 기록으로. 옛 저장의 `code` 칸은 읽지 않고 버린다 */
export function validateStageRecords(v: unknown): Record<string, StageRecord> {
  const out: Record<string, StageRecord> = {};
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return out;
  const ids = new Set(STAGES.map((d) => d.id));
  const n = (x: unknown, max: number): number =>
    typeof x === 'number' && Number.isFinite(x) ? Math.min(Math.max(0, Math.floor(x)), max) : 0;
  for (const [id, raw] of Object.entries(v as Record<string, unknown>)) {
    if (!ids.has(id) || typeof raw !== 'object' || raw === null) continue;
    const o = raw as Record<string, unknown>;
    out[id] = {
      lamp: n(o.lamp, 3) as Lamp,
      stamps: n(o.stamps, 31),
      best: n(o.best, 60 * 60 * 60),
      score: n(o.score, 99_999_999),
      combo: n(o.combo, 999),
      tries: n(o.tries, 9_999_999),
      clears: n(o.clears, 9_999_999),
      first: typeof o.first === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.first) ? o.first : '',
    };
  }
  return out;
}
