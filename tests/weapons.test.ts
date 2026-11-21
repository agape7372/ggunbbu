// 무기 — 철거칼은 기존 수치 그대로, 무기는 사거리·띄우기·필살 게이지만 바꾼다.
// 어느 무기든 2막 필요 타격 수(층 HP 합)는 그대로고, 1막 연타로 건물을 띄워 둘 수 없다.
import { describe, it, expect } from 'vitest';
import { makeState, advance, applyStartKit } from '../src/core/sim';
import { comboReachK, liftOf, reachOf } from '../src/core/perks';
import { continueFromCheckpoint, enterAct2, enterAct2Phase } from '../src/core/act2';
import { makeFloor, makeStack, stackPhysics } from '../src/core/building';
import { addGauge, attackRange, breakCombo, destroyStack, gaugePerHit, tryGuardBounce, weaponGaugeMul } from '../src/core/combat';
import { EMPTY_INPUT, type GameState, type InputFrame, type PerkId, type WeaponId } from '../src/core/types';
import { GUARD_GAUGE, MAT_HP, PERK, PERK_RUN, PLAYER, SCORE, STACK, WEAPON } from '../src/config';
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
    // ⚠ 이것만으로는 「못 버틴다」가 아니다(다이아 드릴 −1.2px면 깔리기 전 35~45타 > 건물 HP 6.5). 쥐고 있기는 아래 「과열」이 봇으로 잰다
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
const RULED: WeaponId[] = ['shovel', 'pipe', 'drill', 'pickaxe', 'coredrill', 'auger', 'jackhammer', 'diadrill',
  'brick', 'saw', 'hazard', 'rod', 'beam', 'flame', 'frost', 'thunder', 'tide', 'icicle', 'onyx', 'volt', 'crane', 'phoenix', 'shade', 'brush', 'gold'];

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

  it('굴착 드릴: 구제를 하나 들고 시작 · 쓰면 건물 pinSaveEvery채를 부술 때 다시 찬다 · 쌓이지 않는다', () => {
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
    /** 약한 1층 건물 하나를 베어 완파한다 · pinReady가 났는지 */
    const raze = (s: GameState): boolean => {
      s.player.pose = 'idle'; s.player.poseTick = 0; s.player.invulnTicks = 99;
      s.stack = makeStack({ variant: 'building', theme: 'europe', floors: [makeFloor('weak')], y: 30, vy: 0 });
      let ready = false;
      for (let t = 0; t < 12 && s.stack; t++) {
        advance(s, { ...EMPTY_INPUT, attack: t === 0 });
        if (s.events.some((e) => e.kind === 'pinReady')) ready = true;
        s.events.length = 0;
      }
      expect(s.stack).toBeNull();
      s.stackSpawnCd = 999;
      s.hat = false; // 채를 많이 부수면 콤보 50 안전모가 생긴다. 구제 셈만 보려고 벗긴다
      return ready;
    };
    const N = WEAPON.auger.pinSaveEvery!;
    const s = makeState();
    s.weapon = 'auger'; s.lives = 9; s.combo = 9;
    expect(crush(s)).toEqual({ lost: 0, saved: true });
    expect(s.player.pose).not.toBe('pinned');
    expect(s.combo).toBe(9); // 안전모처럼 콤보도 지킨다
    expect(crush(s)).toEqual({ lost: 1, saved: false }); // 다 썼다
    s.player.pose = 'idle';
    for (let i = 1; i < N; i++) expect(raze(s), `채 ${i}`).toBe(false);
    expect(raze(s)).toBe(true); // N채째에 다시 찬다
    expect(s.pinSaved).toBe(0);
    for (let i = 0; i < N; i++) expect(raze(s)).toBe(false); // 찬 채로는 세지 않는다(쌓이지 않는다)
    expect(s.pinDowns).toBe(0);
    expect(crush(s)).toEqual({ lost: 0, saved: true });
    // 2막 진입 · 이어 하기는 남은 구제 · 셈을 그대로 잇는다(공짜로 채우지 않는다)
    for (let i = 0; i < 3; i++) raze(s);
    const before = [s.pinSaved, s.pinDowns];
    enterAct2(s);
    expect([s.pinSaved, s.pinDowns]).toEqual(before);
    s.checkpoint = 40;
    continueFromCheckpoint(s);
    expect([s.pinSaved, s.pinDowns]).toEqual(before);
    // 안전모가 있으면 안전모가 먼저 받고 굴착 드릴 몫은 남는다
    const h = makeState();
    h.weapon = 'auger'; h.hat = true;
    crush(h);
    expect(h.hat).toBe(false);
    expect(h.pinSaved).toBe(0);
    // 철거칼은 바로 깔린다
    expect(crush(makeState())).toEqual({ lost: 1, saved: false });
    // 버터바(보너스)는 건물이 아니다 — 완파 점수(pts)가 없어 다시 채우는 셈에 안 들어간다
    const b = makeState();
    b.stack = makeStack({ variant: 'butterbar', theme: 'europe', floors: [makeFloor('butter')], y: 30, vy: 0 });
    destroyStack(b);
    expect(b.events.find((e) => e.kind === 'stackDestroy')?.pts).toBeUndefined();
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

// ── 과열(11-21) — 쥐고만 있으면 사람 손이 못 내는 틀 완벽 박자(7~8틱)가 공짜라 1막 저속 판을 가드 없이 넘었다.
// 「연타만으로는 못 버틴다」의 실제 조건은 주기당 변위가 아니라 「깔리기 전 벨 수 < 건물 HP」다. 그래서 봇으로 직접 잰다
const HOLD_IDS = IDS.filter((id) => WEAPON[id].holdRepeat);

/** 가드 · 점프 없이 바닥에서 쥐고만 있다. 누름 셈이 닫히면(판 처음 · 멈춤 뒤 · 쪽지) 다시 누르고, 깔리면 10틱 뒤부터 눌러 빠진다 */
function holdOnly(s: GameState, ticks: number): void {
  let pinAt = -1;
  for (let t = 0; t < ticks && !s.over; t++) {
    const p = s.player;
    let f: InputFrame;
    if (p.pose === 'pinned') {
      if (pinAt < 0) pinAt = s.tick;
      const k = s.tick - pinAt - 10;
      f = { ...EMPTY_INPUT, attackHeld: true, attack: k >= 0 && k % 10 === 0 };
    } else {
      pinAt = -1;
      f = { ...EMPTY_INPUT, attackHeld: true, attack: p.holdTick === 0 || !!s.perk?.offer };
    }
    advance(s, f);
    s.events.length = 0;
  }
}
const arcadeRun = (w: WeaponId, seed: number): GameState => {
  const s = makeState({ seed });
  s.weapon = w;
  applyStartKit(s, 0, 0);
  return s;
};

describe('과열 — 바닥에서 쥐고만 있으면 버티지 못한다', () => {
  it('누르고 있기 무기는 모두 과열이 있다', () => {
    expect([...HOLD_IDS].sort()).toEqual(['diadrill', 'drill', 'jackhammer']);
    for (const id of HOLD_IDS) expect(WEAPON[id].heat, id).toBeDefined();
  });

  it('가드 없이 쥐고만 있으면 1분 안에 목숨 셋을 다 잃는다(아케이드 · 고정 시드)', () => {
    for (const w of HOLD_IDS) for (const seed of [1, 2, 3]) {
      const s = arcadeRun(w, seed);
      holdOnly(s, 3600);
      expect(s.over, `${w} 시드 ${seed}`).toBe('gameover');
    }
  });

  it('과열을 빼면 같은 손이 1분 동안 목숨을 하나도 안 잃는다 — 위 시험이 그 구멍을 잡는다', () => {
    for (const w of HOLD_IDS) {
      const was = WEAPON[w].heat;
      delete WEAPON[w].heat;
      try {
        const s = arcadeRun(w, 1);
        const lives = s.lives;
        holdOnly(s, 3600);
        expect(s.lives, w).toBe(lives);
      } finally {
        WEAPON[w].heat = was;
      }
    }
  });

  it('첫 누름은 열이 없다 · 반복 max번째에 멈춘다 · 멈춘 동안 탭은 안 받고 가드는 된다 · 끝나면 열 0', () => {
    const w = 'diadrill';
    const h = WEAPON[w].heat!;
    const s = makeState({ seed: 3 }); s.weapon = w; s.lives = 99;
    const kinds: string[] = [];
    const step = (f: InputFrame): void => { advance(s, f); for (const e of s.events) kinds.push(e.kind); s.events.length = 0; };
    step({ ...EMPTY_INPUT, attack: true, attackHeld: true });
    expect(s.player.heat).toBe(0);
    let n = 1;
    while (s.player.stall === 0 && n < 99) {
      const before = s.player.pose === 'attack' ? s.player.poseTick : -1;
      step({ ...EMPTY_INPUT, attackHeld: true });
      if (s.player.pose === 'attack' && (before < 0 || s.player.poseTick <= before)) n += 1;
    }
    expect(n).toBe(1 + h.max); // 첫 누름 + 반복 max번(열이 차는 마지막 반복도 나간다)
    expect(kinds.filter((k) => k === 'overheat')).toHaveLength(1);
    for (let i = 0; i < 12; i++) step({ ...EMPTY_INPUT, attack: true, attackHeld: true }); // 멈춘 동안 탭 — 마지막 반복이 끝나면 다시 안 선다
    expect(s.player.pose).toBe('idle');
    step({ ...EMPTY_INPUT, guard: true });
    expect(s.player.pose).toBe('guardG');
    while (s.player.stall > 0) step(EMPTY_INPUT);
    expect(s.player.heat).toBe(0);
    expect(kinds.filter((k) => k === 'cooled')).toHaveLength(1);
    step(EMPTY_INPUT);
    step({ ...EMPTY_INPUT, attack: true });
    expect(s.player.pose).toBe('attack'); // 다시 벤다
  });

  it('가드 중에 공격을 쥐고 있으면 안 베었으니 열도 안 오른다', () => {
    const s = makeState({ seed: 3 }); s.weapon = 'diadrill'; s.lives = 99;
    const kinds: string[] = [];
    const step = (f: InputFrame): void => { advance(s, f); for (const e of s.events) kinds.push(e.kind); s.events.length = 0; };
    for (let i = 0; i < 6; i++) step({ ...EMPTY_INPUT, guard: true });
    expect(s.player.pose).toBe('guardG');
    for (let i = 0; i < 150; i++) {
      step({ ...EMPTY_INPUT, guard: true, attack: i === 0, attackHeld: true });
      expect(s.player.pose).not.toBe('attack');
    }
    expect(s.player.heat).toBe(0);
    expect(kinds).not.toContain('overheat');
  });

  it('떼고 있으면 cool틱마다 열 1씩 식는다 · 탭은 달아오르지 않는다', () => {
    const w = 'jackhammer';
    const h = WEAPON[w].heat!;
    const s = makeState({ seed: 3 }); s.weapon = w; s.lives = 99;
    swingTicks(s, held(3 * WEAPON[w].holdRepeat! + 2, { attack: true })); // 첫 누름 + 반복 셋
    expect(s.player.heat).toBe(3 * h.cool);
    swingTicks(s, Array.from({ length: h.cool }, () => EMPTY_INPUT));
    expect(s.player.heat).toBe(2 * h.cool);
    const t = makeState({ seed: 3 }); t.weapon = w; t.lives = 99;
    swingTicks(t, Array.from({ length: 140 }, (_, i) => ({ ...EMPTY_INPUT, attack: i % 7 === 0, attackHeld: i % 7 < 2 })));
    expect(t.player.heat).toBe(0);
    expect(t.player.stall).toBe(0);
  });
});

// ── 대검 규칙(11-20) — 무쇠 · 유리 말고 대검마다 하나씩 ──
describe('대검 규칙', () => {
  /** 단단한 건물에 깔린다(안전모 없음). 깔리거나 300틱이 지나면 멈춘다 */
  function crush(s: GameState): void {
    s.player.invulnTicks = 0;
    s.stack = makeStack({ variant: 'building', theme: 'europe', floors: [makeFloor('hard'), makeFloor('hard')], y: 100 });
    s.stack.vy = -600;
    for (let t = 0; t < 300 && s.player.pose !== 'pinned'; t++) { advance(s, EMPTY_INPUT); s.events.length = 0; }
  }
  /** 약한 층 하나를 무너뜨린다 */
  function cutFloor(w: WeaponId, combo = 0): GameState {
    const s = makeState();
    s.weapon = w; s.combo = combo;
    s.stack = makeStack({ variant: 'building', theme: 'europe', floors: [makeFloor('weak'), makeFloor('weak')], y: 30, vy: 0 });
    for (let t = 0; t < 8; t++) advance(s, { ...EMPTY_INPUT, attack: t === 0 });
    return s;
  }
  /** 필살 한 번(대상 건물을 깔고 게이지를 쓴다) · 끝날 때까지 돈다 */
  function special(s: GameState): void {
    withStack(s, 40);
    advance(s, { ...EMPTY_INPUT, special: true });
    expect(s.player.pose).toBe('special');
    for (let t = 0; t < 400 && (s.player.pose === 'special' || s.wazaRun); t++) { advance(s, EMPTY_INPUT); s.events.length = 0; }
  }

  it('톱날: 층을 무너뜨린 타격은 콤보가 1 + collapseCombo 오른다(철거칼은 1)', () => {
    expect(cutFloor('saw').combo).toBe(1 + WEAPON.saw.collapseCombo!);
    expect(cutFloor('sword').combo).toBe(1);
    expect(swing('saw', 30).combo).toBe(1); // 안 무너지는 타격은 그대로
  });

  it('공사중: 깔려서 목숨을 잃고 판이 이어질 때만 필살 게이지 +pinGauge(가득 · gaugeFull)', () => {
    const pin = (w: WeaponId, set: (s: GameState) => void = () => {}): GameState => {
      const s = makeState(); s.weapon = w; s.lives = 5; s.wazaGauge = 10;
      set(s);
      crush(s);
      return s;
    };
    const full = pin('hazard', (s) => { s.events.length = 0; });
    expect(full.player.pose).toBe('pinned');
    expect(full.wazaGauge).toBe(Math.min(100, 10 + WEAPON.hazard.pinGauge!));
    expect(pin('sword').wazaGauge).toBe(10);
    // 안전모가 막은 깔림 · 마지막 목숨 깔림(게임오버) · 튜토리얼은 채우지 않는다
    const hat = makeState(); hat.weapon = 'hazard'; hat.lives = 5; hat.wazaGauge = 10; hat.hat = true;
    hat.stack = makeStack({ variant: 'building', theme: 'europe', floors: [makeFloor('hard'), makeFloor('hard')], y: 100 }); hat.stack.vy = -600;
    for (let t = 0; t < 300 && hat.hat; t++) advance(hat, EMPTY_INPUT);
    expect(hat.hat).toBe(false);
    expect(hat.lives).toBe(5);
    expect(hat.wazaGauge).toBe(10);
    const last = pin('hazard', (s) => { s.lives = 1; });
    expect(last.over).toBe('gameover');
    expect(last.wazaGauge).toBe(10);
    // 튜토리얼은 training.test 「깔렸을 때」에서 본다
    // 2막도 같다(목숨을 잃고 이어지면 채운다)
    const a2 = makeState(); a2.weapon = 'hazard'; a2.lives = 5; enterAct2(a2);
    crush(a2);
    expect(a2.lives).toBe(4);
    expect(a2.wazaGauge).toBe(100);
    // 굴착 드릴식 구제는 목숨을 안 잃으니 채우지 않는다(같은 onPlayerCrushed 앞쪽에서 돌아간다)
    const au = makeState(); au.weapon = 'auger'; au.wazaGauge = 10; crush(au);
    expect(au.wazaGauge).toBe(10);
    // 먹 대검 덤 셈과 무관: 스스로 채운 게이지로 남는다
    expect(full.wazaFree).toBe(false);
  });

  it('공사중: 깔려서 가득 찬 게이지는 gaugeFull을 낸다(필살 버튼이 켜진다)', () => {
    const s = makeState(); s.weapon = 'hazard'; s.lives = 5;
    s.stack = makeStack({ variant: 'building', theme: 'europe', floors: [makeFloor('hard'), makeFloor('hard')], y: 100 }); s.stack.vy = -600;
    let full = false;
    for (let t = 0; t < 300 && s.player.pose !== 'pinned'; t++) { advance(s, EMPTY_INPUT); if (s.events.some((e) => e.kind === 'gaugeFull')) full = true; s.events.length = 0; }
    expect(full).toBe(true);
  });

  it('철골: 가드를 쥐고 있는 동안 게이지가 guardDrain배로 닳는다', () => {
    const held = (w: WeaponId): number => {
      const s = makeState(); s.weapon = w;
      for (let t = 0; t < 60; t++) advance(s, { ...EMPTY_INPUT, guard: true });
      return GUARD_GAUGE.MAX - s.guardGauge;
    };
    expect(held('beam')).toBeCloseTo(held('sword') * WEAPON.beam.guardDrain!, 0);
    expect(held('beam')).toBeGreaterThan(0);
  });

  it('화염: 목숨이 하나면 게이지 배율 × lastLifeGauge', () => {
    const mul = (w: WeaponId, lives: number): number => { const s = makeState(); s.weapon = w; s.lives = lives; return weaponGaugeMul(s); };
    expect(mul('flame', 1)).toBeCloseTo(mul('flame', 2) * WEAPON.flame.lastLifeGauge!);
    expect(mul('sword', 1)).toBe(1);
  });

  it('서리: 1막 · 토코톤만 낙하 중력 · 종단 속도 × fallMul(지시서 · 2막 · 튜토리얼은 그대로)', () => {
    const phys = (w: WeaponId, mode: GameState['mode']): { g: number; vterm: number } => { const s = makeState({ mode }); s.weapon = w; return stackPhysics(s); };
    for (const mode of ['act1', 'tokoton'] as const) {
      expect(phys('frost', mode).g, mode).toBeCloseTo(phys('sword', mode).g * WEAPON.frost.fallMul!);
      expect(phys('frost', mode).vterm, mode).toBeCloseTo(phys('sword', mode).vterm * WEAPON.frost.fallMul!);
    }
    expect(phys('frost', 'training')).toEqual(phys('sword', 'training'));
    const a2 = (w: WeaponId) => { const s = makeState(); s.weapon = w; enterAct2(s); return stackPhysics(s); };
    expect(a2('frost')).toEqual(a2('sword'));
  });

  it('흑철: 깔려도 콤보가 pinCombo 몫 남는다(철거칼은 0)', () => {
    const after = (w: WeaponId): GameState => { const s = makeState(); s.weapon = w; s.lives = 5; s.combo = 9; crush(s); return s; };
    const o = after('onyx');
    expect(o.player.pose).toBe('pinned');
    expect(o.lives).toBe(4); // 목숨은 그대로 잃는다
    expect(o.combo).toBe(Math.floor(9 * WEAPON.onyx.pinCombo!));
    expect(o.peakCombo).toBe(9);
    expect(after('sword').combo).toBe(0);
  });

  it('황금: 완파 점수 × destroyMul · 자막 숫자(이벤트 pts)도 같다', () => {
    const raze = (w: WeaponId): GameState => { const s = makeState(); s.weapon = w; withStack(s, 40); destroyStack(s); return s; };
    const g = raze('gold');
    expect(g.score).toBe(Math.round(SCORE.DESTROY_BONUS * WEAPON.gold.destroyMul!));
    expect(g.events.find((e) => e.kind === 'stackDestroy')?.pts).toBe(g.score);
    expect(raze('sword').score).toBe(SCORE.DESTROY_BONUS);
  });

  it('먹: 스스로 채운 필살은 바로 한 번 더 · 그 덤은 다시 안 찬다(무한 반복 없음)', () => {
    const s = makeState(); s.weapon = 'brush'; s.lives = 99;
    addGauge(s, 100); // 스스로 채웠다
    special(s);
    expect(s.wazaGauge).toBe(100); // 덤
    special(s);
    expect(s.wazaGauge).toBe(0); // 덤으로 쓴 것은 다시 안 채운다
    addGauge(s, 100);
    special(s);
    expect(s.wazaGauge).toBe(100); // 다시 스스로 채운 것부터 또 한 번
    const sw = makeState(); addGauge(sw, 100); special(sw);
    expect(sw.wazaGauge).toBe(0);
  });

  it('먹: 시작 장비 필살 · 충전(wazaBank)에는 덤이 안 붙고 충전 수도 안 는다', () => {
    const s = makeState(); s.weapon = 'brush'; s.lives = 99;
    applyStartKit(s, 0, 2); // 게이지 가득 + 충전 1
    special(s);
    expect(s.wazaBank).toBe(0); // 충전 하나가 게이지를 채웠다
    expect(s.wazaGauge).toBe(100);
    special(s);
    expect(s.wazaGauge).toBe(0);
    expect(s.wazaBank).toBe(0);
  });

  it('먹: 덤이 남은 채 2막에 들어가거나 이어 하면 덤은 사라진다', () => {
    const s = makeState(); s.weapon = 'brush'; s.lives = 99;
    addGauge(s, 100); special(s);
    expect(s.wazaGauge).toBe(100);
    enterAct2(s);
    expect(s.wazaGauge).toBe(0);
    expect(s.wazaBank).toBe(0);
    // 2막에서 스스로 채운 첫 필살은 다시 덤을 받는다
    addGauge(s, 100);
    expect(s.wazaFree).toBe(false);
  });
});

describe('원소 대검 다섯(11-21)', () => {
  /** 층 재질 mats인 건물을 발밑 30에 붙잡아 두고 at 틱마다 한 번씩 벤다 */
  function chop(w: WeaponId, mats: Parameters<typeof makeFloor>[0][], at: number[], mode: GameState['mode'] = 'act1', combo = 0): GameState {
    const s = makeState({ mode });
    s.weapon = w; s.combo = combo; s.lives = 99;
    s.stack = makeStack({ variant: 'building', theme: 'europe', floors: mats.map((m) => makeFloor(m)), y: 30, vy: 0 });
    const end = Math.max(...at) + 8;
    for (let t = 0; t <= end && s.stack; t++) {
      s.stack.y = 30; s.stack.vy = 0;
      advance(s, { ...EMPTY_INPUT, attack: at.includes(t) });
    }
    return s;
  }
  const hp = (s: GameState): number => s.stack!.floors[0].segs[0].hp;

  it('불새: 콤보 100까지 사거리가 곧게 늘고, 끊기면 처음 길이 · 퍽을 더해도 REACH_MAX를 안 넘는다', () => {
    const at = (w: WeaponId, combo: number, perks: PerkId[] = []): GameState => {
      const s = makeState(); s.weapon = w; s.combo = combo;
      if (perks.length) s.perk = { picked: perks, seen: [], offer: null };
      return s;
    };
    const { reach, comboReach } = WEAPON.phoenix;
    expect(reachOf(at('phoenix', 0))).toBe(reach);
    expect(reachOf(at('phoenix', 50))).toBeCloseTo(reach + comboReach! / 2);
    expect(reachOf(at('phoenix', 100))).toBeCloseTo(reach + comboReach!);
    expect(reachOf(at('phoenix', 200))).toBeCloseTo(reach + comboReach!);
    expect([0, 50, 100, 200].map((c) => comboReachK(at('phoenix', c)))).toEqual([0, 0.5, 1, 1]);
    expect(reachOf(at('phoenix', 100, ['reach']))).toBeCloseTo(Math.min(PERK_RUN.REACH_MAX, reach + comboReach! + PERK.reach.reach!));
    const s = at('phoenix', 120);
    breakCombo(s);
    expect(reachOf(s)).toBe(reach);
    expect(comboReachK(s)).toBe(0);
    // 다른 무기는 콤보와 상관없다
    for (const w of ['sword', 'crane', 'onyx'] as WeaponId[]) {
      expect(reachOf(at(w, 100)), w).toBe(WEAPON[w].reach);
      expect(comboReachK(at(w, 100)), w).toBe(0);
    }
    // 어느 무기든 콤보 999 · 긴 자루 · 공중에서도 REACH_MAX 이하 — 지금 가장 긴 것(흑철 + 긴 자루)이 상한 그대로
    for (const w of IDS) {
      const air = at(w, 999, ['reach']); air.player.y = 40;
      expect(reachOf(air), w).toBeLessThanOrEqual(PERK_RUN.REACH_MAX);
    }
    expect(reachOf(at('onyx', 0, ['reach']))).toBe(PERK_RUN.REACH_MAX);
  });

  it('해일: 콤보가 comboDouble 배수가 되는 베기는 두 번 깎는다 · 1막 · 토코톤만', () => {
    const n = WEAPON.tide.comboDouble!;
    expect(hp(chop('tide', ['hard'], [0], 'act1', n - 1))).toBe(1);
    expect(hp(chop('tide', ['hard'], [0], 'tokoton', n - 1))).toBe(1);
    expect(hp(chop('tide', ['hard'], [0], 'act1', n))).toBe(2);
    expect(hp(chop('tide', ['hard'], [0], 'training', n - 1))).toBe(2);
    expect(hp(chop('sword', ['hard'], [0], 'act1', n - 1))).toBe(2);
  });

  it('고압선: 층을 collapseChain 번 깰 때마다 위층도 한 번 깎인다(이벤트 chain) · 1막 · 토코톤만', () => {
    const two = [0, CYCLE + 2];
    const v = chop('volt', ['weak', 'weak', 'weak', 'weak'], two);
    expect(v.stack!.floors).toHaveLength(1);
    expect(v.events.filter((e) => e.kind === 'floorCollapse' && e.chain)).toHaveLength(1);
    expect(chop('sword', ['weak', 'weak', 'weak', 'weak'], two).stack!.floors).toHaveLength(2);
    expect(chop('volt', ['weak', 'weak', 'weak', 'weak'], two, 'training').stack!.floors).toHaveLength(2);
    // 번진 전류가 남은 한 층까지 깨면 완파
    const last = chop('volt', ['weak', 'weak', 'weak'], two);
    expect(last.stack).toBeNull();
  });

  it('고드름: 가드로 튕긴 건물이 guardFreeze 틱 동안 멈춘다 · 1막 · 토코톤만', () => {
    const frozenFor = (w: WeaponId, mode: GameState['mode'] = 'act1'): number => {
      const s = makeState({ mode }); s.weapon = w;
      withStack(s, 40); s.stack!.vy = -300;
      expect(tryGuardBounce(s, 'ground', 0)).toBe(true);
      const y = s.stack!.y;
      let n = 0;
      for (let t = 0; t < 60 && s.stack && s.stack.y === y; t++) { advance(s, EMPTY_INPUT); if (s.stack?.y === y) n++; }
      return n;
    };
    expect(frozenFor('icicle')).toBe(WEAPON.icicle.guardFreeze);
    expect(frozenFor('icicle', 'tokoton')).toBe(WEAPON.icicle.guardFreeze);
    expect(frozenFor('icicle', 'training')).toBe(0);
    expect(frozenFor('sword')).toBe(0);
  });

  it('그림자: restBreak 틱 넘게 쉬었다 벤 첫 베기는 맨 아래층을 통째로 · 바로 이어 벤 건 1 · 1막 · 토코톤만', () => {
    const s = chop('shade', ['hard', 'hard'], [0]);
    expect(s.stack!.floors).toHaveLength(1);
    expect(hp(s)).toBe(MAT_HP.hard); // 윗층은 그대로
    const again = chop('shade', ['hard', 'hard'], [0, CYCLE + 2]);
    expect(hp(again)).toBe(MAT_HP.hard - 1);
    const rested = chop('shade', ['hard', 'hard', 'hard'], [0, WEAPON.shade.restBreak! + 2]);
    expect(rested.stack!.floors).toHaveLength(1);
    expect(hp(chop('shade', ['hard'], [0], 'training'))).toBe(MAT_HP.hard - 1);
    expect(hp(chop('sword', ['hard'], [0]))).toBe(MAT_HP.hard - 1);
  });
});
