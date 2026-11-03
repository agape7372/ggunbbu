// 미션 탭 — 세 탭. 오늘(출근 · 신입 과제 · 월급 · 오늘의 철거 대상 · 작업 넷) · 현장(이달의 현장 트랙) · 실적(낙관판).
// 수령은 scenes가 처리하고 다시 그린다. 주홍 단추는 한 화면에 하나 — 모두 받기가 있으면 그것, 없으면 처음 나오는 받기.
// 출근부 일곱 칸은 접속할 때 뜨는 창(attendBoard)이 맡는다 — 탭에는 오늘 칸만 남는다.

import './meta.css';
import { ACHIEVES, DAILY_POOL, nextRollover } from '../meta/missions';
import {
  ATTEND, ROOKIE, TITLES, WAGE_STEPS, achieveLines, rewardText, wageReward, type Attend, type Reward, type Salary,
} from '../meta/progress';
import { SALARY_DAILY } from '../meta/catalog';
import { KIT_IDS } from '../meta/kit';
import { LOOK_EARNED } from '../meta/loadout';
import { RUNGS, freeReward, paidReward, rungNeed, rungsOpen, type SeasonTheme } from '../meta/season';
import type { DailyState, MissionDef, MissionProgress } from '../meta/types';
import { goods, type GoodsId } from './goodsArt';
import { escapeHtml } from './html';
import { fmt, glyph } from './ink';
import { armFuses, effHtml, fuseHtml } from './packView';
import { flyGoods, rewardHtml } from './rewardFx';
import { seasonCover } from './shopArt';

/** 이달의 현장 — season 저장 + 화면에 필요한 것 */
export interface SeasonView {
  key: string;
  pts: number;
  free: number;
  paid: number;
  pass: boolean;
  theme: SeasonTheme;
  daysLeft: number;
  /** 월말 점수 두 배 기간 */
  late: boolean;
  /** 특근 수당 값. 살 수 없으면(결제 없음 · 이미 삼) null */
  price: string | null;
  /** 오늘 사면 받을 수 있는 꾸미기 — 못 갈 칸 · 이미 가진 것 뺌 */
  owns: readonly string[];
  /** 특근 수당 효율(%). 0이면 인장이 없다 */
  eff: number;
}

/** 미션 탭이 읽는 것 — scenes가 저장에서 만든다 */
export interface MissionView {
  daily: DailyState;
  achieves: readonly MissionProgress[];
  /** 2배 받기가 되는가 — 광고가 없는 웹은 false(광고 위장 금지) */
  adBoost: boolean;
  /** 광고 없는 현장 */
  adFree: boolean;
  attend: Attend;
  attendOn: boolean;
  /** 지금 받을 수 있는 일당 단계. 없으면 -1 */
  wageStep: number;
  /** 오늘 받은 일당 단계 수 */
  wageGot: number;
  salary: Salary;
  salaryOn: boolean;
  /** 신입 과제 받은 단계 수 */
  rookie: number;
  rookieOn: boolean;
  season: SeasonView;
  /** 오늘의 철거 대상 */
  site: { name: string; theme: string };
  dust: number;
  orbit: number;
}

/** season = 이달의 현장 받기 · allDaily = 오늘 작업 + 일당 모두 받기 · allAchieves = 실적 모두 받기 · buyPass = 특근 수당 구매 확인 · go = 못 한 작업 하러 가기 */
export type TakeKind = 'attend' | 'wage' | 'salary' | 'rookie' | 'season' | 'allDaily' | 'allAchieves' | 'buyPass' | 'goRun' | 'goStage' | 'goAd';

type Tab = 'today' | 'site' | 'record';
const TABS: readonly { id: Tab; name: string }[] = [
  { id: 'today', name: '오늘' }, { id: 'site', name: '현장' }, { id: 'record', name: '실적' },
];
/** 고른 탭 — 받은 뒤 다시 그려도, 홈에 다녀와도 그대로 */
let tab: Tab = 'today';

/** 방금 「받기」를 누른 미션 — 다음 그리기에서 받음 이름표를 톡 띄우고 그 층을 무너뜨린다(shopView pendingBuy와 같은 방식) */
let pendingClaim: string | null = null;
/** 방금 받은 오늘 작업의 보상 칸 자리 — 다시 그린 뒤 지갑까지 날린다. 다시 그리기 전에 재 둔다 */
let pendingFly: { rect: DOMRect; arts: GoodsId[] } | null = null;

const FLOORS = 4;
const DAY = 86_400_000;

/** 실적 낙관 칸을 누르면 뜨는 창의 내용. claimId = 지금 받을 실적 */
export function achieveDetail(line: string, achieves: readonly MissionProgress[]): { title: string; html: string; claimId: string | null } | null {
  const l = achieveLines(achieves).find((x) => x.line === line);
  if (!l?.def) return l ? { title: line, html: '', claimId: null } : null;
  const p = achieves.find((x) => x.id === l.def!.id);
  return { title: l.def.title, html: `<div class="ms-rew">${rewardHtml({ dust: l.def.rewardDust, orbit: l.def.rewardOrbit, items: l.def.rewardItems, owns: l.def.owns })}</div>`, claimId: p && !p.claimed && p.count >= goalOf(l.def) ? l.def.id : null };
}

export function paintMissions(
  root: HTMLElement,
  v: MissionView,
  onClaim: (id: string, boost: boolean) => void,
  onTake: (kind: TakeKind) => void,
  onAchieve?: (line: string) => void,
): void {
  const fresh = pendingClaim;
  pendingClaim = null;
  const fly = pendingFly;
  pendingFly = null;
  // 숨은 채로 그리면 새로 들어오는 것 — 현장 탭은 지금 칸으로, 나머지는 맨 위로. 보이는 채로 그리면 받은 뒤 다시 그리기라 자리를 지킨다
  draw(root, v, fresh, root.getClientRects().length ? 'keep' : 'enter');
  if (fly) flyGoods(fly.rect, root.querySelector('.ms-wallet'), fly.arts);

  root.onclick = (e) => {
    const t = (e.target as HTMLElement).closest('[data-ms-tab],[data-line],[data-claim-id],[data-take]') as HTMLButtonElement | null;
    if (!t || t.disabled) return;
    e.preventDefault();
    const to = t.getAttribute('data-ms-tab');
    if (to) {
      if (to !== tab) {
        tab = to as Tab;
        root.closest('[data-screen]')?.classList.remove('anim'); // 처음 들어올 때 안무가 안 남게
        draw(root, v, null, 'tab');
      }
      return;
    }
    const line = t.getAttribute('data-line');
    if (line) { onAchieve?.(line); return; }
    const take = t.getAttribute('data-take');
    if (take) { onTake(take as TakeKind); return; }
    const id = t.getAttribute('data-claim-id');
    if (!id) return;
    const boost = t.getAttribute('data-claim-boost') === '1';
    const def = DAILY_POOL.find((d) => d.id === id);
    const cell = t.closest('.ms-row')?.querySelector('.rw');
    pendingFly = def && cell ? { rect: cell.getBoundingClientRect(), arts: artsOf(def) } : null;
    pendingClaim = id;
    onClaim(id, boost);
    if (!boost) pendingFly = null; // 받기가 막혀 다시 안 그렸으면 남기지 않는다(광고는 끝난 뒤에 그린다)
  };
}

/** 한 번 그린다. how = keep(자리 지킴) · enter(처음 들어옴) · tab(탭을 바꿈) */
function draw(root: HTMLElement, v: MissionView, fresh: string | null, how: 'keep' | 'enter' | 'tab'): void {
  const prevTop = root.scrollTop;
  const flags = readyTabs(v);
  const tabs = TABS.map((t) => `<button type="button" role="tab" class="ms-tab${t.id === tab ? ' on' : ''}" data-ms-tab="${t.id}" aria-selected="${t.id === tab}"${flags[t.id] ? ' aria-label="' + t.name + ', 받을 것 있음"' : ''}>${t.name}${flags[t.id] ? '<i class="ms-dot" aria-hidden="true"></i>' : ''}</button>`).join('');
  const body = tab === 'today' ? todayHtml(v, fresh) : tab === 'site' ? siteHtml(v) : recordHtml(v);
  root.innerHTML = `
    <header class="ms-band">
      <h2 class="meta-title">미션</h2>
      <p class="ms-wallet">
        <span class="cur" aria-label="먼지 ${fmt(v.dust)}">${glyph('dust')}<b>${fmt(v.dust)}</b></span>
        <span class="cur" aria-label="궤도조각 ${fmt(v.orbit)}">${glyph('orb')}<b>${fmt(v.orbit)}</b></span>
      </p>
    </header>
    <nav class="ms-tabs" role="tablist" aria-label="미션 구분">${tabs}</nav>
    <div class="ms-page${how === 'tab' ? ' ms-in' : ''}" data-tab="${tab}" role="tabpanel">${body}</div>`;

  const place = (): void => {
    root.scrollTop = how === 'keep' ? prevTop : tab === 'site' ? rungTop(root) : 0;
    armFuses(root);
  };
  place();
  if (how !== 'keep') requestAnimationFrame(place); // 숨은 채로 그렸으면 보인 뒤 한 번 더
}

/** 지금 칸(.cur)이 위에 붙는 띠 · 탭 · 모두 받기 바로 밑(앞 칸 한 줄쯤 보이게)에 오는 scrollTop. 무대 배율을 풀어 계산한다 */
function rungTop(root: HTMLElement): number {
  const cur = root.querySelector('.ms-rung.cur');
  if (!cur || [...cur.parentElement!.children].indexOf(cur) < 3) return 0; // 1~3칸이면 표지가 첫 화면
  const rr = root.getBoundingClientRect();
  const k = rr.height / (root.offsetHeight || 1) || 1;
  const y = (cur.getBoundingClientRect().top - rr.top) / k + root.scrollTop;
  const h = (sel: string): number => root.querySelector<HTMLElement>(sel)?.offsetHeight ?? 0;
  const stack = h('.ms-band') - 8 + h('.ms-tabs') + h('.ms-stick'); // 붙는 것들이 가리는 높이
  return Math.max(0, y - stack - 56);
}

function goalOf(d: MissionDef): number {
  return d.goal > 0 ? d.goal : 1;
}

const isReady = (d: MissionDef, p: MissionProgress): boolean => !p.claimed && p.count >= goalOf(d);

/** 탭마다 받을 것이 있나 — 주홍 점 */
function readyTabs(v: MissionView): Record<Tab, boolean> {
  const works = v.daily.items.some((p) => { const d = DAILY_POOL.find((x) => x.id === p.id); return !!d && isReady(d, p); });
  const s = v.season;
  const open = rungsOpen(s.pts);
  return {
    today: works || v.wageStep >= 0 || v.attendOn || v.salaryOn || (!!ROOKIE[v.rookie] && v.rookieOn),
    site: s.free < open || (s.pass && s.paid < open),
    record: recordReady(v),
  };
}

/** 실적 중 받을 수 있는 칸이 있나 */
const recordReady = (v: MissionView): boolean => achieveLines(v.achieves).some((l) => {
  const p = l.def && v.achieves.find((x) => x.id === l.def!.id);
  return !!l.def && !!p && isReady(l.def, p);
});

/** 보상에서 지갑으로 날 그림 — 먼지 · 궤도조각 · 장비 */
function artsOf(d: MissionDef): GoodsId[] {
  const out: GoodsId[] = [];
  if (d.rewardDust) out.push('dust');
  if (d.rewardOrbit) out.push('orb');
  for (const id of KIT_IDS) if (d.rewardItems?.[id]) out.push(id);
  return out;
}

const bar = (pct: number, cls = ''): string => `<span class="ms-bar${cls}"><i style="--p:${pct}%"></i></span>`;
const gotTag = (fresh = false): string => `<span class="ms-got${fresh ? ' fresh' : ''}">받음</span>`;
const CHECK = '<svg class="ms-ok" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
const LOCK = '<svg class="ms-lock" viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 11V8a4.5 4.5 0 0 1 9 0v3"/><path class="f" d="M5 11h14v10H5z"/></svg>';

/** 받기 단추 — 처음 나오는 것만 주홍 */
function takeBtn(attr: string, main: { taken: boolean }): string {
  const cta = main.taken ? '' : ' cta';
  main.taken = true;
  return `<button type="button" class="btn sm${cta} ms-take" ${attr}>받기</button>`;
}

// ── 오늘 ───────────────────────────────────────────────────

function todayHtml(v: MissionView, fresh: string | null): string {
  let n = 0;
  const next = (): number => Math.min(n++, 7); // 차례는 일곱까지 — 안무 0.7초 안

  const works = v.daily.items.flatMap((p) => {
    const def = DAILY_POOL.find((d) => d.id === p.id);
    return def ? [{ def, p }] : [];
  });
  const readyN = works.filter((w) => isReady(w.def, w.p)).length;
  const claimedN = works.filter((w) => w.p.claimed).length;
  // 모두 받기 한 번에 들어오는 몫 = 받을 작업 + 그 작업까지 받으면 열리는 일당 단계
  const wageN = WAGE_STEPS.filter((need, s) => s >= v.wageGot && need <= claimedN + readyN).length;
  const all = readyN + wageN >= 2;
  const main = { taken: all }; // 모두 받기가 주홍이면 줄 단추는 먹

  const lines = [
    v.attendOn && line({
      i: next(), ico: 'calendar', name: '출근', sub: `${Math.min(v.attend.step, ATTEND.length - 1) + 1}일째`,
      rew: ATTEND[Math.min(v.attend.step, ATTEND.length - 1)], act: takeBtn('data-take="attend"', main), cls: ' ms-attend',
    }),
    ROOKIE[v.rookie] && line({
      i: next(), ico: 'toolbox', name: escapeHtml(ROOKIE[v.rookie].title), sub: `신입 ${v.rookie + 1}/${ROOKIE.length}`,
      rew: ROOKIE[v.rookie].reward, act: v.rookieOn ? takeBtn('data-take="rookie"', main) : '',
    }),
    v.salaryOn && v.salary.left > 0 && line({
      i: next(), ico: 'envelope', name: '월급 봉투', sub: `${v.salary.left}번 남음`,
      rew: SALARY_DAILY, act: takeBtn('data-take="salary"', main),
    }),
  ].filter(Boolean).join('');

  const demo = demoHtml(v, works, claimedN, fresh, main, next());
  const rows = works.map((w) => workRow(w.def, w.p, v, main, fresh, next())).join('');
  const allBtn = all ? '<button type="button" class="btn cta lg ms-all" data-take="allDaily">모두 받기</button>' : '';
  return `<p class="ms-clock"><span>남은 시간</span>${fuseHtml(nextRollover(Date.now()), DAY)}</p>
    ${lines ? `<section class="ms-sec">${lines}</section>` : ''}
    ${demo}
    <section class="ms-sec ms-works">${rows}</section>
    ${allBtn}`;
}

/** 출근 · 신입 · 월급 한 줄 — 그림 · 이름 · 보상 · 받기 */
function line(o: { i: number; ico: GoodsId; name: string; sub: string; rew: Reward; act: string; cls?: string }): string {
  return `<div class="ms-line${o.cls ?? ''}" style="--i:${o.i}">
    ${goods(o.ico)}
    <p class="ms-name">${o.name}</p>
    <p class="ms-sub">${o.sub}</p>
    <div class="ms-rew sm">${rewardHtml(o.rew)}</div>
    <div class="ms-act">${o.act}</div>
  </div>`;
}

/** 오늘의 철거 대상 — 왼쪽 건물(네 층, 받은 작업 수만큼 위층부터 없어짐) · 오른쪽 이름 + 일당 상자 둘 */
function demoHtml(
  v: MissionView,
  works: readonly { def: MissionDef; p: MissionProgress }[],
  claimedN: number,
  fresh: string | null,
  main: { taken: boolean },
  i: number,
): string {
  const gone = Math.min(claimedN, FLOORS);
  const freshIdx = fresh && works.some((w) => w.def.id === fresh && w.p.claimed) ? gone - 1 : -1;
  // 그림 경로는 칸마다 인라인으로 둔다. CSS 변수로 넘기면 상대 경로가 assets/ 기준으로 풀려 404가 난다
  const bg = `background-image:url('./img/floors/${v.site.theme}.png')`;
  const floors = Array.from({ length: FLOORS }, (_, k) => `<i class="ms-fl${k < gone ? ' gone' : ''}${k === freshIdx ? ' fresh' : ''}" style="--k:${k};${bg}"></i>`).join('');
  const stamp = gone >= FLOORS ? `<span class="ms-stamp${freshIdx === FLOORS - 1 ? ' fresh' : ''}"><b>완파</b></span>` : '';
  const steps = WAGE_STEPS.map((need, s) => {
    const got = s < v.wageGot;
    return `<div class="ms-wg${got ? ' got' : ''}">
      <b class="ms-wg-n">${need}개</b>
      <div class="ms-rew sm">${rewardHtml(wageReward(s, v.daily.dateKey))}</div>${got ? CHECK : ''}
    </div>`;
  }).join('');
  const take = v.wageStep >= 0 ? takeBtn('data-take="wage"', main) : '';
  return `<section class="ms-dm" style="--i:${i}" aria-label="오늘의 철거 대상 ${escapeHtml(v.site.name)}, 작업 ${gone}/${FLOORS}">
    <div class="ms-bld" style="--g:${gone}">
      <div class="ms-fls">${floors}</div>
      <i class="ms-rub${freshIdx >= 0 ? ' fresh' : ''}"></i>${stamp}
    </div>
    <div class="ms-dm-r">
      <div class="ms-dm-h">
        <p class="ms-dm-t"><small>오늘의 철거 대상</small><b>${escapeHtml(v.site.name)}</b></p>
        <div class="ms-act">${take}</div>
      </div>
      <div class="ms-wgs">${steps}</div>
    </div>
  </section>`;
}

/** 못 한 작업의 바로가기 — 광고 · 지시서 말고는 아케이드 한 판 */
const GO: Readonly<Record<string, TakeKind>> = { watch_ad: 'goAd', stage_clear: 'goStage' };

/** 오늘 작업 한 줄 — 위 이름 · 막대 · 수치, 아래 보상 칸 · 단추 */
function workRow(def: MissionDef, p: MissionProgress, v: MissionView, main: { taken: boolean }, fresh: string | null, i: number): string {
  const goal = goalOf(def);
  const count = Math.max(0, Math.min(p.count, goal));
  const id = escapeHtml(def.id);
  // 2배는 받기 왼쪽 — 사이를 띄워(.ms-act gap) 받기를 누르려다 광고를 틀지 않게 한다
  const boost = v.adBoost
    ? `<button type="button" class="btn ms-boost" data-claim-id="${id}" data-claim-boost="1" aria-label="${v.adFree ? '2배로 받기' : '광고 보고 2배로 받기'}">${v.adFree ? '2배' : '광고 2배'}</button>`
    : '';
  let act = `<button type="button" class="btn sm ms-take" data-take="${GO[def.id] ?? 'goRun'}">${def.id === 'watch_ad' ? '보기' : '시작'}</button>`;
  if (isReady(def, p)) act = boost + takeBtn(`data-claim-id="${id}" data-claim-boost="0"`, main);
  else if (p.claimed) act = gotTag(fresh === def.id);
  return `<div class="ms-row${p.claimed ? ' done' : ''}" style="--i:${i}">
    <div class="ms-rt">
      <p class="ms-name">${escapeHtml(def.title)}</p>
      ${bar(Math.round((count / goal) * 100))}
      <b class="ms-num">${fmt(count)}/${fmt(goal)}</b>
    </div>
    <div class="ms-rew sm">${rewardHtml({ dust: def.rewardDust, orbit: def.rewardOrbit, items: def.rewardItems, owns: def.owns })}</div>
    <div class="ms-act">${act}</div>
  </div>`;
}

// ── 현장 ───────────────────────────────────────────────────

function siteHtml(v: MissionView): string {
  const s = v.season;
  const open = rungsOpen(s.pts);
  const base = rungNeed(open);
  const span = open >= RUNGS ? 0 : rungNeed(open + 1) - base;
  const have = s.pts - base;
  const ready = s.free < open || (s.pass && s.paid < open);
  const names = (id: string): string => escapeHtml(LOOK_EARNED[id]?.name ?? id);

  const cover = `<section class="ms-cover">
    <div class="ms-scene">${seasonCover(s.theme.id)}</div>
    <p class="ms-cv-name">${escapeHtml(s.theme.name)}</p>
    <p class="ms-cv-days"><b>${s.daysLeft}</b>일 남음</p>
    ${!s.pass && s.price ? effHtml(s.eff) : ''}
  </section>
  <section class="ms-score">
    <p class="ms-sc-t"><b>${open}</b>칸째${s.late ? '<span class="ms-x2">점수 두 배</span>' : ''}${s.pass ? '<span class="ms-pass">특근 중</span>' : ''}</p>
    ${bar(span ? Math.round((have / span) * 100) : 100, ' lg')}
    <p class="ms-sub">${span ? `다음 칸까지 <b class="ms-num">${fmt(span - have)}</b>점` : '끝 칸까지 열렸어요'}</p>
  </section>`;

  // 이 테마 특근 전용 꾸미기를 그림 칸으로 — 산 사람에겐 필요 없다
  const own = (id: string): string => `<figure class="ms-own"><div class="ms-rew">${rewardHtml({ owns: [id] })}</div><figcaption class="ms-own-n">${names(id)}</figcaption></figure>`;
  const buy = !s.pass && s.price
    ? `<section class="ms-buy">${s.owns.map(own).join('')}
         <button type="button" class="btn pay lg ms-pay" data-take="buyPass"><span>특근 수당</span><b>${escapeHtml(s.price)}</b></button>
       </section>`
    : '';
  const all = ready ? '<div class="ms-stick"><button type="button" class="btn cta lg" data-take="season">모두 받기</button></div>' : '';

  const cur = Math.min(open, RUNGS - 1);
  // 잠긴 특근 칸 = 사려는 사람이 가장 누르고 싶은 곳. 결제가 되면 칸 전체가 구매 단추(웹처럼 값이 없으면 그냥 칸)
  const paid = (i: number, got: boolean): string => {
    const buyable = !s.pass && s.price;
    const inner = `<div class="ms-rew sm">${rewardHtml(paidReward(i, s.theme))}</div>${got ? CHECK : s.pass ? '' : LOCK}`;
    const cls = `ms-rg paid${got ? ' got' : ''}`;
    return buyable
      ? `<button type="button" class="${cls}" data-take="buyPass" aria-label="특근 수당 사기">${inner}</button>`
      : `<div class="${cls}">${inner}</div>`;
  };
  const rungs = Array.from({ length: RUNGS }, (_, i) => {
    const isOpen = i < open;
    const freeGot = i < s.free;
    const paidGot = s.pass && i < s.paid;
    return `<li class="ms-rung${isOpen ? ' open' : ''}${i === cur ? ' cur' : ''}">
      <div class="ms-rg${freeGot ? ' got' : ''}"><div class="ms-rew sm">${rewardHtml(freeReward(i))}</div>${freeGot ? CHECK : ''}</div>
      <b class="ms-no">${i + 1}</b>
      ${paid(i, paidGot)}
    </li>`;
  }).join('');

  return `${cover}${buy}${all}
    <ol class="ms-track" aria-label="이달의 현장 ${RUNGS}칸">${rungs}</ol>`;
}

// ── 실적 ───────────────────────────────────────────────────

/** 부문 → 인장 글자 한 자 */
const SEAL_CHAR: Readonly<Record<string, string>> = {
  '2막': '막', 가드: '방', 근속: '근', 깔림: '깔', 도감: '감', 맨손: '맨', 명물: '명', 무기: '연',
  버터: '버', 부활: '부', 자격: '격', 지시서: '지', 철거: '철', 콤보: '콤', 필살: '필',
};

function recordHtml(v: MissionView): string {
  const lines = achieveLines(v.achieves);
  const got = v.achieves.filter((p) => p.claimed).length;
  const claimed = new Set(v.achieves.filter((p) => p.claimed).map((p) => p.id));
  const titles = TITLES.filter((t) => claimed.has(t.id));
  const cells = lines.map((l) => {
    const p = l.def && v.achieves.find((x) => x.id === l.def!.id);
    let state: string;
    if (!l.def) state = 'full';
    else if (p && isReady(l.def, p)) state = 'ready';
    else state = l.done > 0 || (p?.count ?? 0) > 0 ? 'run' : 'none';
    const label = `${l.line} ${l.done}/${l.total}${state === 'ready' ? ', 받을 수 있음' : state === 'full' ? ', 모두 받음' : ''}`;
    return `<button type="button" class="ms-seal s-${state}" data-line="${escapeHtml(l.line)}" aria-label="${escapeHtml(label)}">
      <span class="ms-sl"><b>${escapeHtml(SEAL_CHAR[l.line] ?? l.line.slice(0, 1))}</b></span>
      <span class="ms-sl-t">${escapeHtml(l.line)} <b class="ms-num">${l.done}/${l.total}</b></span>
    </button>`;
  }).join('');
  const ready = recordReady(v);
  return `<p class="ms-rec-h"><span>받은 <b class="ms-num">${got}/${ACHIEVES.length}</b></span><span>칭호 <b class="ms-num">${titles.length}</b>${titles.length ? ` · ${escapeHtml(titles[titles.length - 1].name)}` : ''}</span></p>
    ${ready ? '<button type="button" class="btn cta lg ms-all" data-take="allAchieves">모두 받기</button>' : ''}
    <div class="ms-seals">${cells}</div>`;
}

/** 접속할 때 뜨는 창의 본문 — 일곱 칸 판. 지난 칸은 받음, 오늘 칸은 진하게, 일곱째는 두 칸 */
export function attendBoard(a: Attend): string {
  const step = a.step;
  const last = ATTEND.length - 1;
  const cells = ATTEND.map((r, d) => {
    const state = d < step ? ' past' : d === step ? ' today' : '';
    return `<li class="at-c${state}${d === last ? ' big' : ''}" aria-label="${d + 1}일째 ${escapeHtml(rewardText(r))}${d < step ? ', 받음' : d === step ? ', 오늘' : ''}">
      <span class="at-day">${d + 1}일${d < step ? '<svg class="at-ok" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>' : ''}</span>
      <div class="at-rw">${rewardHtml(r)}</div>
    </li>`;
  }).join('');
  return `<ol class="at-board">${cells}</ol>`;
}
