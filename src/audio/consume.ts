// GameState.events → SFX. core는 이벤트만 발행, 이 모듈이 프레임마다 소비(클리어는 씬).
// boltCue/land 등은 kind 재사용 — 페이즈·보스 상태로 전용 프리셋을 고른다.
import type { GameState, JuiceEvent, JuiceKind, Material } from '../core/types';
import { AUDIO, BOSS, JUICE, TPS } from '../config';
import { playSfx, pulseDuckBgm, setComboLayer } from './audio';
import type { SfxName } from './sfx';

const STRONG_MAT: ReadonlySet<Material> = new Set(['hard', 'cathedral', 'lobby', 'penthouse']);

const COMBO_DROP_COVER: ReadonlySet<JuiceKind> = new Set([
  'guardBounce', 'hurt', 'butterCollapse',
]);

/** 기본 타격 3변형(중음·저음·노이즈 비중) — 라운드로빈으로 반복 피로를 던다 */
const HIT_VARIANTS: readonly SfxName[] = ['hit', 'hitLow', 'hitTick'];
let hitRR = 0;
let prevCombo = 0;
let bossBreakFired = false;

/** 콤보 → 타격음 피치(반음). 장조 펜타토닉 사다리, 상한 +7, 내려가지 않는다. */
export function comboSemitones(combo: number): number {
  const ladder = AUDIO.PITCH_LADDER;
  return ladder[Math.min(ladder.length - 1, Math.floor(combo / AUDIO.PITCH_STEP_COMBO))];
}

/**
 * 콤보가 이정표(50/100/200/500/999)를 올라서는 틱이면 그 값, 아니면 null.
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
        if (name === 'special') playSfx(name, { delay: JUICE.special.hitstop / TPS });
        else playSfx(name, semis !== 0 ? { pitchSemitones: semis } : undefined);
      }
    }
    if (e.kind === 'special' || e.kind === 'bossDefeat') pulseDuckBgm();
  }

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
}

export function mapEvent(e: JuiceEvent, s: GameState, kinds: Set<JuiceKind>): SfxName[] | null {
  switch (e.kind) {
    case 'slash':
      return ['whiff'];
    case 'hit':
      if (!e.mat && s.boss?.pattern === 'rabbits') return ['cancel'];
      if (s.weapon === 'hammer') return ['hitHammer'];
      if (s.weapon === 'crowbar') return ['hitBar'];
      if (s.weapon === 'grinder') return ['hitGrind'];
      if (e.mat && STRONG_MAT.has(e.mat)) return ['hitStrong'];
      return [HIT_VARIANTS[hitRR++ % HIT_VARIANTS.length]];
    case 'supply':
      return ['supply'];
    case 'hatBreak':
      return ['hatBreak'];
    case 'floorCollapse':
      return ['floorCollapse'];
    case 'stackDestroy':
      return ['destroy', 'gorogoro'];
    case 'butterCollapse':
      return ['butterPop'];
    case 'special':
      return ['whiff', 'special']; // 입력 틱 = 휘두름, 폭발음은 consumeAudio가 늦춘다
    case 'hurt':
      return ['pinned'];
    case 'guardBounce':
      return ['guardGround'];
    case 'guardAirBounce':
      return ['guardAir'];
    case 'bossHit':
      return ['bossHit'];
    case 'bossDefeat':
      return ['bossDefeat'];
    case 'boltCue':
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
