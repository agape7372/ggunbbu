import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import manifest from '../src/assets/manifest.json';
import { PLAYER_SHEET } from '../src/render/frames';
import { SHEET_HEAD, SHEET_HEAD_R } from '../src/render/sprites';

// 8비트 RGBA 비인터레이스 PNG만 읽는 최소 디코더 — 시트의 알파를 보는 용도.
function decodeRgba(file) {
  const buf = readFileSync(new URL(`../public/img/${file}`, import.meta.url));
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  expect([buf[24], buf[25], buf[28]], 'PNG는 8비트 RGBA 비인터레이스').toEqual([8, 6, 0]);
  const idat = [];
  for (let p = 8; p < buf.length;) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    if (type === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 4, px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = y * (stride + 1) + 1;
    for (let i = 0; i < stride; i++) {
      const left = i >= 4 ? px[y * stride + i - 4] : 0;
      const up = y > 0 ? px[(y - 1) * stride + i] : 0;
      const ul = y > 0 && i >= 4 ? px[(y - 1) * stride + i - 4] : 0;
      const v = raw[row + i];
      const pa = Math.abs(up - ul), pb = Math.abs(left - ul), pc = Math.abs(left + up - 2 * ul);
      px[y * stride + i] = (v + (f === 0 ? 0 : f === 1 ? left : f === 2 ? up : f === 3 ? (left + up) >> 1
        : (pa <= pb && pa <= pc ? left : pb <= pc ? up : ul))) & 255;
    }
  }
  return { w, h, a: (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : px[y * stride + x * 4 + 3]) };
}

describe('player sheet (2x export)', () => {
  const entry = manifest.images.player;
  const sheet = decodeRgba(entry.src);
  const S = sheet.w / (entry.w * entry.frames);
  const cell = i => ({ x0: i * entry.w * S, x1: (i + 1) * entry.w * S });

  function bbox(i) {
    const { x0, x1 } = cell(i);
    let l = x1, t = sheet.h, r = x0 - 1, b = -1;
    for (let y = 0; y < sheet.h; y++) for (let x = x0; x < x1; x++) if (sheet.a(x, y) > 80) {
      l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y);
    }
    return { l, r, t, b, w: r - l + 1, h: b - t + 1 };
  }

  it('is a 2x sheet and the idle pose stands about 55 logical px tall, feet on the cell bottom', () => {
    expect(S).toBe(2);
    expect(entry.frames).toBe(PLAYER_SHEET.length);
    const idle = bbox(0);
    expect(idle.h / S).toBeGreaterThanOrEqual(54);
    expect(idle.h / S).toBeLessThanOrEqual(56);
    expect(idle.b).toBe(sheet.h - S - 1);
  });

  it('keeps every pose inside its own cell without touching the neighbours', () => {
    for (let i = 0; i < PLAYER_SHEET.length; i++) {
      const { x0, x1 } = cell(i), b = bbox(i);
      expect(b.l, PLAYER_SHEET[i]).toBeGreaterThanOrEqual(x0);
      expect(b.r, PLAYER_SHEET[i]).toBeLessThan(x1);
    }
  });

  it('SHEET_HEAD points at the ink ring of the head in every pose that has a hard hat', () => {
    const R = SHEET_HEAD_R * S;
    SHEET_HEAD.forEach((head, i) => {
      if (!head) return;
      const cx = i * entry.w * S + (entry.w * S) / 2 + head[0] * S;
      const cy = sheet.h + head[1] * S;
      let ring = 0, inner = 0;
      for (let k = 0; k < 48; k++) {
        const t = (k / 48) * Math.PI * 2;
        if ([-1, 0, 1].some(d => sheet.a(Math.round(cx + Math.cos(t) * (R + d)), Math.round(cy + Math.sin(t) * (R + d))) > 128)) ring++;
        if (sheet.a(Math.round(cx + Math.cos(t) * R * 0.5), Math.round(cy + Math.sin(t) * R * 0.5)) > 128) inner++;
      }
      expect(ring / 48, `${PLAYER_SHEET[i]} 고리`).toBeGreaterThan(0.85);
      expect(inner / 48, `${PLAYER_SHEET[i]} 속`).toBeLessThan(0.1);
    });
  });
});
