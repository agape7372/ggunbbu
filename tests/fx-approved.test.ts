// 사용자가 고른 판 잠금 — 전설 여덟 · 원소 다섯의 조각 그림(bladeFx 풀 층)이 바뀌면 떨어진다.
// 왜: 11-22 사용자가 고른 칼 기운을 확인 없이 다시 지었다가 반려됐다(「왜 잘만들어놓고 다시망치는거야」).
// 떨어지면: 의도한 변경인지부터 본다. 의도했다면 `node scripts/fx/fx.mjs strip|movie --draft …`로 지금 | 새 안을 보여 주고
//           사용자가 새 안을 고른 뒤에만 `npx vitest run tests/fx-approved.test.ts -u`로 갱신한다(docs/FX_HARNESS.md).
// 범위: bladeReact · bladeAura가 뿌려 drawBladeFx가 그리는 층만. 공통 주스(effects.ts) · 필살 몸통(wazaShow)은 안 묶는다.
// ⚠ legend5는 bladeFx와 순환 import — bladeFx를 먼저 들인다
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { bladeAura, bladeReact, drawBladeFx, resetBladeFx, seedBladeFx, updateBladeFx } from '../src/render/bladeFx';
import { WEAPON_LITE } from '../src/config';
import { makeState } from '../src/core/sim';
import type { GameState, JuiceEvent, JuiceKind, WeaponId } from '../src/core/types';

const LEGEND = Object.keys(WEAPON_LITE) as WeaponId[];
const EVENTS: JuiceKind[] = ['hit', 'floorCollapse', 'stackDestroy', 'slash'];
/** 사건 뒤 이 프레임들의 그림을 묶는다(터짐 · 펼침 · 마름) */
const AT = [0, 3, 8, 16, 30];

/** 그린 순서 그대로 — 메서드 이름 + 반올림한 인자 + 색. 그라데이션도 색 자리까지 적는다 */
function traced(draw: (c: CanvasRenderingContext2D) => void): string {
  const log: string[] = [];
  const num = (v: unknown): unknown => (typeof v === 'number' ? Math.round(v) : typeof v === 'object' ? 'o' : v);
  const rec = (tag: string): unknown =>
    new Proxy({} as Record<string, unknown>, {
      get: (_t, k) => (...a: unknown[]) => {
        log.push(`${tag}${String(k)}(${a.map(num).join(',')})`);
        return rec('g.');
      },
      set: (_t, k, v) => {
        if (k === 'fillStyle' || k === 'strokeStyle') log.push(typeof v === 'string' ? v : 'grad');
        return true;
      },
    });
  draw(rec('') as CanvasRenderingContext2D);
  return log.join(' ');
}

function state(w: WeaponId): GameState {
  const s = makeState();
  s.weapon = w;
  s.player.pose = 'attack';
  return s;
}

const sha = (t: string): string => createHash('sha1').update(t).digest('hex').slice(0, 12);

/** 한 사건을 처음 상태에서 돌려 AT 프레임들의 그림을 한 줄로 */
function shot(w: WeaponId, fire: (s: GameState) => void, each?: (s: GameState) => void): string {
  resetBladeFx();
  seedBladeFx();
  const s = state(w);
  fire(s);
  const out: string[] = [];
  for (let f = 0; f <= AT[AT.length - 1]; f++) {
    if (AT.includes(f)) out.push(traced((c) => drawBladeFx(c)));
    updateBladeFx(1 / 60);
    each?.(s);
  }
  return sha(out.join('|'));
}

describe('사용자가 고른 이펙트 판 — 바뀌면 지금 | 새 안 비교부터(고른 뒤에만 -u)', () => {
  it.each(LEGEND)('%s', (w) => {
    const sig: Record<string, string> = {};
    for (const kind of EVENTS) {
      const e: JuiceEvent = { kind, lane: 0, y: 120, combo: 10, n: 4 };
      sig[kind] = shot(w, (s) => bladeReact(s, e));
    }
    sig.aura = shot(w, (s) => bladeAura(s), (s) => bladeAura(s));
    expect(sig).toMatchSnapshot();
  });
});
