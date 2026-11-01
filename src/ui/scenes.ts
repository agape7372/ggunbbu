// 씬 머신: Boot→Title → Act1(+BonusStage 자동) → StoryIntro → Act2 → Ending / Tokoton /
// ButterChallenge / GameOver(2막 이어하기) / Pause. 디버그 오버레이 포함.
// core는 씬을 모른다 — 씬이 advance 호출 여부·상태 전이를 관장한다.
// 타이틀·HUD·일시정지·결과는 DOM(overlay/hud). 캔버스는 필드만.

import type { GameState, GimmickId, StageDiff } from '../core/types';
import { makeState, advance, enterBonus, grantMercyLife } from '../core/sim';
import { enterAct2Phase, continueFromCheckpoint } from '../core/act2';
import { judgeStage, stageScript, stageSeed, startStage } from '../core/stage';
import { STAGES } from '../core/stages';
import { ACT1, AUDIO, GIMMICK, OPERATION, PALETTE, TEACH, UI_FLOW, VIEW, WAZA_GAUGE } from '../config';
import { drawGame, consumeEvents, initRenderer, setFeedbackOptions, applyCosmetics } from '../render/renderer';
import { loadSave, resetSave, saveSave, type SaveData, type SaveSettings } from '../storage';
import type { InputSource } from '../input/input';
import type { TouchInput } from './touchLayer';
import {
  armAudioUnlock, duckBgm, initAudio, playSfx, resumeIfNeeded, setBgmOn, setSfxOn, setSoundOn,
  startBgm, stopBgm, suspendAudio,
} from '../audio/audio';
import { consumeAudio } from '../audio/consume';
import type { BgmTrack } from '../audio/sfx';
import {
  STORY,
  SCREENS,
  butterChallengeEnd,
  butterEnterLines,
  hudModeLabel,
  phaseBanner,
  pickQuip,
  ENDING_FULL_COMBO,
} from '../content';
import { introFor } from '../content/story';
import { STAGE_MODE, STAGE_TEXT } from '../content/stages';
import { diffUnlocked, kstDate, mergeResult, recordOf, stageUnlocked, type RecordNews, type StageRecord } from '../meta/stageRecord';
import { bossName, endView, newHintMemo, nextHint, stageHudLine, workProgress, type HintMemo, type StageEndView } from './stageLogic';
import { MASK_COPY, OPERATIONS, WEAPON_COPY, regionOf } from '../content/world';
import { MASK_MAX, adoptLegacyMask, createMask, deleteMask, ownedMasks, updateMask, wearMask, wornMaskId } from '../meta/mask';
import { closeMaskEditor, openMaskEditor } from './maskEditor';
import { closeLayoutEditor, openLayoutEditor } from './layoutEditor';
import { mountHud, ensureHudLayer } from './hud';
import { createRunCaps, type RunCap, type RunCaps } from './runCaps';
import {
  mountOverlay, ensureOverlayLayer, titleViewFromSave, type GameOverView, type OpsEndView, type OverlayApi, type StoryOpts,
} from './overlay';
import { applySettingsPatch as patchSettings, applySettingsToRuntime, type SettingsSinks } from './settings';
import {
  applyMissionEvent, ensureDaily, grant, grantOrbit, initAchieveProgress,
  MAX_REVIVES_PER_RUN, ORBIT_PER_AD, ACHIEVES, DAILY_POOL, claim, defById,
  equip, spendOrbit, orbitCost, exchangeDust, DUST_EXCHANGE,
  dustCost, spendDust, DUST_PER_BUILDING, DUST_PER_SPECIAL, DUST_PER_SUPPLY,
  claimableCount, nextDustGoal,
  betterGrade, isOpId, licenseTitle, opGrade, opLimitTicks, opValue, takeExam, type OpId,
} from '../meta';
import { createAdsPort, type AdKind } from '../platform/ads';
import { minimizeApp, onBackButton, onLifecycle } from '../platform/native';
import { createIapPort, SKUS, type SkuId } from '../platform/iap';
import { DEV_TOOLS, isDevUnlocked } from '../platform/devUnlock';
import {
  applyDebug as tickDebug,
  settleDebug,
  mountDebugMenu,
  debugSeed,
  DEBUG_TITLE_TAPS,
} from './debugMenu';

type SceneName = 'boot' | 'title' | 'play' | 'story' | 'ending' | 'gameover' | 'opsend' | 'stageend' | 'pause';
type Chrome = 'boot' | 'title' | 'playing' | 'paused' | 'story' | 'gameover' | 'ending';

const CHROME: readonly Chrome[] = ['boot', 'title', 'playing', 'paused', 'story', 'gameover', 'ending'];
const MENU_LEN = 5;

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
  // 디버그 경로(?debug·로고 7탭·가드+필살)는 개발 빌드에만 있다 — 스토어 빌드에선 상수 false로 접혀 빠진다
  let debug = import.meta.env.DEV && new URLSearchParams(location.search).has('debug');
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
  // 이번 판 결과 카드용 계수 — 부활·체크포인트 이어하기는 같은 판이라 계속 쌓는다
  let runBuildings = 0;
  let runDust = 0;
  let butterRoundNo = 0; // 버터바 챌린지 회차(0 = 챌린지 아님). 종료 시점엔 s.bonus가 이미 null이라 따로 든다
  let gameoverDelay = 0; // 결과 카드가 뜨기까지 남은 틱 — 그동안 캔버스만 그린다
  let pendingOver: GameOverView | null = null;
  let pendingOps: OpsEndView | null = null; // 작전 결과 카드 — 게임오버 카드와 같은 박자로 늦춘다
  // 저장 밖 세션 기억 — 새로 열면 처음부터 (C10·C13)
  let sessionArcadeRuns = 0; // 이번 세션에서 아케이드를 시작한 횟수 → 구역 인트로 사다리
  let deathStreak = 0; // 같은 세션 연속 사망 (신기록·클리어에서 끊긴다) → 만담 사다리
  let streakCounted = false; // 한 판에서 부활해 또 죽어도 연속 사망은 한 번만
  let lastQuip = ''; // 직전에 보인 만담 — 반복 금지
  let runHatBreaks = 0; // 이번 판에 안전모가 깨진 횟수
  // 특별작전 한 판: 어느 작전인지 + 지금까지 부순 건물 수. null = 작전 아님
  let opRun: { id: OpId; buildings: number } | null = null;
  // 작업 지시서 한 판. null = 지시서 판 아님
  let stageRun: { id: string; diff: StageDiff; fromBoss: boolean; memo: HintMemo; bossShown: boolean } | null = null;
  let pendingStage: StageEndView | null = null; // 철거 보고서 — 게임오버 카드와 같은 박자로 늦춘다
  let stageEnd: StageEndView | null = null; // 떠 있는 보고서(단추가 읽는다)
  let scoreBase = 0; // 작전이 시작 진행으로 주입한 점수 — 카드·만담은 이 판에 번 점수만 본다
  let runCaps: RunCaps = createRunCaps({ prevBest: 0, countsRecord: false });
  // 가드 가르치기: 평생 첫 목숨 손실 때 판을 잠깐 세우고 가드 키를 맥동시킨다 (C1)
  let teachFreeze = 0;
  let teachPulse = 0;
  let storyLock = 0; // 이야기 판에 들어선 직후 연타로 넘어가지 않게 잠그는 틱
  // 「한 판 더」는 방금 그 모드로 — 구역 작전·야근에서 죽었는데 아케이드로 튕기지 않게
  let lastRun: () => void = () => startArcade();
  let runLabel = '아케이드';
  let adBusy = false;
  const ads = createAdsPort();
  const iap = createIapPort();

  const settingsSinks: SettingsSinks = {
    setSoundOn,
    setBgmOn,
    setSfxOn,
    setFeedbackOptions,
    setLeftHanded: (on) => { touch?.setLeftHanded(on); },
    setButtonLayout: (layout) => { touch?.setLayout(layout); },
  };
  applySettingsToRuntime(save, settingsSinks);
  initRenderer();
  applyCosmetics(save.loadout, save.maskArt); // 코스메틱 실반영 (08-30, P1-3)
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
    save.daily = ensureDaily(save.daily, Date.now(), ads.ready(), save.unlockedChapters); // 「오늘 N/3」가 날짜 넘김에도 맞게
    return titleViewFromSave(save, menuIndex, debugOpen());
  }

  function applyRunMeta(s: GameState, gimmick: GimmickId = 'none'): void {
    s.waza = save.loadout.waza;
    s.weapon = save.loadout.weapon;
    s.gimmick = gimmick;
    revivesUsed = 0;
    runBuildings = 0;
    runDust = 0;
    runHatBreaks = 0;
    butterRoundNo = 0;
    opRun = null;
    stageRun = null;
    stageEnd = null;
    scoreBase = 0;
    streakCounted = false;
    endTeach();
    save.stats.runs += 1;
    const daily = ensureDaily(save.daily, Date.now(), ads.ready(), save.unlockedChapters);
    save.daily = daily;
    if (!save.achieves.length) save.achieves = initAchieveProgress();
    applyMissionEvent(daily, save.achieves, { kind: 'runStart' });
    saveSave(save);
  }

  /** 판 시작 때 최고 기록을 한 번 들고 자막 추적을 새로 연다 — 판 도중 저장이 올려도 흔들리지 않게 */
  function armCaps(kind: 'arcade' | 'tokoton' | 'butter' | 'op'): void {
    const prevBest = kind === 'tokoton' ? save.bestTokoton
      : kind === 'butter' ? (save.butterBest[butterRoundNo] ?? 0)
        : save.bestArcade;
    runCaps = createRunCaps({ prevBest, countsRecord: !runExempt && kind !== 'op' });
  }

  function showCaps(caps: readonly RunCap[]): void {
    for (const c of caps) {
      hud.note(c.text);
      if (c.blip) playSfx('uiBlip');
    }
  }

  function endTeach(): void {
    teachFreeze = 0;
    teachPulse = 0;
    hud.teach(false);
    touch?.setGuardHint(false);
  }

  function startTeach(): void {
    save.guardTaught = true;
    saveSave(save);
    teachFreeze = TEACH.GUARD_FREEZE_TICKS;
    teachPulse = TEACH.GUARD_PULSE_TICKS;
    hud.teach(true);
    touch?.setGuardHint(true);
  }

  function bgm(track: BgmTrack | null): void {
    if (track === lastBgm) return;
    lastBgm = track;
    if (track) startBgm(track); else stopBgm();
  }

  /** 결과 카드 버튼 — 카드가 뜬 직후 잠금(overlayTicks) 동안은 터치도 키처럼 무시한다 */
  function afterLock(fn: () => void): () => void {
    return () => { if (overlayTicks <= 0) fn(); };
  }

  function goPlay(): void {
    gameoverDelay = 0;
    pendingOver = null;
    pendingOps = null;
    pendingStage = null;
    scene = 'play';
    overlay.hide();
    setChrome('playing');
  }

  /** show = false — 홈을 거치지 않고 바로 다른 화면(작전 목록 · 상점)으로 간다. 베는 칼이 결과 화면에서 바로 넘어가게 */
  function goTitle(show = true): void {
    gameoverDelay = 0;
    pendingOver = null;
    pendingOps = null;
    pendingStage = null;
    stageEnd = null;
    stageRun = null;
    opRun = null;
    endTeach();
    state = null;
    scene = 'title';
    menuIndex = 0;
    butterChallenge = false;
    save = { ...save, ...loadSave() };
    setChrome('title');
    if (show) overlay.showTitle(titleView());
    bgm('title');
  }

  function startArcade(): void {
    lastRun = startArcade;
    runLabel = '아케이드';
    runExempt = debugOpen();
    save.buddhaMode = loadSave().buddhaMode;
    state = makeState({ seed: debugSeed(0x9e3779b9) });
    const lifetimeFirst = save.stats.runs === 0; // applyRunMeta 가 판 수를 올리기 전에 본다
    sessionArcadeRuns += 1;
    applyRunMeta(state);
    butterChallenge = false;
    armCaps('arcade');
    if (save.buddhaMode && import.meta.env.DEV) {
      enterAct2Phase(state, 'cathedral');
      state.wazaGauge = 0;
      showOverlay(STORY.intro, 60 * 6);
    } else {
      const intro = introFor(sessionArcadeRuns, lifetimeFirst);
      showOverlay(intro.lines, intro.ticks);
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
      grades: save.opsGrade,
    };
  }

  function openMissions(): void {
    const daily = ensureDaily(save.daily, Date.now(), ads.ready(), save.unlockedChapters);
    save.daily = daily;
    if (!save.achieves.length) save.achieves = initAchieveProgress();
    overlay.showMissions(daily, save.achieves, ads.ready());
  }

  function openBook(): void {
    // 내 가면은 가면마다 칸 하나(공방을 연 사람만 — 이름은 사용자가 지은 글자)
    overlay.showBook({ loadout: save.loadout, maskArt: save.maskArt }, ownedSet(), save.owned.includes('mask') ? ownedMasks(save) : undefined);
  }

  function openShop(): void {
    overlay.showShop({
      dust: save.dust, orbit: save.orbit, license: save.license, buildings: save.stats.buildings, loadout: save.loadout,
      maskArt: save.maskArt, masks: save.masks, maskId: save.maskId,
    }, ownedSet(), {
      iap: iap.available(),
      ad: ads.ready(),
    });
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
    lastRun = () => startOp(id);
    runLabel = op.name;
    runExempt = true; // 구역 작전 = 점수·챕터 주입 런 — 영구 기록 비반영 (P1-1)
    state = makeState({ seed: debugSeed(0xc0ffee) });
    applyRunMeta(state, op.gimmick);
    state.chapter = op.themeIndex;
    if (op.gimmick === 'none' && op.themeIndex > 0) {
      state.p = ACT1.CHAPTER_BOUNDS[op.themeIndex - 1];
      state.score = Math.floor(ACT1.UNLOCK_SCORE * state.p);
    } else if (isOpId(op.id)) {
      // 특별작전: 시작 p 를 점수로 주입하고 목표를 따라 센다 (C3)
      opRun = { id: op.id, buildings: 0 };
      state.p = GIMMICK.START_P[op.id];
      state.score = Math.floor(ACT1.UNLOCK_SCORE * state.p);
    }
    scoreBase = state.score;
    butterChallenge = false;
    armCaps('op');
    goPlay();
  }

  // ── 작업 지시서 ─────────────────────────────────────────────
  function stageOpts() {
    return { recs: save.stages, allOpen: debugOpen() };
  }

  /** 홈을 거치지 않고 지시서 목록(또는 그 판의 지시서 한 장)으로 — 베는 칼이 보고서에서 바로 넘어가게 */
  function toStageList(detail?: string): void {
    goTitle(false);
    overlay.showStages(stageOpts(), detail);
  }

  /** 지시서 한 판. fromBoss = 보스 연습(기록 없음). 진짜 판은 시작 때 착수 +1 */
  function startStageRun(id: string, diff: StageDiff, fromBoss: boolean): void {
    const rec = recordOf(save.stages, id);
    const dev = debugOpen();
    if (!STAGES.some((d) => d.id === id) || !(dev || stageUnlocked(save.stages, id)) || !(dev || diffUnlocked(rec, diff))) {
      playSfx('uiDeny');
      return;
    }
    lastRun = () => startStageRun(id, diff, fromBoss);
    runLabel = STAGE_MODE.title;
    runExempt = true; // 아케이드 영구 기록(최고 점수 · 구역 · 최고 콤보)은 안 건드린다. 재화 지급만 유지
    if (!fromBoss) {
      save.stages[id] = { ...rec, tries: rec.tries + 1 };
      saveSave(save);
    }
    state = makeState({ seed: stageSeed(id) });
    applyRunMeta(state);
    butterChallenge = false;
    armCaps('op');
    startStage(state, { id, diff, weapon: save.loadout.weapon, waza: save.loadout.waza, fromBoss }); // 마지막
    stageRun = { id, diff, fromBoss, memo: newHintMemo(), bossShown: false };
    goPlay();
    if (!fromBoss) hud.note(`${id} ${stageName(id)}`);
  }

  const stageName = (id: string): string => STAGE_TEXT[id]?.name ?? '';

  /** 한 틱마다 — 판 이름 · 명물 이름 도장, 종 힌트(판을 세우지 않는 자막) */
  function stageTick(s: GameState, run: NonNullable<typeof stageRun>): void {
    const st = s.stage;
    if (!st) return;
    const hint = nextHint(s, run); // 메모는 매 틱 갱신한다 — 자막마다 한 판에 한 번
    if (hint) hud.note(hint);
    if (!run.bossShown && st.phase === 'boss') {
      run.bossShown = true;
      // 대본이 없는 판은 시작 도장이 이미 명물 이름이다
      if (run.fromBoss || stageScript(run.id).length > 0) hud.note(bossName(run.id));
    }
  }

  /** 지시서 판이 끝나는 순간인가 — 아케이드 엔딩 · 게임오버 카드 · 광고 부활이 이 판에 절대 타지 않게 맨 앞에서 가로챈다 */
  function endStageIfDue(s: GameState): boolean {
    const run = stageRun;
    if (s.mode !== 'stage' || !run) return false;
    if (!s.over) return true;
    const st = s.stage!;
    const result = judgeStage(s);
    const kind = run.fromBoss ? 'practice' : 'real';
    let news: RecordNews | null = null;
    let rec: StageRecord | null = null;
    if (kind === 'real') {
      const m = mergeResult(recordOf(save.stages, run.id), result, kstDate(Date.now()));
      save.stages[run.id] = m.rec;
      saveSave(save);
      news = m.news;
      rec = m.rec;
    }
    const i = STAGES.findIndex((d) => d.id === run.id);
    const nx = STAGES[i + 1];
    const w = workProgress(run.id, st.step);
    pendingStage = endView({
      kind, result, lifeLost: st.tally.lifeLost, finishSpecial: st.tally.finishSpecial,
      step: w.done, total: w.total, phase: st.phase, news, rec,
      nextId: kind === 'real' && result.cleared && nx && (debugOpen() || stageUnlocked(save.stages, nx.id)) ? nx.id : null,
    });
    bgm(null);
    playSfx(result.cleared ? 'stamp' : 'runEnd', { delay: result.cleared ? 0 : AUDIO.RUN_END_DELAY });
    scene = 'gameover'; // 카드가 뜰 때까지의 박자는 게임오버와 같다. 카드가 뜨면 stageend
    setChrome('gameover');
    gameoverDelay = result.cleared ? 6 : UI_FLOW.GAMEOVER_CARD_DELAY;
    overlayTicks = 0;
    return true;
  }

  /** 철거 자격 응시 — 조건과 응시료는 economy.ts 한 곳 */
  function doExam(): void {
    const to = licenseTitle(save.license + 1);
    if (!takeExam(save)) { playSfx('uiDeny'); return; }
    saveSave(save);
    playSfx('stamp');
    overlay.toast(SCREENS.license.passed(to));
    openShop();
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
      else add('baram');
    }
  }

  async function claimMission(id: string, boost: boolean): Promise<void> {
    const def = defById(id) ?? DAILY_POOL.find((d) => d.id === id) ?? ACHIEVES.find((d) => d.id === id);
    if (!def) return;
    const daily = ensureDaily(save.daily, Date.now(), ads.ready(), save.unlockedChapters);
    save.daily = daily;
    if (!save.achieves.length) save.achieves = initAchieveProgress();
    const prog = daily.items.find((p) => p.id === id) ?? save.achieves.find((p) => p.id === id);
    if (!prog) return;
    if (boost) {
      if (!ads.ready()) { playSfx('uiDeny'); return; } // 웹: 광고 없음 — 버튼도 안 그리지만 백스톱 (08-30)
      if (!(await watchAd('missionBoost'))) return;
      applyMissionEvent(daily, save.achieves, { kind: 'adWatched' });
    }
    const got = claim(prog, def, boost);
    if (got.dust === 0 && got.orbit === 0) { playSfx('uiDeny'); return; }
    grant(save, got.dust, got.orbit);
    saveSave(save);
    playSfx('coin');
    overlay.toast(gainText(got.dust, got.orbit));
    // 광고를 기다리는 동안 다른 탭으로 갔으면 끌고 오지 않는다
    if (overlay.getScreen() === 'missions') openMissions();
  }

  /** 보상형 광고 1편. 불러오는 중·실패·건너뜀을 토스트로 말한다. 진행 중이면 두 번째 탭은 무시. */
  async function watchAd(kind: AdKind): Promise<boolean> {
    if (adBusy) return false;
    adBusy = true;
    duckBgm('ad', true);
    overlay.toast('광고를 불러오는 중…');
    try {
      const r = await ads.showRewarded(kind);
      overlay.toast('');
      if (r === 'ok') return true;
      overlay.toast(r === 'skip' ? '끝까지 봐야 받아요.' : '광고를 못 불러왔어요. 다시 눌러 주세요.');
      playSfx('uiDeny');
      return false;
    } finally {
      adBusy = false;
      duckBgm('ad', false);
    }
  }

  function gainText(dust: number, orbit: number): string {
    const parts = [dust > 0 ? `먼지 +${dust}` : '', orbit > 0 ? `궤도조각 +${orbit}` : ''].filter(Boolean);
    return parts.join(' · ');
  }

  function doExchange(): void {
    if (!exchangeDust(save)) { playSfx('uiDeny'); return; }
    saveSave(save);
    playSfx('coin');
    overlay.toast(`먼지 ${DUST_EXCHANGE.dust} → 궤도조각 +${DUST_EXCHANGE.orbit}`);
    openShop();
  }

  function resetData(): void {
    resetSave();
    save = loadSave();
    applySettingsToRuntime(save, settingsSinks);
    applyCosmetics(save.loadout, save.maskArt);
    menuIndex = 0;
    playSfx('uiBack');
    overlay.showTitle(titleView());
    overlay.toast('기록을 지웠어요.');
  }

  async function buySku(id: string): Promise<void> {
    const sku = SKUS.find((s) => s.id === id);
    if (!sku || sku.krw > 1900) return;
    // 이미 전부 보유한 SKU는 결제 자체를 막는다 — 지급 0 실과금 사고 방지 (08-30, P1-4)
    if (id === 'waza_unlock' && save.owned.includes('ageba') && save.owned.includes('baram')) {
      playSfx('uiDeny');
      return;
    }
    const r = await iap.purchase(id as SkuId);
    if (r !== 'ok') { playSfx('uiDeny'); return; }
    applySku(id as SkuId);
    saveSave(save);
    playSfx('coin');
    openShop();
  }

  async function adOrbit(): Promise<void> {
    if (!(await watchAd('orbitPack'))) return;
    const daily = ensureDaily(save.daily, Date.now(), ads.ready(), save.unlockedChapters);
    save.daily = daily;
    applyMissionEvent(daily, save.achieves, { kind: 'adWatched' });
    grantOrbit(save, ORBIT_PER_AD);
    saveSave(save);
    playSfx('coin');
    overlay.toast(gainText(0, ORBIT_PER_AD));
    if (overlay.getScreen() === 'shop') openShop();
  }

  function unlockOrbitItem(id: string): void {
    const cost = orbitCost(id);
    if (cost == null || cost <= 0) { playSfx('uiDeny'); return; }
    if (!spendOrbit(save, cost)) { playSfx('uiDeny'); return; }
    if (!save.owned.includes(id)) save.owned = [...save.owned, id];
    saveSave(save);
    playSfx('coin');
    overlay.toast('열었어요.');
    openShop();
  }

  function unlockDustItem(id: string): void {
    const cost = dustCost(id);
    if (cost == null || !spendDust(save, cost)) { playSfx('uiDeny'); return; }
    if (!save.owned.includes(id)) save.owned = [...save.owned, id];
    if (id === 'mask') adoptLegacyMask(save); // 가면 공방 — 옛 그림이 남아 있으면 첫 가면
    saveSave(save);
    playSfx('coin');
    overlay.toast('샀어요.');
    openShop();
  }

  function doEquip(slot: string, id: string): void {
    // 가면 칸의 「그리기」 · 「새 가면」은 상점이 장착 길(onEquip)로 보낸다 — 여기서 도트판을 연다
    if (slot === 'mask-edit') { openMaskBoard(id); return; }
    if (slot === 'mask-new') { openMaskBoard(null); return; }
    if (slot === 'mask') wearMask(save, id); // id = 가면 id 또는 'none'
    else save.loadout = equip(save.loadout, slot, id, ownedSet());
    applyCosmetics(save.loadout, save.maskArt); // 즉시 반영 — 팔리는 물건은 실제로 바뀐다 (P1-3)
    saveSave(save);
    playSfx('stamp');
    // 장착은 상점 안에서만 한다(꾸미기 탭을 합쳤다) — 상점을 그대로 다시 그린다
    openShop();
  }

  /** 가면 도트판 — id = 있던 가면(다시 그리기 · 이름 고치기), null = 새 가면(공방을 연 사람만, 8장까지). 둘 다 무료 */
  function openMaskBoard(id: string | null): void {
    const cur = id === null ? undefined : save.masks.find((m) => m.id === id);
    if (!save.owned.includes('mask') || (id === null ? save.masks.length >= MASK_MAX : !cur)) { playSfx('uiDeny'); return; }
    playSfx('uiBlip');
    const no = (mid: string): number => Number(mid.slice(1)) || 1;
    const nextNo = Math.max(0, ...save.masks.map((m) => no(m.id))) + 1;
    openMaskEditor(ensureOverlayLayer(), {
      name: cur?.name ?? '', fallback: `마스크 ${cur ? no(cur.id) : nextNo}`, art: cur?.art ?? '0'.repeat(256), isNew: !cur,
    }, {
      onSave: (name, art) => saveMask(cur?.id ?? null, name, art),
      onDelete: () => { if (cur) removeMask(cur.id); },
      onClose: () => playSfx('uiBack'),
    });
  }

  /** 도트판 저장 — 새 가면은 목록 끝에 붙고(그림이 있으면 바로 씌운다), 있던 가면은 이름 · 그림만 바꾼다 */
  function saveMask(id: string | null, name: string, art: string): void {
    const made = id === null ? createMask(save, name, art) : null;
    if (id !== null) updateMask(save, id, name, art);
    else if (!made) { playSfx('uiDeny'); return; }
    applyCosmetics(save.loadout, save.maskArt);
    saveSave(save);
    playSfx('stamp');
    overlay.toast(made && save.loadout.mask === 'mask' ? '저장하고 장착했어요.' : '저장했어요.');
    if (overlay.getScreen() !== 'shop') return;
    openShop();
    // 다시 그린 상점은 연 단추를 갈아 끼운다 — 초점을 그 가면의 「그리기」로(취소·뒤로는 도트판이 돌려준다)
    const at = made?.id ?? id;
    document.querySelector<HTMLElement>(`[data-equip-slot="mask-edit"][data-equip-id="${at}"]`)?.focus({ preventScroll: true });
  }

  /** 가면 지우기(도트판의 확인 팝업 뒤) — 쓰고 있었으면 벗는다 */
  function removeMask(id: string): void {
    const worn = wornMaskId(save) === id;
    if (!deleteMask(save, id)) return;
    applyCosmetics(save.loadout, save.maskArt);
    saveSave(save);
    playSfx('stamp');
    overlay.toast(worn ? '지우고 벗었어요.' : '지웠어요.');
    if (overlay.getScreen() === 'shop') openShop();
  }

  function startTokoton(): void {
    if (!save.act2Cleared && !debugOpen()) return;
    lastRun = startTokoton;
    runLabel = SCREENS.tokoton.name;
    runExempt = debugOpen();
    state = makeState({ seed: debugSeed(0x51ed270b), mode: 'tokoton' });
    applyRunMeta(state);
    butterChallenge = false;
    armCaps('tokoton');
    goPlay();
  }

  function startButterChallenge(round: number): void {
    const cap = debugOpen() ? 3 : save.butterTierReached;
    if (round < 1 || round > cap) return;
    lastRun = () => startButterChallenge(round);
    runLabel = SCREENS.butter.short;
    runExempt = debugOpen();
    state = makeState({ seed: debugSeed(0xabcdef) });
    applyRunMeta(state);
    state.wazaGauge = WAZA_GAUGE.MAX;
    enterBonus(state, round);
    butterChallenge = true;
    butterRoundNo = round;
    armCaps('butter');
    goPlay();
  }

  async function tryRevive(): Promise<void> {
    if (!state || scene !== 'gameover' || reviving) return;
    if (revivesUsed >= MAX_REVIVES_PER_RUN) { playSfx('uiDeny'); return; }
    reviving = true;
    // 웹(광고 미배선)은 광고 문구·대기 없이 그냥 일어난다 — 데모 정책 (08-30, P0-2)
    const usedAd = ads.ready();
    let ok: boolean;
    try {
      ok = usedAd ? await watchAd('revive') : true;
    } finally {
      reviving = false; // 광고 경로가 어떤 이유로든 throw해도 부활 버튼이 세션 내내 안 죽게
    }
    if (!ok) return;
    // 광고를 기다리는 사이 타이틀로 나갔으면 되살리지 않는다
    if (!state || scene !== 'gameover') return;
    revivesUsed += 1;
    grantMercyLife(state);
    const daily = ensureDaily(save.daily, Date.now(), ads.ready(), save.unlockedChapters);
    save.daily = daily;
    applyMissionEvent(daily, save.achieves, { kind: 'revive' });
    if (usedAd) applyMissionEvent(daily, save.achieves, { kind: 'adWatched' });
    grant(save, 0, 0);
    saveSave(save);
    playSfx('stamp');
    goPlay();
  }

  const reduceMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  function showOverlay(lines: readonly string[], ticks: number, after?: () => void, opts?: StoryOpts): void {
    overlayTicks = ticks;
    pendingAfterOverlay = after ?? null;
    // 와이프가 도는 동안은 연타가 이야기를 건너뛰지 않게 잠근다. 동작 줄이기 설정이면 와이프 없이 바로 컷.
    const wipeTicks = reduceMotion() ? 0 : opts?.wipeTicks ?? 0;
    storyLock = wipeTicks;
    scene = 'story';
    setChrome('story');
    overlay.showStory(lines, { ...opts, wipeTicks });
  }

  function skipStory(fromUser = false): void {
    if (scene !== 'story') return;
    if (fromUser && storyLock > 0) return;
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
      else if (butterChallenge && butterRoundNo > 0) {
        // 챌린지 종료 시점엔 state.bonus가 이미 null이다 — 회차는 시작 때 든 값을 쓴다
        save.butterBest[butterRoundNo] = Math.max(save.butterBest[butterRoundNo] ?? 0, sc);
      } else save.bestArcade = Math.max(save.bestArcade, sc);
      save.maxCombo = Math.max(save.maxCombo, state.peakCombo);
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
    patchSettings(save, p, settingsSinks);
    overlay.showSettings(save.settings, settingsFrom === 'pause');
    playSfx('uiBlip');
  }

  /** 설정 「버튼 배치」 — 저장하면 판 키에 바로 적용. 전부 기본 자리면 저장값을 지운다 */
  function openLayoutBoard(): void {
    playSfx('uiBlip');
    openLayoutEditor(ensureOverlayLayer(), { layout: save.settings.buttonLayout, leftHanded: save.settings.leftHanded }, {
      onSave: (layout) => {
        applySettingsPatch({ buttonLayout: layout ?? undefined });
        overlay.toast('저장했어요.');
      },
      onClose: () => playSfx('uiBack'),
    });
  }

  function openSettings(): void {
    settingsFrom = scene === 'pause' ? 'pause' : 'title';
    overlay.showSettings(save.settings, settingsFrom === 'pause');
  }

  /** 안드로이드 뒤로가기·Esc 공용. 창 → 하위 화면 → 타이틀 → 앱 내리기 순으로 한 칸씩 물러난다. */
  function handleBack(): void {
    if (closeMaskEditor()) return; // 도트판이 가장 위 — 저장 없이 닫는다
    if (closeLayoutEditor()) return; // 버튼 배치도 같다
    if (overlay.modalOpen()) { overlay.closeModal(); return; }
    const scr = overlay.getScreen();
    switch (scene) {
      case 'play': playSfx('uiBlip'); enterPause(); return;
      case 'pause':
        playSfx(scr === 'settings' ? 'uiBack' : 'uiBlip');
        if (scr === 'settings') backFromSettings(); else resumePause();
        return;
      case 'story': skipStory(true); return;
      case 'gameover':
        playSfx('uiBack');
        if (pendingStage) toStageList(); else goTitle();
        return;
      case 'stageend': playSfx('uiBack'); toStageList(); return;
      case 'opsend':
      case 'ending': playSfx('uiBack'); goTitle(); return;
      case 'title':
        if (scr === 'stages' && overlay.stagesBack()) { playSfx('uiBack'); return; } // 지시서 안에서는 한 칸씩
        if (scr !== 'title') { playSfx('uiBack'); overlay.showTitle(titleView()); return; }
        minimizeApp();
        return;
      default: minimizeApp();
    }
  }

  function enterTitleFromBoot(): void {
    playSfx('uiOk');
    scene = 'title';
    setChrome('title');
    overlay.showTitle(titleView());
    bgm('title');
    if (!save.howtoSeen) overlay.showHowto(true); // 첫 실행 — 조작 네 개부터 보여 준다
  }

  function backFromSettings(): void {
    if (settingsFrom === 'pause' && state) {
      overlay.showPause({ score: state.score, combo: state.combo });
    } else {
      overlay.showTitle(titleView());
    }
  }

  function confirmTitle(): void {
    if (menuIndex === 0) { playSfx('uiOk'); startArcade(); }
    else if (menuIndex === 1) {
      if (!save.act2Cleared && !debugOpen()) { playSfx('uiDeny'); return; }
      playSfx('uiOk');
      startTokoton();
    } else if (menuIndex === 2) {
      if (save.butterTierReached <= 0 && !debugOpen()) { playSfx('uiDeny'); return; }
      playSfx('uiOk');
      const tier = debugOpen() ? Math.max(3, save.butterTierReached) : save.butterTierReached;
      if (tier === 1) startButterChallenge(1);
      else overlay.showButterPick(tier);
    } else if (menuIndex === 3) { playSfx('uiOk'); overlay.showOps(opsOpts()); }
    else { playSfx('uiOk'); overlay.showStages(stageOpts()); }
  }

  const hud = mountHud(ensureHudLayer(), { onPause: () => { playSfx('uiBlip'); enterPause(); } });
  overlay = mountOverlay(ensureOverlayLayer(), {
    onBoot: enterTitleFromBoot,
    onArcade: () => { playSfx('uiOk'); startArcade(); },
    onTokoton: () => {
      if (!save.act2Cleared && !debugOpen()) { playSfx('uiDeny'); return; }
      playSfx('uiOk');
      startTokoton();
    },
    onButterRound: (round) => { playSfx('uiOk'); startButterChallenge(round); },
    onButterBack: () => { playSfx('uiBack'); overlay.showTitle(titleView()); },
    onOpenSettings: () => { playSfx('uiBlip'); openSettings(); },
    onStorySkip: () => skipStory(true),
    onPauseResume: () => { playSfx('uiBlip'); resumePause(); },
    onPauseQuit: () => {
      playSfx('uiBack');
      persist();
      if (stageRun) toStageList(); else goTitle();
    },
    onSettingsBack: () => { playSfx('uiBack'); backFromSettings(); },
    onSettingsPatch: applySettingsPatch,
    onLayoutEdit: openLayoutBoard,
    onGameOverContinue: afterLock(() => {
      if (!state || scene !== 'gameover') return;
      if (state.mode === 'act2' && state.checkpoint > 0) {
        playSfx('uiOk');
        continueFromCheckpoint(state);
        state.wazaGauge = 0;
        goPlay();
      }
    }),
    onGameOverRetry: afterLock(() => { playSfx('uiOk'); lastRun(); }),
    onGameOverTitle: afterLock(() => { playSfx('uiBack'); goTitle(); }),
    onGameOverRevive: afterLock(() => { void tryRevive(); }),
    onGameOverShop: afterLock(() => { playSfx('uiBlip'); goTitle(false); openShop(); }),
    onOpsEndList: afterLock(() => { playSfx('uiBlip'); goTitle(false); overlay.showOps(opsOpts()); }),
    onExam: doExam,
    onEndingDone: afterLock(() => { playSfx('uiBack'); goTitle(); }),
    onEndingRetry: afterLock(() => { playSfx('uiOk'); lastRun(); }),
    missionBadge: () => claimableCount(save.daily, save.achieves),
    onLogoTap: () => {
      if (!DEV_TOOLS) return;
      titleTaps += 1;
      if (titleTaps >= DEBUG_TITLE_TAPS) {
        debug = true;
        mountDebugMenu(() => state);
        overlay.showTitle(titleView());
      }
    },
    onOpsPick: (id) => { playSfx('uiOk'); startOp(id); },
    onOpenOps: () => { playSfx('uiBlip'); overlay.showOps(opsOpts()); },
    onOpenStages: () => { playSfx('uiOk'); overlay.showStages(stageOpts()); },
    onStageStart: (id, diff, fromBoss) => { playSfx('uiOk'); startStageRun(id, diff, fromBoss); },
    onStageRetry: afterLock(() => { playSfx('uiOk'); lastRun(); }),
    onStageNext: afterLock(() => { playSfx('uiBlip'); toStageList(stageEnd?.nextId ?? undefined); }),
    onStageList: afterLock(() => { playSfx('uiBack'); toStageList(); }),
    onOpenMissions: () => { playSfx('uiBlip'); openMissions(); },
    onOpenShop: () => { playSfx('uiBlip'); openShop(); },
    onOpenBook: () => { playSfx('uiBlip'); openBook(); },
    onMetaBack: () => { playSfx('uiBack'); overlay.showTitle(titleView()); },
    onClaimMission: (id, boost) => { void claimMission(id, boost); },
    onBuySku: (id) => { void buySku(id); },
    onAdOrbit: () => { void adOrbit(); },
    onUnlockOrbit: (id) => unlockOrbitItem(id),
    onUnlockDust: (id) => unlockDustItem(id),
    onEquip: (slot, id) => doEquip(slot, id),
    onMaskEdit: () => openMaskBoard(save.maskId || null), // 옛 길 — 상점은 이제 onEquip('mask-edit' · 'mask-new')로 보낸다
    onExchangeDust: doExchange,
    onHowtoDone: () => { save.howtoSeen = true; saveSave(save); },
    onResetData: resetData,
  });

  if (DEV_TOOLS && (debug || isDevUnlocked())) mountDebugMenu(() => state, debug); // 전해금 뒤 부팅은 접어서

  overlay.showBoot();
  setChrome('boot');

  // 백그라운드 = 판 멈춤 + 소리 끄기 + 저장. 웹 visibilitychange와 네이티브 appStateChange를 합쳐 듣는다.
  onLifecycle((fg) => {
    if (fg) { resumeIfNeeded(); return; }
    enterPause();
    suspendAudio();
    saveSave(save);
  });
  onBackButton(handleBack);

  // 웹에서 폰을 가로로 눕히면 「세로로 돌려 주세요」 판이 덮는다(style.css) — 그 뒤에서 판이 흘러가지 않게 멈춘다
  window.matchMedia?.('(orientation: landscape) and (max-height: 500px) and (pointer: coarse)')
    .addEventListener?.('change', (e) => { if (e.matches) enterPause(); });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      e.preventDefault();
      handleBack();
      return;
    }
    if (e.code === 'KeyP' && overlay.getScreen() !== 'settings') {
      if (scene === 'play') { e.preventDefault(); enterPause(); }
      else if (scene === 'pause') { e.preventDefault(); resumePause(); }
    }
  });

  function update(): void {
    const f = input.sample();
    duckBgm('menu', scene === 'pause' || overlay.getScreen() === 'settings');

    switch (scene) {
      case 'boot': {
        if (f.jump || f.guard || f.attack || f.special) enterTitleFromBoot();
        break;
      }
      case 'title': {
        bgm('title');
        touch?.setPinned(false);
        if (overlay.getScreen() !== 'title' || overlay.modalOpen()) break;
        // guard는 홀드 레벨(엣지 아님) — 그대로 쓰면 메뉴가 60Hz로 돈다 (08-30, P0-6)
        // prevTitleGuard는 update 말미에서 씬 무관하게 갱신 — boot를 가드로 넘긴 같은
        // 홀드가 메뉴를 밀거나, 가드 쥔 채 타이틀 복귀 시 스테일 엣지가 생기지 않게 (08-30 검증)
        const guardEdge = f.guard && !prevTitleGuard;
        if (DEV_TOOLS && f.special && f.guard) {
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
        if (storyLock > 0) storyLock -= 1;
        overlayTicks -= 1;
        if (overlayTicks <= 0) skipStory();
        else if (f.attack) skipStory(true);
        break;
      }
      case 'play': {
        const s = state!;
        if (teachFreeze > 0) {
          // 평생 첫 목숨 손실 — 판을 잠깐 세워 가드를 가르친다. 캔버스는 그 장면 그대로 (C1)
          teachFreeze -= 1;
          if (teachFreeze === 0) hud.teach(false);
          break;
        }
        if (teachPulse > 0) {
          teachPulse -= 1;
          if (f.guard || teachPulse === 0) { teachPulse = 0; touch?.setGuardHint(false); } // 눌러 봤으면 충분
        }
        const run = stageRun;
        if (debug && !run) tickDebug(s, f);
        const wasMode = s.mode;
        const wasPhase = s.act2Phase;
        advance(s, f);
        if (debug && !run) settleDebug(s);
        noteMissions(s);
        if (run) stageTick(s, run);
        consumeAudio(s);
        consumeEvents(s);
        handleTransitions(s, wasMode, wasPhase);
        s.events.length = 0;
        touch?.setPinned(s.player.pose === 'pinned');
        touch?.setSpecialReady(s.wazaGauge >= 100);
        touch?.setSpecialFill(s.wazaGauge);
        touch?.setGuardFill(s.guardGauge);
        // 장면을 바꾼 틱이면 곡은 전환이 정했다(엔딩·게임오버·작전 종료) — 덮어쓰지 않는다
        if (scene === 'play') bgm(bgmFor(s));
        break;
      }
      case 'pause':
        break;
      case 'ending': {
        bgm('ending');
        // 버튼으로만 나간다(키보드: 공격 = 한 판 더, 필살 = 타이틀). 직전 연타가 새어 나오지 않게 잠깐 잠근다.
        if (overlayTicks > 0) { overlayTicks -= 1; break; }
        if (f.attack) { playSfx('uiOk'); lastRun(); }
        else if (f.special) { playSfx('uiBack'); goTitle(); }
        break;
      }
      case 'opsend': {
        bgm(null);
        // 작전 결과 카드: 한 판 더(공격) · 타이틀(필살). 직전 연타가 새어 나오지 않게 잠깐 잠근다.
        if (overlayTicks > 0) { overlayTicks -= 1; break; }
        if (f.attack) { playSfx('uiOk'); lastRun(); }
        else if (f.special) { playSfx('uiBack'); goTitle(); }
        break;
      }
      case 'stageend': {
        bgm(null);
        // 보고서: 재제출(공격) · 목록(필살). 연습도 같은 자리. 직전 연타가 새어 나오지 않게 잠깐 잠근다.
        if (overlayTicks > 0) { overlayTicks -= 1; break; }
        if (f.attack) { playSfx('uiOk'); lastRun(); }
        else if (f.special) { playSfx('uiBack'); toStageList(); }
        break;
      }
      case 'gameover': {
        bgm(null);
        if (gameoverDelay > 0) {
          gameoverDelay -= 1;
          if (gameoverDelay === 0 && pendingOver) {
            overlay.showGameOver(pendingOver);
            pendingOver = null;
            overlayTicks = UI_FLOW.GAMEOVER_LOCK;
          } else if (gameoverDelay === 0 && pendingStage) {
            stageEnd = pendingStage;
            overlay.showStageEnd(pendingStage);
            pendingStage = null;
            scene = 'stageend';
            overlayTicks = UI_FLOW.GAMEOVER_LOCK;
          } else if (gameoverDelay === 0 && pendingOps) {
            overlay.showOpsEnd(pendingOps);
            pendingOps = null;
            scene = 'opsend';
            overlayTicks = UI_FLOW.GAMEOVER_LOCK;
          }
          break;
        }
        overlayTicks -= 1;
        if (overlayTicks > 0) break;
        if (f.attack) {
          if (revivesUsed < MAX_REVIVES_PER_RUN) {
            void tryRevive();
          } else {
            const s = state!;
            if (s.mode === 'act2' && s.checkpoint > 0) {
              playSfx('uiOk');
              continueFromCheckpoint(s);
              s.wazaGauge = 0;
              goPlay();
            } else {
              // 노랑(한 판 더)과 같은 동작 — 공격 키 = 지금 노랑인 버튼
              playSfx('uiOk');
              lastRun();
            }
          }
        } else if (f.special) {
          playSfx('uiBack');
          goTitle();
        }
        break;
      }
    }
    // 씬 무관 갱신 — boot·pause·gameover를 거쳐도 타이틀 가드 엣지가 스테일이 안 되게 (08-30 검증)
    prevTitleGuard = f.guard;
  }

  function bgmFor(s: GameState): BgmTrack {
    if (s.mode === 'stage') return s.lm || s.boss ? 'boss' : 'act1';
    if (s.mode === 'bonus') return 'butter';
    if (s.act2Phase === 'moon') return 'boss';
    if (s.act2Phase === 'bolt' || s.act2Phase === 'rock') return 'bolt';
    if (s.mode === 'act2') return 'act2a';
    return 'act1';
  }

  function noteKind(kind: string, extra?: { n?: number; combo?: number; zone?: string }): void {
    const daily = ensureDaily(save.daily, Date.now(), ads.ready(), save.unlockedChapters);
    save.daily = daily;
    applyMissionEvent(daily, save.achieves, { kind, ...extra });
  }

  function earnDust(n: number): void {
    grant(save, n, 0);
    runDust += n;
    dustDirty = true;
  }

  function noteMissions(s: GameState): void {
    const daily = ensureDaily(save.daily, Date.now(), ads.ready(), save.unlockedChapters);
    save.daily = daily;
    if (!save.achieves.length) save.achieves = initAchieveProgress();
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
      if (e.kind === 'stackDestroy') {
        earnDust(DUST_PER_BUILDING);
        runBuildings += 1;
        save.stats.buildings += 1; // 평생 누적 — 철거 자격 조건 (C4)
        if (opRun) opRun.buildings += 1;
      }
      if (e.kind === 'special') earnDust(DUST_PER_SPECIAL);
      if (e.kind === 'supply' && e.item === 'dust') earnDust(DUST_PER_SUPPLY);
      if (e.kind === 'hatBreak') runHatBreaks += 1;
      if (e.kind === 'lifeLost' && !s.over && !save.guardTaught) startTeach();
    }
    showCaps(runCaps.observe({ combo: s.combo, score: s.score }));
    // 판 도중 이탈(탭 종료·데스크톱 강제 종료)에도 재화가 안 날아가게 — 틱마다가 아니라
    // 지급 발생 프레임에만 저장 (08-30, P1-2 잔여)
    if (dustDirty) { saveSave(save); dustDirty = false; }
  }

  /** 판 도중 HUD 한 줄 — 작전이 아니면 '' */
  function opHud(s: GameState): string {
    if (stageRun && s.stage) return stageHudLine({ id: stageRun.id, ticks: s.stage.clearTick || s.tick });
    if (!opRun) return '';
    const remain = Math.max(0, Math.ceil((opLimitTicks(opRun.id) - s.tick) / 60));
    return SCREENS.ops.hud(opRun.id, remain, opNow(s));
  }

  /** 특별작전 판의 값 — 건물 작전은 부순 채 수, 버티기 작전은 버틴 초 */
  function opNow(s: GameState): number {
    return opRun ? opValue(opRun.id, { buildings: opRun.buildings, ticks: s.tick }) : 0;
  }

  function gameoverView(s: GameState, prevBest: number): GameOverView {
    const goal = nextDustGoal(save.owned, save.dust);
    // 무기를 다 사면 다음 목표는 마스크 — 이름표가 따로 있다
    const goalName = !goal ? undefined
      : goal.id === 'mask' ? MASK_COPY.name : WEAPON_COPY[goal.id as keyof typeof WEAPON_COPY]?.name;
    const best = !runExempt && s.score > 0 && s.score > prevBest;
    // 같은 세션 연속 사망 — 한 판에서 부활해 또 죽어도 한 번. 신기록이면 흐름이 끊긴 것으로 본다 (C10)
    if (!streakCounted) { deathStreak += 1; streakCounted = true; }
    const line = pickQuip({
      score: s.score - scoreBase,
      hatBroke: runHatBreaks > 0,
      // 구역을 주입받아 시작한 판(작전)은 높은 구역까지 「온」 게 아니다 — deep 규칙을 안 태운다
      chapter: scoreBase > 0 ? 0 : s.chapter,
      mode: s.mode,
      boss: s.act2Phase === 'moon',
      streak: deathStreak,
      seed: s.score + s.tick,
    }, lastQuip);
    lastQuip = line;
    if (best) deathStreak = 0;
    // 작전 판이면 다음 도장까지가 다음 목표다
    const opGoal = opRun ? SCREENS.ops.progress(opRun.id, opNow(s)) : '';
    return {
      score: s.score - scoreBase,
      combo: s.peakCombo,   // 현재 콤보는 죽는 히트가 이미 끊었다 — 결과화면은 이번 판 최고치를 쓴다
      buildings: runBuildings,
      dustGained: runDust,
      zone: hudModeLabel(s.mode, s.chapter, s.act2Phase),
      goal: opGoal || (goal && goalName ? SCREENS.gameover.nextGoal(goalName, goal.short) : ''),
      goalId: opGoal || !goalName ? undefined : goal?.id,
      theme: regionOf(s.chapter).theme,
      canContinue: s.mode === 'act2' && s.checkpoint > 0,
      canRevive: revivesUsed < MAX_REVIVES_PER_RUN,
      adRevive: ads.ready(),
      reviveLeft: MAX_REVIVES_PER_RUN - revivesUsed,
      reviveMax: MAX_REVIVES_PER_RUN,
      line,
      best,
      mode: runLabel,
      rank: licenseTitle(save.license),
    };
  }

  /**
   * 특별작전이 끝나는 순간인가 — 한도 시간에 닿았거나, 도장을 딴 채 죽었다.
   * 도장 없이 죽은 판은 보통 게임오버 카드로 간다(false). 맞으면 결과 카드를 예약하고 true.
   */
  function endOpIfDue(s: GameState): boolean {
    if (!opRun) return false;
    const timeUp = s.tick >= opLimitTicks(opRun.id);
    const dead = s.over === 'gameover';
    if (!timeUp && !dead) return false;
    const id = opRun.id;
    const value = opNow(s);
    const grade = opGrade(id, value);
    if (dead && !grade) return false;
    const prev = save.opsGrade[id];
    const best = betterGrade(prev, grade ?? undefined);
    const improved = !!grade && best !== prev;
    if (best) save.opsGrade[id] = best;
    persist();
    bgm(null);
    // 소리는 카드와 같이 — 죽은 판은 카드가 0.5초 뒤에 뜬다. 시간 종료 도장만 바로
    playSfx(grade ? 'stamp' : 'runEnd', { delay: grade && !dead ? 0 : AUDIO.RUN_END_DELAY });
    const seconds = OPERATION[id].metric === 'seconds';
    pendingOps = {
      name: runLabel,
      grade,
      improved,
      best: best ?? null,
      goal: SCREENS.ops.goal(id),
      // 점수엔 시작 진행 주입분이 들어 있어 작전 판에선 뜻이 없다 — 건물·초만
      rows: [
        seconds ? [SCREENS.ops.held, `${value}초`, true] : [SCREENS.ops.built, `${value}채`, true],
      ],
      progress: SCREENS.ops.progress(id, value),
      rank: licenseTitle(save.license),
    };
    scene = 'gameover'; // 카드가 뜰 때까지의 박자는 게임오버와 같다. 카드가 뜨면 opsend
    setChrome('gameover');
    gameoverDelay = dead ? UI_FLOW.GAMEOVER_CARD_DELAY : 6;
    overlayTicks = 0;
    return true;
  }

  function handleTransitions(s: GameState, wasMode: GameState['mode'], wasPhase: GameState['act2Phase']): void {
    const wipe = { wipeTicks: UI_FLOW.WIPE_TICKS };
    if (endStageIfDue(s)) return; // 지시서 판은 아케이드 엔딩 · 게임오버 카드 · 부활을 절대 안 탄다
    if (endOpIfDue(s)) return;
    // 버터바를 지나 새 구역으로 돌아왔다 — 구역 이름을 한 번 자막으로 (C11)
    if (wasMode === 'bonus' && s.mode === 'act1' && !butterChallenge && !opRun) {
      showCaps(runCaps.observe({ combo: s.combo, score: s.score, zone: s.chapter }));
    }
    if (wasMode !== 'act2' && s.mode === 'act2' && wasMode !== 'bonus') {
      persist();
      noteKind('act2Enter');
      bgm('act2a');
      showOverlay(STORY.intro, 60 * 6, undefined, { ...wipe, stamps: [SCREENS.stamps.act2] });
      return;
    }
    if (s.mode === 'bonus' && wasMode === 'tokoton') {
      bgm('butter');
      showOverlay([SCREENS.butter.banner], 60 * 2, undefined, wipe);
      return;
    }
    if (s.mode === 'bonus' && wasMode === 'act1') {
      const ch = s.chapter;
      save.unlockedChapters = Math.max(save.unlockedChapters, ch);
      save.butterTierReached = Math.max(save.butterTierReached, s.bonus?.round ?? 0);
      saveSave(save);
      bgm('butter');
      showOverlay(butterEnterLines(STORY.chapters[Math.min(ch, 3)]), 60 * 3, undefined, {
        ...wipe, stamps: [SCREENS.stamps.zone(Math.min(ch, 3) + 1)],
      });
      return;
    }
    if (butterChallenge && wasMode === 'bonus' && s.mode === 'act1') {
      const prevBest = save.butterBest[butterRoundNo] ?? 0;
      const newBest = !runExempt && s.score > 0 && s.score > prevBest;
      const perfect = s.events.some((e) => e.kind === 'bonusPerfect');
      persist();
      showOverlay(butterChallengeEnd(s.score), 60 * 3, () => {
        goTitle();
      }, {
        ...wipe,
        stamps: [...(newBest ? [SCREENS.stamps.best] : []), ...(perfect ? [SCREENS.stamps.perfect] : [])],
      });
      return;
    }
    if (s.mode === 'act2' && wasPhase && s.act2Phase && wasPhase !== s.act2Phase && !s.over) {
      bgm(bgmFor(s)); // 새 국면 곡은 배너와 같이 시작
      showOverlay(phaseBanner(s.act2Phase), 60 * 3, undefined, wipe);
      return;
    }
    if (s.over === 'cleared') {
      const best = !runExempt && s.score > 0 && s.score > save.bestArcade;
      save.act2Cleared = true;
      deathStreak = 0; // 클리어하면 연속 사망은 끝
      noteKind('moonClear');
      persist();
      bgm('ending');
      const lines = s.fullCombo ? [...STORY.ending, '', ENDING_FULL_COMBO] : STORY.ending;
      showOverlay(lines, 60 * 12, () => {
        scene = 'ending';
        setChrome('ending');
        overlay.showEnding({
          score: s.score,
          maxCombo: save.maxCombo,
          fullCombo: s.fullCombo,
          best,
        });
        overlayTicks = UI_FLOW.GAMEOVER_LOCK;
      }, { wipeTicks: UI_FLOW.WIPE_BOSS_TICKS });
      return;
    }
    if (s.over === 'gameover') {
      const prevBest = s.mode === 'tokoton' ? save.bestTokoton
        : butterChallenge && butterRoundNo > 0 ? (save.butterBest[butterRoundNo] ?? 0)
          : save.bestArcade;
      persist();
      bgm(null);
      playSfx('runEnd', { delay: AUDIO.RUN_END_DELAY }); // 목숨 소리(lifeLost)가 끝난 뒤 판 종료 신호
      scene = 'gameover';
      setChrome('gameover');
      // 카드는 잠깐 뒤에 — 그동안 캔버스가 마지막 장면을 보여 준다
      pendingOver = gameoverView(s, prevBest);
      gameoverDelay = UI_FLOW.GAMEOVER_CARD_DELAY;
      overlayTicks = 0;
      return;
    }
  }

  function draw(): void {
    ctx.fillStyle = PALETTE.BG;
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);

    if (state && (scene === 'play' || scene === 'pause' || scene === 'story' || scene === 'gameover' || scene === 'opsend' || scene === 'stageend' || scene === 'ending')) {
      drawGame(ctx, state);
      if (scene === 'play' || scene === 'pause') hud.sync(state, opHud(state));
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
