// 드로우 오케스트레이션 + 이벤트 소비(흔들림/번쩍/진동/의성어/필살·보스·사망 연출).
// core는 events만 발행 — 오디오는 src/audio/consume.ts, 클리어는 씬.
// 이벤트 → 손맛 숫자는 feel.ts(순수), 파티클은 effects.ts, 화면 단위(번쩍·테이프·링)는 screenfx.ts.
//
// ★박자: consumeEvents는 시뮬 틱마다, drawGame은 틱이 돈 프레임마다 한 번(main.ts) — draw마다 줄어드는 값은
// 틱마다 줄어드는 값으로 읽는다.

import type { DebrisPiece, FallingStack, GameState, JuiceEvent } from '../core/types';
import {
  AUDIO, BOSS, CAMERA, COMBO_MARK, COSMETIC_COLORS, DEBRIS, HAT_FX, JUICE, JUICE_SYS, PALETTE, PLAYER, SCORE, SEAL_INK, STACK, VIEW, WEAPON,
} from '../config';
import { brushLine, enso, inkDrop } from './ink';
import { onomatoFor, ITEM_COPY, destroyedCaption } from '../content';
import {
  initSprites, drawPlayer, drawHat, drawMask, drawStack, drawBoss, drawEntity, hardHat, hatSpot,
  drawGroundRocks, drawStackShadow, floorTile, setPlayerCosmetics, setPlayerMask, setPlayerWeapon,
} from './sprites';
import { maskColors, wornMask } from '../meta/mask';
import { setFxMask } from './weaponFx';
import { drawChapterBackdrop } from './background';
import { cameraFollowY } from './camera';
import { vibrate } from '../platform/native';
import {
  drawBackEffects, drawEffects, resetEffects, setSlashColor, spawnBellClang, spawnBossBreak, spawnFloorShatter, spawnFromEvent, spawnStackShatter, tickEffects,
} from './effects';
import {
  drawBell, drawLandmarkBack, drawLandmarkFront, hastyShakeX, isBellStack, noteBellBreak, resetLandmarkFx, shatterBody,
} from './landmarkFx';
import { bladeAura, drawBladeFx } from './bladeFx';
import { drawWazaTitle, drawWazaWorld, resetWazaShow, startWazaShow, stepWazaShow, wazaShowEvent, wazaShowState } from './wazaShow';
import { bossBodyHit, introFloorTop, resetBossFx, stepBossFx } from './executor';
import { addTrauma, defeatSlow, kickPx, pickHaptic, shakePx, shakeSample, type HapticCounters } from './feel';
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
/** 글자 팝업(먹 붓글씨) — px = 글자 크기, life = 처음 틱(등장 · 버티기 · 오그라듦을 나이로 잰다), rot = 기울기 */
interface Popup { text: string; x: number; y: number; ticks: number; life: number; px: number; rot: number }
const popups: Popup[] = [];

let popupSeed = 0;

/**
 * 콤보 도장 — 타격 지점 옆 숫자 하나 + 「COMBO」(10-31 옆 자리 숫자를 걷고 판 위로). 칠 때마다 튀고,
 * 고비(COMBO_MARK.STEPS)마다 효과가 하나씩 는다. 자리는 월드 좌표로 쥐고 그릴 때 카메라를 더한다.
 * age = 마지막 타격 뒤 틱(HOLD + EXIT를 넘기면 접혀서 다음 타격을 기다린다) · burst = 고비 연출 나이(−1 = 없음)
 */
interface ComboMark { n: number; x: number; y: number; tx: number; ty: number; age: number; burst: number; step: number }
let mark: ComboMark | null = null;
const MARK_GONE = COMBO_MARK.HOLD + COMBO_MARK.EXIT;
/** 끊긴 콤보 — 두 동강 나 떨어지는 숫자. 새 콤보 도장과 따로 논다(끊기자마자 다시 쳐도 끝까지 떨어진다) */
let shards: { n: number; x: number; y: number; t: number } | null = null;
/** 안전모 받기 — 먹 띠가 지나가며 「안전모!」를 찍고, 띠에 박힌 안전모가 머리로 날아간다(HAT_FX) */
let hatFx: { t: number; n: number } | null = null;
/** OS 「동작 줄이기」 — 내리꽂기 · 흔들림 · 흩어짐 · 날아가기를 빼고 글자와 낙관만 남긴다 */
let reduceMotion = false;

/** 결정적 흩뿌림 — rngState는 core 전용이라 여기선 카운터 해시를 쓴다. */
function scatter(): number {
  popupSeed = (Math.imul(popupSeed, 1103515245) + 12345) & 0x7fffffff;
  return ((popupSeed >>> 8) / 0x7fffff) * 2 - 1; // −1..1
}

// 08-30(P1-3): letters 코스메틱 — 저콤보(<50) 팝업 기본색. 에스컬레이션 색은 공통.
let lettersColor: string = PALETTE.INK;

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
  resetLandmarkFx();
  resetWazaShow();
  trauma = 0;
  kickY = 0;
  kickV = 0;
  landT = 0;
  jumpT = 0;
  hitFlashT = 0;
  dropT = 0;
  lastStack = null;
  bossMark = '';
  prelude = null;
  lastTick = -1;
  popups.length = 0;
  mark = null;
  shards = null;
  hatFx = null;
}

export function initRenderer(): void {
  initSprites();
  resetRunState();
  smoothCam = 0;
  reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 장착 코스메틱 일괄 적용 — 씬이 런 시작·장착 변경·도트판 저장 시 호출 (08-30, P1-3). maskArt = 저장의 도트판 그림 */
export function applyCosmetics(loadout: { body: string; blade: string; letters: string; mask: string }, maskArt: string): void {
  const body = COSMETIC_COLORS.body[loadout.body] ?? COSMETIC_COLORS.body.ink;
  const blade = COSMETIC_COLORS.blade[loadout.blade] ?? COSMETIC_COLORS.blade.wire;
  lettersColor = COSMETIC_COLORS.letters[loadout.letters] ?? COSMETIC_COLORS.letters.flyer;
  setPlayerCosmetics(body, blade);
  setSlashColor(blade);
  const mask = loadout.mask === 'mask' ? wornMask(maskArt) : null;
  setPlayerMask(mask);
  setFxMask(mask ? maskColors(mask) : null); // 필살·완파 때 그 색 도트가 흩어진다(weaponFx)
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
    case 'special': // 화면을 칠하지 않는다 — 필살의 무게는 wazaShow의 획 · 히트스톱 · 흔들림이 진다(11-01)
    case 'wazaHit':
    case 'wazaBurst':
      return;
    case 'phaseClear': // 티어 포효 — 공사 테이프 두 줄(번쩍 없이)
      if ((e.n ?? 0) >= 100) fx.startTape();
      return;
    default:
      // 11-01 먹 개편 — 화면 전체를 칠하는 번쩍은 다침 · 사망(정보)뿐이다. 격파 · 가드 · 번개 · 그 밖의 무게는
      // 히트스톱 · 흔들림 · 획의 크기가 진다(타격은 맞은 층만 하얗게 — drawHitFlash)
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

/** 완파 붓글씨 — 판 없는 먹 붓글씨 「N층」 + 작은 점수(screenfx). 집중선 · 반전은 11-01 먹 개편으로 걷었다 */
function reactImpact(e: JuiceEvent): void {
  if (e.kind !== 'stackDestroy') return;
  // 버터바(보너스)는 겹 수로 점수가 따로 붙는다 — 일반 건물만 층수·완파 점수 자막.
  // 모드로는 못 가린다: 마지막 버터바를 부순 틱에 core가 같은 틱 안에서 본편으로 돌아간다
  const gone = releasing ? releasing.ghost ?? releasing.before : lastStack;
  if (gone?.variant !== 'butterbar') fx.startCaption(destroyedCaption(e.n ?? 0), `+${SCORE.DESTROY_BONUS.toLocaleString('en-US')}`);
}

/**
 * 콤보 도장에 타격 하나 — y = 맞은 자리(건물 밑면) 고도. 고비를 넘는 타격이면 그 칸 연출을 켠다.
 * 콤보 100 · 500 밈 자막은 HUD(runCaps)가 판당 한 번 맡는다 — 여기선 판 위 도장만.
 */
function markHit(n: number, y: number): void {
  const C = COMBO_MARK;
  n = Math.min(n, SCORE.COMBO_CAP);
  const tx = VIEW.LANE_X[0] + C.DX;
  const ty = VIEW.GROUND_Y - y + C.DY;
  // 보스 입장은 끊김 이벤트 없이 콤보를 0으로 돌린다 — 작아진 수는 새 도장
  if (!mark || n < mark.n) mark = { n: 0, x: tx, y: ty, tx, ty, age: MARK_GONE, burst: -1, step: -1 };
  const m = mark;
  if (m.age >= MARK_GONE) { m.x = tx; m.y = ty; } // 접혀 있던 도장은 맞은 자리에서 다시 편다
  m.tx = tx;
  m.ty = ty;
  m.age = 0;
  if (n === m.n) return; // 999 카운터스톱 — 같은 수로는 고비를 다시 터뜨리지 않는다
  const prev = m.n;
  m.n = n;
  // 한 번에 크게 뛴 콤보(이어하기가 148 · 168로 바로 넣는다)는 친 게 아니다 — 고비 소리와 같은 기준
  if (n - prev > AUDIO.MILESTONE_MAX_JUMP) return;
  for (let i = C.STEPS.length - 1; i >= 0; i--) {
    if (prev >= C.STEPS[i].at || n < C.STEPS[i].at) continue;
    m.burst = 0;
    m.step = i;
    if (i >= 3 && !reduceMotion) kickY = Math.max(-JUICE_SYS.SHAKE_MAX_AMP, kickY - 4); // 100부터 내리꽂기 — 화면도 툭
    return;
  }
}

/** 콤보가 끊겼다 — 떠 있던 10 이상은 두 동강 나 떨어지고, 그 밖엔 조용히 사라진다 */
function markBreak(n: number): void {
  const m = mark;
  mark = null;
  if (!m || m.age >= MARK_GONE || n < COMBO_MARK.BREAK_MIN || reduceMotion) return;
  shards = { n: m.n, x: m.x, y: m.y, t: 0 };
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
  reactImpact(e);
  wazaShowEvent(s, e, lastStack);
  // 히트스톱은 core(sim advance 말미)가 주입한다 — 렌더러는 상태를 쓰지 않는다 (08-30, P0-5)
  // 필살 한 타 · 터짐은 wazaShow가 그린다(파티클 없음). 필살이 부순 완파도 wazaShow가 갈라 터뜨리니 발밑 공통 완파(조각 · 엔소 · 방울)를 겹치지 않는다
  const byWaza = e.kind === 'stackDestroy' && (releasing !== null || s.events.some((v) => v.kind === 'wazaHit' || v.kind === 'wazaBurst'));
  if (e.kind !== 'wazaHit' && e.kind !== 'wazaBurst' && !byWaza) spawnFromEvent(s, e);
  // 작업 지시서 명물: 종은 안 깎여 금이 없다(깡) · 땅에 떨어지면 금 가며 깨진다 · 몸 층은 그 층 그림으로 조각난다
  if (e.kind === 'hit' && e.mat === 'bell') spawnBellClang(VIEW.LANE_X[0], VIEW.GROUND_Y - (e.y ?? s.player.y + PLAYER.H));
  if (e.kind === 'floorCollapse') {
    if (e.mat === 'bell') noteBellBreak();
    else if (!shatterBody(s, e)) shatterFloor(s, e);
  }
  // 콤보 도장 — 콤보를 올린 타격만(층 붕괴는 타격일 때만 combo가 실린다 · 보스 타격은 combo 없이 온다)
  const hitCombo = e.kind === 'hit' || e.kind === 'bossHit' || e.kind === 'wazaHit' ? e.combo ?? s.combo
    : e.kind === 'floorCollapse' || e.kind === 'butterCollapse' ? e.combo : undefined;
  if (hitCombo !== undefined && hitCombo > 0) markHit(hitCombo, e.y ?? s.player.y + PLAYER.H);
  if (e.kind === 'comboBreak') markBreak(e.combo ?? 0);
  if (e.kind === 'hatGet') hatFx = { t: 0, n: e.combo ?? s.combo };
  // 글자 팝업 (동시 3개 상한) — 먹 붓글씨, 테 · 노랑 · 그림자 없이(불변 13 · 글자 딱지 없음)
  const combo = e.combo ?? s.combo;
  // 필살은 의성어 대신 wazaShow가 이름을 세로 붓글씨로 쓴다
  let word = e.kind === 'special' ? '' : onomatoFor(e.kind, combo);
  // 타격 · 층 · 완파 · 가드 의성어는 걷었다 — 보스 격파 「작전성공」만 남는다(완파는 screenfx 붓글씨 「N층」)
  if (e.kind !== 'bossDefeat') word = null;
  // 상자는 뭘 받았는지가 정보다
  const supply = e.kind === 'supply';
  if (supply && e.item) word = ITEM_COPY[e.item].pop;
  if (word) {
    // 같은 말이 아직 떠 있으면 그 자리에서 다시 튀운다 — 13px 어긋나 겹치면 「우우르르」로 읽힌다
    const same = popups.findIndex((p) => p.text === word);
    if (same >= 0) popups.splice(same, 1);
    else if (popups.length >= JUICE_SYS.ONOMATOPOEIA_MAX) popups.shift();
    popups.push({
      text: word,
      x: VIEW.LANE_X[0] + ((combo * 13) % 30) - 15,
      // 격파 · 상자는 이벤트 y가 없다 — 머리 위에 쓴다
      y: VIEW.GROUND_Y - (e.y ?? s.player.y + PLAYER.H + 20) - 30,
      ticks: 40,
      life: 40,
      px: JUICE_SYS.ONOMATO_PX * (supply ? 1.6 : 2.6), // 붓글씨는 25px 이상
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
  startWazaShow(s, lastStack);
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
  stepWazaShow(s);
  if (prelude) {
    prelude.left -= 1;
    if (prelude.left <= 0) releasePrelude(s);
  }
  const evs = s.events;
  if (evs.length > 0) {
    if (!prelude && evs.some((e) => e.kind === 'special')) beginPrelude(s, evs);
    else playEvents(s, evs);
  }
  // 보스 입장은 끊김 이벤트 없이 콤보를 0으로 돌린다 — 떠 있던 수를 조용히 거둔다
  if (s.combo === 0) mark = null;
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
  drawLandmarkBack(ctx, s, g, hitFlashAlpha()); // 명물 몸 · 장식 — 던진 것 뒤
  if (s.stack) {
    drawStackShadow(ctx, s.stack, g);
    drawDropStreaks(ctx, s.stack, g, cam);
    if (isBellStack(s.stack)) drawBell(ctx, s.stack, g, hitFlashAlpha()); // 종탑의 종 — 층 블록이 아니라 종 모양
    else {
      // 급한 집(대본 「~」) — 최하층 HP 1이 쌓이는 동안 가로로 떨린다(급락 예고)
      const hx = hastyShakeX(s);
      ctx.save();
      if (hx !== 0) ctx.translate(hx, 0);
      drawStack(ctx, s.stack, g, s.gimmick);
      drawHitFlash(ctx, s.stack, g);
      ctx.restore();
    }
  }
  drawLandmarkFront(ctx, s, g); // 구층탑 처마 · 풍경, 땅에서 깨지는 종
  if (prelude?.ghost) {
    // 사라진 건물 — 예비동작이 풀려 낙뢰가 꽂힐 때까지 그대로 서 있다(옅어지지 않는다 · 11-01)
    drawStack(ctx, prelude.ghost, g, s.gimmick);
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
  // 피격 직후(≤HIT_IFRAMES)만 점멸 — 디버그 상시 무적은 통짜로 그린다 (08-30, D-2).
  // 필살 무적이 그 구간으로 내려와도 필살 연출이 도는 동안은 통짜(긴 필살의 터짐 순간에 졸라맨이 꺼지지 않게)
  const shortInvuln = s.player.invulnTicks > 0 && s.player.invulnTicks <= PLAYER.HIT_IFRAMES && !wazaShowState();
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
    drawMask(ctx, s.player.pose, s.player.poseTick, px, footY);
    if (s.hat && !hatFlying()) drawHat(ctx, s.player.pose, s.player.poseTick, px, footY); // 받는 중엔 날아오는 쪽이 그린다
    if (squash) ctx.restore();
  }
  drawWazaWorld(ctx, s, cam);
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
  drawPopups(ctx);
  ctx.restore();
  drawComboMark(ctx, cam);
  drawHatFx(ctx, s, cam);
  drawWazaTitle(ctx);
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

/** 맞은 층 흰 번쩍 세기 0..HIT_FLASH_A — 번쩍임 설정을 탄다 */
function hitFlashAlpha(): number {
  return hitFlashT <= 0 ? 0 : JUICE_SYS.HIT_FLASH_A * (hitFlashT / JUICE_SYS.HIT_FLASH_TICKS) * fx.flashK();
}

/** 맞은 맨 아래층만 하얗게 — 화면 전체 번쩍 대신(연타 장면이 번쩍이면 눈이 아프다). 번쩍임 설정을 탄다. */
function drawHitFlash(ctx: CanvasRenderingContext2D, st: FallingStack, g: number): void {
  const f = st.floors[0];
  const a = hitFlashAlpha();
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
  if (s.act2Phase === 'moon' || (s.stage?.id === 'HQ' && s.boss)) return '#E4E0D6'; // 본사 집행기도 달 국면과 같은 바탕
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
  // 명물 보스는 창 · 올라가기 · 등장 · 쓰러짐 동안 대기 값이 멈춰 있어(바람탑 STALL_GAP) ▼가 맥박만 친다 — 그리지 않는다
  if (s.lm && s.lm.st !== 'play' && s.lm.st !== 'slam') return;
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

/** 숫자 크기 — 콤보 500까지 (1 + GROW)배로 큰다 */
/** 콤보 이름표 활자 — 붓 숫자 밑 작은 고정폭(콤보 도장 · 안전모 띠) */
const LABEL_FONT = `700 ${COMBO_MARK.LABEL_PX - 2}px "Gunbbu Mono", "Gunbbu Sans", monospace`;
const markPx = (n: number): number => COMBO_MARK.PX * (1 + (COMBO_MARK.GROW * Math.min(n, 500)) / 500);
/** 지나온 고비 수 — 10부터 기울고 30부터 먹 그림자 */
const markTier = (n: number): number => COMBO_MARK.STEPS.filter((st) => n >= st.at).length;
/** 도장 높이(화면) — 필드 위아래 끝에 걸리면 안으로 민다(밑엔 이름표 자리까지) */
const markScreenY = (y: number, cam: number, px: number): number =>
  Math.max(VIEW.FIELD_TOP + px * 0.5 + 6, Math.min(VIEW.FIELD_H - px * 0.5 - COMBO_MARK.LABEL_PX - 10, y + cam));
const hatFlying = (): boolean => !reduceMotion && hatFx !== null && hatFx.t < HAT_FX.LAND;

/**
 * 판 위 먹 글씨 — 한지색 테 한 겹 + 먹(글자 색) 채움. 테가 있어 어두운 건물 면 위에서도 산다(08-30 7차 — 그때는 노랑 채움이라
 * 잉크 링이 더 필요했다). 11-01 먹 개편: 잉크 링 · 먹 그림자 · 노랑 채움(스티커)을 걷었다. halo = false면 테 없이(낙관 속 숫자)
 */
function inkText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill: string, halo = true): void {
  if (halo) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = PALETTE.WHITE;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/**
 * 콤보 도장(화면 좌표, 틱마다 한 번). 숫자 · 고비 말은 먹 붓글씨(동해독도). 고비 칸 k에 따라 효과가 쌓인다:
 * 0 말 · 1 붓 고리(엔소) · 2 먹 베기 획 · 3 내리꽂기 · 4 X 베기 · 5 먹 방울 · 6 주홍 낙관(SEAL_INK) · 7 MAX
 */
function drawComboMark(ctx: CanvasRenderingContext2D, cam: number): void {
  drawShards(ctx, cam);
  const m = mark;
  if (!m || m.age >= MARK_GONE) return;
  const C = COMBO_MARK;
  m.x += (m.tx - m.x) * 0.35;
  m.y += (m.ty - m.y) * 0.35;
  const px = markPx(m.n);
  const txt = String(m.n);
  const tier = markTier(m.n);
  const t = m.burst;
  const k = t >= 0 ? m.step : -1;
  ctx.save();
  ctx.font = fx.brushFont(px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(txt).width;
  const x = Math.max(w / 2 + 8, Math.min(VIEW.W - w / 2 - 8, m.x));
  const y = markScreenY(m.y, cam, px);
  // 칠 때마다 튀고, 다 버티면 접힌다
  const pu = Math.max(0, 1 - m.age / C.PUNCH_TICKS);
  let sc = 1 + C.PUNCH * pu * pu;
  if (m.age > C.HOLD) sc *= 1 - ((m.age - C.HOLD) / C.EXIT) ** 2;
  let dy = 0;
  let jx = 0;
  if (k >= 3 && !reduceMotion) {
    // 내리꽂기 — 2.2배로 위에서 떨어져 한 번 눌렸다 선다(감쇠 진동) + 제자리 떨림
    sc = 1 + 1.2 * Math.exp(-t / 2.2) * Math.cos(t * 0.55);
    dy = -36 * Math.max(0, 1 - t / 4) ** 2;
    if (t < 10) jx = Math.sin(t * 2.7) * 2.2 * (1 - t / 10);
  } else if (k >= 0) {
    sc *= 1 + 0.3 * Math.max(0, 1 - t / 8) ** 2;
  }
  if (k >= 0) drawBurstBack(ctx, k, t, x, y, px);
  ctx.translate(x + jx, y + dy);
  ctx.scale(sc, sc);
  const seal = m.n >= 500;
  if (seal) {
    // 500부터 주홍 낙관 — 숫자를 한지색으로 뺀다(500 고비엔 숫자와 같이 내리꽂힌다). 테 없이 인주 면만
    const sw = w + 16;
    const sh = px * 0.95;
    ctx.save();
    ctx.rotate(-0.06);
    ctx.fillStyle = SEAL_INK;
    ctx.fillRect(-sw / 2, -sh / 2, sw, sh);
    ctx.restore();
  }
  // 이름표 — 붓 숫자 밑 작은 활자(낙관 옆 관지처럼). 굵은 고딕 딱지는 붓글씨와 따로 놀았다(11-01)
  const label = m.n >= SCORE.COMBO_CAP ? 'MAX COMBO' : 'COMBO';
  const ly = px * 0.5 + C.LABEL_PX * 0.5 + 2;
  ctx.font = LABEL_FONT;
  ctx.letterSpacing = '3px';
  inkText(ctx, label, 0, ly, PALETTE.INK);
  ctx.letterSpacing = '0px';
  ctx.font = fx.brushFont(px);
  if (tier >= 1) ctx.transform(1, 0, -0.2, 1, 0, 0); // 앞으로 기운다
  inkText(ctx, txt, 0, 0, seal ? PALETTE.WHITE : lettersColor, !seal);
  ctx.restore();
  if (k >= 0) drawBurstFront(ctx, k, t, x, y, px);
  m.age += 1;
  if (t >= 0) m.burst = t + 1 > C.BURST ? -1 : t + 1;
}

/** 고비 연출 — 숫자 뒤: 먹 베기 획(50~, 200부터 X) · 붓 고리 엔소(30~) */
function drawBurstBack(ctx: CanvasRenderingContext2D, k: number, t: number, x: number, y: number, px: number): void {
  ctx.save();
  ctx.fillStyle = PALETTE.INK;
  if (k >= 2) slashStroke(ctx, x, y, -0.32, t, 3);
  if (k >= 4) slashStroke(ctx, x, y, 0.42, t - 3, 5);
  if (k >= 1 && !reduceMotion && t < 16) {
    // 붓 고리 — 숫자 둘레를 4틱에 한 바퀴 긋고 퍼지며 대던 데부터 마른다
    const u = t / 16;
    enso(ctx, x, y, px * 0.62 + t * 3, 6.5 * (1 - 0.45 * u), -1.2, u < 0.3 ? 0 : (u - 0.3) / 0.7, Math.min(1, (t + 1) / 4), 0.2 + 0.6 * u, 1, 11);
  }
  ctx.restore();
}

/** 먹 베기 한 획 — 3틱에 그어지고 6틱부터 꼬리가 깎여 14틱에 다 먹힌다. 숫자 뒤를 비스듬히 가른다 */
function slashStroke(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, t: number, seed: number): void {
  if (t < 0 || t >= 14) return;
  const c = Math.cos(ang) * 85;
  const sn = Math.sin(ang) * 85;
  brushLine(ctx, x - c, y - sn, x + c, y + sn, 14, t < 6 ? 0 : (t - 6) / 8, Math.min(1, (t + 1) / 3), 0.35, seed, 7);
}

/** 고비 연출 — 숫자 앞: 튄 먹 방울(300~) · 고비 말(숫자 위 먹 붓글씨, 크게 박혔다가 끝 8틱에 접힌다) */
function drawBurstFront(ctx: CanvasRenderingContext2D, k: number, t: number, x: number, y: number, px: number): void {
  const C = COMBO_MARK;
  ctx.save();
  if (k >= 5 && !reduceMotion && t < 24) {
    ctx.fillStyle = PALETTE.INK;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.4;
      const sp = 3 + (i % 3);
      const d = px * 0.55 + sp * t; // 숫자 가장자리에서 튄다 — 숫자에 묻지 않게
      const f = 1 - t / 24;
      // 머리는 나는 쪽(떨어질수록 아래로 돈다), 꼬리는 지나온 쪽
      inkDrop(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d + 0.12 * t * t, (3.4 - (i % 2) * 1.2) * f, Math.atan2(Math.sin(a) * sp + 0.24 * t, Math.cos(a) * sp), 5 * f);
    }
  }
  const word = C.STEPS[k].word;
  const wpx = 26 + 2 * k; // 붓글씨는 25px 이상
  ctx.font = fx.brushFont(wpx);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const ww = ctx.measureText(word).width;
  const inU = Math.max(0, 1 - t / 6);
  const out = Math.max(0, (t - (C.BURST - 8)) / 8);
  ctx.translate(
    Math.max(ww / 2 + 6, Math.min(VIEW.W - ww / 2 - 6, x - 4)),
    Math.max(VIEW.FIELD_TOP + wpx, y - px * 0.5 - wpx * 0.5 - 10),
  );
  ctx.rotate(-0.1);
  const wsc = (1 + 0.5 * inU * inU) * (1 - out * out);
  ctx.scale(wsc, wsc);
  inkText(ctx, word, 0, 0, PALETTE.INK);
  ctx.restore();
}

/** 끊긴 콤보 — 비스듬한 금을 따라 두 동강 나 벌어지며 떨어진다(잔해 색) */
function drawShards(ctx: CanvasRenderingContext2D, cam: number): void {
  const sh = shards;
  if (!sh) return;
  const t = sh.t;
  const end = COMBO_MARK.BREAK;
  const px = markPx(sh.n);
  const txt = String(sh.n);
  ctx.save();
  ctx.font = fx.brushFont(px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const half = ctx.measureText(txt).width / 2 + 8;
  const x = Math.max(half + 2, Math.min(VIEW.W - half - 2, sh.x));
  const y = markScreenY(sh.y, cam, px) + 0.35 * t * t;
  const sc = t > end - 8 ? 1 - (t - (end - 8)) / 8 : 1;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(x + side * t * 1.6, y);
    ctx.rotate(side * t * 0.035);
    ctx.scale(sc, sc);
    // 금 = (4, −px) → (−4, px). 왼쪽 반은 금 왼편만, 오른쪽 반은 오른편만
    ctx.beginPath();
    ctx.moveTo(4, -px);
    ctx.lineTo(side * half * 1.5, -px);
    ctx.lineTo(side * half * 1.5, px);
    ctx.lineTo(-4, px);
    ctx.closePath();
    ctx.clip();
    inkText(ctx, txt, 0, 0, PALETTE.RUBBLE);
    ctx.restore();
  }
  ctx.restore();
  sh.t += 1;
  if (sh.t >= end) shards = null;
}

/**
 * 안전모 받기(화면 좌표, 틱마다 한 번) — 넓은 붓이 IN까지 왼쪽에서 오른쪽으로 먹 띠를 긋고, OUT부터 왼쪽 끝이 깎여 GONE에 다 먹힌다.
 * 띠에 찍힌 안전모는 OUT부터 돌며 머리로 날아가 LAND에 씌워지고, END까지 머리에 먹 고리 하나.
 */
function drawHatFx(ctx: CanvasRenderingContext2D, s: GameState, cam: number): void {
  const f = hatFx;
  if (!f) return;
  const H = HAT_FX;
  const t = f.t;
  const slotX = 112;
  const slotY = H.BAND_Y - 2;
  const s1 = reduceMotion ? 1 : 1 - (1 - Math.min(1, t / H.IN)) ** 3;
  const s0 = reduceMotion || t < H.OUT ? 0 : Math.min(1, (t - H.OUT) / (H.GONE - H.OUT)) ** 2;
  if (t < H.GONE) drawHatBand(ctx, s0, s1, f.n);
  if (t >= H.IN - 2 && t < H.OUT) {
    // 띠에 도장처럼 찍힌다 — 크게 박혔다 앉는다
    const pu = reduceMotion ? 0 : Math.max(0, 1 - (t - (H.IN - 2)) / 6);
    bigHat(ctx, slotX, slotY, 5, 3.2 * (1 + 0.7 * pu * pu), 0);
  }
  // 깔려서 벌써 깨졌으면(같은 틱에 깔림) 날아갈 안전모가 없다
  const at = s.hat ? hatSpot(s.player.pose, s.player.poseTick, VIEW.LANE_X[s.player.lane], VIEW.GROUND_Y - s.player.y) : null;
  if (at && !reduceMotion && t >= H.OUT && t < H.LAND) {
    const u = (t - H.OUT) / (H.LAND - H.OUT);
    const e = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) ** 2;
    const x1 = at[0];
    const y1 = at[1] + cam;
    const cx = (slotX + x1) / 2;
    const cy = Math.min(slotY, y1) - 70; // 위로 한 번 솟았다 내려앉는 포물선
    const q = 1 - e;
    bigHat(ctx, q * q * slotX + 2 * q * e * cx + e * e * x1, q * q * slotY + 2 * q * e * cy + e * e * y1,
      5 + (at[2] - 5) * e, 1 + 2.2 * q, -q * Math.PI * 1.5);
  }
  if (at && !reduceMotion && t >= H.LAND) {
    const u = (t - H.LAND) / (H.END - H.LAND);
    ctx.save();
    ctx.strokeStyle = PALETTE.INK;
    ctx.lineWidth = 3 * (1 - u);
    ctx.beginPath();
    ctx.arc(at[0], at[1] + cam - 2, 8 + u * 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  f.t += 1;
  if (f.t >= H.END) hatFx = null;
}

function bigHat(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, k: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(k, k);
  hardHat(ctx, 0, 0, r);
  ctx.restore();
}

/** 띠 — 양 끝을 비스듬히 자른 먹 띠 + 위아래 노랑 테 한 줄씩. 「안전모!」 한지색 + 「COMBO n」 노랑 */
/** 안전모 먹 띠 — [s0, s1] 구간만 그어져 있다. 글자는 먹이 지나간 자리 안에서만 보인다(그어지며 드러나고 깎이며 사라진다) */
function drawHatBand(ctx: CanvasRenderingContext2D, s0: number, s1: number, n: number): void {
  const y = HAT_FX.BAND_Y;
  const x0 = -30;
  const x1 = VIEW.W + 30;
  ctx.save();
  ctx.fillStyle = PALETTE.INK;
  brushLine(ctx, x0, y + 4, x1, y - 6, HAT_FX.BAND_H, s0, s1, 0.55, 23, -5);
  ctx.beginPath();
  ctx.rect(x0 + (x1 - x0) * s0, y - HAT_FX.BAND_H, (x1 - x0) * (s1 - s0) * 0.9, HAT_FX.BAND_H * 2);
  ctx.clip();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.WHITE;
  ctx.font = fx.brushFont(36);
  ctx.fillText(ITEM_COPY.hat.pop, 148, y - 7);
  ctx.font = LABEL_FONT;
  ctx.letterSpacing = '3px';
  ctx.fillText(`COMBO ${n}`, 151, y + 17);
  ctx.letterSpacing = '0px';
  ctx.restore();
}

/** 시험용 — 지금 콤보 도장(n · 떠 있나 · 고비 칸) · 끊긴 조각 수 · 안전모 연출 나이(−1 = 없음) */
export function comboMarkView(): { n: number; shown: boolean; step: number; broken: number; hat: number } {
  return {
    n: mark?.n ?? 0,
    shown: mark !== null && mark.age < MARK_GONE,
    step: mark !== null && mark.burst >= 0 ? mark.step : -1,
    broken: shards?.n ?? 0,
    hat: hatFx?.t ?? -1,
  };
}

/**
 * 글자 팝업 — 먹 붓글씨(동해독도). 테 · 판 · 그림자 · 알파 없이 크기로 들고 난다:
 * 앞 6틱에 부풀어(넘침 1.12) 앉고, 끝 8틱에 오그라든다.
 */
function drawPopups(ctx: CanvasRenderingContext2D): void {
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.ticks -= 1;
    if (p.ticks <= 0) { popups.splice(i, 1); continue; }
    const age = p.life - p.ticks;
    const grow = age < 6 ? 0.5 + 0.62 * Math.sin((age / 6) * (Math.PI / 2)) : 1 + 0.12 * Math.max(0, 1 - (age - 6) / 4);
    const sc = grow * Math.min(1, p.ticks / 8) ** 0.8;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.scale(sc, sc);
    ctx.font = fx.brushFont(p.px);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.INK;
    ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }
}
