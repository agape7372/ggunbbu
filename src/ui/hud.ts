// 인게임 HUD — DOM 오버레이(「먹 한 획」). 위 52 한지 띠 + 먹 밑줄 획, 오른쪽 가운데 콤보.
// 가드·필살 게이지는 조작 키 안에 그린다(touch.ts setGuardFill · setSpecialFill, 10-31 옆 게이지 걷음).
// 매 프레임 부르지만 값이 바뀐 칸만 쓴다. 거친 붓 필터는 안 바뀌는 칸(밑줄·일시정지 인장)에만 걸려 있다(style.css).

import type { GameState } from '../core/types';
import { ACT2, BOSS, CAPTION_MS } from '../config';
import { ACT2_PHASES, BOSS_NAME, CAPTIONS, hudModeLabel, SCREENS } from '../content';
import { ICON } from './icons';
import { fmt } from './ink';

export interface HudApi {
  /** op = 특별작전 한 줄(남은 시간 · 다음 도장). 작전이 아니면 생략 */
  sync(s: GameState, op?: string): void;
  /** 판 도중 자막(콤보 이정표·기록 돌파·구역 도달) — CAPTION_MS 뒤 사라진다. 새 자막은 앞 것을 갈아치운다 */
  note(text: string): void;
  /** 가드 가르치기 한 줄 켜고 끄기 (평생 첫 목숨 손실 때) */
  teach(on: boolean): void;
}

const LIVES = 3;
const pinHint = `${CAPTIONS.pinned}<small>탈출: 빠져나오기 · 공격: 아래층 베기</small>`;

/** 졸라맨 목숨 하나 — 잃으면 옅은 먹 위에 사선 한 획 */
const life = (on: boolean): string =>
  `<svg viewBox="0 0 16 22"${on ? '' : ' class="lost"'} aria-hidden="true"><use href="#g-life"/>${on ? '' : '<path class="xx" d="M1 3 L15 20"/>'}</svg>`;

export function mountHud(
  root: HTMLElement,
  handlers: { onPause: () => void },
): HudApi {
  root.innerHTML = `
    <div class="hud">
      <div class="hud-band"></div>
      <svg class="hud-line" viewBox="0 0 360 12" preserveAspectRatio="none" aria-hidden="true"><path d="M0 1 Q150 -1 296 3.5 L306 6 L294 8.5 Q150 11 0 11 Z"/></svg>
      <div class="hud-left">
        <div class="hud-row1">
          <span class="hud-zone" data-el="mode"></span>
          <span class="hud-lives" data-el="lives" role="img"></span>
          <span class="hud-hat" data-el="hat" role="img" aria-label="안전모" hidden>${ICON.hat}</span>
        </div>
        <div class="hud-floor" data-el="floor"></div>
      </div>
      <div class="hud-score" data-el="score">0</div>
      <button type="button" class="inkseal hud-pause" aria-label="일시정지"><svg viewBox="0 0 26 26" aria-hidden="true"><path d="M4 2 L11 2 L10 24 L3 24 Z"/><path d="M15 2 L22 2 L23 24 L16 24 Z"/></svg></button>
      <div class="hud-op" data-el="op" hidden></div>
      <div class="hud-boss" data-el="boss" hidden>
        <span class="hud-boss-label" data-el="boss-label">${BOSS_NAME}</span>
        <div class="boss-bar"><i class="fill" data-el="boss-fill"></i><svg viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true"><path d="M1 1.5 L99 1 L99.5 13 L.5 13.4 Z"/></svg></div>
      </div>
      <div class="hud-bonus" data-el="bonus" hidden></div>
      <div class="hud-cap" data-el="cap" hidden></div>
      <div class="hud-note" data-el="note" role="status" hidden></div>
      <div class="hud-teach" data-el="teach" hidden>${SCREENS.teach.guard}<small>${SCREENS.teach.guardSub}</small></div>
      <div class="hud-pin" data-el="pin" hidden>${pinHint}</div>
    </div>
  `;

  const el = (name: string): HTMLElement => root.querySelector(`[data-el="${name}"]`) as HTMLElement;
  const scoreEl = el('score');
  const livesEl = el('lives');
  const hatEl = el('hat');
  const modeEl = el('mode');
  const floorEl = el('floor');
  const bossWrap = el('boss');
  const bossFill = el('boss-fill');
  const bossLabel = el('boss-label');
  const bonusEl = el('bonus');
  const capEl = el('cap');
  const pinEl = el('pin');
  const opEl = el('op');
  const noteEl = el('note');
  const teachEl = el('teach');
  let noteTimer = 0;
  let noteAlt = false;
  let lastOp = '';
  let teaching = false;

  capEl.textContent = CAPTIONS.combo999;

  const pauseBtn = root.querySelector('.hud-pause') as HTMLButtonElement;
  pauseBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
  pauseBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handlers.onPause();
  });

  let lastScore = -1;
  let lastLives = -1;
  let lastHat: boolean | null = null;
  let lastCap = false;
  let lastMode = '';
  let lastFloor = '';
  let lastBonus = '';
  let lastBoss = '';

  function floorText(s: GameState): string {
    if (s.mode === 'act2' && s.act2Phase === 'bolt' && s.act2c) {
      return `${ACT2_PHASES.bolt.name} ${s.act2c.bolts}/${ACT2.BOLT_COUNT}`;
    }
    if (s.mode === 'act2' && s.act2Phase === 'rock' && s.act2c) {
      const sec = Math.max(0, Math.ceil((ACT2.ROCK_TIMEBOX_TICKS - s.act2c.t) / 60));
      return `${ACT2_PHASES.rock.name} ${s.act2c.rocks}/${ACT2.ROCK_COUNT} · ${sec}초`;
    }
    const st = s.stack;
    if (!st || st.floors.length === 0) return '';
    const bot = st.floors[0];
    const hp = bot.segs[0]?.hp ?? 0;
    const max = bot.segs[0]?.maxHp ?? 0;
    return `${st.floors.length}층 · ${hp}/${max}`; // 남은 층 · 맨 아래층 남은 내구
  }

  return {
    note(text: string): void {
      window.clearTimeout(noteTimer);
      noteEl.textContent = text;
      noteEl.hidden = false;
      noteAlt = !noteAlt;
      noteEl.classList.toggle('in-a', noteAlt);
      noteEl.classList.toggle('in-b', !noteAlt);
      noteTimer = window.setTimeout(() => { noteEl.hidden = true; }, CAPTION_MS);
    },
    teach(on: boolean): void {
      teaching = on;
      teachEl.hidden = !on;
      if (on) pinEl.hidden = true;
    },
    sync(s: GameState, op = ''): void {
      if (op !== lastOp) {
        lastOp = op;
        opEl.hidden = !op;
        opEl.textContent = op;
      }
      if (s.score !== lastScore) {
        lastScore = s.score;
        scoreEl.textContent = fmt(s.score);
        scoreEl.classList.toggle('long', s.score >= 10_000_000);
      }
      if (s.lives !== lastLives) {
        lastLives = s.lives;
        let h = '';
        for (let i = 0; i < LIVES; i++) h += life(i < s.lives);
        livesEl.innerHTML = h;
        livesEl.setAttribute('aria-label', `목숨 ${Math.max(0, s.lives)}/${LIVES}`);
      }
      if (s.hat !== lastHat) {
        lastHat = s.hat;
        hatEl.hidden = !s.hat;
      }

      const mt = hudModeLabel(s.mode, s.chapter, s.act2Phase);
      if (mt !== lastMode) {
        lastMode = mt;
        modeEl.textContent = mt;
      }
      const ft = floorText(s);
      if (ft !== lastFloor) {
        lastFloor = ft;
        floorEl.textContent = ft;
      }

      // 콤보 수는 판 위 타격 자리에 캔버스로 찍는다(renderer 콤보 도장) — HUD엔 999 카운터스톱 자막만
      const cap = s.combo >= 999;
      if (cap !== lastCap) {
        lastCap = cap;
        capEl.hidden = !cap;
      }

      if (s.boss && s.act2Phase === 'moon') {
        const key = `${s.boss.hp}`;
        if (lastBoss !== key) {
          lastBoss = key;
          bossWrap.hidden = false;
          bossLabel.textContent = `${BOSS_NAME} ${s.boss.hp}`;
          bossFill.style.transform = `scaleX(${Math.max(0, s.boss.hp) / BOSS.HP})`;
        }
      } else if (!bossWrap.hidden) {
        bossWrap.hidden = true;
        lastBoss = '';
      }

      if (s.mode === 'bonus' && s.bonus) {
        const sec = Math.ceil(s.bonus.ticksLeft / 60);
        const t = `${SCREENS.butter.bannerHud}<small>${sec}초 · ${s.bonus.destroyed}/${s.bonus.total}</small>`;
        if (t !== lastBonus) {
          lastBonus = t;
          bonusEl.hidden = false;
          bonusEl.innerHTML = t;
        }
      } else if (!bonusEl.hidden) {
        bonusEl.hidden = true;
        lastBonus = '';
      }

      pinEl.hidden = s.player.pose !== 'pinned' || teaching; // 가르치는 동안은 가르치는 줄 하나만
    },
  };
}

/** HUD 레이어가 없으면 #stage에 만들어 붙인다. */
export function ensureHudLayer(): HTMLElement {
  let el = document.getElementById('hud-layer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'hud-layer';
    el.className = 'ui-layer';
    document.getElementById('stage')?.appendChild(el);
  }
  return el;
}
