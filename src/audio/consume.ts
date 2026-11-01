// GameState.events → SFX. core는 이벤트만 발행, 이 모듈이 프레임마다 소비(클리어는 씬).
// boltCue/land 등은 kind 재사용 — 페이즈·보스 상태로 전용 프리셋을 고른다.
import type { GameState, JuiceEvent, JuiceKind, Material, WeaponId } from '../core/types';
import { AUDIO, BOSS, HAT_FX, JUICE, STACK, TPS, WAZA_RUN } from '../config';
import { playSfx, pulseDuckBgm, setComboLayer } from './audio';
import type { SfxName } from './sfx';
import { landmarkSounds, snapOf, type LmSnap } from './landmarkSfx';
import { lmAct } from '../core/landmark';

const STRONG_MAT: ReadonlySet<Material> = new Set(['hard', 'cathedral', 'lobby', 'penthouse']);

const COMBO_DROP_COVER: ReadonlySet<JuiceKind> = new Set([
  'guardBounce', 'hurt', 'butterCollapse',
]);

/** 1200부터 대검은 제 소리 — 타격에, 층 깨기·완파엔 붕괴음 위에 얹는다 */
export const GREAT_OWN: Partial<Record<WeaponId, SfxName>> = { flame: 'hitFlame', frost: 'hitFrost', onyx: 'hitOnyx', gold: 'hitGold' };
/** 무기별 타격음 — 연장 셋, 값싼 대검 넷(연장 소리를 빌린다), 비싼 대검 넷. 없으면(철거칼) 재질·변형 */
const WEAPON_HIT: Partial<Record<WeaponId, SfxName>> = {
  hammer: 'hitHammer', crowbar: 'hitBar', grinder: 'hitGrind',
  iron: 'hitStrong', saw: 'hitGrind', hazard: 'hitBar', beam: 'hitHammer', ...GREAT_OWN,
};

/** 기본 타격 3변형(중음·저음·노이즈 비중) — 라운드로빈으로 반복 피로를 던다 */
const HIT_VARIANTS: readonly SfxName[] = ['hit', 'hitLow', 'hitTick'];
let hitRR = 0;
let prevCombo = 0;
let bossBreakFired = false;
let incomingFired = false;

/** 콤보 → 타격음 피치(반음). 장조 펜타토닉 사다리, 상한 +7, 내려가지 않는다. */
export function comboSemitones(combo: number): number {
  const ladder = AUDIO.PITCH_LADDER;
  return ladder[Math.min(ladder.length - 1, Math.floor(combo / AUDIO.PITCH_STEP_COMBO))];
}

/**
 * 콤보가 이정표(50/100/200/300/500/999)를 올라서는 틱이면 그 값, 아니면 null.
 * 이어하기(체크포인트 콤보 168)처럼 한 번에 크게 뛰는 건 타격이 아니므로 세지 않는다.
 */
export function comboMilestone(prev: number, now: number): number | null {
  if (now <= prev || now - prev > AUDIO.MILESTONE_MAX_JUMP) return null;
  for (let i = AUDIO.MILESTONES.length - 1; i >= 0; i--) {
    const m = AUDIO.MILESTONES[i];
    if (prev < m && now >= m) return m;
  }
  return null;
}

export function consumeAudio(s: GameState): void {
  const kinds = new Set<JuiceKind>();
  for (const e of s.events) kinds.add(e.kind);

  for (const e of s.events) {
    const mapped = mapEvent(e, s, kinds);
    if (mapped) {
      const semis = e.kind === 'hit' ? comboSemitones(e.combo ?? 0) : 0;
      for (const name of mapped) {
        // 필살 폭발은 히트스톱이 풀리는 틱에 화면에서 터진다 — 폭발음도 그 박자로 늦춘다
        if (name === 'special' && e.kind === 'special') {
          playSfx('specialCharge'); // 휘익은 지금, 폭발은 히트스톱이 풀릴 때
          playSfx(name, { delay: JUICE.special.hitstop / TPS });
        } else if (name === 'inkSnap') playSfx(name, { delay: 4 / TPS }); // 먹줄이 튕기는 프레임(wazaShow)
        else if (name === 'sheathe') playSfx(name, { delay: (JUICE.special.hitstop + WAZA_RUN.mukjul.burst - 8) / TPS }); // 터지기 여덟 틱 전
        else if (name === 'hatGet') playSfx(name, { delay: HAT_FX.LAND / TPS }); // 고비 소리는 지금, 「팅」은 머리에 씌워질 때
        else playSfx(name, semis !== 0 ? { pitchSemitones: semis } : undefined);
      }
    }
  }
  // 덕킹은 틱당 한 번 — 필살·격파(깊게)가 완파(가볍게)와 겹치면 깊은 쪽만
  if (kinds.has('special') || kinds.has('wazaBurst') || kinds.has('bossDefeat')) pulseDuckBgm();
  else if (kinds.has('stackDestroy')) pulseDuckBgm(AUDIO.DUCK_DESTROY, AUDIO.DUCK_DESTROY_S);

  if (comboMilestone(prevCombo, s.combo) !== null) playSfx('milestone');
  prevCombo = s.combo;
  setComboLayer(s.combo);

  // 보스 입장 BREAK(집게가 놓은 층이 부서지는 틱) — 상태 읽기, 이벤트 없음. 한 번만.
  const b = s.boss;
  if (b?.st === 'enter' && b.stTick >= BOSS.INTRO.BREAK) {
    if (!bossBreakFired) { bossBreakFired = true; playSfx('bossRoar'); }
  } else {
    bossBreakFired = false;
  }

  // 다음 건물 낙하 예고(렌더의 ▼가 뜨는 바로 그 틱) — 히트스톱으로 틱이 반복돼도 한 번만
  const cue = !s.over && s.stack === null && s.stackSpawnCd === STACK.SPAWN_CUE_TICKS;
  if (cue && !incomingFired) playSfx('incoming');
  incomingFired = cue;

  playLandmark(s);
}

// 명물 소리 — 이벤트가 없는 것(똑딱 · 댕 · 휘파람 · 풍경 · 끼릭 · 철컥)은 직전 틱과의 차이로 낸다.
// 판이 바뀌거나(다른 state) 틱이 되감기면 비운다. 상태는 읽기만 한다.
let lmPrev: LmSnap | null = null;
let lmOwner: GameState | null = null;

function playLandmark(s: GameState): void {
  const cur = snapOf(s);
  if (lmOwner !== s || (lmPrev && cur && cur.tick < lmPrev.tick)) lmPrev = null;
  lmOwner = s;
  if (!cur) { lmPrev = null; return; }
  for (const snd of landmarkSounds(lmPrev, cur)) {
    playSfx(snd.name, { pitchSemitones: snd.semis, dur: snd.dur, delay: snd.delay });
  }
  if (!lmPrev || cur.tick !== lmPrev.tick) lmPrev = cur; // 같은 틱(히트스톱)은 직전 장면을 지킨다
}

export function mapEvent(e: JuiceEvent, s: GameState, kinds: Set<JuiceKind>): SfxName[] | null {
  switch (e.kind) {
    case 'slash':
      return ['whiff'];
    case 'hit': {
      if (e.mat === 'bell') return ['bellClang']; // 종은 안 깎인다 — 깡
      if (!e.mat && s.boss?.pattern === 'rabbits') return ['cancel'];
      const own = WEAPON_HIT[s.weapon];
      if (own) return [own];
      if (e.mat && STRONG_MAT.has(e.mat)) return ['hitStrong'];
      return [HIT_VARIANTS[hitRR++ % HIT_VARIANTS.length]];
    }
    case 'supply':
      return ['supply'];
    case 'hatBreak':
      return ['hatBreak'];
    case 'hatGet':
      return ['hatGet'];
    case 'floorCollapse': {
      if (e.mat === 'bell') return ['bellThud']; // 종이 땅에서 깨졌다 — 퉁
      const own = GREAT_OWN[s.weapon];
      return own ? ['floorCollapse', own] : ['floorCollapse'];
    }
    case 'stackDestroy': {
      const own = GREAT_OWN[s.weapon];
      return own ? ['destroy', 'gorogoro', own] : ['destroy', 'gorogoro'];
    }
    case 'butterCollapse':
      return ['butterPop'];
    case 'special':
      // 시간차 필살은 휘익만 — 폭발은 터지는 틱(wazaBurst)에. 먹줄치기는 줄 튕김 · 칼 거둠을 미리 걸어 둔다
      if (s.waza === 'mukjul') return ['whiff', 'specialCharge', 'inkSnap', 'sheathe'];
      if (s.waza in WAZA_RUN) return ['whiff', 'specialCharge'];
      return ['whiff', 'special']; // 입력 틱 = 휘두름, 폭발음은 consumeAudio가 늦춘다
    case 'wazaSwing':
      return [s.waza === 'baram' ? 'gust' : 'whiff'];
    case 'wazaHit': {
      const own = WEAPON_HIT[s.weapon];
      return [own ?? HIT_VARIANTS[hitRR++ % HIT_VARIANTS.length]];
    }
    case 'wazaBurst':
      return s.waza === 'nakgwan' ? ['stamp', 'special'] : ['special'];
    case 'hurt':
      return ['pinned'];
    case 'guardBounce':
      return ['guardGround'];
    case 'guardAirBounce':
      return ['guardAir'];
    case 'bossHit':
      // 종탑: 되돌린 종이 몸에 꽂힐 때(play 중) — 던질 때의 댕보다 크고 길게. 창 중 필살 타격은 그대로
      // 3막(몸 한 층)은 시보라 꽂힘이 곧 대미지 — 울림 대신 쾅
      // 점수가 종 수에 닿아 파가 바로 끝나는 꽂힘은 같은 틱에 sit이 된다(t 0) — 그것도 꽂힘이다
      if (s.lm?.id === 'bell' && (s.lm.st === 'play' || (s.lm.st === 'sit' && s.lm.t === 0))) {
        return [s.lm.body && lmAct(s) === 3 ? 'bellBoom' : 'bellBody'];
      }
      return ['bossHit'];
    case 'bossDefeat':
      return ['bossDefeat'];
    case 'boltCue':
      // 종탑 종 던지기 · 크레인 놓기도 이 이벤트를 쓴다 — 댕 · 철컥은 landmarkSounds가 따로 낸다
      if (s.lm?.id === 'bell' || s.lm?.id === 'crane') return null;
      return [mapBoltCue(s)];
    case 'boltStrike':
      return [mapBoltStrike(s)];
    case 'gaugeFull':
      return ['gaugeFull'];
    case 'comboBreak':
      for (const k of COMBO_DROP_COVER) if (kinds.has(k)) return null;
      return ['comboDrop'];
    case 'jump':
      return ['jump'];
    case 'land':
      return [e.lane !== undefined ? 'rockLand' : 'land'];
    // 밑면에 부딪힘 — 착지음을 재사용한다(둔탁한 한 방). 새 신스 없이 신호만 준다.
    case 'headBonk':
      return ['land'];
    case 'guardDenied':
      return [s.player.pose === 'guardBreak' ? 'guardBreak' : 'gaugeWarn'];
    case 'lifeLost':
      return ['lifeLost'];
    case 'bonusEnter':
      return ['uiBlip'];
    case 'bonusPerfect':
      return ['perfect'];
    case 'phaseClear': {
      // 100+ = 보스 티어 포효 · 2막 구역 도달 = checkpoint · 그 밖(2막 진입·버터바 끝) = 도장
      const n = e.n ?? 0;
      if (n >= 100) return ['bossRoar'];
      return [s.mode === 'act2' && n > 0 ? 'checkpoint' : 'stamp'];
    }
    case 'chapterUnlock':
      return ['stamp'];
    default:
      return null;
  }
}

function mapBoltCue(s: GameState): SfxName {
  if (s.act2Phase === 'rock') return 'rockWhistle';
  const b = s.boss;
  if (b) {
    if (b.st === 'telegraph' && b.pattern === 'pbCharge') return 'bossPbTele';
    if (b.st === 'telegraph') return 'bossTele';
    if (b.st === 'attacking' && b.pattern === 'cannons') return 'zap2';
  }
  return 'boltCue';
}

function mapBoltStrike(s: GameState): SfxName {
  const b = s.boss;
  if (b?.pattern === 'rabbits' && b.st === 'attacking') return 'zap';
  if (b?.pattern === 'cannons') return 'zap3';
  return 'boltStrike';
}
