// 판 페이스 측정 — 틱마다 「할 일 있음 / 기다림(원인별)」으로 나눈다. 길이는 내용으로 늘리고 기다림은 깎기 위한 자료. 평소엔 건너뛴다:
//   PACE=1 WHO=bot,human DIFFS=1 ONLY=1-1,1-B OUT=<파일> npx vitest run --no-cache tests/pace-measure.test.ts
//   REACT=30 = 위협이 이 틱 안에 닿으면 「막기」(할 일)로 센다 · TWEAK = stage-measure.test.ts 와 같은 문법
// 판정은 core 상태만 읽는다(attackRange · 사거리 상수). 시간은 깬 틱(clearTick)까지 — 쓰러지는 연출은 안 센다.
import { describe, it } from 'vitest';
// @ts-ignore — node 타입 없이 돈다(의존성 0). 측정 도구 전용
import { appendFileSync, readFileSync } from 'node:fs';
declare const process: { env: Record<string, string | undefined> };
import type { GameState, InputFrame, StageDiff } from '../src/core/types';
import { STAGES } from '../src/core/stages';
import { stageScript } from '../src/core/stage';
import { attackRange } from '../src/core/combat';
import { lmAct } from '../src/core/landmark';
import * as CFG from '../src/config';
import { expertBot, fmtTicks, humanBot, runStage, stageBot } from './stageBot';

const { ACT2, BOSS, STACK, VIEW, WEAPON } = CFG;
const REACT = Number(process.env.REACT ?? 30);
const DO = new Set(['칠 거리', '막기', '보스 창', '보스 딜', '손기술', '깔림 탈출', '점프 마중']);
// 사람 대역 지연 · 연타 간격(HDT=11,10). 4-B는 11에서 못 깬다 — 깨는 표본을 따로 고른다
const [HD, HT] = (process.env.HDT ?? '11,10').split(',').map(Number);
const sec = (t: number) => (t / 60).toFixed(1);

function tweak(): void {
  const raw = process.env.TWEAK ?? '{}';
  const t = JSON.parse(raw.startsWith('@') ? readFileSync(raw.slice(1), 'utf8') : raw) as Record<string, Record<string, unknown>>;
  const plain = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
  for (const [k, v] of Object.entries(t)) {
    const target = STAGES.find((d) => d.id === k) ?? (CFG as Record<string, unknown>)[k];
    if (!plain(target)) throw new Error(`TWEAK 키 ${k}: 판 id도 config 객체도 아니다`);
    for (const [kk, vv] of Object.entries(v)) {
      if (plain(vv) && plain(target[kk])) Object.assign(target[kk] as object, vv);
      else target[kk] = vv;
    }
  }
}

/** 틱 수로 본 도착 예정 — y가 at까지 내려오는 데 걸리는 틱(올라가는 중이면 ∞) */
function eta(y: number, vy: number, at: number): number {
  if (y <= at) return 0;
  return vy >= 0 ? Infinity : ((y - at) / -vy) * 60;
}

function busy(s: GameState): boolean {
  return !!s.stack || s.entities.some((e) => e.kind === 'bolt' || e.kind === 'shot' || (e.kind === 'rock' && !e.remnant));
}

/** 이 틱의 상태 하나 — 할 일(DO)이거나 기다림 원인 */
function classify(s: GameState): string {
  const p = s.player;
  const st = s.stage!;
  const lm = s.lm;
  const b = s.boss;
  const stk = s.stack;
  if (p.pose === 'special' || s.wazaRun) return '손기술';
  if (p.pose === 'pinned') return '깔림 탈출';
  const [lo, hi] = attackRange(p.y, WEAPON[s.weapon].reach);
  const hi2 = p.y + ACT2.REACH; // 2막 대상(번개 · 화산탄 · 탄 · 보스) 사거리
  const px = VIEW.LANE_X[p.lane];
  // 종 · 좌판은 막아서 올리는 것 — 베는 대상이 아니다. 크레인 짐 · 구층탑 · 건물은 벤다
  const guardThing = !!lm && (lm.id === 'bell' || lm.id === 'wind');
  if (stk && !guardThing && stk.floors.length) {
    const top = stk.y + stk.floors.reduce((a, f) => a + f.h, 0);
    if (stk.y <= hi && top >= lo) return '칠 거리';
  }
  for (const e of s.entities) {
    if (e.kind === 'bolt' && e.cueTicks <= 0 && e.y >= lo && e.y <= hi2) return '칠 거리';
    if (e.kind === 'rock' && !e.remnant && e.y >= lo && e.y <= hi2) return '칠 거리';
    // boss.tryHitBoss와 같은 가로 판정
    if (e.kind === 'rabbit' && Math.abs(e.x - px) < 50 && e.y >= lo && e.y <= hi2) return '칠 거리';
    if (e.kind === 'cannon' && Math.abs(e.x - px) <= VIEW.LANE_W / 2 && BOSS.CANNON.MUZZLE_Y >= lo && BOSS.CANNON.MUZZLE_Y <= hi2) return '칠 거리';
  }
  if (b && b.hittable && b.y >= lo && b.y <= hi2 + BOSS.HIT_REACH) return '보스 딜';
  if (lm?.st === 'sit') return '보스 창';
  // 막을 위협 — REACT틱 안에 닿는다
  if (lm?.id === 'bell' && lm.st === 'slam') return '막기';
  if (stk && lm && lm.id !== 'pagoda' && eta(stk.y, stk.vy, STACK.GUARD_ZONE_GROUND) <= REACT && !(lm.id === 'crane' && lm.air === 0)) return '막기';
  for (const e of s.entities) {
    if (e.kind === 'shot') return '막기';
    if (e.kind === 'rock' && !e.remnant && eta(e.y, e.vy, hi2) <= REACT) return '막기';
    if (e.kind === 'bolt') {
      const fall = e.cueTicks > 0 ? e.cueTicks + ((e.y - ACT2.BOLT_ZONE_Y) / ACT2.BOLT_FALL_V + (ACT2.BOLT_ZONE_Y - hi2) / ACT2.BOLT_ZONE_V) * 60
        : eta(e.y, -ACT2.BOLT_FALL_V, hi2);
      if (fall <= REACT) return '막기';
    }
  }
  if (b) {
    if (b.st === 'descend' || b.st === 'charging') return '막기';
    if (b.st === 'telegraph') {
      const charge = b.pattern === 'charge' || b.pattern === 'multiCharge';
      const left = charge ? BOSS.CHARGE.TELE - b.stTick + BOSS.CHARGE.DESCEND + BOSS.CHARGE.DASH / 2
        : b.pattern === 'pbCharge' ? BOSS.PB_CHARGE.TELEPORT + BOSS.PB_CHARGE.TELE - b.stTick + BOSS.PB_CHARGE.DASH / 2 : Infinity;
      return left <= REACT ? '막기' : '집행기 예고';
    }
  }
  // ── 여기부터 기다림 ──
  if (p.y > 0 && stk) return '점프 마중'; // 위의 건물 · 탑을 향해 뛰었다(구층탑 기본 봇 · 숙련 봇) — 손이 일하는 시간
  if (p.pose === 'guardBreak') return '경직';
  if (p.y > 0) return '체공';
  if (b) {
    if (b.st === 'enter') return '보스 등장';
    if (b.st === 'rising' || b.st === 'roar') return '집행기 대기';
    if (b.pattern === 'cannons') return '집행기 대포';
    return '집행기 공격 사이';
  }
  if (lm) {
    if (lm.st === 'enter') return '보스 등장';
    if (lm.st === 'rise') return '보스 올라감';
    if (lm.id === 'bell') return stk ? (stk.vy < 0 ? '종 낙하' : '종 비행') : '종탑 똑딱';
    if (lm.id === 'wind') return stk ? (stk.vy > 0 ? '바람탑 좌판 비행' : lm.air === 1 || lm.x > 0 ? '바람탑 날숨 낙하' : '바람탑 들숨 낙하') : '바람탑 다음 좌판';
    if (lm.id === 'pagoda') return s.entities.some((e) => e.kind === 'rock' && !e.remnant) ? '화산탄 낙하' : '구층탑 하강';
    if (!stk) return '크레인 다음 짐';
    return lm.air === 0 ? '크레인 갈고리' : stk.vy > 0 ? '크레인 짐 비행' : '크레인 짐 낙하';
  }
  if (stk) return stk.vy > 0 ? '띄움 대기' : '낙하';
  if (s.entities.some((e) => e.kind === 'bolt')) return '번개 예고';
  if (s.entities.some((e) => e.kind === 'rock' && !e.remnant)) return '화산탄 낙하';
  if (s.groundRocks > 0) return '더미만';
  if (st.phase !== 'script') return '그 밖';
  const step = stageScript(st.id)[st.step];
  if (!step) return '그 밖';
  if (step.items[0].k === 'rest') return '쉼';
  if (st.step === 0) return '첫 대기';
  return step.joined ? '붙어 오기 대기' : '걸음 대기';
}

interface Seg { id: string; seg: string; cause: string; t: number }
interface Run { id: string; seg: string; len: number; cause: string }

function measure(id: string, diff: StageDiff, who: string, segs: Seg[], runs: Run[]): string[] {
  const tokens = STAGES.find((d) => d.id === id)!.script.trim().split(/\s+/).filter(Boolean);
  const by = new Map<string, number>();
  const segT = new Map<string, number>();
  let ticks = 0;
  let guards = 0;
  let prevGuard = false;
  let jumpable = 0; // 낙하 중 건물이 점프 마중 높이(480 밑)에 있던 틱
  const seen = new WeakSet<object>();
  let hazards = 0;
  let buildings = 0;
  let lastLmSt = '';
  // 걸음 시간 줄
  const arm: number[] = [];
  const emit: number[] = [];
  const reach: number[] = [];
  const clear: number[] = [];
  let lastStep = 0;
  let active = -1;
  // 연속 기다림
  let run: { start: number; seg: string; c: Map<string, number> } | null = null;
  const endRun = () => {
    if (!run) return;
    const len = [...run.c.values()].reduce((a, x) => a + x, 0);
    const top = [...run.c].sort((a, c) => c[1] - a[1]).map(([k, v]) => `${k} ${sec(v)}`).join(' · ');
    runs.push({ id, seg: run.seg, len, cause: top });
    run = null;
  };
  const policy0 = who === 'human' ? humanBot(HD, HT) : who === 'expert' ? expertBot : (s: GameState) => stageBot(s);
  const r = runStage(id, diff, {
    policy: (s: GameState): InputFrame => {
      const f = policy0(s);
      const st = s.stage!;
      if (st.phase === 'done') {
        if (active >= 0) { clear[active] = st.clearTick; active = -1; }
        return f;
      }
      ticks += 1;
      if (f.guard && !prevGuard) guards += 1;
      prevGuard = f.guard;
      // 새로 나온 것 세기
      for (const e of s.entities) {
        if (seen.has(e) || (e.kind === 'rock' && e.remnant)) continue;
        seen.add(e);
        if (e.kind === 'rock' || e.kind === 'bolt' || e.kind === 'rabbit' || e.kind === 'cannon') hazards += 1;
      }
      if (s.stack && !seen.has(s.stack)) {
        seen.add(s.stack);
        if (s.lm && s.lm.id !== 'pagoda') hazards += 1; else buildings += 1;
      }
      const lst = s.lm ? s.lm.st : s.boss ? `${s.boss.st}:${s.boss.pattern}` : '';
      if (lst !== lastLmSt && (lst === 'slam' || /^telegraph:(charge|multiCharge|pbCharge)/.test(lst))) hazards += 1;
      lastLmSt = lst;
      // 걸음 시간 줄
      if (st.phase === 'script') {
        if (st.armed && arm[st.step] === undefined) arm[st.step] = s.tick;
        if (st.step > lastStep) { emit[st.step - 1] = s.tick; active = st.step - 1; lastStep = st.step; }
      }
      const c = classify(s);
      if (active >= 0) {
        if (reach[active] === undefined && (c === '칠 거리' || c === '막기')) reach[active] = s.tick;
        if (!busy(s)) { clear[active] = s.tick; active = -1; }
      }
      by.set(c, (by.get(c) ?? 0) + 1);
      if (c === '낙하' && s.stack && s.stack.y < 480) jumpable += 1;
      const seg = st.phase === 'boss' || !tokens.length
        ? (s.boss ? `집행기 ${s.boss.tier + 1}단` : `보스 ${lmAct(s)}막`)
        : `걸음${(active >= 0 ? active : st.step) + 1}「${tokens[active >= 0 ? active : st.step] ?? '-'}」`;
      if (DO.has(c)) endRun();
      else {
        const k = `${seg}|${c}`;
        segT.set(k, (segT.get(k) ?? 0) + 1);
        if (!run) run = { start: s.tick, seg, c: new Map() };
        run.c.set(c, (run.c.get(c) ?? 0) + 1);
      }
      return f;
    },
  });
  endRun();
  for (const [k, t] of segT) { const [seg, cause] = k.split('|'); segs.push({ id, seg, cause, t }); }
  const doT = [...by].filter(([k]) => DO.has(k)).reduce((a, [, v]) => a + v, 0);
  const waitT = ticks - doT;
  const fmt = (keep: (k: string) => boolean) => [...by].filter(([k]) => keep(k)).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${sec(v)}`).join(' · ');
  const longest = runs.filter((x) => x.id === id).sort((a, b) => b.len - a.len)[0];
  const name = `${['견습', '정규', '외주'][diff]} ${who === 'human' ? `대역(${HD},${HT})` : who === 'expert' ? '숙련' : '기본'}`;
  const out = [
    `== ${id} ${name} ${r.result.cleared ? '깸' : '실패'} ${fmtTicks(r.result.ticks)} 목숨${r.s.lives}`,
    `총 ${sec(ticks)}초 | 할 일 ${Math.round((doT * 100) / ticks)}% ${sec(doT)}초 (${fmt((k) => DO.has(k))})`,
    `기다림 ${Math.round((waitT * 100) / ticks)}% ${sec(waitT)}초 (${fmt((k) => !DO.has(k))})`
      + (by.get('낙하') ? ` | 낙하 중 점프 마중 높이(<480) ${sec(jumpable)}초` : ''),
    `최장 연속 기다림 ${longest ? `${sec(longest.len)}초 @ ${longest.seg} (${longest.cause})` : '없음'}`,
    `결정 ${((guards + hazards) / (ticks / 3600)).toFixed(1)}/분 (가드 ${guards} · 위협 ${hazards} · 건물 ${buildings} · 건물 포함 ${((guards + hazards + buildings) / (ticks / 3600)).toFixed(1)}/분)`,
  ];
  if (tokens.length) {
    const rows = tokens.map((tok, i) => {
      if (emit[i] === undefined) return `${i + 1}「${tok}」 미도달`;
      const w = emit[i] - (arm[i] ?? emit[i]);
      if (/^\.+$/.test(tok)) return `${i + 1}「${tok}」 ${sec(w)}`;
      const rc = reach[i] ?? clear[i] ?? emit[i];
      return `${i + 1}「${tok}」 대기${sec(w)} 낙하${sec(rc - emit[i])} 처리${sec((clear[i] ?? rc) - rc)}`;
    });
    out.push(`걸음(대기 · 생김→사거리 · 사거리→치움, 초): ${rows.join(' | ')}`);
  }
  return out;
}

describe.skipIf(!process.env.PACE)('페이스', () => {
  it('판마다 할 일 · 기다림', { timeout: 3_600_000 }, () => {
    tweak();
    const only = process.env.ONLY?.split(',');
    const diffs = (process.env.DIFFS ?? '1').split(',').map(Number) as StageDiff[];
    const whos = (process.env.WHO ?? 'bot,human').split(',');
    const log = (line: string) => { console.log(line); if (process.env.OUT) appendFileSync(process.env.OUT, line + '\n'); };
    for (const who of whos) for (const diff of diffs) {
      const segs: Seg[] = [];
      const runs: Run[] = [];
      for (const d of STAGES) {
        if (only && !only.includes(d.id)) continue;
        for (const line of measure(d.id, diff, who, segs, runs)) log(line);
      }
      const tag = `${['견습', '정규', '외주'][diff]} ${who === 'human' ? `대역(${HD},${HT})` : who === 'expert' ? '숙련' : '기본'}`;
      log(`## ${tag} 기다림 덩어리 상위 15(판 · 구간 · 원인 합, 초): ` + segs.sort((a, b) => b.t - a.t).slice(0, 15)
        .map((x) => `${x.id} ${x.seg} ${x.cause} ${sec(x.t)}`).join(' | '));
      log(`## ${tag} 연속 기다림 상위 15(초): ` + runs.sort((a, b) => b.len - a.len).slice(0, 15)
        .map((x) => `${x.id} ${x.seg} ${sec(x.len)} (${x.cause})`).join(' | '));
    }
  });
});
