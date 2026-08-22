// 씬 머신: Title → Act1(+BonusStage 자동) → StoryIntro → Act2 → Ending / Tokoton /
// ButterChallenge / GameOver(2막 이어하기). 디버그 오버레이 포함.
// core는 씬을 모른다 — 씬이 advance 호출 여부·상태 전이를 관장한다.

import type { GameState, InputFrame } from '../core/types';
import { makeState, advance, enterBonus } from '../core/sim';
import { enterAct2Phase, continueFromCheckpoint } from '../core/act2';
import { PALETTE, VIEW, WAZA_GAUGE } from '../config';
import { drawGame, consumeEvents, initRenderer, setFeedbackOptions } from '../render/renderer';
import { loadSave, saveSave, type SaveData } from '../storage';
import type { InputSource } from '../input/input';
import type { TouchInput } from './touchLayer';
import { initAudio, resumeIfNeeded, setSoundOn, startBgm, stopBgm } from '../audio/audio';
import type { BgmTrack } from '../audio/sfx';
import { STORY } from './story';

type SceneName = 'title' | 'play' | 'story' | 'ending' | 'gameover';

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
  let scene: SceneName = 'title';
  let state: GameState | null = null;
  let save: SaveData = loadSave();
  let overlayTicks = 0;
  let overlayText: readonly string[] = [];
  let pendingAfterOverlay: (() => void) | null = null;
  let butterChallenge = false;
  let debug = new URLSearchParams(location.search).has('debug');
  let titleTaps = 0;
  let menuIndex = 0;
  let lastBgm: BgmTrack | null = null;

  setFeedbackOptions({ shakeLevel: save.settings.shakeLevel, vibration: save.settings.vibration });
  setSoundOn(save.settings.sound);
  initRenderer();
  input.onFirstGesture(() => { initAudio(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeIfNeeded(); });

  function bgm(track: BgmTrack | null): void {
    if (track === lastBgm) return;
    lastBgm = track;
    if (track) startBgm(track); else stopBgm();
  }

  function startArcade(): void {
    state = makeState({ seed: (Date.now() ^ 0x9e3779b9) >>> 0 });
    if (save.buddhaMode) { enterAct2Phase(state, 'cathedral'); state.wazaGauge = 0; }
    butterChallenge = false;
    scene = 'play';
  }

  function startTokoton(): void {
    state = makeState({ seed: (Date.now() ^ 0x51ed270b) >>> 0, mode: 'tokoton' });
    butterChallenge = false;
    scene = 'play';
  }

  function startButterChallenge(round: number): void {
    state = makeState({ seed: (Date.now() ^ 0xabcdef) >>> 0 });
    state.wazaGauge = WAZA_GAUGE.MAX;
    enterBonus(state, round);
    butterChallenge = true;
    scene = 'play';
  }

  function showOverlay(lines: readonly string[], ticks: number, after?: () => void): void {
    overlayText = lines;
    overlayTicks = ticks;
    pendingAfterOverlay = after ?? null;
    scene = 'story';
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

  // ── 프레임 처리 ──────────────────────────────────────────────
  function update(): void {
    const f = input.sample();

    switch (scene) {
      case 'title': {
        bgm('title');
        touch?.setPinned(false);
        if (f.jump) menuIndex = (menuIndex + 2) % 3;
        if (f.guard) menuIndex = (menuIndex + 1) % 3;
        if (f.special) { // 필살 버튼 = 사운드 토글
          save.settings.sound = !save.settings.sound;
          setSoundOn(save.settings.sound);
          saveSave(save);
        }
        if (f.attack) {
          titleTaps += 1;
          if (menuIndex === 0) startArcade();
          else if (menuIndex === 1 && save.act2Cleared) startTokoton();
          else if (menuIndex === 2 && save.butterTierReached > 0) startButterChallenge(save.butterTierReached);
        }
        if (f.guard && f.special) debug = true; // 가드+필살 동시 = 디버그 (모바일용)
        break;
      }
      case 'story': {
        overlayTicks -= 1;
        if (overlayTicks <= 0 || f.attack) {
          const after = pendingAfterOverlay;
          pendingAfterOverlay = null;
          if (after) after();
          else scene = 'play';
        }
        break;
      }
      case 'play': {
        const s = state!;
        // 디버그 단축키 (?debug=1)
        if (debug) applyDebug(s, f);
        const wasMode = s.mode;
        const wasPhase = s.act2Phase;
        advance(s, f);
        consumeEvents(s);
        handleTransitions(s, wasMode, wasPhase);
        s.events.length = 0;
        touch?.setPinned(s.player.pose === 'pinned');
        bgm(bgmFor(s));
        break;
      }
      case 'ending': {
        overlayTicks -= 1;
        if (overlayTicks <= 0 || f.attack) {
          scene = 'title';
          state = null;
          menuIndex = 0;
        }
        break;
      }
      case 'gameover': {
        overlayTicks -= 1;
        if (overlayTicks > 0) break;
        if (f.attack) {
          const s = state!;
          if (s.mode === 'act2' && s.checkpoint > 0) { continueFromCheckpoint(s); s.wazaGauge = 0; scene = 'play'; }
          else { scene = 'title'; state = null; menuIndex = 0; }
        } else if (f.special) {
          scene = 'title'; state = null; menuIndex = 0;
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
    // 1막 → 2막: 짧은 내레이션 [정본 구조]
    if (wasMode !== 'act2' && s.mode === 'act2' && wasMode !== 'bonus') {
      persist();
      showOverlay(STORY.intro, 60 * 6);
      return;
    }
    // 토코톤 주기 버터바: 챕터 내레이션 없이 배너만
    if (s.mode === 'bonus' && wasMode === 'tokoton') {
      showOverlay(['— 버터바 타임! —'], 60 * 2);
      return;
    }
    // 챕터 해금 내레이션 조각
    if (s.mode === 'bonus' && wasMode === 'act1') {
      const ch = s.chapter;
      save.unlockedChapters = Math.max(save.unlockedChapters, ch);
      save.butterTierReached = Math.max(save.butterTierReached, s.bonus?.round ?? 0);
      saveSave(save);
      showOverlay([...STORY.chapters[Math.min(ch, 3)], '', '— 버터바 타임! —'], 60 * 3);
      return;
    }
    // 버터 챌린지 모드: 보너스 종료 = 게임 종료
    if (butterChallenge && wasMode === 'bonus' && s.mode === 'act1') {
      persist();
      showOverlay(['버터바 챌린지 종료!', `점수: ${s.score.toLocaleString()}`], 60 * 3, () => {
        scene = 'title'; state = null;
      });
      return;
    }
    // 클리어
    if (s.over === 'cleared') {
      save.act2Cleared = true;
      persist();
      showOverlay(STORY.ending, 60 * 12, () => {
        scene = 'ending';
        overlayTicks = 60 * 4;
      });
      return;
    }
    // 게임오버
    if (s.over === 'gameover') {
      persist();
      scene = 'gameover';
      overlayTicks = 45;
      return;
    }
    void wasPhase;
  }

  function applyDebug(s: GameState, f: InputFrame): void {
    // 디버그 전용: 키보드 숫자키 (keydown을 별도로 안 받고 간이 처리 — 디버그 패널은 DOM 버튼)
    void s; void f;
  }

  // ── 렌더 ─────────────────────────────────────────────────────
  function draw(): void {
    ctx.fillStyle = PALETTE.BG;
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);

    if (scene === 'play' && state) {
      drawGame(ctx, state);
      return;
    }
    if (scene === 'story') {
      if (state) drawGame(ctx, state);
      ctx.fillStyle = 'rgba(244, 241, 232, 0.90)';
      ctx.fillRect(0, 0, VIEW.W, VIEW.H);
      ctx.fillStyle = PALETTE.INK;
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      overlayText.forEach((line, k) => ctx.fillText(line, VIEW.W / 2, 200 + k * 22));
      ctx.fillStyle = '#8A857A';
      ctx.fillText('(공격 버튼으로 넘기기)', VIEW.W / 2, VIEW.H - 200);
      return;
    }
    if (scene === 'gameover' && state) {
      drawGame(ctx, state);
      ctx.fillStyle = 'rgba(250, 236, 232, 0.92)';
      ctx.fillRect(0, 0, VIEW.W, VIEW.H);
      ctx.fillStyle = PALETTE.RED;
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('철거 실패', VIEW.W / 2, 240);
      ctx.fillStyle = PALETTE.INK;
      ctx.font = '13px sans-serif';
      ctx.fillText('건물주가 당신을 고소했습니다', VIEW.W / 2, 270);
      ctx.fillText(`점수 ${state.score.toLocaleString()}`, VIEW.W / 2, 300);
      if (state.mode === 'act2' && state.checkpoint > 0) {
        ctx.fillStyle = PALETTE.YELLOW;
        ctx.fillText('공격: 이어하기 (체크포인트) / 필살: 타이틀', VIEW.W / 2, 340);
      } else {
        ctx.fillStyle = PALETTE.YELLOW;
        ctx.fillText('공격: 타이틀로', VIEW.W / 2, 340);
      }
      return;
    }
    if (scene === 'ending') {
      ctx.fillStyle = '#EAE6DA';
      ctx.fillRect(0, 0, VIEW.W, VIEW.H);
      ctx.fillStyle = PALETTE.YELLOW;
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('작전성공', VIEW.W / 2, 260);
      ctx.fillStyle = PALETTE.INK;
      ctx.font = '13px sans-serif';
      ctx.fillText('민들레 홀씨가 흩날린다…', VIEW.W / 2, 300);
      return;
    }

    // ── 타이틀 ──
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.YELLOW;
    ctx.font = 'bold 44px serif';
    ctx.fillText('건뿌!!', VIEW.W / 2, 170);
    ctx.fillStyle = PALETTE.RED;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('진지한 게 단 하나도 없는 철거 게임', VIEW.W / 2, 200);

    const items = [
      '아케이드 시작',
      save.act2Cleared ? '토코톤 (엔드리스)' : '토코톤 — 잠김',
      save.butterTierReached > 0 ? `버터바 챌린지 (${save.butterTierReached}회차)` : '버터바 챌린지 — 잠김',
    ];
    ctx.font = '15px sans-serif';
    items.forEach((it, k) => {
      ctx.fillStyle = k === menuIndex ? PALETTE.YELLOW : '#8A857A';
      ctx.fillText(`${k === menuIndex ? '▶ ' : ''}${it}`, VIEW.W / 2, 280 + k * 34);
    });
    ctx.fillStyle = '#8A857A';
    ctx.font = '11px sans-serif';
    ctx.fillText('점프/가드 = 선택 이동 · 공격 = 확정 · 필살 = 소리 토글', VIEW.W / 2, 400);
    ctx.fillText(`동네 최고: ${save.bestArcade.toLocaleString()}  |  소리: ${save.settings.sound ? '켜짐' : '꺼짐'}`, VIEW.W / 2, 430);
    if (save.buddhaMode) ctx.fillText('※ 부처버전 (2막부터 시작)', VIEW.W / 2, 452);
    void titleTaps;
  }

  return {
    update: () => update(),
    draw,
    getState: () => state,
  };
}

// 디버그 패널 (DOM — ?debug=1일 때만 main이 호출)
export function mountDebugPanel(getState: () => GameState | null): void {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:4px;left:4px;z-index:99;display:flex;flex-wrap:wrap;gap:4px;max-width:200px;font-size:10px;';
  const mk = (label: string, fn: (s: GameState) => void): void => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'font-size:10px;padding:2px 4px;opacity:.7;';
    b.addEventListener('click', () => { const s = getState(); if (s) fn(s); });
    el.appendChild(b);
  };
  mk('대성당', (s) => enterAct2Phase(s, 'cathedral'));
  mk('마천루', (s) => enterAct2Phase(s, 'tower'));
  mk('번개', (s) => enterAct2Phase(s, 'bolt'));
  mk('화산탄', (s) => enterAct2Phase(s, 'rock'));
  mk('보스', (s) => enterAct2Phase(s, 'moon'));
  mk('+1M', (s) => { s.score = Math.min(s.score + 1_000_000, 99_999_999); });
  mk('기술풀', (s) => { s.wazaGauge = 100; });
  mk('방어풀', (s) => { s.guardGauge = 100; });
  mk('버터1', (s) => enterBonus(s, 1));
  // 부처버전 토글 (상태 불필요 — 저장만)
  const bb = document.createElement('button');
  bb.style.cssText = 'font-size:10px;padding:2px 4px;opacity:.7;';
  const label = (): string => `부처:${loadSave().buddhaMode ? 'ON' : 'OFF'}`;
  bb.textContent = label();
  bb.addEventListener('click', () => {
    const sv = loadSave();
    sv.buddhaMode = !sv.buddhaMode;
    saveSave(sv);
    bb.textContent = label();
  });
  el.appendChild(bb);
  document.body.appendChild(el);
}
