// 작업 지시서 측정 — 봇으로 판마다 시간 · 사고를 잰다. 평소엔 건너뛴다:
//   MEASURE=1 npx vitest run tests/stage-measure.test.ts          (ONLY=4-B · DIFFS=1 로 좁힌다 · OUT=파일 에 한 줄씩)
//   TRACE=4-B DIFF=1 TICKS=900 npx vitest run tests/stage-measure.test.ts   (틱마다 따라가기)
// 기한(par) · 전임자(master)는 이 표에서 정한다(stages.ts 머리 주석).
import { describe, it } from 'vitest';
// @ts-ignore — node 타입 없이 돈다(의존성 0). 측정 도구 전용
import { appendFileSync } from 'node:fs';
declare const process: { env: Record<string, string | undefined> };
import type { GameState, InputFrame } from '../src/core/types';
import { makeState, advance } from '../src/core/sim';
import { stageSeed, startStage, judgeStage, stageScript } from '../src/core/stage';
import { STAGES } from '../src/core/stages';
import { LANDMARK } from '../src/config';
import { lmAct } from '../src/core/landmark';
import { craneLog, expertBot, fmtTicks, runStage, stageBot } from './stageBot';

function cause(s: GameState): string {
  const ev = s.events;
  if (ev.some((e) => e.kind === 'boltStrike')) return '번개';
  if (s.lm?.st === 'slam') return '내려찍기';
  if (ev.some((e) => e.kind === 'land')) return '화산탄';
  if (s.player.pose === 'pinned' || s.stack?.resting) return '깔림';
  return s.player.pose;
}

describe.skipIf(!process.env.TRACE)('추적', () => {
  it(String(process.env.TRACE), { timeout: 600_000 }, () => {
    const id = String(process.env.TRACE);
    const diff = Number(process.env.DIFF ?? 1) as 0 | 1 | 2;
    const s = makeState({ seed: stageSeed(id) });
    startStage(s, { id, diff, weapon: 'sword', waza: 'tenchi' });
    const out: string[] = [];
    let last = '';
    while (!s.over && s.tick < Number(process.env.TICKS ?? 1500)) {
      const f = stageBot(s);
      advance(s, f);
      const st = s.stack;
      const top = st ? st.y + st.floors.reduce((a, x) => a + x.h, 0) : 0;
      const lm = s.lm;
      const key = `${lm?.st}/${lm?.air}/${st ? st.floors.length : '-'}/${s.player.pose}`;
      const ev = s.events.map((e) => e.kind).filter((k) => k !== 'slash').join(',');
      if (key !== last || ev) {
        out.push(`${s.tick} ${key} y${st?.y.toFixed(0)} vy${st?.vy.toFixed(0)} top${top.toFixed(0)} k${lm?.k} w${lm?.wave}/f${lm?.body?.floors.length ?? "-"}/n${lm?.n}/g${lm?.got}/x${lm?.x} p${s.player.y.toFixed(0)} g${s.guardGauge.toFixed(0)} in${f.attack ? 'A' : ''}${f.guard ? 'G' : ''}${f.jump ? 'J' : ''} ${ev}`);
        last = key;
      }
      s.events.length = 0;
    }
    console.log(out.slice(0, Number(process.env.LINES ?? 200)).join('\n'));
    console.log(craneLog.join('\n'));
  });
});

describe.skipIf(!process.env.MEASURE)('측정', () => {
  it('전 판', { timeout: 1_800_000 }, () => {
    const only = process.env.ONLY?.split(',');
    const diffs = (process.env.DIFFS ?? '0,1,2').split(',').map(Number) as (0 | 1 | 2)[];
    const rows: string[] = [];
    for (const d of STAGES) {
      if (only && !only.includes(d.id)) continue;
      for (const diff of diffs) {
        const s = makeState({ seed: stageSeed(d.id) });
        startStage(s, { id: d.id, diff, weapon: 'sword', waza: 'tenchi' });
        const deaths: string[] = [];
        const t0 = performance.now();
        while (!s.over && s.tick < 60 * 60 * 5) {
          const f: InputFrame = stageBot(s);
          advance(s, f);
          if (s.events.some((e) => e.kind === 'lifeLost')) deaths.push(`${s.stage!.step}걸음 ${cause(s)}`);
          s.events.length = 0;
        }
        const r = judgeStage(s);
        const total = stageScript(d.id).length;
        const where = s.lm ? ` 보스=${s.lm.st} 몸${s.lm.body?.floors.length ?? s.stack?.floors.length ?? 0}` : s.boss ? ` 집행기 hp${s.boss.hp}` : '';
        const row = `${d.id.padEnd(3)} ${['견습', '정규', '외주'][diff]} ${r.cleared ? '깸 ' + fmtTicks(r.ticks) : '실패 ' + fmtTicks(s.tick)}`
          + ` 목숨${s.lives} 걸음${s.stage!.step}/${total} ${s.stage!.phase}${where}`
          + (deaths.length ? ` 사고[${deaths.join(', ')}]` : '') + ` (${Math.round(performance.now() - t0)}ms)`;
        rows.push(row);
        if (process.env.OUT) appendFileSync(process.env.OUT, row + '\n');
      }
    }
    console.log(rows.join('\n'));
    console.log(craneLog.join('\n'));
  });

  // 종탑 정각(BLOCK_PACE) — 종을 떨굴 때(봇이 2막에 못 닿아도 종 주기는 막과 상관없다) 「파 시작부터 센 틱 ÷ 시각」. 기본 봇이 덩이를 안 맞으려면 BLOCK_PACE가 이 최댓값보다 커야 한다.
  // 재려면 config LANDMARK.BELL.BLOCK_PACE 를 크게(9999) 해 둔다. 덩이가 켜지면 측정이 어긋난다
  it('종탑 정각 — 종을 떨굴 때 틱/시', () => {
    const out: string[] = [];
    for (const [who, policy] of [['기본', stageBot], ['숙련', expertBot]] as const) for (const diff of [1, 2] as const) {
      const s = makeState({ seed: stageSeed('1-B') });
      startStage(s, { id: '1-B', diff, weapon: 'sword', waza: 'tenchi' });
      let worst = 0;
      const rows: string[] = [];
      while (!s.over && s.tick < 60 * 60 * 5) {
        const n0 = s.lm?.n ?? 0;
        const act0 = lmAct(s);
        const f = policy(s);
        advance(s, f);
        s.events.length = 0;
        const lm = s.lm!;
        if (lm.st === 'play' && lm.n > n0) {
          const hours = LANDMARK.BELL.HOURS[lm.wave];
          const left = hours - n0;
          const ratio = lm.k / hours;
          if (left >= 2) worst = Math.max(worst, ratio);
          rows.push(`${act0}막 ${hours}시 ${n0 + 1}번째 k${lm.k} 남은${left} ${ratio.toFixed(1)}틱/시`);
        }
      }
      out.push([`${who} ${['견습', '정규', '외주'][diff]} 최대 ${worst.toFixed(1)}틱/시 → BLOCK_PACE ${Math.ceil(worst * 1.25)} (${fmtTicks(s.tick)})`, ...rows].join(' / '));
    }
    console.log(out.join(' // '));
  });

  // 막별로 봇이 실제로 겪은 창 · 파 수 — 몸이 play에서 sit(앉음) · slam(내려찍기)으로 넘어간 횟수를 막(lmAct)별로 센다. 크레인은 반창(cue 2)을 따로
  it('막별로 겪은 창 · 파', () => {
    const out: string[] = [];
    for (const id of ['1-B', '2-B', '3-B', '4-B']) for (const diff of [0, 1, 2] as const) {
      for (const [who, policy] of [['기본', stageBot], ['숙련', expertBot]] as const) {
        const s = makeState({ seed: stageSeed(id) });
        startStage(s, { id, diff, weapon: 'sword', waza: 'tenchi' });
        const cnt: Record<string, number> = {};
        while (!s.over && s.tick < 60 * 60 * 5) {
          const lm0 = s.lm;
          const st0 = lm0?.st;
          const act0 = lm0 ? lmAct(s) : 0;
          advance(s, policy(s));
          s.events.length = 0;
          const lm = s.lm;
          if (lm && st0 === 'slam' && lm.st === 'sit') cnt[`${act0}막 반격`] = (cnt[`${act0}막 반격`] ?? 0) + 1;
          if (lm && st0 === 'play' && (lm.st === 'sit' || lm.st === 'slam')) {
            const k = `${act0}막 ${lm.st === 'slam' ? '찍기' : lm.cue === 2 ? '반창' : '창'}`;
            cnt[k] = (cnt[k] ?? 0) + 1;
          }
        }
        out.push(`${id} ${['견습', '정규', '외주'][diff]} ${who} ${fmtTicks(s.tick)} ${Object.entries(cnt).sort().map(([k, v]) => `${k}${v}`).join(' ')}`);
      }
    }
    console.log(out.join(' // '));
  });

  // 기한 · 전임자 표 — 정규 기본 봇 × 1.3 = 기한, 숙련 봇(점프 마중) = 전임자. 0.5초 단위로 올린다
  it('기한 · 전임자', { timeout: 1_800_000 }, () => {
    const up = (t: number) => Math.ceil(t / 30) * 30;
    const out: string[] = [];
    for (const d of STAGES) {
      const bot = runStage(d.id, 1);
      const pro = runStage(d.id, 1, { policy: expertBot });
      const best = Math.min(bot.result.cleared ? bot.result.ticks : Infinity, pro.result.cleared ? pro.result.ticks : Infinity);
      const par = up(bot.result.ticks * 1.3);
      const master = up(best);
      out.push(`${d.id.padEnd(3)} 기본 ${fmtTicks(bot.result.ticks)} 숙련 ${pro.result.cleared ? fmtTicks(pro.result.ticks) : '실패'}(목숨${pro.s.lives})`
        + ` → par: ${par}, master: ${master}   (${fmtTicks(par)} / ${fmtTicks(master)})`);
    }
    console.log(out.join('\n'));
    if (process.env.OUT) appendFileSync(process.env.OUT, out.join('\n') + '\n');
  });
});
