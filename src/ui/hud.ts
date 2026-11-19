// 인게임 HUD — DOM 오버레이(「B 현장」 11-11). 위 50 한지 띠 한 줄 + 띠 바로 밑 가로 진행 게이지 한 줄. 콤보는 판 위 도장(renderer, 불변 11).
// 가드·필살 게이지는 조작 키 안에 그린다(touch.ts setGuardFill · setSpecialFill, 10-31 옆 게이지 걷음).
// 매 프레임 부르지만 값이 바뀐 칸만 쓴다. 거친 붓 필터는 안 바뀌는 칸(밑줄·일시정지 인장·게이지 테)에만 걸려 있다(style.css).

import type { GameState } from '../core/types';
import { ACT2, CAPTION_MS, PLAYER } from '../config';
import { CAPTIONS, hudModeLabel, SCREENS } from '../content';
import { ICON } from './icons';
import { fmt } from './ink';
import { arcadeBar, stageBar, type HudBar } from './stageLogic';

/** 띠 가운데 둘째 줄 — head가 있으면 구역 이름 대신 첫 줄에 선다(지시서: 「1-1 회랑 3번지」 + 시계) */
export interface HudOp { head?: string; line: string }

export interface HudApi {
  /** op = 작전 · 지시서 한 줄(남은 시간 · 다음 도장 / 판 이름 · 시계). 작전이 아니면 생략 */
  sync(s: GameState, op?: HudOp | null): void;
  /** 판 도중 자막(콤보 이정표·기록 돌파·구역 도달) — CAPTION_MS 뒤 사라진다. 새 자막은 앞 것을 갈아치운다 */
  note(text: string): void;
  /** 가드 가르치기 한 줄 켜고 끄기 (평생 첫 목숨 손실 때) */
  teach(on: boolean): void;
}

const pinHint = `${CAPTIONS.pinned}<small>탈출: 안전하게 · 공격: 아래층 베기, 실패하면 목숨 −1</small>`;

/** 졸라맨 목숨 하나 — 잃으면 옅은 먹 위에 사선 한 획 */
const life = (on: boolean): string =>
  `<svg viewBox="0 0 16 22"${on ? '' : ' class="lost"'} aria-hidden="true"><use href="#g-life"/>${on ? '' : '<path class="xx" d="M1 3 L15 20"/>'}</svg>`;

/** 게이지 값 — 「남은 88%」 · 「집행기 4000」은 앞말 작게 + 뒷수 크게, 띄어쓰기 없는 보스 이름은 작은 한 줄 */
function markHtml(label: string): string {
  const i = label.lastIndexOf(' ');
  return i < 0 ? `<small>${label}</small>` : `<small>${label.slice(0, i)}</small><b>${label.slice(i + 1)}</b>`;
}

export function mountHud(
  root: HTMLElement,
  handlers: { onPause: () => void },
): HudApi {
  root.innerHTML = `
    <div class="hud">
      <div class="hud-band">
        <div class="hud-left">
          <div class="hud-row1">
            <span class="hud-lives" data-el="lives" role="img"></span>
            <span class="hud-hat" data-el="hat" role="img" aria-label="안전모" hidden>${ICON.hat}</span>
          </div>
          <b class="hud-floor" data-el="floor"></b>
        </div>
        <div class="hud-mid">
          <span class="hud-zone" data-el="mode"></span>
          <b class="hud-op" data-el="op" hidden></b>
        </div>
        <div class="hud-right">
          <b class="hud-score" data-el="score">0</b>
          <b class="hud-bank" data-el="bank" hidden></b>
        </div>
        <button type="button" class="inkseal hud-pause" aria-label="일시정지"><svg viewBox="0 0 26 26" aria-hidden="true"><path d="M4 2 L11 2 L10 24 L3 24 Z"/><path d="M15 2 L22 2 L23 24 L16 24 Z"/></svg></button>
      </div>
      <svg class="hud-line" viewBox="0 0 360 12" preserveAspectRatio="none" aria-hidden="true"><path d="M0 1 Q150 -1 296 3.5 L306 6 L294 8.5 Q150 11 0 11 Z"/></svg>
      <div class="hud-boss" data-el="boss" role="img" hidden>
        <div class="boss-bar" data-el="boss-bar"><i class="fill"></i><svg viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true"><path d="M0.4 1.3 L99.5 0.8 L99.7 11 L0.6 11.3 Z"/></svg></div>
        <span class="boss-mk" data-el="boss-label"></span>
        <b class="boss-end" data-el="boss-end" hidden></b>
      </div>
      <div class="hud-bonus" data-el="bonus" hidden></div>
      <div class="hud-cap" data-el="cap" hidden></div>
      <div class="hud-note" data-el="note" role="status" hidden></div>
      <div class="hud-teach" data-el="teach" hidden>${SCREENS.teach.guard}<small>${SCREENS.teach.guardSub}</small></div>
      <div class="hud-pin" data-el="pin" hidden>${pinHint}</div>
    </div>
  `;

  const el = (name: string): HTMLElement => root.querySelector(`[data-el="${name}"]`) as HTMLElement;
  const hudEl = root.querySelector('.hud') as HTMLElement;
  const scoreEl = el('score');
  const livesEl = el('lives');
  const hatEl = el('hat');
  const bankEl = el('bank');
  const modeEl = el('mode');
  const floorEl = el('floor');
  const bossWrap = el('boss');
  const bossLabel = el('boss-label');
  const bossBar = el('boss-bar');
  const bossEnd = el('boss-end');
  const bonusEl = el('bonus');
  const capEl = el('cap');
  const pinEl = el('pin');
  const opEl = el('op');
  const noteEl = el('note');
  const teachEl = el('teach');
  let noteTimer = 0;
  let noteAlt = false;
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
  let lastBank = 0;
  let lastCap = false;
  let lastMode = '';
  let lastOp = '';
  let lastFloor = '';
  let lastBonus = '';
  let lastBoss = '';

  /** 2막 번개 · 바위 단계의 셈(단계 이름은 첫 줄 구역 칸이 말한다) — 층 칸 대신 띠 가운데 둘째 줄에 선다 */
  function phaseCount(s: GameState): string {
    if (s.mode !== 'act2' || !s.act2c) return '';
    if (s.act2Phase === 'bolt') return `${s.act2c.bolts}/${ACT2.BOLT_COUNT}`;
    if (s.act2Phase !== 'rock') return '';
    const sec = Math.max(0, Math.ceil((ACT2.ROCK_TIMEBOX_TICKS - s.act2c.t) / 60));
    return `${s.act2c.rocks}/${ACT2.ROCK_COUNT} · ${sec}초`;
  }

  function floorText(s: GameState): string {
    const st = s.stack;
    if (!st || st.floors.length === 0) return '';
    const seg = st.floors[0].segs[0];
    return `${st.floors.length}층 ${seg?.hp ?? 0}/${seg?.maxHp ?? 0}`; // 남은 층 · 맨 아래층 남은 내구
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
    sync(s: GameState, op?: HudOp | null): void {
      if (s.score !== lastScore) {
        lastScore = s.score;
        scoreEl.textContent = fmt(s.score);
        scoreEl.classList.toggle('long', s.score >= 10_000_000);
      }
      if (s.lives !== lastLives) {
        lastLives = s.lives;
        // 시작 장비로 늘어난 목숨은 그만큼 칸이 는다. 잃으면 칸째 사라지고 기본 셋만 빈 칸으로 남는다
        const cap = Math.max(PLAYER.LIVES, s.lives);
        let h = '';
        for (let i = 0; i < cap; i++) h += life(i < s.lives);
        livesEl.innerHTML = h;
        livesEl.setAttribute('aria-label', `목숨 ${Math.max(0, s.lives)}`);
      }
      if (s.wazaBank !== lastBank) {
        lastBank = s.wazaBank;
        bankEl.hidden = s.wazaBank <= 0;
        bankEl.textContent = `필살 +${s.wazaBank}`;
      }
      if (s.hat !== lastHat) {
        lastHat = s.hat;
        hatEl.hidden = !s.hat;
      }

      // 가운데 두 줄 — 첫 줄 구역(2막 단계 · 버터바 · 야근) 또는 판 이름, 둘째 줄 작전 · 지시서 시계 · 2막 셈
      const mt = op?.head ?? hudModeLabel(s.mode, s.chapter, s.act2Phase);
      if (mt !== lastMode) {
        lastMode = mt;
        modeEl.textContent = mt;
      }
      const pc = phaseCount(s);
      const ot = op?.line || pc;
      if (ot !== lastOp) {
        lastOp = ot;
        opEl.hidden = !ot;
        opEl.textContent = ot;
        // 특별작전 줄(「85초 · 0/10채 B」)은 띠 가운데에 안 들어간다 — 띠 바로 아래 오른쪽 한 줄로 내린다
        hudEl.classList.toggle('op-sub', !!op && !op.head);
      }
      const ft = pc ? '' : floorText(s); // 번개 · 바위 단계엔 층 대신 셈이 가운데에 선다
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

      // 가로 게이지 — 스테이지는 진행(대본 칸 · 보스 남은 몸), 아케이드는 1막 진행 · 2막 남은 단계 · 집행기 체력
      const bar: HudBar | null = s.stage ? stageBar(s) : arcadeBar(s);
      const barKey = bar ? `${bar.label}|${bar.fill}|${bar.n}|${bar.end}` : '';
      if (barKey !== lastBoss) {
        lastBoss = barKey;
        bossWrap.hidden = !bar;
        if (bar) {
          bossWrap.style.setProperty('--f', String(bar.fill));
          bossWrap.style.setProperty('--n', String(bar.n));
          bossWrap.setAttribute('aria-label', `${bar.end} ${bar.label}`.trim());
          bossLabel.innerHTML = markHtml(bar.label);
          bossLabel.hidden = !bar.label.includes(' '); // 숫자 없는 보스 이름(「종탑」)은 띠 가운데가 이미 보인다
          bossBar.classList.toggle('notched', bar.n > 1);
          bossEnd.hidden = !bar.end;
          bossEnd.textContent = bar.end;
        }
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
