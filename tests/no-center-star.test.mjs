import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// 가운데 동그라미 든 별(옛 타격 별 · 같은 모양 흰 별 「깡」)은 영구 금지다(11-03 사용자 「영구적으로 쓰지마 구려죽겠어」).
// 옛 판(0c8ae64)을 되살리거나 다른 가지를 합칠 때 다시 들어오는지 본다
const BANNED = /drawStar|STAR_PX|fill\('star'|FLASH_WHITE/;

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('가운데 동그라미 별 금지', () => {
  it('src 어디에도 타격 별 그리기가 없다', () => {
    const hits = walk(fileURLToPath(new URL('../src', import.meta.url))).filter((f) => BANNED.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});
