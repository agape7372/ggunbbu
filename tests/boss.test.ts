// 보스 FSM: 티어 전이 50/150, 격파, 드론/대포는 달 HP 미산입 [정본].
import { describe, it, expect } from 'vitest';
import { makeState, advance } from '../src/core/sim';
import { enterAct2Phase } from '../src/core/act2';
import { EMPTY_INPUT, type GameState } from '../src/core/types';
import { BOSS } from '../src/config';

function bossState(): GameState {
  const s = makeState({ seed: 777 });
  enterAct2Phase(s, 'moon');
  return s;
}

describe('달 보스 [정본]', () => {
  it('진입 시 콤보 리셋 + HP 230', () => {
    const s = makeState();
    s.combo = 228;
    enterAct2Phase(s, 'moon');
    expect(s.combo).toBe(0);
    expect(s.boss!.hp).toBe(BOSS.HP);
  });

  it('누적 대미지 50/150에서 티어 전이 + 포효 무적', () => {
    const s = bossState();
    const b = s.boss!;
    b.dmg = 50;
    advance(s, EMPTY_INPUT);
    expect(b.tier).toBe(1);
    expect(b.st).toBe('roar');
    expect(b.hittable).toBe(false);
    b.dmg = 150;
    // roar 종료까지 진행
    for (let i = 0; i < BOSS.ROAR_TICKS + 5; i++) advance(s, EMPTY_INPUT);
    expect(b.tier).toBe(2);
  });

  it('드론 격파는 달 HP 미산입, 콤보/점수는 정상 [정본]', () => {
    const s = bossState();
    const b = s.boss!;
    const hp0 = b.hp;
    s.entities.push({ kind: 'rabbit', x: 180, y: 60, side: -1, hp: 1, fireTicks: 999, leaveTicks: -1 });
    // 플레이어 지상 공격으로 드론 타격
    for (let i = 0; i < 12 && s.entities.length > 0; i++) {
      advance(s, { ...EMPTY_INPUT, attack: i === 0 });
    }
    expect(s.entities.some((e) => e.kind === 'rabbit')).toBe(false);
    expect(s.combo).toBe(1);
    expect(b.hp).toBe(hp0); // 미산입
  });

  it('HP 0 → 격파 → 클리어', () => {
    const s = bossState();
    const b = s.boss!;
    b.hp = 1;
    b.dmg = 229;
    b.tier = 2; // 티어 자동전이 간섭 방지
    b.st = 'idle';
    b.hittable = true;
    b.y = BOSS.HOVER_LOW;
    const st = () => s.boss!.st;
    for (let i = 0; i < 15 && st() !== 'defeated'; i++) {
      advance(s, { ...EMPTY_INPUT, attack: i === 0 });
    }
    expect(st()).toBe('defeated');
    for (let i = 0; i < 250 && !s.over; i++) advance(s, EMPTY_INPUT);
    expect(s.over).toBe('cleared');
  });

  it('시드 결정론: 같은 시드 → 같은 패턴 선택', () => {
    const a = bossState();
    const b = bossState();
    for (let i = 0; i < 600; i++) { advance(a, EMPTY_INPUT); advance(b, EMPTY_INPUT); }
    expect(a.boss!.pattern).toBe(b.boss!.pattern);
    expect(a.rngState).toBe(b.rngState);
  });
});
