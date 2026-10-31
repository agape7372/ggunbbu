// 작업 지시서 화면 — 지시서 목록 · 지시서 한 장 · 현장 일지 · 코드 붙여 넣기(createStageUi) + 철거 보고서(paintStageEnd).
// 「먹 한 획」: 종이 한 장 느낌, 도장 · 반려는 주홍. 주홍 단추는 화면마다 하나(착수 · 재제출 · 다시 보기).
// 규칙 · 기록은 core · meta가 갖고 있다. 여기는 부르기만 한다. 화면 글은 content/stages.ts 한 곳.

import './stage.css';
import { REGIONS, STAGE_MODE, STAGE_TEXT, fmtStageTime } from '../content/stages';
import { decodeReplay, replayCheck, type Replay } from '../core/replay';
import { verifyReplay } from '../core/stageReplay';
import { STAGES } from '../core/stages';
import type { StageDiff } from '../core/types';
import { STAMP_KEYS, diffUnlocked, hasStamp, recordOf, stageUnlocked, stampBits, type StageRecord } from '../meta/stageRecord';
import { escapeHtml as esc } from './html';
import { stampTotals, type StageEndView } from './stageLogic';

export interface StageListOpts {
  recs: Readonly<Record<string, StageRecord>>;
  /** 시험판 전해금 — 다 열린다. 기록은 꾸미지 않는다 */
  allOpen: boolean;
}

export interface StageHandlers {
  onStart(id: string, diff: StageDiff, fromBoss: boolean): void;
  /** 내 최고 기록 다시 보기 */
  onWatchBest(id: string): void;
  /** 붙여 넣은 코드 다시 보기 */
  onWatchCode(r: Replay): void;
}

export interface StageUi {
  /** 목록을 연다. detail = 지시서 한 장으로 바로 */
  show(opts: StageListOpts, detail?: string): void;
  /** 한 칸 물러난다. 이미 목록이면 false(홈으로 가는 건 부른 쪽 몫) */
  back(): boolean;
}

/** 마지막에 고른 난이도 — 세션 안 변수(저장 키 없음). 기본 정규 */
let diffPick: StageDiff = 1;
export const sessionDiff = (): StageDiff => diffPick;

type View = { k: 'list' } | { k: 'detail'; id: string } | { k: 'log' } | { k: 'code' };

const isOpen = (o: StageListOpts, id: string): boolean => o.allOpen || stageUnlocked(o.recs, id);
const defOf = (id: string) => STAGES.find((d) => d.id === id);

/** 첫 줄이 지역 이름(`서쪽 회랑.`)이면 뺀다 — 제목이 이미 말했다 */
const dropName = (lines: readonly string[], name: string): readonly string[] => (lines[0] === `${name}.` ? lines.slice(1) : lines);

/** 램프 = 가장 높게 깬 난이도 이름표(견습 · 정규 · 외주). 아직이면 비워 둔다. 보고서 머리의 난이도 상자와 같은 모양 */
const lampTag = (lamp: number): string => (lamp > 0 ? `<span class="st-lamp">${STAGE_MODE.diffs[lamp - 1]}</span>` : '');

/** 정규 도장 다섯 칸 */
function pips(bits: number): string {
  const n = STAMP_KEYS.filter((k) => hasStamp(bits, k)).length;
  return `<span class="st-pips" role="img" aria-label="${STAGE_MODE.stampTotal} ${n}/${STAMP_KEYS.length}">${
    STAMP_KEYS.map((k) => `<i${hasStamp(bits, k) ? ' class="on"' : ''}></i>`).join('')}</span>`;
}

function cardHtml(o: StageListOpts, id: string, i: number): string {
  const rec = recordOf(o.recs, id);
  const open = isOpen(o, id);
  const name = STAGE_TEXT[id]?.name ?? '';
  const bottom = open
    ? `${pips(rec.stamps)}${rec.best > 0 ? `<b class="st-best">${fmtStageTime(rec.best)}</b>` : ''}`
    : `<small class="st-lock">${STAGE_MODE.locked}</small>`;
  return `<button type="button" class="st-card" data-st="open" data-id="${id}" style="--i:${i}"${open ? '' : ' disabled'}>
    <span class="st-id">${esc(id)}</span><b class="st-name">${esc(name)}</b>${open ? lampTag(rec.lamp) : ''}
    <span class="st-sub">${bottom}</span>
  </button>`;
}

function listHtml(o: StageListOpts): string {
  const fresh = Object.keys(o.recs).length === 0;
  let i = 0;
  const regions = REGIONS.map((rg, ri) => {
    const defs = STAGES.filter((d) => d.region === ri);
    const last = defs[defs.length - 1];
    // 명물 판을 깼으면 목록이 바뀐 세계를 비춘다
    const lines = last && recordOf(o.recs, last.id).lamp > 0 ? rg.after : rg.start;
    const cards = defs.map((d) => cardHtml(o, d.id, i++)).join('');
    return `<section class="st-region"><h3 class="op-h st-rh">${esc(rg.name)}</h3>
      <p class="st-lines">${dropName(lines, rg.name).map((l) => `<span>${esc(l)}</span>`).join('')}</p>
      <div class="st-cards">${cards}</div></section>`;
  }).join('');
  const cover = fresh ? `<p class="st-cover">${STAGE_MODE.cover.map((l) => `<span>${esc(l)}</span>`).join('')}</p>` : '';
  return `<h2 class="meta-title st-h2">${STAGE_MODE.title}</h2>${cover}${regions}
    <div class="st-foot">
      <button type="button" class="stroke s3" data-st="log"><b>${STAGE_MODE.log}</b></button>
      <button type="button" class="stroke s3" data-st="code"><b>${STAGE_MODE.paste}</b></button>
    </div>`;
}

function detailHtml(o: StageListOpts, id: string): string {
  const d = defOf(id);
  const t = STAGE_TEXT[id];
  if (!d || !t) return '';
  const rec = recordOf(o.recs, id);
  const ok = (v: StageDiff): boolean => o.allOpen || diffUnlocked(rec, v);
  if (!ok(diffPick)) diffPick = 1;
  const got = hasStamp(rec.stamps, 'secret');
  const diffs = ([0, 1, 2] as const).map((v) => {
    const locked = !ok(v);
    return `<div class="st-diff"><button type="button" data-st="diff" data-v="${v}" aria-pressed="${v === diffPick}"${locked ? ' disabled' : ''}${v === diffPick ? ' class="on"' : ''}>${STAGE_MODE.diffs[v]}</button>
      <small>${locked ? STAGE_MODE.diffLocked : STAGE_MODE.diffNote[v]}</small></div>`;
  }).join('');
  const left = [
    d.boss ? `<button type="button" class="stroke s2" data-st="practice"><b>${STAGE_MODE.practice}</b><span>${STAGE_MODE.practiceNote}</span></button>` : '',
    rec.code ? `<button type="button" class="stroke s3" data-st="watch"><b>${STAGE_MODE.replay}</b><span>${STAGE_MODE.myBest} ${fmtStageTime(rec.best)}</span></button>` : '',
  ].join('');
  return `<h2 class="meta-title st-h2"><span class="st-id">${esc(id)}</span> ${esc(t.name)}</h2>
    <div class="st-paper">
      <p class="st-reg">${esc(REGIONS[d.region].name)}</p>
      <div class="st-order">${dropName(t.order, REGIONS[d.region].name).map((l) => `<p>${esc(l)}</p>`).join('')}</div>
      <div class="st-slot"><span>${STAGE_MODE.stamps[3]}</span>${got ? `<i class="st-got">${STAGE_MODE.stamps[3]}</i>` : '<i class="st-empty"></i>'}</div>
      <p class="st-riddle">${esc(t.riddle)}</p>
      ${t.note ? `<p class="st-note">${STAGE_MODE.note} · ${esc(t.note)}</p>` : ''}
      <dl class="st-facts">
        <div><dt>${STAGE_MODE.par}</dt><dd>${fmtStageTime(d.par)}</dd></div>
        <div><dt>${STAGE_MODE.master}</dt><dd>${fmtStageTime(d.master)}</dd></div>
        <div><dt>${STAGE_MODE.myBest}</dt><dd>${rec.best > 0 ? fmtStageTime(rec.best) : STAGE_MODE.none}</dd></div>
      </dl>
    </div>
    <div class="st-diffs seg" role="group" aria-label="${STAGE_MODE.title}">${diffs}</div>
    <div class="st-go"><div class="st-go-left">${left}</div>
      <button type="button" class="seal st-start" data-st="start"><b>${STAGE_MODE.start}</b></button></div>`;
}

function logHtml(o: StageListOpts): string {
  const tot = stampTotals(o.recs);
  const rows = STAGES.map((d) => {
    const rec = recordOf(o.recs, d.id);
    const open = isOpen(o, d.id);
    const parts = [`${STAGE_MODE.start} ${rec.tries}`, `${STAGE_MODE.clears} ${rec.clears}`];
    if (rec.first) parts.push(`${STAGE_MODE.firstClear} ${rec.first}`);
    return `<li class="st-lrow${open ? '' : ' off'}"><span class="st-id">${esc(d.id)}</span><b>${esc(STAGE_TEXT[d.id]?.name ?? '')}</b>${lampTag(rec.lamp)}
      <small>${parts.join(' · ')}</small></li>`;
  }).join('');
  return `<h2 class="meta-title st-h2">${STAGE_MODE.log}</h2>
    <p class="st-total"><b>${STAGE_MODE.stampTotal} ${tot.stamps}/${tot.stampMax}</b><b>${STAGE_MODE.stamps[4]} ${tot.masters}/${tot.masterMax}</b></p>
    <ol class="st-log">${rows}</ol>`;
}

function codeHtml(): string {
  return `<h2 class="meta-title st-h2">${STAGE_MODE.paste}</h2>
    <textarea class="st-code" data-st="text" rows="5" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off"
      placeholder="${STAGE_MODE.pasteHint}" aria-label="${STAGE_MODE.code}"></textarea>
    <div class="st-verdict" data-st="verdict" aria-live="polite"></div>`;
}

/** 붙여 넣은 코드 하나를 읽고 다시 돌려 판단 글을 낸다. rep = 「다시 보기」로 넘길 코드 */
export function judgePasted(text: string): { html: string; rep: Replay | null } {
  const raw = text.trim();
  if (!raw) return { html: '', rep: null };
  const err = (msg: string): { html: string; rep: null } => ({ html: `<p class="st-err">${esc(msg)}</p>`, rep: null });
  const r = decodeReplay(raw);
  if (!r) return err(STAGE_MODE.codeErr.bad);
  const v = verifyReplay(r);
  if ('error' in v) return err(STAGE_MODE.codeErr[v.error]);
  const { result } = v;
  const bits = stampBits(result.stamps);
  const boxes = [0, 1, 2, 3, 4].map((i) => ((bits >> i) & 1 ? '■' : '□')).join('');
  const diff = STAGE_MODE.diffs[result.diff];
  return {
    rep: r,
    html: `<div class="st-ok">
      <p class="st-ok-name"><b>${esc(result.id)} ${esc(STAGE_TEXT[result.id]?.name ?? '')}</b><span>${diff}</span></p>
      <p class="st-ok-time">${result.cleared ? fmtStageTime(result.ticks) : STAGE_MODE.notCleared}</p>
      <p class="st-boxes" aria-label="${STAGE_MODE.stampTotal}">${boxes}</p>
      <p class="st-check">${STAGE_MODE.checkNo} <b>${replayCheck(raw)}</b></p>
      ${v.match ? '' : `<p class="st-err">${STAGE_MODE.codeErr.mismatch}</p>`}
      <button type="button" class="seal st-start" data-st="watchcode"><b>${sealText(STAGE_MODE.replay)}</b></button>
    </div>`,
  };
}

export function createStageUi(root: HTMLElement, nav: HTMLElement, h: StageHandlers): StageUi {
  let opts: StageListOpts = { recs: {}, allOpen: false };
  let view: View = { k: 'list' };
  let listTop = 0;
  let pasted: Replay | null = null;

  function render(top = 0): void {
    root.innerHTML = view.k === 'list' ? listHtml(opts)
      : view.k === 'detail' ? detailHtml(opts, view.id)
        : view.k === 'log' ? logHtml(opts)
          : codeHtml();
    root.scrollTop = top;
    nav.textContent = view.k === 'list' ? STAGE_MODE.home : STAGE_MODE.back;
  }

  function go(v: View): void {
    if (view.k === 'list') listTop = root.scrollTop;
    view = v;
    pasted = null;
    render(v.k === 'list' ? listTop : 0);
  }

  root.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest('[data-st]') as HTMLElement | null;
    if (!t || (t as HTMLButtonElement).disabled) return;
    const act = t.getAttribute('data-st');
    const id = view.k === 'detail' ? view.id : '';
    switch (act) {
      case 'open': go({ k: 'detail', id: t.getAttribute('data-id') ?? '' }); break;
      case 'log': go({ k: 'log' }); break;
      case 'code': go({ k: 'code' }); break;
      case 'diff': diffPick = Number(t.getAttribute('data-v')) as StageDiff; render(root.scrollTop); break;
      case 'start': h.onStart(id, diffPick, false); break;
      case 'practice': h.onStart(id, diffPick, true); break;
      case 'watch': h.onWatchBest(id); break;
      case 'watchcode': if (pasted) h.onWatchCode(pasted); break;
      default: break;
    }
  });

  // 붙여 넣기 — 클립보드 읽기(readText)는 권한 창이 떠서 안 쓴다. 칸에 붙이면 바로 읽는다
  root.addEventListener('input', (e) => {
    const t = e.target as HTMLTextAreaElement;
    if (t.getAttribute('data-st') !== 'text') return;
    const j = judgePasted(t.value);
    pasted = j.rep;
    const box = root.querySelector('[data-st="verdict"]');
    if (box) box.innerHTML = j.html;
  });

  return {
    show(o, detail): void {
      opts = o;
      view = detail && defOf(detail) ? { k: 'detail', id: detail } : { k: 'list' };
      pasted = null;
      render(0);
    },
    back(): boolean {
      if (view.k === 'list') return false;
      go({ k: 'list' });
      return true;
    },
  };
}

/* ── 철거 보고서 ─────────────────────────────────────────── */

export interface StageEndHandlers {
  onRetry(): void;
  onNext(): void;
  onList(): void;
  toast(text: string): void;
}

/** 복사 — 되는 길(clipboard)이 막히면 textarea를 골라 복사한다 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

const FLIP_MS = 500;

/** 세 글자 단추는 두 줄로 — 인장 안에 들어가게 */
const sealText = (s: string): string => (s.includes(' ') ? s.replace(' ', '<br>') : s.length >= 3 ? `${s.slice(0, 1)}<br>${s.slice(1)}` : s);

function stampRows(v: StageEndView): string {
  const rows = STAMP_KEYS.map((k, i) => {
    const on = hasStamp(v.stamps, k);
    const fresh = on && hasStamp(v.newStamps, k);
    const riddle = k === 'secret' && !on ? `<small class="st-riddle">${esc(v.riddle)}</small>` : '';
    // 못 깬 판은 접수만 반려를 찍는다 — 나머지는 아직 심사 전이라 흐린 빈칸
    const void_ = !v.cleared && k !== 'done';
    return `<li class="st-row ${on ? 'on' : void_ ? 'void' : 'rej'}${fresh ? ' new' : ''}" style="--i:${i}">
      <span class="st-slotname">${STAGE_MODE.stamps[i]}${riddle}</span>
      <i class="st-stamp">${on ? STAGE_MODE.stampedMark : void_ ? '' : STAGE_MODE.reject}</i>
    </li>`;
  }).join('');
  return `<div class="st-rows" data-flip>
    <ul class="st-front">${rows}</ul>
    <p class="st-back">${esc(v.flip)}</p>
  </div>`;
}

function reportHtml(v: StageEndView): string {
  const diff = STAGE_MODE.diffs[v.diff];
  const prog = !v.cleared && /^\d+\/\d+$/.test(v.time);
  const sub = v.kind === 'practice' ? `<p class="st-sub">${STAGE_MODE.practiceReport}</p>`
    : v.kind === 'watch' ? `<p class="st-sub">${STAGE_MODE.watchReport}</p>` : '';
  const time = `<p class="st-time${v.cleared ? '' : ' miss'}">${prog ? `<small>${STAGE_MODE.progress}</small> ` : ''}${esc(v.time)}</p>`;
  if (v.kind === 'practice') {
    return `<div class="st-report"><p class="st-rtitle">${STAGE_MODE.report}</p>
      <h2 class="st-rname"><span class="st-id">${esc(v.id)}</span> ${esc(v.name)} <small>${diff}</small></h2>${sub}${time}
      <p class="st-line">${v.cleared ? STAGE_MODE.cleared : STAGE_MODE.notCleared}</p></div>`;
  }
  const proof = v.check
    ? `<p class="st-check">${STAGE_MODE.checkNo} <b>${v.check}</b></p>
      <div class="st-copy"><button type="button" data-st="copy-code">${STAGE_MODE.copy}</button><button type="button" data-st="copy-share">${STAGE_MODE.share}</button></div>`
    : '';
  // 서류 순서: 시간 → 전임자 → 도장 → 사유 → 퇴장 대사 → 소식 → 확인 번호 · 복사(서명란 자리)
  const head = v.diff === 1 ? `${v.master ? `<p class="st-master">${esc(v.master)}</p>` : ''}${stampRows(v)}`
    : v.diff === 0 ? `<p class="st-line">${v.cleared ? STAGE_MODE.diffNote[0] : ''}</p>`
      : v.cleared ? `<i class="st-ink">${STAGE_MODE.inkSeal}</i>` : '';
  const reason = v.reason ? `<p class="st-reason">${esc(v.reason)}</p>` : '';
  const outro = v.outro.length ? `<p class="st-outro">${v.outro.map((l) => `<span>${esc(l)}</span>`).join('')}</p>` : '';
  // 첫 철거 · 새 기록은 한 줄 — 전임자 첫 승 두 줄은 그대로
  const gist = [v.firstClear ? STAGE_MODE.firstClear : '', v.newBest ? `${STAGE_MODE.newBest}${v.prevBest ? ` · ${STAGE_MODE.prevBest} ${v.prevBest}` : ''}` : ''].filter(Boolean).join(' · ');
  const news = (v.masterBeat ? STAGE_MODE.masterBeat.map((l) => `<p class="st-news">${esc(l)}</p>`).join('') : '')
    + (gist ? `<p class="st-news">${gist}</p>` : '');
  return `<div class="st-report"><p class="st-rtitle">${STAGE_MODE.report}</p>
    <h2 class="st-rname"><span class="st-id">${esc(v.id)}</span> ${esc(v.name)} <small>${diff}</small></h2>${sub}${time}${head}${reason}${outro}${news}${proof}</div>`;
}

function actsHtml(v: StageEndView): string {
  if (v.kind === 'watch') {
    return `<div class="st-acts-left"></div><button type="button" class="seal st-start" data-st="list"><b>${STAGE_MODE.back}</b></button>`;
  }
  const main = v.kind === 'practice' ? STAGE_MODE.again : STAGE_MODE.resubmit;
  const next = v.nextId ? `<button type="button" class="stroke s2" data-st="next"><b>${STAGE_MODE.next}</b></button>` : '';
  return `<div class="st-acts-left">${next}<button type="button" class="stroke s3" data-st="list"><b>${STAGE_MODE.back}</b></button></div>
    <button type="button" class="seal st-start" data-st="retry"><b>${sealText(main)}</b></button>`;
}

/** 보고서를 그린다. screen = 보고서 화면 칸(안에 .ov-body · .st-acts) */
export function paintStageEnd(screen: HTMLElement, v: StageEndView, h: StageEndHandlers): void {
  const body = screen.querySelector<HTMLElement>('.ov-body')!;
  const acts = screen.querySelector<HTMLElement>('.st-acts')!;
  body.innerHTML = reportHtml(v);
  body.scrollTop = 0;
  acts.innerHTML = actsHtml(v);

  const done = (ok: boolean): void => h.toast(ok ? STAGE_MODE.copied : STAGE_MODE.copyFail);
  const onClick = (e: Event): void => {
    const t = (e.target as HTMLElement).closest('[data-st]') as HTMLElement | null;
    if (!t) return;
    switch (t.getAttribute('data-st')) {
      case 'retry': h.onRetry(); break;
      case 'next': h.onNext(); break;
      case 'list': h.onList(); break;
      case 'copy-code': void copyText(v.code).then(done); break;
      case 'copy-share': void copyText(v.share).then(done); break;
      default: break;
    }
  };
  body.onclick = onClick;
  acts.onclick = onClick;

  // 도장 줄을 길게 누르면 뒷면(착수 · 철거 · 첫 철거) — 다시 길게 누르면 앞면
  const flip = body.querySelector<HTMLElement>('[data-flip]');
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
