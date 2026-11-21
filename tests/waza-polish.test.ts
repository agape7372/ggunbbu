// 필살 손질(11-21 심사) — 도장 · 철거 띠 비우기, 필살 끝 뒤 남은 조각 수명, 밤 면 위 먹 = 한지색
import { describe, expect, it } from 'vitest';
import { PALETTE } from '../src/config';
import { bent, endWazaBits, keepBits, line, paperInk, resetBladeFx, setWazaHoles, updateBladeFx, weaponAlong, weaponBloom } from '../src/render/bladeFx';
import { liveBits } from '../src/render/weaponFx';

describe('필살 손질', () => {
  it('비울 자리 안에서는 필살 조각을 뿌리지 않는다', () => {
    resetBladeFx();
    setWazaHoles([[-1e4, -1e4, 1e4, 1e4]]);
    weaponBloom('hammer', 180, 300, -Math.PI / 2, 1.4);
    expect(liveBits().length).toBe(0);
    setWazaHoles([]);
    weaponBloom('hammer', 180, 300, -Math.PI / 2, 1.4);
    expect(liveBits().length).toBeGreaterThan(0);
    resetBladeFx();
  });

  it('머리가 구멍 밖이어도 획 몸이 구멍을 지나면 뿌리지 않는다(곧은 획 · 꺾은 획)', () => {
    resetBladeFx();
    setWazaHoles([[150, 280, 210, 320]]);
    keepBits(() => {
      line(60, 300, 300, 300, 6, ''); // 몸이 구멍을 가로지른다
      bent([60, 200, 180, 300, 300, 200], 6, ''); // 꺾인 점이 구멍 안
      line(60, 100, 300, 100, 6, ''); // 구멍 위로 지나간다 → 남는다
    });
    expect(liveBits().length).toBe(1);
    setWazaHoles([]);
    resetBladeFx();
  });

  it('필살이 끝나면 남은 필살 조각은 9틱 안에 사라진다 · 안 뿌린 둘째 박자도 버린다', () => {
    resetBladeFx();
    weaponAlong('sword', [60, 500, 300, 200], 1.3, 0.3);
    weaponBloom('sword', 180, 200, -Math.PI / 2, 1.1);
    updateBladeFx(1 / 60);
    expect(liveBits().length).toBeGreaterThan(0);
    endWazaBits(9);
    for (let i = 0; i < 10; i++) updateBladeFx(1 / 60);
    expect(liveBits().length).toBe(0);
    resetBladeFx();
  });

  it('밤 면 ctx는 먹만 한지색으로 바꾼다(포인트 색 · 인주는 그대로)', () => {
    const set: string[] = [];
    const base = { set fillStyle(v: string) { set.push(v); }, fill() {} } as unknown as CanvasRenderingContext2D;
    const c = paperInk(base);
    c.fillStyle = PALETTE.INK;
    c.fillStyle = '#C4301E';
    c.fill();
    expect(set).toEqual([PALETTE.BG, '#C4301E']);
  });
});
