// 아케이드 1막 측정(11-19 「판 안 재미」) — 평소엔 건너뛴다:
//   ARCADE=1 [SEEDS=1,2,3] [MIN=2.5] [OUT=<파일>] npx vitest run --no-cache tests/arcade-measure.test.ts
// 봇은 1막을 10분에 p 0.1쯤밖에 못 민다(act1curve) — 구역마다 그 구역 시작 점수를 넣고 MIN분씩 돌린다(특별작전 START_P와 같은 주입).
// 잰 것: 구역별 분당 진행(Δp) · 분당 목숨 손실 · 해금 추정(구역마다 0.25 ÷ 분당 Δp 합) · 첫 2분 「건물이 사거리 밖」 비율 · 첫 건물이 보이기까지.
import { describe, it } from 'vitest';
// @ts-ignore — node 타입 없이 돈다(의존성 0). 측정 도구 전용
import { appendFileSync } from 'node:fs';
declare const process: { env: Record<string, string | undefined> };
import { makeState, advance } from '../src/core/sim';
import { EMPTY_INPUT, type GameState, type InputFrame, type PerkId } from '../src/core/types';
import { attackRange } from '../src/core/combat';
import { cameraFollowY } from '../src/core/camera';
import { ACT1, PERK, VIEW, WEAPON } from '../src/config';
import { humanBot, stageBot } from './stageBot';

const MIN = Number(process.env.MIN ?? 2.5);
const SEEDS = (process.env.SEEDS ?? '1,2,3').split(',').map(Number);
const BOUNDS = [0, ...ACT1.CHAPTER_BOUNDS];
// 봇 둘 — 사람 대역(11틱 늦게 보고 10틱마다 벤다) · 기본 봇(미리 보기 욕심쟁이)
const BOTS: Record<string, () => (s: GameState) => InputFrame> = { 대역: () => humanBot(11, 10), 기본: () => (s) => stageBot(s) };

/** 제안 쪽지가 떠 있으면 손을 놓았다가 왼쪽(점프)을 누른다 — 없으면 봇 그대로 */
function withOffer(bot: (s: GameState) => InputFrame): (s: GameState) => InputFrame {
  return (s) => {
    const o = (s as { perk?: { offer: { calm: number } | null } | null }).perk?.offer;
    if (o) return o.calm >= 20 ? { ...EMPTY_INPUT, jump: true } : EMPTY_INPUT;
    return bot(s);
  };
}

function inReach(s: GameState): boolean {
  const st = s.stack;
  if (!st || st.floors.length === 0) return false;
  const [lo, hi] = attackRange(s.player.y, WEAPON[s.weapon].reach);
  const top = st.y + st.floors.reduce((a, f) => a + f.h, 0);
  return st.y <= hi && top >= lo;
}

interface ChRun { dp: number; min: number; lost: number }

/** 구역 ch 시작 점수에서 MIN분 — 구역이 바뀌거나 끝나면 멈춘다 */
function runChapter(who: string, seed: number, ch: number, perk?: PerkId): ChRun {
  const s = makeState({ seed: seed * 7919 + ch });
  if (perk) s.perk = { picked: [perk], seen: [perk], offer: null };
  s.lives = 99;
  s.chapter = ch;
  s.score = Math.ceil(BOUNDS[ch] * ACT1.UNLOCK_SCORE);
  // 판 시작(0채)이 아니다 — 구역 중간에 들어온 판처럼 부순 수를 채워 둔다
  if (ch > 0) s.drops = 20;
  const p0 = s.score / ACT1.UNLOCK_SCORE;
  const bot = withOffer(BOTS[who]());
  let lost = 0;
  let ticks = 0;
  const cap = MIN * 3600;
  while (!s.over && ticks < cap && s.chapter === ch && s.mode === 'act1') {
    advance(s, bot(s));
    for (const e of s.events) if (e.kind === 'lifeLost') lost += 1;
    s.events.length = 0;
    ticks += 1;
  }
  const min = ticks / 3600;
  return { dp: (Math.min(s.p, BOUNDS[ch] + 0.25) - p0) / min, min, lost };
}

/** 판 처음 2분 — 사거리 밖 비율, 첫 건물이 화면에 보인 틱 */
function firstTwo(who: string, seed: number): { idle: number; firstSeen: number } {
  const s = makeState({ seed });
  s.lives = 99;
  const bot = withOffer(BOTS[who]());
  let out = 0;
  let n = 0;
  let firstSeen = -1;
  while (n < 7200 && !s.over) {
    advance(s, bot(s));
    s.events.length = 0;
    n += 1;
    if (firstSeen < 0 && s.stack && s.stack.y < VIEW.GROUND_Y - VIEW.FIELD_TOP + cameraFollowY(s)) firstSeen = n;
    if (s.mode === 'act1' && !inReach(s)) out += 1;
  }
  return { idle: out / n, firstSeen };
}

// 현장 조건 하나씩 — 구역 2~4에서 조건 없음 대비 분당 Δp · 분당 목숨(PERKS=1)
describe.skipIf(!process.env.PERKS)('현장 조건 측정', () => {
  it('조건마다 구역 2~4', { timeout: 3_600_000 }, () => {
    const log = (line: string) => { console.log(line); if (process.env.OUT) appendFileSync(process.env.OUT, line + '\n'); };
    for (const who of Object.keys(BOTS)) {
      for (const id of [undefined, ...Object.keys(PERK)] as (PerkId | undefined)[]) {
        const cells: string[] = [];
        for (let ch = 1; ch < 4; ch++) {
          const r = SEEDS.map((seed) => runChapter(who, seed, ch, id));
          const min = r.reduce((a, x) => a + x.min, 0);
          const dp = r.reduce((a, x) => a + x.dp * x.min, 0) / min;
          cells.push(`구역${ch + 1} Δp ${dp.toFixed(4)} 목숨 ${(r.reduce((a, x) => a + x.lost, 0) / min).toFixed(2)}`);
        }
        log(`[${who}] ${id ? PERK[id].name : '조건 없음'}: ${cells.join(' | ')}`);
      }
    }
  });
});

describe.skipIf(!process.env.ARCADE)('아케이드 측정', () => {
  it('구역별 진행 · 목숨 · 초반 기다림', { timeout: 3_600_000 }, () => {
    const log = (line: string) => { console.log(line); if (process.env.OUT) appendFileSync(process.env.OUT, line + '\n'); };
    for (const who of Object.keys(BOTS)) {
      const per: ChRun[][] = [[], [], [], []];
      for (const seed of SEEDS) for (let ch = 0; ch < 4; ch++) per[ch].push(runChapter(who, seed, ch));
      let unlock = 0;
      for (let ch = 0; ch < 4; ch++) {
        const r = per[ch];
        const min = r.reduce((a, x) => a + x.min, 0);
        const dp = r.reduce((a, x) => a + x.dp * x.min, 0) / min;
        const lost = r.reduce((a, x) => a + x.lost, 0) / min;
        unlock += 0.25 / dp;
        log(`[${who}] 구역${ch + 1}: 분당 Δp ${dp.toFixed(4)} · 분당 목숨 ${lost.toFixed(2)} · 잰 시간 ${min.toFixed(1)}분`);
      }
      log(`[${who}] 해금 추정 ${unlock.toFixed(1)}분(구역마다 0.25 ÷ 분당 Δp)`);
      const ft = SEEDS.map((seed) => firstTwo(who, seed));
      log(`[${who}] 첫 2분 사거리 밖 ${(100 * ft.reduce((a, x) => a + x.idle, 0) / ft.length).toFixed(1)}% · 첫 건물 보임 ${ft.map((x) => x.firstSeen).join(',')}틱`);
    }
  });
});
