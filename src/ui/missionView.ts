// 미션 탭 조각. 수령은 overlay가 claim 후 다시 paint.

import { ACHIEVES, DAILY_POOL } from '../meta/missions';
import type { DailyState, MissionDef, MissionProgress } from '../meta/types';
import { ICON } from './icons';
import { escapeHtml } from './html';

export function paintMissions(
  root: HTMLElement,
  daily: DailyState,
  defs: readonly MissionDef[],
  achieveProg: readonly MissionProgress[],
  achieveDefs: readonly MissionDef[],
  adBoost: boolean, // 08-30: 광고 경로 실재 여부 — 웹은 false, 부스트 버튼 미렌더 (광고 위장 금지)
  onClaim: (id: string, boost: boolean) => void,
): void {
  root.innerHTML = `
    <header class="sheet-head">
      <h2>미션</h2>
      ${adBoost ? '<p class="sheet-lead">광고를 보고 받으면 보상이 두 배.</p>' : ''}
    </header>
    <p class="sec-h">오늘 <small>${escapeHtml(daily.dateKey ?? '')}</small></p>
    <div data-el="daily"></div>
    <p class="sec-h">업적</p>
    <div data-el="achieve"></div>`;

  const dailyBox = root.querySelector('[data-el="daily"]') as HTMLElement;
  const achieveBox = root.querySelector('[data-el="achieve"]') as HTMLElement;
  for (const p of daily.items) {
    const def = defs.find((d) => d.id === p.id) ?? DAILY_POOL.find((d) => d.id === p.id);
    if (def) dailyBox.appendChild(missionRow(def, p, adBoost));
  }

  const list = achieveDefs.length ? achieveDefs : ACHIEVES;
  const paired = list.map((def) => ({
    def,
    p: achieveProg.find((x) => x.id === def.id) ?? { id: def.id, count: 0, claimed: false },
  }));
  // 지금 받을 수 있는 것부터, 받은 것은 한 줄로 접는다(08-30 실측: 11개 같은 크기로 쌓아 3배 스크롤)
  const rank = (x: { def: MissionDef; p: MissionProgress }): number => {
    if (x.p.claimed) return 2;
    return x.p.count >= goalOf(x.def) ? 0 : 1;
  };
  paired.sort((a, b) => rank(a) - rank(b));
  const done: string[] = [];
  for (const x of paired) {
    if (x.p.claimed) done.push(x.def.title);
    else achieveBox.appendChild(missionRow(x.def, x.p, adBoost));
  }
  if (done.length > 0) {
    const line = document.createElement('p');
    line.className = 'm-done';
    line.textContent = `받은 업적 ${done.length}개 · ${done.join(' · ')}`;
    achieveBox.appendChild(line);
  }

  root.onclick = (e) => {
    const t = (e.target as HTMLElement).closest('[data-claim-id]') as HTMLButtonElement | null;
    if (!t || t.disabled) return;
    const id = t.getAttribute('data-claim-id');
    if (!id) return;
    e.preventDefault();
    onClaim(id, t.getAttribute('data-claim-boost') === '1');
  };
}

function missionRow(def: MissionDef, p: MissionProgress, adBoost: boolean): HTMLElement {
  const goal = goalOf(def);
  const count = Math.max(0, Math.min(p.count, goal));
  const ready = !p.claimed && count >= goal;

  const reward = [
    def.rewardDust > 0 ? `<span aria-label="먼지">${ICON.dust}${def.rewardDust}</span>` : '',
    def.rewardOrbit > 0 ? `<span aria-label="궤도조각">${ICON.orbit}${def.rewardOrbit}</span>` : '',
  ].join('');
  const actions = ready
    ? `<button type="button" class="btn btn-sm" data-claim-id="${escapeHtml(def.id)}" data-claim-boost="0">받기</button>`
      + (adBoost ? `<button type="button" class="btn btn-sm" data-claim-id="${escapeHtml(def.id)}" data-claim-boost="1">${ICON.ad}2배</button>` : '')
    : '';

  const wrap = document.createElement('div');
  wrap.className = 'm-row';
  wrap.innerHTML = `
    <div class="m-top">
      <p class="m-title">${escapeHtml(def.title)}</p>
      <p class="m-count">${fmt(count)} / ${fmt(goal)}</p>
    </div>
    ${def.desc ? `<p class="m-desc">${escapeHtml(def.desc)}</p>` : ''}
    <div class="bar"><span class="fill${ready ? ' is-ready' : ''}" style="width:${Math.round((count / goal) * 100)}%"></span></div>
    <div class="m-foot">
      <p class="reward">${reward}</p>
      <div class="m-actions">${actions}</div>
    </div>`;
  return wrap;
}

function goalOf(d: MissionDef): number {
  return d.goal > 0 ? d.goal : 1;
}

function fmt(n: number): string {
  return n.toLocaleString('ko-KR');
}

