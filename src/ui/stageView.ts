// 작업 지시서 화면 — 철거 지도(터 열셋 · 쪽지 · 착수) · 현장 일지(createStageUi) + 철거 보고서 속(stageReport · 결과 화면 틀은 overlay).
// 「먹 한 획」: 주홍은 「착수」 하나(공격 키 자리). 깬 판은 먹 도장 하나(가장 높게 깬 난이도). 숫자는 --black, 붓은 제목 · 다음 · 도장 · 착수에만.
// 규칙 · 기록은 core · meta가 갖고 있다. 여기는 부르기만 한다. 화면 글은 content/stages.ts 한 곳.

import './stage.css';
import { REGIONS, STAGE_MODE, STAGE_TEXT, fmtStageTime } from '../content/stages';
import { STAGES, type StageDef } from '../core/stages';
import type { StageDiff } from '../core/types';
import { KEY_SIZE, ZONE, type Pos } from '../input/layout';
import { STAMP_KEYS, diffUnlocked, hasStamp, recordOf, stageUnlocked, type StageRecord } from '../meta/stageRecord';
import { THEME_TIERS } from '../render/sprites';
import { nextStage, nextStageDef } from './homeLogic';
import { escapeHtml as esc } from './html';
import { artOf, artSvg } from './mapArt';
import { stampTotals, type StageEndView } from './stageLogic';

export interface StageListOpts {
  recs: Readonly<Record<string, StageRecord>>;
  /** 시험판 전해금 — 다 열린다. 기록은 꾸미지 않는다 */
  allOpen: boolean;
  /** 「착수」 자리(input/layout goSeat) — 공격 키 기본 자리, 실제 공격 키가 있는 쪽 */
  seat: Pos & { sx: -1 | 0 | 1 };
}

export interface StageHandlers {
  onStart(id: string, diff: StageDiff, fromBoss: boolean): void;
}

export interface StageUi {
  /** 지도를 연다. detail = 그 판을 고른 채로(없으면 다음 판) */
  show(opts: StageListOpts, detail?: string): void;
  /** 한 칸 물러난다(펼친 쪽지 → 접기 · 일지 → 지도). 이미 지도면 false(홈으로 가는 건 부른 쪽 몫) */
  back(): boolean;
}

/** 마지막에 고른 난이도 — 세션 안 변수(저장 키 없음). 기본 정규 */
let diffPick: StageDiff = 1;
/** 홈 「착수」가 읽는다(ui/homeLogic.ts) */
export const lastDiffPick = (): StageDiff => diffPick;

/** 쪽지와 「착수」 사이 */
const SLIP_GAP = 12;
/** 위에서부터 본사 · 4 · 3 · 2 · 1구역 */
const ROWS = [4, 3, 2, 1, 0] as const;

const isOpen = (o: StageListOpts, id: string): boolean => o.allOpen || stageUnlocked(o.recs, id);
const defOf = (id: string) => STAGES.find((d) => d.id === id);

/** 첫 줄이 지역 이름(`서쪽 회랑.`)이면 뺀다 — 제목이 이미 말했다 */
const dropName = (lines: readonly string[], name: string): readonly string[] => (lines[0] === `${name}.` ? lines.slice(1) : lines);
const spans = (lines: readonly string[]): string => lines.map((l) => `<span>${esc(l)}</span>`).join('');
/** 「A · B」 글은 「·」 자리에서만 줄을 바꾼다 — 덩어리마다 한 줄로 묶는다 */
const dotWrap = (s: string): string => s.split(' · ').map((c, i, a) => `<span class="nw">${esc(c)}${i < a.length - 1 ? ' ·' : ''}</span>`).join(' ');

/** 램프 = 가장 높게 깬 난이도 이름표(견습 · 정규 · 외주). 아직이면 비워 둔다. 보고서 머리의 난이도 상자와 같은 모양 */
const lampTag = (lamp: number): string => (lamp > 0 ? `<span class="st-lamp">${STAGE_MODE.diffs[lamp - 1]}</span>` : '');

const stampCount = (bits: number): number => STAMP_KEYS.filter((k) => hasStamp(bits, k)).length;

/** 정규 도장 다섯 칸 */
function pips(bits: number): string {
  return `<span class="st-pips" role="img" aria-label="${STAGE_MODE.stampTotal} ${stampCount(bits)}/${STAMP_KEYS.length}">${
    STAMP_KEYS.map((k) => `<i${hasStamp(bits, k) ? ' class="on"' : ''}></i>`).join('')}</span>`;
}

/** 위 띠 — 지도면 「홈」(쪽지를 펼친 동안은 「뒤로」 = 접기, fold가 바꾼다) · 일지면 「뒤로」(지도) · 제목 · 오른쪽 칸 */
const band = (title: string, back: string, right = ''): string =>
  `<div class="hf-band mp-band"><button type="button" class="mp-back" data-act="stage-back">${back}</button><h2 class="mp-ttl">${title}</h2>${right}</div>`;

/** 터 하나 — 잠김(옅은 윤곽) · 열림(건물) · 다음(붓 「다음」) · 깬 판(잔해 + 먹 도장 하나 = 가장 높게 깬 난이도). 기록은 터에 안 올린다(쪽지 「내 기록」) */
function lotHtml(o: StageListOpts, d: StageDef, i: number, sel: string, next: string | null): string {
  const rec = recordOf(o.recs, d.id);
  const open = isOpen(o, d.id);
  const done = rec.lamp > 0;
  const nx = open && !done && d.id === next;
  const name = STAGE_TEXT[d.id]?.name ?? '';
  const best = rec.best > 0 ? fmtStageTime(rec.best) : '';
  const tier = THEME_TIERS[d.theme];
  const art = artOf(d, i);
  const state = !open ? [STAGE_MODE.lockKey]
    : [...(done ? [`${STAGE_MODE.clears} ${STAGE_MODE.diffs[rec.lamp - 1]}`, best] : nx ? [STAGE_MODE.nextTag] : []),
      `${STAGE_MODE.stampTotal} ${stampCount(rec.stamps)}/${STAMP_KEYS.length}`];
  const label = [`${d.id} ${name}`, ...state, d.id === sel ? STAGE_MODE.picked : ''].filter(Boolean).join(', ');
  const body = done
    ? `<span class="mp-cut">${STAGE_MODE.diffs[rec.lamp - 1]}</span>${artSvg('rub', 'mp-art a-rub')}`
    : `${nx ? `<span class="mp-nx">${STAGE_MODE.nextTag}</span>` : ''}${artSvg(art, `mp-art a-${art}`)}`;
  const cls = `${!open ? ' lk' : done ? ' done' : nx ? ' nx' : ''}${d.id === sel ? ' on' : ''}`;
  return `<button type="button" class="mp-lot${cls}" data-st="pick" data-id="${d.id}" aria-pressed="${d.id === sel}" aria-label="${esc(label)}"
    style="--bf:${done ? tier.mid.base : tier.weak.base};--i:${i}"><span class="mp-bda">${body}</span>
    <span class="mp-pl"><span class="mp-p1"><b class="n">${esc(d.id)}</b>${pips(rec.stamps)}</span><span class="mp-nm">${esc(name)}</span></span></button>`;
}

function mapHtml(o: StageListOpts, sel: string): string {
  const tot = stampTotals(o.recs);
  const next = nextStage(o.recs);
  const fresh = Object.keys(o.recs).length === 0;
  const rows = ROWS.map((ri) => {
    const defs = STAGES.filter((d) => d.region === ri);
    const lit = defs.some((d) => isOpen(o, d.id));
    // 처음 온 사람 — 모드 표지 세 줄은 본사 줄 옆 빈 자리에
    const cover = ri === 4 && fresh ? `<p class="mp-cover">${spans(STAGE_MODE.cover)}</p>` : '';
    return `<section class="mp-st${ri === 4 ? ' hq' : ''}${lit ? '' : ' lk'}"><h3 class="mp-rh"><b class="n">${ri + 1}</b>${esc(REGIONS[ri].name)}</h3>${cover}
      <div class="mp-row">${defs.map((d, i) => lotHtml(o, d, i, sel, next)).join('')}</div></section>`;
  }).join('');
  const right = `<span class="mp-cnt"><small>${STAGE_MODE.stampTotal}</small><b class="n">${tot.stamps}/${tot.stampMax}</b></span>
    <button type="button" class="tag mp-log" data-st="log">${STAGE_MODE.log}</button>`;
  return `${band(STAGE_MODE.title, STAGE_MODE.home, right)}<div class="mp-map">${rows}</div>${slipHtml(o, sel)}`;
}

/**
 * 쪽지(「착수」의 반대쪽) + 「착수」(공격 키 기본 자리). 접힌 쪽지 = 머리 · 기록 셋 · 난이도 셋뿐(11-12 줄임, 사유는 stage.css 머리).
 * 머리를 누르면 위로 펼쳐져 지시서 한 장의 나머지(구역 글 · 지시 · 특기 사항 · 난이도 글 · 보스 연습)가 보인다
 */
function slipHtml(o: StageListOpts, id: string): string {
  const d = defOf(id);
  const t = STAGE_TEXT[id];
  if (!d || !t) return '';
  const rec = recordOf(o.recs, id);
  const open = isOpen(o, id);
  const ok = (v: StageDiff): boolean => o.allOpen || diffUnlocked(rec, v);
  if (!ok(diffPick)) diffPick = 1;
  const rg = REGIONS[d.region];
  // 지역 글 — 명물 판을 깼으면 바뀐 세계(after). 지시 글과 같은 세 줄이면 한 번만
  const last = STAGES.filter((x) => x.region === d.region).at(-1);
  const lines = last && recordOf(o.recs, last.id).lamp > 0 ? rg.after : rg.start;
  const got = hasStamp(rec.stamps, 'secret');
  // 난이도 세 줄(잠긴 난이도는 여는 조건). 잠긴 판은 잠금 한 줄만
  const notes = open
    ? ([0, 1, 2] as const).map((v) => `${STAGE_MODE.diffs[v]} · ${ok(v) ? STAGE_MODE.diffNote[v] : STAGE_MODE.diffLocked}`)
    : [STAGE_MODE.locked];
  const practice = d.boss
    ? `<div class="mp-prac"><button type="button" data-st="practice"${open ? '' : ' disabled'}>${STAGE_MODE.practice}</button><small>${dotWrap(STAGE_MODE.practiceNote)}</small></div>`
    : '';
  const more = `<div class="mp-more" id="mp-more"><div class="mp-more-in">
      <p class="st-reg">${esc(rg.name)}<span class="nav-stamp mp-sign">${STAGE_MODE.navStamp}</span></p>
      ${lines === t.order ? '' : `<p class="st-lines">${spans(dropName(lines, rg.name))}</p>`}
      <div class="st-order">${dropName(t.order, rg.name).map((l) => `<p>${esc(l)}</p>`).join('')}</div>
      <div class="st-slot"><span>${STAGE_MODE.stamps[3]}</span>${got ? `<i class="st-got">${STAGE_MODE.stamps[3]}</i>` : '<i class="st-empty"></i>'}</div>
      <p class="st-riddle">${esc(t.riddle)}</p>
      ${t.note ? `<p class="st-note">${STAGE_MODE.note} · ${esc(t.note)}</p>` : ''}
      <p class="mp-note">${spans(notes)}</p>
      ${practice}
    </div></div>`;
  const diffs = ([0, 1, 2] as const).map((v) => `<button type="button" data-st="diff" data-v="${v}" aria-pressed="${v === diffPick}"${
    open && ok(v) ? '' : ' disabled'}${v === diffPick ? ' class="on"' : ''}>${STAGE_MODE.diffs[v]}</button>`).join('');
  const fact = (k: string, v: string): string => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
  const s = o.seat;
  const w = KEY_SIZE.attack.w;
  // 「착수」가 오른쪽이면 쪽지는 왼쪽. 넓은 화면에선 「착수」가 틀 끝까지 밀리니(sx) 틀 가장자리에서 잰 간격은 그대로다
  const right = s.x + w / 2 > ZONE.w / 2;
  const at = right ? `left:14px;right:${ZONE.w - s.x + SLIP_GAP}px` : `left:${s.x + w + SLIP_GAP}px;right:14px`;
  const go = open ? STAGE_MODE.start : STAGE_MODE.lockKey;
  const name = esc(t.name);
  return `<section class="mp-slip${open ? '' : ' lk'}" style="${at}" aria-label="${esc(id)} ${name}">
      <button type="button" class="mp-head" data-st="fold" aria-expanded="false" aria-controls="mp-more">
        <b class="n">${esc(id)}</b><b class="mp-nm${t.name.length > 4 ? ' long' : ''}">${name}</b>${d.boss ? `<span class="tag ink">${STAGE_MODE.bossTag}</span>` : ''}</button>
      ${more}
      <dl class="mp-facts">${fact(STAGE_MODE.par, `<b class="n">${fmtStageTime(d.par)}</b>`)}${fact(STAGE_MODE.master, `<b class="n">${fmtStageTime(d.master)}</b>`)}${
        fact(STAGE_MODE.myBest, rec.best > 0 ? `<b class="n">${fmtStageTime(rec.best)}</b>` : STAGE_MODE.none)}</dl>
      <div class="mp-diffs seg" role="group" aria-label="${STAGE_MODE.title}">${diffs}</div>
    </section>
    <button type="button" class="tbtn mp-go ${open ? 'f-seal' : 'f-faint'}" data-st="start" aria-label="${go} ${esc(id)} ${name}${open ? ` ${STAGE_MODE.diffs[diffPick]}` : ''}"
      style="left:calc(var(--fr-x, 0px) + ${s.x}px);top:${s.y}px;--sx:${s.sx}"><span>${go}</span></button>`;
}

function logHtml(o: StageListOpts): string {
  const tot = stampTotals(o.recs);
  const rows = STAGES.map((d) => {
    const rec = recordOf(o.recs, d.id);
    const open = isOpen(o, d.id);
    const parts = [`${STAGE_MODE.start} <b class="n">${rec.tries}</b>`, `${STAGE_MODE.clears} <b class="n">${rec.clears}</b>`];
    if (rec.first) parts.push(`${STAGE_MODE.firstClear} <b class="n">${esc(rec.first)}</b>`);
    return `<li class="st-lrow${open ? '' : ' off'}"><span class="st-id n">${esc(d.id)}</span><b>${esc(STAGE_TEXT[d.id]?.name ?? '')}</b>${lampTag(rec.lamp)}
      <small>${parts.join(' · ')}</small></li>`;
  }).join('');
  return `${band(STAGE_MODE.log, STAGE_MODE.mapBack)}<div class="mp-logbody">
    <p class="st-total"><span>${STAGE_MODE.stampTotal} <b class="n">${tot.stamps}/${tot.stampMax}</b></span><span>${STAGE_MODE.stamps[4]} <b class="n">${tot.masters}/${tot.masterMax}</b></span></p>
    <ol class="st-log">${rows}</ol></div>`;
}

export function createStageUi(root: HTMLElement, h: StageHandlers): StageUi {
  let opts: StageListOpts = { recs: {}, allOpen: false, seat: { x: 0, y: 0, sx: 0 } };
  let view: 'map' | 'log' = 'map';
  let sel = '';

  /** 다시 그려도 손에 든 자리(키보드 포커스)를 잃지 않게 — 같은 data-st · data-id · data-v 를 다시 잡는다 */
  function render(): void {
    const f = document.activeElement;
    const was = f instanceof HTMLElement && root.contains(f)
      ? ['data-st', 'data-id', 'data-v', 'data-act'].map((k) => (f.hasAttribute(k) ? `[${k}="${f.getAttribute(k)}"]` : '')).join('')
      : '';
    root.innerHTML = view === 'log' ? logHtml(opts) : mapHtml(opts, sel);
    if (was) root.querySelector<HTMLElement>(was)?.focus();
  }

  /** 쪽지 펼치기 · 접기 — 다시 그리지 않고 겉만 바꾼다(160ms가 이어지게). 펼친 동안 덮인 지도는 누를 수 없다 */
  function fold(open: boolean): void {
    root.querySelector('.mp-slip')?.classList.toggle('open', open);
    root.querySelector('.mp-head')?.setAttribute('aria-expanded', String(open));
    const map = root.querySelector<HTMLElement>('.mp-map');
    if (map) map.inert = open;
    const back = root.querySelector('.mp-back');
    if (back) back.textContent = open ? STAGE_MODE.mapBack : STAGE_MODE.home;
  }
  const folded = (): boolean => !root.querySelector('.mp-slip.open');

  root.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('[data-st]') as HTMLElement | null;
    if (!t || (t as HTMLButtonElement).disabled) return;
    switch (t.getAttribute('data-st')) {
      case 'pick': {
        const id = t.getAttribute('data-id') ?? '';
        // 고른 터를 한 번 더 = 착수(잠긴 판이면 시작 쪽이 거절음을 낸다)
        if (id === sel) h.onStart(sel, diffPick, false);
        else { sel = id; render(); }
        break;
      }
      case 'fold': fold(folded()); break;
      case 'log': view = 'log'; render(); break;
      case 'diff': diffPick = Number(t.getAttribute('data-v')) as StageDiff; render(); break;
      case 'start': h.onStart(sel, diffPick, false); break;
      case 'practice': h.onStart(sel, diffPick, true); break;
      default: break;
    }
  });

  return {
    show(o, detail): void {
      opts = o;
      view = 'map';
      // 처음 고른 터 = 부른 쪽이 준 판 · 아니면 다음 판(다 깼으면 마지막 판)
      sel = detail && defOf(detail) ? detail : nextStageDef(o.recs).id;
      render();
    },
    back(): boolean {
      if (view === 'log') { view = 'map'; render(); return true; }
      if (!folded()) { fold(false); return true; }
      return false;
    },
  };
}

/* ── 철거 보고서(결과 보고서 한 장의 속 — 머리 · 띠 · 키는 overlay가 단다) ── */

const FLIP_MS = 500;

function stampRows(v: StageEndView): string {
  const rows = STAMP_KEYS.map((k, i) => {
    const on = hasStamp(v.stamps, k);
    const fresh = on && hasStamp(v.newStamps, k);
    // 못 깬 판은 접수만 반려를 찍는다 — 나머지는 아직 심사 전이라 흐린 빈칸
    const void_ = !v.cleared && k !== 'done';
    return `<li class="st-row ${on ? 'on' : void_ ? 'void' : 'rej'}${fresh ? ' new' : ''}" style="--i:${i}">
      <span class="st-slotname">${STAGE_MODE.stamps[i]}</span>
      <i class="st-stamp">${on ? STAGE_MODE.stampedMark : void_ ? '' : STAGE_MODE.reject}</i>
    </li>`;
  }).join('');
  // 다섯 칸 한 줄 — 못 찍은 특기 사항의 수수께끼는 줄 밑에 한 줄
  const si = STAMP_KEYS.indexOf('secret');
  const riddle = hasStamp(v.stamps, 'secret') ? '' : `<small class="st-riddle">${STAGE_MODE.stamps[si]} · ${esc(v.riddle)}</small>`;
  return `<div class="st-rows" data-flip>
    <ul class="st-front">${rows}</ul>${riddle}
    <p class="st-back">${esc(v.flip)}</p>
  </div>`;
}

/** 보고서 속(판 이름 → 시간 → 전임자 → 도장 → 사유 → 퇴장 대사 → 소식)과 귀퉁이 도장(외주를 깼으면 먹 인장, 아니면 '') */
export function stageReport(v: StageEndView): { html: string; stamp: string } {
  const diff = STAGE_MODE.diffs[v.diff];
  const prog = !v.cleared && /^\d+\/\d+$/.test(v.time);
  const name = `<p class="st-rname"><span class="st-id">${esc(v.id)}</span> ${esc(v.name)} <small>${diff}</small></p>`;
  const time = `<p class="st-time${v.cleared ? '' : ' miss'}">${prog ? `<small>${STAGE_MODE.progress}</small> ` : ''}${esc(v.time)}</p>`;
  if (v.kind === 'practice') {
    return {
      html: `${name}<p class="st-sub">${STAGE_MODE.practiceReport}</p>${time}<p class="st-line">${v.cleared ? STAGE_MODE.cleared : STAGE_MODE.notCleared}</p>`,
      stamp: '',
    };
  }
  // 시간 옆에 전임자 한 줄(보고서 한 장 높이 안에 들게)
  const trow = `<div class="st-trow">${time}${v.diff === 1 && v.master ? `<p class="st-master">${esc(v.master)}</p>` : ''}</div>`;
  const head = v.diff === 1 ? stampRows(v)
    : v.diff === 0 && v.cleared ? `<p class="st-line">${STAGE_MODE.diffNote[0]}</p>` : '';
  const reason = v.reason ? `<p class="st-reason">${esc(v.reason)}</p>` : '';
  const outro = v.outro.length ? `<p class="st-outro">${v.outro.map((l) => `<span>${esc(l)}</span>`).join('')}</p>` : '';
  // 첫 철거 · 새 기록은 한 줄 — 전임자 첫 승 두 줄은 그대로
  const gist = [v.firstClear ? STAGE_MODE.firstClear : '', v.newBest ? `${STAGE_MODE.newBest}${v.prevBest ? ` · ${STAGE_MODE.prevBest} ${v.prevBest}` : ''}` : ''].filter(Boolean).join(' · ');
  const news = (v.masterBeat ? STAGE_MODE.masterBeat.map((l) => `<p class="st-news">${esc(l)}</p>`).join('') : '')
    + (gist ? `<p class="st-news">${gist}</p>` : '');
  return { html: `${name}${trow}${head}${reason}${outro}${news}`, stamp: v.diff === 2 && v.cleared ? STAGE_MODE.inkSeal : '' };
}

/** 도장 줄을 길게 누르면 뒷면(착수 · 철거 · 첫 철거) — 다시 길게 누르면 앞면 */
export function bindFlip(root: HTMLElement): void {
  const flip = root.querySelector<HTMLElement>('[data-flip]');
  if (!flip) return;
  let timer = 0;
  const cancel = (): void => window.clearTimeout(timer);
  flip.addEventListener('pointerdown', () => {
    cancel();
    timer = window.setTimeout(() => flip.classList.toggle('back'), FLIP_MS);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) flip.addEventListener(ev, cancel);
  flip.addEventListener('contextmenu', (e) => e.preventDefault());
}
