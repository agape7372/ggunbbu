// 무기 비교 측정(11-20 고유 규칙 무기). 평소엔 건너뛴다(arcade-measure와 같은 꼴):
//   WMEASURE=1 [SEEDS=1,2,3,4,5,6] [MIN=8] [IDS=sword,shovel] [TUNE=shovel.gauge=0.6] [OUT=<파일>] npx vitest run --no-cache tests/weapon-measure.test.ts
// 아케이드 1막을 같은 시드로 무기만 바꿔 MIN분씩 돌린다(목숨 99). 잰 것: 점수 · 분당 목숨 손실 · 필살 횟수 + 고유 규칙이 판에서 작동한 횟수.
// 봇 둘: 사용자 대역(userBot 지연 10 · 베기 7 · J 5) · 숙련(expertBot, 뛰어 마중 나가 공중에서 벤다).
// 둘 다 게이지가 차면 필살을 쓰고, 착암기는 막거나 뛰지 않을 때 공격 키를 쥐고 있다(holdRepeat).
import { describe, it } from 'vitest';
// @ts-ignore — node 타입 없이 돈다(의존성 0). 측정 도구 전용
import { appendFileSync } from 'node:fs';
declare const process: { env: Record<string, string | undefined> };
import { makeState, advance } from '../src/core/sim';
import { EMPTY_INPUT, type GameState, type InputFrame, type WeaponId } from '../src/core/types';
import { WAZA_GAUGE, WEAPON } from '../src/config';
import { expertBot, userBot } from './stageBot';

const MIN = Number(process.env.MIN ?? 8);
const SEEDS = (process.env.SEEDS ?? '1,2,3,4,5,6').split(',').map(Number);
const IDS: WeaponId[] = (process.env.IDS?.split(',') as WeaponId[] | undefined) ?? (Object.keys(WEAPON) as WeaponId[]);
// 무기 칸 덮어쓰기(조정용). 이 판 안에서만 바뀐다
for (const kv of process.env.TUNE?.split(',') ?? []) {
  const [path, v] = kv.split('=');
  const [id, k] = path.split('.');
  (WEAPON[id as WeaponId] as unknown as Record<string, number>)[k] = Number(v);
}
const BOTS: Record<string, () => (s: GameState) => InputFrame> = {
  사용자: () => userBot(10, 7, { J: 5 }),
  숙련: () => expertBot,
};

function hand(bot: (s: GameState) => InputFrame): (s: GameState) => InputFrame {
  return (s) => {
    const o = s.perk?.offer;
    if (o) return o.calm >= 20 ? { ...EMPTY_INPUT, jump: true } : EMPTY_INPUT;
    const p = s.player;
    if (s.wazaGauge >= WAZA_GAUGE.COST && (p.pose === 'idle' || p.pose === 'jump')) return { ...EMPTY_INPUT, special: true };
    // 봇의 safe()는 안전모가 「바뀌면」 위험으로 본다. 콤보 49에서 베면 안전모를 받아 바뀌니 베기를 거부한다.
    // 땅 가드로 콤보가 안 끊기는 삽은 49에 머물러 숙련 봇이 영영 안 벤다(판 멈춤). 지시서 기록이 이 봇에 묶여 있어 봇은 두고
    // 여기서만 안전모를 쓴 판으로 보여 준다(잃으면 여전히 위험 · 얻는 건 비교에서 빠진다)
    const had = s.hat;
    s.hat = true;
    const f = bot(s);
    s.hat = had;
    return WEAPON[s.weapon].holdRepeat && !f.guard && !f.jump ? { ...f, attackHeld: true } : f;
  };
}

interface Run {
  score: number; lost: number; specials: number; hits: number; peak: number;
  /** 땅 가드 튕김 · 그때 콤보가 남은 수(삽) */
  gBounce: number; gKept: number;
  /** 공중 가드 튕김 수(철근 guardGauge는 땅 · 공중 모두) · 굴착 드릴이 넘긴 깔림 수 */
  aBounce: number; saves: number;
  /** 층 붕괴 타격 수(곡괭이 +collapseGauge) */
  collapses: number;
  /** 공중 타격 · 그중 땅 사거리 밖이라 airReach가 닿게 한 것(파이프) */
  airHits: number; airOnly: number;
}

function run(who: string, weapon: WeaponId, seed: number): Run {
  const s = makeState({ seed });
  s.weapon = weapon;
  s.lives = 99;
  const bot = hand(BOTS[who]());
  const r: Run = { score: 0, lost: 0, specials: 0, hits: 0, peak: 0, gBounce: 0, gKept: 0, aBounce: 0, saves: 0, collapses: 0, airHits: 0, airOnly: 0 };
  for (let t = 0; t < MIN * 3600 && !s.over; t++) {
    const combo0 = s.combo;
    advance(s, bot(s));
    for (const e of s.events) {
      if (e.kind === 'lifeLost') r.lost += 1;
      else if (e.kind === 'special') r.specials += 1;
      else if (e.kind === 'guardBounce') { r.gBounce += 1; if (combo0 > 0 && s.combo > 0) r.gKept += 1; }
      else if (e.kind === 'guardAirBounce') r.aBounce += 1;
      else if (e.kind === 'pinSave') r.saves += 1;
      else if ((e.kind === 'hit' || e.kind === 'floorCollapse') && 'combo' in e && e.combo !== undefined) {
        // 필살 · 더미 붕괴는 combo 칸이 없다(베기 타격만 센다)
        r.hits += 1;
        if (e.kind === 'floorCollapse') r.collapses += 1;
        if (s.player.y > 0) {
          r.airHits += 1;
          if (('y' in e ? e.y ?? 0 : 0) > s.player.y + WEAPON[weapon].reach) r.airOnly += 1;
        }
      }
    }
    s.events.length = 0;
    r.peak = Math.max(r.peak, s.combo);
  }
  r.score = s.score;
  return r;
}

describe.skipIf(!process.env.WMEASURE)('무기 비교 측정', () => {
  it('아케이드 1막 · 같은 시드', { timeout: 3_600_000 }, () => {
    const log = (line: string) => { console.log(line); if (process.env.OUT) appendFileSync(process.env.OUT, line + '\n'); };
    for (const who of Object.keys(BOTS)) {
      for (const id of IDS) {
        const rs = SEEDS.map((seed) => run(who, id, seed));
        const sum = (k: keyof Run) => rs.reduce((a, x) => a + x[k], 0);
        const avg = (k: keyof Run) => sum(k) / rs.length;
        const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '-');
        log(`[${who}] ${id}: 점수 ${Math.round(avg('score'))} · 분당 목숨 ${(avg('lost') / MIN).toFixed(2)} · 필살 ${avg('specials').toFixed(1)}회 · 최고 콤보 ${Math.round(avg('peak'))}`
          + ` · 땅 가드 ${avg('gBounce').toFixed(1)}(콤보 남음 ${pct(sum('gKept'), sum('gBounce'))}) · 층 붕괴 ${avg('collapses').toFixed(0)}`
          + ` · 공중 타격 ${pct(sum('airHits'), sum('hits'))}(땅 사거리 밖 ${pct(sum('airOnly'), sum('hits'))})`
          + ` · 공중 가드 ${avg('aBounce').toFixed(1)} · 깔림 구제 ${avg('saves').toFixed(2)}`);
      }
    }
  });
});
