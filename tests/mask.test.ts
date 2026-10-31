import { describe, expect, it } from 'vitest';
import {
  MASK_CELLS, MASK_N, MASK_PALETTE, MASK_SWATCHES, SAMPLE_MASK, cellHex, cellLine, edgeCell, emptyMask, encodeMask, floodFill,
  hexCell, hexHsl, hslHex, isMaskArt, maskCells, maskColors, maskIsBlank,
} from '../src/meta/mask';

describe('마스크 자료', () => {
  it('견본(옛 판)은 올바른 그림이고, 새 판으로 옮겨도 같은 칸이다', () => {
    expect(isMaskArt(SAMPLE_MASK)).toBe(true);
    expect(maskIsBlank(SAMPLE_MASK)).toBe(false);
    const moved = encodeMask(maskCells(SAMPLE_MASK));
    expect(moved.startsWith('m2:')).toBe(true);
    expect(isMaskArt(moved)).toBe(true);
    expect(maskCells(moved)).toEqual(maskCells(SAMPLE_MASK));
  });

  it('옛 판은 번호를 옛 팔레트 색으로 읽는다', () => {
    const cells = maskCells(`4${'0'.repeat(MASK_CELLS - 2)}c`);
    expect(cellHex(cells[0])).toBe('#e5302e');
    expect(cellHex(cells[MASK_CELLS - 1])).toBe('#8a5a34');
    expect(cells[1]).toBe(0);
  });

  it('새 판은 팔레트 밖 색(만든 색)과 검정도 그대로 담는다', () => {
    const cells = new Uint32Array(MASK_CELLS);
    cells[0] = hexCell('#000000');
    cells[17] = hexCell('#12ab9c');
    cells[255] = hexCell('#ffffff');
    const art = encodeMask(cells);
    expect(art.length).toBe(3 + 253 + 3 * 6);
    expect(maskCells(art)).toEqual(cells);
    expect(cells[0]).not.toBe(0); // 검정 ≠ 빈칸
    expect(maskColors(art)).toEqual(['#000000', '#12ab9c', '#ffffff']);
  });

  it('길이·글자가 틀리면 그림이 아니다', () => {
    expect(isMaskArt(emptyMask())).toBe(true);
    expect(isMaskArt(`m2:${'.'.repeat(MASK_CELLS)}`)).toBe(true);
    expect(isMaskArt('0'.repeat(255))).toBe(false);
    expect(isMaskArt('d'.repeat(MASK_CELLS))).toBe(false); // 옛 팔레트 밖 번호
    expect(isMaskArt(`m2:${'.'.repeat(MASK_CELLS - 1)}`)).toBe(false); // 칸 하나 모자람
    expect(isMaskArt(`m2:ABCDEF${'.'.repeat(MASK_CELLS - 1)}`)).toBe(false); // 대문자
    expect(isMaskArt(`m2:12345${'.'.repeat(MASK_CELLS - 1)}`)).toBe(false); // 다섯 자리
    expect(isMaskArt(42)).toBe(false);
    expect(maskCells('zz').every((v) => v === 0)).toBe(true);
  });

  it('빈 그림 판정은 두 판 다 같다', () => {
    expect(maskIsBlank(emptyMask())).toBe(true);
    expect(maskIsBlank(`m2:${'.'.repeat(MASK_CELLS)}`)).toBe(true);
    expect(maskIsBlank('zz')).toBe(true);
    expect(maskIsBlank(encodeMask(maskCells(SAMPLE_MASK)))).toBe(false);
  });

  it('옛 판 팔레트 번호는 한 글자 안에 든다', () => {
    expect(MASK_PALETTE.length).toBeLessThanOrEqual(16);
    expect(MASK_PALETTE[0]).toBe('');
  });

  it('옛 판 팔레트 순서는 고정이다 — 옛 그림과 견본이 번호로 색을 가리킨다', () => {
    expect(MASK_PALETTE).toEqual([
      '', '#1A1A20', '#FFFFFF', '#9A958C', '#E5302E', '#F08A1C', '#FFD200',
      '#2E9E4F', '#1E62D0', '#7A44B8', '#F07AA0', '#E8B48A', '#8A5A34',
    ]);
  });

  it('기본 색 30은 겹치지 않고 옛 팔레트 열둘을 다 품는다', () => {
    expect(MASK_SWATCHES.length).toBe(30);
    const hexes = MASK_SWATCHES.map(([hex]) => hex);
    expect(new Set(hexes).size).toBe(30);
    expect(new Set(MASK_SWATCHES.map(([, name]) => name)).size).toBe(30);
    for (const hex of hexes) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    for (const old of MASK_PALETTE.slice(1)) expect(hexes).toContain(old.toLowerCase());
  });

  it('채우기는 이어진 같은 색만 바꾼다', () => {
    const ink = hexCell('#1a1a20');
    const red = hexCell('#e5302e');
    const cells = new Uint32Array(MASK_CELLS);
    for (let y = 0; y < MASK_N; y++) cells[y * MASK_N + 8] = ink; // 가운데 세로 벽
    const out = floodFill(cells, 0, 0, red);
    expect(out[0]).toBe(red);
    expect(out[7]).toBe(red);
    expect(out[8]).toBe(ink);
    expect(out[9]).toBe(0);
    expect(cells[0]).toBe(0); // 원본 불변
    expect(floodFill(cells, -1, 0, red)).toEqual(cells);
  });

  it('색 만들기 값은 HSL 그대로다', () => {
    expect(hslHex(0, 100, 50)).toBe('#ff0000');
    expect(hslHex(120, 100, 50)).toBe('#00ff00');
    expect(hslHex(240, 100, 50)).toBe('#0000ff');
    expect(hslHex(360, 100, 50)).toBe('#ff0000');
    expect(hslHex(200, 0, 0)).toBe('#000000');
    expect(hslHex(200, 70, 100)).toBe('#ffffff');
    expect(hexHsl('#ff0000')).toEqual([0, 100, 50]);
    expect(hexHsl('#808080')).toEqual([0, 0, 50]);
    // 기본 색을 미끄럼 값으로 바꿨다가 되돌려도 칸마다 몇 단계 안에서 돌아온다
    for (const [hex] of MASK_SWATCHES) {
      const back = hslHex(...hexHsl(hex));
      for (const sh of [16, 8, 0]) {
        expect(Math.abs(((parseInt(back.slice(1), 16) >> sh) & 255) - ((parseInt(hex.slice(1), 16) >> sh) & 255))).toBeLessThanOrEqual(4);
      }
    }
  });

  it('선은 끊기지 않고 양 끝을 포함한다', () => {
    const pts = cellLine(0, 0, 5, 2);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([5, 2]);
    for (let i = 1; i < pts.length; i++) {
      expect(Math.abs(pts[i][0] - pts[i - 1][0])).toBeLessThanOrEqual(1);
      expect(Math.abs(pts[i][1] - pts[i - 1][1])).toBeLessThanOrEqual(1);
    }
  });

  it('판을 드나드는 선은 가장자리 칸에서 걸린다', () => {
    expect(edgeCell([13, 4], [17, 4])).toEqual([15, 4]);
    expect(edgeCell([13, 4], [40, 30])).toEqual([15, 6]); // 멀리 튄 표본도 나간 자리(오른쪽 가장자리)에서
    expect(edgeCell([2, 3], [-5, 3])).toEqual([0, 3]);
    expect(edgeCell([8, 1], [8, -9])).toEqual([8, 0]);
  });

  it('쓴 색만 처음 나온 순서로 모은다', () => {
    expect(maskColors(emptyMask())).toEqual([]);
    expect(maskColors(SAMPLE_MASK)).toEqual(['#1a1a20', '#ffd200', '#f07aa0']);
  });
});
