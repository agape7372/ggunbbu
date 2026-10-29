// 무기 — 철거칼은 기존 수치 그대로, 무기는 사거리·띄우기·필살 게이지만 바꾼다.
// 어느 무기든 2막 필요 타격 수(층 HP 합)는 그대로고, 1막 연타로 건물을 띄워 둘 수 없다.
import { describe, it, expect } from 'vitest';
import { makeState, advance } from '../src/core/sim';
import { enterAct2Phase } from '../src/core/act2';
import { makeFloor, makeStack } from '../src/core/building';
import { attackRange, gaugePerHit } from '../src/core/combat';
import { EMPTY_INPUT, type GameState, type InputFrame, type WeaponId } from '../src/core/types';
import { PLAYER, STACK, WEAPON } from '../src/config';
import { DEFAULT_LOADOUT, equip, GREATSWORD_IDS, isOwned, slotOf, validateLoadout, WEAPON_IDS } from '../src/meta/loadout';
import { WEAPON_DUST_COST } from '../src/meta/economy';

const IDS = Object.keys(WEAPON) as WeaponId[];
/** 연타 1주기 = 공격 6f(예열·타격·여운) + 다음 누름까지 1f */
const CYCLE = PLAYER.ATTACK_PRE + PLAYER.ATTACK_ACTIVE + PLAYER.ATTACK_POST + 1;

describe('무기 표', () => {
  it('철거칼 = 기존 공격 수치 그대로', () => {
    expect(WEAPON.sword).toEqual({ reach: PLAYER.ATTACK_REACH, lift: STACK.HIT_LIFT_V, gauge: 1, shake: 1 });
  });

  it('장착 목록과 무기 표가 같다', () => {
    expect([...WEAPON_IDS].sort()).toEqual([...IDS].sort());
  });

  it('사거리는 머리에 닿은 밑층까지 닿는다', () => {
    // 짧으면 내려앉는 건물을 못 치고 깔리기만 하는 무기가 된다
    for (const id of IDS) expect(attackRange(0, WEAPON[id].reach)[1], id).toBeGreaterThan(PLAYER.H);
  });

  it('1막 어디서든 연타만으로는 건물이 떠 있지 못한다 (띄우기 상한)', () => {
    // 타격이 vy를 lift로 올리고 다음 타격까지 CYCLE틱 중력을 받는다 — 주기당 변위가 음수여야 한다
    const g = STACK.ACT1_G[0];
    for (const id of IDS) {
      const disp = (WEAPON[id].lift * CYCLE - (g * CYCLE * (CYCLE + 1)) / 120) / 60;
      expect(disp, id).toBeLessThan(0);
    }
  });
});

/** 졸라맨 발밑에서 bottom 높이에 떠 있는 3층 건물 */
function withStack(s: GameState, bottom: number): void {
  s.stack = makeStack({
    variant: 'building', theme: 'europe',
    floors: Array.from({ length: 3 }, () => makeFloor('hard')),
    y: bottom, vy: 0,
  });
}

/** 한 번 휘둘러 본다 — 스택이 내려오지 않게 매 틱 높이를 붙잡는다 */
function swing(weapon: WeaponId, bottom: number): GameState {
  const s = makeState();
  s.weapon = weapon;
  withStack(s, bottom);
  for (let t = 0; t < 8; t++) {
    if (s.stack && s.combo === 0) { s.stack.y = bottom; s.stack.vy = 0; }
    advance(s, { ...EMPTY_INPUT, attack: t === 0 });
  }
  return s;
}

describe('무기가 실제로 바꾸는 것', () => {
  it('빠루는 철거칼이 못 닿는 높이를 친다', () => {
    const bottom = (WEAPON.sword.reach + WEAPON.crowbar.reach) / 2;
    expect(swing('sword', bottom).combo).toBe(0);
    expect(swing('crowbar', bottom).combo).toBe(1);
  });

  it('오함마는 더 띄우고, 그라인더는 덜 띄운다', () => {
    const lift = (w: WeaponId): number => {
      const s = makeState();
      s.weapon = w;
      withStack(s, 30);
      let top = -Infinity;
      for (let t = 0; t < 8; t++) {
        advance(s, { ...EMPTY_INPUT, attack: t === 0 });
        top = Math.max(top, s.stack!.vy);
      }
      return top;
    };
    expect(lift('hammer')).toBe(WEAPON.hammer.lift);
    expect(lift('sword')).toBe(WEAPON.sword.lift);
    expect(lift('grinder')).toBe(WEAPON.grinder.lift);
  });

  it('필살 게이지는 무기 배율을 탄다', () => {
    for (const id of IDS) {
      const s = swing(id, 30);
      expect(s.wazaGauge, id).toBeCloseTo(gaugePerHit(1) * WEAPON[id].gauge);
    }
  });
});

/** act2run 스택 페이즈 정책(필살 미사용) — 타격 수 산술만 본다 */
function policy(s: GameState): InputFrame {
  const i: InputFrame = { ...EMPTY_INPUT };
  const p = s.player;
  if (p.pose === 'pinned') { i.guard = true; return i; }
  const st = s.stack;
  if (!st) { i.attack = true; return i; }
  const bottomHp = st.floors.length > 0 ? st.floors[0].segs[0].hp : 0;
  const heavy = s.act2Phase === 'cathedral';
  if (p.y > 0) {
    const gap = st.y - (p.y + 48);
    if (heavy && st.vy > 200) i.attack = true;
    else if (heavy && gap >= -12 && s.guardGauge >= 12) i.guard = true;
    else i.attack = true;
  } else {
    if (heavy && bottomHp <= 2 && st.y >= 70 && st.y <= 170 && s.guardGauge >= 25) i.jump = true;
    else if (st.vy < 0 && st.y <= 56 && s.guardGauge >= 25) i.guard = true;
    else i.attack = true;
  }
  return i;
}

const HIT_KINDS = new Set(['hit', 'floorCollapse', 'butterCollapse', 'bossHit']);

function hitsToClear(weapon: WeaponId, phase: 'cathedral' | 'tower', until: 'tower' | 'bolt'): number | null {
  const s = makeState({ seed: 42 });
  s.weapon = weapon;
  enterAct2Phase(s, phase);
  s.guardGauge = 100;
  s.lives = 99;
  let hits = 0;
  for (let t = 0; t < 60 * 300; t++) {
    advance(s, policy(s));
    for (const e of s.events) if (HIT_KINDS.has(e.kind)) hits += 1;
    s.events.length = 0;
    if (s.act2Phase === until) return hits;
    if (s.over) return null;
  }
  return null;
}

describe('무기를 바꿔도 2막 필요 타격 수는 그대로', () => {
  for (const id of IDS) {
    it(`${id}: 대성당 30타 · 마천루 138타`, () => {
      expect(hitsToClear(id, 'cathedral', 'tower')).toBe(30);
      expect(hitsToClear(id, 'tower', 'bolt')).toBe(138);
    }, 60_000);
  }
});

describe('무기 장착·저장', () => {
  it('철거칼은 늘 있고 다른 무기는 사야 한다', () => {
    const none = new Set<string>();
    expect(slotOf('hammer')).toBe('weapon');
    expect(isOwned(none, 'weapon', 'sword')).toBe(true);
    expect(isOwned(none, 'weapon', 'hammer')).toBe(false);
    expect(equip(DEFAULT_LOADOUT, 'weapon', 'hammer', none)).toBe(DEFAULT_LOADOUT);
    expect(equip(DEFAULT_LOADOUT, 'weapon', 'hammer', new Set(['hammer'])).weapon).toBe('hammer');
  });

  it('무기 칸 없는 옛 저장은 철거칼로 읽는다', () => {
    const { weapon: _weapon, ...old } = DEFAULT_LOADOUT;
    expect(validateLoadout(old).weapon).toBe('sword');
    expect(validateLoadout({ ...old, weapon: 'laser' }).weapon).toBe('sword');
  });
});

describe('대검', () => {
  it('모두 맞교환 — 철거칼보다 나은 칸과 못한 칸이 함께 있다(비쌀수록 세지는 칼이 아니다)', () => {
    for (const id of GREATSWORD_IDS) {
      const d = (['reach', 'lift', 'gauge'] as const).map((k) => Math.sign(WEAPON[id][k] - WEAPON.sword[k]));
      expect(d, id).toContain(1);
      expect(d, id).toContain(-1);
    }
  });

  it('먼지 값이 붙어 상점에 오른다', () => {
    for (const id of GREATSWORD_IDS) expect(WEAPON_DUST_COST[id], id).toBeGreaterThan(0);
  });
});
