// 피격 무적 표시(11-23) — 불변 13 깜빡임 금지: 기본은 꺼지지 않고 졸라맨 선만 옅은 먹이다. 옛 점멸은 시험판 디버그 메뉴에서 고를 때만
import { afterEach, describe, expect, it } from 'vitest';
import { JUICE_SYS, PLAYER } from '../src/config';
import { invulnView, setInvulnLook } from '../src/render/renderer';

const ticks = Array.from({ length: PLAYER.HIT_IFRAMES }, (_, i) => PLAYER.HIT_IFRAMES - i); // 피격 틱부터 끝까지

describe('무적 표시', () => {
  afterEach(() => setInvulnLook('line'));

  it('기본(밝은 테)은 무적 내내 그린다 — 한 틱도 안 꺼지고 선만 옅은 먹', () => {
    for (const t of ticks) expect(invulnView(t, false)).toEqual({ draw: true, ink: JUICE_SYS.INVULN_INK });
  });

  it('무적이 아니거나 필살 중이면 제 색 그대로', () => {
    expect(invulnView(0, false)).toEqual({ draw: true, ink: null });
    expect(invulnView(PLAYER.HIT_IFRAMES + 1, false)).toEqual({ draw: true, ink: null }); // 긴 무적(필살 등)
    expect(invulnView(30, true)).toEqual({ draw: true, ink: null });
  });

  it('옛 점멸은 골랐을 때만 — 6틱에 2틱 꺼지고 선 색은 안 바뀐다', () => {
    setInvulnLook('blink');
    const off = ticks.filter((t) => !invulnView(t, false).draw);
    expect(off).toHaveLength(PLAYER.HIT_IFRAMES / 3);
    expect(ticks.every((t) => invulnView(t, false).ink === null)).toBe(true);
    expect(invulnView(30, true).draw).toBe(true); // 필살 중엔 점멸도 안 한다(옛 규칙 그대로)
  });

  it('옅은 먹은 먹보다 밝다 — 제 색과 갈린다', () => {
    const lum = (hex: string): number => [1, 3, 5].reduce((a, i) => a + parseInt(hex.slice(i, i + 2), 16), 0);
    expect(lum(JUICE_SYS.INVULN_INK)).toBeGreaterThan(lum('#1A1A20') + 300);
  });
});
