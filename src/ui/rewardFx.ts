// 보상 연출 — 크기가 셋. S(오늘 작업 하나)는 창 없이 층이 무너지고 칸이 지갑으로 난다(flyGoods).
// M(일당 · 출근 · 신입 과제)은 먹 막 위로 칸이 90ms 간격으로 찍힌다. L(완파 · 일곱째 · 결제 · 졸업 · 칭호)은 엔소 + 먹 튐 + 인장 쾅.
// 연 뒤 0.3초는 입력을 막는다. 그다음 한 번 누르면 끝 모습으로 건너뛰고, 또 누르면 닫는다. 여러 개면 줄을 선다.

import './reward.css';
import { playSfx } from '../audio/audio';
import { KIT_IDS, kitDef } from '../meta/kit';
import { BLADE_IDS, BODY_IDS, LETTERS_IDS } from '../meta/loadout';
import { rewardText, type Reward } from '../meta/progress';
import type { Loadout } from '../meta/types';
import { goods, type GoodsId } from './goodsArt';
import { escapeHtml } from './html';
import { countTo, fmt, reduceMotion } from './ink';
import { lettersArt, playerArt, restoreLook } from './shopArt';

const LOCK_MS = 300;
const STEP_MS = 90;

let worn: (() => Loadout) | null = null;
/** 지금 입은 차림을 읽는 길 — 꾸미기 칸을 찍은 뒤 졸라맨 전역 상태를 되돌린다(불변: 찍고 나면 restoreLook) */
export const setRewardLook = (f: () => Loadout): void => { worn = f; };

/** 꾸미기 칸 그림 주소. 그릴 수 없는 것(칼 · 필살 · 캔버스 없음)은 빈 문자열 */
function ownArt(id: string, l: Loadout): string {
  const look = { weapon: l.weapon, body: l.body, blade: l.blade };
  if ((BODY_IDS as readonly string[]).includes(id)) return playerArt({ ...look, body: id as Loadout['body'], pose: 'idle' });
  if ((BLADE_IDS as readonly string[]).includes(id)) return playerArt({ ...look, blade: id as Loadout['blade'], pose: 'special' });
  if ((LETTERS_IDS as readonly string[]).includes(id)) return lettersArt(id);
  return '';
}

/** 보상 그림 + 수량 쪽지. 그릴 수 없는 착용품만 이름 */
export function rewardHtml(r: Reward): string {
  const out: string[] = [];
  const add = (id: GoodsId, n: number, label: string): void => {
    out.push(`<span class="rw" role="img" aria-label="${label} ${n}">${goods(id)}<b class="qty" data-n="${n}">${fmt(n)}</b></span>`);
  };
  if (r.dust) add('dust', r.dust, '먼지');
  if (r.orbit) add('orb', r.orbit, '궤도조각');
  for (const id of KIT_IDS) {
    const n = r.items?.[id] ?? 0;
    if (n) add(id, n, kitDef(id)!.name);
  }
  if (r.masks) add('mask1', r.masks, '마스크');
  const l = worn?.();
  const rest: string[] = [];
  for (const id of r.owns ?? []) {
    const url = l ? ownArt(id, l) : '';
    if (url) out.push(`<span class="rw rw-own" role="img" aria-label="${escapeHtml(rewardText({ owns: [id] }))}"><img src="${url}" alt="" draggable="false"></span>`);
    else rest.push(id);
  }
  if (l && r.owns?.length) restoreLook(l);
  const own = rewardText({ owns: rest });
  if (own) out.push(`<span class="rw rw-txt">${escapeHtml(own)}</span>`);
  return out.join('');
}

export interface RewardShow {
  tier: 'm' | 'l';
  title: string;
  /** 제목 아래 한 줄 — 첫 결제 선물 같은 덧붙임 */
  sub?: string;
  reward: Reward;
  /** 창 머리 색 — 창 종류와 같은 뜻. 기본 초록(보상), 결제는 gold, 출근은 navy */
  tone?: 'green' | 'navy' | 'gold';
  /** L 인장 글자 — 두 글자까지 */
  seal?: string;
}

let host: HTMLElement | null = null;
/** overlay가 뿌리 칸을 넘긴다 — 무대 배율 안에서 그린다 */
export const setRewardHost = (el: HTMLElement): void => { host = el; };

let queue: Promise<void> = Promise.resolve();
let closeNow: (() => void) | null = null;

export function showReward(o: RewardShow): Promise<void> {
  queue = queue.then(() => open(o));
  return queue;
}

/** 떠 있으면 닫고 true — 뒤로가기가 창부터 닫는다 */
export function closeReward(): boolean {
  if (!closeNow) return false;
  closeNow();
  return true;
}

const ENSO = 'M100 20C150 17 184 54 182 102C180 150 146 183 98 181C52 179 18 146 20 98C22 60 50 30 90 22';

function open(o: RewardShow): Promise<void> {
  const parent = host;
  if (!parent) return Promise.resolve();
  return new Promise((done) => {
    const el = document.createElement('div');
    el.className = `rf ${o.tier}`;
    el.dataset.tone = o.tone ?? 'green';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', `${o.title} ${rewardText(o.reward)}`);
    const ink = o.tier === 'l'
      ? `<svg class="rf-enso" viewBox="0 0 200 200" aria-hidden="true"><path d="${ENSO}" pathLength="1"/></svg>
         ${Array.from({ length: 7 }, (_, i) => `<i class="rf-drop" style="--a:${i * 52 + 12}deg;--d:${118 + (i % 3) * 22}px;--s:${8 + (i % 4) * 5}px"></i>`).join('')}`
      : '';
    el.innerHTML = `<div class="rf-box">
      <div class="rf-stage">${ink}${o.tier === 'l' && o.seal ? `<span class="rf-seal seal"><b>${escapeHtml(o.seal)}</b></span>` : ''}</div>
      <p class="rf-title">${escapeHtml(o.title)}</p>
      ${o.sub ? `<p class="rf-sub">${escapeHtml(o.sub)}</p>` : ''}
      <div class="ms-rew rf-cells">${rewardHtml(o.reward)}</div>
      <button type="button" class="btn cta lg rf-ok">확인</button>
    </div>`;
    parent.appendChild(el);

    const cells = [...el.querySelectorAll<HTMLElement>('.rf-cells .rw')];
    const start = o.tier === 'l' ? 620 : 120;
    const timers: number[] = [];
    const later = (ms: number, f: () => void): void => { timers.push(window.setTimeout(f, ms)); };
    cells.forEach((c, i) => {
      c.style.setProperty('--at', `${start + i * STEP_MS}ms`);
      const n = c.querySelector<HTMLElement>('.qty');
      const to = Number(n?.dataset.n ?? 0);
      if (n && to > 9) later(start + i * STEP_MS, () => countTo([n], 0, to, 320));
      later(start + i * STEP_MS, () => playSfx('coin', { pitchSemitones: i * 2 }));
    });
    const quiet = reduceMotion();
    if (o.tier === 'l' && o.seal) later(420, () => playSfx('stamp'));
    const endAt = start + cells.length * STEP_MS + 340;
    if (o.tier === 'l') later(endAt - 200, () => playSfx('milestone'));

    let ended = quiet;
    const finish = (): void => {
      if (ended) return;
      ended = true;
      timers.forEach(clearTimeout);
      el.classList.add('end');
      for (const c of cells) {
        const n = c.querySelector<HTMLElement>('.qty');
        if (n?.dataset.n) n.textContent = fmt(Number(n.dataset.n));
      }
    };
    if (quiet) { timers.forEach(clearTimeout); el.classList.add('end'); }
    else later(endAt, finish);

    const opened = performance.now();
    const close = (): void => {
      timers.forEach(clearTimeout);
      closeNow = null;
      el.remove();
      done();
    };
    closeNow = close;
    el.addEventListener('click', (e) => {
      if (performance.now() - opened < LOCK_MS) return;
      if (!ended) { finish(); return; }
      if ((e.target as HTMLElement).closest('.rf-ok') || e.target === el) close();
    });
    el.tabIndex = -1; // 낭독 · 키보드가 창 안에서 시작하게. 단추에 주면 포커스 테두리가 그려진다
    el.focus({ preventScroll: true });
  });
}

/** S — 보상 그림 몇 개가 눌린 자리에서 지갑으로 난다. 움직임 줄이기면 안 난다. rect는 다시 그리기 전에 재 둔다 */
export function flyGoods(from: DOMRect, to: Element | null, arts: readonly GoodsId[]): void {
  if (!to || !host || reduceMotion()) return;
  const box = host.getBoundingClientRect();
  const k = box.height / (host.offsetHeight || 1); // 무대 배율(화면 px → 무대 px)
  const end = to.getBoundingClientRect();
  arts.slice(0, 4).forEach((art, i) => {
    const g = document.createElement('span');
    g.className = 'rf-fly';
    g.innerHTML = goods(art);
    g.style.left = `${(from.left + from.width / 2 - box.left) / k}px`;
    g.style.top = `${(from.top + from.height / 2 - box.top) / k}px`;
    g.style.setProperty('--dx', `${(end.left + end.width / 2 - from.left - from.width / 2) / k}px`);
    g.style.setProperty('--dy', `${(end.top + end.height / 2 - from.top - from.height / 2) / k}px`);
    g.style.animationDelay = `${i * 70}ms`;
    g.addEventListener('animationend', () => g.remove());
    host!.appendChild(g);
  });
}
