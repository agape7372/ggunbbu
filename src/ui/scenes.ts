// 씬 머신: Boot→Title → Act1(+BonusStage 자동) → StoryIntro → Act2 → Ending / Tokoton /
// ButterChallenge / GameOver(2막 이어하기) / Pause. 디버그 오버레이 포함.
// core는 씬을 모른다 — 씬이 advance 호출 여부·상태 전이를 관장한다.
// 타이틀·HUD·일시정지·결과는 DOM(overlay/hud). 캔버스는 필드만.

import type { GameState, GimmickId, StageDiff } from '../core/types';
import { makeState, advance, applyStartKit, enterBonus, grantMercyLife } from '../core/sim';
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
import { OPERATIONS, WEAPON_COPY, regionOf } from '../content/world';
import { MASK_MAX, createMask, deleteMask, ownedMasks, updateMask, wearMask, wornMaskId } from '../meta/mask';
import { closeMaskEditor, openMaskEditor } from './maskEditor';
import { closeLayoutEditor, openLayoutEditor } from './layoutEditor';
import { mountHud, ensureHudLayer } from './hud';
import { createRunCaps, type RunCap, type RunCaps } from './runCaps';
import { bookCount, bookGroups, type RecordView } from './bookView';
import { fmt } from './ink';
import type { KitView } from './kitView';
import { achieveDetail, attendBoard, type SeasonView, type TakeKind } from './missionView';
import { goods, skuGoods } from './goodsArt';
import { BUY_NOTES, armFuses, offerHtml, partsHtml, type OfferRow, type PackView } from './packView';
import { closeReward, setRewardLook, showReward, type RewardShow } from './rewardFx';
import type { ShopTab } from './shopView';
import {
  mountOverlay, ensureOverlayLayer, titleViewFromSave, type GameOverView, type OpsEndView, type OverlayApi, type StoryOpts, type TitleView,
} from './overlay';
import { applySettingsPatch as patchSettings, applySettingsToRuntime, type SettingsSinks } from './settings';
import {
  grant, grantOrbit, MAX_REVIVES_PER_RUN, ORBIT_PER_AD, spendOrbit, orbitCost, exchangeDust, DUST_EXCHANGE,
  dustCost, spendDust, DUST_PER_BUILDING, DUST_PER_SPECIAL, DUST_PER_SUPPLY, MASK_DUST_COST,
  nextDustGoal, adOrbitLeft, noteAdOrbit, licenseTitle, takeExam,
} from '../meta/economy';
import { equip } from '../meta/loadout';
import {
  applyMissionEvent, ensureDaily, initAchieveProgress, ACHIEVES, DAILY_POOL, claim, defById, claimableCount, kstDateKey,
} from '../meta/missions';
import { betterGrade, isOpId, opGrade, opLimitTicks, opValue, type OpId } from '../meta/ops';
import { buyKit, clampPick, isBare, kitDef, kitSheetUseful, pickCount, spendKit, type KitId, type KitPick } from '../meta/kit';
import {
  FIRST_GIFT, SALARY_DAYS, SKUS, dustOf, effPct, grantSku, orbitOf, skuById, soldOut, takeRegular, type SkuId,
} from '../meta/catalog';
import { OFFER_RUNS, armOffers, leftText, liveOffers, noteOfferBought, offerClock, offerToPop, type LiveOffer } from '../meta/offers';
import {
  ATTEND, FREE_COFFEE, ROOKIE, ROOKIE_TITLE, TITLES, TITLE_TOTAL, attendReady, claimAttend, claimSalary, claimWage, coffeeReady, demoSite, factsOf, giveReward,
  readyAchieves, rewardText, rookieReady, salaryAdFree, salaryReady, syncAchieves, titlesOf, wageReady, type Reward,
} from '../meta/progress';
import {
  ATTEND_PTS, LATE_DAYS, WAGE_PTS, addReward, addSeasonPts, claimSeason, paidTotal, rollSeason, rungsOpen, rungsReach, seasonDaysLeft, seasonPtsOf, seasonReady, seasonTheme,
} from '../meta/season';
import { createAdsPort, type AdKind } from '../platform/ads';
import { minimizeApp, onBackButton, onLifecycle } from '../platform/native';
import { createIapPort, type Paid } from '../platform/iap';
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
type TitleNote = TitleView['note'];

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
  // 시작 장비 — 시트에서 고른 것(null = 아직 안 물어봄) · 이번 판에 들고 간 것
  let kitPick: KitPick | null = null;
  let runKit: KitPick = {};
  // 판 도중 실적 계산용 — 도감 수는 판 시작 때 한 번, 시작 때 이미 받을 수 있던 실적은 결과 카드에서 뺀다
  let runBook = 0;
  let runReady0: ReadonlySet<string> = new Set();
  let statTick = false;
  let rookieAsked = false; // 첫 출근 보상 창은 세션에 한 번 — 닫으면 미션 탭에서 받는다
  let attendAsked = ''; // 출근 창을 띄운 날 — 닫으면 미션 탭에서 받는다
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
  setRewardLook(() => save.loadout);
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
    save.daily = ensureDaily(save.daily, Date.now(), ads.ready(), save.unlockedChapters); // 「오늘 N/4」가 날짜 넘김에도 맞게
    const f = facts();
    syncAchieves(save.achieves, f);
    return { ...titleViewFromSave(save, menuIndex, debugOpen()), note: homeNote(f) };
  }

  const masksShown = () => (save.owned.includes('mask') ? ownedMasks(save) : undefined);
  const bookHave = (): number => bookCount(bookGroups(ownedSet(), masksShown())).have;
  const facts = () => factsOf(save, bookHave());
  /** 광고가 꺼져 있나 — 광고 없는 현장(영구) · 월급 봉투(30일) */
  const adFree = (): boolean => save.noAds || salaryAdFree(save.salary, kstDateKey(Date.now()));
  /** 광고 보상 경로가 있나 — 광고가 꺼진 사람은 광고 없이 받는다 */
  const adPath = (): boolean => ads.ready() || adFree();
  /** 시간제한 특가 — 결제 경로가 없으면 없는 것으로 친다(타이머도 안 건다) */
  const offersNow = (now: number) => (iap.available() ? liveOffers(save.offers, save.bought, now).filter((o) => iap.sellable(o.sku)) : []);
  /** 특가 남은 시간 — 되돌린 시계가 아니라 본 가장 늦은 시각 기준 */
  const offerLeft = (until: number, now: number): string => leftText(until, offerClock(save.offers, now));

  function homeNote(f: ReturnType<typeof facts>): TitleNote {
    const step = ROOKIE[save.rookie];
    if (step && rookieReady(save.rookie, f)) return { text: `신입 과제 받기 · ${step.title}`, to: 'missions' };
    const now = Date.now();
    const o = save.stats.runs >= OFFER_RUNS ? offersNow(now)[0] : undefined;
    if (o) return { text: `${o.title} · ${offerLeft(o.until, now)}`, to: 'shop' };
    return step ? { text: `신입 과제 ${save.rookie + 1}/${ROOKIE.length} · ${step.title}`, to: 'missions' } : null;
  }

  /** 홈에 돌아올 때 한 번 — 첫 출근 보상이 먼저, 그다음 오늘의 특가 창(하루 한 번, 닫으면 끝) */
  function homeNudge(): void {
    if (!save.howtoSeen || overlay.modalOpen()) return;
    const now = Date.now();
    const key = kstDateKey(now);
    if (iap.available()) {
      const reachedAct2 = (save.achieves.find((p) => p.id === 'first_act2')?.count ?? 0) >= 1;
      armOffers(save.offers, { runs: save.stats.runs, reachedAct2 }, now);
    }
    // 출근은 들어오자마자 — 닫아도 그날은 미션 탭에 남고 다시 뜨지 않는다
    if (attendAsked !== key && attendReady(save.attend, key)) {
      attendAsked = key;
      const day = save.attend.step % ATTEND.length;
      overlay.ask({
        tone: 'navy', art: goods('calendar'), meta: '출근부', title: `${day + 1}일째 출근`, html: attendBoard(save.attend), yes: '받기',
      }, () => { void takeDaily('attend').then(homeNudge); });
      return;
    }
    if (save.rookie === 0 && !rookieAsked && rookieReady(0, facts())) {
      rookieAsked = true;
      void takeDaily('rookie');
      return;
    }
    const o = iap.available() ? offerToPop(save.offers, save.bought, now, key, save.stats.runs) : null;
    if (!o || !iap.sellable(o.sku)) return;
    save.offers.popDay = key;
    saveSave(save);
    overlay.ask({
      tone: 'seal', art: goods(skuGoods(o.sku)), meta: '시간제한', title: o.title,
      html: offerHtml(offerRow(o), save.bought), no: '오늘 안 보기', yes: priceOf(o.sku), pay: true,
    }, () => askBuy(o.sku));
    armFuses(document.body);
  }

  function offerRow(o: LiveOffer): OfferRow {
    return {
      sku: o.sku,
      of: o.regular,
      title: o.title,
      price: priceOf(o.sku),
      regular: priceOf(o.regular),
      until: o.until,
      span: o.span,
      eff: effPct(skuById(o.sku)!),
    };
  }

  /** 앱 안 가격은 Play 문자열이 먼저다. 못 받았을 때만 표의 값 */
  const priceOf = (id: SkuId): string => iap.price(id) ?? `₩${fmt(skuById(id)?.krw ?? 0)}`;

  function askKit(again: () => void, arcade: boolean): boolean {
    if (kitPick) return false;
    if (save.stats.runs === 0 || !kitSheetUseful(save.items, save.orbit)) {
      kitPick = {};
      return false;
    }
    const view = (): KitView => ({ items: { ...save.items }, orbit: save.orbit, arcade });
    overlay.showKit(view(), (pick) => { kitPick = pick; again(); }, (id) => (doKitBuy(id) ? view() : null));
    return true;
  }

  function doKitBuy(id: KitId): boolean {
    if (!buyKit(save, id)) { playSfx('uiDeny'); return false; }
    saveSave(save);
    playSfx('coin');
    return true;
  }

  function applyRunMeta(s: GameState, gimmick: GimmickId = 'none'): void {
    s.waza = save.loadout.waza;
    s.weapon = save.loadout.weapon;
    s.gimmick = gimmick;
    const pick = clampPick(kitPick ?? {}, save.items);
    kitPick = null;
    spendKit(save.items, pick);
    applyStartKit(s, pick.life ?? 0, pick.waza ?? 0);
    runKit = pick;
    if (pickCount(pick) > 0) save.stats.kitRuns += 1;
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
    runBook = bookHave();
    syncAchieves(save.achieves, factsOf(save, runBook));
    runReady0 = new Set(readyAchieves(save.achieves).map((d) => d.id));
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
    if (show) {
      overlay.showTitle(titleView());
      homeNudge();
    }
    bgm('title');
  }

  function startArcade(): void {
    if (askKit(startArcade, true)) return;
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
    const key = daily.dateKey;
    rollMonth(key);
    const f = facts();
    syncAchieves(save.achieves, f);
    overlay.showMissions({
      daily,
      achieves: save.achieves,
      adBoost: adPath(),
      adFree: adFree(),
      attend: save.attend,
      attendOn: attendReady(save.attend, key),
      wageStep: wageReady(save.wage, daily),
      wageGot: save.wage.key === key ? save.wage.got : 0,
      salary: save.salary,
      salaryOn: salaryReady(save.salary, kstDateKey(Date.now())),
      rookie: save.rookie,
      rookieOn: rookieReady(save.rookie, f),
      season: seasonView(key),
      site: demoSite(key),
      dust: save.dust,
      orbit: save.orbit,
    });
  }

  /** 달이 바뀌었으면 새 판. 지난달 열린 칸은 저절로 받는다 */
  function rollMonth(key: string): void {
    const r = rollSeason(save.season, key);
    if (!r) return;
    giveReward(save, r);
    saveSave(save);
    void showReward({ tier: 'm', title: '지난달 현장', sub: '열린 칸을 챙겨 뒀어요', reward: r });
  }

  /** 오늘 사면 달 끝까지 받을 수 있는 특근 몫 — 못 갈 칸과 이미 가진 꾸미기는 약속하지 않는다 */
  function passGoods(key: string): Reward {
    const r = paidTotal(seasonTheme(save.season.key), rungsReach(save.season, key));
    return { ...r, owns: r.owns?.filter((id) => !save.owned.includes(id)) };
  }

  function seasonView(key: string): SeasonView {
    const left = seasonDaysLeft(key);
    return {
      ...save.season,
      theme: seasonTheme(save.season.key),
      daysLeft: left,
      late: left <= LATE_DAYS,
      price: !soldOut(save, 'season_pass', key) && iap.available() && iap.sellable('season_pass') ? priceOf('season_pass') : null,
      owns: passGoods(key).owns ?? [],
      eff: effPct(skuById('season_pass')!, rungsReach(save.season, key)),
    };
  }

  /** 오늘 작업 하나 받기 — 난이도만큼 현장 점수가 쌓인다 */
  const dailyPts = (id: string, key: string): void => {
    addSeasonPts(save.season, seasonPtsOf(DAILY_POOL.find((d) => d.id === id)?.tier ?? 0), key);
  };

  /** 받을 수 있는 오늘 작업 + 일당 전부 */
  function takeAllDaily(daily: NonNullable<SaveData['daily']>): Reward | null {
    let r: Reward | null = null;
    for (const p of daily.items) {
      const def = DAILY_POOL.find((d) => d.id === p.id);
      if (!def) continue;
      const was = p.claimed;
      const got = claim(p, def, false);
      if (p.claimed === was) continue;
      r = addReward(r, { dust: got.dust, orbit: got.orbit, items: def.rewardItems, owns: def.owns });
      dailyPts(p.id, daily.dateKey);
    }
    for (let step = wageReady(save.wage, daily); step >= 0; step = wageReady(save.wage, daily)) {
      r = addReward(r, claimWage(save.wage, daily)!);
      addSeasonPts(save.season, WAGE_PTS[step], daily.dateKey);
    }
    return r;
  }

  /** 다 채운 실적 전부. 칭호가 있으면 이름을 돌려준다 */
  function takeAllAchieves(): { r: Reward | null; title?: string } {
    let r: Reward | null = null;
    let title: string | undefined;
    for (const def of readyAchieves(save.achieves)) {
      const p = save.achieves.find((x) => x.id === def.id)!;
      const got = claim(p, def, false);
      r = addReward(r, { dust: got.dust, orbit: got.orbit, items: def.rewardItems, owns: def.owns });
      title = TITLES.find((t) => t.id === def.id)?.name ?? title;
    }
    return { r, title };
  }

  /** 미션 탭의 받기 — 출근부 · 일당 · 월급 · 신입 과제 · 이달의 현장 · 모두 받기 */
  async function takeDaily(kind: TakeKind): Promise<void> {
    if (kind === 'buyPass') { askBuy('season_pass'); return; }
    if (kind === 'goRun') { playSfx('uiOk'); startArcade(); return; }
    if (kind === 'goStage') { playSfx('uiOk'); overlay.showStages(stageOpts()); return; }
    if (kind === 'goAd') { void adOrbit(); return; }
    const daily = ensureDaily(save.daily, Date.now(), ads.ready(), save.unlockedChapters);
    save.daily = daily;
    const key = daily.dateKey;
    rollMonth(key);
    let r: Reward | null = null;
    let show: Omit<RewardShow, 'reward'> = { tier: 'm', title: '받았어요' };
    if (kind === 'attend') {
      const day = save.attend.step % ATTEND.length;
      r = claimAttend(save.attend, key);
      if (r) addSeasonPts(save.season, ATTEND_PTS, key);
      show = day === ATTEND.length - 1
        ? { tier: 'l', tone: 'navy', title: '일곱째 출근', seal: '개근' }
        : { tier: 'm', tone: 'navy', title: `${day + 1}일째 출근` };
    } else if (kind === 'wage') {
      const step = wageReady(save.wage, daily);
      r = claimWage(save.wage, daily);
      if (r) addSeasonPts(save.season, WAGE_PTS[step], key);
      show = step === WAGE_PTS.length - 1
        ? { tier: 'l', title: `${demoSite(key).name} 완파`, seal: '완파' }
        : { tier: 'm', title: '오늘 일당' };
    } else if (kind === 'salary') {
      r = claimSalary(save.salary, kstDateKey(Date.now())); // 돈 낸 월급은 앞선 시계의 날짜에 묶지 않는다
      show = { tier: 'm', title: '월급 봉투' };
    } else if (kind === 'season') {
      r = claimSeason(save.season);
      show = { tier: r?.owns || r?.masks ? 'l' : 'm', title: '이달의 현장', seal: '특근' };
    } else if (kind === 'allDaily') {
      const had = save.wage.key === key ? save.wage.got : 0;
      r = takeAllDaily(daily);
      show = had < WAGE_PTS.length && save.wage.got === WAGE_PTS.length
        ? { tier: 'l', title: `${demoSite(key).name} 완파`, seal: '완파' }
        : { tier: 'm', title: '오늘 작업' };
    } else if (kind === 'allAchieves') {
      const all = takeAllAchieves();
      r = all.r;
      show = all.title ? { tier: 'l', title: `칭호 「${all.title}」`, seal: '칭호' } : { tier: 'm', title: '실적' };
    } else if (rookieReady(save.rookie, facts())) {
      const first = save.rookie === 0;
      const title = ROOKIE[save.rookie].title;
      r = ROOKIE[save.rookie].reward;
      save.rookie += 1;
      if (first) show = { tier: 'l', title: '첫 판 수고했어요', sub: '다음 판을 시작할 때 골라서 들고 가요.', seal: '입사' };
      else if (save.rookie >= ROOKIE.length) show = { tier: 'l', title: `칭호 「${ROOKIE_TITLE}」`, seal: '졸업' };
      else show = { tier: 'm', title };
    }
    if (!r) { playSfx('uiDeny'); return; }
    giveReward(save, r);
    saveSave(save);
    if (overlay.getScreen() === 'missions') openMissions();
    else if (overlay.getScreen() === 'title') overlay.showTitle(titleView());
    await showReward({ ...show, reward: r });
  }

  /** 실적 낙관 칸 — 지금 단계 · 보상. 채웠으면 그 자리에서 받는다 */
  function openAchieve(line: string): void {
    const d = achieveDetail(line, save.achieves);
    if (!d) return;
    playSfx('uiBlip');
    overlay.ask({ tone: 'green', meta: `실적 · ${line}`, title: d.title, html: d.html, no: d.claimId ? '닫기' : undefined, yes: d.claimId ? '받기' : '닫기' }, () => {
      if (d.claimId) void claimMission(d.claimId, false);
    });
  }

  function takeCoffee(): void {
    const key = kstDateKey(Date.now());
    if (!coffeeReady(save.coffee, key)) { playSfx('uiDeny'); return; }
    save.coffee = key;
    giveReward(save, FREE_COFFEE);
    saveSave(save);
    openShop();
    void showReward({ tier: 'm', title: '믹스커피 한 잔', reward: FREE_COFFEE });
  }

  function takeRegularStep(): void {
    const r = takeRegular(save.regular);
    if (!r) { playSfx('uiDeny'); return; }
    giveReward(save, r);
    saveSave(save);
    openShop();
    void showReward({ tier: r.owns || r.masks ? 'l' : 'm', title: '단골 도장', seal: '단골', reward: r });
  }

  function openBook(): void {
    // 내 가면은 가면마다 칸 하나(이름은 사용자가 지은 글자)
    overlay.showBook({ loadout: save.loadout, maskArt: save.maskArt }, ownedSet(), masksShown(), recordView());
  }

  function recordView(): RecordView {
    const s = save.stats;
    return {
      titles: titlesOf(save.achieves, save.rookie),
      titleTotal: TITLE_TOTAL,
      rank: licenseTitle(save.license),
      big: [
        ['벤 건물', fmt(s.buildings)],
        ['아케이드 최고', fmt(save.bestArcade)],
        ['최고 콤보', fmt(save.maxCombo)],
      ],
      rows: [
        ['철거 자격', licenseTitle(save.license)],
        ['맨손 최고', fmt(save.bestBare)],
        ['야근 최고', fmt(save.bestTokoton)],
        ['쓴 필살', fmt(s.specials)],
        ['쓰러뜨린 명물', fmt(s.bosses)],
        ['끝낸 지시서', fmt(Object.values(save.stages).filter((r) => r.lamp > 0).length)],
        ['출근한 판', fmt(s.runs)],
      ],
    };
  }

  function packView(): PackView {
    const now = Date.now();
    const key = kstDateKey(now);
    rollMonth(key);
    const reach = rungsReach(save.season, key);
    return {
      iap: iap.available(),
      bought: save.bought,
      offers: offersNow(now).map(offerRow),
      rows: SKUS.filter((s) => !s.sale && !soldOut(save, s.id, key) && iap.sellable(s.id)).map((s) => ({
        sku: s.id, title: s.title, price: priceOf(s.id), eff: effPct(s, reach),
      })),
      items: save.items,
      orbit: save.orbit,
      firstGift: !save.firstGift,
      coffeeOn: coffeeReady(save.coffee, key),
      regular: save.regular,
      passGoods: passGoods(key),
    };
  }

  function openShop(tab?: ShopTab): void {
    overlay.showShop({
      dust: save.dust, orbit: save.orbit, license: save.license, buildings: save.stats.buildings, loadout: save.loadout,
      maskArt: save.maskArt, masks: save.masks, maskId: save.maskId, blanks: save.blanks,
    }, ownedSet(), {
      ad: adPath(),
      adLeft: adOrbitLeft(save.adDay, kstDateKey(Date.now())),
      adFree: adFree(),
    }, packView(), tab);
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
    if (askKit(() => startOp(id), false)) return;
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
    // 정규 · 외주 · 보스 연습은 맨몸 — 기록이 장비로 흔들리지 않게 시트를 안 띄운다
    if (diff === 0 && !fromBoss && askKit(() => startStageRun(id, diff, fromBoss), false)) return;
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
      if (result.cleared) noteKind('stageClear');
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

  async function claimMission(id: string, boost: boolean): Promise<void> {
    const def = defById(id) ?? DAILY_POOL.find((d) => d.id === id) ?? ACHIEVES.find((d) => d.id === id);
    if (!def) return;
    const daily = ensureDaily(save.daily, Date.now(), ads.ready(), save.unlockedChapters);
    save.daily = daily;
    if (!save.achieves.length) save.achieves = initAchieveProgress();
    const prog = daily.items.find((p) => p.id === id) ?? save.achieves.find((p) => p.id === id);
    if (!prog) return;
    if (boost) {
      if (!adPath()) { playSfx('uiDeny'); return; } // 웹: 광고 없음 — 버튼도 안 그리지만 백스톱 (08-30)
      if (!(await watchAd('missionBoost'))) return;
      applyMissionEvent(daily, save.achieves, { kind: 'adWatched' });
    }
    const was = prog.claimed;
    const got = claim(prog, def, boost);
    if (prog.claimed === was) { playSfx('uiDeny'); return; }
    grant(save, got.dust, got.orbit);
    giveReward(save, { items: def.rewardItems, owns: def.owns });
    const isDaily = daily.items.includes(prog);
    if (isDaily) dailyPts(id, daily.dateKey);
    saveSave(save);
    // 광고를 기다리는 동안 다른 탭으로 갔으면 끌고 오지 않는다
    if (overlay.getScreen() === 'missions') openMissions();
    if (isDaily) { playSfx('coin'); return; } // 층이 무너지고 칸이 지갑으로 난다(missionView)
    const title = TITLES.find((t) => t.id === id)?.name;
    void showReward({
      tier: title ? 'l' : 'm', title: title ? `칭호 「${title}」` : def.title, seal: title ? '칭호' : undefined,
      reward: { ...got, items: def.rewardItems, owns: def.owns },
    });
  }

  /** 보상형 광고 1편. 불러오는 중·실패·건너뜀을 토스트로 말한다. 진행 중이면 두 번째 탭은 무시. */
  async function watchAd(kind: AdKind): Promise<boolean> {
    if (adFree()) return true; // 광고가 꺼져 있으면 보상만 받는다
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
    // 한 번만 사는 상품은 스토어에 남아 있다 — 지운 기록에 다시 얹는다(신입 특가와 꾸러미 이중 결제 방지)
    void iap.restore(paid).then((n) => {
      if (!n) return;
      overlay.toast(`산 상품 ${n}건을 다시 받았어요.`);
      if (overlay.getScreen() === 'title' && !overlay.modalOpen()) overlay.showTitle(titleView());
    });
  }

  /** 지급 + 저장. 소비 · 승인은 이게 끝난 뒤에 iap가 한다. 처음 받은 구매면 true */
  function paid(p: Paid): boolean {
    rollMonth(kstDateKey(Date.now())); // 다음 달에 늦게 복구된 특근 수당은 그 달에 붙는다
    const fresh = grantSku(save, p.id, p.token, kstDateKey(Date.now()));
    if (fresh) noteOfferBought(save.offers, p.id, Date.now());
    saveSave(save);
    return fresh;
  }

  /** 결제 전 구성 · 가격 · 청약철회 안내를 한 번 보여 준다. 못 사는 상품은 결제 창까지 안 간다(지급 0 실과금 방지) */
  function askBuy(id: string): void {
    const sku = skuById(id);
    const closed = sku?.sale && !offersNow(Date.now()).some((o) => o.sku === sku.id);
    const key = kstDateKey(Date.now());
    if (!sku || soldOut(save, sku.id, key) || closed || !iap.sellable(sku.id)) { playSfx('uiDeny'); openShop(); return; }
    const fine = sku.pass ? [
      `현장 점수로 칸을 열어요. 지금 ${rungsOpen(save.season.pts)}칸 · 달 끝까지 매일 다 하면 ${rungsReach(save.season, key)}칸이에요.`,
      `${seasonDaysLeft(key)}일 남았어요. 달이 바뀌면 열린 칸은 저절로 받고 못 연 칸은 없어져요. 꾸미기는 석 달 뒤 다시 돌아와요.`,
    ] : sku.salary ? [
      '봉투는 하루 한 번 받아요. 빠진 날은 없어지지 않고 뒤로 밀려요.',
      `광고 없음은 오늘부터 ${SALARY_DAYS}일이에요. 더 사면 뒤에 이어 붙어요.`,
    ] : [];
    overlay.ask({
      tone: 'gold', art: goods(skuGoods(sku.id)), meta: '구매 확인', title: sku.title, html: partsHtml(sku, save.bought, passGoods(key)),
      fine: [...fine, ...BUY_NOTES],
      no: '그만두기', yes: `${priceOf(sku.id)} 결제`, pay: true,
    }, () => { void buySku(sku.id); });
  }

  async function buySku(id: SkuId): Promise<void> {
    const sku = skuById(id)!;
    const first = !save.firstGift;
    const orbit = orbitOf(sku, save.bought);
    const dust = dustOf(sku, save.bought);
    let got = 0;
    let fresh = false; // 이미 보유 오류로 남은 구매만 정리됐으면 이번 결제도 지급도 없다
    const r = await iap.purchase(id, (p) => {
      if (!paid(p)) return;
      got += 1;
      fresh ||= p.id === id;
    });
    if (r === 'cancel') return;
    if (r === 'pending') { overlay.toast('결제가 끝나면 받아요.'); return; }
    if (r === 'fail') {
      playSfx('uiDeny');
      overlay.toast('결제를 못 했어요. 다시 눌러 주세요.');
      return;
    }
    if (overlay.getScreen() === 'shop') openShop();
    else if (overlay.getScreen() === 'missions') openMissions();
    if (!fresh) {
      overlay.toast(got > 0 ? `못 받은 결제 ${got}건을 받았어요.` : '남은 결제를 정리했어요. 다시 눌러 주세요.');
      return;
    }
    const owns = (sku.owns?.length ?? 0) > 3 ? [] : [...(sku.owns ?? [])]; // 철거왕 세트의 긴 목록은 칸 하나로 못 보인다
    let sub: string | undefined;
    if (first) sub = `첫 결제 선물 · 궤도조각 ${FIRST_GIFT.orbit} · ${rewardText({ owns: FIRST_GIFT.owns })}`;
    else if (sku.pass) sub = '이번 달 특근 줄이 열렸어요';
    else if (sku.salary) sub = `광고 없음 ${SALARY_DAYS}일`;
    void showReward({
      tier: 'l', tone: 'gold', seal: '감사', title: sku.title, sub,
      reward: { orbit: orbit + (first ? FIRST_GIFT.orbit : 0), dust, items: sku.items, masks: sku.masks, owns: first ? [...owns, ...FIRST_GIFT.owns] : owns },
    });
  }

  async function restoreBuys(): Promise<void> {
    let got = 0;
    const n = await iap.restore((p) => { if (paid(p)) got += 1; });
    if (n === null) playSfx('uiDeny');
    overlay.toast(n === null ? '복원을 못 했어요. 잠시 뒤 다시 눌러 주세요.' : got > 0 ? `${got}건을 되찾았어요.` : '되찾을 구매가 없어요.');
    if (overlay.getScreen() === 'shop') openShop();
  }

  function shopKitBuy(id: string): void {
    if (kitDef(id) && doKitBuy(id as KitId)) openShop();
  }

  async function adOrbit(): Promise<void> {
    const key = kstDateKey(Date.now());
    if (adOrbitLeft(save.adDay, key) <= 0) {
      playSfx('uiDeny');
      overlay.toast('오늘 광고 보상은 다 받았어요.');
      return;
    }
    if (!(await watchAd('orbitPack'))) return;
    noteAdOrbit(save.adDay, key);
    const daily = ensureDaily(save.daily, Date.now(), ads.ready(), save.unlockedChapters);
    save.daily = daily;
    applyMissionEvent(daily, save.achieves, { kind: 'adWatched' });
    grantOrbit(save, ORBIT_PER_AD);
    saveSave(save);
    playSfx('coin');
    overlay.toast(gainText(0, ORBIT_PER_AD));
    if (overlay.getScreen() === 'shop') openShop();
    else if (overlay.getScreen() === 'missions') openMissions();
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
    saveSave(save);
    playSfx('coin');
    overlay.toast('샀어요.');
    openShop();
  }

  /** 마스크 한 개 사기(먼지) — 새로 그릴 수 있는 장이 는다 */
  function buyBlank(): void {
    if (!spendDust(save, MASK_DUST_COST)) { playSfx('uiDeny'); return; }
    save.blanks += 1;
    saveSave(save);
    playSfx('coin');
    overlay.toast('샀어요.');
    openShop();
  }

  function doEquip(slot: string, id: string): void {
    // 가면 칸의 「그리기」 · 「새 가면」은 상점이 장착 길(onEquip)로 보낸다 — 여기서 도트판을 연다
    if (slot === 'mask-buy') { buyBlank(); return; }
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

  /** 가면 도트판 — id = 있던 가면(다시 그리기 · 이름 고치기, 무료), null = 새 가면(저장할 때 blanks 하나를 쓴다) */
  function openMaskBoard(id: string | null): void {
    const cur = id === null ? undefined : save.masks.find((m) => m.id === id);
    if (id === null ? save.blanks <= 0 || save.masks.length >= MASK_MAX : !cur) { playSfx('uiDeny'); return; }
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
    if (askKit(startTokoton, false)) return;
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
    const usedAd = ads.ready() && !adFree();
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
      } else {
        save.bestArcade = Math.max(save.bestArcade, sc);
        if (isBare(runKit)) save.bestBare = Math.max(save.bestBare, sc);
      }
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
    if (closeReward()) return;
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
    else homeNudge();
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
    onGameOverShop: afterLock(() => { playSfx('uiBlip'); goTitle(false); openShop('gear'); }),
    onGameOverMissions: afterLock(() => { playSfx('uiBlip'); goTitle(false); openMissions(); }),
    onOpsEndList: afterLock(() => { playSfx('uiBlip'); goTitle(false); overlay.showOps(opsOpts()); }),
    onExam: doExam,
    onEndingDone: afterLock(() => { playSfx('uiBack'); goTitle(); }),
    onEndingRetry: afterLock(() => { playSfx('uiOk'); lastRun(); }),
    missionBadge: () => {
      const key = kstDateKey(Date.now());
      return claimableCount(save.daily, save.achieves)
        + Number(attendReady(save.attend, key))
        + Number(wageReady(save.wage, save.daily) >= 0)
        + Number(salaryReady(save.salary, key))
        + Number(rookieReady(save.rookie, facts()))
        + Number(seasonReady(save.season));
    },
    shopBadge: () => coffeeReady(save.coffee, kstDateKey(Date.now())),
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
    onOpenShop: () => { playSfx('uiBlip'); openShop(coffeeReady(save.coffee, kstDateKey(Date.now())) ? 'pack' : 'gear'); },
    onOpenPack: () => { playSfx('uiBlip'); openShop('pack'); },
    onOpenBook: () => { playSfx('uiBlip'); openBook(); },
    onMetaBack: () => { playSfx('uiBack'); overlay.showTitle(titleView()); },
    onClaimMission: (id, boost) => { void claimMission(id, boost); },
    onTake: (kind) => { void takeDaily(kind); },
    onAchieve: openAchieve,
    onCoffee: takeCoffee,
    onRegular: takeRegularStep,
    onBookGo: (go) => { if (go === 'season') openMissions(); else openShop(go); },
    onBuySku: askBuy,
    onKitBuy: shopKitBuy,
    onRestore: () => { void restoreBuys(); },
    onAdOrbit: () => { void adOrbit(); },
    onUnlockOrbit: (id) => unlockOrbitItem(id),
    onUnlockDust: (id) => unlockDustItem(id),
    onEquip: (slot, id) => doEquip(slot, id),
    onExchangeDust: doExchange,
    onHowtoDone: () => { save.howtoSeen = true; saveSave(save); homeNudge(); },
    onResetData: resetData,
  });

  if (DEV_TOOLS && (debug || isDevUnlocked())) mountDebugMenu(() => state, debug); // 전해금 뒤 부팅은 접어서

  overlay.showBoot();
  setChrome('boot');
  /** 끝나지 않은 구매 다시 받기. 앱이 지급 전에 죽었거나 대기 결제가 끝난 것 — 대기 결제는 사흘 안에 안 받으면 자동 환불된다 */
  async function pendingBuys(): Promise<number> {
    let got = 0;
    await iap.restore((p) => { if (paid(p)) got += 1; });
    return got;
  }
  const noteGot = (got: number): void => { if (got > 0) overlay.toast(`못 받은 결제 ${got}건을 받았어요.`); }; // 말없이 늘면 의심한다

  void iap.init().then(pendingBuys).then((got) => {
    const scr = overlay.getScreen();
    if (scr === 'shop') openShop();
    else if (scr === 'title' && !overlay.modalOpen()) {
      overlay.showTitle(titleView());
      homeNudge();
    }
    noteGot(got);
  });

  // 백그라운드 = 판 멈춤 + 소리 끄기 + 저장. 웹 visibilitychange와 네이티브 appStateChange를 합쳐 듣는다.
  onLifecycle((fg) => {
    if (fg) {
      resumeIfNeeded();
      void pendingBuys().then((got) => {
        if (got > 0 && overlay.getScreen() === 'shop') openShop();
        noteGot(got);
      });
      return;
    }
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
    // 결과 장면의 공격 키가 시트 · 확인 창 뒤에서 「한 판 더」를 또 누르지 않게
    if (scene !== 'play' && overlay.modalOpen()) { prevTitleGuard = f.guard; return; }

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
    const got = runKit.dust2x ? n * 2 : n;
    grant(save, got, 0);
    runDust += got;
    dustDirty = true;
  }

  /** 판 도중 평생 값이 바뀐 프레임에만 — 처음 채운 실적을 자막으로 알린다 */
  function noteAchieved(): void {
    for (const d of syncAchieves(save.achieves, factsOf(save, runBook))) {
      hud.note(`실적 · ${d.title}`);
      playSfx('uiBlip');
    }
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
        statTick = true;
        if (opRun) opRun.buildings += 1;
      }
      if (e.kind === 'special') {
        earnDust(DUST_PER_SPECIAL);
        save.stats.specials += 1;
        statTick = true;
      }
      if (e.kind === 'guardBounce' || e.kind === 'guardAirBounce') {
        save.stats.guards += 1;
        statTick = true;
      }
      if (e.kind === 'bossDefeat' && !stageRun?.fromBoss) { // 보스 연습은 평생 기록에 안 쌓는다
        save.stats.bosses += 1;
        statTick = true;
      }
      if (e.kind === 'supply' && e.item === 'dust') earnDust(DUST_PER_SUPPLY);
      if (e.kind === 'hatBreak') runHatBreaks += 1;
      if (e.kind === 'lifeLost' && !s.over && !save.guardTaught) startTeach();
    }
    showCaps(runCaps.observe({ combo: s.combo, score: s.score }));
    if (statTick) {
      statTick = false;
      noteAchieved();
    }
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

  /** 결과 카드 한 줄 — 이번 판에 채운 실적, 없으면 신입 과제 */
  function runNews(): string {
    syncAchieves(save.achieves, factsOf(save, runBook));
    const hit = readyAchieves(save.achieves).filter((d) => !runReady0.has(d.id)).map((d) => d.title);
    if (hit.length) return `실적 · ${hit.slice(0, 2).join(' · ')}${hit.length > 2 ? ` 외 ${hit.length - 2}개` : ''}`;
    const step = ROOKIE[save.rookie];
    if (!step) return '';
    const ready = rookieReady(save.rookie, factsOf(save, runBook));
    return `${ready ? '신입 과제 받기' : `신입 과제 ${save.rookie + 1}/${ROOKIE.length}`} · ${step.title}`;
  }

  function gameoverView(s: GameState, prevBest: number): GameOverView {
    const goal = nextDustGoal(save.owned, save.dust);
    const goalName = goal ? WEAPON_COPY[goal.id as keyof typeof WEAPON_COPY]?.name : undefined;
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
    const news = opGoal ? '' : runNews();
    return {
      score: s.score - scoreBase,
      combo: s.peakCombo,   // 현재 콤보는 죽는 히트가 이미 끊었다 — 결과화면은 이번 판 최고치를 쓴다
      buildings: runBuildings,
      dustGained: runDust,
      zone: hudModeLabel(s.mode, s.chapter, s.act2Phase),
      goal: opGoal || news || (goal && goalName ? SCREENS.gameover.nextGoal(goalName, goal.short) : ''),
      goalId: opGoal || news || !goalName ? undefined : goal?.id,
      goalMissions: !!news,
      theme: regionOf(s.chapter).theme,
      canContinue: s.mode === 'act2' && s.checkpoint > 0,
      canRevive: revivesUsed < MAX_REVIVES_PER_RUN,
      adRevive: ads.ready() && !adFree(),
      reviveLeft: MAX_REVIVES_PER_RUN - revivesUsed,
      line,
      best,
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
      if (isBare(runKit) && !runExempt) noteKind('bareAct2');
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
      if (isBare(runKit) && !runExempt) noteKind('bareMoon');
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
