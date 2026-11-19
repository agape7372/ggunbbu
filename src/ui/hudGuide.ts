// 튜토리얼 담당자 무전(11-20 2판) — 말풍선(무전기 + 「담당자」 + 대사 + 행동 유도) · 누를 키 꼬리표(주홍) · 타이밍 큰 글 「지금!」.
// 말풍선은 먹 · 한지만, 꼬리표만 주홍(불변 10: 판이 그 키를 기다리는 동안 누를 것은 그 키 하나).
// 글은 한 글자씩 찍힌다(초당 CPS자). 안 찍힌 글자도 자리는 처음부터 잡아 둔다(visibility) — 찍는 동안 줄이 출렁이지 않게.
// [공격]처럼 대괄호로 적은 키 이름은 먹 칩 하나로(이스케이프 뒤 치환).

import type { TouchAction } from '../input/touch';
import { SCREENS } from '../content';
import { escapeHtml } from './html';
import { reduceMotion } from './ink';

export interface GuideView {
  /** 걸음이 바뀌면 말풍선이 위에서 내려온다 */
  lesson: string;
  say: string;
  /** 행동 유도 한 줄. 빈 글이면 줄 · 금을 숨긴다 */
  ask: string;
  ok: boolean;
  /** 꼬리표를 붙일 키(판이 그 키를 기다리며 서 있을 때만) */
  point: { key: TouchAction; label: string } | null;
  /** 타이밍 박자 — 판 가운데 「지금!」 */
  now: boolean;
}

/** 초당 찍는 글자 수 */
const CPS = 45;

/** 무전기 — 곧은 몸통 · 안테나 한 획 · 스피커 줄 셋 · 작은 단추, 전파 호 둘(찍는 동안만 번갈아) */
const RADIO = `<svg class="g-radio" viewBox="0 0 28 36" aria-hidden="true">
<path class="g-ant" d="M7.5 12 V2"/><path class="g-w1" d="M11.5 4 Q14.5 7 11.5 10"/><path class="g-w2" d="M15.5 1.5 Q21 7 15.5 12.5"/>
<rect class="g-body" x="2" y="12" width="19" height="23"/><path class="g-spk" d="M6 17 H17 M6 20.5 H17 M6 24 H17"/><rect class="g-btn" x="9" y="28" width="5" height="3.5"/></svg>`;

/** 글 → 찍을 낱자 span. 줄바꿈은 그대로(pre-line), 키 이름 칩은 한 낱자로 */
function unitsHtml(text: string): string {
  return text.split(/(\[[^\]]+\])/).map((part) => {
    const chip = /^\[([^\]]+)\]$/.exec(part);
    if (chip) return `<b class="g-chip u h">${escapeHtml(chip[1])}</b>`;
    return [...part].map((c) => (c === '\n' ? '\n' : `<span class="u h">${escapeHtml(c)}</span>`)).join('');
  }).join('');
}

export function mountGuide(layer: HTMLElement, hudEl: HTMLElement): { set(v: GuideView | null): void; el: HTMLElement } {
  const T = SCREENS.training;
  const box = document.createElement('div');
  box.className = 'hud-guide';
  box.dataset.el = 'guide';
  box.setAttribute('role', 'status');
  box.hidden = true;
  box.innerHTML = `<div class="g-h">${RADIO}<b class="g-who">${T.who}</b></div><p class="g-l"></p><p class="g-k"></p><i class="g-ok" hidden>${T.ok}</i>`;
  const sayEl = box.querySelector('.g-l') as HTMLElement;
  const askEl = box.querySelector('.g-k') as HTMLElement;
  const okEl = box.querySelector('.g-ok') as HTMLElement;

  const point = document.createElement('div');
  point.className = 'hud-point';
  point.hidden = true;
  const now = document.createElement('b');
  now.className = 'hud-now';
  now.hidden = true;
  now.textContent = T.now;
  hudEl.append(box, point, now);

  let lesson = '';
  let say = '';
  let ask = '';
  let ok = false;
  let pointKey = '';
  let pointOn: GuideView['point'] = null;
  let raf = 0;

  /** 낱자를 차례로 드러낸다. 다 찍히면 전파 호가 멈춘다 */
  function type(units: HTMLElement[]): void {
    cancelAnimationFrame(raf);
    if (reduceMotion()) {
      for (const u of units) u.classList.remove('h');
      box.classList.remove('typing');
      return;
    }
    box.classList.add('typing');
    const t0 = performance.now();
    let shown = 0;
    const step = (t: number): void => {
      const n = Math.min(units.length, Math.floor(((t - t0) * CPS) / 1000) + 1);
      for (; shown < n; shown++) units[shown].classList.remove('h');
      if (shown < units.length) raf = requestAnimationFrame(step);
      else box.classList.remove('typing');
    };
    raf = requestAnimationFrame(step);
  }

  /** 꼬리표 자리 — 키의 가운데 위. 맥동(scale)에 흔들리지 않게 가운데 + offsetHeight로 잰다. 무대 안으로 자른다 */
  function place(): void {
    if (!pointOn) return;
    const btn = document.getElementById(`btn-${pointOn.key}`);
    if (!btn) { point.hidden = true; return; }
    const hr = hudEl.getBoundingClientRect();
    const k = hr.width / (hudEl.offsetWidth || 1) || 1;
    const r = btn.getBoundingClientRect();
    const cx = (r.left + r.width / 2 - hr.left) / k;
    const top = (r.top + r.height / 2 - hr.top) / k - btn.offsetHeight / 2;
    const w = point.offsetWidth;
    const h = point.offsetHeight;
    const x = Math.max(w / 2 + 4, Math.min(hudEl.offsetWidth - w / 2 - 4, cx));
    point.style.left = `${Math.round(x - w / 2)}px`;
    point.style.top = `${Math.round(Math.max(0, top - h - 8))}px`; // 세모 8px이 키 위 가장자리에 닿는다
    point.style.setProperty('--ax', `${Math.round(cx - (x - w / 2))}px`); // 세모는 키 가운데를 가리킨다(자른 만큼 옮긴다)
  }
  window.addEventListener('resize', () => place());

  return {
    el: box,
    set(v: GuideView | null): void {
      if (!v) {
        cancelAnimationFrame(raf);
        box.hidden = true;
        point.hidden = true;
        now.hidden = true;
        layer.classList.remove('pointing');
        lesson = say = ask = pointKey = '';
        ok = false;
        pointOn = null;
        return;
      }
      box.hidden = false;
      if (v.lesson !== lesson) {
        lesson = v.lesson;
        box.classList.remove('in');
        void box.offsetWidth; // 다시 내려오게
        box.classList.add('in');
      }
      if (v.say !== say) {
        say = v.say;
        ask = v.ask;
        sayEl.innerHTML = unitsHtml(say);
        askEl.innerHTML = unitsHtml(ask);
        askEl.hidden = ask === '';
        type([...sayEl.querySelectorAll<HTMLElement>('.u'), ...askEl.querySelectorAll<HTMLElement>('.u')]);
      } else if (v.ask !== ask) {
        ask = v.ask;
        askEl.innerHTML = unitsHtml(ask);
        askEl.hidden = ask === '';
        type([...sayEl.querySelectorAll<HTMLElement>('.u.h'), ...askEl.querySelectorAll<HTMLElement>('.u')]);
      }
      if (v.ok !== ok) {
        ok = v.ok;
        okEl.hidden = !ok;
      }
      const pk = v.point ? `${v.point.key}|${v.point.label}` : '';
      if (pk !== pointKey) {
        pointKey = pk;
        pointOn = v.point;
        point.hidden = !v.point;
        layer.classList.toggle('pointing', !!v.point); // 꼬리표가 키 층 위로(불변 10 — 누를 것 하나)
        if (v.point) { point.textContent = v.point.label; point.dataset.key = v.point.key; place(); }
      }
      if (now.hidden === v.now) now.hidden = !v.now;
    },
  };
}
