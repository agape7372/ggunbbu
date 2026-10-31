// 표지 / 타이틀 / 스토리 / 일시정지 / 설정 / 결과 / 엔딩 DOM 오버레이 + 확인 창 + 토스트.
// 원작 UI 카피 미사용 — 건뿌 병맛 한국어만. 콘셉트 「철거 서류」(style.css 머리말).

import type { SaveData, SaveSettings } from '../storage';
import { TICK } from '../config';
import { SCREENS, TAGLINE, TITLE } from '../content';
import { fillGallery } from './gallery';
import { FLASH_LABEL, SHAKE_LABEL } from './settings';
import { isDevUnlocked } from '../platform/devUnlock';
import { nativeAppVersion } from '../platform/native';
import { paintOps, type OpsOpts } from './opsView';
import { paintMissions } from './missionView';
import { paintShop, type ShopInv } from './shopView';
import type { OpGrade } from '../meta/ops';
import { paintCustom } from './customView';
import { ICON } from './icons';
import { ACHIEVES, DAILY_POOL, dailyDone, licenseTitle } from '../meta';
import { APP_VERSION } from '../version';
import type { DailyState, Loadout, MissionProgress } from '../meta/types';
import { escapeHtml } from './html';

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
  | 'missions'
  | 'shop'
  | 'custom';

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
  /** 지갑 칩 */
  dust: number;
  orbit: number;
  /** 오늘 일일 미션 — total 0이면 줄을 숨긴다 */
  todayDone: number;
  todayTotal: number;
  /** 회차별 최고 점수 (회차 선택 버튼 옆) */
  butterBest: Readonly<Record<number, number>>;
  /** 철거 자격 칭호 — 타이틀 머리줄 */
  rank: string;
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
  canContinue: boolean;
  canRevive: boolean;
  /** 광고 경로 실재 여부 — false(웹)면 광고 문구 없는 "일어나기" (08-30, P0-2) */
  adRevive: boolean;
  reviveLeft: number;
  reviveMax: number;
  line: string;
  /** 이번 판이 그 모드 최고 기록을 넘었나 */
  best: boolean;
  /** 카드 머리에 찍는 모드 이름 */
  mode: string;
  /** 철거 자격 칭호 — 보고서 머리줄 */
  rank: string;
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
  /** 표 — [이름, 값, 크게?] */
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

/** 이야기 판 진입 연출 — 테이프 와이프 길이(틱)와 도장 */
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
  onGameOverContinue(): void;
  onGameOverRetry(): void;
  onGameOverTitle(): void;
  onGameOverRevive(): void;
  onOpsEndList(): void;
  /** 철거 자격 응시 */
  onExam(): void;
  onEndingDone(): void;
  onEndingRetry(): void;
  /** 지금 받을 수 있는 미션 수 — 미션 탭 점 배지 */
  missionBadge(): number;
  onLogoTap(): void;
  onOpsPick(id: string): void;
  onOpenOps(): void;
  onOpenMissions(): void;
  onOpenShop(): void;
  onOpenCustom(): void;
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
  showMissions(daily: DailyState, achieves: MissionProgress[], adBoost: boolean): void;
  showShop(inv: ShopInv, owned: ReadonlySet<string>, paths: { iap: boolean; ad: boolean }): void;
  showCustom(loadout: Loadout, owned: ReadonlySet<string>): void;
  /** 조작 안내 창. first = 첫 실행(닫으면 onHowtoDone) */
  showHowto(first: boolean): void;
  /** 확인 창이 떠 있나 — 뒤로가기가 창부터 닫는다 */
  modalOpen(): boolean;
  closeModal(): void;
  toast(text: string): void;
  hide(): void;
}

const TAB_SCREENS: ReadonlySet<OverlayScreen> = new Set([
  'title', 'ops', 'missions', 'shop', 'custom', 'settings', 'butter',
]);

const TOAST_MS = 2400;
const QUIT_CONFIRM_MS = 3000;

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

/** 사선으로 잘린 로고 — 같은 글자 두 장(style.css .logo) */
function logoHtml(extra = ''): string {
  const t = escapeHtml(TITLE);
  return `<h1 class="logo" aria-label="${t}"${extra}><span class="cut-a" aria-hidden="true">${t}</span><span class="cut-b" aria-hidden="true">${t}</span></h1>`;
}

/** 세 단계 고르기 — 원하는 칸을 바로 누른다(한 칸씩 돌려 누르기 없음). 고른 칸은 paintLevel이 칠한다 */
function levelRow(act: string, name: string, labels: readonly string[]): string {
  const segs = labels.map((l, i) => `<button type="button" data-act="${act}" data-v="${i}">${l}</button>`).join('');
  return `<div class="set-row set-level"><span>${name}</span><span class="seg" role="group" aria-label="${name}" data-el="${act}">${segs}</span></div>`;
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

function modeRow(act: string, no: string): string {
  return `<button type="button" class="mode-row" data-act="${act}" data-el="${act}">
    <span class="mode-no">${no}</span><span class="mode-name"></span><span class="mode-sub"></span>
  </button>`;
}

const HOWTO_ROWS: readonly { icon: keyof typeof ICON; name: string; desc: string; hot?: boolean }[] = [
  { icon: 'attack', name: '공격', desc: '닿은 층을 벤다. 이어 베면 콤보.' },
  { icon: 'jump', name: '점프', desc: '한 번 누르면 한 번 뛴다.' },
  { icon: 'guard', name: '가드', desc: '떨어지는 건물을 튕겨 올린다. 막대만큼.' },
  { icon: 'special', name: '필살', desc: '막대가 차면 노랗게 켜진다.', hot: true },
];

export function mountOverlay(root: HTMLElement, h: OverlayHandlers): OverlayApi {
  root.innerHTML = `
    <div class="ov-screen ov-cover" data-screen="boot" data-act="boot">
      <p class="doc-meta"><span>건뿌 철거사무소</span><span>제 0001 호</span></p>
      <div class="cover-mid">
        <img class="cover-mark" src="./icons/icon-512.png" alt="" />
        ${logoHtml()}
        <p class="cover-tag">${TAGLINE}</p>
      </div>
      <div class="cover-cta">
        <div class="tape" aria-hidden="true"></div>
        <p class="tap-hint">누르면 시작</p>
      </div>
    </div>

    <div class="ov-screen ov-title ov-has-tabs" data-screen="title" hidden>
      <header class="title-head">
        <p class="doc-meta"><span data-el="title-rank">철거 허가 · 견습</span><span>GUNBBU</span></p>
        ${logoHtml(' data-act="logo"')}
        <p class="title-tag">${TAGLINE}</p>
      </header>
      <div class="ov-menu">
        <button type="button" class="cta" data-act="arcade" data-el="arcade">
          <span class="cta-label">${SCREENS.menu.arcade}</span>
          <span class="cta-sub">${SCREENS.menu.arcadeSub}</span>
        </button>
        <div class="mode-list">
          ${modeRow('tokoton', '02')}
          ${modeRow('butter', '03')}
          ${modeRow('ops', '04')}
        </div>
      </div>
      <section>
        <p class="wallet-strip" data-el="wallet"></p>
        <dl class="records" data-el="records"></dl>
        <div class="zones" data-el="gallery"></div>
        <p class="ov-buddha" data-el="buddha" hidden>${SCREENS.title.buddha}</p>
      </section>
    </div>

    <div class="ov-screen ov-story" data-screen="story" data-act="story-skip" hidden>
      <i class="wipe wipe-a" aria-hidden="true"></i><i class="wipe wipe-b" aria-hidden="true"></i>
      <div class="story-body">
        <div class="story-stamps" data-el="story-stamps"></div>
        <div class="story-lines" data-el="story"></div>
      </div>
      <p class="tap-hint">누르면 넘김</p>
    </div>

    <div class="ov-screen ov-modal-bg" data-screen="pause" hidden>
      <div class="card" role="dialog" aria-modal="true" aria-label="잠깐">
        <p class="card-meta"><span>작업 일지</span><span>일시 중지</span></p>
        <h2 class="card-title">잠깐</h2>
        <dl class="stat-rows" data-el="pause-stats"></dl>
        <div class="card-actions">
          <button type="button" class="cta" data-act="resume"><span class="cta-label">계속 부수기</span></button>
          <button type="button" class="btn" data-act="pause-settings">${ICON.settings}설정</button>
          <button type="button" class="btn btn-quiet" data-act="quit" data-el="quit">그만두기</button>
        </div>
      </div>
    </div>

    <div class="ov-screen ov-sheet-screen ov-has-tabs" data-screen="settings" data-el="settings-screen" hidden>
      <div class="ov-sheet">
        <div data-el="settings-body">
          <header class="sheet-head"><h2>설정</h2></header>
          <p class="sec-h">게임</p>
          <button type="button" class="set-row" data-act="set-sound"><span>소리</span><span class="sw" data-el="set-sound"></span></button>
          <button type="button" class="set-row" data-act="set-bgm"><span>음악</span><span class="sw" data-el="set-bgm"></span></button>
          <button type="button" class="set-row" data-act="set-sfx"><span>효과음</span><span class="sw" data-el="set-sfx"></span></button>
          <button type="button" class="set-row" data-act="set-vib"><span>진동</span><span class="sw" data-el="set-vib"></span></button>
          ${levelRow('set-shake', '화면 흔들림', SHAKE_LABEL)}
          ${levelRow('set-flash', '번쩍임', FLASH_LABEL)}
          <button type="button" class="set-row" data-act="set-hand"><span>왼손 조작</span><span class="sw" data-el="set-hand"></span></button>
          <p class="sec-h">도움말</p>
          <button type="button" class="set-row" data-act="howto"><span>조작 안내</span>${ICON.next}</button>
          <button type="button" class="set-row" data-act="privacy"><span>개인정보 처리방침</span>${ICON.next}</button>
          <button type="button" class="set-row" data-act="credits"><span>글꼴 저작권</span>${ICON.next}</button>
          <button type="button" class="set-row set-danger" data-act="reset" data-el="reset-row"><span>기록 지우기</span>${ICON.next}</button>
          <p class="sheet-foot">GUNBBU <span data-el="ver">v${APP_VERSION}</span><span class="kbd-hint"><br>키보드: 점프 ↑ · 가드 ↓ · 공격 Z · 필살 X · 멈춤 Esc</span></p>
        </div>
        <button type="button" class="btn" data-act="set-back" data-el="set-back">뒤로</button>
      </div>
    </div>

    <div class="ov-screen ov-sheet-screen ov-has-tabs" data-screen="butter" hidden>
      <div class="ov-sheet">
        <div data-el="butter-body">
          <header class="sheet-head">
            <h2>버터바 챌린지</h2>
            <p class="sheet-lead">만나 본 회차만 다시 할 수 있습니다.</p>
          </header>
          <div class="list" data-el="butter-rounds"></div>
        </div>
        <button type="button" class="btn" data-act="butter-back">뒤로</button>
      </div>
    </div>

    <div class="ov-screen ov-modal-bg" data-screen="gameover" hidden>
      <div class="card" role="dialog" aria-modal="true" aria-label="${SCREENS.gameover.title}">
        <p class="card-meta"><span data-el="over-rank">철거 보고서</span><span data-el="over-mode"></span></p>
        <h2 class="card-title">${SCREENS.gameover.title}</h2>
        <span class="stamp" aria-hidden="true" data-el="over-stamp">${SCREENS.gameover.stamp}</span>
        <p class="card-reason">사유: <b data-el="over-line"></b></p>
        <dl class="stat-rows" data-el="over-stats"></dl>
        <p class="next-goal" data-el="over-goal" hidden></p>
        <p class="best-tag" data-el="over-best" hidden>${SCREENS.stamps.best}</p>
        <div class="card-actions">
          <button type="button" class="cta" data-act="go-revive" data-el="go-revive"></button>
          <button type="button" class="btn" data-act="go-continue" data-el="go-continue">${SCREENS.gameover.continue}</button>
          <button type="button" class="btn" data-act="go-retry" data-el="go-retry">한 판 더</button>
          <button type="button" class="btn btn-quiet" data-act="go-title">타이틀로</button>
        </div>
      </div>
    </div>

    <div class="ov-screen ov-modal-bg" data-screen="opsend" hidden>
      <div class="card" role="dialog" aria-modal="true" aria-labelledby="opsend-title">
        <p class="card-meta"><span data-el="opsend-rank">${SCREENS.ops.reportMeta}</span><span data-el="opsend-name"></span></p>
        <h2 class="card-title" id="opsend-title" data-el="opsend-title"></h2>
        <span class="stamp op-stamp" data-el="opsend-stamp" hidden></span>
        <p class="card-reason">목표: <b data-el="opsend-goal"></b></p>
        <dl class="stat-rows" data-el="opsend-stats"></dl>
        <p class="next-goal" data-el="opsend-progress" hidden></p>
        <p class="best-tag" data-el="opsend-new" hidden>${SCREENS.ops.stampNew}</p>
        <div class="card-actions">
          <button type="button" class="cta" data-act="ops-retry"><span class="cta-label">${SCREENS.ops.retry}</span></button>
          <button type="button" class="btn" data-act="ops-list">${SCREENS.ops.list}</button>
          <button type="button" class="btn btn-quiet" data-act="ops-title">${SCREENS.ops.title}</button>
        </div>
      </div>
    </div>

    <div class="ov-screen ov-sheet-screen" data-screen="ops" hidden>
      <div class="ov-sheet">
        <div data-el="ops-list"></div>
        <button type="button" class="btn" data-act="meta-back">뒤로</button>
      </div>
    </div>

    <div class="ov-screen ov-sheet-screen ov-has-tabs" data-screen="missions" hidden>
      <div class="ov-sheet"><div data-el="mission-list"></div></div>
    </div>

    <div class="ov-screen ov-sheet-screen ov-has-tabs" data-screen="shop" hidden>
      <div class="ov-sheet"><div data-el="shop-list"></div></div>
    </div>

    <div class="ov-screen ov-sheet-screen ov-has-tabs" data-screen="custom" hidden>
      <div class="ov-sheet"><div data-el="custom-list"></div></div>
    </div>

    <div class="ov-screen ov-ending" data-screen="ending" hidden>
      <p class="doc-meta"><span>철거 보고서</span><span>최종</span></p>
      <span class="stamp">${SCREENS.result.success}</span>
      <p class="end-sub">${SCREENS.result.petals}</p>
      <dl class="stat-rows" data-el="end-stats"></dl>
      <p class="best-tag" data-el="end-best" hidden>${SCREENS.stamps.best}</p>
      <p class="end-note" data-el="end-note"></p>
      <div class="card-actions end-actions">
        <button type="button" class="cta" data-act="end-retry"><span class="cta-label">한 판 더</span></button>
        <button type="button" class="btn" data-act="end-title">타이틀로</button>
      </div>
    </div>

    <nav class="ov-tabs" data-el="tabs" hidden>
      <button type="button" class="ov-tab" data-act="tab-play" data-tab="title">${ICON.play}${SCREENS.tabs.play}</button>
      <button type="button" class="ov-tab" data-act="tab-missions" data-tab="missions">${ICON.missions}${SCREENS.tabs.missions}<i class="tab-dot" aria-hidden="true"></i></button>
      <button type="button" class="ov-tab" data-act="tab-custom" data-tab="custom">${ICON.custom}${SCREENS.tabs.custom}</button>
      <button type="button" class="ov-tab" data-act="tab-shop" data-tab="shop">${ICON.shop}${SCREENS.tabs.shop}</button>
      <button type="button" class="ov-tab" data-act="tab-more" data-tab="settings">${ICON.settings}${SCREENS.tabs.more}</button>
    </nav>

    <div class="ov-modal" data-el="modal" hidden>
      <div class="card" role="dialog" aria-modal="true" aria-labelledby="modal-title-text" tabindex="-1" data-el="modal-card">
        <p class="card-meta"><span data-el="modal-meta"></span>
          <button type="button" class="icon-btn" data-act="modal-close" data-el="modal-x" aria-label="닫기">${ICON.close}</button></p>
        <h2 class="card-title" id="modal-title-text" data-el="modal-title"></h2>
        <div class="modal-body" data-el="modal-body"></div>
        <div class="card-actions" data-el="modal-actions"></div>
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
  let opsOpts: OpsOpts = { unlockedChapters: 0, allOpen: false, act2Cleared: false, grades: {} };
  let quitArmed = 0;
  let resetArmed = false;
  let howtoFirst = false;

  const $ = (name: string): HTMLElement => root.querySelector(`[data-el="${name}"]`) as HTMLElement;

  // 설치된 앱이면 스토어 버전(versionName)을 보여 준다 — 웹 번들 버전은 OTA용이라 다를 수 있다
  void nativeAppVersion().then((v) => { if (v) $('ver').textContent = `v${v}`; });

  function paintTabs(name: OverlayScreen): void {
    const tabs = $('tabs');
    tabs.hidden = !TAB_SCREENS.has(name);
    const key = name === 'ops' || name === 'butter' ? 'title' : name;
    tabs.querySelectorAll<HTMLButtonElement>('.ov-tab').forEach((btn) => {
      const on = btn.getAttribute('data-tab') === key;
      btn.classList.toggle('on', on);
      if (on) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    if (!tabs.hidden) {
      const n = h.missionBadge();
      const mt = tabs.querySelector('[data-tab="missions"]') as HTMLElement;
      mt.classList.toggle('has-dot', n > 0);
      if (n > 0) mt.setAttribute('aria-label', `${SCREENS.tabs.missions}, 받을 것 ${n}`);
      else mt.removeAttribute('aria-label');
    }
  }

  function show(name: OverlayScreen): void {
    // 다른 화면으로 옮기면 앞 화면의 알림은 거둔다 — 탭을 바꿔도 2.4초 남아 새 목록을 가렸다(10-28)
    if (name !== screen) { window.clearTimeout(toastTimer); toastEl.classList.remove('on'); }
    screen = name;
    closeModal();
    root.classList.toggle('is-open', name !== 'none');
    root.querySelectorAll<HTMLElement>('[data-screen]').forEach((el) => {
      el.hidden = el.getAttribute('data-screen') !== name;
    });
    paintTabs(name);
  }

  function statRows(rows: readonly [string, string, boolean?][]): string {
    return rows.map(([k, v, big]) => `<dt>${k}</dt><dd${big ? ' class="big"' : ''}>${v}</dd>`).join('');
  }

  function setMode(act: string, name: string, sub: string, open: boolean): void {
    const row = $(act) as HTMLButtonElement;
    row.disabled = !open;
    (row.querySelector('.mode-name') as HTMLElement).textContent = name;
    (row.querySelector('.mode-sub') as HTMLElement).innerHTML = open ? escapeHtml(sub) : `${ICON.lock}${escapeHtml(sub)}`;
  }

  function paintTitle(v: TitleView): void {
    titleView = v;
    const m = SCREENS.menu;
    setMode('tokoton', m.tokoton, v.tokotonOpen ? m.tokotonSub : m.tokotonLocked, v.tokotonOpen);
    setMode('butter', m.butter, v.butterTier > 0 ? m.butterSub(v.butterTier) : m.butterLocked, v.butterTier > 0);
    setMode('ops', m.ops, m.opsSub, true);
    const today = v.todayTotal > 0
      ? `<span class="today">${SCREENS.title.today(v.todayDone, v.todayTotal)}</span>` : '';
    $('wallet').innerHTML =
      `<span aria-label="${SCREENS.title.dust}">${ICON.dust}${v.dust.toLocaleString('ko-KR')}</span>`
      + `<span aria-label="${SCREENS.title.orbit}">${ICON.orbit}${v.orbit.toLocaleString('ko-KR')}</span>${today}`;
    $('records').innerHTML = [
      [SCREENS.title.best, v.bestArcade.toLocaleString('ko-KR')],
      [SCREENS.title.tokotonBest, v.bestTokoton.toLocaleString('ko-KR')],
      [SCREENS.title.maxCombo, v.maxCombo.toLocaleString('ko-KR')],
    ].map(([k, n]) => `<div><dt>${k}</dt><dd>${n}</dd></div>`).join('');
    $('buddha').hidden = !v.buddhaMode;
    $('title-rank').textContent = `철거 허가 · ${v.rank}`;
    fillGallery($('gallery'), v.unlockedChapters);
    setTitleSelected(v.selected);
  }

  function setTitleSelected(index: number): void {
    if (titleView) titleView.selected = index;
    const acts = ['arcade', 'tokoton', 'butter', 'ops'];
    acts.forEach((act, i) => $(act).classList.toggle('selected', i === index));
  }

  function paintSettings(s: SaveSettings): void {
    settings = s;
    $('set-sound').classList.toggle('on', s.sound);
    $('set-bgm').classList.toggle('on', s.bgm);
    $('set-sfx').classList.toggle('on', s.sfx);
    $('set-vib').classList.toggle('on', s.vibration);
    $('set-hand').classList.toggle('on', s.leftHanded);
    paintLevel($('set-shake'), s.shakeLevel);
    paintLevel($('set-flash'), s.flashLevel);
    for (const [act, on] of [['set-sound', s.sound], ['set-bgm', s.bgm], ['set-sfx', s.sfx], ['set-vib', s.vibration], ['set-hand', s.leftHanded]] as const) {
      root.querySelector(`[data-act="${act}"]`)?.setAttribute('aria-pressed', String(on));
    }
  }

  function paintButter(tier: number): void {
    const box = $('butter-rounds');
    box.innerHTML = '';
    for (let r = 1; r <= 3; r++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-round';
      b.innerHTML = `<span class="r-name">${escapeHtml(SCREENS.butter.rounds[r - 1])}</span>`;
      const best = titleView?.butterBest[r] ?? 0;
      if (r <= tier && best > 0) b.insertAdjacentHTML('beforeend', `<span class="r-best">${SCREENS.butter.best(best)}</span>`);
      if (r > tier) {
        b.disabled = true;
        b.insertAdjacentHTML('afterbegin', ICON.lock);
      } else {
        b.setAttribute('data-act', `butter-${r}`);
      }
      box.appendChild(b);
    }
  }

  function disarmQuit(): void {
    window.clearTimeout(quitArmed);
    quitArmed = 0;
    const q = $('quit');
    q.classList.remove('confirm');
    q.textContent = '그만두기';
  }

  // ── 확인 창 ──
  interface ModalAction { label: string; act: string; kind?: 'cta' | 'btn' | 'quiet' | 'danger' }
  function openModal(o: { meta: string; title: string; html: string; actions: readonly ModalAction[]; closable?: boolean }): void {
    $('modal-meta').textContent = o.meta;
    $('modal-title').textContent = o.title;
    $('modal-body').innerHTML = o.html;
    $('modal-x').hidden = o.closable === false;
    $('modal-actions').innerHTML = o.actions.map((a) => {
      const cls = a.kind === 'cta' ? 'cta' : a.kind === 'quiet' ? 'btn btn-quiet' : a.kind === 'danger' ? 'btn confirm' : 'btn';
      const label = a.kind === 'cta' ? `<span class="cta-label">${a.label}</span>` : a.label;
      return `<button type="button" class="${cls}" data-act="${a.act}">${label}</button>`;
    }).join('');
    $('modal').hidden = false;
    root.classList.add('is-open'); // 플레이 중(오버레이 닫힘)에도 뜰 수 있게
    $('modal-card').focus({ preventScroll: true }); // 화면 낭독·키보드가 창 안에서 시작하게
  }

  function closeModal(): void {
    const m = $('modal');
    if (m.hidden) return;
    m.hidden = true;
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

  function showHowto(first: boolean): void {
    howtoFirst = first;
    const rows = HOWTO_ROWS.map((r) =>
      `<div class="howto-row"><span class="howto-key${r.hot ? ' hot' : ''}">${ICON[r.icon]}</span><p><b>${r.name}</b><span>${r.desc}</span></p></div>`,
    ).join('');
    openModal({
      meta: '작업 안내',
      title: '이렇게 부순다',
      html: `<p class="muted">하늘에서 건물이 떨어진다. 바닥에 닿기 전에 벤다. 깔리면 가드로 빠져나온다.</p><div class="howto">${rows}</div>`,
      actions: [{ label: first ? '시작' : '닫기', act: 'modal-close', kind: first ? 'cta' : 'btn' }],
      closable: !first,
    });
  }

  function showCredits(): void {
    openModal({
      meta: '저작권',
      title: '글꼴',
      html: `<p><b>Black Han Sans</b><br><span class="muted">The Black Han Sans Project Authors · SIL Open Font License 1.1</span></p>
        <p><b>Gunbbu Sans · Gunbbu Mono</b><br><span class="muted">IBM Plex Sans KR · IBM Plex Mono(IBM Corp.)에서 쓰는 글자만 남긴 판. SIL Open Font License 1.1</span></p>
        <p class="muted">그림·소리·문구는 건뿌가 직접 만들었습니다.</p>`,
      actions: [
        { label: 'Black Han Sans 라이선스', act: 'doc-ofl-bhs' },
        { label: 'IBM Plex 라이선스', act: 'doc-ofl-plex' },
      ],
    });
  }

  function confirmReset(): void {
    resetArmed = true;
    openModal({
      meta: '확인',
      title: '기록을 지울까요?',
      html: '<p>최고 점수, 해금, 먼지·궤도조각, 장비가 모두 지워집니다. 되돌릴 수 없습니다.</p>',
      actions: [
        { label: '지우기', act: 'reset-yes', kind: 'danger' },
        { label: '그만두기', act: 'modal-close', kind: 'quiet' },
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
      case 'arcade': h.onArcade(); break;
      case 'tokoton': h.onTokoton(); break;
      case 'butter': {
        const tier = titleView?.butterTier ?? 0;
        if (tier <= 0) break;
        if (tier === 1) h.onButterRound(1);
        else { paintButter(tier); show('butter'); }
        break;
      }
      case 'story-skip': h.onStorySkip(); break;
      case 'resume': h.onPauseResume(); break;
      case 'pause-settings': h.onOpenSettings(); break;
      case 'quit': {
        // 판을 버리는 버튼 — 한 번 더 눌러야 한다(3초 안)
        if (!quitArmed) {
          const q = $('quit');
          q.classList.add('confirm');
          q.textContent = '한 번 더 누르면 그만둡니다';
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
      case 'set-shake':
        if (settings) h.onSettingsPatch({ shakeLevel: levelOf(t) });
        break;
      case 'set-flash':
        if (settings) h.onSettingsPatch({ flashLevel: levelOf(t) });
        break;
      case 'howto': showHowto(false); break;
      case 'privacy': openDoc('개인정보 처리방침', './privacy.html'); break;
      case 'credits': showCredits(); break;
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
      case 'meta-back': h.onMetaBack(); break;
      case 'go-revive': h.onGameOverRevive(); break;
      case 'go-continue': h.onGameOverContinue(); break;
      case 'go-retry': h.onGameOverRetry(); break;
      case 'go-title': h.onGameOverTitle(); break;
      case 'ops-retry': h.onGameOverRetry(); break;
      case 'ops-list': h.onOpsEndList(); break;
      case 'ops-title': h.onGameOverTitle(); break;
      case 'end-title': h.onEndingDone(); break;
      case 'end-retry': h.onEndingRetry(); break;
      case 'tab-play': h.onMetaBack(); break;
      case 'tab-missions': h.onOpenMissions(); break;
      case 'tab-custom': h.onOpenCustom(); break;
      case 'tab-shop': h.onOpenShop(); break;
      case 'tab-more': h.onOpenSettings(); break;
      default:
        break;
    }
  });

  // 창 바깥(어두운 바탕)을 누르면 닫는다 — 첫 실행 안내는 버튼으로만
  $('modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget && !howtoFirst) closeModal();
  });

  const api: OverlayApi = {
    getScreen: () => screen,
    showBoot(): void { show('boot'); },
    showTitle(v: TitleView): void { paintTitle(v); show('title'); },
    setTitleSelected,
    showStory(lines: readonly string[], opts: StoryOpts = {}): void {
      $('story').innerHTML = lines.map((ln) =>
        ln ? `<p>${escapeHtml(ln)}</p>` : '<p class="ov-gap"></p>',
      ).join('');
      $('story-stamps').innerHTML = (opts.stamps ?? []).map((t) => `<span class="stamp">${escapeHtml(t)}</span>`).join('');
      const scr = root.querySelector('[data-screen="story"]') as HTMLElement;
      const wipe = opts.wipeTicks ?? 0;
      scr.classList.toggle('has-wipe', wipe > 0);
      scr.style.setProperty('--wipe', `${Math.round(wipe * TICK * 1000)}ms`);
      show('story');
    },
    showPause(v: PauseView): void {
      disarmQuit();
      $('pause-stats').innerHTML = statRows([
        ['점수', v.score.toLocaleString('ko-KR'), true],
        ['콤보', v.combo.toLocaleString('ko-KR')],
      ]);
      show('pause');
    },
    showSettings(s: SaveSettings, fromPause: boolean): void {
      paintSettings(s);
      $('set-back').hidden = !fromPause;
      $('settings-screen').classList.toggle('no-tabs', fromPause);
      // 판 도중엔 기록 지우기를 숨긴다 — 진행 중인 판과 저장이 엇갈리는 길을 막는다
      $('reset-row').hidden = fromPause;
      show('settings');
    },
    showButterPick(tier: number): void { paintButter(tier); show('butter'); },
    showGameOver(v: GameOverView): void {
      $('over-mode').textContent = v.mode;
      $('over-rank').textContent = `${SCREENS.license.report} · ${v.rank}`;
      $('over-line').textContent = v.line;
      const g = SCREENS.gameover;
      $('over-stats').innerHTML = statRows([
        ['점수', v.score.toLocaleString('ko-KR'), true],
        ['최고 콤보', v.combo.toLocaleString('ko-KR')],
        [g.buildings, g.buildingsUnit(v.buildings)],
        [g.dust, `+${v.dustGained.toLocaleString('ko-KR')}`],
        [g.zone, escapeHtml(v.zone)],
      ]);
      const goal = $('over-goal');
      goal.hidden = !v.goal;
      goal.innerHTML = v.goal ? `<b>${g.nextTag}</b>${escapeHtml(v.goal)}` : '';
      $('over-best').hidden = !v.best;
      const overStamp = $('over-stamp');
      overStamp.textContent = v.best ? SCREENS.gameover.stampBest : SCREENS.gameover.stamp;
      overStamp.classList.toggle('stamp-ok', !!v.best);
      $('go-continue').hidden = !v.canContinue;
      const rev = $('go-revive');
      rev.hidden = !v.canRevive;
      const label = v.adRevive ? g.revive : g.reviveFree;
      rev.innerHTML = `<span class="cta-label">${v.adRevive ? ICON.ad : ''}${label}</span>`
        + `<span class="cta-sub">${g.reviveLeft(v.reviveLeft)}</span>`;
      // 노랑은 하나 — 일어나기 → 이어하기 → 한 판 더 중 먼저 되는 것. 공격 키와 같은 순서
      const paint = (el: HTMLElement, text: string, yellow: boolean): void => {
        el.className = yellow ? 'cta' : 'btn';
        el.innerHTML = yellow ? `<span class="cta-label">${escapeHtml(text)}</span>` : escapeHtml(text);
      };
      paint($('go-continue'), g.continue, v.canContinue && !v.canRevive);
      paint($('go-retry'), '한 판 더', !v.canRevive && !v.canContinue);
      show('gameover');
    },
    showOpsEnd(v: OpsEndView): void {
      const o = SCREENS.ops;
      $('opsend-rank').textContent = `${o.reportMeta} · ${v.rank}`;
      $('opsend-name').textContent = v.name;
      $('opsend-title').textContent = v.grade ? o.doneTitle : o.timeUpTitle;
      const stamp = $('opsend-stamp');
      stamp.hidden = !v.grade;
      stamp.textContent = v.grade ?? '';
      $('opsend-goal').textContent = v.goal;
      $('opsend-stats').innerHTML = statRows([
        ...v.rows.map(([k, val, big]) => [k, escapeHtml(val), big] as [string, string, boolean?]),
        [o.bestStamp, v.best ?? o.noStamp],
      ]);
      const prog = $('opsend-progress');
      prog.hidden = !v.progress;
      prog.innerHTML = v.progress ? `<b>${SCREENS.gameover.nextTag}</b>${escapeHtml(v.progress)}` : '';
      $('opsend-new').hidden = !v.improved;
      show('opsend');
    },
    showOps(opts): void {
      opsOpts = opts;
      paintOps($('ops-list'), opsOpts, (id) => h.onOpsPick(id));
      show('ops');
    },
    showMissions(daily, achieves, adBoost): void {
      paintMissions(
        $('mission-list'),
        daily,
        DAILY_POOL,
        achieves,
        ACHIEVES,
        adBoost,
        (id, boost) => h.onClaimMission(id, boost),
      );
      show('missions');
    },
    showShop(inv, owned, paths): void {
      paintShop(
        $('shop-list'),
        inv,
        owned,
        paths,
        {
          onBuy: (id) => h.onBuySku(id),
          onAdPack: () => h.onAdOrbit(),
          onOrbit: (id) => h.onUnlockOrbit(id),
          onDust: (id) => h.onUnlockDust(id),
          onExchange: () => h.onExchangeDust(),
          onExam: () => h.onExam(),
          onEquip: (slot, id) => h.onEquip(slot, id),
          onMaskEdit: () => h.onMaskEdit(),
        },
      );
      show('shop');
    },
    showCustom(loadout, owned): void {
      paintCustom($('custom-list'), loadout, owned, (slot, id) => h.onEquip(slot, id));
      show('custom');
    },
    showEnding(v: EndingView): void {
      $('end-stats').innerHTML = statRows([
        ['점수', v.score.toLocaleString('ko-KR'), true],
        ['최고 콤보', v.maxCombo.toLocaleString('ko-KR')],
      ]);
      $('end-best').hidden = !v.best;
      $('end-note').textContent = v.fullCombo
        ? SCREENS.result.fullComboNote
        : SCREENS.result.tokotonUnlock;
      show('ending');
    },
    showHowto,
    modalOpen: () => !$('modal').hidden,
    closeModal,
    toast(text: string): void {
      window.clearTimeout(toastTimer);
      if (!text) { toastEl.classList.remove('on'); return; }
      toastEl.textContent = text;
      toastEl.classList.toggle('above-tabs', !$('tabs').hidden);
      toastEl.classList.add('on');
      toastTimer = window.setTimeout(() => toastEl.classList.remove('on'), TOAST_MS);
    },
    hide(): void { show('none'); },
  };

  return api;
}


export function titleViewFromSave(save: SaveData, selected: number, debugOpen = false): TitleView {
  const unlocked = debugOpen || isDevUnlocked();
  const today = dailyDone(save.daily);
  return {
    selected,
    tokotonOpen: unlocked || save.act2Cleared,
    butterTier: unlocked ? Math.max(3, save.butterTierReached) : save.butterTierReached,
    bestArcade: save.bestArcade,
    bestTokoton: save.bestTokoton,
    maxCombo: save.maxCombo,
    unlockedChapters: unlocked ? 3 : save.unlockedChapters,
    buddhaMode: save.buddhaMode && import.meta.env.DEV,
    soundOn: save.settings.sound,
    dust: save.dust,
    orbit: save.orbit,
    todayDone: today.done,
    todayTotal: today.total,
    butterBest: save.butterBest,
    rank: licenseTitle(save.license),
  };
}
