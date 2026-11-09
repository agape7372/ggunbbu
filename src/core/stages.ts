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
  { id: '1-1', region: 0, theme: 'europe', speed: 0, secret: 'noGuard', par: 3060, master: 2280,
    script: 'www wwww wwww wmwww . wwwww mwwww wwmwww . mmwww wmwwww' },
  { id: '1-2', region: 0, theme: 'europe', speed: 0, secret: 'noBreak', par: 3720, master: 2850,
    script: 'hwww whww hwwww . hhww whwww . hhhww mhhmw . whhhww . hhmwww~' },
  { id: '1-B', region: 0, theme: 'europe', speed: 0, secret: 'bellNoCut', par: 5550, master: 1560,
    script: '', boss: 'bell' },
  // ── 2 강턱 시장: 빠른 낙하 · 붙어 오기 · 성급한 건물 ──
  { id: '2-1', region: 1, theme: 'asia', speed: 0.1, secret: 'noJump', par: 3420, master: 2640,
    script: 'wwww wwwww wmwww . www! wwww! . wmwww! wwww! >www! . mwwww! >wmwww! . wmwww! >mwwww!' },
  { id: '2-2', region: 1, theme: 'asia', speed: 0.12, secret: 'noHasty', par: 3750, master: 2880,
    script: 'mwwww mwww~ . mwwww wwww! . hmww wwwww! . mmmww! >mwww~ . hmww >wmwww! . hmww~ . hmmw~' },
  { id: '2-B', region: 1, theme: 'asia', speed: 0.25, secret: 'stall7', par: 3390, master: 2610,
    script: '', boss: 'wind' },
  // ── 3 기와능선: 화산탄(기와) ──
  { id: '3-1', region: 2, theme: 'eastasia', speed: 0.15, secret: 'pile3', par: 4290, master: 3300,
    script: 'R . R . R2 . wwww . R2 . wmww . R3 . wmww . mwwww . R4 . wmwww . R3 . mmwww . R2 . wmwwww+R' },
  { id: '3-2', region: 2, theme: 'eastasia', speed: 0.2, secret: 'quad', par: 4410, master: 3420,
    script: 'R2 . wwmw . R3 . wmwm+R . wwmw . R . R4 . mmwmw . wwwmw . R2 . mhwmm+R .. mwmmw . R . R3 . mwwww+R' },
  { id: '3-B', region: 2, theme: 'eastasia', speed: 0, secret: 'tileZero', par: 4050, master: 3120,
    script: '', boss: 'pagoda' },
  // ── 4 철근 해안: 번개(철근) ──
  { id: '4-1', region: 3, theme: 'modern', speed: 0.2, secret: 'airBolt', par: 4740, master: 3630,
    script: 'Z . Z . Z . wwww . Z2 . wwwww . wwww+Z . wmwww Z2 . wmww+Z . Z3 . wwwww+Z . wmww . wwwww+Z2 . wmww+Z . Z3 Z3 . wwww . wmwwww+Z2' },
  { id: '4-2', region: 3, theme: 'modern', speed: 0.23, secret: 'noSpecial', par: 4020, master: 3090,
    script: 'wmww . Z R2 . wmwww . mwww~ . wmwww! . wmwww R3 . hmwww! . R4 . wmww . hmww+Z . hmwww!+Z . hhmww' },
  { id: '4-B', region: 3, theme: 'modern', speed: 0, secret: 'cargoAir', par: 4680, master: 3600,
    script: '', boss: 'crane' },
  // ── 본사: 전부 섞고 집행기 ──
  { id: 'HQ', region: 4, theme: 'modern', speed: 0.2, secret: 'finishSpecial', par: 9180, master: 7050,
    script: 'mwwww . R2 . mmwww! . R3 . mwww~ . >mwwww! >mwwww! . R4 . Z2 . Z+R2 .. hmwww! ..', boss: 'executor' },
];
