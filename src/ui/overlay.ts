// 표지 / 홈 / 이야기 / 일시정지 / 설정 / 버터바 / 결과 셋(철거 실패 · 작전 결과 · 엔딩) / 미션·상점·작전 겉 틀 + 확인 창 + 알림.
// 콘셉트 「먹 한 획」(style.css 머리말) — 화면은 붓으로 그은 만화 컷이고, 넘어갈 때 칼이 지금 화면을 사선으로 가른다(ui/cut.ts).
// 새 화면은 .anim(처음 들어옴) · .anim2(홈으로 돌아옴)로 차례 등장한다. 같은 화면을 다시 그릴 땐 안무를 떼고 그린다.
// 원작 UI 카피 미사용 — 건뿌 병맛 한국어만.

import type { SaveData, SaveSettings } from '../storage';
import { HAT, SUPPLY, TICK } from '../config';
import { SCREENS, TAGLINE } from '../content';
import { ITEM_COPY, regionOf } from '../content/world';
import type { PlayerPose } from '../core/types';
import { isDefaultLayout } from '../input/layout';
import { FLASH_LABEL, SHAKE_LABEL } from './settings';
import { isDevUnlocked } from '../platform/devUnlock';
import { nativeAppVersion } from '../platform/native';
import { paintOps, type OpsOpts } from './opsView';
import { createStageUi, paintStageEnd, type StageListOpts, type StageUi } from './stageView';
import type { StageEndView } from './stageLogic';
import { STAGE_MODE } from '../content/stages';
import type { StageDiff } from '../core/types';
import { paintMissions } from './missionView';
import { paintShop, type ShopInv } from './shopView';
import { bookPopup, paintBook, type BookMask } from './bookView';
import type { OpGrade } from '../meta/ops';
import { ACHIEVES, DAILY_POOL, dailyDone, licenseTitle } from '../meta';
import { APP_VERSION } from '../version';
import type { DailyState, Loadout, MissionProgress } from '../meta/types';
import { escapeHtml } from './html';
import { countTo, fmt, frameSvg, glyph, installInkVars, reduceMotion, replay, swordSvg } from './ink';
import { CUT, cutFrom, type CutDir } from './cut';
import { paintHero } from './heroArt';

export type OverlayScreen =
  | 'none'
  | 'boot'
  | 'title'
  | 'story'
  | 'pause'
  | 'settings'
  | 'butter'
  | 'gameover'
  | 'opsend'
  | 'ending'
  | 'ops'
  | 'stages'
  | 'stageend'
  | 'missions'
  | 'shop'
  | 'book';

export interface TitleView {
  selected: number;
  tokotonOpen: boolean;
  butterTier: number;
  bestArcade: number;
  bestTokoton: number;
  maxCombo: number;
  unlockedChapters: number;
  buddhaMode: boolean;
  soundOn: boolean;
  /** 지갑 */
  dust: number;
  orbit: number;
  /** 오늘 일일 미션 — total 0이면 미션 도장의 작은 수를 숨긴다 */
  todayDone: number;
  todayTotal: number;
  /** 회차별 최고 점수 (회차 고르기 단추) */
  butterBest: Readonly<Record<number, number>>;
  /** 철거 자격 칭호 — 홈 머리 쪽지 */
  rank: string;
  /** 홈 뿌뿌 그림(장착 그대로) */
  loadout: Loadout;
  maskArt: string;
  /** 홈 건물 그림 = 가장 멀리 연 구역의 층(public/img/floors/<theme>.png) */
  theme: string;
}

export interface GameOverView {
  score: number;
  combo: number;
  /** 이번 판에 벤 건물 수 · 쌓은 먼지 · 도달 구역 이름 */
  buildings: number;
  dustGained: number;
  zone: string;
  /** 다음 목표 한 줄 — 없으면 '' */
  goal: string;
  /** 다음 목표가 무기·마스크면 그 id(칼 그림) */
  goalId?: string;
  canContinue: boolean;
  canRevive: boolean;
  /** 광고 경로 실재 여부 — false(웹)면 광고 문구 없는 "일어나기" (08-30, P0-2) */
  adRevive: boolean;
  reviveLeft: number;
  reviveMax: number;
  line: string;
  /** 이번 판이 그 모드 최고 기록을 넘었나 */
  best: boolean;
  /** 모드 이름 */
  mode: string;
  /** 철거 자격 칭호 */
  rank: string;
  /** 떨어진 건물 조각 그림 = 죽은 구역의 층 */
  theme: string;
}

/** 특별작전 결과 카드 — 한도에 닿았거나 도장을 딴 채 끝난 판 */
export interface OpsEndView {
  /** 작전 이름 */
  name: string;
  /** 이번 판 도장. 없으면 null(시간 종료) */
  grade: OpGrade | null;
  /** 이번 도장이 이전 최고를 넘었나 */
  improved: boolean;
  /** 최고 도장 (이번 판 반영 후) */
  best: OpGrade | null;
  /** 목표 한 줄 */
  goal: string;
  /** 표 — [이름, 값, 크게?]. 첫 줄이 큰 값 */
  rows: readonly [string, string, boolean?][];
  /** 도장 없을 때 다음 도장까지 한 줄 */
  progress: string;
  rank: string;
}

export interface EndingView {
  score: number;
  maxCombo: number;
  fullCombo: boolean;
  /** 이번 판이 최고 기록을 넘었나 */
  best: boolean;
}

/** 이야기 판 진입 연출 — 먹 획 와이프 길이(틱)와 도장 */
export interface StoryOpts {
  wipeTicks?: number;
  stamps?: readonly string[];
}

export interface PauseView {
  score: number;
  combo: number;
}

export interface OverlayHandlers {
  onBoot(): void;
  onArcade(): void;
  onTokoton(): void;
  onButterRound(round: number): void;
  onButterBack(): void;
  onOpenSettings(): void;
  onStorySkip(): void;
  onPauseResume(): void;
  onPauseQuit(): void;
  onSettingsBack(): void;
  onSettingsPatch(p: Partial<SaveSettings>): void;
  /** 설정 「버튼 배치 · 바꾸기」 — 배치 편집 화면은 씬이 연다 */
  onLayoutEdit(): void;
  onGameOverContinue(): void;
  onGameOverRetry(): void;
  onGameOverTitle(): void;
  onGameOverRevive(): void;
  /** 결과 카드의 상점 도장 — 다음 목표를 사러 */
  onGameOverShop(): void;
  onOpsEndList(): void;
  /** 철거 자격 응시 */
  onExam(): void;
  onEndingDone(): void;
  onEndingRetry(): void;
  /** 지금 받을 수 있는 미션 수 — 미션 도장의 먹 점 */
  missionBadge(): number;
  onLogoTap(): void;
  onOpsPick(id: string): void;
  onOpenOps(): void;
  /** 작업 지시서 */
  onOpenStages(): void;
  onStageStart(id: string, diff: StageDiff, fromBoss: boolean): void;
  /** 철거 보고서 단추 */
  onStageRetry(): void;
  onStageNext(): void;
  onStageList(): void;
  onOpenMissions(): void;
  onOpenShop(): void;
  onOpenBook(): void;
  onMetaBack(): void;
  onClaimMission(id: string, boost: boolean): void;
  onBuySku(id: string): void;
  onAdOrbit(): void;
  onUnlockOrbit(id: string): void;
  onUnlockDust(id: string): void;
  onExchangeDust(): void;
  onEquip(slot: string, id: string): void;
  /** 상점 마스크 「그리기」 — 도트판은 씬이 연다 */
  onMaskEdit(): void;
  onHowtoDone(): void;
  onResetData(): void;
}

export interface OverlayApi {
  getScreen(): OverlayScreen;
  showBoot(): void;
  showTitle(v: TitleView): void;
  setTitleSelected(index: number): void;
  showStory(lines: readonly string[], opts?: StoryOpts): void;
  showPause(v: PauseView): void;
  showSettings(s: SaveSettings, fromPause: boolean): void;
  showButterPick(tier: number): void;
  showGameOver(v: GameOverView): void;
  showOpsEnd(v: OpsEndView): void;
  showEnding(v: EndingView): void;
  showOps(opts: OpsOpts): void;
  /** 작업 지시서 목록. detail = 지시서 한 장으로 바로 */
  showStages(opts: StageListOpts, detail?: string): void;
  /** 지시서 화면 안에서 한 칸 물러난다. 이미 목록이면 false */
  stagesBack(): boolean;
  showStageEnd(v: StageEndView): void;
  showMissions(daily: DailyState, achieves: MissionProgress[], adBoost: boolean): void;
  showShop(inv: ShopInv, owned: ReadonlySet<string>, paths: { iap: boolean; ad: boolean }): void;
  /** 도감. masks = 가진 가면들(없으면 저장된 가면 그림 하나) */
  showBook(inv: { loadout: Loadout; maskArt: string }, owned: ReadonlySet<string>, masks?: readonly BookMask[]): void;
  /** 조작 안내 창. first = 첫 실행(닫으면 onHowtoDone) */
  showHowto(first: boolean): void;
  /** 확인 창이 떠 있나 — 뒤로가기가 창부터 닫는다 */
  modalOpen(): boolean;
  closeModal(): void;
  toast(text: string): void;
  hide(): void;
}

const TOAST_MS = 2400;
const QUIT_CONFIRM_MS = 3000;
const SHAKE_MS = 900;
/** 결과 점수는 조각이 떨어지고 도장이 찍힌 뒤 굴러 올라간다(style.css 결과 안무 1.55초) */
const SCORE_ROLL_AT = 1550;
const SCORE_ROLL_MS = 750;

/** 홈 뿌뿌 — 가만히 · 두 번째 누름(벤다) · 네 번째부터(뻗는다, 더는 안 받아 준다) */
const HERO_IDLE: PlayerPose = 'idle';
const HERO_SLASH: PlayerPose = 'attack';
const HERO_DOWN: PlayerPose = 'dead';
const HERO_IDLE_MS = 6000;

const RESULTS: ReadonlySet<OverlayScreen> = new Set(['gameover', 'opsend', 'ending', 'stageend']);
const METAS: ReadonlySet<OverlayScreen> = new Set(['shop', 'missions', 'settings', 'book', 'stages']);

/** 어느 화면에서 어느 화면으로 가면 어느 쪽으로 베나. null = 베지 않고 바로(일시정지 · 판 ↔ 이야기) */
function cutDir(from: OverlayScreen, to: OverlayScreen): CutDir | null {
  if (from === to || to === 'boot' || to === 'pause') return null;
  if (from === 'pause' && to !== 'title') return null;
  if ((from === 'none' && to === 'story') || (from === 'story' && to === 'none')) return null;
  if (RESULTS.has(to)) return CUT.DOWN;
  if (to === 'title') {
    if (from === 'boot') return CUT.UP;
    return RESULTS.has(from) || from === 'pause' || from === 'none' || from === 'story' ? CUT.DOWN : CUT.HOME;
  }
  if (METAS.has(to)) return CUT.META;
  return CUT.UP;
}

export function ensureOverlayLayer(): HTMLElement {
  let el = document.getElementById('overlay-layer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'overlay-layer';
    el.className = 'ui-layer';
    document.getElementById('stage')?.appendChild(el);
  }
  return el;
}

/* ── 그림 조각(시안 f1-ink 그대로) ───────────────────────── */

/** 제목 「건뿌!!」 — 글꼴이 아니라 붓 획 17개 + 느낌표 넷 */
const TITLE_SVG = `<svg class="h-title" viewBox="0 0 600 248" role="img" aria-label="건뿌!!" data-act="logo">
  <path class="s" pathLength="1" style="--d:.05s" stroke-width="24" d="M24 52 Q70 40 118 44 L90 136"/>
  <path class="s" pathLength="1" style="--d:.2s" stroke-width="16" d="M132 98 Q150 94 166 100"/>
  <path class="s" pathLength="1" style="--d:.3s" stroke-width="26" d="M178 14 Q182 80 176 158"/>
  <path class="s" pathLength="1" style="--d:.44s" stroke-width="22" d="M42 148 Q44 180 50 212 Q100 214 162 206"/>
  <path class="h" pathLength="1" style="--d:.44s" d="M64 208 Q100 210 148 204"/>
  <path class="s" pathLength="1" style="--d:.6s" stroke-width="20" d="M268 26 L262 118"/>
  <path class="s" pathLength="1" style="--d:.68s" stroke-width="20" d="M334 22 L338 118"/>
  <path class="s" pathLength="1" style="--d:.76s" stroke-width="14" d="M262 72 L340 68"/>
  <path class="s" pathLength="1" style="--d:.84s" stroke-width="18" d="M256 118 L346 114"/>
  <path class="s" pathLength="1" style="--d:.94s" stroke-width="20" d="M372 24 L366 118"/>
  <path class="s" pathLength="1" style="--d:1.02s" stroke-width="20" d="M448 20 L452 118"/>
  <path class="s" pathLength="1" style="--d:1.1s" stroke-width="14" d="M366 70 L452 66"/>
  <path class="s" pathLength="1" style="--d:1.18s" stroke-width="18" d="M360 118 L460 113"/>
  <path class="s" pathLength="1" style="--d:1.3s" stroke-width="26" d="M250 156 Q360 146 470 150"/>
  <path class="h" pathLength="1" style="--d:1.3s" d="M296 155 Q360 148 436 151"/>
  <path class="s" pathLength="1" style="--d:1.44s" stroke-width="26" d="M362 158 Q366 192 360 232"/>
  <polygon class="x" style="--d:1.56s" points="492,14 524,20 508,152 494,150"/>
  <polygon class="x" style="--d:1.62s" points="486,174 516,172 518,204 488,206"/>
  <polygon class="x" style="--d:1.68s" points="546,8 580,16 564,150 548,146"/>
  <polygon class="x" style="--d:1.74s" points="540,172 572,170 574,202 542,204"/>
</svg>`;

/** 떨어지는 건물 뒤 속도선 다섯 */
const LINES_SVG = `<svg class="h-lines" viewBox="0 0 60 200" aria-hidden="true">
  <path pathLength="1" style="--d:.55s" stroke-width="3.2" d="M50 4 L24 68"/>
  <path pathLength="1" style="--d:.62s" stroke-width="2" d="M57 42 L32 112"/>
  <path pathLength="1" style="--d:.7s" stroke-width="4" d="M44 92 L14 162"/>
  <path pathLength="1" style="--d:.78s" stroke-width="2.2" d="M58 124 L38 192"/>
  <path pathLength="1" style="--d:.86s" stroke-width="3" d="M30 0 L8 52"/>
</svg>`;

/** 지붕 능선 — 직접 그은 먹 선 + 바닥 붓 획 */
const RIDGE_SVG = `<svg class="h-ridge" viewBox="0 0 400 70" preserveAspectRatio="none" aria-hidden="true">
  <path pathLength="1" style="--d:0s" stroke-width="5" d="M24 22 L94 20"/>
  <path pathLength="1" style="--d:.04s" stroke-width="3.4" d="M26 22 Q14 34 -4 42 Q-8 40 -10 34 M92 20 Q104 32 120 40 Q124 38 126 32"/>
  <path pathLength="1" style="--d:.1s" stroke-width="2.2" d="M-2 44 Q58 48 118 42 M4 46 L6 58 M112 44 L112 58"/>
  <path pathLength="1" style="--d:.14s" stroke-width="1.6" d="M40 30 L50 40 M58 28 L68 38 M76 27 L86 37"/>
  <path pathLength="1" style="--d:.1s" stroke-width="3.4" d="M134 34 L206 32"/>
  <path pathLength="1" style="--d:.14s" stroke-width="2.6" d="M136 34 Q124 44 112 50 M204 32 Q216 42 230 48 Q234 46 236 40"/>
  <path pathLength="1" style="--d:.2s" stroke-width="2" d="M114 52 Q170 55 228 50 M230 50 L230 58"/>
  <path pathLength="1" style="--d:.16s" stroke-width="2.8" d="M158 33 L158 16 L170 15 L171 32"/>
  <path pathLength="1" style="--d:.18s" stroke-width="5" d="M248 26 L312 24"/>
  <path pathLength="1" style="--d:.22s" stroke-width="3.4" d="M250 26 Q238 38 224 46 Q220 44 218 38 M310 24 Q322 36 338 44 Q342 42 344 36"/>
  <path pathLength="1" style="--d:.28s" stroke-width="2.2" d="M226 48 Q280 52 336 46 M336 47 L337 58"/>
  <path pathLength="1" style="--d:.3s" stroke-width="1.6" d="M262 34 L272 44 M282 32 L292 42 M300 31 L310 41"/>
  <path pathLength="1" style="--d:.26s" stroke-width="3" d="M352 38 L396 36"/>
  <path pathLength="1" style="--d:.3s" stroke-width="2.6" d="M354 38 Q344 46 332 52 M394 36 Q402 44 412 50"/>
  <path pathLength="1" style="--d:.34s" stroke-width="2" d="M334 54 Q372 57 410 52"/>
  <path class="gnd" d="M-6 58 Q200 53 406 60 L406 64 Q200 67 -6 68 Z"/>
</svg>`;

/** 건물 아래 왼쪽 모서리에서 흘러내리는 갈필 세 가닥 */
const DRIPS_SVG = '<svg viewBox="0 0 72 60" aria-hidden="true"><path d="M4 0 L15 0 L11 58 Z"/><path d="M22 0 L31 0 L28 42 Z"/><path d="M39 0 L47 0 L45 30 Z"/></svg>';

/** 건물 밑에 깔린 뿌뿌(직접 그은 먹 선) */
const CRUSHED_SVG = `<svg class="g-man" viewBox="0 0 300 130" role="img" aria-label="깔린 뿌뿌">
  <path class="bl" d="M34 62 L42 70 L8 22 L4 18 Z"/><path class="bl" d="M26 58 L38 72 L34 75 L22 61 Z"/>
  <g class="ln"><circle cx="150" cy="78" r="17"/><path d="M133 84 L40 68"/><path d="M167 84 L262 66"/><path d="M140 93 L52 120"/><path d="M160 93 L246 122"/><circle cx="40" cy="68" r="4"/></g>
</svg>`;
const CLOUD_SVG = '<svg class="g-cloud" viewBox="0 0 110 64" aria-hidden="true"><path d="M12 60 Q-2 44 16 36 Q12 14 38 18 Q50 0 70 14 Q94 8 94 32 Q112 40 98 58 Q80 66 60 60 Q36 66 12 60 Z"/></svg>';

/** 엔딩 — 민들레 하나 + 날아가는 홀씨 넷 */
const SEEDS_SVG = `<svg class="e-seeds" viewBox="0 0 200 300" aria-hidden="true">
  <path pathLength="1" style="--d:0s" d="M70 300 Q76 230 66 168"/>
  <circle pathLength="1" style="--d:.2s" cx="66" cy="158" r="9"/>
  <path pathLength="1" style="--d:.34s" d="M66 158 L48 132 M66 158 L62 126 M66 158 L80 128 M66 158 L94 140 M66 158 L40 150"/>
  <path pathLength="1" style="--d:.5s" d="M120 120 L112 138 M120 120 L110 108 M120 120 L121 104 M120 120 L131 109"/>
  <path pathLength="1" style="--d:.62s" d="M156 70 L150 86 M156 70 L147 59 M156 70 L157 55 M156 70 L166 60"/>
  <path pathLength="1" style="--d:.74s" d="M178 150 L171 165 M178 150 L169 140 M178 150 L180 136 M178 150 L188 142"/>
  <path pathLength="1" style="--d:.86s" d="M136 32 L131 45 M136 32 L128 24 M136 32 L138 20 M136 32 L145 26"/>
</svg>`;

const SPLATS = '<i class="spl" style="--tx:-74px;--ty:-60px"></i><i class="spl" style="--tx:72px;--ty:-54px"></i>'
  + '<i class="spl" style="--tx:-66px;--ty:58px"></i><i class="spl" style="--tx:78px;--ty:50px"></i>';

const CLOSE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4 L20 20 M20 4 L4 20"/></svg>';

/** 켬·끔 = 도장을 찍고 뗀다 */
const tog = (act: string, label: string): string =>
  `<button type="button" class="set-tog" data-act="${act}" aria-pressed="false"><span>${label}</span><i class="tog" data-el="${act}">끔</i></button>`;

/** 세 단계 고르기 — 원하는 칸을 바로 누른다. 고른 칸은 paintLevel이 칠한다 */
function levelRow(act: string, name: string, labels: readonly string[]): string {
  const segs = labels.map((l, i) => `<button type="button" data-act="${act}" data-v="${i}">${l}</button>`).join('');
  return `<div class="set-level"><span>${name}</span><span class="seg" role="group" aria-label="${name}" data-el="${act}">${segs}</span></div>`;
}

function paintLevel(seg: HTMLElement, level: number): void {
  seg.querySelectorAll('button').forEach((b, i) => {
    b.classList.toggle('on', i === level);
    b.setAttribute('aria-pressed', String(i === level));
  });
}

function levelOf(el: HTMLElement): 0 | 1 | 2 {
  const v = Number(el.getAttribute('data-v'));
  return v === 0 || v === 1 ? v : 2;
}

/** 미션·상점·작전 겉 틀 — 안(.ov-body)은 각 화면 그리기가 채운다. 맨 아래 = 가는 길 도장 줄 */
function metaScreen(name: string, frame: string, stamp: string, right: string): string {
  return `<div class="ov-screen ov-meta" data-screen="${name}" hidden>
      ${frame}
      <div class="ov-body" data-el="body-${name}"></div>
      <nav class="ov-nav" aria-label="가는 길"><button type="button" class="inkseal" data-act="meta-back">홈</button><span class="nav-stamp">${stamp}</span>${right}</nav>
    </div>`;
}

const toMissions = '<button type="button" class="inkseal" data-act="tab-missions" data-badge-host>미션<b class="dot" data-badge hidden></b></button>';
const toShop = '<button type="button" class="inkseal" data-act="tab-shop">상점</button>';
const toBook = '<button type="button" class="inkseal" data-act="tab-book">도감</button>';
/** 가는 길 줄 오른쪽 도장 둘 */
const navPair = (a: string, b: string): string => `<span class="nav-pair">${a}${b}</span>`;

const HOWTO_ROWS: readonly { key: string; name: string; desc: string }[] = [
  { key: 'k-atk', name: '공격', desc: '닿은 층을 벤다. 이어 베면 콤보.' },
  { key: 'k-jmp', name: '점프', desc: '한 번 누르면 한 번 뛴다.' },
  { key: 'k-grd', name: '가드', desc: '떨어지는 건물을 튕겨 올린다. 막대만큼.' },
  { key: 'k-sp', name: '필살', desc: '마름모에 먹이 다 차면 쓴다.' },
];

export function mountOverlay(root: HTMLElement, h: OverlayHandlers): OverlayApi {
  installInkVars();
  const m = SCREENS.menu;
  root.innerHTML = `
    <div class="ov-screen ov-boot" data-screen="boot" data-act="boot">
      ${frameSvg(9, 3.5, 5.5, 10)}
      <img class="boot-mark" src="./icons/icon-192.png" alt="" draggable="false" />
      <p class="boot-tag">${TAGLINE}</p>
      <p class="boot-hint">누르면 시작</p>
    </div>

    <div class="ov-screen ov-home" data-screen="title" hidden>
      ${frameSvg(9, 3.5, 5.5, 10)}
      <div class="h-top">
        <div class="h-cap" data-el="title-rank"></div>
        <div class="h-bld"><img data-el="title-bld" src="./img/floors/europe.png" alt="" draggable="false">${DRIPS_SVG}</div>
        ${LINES_SVG}
        ${TITLE_SVG}
        ${RIDGE_SVG}
        <div class="h-ppu" data-el="ppu"><canvas data-el="ppu-cv" aria-hidden="true"></canvas></div>
        <div class="h-bub" data-el="bub" aria-hidden="true"></div>
        <button type="button" class="h-ppu-hit" data-act="ppu" aria-label="뿌뿌"></button>
      </div>
      <div class="h-bottom">
        <div class="h-row">
          <div class="modes">
            <button type="button" class="stroke s1" style="--i:0" data-act="tokoton" data-el="tokoton"><b></b><span></span></button>
            <button type="button" class="stroke s2" style="--i:1" data-act="butter" data-el="butter"><b></b><span></span></button>
            <button type="button" class="stroke s3" style="--i:2" data-act="ops" data-el="ops"><b></b><span></span></button>
            <button type="button" class="stroke s4" style="--i:3" data-act="stage" data-el="stage"><b></b><span></span></button>
          </div>
          <div class="h-start">
            <button type="button" class="seal seal-start" data-act="arcade" data-el="arcade" aria-label="${m.arcade}"><small>아케이드</small><b>시작</b></button>
            ${SPLATS}
            <div class="h-sub">${m.arcadeSub}</div>
          </div>
        </div>
        <div class="h-stats" data-el="stats"></div>
        <p class="h-buddha" data-el="buddha" hidden>${SCREENS.title.buddha}</p>
        <nav class="h-nav" aria-label="가는 길">
          <button type="button" class="inkseal" style="--i:0" data-act="tab-missions" data-badge-host>미션<i data-el="nav-today"></i><b class="dot" data-badge hidden></b></button>
          <button type="button" class="inkseal" style="--i:1" data-act="tab-shop">상점</button>
          <button type="button" class="inkseal" style="--i:2" data-act="tab-book">도감</button>
          <button type="button" class="inkseal" style="--i:3" data-act="tab-more">설정</button>
        </nav>
      </div>
    </div>

    <div class="ov-screen ov-story" data-screen="story" data-act="story-skip" hidden>
      ${frameSvg(8, 3, 5, 9)}
      <div class="story-body">
        <div class="story-stamps" data-el="story-stamps"></div>
        <div class="story-lines" data-el="story"></div>
      </div>
      <p class="tap-hint">누르면 넘김</p>
    </div>

    <div class="ov-screen ov-pause" data-screen="pause" hidden>
      <div class="p-card" role="dialog" aria-modal="true" aria-label="잠깐">
        ${frameSvg(7, 3, 4.5, 8)}
        <h2 class="p-title">잠깐</h2>
        <div class="p-stats" data-el="pause-stats"></div>
        <button type="button" class="seal p-resume" data-act="resume" aria-label="계속 부수기"><b>계속<br>부수기</b></button>
        <div class="p-row">
          <button type="button" class="stroke s3 p-quit" data-act="quit" data-el="quit"><b>그만두기</b><span>한 번 더 누르세요</span></button>
          <button type="button" class="inkseal" data-act="pause-settings">설정</button>
        </div>
      </div>
    </div>

    <div class="ov-screen ov-meta" data-screen="settings" hidden>
      ${frameSvg(8, 4.5, 6, 10)}
      <div class="ov-body">
        <h2 class="meta-title">설정</h2>
        <div class="set-body">
          <div class="set-grid">
            ${tog('set-sound', '소리')}
            ${tog('set-bgm', '음악')}
            ${tog('set-sfx', '효과음')}
            ${tog('set-vib', '진동')}
            ${tog('set-hand', '왼손 조작')}
          </div>
          ${levelRow('set-shake', '화면 흔들림', SHAKE_LABEL)}
          ${levelRow('set-flash', '번쩍임', FLASH_LABEL)}
          <div class="set-layout">
            <span class="set-layout-name">버튼 배치<small data-el="set-layout-state"></small></span>
            <button type="button" class="inkseal" data-act="set-layout" data-el="set-layout">바꾸기</button>
          </div>
          <div class="set-links">
            <button type="button" class="set-link" data-act="howto">조작 안내</button>
            <button type="button" class="set-link" data-act="privacy">개인정보 처리방침</button>
            <button type="button" class="set-link" data-act="credits">글꼴 저작권</button>
            <button type="button" class="set-link danger" data-act="reset" data-el="reset-row">기록 지우기</button>
          </div>
          <p class="set-foot">GUNBBU <span data-el="ver">v${APP_VERSION}</span><span class="kbd-hint"><br>키보드: 점프 ↑ · 가드 ↓ · 공격 Z · 필살 X · 멈춤 Esc</span></p>
        </div>
      </div>
      <nav class="ov-nav" aria-label="가는 길"><button type="button" class="inkseal" data-act="set-back" data-el="set-back">홈</button><span class="nav-stamp">작업 수칙</span><span></span></nav>
    </div>

    <div class="ov-screen ov-meta" data-screen="butter" hidden>
      ${frameSvg(9, 4, 5, 9)}
      <div class="ov-body">
        <h2 class="meta-title">버터바 챌린지</h2>
        <p class="meta-lead">판에서 만나 본 회차만 열린다.</p>
        <div class="bt-rounds" data-el="butter-rounds"></div>
      </div>
      <nav class="ov-nav" aria-label="가는 길"><button type="button" class="inkseal" data-act="butter-back">홈</button><span class="nav-stamp">버터 반죽</span><span></span></nav>
    </div>

    <div class="ov-screen ov-result" data-screen="gameover" hidden>
      ${frameSvg(10, 4, 5, 9)}
      <div class="g-scene">
        <div class="g-st k1" style="--i:1"><span>${SCREENS.gameover.buildings}</span><b data-el="go-bld"></b></div>
        <div class="g-st k2" style="--i:0"><span>최고 콤보</span><b data-el="go-combo"></b></div>
        <div class="g-st k3" style="--i:2"><span>${SCREENS.gameover.dust}</span><b data-el="go-dust"></b></div>
        <div class="g-st k4" style="--i:3"><span>${SCREENS.gameover.zone}</span><b data-el="go-zone"></b></div>
        <div class="g-piece" data-el="go-piece" aria-hidden="true"></div>
        <div class="g-fall">${CRUSHED_SVG}${CLOUD_SVG}<div class="g-frag" data-el="go-frag" aria-hidden="true"></div></div>
      </div>
      <div class="g-head">
        <h2 class="g-title">${SCREENS.gameover.title}</h2>
        <div class="seal ink g-stamp" data-el="go-stamp" role="img"></div>
        <p class="g-bub" data-el="go-line"></p>
      </div>
      <div class="g-score"><span>점수</span><b class="g-num" data-el="go-score"></b><i class="g-best" data-el="go-best" hidden>${SCREENS.stamps.best}</i></div>
      <div class="g-acts">
        <div class="g-left" data-el="go-left"></div>
        <button type="button" class="seal g-main" data-el="go-main"></button>
      </div>
    </div>

    <div class="ov-screen ov-result" data-screen="opsend" hidden>
      ${frameSvg(9, 3.5, 6, 10)}
      <div class="o-scene">
        <p class="o-name" data-el="os-name"></p>
        <div class="o-big"><b data-el="os-big"></b></div>
        <div class="seal ink o-grade" data-el="os-grade" role="img" hidden></div>
      </div>
      <div class="g-head"><h2 class="g-title" data-el="os-title"></h2></div>
      <div class="o-lines">
        <p class="o-line" style="--i:0" data-el="os-goal"></p>
        <p class="o-line muted" style="--i:1" data-el="os-best"></p>
        <p class="o-line" style="--i:2" data-el="os-prog" hidden></p>
      </div>
      <div class="g-acts">
        <div class="g-left">
          <button type="button" class="stroke s2" style="--i:0" data-act="ops-list"><b>${SCREENS.ops.list}</b></button>
          <button type="button" class="stroke s3" style="--i:1" data-act="ops-title"><b>${SCREENS.ops.title}</b></button>
        </div>
        <button type="button" class="seal g-main" data-act="ops-retry" aria-label="${SCREENS.ops.retry}"><b>한 판<br>더</b></button>
      </div>
    </div>

    <div class="ov-screen ov-result ov-ending" data-screen="ending" hidden>
      ${frameSvg(10, 3.5, 5, 9)}
      <div class="e-scene">
        ${SEEDS_SVG}
        <p class="e-sub">${SCREENS.result.petals}</p>
        <p class="e-note" data-el="end-note"></p>
      </div>
      <div class="g-head"><h2 class="g-title">${SCREENS.result.success}</h2><div class="seal ink g-stamp" role="img">완료</div></div>
      <div class="g-score"><span>점수</span><b class="g-num" data-el="end-score"></b><i class="g-best" data-el="end-best" hidden>${SCREENS.stamps.best}</i></div>
      <div class="g-acts">
        <div class="g-left">
          <p class="o-line muted" data-el="end-combo"></p>
          <button type="button" class="stroke s3" style="--i:0" data-act="end-title"><b>타이틀로</b></button>
        </div>
        <button type="button" class="seal g-main" data-act="end-retry" aria-label="한 판 더"><b>한 판<br>더</b></button>
      </div>
    </div>

    ${metaScreen('ops', frameSvg(8, 4, 5.5, 10), '현장 배정', '<span></span>')}

    <div class="ov-screen ov-meta" data-screen="stages" hidden>
      ${frameSvg(9, 3.5, 5.5, 10)}
      <div class="ov-body" data-el="body-stages"></div>
      <nav class="ov-nav" aria-label="가는 길"><button type="button" class="inkseal" data-act="stage-back" data-el="stage-back">${STAGE_MODE.home}</button><span class="nav-stamp">${STAGE_MODE.navStamp}</span><span></span></nav>
    </div>

    <div class="ov-screen ov-meta ov-stage-end" data-screen="stageend" hidden>
      ${frameSvg(10, 4, 5, 9)}
      <div class="ov-body" data-el="body-stageend"></div>
      <div class="st-acts" data-el="acts-stageend"></div>
    </div>
    ${metaScreen('missions', frameSvg(9, 4.5, 5, 9), '출근 도장', navPair(toShop, toBook))}
    ${metaScreen('shop', frameSvg(8, 4.5, 6, 10), '환불 없음', navPair(toMissions, toBook))}
    ${metaScreen('book', frameSvg(9, 4, 5.5, 10), '모은 만큼', navPair(toShop, toMissions))}

    <div class="ov-modal" data-el="modal" hidden>
      <div class="m-card" role="dialog" aria-modal="true" aria-labelledby="modal-title-text" tabindex="-1" data-el="modal-card">
        ${frameSvg(7, 3, 4.5, 8)}
        <div class="m-head"><p class="m-meta" data-el="modal-meta"></p>
          <button type="button" class="m-x" data-act="modal-close" data-el="modal-x" aria-label="닫기">${CLOSE_SVG}</button></div>
        <h2 class="m-title" id="modal-title-text" data-el="modal-title"></h2>
        <div class="m-body" data-el="modal-body"></div>
        <div class="m-actions" data-el="modal-actions"></div>
      </div>
    </div>
  `;

  // 토스트는 오버레이가 닫힌 플레이 중에도 보이게 스테이지에 직접 붙인다
  const toastEl = document.createElement('p');
  toastEl.className = 'toast';
  toastEl.setAttribute('role', 'status');
  (root.parentElement ?? root).appendChild(toastEl);
  let toastTimer = 0;

  let screen: OverlayScreen = 'none';
  let settings: SaveSettings | null = null;
  let titleView: TitleView | null = null;
  let quitArmed = 0;
  let resetArmed = false;
  let howtoFirst = false;
  let scoreToken = 0;
  // 홈 뿌뿌 누르기 사다리(1 껑충 · 2 벤다 · 3 「그만」 · 4~ 뻗음) + 6초 가만두면 하품
  let heroTaps = 0;
  let heroCur: PlayerPose = HERO_IDLE;
  let heroIdleT = 0;
  let heroBubT = 0;
  let heroPoseT = 0;

  const $ = (name: string): HTMLElement => root.querySelector(`[data-el="${name}"]`) as HTMLElement;
  const screenEl = (name: OverlayScreen): HTMLElement | null =>
    name === 'none' ? null : root.querySelector<HTMLElement>(`[data-screen="${name}"]`);

  const stageUi: StageUi = createStageUi($('body-stages'), $('stage-back'), {
    onStart: (id, diff, fromBoss) => h.onStageStart(id, diff, fromBoss),
  });

  // 설치된 앱이면 스토어 버전(versionName)을 보여 준다 — 웹 번들 버전은 OTA용이라 다를 수 있다
  void nativeAppVersion().then((v) => { if (v) $('ver').textContent = `v${v}`; });

  function paintBadges(): void {
    const n = h.missionBadge();
    root.querySelectorAll<HTMLElement>('[data-badge]').forEach((d) => { d.hidden = n <= 0; });
    root.querySelectorAll<HTMLElement>('[data-badge-host]').forEach((b) => {
      if (n > 0) b.setAttribute('aria-label', `${SCREENS.tabs.missions}, 받을 것 ${n}`);
      else b.removeAttribute('aria-label');
    });
  }

  function stopHero(): void {
    window.clearTimeout(heroIdleT);
    window.clearTimeout(heroPoseT);
    window.clearTimeout(heroBubT);
  }

  function show(name: OverlayScreen): void {
    // 다른 화면으로 옮기면 앞 화면의 알림은 거둔다 — 탭을 바꿔도 2.4초 남아 새 목록을 가렸다(10-28)
    if (name !== screen) { window.clearTimeout(toastTimer); toastEl.classList.remove('on'); }
    if (name !== 'title') stopHero();
    screen = name;
    closeModal();
    root.classList.toggle('is-open', name !== 'none');
    root.querySelectorAll<HTMLElement>('[data-screen]').forEach((el) => {
      el.hidden = el.getAttribute('data-screen') !== name;
    });
    if (name === 'title' || name === 'shop' || name === 'missions' || name === 'book') paintBadges();
  }

  /** 화면 들어가기 — 다른 화면에서 오면 지금 화면을 베고(복제는 그리기 전에) 새 화면에 안무를 단다.
   *  같은 화면을 다시 그리면 안무를 떼고 그린다(산 뒤 · 받은 뒤 목록 전체가 다시 서지 않게) */
  function enter(name: OverlayScreen, paint?: () => void): void {
    const prev = screen;
    const el = screenEl(name);
    if (prev === name) {
      el?.classList.remove('anim', 'anim2');
      paint?.();
      show(name);
      return;
    }
    const dir = cutDir(prev, name);
    const src = prev === 'none' || prev === 'pause' ? document.getElementById('game') : screenEl(prev);
    const cut = dir ? cutFrom(src, dir) : false;
    paint?.();
    show(name);
    if (!el) return;
    el.classList.remove('anim', 'anim2', 'shake');
    if (reduceMotion()) return;
    void el.offsetWidth; // 같은 안무를 처음부터(화면이 바뀔 때 한 번)
    el.classList.add(name === 'title' && prev !== 'boot' ? 'anim2' : 'anim');
    if (cut) {
      el.classList.add('shake');
      window.setTimeout(() => el.classList.remove('shake'), SHAKE_MS);
    }
  }

  /* ── 홈 뿌뿌 ── */
  function heroPose(p: PlayerPose, backMs = 0): void {
    if (!titleView) return;
    heroCur = p;
    paintHero($('ppu-cv') as HTMLCanvasElement, { loadout: titleView.loadout, maskArt: titleView.maskArt }, p);
    window.clearTimeout(heroPoseT);
    if (backMs) heroPoseT = window.setTimeout(() => { if (heroTaps < 4 && screen === 'title') heroPose(HERO_IDLE); }, backMs);
  }

  function bubble(text: string, ms = 1100): void {
    const b = $('bub');
    b.textContent = text;
    replay(b, 'show');
    window.clearTimeout(heroBubT);
    heroBubT = window.setTimeout(() => b.classList.remove('show'), ms);
  }

  function idleArm(): void {
    window.clearTimeout(heroIdleT);
    if (heroTaps >= 4 || reduceMotion()) return;
    heroIdleT = window.setTimeout(() => { if (screen === 'title' && $('modal').hidden) bubble('하암', 1400); }, HERO_IDLE_MS);
  }

  function heroTap(): void {
    heroTaps += 1;
    window.clearTimeout(heroIdleT);
    $('bub').classList.remove('show');
    if (heroTaps === 1) replay($('ppu'), 'hop');
    else if (heroTaps === 2) heroPose(HERO_SLASH, 380);
    else if (heroTaps === 3) bubble('그만', 1000);
    else heroPose(HERO_DOWN);
    idleArm();
  }

  function heroReset(): void {
    stopHero();
    heroTaps = 0;
    $('bub').classList.remove('show');
    $('ppu').classList.remove('hop');
    heroPose(HERO_IDLE);
    idleArm();
  }

  /* ── 홈 ── */
  function setMode(act: string, name: string, sub: string, open: boolean): void {
    const row = $(act) as HTMLButtonElement;
    row.disabled = !open;
    (row.querySelector('b') as HTMLElement).textContent = name;
    const sp = row.querySelector('span') as HTMLElement;
    sp.textContent = sub;
    sp.hidden = !sub;
    row.setAttribute('aria-label', sub ? `${name}, ${sub}` : name);
  }

  function paintTitle(v: TitleView): void {
    titleView = v;
    setMode('tokoton', m.tokoton, v.tokotonOpen ? m.tokotonSub : m.tokotonLocked, v.tokotonOpen);
    setMode('butter', m.butter, v.butterTier > 0 ? m.butterSub(v.butterTier) : m.butterLocked, v.butterTier > 0);
    setMode('ops', m.ops, '', true);
    setMode('stage', STAGE_MODE.title, '', true);
    $('stats').innerHTML =
      `<span class="cur">${glyph('dust')}${SCREENS.title.dust} <b>${fmt(v.dust)}</b></span>`
      + `<span class="cur">${glyph('orb')}${SCREENS.title.orbit} <b>${fmt(v.orbit)}</b></span>`
      + `<span class="cur">최고 <b>${fmt(v.bestArcade)}</b></span>`;
    const today = $('nav-today');
    today.textContent = v.todayTotal > 0 ? `${v.todayDone}/${v.todayTotal}` : '';
    today.hidden = v.todayTotal <= 0;
    $('buddha').hidden = !v.buddhaMode;
    $('title-rank').textContent = `${SCREENS.license.heading} · ${v.rank}`;
    const bld = $('title-bld') as HTMLImageElement;
    const src = `./img/floors/${v.theme}.png`;
    if (bld.getAttribute('src') !== src) bld.setAttribute('src', src);
    setTitleSelected(v.selected);
  }

  function setTitleSelected(index: number): void {
    if (titleView) titleView.selected = index;
    ['arcade', 'tokoton', 'butter', 'ops', 'stage'].forEach((act, i) => $(act).classList.toggle('selected', i === index));
  }

  /* ── 설정 ── */
  function paintSettings(s: SaveSettings): void {
    settings = s;
    for (const [act, on] of [['set-sound', s.sound], ['set-bgm', s.bgm], ['set-sfx', s.sfx], ['set-vib', s.vibration], ['set-hand', s.leftHanded]] as const) {
      const t = $(act);
      t.classList.toggle('on', on);
      t.textContent = on ? '켬' : '끔';
      root.querySelector(`[data-act="${act}"]`)?.setAttribute('aria-pressed', String(on));
    }
    paintLevel($('set-shake'), s.shakeLevel);
    paintLevel($('set-flash'), s.flashLevel);
    $('set-layout-state').textContent = isDefaultLayout(s.buttonLayout) ? '기본 배치' : '바꾼 배치';
  }

  function paintButter(tier: number): void {
    $('butter-rounds').innerHTML = SCREENS.butter.rounds.map((label, i) => {
      const r = i + 1;
      const [name, part] = label.split(' · ');
      const best = titleView?.butterBest[r] ?? 0;
      const open = r <= tier;
      const sub = open && best > 0 ? `${part} · ${SCREENS.butter.best(best)}` : part;
      return `<button type="button" class="stroke s${r}" style="--i:${i}"${open ? ` data-act="butter-${r}"` : ' disabled'}>`
        + `<b>${escapeHtml(name)}</b><span>${escapeHtml(sub ?? '')}</span></button>`;
    }).join('');
  }

  function disarmQuit(): void {
    window.clearTimeout(quitArmed);
    quitArmed = 0;
    $('quit').classList.remove('confirm');
  }

  /* ── 확인 창 ── */
  interface ModalAction { label: string; act: string; kind?: 'cta' | 'btn' | 'quiet' | 'danger' }
  function openModal(o: { meta: string; title: string; html: string; actions: readonly ModalAction[]; closable?: boolean }): void {
    $('modal-meta').textContent = o.meta;
    $('modal-title').textContent = o.title;
    $('modal-body').innerHTML = o.html;
    $('modal-x').hidden = o.closable === false;
    // 누를 것(시작 · 지우기)은 주홍 인장, 나머지는 먹 획
    $('modal-actions').innerHTML = o.actions.map((a) => (a.kind === 'cta' || a.kind === 'danger'
      ? `<button type="button" class="seal" data-act="${a.act}"><b>${a.label}</b></button>`
      : `<button type="button" class="stroke s3" data-act="${a.act}"><b>${a.label}</b></button>`)).join('');
    $('modal').hidden = false;
    root.classList.add('is-open'); // 플레이 중(오버레이 닫힘)에도 뜰 수 있게
    $('modal-card').focus({ preventScroll: true }); // 화면 낭독·키보드가 창 안에서 시작하게
  }

  function closeModal(): void {
    const md = $('modal');
    if (md.hidden) return;
    md.hidden = true;
    $('modal-card').classList.remove('bk-card');
    $('modal-body').innerHTML = ''; // iframe 정리
    resetArmed = false;
    if (screen === 'none') root.classList.remove('is-open');
    if (howtoFirst) { howtoFirst = false; h.onHowtoDone(); }
  }

  function openDoc(title: string, src: string): void {
    openModal({
      meta: '문서',
      title,
      html: `<iframe class="doc-frame" src="${src}" title="${escapeHtml(title)}"></iframe>`,
      actions: [],
    });
  }

  /** 도감 팝업 — 도감 한 쪽. 이전 · 다음 단추가 번호순으로 칸을 넘긴다 */
  const bookNav: { prev: string | null; next: string | null } = { prev: null, next: null };
  function openBookPage(key: string): void {
    const p = bookPopup(key);
    if (!p) return;
    bookNav.prev = p.prev;
    bookNav.next = p.next;
    openModal({ meta: p.meta, title: p.title, html: p.html, actions: [] });
    $('modal-card').classList.add('bk-card');
    $('modal-actions').innerHTML =
      `<button type="button" class="stroke s3" data-act="book-prev"${p.prev ? '' : ' disabled'}><b>이전</b></button>`
      + `<button type="button" class="stroke s3" data-act="book-next"${p.next ? '' : ' disabled'}><b>다음</b></button>`
      + '<button type="button" class="stroke s3" data-act="modal-close"><b>닫기</b></button>';
  }

  function showHowto(first: boolean): void {
    howtoFirst = first;
    const rows = HOWTO_ROWS.map((r) =>
      `<div class="howto-row"><span class="howto-key ${r.key}">${r.key === 'k-sp' ? '<svg viewBox="0 0 88 88" aria-hidden="true"><path d="M44 3 L85 44 L44 85 L3 44 Z"/></svg>' : ''}</span>`
      + `<p><b>${r.name}</b><span>${r.desc}</span></p></div>`,
    ).join('');
    const supply = SUPPLY.ROTATION.map((id) =>
      `<li><b>${escapeHtml(ITEM_COPY[id].name)}</b>${escapeHtml(ITEM_COPY[id].desc)}</li>`).join('');
    openModal({
      meta: '작업 안내',
      title: '이렇게 부순다',
      html: `<p class="muted">하늘에서 건물이 떨어진다. 바닥에 닿기 전에 벤다. 깔리면 탈출로 빠져나온다.</p><div class="howto">${rows}</div>`
        + `<p><b>보급 상자</b> <span class="muted">건물 ${SUPPLY.FIRST}채째부터 ${SUPPLY.EVERY}채마다 하나.</span></p><ul class="supply">${supply}</ul>`
        + `<p><b>${escapeHtml(ITEM_COPY.hat.name)}</b> <span class="muted">콤보 ${HAT.COMBO_AT.join(' · ')}에서 하나씩. ${escapeHtml(ITEM_COPY.hat.desc)}</span></p>`,
      actions: [{ label: first ? '시작' : '닫기', act: 'modal-close', kind: first ? 'cta' : 'btn' }],
      closable: !first,
    });
  }

  function showCredits(): void {
    openModal({
      meta: '저작권',
      title: '글꼴',
      html: `<p><b>동해독도 East Sea Dokdo</b><br><span class="muted">붓글씨. Copyright (c) YoonDesign Inc. · SIL Open Font License 1.1</span></p>
        <p><b>고운바탕 Gowun Batang</b><br><span class="muted">본문. Copyright 2021 The Gowun Batang Project Authors · SIL Open Font License 1.1</span></p>
        <p><b>Black Han Sans</b><br><span class="muted">판 속 글자. The Black Han Sans Project Authors · SIL Open Font License 1.1</span></p>
        <p><b>Gunbbu Sans · Gunbbu Mono</b><br><span class="muted">IBM Plex Sans KR · IBM Plex Mono(IBM Corp.)에서 쓰는 글자만 남긴 판. SIL Open Font License 1.1</span></p>
        <p class="muted">모든 글꼴은 쓰는 글자만 남겨 담았어요. 그림·소리·문구는 건뿌가 직접 만들었어요.</p>
        <div class="set-links">
          <button type="button" class="set-link" data-act="doc-ofl-dokdo">동해독도 라이선스</button>
          <button type="button" class="set-link" data-act="doc-ofl-gowun">고운바탕 라이선스</button>
          <button type="button" class="set-link" data-act="doc-ofl-bhs">Black Han Sans 라이선스</button>
          <button type="button" class="set-link" data-act="doc-ofl-plex">IBM Plex 라이선스</button>
        </div>`,
      actions: [],
    });
  }

  function confirmReset(): void {
    resetArmed = true;
    openModal({
      meta: '확인',
      title: '기록을 지울까요?',
      html: '<p>최고 점수 · 해금 · 먼지 · 궤도조각 · 장비가 모두 지워져요. 되돌릴 수 없어요.</p>',
      actions: [
        { label: '그만두기', act: 'modal-close', kind: 'quiet' },
        { label: '지우기', act: 'reset-yes', kind: 'danger' },
      ],
    });
  }

  root.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!t || (t as HTMLButtonElement).disabled) return;
    const act = t.getAttribute('data-act');
    if (!act) return;
    e.preventDefault();
    switch (act) {
      case 'boot': h.onBoot(); break;
      case 'logo': h.onLogoTap(); break;
      case 'ppu': heroTap(); break;
      case 'arcade': h.onArcade(); break;
      case 'tokoton': h.onTokoton(); break;
      case 'butter': {
        const tier = titleView?.butterTier ?? 0;
        if (tier <= 0) break;
        if (tier === 1) h.onButterRound(1);
        else api.showButterPick(tier);
        break;
      }
      case 'story-skip': h.onStorySkip(); break;
      case 'resume': h.onPauseResume(); break;
      case 'pause-settings': h.onOpenSettings(); break;
      case 'quit': {
        // 판을 버리는 단추 — 한 번 더 눌러야 한다(3초 안)
        if (!quitArmed) {
          $('quit').classList.add('confirm');
          quitArmed = window.setTimeout(disarmQuit, QUIT_CONFIRM_MS);
        } else {
          disarmQuit();
          h.onPauseQuit();
        }
        break;
      }
      case 'set-back': h.onSettingsBack(); break;
      case 'set-sound': if (settings) h.onSettingsPatch({ sound: !settings.sound }); break;
      case 'set-bgm': if (settings) h.onSettingsPatch({ bgm: !settings.bgm }); break;
      case 'set-sfx': if (settings) h.onSettingsPatch({ sfx: !settings.sfx }); break;
      case 'set-vib': if (settings) h.onSettingsPatch({ vibration: !settings.vibration }); break;
      case 'set-hand': if (settings) h.onSettingsPatch({ leftHanded: !settings.leftHanded }); break;
      case 'set-shake': if (settings) h.onSettingsPatch({ shakeLevel: levelOf(t) }); break;
      case 'set-flash': if (settings) h.onSettingsPatch({ flashLevel: levelOf(t) }); break;
      case 'set-layout': h.onLayoutEdit(); break;
      case 'howto': showHowto(false); break;
      case 'privacy': openDoc('개인정보 처리방침', './privacy.html'); break;
      case 'credits': showCredits(); break;
      case 'doc-ofl-dokdo': openDoc('동해독도', './fonts/OFL-EastSeaDokdo.txt'); break;
      case 'doc-ofl-gowun': openDoc('고운바탕', './fonts/OFL-GowunBatang.txt'); break;
      case 'doc-ofl-bhs': openDoc('Black Han Sans', './fonts/OFL-BlackHanSans.txt'); break;
      case 'doc-ofl-plex': openDoc('IBM Plex', './fonts/OFL-IBMPlex.txt'); break;
      case 'reset': confirmReset(); break;
      case 'reset-yes':
        if (resetArmed) { closeModal(); h.onResetData(); }
        break;
      case 'modal-close': closeModal(); break;
      case 'butter-1': h.onButterRound(1); break;
      case 'butter-2': h.onButterRound(2); break;
      case 'butter-3': h.onButterRound(3); break;
      case 'butter-back': h.onButterBack(); break;
      case 'ops': h.onOpenOps(); break;
      case 'stage': h.onOpenStages(); break;
      case 'stage-back': if (!stageUi.back()) h.onMetaBack(); break;
      case 'meta-back': h.onMetaBack(); break;
      case 'go-revive': h.onGameOverRevive(); break;
      case 'go-continue': h.onGameOverContinue(); break;
      case 'go-retry': h.onGameOverRetry(); break;
      case 'go-title': h.onGameOverTitle(); break;
      case 'go-shop': h.onGameOverShop(); break;
      case 'ops-retry': h.onGameOverRetry(); break;
      case 'ops-list': h.onOpsEndList(); break;
      case 'ops-title': h.onGameOverTitle(); break;
      case 'end-title': h.onEndingDone(); break;
      case 'end-retry': h.onEndingRetry(); break;
      case 'tab-missions': h.onOpenMissions(); break;
      case 'tab-shop': h.onOpenShop(); break;
      case 'tab-book': h.onOpenBook(); break;
      case 'book-prev': if (bookNav.prev) openBookPage(bookNav.prev); break;
      case 'book-next': if (bookNav.next) openBookPage(bookNav.next); break;
      case 'tab-more': h.onOpenSettings(); break;
      default:
        break;
    }
  });

  // 창 바깥을 누르면 닫는다 — 첫 실행 안내는 단추로만
  $('modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget && !howtoFirst) closeModal();
  });

  /** 결과 점수 — 안무가 있으면 0에서 굴러 올라간다. 화면을 떠나면 멈춘다 */
  function rollScore(el: HTMLElement, to: number, on: OverlayScreen): void {
    const tk = ++scoreToken;
    el.textContent = fmt(to);
    if (reduceMotion() || to <= 0) return;
    el.textContent = '0';
    window.setTimeout(() => { if (tk === scoreToken && screen === on) countTo([el], 0, to, SCORE_ROLL_MS); else el.textContent = fmt(to); }, SCORE_ROLL_AT);
  }

  const api: OverlayApi = {
    getScreen: () => screen,
    showBoot(): void { enter('boot'); },
    showTitle(v: TitleView): void {
      const same = screen === 'title';
      enter('title', () => paintTitle(v));
      if (same) heroPose(heroCur);
      else heroReset();
    },
    setTitleSelected,
    showStory(lines: readonly string[], opts: StoryOpts = {}): void {
      enter('story', () => {
        $('story').innerHTML = lines.map((ln) => (ln ? `<p>${escapeHtml(ln)}</p>` : '<p class="ov-gap"></p>')).join('');
        $('story-stamps').innerHTML = (opts.stamps ?? []).map((t) => `<span class="seal ink">${escapeHtml(t)}</span>`).join('');
        const scr = screenEl('story') as HTMLElement;
        const wipe = opts.wipeTicks ?? 0;
        scr.classList.toggle('has-wipe', wipe > 0);
        scr.style.setProperty('--wipe', `${Math.round(wipe * TICK * 1000)}ms`);
      });
    },
    showPause(v: PauseView): void {
      disarmQuit();
      enter('pause', () => {
        $('pause-stats').innerHTML = `<span>점수</span><b>${fmt(v.score)}</b><span>콤보 ${fmt(v.combo)}</span>`;
      });
    },
    showSettings(s: SaveSettings, fromPause: boolean): void {
      enter('settings', () => {
        paintSettings(s);
        $('set-back').textContent = fromPause ? '뒤로' : '홈';
        // 판 도중엔 기록 지우기를 숨긴다 — 진행 중인 판과 저장이 엇갈리는 길을 막는다
        $('reset-row').hidden = fromPause;
      });
    },
    showButterPick(tier: number): void { enter('butter', () => paintButter(tier)); },
    showGameOver(v: GameOverView): void {
      enter('gameover', () => {
        const g = SCREENS.gameover;
        $('go-bld').textContent = g.buildingsUnit(v.buildings);
        $('go-combo').textContent = fmt(v.combo);
        $('go-dust').textContent = `+${fmt(v.dustGained)}`;
        $('go-zone').textContent = v.zone;
        const bg = `url("./img/floors/${v.theme}.png")`;
        $('go-piece').style.backgroundImage = bg;
        $('go-frag').style.backgroundImage = bg;
        const stamp = $('go-stamp');
        stamp.textContent = v.best ? g.stampBest : g.stamp;
        stamp.setAttribute('aria-label', stamp.textContent);
        $('go-line').textContent = v.line;
        $('go-best').hidden = !v.best;
        // 주홍은 하나 — 일어나기 → 이어하기 → 한 판 더 중 먼저 되는 것. 공격 키와 같은 순서
        const acts: { act: string; seal: string; small?: string; stroke: string; sub?: string }[] = [];
        if (v.canRevive) {
          const left = g.reviveLeft(v.reviveLeft);
          acts.push({ act: 'go-revive', seal: '일어<br>나기', small: v.adRevive ? `광고 · ${left}` : left, stroke: g.reviveFree, sub: left });
        }
        if (v.canContinue) acts.push({ act: 'go-continue', seal: '이어<br>하기', small: '체크포인트', stroke: '이어하기', sub: '체크포인트에서' });
        acts.push({ act: 'go-retry', seal: '한 판<br>더', stroke: '한 판 더' });
        const [main, ...rest] = acts;
        const mainEl = $('go-main');
        mainEl.setAttribute('data-act', main.act);
        mainEl.setAttribute('aria-label', main.small ? `${main.stroke}, ${main.small}` : main.stroke);
        mainEl.innerHTML = `<b>${main.seal}</b>${main.small ? `<small>${escapeHtml(main.small)}</small>` : ''}`;
        const strokes = rest.map((a, i) =>
          `<button type="button" class="stroke s2" style="--i:${i}" data-act="${a.act}"><b>${a.stroke}</b>${a.sub ? `<span>${escapeHtml(a.sub)}</span>` : ''}</button>`);
        strokes.push(`<button type="button" class="stroke s3" style="--i:${rest.length}" data-act="go-title"><b>타이틀로</b></button>`);
        const next = `<div class="g-next"><button type="button" class="inkseal" data-act="go-shop">상점</button>`
          + `${v.goalId ? swordSvg(v.goalId) : ''}<span>${escapeHtml(v.goal)}</span></div>`;
        $('go-left').innerHTML = strokes.join('') + next;
      });
      rollScore($('go-score'), v.score, 'gameover');
    },
    showOpsEnd(v: OpsEndView): void {
      enter('opsend', () => {
        const o = SCREENS.ops;
        const [label, value] = v.rows[0] ?? ['', ''];
        $('os-name').textContent = label ? `${v.name} · ${label}` : v.name;
        $('os-big').textContent = value;
        const stamp = $('os-grade');
        stamp.hidden = !v.grade;
        stamp.textContent = v.grade ?? '';
        stamp.setAttribute('aria-label', v.grade ? `도장 ${v.grade}` : '');
        $('os-title').textContent = v.grade ? o.doneTitle : o.timeUpTitle;
        $('os-goal').textContent = `목표 · ${v.goal}`;
        $('os-best').textContent = `${o.bestStamp} ${v.best ?? o.noStamp}${v.improved ? ` · ${o.stampNew}` : ''}`;
        const prog = $('os-prog');
        prog.hidden = !v.progress;
        prog.textContent = v.progress ? `${SCREENS.gameover.nextTag} · ${v.progress}` : '';
      });
    },
    showOps(opts): void {
      enter('ops', () => paintOps($('body-ops'), opts, (id) => h.onOpsPick(id)));
    },
    showStages(opts, detail): void {
      enter('stages', () => stageUi.show(opts, detail));
    },
    stagesBack: () => screen === 'stages' && stageUi.back(),
    showStageEnd(v): void {
      enter('stageend', () => paintStageEnd(screenEl('stageend') as HTMLElement, v, {
        onRetry: h.onStageRetry,
        onNext: h.onStageNext,
        onList: h.onStageList,
      }));
    },
    showMissions(daily, achieves, adBoost): void {
      enter('missions', () => paintMissions($('body-missions'), daily, DAILY_POOL, achieves, ACHIEVES, adBoost,
        (id, boost) => h.onClaimMission(id, boost)));
    },
    showShop(inv, owned, paths): void {
      enter('shop', () => paintShop($('body-shop'), inv, owned, paths, {
        onBuy: (id) => h.onBuySku(id),
        onAdPack: () => h.onAdOrbit(),
        onOrbit: (id) => h.onUnlockOrbit(id),
        onDust: (id) => h.onUnlockDust(id),
        onExchange: () => h.onExchangeDust(),
        onExam: () => h.onExam(),
        onEquip: (slot, id) => h.onEquip(slot, id),
        onMaskEdit: () => h.onMaskEdit(),
      }));
    },
    showBook(inv, owned, masks): void {
      enter('book', () => paintBook($('body-book'), inv, owned, openBookPage, masks));
    },
    showEnding(v: EndingView): void {
      enter('ending', () => {
        $('end-combo').textContent = `최고 콤보 ${fmt(v.maxCombo)}`;
        $('end-best').hidden = !v.best;
        $('end-note').textContent = v.fullCombo ? SCREENS.result.fullComboNote : SCREENS.result.tokotonUnlock;
      });
      rollScore($('end-score'), v.score, 'ending');
    },
    showHowto,
    modalOpen: () => !$('modal').hidden,
    closeModal,
    toast(text: string): void {
      window.clearTimeout(toastTimer);
      if (!text) { toastEl.classList.remove('on'); return; }
      toastEl.textContent = text;
      replay(toastEl, 'on');
      toastTimer = window.setTimeout(() => toastEl.classList.remove('on'), TOAST_MS);
    },
    hide(): void { enter('none'); },
  };

  return api;
}

export function titleViewFromSave(save: SaveData, selected: number, debugOpen = false): TitleView {
  const unlocked = debugOpen || isDevUnlocked();
  const today = dailyDone(save.daily);
  const chapters = unlocked ? 3 : save.unlockedChapters;
  return {
    selected,
    tokotonOpen: unlocked || save.act2Cleared,
    butterTier: unlocked ? Math.max(3, save.butterTierReached) : save.butterTierReached,
    bestArcade: save.bestArcade,
    bestTokoton: save.bestTokoton,
    maxCombo: save.maxCombo,
    unlockedChapters: chapters,
    buddhaMode: save.buddhaMode && import.meta.env.DEV,
    soundOn: save.settings.sound,
    dust: save.dust,
    orbit: save.orbit,
    todayDone: today.done,
    todayTotal: today.total,
    butterBest: save.butterBest,
    rank: licenseTitle(save.license),
    loadout: save.loadout,
    maskArt: save.maskArt,
    theme: regionOf(Math.min(3, chapters)).theme,
  };
}
