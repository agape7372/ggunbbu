// 디버그 메뉴: 페이즈 셀렉트 / 점수배율 / 무적 / 낙하배율 / 시드고정 / 부처버전.
// core 수치·체크포인트 산술은 건드리지 않는다. 스킵 API·상태 필드만 연결.
// 활성: ?debug=1 또는 타이틀 로고 7연타 또는 가드+필살.

import type { GameState, InputFrame } from '../core/types';
import { enterBonus } from '../core/sim';
import { enterAct2Phase } from '../core/act2';
import { GUARD_GAUGE, PLAYER, SCORE, TICK, WAZA_GAUGE } from '../config';
import { loadSave, saveSave } from '../storage';
import { phaseName } from '../content';
import { playSfx } from '../audio/audio';

export const DEBUG_TITLE_TAPS = 7;

export type ScoreMul = 1 | 10 | 100;
export type FallMul = 1 | 2 | 4;

export interface DebugRuntime {
  scoreMul: ScoreMul;
  invincible: boolean;
  fallMul: FallMul;
  seedLock: number | null;
  scoreBefore: number;
}

const runtime: DebugRuntime = {
  scoreMul: 1,
  invincible: false,
  fallMul: 1,
  seedLock: null,
  scoreBefore: 0,
};

const SCORE_CYCLE: readonly ScoreMul[] = [1, 10, 100];
const FALL_CYCLE: readonly FallMul[] = [1, 2, 4];
const PHASES = ['cathedral', 'tower', 'bolt', 'rock', 'moon'] as const;

let mounted = false;
let statusEl: HTMLElement | null = null;
let seedInput: HTMLInputElement | null = null;

export function getDebugRuntime(): DebugRuntime {
  return runtime;
}

/** makeState 시드. 고정이 없으면 Date.now() ⊕ xor. */
export function debugSeed(xor: number): number {
  if (runtime.seedLock != null) return runtime.seedLock >>> 0;
  return (Date.now() ^ xor) >>> 0;
}

export function cycleScoreMul(): ScoreMul {
  const i = SCORE_CYCLE.indexOf(runtime.scoreMul);
  runtime.scoreMul = SCORE_CYCLE[(i + 1) % SCORE_CYCLE.length]!;
  paintStatus();
  return runtime.scoreMul;
}

export function cycleFallMul(): FallMul {
  const i = FALL_CYCLE.indexOf(runtime.fallMul);
  runtime.fallMul = FALL_CYCLE[(i + 1) % FALL_CYCLE.length]!;
  paintStatus();
  return runtime.fallMul;
}

export function setInvincible(on: boolean): void {
  runtime.invincible = on;
  paintStatus();
}

export function setSeedLock(seed: number | null): void {
  runtime.seedLock = seed == null ? null : seed >>> 0;
  paintStatus();
  if (seedInput) {
    seedInput.value = runtime.seedLock == null ? '' : String(runtime.seedLock);
  }
}

/** 매틱 시뮬 직전: 무적 유지 + 점수 스냅샷. */
export function applyDebug(s: GameState, _f: InputFrame): void {
  void _f;
  if (runtime.invincible) {
    s.player.invulnTicks = Math.max(s.player.invulnTicks, PLAYER.HIT_IFRAMES);
  }
  runtime.scoreBefore = s.score;
}

/** 매틱 시뮬 직후: 점수배율 가산 + 낙하 추가분. config 정본 g/vterm은 수정하지 않는다. */
export function settleDebug(s: GameState): void {
  if (runtime.scoreMul > 1) {
    const gained = s.score - runtime.scoreBefore;
    if (gained > 0) {
      s.score = Math.min(s.score + gained * (runtime.scoreMul - 1), SCORE.CAP);
    }
  }
  applyFallMul(s, runtime.fallMul);
}

function applyFallMul(s: GameState, mul: FallMul): void {
  if (mul <= 1) return;
  const extra = mul - 1;
  const st = s.stack;
  if (st && !st.resting && st.y > 0 && st.vy < 0) {
    st.y += st.vy * TICK * extra;
    if (st.y < 0) st.y = 0;
  }
  for (const e of s.entities) {
    if (e.kind === 'bolt' && e.cueTicks <= 0 && e.vy < 0) {
      e.y += e.vy * TICK * extra;
      if (e.y < 0) e.y = 0;
    } else if (e.kind === 'rock' && e.vy < 0) {
      e.y += e.vy * TICK * extra;
      if (e.y < 0) e.y = 0;
    }
  }
}

export function mountDebugMenu(getState: () => GameState | null): void {
  if (mounted) return;
  mounted = true;

  const el = document.createElement('div');
  el.id = 'debug-menu';
  el.style.cssText = 'position:fixed;top:4px;left:4px;z-index:99;display:flex;flex-wrap:wrap;gap:4px;max-width:240px;font-size:10px;pointer-events:auto;';

  const mk = (label: string, fn: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = 'font-size:10px;padding:2px 4px;opacity:.85;';
    b.addEventListener('click', () => {
      playSfx('uiBlip');
      fn();
      paintStatus();
    });
    el.appendChild(b);
    return b;
  };

  const withState = (fn: (s: GameState) => void): (() => void) => () => {
    const s = getState();
    if (s) fn(s);
  };

  for (const phase of PHASES) {
    mk(phaseName(phase), withState((s) => {
      s.combo = 0;
      enterAct2Phase(s, phase);
    }));
  }
  mk('+1M', withState((s) => { s.score = Math.min(s.score + 1_000_000, SCORE.CAP); }));
  mk('기술풀', withState((s) => { s.wazaGauge = WAZA_GAUGE.MAX; }));
  mk('방어풀', withState((s) => { s.guardGauge = GUARD_GAUGE.MAX; }));
  mk('버터1', withState((s) => enterBonus(s, 1)));
  mk('버터2', withState((s) => enterBonus(s, 2)));
  mk('버터3', withState((s) => enterBonus(s, 3)));

  const mulBtn = mk('점수×1', () => {
    cycleScoreMul();
    mulBtn.textContent = `점수×${runtime.scoreMul}`;
  });
  const invBtn = mk('무적:OFF', () => {
    setInvincible(!runtime.invincible);
    invBtn.textContent = `무적:${runtime.invincible ? 'ON' : 'OFF'}`;
  });
  const fallBtn = mk('낙하×1', () => {
    cycleFallMul();
    fallBtn.textContent = `낙하×${runtime.fallMul}`;
  });

  const bb = mk(buddhaLabel(), () => {
    const sv = loadSave();
    sv.buddhaMode = !sv.buddhaMode;
    saveSave(sv);
    bb.textContent = buddhaLabel();
  });

  seedInput = document.createElement('input');
  seedInput.type = 'text';
  seedInput.inputMode = 'numeric';
  seedInput.placeholder = '시드';
  seedInput.setAttribute('aria-label', '시드 고정');
  seedInput.style.cssText = 'width:72px;font-size:10px;padding:2px 4px;';
  el.appendChild(seedInput);

  mk('시드고정', () => {
    const typed = parseSeed(seedInput?.value ?? '');
    const s = getState();
    const seed = typed ?? s?.rngState ?? (Date.now() >>> 0);
    setSeedLock(seed);
    if (s) s.rngState = seed;
  });
  mk('시드해제', () => setSeedLock(null));

  statusEl = document.createElement('div');
  statusEl.style.cssText = 'flex-basis:100%;font-size:9px;opacity:.8;line-height:1.3;';
  el.appendChild(statusEl);
  paintStatus();

  document.body.appendChild(el);

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const s = getState();
    switch (e.code) {
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5': {
        if (!s) break;
        const phase = PHASES[Number(e.code.slice(-1)) - 1];
        if (!phase) break;
        e.preventDefault();
        s.combo = 0;
        enterAct2Phase(s, phase);
        playSfx('uiBlip');
        break;
      }
      case 'Digit6':
        if (!s) break;
        e.preventDefault();
        enterBonus(s, 1);
        playSfx('uiBlip');
        break;
      case 'KeyM':
        e.preventDefault();
        cycleScoreMul();
        mulBtn.textContent = `점수×${runtime.scoreMul}`;
        playSfx('uiBlip');
        break;
      case 'KeyU':
        e.preventDefault();
        setInvincible(!runtime.invincible);
        invBtn.textContent = `무적:${runtime.invincible ? 'ON' : 'OFF'}`;
        playSfx('uiBlip');
        break;
      case 'KeyF':
        e.preventDefault();
        cycleFallMul();
        fallBtn.textContent = `낙하×${runtime.fallMul}`;
        playSfx('uiBlip');
        break;
      default:
        break;
    }
  });
}

function buddhaLabel(): string {
  return `부처:${loadSave().buddhaMode ? 'ON' : 'OFF'}`;
}

function parseSeed(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return n >>> 0;
}

function paintStatus(): void {
  if (!statusEl) return;
  const seed = runtime.seedLock == null ? '자유' : String(runtime.seedLock);
  statusEl.textContent =
    `×${runtime.scoreMul}  무적${runtime.invincible ? 'ON' : 'OFF'}  낙하×${runtime.fallMul}  시드:${seed}`;
  statusEl.textContent += '  (1-5페이즈 6버터 M배율 U무적 F낙하)';
}
