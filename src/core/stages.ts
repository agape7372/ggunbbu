// 작업 지시서 판 데이터 — 대본 · 낙하 단계 · 보스 · 기한 · 전임자 · 특기 사항. 글(이름 · 지시서 · 보고서)은 content/stages.ts.
// 레벨 = 데이터(gs-level-design). 구간표 · 가르치는 순서 = docs/STAGES_2026-10-31.md §7.
// par · master 는 정규 기준 틱(60 = 1초). 기한 = 정규 기본 봇 × 1.3, 전임자 = 기본 · 숙련 봇(점프 마중) 중 빠른 쪽. 둘 다 0.5초 단위 올림.
// 대본을 고치면 다시 잰다: MEASURE=1 npx vitest run tests/stage-measure.test.ts -t 기한  (tests/stage.test.ts가 어긋남을 잡는다)

import type { LandmarkId, Theme } from './types';

export type SecretId =
  | 'noGuard' | 'noBreak' | 'noJump' | 'noHasty' | 'pile3' | 'quad' | 'airBolt' | 'noSpecial'
  | 'bellNoCut' | 'stall7' | 'tileZero' | 'cargoAir' | 'finishSpecial';

export interface StageDef {
  id: string;
  /** 0~3 지역 · 4 본사 */
  region: number;
  theme: Theme;
  /** 낙하 단계 0~1 (config STAGE.G · VTERM 위의 자리) */
  speed: number;
  /** 대본(core/script.ts). 보스판은 비어 있다 — 바로 보스 */
  script: string;
  boss?: LandmarkId | 'executor';
  /** 기한 내 도장(정규, 틱) */
  par: number;
  /** 전임자 기록(정규, 틱) */
  master: number;
  secret: SecretId;
}

export const STAGES: readonly StageDef[] = [
  // ── 1 서쪽 회랑: 베기 · 지면 가드 · 정석 ──
  { id: '1-1', region: 0, theme: 'europe', speed: 0, secret: 'noGuard', par: 2730, master: 1680,
    script: 'w ww w wm . ww mw wwm . mm wmw' },
  { id: '1-2', region: 0, theme: 'europe', speed: 0.1, secret: 'noBreak', par: 3000, master: 2310,
    script: 'h wh hw . hh whw . hhh mhhm . whhhw . hhm~' },
  { id: '1-B', region: 0, theme: 'europe', speed: 0, secret: 'bellNoCut', par: 5250, master: 1710,
    script: '', boss: 'bell' },
  // ── 2 강턱 시장: 빠른 낙하 · 붙어 오기 · 성급한 건물 ──
  { id: '2-1', region: 1, theme: 'asia', speed: 0.25, secret: 'noJump', par: 2640, master: 1740,
    script: 'w! ww! >w! . wm! >mw! ww! . www! >ww! >w! . wmw! mwm! . >ww! >ww! >ww!' },
  { id: '2-2', region: 1, theme: 'asia', speed: 0.35, secret: 'noHasty', par: 3360, master: 2220,
    script: 'mm~ wm! hm~ . mmm! >hh~ wmw! . hmh~ >mm! >ww! . hhm! mhm~ . hhh~' },
  { id: '2-B', region: 1, theme: 'asia', speed: 0.25, secret: 'stall7', par: 2880, master: 2220,
    script: '', boss: 'wind' },
  // ── 3 기와능선: 화산탄(기와) ──
  { id: '3-1', region: 2, theme: 'eastasia', speed: 0.4, secret: 'pile3', par: 2580, master: 1950,
    script: 'R . R . R2 . ww R2 . wm . R3 . mm+R . R4 . wmw+R2' },
  { id: '3-2', region: 2, theme: 'eastasia', speed: 0.5, secret: 'quad', par: 2970, master: 2220,
    script: 'R2 wm+R2 . R4 . mmm+R . hm+R2 . R4 R4 . hhm+R3 . mhm~+R2' },
  { id: '3-B', region: 2, theme: 'eastasia', speed: 0, secret: 'tileZero', par: 2460, master: 1890,
    script: '', boss: 'pagoda' },
  // ── 4 철근 해안: 번개(철근) ──
  { id: '4-1', region: 3, theme: 'modern', speed: 0.6, secret: 'airBolt', par: 2040, master: 1560,
    script: 'Z . Z . Z2 . ww Z2 . wm+Z . Z3 . mm+Z2 . Z3 Z3 . wmw+Z2' },
  { id: '4-2', region: 3, theme: 'modern', speed: 0.7, secret: 'noSpecial', par: 2310, master: 1710,
    script: 'hh! Z3 . mm~+R2 . wmw!+Z . >hh! >Z3 . R4+Z . hmh~ . hhh!+Z' },
  { id: '4-B', region: 3, theme: 'modern', speed: 0, secret: 'cargoAir', par: 3060, master: 2340,
    script: '', boss: 'crane' },
  // ── 본사: 전부 섞고 집행기 ──
  { id: 'HQ', region: 4, theme: 'modern', speed: 0.7, secret: 'finishSpecial', par: 7890, master: 6030,
    script: 'mm! Z3 R3 . hmh~ . >ww! >ww! . Z3+R2 . hhh! ..', boss: 'executor' },
];
