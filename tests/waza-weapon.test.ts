// 필살 여섯 × 무기 안무(DESIGN 11-21 §4) — 무기는 친 순간이 아니라 반전이 끝난 다음 프레임부터 큰 획을 타고 번진다.
// 진짜 시뮬 + 렌더러 소비로 필살 한 번씩 돌려, 번짐(weaponAlong) · 마무리(weaponBloom)가 언제 몇 번 오는지 · 반전 중엔 안 오는지 본다.
import { describe, expect, it, vi } from 'vitest';
import { JUICE } from '../src/config';
import { makeFloor, makeStack } from '../src/core/building';
import { advance, makeState } from '../src/core/sim';
import type { Material, WazaId } from '../src/core/types';

const log: { kind: 'along' | 'bloom' | 'burst' | 'inv'; f: number; a: unknown[] }[] = [];
let frameNow = (): number => -1;

vi.mock('../src/platform/native', async (orig) => ({
  ...await orig<typeof import('../src/platform/native')>(),
  vibrate: vi.fn(),
}));
vi.mock('../src/render/effects', async (orig) => ({
  ...await orig<typeof import('../src/render/effects')>(),
  spawnStackShatter: vi.fn(),
}));
vi.mock('../src/render/bladeFx', async (orig) => ({
  ...await orig<typeof import('../src/render/bladeFx')>(),
  weaponAlong: vi.fn((...a: unknown[]) => log.push({ kind: 'along', f: frameNow(), a })),
  weaponBloom: vi.fn((...a: unknown[]) => log.push({ kind: 'bloom', f: frameNow(), a })),
  weaponBurst: vi.fn((...a: unknown[]) => log.push({ kind: 'burst', f: frameNow(), a })),
}));
vi.mock('../src/render/screenfx', async (orig) => {
  const m = await orig<typeof import('../src/render/screenfx')>();
  return { ...m, startCaption: vi.fn(), inkFrame: vi.fn((n: number) => { log.push({ kind: 'inv', f: frameNow(), a: [n] }); m.inkFrame(n); }) };
});

const { consumeEvents } = await import('../src/render/renderer');
const ws = await import('../src/render/wazaShow');
frameNow = () => ws.wazaShowState()?.f ?? -1;

const IN = { jump: false, guard: false, attack: false, special: false };
function run(waza: WazaId): typeof log {
  ws.resetWazaShow();
  const s = makeState({ seed: 7 });
  s.weapon = 'flame';
  s.waza = waza;
  s.wazaGauge = 100;
  s.stackSpawnCd = 99999;
  s.stack = makeStack({ variant: 'building', theme: 'europe', floors: ['mid', 'mid', 'mid', 'mid'].map((m) => makeFloor(m as Material)), y: 140, vy: 0 });
  log.length = 0;
  for (let t = 1; t <= 320; t++) {
    advance(s, { ...IN, special: t === 2 });
    s.stackSpawnCd = Math.max(s.stackSpawnCd, 9999);
    consumeEvents(s);
    s.events.length = 0;
  }
  return log.slice();
}

const P = JUICE.special.hitstop;
// [번짐 수, 마무리 수] — 표 §4 그대로
const COUNT: Record<WazaId, [number, number]> = {
  tenchi: [5, 1], ageba: [2, 1], mukjul: [2, 0], dalmuri: [1, 4], nakgwan: [4, 8], baram: [3, 1],
};

describe('필살 × 무기 — 번짐 · 마무리 안무', () => {
  for (const id of Object.keys(COUNT) as WazaId[]) {
    it(`${id} — 옛 도장(weaponBurst) 없음 · 번짐 ${COUNT[id][0]} · 마무리 ${COUNT[id][1]} · 반전 프레임엔 시작하지 않는다`, () => {
      const rows = run(id);
      expect(rows.filter((r) => r.kind === 'burst')).toEqual([]);
      const along = rows.filter((r) => r.kind === 'along');
      const bloom = rows.filter((r) => r.kind === 'bloom');
      expect([along.length, bloom.length]).toEqual(COUNT[id]);
      const inv = rows.filter((r) => r.kind === 'inv').map((r) => [r.f, r.f + (r.a[0] as number) - 1]);
      for (const r of [...along, ...bloom]) {
        expect(r.f).toBeGreaterThan(0);
        expect(inv.some(([a, b]) => r.f >= a && r.f <= b), `${r.kind} @${r.f} 반전 ${JSON.stringify(inv)}`).toBe(false);
      }
      for (const r of along) {
        const pts = r.a[1] as number[];
        expect(pts.length).toBeGreaterThanOrEqual(4);
        expect(pts.every(Number.isFinite)).toBe(true);
      }
    });
  }

  it('천지개벽 — 가운데 벼락은 반전 셋이 끝난 P+3에 뿌리(땅)에서 하늘로', () => {
    const along = run('tenchi').filter((r) => r.kind === 'along');
    expect(along.map((r) => r.f)).toEqual([P + 3, P + 3, P + 6, P + 28, P + 28]);
    const pts = along[0].a[1] as number[];
    expect(pts[1]).toBeGreaterThan(pts[pts.length - 1]); // 시작 y(땅)가 끝 y(하늘)보다 아래
  });
});
