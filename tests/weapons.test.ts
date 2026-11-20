// 무기 — 철거칼은 기존 수치 그대로, 무기는 사거리·띄우기·필살 게이지만 바꾼다.
// 어느 무기든 2막 필요 타격 수(층 HP 합)는 그대로고, 1막 연타로 건물을 띄워 둘 수 없다.
import { describe, it, expect } from 'vitest';
import { makeState, advance, applyStartKit } from '../src/core/sim';
import { liftOf } from '../src/core/perks';
import { startTraining } from '../src/core/training';
import { enterAct2, enterAct2Phase } from '../src/core/act2';
import { makeFloor, makeStack } from '../src/core/building';
import { attackRange, gaugePerHit, tryGuardBounce, weaponGaugeMul } from '../src/core/combat';
import { EMPTY_INPUT, type GameState, type InputFrame, type PerkId, type WeaponId } from '../src/core/types';
import { PERK, PERK_RUN, PLAYER, STACK, WEAPON } from '../src/config';
import { BLADE_IDS, BODY_IDS, DEFAULT_LOADOUT, equip, GREATSWORD_IDS, isOwned, LETTERS_IDS, MASK_IDS, slotOf, validateLoadout, WAZA_IDS, WEAPON_IDS } from '../src/meta/loadout';
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
      const top = WEAPON[id].lift + (WEAPON[id].comboLift ?? 0); // 크레인은 콤보 100에서 가장 높다
      const disp = (top * CYCLE - (g * CYCLE * (CYCLE + 1)) / 120) / 60;
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
      // 코어 드릴(comboGauge)은 콤보 1만큼 더 곱한다
      expect(s.wazaGauge, id).toBeCloseTo(gaugePerHit(1) * WEAPON[id].gauge * (1 + (WEAPON[id].comboGauge ?? 0) / 100));
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

  it('무기 id는 다른 장착 칸 id와 안 겹친다(owned를 같이 쓴다 · 불변 15)', () => {
    for (const id of WEAPON_IDS) expect(slotOf(id), id).toBe('weapon');
    for (const id of [...BODY_IDS, ...BLADE_IDS, ...LETTERS_IDS, ...MASK_IDS, ...WAZA_IDS]) expect(WEAPON_IDS as readonly string[], id).not.toContain(id);
  });

  it('무기 칸 없는 옛 저장은 철거칼로 읽는다', () => {
    const { weapon: _weapon, ...old } = DEFAULT_LOADOUT;
    expect(validateLoadout(old).weapon).toBe('sword');
    expect(validateLoadout({ ...old, weapon: 'laser' }).weapon).toBe('sword');
    expect(validateLoadout({ ...old, weapon: 'manhole' }).weapon).toBe('sword'); // 11-20 뺀 맨홀 뚜껑
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

// ── 고유 규칙 무기(11-20) — 세 칸 + 고유 규칙 하나(WeaponSpec 선택 칸). core에 무기 id 분기는 없다 ──
const RULED: WeaponId[] = ['shovel', 'pipe', 'drill', 'pickaxe', 'coredrill', 'auger', 'jackhammer', 'diadrill', 'brick', 'rod', 'glass', 'thunder', 'crane', 'brush'];

describe('고유 규칙', () => {
  /** 떨어지는 건물을 땅 · 공중 가드로 받는다 */
  function bounce(weapon: WeaponId, zone: 'ground' | 'air'): GameState {
    const s = makeState();
    s.weapon = weapon;
    s.combo = 7;
    withStack(s, zone === 'ground' ? 40 : PLAYER.H);
    s.stack!.vy = -300;
    expect(tryGuardBounce(s, zone, 0)).toBe(true);
    return s;
  }

  it('삽: 땅 가드로 튕겨도 콤보가 0이 안 되고 keepCombo 몫이 남는다(철거칼은 0)', () => {
    expect(bounce('shovel', 'ground').combo).toBe(Math.floor(7 * WEAPON.shovel.keepCombo!));
    expect(bounce('shovel', 'ground').peakCombo).toBe(7); // 깎이기 전 콤보는 최고 콤보로 남는다
    expect(bounce('sword', 'ground').combo).toBe(0);
  });

  it('벽돌 대검: 가드 튕김 속도가 땅 · 공중 모두 guardLift배', () => {
    for (const zone of ['ground', 'air'] as const) {
      expect(bounce('brick', zone).stack!.vy, zone).toBeCloseTo(bounce('sword', zone).stack!.vy * WEAPON.brick.guardLift!);
    }
  });

  it('철근 대검: 가드로 튕길 때마다 게이지 +guardGauge(땅 · 공중, 배율 안 곱함)', () => {
    for (const zone of ['ground', 'air'] as const) {
      expect(bounce('rod', zone).wazaGauge, zone).toBe(WEAPON.rod.guardGauge);
      expect(bounce('sword', zone).wazaGauge, zone).toBe(0);
    }
    const s = bounce('rod', 'ground');
    s.wazaGauge = 98;
    s.stack!.vy = -300; s.stack!.y = 40;
    tryGuardBounce(s, 'ground', 0);
    expect(s.wazaGauge).toBe(100); // 상한
  });

  it('곡괭이: 층이 무너질 때마다 게이지 +2(무기 배율 안 곱함)', () => {
    const cut = (w: WeaponId): number => {
      const s = makeState();
      s.weapon = w;
      s.stack = makeStack({ variant: 'building', theme: 'europe', floors: [makeFloor('weak'), makeFloor('weak')], y: 30, vy: 0 });
      for (let t = 0; t < 8; t++) advance(s, { ...EMPTY_INPUT, attack: t === 0 });
      return s.wazaGauge;
    };
    expect(cut('pickaxe')).toBeCloseTo(gaugePerHit(1) * WEAPON.pickaxe.gauge + 2);
    expect(cut('shovel')).toBeCloseTo(gaugePerHit(1) * WEAPON.shovel.gauge); // 같은 배율 0.8, 고유 규칙 없음
    // 층이 안 무너지는 타격엔 더하지 않는다
    expect(swing('pickaxe', 30).wazaGauge).toBeCloseTo(gaugePerHit(1) * WEAPON.pickaxe.gauge);
  });

  it('코어 드릴: 콤보 100까지 게이지 배율이 곧게 오르고 그 위는 같다', () => {
    const mul = (combo: number): number => { const s = makeState(); s.weapon = 'coredrill'; s.combo = combo; return weaponGaugeMul(s); };
    const g = WEAPON.coredrill.gauge;
    const cg = WEAPON.coredrill.comboGauge!;
    expect(mul(0)).toBeCloseTo(g);
    expect(mul(50)).toBeCloseTo(g * (1 + cg / 2));
    expect(mul(100)).toBeCloseTo(g * (1 + cg));
    expect(mul(400)).toBeCloseTo(g * (1 + cg));
    const sw = makeState(); sw.combo = 100;
    expect(weaponGaugeMul(sw)).toBe(1); // 철거칼은 콤보와 상관없다
  });

  it('굴착 드릴: 한 판에 pinSave번 깔려도 목숨을 안 잃고 빠져나온다(그다음은 깔린다)', () => {
    const crush = (s: GameState): { lost: number; saved: boolean } => {
      const lives = s.lives;
      s.player.invulnTicks = 0;
      s.stack = makeStack({ variant: 'building', theme: 'europe', floors: [makeFloor('hard'), makeFloor('hard')], y: 100 });
      s.stack.vy = -600;
      let saved = false;
      for (let t = 0; t < 300 && s.player.pose !== 'pinned' && !saved; t++) {
        advance(s, EMPTY_INPUT);
        saved = s.events.some((e) => e.kind === 'pinSave');
        const hat = s.events.some((e) => e.kind === 'hatBreak');
        s.events.length = 0;
        if (hat) break;
      }
      return { lost: lives - s.lives, saved };
    };
    const s = makeState();
    s.weapon = 'auger';
    s.lives = 5;
    s.combo = 9;
    const first = crush(s);
    expect(first).toEqual({ lost: 0, saved: true });
    expect(s.player.pose).not.toBe('pinned');
    expect(s.combo).toBe(9); // 안전모처럼 콤보도 지킨다
    expect(s.pinSaved).toBe(WEAPON.auger.pinSave);
    const second = crush(s);
    expect(second).toEqual({ lost: 1, saved: false });
    expect(s.player.pose).toBe('pinned');
    // 안전모가 있으면 안전모가 먼저 받고 굴착 드릴 몫은 남는다
    const h = makeState();
    h.weapon = 'auger'; h.hat = true;
    crush(h);
    expect(h.hat).toBe(false);
    expect(h.pinSaved).toBe(0);
    // 철거칼은 바로 깔린다
    const w = makeState();
    expect(crush(w)).toEqual({ lost: 1, saved: false });
  });

  it('굴착 드릴: 튜토리얼에선 구제하지 않는다(「깔렸을 때」 걸음은 깔려야 배운다)', () => {
    const s = makeState({ seed: 7, mode: 'training' });
    s.weapon = 'auger';
    s.training = { lesson: 0, rep: 0, spawned: true, wait: 0, hold: 0, beat: 99, need: null, ok: false, launch: false };
    s.stack = makeStack({ variant: 'building', theme: 'europe', floors: [makeFloor('hard'), makeFloor('hard')], y: 100 });
    s.stack.vy = -600;
    let saved = false;
    for (let t = 0; t < 300 && s.player.pose !== 'pinned'; t++) {
      advance(s, EMPTY_INPUT);
      if (s.events.some((e) => e.kind === 'pinSave')) saved = true;
      s.events.length = 0;
    }
    expect(saved).toBe(false);
    expect(s.pinSaved).toBe(0);
  });

  it('착암기: 한 번 누르고 쥐고만 있어도 계속 벤다(철거칼은 1타)', () => {
    const N = 60;
    const hits = (w: WeaponId): number => {
      const s = makeState();
      s.weapon = w;
      s.stack = makeStack({ variant: 'building', theme: 'europe', floors: Array.from({ length: 10 }, () => makeFloor('hard')), y: 30, vy: 0 });
      let n = 0;
      for (let t = 0; t < N; t++) {
        s.stack!.y = 30; s.stack!.vy = 0;
        advance(s, { ...EMPTY_INPUT, attack: t === 0, attackHeld: true });
        for (const e of s.events) if (e.kind === 'hit' || e.kind === 'floorCollapse') n += 1;
        s.events.length = 0;
      }
      return n;
    };
    expect(hits('sword')).toBe(1);
    // 첫 누름 1타 + holdRepeat틱마다 1타. 타격 멈춤(hitstop) 틱은 세지 않아 이론값보다 적다
    expect(hits('jackhammer')).toBeGreaterThanOrEqual(5);
    expect(hits('jackhammer')).toBeLessThanOrEqual(1 + Math.floor(N / WEAPON.jackhammer.holdRepeat!));
  });

  it('비계 파이프: 땅에서 못 닿는 높이를 공중에서는 친다', () => {
    const gap = WEAPON.pipe.reach + WEAPON.pipe.airReach! / 2; // 발에서 이만큼 위의 밑면
    const hit = (w: WeaponId, air: boolean): number => {
      const s = makeState();
      s.weapon = w;
      if (air) { s.player.y = 200; s.player.vy = 0; s.player.pose = 'jump'; }
      withStack(s, s.player.y + gap);
      for (let t = 0; t < 6; t++) {
        if (s.stack && s.combo === 0) { s.stack.y = s.player.y + gap; s.stack.vy = 0; }
        advance(s, { ...EMPTY_INPUT, attack: t === 0 });
      }
      return s.combo;
    };
    expect(hit('pipe', false)).toBe(0);
    expect(hit('pipe', true)).toBe(1);
    expect(hit('sword', true)).toBe(0); // 철거칼(68)은 공중이어도 그대로
  });

  it('번개 대검: 필살을 쓰면 게이지가 0이 아니라 gaugeKeep에서 다시 찬다(필살 종류 무관)', () => {
    for (const waza of WAZA_IDS) {
      for (const w of ['thunder', 'sword'] as const) {
        const s = makeState();
        s.weapon = w; s.waza = waza;
        withStack(s, 40);
        s.wazaGauge = 100;
        advance(s, { ...EMPTY_INPUT, special: true });
        expect(s.player.pose, `${w} ${waza}`).toBe('special');
        expect(s.wazaGauge, `${w} ${waza}`).toBe(w === 'thunder' ? WEAPON.thunder.gaugeKeep : 0);
      }
    }
  });

  it('크레인 대검: 콤보 100까지 띄우기가 곧게 오르고, 퍽을 더해도 LIFT_MAX를 안 넘는다', () => {
    const at = (combo: number, perkLift = 0): number => {
      const s = makeState(); s.weapon = 'crane'; s.combo = combo;
      if (perkLift) s.perk = { picked: Array.from({ length: perkLift }, () => 'bare' as PerkId), seen: [], offer: null };
      return liftOf(s);
    };
    const { lift, comboLift } = WEAPON.crane;
    expect(at(0)).toBe(lift);
    expect(at(50)).toBeCloseTo(lift + comboLift! / 2);
    expect(at(100)).toBeCloseTo(lift + comboLift!);
    expect(at(500)).toBeCloseTo(lift + comboLift!);
    expect(at(100, 5)).toBe(PERK_RUN.LIFT_MAX);
    const sw = makeState(); sw.combo = 100;
    expect(liftOf(sw)).toBe(WEAPON.sword.lift); // 다른 무기는 콤보와 상관없다
  });

  it('먹 대검: 판 시작(applyStartKit) 한 번만 게이지 startGauge · 2막 진입 · 이어 하기 · 튜토리얼은 0', () => {
    const run = (w: WeaponId, wazas = 0): GameState => { const s = makeState(); s.weapon = w; applyStartKit(s, 0, wazas); return s; };
    expect(run('brush').wazaGauge).toBe(WEAPON.brush.startGauge);
    expect(run('sword').wazaGauge).toBe(0);
    expect(run('brush', 1).wazaGauge).toBe(100); // 시작 장비 필살이 더 크면 그것
    const a2 = run('brush'); enterAct2(a2);
    expect(a2.wazaGauge).toBe(0);
    const tr = makeState({ seed: 7, mode: 'training' }); tr.weapon = 'brush'; startTraining(tr);
    expect(tr.wazaGauge).toBe(0);
  });

  it('다이아 드릴: 쥐고 있으면 처음부터 holdRepeat 간격(전동 드릴의 끝 간격) · 공격 한 주기보다 길다', () => {
    const s = makeState({ seed: 3 }); s.weapon = 'diadrill'; s.lives = 99;
    const g = gaps(swingTicks(s, held(60, { attack: true })));
    expect(g.slice(0, 6)).toEqual(Array(6).fill(WEAPON.diadrill.holdRepeat));
    expect(WEAPON.diadrill.holdRepeat).toBe(WEAPON.drill.holdMin);
    expect(WEAPON.diadrill.holdRepeat!).toBeGreaterThanOrEqual(CYCLE);
  });

  it('맞교환: 고유 규칙 무기는 철거칼보다 못한 칸이 하나는 있다', () => {
    for (const id of RULED) {
      const d = (['reach', 'lift', 'gauge'] as const).map((k) => Math.sign(WEAPON[id][k] - WEAPON.sword[k]));
      expect(d, id).toContain(-1);
    }
  });
});

/** 휘두름이 시작된 틱 목록(자세가 attack으로 막 바뀐 틱) */
function swingTicks(s: GameState, frames: InputFrame[]): number[] {
  const at: number[] = [];
  frames.forEach((f, t) => {
    const before = s.player.pose === 'attack' ? s.player.poseTick : -1;
    advance(s, f);
    if (s.player.pose === 'attack' && (before < 0 || s.player.poseTick <= before)) at.push(t);
    s.events.length = 0;
  });
  return at;
}
const swings = (s: GameState, frames: InputFrame[]): number => swingTicks(s, frames).length;
const held = (n: number, first?: Partial<InputFrame>): InputFrame[] =>
  Array.from({ length: n }, (_, t) => ({ ...EMPTY_INPUT, attackHeld: true, ...(t === 0 ? first : {}) }));
const gaps = (ticks: number[]): number[] => ticks.slice(1).map((t, i) => t - ticks[i]);

describe('전동 드릴: 누를수록 빨라진다', () => {
  const drill = (): GameState => { const s = makeState({ seed: 3 }); s.weapon = 'drill'; s.lives = 99; return s; };
  const { holdRepeat: R, holdMin: M } = WEAPON.drill;

  it('간격이 holdRepeat에서 1틱씩 줄어 holdMin에서 멈춘다', () => {
    const want = Array.from({ length: 8 }, (_, k) => Math.max(M!, R! - k));
    expect(gaps(swingTicks(drill(), held(120, { attack: true }))).slice(0, 8)).toEqual(want);
  });

  it('떼었다 다시 누르면 처음 간격으로', () => {
    const s = drill();
    swingTicks(s, held(60, { attack: true }));
    swingTicks(s, Array.from({ length: 12 }, () => ({ ...EMPTY_INPUT }))); // 손을 떼고 휘두름이 끝날 때까지
    expect(gaps(swingTicks(s, held(40, { attack: true })))[0]).toBe(R);
  });
});

// 누르고 있기(착암기 · 전동 드릴)가 다른 상태와 엉키지 않는다 — 셈은 이번 누름의 공격 엣지가 연다
for (const W of ['jackhammer', 'drill', 'diadrill'] as const) {
  describe(`${W} 누르고 있기 · 엉킴`, () => {
    const mk = (): GameState => { const s = makeState({ seed: 3 }); s.weapon = W; s.lives = 99; return s; };

    if (W === 'jackhammer') {
      it('누르고 있으면 holdRepeat틱마다 한 번(빈 판: 60틱에 첫 누름 + 7번)', () => {
        expect(swings(mk(), held(60, { attack: true }))).toBe(1 + Math.floor(59 / WEAPON.jackhammer.holdRepeat!));
      });
    }

    it('새 판이 열릴 때 키를 쥐고 있었어도 새로 누르기 전엔 베지 않는다', () => {
      expect(swings(mk(), held(120))).toBe(0);
    });

    it('탭 연타는 그대로 빠르다(쥔 채 7틱마다 탭 = 탭 수만큼)', () => {
      const f = Array.from({ length: 70 }, (_, t) => ({ ...EMPTY_INPUT, attackHeld: true, attack: t % 7 === 0 }));
      expect(swings(mk(), f)).toBe(10);
    });

    it('깔리면 셈이 닫힌다 — 풀린 뒤 쥐고만 있으면 안 벤다', () => {
      const s = mk();
      swings(s, held(4, { attack: true }));
      s.player.pose = 'pinned';
      advance(s, { ...EMPTY_INPUT, attackHeld: true, attack: true }); // 깔린 채 공격으로 빠져나오려 누른다
      s.player.pose = 'idle'; s.player.poseTick = 0; s.player.bufAttack = 0;
      expect(swings(s, held(40))).toBe(0);
    });

    it('죽으면 셈이 닫힌다', () => {
      const s = mk();
      swings(s, held(4, { attack: true }));
      s.player.pose = 'dead';
      advance(s, { ...EMPTY_INPUT, attackHeld: true });
      expect(s.player.holdTick).toBe(0);
    });

    it('튜토리얼 판 세우기가 다른 키로 풀려도 쥔 공격이 터지지 않는다', () => {
      const s = makeState({ seed: 7, mode: 'training' });
      s.weapon = W;
      s.training = { lesson: 0, rep: 0, spawned: true, wait: 0, hold: -1, beat: 0, need: 'guard', ok: false, launch: false };
      swings(s, held(20, { attack: true })); // 선 동안 공격을 눌러 쥔다
      expect(s.training.hold).not.toBe(0);
      advance(s, { ...EMPTY_INPUT, attackHeld: true, guard: true }); // 가드로 푼다
      s.events.length = 0;
      expect(swings(s, held(40))).toBe(0);
    });

    it('현장 조건 쪽지를 공격으로 고르고 쥐고 있어도 저절로 베지 않는다', () => {
      const s = mk();
      swings(s, held(4, { attack: true }));
      const [a, b] = Object.keys(PERK) as PerkId[];
      s.perk = { picked: [], seen: [a, b], offer: { a, b, t: 0, calm: 99 } };
      advance(s, { ...EMPTY_INPUT, attack: true, attackHeld: true });
      expect(s.perk.offer).toBeNull();
      expect(swings(s, held(40))).toBe(0);
    });
  });
}

it('철거칼은 쥐고 있어도 첫 누름 한 번뿐', () => {
  const s = makeState({ seed: 3 });
  expect(swings(s, held(60, { attack: true }))).toBe(1);
});
