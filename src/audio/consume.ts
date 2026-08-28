// GameState.events → SFX. core는 이벤트만 발행, 이 모듈이 프레임마다 소비(클리어는 씬).
// boltCue/land 등은 kind 재사용 — 페이즈·보스 상태로 전용 프리셋을 고른다.
import type { GameState, JuiceEvent, JuiceKind, Material } from '../core/types';
import { playSfx } from './audio';
import type { SfxName } from './sfx';

const STRONG_MAT: ReadonlySet<Material> = new Set(['hard', 'cathedral', 'lobby', 'penthouse']);

const COMBO_DROP_COVER: ReadonlySet<JuiceKind> = new Set([
  'guardBounce', 'hurt', 'butterCollapse',
]);

export function consumeAudio(s: GameState): void {
  const kinds = new Set<JuiceKind>();
  for (const e of s.events) kinds.add(e.kind);

  for (const e of s.events) {
    const mapped = mapEvent(e, s, kinds);
    if (!mapped) continue;
    const semis = e.kind === 'hit' ? Math.floor(((e.combo ?? 0) / 10) % 12) : 0;
    for (const name of mapped) playSfx(name, semis !== 0 ? { pitchSemitones: semis } : undefined);
  }
}

function mapEvent(e: JuiceEvent, s: GameState, kinds: Set<JuiceKind>): SfxName[] | null {
  switch (e.kind) {
    case 'slash':
      return ['whiff'];
    case 'hit':
      if (!e.mat && s.boss?.pattern === 'rabbits') return ['cancel'];
      if (e.mat && STRONG_MAT.has(e.mat)) return ['hitStrong'];
      return ['hit'];
    case 'floorCollapse':
      return ['floorCollapse'];
    case 'stackDestroy':
      return ['destroy', 'gorogoro'];
    case 'butterCollapse':
      return ['butterPop'];
    case 'special':
      return ['special'];
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
    case 'guardDenied':
      return [s.player.pose === 'guardBreak' ? 'guardBreak' : 'gaugeWarn'];
    case 'lifeLost':
      return ['lifeLost'];
    case 'bonusEnter':
      return ['uiBlip'];
    case 'bonusPerfect':
      return ['perfect'];
    case 'phaseClear':
      return [(e.n ?? 0) >= 100 ? 'bossRoar' : 'gaugeFull'];
    case 'chapterUnlock':
      return ['gaugeFull'];
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
