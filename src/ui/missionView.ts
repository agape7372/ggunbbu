// 미션 탭 조각. 수령은 overlay가 claim 후 다시 paint.

import { ACHIEVES, DAILY_POOL } from '../meta/missions';
import type { DailyState, MissionDef, MissionProgress } from '../meta/types';

export function missionHtml(): string {
  return `<div class="ov-missions ov-panel">
    <h2>미션</h2>
    ${adBoostOn ? '<p class="ov-manual-lead">광고를 보면 보상이 두 배.</p>' : ''}
    <p class="ov-records-h" data-el="daily-h">오늘의 미션</p>
    <div data-el="daily" style="display:flex;flex-direction:column;gap:8px"></div>
    <p class="ov-records-h" style="margin-top:8px">달성 미션</p>
    <div data-el="achieve" style="display:flex;flex-direction:column;gap:8px"></div>
  </div>`;
}

let adBoostOn = true; // paintMissions가 매 렌더 갱신

export function paintMissions(
  root: HTMLElement,
  daily: DailyState,
  defs: readonly MissionDef[],
  achieveProg: readonly MissionProgress[],
  achieveDefs: readonly MissionDef[],
  adBoost: boolean, // 08-30: 광고 경로 실재 여부 — 웹은 false, 부스트 버튼 미렌더 (광고 위장 금지)
  onClaim: (id: string, boost: boolean) => void,
): void {
  adBoostOn = adBoost;
  root.innerHTML = missionHtml();
  const dailyH = root.querySelector('[data-el="daily-h"]');
  if (dailyH) {
    dailyH.textContent = daily.dateKey
      ? `오늘의 미션 · ${daily.dateKey}`
      : '오늘의 미션';
  }

  const dailyBox = root.querySelector('[data-el="daily"]');
  const achieveBox = root.querySelector('[data-el="achieve"]');
  if (dailyBox) {
    for (const p of daily.items) {
      const def = findDef(p.id, defs, DAILY_POOL);
      if (def) dailyBox.appendChild(missionRow(def, p));
    }
  }
  if (achieveBox) {
    const list = achieveDefs.length ? achieveDefs : ACHIEVES;
    const paired = list.map((def) => ({
      def,
      p: achieveProg.find((x) => x.id === def.id) ?? { id: def.id, count: 0, claimed: false },
    }));
    // ★11개를 같은 크기로 쌓아 3배 스크롤이 났다(08-30 실측) — 지금 할 수 있는 것부터 올리고,
    // 끝난 것은 한 줄로 접는다. 정보량은 그대로, 훑는 거리는 줄어든다.
    const rank = (x: { def: MissionDef; p: MissionProgress }): number => {
      if (x.p.claimed) return 2;
      return x.p.count >= goalOf(x.def) ? 0 : 1;
    };
    paired.sort((a2, b2) => rank(a2) - rank(b2));
    const done: string[] = [];
    for (const x of paired) {
      if (x.p.claimed) {
        done.push(x.def.title);
        continue;
      }
      achieveBox.appendChild(missionRow(x.def, x.p));
    }
    if (done.length > 0) {
      const line = document.createElement('p');
      line.className = 'mission-done';
      line.textContent = `수령 완료 ${done.length}개 · ${done.join(' · ')}`;
      achieveBox.appendChild(line);
    }
  }

  root.onclick = (e) => {
    const t = (e.target as HTMLElement).closest('[data-claim-id]') as HTMLButtonElement | null;
    if (!t || t.disabled) return;
    const id = t.getAttribute('data-claim-id');
    if (!id) return;
    const boost = t.getAttribute('data-claim-boost') === '1';
    e.preventDefault();
    onClaim(id, boost);
  };
}

function missionRow(def: MissionDef, p: MissionProgress): HTMLElement {
  const goal = goalOf(def);
  const count = Math.max(0, p.count);
  const ready = !p.claimed && count >= goal;
  const ratio = Math.max(0, Math.min(1, count / goal));

  const wrap = document.createElement('div');
  wrap.className = 'mission-row';

  const title = document.createElement('p');
  title.className = 'mission-title';
  title.textContent = def.title;
  wrap.appendChild(title);

  const desc = descOf(def);
  if (desc) {
    const sub = document.createElement('p');
    sub.className = 'ov-manual-lead mission-desc';
    sub.textContent = desc;
    wrap.appendChild(sub);
  }

  const bar = document.createElement('div');
  bar.className = 'bar';
  const fill = document.createElement('span');
  fill.className = 'fill';
  fill.style.width = `${Math.round(ratio * 100)}%`;
  // ★노랑 = "지금 할 수 있다" 하나로 통일(08-30 2차 감식). 진행 중은 잉크, 수령 가능일 때만 노랑.
  fill.className = ready ? 'fill is-ready' : 'fill';
  if (p.claimed) fill.classList.add('is-done');
  bar.appendChild(fill);
  wrap.appendChild(bar);

  const meta = document.createElement('p');
  meta.className = 'mission-meta';
  meta.textContent = p.claimed
    ? '수령 완료'
    : `${count.toLocaleString('ko-KR')} / ${goal.toLocaleString('ko-KR')}  ·  먼지 ${dustOf(def)} · 궤도조각 ${orbitOf(def)}`;
  wrap.appendChild(meta);

  if (p.claimed) return wrap;

  const row = document.createElement('div');
  row.style.display = 'grid';
  row.style.gridTemplateColumns = adBoostOn ? '1fr 1fr' : '1fr';
  row.style.gap = '4px';
  row.appendChild(claimBtn(def.id, false, ready, '수령'));
  if (adBoostOn) row.appendChild(claimBtn(def.id, true, ready, '광고 받고 2배 수령'));
  wrap.appendChild(row);
  return wrap;
}

function claimBtn(id: string, boost: boolean, ready: boolean, label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = boost ? 'flyer-btn primary' : 'flyer-btn';
  b.style.minHeight = '44px';
  b.style.padding = '6px 6px';
  b.style.fontSize = '11px';
  b.textContent = label;
  b.setAttribute('data-claim-id', id);
  b.setAttribute('data-claim-boost', boost ? '1' : '0');
  b.disabled = !ready;
  if (!ready) b.classList.add('locked');
  return b;
}

function findDef(
  id: string,
  primary: readonly MissionDef[],
  fallback: readonly MissionDef[],
): MissionDef | undefined {
  return primary.find((d) => d.id === id) ?? fallback.find((d) => d.id === id);
}

function goalOf(d: MissionDef): number {
  const x = d as MissionDef & { goal?: number; target?: number };
  const g = x.goal ?? x.target ?? 0;
  return g > 0 ? g : 1;
}

function dustOf(d: MissionDef): number {
  const x = d as MissionDef & { rewardDust?: number; dust?: number };
  return x.rewardDust ?? x.dust ?? 0;
}

function orbitOf(d: MissionDef): number {
  const x = d as MissionDef & { rewardOrbit?: number; orbit?: number };
  return x.rewardOrbit ?? x.orbit ?? 0;
}

function descOf(d: MissionDef): string {
  const x = d as MissionDef & { desc?: string; blurb?: string };
  return x.desc ?? x.blurb ?? '';
}
