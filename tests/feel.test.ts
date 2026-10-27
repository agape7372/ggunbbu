// 손맛 계산(순수) — 흔들림 곡선 · 완파 규모 · 진동 고르기 · 격파 배속.
// 그리는 쪽(renderer·effects)은 이 숫자를 읽기만 한다.
import { describe, expect, it } from 'vitest';
import { BOSS, HAPTIC, JUICE, JUICE_SYS, WEAPON } from '../src/config';
import { defeatSlow, flashMul, hapticLength, pickHaptic, shakePx, stackScale } from '../src/render/feel';
import type { JuiceEvent } from '../src/core/types';

const ev = (kind: JuiceEvent['kind'], o: Partial<JuiceEvent> = {}): JuiceEvent => ({ kind, ...o });

describe('흔들림 곡선 — 사다리', () => {
  it('목표 진폭: 타격≈1 · 층붕괴≈2.5 · 피격≈5 · 필살·격파≈12', () => {
    expect(shakePx(ev('hit'))).toBe(1);
    expect(shakePx(ev('floorCollapse'))).toBe(2.5);
    expect(shakePx(ev('hurt'))).toBe(5);
    expect(shakePx(ev('special'))).toBe(12);
    expect(shakePx(ev('bossDefeat'))).toBe(12);
  });

  it('예전 제곱 곡선은 타격을 0.06px로 눌렀다 — 이제 1px 아래로 내려가지 않는다', () => {
    expect(shakePx(ev('hit'))).toBeGreaterThanOrEqual(1);
    expect(shakePx(ev('bossHit'))).toBeGreaterThanOrEqual(1);
  });

  it('사다리가 올라간다: 타격 < 층붕괴 < 완파 ≤ 피격 < 필살', () => {
    const ladder = [
      shakePx(ev('hit')), shakePx(ev('floorCollapse')), shakePx(ev('stackDestroy', { n: 2 })),
      shakePx(ev('hurt')), shakePx(ev('special')),
    ];
    for (let i = 1; i < ladder.length; i++) expect(ladder[i]).toBeGreaterThanOrEqual(ladder[i - 1]);
    expect(ladder[0]).toBeLessThan(ladder[ladder.length - 1]);
  });

  it('무기 배율은 타격·층붕괴만 탄다(오함마 묵직, 그라인더 가볍게)', () => {
    expect(shakePx(ev('hit'), WEAPON.hammer.shake)).toBeCloseTo(1.6);
    expect(shakePx(ev('floorCollapse'), WEAPON.grinder.shake)).toBeCloseTo(2.5 * 0.8);
    expect(shakePx(ev('hurt'), WEAPON.hammer.shake)).toBe(5);
    expect(shakePx(ev('stackDestroy', { n: 3 }), WEAPON.hammer.shake)).toBe(shakePx(ev('stackDestroy', { n: 3 })));
  });

  it('상한 SHAKE_MAX_AMP를 넘지 않는다', () => {
    expect(shakePx(ev('special'), 5)).toBeLessThanOrEqual(JUICE_SYS.SHAKE_MAX_AMP);
    expect(shakePx(ev('stackDestroy', { n: 999 }))).toBeLessThanOrEqual(JUICE_SYS.SHAKE_MAX_AMP);
  });

  it('포효(phaseClear n>=100)만 흔든다 — 구역·버터 전환(n<100)은 오버레이가 맡는다', () => {
    expect(shakePx(ev('phaseClear', { n: 101 }))).toBe(JUICE.bossRoar.shake);
    expect(shakePx(ev('phaseClear', { n: 102 }))).toBe(JUICE.bossRoar.shake);
    expect(shakePx(ev('phaseClear', { n: 0 }))).toBe(0);
    expect(shakePx(ev('phaseClear', { n: 3 }))).toBe(0);
  });

  it('번개 착탄은 흔든다(예전 0px)', () => {
    expect(shakePx(ev('boltStrike'))).toBe(JUICE.boltStrike.shake);
    expect(JUICE.boltStrike.shake).toBeGreaterThan(0);
  });

  it('흔들림 없는 이벤트는 0', () => {
    for (const k of ['slash', 'jump', 'land', 'boltCue', 'gaugeFull', 'comboBreak', 'lifeLost'] as const) {
      expect(shakePx(ev(k))).toBe(0);
    }
  });
});

describe('완파 규모 k', () => {
  it('층수가 늘수록 커지고 [BASE, MAX] 안에 갇힌다', () => {
    expect(stackScale(undefined)).toBe(JUICE_SYS.STACK_K_BASE);
    expect(stackScale(0)).toBe(JUICE_SYS.STACK_K_BASE);
    expect(stackScale(2)).toBeCloseTo(1.0);
    expect(stackScale(3)).toBeGreaterThan(stackScale(2));
    expect(stackScale(10)).toBeGreaterThan(stackScale(3));
    expect(stackScale(500)).toBe(JUICE_SYS.STACK_K_MAX);
  });

  it('3층 건물과 10층 건물의 흔들림이 다르다(예전엔 같았다)', () => {
    const small = shakePx(ev('stackDestroy', { n: 3 }));
    const big = shakePx(ev('stackDestroy', { n: 10 }));
    expect(big).toBeGreaterThan(small * 1.4);
  });
});

describe('진동 고르기', () => {
  const fresh = () => ({ hit: 0, bossHit: 0 });

  it('HAPTIC 표: 새 키와 값(감사 처방 그대로)', () => {
    expect(HAPTIC.hit).toBe(14);
    expect(HAPTIC.bossHit).toBe(14);
    expect(HAPTIC.lifeLost).toEqual([60, 40, 90]);
    expect(HAPTIC.gaugeFull).toEqual([12, 30, 12]);
    expect(HAPTIC.guardDenied).toBe(10);
    expect(HAPTIC.boltStrike).toBe(25);
    expect(HAPTIC.bonusPerfect).toEqual([20, 30, 20, 30, 40]);
    expect(HAPTIC.phaseClear).toEqual([20, 30, 40]);
  });

  it('겹치면 총 길이가 가장 긴 패턴 하나만 — 피격(60) + 라이프 손실([60,40,90]) = 라이프 손실', () => {
    const p = pickHaptic([ev('hurt'), ev('lifeLost', { n: 1 })], fresh());
    expect(p).toEqual(HAPTIC.lifeLost);
  });

  it('필살 묶음(special 350ms · stackDestroy 80ms · bossHit)에서는 필살 하나', () => {
    const p = pickHaptic([ev('special'), ev('stackDestroy', { n: 4 }), ev('bossHit', { n: 100 })], fresh());
    expect(p).toEqual(HAPTIC.special);
    expect(hapticLength(HAPTIC.special)).toBe(350);
  });

  it('타격은 3회당 1회만 후보 — 첫 두 번은 조용하다', () => {
    const c = fresh();
    const seq = [1, 2, 3, 4, 5, 6].map(() => pickHaptic([ev('hit')], c));
    expect(seq).toEqual([null, null, HAPTIC.hit, null, null, HAPTIC.hit]);
  });

  it('보스 타격도 같은 스로틀 — 카운터는 타격과 따로 센다', () => {
    const c = fresh();
    expect(pickHaptic([ev('hit')], c)).toBeNull();
    expect(pickHaptic([ev('bossHit')], c)).toBeNull();
    expect(pickHaptic([ev('hit')], c)).toBeNull();
    expect(pickHaptic([ev('bossHit')], c)).toBeNull();
    expect(pickHaptic([ev('hit')], c)).toBe(HAPTIC.hit);         // 세 번째 타격
    expect(pickHaptic([ev('bossHit')], c)).toBe(HAPTIC.bossHit); // 세 번째 보스 타격
  });

  it('스로틀에 걸린 타격은 후보에서 빠진다 — 같은 틱의 가드 바운스(15ms)만 남는다', () => {
    expect(pickHaptic([ev('hit'), ev('guardBounce')], fresh())).toBe(HAPTIC.guardBounce);
  });

  it('진동 키가 없는 이벤트는 쏘지 않는다', () => {
    expect(pickHaptic([ev('slash'), ev('jump'), ev('land'), ev('comboBreak')], fresh())).toBeNull();
  });

  it('작전 완료·번개 착탄·포효·게이지 가득에도 진동이 있다(예전엔 전부 없었다)', () => {
    for (const k of ['bonusPerfect', 'boltStrike', 'phaseClear', 'gaugeFull', 'guardDenied', 'lifeLost'] as const) {
      expect(pickHaptic([ev(k)], fresh())).not.toBeNull();
    }
  });
});

describe('번쩍 강도 · 격파 배속', () => {
  it('flashLevel 0 끔 · 1 약(절반) · 2 기본, 범위 밖은 기본', () => {
    expect(flashMul(0)).toBe(0);
    expect(flashMul(1)).toBe(0.5);
    expect(flashMul(2)).toBe(1);
    expect(flashMul(7)).toBe(1);
  });

  it('격파 배속: DEFEAT_SLOW로 시작해 DEFEAT_SLOW_S초에 1배로 돌아온다(단조 증가)', () => {
    expect(defeatSlow(0)).toBe(BOSS.DEFEAT_SLOW);
    const end = Math.round(BOSS.DEFEAT_SLOW_S * 60);
    expect(defeatSlow(end)).toBe(1);
    expect(defeatSlow(end * 3)).toBe(1);
    let prev = 0;
    for (let t = 0; t <= end; t += 10) {
      const v = defeatSlow(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('JUICE 표 — 새 항목', () => {
  it('보스 연출 키와 번개 착탄이 있다', () => {
    for (const k of ['boltStrike', 'bossBreak', 'bossRoar', 'bossSplit']) expect(JUICE[k]).toBeDefined();
    expect(JUICE.boltStrike.hitstop).toBe(0); // 착탄 자체는 멈추지 않는다 — hurt가 따로 멈춘다
  });

  it('보스 타격은 1막용 잉크 전체 번쩍을 쓰지 않는다', () => {
    expect(JUICE.bossHit.flash).toBe(0);
  });

  it('숫자 팝업 기본 크기 15px', () => {
    expect(JUICE_SYS.COMBO_POPUP_PX).toBe(15);
  });
});
