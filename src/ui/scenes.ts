// 씬 머신: Boot→Title → Act1(+BonusStage 자동) → StoryIntro → Act2 → Ending / Tokoton /
// ButterChallenge / GameOver(2막 이어하기) / Pause. 디버그 오버레이 포함.
// core는 씬을 모른다 — 씬이 advance 호출 여부·상태 전이를 관장한다.
// 타이틀·HUD·일시정지·결과는 DOM(overlay/hud). 캔버스는 필드만.

import type { GameState, GimmickId, StageDiff } from '../core/types';
import { makeState, advance, applyStartKit, enterBonus, grantMercyLife } from '../core/sim';
import { enterAct2Phase, continueFromCheckpoint } from '../core/act2';
import { judgeStage, stageScript, stageSeed, startStage } from '../core/stage';
import { LESSONS, startTraining as setupTraining, trainingGuide, trainingKeys } from '../core/training';
import { STAGES } from '../core/stages';
import { ACT1, AUDIO, GIMMICK, OPERATION, PALETTE, PERK, TEACH, TRAINING, UI_FLOW, VIEW, WAZA_GAUGE } from '../config';
import { dustMul } from '../core/perks';
import { drawGame, drawFieldStill, consumeEvents, initRenderer, setFeedbackOptions, applyCosmetics } from '../render/renderer';
import { butterTier, homeFaces, jobAction, stepJob, type HomeFacts, type JobId } from './homeLogic';
import { gateStep, reviveKey, newGate, resultActs, resultFaces, type ResultAct, type ResultCtx, type ResultGate } from './resultLogic';
import { freezeSaves, isSaveChange, loadSave, resetSave, saveSave, type SaveData, type SaveSettings } from '../storage';
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
import { bossName, endView, newHintMemo, nextHint, stageHudLine, stageSteps, type HintMemo, type StageEndView } from './stageLogic';
import { HERO, OPERATIONS, WEAPON_COPY } from '../content/world';
import { MASK_MAX, createMask, deleteMask, ownedMasks, updateMask, wearMask, wornMaskId } from '../meta/mask';
import { closeMaskEditor, openMaskEditor } from './maskEditor';
import { closeLayoutEditor, openLayoutEditor } from './layoutEditor';
import { mountHud, ensureHudLayer, type HudOp } from './hud';
import type { TouchAction } from '../input/touch';
import { createRunCaps, type RunCap, type RunCaps } from './runCaps';
import { bookCount, bookGroups, type RecordView } from './bookView';
import { fmt, reduceMotion as osReduceMotion } from './ink';
import type { KitView } from './kitView';
import { achieveDetail, attendBoard, type SeasonView, type TakeKind } from './missionView';
import { goods, skuGoods } from './goodsArt';
import { BUY_NOTES, armFuses, offerHtml, partsHtml, type OfferRow, type PackView } from './packView';
import { closeReward, rewardOpen, setRewardLook, showReward, type RewardShow } from './rewardFx';
import type { ShopTab } from './shopView';
import {
  mountOverlay, ensureOverlayLayer, homeFactsFromSave, titleViewFromSave,
  type GameOverView, type OpsEndView, type OverlayApi, type StoryOpts, type TitleView,
} from './overlay';
import { applySettingsPatch as patchSettings, applySettingsToRuntime, firstBootFeedback, type SettingsSinks } from './settings';
import {
  grant, grantOrbit, MAX_REVIVES_PER_RUN, ORBIT_PER_AD, spendOrbit, orbitCost, exchangeDust, DUST_EXCHANGE,
  dustCost, spendDust, DUST_PER_BUILDING, DUST_PER_SPECIAL, DUST_PER_SUPPLY, MASK_DUST_COST,
  nextDustGoal, adOrbitLeft, noteAdOrbit, exchangeLeft, licenseTitle, takeExam,
} from '../meta/economy';
import { enforceOwnedLoadout, equip } from '../meta/loadout';
import {
  applyMissionEvent, ensureDaily, initAchieveProgress, ACHIEVES, DAILY_POOL, claim, defById, claimableCount, kstDateKey,
} from '../meta/missions';
import { betterGrade, isOpId, opGrade, opLimitTicks, opValue, type OpId } from '../meta/ops';
import { buyKit, clampPick, isBare, kitDef, kitSheetUseful, pickCount, spendKit, type KitId, type KitPick } from '../meta/kit';
import {
  FIRST_GIFT, SALARY_DAYS, SKUS, dustOf, effPct, grantSku, liveTokens, orbitOf, revokeMissingOnce, revokePaid, skuById, soldOut, takeRegular, type SkuId,
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
import { createIapPort, voidedOf, type Ledger, type Paid } from '../platform/iap';
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
  // 홈 크레인에 매단 일감 + 그 판단 재료(홈을 그릴 때 · 일감을 바꿀 때만 다시 만든다 — 키 얼굴이 매 틱 읽는다)
  let homeJob: JobId = save.homeJob;
  let homeFacts: HomeFacts | null = null;
  let homeChapter = 0;
  let prevTitleGuard = false; // 타이틀 메뉴 가드 엣지 검출용 (P0-6)
  // 결과 화면 키 — 잠금 뒤 새 누름만 받는다(ui/resultLogic.ts). 판이 끝난 첫 틱에 만들고 판 · 홈으로 가면 버린다
  let resultGate: ResultGate | null = null;
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
  let dustCarry = 0; // 현장 조건 「야근」 먼지 배율의 소수 몫 — 다음 지급에 이어 붙인다
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
  let inTraining = false; // 수습 교육판 한 판(첫 실행 · 설정 「수습 교육」). 기록 · 재화 · 판 수 · 미션에 안 닿는다
  let teachFreeze = 0;
  let teachPulse = 0;
  let teachDue = false; // 깔린 채 목숨을 잃었다 — 가르침은 깔림이 풀린 첫 틱(가운데 키가 다시 「가드」 얼굴)에
  let trainingSay = ''; // 튜토리얼 담당자가 마지막으로 한 대사 — 바뀌면 무전 소리
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
  const bootFeedback = firstBootFeedback((k) => localStorage.getItem(k), osReduceMotion());
  if (bootFeedback) Object.assign(save.settings, bootFeedback);
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
    const v = titleViewFromSave(save, homeJob, debugOpen());
    homeFacts = v.facts;
    homeChapter = v.chapter;
    return { ...v, note: homeNote(f) };
  }

  /** 이전 · 다음 일감 — 고르는 즉시 저장한다(다음에 홈에 오면 그 일감) */
  function moveJob(dir: -1 | 1): void {
    homeJob = stepJob(homeJob, dir);
    save.homeJob = homeJob;
    saveSave(save);
    homeFacts = homeFactsFromSave(save, debugOpen());
    overlay.setTitleJob(homeJob, homeFacts, dir);
    syncFaces();
    playSfx('uiBlip');
  }

  /** 조작 키 얼굴 — 홈 · 결과(현장 화면)면 메뉴 얼굴, 아니면 플레이 얼굴. 키 얼굴은 여기 한 곳만 정한다 */
  function syncFaces(): void {
    touch?.setFocus(inTraining && state ? trainingKeys(state) : null); // 교육판: 이 걸음 키만 진하게
    const onHome = scene === 'title' && overlay.getScreen() === 'title';
    document.getElementById('stage')?.classList.toggle('home', onHome); // 홈 = 조작 키 숨김(넘기기는 좌우 밀기 · 시작은 매단 일감)
    if (onHome && homeFacts) { touch?.setFaces(homeFaces(homeJob, homeFacts)); return; }
    const rc = resultCtx();
    // 현장 조건 쪽지 — 점프 = 왼쪽 · 공격 = 오른쪽 쪽지 이름, 가드 · 필살은 쉰다(둘 다 고를 수 있어 주홍 없음)
    const off = scene === 'play' ? state?.perk?.offer : null;
    // 결과는 조작 키를 숨기고 제 단추(overlay .rp-acts)를 쓴다 — 얼굴 · 닫힘은 같은 resultFaces
    touch?.setFaces(off ? {
      jump: { label: PERK[off.a].name, tone: 'ink' },
      guard: { label: '', tone: 'rest' },
      attack: { label: PERK[off.b].name, tone: 'ink' },
      special: { label: '', tone: 'rest' },
    } : null);
    overlay.setResultKeys(rc ? resultFaces(rc, resultGate?.shut ?? { jump: true, attack: true, special: true, guard: true }) : null);
  }

  /** 결과 단추를 눌렀다 — 다음 표본에서 그 키를 누른 것으로 게이트에 넣는다(연타 · 광고 일어나기 보호가 키와 같다) */
  let domKey: TouchAction | null = null;

  /** 결과 카드가 떠 있으면 그 키 배정 재료. 카드가 뜨기 전(판이 무너지는 0.5초)은 null */
  function resultCtx(): ResultCtx | null {
    if (overlay.getScreen() !== scene) return null;
    switch (scene) {
      case 'gameover':
        return state ? {
          kind: 'gameover',
          canRevive: revivesUsed < MAX_REVIVES_PER_RUN,
          canContinue: state.mode === 'act2' && state.checkpoint > 0,
          adRevive: ads.ready() && !adFree(),
          reviveLeft: MAX_REVIVES_PER_RUN - revivesUsed,
        } : null;
      case 'opsend': return { kind: 'opsend' };
      case 'ending': return { kind: 'ending' };
      case 'stageend': return { kind: 'stageend', next: !!stageEnd?.nextId };
      default: return null;
    }
  }

  /** 카드가 막 떴다(GAMEOVER_LOCK) · 광고를 보는 중 — 키가 옅고 누름을 버린다 */
  const resultLocked = (): boolean => overlayTicks > 0 || reviving;

  /** 결과 키가 하는 일 — 손가락 · 키보드가 같은 것을 부른다(배정은 resultActs) */
  function resultDo(a: ResultAct): void {
    switch (a) {
      case 'revive': void tryRevive(); break;
      case 'continue':
        if (state && scene === 'gameover' && state.mode === 'act2' && state.checkpoint > 0) {
          playSfx('uiOk');
          continueFromCheckpoint(state);
          state.wazaGauge = 0;
          goPlay();
        }
        break;
      case 'retry': playSfx('uiOk'); lastRun(); break;
      case 'home': playSfx('uiBack'); goTitle(); break;
      case 'list': playSfx('uiBlip'); goTitle(false); overlay.showOps(opsOpts()); break;
      case 'next': playSfx('uiBlip'); toStageList(stageEnd?.nextId ?? undefined); break;
      case 'back': playSfx('uiBack'); toStageList(); break;
    }
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
      eff: effPct(skuById(o.sku)!, undefined, save),
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
    dustCarry = 0;
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
    teachDue = false;
    hud.teach(null);
    hud.guide(null);
    trainingSay = '';
    touch?.setHint(null);
  }

  function startTeach(): void {
    save.guardTaught = true;
    saveSave(save);
    teachFreeze = TEACH.GUARD_FREEZE_TICKS;
    teachPulse = TEACH.GUARD_PULSE_TICKS;
    hud.teach(SCREENS.teach.guard, SCREENS.teach.guardSub);
    touch?.setHint(['guard']);
  }

  function bgm(track: BgmTrack | null): void {
    if (track === lastBgm) return;
    lastBgm = track;
    if (track) startBgm(track); else stopBgm();
  }

  /** 결과 카드 버튼 — 잠금(카드가 막 떴다 · 광고를 부르는 중) 동안은 터치도 키처럼 무시한다 */
  function afterLock(fn: () => void): () => void {
    return () => { if (!resultLocked()) fn(); };
  }

  function goPlay(): void {
    resultGate = null;
    gameoverDelay = 0;
    pendingOver = null;
    pendingOps = null;
    pendingStage = null;
    scene = 'play';
    overlay.hide();
    setChrome('playing');
    syncFaces();
  }

  /** show = false — 홈을 거치지 않고 바로 다른 화면(작전 목록 · 상점)으로 간다. 베는 칼이 결과 화면에서 바로 넘어가게 */
  function goTitle(show = true): void {
    resultGate = null;
    gameoverDelay = 0;
    pendingOver = null;
    pendingOps = null;
    pendingStage = null;
    stageEnd = null;
    stageRun = null;
    opRun = null;
    inTraining = false;
    endTeach();
    state = null;
    scene = 'title';
    butterChallenge = false;
    save = { ...save, ...loadSave() };
    homeJob = save.homeJob;
    setChrome('title');
    if (show) {
      overlay.showTitle(titleView());
      homeNudge();
    }
    syncFaces();
    bgm('title');
  }

  /** 수습 교육판 — 글 창 대신 손으로(core/training.ts). 맨몸 · 기록 없음 · 판 수에 안 센다(신입 과제 「첫 판 끝내기」는 첫 진짜 판이 채운다) */
  function startTrainingRun(): void {
    runExempt = true;
    stageRun = null;
    stageEnd = null;
    opRun = null;
    butterChallenge = false;
    scoreBase = 0;
    endTeach();
    state = makeState({ seed: debugSeed(0x7a1e), mode: 'training' });
    state.waza = save.loadout.waza;
    state.weapon = save.loadout.weapon;
    setupTraining(state);
    inTraining = true;
    runLabel = SCREENS.training.name;
    goPlay();
  }

  /** 교육판을 나간다 — 끝냈으면 인장 + 작은 보상 뒤 홈. 그만둬도 다시 강요하지 않는다(howtoSeen) */
  function finishTraining(done: boolean): void {
    if (!inTraining) return;
    inTraining = false;
    const t = state?.training;
    save.howtoSeen = true;
    if (done || (t && t.lesson > LESSONS.findIndex((l) => l.id === 'guard'))) save.guardTaught = true; // 가드를 배웠으면 첫 목숨 손실 때 다시 안 세운다
    hud.guide(null);
    trainingSay = '';
    touch?.setHint(null);
    if (!done) { saveSave(save); goTitle(); return; }
    const reward = { dust: TRAINING.REWARD_DUST };
    giveReward(save, reward);
    saveSave(save);
    // 보상 창은 메뉴층에 뜬다 — 홈을 먼저 깔고 그 위에 찍는다. 출근부 등은 닫은 뒤에
    goTitle(false);
    overlay.showTitle(titleView());
    void showReward({ tier: 'l', title: SCREENS.training.done, seal: SCREENS.training.seal, reward }).then(homeNudge);
  }

  /** 튜토리얼 한 틱 — 담당자 무전(대사 · 행동 유도 · 반응 대사) · 누를 키 꼬리표 · 「지금!」 · 판이 기다리는 키가 뛴다 */
  function trainingTick(s: GameState): void {
    const g = trainingGuide(s);
    if (!g) { hud.guide(null); touch?.setHint(null); trainingSay = ''; return; }
    const T = SCREENS.training;
    const l: { say: string; asks: readonly string[]; then?: string; wait?: string; done?: string; say2?: string; wait2?: string; done1?: string } = T.lesson[g.lesson];
    const again = g.rep > 0; // 가드 둘째
    let say = again && l.say2 ? l.say2 : l.say;
    let ask: string;
    if (g.ok) { say = (g.rep === 1 && l.done1) || l.done || say; ask = ''; } // 해낸 뒤 쉼 — 반응 대사만
    else if (g.waiting) ask = l.asks[g.beat] ?? l.asks[l.asks.length - 1] ?? '';
    else if (g.beat >= l.asks.length && l.then) ask = l.then; // 박자는 다 풀었고 할 일이 남았다
    else ask = (again && l.wait2) || l.wait || l.asks[g.beat] || l.asks[l.asks.length - 1] || '';
    const key = g.waiting && g.need && g.need !== 'any' ? g.need : null;
    const point = key ? { key, label: key === 'guard' && g.lesson === 'guard' ? T.pointHold : T.point } : null;
    hud.guide({ lesson: g.lesson, say, ask, ok: g.ok, point, now: g.now });
    if (say !== trainingSay) { playSfx(g.ok ? 'stamp' : 'uiBlip'); trainingSay = say; } // 새 대사 = 무전 소리 · 해냄 = 도장
    // 맥동 = 판이 기다리는 키(인사는 네 키 모두), 아니면 이 걸음의 진한 키(실전 연습 · 통과 쉼은 없음)
    const all: readonly TouchAction[] = ['jump', 'guard', 'attack', 'special'];
    touch?.setHint(g.waiting && g.need ? (g.need === 'any' ? all : [g.need]) : g.lesson === 'solo' || g.ok ? null : trainingKeys(s));
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
    state.perk = { picked: [], seen: [], offer: null }; // 현장 조건은 아케이드 판만
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
      eff: effPct(skuById('season_pass')!, rungsReach(save.season, key), save),
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
      else if (save.rookie >= ROOKIE.length) show = { tier: 'l', title: `칭호 「${ROOKIE_TITLE}」`, seal: '수료' };
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
        sku: s.id, title: s.title, price: priceOf(s.id), eff: effPct(s, reach, save),
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
    void retryIap(); // 부팅 때 결제 준비가 실패했으면 상점을 열 때 다시 붙는다
    overlay.showShop({
      dust: save.dust, orbit: save.orbit, license: save.license, buildings: save.stats.buildings, loadout: save.loadout,
      maskArt: save.maskArt, masks: save.masks, maskId: save.maskId, blanks: save.blanks,
    }, ownedSet(), {
      ad: adPath(),
      adLeft: adOrbitLeft(save.adDay, kstDateKey(Date.now())),
      adFree: adFree(),
      exchangeLeft: exchangeLeft(save.exchangeDay, kstDateKey(Date.now())),
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
    const w = stageSteps(s); // 판 위 막대와 같은 수 — 치운 걸음
    pendingStage = endView({
      kind, result, lifeLost: st.tally.lifeLost, finishSpecial: st.tally.finishSpecial,
      step: w.done, total: w.total, phase: st.phase, news, rec,
      nextId: kind === 'real' && result.cleared && nx && (debugOpen() || stageUnlocked(save.stages, nx.id)) ? nx.id : null,
    });
    bgm(null);
    playSfx(result.cleared ? 'stamp' : 'runEnd', { delay: result.cleared ? 0 : AUDIO.RUN_END_DELAY });
    if (result.cleared) playSfx('checkpoint', { delay: AUDIO.RUN_END_DELAY }); // 도장 뒤 맑은 차임 한 번 — 완료가 0.1초 도장 하나로 끝나지 않게(감사 feel-05)
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
    if (!exchangeDust(save, save.exchangeDay, kstDateKey(Date.now()))) { playSfx('uiDeny'); return; }
    saveSave(save);
    playSfx('coin');
    overlay.toast(`먼지 ${DUST_EXCHANGE.dust} → 궤도조각 +${DUST_EXCHANGE.orbit}`);
    openShop();
  }

  function resetData(): void {
    resetSave();
    save = loadSave();
    rookieAsked = false; // 지운 기록엔 첫 출근 창 · 출근 창이 다시 떠야 한다
    attendAsked = '';
    applySettingsToRuntime(save, settingsSinks);
    applyCosmetics(save.loadout, save.maskArt);
    homeJob = save.homeJob;
    playSfx('uiBack');
    overlay.showTitle(titleView());
    overlay.toast('기록을 지웠어요.');
    // 한 번만 사는 상품은 스토어에 남아 있다 — 지운 기록에 다시 얹는다(신입 특가와 꾸러미 이중 결제 방지)
    void iap.restore(paid, ledger).then((n) => {
      if (!n) return;
      overlay.toast(`산 상품 ${n}건을 다시 받았어요.`);
      if (overlay.getScreen() === 'title' && !overlay.modalOpen()) overlay.showTitle(titleView());
    });
  }

  /** 지급 + 저장. 처음 받은 구매면 onFresh. 저장이 안 써지면 false — iap가 소비 · 승인을 미루고 다음 복구가 다시 한다 */
  function paid(p: Paid, onFresh?: () => void): boolean {
    rollMonth(kstDateKey(Date.now())); // 다음 달에 늦게 복구된 특근 수당은 그 달에 붙는다
    if (grantSku(save, p.id, p.token, kstDateKey(Date.now()), p.order)) {
      noteOfferBought(save.offers, p.id, Date.now());
      onFresh?.();
    }
    return saveSave(save);
  }

  /** 결제 장부 창구 — 지급 표식 맞대기 · Play 보유 목록에서 빠진 1회 상품 거두기 */
  const ledger: Ledger = {
    has: (t) => save.iapTokens.includes(t) || save.paid.some((x) => x.t === t),
    held: (tokens) => clawed(revokeMissingOnce(save, tokens).length),
  };

  /** 환불된 결제를 거둔 뒤 — 빠진 꾸미기를 벗기고 저장 · 알림 */
  function clawed(n: number): void {
    if (!n) return;
    save.loadout = enforceOwnedLoadout(save.loadout, save.owned);
    applyCosmetics(save.loadout, save.maskArt);
    saveSave(save);
    overlay.toast(`환불된 결제 ${n}건의 상품을 회수했어요.`);
    iapRedraw();
  }

  /** 반복 상품 환불 확인 — 서버 주소가 있을 때만(iap.voidedOf), 부팅 때와 여섯 시간마다 */
  let refundAt = 0;
  async function checkRefunds(): Promise<void> {
    if (Date.now() - refundAt < 6 * 3600e3) return;
    refundAt = Date.now();
    const voided = await voidedOf(liveTokens(save));
    clawed(voided.filter((t) => revokePaid(save, t)).length);
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
      no: '닫기', yes: `${priceOf(sku.id)} 결제`, pay: true,
    }, () => { void buySku(sku.id); });
  }

  async function buySku(id: SkuId): Promise<void> {
    const sku = skuById(id)!;
    const first = !save.firstGift;
    const orbit = orbitOf(sku, save.bought);
    const dust = dustOf(sku, save.bought);
    let got = 0;
    let fresh = false; // 이미 보유 오류로 남은 구매만 정리됐으면 이번 결제도 지급도 없다
    const r = await iap.purchase(id, (p) => paid(p, () => {
      got += 1;
      fresh ||= p.id === id;
    }), ledger);
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
      overlay.toast(got > 0 ? `못 받은 상품 ${got}건을 받았어요.` : '지난 결제가 처리 중이었어요. 다시 눌러 주세요.');
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
    const n = await iap.restore((p) => paid(p, () => { got += 1; }), ledger);
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
    state.wazaFree = true; // 버터바 도전은 받은 게이지(먹 대검 덤 없음)
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
    overlay.showPause({ score: state.score, combo: state.combo, perks: perkNames(state) });
  }

  /** 고른 현장 조건 이름 한 줄(멈춤 창 · 결과 보고서) — 없으면 '' */
  function perkNames(s: GameState): string {
    return (s.perk?.picked ?? []).map((id) => PERK[id].name).join(' · ');
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
    if (!save.howtoSeen) startTrainingRun(); // 첫 실행 — 읽기 전에 손부터(수습 교육판). 글 창 「작업 안내」는 설정에 그대로
    else homeNudge();
  }

  function backFromSettings(): void {
    if (settingsFrom === 'pause' && state) {
      overlay.showPause({ score: state.score, combo: state.combo, perks: perkNames(state) });
    } else {
      overlay.showTitle(titleView());
    }
  }

  /** 「착수 · 고르기」 — 키 얼굴과 같은 판단(homeLogic.jobAction)을 읽는다 */
  function confirmTitle(): void {
    const go = jobAction(homeJob, homeFactsFromSave(save, debugOpen()));
    if (go.k === 'deny') { playSfx('uiDeny'); return; }
    playSfx('uiOk');
    switch (go.k) {
      case 'arcade': startArcade(); break;
      case 'stage': startStageRun(go.id, go.diff, false); break;
      case 'stageMap': overlay.showStages(stageOpts()); break;
      case 'ops': overlay.showOps(opsOpts()); break;
      case 'tokoton': startTokoton(); break;
      case 'butter1': startButterChallenge(1); break;
      case 'butterPick': overlay.showButterPick(go.tier); break;
    }
  }

  const hud = mountHud(ensureHudLayer(), {
    onPause: () => { playSfx('uiBlip'); enterPause(); },
    onPerk: (k) => { domKey = k; },
  });
  overlay = mountOverlay(ensureOverlayLayer(), {
    onBoot: enterTitleFromBoot,
    onJob: (dir) => { if (!overlay.modalOpen()) moveJob(dir); },
    onButterRound: (round) => { playSfx('uiOk'); startButterChallenge(round); },
    onButterBack: () => { playSfx('uiBack'); overlay.showTitle(titleView()); },
    onOpenSettings: () => { playSfx('uiBlip'); openSettings(); },
    onStorySkip: () => skipStory(true),
    onPauseResume: () => { playSfx('uiBlip'); resumePause(); },
    onPauseQuit: () => {
      playSfx('uiBack');
      if (inTraining) { finishTraining(false); return; }
      persist();
      if (stageRun) toStageList(); else goTitle();
    },
    onSettingsBack: () => { playSfx('uiBack'); backFromSettings(); },
    onSettingsPatch: applySettingsPatch,
    onLayoutEdit: openLayoutBoard,
    onGameOverShop: afterLock(() => { playSfx('uiBlip'); goTitle(false); openShop('gear'); }),
    onGameOverMissions: afterLock(() => { playSfx('uiBlip'); goTitle(false); openMissions(); }),
    onExam: doExam,
    resultWho: () => `${HERO} · ${licenseTitle(save.license)}`,
    onResultKey: (k) => { domKey = k; },
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
    onJobTap: () => {
      if (overlay.modalOpen()) return;
      if (homeJob !== 'stage') { confirmTitle(); return; }
      playSfx('uiOk');
      overlay.showStages(stageOpts());
    },
    onStageStart: (id, diff, fromBoss) => { playSfx('uiOk'); startStageRun(id, diff, fromBoss); },
    onOpenMissions: () => { playSfx('uiBlip'); openMissions(); },
    onOpenShop: () => { playSfx('uiBlip'); openShop('gear'); }, // 상점은 늘 장비부터(커피는 꼬리표 점이 알린다)
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
    // 「시작」 = 홈 「착수」와 같은 판. 출근부 · 신입 과제는 그 판이 끝나 홈에 설 때(goTitle → homeNudge) 뜬다
    onHowtoDone: (start) => { save.howtoSeen = true; saveSave(save); if (start) confirmTitle(); else homeNudge(); },
    onResetData: resetData,
    onTraining: () => { playSfx('uiOk'); startTrainingRun(); },
  });

  if (DEV_TOOLS && (debug || isDevUnlocked())) mountDebugMenu(() => state, debug); // 전해금 뒤 부팅은 접어서

  overlay.showBoot();
  setChrome('boot');
  /** 끝나지 않은 구매 다시 받기. 앱이 지급 전에 죽었거나 대기 결제가 끝난 것 — 대기 결제는 사흘 안에 안 받으면 자동 환불된다 */
  async function pendingBuys(): Promise<number> {
    let got = 0;
    await iap.restore((p) => paid(p, () => { got += 1; }), ledger);
    void checkRefunds();
    return got;
  }
  const noteGot = (got: number): void => { if (got > 0) overlay.toast(`못 받은 상품 ${got}건을 받았어요.`); }; // 말없이 늘면 의심한다

  /** 결제가 열렸거나 못 받은 결제를 받았다 — 열린 상점 · 홈(특가)을 다시 그린다 */
  function iapRedraw(): void {
    const scr = overlay.getScreen();
    if (overlay.modalOpen() || rewardOpen()) return; // 열린 창 · 보상 연출은 건드리지 않는다 — 다음 그리기 때 반영된다
    if (scr === 'shop') openShop();
    else if (scr === 'title') {
      overlay.showTitle(titleView());
      homeNudge();
    }
  }
  /** 부팅 때 결제 준비가 실패했으면(오프라인 시작 등) 다시 붙고, 열리면 다시 그린다 */
  function retryIap(): Promise<void> {
    if (iap.available()) return Promise.resolve();
    return iap.init().then(() => { if (iap.available()) iapRedraw(); });
  }

  void iap.init().then(pendingBuys).then((got) => {
    iapRedraw();
    noteGot(got);
  });

  // 백그라운드 = 판 멈춤 + 소리 끄기 + 저장. 웹 visibilitychange와 네이티브 appStateChange를 합쳐 듣는다.
  onLifecycle((fg) => {
    if (fg) {
      resumeIfNeeded();
      void retryIap(); // 복구와 따로 돈다 — 준비가 늦어도 못 받은 결제는 바로 받는다
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

  // 웹 탭 둘: 다른 탭이 저장을 바꾸면 이 탭이 든 옛 저장으로 덮지 않게 얼리고 다시 읽는다. 자기 탭 저장엔 이 이벤트가 안 와서 앱(WebView 하나)은 그대로다
  let staleSave = false;
  window.addEventListener('storage', (e) => {
    if (staleSave || e.storageArea !== localStorage || !isSaveChange(e.key)) return;
    staleSave = true;
    freezeSaves();
    if (!document.hidden) location.reload();
    else document.addEventListener('visibilitychange', () => location.reload(), { once: true });
  });

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
    const dk = domKey;
    domKey = null;
    syncFaces(); // 창이 떠 있어도 키 얼굴은 맞춘다(창 막 아래로 비친다)
    duckBgm('menu', scene === 'pause' || overlay.getScreen() === 'settings');
    // 결과 장면의 공격 키가 시트 · 확인 창 뒤에서 「한 판 더」를 또 누르지 않게
    // 창 · 보상 연출이 떠 있으면 메뉴 키(현장 화면)도 먹지 않는다 — 눌림은 sample()이 이미 비웠다
    if (scene !== 'play' && (overlay.modalOpen() || rewardOpen())) {
      // 창 · 보상이 덮은 동안 결과 키를 다시 잠근다. 닫히자마자 같은 자리를 또 누른 것이 키로 새지 않는다(일어나기 = 광고).
      // 닫히면 카드가 처음 뜰 때와 같은 잠금이 다시 돈다. 결과 카드가 떠 있을 때만 — 한 판 더 → 이야기 컷으로 넘어간 뒤에도
      // resultGate가 남아 있어 그 장면의 overlayTicks(이야기 시간)를 건드리지 않게
      if (resultGate && resultCtx()) { overlayTicks = Math.max(overlayTicks, UI_FLOW.GAMEOVER_LOCK); gateStep(resultGate, f, performance.now(), true); }
      prevTitleGuard = f.guard;
      return;
    }

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
        if (f.jump) moveJob(-1);
        if (guardEdge) moveJob(1);
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
          if (teachFreeze === 0) hud.teach(null);
          break;
        }
        if (teachPulse > 0) {
          teachPulse -= 1;
          if (f.guard || teachPulse === 0) { teachPulse = 0; touch?.setHint(null); } // 눌러 봤으면 충분
        }
        const run = stageRun;
        if (debug && !run && !inTraining) tickDebug(s, f);
        const wasMode = s.mode;
        const wasPhase = s.act2Phase;
        // 현장 조건 쪽지를 손가락으로 눌렀다 — 그 쪽 키를 누른 것으로 넣는다(결정적 입력 · 손 놓음 셈 그대로)
        advance(s, dk && s.perk?.offer ? { ...f, [dk]: true } : f);
        if (debug && !run) settleDebug(s);
        if (inTraining) trainingTick(s);
        else noteMissions(s); // 교육판은 재화 · 평생 기록 · 미션에 안 센다
        if (run) stageTick(s, run);
        consumeAudio(s);
        consumeEvents(s);
        handleTransitions(s, wasMode, wasPhase);
        s.events.length = 0;
        touch?.setPinned(s.player.pose === 'pinned');
        if (teachDue && s.player.pose !== 'pinned' && !s.over && scene === 'play') { teachDue = false; startTeach(); }
        touch?.setSpecialReady(s.wazaGauge >= 100);
        touch?.setSpecialFill(s.wazaGauge);
        touch?.setGuardFill(s.guardGauge);
        // 장면을 바꾼 틱이면 곡은 전환이 정했다(엔딩·게임오버·작전 종료) — 덮어쓰지 않는다
        if (scene === 'play') bgm(bgmFor(s));
        break;
      }
      case 'pause':
        break;
      case 'ending':
      case 'opsend':
      case 'stageend':
      case 'gameover': {
        bgm(scene === 'ending' ? 'ending' : null);
        // 결과 키 넷 — 판이 끝난 첫 틱부터 누름을 지켜본다. 카드가 뜨기 전 · 잠금(GAMEOVER_LOCK) 중 누름은 버리고,
        // 풀린 뒤에도 키마다 조용했다가 새로 누른 것만 받는다(죽는 순간의 공격 연타가 광고 부활로 새지 않게)
        const now = performance.now();
        resultGate ??= newGate(f.guard, now);
        if (overlayTicks > 0) overlayTicks -= 1;
        if (!resultLocked() && (f.attack || f.jump || f.special || (f.guard && !prevTitleGuard) || dk)) overlay.skipRoll(); // 잠금이 풀린 뒤 누름 = 숫자 쌓이는 연출만 건너뛴다(죽는 순간 연타는 안 넘긴다) — 키 잠금 · 판정은 그대로
        const rc = resultCtx();
        const key = gateStep(resultGate, dk ? { ...f, [dk]: true } : f, now, !rc || resultLocked(), rc ? reviveKey(rc) : null);
        const act = rc && key ? resultActs(rc)[key] : null;
        if (act) { resultDo(act); break; }
        if (scene === 'gameover' && gameoverDelay > 0) {
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
    // 현장 조건 「야근」은 그 판에 번 먼지에만 곱한다(소수 몫은 dustCarry로 이어 붙여 반올림 이득이 없다)
    dustCarry += (runKit.dust2x ? n * 2 : n) * (state ? dustMul(state) : 1);
    const got = Math.floor(dustCarry);
    dustCarry -= got;
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
      if (e.kind === 'lifeLost' && !s.over && !save.guardTaught) {
        if (s.player.pose === 'pinned') teachDue = true; else startTeach();
      }
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

  /** 판 도중 띠 가운데 둘째 줄(지시서는 첫 줄 판 이름까지) — 작전이 아니면 null */
  function opHud(s: GameState): HudOp | null {
    if (inTraining && s.training) return { head: SCREENS.training.name, line: `${Math.min(s.training.lesson + 1, LESSONS.length)}/${LESSONS.length}` };
    if (stageRun && s.stage) return stageHudLine({ id: stageRun.id, ticks: s.stage.clearTick || s.tick });
    if (!opRun) return null;
    const remain = Math.max(0, Math.ceil((opLimitTicks(opRun.id) - s.tick) / 60));
    return { line: SCREENS.ops.hud(opRun.id, remain, opNow(s)) };
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
      line,
      best,
      prevBest,
      mode: runLabel,
      perks: perkNames(s),
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
    if (s.mode === 'training') { if (s.over) finishTraining(true); return; } // 교육판은 엔딩 · 게임오버를 안 탄다
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
        goTitle(false); // 회차 고르는 화면으로 — 다음 회차를 바로 고르게
        overlay.showButterPick(butterTier(homeFactsFromSave(save, debugOpen())));
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
      const prevBest = save.bestArcade;
      const best = !runExempt && s.score > 0 && s.score > prevBest;
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
          mode: runLabel,
          fullCombo: s.fullCombo,
          best,
          prevBest,
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
      scene = 'gameover';
      setChrome('gameover');
      // 카드는 잠깐 뒤에 — 그동안 캔버스가 마지막 장면을 보여 준다
      pendingOver = gameoverView(s, prevBest);
      // 목숨 소리(lifeLost)가 끝난 뒤 판 종료 신호 — 신기록이면 가라앉는 소리 대신 고비 소리(감사 feel-05)
      playSfx(pendingOver.best ? 'milestone' : 'runEnd', { delay: AUDIO.RUN_END_DELAY });
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
    } else if (!state) {
      // 홈 = 판이 카메라 0에서 보이는 그대로(하늘 · 원경 · 땅선). 메뉴 화면이 덮어도 같은 그림이라 돌아올 때 늦지 않는다
      // 홈은 조작 키가 없다 — 땅선을 화면 맨 아래로 내려 조작 구역까지 쓴다(style.css 홈 배치와 짝)
      drawFieldStill(ctx, { mode: 'act1', chapter: homeChapter, act2Phase: null }, VIEW.H - VIEW.FIELD_H);
    }
  }

  return {
    update: () => update(),
    draw,
    getState: () => state,
  };
}
