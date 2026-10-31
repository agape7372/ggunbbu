// 미션 탭 조각. 수령은 overlay가 claim 후 다시 paint.
// 주홍은 한 화면에 하나 — 처음 나오는 「받기」만 인장, 나머지 받을 것은 먹 획, 받은 것은 먹 「받음」 도장.

import './meta.css';
import { ACHIEVES, DAILY_POOL, ROLLOVER_HOUR } from '../meta/missions';
import type { DailyState, MissionDef, MissionProgress } from '../meta/types';
import { escapeHtml } from './html';
import { fmt, glyph } from './ink';

/** 방금 「받기」를 누른 미션 — 다음 그리기에서 받음 도장을 쿵 찍는다(shopView pendingBuy와 같은 방식) */
let pendingClaim: string | null = null;

export function paintMissions(
  root: HTMLElement,
  daily: DailyState,
  defs: readonly MissionDef[],
  achieveProg: readonly MissionProgress[],
  achieveDefs: readonly MissionDef[],
  adBoost: boolean, // 08-30: 광고 경로 실재 여부 — 웹은 false, 부스트 버튼 미렌더 (광고 위장 금지)
  onClaim: (id: string, boost: boolean) => void,
): void {
  const fresh = pendingClaim;
  pendingClaim = null;
  const main = { taken: false };
  let i = 0;
  const next = (): number => Math.min(i++, 7); // 차례는 일곱까지 — 안무 0.7초 안

  const dailyRows = daily.items.map((p) => {
    const def = defs.find((d) => d.id === p.id) ?? DAILY_POOL.find((d) => d.id === p.id);
    return def ? missionRow(def, p, adBoost, main, fresh, next()) : '';
  }).join('');

  const list = achieveDefs.length ? achieveDefs : ACHIEVES;
  const paired = list.map((def) => ({
    def,
    p: achieveProg.find((x) => x.id === def.id) ?? { id: def.id, count: 0, claimed: false },
  }));
  // 지금 받을 수 있는 것부터, 받은 것은 한 줄로 접는다(08-30 실측: 11개 같은 크기로 쌓아 3배 스크롤)
  const rank = (x: { def: MissionDef; p: MissionProgress }): number => {
    if (x.p.claimed) return x.def.id === fresh ? 0 : 2;
    return x.p.count >= goalOf(x.def) ? 0 : 1;
  };
  paired.sort((a, b) => rank(a) - rank(b));
  const done: string[] = [];
  const achieveHead = next();
  let achieveRows = '';
  for (const x of paired) {
    // 방금 받은 업적은 이번 한 번만 줄로 남겨 도장이 찍히는 걸 보인다
    if (x.p.claimed && x.def.id !== fresh) done.push(x.def.title);
    else achieveRows += missionRow(x.def, x.p, adBoost, main, fresh, next());
  }
  const doneLine = done.length > 0
    ? `<p class="ms-done">받은 업적 ${done.length}개 · ${done.map(escapeHtml).join(' · ')}</p>`
    : '';

  root.innerHTML = `
    <h2 class="meta-title">미션</h2>
    ${adBoost ? '<p class="meta-lead">광고를 보고 받으면 보상이 두 배.</p>' : ''}
    <h3 class="ms-h" style="--i:0">오늘 <small>${String(ROLLOVER_HOUR).padStart(2, '0')}:00에 새 미션</small></h3>
    <div>${dailyRows}</div>
    <h3 class="ms-h" style="--i:${achieveHead}">업적</h3>
    <div>${achieveRows}${doneLine}</div>`;

  root.onclick = (e) => {
    const t = (e.target as HTMLElement).closest('[data-claim-id]') as HTMLButtonElement | null;
    if (!t || t.disabled) return;
    const id = t.getAttribute('data-claim-id');
    if (!id) return;
    e.preventDefault();
    pendingClaim = id;
    onClaim(id, t.getAttribute('data-claim-boost') === '1');
  };
}

function missionRow(
  def: MissionDef,
  p: MissionProgress,
  adBoost: boolean,
  main: { taken: boolean },
  fresh: string | null,
  i: number,
): string {
  const goal = goalOf(def);
  const count = Math.max(0, Math.min(p.count, goal));
  const ready = !p.claimed && count >= goal;

  const reward = [
    def.rewardDust > 0 ? `<span class="cur" aria-label="먼지 ${def.rewardDust}">${glyph('dust')}${fmt(def.rewardDust)}</span>` : '',
    def.rewardOrbit > 0 ? `<span class="cur" aria-label="궤도조각 ${def.rewardOrbit}">${glyph('orb')}${fmt(def.rewardOrbit)}</span>` : '',
  ].join('');
  const isMain = ready && !main.taken;
  if (isMain) main.taken = true;
  const id = escapeHtml(def.id);
  // 광고 두 배는 받기 위 — 사이를 띄워(.ms-act gap) 받기를 누르려다 광고를 틀지 않게 한다
  const boost = adBoost
    ? `<button type="button" class="tag ms-boost" data-claim-id="${id}" data-claim-boost="1">광고 보고 2배</button>`
    : '';
  let act = '';
  if (ready) {
    act = boost + (isMain
      ? `<button type="button" class="seal ms-take" data-claim-id="${id}" data-claim-boost="0"><b>받기</b></button>`
      : `<button type="button" class="stroke s3 ms-take2" data-claim-id="${id}" data-claim-boost="0"><b>받기</b></button>`);
  } else if (p.claimed) {
    act = `<span class="seal ink ms-got${fresh === def.id ? ' fresh' : ''}"><b>받음</b></span>`;
  }

  return `<div class="ms-row" style="--i:${i}">
    <p class="ms-name">${escapeHtml(def.title)}</p>
    ${def.desc ? `<p class="ms-desc">${escapeHtml(def.desc)}</p>` : ''}
    <div class="ms-prog"><span class="ms-bar"><i style="--p:${Math.round((count / goal) * 100)}%"></i></span><span class="ms-count">${fmt(count)} / ${fmt(goal)}</span></div>
    <p class="ms-rew">${reward}</p>
    <div class="ms-act">${act}</div>
  </div>`;
}

function goalOf(d: MissionDef): number {
  return d.goal > 0 ? d.goal : 1;
}
