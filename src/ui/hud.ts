// 인게임 HUD — DOM 오버레이. 캔버스 drawHud와 정보가 겹치면
// renderer.ts에서 drawHud 호출을 빼는 패치를 권장(이 파일은 renderer를 건드리지 않음).

import type { GameState } from '../core/types';
import { ACT2, BOSS } from '../config';
import { ACT2_PHASES, BOSS_NAME, CAPTIONS, hudModeLabel, SCREENS } from '../content';

export interface HudApi {
  sync(s: GameState): void;
}

const pinHint = `${CAPTIONS.pinned} — 가드:탈출 · 공격:밑층`;

export function mountHud(
  root: HTMLElement,
  handlers: { onPause: () => void },
): HudApi {
  root.innerHTML = `
    <div class="hud">
      <button type="button" class="hud-pause" aria-label="일시정지">잠깐</button>
      <div class="hud-row hud-row-top">
        <div class="hud-col hud-col-left">
          <div class="hud-score" data-el="score">00000000</div>
          <div class="hud-lives" data-el="lives"></div>
        </div>
        <div class="hud-col hud-col-mid">
          <div class="hud-mode" data-el="mode"></div>
          <div class="hud-floor" data-el="floor"></div>
        </div>
        <div class="hud-col hud-col-right">
          <div class="hud-combo" data-el="combo"></div>
          <div class="hud-gauges">
            <div class="bar bar-guard" title="방어 게이지">
              <span class="ghost" data-el="guard-ghost"></span>
              <span class="fill" data-el="guard-fill"></span>
            </div>
            <div class="bar bar-waza" data-el="waza-bar" title="필살 게이지">
              <span class="ghost" data-el="waza-ghost"></span>
              <span class="fill" data-el="waza-fill"></span>
            </div>
          </div>
        </div>
      </div>
      <div class="hud-boss" data-el="boss" hidden>
        <span class="hud-boss-label" data-el="boss-label">${BOSS_NAME}</span>
        <div class="bar bar-boss">
          <span class="fill" data-el="boss-fill"></span>
        </div>
      </div>
      <div class="hud-bonus" data-el="bonus" hidden></div>
      <div class="hud-cap" data-el="cap" hidden>${CAPTIONS.combo999}</div>
      <div class="hud-pin" data-el="pin" hidden>${pinHint}</div>
      <div class="hud-waza-ready" data-el="ready" hidden></div>
    </div>
  `;

  const el = (name: string): HTMLElement => root.querySelector(`[data-el="${name}"]`) as HTMLElement;
  const scoreEl = el('score');
  const livesEl = el('lives');
  const modeEl = el('mode');
  const floorEl = el('floor');
  const comboEl = el('combo');
  const guardFill = el('guard-fill');
  const guardGhost = el('guard-ghost');
  const wazaFill = el('waza-fill');
  const wazaGhost = el('waza-ghost');
  const wazaBar = el('waza-bar');
  const bossWrap = el('boss');
  const bossFill = el('boss-fill');
  const bossLabel = el('boss-label');
  const bonusEl = el('bonus');
  const capEl = el('cap');
  const pinEl = el('pin');
  const readyEl = el('ready');

  capEl.textContent = CAPTIONS.combo999;
  pinEl.textContent = `${CAPTIONS.pinned} — 가드:탈출 · 공격:밑층`;
  readyEl.textContent = CAPTIONS.specialReady;

  const pauseBtn = root.querySelector('.hud-pause') as HTMLButtonElement;
  pauseBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
  pauseBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handlers.onPause();
  });

  let lastScore = -1;
  let lastLives = -1;
  let lastCombo = -1;
  let lastMode = '';
  let lastFloor = '';
  let lastBonus = '';
  let lastBoss = '';
  let comboPunchTimer = 0;
  // 게이지: 매 프레임 style.width를 다시 쓰면 레이아웃이 매 프레임 무효화된다(08-30 실측).
  // 정수 %가 바뀔 때만 쓴다.
  let lastG = -1;
  let lastW = -1;
  // 고스트(지연 추격)는 CSS transition으로 하면 매 프레임 목표값이 다시 쓰여 트랜지션이
  // 계속 재시작돼 화면에 아무것도 안 나온다 — JS에서 감쇠값을 직접 굴린다.
  let ghostG = 0;
  let ghostW = 0;
  let lastGhostG = -1;
  let lastGhostW = -1;
  // punch 애니메이션 재시작에 쓰던 void offsetWidth(강제 동기 리플로우)를 없애고
  // 같은 키프레임을 가리키는 클래스 2개를 번갈아 단다.
  let punchAlt = false;

  /** 값이 오르면 즉시 따라가고, 내려갈 때만 프레임당 GHOST_DECAY_PCT 씩 천천히 내려온다. */
  const GHOST_DECAY_PCT = 1.6;
  function chaseGhost(prev: number, v: number): number {
    if (v >= prev) return v;
    return Math.max(v, prev - GHOST_DECAY_PCT);
  }

  function livesHtml(n: number): string {
    let s = '';
    for (let i = 0; i < 3; i++) s += `<i class="life${i < n ? ' on' : ''}"></i>`;
    return s;
  }

  function modeText(s: GameState): string {
    return hudModeLabel(s.mode, s.chapter, s.act2Phase);
  }

  function floorText(s: GameState): string {
    if (s.mode === 'act2' && s.act2Phase === 'bolt' && s.act2c) {
      return `${ACT2_PHASES.bolt.name} ${s.act2c.bolts}/${ACT2.BOLT_COUNT}`;
    }
    if (s.mode === 'act2' && s.act2Phase === 'rock' && s.act2c) {
      const sec = Math.max(0, Math.ceil((ACT2.ROCK_TIMEBOX_TICKS - s.act2c.t) / 60));
      return `${ACT2_PHASES.rock.name} ${s.act2c.rocks}/${ACT2.ROCK_COUNT} · ${sec}s`;
    }
    const st = s.stack;
    if (!st || st.floors.length === 0) return '';
    const bot = st.floors[0];
    const hp = bot.segs[0]?.hp ?? 0;
    const max = bot.segs[0]?.maxHp ?? 0;
    return `층 ${st.floors.length} · 밑 ${hp}/${max}`;
  }

  return {
    sync(s: GameState): void {
      if (s.score !== lastScore) {
        lastScore = s.score;
        scoreEl.textContent = String(s.score).padStart(8, '0');
      }
      if (s.lives !== lastLives) {
        lastLives = s.lives;
        livesEl.innerHTML = livesHtml(s.lives);
      }

      const mt = modeText(s);
      if (mt !== lastMode) {
        lastMode = mt;
        modeEl.textContent = mt;
      }

      const ft = floorText(s);
      if (ft !== lastFloor) {
        lastFloor = ft;
        floorEl.textContent = ft;
      }

      if (s.combo !== lastCombo) {
        const rose = s.combo > lastCombo && s.combo > 0;
        const broke = lastCombo > 0 && s.combo === 0;
        lastCombo = s.combo;
        comboEl.textContent = s.combo > 0 ? `${s.combo} COMBO` : '';
        comboEl.classList.toggle('hot', s.combo >= 500 && s.combo < 999);
        comboEl.classList.toggle('mid', s.combo >= 100 && s.combo < 500);
        comboEl.classList.toggle('hi', s.combo >= 50 && s.combo < 100);
        comboEl.classList.toggle('cap', s.combo >= 999);
        comboEl.classList.toggle('broke', broke);
        if (rose) {
          // 클래스 2개를 번갈아 달아 애니메이션을 재시작한다 — 강제 리플로우 없이 같은 효과.
          punchAlt = !punchAlt;
          comboEl.classList.toggle('punch', punchAlt);
          comboEl.classList.toggle('punch-b', !punchAlt);
          window.clearTimeout(comboPunchTimer);
          comboPunchTimer = window.setTimeout(() => {
            comboEl.classList.remove('punch');
            comboEl.classList.remove('punch-b');
          }, 90);
        }
        capEl.hidden = s.combo < 999;
      }

      const g = Math.max(0, Math.min(100, s.guardGauge));
      const w = Math.max(0, Math.min(100, s.wazaGauge));
      const gi = Math.round(g);
      const wi = Math.round(w);
      if (gi !== lastG) {
        lastG = gi;
        guardFill.style.width = `${gi}%`;
      }
      if (wi !== lastW) {
        lastW = wi;
        wazaFill.style.width = `${wi}%`;
      }
      ghostG = chaseGhost(ghostG, g);
      ghostW = chaseGhost(ghostW, w);
      const ggi = Math.round(ghostG);
      const gwi = Math.round(ghostW);
      if (ggi !== lastGhostG) {
        lastGhostG = ggi;
        guardGhost.style.width = `${ggi}%`;
      }
      if (gwi !== lastGhostW) {
        lastGhostW = gwi;
        wazaGhost.style.width = `${gwi}%`;
      }
      wazaBar.classList.toggle('full', w >= 100);
      readyEl.hidden = w < 100;

      if (s.boss && s.act2Phase === 'moon') {
        const key = `${s.boss.hp}`;
        if (lastBoss !== key) {
          lastBoss = key;
          bossWrap.hidden = false;
          bossLabel.textContent = `${BOSS_NAME} ${s.boss.hp}`;
          bossFill.style.width = `${(100 * s.boss.hp) / BOSS.HP}%`;
        }
      } else if (!bossWrap.hidden) {
        bossWrap.hidden = true;
        lastBoss = '';
      }

      if (s.mode === 'bonus' && s.bonus) {
        const sec = Math.ceil(s.bonus.ticksLeft / 60);
        const t = `${SCREENS.butter.bannerHud} ${sec}s  ${s.bonus.destroyed}/${s.bonus.total}`;
        if (t !== lastBonus) {
          lastBonus = t;
          bonusEl.hidden = false;
          bonusEl.textContent = t;
        }
      } else if (!bonusEl.hidden) {
        bonusEl.hidden = true;
        lastBonus = '';
      }

      pinEl.hidden = s.player.pose !== 'pinned';
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
