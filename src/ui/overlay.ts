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
import type { KeyFaces, TouchAction } from '../input/touch';
import { FLASH_LABEL, SHAKE_LABEL } from './settings';
import { isDevUnlocked } from '../platform/devUnlock';
import { nativeAppVersion } from '../platform/native';
import { paintOps, type OpsOpts } from './opsView';
import { bindFlip, createStageUi, lastDiffPick, stageReport, type StageListOpts, type StageUi } from './stageView';
import type { StageEndView } from './stageLogic';
import { STAGE_MODE, STAGE_TEXT, fmtStageTime } from '../content/stages';
import { STAGES } from '../core/stages';
import type { Theme } from '../core/types';
import { recordOf } from '../meta/stageRecord';
import { JOBS, butterTier, homeFactsOf, jobBuilding, nextStage, stepJob, type HomeFacts, type JobId } from './homeLogic';
import { paintHang } from './homeArt';
import type { StageDiff } from '../core/types';
import { paintMissions, type MissionView, type TakeKind } from './missionView';
import { setRewardHost, syncBehind } from './rewardFx';
import { paintShop, type ShopInv, type ShopPaths, type ShopTab } from './shopView';
import { bookPopup, paintBook, type BookGo, type BookMask, type RecordView } from './bookView';
import { kitHtml, type KitView } from './kitView';
import { goods } from './goodsArt';
import type { PackView } from './packView';
import { kitDef, type KitId, type KitPick } from '../meta/kit';
import type { OpGrade } from '../meta/ops';
import { licenseTitle } from '../meta/economy';
import { dailyDone } from '../meta/missions';
import { APP_VERSION } from '../version';
import type { Loadout } from '../meta/types';
import { brushNum, escapeHtml, infoHtml } from './html';
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
  /** 크레인에 매단 일감 */
  job: JobId;
  /** 일감 판단 재료(ui/homeLogic.ts) — 키 얼굴 · 확인 동작과 같은 것 */
  facts: HomeFacts;
  bestArcade: number;
  buddhaMode: boolean;
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
  /** 홈 테마 = 가장 멀리 연 구역 — 캔버스 원경 · 매단 건물 */
  theme: Theme;
  /** 그 구역 번호(0~3) — 홈 캔버스 원경 */
  chapter: number;
  /** 홈 한 줄 — 받을 것 · 살아 있는 특가 · 다음 과제 중 하나 */
  note: { text: string; to: 'shop' | 'missions' } | null;
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
  /** 다음 목표가 미션 탭에 있다 — 옆 도장이 미션으로 간다 */
  goalMissions?: boolean;
  line: string;
  /** 이번 판이 그 모드 최고 기록을 넘었나 */
  best: boolean;
  /** 띠 오른쪽 모드 이름(아케이드 · 야근 · 작전 이름 …) */
  mode: string;
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
}

export interface EndingView {
  score: number;
  maxCombo: number;
  fullCombo: boolean;
  /** 이번 판이 최고 기록을 넘었나 */
  best: boolean;
  mode: string;
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
  /** 홈 이웃 일감(크레인 양옆)을 눌렀다 */
  onJob(dir: -1 | 1): void;
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
  /** 결과 보고서 다음 목표 줄의 상점 · 미션 단추 — 다음 목표를 사러 */
  onGameOverShop(): void;
  /** 결과 단추(키 자리 이름 = 그 동작) — scenes가 키 누름처럼 결과 게이트에 넣는다 */
  onResultKey(k: TouchAction): void;
  onGameOverMissions(): void;
  /** 철거 자격 응시 */
  onExam(): void;
  /** 결과 보고서 머리의 작은 글 — 「뿌뿌 · 자격」 */
  resultWho(): string;
  /** 지금 받을 수 있는 미션 수 — 미션 도장의 먹 점 */
  missionBadge(): number;
  /** 상점 칸 점 — 오늘 공짜 커피가 남았나 */
  shopBadge(): boolean;
  onLogoTap(): void;
  onOpsPick(id: string): void;
  /** 쪽지 · 매단 건물 — 작업 지시서는 지도, 나머지는 공격 키와 같은 확인 */
  onJobTap(): void;
  onStageStart(id: string, diff: StageDiff, fromBoss: boolean): void;
  onOpenMissions(): void;
  onOpenShop(): void;
  /** 상점 꾸러미 탭으로 바로 */
  onOpenPack(): void;
  onOpenBook(): void;
  onMetaBack(): void;
  onClaimMission(id: string, boost: boolean): void;
  /** 출근부 · 일당 · 월급 · 신입 과제 받기 */
  onTake(kind: TakeKind): void;
  /** 실적 낙관 칸 */
  onAchieve(line: string): void;
  onCoffee(): void;
  onRegular(): void;
  /** 도감에서 얻는 곳으로 간다 */
  onBookGo(go: BookGo): void;
  onBuySku(id: string): void;
  onAdOrbit(): void;
  onUnlockOrbit(id: string): void;
  onUnlockDust(id: string): void;
  onExchangeDust(): void;
  onEquip(slot: string, id: string): void;
  onKitBuy(id: string): void;
  onRestore(): void;
  /** start = 첫 실행 안내의 「시작」을 눌렀다(뒤로 · Esc로 닫으면 false) */
  onHowtoDone(start: boolean): void;
  onResetData(): void;
}

/** 창 머리 색 — navy 출근 · green 보상 · seal 특가 · brown 시작 장비 · gold 구매 확인 · ink 나머지 */
export type ModalTone = 'navy' | 'green' | 'seal' | 'brown' | 'gold' | 'ink';

export interface OverlayApi {
  getScreen(): OverlayScreen;
  showBoot(): void;
  showTitle(v: TitleView): void;
  /** 매단 일감을 바꾼다. dir = 넘긴 쪽(짐이 크레인을 따라 그쪽으로 빠지고 반대쪽에서 들어온다) */
  setTitleJob(job: JobId, facts: HomeFacts, dir: -1 | 1): void;
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
  /** 결과 화면 단추 — 얼굴은 resultFaces 그대로(닫힌 키 = 옅게). 같으면 다시 그리지 않는다 */
  setResultKeys(f: KeyFaces | null): void;
  showMissions(v: MissionView): void;
  /** tab을 주면 그 칸으로 연다. 없으면 보던 칸 그대로 */
  showShop(inv: ShopInv, owned: ReadonlySet<string>, paths: ShopPaths, pack: PackView, tab?: ShopTab): void;
  /** 도감. masks = 가진 가면들(없으면 저장된 가면 그림 하나) */
  showBook(inv: { loadout: Loadout; maskArt: string }, owned: ReadonlySet<string>, masks: readonly BookMask[] | undefined, record: RecordView): void;
  /** 시작 장비 시트. buy는 산 뒤의 지갑을 돌려준다(못 사면 null) */
  showKit(v: KitView, start: (pick: KitPick) => void, buy: (id: KitId) => KitView | null): void;
  /** 예 · 아니오 창 */
  ask(o: {
    meta: string; title: string; lines?: readonly string[]; fine?: readonly string[]; html?: string; yes: string; no?: string;
    /** 창 머리 색 — 창 종류마다 다르다 */
    tone?: ModalTone;
    /** 창 머리 그림(goods) */
    art?: string;
    /** 돈을 내는 단추 */
    pay?: boolean;
  }, ok: () => void): void;
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
/** 결과 점수는 보고서가 내려앉고 도장이 찍힌 뒤 굴러 올라간다(style.css .ov-rp 안무 0.3초) */
const SCORE_ROLL_AT = 320;
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
  // 판 → 결과: 같은 판 위로 사진이 떨어지면 겹상이다 — 베지 않고 보고서가 찍히듯 들어온다(style.css .ov-rp.anim)
  if (RESULTS.has(to)) return from === 'none' ? null : CUT.DOWN;
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

/** 현장 화면(홈 · 결과 넷) = 투명한 화면(밑에 판 캔버스 · 조작 키가 보인다). 누르는 것만 누른다(style.css .ov-field) */
const FIELD_SCREENS: ReadonlySet<OverlayScreen> = new Set(['title', ...RESULTS]);

/** 홈 크레인 양옆 이웃 일감 이름 — 짧게 */
const JOB_SHORT: Record<JobId, string> = {
  arcade: '아케이드', stage: STAGE_MODE.title, ops: SCREENS.menu.ops, tokoton: SCREENS.menu.tokoton, butter: '버터바',
};

/** 크레인 팔 — 위 · 아래 현 + X자 격자 */
/** 크레인 팔 — 위아래 레일 2.5 · 사이는 1.5 먹 선 지그재그 살, 속은 비어 한지가 비친다 */
const JIB_SVG = `<svg class="hf-jib" aria-hidden="true"><defs><pattern id="hf-lat" y="2.5" width="18" height="15" patternUnits="userSpaceOnUse">`
  + `<path d="M0 15 L9 0 L18 15" fill="none" stroke="#1A1A20" stroke-width="1.5"/></pattern></defs>`
  + `<rect x="0" y="2.5" width="100%" height="15" fill="url(#hf-lat)"/><rect x="0" y="0" width="100%" height="2.5"/><rect x="0" y="17.5" width="100%" height="2.5"/></svg>`;

/** 띠 밑 먹 획 — 홈 · 결과 현장 화면이 같이 쓴다 */
const BAND_LINE = '<svg class="hud-line" viewBox="0 0 360 12" preserveAspectRatio="none" aria-hidden="true"><path d="M0 1 Q150 -1 296 3.5 L306 6 L294 8.5 Q150 11 0 11 Z"/></svg>';

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

/** 미션·상점·도감·작전 겉 틀 — 안(.ov-body)은 각 화면 그리기가 채운다. 맨 아래 = 가는 길 도장 줄:
 *  왼쪽부터 홈 · 미션 · 상점 · 도감 자리, 그 화면 자신의 자리(own)엔 장식 도장. own이 없으면(작전) 홈 · 도장 */
function metaScreen(name: string, frame: string, stamp: string, own?: keyof typeof NAV_TO): string {
  const mark = `<span class="nav-stamp">${stamp}</span>`;
  const slots = (Object.keys(NAV_TO) as (keyof typeof NAV_TO)[]).map((k) => (k === own ? mark : NAV_TO[k]));
  const rest = own ? slots.join('') : `${mark}<span></span>`;
  return `<div class="ov-screen ov-meta" data-screen="${name}" hidden>
      ${frame}
      <div class="ov-body" data-el="body-${name}"></div>
      <nav class="ov-nav" aria-label="가는 길"><button type="button" class="inkseal" data-act="meta-back">홈</button>${rest}</nav>
    </div>`;
}

const toMissions = '<button type="button" class="inkseal" data-act="tab-missions" data-badge-host>미션<b class="dot" data-badge hidden></b></button>';
const toShop = '<button type="button" class="inkseal" data-act="tab-shop">상점<b class="dot" data-shop-dot hidden></b></button>';
const toBook = '<button type="button" class="inkseal" data-act="tab-book">도감</button>';
const NAV_TO = { missions: toMissions, shop: toShop, book: toBook } as const;

const HOWTO_ROWS: readonly { key: string; name: string; desc: string }[] = [
  { key: 'k-atk', name: '공격', desc: '닿은 층을 벤다. 이어 베면 콤보.' },
  { key: 'k-jmp', name: '점프', desc: '한 번 누르면 한 번 뛴다.' },
  { key: 'k-grd', name: '가드', desc: '떨어지는 건물을 튕겨 올린다. 막대만큼.' },
  { key: 'k-sp', name: '필살', desc: '마름모에 먹이 다 차면 쓴다.' },
];

export function mountOverlay(root: HTMLElement, h: OverlayHandlers): OverlayApi {
  setRewardHost(root);
  installInkVars();
  const m = SCREENS.menu;
  root.innerHTML = `
    <div class="ov-screen ov-boot" data-screen="boot" data-act="boot">
      ${frameSvg(9, 3.5, 5.5, 10)}
      <img class="boot-mark" src="./icons/icon-192.png" alt="" draggable="false" />
      <p class="boot-tag">${TAGLINE}</p>
      <p class="boot-hint">누르면 시작</p>
    </div>

    <div class="ov-screen ov-field" data-screen="title" hidden>
      <div class="hf-band">
        <span class="tag hf-rank" data-el="title-rank"></span>
        <span class="hf-buddha" data-el="buddha" hidden>${SCREENS.title.buddha}</span>
        <span class="hf-wal" data-el="stats"></span>
      </div>
      ${BAND_LINE}
      <button type="button" class="hf-note" data-act="home-note" data-el="home-note" hidden><span class="tag ink" data-el="note-tag"></span><span class="hf-note-t" data-el="note-line"></span></button>
      ${JIB_SVG}
      <button type="button" class="hf-peek hf-pl" data-act="job-prev"><canvas data-el="peek-prev-cv" aria-hidden="true"></canvas><span data-el="peek-prev"></span></button>
      <button type="button" class="hf-peek hf-pr" data-act="job-next"><canvas data-el="peek-next-cv" aria-hidden="true"></canvas><span data-el="peek-next"></span></button>
      <button type="button" class="hf-trolley" data-act="logo" aria-label="건뿌"><span aria-hidden="true">건뿌</span></button>
      <button type="button" class="hf-hang" data-act="hang" data-el="hang" tabindex="-1" aria-hidden="true"><canvas data-el="hang-cv"></canvas></button>
      <button type="button" class="hf-slip" data-act="stage" data-el="slip">
        <span class="s-top" data-el="slip-top"></span>
        <span class="s-nm" data-el="slip-nm"></span>
        <span class="s-st" data-el="slip-st"></span>
      </button>
      <span class="hf-dots" data-el="dots" aria-hidden="true">${JOBS.map(() => '<i></i>').join('')}</span>
      <button type="button" class="hf-tab tl t1" data-act="tab-missions" data-badge-host><b>미션</b><i data-el="nav-today"></i><b class="dot" data-badge hidden></b></button>
      <button type="button" class="hf-tab tl t2" data-act="tab-shop"><b>상점</b><b class="dot" data-shop-dot hidden></b></button>
      <button type="button" class="hf-tab tr t1" data-act="tab-book"><b>도감</b></button>
      <button type="button" class="hf-tab tr t2" data-act="tab-more"><b>설정</b></button>
      <div class="h-ppu" data-el="ppu"><canvas data-el="ppu-cv" aria-hidden="true"></canvas></div>
      <div class="h-bub" data-el="bub" aria-hidden="true"></div>
      <button type="button" class="h-ppu-hit" data-act="ppu" aria-label="나"></button>
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
        <button type="button" class="seal p-resume" data-act="resume"><b>계속 부수기</b></button>
        <button type="button" class="rk p-set" data-act="pause-settings">설정</button>
        <button type="button" class="p-quit" data-act="quit" data-el="quit"><b>그만두기</b><span>한 번 더 누르세요</span></button>
      </div>
    </div>

    <div class="ov-screen ov-meta" data-screen="settings" hidden>
      ${frameSvg(8, 4.5, 6, 10)}
      <div class="ov-body">
        <header class="meta-band"><h2 class="meta-title">설정</h2><p class="meta-side" data-el="ver">v${APP_VERSION}</p></header>
        <div class="set-body">
          <h3 class="set-h">소리 · 진동</h3>
          <div class="set-grid">
            ${tog('set-sound', '전체')}
            ${tog('set-bgm', '음악')}
            ${tog('set-sfx', '효과음')}
            ${tog('set-vib', '진동')}
          </div>
          <h3 class="set-h">화면</h3>
          ${levelRow('set-shake', '화면 흔들림', SHAKE_LABEL)}
          ${levelRow('set-flash', '번쩍임', FLASH_LABEL)}
          <h3 class="set-h">조작</h3>
          ${tog('set-hand', '왼손 조작')}
          <div class="set-layout">
            <span class="set-layout-name">버튼 배치<small data-el="set-layout-state"></small></span>
            <button type="button" class="inkseal" data-act="set-layout" data-el="set-layout">바꾸기</button>
          </div>
          <button type="button" class="set-link" data-act="howto">조작 안내</button>
          <h3 class="set-h">정보</h3>
          <div class="set-links">
            <button type="button" class="set-link" data-act="privacy">개인정보 처리방침</button>
            <button type="button" class="set-link" data-act="credits">글꼴 저작권</button>
            <button type="button" class="set-link danger" data-act="reset" data-el="reset-row">기록 지우기</button>
          </div>
          <p class="set-foot kbd-hint">키보드: 점프 ↑ · 가드 ↓ · 공격 Z · 필살 X · 멈춤 Esc</p>
        </div>
      </div>
      <nav class="ov-nav" aria-label="가는 길"><button type="button" class="inkseal" data-act="set-back" data-el="set-back">홈</button><span class="nav-stamp">작업 수칙</span><span></span></nav>
    </div>

    <div class="ov-screen ov-meta" data-screen="butter" hidden>
      ${frameSvg(9, 4, 5, 9)}
      <div class="ov-body">
        <header class="meta-band"><h2 class="meta-title">버터바 챌린지</h2></header>
        <p class="meta-lead">판에서 만나 본 회차만 열린다.</p>
        <div class="bt-rounds" data-el="butter-rounds"></div>
      </div>
      <nav class="ov-nav" aria-label="가는 길"><button type="button" class="inkseal" data-act="butter-back">홈</button><span class="nav-stamp">버터 반죽</span><span></span></nav>
    </div>

    <div class="ov-screen ov-field ov-rp" data-screen="gameover" hidden></div>
    <div class="ov-screen ov-field ov-rp" data-screen="opsend" hidden></div>
    <div class="ov-screen ov-field ov-rp" data-screen="ending" hidden></div>

    ${metaScreen('ops', frameSvg(8, 4, 5.5, 10), '현장 배정')}

    <div class="ov-screen ov-map" data-screen="stages" hidden>
      <div class="mp"><div class="mp-in" data-el="body-stages"></div>${BAND_LINE}</div>
    </div>

    <div class="ov-screen ov-field ov-rp" data-screen="stageend" hidden></div>
    ${metaScreen('missions', frameSvg(9, 4.5, 5, 9), '출근 도장', 'missions')}
    ${metaScreen('shop', frameSvg(8, 4.5, 6, 10), '현장 매점', 'shop')}
    ${metaScreen('book', frameSvg(9, 4, 5.5, 10), '모은 만큼', 'book')}

    <div class="ov-modal" data-el="modal" hidden>
      <div class="m-card" role="dialog" aria-modal="true" aria-labelledby="modal-title-text" tabindex="-1" data-el="modal-card">
        <div class="m-band">
          <span class="m-art" data-el="modal-art"></span>
          <div class="m-hd"><p class="m-meta" data-el="modal-meta"></p><h2 class="m-title" id="modal-title-text" data-el="modal-title"></h2></div>
          <button type="button" class="m-x" data-act="modal-close" data-el="modal-x" aria-label="닫기">${CLOSE_SVG}</button>
        </div>
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
  root.querySelectorAll<HTMLElement>('[data-screen]').forEach((el) => { el.tabIndex = -1; }); // 화면 뿌리는 포커스만 받는다(show)
  let toastTimer = 0;

  let screen: OverlayScreen = 'none';
  let settings: SaveSettings | null = null;
  let titleView: TitleView | null = null;
  let quitArmed = 0;
  let resetArmed = false;
  let howtoFirst = false;
  let scoreToken = 0;
  // 지금 떠 있는 시작 장비 시트 · 예 · 아니오 창의 할 일
  let kit: { view: KitView; sel: KitPick; start: (pick: KitPick) => void; buy: (id: KitId) => KitView | null } | null = null;
  let askOk: (() => void) | null = null;
  // 홈 뿌뿌 누르기 사다리(1 껑충 · 2 벤다 · 3 「그만」 · 4~ 뻗음) + 6초 가만두면 하품
  let heroTaps = 0;
  let heroCur: PlayerPose = HERO_IDLE;
  let heroIdleT = 0;
  let heroBubT = 0;
  let heroPoseT = 0;

  const $ = (name: string): HTMLElement => root.querySelector(`[data-el="${name}"]`) as HTMLElement;
  const screenEl = (name: OverlayScreen): HTMLElement | null =>
    name === 'none' ? null : root.querySelector<HTMLElement>(`[data-screen="${name}"]`);

  const stageUi: StageUi = createStageUi($('body-stages'), {
    onStart: (id, diff, fromBoss) => h.onStageStart(id, diff, fromBoss),
  });

  // 설치된 앱이면 스토어 버전(versionName)을 보여 준다 — 웹 번들 버전은 OTA용이라 다를 수 있다
  void nativeAppVersion().then((v) => { if (v) $('ver').textContent = `v${v}`; });

  function paintBadges(): void {
    const coffee = h.shopBadge();
    root.querySelectorAll<HTMLElement>('[data-shop-dot]').forEach((d) => { d.hidden = !coffee; });
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
    const moved = name !== screen;
    // 다른 화면으로 옮기면 앞 화면의 알림은 거둔다 — 탭을 바꿔도 2.4초 남아 새 목록을 가렸다(10-28)
    if (moved) { window.clearTimeout(toastTimer); toastEl.classList.remove('on'); }
    if (name !== 'title') stopHero();
    screen = name;
    closeModal();
    root.classList.toggle('is-open', name !== 'none');
    // 현장 화면 — 메뉴층은 누르기를 흘리고(누르는 DOM만 받는다) 무대엔 조작 키를 띄운다
    const field = FIELD_SCREENS.has(name);
    root.classList.toggle('field', field);
    root.parentElement?.classList.toggle('field', field);
    // 조작 키를 메뉴로 쓰는 건 홈뿐 — 결과는 제 단추(.rp-acts)를 쓴다(11-14 배치 시안)
    root.parentElement?.classList.toggle('keys', name === 'title');
    root.querySelectorAll<HTMLElement>('[data-screen]').forEach((el) => {
      el.hidden = el.getAttribute('data-screen') !== name;
    });
    // 화면이 바뀌면 낭독 · 키보드가 새 화면에서 시작하게 — 뿌리에만 준다(단추에 주면 결과 키 연타 게이트를 건너뛴다)
    if (moved) screenEl(name)?.focus({ preventScroll: true });
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
    const game = document.getElementById('game') as HTMLCanvasElement | null;
    const src = prev === 'none' || prev === 'pause' ? game : screenEl(prev);
    // 현장 화면은 투명하다 — 밑의 판 캔버스를 같이 찍어야 조각에 하늘 · 원경이 남는다
    const cut = dir ? cutFrom(src, dir, FIELD_SCREENS.has(prev) ? game : null) : false;
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

  /* ── 홈 현장 — 띠 · 쪽지 · 크레인에 매단 일감 · 지시서 쪽지 · 꼬리표 넷. 조작은 진짜 키 넷(scenes · touch.setFaces) ── */
  let artKey = '';
  let slideT = 0;

  /** 지시서 쪽지 — 화면 글은 원래 홈 글 · 값만 */
  function paintSlip(v: TitleView): void {
    const f = v.facts;
    let top = '';
    let nm = `<b>${JOB_SHORT[v.job]}</b>`;
    let st = '';
    switch (v.job) {
      case 'arcade':
        st = `<span class="ln">${m.arcadeSub}</span><span class="ln">최고 <b class="n">${fmt(v.bestArcade)}</b></span>`;
        break;
      case 'stage': {
        const done = STAGES.filter((d) => recordOf(f.stages, d.id).lamp > 0).length;
        top = `<span>${STAGE_MODE.title}</span> <b class="n">${done}/${STAGES.length}</b>`;
        const def = STAGES.find((d) => d.id === nextStage(f.stages));
        if (!def) { nm = ''; break; }
        const rec = recordOf(f.stages, def.id);
        nm = `<b class="n">${def.id}</b> <b>${escapeHtml(STAGE_TEXT[def.id].name)}</b>${def.boss ? ` <span class="tag ink">${STAGE_MODE.bossTag}</span>` : ''}`;
        st = `다음 차례 · ${rec.best > 0 ? `${STAGE_MODE.myBest} <b class="n">${fmtStageTime(rec.best)}</b>` : '기록 없음'}`;
        break;
      }
      case 'ops': break;
      case 'tokoton':
        st = f.act2Cleared || f.allOpen ? m.tokotonSub : m.tokotonLocked;
        break;
      case 'butter': {
        nm = `<b>${m.butter}</b>`;
        const tier = butterTier(f);
        st = tier > 0 ? m.butterSub(tier) : m.butterLocked;
        break;
      }
    }
    const parts: [string, string][] = [['slip-top', top], ['slip-nm', nm], ['slip-st', st]];
    for (const [k, html] of parts) {
      const el = $(k);
      el.innerHTML = html;
      el.hidden = !html;
    }
    $('slip').classList.toggle('long', v.job === 'butter');
    // 줄(.ln)마다 끊어 읽는다 — 붙여 읽으면 「집행기최고」처럼 붙는다
    const read = (el: HTMLElement): string => {
      const lines = [...el.querySelectorAll('.ln')].map((ln) => ln.textContent);
      return lines.length ? lines.join(', ') : el.textContent ?? '';
    };
    $('slip').setAttribute('aria-label', parts.map(([k]) => read($(k))).filter(Boolean).join(', '));
    $('dots').querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', JOBS[i] === v.job));
    const prev = stepJob(v.job, -1);
    const next = stepJob(v.job, 1);
    $('peek-prev').textContent = `‹\u00a0${JOB_SHORT[prev]}`;
    $('peek-next').textContent = `${JOB_SHORT[next]}\u00a0›`;
  }

  /** 매단 건물 · 이웃 둘 — 일감이 바뀔 때만 다시 그린다. 화면이 보일 때만 그릴 수 있다(캔버스 크기) */
  function paintJobArt(v: TitleView, force = false): void {
    const hang = $('hang-cv') as HTMLCanvasElement;
    if (!hang.clientWidth) return;
    const b = (j: JobId) => jobBuilding(j, v.facts, v.theme);
    const prev = stepJob(v.job, -1);
    const next = stepJob(v.job, 1);
    const key = JSON.stringify([b(v.job), b(prev), b(next)]);
    if (!force && key === artKey) return;
    artKey = key;
    paintHang(hang, b(v.job), 30);
    paintHang($('peek-prev-cv') as HTMLCanvasElement, b(prev), 20, true);
    paintHang($('peek-next-cv') as HTMLCanvasElement, b(next), 20, true);
  }

  function paintTitle(v: TitleView): void {
    titleView = v;
    $('title-rank').textContent = `${SCREENS.license.heading} ${v.rank}`;
    const wal = $('stats');
    wal.innerHTML = `${glyph('dust')}<b class="n">${fmt(v.dust)}</b>${glyph('orb')}<b class="n">${fmt(v.orbit)}</b>`;
    wal.setAttribute('role', 'img');
    wal.setAttribute('aria-label', `${SCREENS.title.dust} ${fmt(v.dust)} · ${SCREENS.title.orbit} ${fmt(v.orbit)}`);
    const today = $('nav-today');
    today.textContent = v.todayTotal > 0 ? `${v.todayDone}/${v.todayTotal}` : '';
    today.hidden = v.todayTotal <= 0;
    // 한 줄 쪽지 = 「머리 · 나머지」 — 머리는 먹 꼬리표, 나머지는 한 줄
    const note = $('home-note');
    note.hidden = !v.note;
    const [head, ...rest] = (v.note?.text ?? '').split(' · ');
    $('note-tag').textContent = head;
    $('note-line').textContent = rest.join(' · ');
    $('buddha').hidden = !v.buddhaMode;
    paintSlip(v);
  }

  /** 일감 바꾸기 — 짐이 크레인을 따라 넘긴 쪽 반대로 빠지고, 넘긴 쪽에서 들어온다(합쳐 약 160ms) */
  function setTitleJob(job: JobId, facts: HomeFacts, dir: -1 | 1): void {
    const v = titleView;
    if (!v) return;
    v.job = job;
    v.facts = facts;
    const hang = $('hang');
    const swap = (): void => { paintSlip(v); paintJobArt(v); };
    window.clearTimeout(slideT);
    if (reduceMotion() || screen !== 'title') {
      hang.style.removeProperty('translate');
      swap();
      return;
    }
    hang.style.translate = `${-dir * 260}px 0`;
    slideT = window.setTimeout(() => {
      swap();
      hang.style.transition = 'none';
      hang.style.translate = `${dir * 260}px 0`;
      void hang.offsetWidth;
      hang.style.removeProperty('transition');
      hang.style.translate = '0px 0px';
    }, 80);
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
        + `<b>${brushNum(name)}</b><span>${escapeHtml(sub ?? '')}</span></button>`;
    }).join('');
  }

  function disarmQuit(): void {
    window.clearTimeout(quitArmed);
    quitArmed = 0;
    $('quit').classList.remove('confirm');
  }

  /* ── 확인 창 ── */
  interface ModalAction { label: string; act: string; kind?: 'cta' | 'btn' | 'quiet' | 'danger' | 'pay' }
  function openModal(o: { meta: string; title: string; html: string; actions: readonly ModalAction[]; closable?: boolean; tone?: ModalTone; art?: string }): void {
    $('modal-card').dataset.tone = o.tone ?? 'ink';
    $('modal-art').innerHTML = o.art ?? '';
    $('modal-meta').textContent = o.meta;
    // 제목은 붓글씨 — 숫자만 --black(.bn). 구매 확인(금) 창은 상점 흐름이라 그대로 둔다
    if (o.tone === 'gold') $('modal-title').textContent = o.title;
    else $('modal-title').innerHTML = brushNum(o.title);
    $('modal-body').innerHTML = o.html;
    $('modal-x').hidden = o.closable === false;
    // 누를 것(시작 · 지우기)은 주홍, 돈을 내는 것은 금, 나머지는 테두리. 닫는 길도 같은 크기다
    const cls = (k: ModalAction['kind']): string => (k === 'cta' || k === 'danger' ? ' cta' : k === 'pay' ? ' pay' : '');
    $('modal-actions').innerHTML = o.actions.map((a) => `<button type="button" class="btn${cls(a.kind)}" data-act="${a.act}">${a.label}</button>`).join('');
    $('modal').hidden = false;
    syncBehind();
    root.classList.add('is-open'); // 플레이 중(오버레이 닫힘)에도 뜰 수 있게
    $('modal-card').focus({ preventScroll: true }); // 화면 낭독·키보드가 창 안에서 시작하게
  }

  function closeModal(start = false): void {
    const md = $('modal');
    if (md.hidden) return;
    md.hidden = true;
    syncBehind();
    $('modal-card').classList.remove('bk-card', 'kit');
    $('modal-body').innerHTML = ''; // iframe 정리
    resetArmed = false;
    kit = null;
    askOk = null;
    if (screen === 'none') root.classList.remove('is-open');
    if (howtoFirst) { howtoFirst = false; h.onHowtoDone(start); }
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
  let bookGo: BookGo | null = null;
  function openBookPage(key: string): void {
    const p = bookPopup(key);
    if (!p) return;
    bookNav.prev = p.prev;
    bookNav.next = p.next;
    openModal({ meta: p.meta, title: p.title, html: p.html, actions: [] });
    $('modal-card').classList.add('bk-card');
    $('modal-actions').innerHTML =
      `<button type="button" class="btn" data-act="book-prev"${p.prev ? '' : ' disabled'}>이전</button>`
      + `<button type="button" class="btn" data-act="book-next"${p.next ? '' : ' disabled'}>다음</button>`
      + '<button type="button" class="btn" data-act="modal-close">닫기</button>';
    bookGo = p.go ?? null;
    if (p.go) $('modal-actions').insertAdjacentHTML('afterbegin', `<button type="button" class="btn cta sm" data-act="book-go">${p.go === 'season' ? '현장 보기' : '상점 보기'}</button>`);
  }

  /** 시트 안 누름 — 보유와 한 판 상한 안에서만 움직이고, 궤도조각으로 산 것은 바로 체크한다 */
  function kitAct(act: string, id: KitId): void {
    const def = kitDef(id);
    if (!kit || !def) return;
    const n = kit.sel[id] ?? 0;
    const max = Math.min(def.max, kit.view.items[id]);
    if (act === 'kit-buy') {
      const v = kit.buy(id);
      if (!v) return;
      kit.view = v;
      kit.sel = { ...kit.sel, [id]: 1 };
    } else if (act === 'kit-toggle') kit.sel = { ...kit.sel, [id]: n > 0 ? 0 : 1 };
    else kit.sel = { ...kit.sel, [id]: Math.min(max, Math.max(0, n + (act === 'kit-plus' ? 1 : -1))) };
    $('modal-body').innerHTML = kitHtml(kit.view, kit.sel);
    // 다시 그리면 초점이 날아간다 — 같은 자리로 돌려놓는다(사라진 단추면 시작으로)
    const back = $('modal-body').querySelector<HTMLButtonElement>(`[data-act="${act}"][data-kit="${id}"]:not(:disabled)`)
      ?? root.querySelector<HTMLButtonElement>('[data-act="kit-start"]');
    back?.focus({ preventScroll: true });
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
      html: `<p class="muted">하늘에서 건물이 떨어진다. 바닥에 닿기 전에 벤다. 깔리면 가드 키가 탈출이 된다. 한 번 누르면 빠져나온다.</p><div class="howto">${rows}</div>`
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
        { label: '닫기', act: 'modal-close', kind: 'quiet' },
        { label: '지우기', act: 'reset-yes', kind: 'danger' },
      ],
    });
  }

  // 구입 안내를 펴면 글이 화면 밖으로 숨지 않게
  root.addEventListener('toggle', (e) => {
    const d = e.target as HTMLDetailsElement;
    if (d.open) d.scrollIntoView({ block: 'nearest' });
  }, true);

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
      case 'job-prev': h.onJob(-1); break;
      case 'job-next': h.onJob(1); break;
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
      case 'modal-close': closeModal(true); break;
      case 'book-go': closeModal(); if (bookGo) h.onBookGo(bookGo); break;
      case 'kit-toggle':
      case 'kit-plus':
      case 'kit-minus':
      case 'kit-buy': kitAct(act, t.getAttribute('data-kit') as KitId); break;
      case 'kit-start': {
        const k = kit;
        closeModal();
        k?.start(k.sel);
        break;
      }
      case 'ask-yes': {
        const ok = askOk;
        closeModal();
        ok?.();
        break;
      }
      case 'home-note':
        if (titleView?.note?.to === 'shop') h.onOpenPack();
        else h.onOpenMissions();
        break;
      case 'butter-1': h.onButterRound(1); break;
      case 'butter-2': h.onButterRound(2); break;
      case 'butter-3': h.onButterRound(3); break;
      case 'butter-back': h.onButterBack(); break;
      case 'stage':
      case 'hang': h.onJobTap(); break;
      case 'stage-back': if (!stageUi.back()) h.onMetaBack(); break;
      case 'meta-back': h.onMetaBack(); break;
      case 'go-shop': h.onGameOverShop(); break;
      case 'go-missions': h.onGameOverMissions(); break;
      case 'rk': h.onResultKey(t.getAttribute('data-k') as TouchAction); break;
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

  /* ── 결과 넷 = 현장 화면 + 보고서 한 장(style.css .ov-rp). 띠(모드) · 보고서(끝 줄 = 다음 목표 + 상점 · 미션 단추) · 귀퉁이 먹 도장.
     누를 것은 조작 구역의 결과 단추(.rp-acts, setResultKeys — 동작은 scenes resultDo · ui/resultLogic.ts). 조작 키는 숨는다.
     화면 글은 원래 결과 화면의 말 · 값만 ── */
  interface RpOpts {
    goal?: string;
    goalId?: string;
    mode: string;
    /** 귀퉁이 먹 도장 글. grade = 등급 글자(S · A · B — 본문 굵게) */
    stamp?: string;
    grade?: boolean;
    body: string;
    /** 다음 목표 줄 끝 단추 — 결과의 상점 · 미션 지름길 */
    tab?: { act: string; label: string };
  }
  /** 마지막으로 그린 결과 단추 얼굴(JSON). 보고서를 새로 그리면 비운다 */
  let rkFaces = '';
  function paintRp(name: OverlayScreen, o: RpOpts): HTMLElement {
    const el = screenEl(name) as HTMLElement;
    const goal = o.goal
      ? `<span class="rp-goal">${lb(SCREENS.gameover.nextTag)}${o.goalId ? swordSvg(o.goalId) : ''}<span class="t">${escapeHtml(o.goal)}</span></span>`
      : '';
    const tab = o.tab ? `<button type="button" class="rk rp-go" data-act="${o.tab.act}">${o.tab.label}</button>` : '';
    const next = goal || tab ? `<div class="rp-next">${goal}${tab}</div>` : '';
    const stamp = o.stamp ? `<span class="rp-stamp${o.grade ? ' grade' : ''}" role="img" aria-label="${escapeHtml(o.stamp)}">${escapeHtml(o.stamp)}</span>` : '';
    el.innerHTML = `<div class="hf-band"><span class="tag rp-mode">${escapeHtml(o.mode)}</span></div>${BAND_LINE}`
      + `<article class="rp" aria-label="${STAGE_MODE.report}"><header class="rp-h"><b>${STAGE_MODE.report}</b><span>${escapeHtml(h.resultWho())}</span></header>${o.body}${next}</article>${stamp}`
      + '<div class="rp-acts"></div>';
    rkFaces = '';
    return el;
  }
  /** 결과 단추 — 공격 자리 = 주홍 폭 단추, 나머지(점프 · 필살 · 가드 자리)는 그 밑 한 줄. 동작 없는 자리는 안 그린다 */
  function setResultKeys(f: KeyFaces | null): void {
    const key = f ? JSON.stringify(f) : '';
    if (key === rkFaces) return;
    const box = RESULTS.has(screen) ? screenEl(screen)?.querySelector<HTMLElement>('.rp-acts') : null;
    if (!box) return;
    rkFaces = key;
    const had = document.activeElement instanceof HTMLElement && box.contains(document.activeElement)
      ? document.activeElement.getAttribute('data-k') : null;
    const btn = (k: TouchAction): string => {
      const c = f?.[k];
      if (!c || c.tone === 'rest') return '';
      const shut = c.tone === 'faint';
      const sub = c.sub ? `<small>${escapeHtml(c.sub.replace('\n', ' · '))}</small>` : '';
      return `<button type="button" class="${k === 'attack' ? 'seal rk-main' : 'rk'}${shut ? ' shut' : ''}" data-act="rk" data-k="${k}" aria-disabled="${shut}"><b>${escapeHtml(c.label)}</b>${sub}</button>`;
    };
    const row = (['jump', 'special', 'guard'] as const).map(btn).join('');
    box.innerHTML = btn('attack') + (row ? `<div class="rk-row">${row}</div>` : '');
    if (had) box.querySelector<HTMLElement>(`[data-k="${had}"]`)?.focus({ preventScroll: true });
  }
  const lb = (t: string): string => `<span class="lb">${t}</span>`;
  const verdict = (t: string): string => `<div class="rp-j">${lb('판정')}<b>${escapeHtml(t)}</b></div>`;
  const scoreRow = (el: string, best: boolean): string =>
    `<div class="rp-sc">${lb('점수')}<b class="n" data-el="${el}"></b>${best ? `<i class="rp-best">${SCREENS.stamps.best}</i>` : ''}</div>`;
  const cell = (dt: string, dd: string, cls = 'n'): string => `<div><dt>${dt}</dt><dd class="${cls}">${dd}</dd></div>`;

  const api: OverlayApi = {
    getScreen: () => screen,
    showBoot(): void { enter('boot'); },
    showTitle(v: TitleView): void {
      const same = screen === 'title';
      enter('title', () => paintTitle(v));
      if (same) heroPose(heroCur);
      else heroReset();
      paintJobArt(v, true);
    },
    setTitleJob,
    showStory(lines: readonly string[], opts: StoryOpts = {}): void {
      enter('story', () => {
        $('story').innerHTML = lines.map((ln) => (ln ? `<p>${escapeHtml(ln)}</p>` : '<p class="ov-gap"></p>')).join('');
        $('story-stamps').innerHTML = (opts.stamps ?? []).map((t) => `<span class="seal ink">${brushNum(t)}</span>`).join('');
        const scr = screenEl('story') as HTMLElement;
        const wipe = opts.wipeTicks ?? 0;
        scr.classList.toggle('has-wipe', wipe > 0);
        scr.style.setProperty('--wipe', `${Math.round(wipe * TICK * 1000)}ms`);
      });
    },
    showPause(v: PauseView): void {
      disarmQuit();
      enter('pause', () => {
        $('pause-stats').innerHTML = `<span>점수</span><b>${fmt(v.score)}</b><span>콤보 <i>${fmt(v.combo)}</i></span>`;
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
        paintRp('gameover', {
          goal: v.goal,
          goalId: v.goalId,
          mode: v.mode,
          stamp: v.best ? g.stampBest : g.stamp,
          tab: v.goalMissions ? { act: 'go-missions', label: SCREENS.tabs.missions } : { act: 'go-shop', label: SCREENS.tabs.shop },
          body: verdict(g.title) + scoreRow('go-score', v.best)
            + `<dl class="rp-tb">${cell(g.buildings, `${fmt(v.buildings)}<small>채</small>`)}${cell('최고 콤보', fmt(v.combo))}`
            + `${cell(g.dust, `+${fmt(v.dustGained)}`)}${cell(g.zone, escapeHtml(v.zone), 't')}</dl>`
            + `<p class="rp-bg">${lb('비고')}<span>${escapeHtml(v.line)}</span></p>`,
        });
      });
      rollScore($('go-score'), v.score, 'gameover');
    },
    showOpsEnd(v: OpsEndView): void {
      enter('opsend', () => {
        const o = SCREENS.ops;
        const [label, value] = v.rows[0] ?? ['', ''];
        const rest = v.rows.slice(1).map(([k, val]) => cell(escapeHtml(k), escapeHtml(val))).join('');
        paintRp('opsend', {
          goal: v.progress,
          mode: SCREENS.menu.ops,
          stamp: v.grade ?? undefined,
          grade: true,
          body: verdict(v.grade ? o.doneTitle : o.timeUpTitle)
            + `<div class="rp-sc">${lb(escapeHtml(label ? `${v.name} · ${label}` : v.name))}<b class="n">${escapeHtml(value)}</b></div>`
            + (rest ? `<dl class="rp-tb">${rest}</dl>` : '')
            + `<p class="rp-ln">목표 · ${escapeHtml(v.goal)}</p>`
            + `<p class="rp-ln muted">${o.bestStamp} ${v.best ?? o.noStamp}${v.improved ? ` · ${o.stampNew}` : ''}</p>`,
        });
      });
    },
    showOps(opts): void {
      enter('ops', () => paintOps($('body-ops'), opts, (id) => h.onOpsPick(id)));
    },
    showStages(opts, detail): void {
      enter('stages', () => stageUi.show(opts, detail));
    },
    stagesBack: () => screen === 'stages' && stageUi.back(),
    setResultKeys,
    showStageEnd(v): void {
      enter('stageend', () => {
        const r = stageReport(v);
        bindFlip(paintRp('stageend', { mode: STAGE_MODE.title, stamp: r.stamp || undefined, body: r.html }));
      });
    },
    showMissions(v): void {
      enter('missions', () => paintMissions($('body-missions'), v, (id, boost) => h.onClaimMission(id, boost), (kind) => h.onTake(kind), (line) => h.onAchieve(line)));
    },
    showShop(inv, owned, paths, pack, tab): void {
      enter('shop', () => paintShop($('body-shop'), inv, owned, paths, pack, {
        onBuy: (id) => h.onBuySku(id),
        onAdPack: () => h.onAdOrbit(),
        onOrbit: (id) => h.onUnlockOrbit(id),
        onDust: (id) => h.onUnlockDust(id),
        onExchange: () => h.onExchangeDust(),
        onExam: () => h.onExam(),
        onEquip: (slot, id) => h.onEquip(slot, id),
        onKitBuy: (id) => h.onKitBuy(id),
        onRestore: () => h.onRestore(),
        onCoffee: () => h.onCoffee(),
        onRegular: () => h.onRegular(),
      }, tab));
    },
    showBook(inv, owned, masks, record): void {
      enter('book', () => paintBook($('body-book'), inv, owned, openBookPage, masks, record));
    },
    showKit(v, start, buy): void {
      openModal({
        tone: 'brown',
        art: goods('toolbox'),
        meta: '시작 장비',
        title: '들고 갈 것',
        html: kitHtml(v, {}),
        actions: [{ label: '닫기', act: 'modal-close', kind: 'quiet' }, { label: '시작', act: 'kit-start', kind: 'cta' }],
      });
      kit = { view: v, sel: {}, start, buy };
      $('modal-card').classList.add('kit');
      toastEl.classList.remove('on'); // 방금 받은 보상 알림이 시작 단추를 가리지 않게
      root.querySelector<HTMLButtonElement>('[data-act="kit-start"]')?.focus({ preventScroll: true });
    },
    ask(o, ok): void {
      openModal({
        tone: o.tone,
        art: o.art,
        meta: o.meta,
        title: o.title,
        html: (o.html ?? '') + (o.lines ?? []).map((ln) => `<p>${escapeHtml(ln)}</p>`).join('') + (o.fine?.length ? infoHtml(o.fine) : ''),
        actions: [
          ...(o.no ? [{ label: o.no, act: 'modal-close', kind: 'quiet' as const }] : []),
          { label: o.yes, act: 'ask-yes', kind: o.pay ? 'pay' as const : 'cta' as const },
        ],
      });
      askOk = ok;
    },
    showEnding(v: EndingView): void {
      enter('ending', () => {
        const r = SCREENS.result;
        paintRp('ending', {
          mode: v.mode,
          stamp: '완료',
          body: verdict(r.success) + scoreRow('end-score', v.best)
            + `<dl class="rp-tb">${cell('최고 콤보', fmt(v.maxCombo))}</dl>`
            + `<p class="rp-ln">${v.fullCombo ? r.fullComboNote : r.tokotonUnlock}</p>`
            + `<p class="rp-bg">${lb('비고')}<span>${r.petals}</span></p>`,
        });
      });
      rollScore($('end-score'), v.score, 'ending');
    },
    showHowto,
    modalOpen: () => !$('modal').hidden,
    closeModal: () => closeModal(),
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

/** 홈 일감 판단 재료 — 화면(titleViewFromSave)과 확인 동작(scenes)이 같은 식으로 만든다 */
export function homeFactsFromSave(save: SaveData, debugOpen = false): HomeFacts {
  return homeFactsOf(save, lastDiffPick(), debugOpen || isDevUnlocked());
}

export function titleViewFromSave(save: SaveData, job: JobId, debugOpen = false): TitleView {
  const unlocked = debugOpen || isDevUnlocked();
  const today = dailyDone(save.daily);
  const chapter = Math.min(3, unlocked ? 3 : save.unlockedChapters);
  return {
    job,
    facts: homeFactsFromSave(save, debugOpen),
    bestArcade: save.bestArcade,
    buddhaMode: save.buddhaMode && import.meta.env.DEV,
    dust: save.dust,
    orbit: save.orbit,
    todayDone: today.done,
    todayTotal: today.total,
    butterBest: save.butterBest,
    rank: licenseTitle(save.license),
    loadout: save.loadout,
    maskArt: save.maskArt,
    theme: regionOf(chapter).theme,
    chapter,
    note: null,
  };
}
