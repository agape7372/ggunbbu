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
  { id: '1-1', region: 0, theme: 'europe', speed: 0, secret: 'noGuard', par: 2700, master: 2040,
    script: 'www wwww wwwww wmwww . wwww mwwww wwmwww . mmwww wmwwww' },
  { id: '1-2', region: 0, theme: 'europe', speed: 0, secret: 'noBreak', par: 3210, master: 2430,
    script: 'wmwm hwwww whmww hhww mwwww~ . whhww hmwww~ . hhhww . hhmwww~' },
  { id: '1-B', region: 0, theme: 'europe', speed: 0, secret: 'bellNoCut', par: 3660, master: 1110,
    script: '', boss: 'bell' },
  // ── 2 강턱 시장: 빠른 낙하 · 붙어 오기 · 성급한 건물 ──
  { id: '2-1', region: 1, theme: 'asia', speed: 0.15, secret: 'noJump', par: 2580, master: 1980,
    script: 'wmwww . www! wwwww! . wwww >wmwww . mwww! >wwww! . mmww! . mwwww! >wmwww!' },
  { id: '2-2', region: 1, theme: 'asia', speed: 0.12, secret: 'noHasty', par: 3030, master: 2250,
    script: 'mwwww . whmww hmww . mww~ mmwww . hww~ >mmwww! . wmmwww hmwww . hmw~' },
  { id: '2-B', region: 1, theme: 'asia', speed: 0.25, secret: 'stall7', par: 3930, master: 3030,
    script: '', boss: 'wind' },
  // ── 3 기와능선: 화산탄(기와) ──
  { id: '3-1', region: 2, theme: 'eastasia', speed: 0.15, secret: 'pile3', par: 3180, master: 2460,
    script: 'wmww R R2 . wwmww R3 . www+R mwwww . mwww+R . R4 wmwww . R2 . wmwwww+R' },
  { id: '3-2', region: 2, theme: 'eastasia', speed: 0.16, secret: 'quad', par: 2850, master: 2190,
    script: 'wwmww R2 . www+R wmwmw . R3 >mhwmm . wwwmw . R4 mwmmw . wmwm+R' },
  { id: '3-B', region: 2, theme: 'eastasia', speed: 0, secret: 'tileZero', par: 3900, master: 3000,
    script: '', boss: 'pagoda' },
  // ── 4 철근 해안: 번개(철근) ──
  { id: '4-1', region: 3, theme: 'modern', speed: 0.2, secret: 'airBolt', par: 3090, master: 2370,
    script: 'wmww . Z wwmww . Z2 mwww . wwww+Z mmww . Z3 wmww+Z . wwmww+Z2 . wmwww+Z .. wmwwww+Z2' },
  { id: '4-2', region: 3, theme: 'modern', speed: 0.17, secret: 'noSpecial', par: 3270, master: 2310,
    script: 'wmww wwmww . mwww~ R2 . wmwww! Z . wmwww R3 . hmww! . R4 hmww+Z . hmwww!+Z' },
  { id: '4-B', region: 3, theme: 'modern', speed: 0, secret: 'cargoAir', par: 4170, master: 3210,
    script: '', boss: 'crane' },
  // ── 본사: 전부 섞고 집행기 ──
  { id: 'HQ', region: 4, theme: 'modern', speed: 0.12, secret: 'finishSpecial', par: 8070, master: 5580,
    script: 'mwwww R2 . mmwww! R3 . hmww~ >mwwww! >mwwww! . R4 . Z2 .. hmwww! ..', boss: 'executor' },
];
