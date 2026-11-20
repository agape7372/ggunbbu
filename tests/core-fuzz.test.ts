// core 무작위 입력 퍼즈(줄인 판) — 봇 입력에 무작위 엣지 · 가드 홀드를 섞어 모드마다 한 씨앗씩 돌린다.
// 예외 0 · 비유한 수 0 · 범위 위반 0 · 쓰러뜨린 뒤 게임오버 0, 같은 씨앗이면 같은 결과.
// 큰 판(모드마다 씨앗 여럿 · 254만 틱)은 2026-11-12 감사 1차 core/fuzz.test.ts.
import { describe, it, expect } from 'vitest';
import { makeState, advance, grantMercyLife, enterBonus } from '../src/core/sim';
import { enterAct2, enterAct2Phase, continueFromCheckpoint } from '../src/core/act2';
import { startStage, stageSeed } from '../src/core/stage';
import { STAGES } from '../src/core/stages';
import { EMPTY_INPUT, type GameState, type InputFrame, type WazaId, type WeaponId } from '../src/core/types';
import { stageBot } from './stageBot';
import { ACT1, GIMMICK, SCORE, WAZA_GAUGE, GUARD_GAUGE } from '../src/config';

const WAZAS: WazaId[] = ['tenchi', 'ageba', 'mukjul', 'dalmuri', 'nakgwan', 'baram'];
const WEAPONS: WeaponId[] = ['sword', 'hammer', 'crowbar', 'grinder', 'shovel', 'pipe', 'drill', 'pickaxe', 'coredrill', 'auger', 'jackhammer',
  'iron', 'brick', 'saw', 'hazard', 'rod', 'beam', 'glass', 'flame', 'frost', 'onyx', 'gold'];

function mk(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Scn { name: string; make: (seed: number) => GameState; ticks: number; bot: number; seed: number }

const scn: Scn[] = [
  { name: 'act1', make: (k) => makeState({ seed: k }), ticks: 4000, bot: 0.6, seed: 1 },
  // 무기는 seed % WEAPONS — 고유 규칙이 있는 무기 가운데 앞 씨앗(1~6)에 안 걸리는 것을 1막으로 한 판씩
  ...[7, 8, 9, 10, 12, 15, 17].map((seed): Scn => ({ name: `act1-w${seed}`, make: (k) => makeState({ seed: k }), ticks: 2500, bot: 0.5, seed })),
  { name: 'op-orbit', ticks: 3000, bot: 0.6, seed: 2, make: (k) => {
    const s = makeState({ seed: k }); s.gimmick = 'orbit'; s.chapter = 3; s.p = GIMMICK.START_P.orbit; s.score = Math.floor(ACT1.UNLOCK_SCORE * s.p); return s;
  } },
  { name: 'tokoton', make: (k) => makeState({ seed: k, mode: 'tokoton' }), ticks: 4000, bot: 0.7, seed: 3 },
  { name: 'bonus-1', ticks: 2000, bot: 0.5, seed: 4, make: (k) => { const s = makeState({ seed: k }); enterBonus(s, 1); return s; } },
  { name: 'act2', ticks: 4000, bot: 0.7, seed: 5, make: (k) => { const s = makeState({ seed: k }); enterAct2(s); return s; } },
  { name: 'act2-moon', ticks: 4000, bot: 0.6, seed: 6, make: (k) => { const s = makeState({ seed: k }); enterAct2Phase(s, 'moon'); s.fullCombo = false; return s; } },
];
// 작업 지시서 13판 — 난이도를 돌려 가며 한 판씩
STAGES.forEach((d, i) => {
  const diff = (i % 3) as 0 | 1 | 2;
  scn.push({ name: `stage-${d.id}-${diff}`, ticks: 2200, bot: 0.75, seed: i + 1, make: (k) => {
    const s = makeState({ seed: stageSeed(d.id) ^ k }); startStage(s, { id: d.id, diff, weapon: 'sword', waza: 'tenchi' }); return s;
  } });
});

function nonFinite(o: unknown, path: string, out: string[]): void {
  if (typeof o === 'number') { if (!Number.isFinite(o)) out.push(`${path}=${o}`); return; }
  if (!o || typeof o !== 'object') return;
  if (Array.isArray(o)) { o.forEach((v, i) => nonFinite(v, `${path}[${i}]`, out)); return; }
  for (const [k, v] of Object.entries(o)) if (k !== 'events') nonFinite(v, `${path}.${k}`, out);
}

function run(sc: Scn): { s: GameState; viol: string[] } {
  const r = mk(sc.seed * 7919 + 13);
  const s = sc.make(sc.seed);
  s.waza = WAZAS[sc.seed % WAZAS.length];
  if (s.mode !== 'stage') s.weapon = WEAPONS[sc.seed % WEAPONS.length];
  const viol: string[] = [];
  const v = (what: string) => { if (viol.length < 8) viol.push(`${sc.name} 틱 ${s.tick}: ${what}`); };
  let guardHold = false;
  let revives = 0;
  let defeatedAt = -1;
  for (let i = 0; i < sc.ticks; i++) {
    let f: InputFrame = EMPTY_INPUT;
    if (r() < sc.bot) {
      try { f = stageBot(s); } catch (e) { v(`stageBot 예외 ${(e as Error).message}`); }
    } else {
      if (r() < 0.08) guardHold = !guardHold;
      f = { attack: r() < 0.35, jump: r() < 0.06, guard: guardHold, special: r() < 0.03, attackHeld: r() < 0.5 };
    }
    try { advance(s, f); } catch (e) { v(`advance 예외 ${(e as Error).message}`); break; }
    for (const e of s.events) if (e.kind === 'bossDefeat') defeatedAt = s.tick;
    s.events.length = 0;
    const bad: string[] = [];
    nonFinite(s, 's', bad);
    if (bad.length) v(`비유한 ${bad.slice(0, 3).join(', ')}`);
    if (s.combo < 0 || s.combo > SCORE.COMBO_CAP) v(`콤보 ${s.combo}`);
    if (s.score < 0 || s.score > SCORE.CAP) v(`점수 ${s.score}`);
    if (s.wazaGauge < 0 || s.wazaGauge > WAZA_GAUGE.MAX) v(`필살 게이지 ${s.wazaGauge}`);
    if (s.guardGauge < 0 || s.guardGauge > GUARD_GAUGE.MAX) v(`가드 게이지 ${s.guardGauge}`);
    if (s.player.y < 0) v(`player.y ${s.player.y}`);
    if (s.lives < 0) v(`lives ${s.lives}`);
    if (s.groundRocks < 0) v(`groundRocks ${s.groundRocks}`);
    if (s.stack && s.stack.floors.length === 0) v('빈 스택');
    if (s.entities.length > 80) v(`엔티티 ${s.entities.length}`);
    if (s.debris.length > 200) v(`잔해 ${s.debris.length}`);
    if (s.over === 'cleared') break;
    if (s.over === 'gameover') {
      if (defeatedAt >= 0) v(`보스 격파(틱 ${defeatedAt}) 뒤 게임오버`);
      if (revives >= 30) break;
      revives += 1;
      if (s.mode === 'act2' && s.act2Phase !== 'moon') continueFromCheckpoint(s);
      else grantMercyLife(s);
      defeatedAt = -1;
    }
  }
  return { s, viol };
}

describe('core 퍼즈(줄인 판)', () => {
  for (const sc of scn) {
    it(`${sc.name} — 예외 · 비유한 · 범위 위반 0`, () => {
      expect(run(sc).viol).toEqual([]);
    });
  }

  it('같은 씨앗이면 같은 결과', () => {
    for (const name of ['act1', 'act2-moon', 'stage-3-B']) {
      const found = scn.find((x) => x.name.startsWith(name));
      expect(found, name).toBeDefined();
      const sc = { ...found!, ticks: 1500 };
      const a = JSON.stringify(run(sc).s);
      const b = JSON.stringify(run(sc).s);
      expect(a === b, name).toBe(true);
    }
  });
});
