// 드로우 오케스트레이션 + 이벤트 소비(흔들림/번쩍/진동/의성어/필살·보스·사망 연출).
// core는 events만 발행 — 오디오는 src/audio/consume.ts, 클리어는 씬.
// 이벤트 → 손맛 숫자는 feel.ts(순수), 파티클은 effects.ts, 화면 단위(번쩍·테이프·링)는 screenfx.ts.
//
// ★박자: consumeEvents는 시뮬 틱마다, drawGame은 틱이 돈 프레임마다 한 번(main.ts) — draw마다 줄어드는 값은
// 틱마다 줄어드는 값으로 읽는다.

import type { DebrisPiece, FallingStack, GameState, JuiceEvent } from '../core/types';
import { AUDIO, BOSS, CAMERA, COSMETIC_COLORS, DEBRIS, JUICE, JUICE_SYS, PALETTE, PLAYER, SCORE, STACK, VIEW, WEAPON } from '../config';
import { onomatoFor, CAPTIONS, ITEM_COPY, destroyedCaption } from '../content';
import {
  initSprites, drawPlayer, drawHat, drawStack, drawBoss, drawEntity,
  drawGroundRocks, drawStackShadow, floorTile, setPlayerCosmetics, setPlayerWeapon,
} from './sprites';
import { drawChapterBackdrop } from './background';
import { cameraFollowY } from './camera';
import { vibrate } from '../platform/native';
import {
  drawBackEffects, drawEffects, resetEffects, setSlashColor, spawnBossBreak, spawnFloorShatter, spawnFromEvent, spawnStackShatter, tickEffects,
} from './effects';
import { bladeAura, drawBladeFx } from './bladeFx';
import { bossBodyHit, introFloorTop, resetBossFx, stepBossFx } from './executor';
import { addTrauma, defeatSlow, kickPx, pickHaptic, shakePx, shakeSample, stackScale, type HapticCounters } from './feel';
import * as fx from './screenfx';

/** 흔들림 진폭(px). 이벤트가 addTrauma로 쌓고 반감기 SHAKE_HALF_LIFE_F로 줄어든다. */
let trauma = 0;
/**
 * 카메라 보간 상태 (08-30 4차). cameraFollowY는 순수 목표값만 내고, 프레임간 추격은 여기서 한다 —
 * 목표값을 그대로 쓰면 데드존 진입 순간 화면이 툭 튄다. drawGame이 매 프레임 한 번 전진시킨다.
 */
let smoothCam = 0;
let shakeT = 0;
/** 방향 킥 — 화면이 위로 툭 튀었다 용수철로 돌아오는 변위(px)·속도. 흔들림 떨림과 따로 논다(첫 프레임이 곧 최대). */
let kickY = 0;
let kickV = 0;
const haptic: HapticCounters = { hit: 0, bossHit: 0 };
let shakeLevel: 0 | 1 | 2 = 2;
let vibrationOn = true;

// 몸 반응 타이머(틱) — 착지는 세로로 눌리고, 점프는 가로로 좁아진다(발 기준)
let landT = 0;
let jumpT = 0;
/** 맞은 층(맨 아래층) 흰 번쩍 남은 틱 */
let hitFlashT = 0;
/** 새 건물 양옆 낙하 선 남은 틱 */
let dropT = 0;
/** 지난 틱 콤보 — 고비(100·500)를 넘는 틱에 자막을 한 번 */
let lastCombo = 0;
/** 층 붕괴 때 시뮬이 뿌린 잔해에 그 층 그림 한 조각을 입힌다 — 시뮬 잔해는 크기만 안다(렌더 전용) */
interface DebrisSkin { tile: HTMLCanvasElement; sx: number; sy: number; sw: number; sh: number; x0: number }
const debrisSkin = new WeakMap<DebrisPiece, DebrisSkin>();
/** 방금 그린 건물 — 필살로 사라진 건물을 예비동작 동안 유령으로 다시 그리려고 쥔다 */
let lastStack: FallingStack | null = null;
/** 보스 상태 표식(`상태:틱`) — 히트스톱 동안 같은 틱이 반복돼도 한 번만 반응하려고 */
let bossMark = '';
/** 마지막으로 본 시뮬 틱 — 틱이 되감기면 새 런이다(미룬 필살 연출이 다음 판에 터지지 않게) */
let lastTick = -1;

/**
 * 필살 예비동작 — 히트스톱 동안 링이 수축하고, 끝나는 틱에 쥐고 있던 이벤트를 한꺼번에 푼다.
 * before = 시작할 때 서 있던 건물, cut = 풀면서 그 건물에서 부순 층 수(올려베기는 층을 아래부터 차례로 벤다).
 */
interface Prelude {
  left: number; total: number; x: number; y: number;
  ghost: FallingStack | null; held: JuiceEvent[];
  before: FallingStack | null; cut: number;
}
let prelude: Prelude | null = null;
/** 지금 쥐었던 묶음을 풀고 있는 예비동작 —그동안 lastStack은 이미 깎인(또는 사라진) 건물이다 */
let releasing: Prelude | null = null;

// 팝업은 월드 좌표로 저장하고 그릴 때 카메라를 한 번 적용한다(BL-09)
/** 의성어 — px = 글자 크기, life = 처음 틱(등장 튐·버티기·떠오름을 나이로 잰다), rot = 기울기 */
interface Popup { text: string; x: number; y: number; ticks: number; life: number; px: number; rot: number }
const popups: Popup[] = [];

/** 콤보 숫자 팝업 — 원작은 타격마다 하나씩 생겨 여러 개가 동시에 흩뿌려진다. */
interface NumPopup { n: number; x: number; y: number; vx: number; vy: number; ticks: number; scale: number; color: string }
const numPopups: NumPopup[] = [];
let popupSeed = 0;

/** 결정적 흩뿌림 — rngState는 core 전용이라 여기선 카운터 해시를 쓴다. */
function scatter(): number {
  popupSeed = (Math.imul(popupSeed, 1103515245) + 12345) & 0x7fffffff;
  return ((popupSeed >>> 8) / 0x7fffff) * 2 - 1; // −1..1
}

// 08-30(P1-3): letters 코스메틱 — 저콤보(<50) 팝업 기본색. 에스컬레이션 색은 공통.
let lettersColor: string = PALETTE.INK;

function comboColor(n: number): string {
  if (n >= 500) return PALETTE.RED;
  if (n >= 100) return PALETTE.YELLOW_DEEP;
  if (n >= 50) return PALETTE.BLUE;
  return lettersColor;
}

export function setFeedbackOptions(o: { shakeLevel?: 0 | 1 | 2; vibration?: boolean; flashLevel?: 0 | 1 | 2 }): void {
  if (o.shakeLevel !== undefined) shakeLevel = o.shakeLevel;
  if (o.vibration !== undefined) vibrationOn = o.vibration;
  if (o.flashLevel !== undefined) fx.setFlashLevel(o.flashLevel);
}

/** 런 하나가 쓰는 연출 상태를 전부 비운다 — 새 런·이어하기로 틱이 되감기면 consumeEvents가 부른다. */
function resetRunState(): void {
  resetEffects();
  fx.resetScreenFx();
  resetBossFx();
  trauma = 0;
  kickY = 0;
  kickV = 0;
  landT = 0;
  jumpT = 0;
  hitFlashT = 0;
  dropT = 0;
  lastCombo = 0;
  lastStack = null;
  bossMark = '';
  prelude = null;
  lastTick = -1;
  popups.length = 0;
  numPopups.length = 0;
}

export function initRenderer(): void {
  initSprites();
  resetRunState();
  smoothCam = 0;
}

/** 장착 코스메틱 일괄 적용 — 씬이 런 시작·장착 변경 시 호출 (08-30, P1-3) */
export function applyCosmetics(loadout: { body: string; blade: string; letters: string }): void {
  const body = COSMETIC_COLORS.body[loadout.body] ?? COSMETIC_COLORS.body.ink;
  const blade = COSMETIC_COLORS.blade[loadout.blade] ?? COSMETIC_COLORS.blade.wire;
  lettersColor = COSMETIC_COLORS.letters[loadout.letters] ?? COSMETIC_COLORS.letters.flyer;
  setPlayerCosmetics(body, blade);
  setSlashColor(blade);
}

/** 사망 — 붉은 번쩍·틀·잠깐 느린 파편. 화면 전환은 B(씬)가 늦춘 만큼 이 연출이 캔버스를 채운다. */
function onDeath(): void {
  fx.flash({ color: PALETTE.RED, a: 0.42, ticks: JUICE_SYS.DEATH_FLASH_TICKS });
  fx.startDeath();
  fx.markDeathSlow();
}

/** 번쩍 — 이벤트마다 색·단. 플레이 화면에서 큰 순간일수록 단이 많다. */
function reactFlash(e: JuiceEvent): void {
  const spec = JUICE[e.kind];
  switch (e.kind) {
    case 'hurt':
      fx.flash({ color: PALETTE.RED, a: 0.3, ticks: spec.flash });
      return;
    case 'lifeLost':
      if ((e.n ?? 1) <= 0) onDeath();
      return;
    case 'special': // 2단 — 종이가 하얗게 날아갔다가 잉크로 눌린다
      fx.flash({ color: PALETTE.BG, a: 0.6, ticks: 3 }, { color: PALETTE.INK, a: 0.35, ticks: spec.flash });
      return;
    case 'bossDefeat': // 아이보리 12틱 감쇠
      fx.flash({ color: PALETTE.BG, a: 0.85, ticks: 12 });
      return;
    case 'boltStrike': // 가볍게 — 같은 틱의 피격(붉은 0.3)을 덮지 않는다(약한 새 번쩍은 무시된다)
      fx.flash({ color: PALETTE.BG, a: 0.25, ticks: spec.flash });
      return;
    case 'phaseClear': // 티어 포효 — 아이보리 → 잉크 + 공사 테이프 두 줄
      if ((e.n ?? 0) >= 100) {
        fx.flash({ color: PALETTE.BG, a: 0.5, ticks: 3 }, { color: PALETTE.INK, a: 0.3, ticks: 4 });
        fx.startTape();
      }
      return;
    case 'hit': // 연타 장면이 번쩍이면 눈이 아프다 — 맞은 층만 하얗게(drawHitFlash)
    case 'floorCollapse': // 화면 전체가 회색으로 눌려 탁해졌다 — 층 조각·킥·별이 대신한다
      return;
    default:
      if (spec && spec.flash > 0) fx.flash({ color: PALETTE.INK, a: Math.min(0.4, 0.1 * spec.flash), ticks: spec.flash });
  }
}

/** 몸·지면 반응(렌더 전용) — 눌림 타이머, 가드 지면선, 보스 본체 피격. */
function reactBody(e: JuiceEvent): void {
  switch (e.kind) {
    case 'jump': jumpT = JUICE_SYS.SQUASH_TICKS; return;
    case 'land': if (e.lane === undefined) landT = JUICE_SYS.SQUASH_TICKS; return;
    case 'guardBounce':
    case 'guardAirBounce': fx.startGroundLine(); return;
    case 'hit': if (e.mat) hitFlashT = JUICE_SYS.HIT_FLASH_TICKS; return; // 재질이 있으면 건물 층을 친 것
    case 'bossHit':
      // n = 본체 남은 HP(드론·대포 격파엔 없다). 10타마다 턱이 한 번 덜컥.
      if (e.n !== undefined) bossBodyHit(e.n % 10 === 0);
      return;
    default:
  }
}

/**
 * 부서진 층(방금 그린 건물의 맨 아래층)을 그 층 그림째 부순다. 건물 층 수가 실제로 줄었을 때만 —
 * 화산탄 더미 탈출도 floorCollapse라서, 그때 떨어지던 건물을 대신 부수면 안 된다.
 * 같은 틱에 시뮬이 뿌린 잔해(수명이 막 시작된 것)에도 같은 그림의 한 조각을 입힌다.
 * 예비동작이 쥐었다 푼 붕괴는 그때 서 있던 건물에서 아래층부터 차례로 — 유령이 있으면 유령이 통째로 부순다.
 */
function shatterFloor(s: GameState, e: JuiceEvent): void {
  let st = lastStack;
  let i = 0;
  if (releasing) {
    st = releasing.ghost ? null : releasing.before;
    i = releasing.cut++;
  } else if (!st || st.floors.length <= (s.stack?.floors.length ?? 0)) return;
  const f = st?.floors[i];
  if (!st || !f || typeof document === 'undefined') return;
  const tile = floorTile(f.mat, st.theme, i, st.floors.length, s.gimmick);
  const w = st.variant === 'butterbar' ? VIEW.BUTTER_W : VIEW.LANE_W;
  const bottom = VIEW.GROUND_Y - (e.y ?? st.y);
  spawnFloorShatter(tile, VIEW.LANE_X[0] - w / 2, bottom - f.h, w, f.h, Math.min(1.4, WEAPON[s.weapon].shake));
  if (!tile) return;
  const kx = tile.width / w;
  const ky = tile.height / f.h;
  for (const d of s.debris) {
    if (d.life < DEBRIS.LIFE_F - 2 || debrisSkin.has(d)) continue;
    const sw = Math.min(tile.width, d.w * kx);
    const sh = Math.min(tile.height, d.h * ky);
    debrisSkin.set(d, {
      tile, sw, sh, x0: d.x,
      sx: (tile.width - sw) * (0.5 + 0.5 * scatter()),
      sy: (tile.height - sh) * (0.5 + 0.5 * scatter()),
    });
  }
}

/** 큰 한 방의 화면 반응 — 집중선(완파·필살·격파) · 반전(큰 완파·필살·격파) · 완파 자막. */
function reactImpact(s: GameState, e: JuiceEvent): void {
  const headY = VIEW.GROUND_Y - s.player.y - PLAYER.H + smoothCam; // 화면 좌표
  switch (e.kind) {
    case 'stackDestroy': {
      const n = e.n ?? 0;
      fx.startImpact(VIEW.LANE_X[0], headY, n >= JUICE_SYS.IMPACT_FLOORS);
      // 버터바(보너스)는 겹 수로 점수가 따로 붙는다 — 일반 건물만 층수·완파 점수 자막.
      // 모드로는 못 가린다: 마지막 버터바를 부순 틱에 core가 같은 틱 안에서 본편으로 돌아간다
      const gone = releasing ? releasing.ghost ?? releasing.before : lastStack;
      if (gone?.variant !== 'butterbar') fx.startCaption(destroyedCaption(n), `+${SCORE.DESTROY_BONUS.toLocaleString('en-US')}`);
      return;
    }
    case 'special': fx.startImpact(VIEW.LANE_X[s.player.lane], headY, true); return;
    case 'bossDefeat': fx.startImpact(VIEW.W / 2, VIEW.FIELD_TOP + (VIEW.FIELD_H - VIEW.FIELD_TOP) * 0.45, true); return;
    default:
  }
}

/** 콤보 고비(100·500)를 넘는 틱에 자막 한 번 — 끊기면 다시 센다. 필살 예비동작과 무관하게 틱마다 본다. */
function watchCombo(s: GameState): void {
  const c = s.combo;
  // 한 번에 크게 뛴 콤보(이어하기가 148·168로 바로 넣는다)는 친 게 아니다 — 고비 소리와 같은 기준
  if (c - lastCombo <= AUDIO.MILESTONE_MAX_JUMP) {
    if (lastCombo < 100 && c >= 100) fx.startCaption(CAPTIONS.combo100, '100 콤보');
    else if (lastCombo < 500 && c >= 500) fx.startCaption(CAPTIONS.combo500, '500 콤보');
  }
  lastCombo = c;
}

/** 의성어 글자 크기 — 타격은 작게, 무너질수록 크게. 콤보가 오르면 조금씩 더 커진다. */
function onomatoPx(e: JuiceEvent, combo: number): number {
  const base = JUICE_SYS.ONOMATO_PX;
  switch (e.kind) {
    case 'hit': return base * 0.8 * (1 + Math.min(combo / 500, 0.6));
    case 'floorCollapse': return base * 1.1 * (1 + Math.min(combo / 500, 0.6));
    case 'stackDestroy': return base * 1.5 * Math.min(1.5, stackScale(e.n));
    case 'special':
    case 'bossDefeat': return base * 2;
    default: return base;
  }
}

/** 이벤트 하나가 화면에 일으키는 모든 것. 필살 예비동작이 끝난 뒤에는 쥐고 있던 묶음이 이 길로 들어온다. */
function react(s: GameState, e: JuiceEvent): void {
  const ws = WEAPON[s.weapon].shake;
  const px = shakePx(e, ws);
  if (px > 0) trauma = addTrauma(trauma, px);
  const kick = kickPx(e, ws);
  if (kick > 0) kickY = Math.max(-JUICE_SYS.SHAKE_MAX_AMP, kickY - kick);
  reactFlash(e);
  reactBody(e);
  reactImpact(s, e);
  // 히트스톱은 core(sim advance 말미)가 주입한다 — 렌더러는 상태를 쓰지 않는다 (08-30, P0-5)
  spawnFromEvent(s, e);
  if (e.kind === 'floorCollapse') shatterFloor(s, e);
  // 콤보 숫자 팝업 (타격마다 1개, 상한까지 누적)
  if (e.kind === 'hit' || e.kind === 'bossHit') {
    const n = e.combo ?? s.combo;
    if (n > 0) {
      if (numPopups.length >= JUICE_SYS.COMBO_POPUP_MAX) numPopups.shift();
      numPopups.push({
        n,
        x: VIEW.LANE_X[0] + scatter() * 22,
        y: VIEW.GROUND_Y - (e.y ?? 100) - 12 + scatter() * 10,
        vx: scatter() * 0.9,
        vy: -1.4 - Math.abs(scatter()) * 0.8,
        ticks: JUICE_SYS.COMBO_POPUP_LIFE_F,
        scale: 1 + Math.min(n / 400, 1.1),
        color: comboColor(n),
      });
    }
  }
  // 의성어 (동시 3개 상한)
  const combo = e.combo ?? s.combo;
  let word = onomatoFor(e.kind, combo);
  if (e.kind === 'special') {
    word = onomatoFor(s.waza === 'ageba' ? 'specialAgeba' : s.waza === 'tetsu' ? 'specialTetsu' : 'special', combo);
  }
  if (word && combo >= 999) word = CAPTIONS.combo999;
  // 상자는 뭘 받았는지가 정보다 — 콤보 자막보다 앞선다
  const supply = e.kind === 'supply';
  if (supply && e.item) word = ITEM_COPY[e.item].pop;
  if (word) {
    // 같은 말이 아직 떠 있으면 그 자리에서 다시 튀운다 — 13px 어긋나 겹치면 「우우르르」로 읽힌다
    const same = popups.findIndex((p) => p.text === word);
    if (same >= 0) popups.splice(same, 1);
    else if (popups.length >= JUICE_SYS.ONOMATOPOEIA_MAX) popups.shift();
    const life = e.kind === 'special' || supply ? 40 : e.kind === 'stackDestroy' ? 32 : 24;
    popups.push({
      text: word,
      x: VIEW.LANE_X[0] + ((combo * 13) % 30) - 15,
      // 완파는 이벤트 y가 없다 — 머리 위(마지막 층이 있던 자리)에 박는다
      y: VIEW.GROUND_Y - (e.y ?? s.player.y + PLAYER.H + 20) - 30,
      ticks: life,
      life,
      px: onomatoPx(e, combo),
      rot: -0.08 + scatter() * 0.12,
    });
  }
}

/** 한 틱의 이벤트 묶음을 풀고, 겹친 진동은 가장 긴 하나만 쏜다. */
function playEvents(s: GameState, evs: readonly JuiceEvent[]): void {
  for (const e of evs) react(s, e);
  if (!vibrationOn) return;
  const pat = pickHaptic(evs, haptic);
  if (pat !== null) vibrate(pat); // 네이티브=Haptics(세그먼트 체인), 웹=navigator.vibrate (throw 없음)
}

/**
 * 필살 예비동작 시작 — core는 입력 틱에 건물을 지우고 히트스톱 10틱을 건다(즉응성이 생명이라 그대로).
 * 렌더는 그 정지 동안: ① 사라진 건물을 유령으로 다시 그리고 ② 링을 안으로 수축시키며 ③ 폭발·흔들림·번쩍을 미룬다.
 * 끝나는 틱에 쥐고 있던 이벤트를 한꺼번에 푼다.
 */
function beginPrelude(s: GameState, evs: readonly JuiceEvent[]): void {
  const total = JUICE.special.hitstop;
  const gone = evs.find((e) => e.kind === 'stackDestroy');
  // 이 묶음에서 건물이 통째로 사라졌고, 방금 그린 건물이 그것일 때만 유령을 쓴다(올려베기로 일부만 깎인 건물은 그대로 서 있다)
  const ghost = gone && !s.stack && lastStack && lastStack.totalFloors === gone.n ? lastStack : null;
  prelude = {
    left: total, total,
    x: VIEW.LANE_X[s.player.lane],
    y: VIEW.GROUND_Y - s.player.y - PLAYER.H / 2,
    ghost,
    held: evs.slice(), // 씬이 소비 뒤 events를 비우므로 복사
    before: lastStack,
    cut: 0,
  };
}

function releasePrelude(s: GameState): void {
  const p = prelude!;
  prelude = null;
  const ghost = p.ghost;
  if (ghost) {
    spawnStackShatter(ghost, typeof document === 'undefined' ? undefined
      : (i) => floorTile(ghost.floors[i].mat, ghost.theme, i, ghost.floors.length, s.gimmick));
  }
  releasing = p;
  playEvents(s, p.held);
  releasing = null;
}

/** 보스 상태 읽기만으로 일어나는 연출 — 입장 BREAK 틱(물고 온 층이 부서진다) · 격파 몸체 갈라짐 시작. */
function watchBoss(s: GameState): void {
  const b = s.boss;
  if (!b) { bossMark = ''; return; }
  const mark = `${b.st}:${b.stTick}`;
  if (mark === bossMark) return;
  bossMark = mark;
  if (b.st === 'enter' && b.stTick === BOSS.INTRO.BREAK) {
    trauma = addTrauma(trauma, JUICE.bossBreak.shake);
    spawnBossBreak(VIEW.W / 2, introFloorTop(b, VIEW.GROUND_Y) + VIEW.FLOOR_H / 2);
  } else if (b.st === 'defeated' && b.stTick === BOSS.DEFEAT_SPLIT_TICK) {
    trauma = addTrauma(trauma, JUICE.bossSplit.shake);
  }
}

/** 이벤트 소비: 흔들림/번쩍/의성어/진동/보스·필살 연출. 사운드는 audio/consume. 소비 후 clear는 호출자가. */
export function consumeEvents(s: GameState): void {
  if (s.tick < lastTick) resetRunState();
  lastTick = s.tick;
  watchBoss(s);
  watchCombo(s);
  if (prelude) {
    prelude.left -= 1;
    if (prelude.left <= 0) releasePrelude(s);
  }
  const evs = s.events;
  if (evs.length === 0) return;
  if (!prelude && evs.some((e) => e.kind === 'special')) beginPrelude(s, evs);
  else playEvents(s, evs);
}

/**
 * 이번 draw의 화면 변위 [dx, dy, 회전]. 떨림(shakeSample — 부드러운 사인 잡음)에 킥(위로 툭 → 용수철 복귀)을 더한다.
 * 떨림은 잡음 위상에 따라 첫 프레임이 작을 수 있어, '맞은 순간'은 킥이 맡는다. 설정 1은 절반, 0은 둘 다 끈다.
 */
function shakeNow(): [number, number, number] {
  shakeT += 1;
  const k = shakeLevel === 0 ? 0 : shakeLevel === 1 ? 0.5 : 1;
  const [dx, dy, rot] = trauma > 0.02 ? shakeSample(trauma * k, shakeT) : [0, 0, 0];
  const out: [number, number, number] = [dx, dy + kickY * k, rot];
  kickV = kickV * (1 - JUICE_SYS.KICK_DAMP) - JUICE_SYS.KICK_SPRING * kickY;
  kickY += kickV;
  if (Math.abs(kickY) < 0.05 && Math.abs(kickV) < 0.05) { kickY = 0; kickV = 0; }
  return out;
}

/** 파티클·카메라 배속 — 사망 직후와 보스 격파 뒤에만 1 미만(core 틱은 그대로). */
function slowFactor(s: GameState): number {
  const k = fx.deathSlow();
  return s.boss?.st === 'defeated' ? Math.min(k, defeatSlow(s.boss.stTick)) : k;
}

/** orbit: 건물이 궤도에서 풀려 새로 나타난 프레임 — 아이보리 번쩍 한 번(설정 번쩍임 0이면 안 보인다). */
function watchOrbitDrop(s: GameState): void {
  if (s.gimmick !== 'orbit' || !s.stack || lastStack || s.over) return;
  fx.flash({ color: PALETTE.BG, a: JUICE_SYS.ORBIT_FLASH_A, ticks: JUICE_SYS.ORBIT_FLASH_TICKS });
}

/** orbit: 필드 맨 위에서 지면까지 1px 잉크 헤어라인(직하 낙하선) + 위쪽 가로 눈금. 월드 좌표 — 건물이 위에서 덮는다. */
function drawOrbitBeam(ctx: CanvasRenderingContext2D, s: GameState, cam: number): void {
  if (s.gimmick !== 'orbit' || !s.stack || s.stack.resting || s.over) return;
  const top = VIEW.FIELD_TOP - cam;
  ctx.save();
  ctx.globalAlpha = JUICE_SYS.ORBIT_BEAM_A;
  ctx.fillStyle = PALETTE.INK;
  ctx.fillRect(VIEW.LANE_X[0] - 0.5, top, 1, VIEW.GROUND_Y - top);
  ctx.fillRect(VIEW.LANE_X[0] - 6, top, 12, 1);
  ctx.restore();
}

/** night: 필드 전체에 잉크 12% 워시 — 건물·보스까지 어둡게, 플레이어는 그 위에 그려 또렷하게 남긴다. */
function drawNightWash(ctx: CanvasRenderingContext2D, cam: number): void {
  ctx.save();
  ctx.globalAlpha = JUICE_SYS.NIGHT_WASH_A;
  ctx.fillStyle = PALETTE.INK;
  ctx.fillRect(-16, VIEW.FIELD_TOP - cam, VIEW.W + 32, VIEW.FIELD_H - VIEW.FIELD_TOP);
  ctx.restore();
}

export function drawGame(ctx: CanvasRenderingContext2D, s: GameState): void {
  const slow = slowFactor(s);
  tickEffects(slow);

  const camTarget = cameraFollowY(s);
  smoothCam += (camTarget - smoothCam) * CAMERA.LERP * slow;
  if (Math.abs(camTarget - smoothCam) < 0.5) smoothCam = camTarget;
  const cam = smoothCam;
  const [sx, sy, rot] = shakeNow();
  trauma -= 0.693 / JUICE_SYS.SHAKE_HALF_LIFE_F * trauma;
  ctx.save();
  // 필드 한가운데를 축으로 흔든다 — 회전이 한쪽 모서리에 치우치지 않게
  const pivotY = (VIEW.FIELD_TOP + VIEW.FIELD_H) / 2;
  ctx.translate(VIEW.W / 2 + sx, pivotY + sy);
  if (rot !== 0) ctx.rotate(rot);
  ctx.translate(-VIEW.W / 2, -pivotY);

  ctx.fillStyle = bgColor(s);
  ctx.fillRect(-48, -48, VIEW.W + 96, VIEW.H + 96); // 흔들림·회전에도 가장자리가 비지 않게 크게

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, VIEW.FIELD_TOP, VIEW.W, VIEW.FIELD_H - VIEW.FIELD_TOP);
  ctx.clip();
  // 배경은 얕게만 따라온다 — 하늘이 통째로 딸려 오르면 카메라가 움직인 게 아니라
  // 화면이 흔들린 것처럼 읽힌다(깊이 단서 상실).
  ctx.save();
  ctx.translate(0, cam * CAMERA.BG_PARALLAX);
  drawChapterBackdrop(ctx, s);
  ctx.restore();
  ctx.translate(0, cam);
  ctx.fillStyle = '#DDD8CC';
  ctx.fillRect(-16, VIEW.GROUND_Y, VIEW.W + 32, VIEW.H - VIEW.GROUND_Y);
  fx.drawGroundLine(ctx);
  watchOrbitDrop(s);
  if (s.stack && !lastStack && !s.over) dropT = JUICE_SYS.DROP_STREAK_TICKS;
  drawOrbitBeam(ctx, s, cam);

  const g = VIEW.GROUND_Y;
  if (s.stack) {
    drawStackShadow(ctx, s.stack, g);
    drawDropStreaks(ctx, s.stack, g, cam);
    drawStack(ctx, s.stack, g, s.gimmick);
    drawHitFlash(ctx, s.stack, g);
  }
  if (prelude?.ghost) {
    // 사라진 건물의 유령 — 정지된 동안 점점 옅어진다
    ctx.save();
    ctx.globalAlpha = JUICE_SYS.PRELUDE_GHOST_ALPHA * (0.55 + 0.45 * (prelude.left / prelude.total));
    drawStack(ctx, prelude.ghost, g, s.gimmick);
    ctx.restore();
  }
  drawDebris(ctx, s, g);
  drawBackEffects(ctx); // 층 조각·먼지 구름은 건물과 같은 층 — 졸라맨을 덮지 않게 플레이어보다 먼저
  drawGroundRocks(ctx, s.groundRocks, g);
  for (const e of s.entities) {
    if (e.kind === 'stack') continue;
    // 번개 예고 마커는 대응 신호 — 카메라와 무관하게 화면 고정으로 아래 별도 패스 (08-30, P0-4)
    if (e.kind === 'bolt' && e.cueTicks > 0) continue;
    drawEntity(ctx, e, g);
  }
  if (s.boss) drawBoss(ctx, s.boss, g);
  if (s.gimmick === 'night') drawNightWash(ctx, cam);

  // ★08-30 계약 개정: 관통 시각화(반투명·스침 획·착지 위험 표시)는 전부 제거했다.
  // 밑면이 막고 누르는 세계에서는 "통과 중"이라는 상태 자체가 없다 — 없는 것을 그리면 거짓말이다.
  // 접촉 피드백은 core가 발행하는 headBonk 이벤트(먼지·소리·진동)가 진다.
  // 피격 직후(≤HIT_IFRAMES)만 점멸 — 디버그 상시 무적은 통짜로 그린다 (08-30, D-2)
  const shortInvuln = s.player.invulnTicks > 0 && s.player.invulnTicks <= PLAYER.HIT_IFRAMES;
  setPlayerWeapon(s.weapon);
  bladeAura(s); // 대검 칼 기운 — 지금 포즈의 칼날에서
  if (!shortInvuln || s.player.invulnTicks % 6 < 4 || s.player.pose === 'special') {
    const px = VIEW.LANE_X[s.player.lane];
    const footY = g - s.player.y;
    // 몸 반응 — 착지 3틱은 납작하게(y 0.9), 점프 3틱은 홀쭉하게(x 0.92). 발 기준이라 발은 안 뜬다.
    const flat = s.player.pose === 'pinned' || s.player.pose === 'dead';
    const sqX = !flat && jumpT > 0 ? JUICE_SYS.SQUASH_JUMP_X : 1;
    const sqY = !flat && landT > 0 ? JUICE_SYS.SQUASH_LAND_Y : 1;
    const squash = sqX !== 1 || sqY !== 1;
    if (squash) {
      ctx.save();
      ctx.translate(px, footY);
      ctx.scale(sqX, sqY);
      ctx.translate(-px, -footY);
    }
    drawPlayer(ctx, s.player.pose, s.player.poseTick, px, footY);
    if (s.hat) drawHat(ctx, s.player.pose, s.player.poseTick, px, footY);
    if (squash) ctx.restore();
  }
  if (prelude) fx.drawPrelude(ctx, 1 - prelude.left / prelude.total, prelude.x, prelude.y);
  ctx.restore();

  // 필드 클립 재적용 — 파티클·팝업·마커가 조작 존(하단 170px)을 침범하지 않게 (08-30, P1-5)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, VIEW.FIELD_TOP, VIEW.W, VIEW.FIELD_H - VIEW.FIELD_TOP);
  ctx.clip();
  // 화면 고정 예고 마커 — 카메라 변환 밖 (공중에서도 절대 안 사라진다)
  for (const e of s.entities) {
    if (e.kind === 'bolt' && e.cueTicks > 0) drawEntity(ctx, e, g);
  }
  drawSpawnCue(ctx, s);
  fx.drawHeatEdges(ctx, s.combo);
  drawEffects(ctx, cam);
  drawBladeFx(ctx, cam);
  ctx.save();
  ctx.translate(0, cam);
  drawNumPopups(ctx);
  drawPopups(ctx);
  ctx.restore();
  ctx.restore();
  ctx.restore();

  // 필드 상단 규칙선 — 건물이 클립 경계에서 '툭' 나타나는 걸 프레임 안으로 들어오는 것으로
  // 읽히게 한다. 조작 존 상단(#touch-layer::after)과 같은 굵기·같은 농도로 맞춘 액자 두 변.
  ctx.fillStyle = 'rgba(26, 26, 32, 0.16)';
  ctx.fillRect(0, VIEW.FIELD_TOP, VIEW.W, 1);

  // 지면 인디케이터 (08-30 4차) — 카메라가 올라가 지면선이 화면 아래로 빠진 동안에만 뜬다.
  // 추종 카메라를 폐기했던 근거가 "지면이 화면 밖"이었다. 카메라는 되살리되 그 정보만은
  // 화면에 붙박아 둔다: 바닥변의 지면선 + 플레이어 레인의 착지 눈금.
  if (cam > 0.5) {
    const a = Math.min(1, cam / CAMERA.MAX);
    ctx.save();
    ctx.globalAlpha = 0.14 + 0.30 * a;
    ctx.fillStyle = PALETTE.INK;
    ctx.fillRect(0, VIEW.FIELD_H - 2, VIEW.W, 2);
    const px = VIEW.LANE_X[s.player.lane];
    ctx.fillRect(px - 15, VIEW.FIELD_H - 8, 30, 2);
    ctx.restore();
  }

  // 화면 위에 얹는 것들(흔들리지 않는다): 공사 테이프 · 사망 틀 · 번쩍
  fx.drawScreenOverlay(ctx);

  // 틱 단위 타이머를 한 칸 흘린다 — 그린 다음에 줄여야 이벤트가 켠 값이 한 번은 보인다
  fx.stepScreenFx();
  stepBossFx();
  if (landT > 0) landT -= 1;
  if (jumpT > 0) jumpT -= 1;
  if (hitFlashT > 0) hitFlashT -= 1;
  if (dropT > 0) dropT -= 1;
  // 층 배열은 복사해 둔다 — 올려베기는 층을 하나씩 splice한 뒤 건물을 지워서, 참조만 쥐면 유령이 빈 건물이 된다
  lastStack = s.stack ? { ...s.stack, floors: s.stack.floors.slice() } : null;
}

/** 맞은 맨 아래층만 하얗게 — 화면 전체 번쩍 대신(연타 장면이 번쩍이면 눈이 아프다). 번쩍임 설정을 탄다. */
function drawHitFlash(ctx: CanvasRenderingContext2D, st: FallingStack, g: number): void {
  if (hitFlashT <= 0) return;
  const f = st.floors[0];
  const a = JUICE_SYS.HIT_FLASH_A * (hitFlashT / JUICE_SYS.HIT_FLASH_TICKS) * fx.flashK();
  if (!f || a < 0.02) return;
  const w = st.variant === 'butterbar' ? VIEW.BUTTER_W : VIEW.LANE_W;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(VIEW.LANE_X[0] - w / 2, g - st.y - f.h, w, f.h);
  ctx.restore();
}

/** 새 건물이 막 나타난 동안 양옆에 낙하 선 — 위에서 '떨어져 들어온다'가 읽힌다. 화면에 보이는 높이까지만. */
function drawDropStreaks(ctx: CanvasRenderingContext2D, st: FallingStack, g: number, cam: number): void {
  if (dropT <= 0) return;
  const a = dropT / JUICE_SYS.DROP_STREAK_TICKS;
  const w = st.variant === 'butterbar' ? VIEW.BUTTER_W : VIEW.LANE_W;
  const bottom = g - st.y;
  const top = VIEW.FIELD_TOP - cam; // 화면 맨 위(월드 좌표)
  if (bottom <= top) return;
  ctx.save();
  ctx.globalAlpha = 0.55 * a;
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = VIEW.LANE_X[0] + side * (w / 2 + 5 + (i >> 1) * 6);
    const len = (bottom - top) * (0.35 + 0.2 * (i >> 1)) * a;
    ctx.moveTo(x, bottom - 6 - len);
    ctx.lineTo(x, bottom - 6);
  }
  ctx.stroke();
  ctx.restore();
}

function drawDebris(ctx: CanvasRenderingContext2D, s: GameState, groundY: number): void {
  for (const d of s.debris) {
    const a = Math.min(1, d.life / 18);
    const top = groundY - d.y - d.h;
    const skin = debrisSkin.get(d);
    ctx.save();
    ctx.globalAlpha = a;
    if (skin) {
      // 부서진 층 그림의 한 조각 — 굴러간 거리만큼 기운다
      ctx.translate(d.x, top + d.h / 2);
      ctx.rotate(Math.max(-0.35, Math.min(0.35, (d.x - skin.x0) * 0.01)));
      ctx.drawImage(skin.tile, skin.sx, skin.sy, skin.sw, skin.sh, -d.w / 2, -d.h / 2, d.w, d.h);
      // 잔해 명도로 눌러 둔다 — 졸라맨이 위에 서도 선이 묻히지 않게(PALETTE 명도 위계)
      ctx.globalAlpha = a * 0.35;
      ctx.fillStyle = PALETTE.RUBBLE;
      ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
      ctx.globalAlpha = a;
      ctx.strokeStyle = PALETTE.INK;
      ctx.lineWidth = 2;
      ctx.strokeRect(-d.w / 2, -d.h / 2, d.w, d.h);
      ctx.restore();
      continue;
    }
    // ★08-30 7차: 구 채움 '#3A3A42' 는 캐릭터 잉크(#1A1A20)와 명도가 붙어 있었다 —
    // 졸라맨은 선만 있는 형상이라 잔해 더미 위에 올라서면 통째로 삼켜졌다. PALETTE 명도 위계 참조.
    ctx.fillStyle = PALETTE.RUBBLE;
    ctx.fillRect(d.x - d.w / 2, top, d.w, d.h);
    ctx.strokeStyle = PALETTE.INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(d.x - d.w / 2, top, d.w, d.h);
    ctx.restore();
  }
}

function bgColor(s: GameState): string {
  if (s.mode === 'bonus') return '#FFF8DC';
  if (s.act2Phase === 'moon') return '#E4E0D6';
  if (s.mode === 'act2') return '#EAE6DA';
  const by = ['#F4F1E8', '#F0EEE4', '#F2EDE2', '#EFEDE6'];
  return by[s.chapter % 4];
}

/**
 * 다음 건물 예고. 완파 후 스폰까지의 공백이 아무 신호 없는 빈 화면이었다(08-30 7차).
 * 번개 큐와 같은 규칙을 따른다 — 카메라 변환 **밖**, 필드 상단 고정, 잉크 실루엣.
 * 렌더 전용이라 시뮬은 안 건드린다: 읽는 값은 `stackSpawnCd` 하나뿐이다.
 */
function drawSpawnCue(ctx: CanvasRenderingContext2D, s: GameState): void {
  if (s.stack || s.over) return;
  const cd = s.stackSpawnCd;
  if (cd <= 0 || cd > STACK.SPAWN_CUE_TICKS) return;

  const x = VIEW.LANE_X[s.player.lane] ?? VIEW.LANE_X[0];
  const y = VIEW.FIELD_TOP + 16;
  const t = 1 - cd / STACK.SPAWN_CUE_TICKS;   // 0 → 1 로 다가온다
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.45 * t;
  // 낙하 경로 안내선 — 어디로 떨어지는지가 정보다
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.moveTo(x, y + 12);
  ctx.lineTo(x, y + 12 + 26 * t);
  ctx.stroke();
  ctx.setLineDash([]);
  // ▼ 마커 — 공사 표지처럼 노랑 면 + 잉크 테 + 흰 헤일로(밝은 배경·어두운 배경 양쪽에서 산다). 다가올수록 빨리 뛴다.
  const r = 10 + 2.5 * Math.abs(Math.sin(t * t * Math.PI * 5));
  ctx.globalAlpha = 0.5 + 0.5 * t;
  ctx.beginPath();
  ctx.moveTo(x - r, y - r * 0.7);
  ctx.lineTo(x + r, y - r * 0.7);
  ctx.lineTo(x, y + r * 0.8);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = PALETTE.YELLOW;
  ctx.fill();
  ctx.strokeStyle = PALETTE.INK;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
}

function drawNumPopups(ctx: CanvasRenderingContext2D): void {
  for (let i = numPopups.length - 1; i >= 0; i--) {
    const p = numPopups[i];
    p.ticks -= 1;
    if (p.ticks <= 0) { numPopups.splice(i, 1); continue; }
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.09;            // 살짝 떨어지며 사라짐
    const t = p.ticks / JUICE_SYS.COMBO_POPUP_LIFE_F;
    const pop = p.ticks > JUICE_SYS.COMBO_POPUP_LIFE_F - 3 ? 1.35 : 1; // 등장 순간 튐
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 2.2);
    ctx.translate(p.x, p.y);
    ctx.font = `${Math.round(JUICE_SYS.COMBO_POPUP_PX * p.scale * pop)}px "Black Han Sans", sans-serif`;
    ctx.textAlign = 'center';
    // ★08-30 7차 이중 외곽선: 아이보리 헤일로 하나만 두면 **배경색과 같은 색**이라
    // 밝은 건물 면 위에서 통째로 사라진다(사용자 영상 판정). 잉크 링을 바깥에 하나 더 둘러
    // 밝은 곳/어두운 곳 양쪽에서 최소 한 겹은 살아남게 한다.
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = PALETTE.INK;
    ctx.strokeText(String(p.n), 0, 0);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = PALETTE.WHITE;
    ctx.strokeText(String(p.n), 0, 0);
    ctx.fillStyle = p.color;
    ctx.fillText(String(p.n), 0, 0);
    ctx.restore();
  }
}

/**
 * 의성어 — 크게 박혔다가(ONOMATO_POP배 → 1, ONOMATO_POP_TICKS) 제자리에서 버티고, 끝 8틱에 떠오르며 사라진다.
 * 잉크 그림자를 한 겹 깔아 글자가 화면에 '찍힌' 것처럼 읽힌다.
 */
function drawPopups(ctx: CanvasRenderingContext2D): void {
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.ticks -= 1;
    if (p.ticks <= 0) { popups.splice(i, 1); continue; }
    const age = p.life - p.ticks;
    const popU = Math.max(0, 1 - age / JUICE_SYS.ONOMATO_POP_TICKS);
    const pop = 1 + (JUICE_SYS.ONOMATO_POP - 1) * popU * popU;
    const rise = p.ticks < 8 ? (8 - p.ticks) * 1.6 : 0;
    ctx.save();
    ctx.globalAlpha = Math.min(1, p.ticks / 8);
    ctx.translate(p.x, p.y - rise);
    ctx.rotate(p.rot);
    ctx.scale(pop, pop);
    ctx.font = `${Math.round(p.px)}px "Black Han Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = PALETTE.INK;
    ctx.fillStyle = PALETTE.INK;
    ctx.strokeText(p.text, 2.5, 3);     // 그림자
    ctx.fillText(p.text, 2.5, 3);
    ctx.strokeText(p.text, 0, 0);       // 노랑 채움은 아이보리 배경에서 제일 약하다 — 잉크 링 필수
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#FFFFFF';
    ctx.strokeText(p.text, 0, 0);
    ctx.fillStyle = PALETTE.YELLOW_DEEP;
    ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }
}
