// 작업 지시서 측정 — 봇으로 판마다 시간 · 사고를 잰다. 평소엔 건너뛴다:
//   MEASURE=1 npx vitest run tests/stage-measure.test.ts          (ONLY=4-B · DIFFS=1 로 좁힌다 · OUT=파일 에 한 줄씩)
//   TRACE=4-B DIFF=1 TICKS=900 npx vitest run tests/stage-measure.test.ts   (틱마다 따라가기)
// 기한(par) · 전임자(master)는 이 표에서 정한다(stages.ts 머리 주석).
import { describe, it } from 'vitest';
// @ts-ignore — node 타입 없이 돈다(의존성 0). 측정 도구 전용
import { appendFileSync, readFileSync } from 'node:fs';
declare const process: { env: Record<string, string | undefined> };
import type { GameState, InputFrame } from '../src/core/types';
import { makeState, advance } from '../src/core/sim';
import { stageSeed, startStage, judgeStage, stageScript } from '../src/core/stage';
import { STAGES } from '../src/core/stages';
import * as CFG from '../src/config';
import { lmAct } from '../src/core/landmark';
import { craneLog, craneWindows, expertBot, fmtTicks, humanBot, runStage, stageBot, userBot } from './stageBot';

function cause(s: GameState): string {
  const ev = s.events;
  if (ev.some((e) => e.kind === 'boltStrike')) return '번개';
  if (s.lm?.st === 'slam') return '내려찍기';
  if (ev.some((e) => e.kind === 'land')) return '화산탄';
  if (s.player.pose === 'pinned' || s.stack?.resting) return '깔림';
  return s.player.pose;
}

/** 바꿔 볼 값을 이 실행에서만 얹는다(대본은 첫 판을 돌리기 전에만).
 *   TWEAK='{"2-1":{"speed":0.1},"STAGE":{"FAST_SPEED_ADD":0.15},"LANDMARK":{"BELL":{"HP":12}},"BOSS":{"HP":200}}'  또는  TWEAK=@경로.json
 *   키 = 판 id(STAGES 항목) 또는 config.ts 내보낸 객체 이름(STAGE · LANDMARK · BOSS …). 값의 한 단계 깊이까지만 합친다:
 *   값이 객체(배열 아님)이고 원래도 객체면 Object.assign, 아니면 통째로 바꿔 넣는다(배열은 통째 교체). */
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

describe.skipIf(!process.env.TRACE)('추적', () => {
  it(String(process.env.TRACE), { timeout: 600_000 }, () => {
    tweak();
    const id = String(process.env.TRACE);
    const diff = Number(process.env.DIFF ?? 1) as 0 | 1 | 2;
    const s = makeState({ seed: stageSeed(id) });
    startStage(s, { id, diff, weapon: 'sword', waza: 'tenchi', fromBoss: !!process.env.FROMBOSS });
    // DELAY=12 TAP=8 → 사람 대역으로 따라간다
    const policy = process.env.DELAY ? humanBot(Number(process.env.DELAY), Number(process.env.TAP ?? 8)) : stageBot;
    const out: string[] = [];
    let last = '';
    while (!s.over && s.tick < Number(process.env.TICKS ?? 1500)) {
      const f = policy(s);
      advance(s, f);
      const st = s.stack;
      const top = st ? st.y + st.floors.reduce((a, x) => a + x.h, 0) : 0;
      const lm = s.lm;
      const key = `${lm?.st}/${lm?.air}/${st ? st.floors.map((x) => x.segs[0].hp).join('') : '-'}/${s.player.pose}`;
      const ev = s.events.map((e) => e.kind).filter((k) => k !== 'slash').join(',');
      if (key !== last || ev) {
        out.push(`${s.tick} 걸음${s.stage?.step} ${key} y${st?.y.toFixed(0)} vy${st?.vy.toFixed(0)} top${top.toFixed(0)} k${lm?.k} w${lm?.wave}/f${lm?.body?.floors.length ?? "-"}/n${lm?.n}/g${lm?.got}/x${lm?.x} p${s.player.y.toFixed(0)} g${s.guardGauge.toFixed(0)} in${f.attack ? 'A' : ''}${f.guard ? 'G' : ''}${f.jump ? 'J' : ''} ${ev}`);
        last = key;
      }
      s.events.length = 0;
    }
    console.log(out.slice(0, Number(process.env.LINES ?? 200)).join('\n'));
    console.log(craneLog.join('\n'));
  });
});

// 크레인 창 — 짐마다 땅 가드로 걸 수 있는 틈(틱). 사람은 몇 틱짜리 틈을 맞추나:
//   CRANE=1 DIFFS=0,1 npx vitest run tests/stage-measure.test.ts -t 크레인
describe.skipIf(!process.env.CRANE)('크레인 창', () => {
  it('짐마다 거는 틈', { timeout: 600_000 }, () => {
    tweak();
    for (const diff of (process.env.DIFFS ?? '0,1,2').split(',').map(Number) as (0 | 1 | 2)[]) {
      let wave = -1;
      runStage('4-B', diff, {
        policy: (s) => {
          const lm = s.lm;
          if (lm?.id === 'crane' && s.stack && lm.air !== 0 && lm.wave !== wave) {
            wave = lm.wave;
            console.log(`${['견습', '정규', '외주'][diff]} ${lmAct(s)}막 짐${wave}(${s.stack.floors.length}층): ${craneWindows(s)}`);
          }
          return stageBot(s);
        },
      });
    }
  });
});

// 사람 대역 55 — 반응 지연 6~16(열하나) × 베기 간격 8~12(다섯) = 판마다 55번 돌려 몇 번 깨나(%) · 깬 판 평균 시간. 봇 하나의 한 판은 박자 운이 커서 비율로 본다.
//   HUMAN=1 DIFFS=0,1,2 npx vitest run --no-cache tests/stage-measure.test.ts -t 사람   (ONLY=2-1,3-2 · DELAYS=6,8,10 · TAPS=8,10 로 좁힌다 · OUT=파일 에 한 줄씩 · MARGIN=1 = 막기 여유 ÷ 지연 · FROMBOSS=1 = 보스 연습)
//   TWEAK=… 로 값을 바꿔 본다(tweak 주석)
describe.skipIf(!process.env.HUMAN)('사람 대역 55', () => {
  it('사람 대역이 깨는 비율', { timeout: 3_600_000 }, () => {
    tweak();
    const only = process.env.ONLY?.split(',');
    const diffs = (process.env.DIFFS ?? '1').split(',').map(Number) as (0 | 1 | 2)[];
    const delays = (process.env.DELAYS ?? '6,7,8,9,10,11,12,13,14,15,16').split(',').map(Number);
    const taps = (process.env.TAPS ?? '8,9,10,11,12').split(',').map(Number);
    for (const d of STAGES) {
      if (only && !only.includes(d.id)) continue;
      for (const diff of diffs) {
        const total = stageScript(d.id).length;
        let ok = 0;
        let lost = 0;
        let clearTicks = 0;
        const fails = new Map<string, number>();
        for (const delay of delays) {
          for (const tap of taps) {
            const r = runStage(d.id, diff, { policy: humanBot(delay, tap, Math.round(delay * Number(process.env.MARGIN ?? 1))), fromBoss: !!process.env.FROMBOSS });
            const st = r.s.stage!;
            if (r.result.cleared) { ok += 1; lost += st.tally.lifeLost; clearTicks += r.result.ticks; continue; }
            const at = `${st.phase === 'boss' ? '보스' : `${st.step}/${total}`}${r.s.over === 'gameover' ? '' : ' 시간'}`;
            fails.set(at, (fails.get(at) ?? 0) + 1);
          }
        }
        const n = delays.length * taps.length;
        const top = [...fails].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, c]) => `${k}×${c}`).join(' ');
        const line = `${d.id.padEnd(3)} ${['견습', '정규', '외주'][diff]} ${String(ok).padStart(2)}/${n} ${String(Math.round((ok * 100) / n)).padStart(3)}%`
          + (ok ? ` 평균 ${fmtTicks(Math.round(clearTicks / ok))} 사고 ${(lost / ok).toFixed(1)}` : '') + (top ? ` | 실패 ${top}` : '');
        console.log(line);
        if (process.env.OUT) appendFileSync(process.env.OUT, line + '\n');
      }
    }
  });
});

/** 10-31판(1469489) 성급한 건물 흉내 — 그때는 급락이 건물당 한 번이 아니라 최하층이 HP1로 HASTY_TICKS 버틸 때마다 겹쳤다.
 *  지금 코드가 첫 급락을 내고 나면 이 감시가 같은 셈을 이어 세어 둘째부터 곱한다(정책 앞에서 돌아 한 틱 늦을 수 있다) */
function oldHasty(inner: (s: GameState) => InputFrame): (s: GameState) => InputFrame {
  let emu: { stack: unknown; t: number; n: number } | null = null;
  return (s) => {
    const st = s.stage;
    if (st?.hasty && s.stack && emu?.stack !== s.stack) emu = { stack: s.stack, t: 0, n: 0 };
    if (emu && emu.stack !== s.stack) emu = null;
    const bottom = s.stack?.floors[0];
    if (emu && st && bottom) {
      if (bottom.segs[0].hp !== 1) emu.t = 0;
      else if (++emu.t === CFG.STAGE.HASTY_TICKS && ++emu.n >= 2) {
        st.fallG *= CFG.STAGE.HASTY_FALL;
        st.fallV *= CFG.STAGE.HASTY_FALL;
        st.tally.hastyDrops += 1;
      }
    }
    return inner(s);
  };
}

// 사용자 대역(userBot) — 손 늦음 J · 착각 b · 계획 몫 q 격자. 칸마다 지연 × 베기 간격 × 회차를 돌려 깬 %를 센다. 기본값 = 보정값(J 5 · 간격 5~9 · 지연 6~16)
//   USER_BOT=1 DIFFS=0,1,2 npx vitest run --no-cache tests/stage-measure.test.ts -t 사용자
//   좁히기 · 바꾸기: USER_J=4,5,6 USER_B=0,0.5 USER_Q=0.5,1 DELAYS=6,…,16 TAPS=5,…,9 SEEDS=0,1 ONLY=1-1 MAXT=36000 USER_SLAM=1 OUT=파일
//   10-31판 재현: TWEAK=@tmp/st1114/old1031.json OLD_HASTY=1 MAXT=36000(게임엔 시간 제한이 없다)
//   한 줄 = 판 난이도 J b q 지연범위 깬수/판수 % 평균 시간 · 기대 시도 수(판수 ÷ 깬수) · 시간 초과 수 · 실패 걸음 상위 3
describe.skipIf(!process.env.USER_BOT)('사용자 대역', () => {
  it('사용자 대역 격자', { timeout: 3_600_000 }, () => {
    tweak();
    const list = (k: string, d: string) => (process.env[k] ?? d).split(',').map(Number);
    const only = process.env.ONLY?.split(',');
    const diffs = list('DIFFS', '1') as (0 | 1 | 2)[];
    const delays = list('DELAYS', '6,7,8,9,10,11,12,13,14,15,16');
    const taps = list('TAPS', '5,6,7,8,9');
    const seeds = list('SEEDS', '0');
    const maxTicks = Number(process.env.MAXT ?? 60 * 60 * 5);
    for (const J of list('USER_J', '5')) for (const b of list('USER_B', '0')) for (const q of list('USER_Q', '0.5')) {
      for (const d of STAGES) {
        if (only && !only.includes(d.id)) continue;
        for (const diff of diffs) {
          const total = stageScript(d.id).length;
          let ok = 0;
          let clearTicks = 0;
          let slow = 0;
          const fails = new Map<string, number>();
          for (const delay of delays) for (const tap of taps) for (const seed of seeds) {
            const bot = userBot(delay, tap, { J, b, q, seed, slamLate: !!process.env.USER_SLAM });
            const r = runStage(d.id, diff, { policy: process.env.OLD_HASTY ? oldHasty(bot) : bot, maxTicks });
            const st = r.s.stage!;
            if (r.result.cleared) { ok += 1; clearTicks += r.result.ticks; continue; }
            if (r.s.over !== 'gameover') slow += 1;
            const at = `${st.phase === 'boss' ? '보스' : `${st.step}/${total}`}${r.s.over === 'gameover' ? '' : ' 시간'}`;
            fails.set(at, (fails.get(at) ?? 0) + 1);
          }
          const n = delays.length * taps.length * seeds.length;
          const top = [...fails].sort((a, b2) => b2[1] - a[1]).slice(0, 3).map(([k, c]) => `${k}×${c}`).join(' ');
          const line = `${d.id.padEnd(3)} ${['견습', '정규', '외주'][diff]} J${J} b${b} q${q} d${delays[0]}-${delays[delays.length - 1]}`
            + ` ${String(ok).padStart(2)}/${n} ${String(Math.round((ok * 100) / n)).padStart(3)}%`
            + (ok ? ` 평균 ${fmtTicks(Math.round(clearTicks / ok))} 시도 ${(n / ok).toFixed(1)}` : ' 시도 ∞')
            + (slow ? ` 시간초과 ${slow}` : '') + (top ? ` | 실패 ${top}` : '');
          console.log(line);
          if (process.env.OUT) appendFileSync(process.env.OUT, line + '\n');
        }
      }
    }
  });
});

describe.skipIf(!process.env.MEASURE)('측정', () => {
  it('전 판', { timeout: 1_800_000 }, () => {
    tweak();
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
    tweak();
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
          const hours = CFG.LANDMARK.BELL.HOURS[lm.wave];
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
    tweak();
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
    tweak();
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
