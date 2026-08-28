// 씬 머신: Boot→Title → Act1(+BonusStage 자동) → StoryIntro → Act2 → Ending / Tokoton /
// ButterChallenge / GameOver(2막 이어하기) / Pause. 디버그 오버레이 포함.
// core는 씬을 모른다 — 씬이 advance 호출 여부·상태 전이를 관장한다.
// 타이틀·HUD·일시정지·결과는 DOM(overlay/hud). 캔버스는 필드만.

import type { GameState } from '../core/types';
import { makeState, advance, enterBonus } from '../core/sim';
import { enterAct2Phase, continueFromCheckpoint } from '../core/act2';
import { PALETTE, VIEW, WAZA_GAUGE } from '../config';
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
import { mountHud, ensureHudLayer } from './hud';
import {
  mountOverlay, ensureOverlayLayer, titleViewFromSave, type OverlayApi,
} from './overlay';
import { applySettingsPatch as patchSettings, applySettingsToRuntime } from './settings';
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
  let lastBgm: BgmTrack | null = null;
  let settingsFrom: 'title' | 'pause' = 'title';
  let overlay!: OverlayApi;

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

  function titleView() {
    return titleViewFromSave(save, menuIndex);
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
    setChrome('title');
    overlay.showTitle(titleView());
    bgm('title');
  }

  function startArcade(): void {
    save.buddhaMode = loadSave().buddhaMode;
    state = makeState({ seed: debugSeed(0x9e3779b9) });
    butterChallenge = false;
    if (save.buddhaMode) {
      enterAct2Phase(state, 'cathedral');
      state.wazaGauge = 0;
      showOverlay(STORY.intro, 60 * 6);
    } else {
      showOverlay(STORY.chapters[0], 60 * 3);
    }
  }

  function startTokoton(): void {
    if (!save.act2Cleared) return;
    state = makeState({ seed: debugSeed(0x51ed270b), mode: 'tokoton' });
    butterChallenge = false;
    goPlay();
  }

  function startButterChallenge(round: number): void {
    if (round < 1 || round > save.butterTierReached) return;
    state = makeState({ seed: debugSeed(0xabcdef) });
    state.wazaGauge = WAZA_GAUGE.MAX;
    enterBonus(state, round);
    butterChallenge = true;
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
    const sc = state.score;
    if (state.mode === 'tokoton') save.bestTokoton = Math.max(save.bestTokoton, sc);
    else if (butterChallenge && state.bonus) {
      const r = state.bonus.round;
      save.butterBest[r] = Math.max(save.butterBest[r] ?? 0, sc);
    } else save.bestArcade = Math.max(save.bestArcade, sc);
    save.maxCombo = Math.max(save.maxCombo, state.combo);
    save.unlockedChapters = Math.max(save.unlockedChapters, state.chapter);
    if (state.bonus) save.butterTierReached = Math.max(save.butterTierReached, state.bonus.round);
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
      if (!save.act2Cleared) { playSfx('uiDeny'); return; }
      playSfx('uiBlip');
      startTokoton();
    } else if (menuIndex === 2) {
      if (save.butterTierReached <= 0) { playSfx('uiDeny'); return; }
      playSfx('uiBlip');
      if (save.butterTierReached === 1) startButterChallenge(1);
      else overlay.showButterPick(save.butterTierReached);
    } else { playSfx('uiBlip'); openSettings(); }
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
      if (!save.act2Cleared) { playSfx('uiDeny'); return; }
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
    onEndingDone: () => { playSfx('uiBlip'); goTitle(); },
    onLogoTap: () => {
      titleTaps += 1;
      if (titleTaps >= DEBUG_TITLE_TAPS) {
        debug = true;
        mountDebugMenu(() => state);
      }
    },
  });

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
      if (scr === 'butter') { e.preventDefault(); overlay.showTitle(titleView()); return; }
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
        if (overlay.getScreen() === 'settings' || overlay.getScreen() === 'butter') break;
        if (f.jump) {
          menuIndex = (menuIndex + MENU_LEN - 1) % MENU_LEN;
          overlay.setTitleSelected(menuIndex);
          playSfx('uiBlip');
        }
        if (f.guard) {
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
        if (f.guard && f.special) {
          debug = true;
          mountDebugMenu(() => state);
        }
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
        advance(s, f);
        if (debug) settleDebug(s);
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
          playSfx('uiBlip');
          const s = state!;
          if (s.mode === 'act2' && s.checkpoint > 0) {
            continueFromCheckpoint(s);
            s.wazaGauge = 0;
            goPlay();
          } else goTitle();
        } else if (f.special) {
          playSfx('uiBlip');
          goTitle();
        }
        break;
      }
    }
  }

  function bgmFor(s: GameState): BgmTrack {
    if (s.mode === 'bonus') return 'butter';
    if (s.act2Phase === 'moon') return 'boss';
    if (s.act2Phase === 'bolt' || s.act2Phase === 'rock') return 'bolt';
    if (s.mode === 'act2') return 'act2a';
    return 'act1';
  }

  function handleTransitions(s: GameState, wasMode: GameState['mode'], wasPhase: GameState['act2Phase']): void {
    if (wasMode !== 'act2' && s.mode === 'act2' && wasMode !== 'bonus') {
      persist();
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
