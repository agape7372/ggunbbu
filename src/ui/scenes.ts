// 씬 머신: Boot→Title → Act1(+BonusStage 자동) → StoryIntro → Act2 → Ending / Tokoton /
// ButterChallenge / GameOver(2막 이어하기) / Pause. 디버그 오버레이 포함.
// core는 씬을 모른다 — 씬이 advance 호출 여부·상태 전이를 관장한다.
// 타이틀·HUD·일시정지·결과는 DOM(overlay/hud). 캔버스는 필드만.

import type { GameState, GimmickId } from '../core/types';
import { makeState, advance, enterBonus, grantMercyLife } from '../core/sim';
import { enterAct2Phase, continueFromCheckpoint } from '../core/act2';
import { ACT1, PALETTE, VIEW, WAZA_GAUGE } from '../config';
import { drawGame, consumeEvents, initRenderer, setFeedbackOptions } from '../render/renderer';
import { loadSave, saveSave, type SaveData, type SaveSettings } from '../storage';
import type { InputSource } from '../input/input';
import type { TouchInput } from './touchLayer';
import { armAudioUnlock, initAudio, playSfx, resumeIfNeeded, setSoundOn, startBgm, stopBgm } from '../audio/audio';
import { consumeAudio } from '../audio/consume';
import type { BgmTrack } from '../audio/sfx';
import {
  STORY,
  SCREENS,
  butterChallengeEnd,
  butterEnterLines,
  gameoverQuip,
  phaseBanner,
  ENDING_FULL_COMBO,
} from '../content';
import { OPERATIONS } from '../content/world';
import { mountHud, ensureHudLayer } from './hud';
import {
  mountOverlay, ensureOverlayLayer, titleViewFromSave, type OverlayApi,
} from './overlay';
import { applySettingsPatch as patchSettings, applySettingsToRuntime } from './settings';
import {
  applyMissionEvent, ensureDaily, grant, grantOrbit, initAchieveProgress,
  MAX_REVIVES_PER_RUN, ORBIT_PER_AD, ACHIEVES, DAILY_POOL, claim, defById,
  equip, spendOrbit, orbitCost,
} from '../meta';
import { createAdsPort } from '../platform/ads';
import { createIapPort, SKUS, type SkuId } from '../platform/iap';
import { isDevUnlocked } from '../platform/devUnlock';
import {
  applyDebug as tickDebug,
  settleDebug,
  mountDebugMenu,
  debugSeed,
  DEBUG_TITLE_TAPS,
} from './debugMenu';

type SceneName = 'boot' | 'title' | 'play' | 'story' | 'ending' | 'gameover' | 'pause';
type Chrome = 'boot' | 'title' | 'playing' | 'paused' | 'story' | 'gameover' | 'ending';

const CHROME: readonly Chrome[] = ['boot', 'title', 'playing', 'paused', 'story', 'gameover', 'ending'];
const MENU_LEN = 4;

export interface App {
  update(dt: number): void;
  draw(): void;
  getState(): GameState | null;
}

export function createApp(
  ctx: CanvasRenderingContext2D,
  input: InputSource,
  touch: TouchInput | null,
): App {
  let scene: SceneName = 'boot';
  let state: GameState | null = null;
  let save: SaveData = loadSave();
  let overlayTicks = 0;
  let pendingAfterOverlay: (() => void) | null = null;
  let butterChallenge = false;
  let debug = new URLSearchParams(location.search).has('debug');
  let titleTaps = 0;
  let menuIndex = 0;
  let prevTitleGuard = false; // 타이틀 메뉴 가드 엣지 검출용 (P0-6)
  let lastBgm: BgmTrack | null = null;
  let settingsFrom: 'title' | 'pause' = 'title';
  let overlay!: OverlayApi;
  let revivesUsed = 0;
  let reviving = false;
  // 08-30(P1-1): 구역 작전·디버그 런은 영구 기록(bestArcade·unlockedChapters·maxCombo)을
  // 오염시키지 않는다 — 재화(먼지·궤도) 지급만 유지. 부처버전 문법: 치트 런 = 기록 없음.
  let runExempt = false;
  let dustDirty = false; // 판 도중 재화 지급 발생 표시 — noteMissions 말미 저장 트리거
  const ads = createAdsPort();
  const iap = createIapPort();

  applySettingsToRuntime(save, {
    setSoundOn,
    setFeedbackOptions,
    setLeftHanded: (on) => { touch?.setLeftHanded(on); },
  });
  initRenderer();
  armAudioUnlock();
  input.onFirstGesture(() => { initAudio(); });

  function setChrome(name: Chrome): void {
    const stage = document.getElementById('stage');
    if (!stage) return;
    for (const c of CHROME) stage.classList.toggle(c, c === name);
  }

  function debugOpen(): boolean {
    return debug || isDevUnlocked();
  }

  function titleView() {
    const fresh = loadSave();
    save.act2Cleared = fresh.act2Cleared;
    save.unlockedChapters = fresh.unlockedChapters;
    save.butterTierReached = fresh.butterTierReached;
    save.buddhaMode = fresh.buddhaMode;
    return titleViewFromSave(save, menuIndex, debugOpen());
  }

  function applyRunMeta(s: GameState, gimmick: GimmickId = 'none'): void {
    s.waza = save.loadout.waza;
    s.gimmick = gimmick;
    revivesUsed = 0;
    const daily = ensureDaily(save.daily, Date.now(), ads.ready());
    save.daily = daily;
    if (!save.achieves.length) save.achieves = initAchieveProgress();
    applyMissionEvent(daily, save.achieves, { kind: 'runStart' });
  }

  function bgm(track: BgmTrack | null): void {
    if (track === lastBgm) return;
    lastBgm = track;
    if (track) startBgm(track); else stopBgm();
  }

  function goPlay(): void {
    scene = 'play';
    overlay.hide();
    setChrome('playing');
  }

  function goTitle(): void {
    state = null;
    scene = 'title';
    menuIndex = 0;
    butterChallenge = false;
    save = { ...save, ...loadSave() };
    setChrome('title');
    overlay.showTitle(titleView());
    bgm('title');
  }

  function startArcade(): void {
    runExempt = debugOpen();
    save.buddhaMode = loadSave().buddhaMode;
    state = makeState({ seed: debugSeed(0x9e3779b9) });
    applyRunMeta(state);
    butterChallenge = false;
    if (save.buddhaMode) {
      enterAct2Phase(state, 'cathedral');
      state.wazaGauge = 0;
      showOverlay(STORY.intro, 60 * 6);
    } else {
      showOverlay(STORY.chapters[0], 60 * 3);
    }
  }

  function ownedSet(): Set<string> {
    return new Set(save.owned);
  }

  function opsOpts() {
    return {
      unlockedChapters: debugOpen() ? 3 : save.unlockedChapters,
      allOpen: debugOpen(),
      act2Cleared: debugOpen() || save.act2Cleared,
    };
  }

  function openMissions(): void {
    const daily = ensureDaily(save.daily, Date.now(), ads.ready());
    save.daily = daily;
    if (!save.achieves.length) save.achieves = initAchieveProgress();
    overlay.showMissions(daily, save.achieves, ads.ready());
  }

  function openShop(): void {
    overlay.showShop({ dust: save.dust, orbit: save.orbit }, ownedSet(), {
      iap: iap.available(),
      ad: ads.ready(),
    });
  }

  function openCustom(): void {
    overlay.showCustom(save.loadout, ownedSet());
  }

  function startOp(id: string): void {
    const op = OPERATIONS.find((o) => o.id === id);
    if (!op) return;
    const allOpen = debugOpen();
    if (op.gimmick !== 'none' && !allOpen && !save.act2Cleared) {
      playSfx('uiDeny');
      return;
    }
    if (op.gimmick === 'none' && op.themeIndex > save.unlockedChapters && !allOpen) {
      playSfx('uiDeny');
      return;
    }
    runExempt = true; // 구역 작전 = 점수·챕터 주입 런 — 영구 기록 비반영 (P1-1)
    state = makeState({ seed: debugSeed(0xc0ffee) });
    applyRunMeta(state, op.gimmick);
    state.chapter = op.themeIndex;
    if (op.gimmick === 'none' && op.themeIndex > 0) {
      state.p = ACT1.CHAPTER_BOUNDS[op.themeIndex - 1];
      state.score = Math.floor(ACT1.UNLOCK_SCORE * state.p);
    }
    butterChallenge = false;
    goPlay();
  }

  function applySku(id: SkuId): void {
    const sku = SKUS.find((s) => s.id === id);
    if (!sku || sku.krw > 1900) return;
    if (sku.orbit) grantOrbit(save, sku.orbit);
    const add = (item: string): void => {
      if (!save.owned.includes(item)) save.owned = [...save.owned, item];
    };
    if (id === 'skin_blade') add('rebar');
    if (id === 'skin_body') add('amber');
    if (id === 'skin_letters') add('stamp');
    if (id === 'waza_unlock') {
      if (!save.owned.includes('ageba')) add('ageba');
      else add('tetsu');
    }
  }

  async function claimMission(id: string, boost: boolean): Promise<void> {
    const def = defById(id) ?? DAILY_POOL.find((d) => d.id === id) ?? ACHIEVES.find((d) => d.id === id);
    if (!def) return;
    const daily = ensureDaily(save.daily, Date.now(), ads.ready());
    save.daily = daily;
    if (!save.achieves.length) save.achieves = initAchieveProgress();
    const prog = daily.items.find((p) => p.id === id) ?? save.achieves.find((p) => p.id === id);
    if (!prog) return;
    if (boost) {
      if (!ads.ready()) { playSfx('uiDeny'); return; } // 웹: 광고 없음 — 버튼도 안 그리지만 백스톱 (08-30)
      const r = await ads.showRewarded('missionBoost');
      if (r !== 'ok') { playSfx('uiDeny'); return; }
      applyMissionEvent(daily, save.achieves, { kind: 'adWatched' });
    }
    const got = claim(prog, def, boost);
    if (got.dust === 0 && got.orbit === 0) { playSfx('uiDeny'); return; }
    grant(save, got.dust, got.orbit);
    saveSave(save);
    playSfx('uiBlip');
    openMissions();
  }

  async function buySku(id: string): Promise<void> {
    const sku = SKUS.find((s) => s.id === id);
    if (!sku || sku.krw > 1900) return;
    const r = await iap.purchase(id as SkuId);
    if (r !== 'ok') { playSfx('uiDeny'); return; }
    applySku(id as SkuId);
    saveSave(save);
    playSfx('uiBlip');
    openShop();
  }

  async function adOrbit(): Promise<void> {
    const r = await ads.showRewarded('orbitPack');
    if (r !== 'ok') { playSfx('uiDeny'); return; }
    const daily = ensureDaily(save.daily, Date.now(), ads.ready());
    save.daily = daily;
    applyMissionEvent(daily, save.achieves, { kind: 'adWatched' });
    grantOrbit(save, ORBIT_PER_AD);
    saveSave(save);
    playSfx('uiBlip');
    openShop();
  }

  function unlockOrbitItem(id: string): void {
    const cost = orbitCost(id);
    if (cost == null || cost <= 0) { playSfx('uiDeny'); return; }
    if (!spendOrbit(save, cost)) { playSfx('uiDeny'); return; }
    if (!save.owned.includes(id)) save.owned = [...save.owned, id];
    saveSave(save);
    playSfx('uiBlip');
    openShop();
  }

  function doEquip(slot: string, id: string): void {
    save.loadout = equip(save.loadout, slot, id, ownedSet());
    saveSave(save);
    playSfx('uiBlip');
    openCustom();
  }

  function startTokoton(): void {
    if (!save.act2Cleared && !debugOpen()) return;
    runExempt = debugOpen();
    state = makeState({ seed: debugSeed(0x51ed270b), mode: 'tokoton' });
    applyRunMeta(state);
    butterChallenge = false;
    goPlay();
  }

  function startButterChallenge(round: number): void {
    const cap = debugOpen() ? 3 : save.butterTierReached;
    if (round < 1 || round > cap) return;
    runExempt = debugOpen();
    state = makeState({ seed: debugSeed(0xabcdef) });
    applyRunMeta(state);
    state.wazaGauge = WAZA_GAUGE.MAX;
    enterBonus(state, round);
    butterChallenge = true;
    goPlay();
  }

  async function tryRevive(): Promise<void> {
    if (!state || scene !== 'gameover' || reviving) return;
    if (revivesUsed >= MAX_REVIVES_PER_RUN) { playSfx('uiDeny'); return; }
    reviving = true;
    // 웹(광고 미배선)은 광고 문구·대기 없이 그냥 일어난다 — 데모 정책 (08-30, P0-2)
    const usedAd = ads.ready();
    const result = usedAd ? await ads.showRewarded('revive') : 'ok';
    reviving = false;
    if (result !== 'ok') { playSfx('uiDeny'); return; }
    revivesUsed += 1;
    grantMercyLife(state);
    const daily = ensureDaily(save.daily, Date.now(), ads.ready());
    save.daily = daily;
    applyMissionEvent(daily, save.achieves, { kind: 'revive' });
    if (usedAd) applyMissionEvent(daily, save.achieves, { kind: 'adWatched' });
    grant(save, 0, 0);
    saveSave(save);
    playSfx('uiBlip');
    goPlay();
  }

  function showOverlay(lines: readonly string[], ticks: number, after?: () => void): void {
    overlayTicks = ticks;
    pendingAfterOverlay = after ?? null;
    scene = 'story';
    setChrome('story');
    overlay.showStory(lines);
  }

  function skipStory(fromUser = false): void {
    if (scene !== 'story') return;
    if (fromUser) playSfx('uiBlip');
    const after = pendingAfterOverlay;
    pendingAfterOverlay = null;
    overlayTicks = 0;
    if (after) after();
    else goPlay();
  }

  function persist(): void {
    if (!state) return;
    if (!runExempt) {
      const sc = state.score;
      if (state.mode === 'tokoton') save.bestTokoton = Math.max(save.bestTokoton, sc);
      else if (butterChallenge && state.bonus) {
        const r = state.bonus.round;
        save.butterBest[r] = Math.max(save.butterBest[r] ?? 0, sc);
      } else save.bestArcade = Math.max(save.bestArcade, sc);
      save.maxCombo = Math.max(save.maxCombo, state.combo);
      save.unlockedChapters = Math.max(save.unlockedChapters, state.chapter);
      if (state.bonus) save.butterTierReached = Math.max(save.butterTierReached, state.bonus.round);
    }
    saveSave(save);
  }

  function enterPause(): void {
    if (scene !== 'play' || !state) return;
    scene = 'pause';
    setChrome('paused');
    overlay.showPause({ score: state.score, combo: state.combo });
  }

  function resumePause(): void {
    if (scene !== 'pause') return;
    goPlay();
  }

  function applySettingsPatch(p: Partial<SaveSettings>): void {
    patchSettings(save, p, {
      setSoundOn,
      setFeedbackOptions,
      setLeftHanded: (on) => { touch?.setLeftHanded(on); },
    });
    overlay.showSettings(save.settings);
    playSfx('uiBlip');
  }

  function openSettings(): void {
    settingsFrom = scene === 'pause' ? 'pause' : 'title';
    overlay.showSettings(save.settings);
  }

  function backFromSettings(): void {
    if (settingsFrom === 'pause' && state) {
      overlay.showPause({ score: state.score, combo: state.combo });
    } else {
      overlay.showTitle(titleView());
    }
  }

  function confirmTitle(): void {
    if (menuIndex === 0) { playSfx('uiBlip'); startArcade(); }
    else if (menuIndex === 1) {
      if (!save.act2Cleared && !debugOpen()) { playSfx('uiDeny'); return; }
      playSfx('uiBlip');
      startTokoton();
    } else if (menuIndex === 2) {
      if (save.butterTierReached <= 0 && !debugOpen()) { playSfx('uiDeny'); return; }
      playSfx('uiBlip');
      const tier = debugOpen() ? Math.max(3, save.butterTierReached) : save.butterTierReached;
      if (tier === 1) startButterChallenge(1);
      else overlay.showButterPick(tier);
    } else { playSfx('uiBlip'); overlay.showOps(opsOpts()); }
  }

  const hud = mountHud(ensureHudLayer(), { onPause: () => { playSfx('uiBlip'); enterPause(); } });
  overlay = mountOverlay(ensureOverlayLayer(), {
    onBoot: () => {
      playSfx('uiBlip');
      scene = 'title';
      setChrome('title');
      overlay.showTitle(titleView());
      bgm('title');
    },
    onArcade: () => { playSfx('uiBlip'); startArcade(); },
    onTokoton: () => {
      if (!save.act2Cleared && !debugOpen()) { playSfx('uiDeny'); return; }
      playSfx('uiBlip');
      startTokoton();
    },
    onButterRound: (round) => { playSfx('uiBlip'); startButterChallenge(round); },
    onButterBack: () => { playSfx('uiBlip'); overlay.showTitle(titleView()); },
    onOpenSettings: () => { playSfx('uiBlip'); openSettings(); },
    onStorySkip: () => skipStory(true),
    onPauseResume: () => { playSfx('uiBlip'); resumePause(); },
    onPauseQuit: () => { playSfx('uiBlip'); persist(); goTitle(); },
    onSettingsBack: () => { playSfx('uiBlip'); backFromSettings(); },
    onSettingsPatch: applySettingsPatch,
    onGameOverContinue: () => {
      if (!state || scene !== 'gameover') return;
      if (state.mode === 'act2' && state.checkpoint > 0) {
        playSfx('uiBlip');
        continueFromCheckpoint(state);
        state.wazaGauge = 0;
        goPlay();
      }
    },
    onGameOverRetry: () => { playSfx('uiBlip'); startArcade(); },
    onGameOverTitle: () => { playSfx('uiBlip'); goTitle(); },
    onGameOverRevive: () => { void tryRevive(); },
    onEndingDone: () => { playSfx('uiBlip'); goTitle(); },
    onLogoTap: () => {
      titleTaps += 1;
      if (titleTaps >= DEBUG_TITLE_TAPS) {
        debug = true;
        mountDebugMenu(() => state);
        overlay.showTitle(titleView());
      }
    },
    onOpsPick: (id) => { playSfx('uiBlip'); startOp(id); },
    onOpenOps: () => { playSfx('uiBlip'); overlay.showOps(opsOpts()); },
    onOpenMissions: () => { playSfx('uiBlip'); openMissions(); },
    onOpenShop: () => { playSfx('uiBlip'); openShop(); },
    onOpenCustom: () => { playSfx('uiBlip'); openCustom(); },
    onMetaBack: () => { playSfx('uiBlip'); overlay.showTitle(titleView()); },
    onClaimMission: (id, boost) => { void claimMission(id, boost); },
    onBuySku: (id) => { void buySku(id); },
    onAdOrbit: () => { void adOrbit(); },
    onUnlockOrbit: (id) => unlockOrbitItem(id),
    onEquip: (slot, id) => doEquip(slot, id),
  });

  if (debug || isDevUnlocked()) mountDebugMenu(() => state);

  overlay.showBoot();
  setChrome('boot');

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resumeIfNeeded();
    else enterPause();
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      const scr = overlay.getScreen();
      if (scr === 'settings') { e.preventDefault(); backFromSettings(); return; }
      if (scr === 'butter' || scr === 'ops' || scr === 'missions' || scr === 'shop' || scr === 'custom') {
        e.preventDefault(); overlay.showTitle(titleView()); return;
      }
      if (scene === 'play') { e.preventDefault(); enterPause(); }
      else if (scene === 'pause') { e.preventDefault(); resumePause(); }
      return;
    }
    if (e.code === 'KeyP' && overlay.getScreen() !== 'settings') {
      if (scene === 'play') { e.preventDefault(); enterPause(); }
      else if (scene === 'pause') { e.preventDefault(); resumePause(); }
    }
  });

  function update(): void {
    const f = input.sample();

    switch (scene) {
      case 'boot': {
        if (f.jump || f.guard || f.attack || f.special) {
          playSfx('uiBlip');
          scene = 'title';
          setChrome('title');
          overlay.showTitle(titleView());
          bgm('title');
        }
        break;
      }
      case 'title': {
        bgm('title');
        touch?.setPinned(false);
        if (overlay.getScreen() !== 'title') break;
        // guard는 홀드 레벨(엣지 아님) — 그대로 쓰면 메뉴가 60Hz로 돈다 (08-30, P0-6)
        // prevTitleGuard는 update 말미에서 씬 무관하게 갱신 — boot를 가드로 넘긴 같은
        // 홀드가 메뉴를 밀거나, 가드 쥔 채 타이틀 복귀 시 스테일 엣지가 생기지 않게 (08-30 검증)
        const guardEdge = f.guard && !prevTitleGuard;
        if (f.special && f.guard) {
          // 디버그 해금 콤보(가드 홀드 + 필살) — 사운드 토글·메뉴 이동과 겹치지 않게 단독 처리
          debug = true;
          mountDebugMenu(() => state);
          break;
        }
        if (f.jump) {
          menuIndex = (menuIndex + MENU_LEN - 1) % MENU_LEN;
          overlay.setTitleSelected(menuIndex);
          playSfx('uiBlip');
        }
        if (guardEdge) {
          menuIndex = (menuIndex + 1) % MENU_LEN;
          overlay.setTitleSelected(menuIndex);
          playSfx('uiBlip');
        }
        if (f.special) {
          save.settings.sound = !save.settings.sound;
          setSoundOn(save.settings.sound);
          saveSave(save);
          overlay.showTitle(titleView());
          playSfx('uiBlip');
        }
        if (f.attack) confirmTitle();
        break;
      }
      case 'story': {
        overlayTicks -= 1;
        if (overlayTicks <= 0) skipStory();
        else if (f.attack) skipStory(true);
        break;
      }
      case 'play': {
        const s = state!;
        if (debug) tickDebug(s, f);
        const wasMode = s.mode;
        const wasPhase = s.act2Phase;
        const wasPinned = s.player.pose === 'pinned';
        advance(s, f);
        if (debug) settleDebug(s);
        noteMissions(s, { wasPinned });
        consumeAudio(s);
        consumeEvents(s);
        handleTransitions(s, wasMode, wasPhase);
        s.events.length = 0;
        touch?.setPinned(s.player.pose === 'pinned');
        bgm(bgmFor(s));
        break;
      }
      case 'pause':
        break;
      case 'ending': {
        bgm('ending');
        overlayTicks -= 1;
        if (overlayTicks <= 0 || f.attack) {
          if (f.attack) playSfx('uiBlip');
          goTitle();
        }
        break;
      }
      case 'gameover': {
        bgm(null);
        overlayTicks -= 1;
        if (overlayTicks > 0) break;
        if (f.attack) {
          if (revivesUsed < MAX_REVIVES_PER_RUN) {
            void tryRevive();
          } else {
            playSfx('uiBlip');
            const s = state!;
            if (s.mode === 'act2' && s.checkpoint > 0) {
              continueFromCheckpoint(s);
              s.wazaGauge = 0;
              goPlay();
            } else goTitle();
          }
        } else if (f.special) {
          playSfx('uiBlip');
          goTitle();
        }
        break;
      }
    }
    // 씬 무관 갱신 — boot·pause·gameover를 거쳐도 타이틀 가드 엣지가 스테일이 안 되게 (08-30 검증)
    prevTitleGuard = f.guard;
  }

  function bgmFor(s: GameState): BgmTrack {
    if (s.mode === 'bonus') return 'butter';
    if (s.act2Phase === 'moon') return 'boss';
    if (s.act2Phase === 'bolt' || s.act2Phase === 'rock') return 'bolt';
    if (s.mode === 'act2') return 'act2a';
    return 'act1';
  }

  function noteKind(kind: string, extra?: { n?: number; combo?: number; zone?: string }): void {
    const daily = ensureDaily(save.daily, Date.now(), ads.ready());
    save.daily = daily;
    applyMissionEvent(daily, save.achieves, { kind, ...extra });
  }

  function noteMissions(s: GameState, extra?: { wasPinned?: boolean }): void {
    const daily = ensureDaily(save.daily, Date.now(), ads.ready());
    save.daily = daily;
    if (!save.achieves.length) save.achieves = initAchieveProgress();
    if (extra?.wasPinned && s.player.pose !== 'pinned' && s.player.pose !== 'dead') {
      applyMissionEvent(daily, save.achieves, { kind: 'pinEscape' });
    }
    for (const e of s.events) {
      let kind = e.kind as string;
      if (kind === 'bonusPerfect') kind = 'butterPerfect';
      applyMissionEvent(daily, save.achieves, {
        kind,
        n: e.n,
        combo: e.combo ?? s.combo,
        zone: s.gimmick !== 'none' ? s.gimmick : undefined,
      });
      if (e.kind === 'chapterUnlock' && (e.n ?? 0) >= 2) {
        applyMissionEvent(daily, save.achieves, { kind: 'zoneSurvive', zone: 'eastasia' });
      }
      if (e.kind === 'stackDestroy') { grant(save, 2, 0); dustDirty = true; }
      if (e.kind === 'special') { grant(save, 1, 0); dustDirty = true; }
    }
    // 판 도중 이탈(탭 종료·데스크톱 강제 종료)에도 재화가 안 날아가게 — 틱마다가 아니라
    // 지급 발생 프레임에만 저장 (08-30, P1-2 잔여)
    if (dustDirty) { saveSave(save); dustDirty = false; }
  }

  function handleTransitions(s: GameState, wasMode: GameState['mode'], wasPhase: GameState['act2Phase']): void {
    if (wasMode !== 'act2' && s.mode === 'act2' && wasMode !== 'bonus') {
      persist();
      noteKind('act2Enter');
      bgm('act2a');
      showOverlay(STORY.intro, 60 * 6);
      return;
    }
    if (s.mode === 'bonus' && wasMode === 'tokoton') {
      bgm('butter');
      showOverlay([SCREENS.butter.banner], 60 * 2);
      return;
    }
    if (s.mode === 'bonus' && wasMode === 'act1') {
      const ch = s.chapter;
      save.unlockedChapters = Math.max(save.unlockedChapters, ch);
      save.butterTierReached = Math.max(save.butterTierReached, s.bonus?.round ?? 0);
      saveSave(save);
      bgm('butter');
      showOverlay(butterEnterLines(STORY.chapters[Math.min(ch, 3)]), 60 * 3);
      return;
    }
    if (butterChallenge && wasMode === 'bonus' && s.mode === 'act1') {
      persist();
      showOverlay(butterChallengeEnd(s.score), 60 * 3, () => {
        goTitle();
      });
      return;
    }
    if (s.mode === 'act2' && wasPhase && s.act2Phase && wasPhase !== s.act2Phase && !s.over) {
      showOverlay(phaseBanner(s.act2Phase), 60 * 3);
      return;
    }
    if (s.over === 'cleared') {
      save.act2Cleared = true;
      noteKind('moonClear');
      persist();
      bgm('ending');
      const lines = s.fullCombo ? [...STORY.ending, '', ENDING_FULL_COMBO] : STORY.ending;
      showOverlay(lines, 60 * 12, () => {
        scene = 'ending';
        overlayTicks = 60 * 4;
        setChrome('ending');
        overlay.showEnding({
          score: s.score,
          maxCombo: save.maxCombo,
          fullCombo: s.fullCombo,
        });
      });
      return;
    }
    if (s.over === 'gameover') {
      persist();
      bgm(null);
      scene = 'gameover';
      overlayTicks = 45;
      setChrome('gameover');
      overlay.showGameOver({
        score: s.score,
        combo: s.combo,
        canContinue: s.mode === 'act2' && s.checkpoint > 0,
        canRevive: revivesUsed < MAX_REVIVES_PER_RUN,
        adRevive: ads.ready(),
        reviveLeft: MAX_REVIVES_PER_RUN - revivesUsed,
        reviveMax: MAX_REVIVES_PER_RUN,
        line: gameoverQuip(s.score + s.tick),
      });
      return;
    }
  }

  function draw(): void {
    ctx.fillStyle = PALETTE.BG;
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);

    if (state && (scene === 'play' || scene === 'pause' || scene === 'story' || scene === 'gameover' || scene === 'ending')) {
      drawGame(ctx, state);
      if (scene === 'play' || scene === 'pause') hud.sync(state);
    }
  }

  return {
    update: () => update(),
    draw,
    getState: () => state,
  };
}

export function mountDebugPanel(getState: () => GameState | null): void {
  mountDebugMenu(getState);
}
