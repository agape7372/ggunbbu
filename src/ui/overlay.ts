// 타이틀 / 스토리 / 일시정지 / 설정 / 결과 / 엔딩 DOM 오버레이.
// 원작 UI 카피 미사용 — 건뿌 병맛 한국어만.

import type { SaveData, SaveSettings } from '../storage';
import { SCREENS, TAGLINE, TITLE, TITLE_EN } from '../content';
import { fillGallery } from './gallery';
import { SHAKE_LABEL } from './settings';
import { isDevUnlocked } from '../platform/devUnlock';
import { paintOps } from './opsView';
import { paintMissions } from './missionView';
import { paintShop } from './shopView';
import { paintCustom } from './customView';
import { ACHIEVES, DAILY_POOL } from '../meta';
import type { DailyState, Loadout, MissionProgress } from '../meta/types';

export type OverlayScreen =
  | 'none'
  | 'boot'
  | 'title'
  | 'story'
  | 'pause'
  | 'settings'
  | 'butter'
  | 'gameover'
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
}

export interface GameOverView {
  score: number;
  combo: number;
  canContinue: boolean;
  canRevive: boolean;
  reviveLeft: number;
  reviveMax: number;
  line: string;
}

export interface EndingView {
  score: number;
  maxCombo: number;
  fullCombo: boolean;
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
  onEndingDone(): void;
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
  onEquip(slot: string, id: string): void;
}

export interface OverlayApi {
  getScreen(): OverlayScreen;
  showBoot(): void;
  showTitle(v: TitleView): void;
  setTitleSelected(index: number): void;
  showStory(lines: readonly string[]): void;
  showPause(v: PauseView): void;
  showSettings(s: SaveSettings): void;
  showButterPick(tier: number): void;
  showGameOver(v: GameOverView): void;
  showEnding(v: EndingView): void;
  showOps(opts: { unlockedChapters: number; allOpen: boolean; act2Cleared: boolean }): void;
  showMissions(daily: DailyState, achieves: MissionProgress[]): void;
  showShop(inv: { dust: number; orbit: number }, owned: ReadonlySet<string>): void;
  showCustom(loadout: Loadout, owned: ReadonlySet<string>): void;
  hide(): void;
}

const TAB_SCREENS: ReadonlySet<OverlayScreen> = new Set([
  'title', 'ops', 'missions', 'shop', 'custom', 'settings', 'butter',
]);

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

export function mountOverlay(root: HTMLElement, h: OverlayHandlers): OverlayApi {
  root.innerHTML = `
    <div class="ov-screen ov-boot" data-screen="boot" data-act="boot">
      <p class="ov-boot-mark">▶</p>
      <p class="ov-boot-title">${TITLE}</p>
      <p class="ov-boot-cta blink">탭하여 시작</p>
    </div>

    <div class="ov-screen ov-title ov-has-tabs" data-screen="title" hidden>
      <h1 class="ov-logo" data-act="logo">건뿌<span>!!</span></h1>
      <p class="ov-logo-en">${TITLE_EN}</p>
      <p class="ov-tag">${TAGLINE}</p>
      <div class="ov-menu">
        <button type="button" class="flyer-btn primary selected" data-act="arcade">${SCREENS.menu.arcade}</button>
        <button type="button" class="flyer-btn" data-act="tokoton" data-el="tokoton">토코톤 — 잠김</button>
        <button type="button" class="flyer-btn" data-act="butter" data-el="butter">버터바 챌린지 — 아직</button>
        <button type="button" class="flyer-btn" data-act="ops">${SCREENS.menu.ops}</button>
      </div>
      <div class="ov-records">
        <p class="ov-records-h">${SCREENS.title.records}</p>
        <p data-el="records"></p>
      </div>
      <div class="ov-gallery" data-el="gallery"></div>
      <p class="ov-hint" data-el="title-hint"></p>
      <p class="ov-buddha" data-el="buddha" hidden>${SCREENS.title.buddha}</p>
    </div>

    <div class="ov-screen ov-dim ov-story" data-screen="story" data-act="story-skip" hidden>
      <div class="ov-story-lines" data-el="story"></div>
      <p class="ov-hint">탭하면 다음</p>
    </div>

    <div class="ov-screen ov-dim ov-pause" data-screen="pause" hidden>
      <div class="ui-card">
        <h2>잠깐!</h2>
        <p class="ov-pause-stats" data-el="pause-stats"></p>
        <button type="button" class="flyer-btn primary" data-act="resume">계속 부수기</button>
        <button type="button" class="flyer-btn" data-act="pause-settings">취급설명서</button>
        <button type="button" class="flyer-btn" data-act="quit">포기하고 퇴근</button>
      </div>
    </div>

    <div class="ov-screen ov-dim ov-settings ov-has-tabs" data-screen="settings" hidden>
      <div class="ui-card ui-card-manual">
        <h2>취급설명서</h2>
        <p class="ov-manual-lead">본 기기는 하늘에서 떨어지는 건물을 부수는 가정용 철거기입니다. 전원 투입 전 아래를 확인하십시오.</p>
        <button type="button" class="flyer-btn" data-act="set-sound" data-el="set-sound">소리 켜짐</button>
        <button type="button" class="flyer-btn" data-act="set-vib" data-el="set-vib">진동 켜짐</button>
        <button type="button" class="flyer-btn" data-act="set-hand" data-el="set-hand">왼손잡이 꺼짐</button>
        <button type="button" class="flyer-btn" data-act="set-shake" data-el="set-shake">흔들림 기본</button>
        <p class="ov-manual-keys">키보드: 점프 ↑/W · 가드 ↓/S · 공격 Z · 필살 X · 일시정지 Esc</p>
        <button type="button" class="flyer-btn primary" data-act="set-back">뒤로</button>
      </div>
    </div>

    <div class="ov-screen ov-dim ov-butter ov-has-tabs" data-screen="butter" hidden>
      <div class="ui-card">
        <h2>버터바 챌린지</h2>
        <p class="ov-manual-lead">경험한 회차만 다시 부술 수 있습니다.</p>
        <div data-el="butter-rounds"></div>
        <button type="button" class="flyer-btn" data-act="butter-back">뒤로</button>
      </div>
    </div>

    <div class="ov-screen ov-dim ov-over" data-screen="gameover" hidden>
      <div class="ui-card ui-card-fail">
        <h2>${SCREENS.gameover.title}</h2>
        <p class="ov-over-line" data-el="over-line"></p>
        <p class="ov-over-score" data-el="over-score"></p>
        <button type="button" class="flyer-btn primary" data-act="go-revive" data-el="go-revive">광고 보고 일어나기</button>
        <button type="button" class="flyer-btn" data-act="go-continue" data-el="go-continue">이어하기</button>
        <button type="button" class="flyer-btn" data-act="go-retry">한 판 더</button>
        <button type="button" class="flyer-btn" data-act="go-title">타이틀로</button>
      </div>
    </div>

    <div class="ov-screen ov-dim ov-has-tabs" data-screen="ops" hidden>
      <div class="ui-card ui-card-manual">
        <div data-el="ops-list"></div>
        <button type="button" class="flyer-btn" data-act="meta-back">뒤로</button>
      </div>
    </div>

    <div class="ov-screen ov-dim ov-has-tabs" data-screen="missions" hidden>
      <div class="ui-card ui-card-manual">
        <div data-el="mission-list"></div>
        <button type="button" class="flyer-btn" data-act="meta-back">뒤로</button>
      </div>
    </div>

    <div class="ov-screen ov-dim ov-has-tabs" data-screen="shop" hidden>
      <div class="ui-card ui-card-manual">
        <div data-el="shop-list"></div>
        <button type="button" class="flyer-btn" data-act="meta-back">뒤로</button>
      </div>
    </div>

    <div class="ov-screen ov-dim ov-has-tabs" data-screen="custom" hidden>
      <div class="ui-card ui-card-manual">
        <div data-el="custom-list"></div>
        <button type="button" class="flyer-btn" data-act="meta-back">뒤로</button>
      </div>
    </div>

    <div class="ov-screen ov-ending" data-screen="ending" data-act="ending" hidden>
      <p class="ov-end-stamp">${SCREENS.result.success}</p>
      <p class="ov-end-sub">${SCREENS.result.petals}</p>
      <p class="ov-end-score" data-el="end-score"></p>
      <p class="ov-end-note" data-el="end-note"></p>
      <p class="ov-hint blink">탭하면 타이틀로</p>
    </div>

    <nav class="ov-tabs" data-el="tabs" hidden>
      <button type="button" class="ov-tab" data-act="tab-play" data-tab="title">${SCREENS.tabs.play}</button>
      <button type="button" class="ov-tab" data-act="tab-missions" data-tab="missions">${SCREENS.tabs.missions}</button>
      <button type="button" class="ov-tab" data-act="tab-custom" data-tab="custom">${SCREENS.tabs.custom}</button>
      <button type="button" class="ov-tab" data-act="tab-shop" data-tab="shop">${SCREENS.tabs.shop}</button>
      <button type="button" class="ov-tab" data-act="tab-more" data-tab="settings">${SCREENS.tabs.more}</button>
    </nav>
  `;

  let screen: OverlayScreen = 'none';
  let settings: SaveSettings | null = null;
  let titleView: TitleView | null = null;
  let opsOpts = { unlockedChapters: 0, allOpen: false, act2Cleared: false };

  const $ = (name: string): HTMLElement => root.querySelector(`[data-el="${name}"]`) as HTMLElement;

  function paintTabs(name: OverlayScreen): void {
    const tabs = $('tabs');
    const show = TAB_SCREENS.has(name);
    tabs.hidden = !show;
    const key = name === 'ops' || name === 'butter' ? 'title' : name;
    tabs.querySelectorAll<HTMLButtonElement>('.ov-tab').forEach((btn) => {
      btn.classList.toggle('on', btn.getAttribute('data-tab') === key);
    });
  }

  function show(name: OverlayScreen): void {
    screen = name;
    if (name === 'none') {
      root.classList.remove('is-open');
      root.querySelectorAll<HTMLElement>('[data-screen]').forEach((el) => { el.hidden = true; });
      paintTabs(name);
      return;
    }
    root.classList.add('is-open');
    root.querySelectorAll<HTMLElement>('[data-screen]').forEach((el) => {
      el.hidden = el.getAttribute('data-screen') !== name;
    });
    paintTabs(name);
  }

  function paintTitle(v: TitleView): void {
    titleView = v;
    const tok = $('tokoton') as HTMLButtonElement;
    const but = $('butter') as HTMLButtonElement;
    tok.textContent = v.tokotonOpen ? SCREENS.menu.tokoton : SCREENS.menu.tokotonLocked;
    tok.disabled = !v.tokotonOpen;
    tok.classList.toggle('locked', !v.tokotonOpen);
    but.textContent = v.butterTier > 0 ? SCREENS.menu.butter(v.butterTier) : SCREENS.menu.butterLocked;
    but.disabled = v.butterTier <= 0;
    but.classList.toggle('locked', v.butterTier <= 0);
    $('records').textContent =
      `아케이드 ${v.bestArcade.toLocaleString()}  ·  토코톤 ${v.bestTokoton.toLocaleString()}  ·  콤보 ${v.maxCombo}`;
    $('title-hint').textContent = SCREENS.title.hint;
    const buddha = $('buddha');
    buddha.hidden = !v.buddhaMode;
    const gal = $('gallery');
    fillGallery(gal, v.unlockedChapters);
    setTitleSelected(v.selected);
  }

  function setTitleSelected(index: number): void {
    if (titleView) titleView.selected = index;
    const acts = ['arcade', 'tokoton', 'butter', 'ops'];
    root.querySelectorAll('.ov-menu .flyer-btn').forEach((btn) => {
      btn.classList.toggle('selected', btn.getAttribute('data-act') === acts[index]);
    });
  }

  function paintSettings(s: SaveSettings): void {
    settings = s;
    $('set-sound').textContent = s.sound ? '소리 켜짐' : '소리 꺼짐';
    $('set-vib').textContent = s.vibration ? '진동 켜짐' : '진동 꺼짐';
    $('set-hand').textContent = s.leftHanded ? '왼손잡이 켜짐' : '왼손잡이 꺼짐';
    $('set-shake').textContent = SHAKE_LABEL[s.shakeLevel];
  }

  function paintButter(tier: number): void {
    const box = $('butter-rounds');
    box.innerHTML = '';
    for (let r = 1; r <= 3; r++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'flyer-btn';
      b.textContent = SCREENS.butter.rounds[r - 1];
      if (r > tier) {
        b.disabled = true;
        b.classList.add('locked');
        b.textContent += ' — 잠김';
      } else {
        b.setAttribute('data-act', `butter-${r}`);
      }
      box.appendChild(b);
    }
  }

  root.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!t) return;
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
      case 'settings': h.onOpenSettings(); break;
      case 'story-skip': h.onStorySkip(); break;
      case 'resume': h.onPauseResume(); break;
      case 'pause-settings': h.onOpenSettings(); break;
      case 'quit': h.onPauseQuit(); break;
      case 'set-back': h.onSettingsBack(); break;
      case 'set-sound':
        if (settings) h.onSettingsPatch({ sound: !settings.sound });
        break;
      case 'set-vib':
        if (settings) h.onSettingsPatch({ vibration: !settings.vibration });
        break;
      case 'set-hand':
        if (settings) h.onSettingsPatch({ leftHanded: !settings.leftHanded });
        break;
      case 'set-shake':
        if (settings) {
          const next = ((settings.shakeLevel + 1) % 3) as 0 | 1 | 2;
          h.onSettingsPatch({ shakeLevel: next });
        }
        break;
      case 'butter-1': h.onButterRound(1); break;
      case 'butter-2': h.onButterRound(2); break;
      case 'butter-3': h.onButterRound(3); break;
      case 'butter-back': h.onButterBack(); break;
      case 'ops': h.onOpenOps(); break;
      case 'missions': h.onOpenMissions(); break;
      case 'shop': h.onOpenShop(); break;
      case 'custom': h.onOpenCustom(); break;
      case 'meta-back': h.onMetaBack(); break;
      case 'go-revive': h.onGameOverRevive(); break;
      case 'go-continue': h.onGameOverContinue(); break;
      case 'go-retry': h.onGameOverRetry(); break;
      case 'go-title': h.onGameOverTitle(); break;
      case 'ending': h.onEndingDone(); break;
      case 'tab-play': h.onMetaBack(); break;
      case 'tab-missions': h.onOpenMissions(); break;
      case 'tab-custom': h.onOpenCustom(); break;
      case 'tab-shop': h.onOpenShop(); break;
      case 'tab-more': h.onOpenSettings(); break;
      default:
        break;
    }
  });

  function showOpsPanel(): void {
    paintOps($('ops-list'), opsOpts, (id) => h.onOpsPick(id));
    show('ops');
  }

  const api: OverlayApi = {
    getScreen: () => screen,
    showBoot(): void { show('boot'); },
    showTitle(v: TitleView): void { paintTitle(v); show('title'); },
    setTitleSelected,
    showStory(lines: readonly string[]): void {
      $('story').innerHTML = lines.map((ln) =>
        ln ? `<p>${escapeHtml(ln)}</p>` : '<p class="ov-gap"></p>',
      ).join('');
      show('story');
    },
    showPause(v: PauseView): void {
      $('pause-stats').textContent = SCREENS.result.pauseStats(v.score, v.combo);
      show('pause');
    },
    showSettings(s: SaveSettings): void { paintSettings(s); show('settings'); },
    showButterPick(tier: number): void { paintButter(tier); show('butter'); },
    showGameOver(v: GameOverView): void {
      $('over-line').textContent = v.line;
      $('over-score').textContent = SCREENS.result.overScore(v.score, v.combo);
      const cont = $('go-continue') as HTMLButtonElement;
      cont.hidden = !v.canContinue;
      const rev = $('go-revive') as HTMLButtonElement;
      rev.hidden = !v.canRevive;
      rev.textContent = SCREENS.gameover.revive(v.reviveLeft, v.reviveMax);
      if (!v.canRevive) rev.textContent = SCREENS.gameover.reviveGone;
      show('gameover');
    },
    showOps(opts): void {
      opsOpts = opts;
      showOpsPanel();
    },
    showMissions(daily, achieves): void {
      paintMissions(
        $('mission-list'),
        daily,
        DAILY_POOL,
        achieves,
        ACHIEVES,
        (id, boost) => h.onClaimMission(id, boost),
      );
      show('missions');
    },
    showShop(inv, owned): void {
      paintShop(
        $('shop-list'),
        inv,
        owned,
        (id) => h.onBuySku(id),
        () => h.onAdOrbit(),
        (id) => h.onUnlockOrbit(id),
      );
      show('shop');
    },
    showCustom(loadout, owned): void {
      paintCustom($('custom-list'), loadout, owned, (slot, id) => h.onEquip(slot, id));
      show('custom');
    },
    showEnding(v: EndingView): void {
      $('end-score').textContent = SCREENS.result.endScore(v.score, v.maxCombo);
      $('end-note').textContent = v.fullCombo
        ? SCREENS.result.fullComboNote
        : SCREENS.result.tokotonUnlock;
      show('ending');
    },
    hide(): void { show('none'); },
  };

  return api;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

export function titleViewFromSave(save: SaveData, selected: number, debugOpen = false): TitleView {
  const unlocked = debugOpen || isDevUnlocked();
  return {
    selected,
    tokotonOpen: unlocked || save.act2Cleared,
    butterTier: unlocked ? Math.max(3, save.butterTierReached) : save.butterTierReached,
    bestArcade: save.bestArcade,
    bestTokoton: save.bestTokoton,
    maxCombo: save.maxCombo,
    unlockedChapters: unlocked ? 3 : save.unlockedChapters,
    buddhaMode: save.buddhaMode,
    soundOn: save.settings.sound,
  };
}
